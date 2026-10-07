// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

import {ThenarCcipReceiver} from "../../src/ccip/ThenarCcipReceiver.sol";
import {ThenarCcipIntent} from "../../src/ccip/ThenarCcipIntent.sol";
import {ArcForkBase} from "./ArcForkBase.sol";

/**
 * Chainlink CCIP on Arc testnet, for real: Chainlink's Arc router serves the
 * Base Sepolia lane and quotes fees in native USDC; ThenarCcipReceiver accepts
 * a delivery only from that router and buys a licence in Circle's USDC on Arc.
 */
contract ThenarCcipArcForkTest is ArcForkBase {
    uint256 internal constant LICENCE_GAS = 900_000; // DeploySender.s.sol's default
    uint128 internal constant FEE = 5e6;

    address internal senderOnBase = makeAddr("ThenarCcipSender on Base Sepolia");
    address internal buyer = makeAddr("buyer agent on Base Sepolia");
    ThenarCcipReceiver internal receiver;

    function setUp() public override {
        super.setUp();
        _deployThenar();
        receiver = new ThenarCcipReceiver(CCIP_ROUTER, address(thenar), USDC, address(this));
        receiver.allowSender(BASE_SEPOLIA, senderOnBase, true);
    }

    function _policy(uint256 contributors) internal returns (uint256 policyId, address[] memory who) {
        uint256 id = _task(uint32(contributors), uint256(REWARD) * contributors);
        who = new address[](contributors);
        for (uint256 i; i < contributors; ++i) {
            who[i] = makeAddr(string.concat("arc operator ", vm.toString(i)));
            _run(id, who[i], keccak256(abi.encode("ccip fork run", i)), uint16(9_000 - i * 100));
        }
        vm.prank(funder);
        policyId = thenar.mintPolicy(id, FEE);
    }

    function _licenceMessage(bytes32 orderId, uint256 policyId) internal view returns (Client.Any2EVMMessage memory) {
        return Client.Any2EVMMessage({
            messageId: keccak256(abi.encode("ccip message", orderId)),
            sourceChainSelector: BASE_SEPOLIA,
            sender: abi.encode(senderOnBase),
            data: ThenarCcipIntent.license(orderId, buyer, policyId, FEE),
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
    }

    function test_fork_routerServesTheBaseSepoliaLane() public view {
        assertTrue(IRouterClient(CCIP_ROUTER).isChainSupported(BASE_SEPOLIA), "Base Sepolia lane");
        assertEq(receiver.getRouter(), CCIP_ROUTER);
    }

    function test_fork_feeQuoteToBaseSepoliaInNativeUsdc() public {
        Client.EVM2AnyMessage memory m = Client.EVM2AnyMessage({
            receiver: abi.encode(address(receiver)),
            data: ThenarCcipIntent.license(keccak256("order"), buyer, 0, FEE),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: LICENCE_GAS, allowOutOfOrderExecution: true})
            ),
            feeToken: address(0)
        });
        uint256 fee = IRouterClient(CCIP_ROUTER).getFee(BASE_SEPOLIA, m);
        emit log_named_decimal_uint("Arc -> Base Sepolia CCIP fee (native USDC, 18 dec)", fee, 18);
        assertGt(fee, 0);
        assertLt(fee, 5e18, "a few dollars at most");
    }

    function test_fork_receiverOnlyAcceptsTheRealRouter_andBuysALicence() public {
        (uint256 policyId, address[] memory who) = _policy(2);
        uint256[] memory before = new uint256[](2);
        for (uint256 i; i < 2; ++i) before[i] = _usdc(who[i]);
        bytes32 orderId = keccak256("fork order 1");
        Client.Any2EVMMessage memory m = _licenceMessage(orderId, policyId);

        vm.expectRevert(); // InvalidRouter: not the router
        receiver.ccipReceive(m);

        // The CCTP mint lands first (credited the Arc way), then the router delivers.
        _giveUsdc(address(receiver), FEE);
        vm.prank(CCIP_ROUTER);
        receiver.ccipReceive(m);

        assertEq(uint8(receiver.getOrder(orderId).status), uint8(ThenarCcipReceiver.Status.Licensed));
        assertTrue(thenar.licensed(policyId, buyer), "the Base buyer holds the licence on Arc");
        assertEq(_usdc(address(receiver)), 0);
        // 4.875 USDC split 9000:8900; 2.5% and the rounding dust to the treasury.
        uint256 a = (uint256(4_875_000) * 9_000) / 17_900;
        uint256 b = (uint256(4_875_000) * 8_900) / 17_900;
        assertEq(_usdc(who[0]) - before[0], a);
        assertEq(_usdc(who[1]) - before[1], b);
        assertEq(_usdc(treasury), 125_000 + (4_875_000 - a - b));
        assertEq(_usdc(who[0]) - before[0] + _usdc(who[1]) - before[1] + _usdc(treasury), FEE, "every unit lands");
    }

    function test_fork_unallowlistedSourceIsRefused() public {
        (uint256 policyId,) = _policy(1);
        Client.Any2EVMMessage memory m = _licenceMessage(keccak256("rogue"), policyId);
        m.sender = abi.encode(makeAddr("rogue sender"));
        _giveUsdc(address(receiver), FEE);
        vm.prank(CCIP_ROUTER);
        vm.expectRevert(
            abi.encodeWithSelector(
                ThenarCcipReceiver.SourceNotAllowed.selector, BASE_SEPOLIA, makeAddr("rogue sender")
            )
        );
        receiver.ccipReceive(m);
    }

    /// The default CCIP gas limit against Circle's real USDC transfers: a corpus of 24 operators.
    function test_fork_licenceFanOutFitsTheDefaultCcipGasLimit() public {
        (uint256 policyId,) = _policy(24);
        bytes32 orderId = keccak256("fork order fan-out");
        Client.Any2EVMMessage memory m = _licenceMessage(orderId, policyId);
        _giveUsdc(address(receiver), FEE);
        vm.prank(CCIP_ROUTER);
        uint256 g = gasleft();
        receiver.ccipReceive{gas: LICENCE_GAS}(m);
        emit log_named_uint("ccipReceive gas, 24-operator licence (real USDC)", g - gasleft());
        assertEq(uint8(receiver.getOrder(orderId).status), uint8(ThenarCcipReceiver.Status.Licensed));
        assertTrue(thenar.licensed(policyId, buyer));
    }
}
