// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Test.sol";
import {CCIPLocalSimulator, IRouterClient} from "@chainlink/local/src/ccip/CCIPLocalSimulator.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ThenarProtocol} from "../src/ThenarProtocol.sol";
import {ThenarCcipSender} from "../src/ccip/ThenarCcipSender.sol";
import {ThenarCcipReceiver} from "../src/ccip/ThenarCcipReceiver.sol";
import {ThenarCcipIntent} from "../src/ccip/ThenarCcipIntent.sol";
import {MockTokenMessengerV2} from "./mocks/MockTokenMessengerV2.sol";
import {ThenarBase} from "./utils/ThenarBase.sol";

interface ILocalRouter {
    function setFee(uint256 feeAmount) external;
}

/// A buyer contract that can't take back the CCIP fee change.
contract NoRefundBuyer {
    function buy(ThenarCcipSender s, IERC20 usdc, uint256 policyId, uint256 amount) external payable {
        usdc.approve(address(s), amount);
        s.buyLicence{value: msg.value}(policyId, amount, 0, 2000);
    }
}

/**
 * A buyer agent on another chain licenses a Thenar corpus on Arc.
 *
 * Chainlink Local's CCIPLocalSimulator routes every message through its router
 * for real (onlyRouter, the receiver's gas limit, ReceiverError on a revert);
 * MockTokenMessengerV2 stands in for CCTP V2's burn and mint and can defer the
 * mint so the instruction arrives before the dollars. ThenarProtocol and both
 * CCIP contracts are the real ones.
 */
contract ThenarCcipTest is ThenarBase {
    CCIPLocalSimulator internal sim;
    IRouterClient internal router;
    uint64 internal selector;

    MockTokenMessengerV2 internal cctp;
    ThenarCcipReceiver internal receiver;
    ThenarCcipSender internal sender;

    address internal owner = makeAddr("owner");
    address internal buyer = makeAddr("buyer agent on Base");
    address internal other = makeAddr("someone else on Base");
    address internal sweeper = makeAddr("sweep destination");

    uint256 internal constant CCIP_FEE = 0.01 ether;
    uint256 internal constant LICENCE_GAS = 900_000; // DeploySender.s.sol's default
    uint128 internal constant FEE = 10e6; // the policy's licence fee, 10 USDC
    uint32 internal constant STANDARD = 2000;
    uint32 internal constant FAST = 1000;
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_800_000_000);
        sim = new CCIPLocalSimulator();
        (uint64 chainSelector, IRouterClient sourceRouter, IRouterClient destinationRouter,,,,) = sim.configuration();
        selector = chainSelector;
        router = sourceRouter;
        ILocalRouter(address(router)).setFee(CCIP_FEE); // fees in the native coin

        _deploy(address(0));
        cctp = new MockTokenMessengerV2(IERC20(address(usdc)));
        receiver = new ThenarCcipReceiver(address(destinationRouter), address(thenar), address(usdc), owner);
        sender = new ThenarCcipSender(
            address(sourceRouter), address(usdc), address(cctp), selector, address(receiver), LICENCE_GAS
        );
        vm.prank(owner);
        receiver.allowSender(selector, address(sender), true);

        // A corpus recorded by three operators, licensable for 10 USDC.
        address[] memory who = new address[](3);
        who[0] = alice;
        who[1] = bob;
        who[2] = carol;
        uint16[] memory scores = new uint16[](3);
        scores[0] = 9_000;
        scores[1] = 8_000;
        scores[2] = 7_000;
        (, policyId) = _filledPolicy(who, scores, FEE);

        for (uint256 i; i < 2; ++i) {
            address a = i == 0 ? buyer : other;
            usdc.mint(a, 1_000e6);
            vm.deal(a, 1 ether);
            vm.prank(a);
            usdc.approve(address(sender), type(uint256).max);
        }
    }

    function _buy(address who, uint256 pid, uint256 amount, uint256 maxFee, uint32 finality)
        internal
        returns (bytes32 messageId, bytes32 orderId)
    {
        vm.prank(who);
        (messageId, orderId) = sender.buyLicence{value: CCIP_FEE}(pid, amount, maxFee, finality);
    }

    function _buy() internal returns (bytes32 orderId) {
        (, orderId) = _buy(buyer, policyId, FEE, 0, STANDARD);
    }

    function _status(bytes32 orderId) internal view returns (ThenarCcipReceiver.Status) {
        return receiver.getOrder(orderId).status;
    }

    function _message(bytes32 messageId, bytes memory data) internal view returns (Client.Any2EVMMessage memory) {
        return Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: selector,
            sender: abi.encode(address(sender)),
            data: data,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
    }

    /// The router delivers `m` (as the OffRamp would) after CCTP minted `amount` to the receiver.
    function _deliver(Client.Any2EVMMessage memory m, uint256 amount) internal {
        if (amount > 0) usdc.mint(address(receiver), amount);
        vm.prank(address(router));
        receiver.ccipReceive(m);
    }

    // -----------------------------------------------------------------
    // Deployment
    // -----------------------------------------------------------------

    function test_constructors_refuseZeroAddresses() public {
        vm.expectRevert(ThenarCcipReceiver.ZeroAddress.selector);
        new ThenarCcipReceiver(address(router), address(0), address(usdc), owner);
        vm.expectRevert(ThenarCcipReceiver.ZeroAddress.selector);
        new ThenarCcipReceiver(address(router), address(thenar), address(0), owner);
        vm.expectRevert(ThenarCcipSender.ZeroAddress.selector);
        new ThenarCcipSender(address(0), address(usdc), address(cctp), selector, address(receiver), LICENCE_GAS);
        vm.expectRevert(ThenarCcipSender.ZeroAddress.selector);
        new ThenarCcipSender(address(router), address(usdc), address(cctp), selector, address(0), LICENCE_GAS);
        assertEq(sender.ARC_CCTP_DOMAIN(), 26);
        assertEq(receiver.getRouter(), address(router));
    }

    // -----------------------------------------------------------------
    // The happy path
    // -----------------------------------------------------------------

    function test_buyLicence_licensesOnArc_andPaysEveryContributor() public {
        uint256 a = usdc.balanceOf(alice);
        uint256 b = usdc.balanceOf(bob);
        uint256 c = usdc.balanceOf(carol);
        uint256 ethBefore = buyer.balance;
        bytes32 expectedOrder = sender.nextOrderId(buyer);
        vm.prank(buyer);
        assertEq(sender.quote(policyId, FEE), CCIP_FEE);

        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.OrderLicensed(expectedOrder, buyer, policyId, FEE);
        vm.prank(buyer);
        (bytes32 messageId, bytes32 orderId) =
            sender.buyLicence{value: CCIP_FEE + 0.05 ether}(policyId, FEE, 0, STANDARD);

        assertEq(orderId, expectedOrder);
        assertTrue(messageId != bytes32(0));
        assertEq(sender.orders(), 1);
        assertTrue(sender.nextOrderId(buyer) != orderId, "each order gets a fresh id");

        // The licence is the buyer's, on Arc.
        assertTrue(thenar.licensed(policyId, buyer));
        assertFalse(thenar.licensed(policyId, address(receiver)));
        assertEq(thenar.getPolicy(policyId).licencesSold, 1);
        // 10 USDC: 0.25 to the treasury, 9.75 split 9:8:7.
        assertEq(usdc.balanceOf(alice) - a, 3_656_250);
        assertEq(usdc.balanceOf(bob) - b, 3_250_000);
        assertEq(usdc.balanceOf(carol) - c, 2_843_750);
        assertEq(usdc.balanceOf(treasury), 250_000);

        ThenarCcipReceiver.Order memory o = receiver.getOrder(orderId);
        assertEq(uint8(o.status), uint8(ThenarCcipReceiver.Status.Licensed));
        assertEq(o.licensee, buyer);
        assertEq(o.sourceChainSelector, selector);
        assertEq(o.amount, FEE);
        assertEq(o.policyId, policyId);
        assertEq(receiver.pendingTotal(), 0);
        assertEq(receiver.owedTotal(), 0);
        assertEq(receiver.licensesBought(), 1);
        assertEq(usdc.balanceOf(address(receiver)), 0);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - FEE);

        // CCTP: to Arc (26), the receiver as mint recipient, anyone may finish the mint.
        assertEq(cctp.lastAmount(), FEE);
        assertEq(cctp.lastDestinationDomain(), 26);
        assertEq(cctp.lastMintRecipient(), bytes32(uint256(uint160(address(receiver)))));
        assertEq(cctp.lastDestinationCaller(), bytes32(0));
        assertEq(cctp.lastMaxFee(), 0);
        assertEq(cctp.lastMinFinality(), STANDARD);
        // CCIP fee paid in native, the excess refunded.
        assertEq(buyer.balance, ethBefore - CCIP_FEE);
        assertEq(address(router).balance, CCIP_FEE);
        assertEq(address(sender).balance, 0);
    }

    function test_buyLicence_messageCarriesTheIntent() public {
        bytes32 expectedOrder = sender.nextOrderId(buyer);
        vm.recordLogs();
        _buy();
        // OrderReceived's messageId is the router's; check it and the LicenceOrdered event agree.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 fromSender;
        bytes32 fromReceiver;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(sender) && logs[i].topics[0] == ThenarCcipSender.LicenceOrdered.selector) {
                fromSender = logs[i].topics[1];
                assertEq(logs[i].topics[2], expectedOrder);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), buyer);
            }
            if (logs[i].emitter == address(receiver) && logs[i].topics[0] == ThenarCcipReceiver.OrderReceived.selector) {
                assertEq(logs[i].topics[1], expectedOrder);
                fromReceiver = logs[i].topics[2];
                assertEq(uint256(logs[i].topics[3]), selector);
                (address licensee, uint256 pid, uint256 amount) = abi.decode(logs[i].data, (address, uint256, uint256));
                assertEq(licensee, buyer);
                assertEq(pid, policyId);
                assertEq(amount, FEE);
            }
        }
        assertTrue(fromSender != bytes32(0));
        assertEq(fromSender, fromReceiver);
    }

    function test_intentEncoding() public pure {
        bytes memory d = ThenarCcipIntent.license(keccak256("o"), address(0xB0B), 7, 5e6);
        (uint8 action, bytes memory body) = abi.decode(d, (uint8, bytes));
        assertEq(action, ThenarCcipIntent.LICENSE);
        (bytes32 o, address l, uint256 p, uint256 amt) = abi.decode(body, (bytes32, address, uint256, uint256));
        assertEq(o, keccak256("o"));
        assertEq(l, address(0xB0B));
        assertEq(p, 7);
        assertEq(amt, 5e6);
    }

    // -----------------------------------------------------------------
    // Fees
    // -----------------------------------------------------------------

    function test_buyLicence_insufficientNativeFeeReverts() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipSender.InsufficientFee.selector, CCIP_FEE - 1, CCIP_FEE));
        sender.buyLicence{value: CCIP_FEE - 1}(policyId, FEE, 0, STANDARD);
    }

    function test_buyLicence_refusesAZeroOrOversizedAmount() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipSender.InvalidAmount.selector, 0));
        sender.buyLicence{value: CCIP_FEE}(policyId, 0, 0, STANDARD);
        uint256 huge = uint256(type(uint96).max) + 1;
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipSender.InvalidAmount.selector, huge));
        sender.buyLicence{value: CCIP_FEE}(policyId, huge, 0, STANDARD);
    }

    function test_buyLicence_refundsExcessNativeFee() public {
        uint256 before = buyer.balance;
        vm.prank(buyer);
        sender.buyLicence{value: 0.3 ether}(policyId, FEE, 0, STANDARD);
        assertEq(before - buyer.balance, CCIP_FEE, "only the quoted fee is kept");
    }

    function test_buyLicence_aBuyerThatRefusesTheRefundReverts() public {
        NoRefundBuyer nb = new NoRefundBuyer();
        usdc.mint(address(nb), FEE);
        vm.deal(address(this), 1 ether);
        vm.expectRevert(ThenarCcipSender.RefundFailed.selector);
        nb.buy{value: CCIP_FEE + 1}(sender, IERC20(address(usdc)), policyId, FEE);
        // Exactly the fee needs no refund.
        nb.buy{value: CCIP_FEE}(sender, IERC20(address(usdc)), policyId, FEE);
        assertTrue(thenar.licensed(policyId, address(nb)));
    }

    function test_fastTransferFee_leavesDustOnlyTheOwnerCanSweep() public {
        cctp.setFee(3_000); // CCTP's fast-transfer fee, under the buyer's maxFee
        (, bytes32 orderId) = _buy(buyer, policyId, FEE, 10_000, FAST);
        assertEq(cctp.lastAmount(), FEE + 10_000);
        assertEq(cctp.lastMaxFee(), 10_000);
        assertEq(cctp.lastMinFinality(), FAST);
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Licensed));
        assertEq(usdc.balanceOf(address(receiver)), 7_000, "maxFee - fee is dust");
        assertEq(receiver.owed(buyer), 0, "dust is not the buyer's overpayment");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        receiver.sweep(stranger);

        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.Swept(sweeper, 7_000);
        vm.prank(owner);
        receiver.sweep(sweeper);
        assertEq(usdc.balanceOf(sweeper), 7_000);
        vm.prank(owner);
        vm.expectRevert(ThenarCcipReceiver.NothingToSweep.selector);
        receiver.sweep(sweeper);
        vm.prank(owner);
        vm.expectRevert(ThenarCcipReceiver.ZeroAddress.selector);
        receiver.sweep(address(0));
    }

    // -----------------------------------------------------------------
    // Instruction before dollars
    // -----------------------------------------------------------------

    function test_messageBeforeDollars_waitsThenExecutes() public {
        cctp.setDeferred(true);
        vm.recordLogs();
        bytes32 orderId = _buy();
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Pending));
        assertEq(receiver.pendingTotal(), FEE);
        assertFalse(thenar.licensed(policyId, buyer));
        bool pendingSeen;
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == address(receiver) && logs[i].topics[0] == ThenarCcipReceiver.OrderPending.selector) {
                pendingSeen = true;
            }
        }
        assertTrue(pendingSeen, "OrderPending");

        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.NotFunded.selector, 0, FEE));
        receiver.executePending(orderId);

        cctp.releaseAll(); // the CCTP mint lands on Arc
        vm.prank(stranger); // permissionless
        receiver.executePending(orderId);
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Licensed));
        assertTrue(thenar.licensed(policyId, buyer));
        assertEq(receiver.pendingTotal(), 0);
        assertEq(usdc.balanceOf(treasury), 250_000);

        vm.expectRevert(
            abi.encodeWithSelector(ThenarCcipReceiver.WrongStatus.selector, orderId, ThenarCcipReceiver.Status.Licensed)
        );
        receiver.executePending(orderId);
    }

    function test_executePending_unknownOrderReverts() public {
        bytes32 nope = keccak256("no such order");
        vm.expectRevert(
            abi.encodeWithSelector(ThenarCcipReceiver.WrongStatus.selector, nope, ThenarCcipReceiver.Status.None)
        );
        receiver.executePending(nope);
    }

    function test_cancelPending_onlyByTheLicensee_once_andOnlyWhenFunded() public {
        cctp.setDeferred(true);
        bytes32 orderId = _buy();
        assertEq(usdc.balanceOf(buyer), 1_000e6 - FEE);

        // Not funded yet: nothing to hand back.
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.NotFunded.selector, 0, FEE));
        receiver.cancelPending(orderId);

        cctp.releaseAll();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.NotLicensee.selector, orderId));
        receiver.cancelPending(orderId);

        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.OrderCancelled(orderId, buyer, FEE);
        vm.prank(buyer);
        receiver.cancelPending(orderId);
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Cancelled));
        assertEq(usdc.balanceOf(buyer), 1_000e6, "the buyer's dollars are back, on Arc");
        assertEq(receiver.pendingTotal(), 0);
        assertEq(usdc.balanceOf(address(receiver)), 0);
        assertFalse(thenar.licensed(policyId, buyer));

        vm.prank(buyer);
        vm.expectRevert(
            abi.encodeWithSelector(ThenarCcipReceiver.WrongStatus.selector, orderId, ThenarCcipReceiver.Status.Cancelled)
        );
        receiver.cancelPending(orderId);
        vm.expectRevert(
            abi.encodeWithSelector(ThenarCcipReceiver.WrongStatus.selector, orderId, ThenarCcipReceiver.Status.Cancelled)
        );
        receiver.executePending(orderId);
    }

    // -----------------------------------------------------------------
    // Orders that can't become a licence
    // -----------------------------------------------------------------

    function test_nonexistentPolicy_isOwedBack() public {
        (, bytes32 orderId) = _buy(buyer, 99, FEE, 0, STANDARD);
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Rejected));
        assertEq(receiver.owed(buyer), FEE);
        assertEq(receiver.owedTotal(), FEE);
        assertEq(receiver.pendingTotal(), 0);
        assertEq(receiver.available(), 0, "owed money never buys another order");
        assertEq(receiver.licensesBought(), 0);

        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.OwedWithdrawn(buyer, FEE);
        vm.prank(stranger); // anyone may push it to the buyer
        receiver.withdrawOwed(buyer);
        assertEq(usdc.balanceOf(buyer), 1_000e6);
        assertEq(receiver.owedTotal(), 0);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.NothingOwed.selector, buyer));
        receiver.withdrawOwed(buyer);
    }

    function test_amountBelowTheFee_isOwedBack() public {
        (, bytes32 orderId) = _buy(buyer, policyId, FEE - 1, 0, STANDARD);
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Rejected));
        assertFalse(thenar.licensed(policyId, buyer));
        assertEq(receiver.owed(buyer), FEE - 1);
        receiver.withdrawOwed(buyer);
        assertEq(usdc.balanceOf(buyer), 1_000e6);
    }

    function test_overpayment_isCreditedToTheBuyer() public {
        (, bytes32 orderId) = _buy(buyer, policyId, FEE + 2e6, 0, STANDARD);
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Licensed));
        assertTrue(thenar.licensed(policyId, buyer));
        assertEq(receiver.owed(buyer), 2e6);
        assertEq(receiver.owedTotal(), 2e6);
        assertEq(usdc.balanceOf(address(receiver)), 2e6);
        vm.prank(owner);
        vm.expectRevert(ThenarCcipReceiver.NothingToSweep.selector);
        receiver.sweep(sweeper);
        receiver.withdrawOwed(buyer);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - FEE);
    }

    function test_duplicateOrderId_isOwedBack_andLeavesTheFirstOrderAlone() public {
        bytes32 orderId = _buy();
        // A second message reusing the id (only a misbehaving source could send it), its dollars minted too.
        bytes memory dup = ThenarCcipIntent.license(orderId, other, policyId, FEE);
        usdc.mint(address(receiver), FEE);
        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.OrderRejected(orderId, other, FEE, "duplicate or invalid order");
        _deliver(_message(keccak256("dup message"), dup), 0);

        ThenarCcipReceiver.Order memory o = receiver.getOrder(orderId);
        assertEq(o.licensee, buyer, "the first order is untouched");
        assertEq(uint8(o.status), uint8(ThenarCcipReceiver.Status.Licensed));
        assertEq(receiver.owed(other), FEE);
        assertFalse(thenar.licensed(policyId, other));
        assertEq(receiver.licensesBought(), 1);

        receiver.withdrawOwed(other);
        assertEq(usdc.balanceOf(other), 1_000e6 + FEE);
    }

    function test_zeroLicenseeMessage_isStoredFailed() public {
        bytes memory bad = ThenarCcipIntent.license(keccak256("o"), address(0), policyId, FEE);
        usdc.mint(address(receiver), FEE);
        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.MessageFailed(
            keccak256("zero licensee"), abi.encodeWithSelector(ThenarCcipReceiver.ZeroAddress.selector)
        );
        _deliver(_message(keccak256("zero licensee"), bad), 0);
        assertEq(
            uint8(receiver.getFailedMessage(keccak256("zero licensee")).status),
            uint8(ThenarCcipReceiver.MessageStatus.Failed)
        );
    }

    // -----------------------------------------------------------------
    // Allowlist and router guard
    // -----------------------------------------------------------------

    function test_nonAllowlistedSender_isRefusedInCcipReceive() public {
        ThenarCcipSender rogue = new ThenarCcipSender(
            address(router), address(usdc), address(cctp), selector, address(receiver), LICENCE_GAS
        );
        vm.prank(buyer);
        usdc.approve(address(rogue), type(uint256).max);
        bytes32 orderId = rogue.nextOrderId(buyer);
        vm.prank(buyer);
        vm.expectRevert(); // ReceiverError(SourceNotAllowed) from the router
        rogue.buyLicence{value: CCIP_FEE}(policyId, FEE, 0, STANDARD);
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.None));
        assertEq(usdc.balanceOf(buyer), 1_000e6, "the whole purchase reverted");
    }

    function test_nonAllowlistedSelectorOrSender_isRefused() public {
        uint64 otherChain = selector == 10344971235874465080 ? 16015286601757825753 : 10344971235874465080;
        Client.Any2EVMMessage memory m = _message(keccak256("m"), ThenarCcipIntent.license(keccak256("x"), buyer, policyId, FEE));
        m.sourceChainSelector = otherChain;
        vm.prank(address(router));
        vm.expectRevert(
            abi.encodeWithSelector(ThenarCcipReceiver.SourceNotAllowed.selector, otherChain, address(sender))
        );
        receiver.ccipReceive(m);

        m.sourceChainSelector = selector;
        m.sender = abi.encode(stranger);
        vm.prank(address(router));
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.SourceNotAllowed.selector, selector, stranger));
        receiver.ccipReceive(m);
    }

    function test_onlyTheRouterDelivers() public {
        Client.Any2EVMMessage memory m = _message(keccak256("m"), ThenarCcipIntent.license(keccak256("x"), buyer, policyId, FEE));
        vm.expectRevert(); // InvalidRouter
        receiver.ccipReceive(m);
        vm.prank(stranger);
        vm.expectRevert(ThenarCcipReceiver.OnlySelf.selector);
        receiver.processMessage(m);
    }

    function test_allowSender_isOwnerOnly() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, buyer));
        receiver.allowSender(selector, buyer, true);
        vm.prank(owner);
        vm.expectRevert(ThenarCcipReceiver.ZeroAddress.selector);
        receiver.allowSender(selector, address(0), true);
        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.SenderAllowed(selector, address(sender), false);
        vm.prank(owner);
        receiver.allowSender(selector, address(sender), false);
        assertFalse(receiver.allowedSenders(selector, address(sender)));
    }

    function test_ownerPowersAreNarrow_andRenounceIsDisabled() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, buyer));
        receiver.resolveFailedMessage(bytes32(0));
        vm.prank(owner);
        vm.expectRevert(ThenarCcipReceiver.RenounceDisabled.selector);
        receiver.renounceOwnership();
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.NotFailed.selector, bytes32(0)));
        receiver.resolveFailedMessage(bytes32(0));

        // Two-step transfer.
        address next = makeAddr("next owner");
        vm.prank(owner);
        receiver.transferOwnership(next);
        assertEq(receiver.owner(), owner);
        vm.prank(next);
        receiver.acceptOwnership();
        assertEq(receiver.owner(), next);
    }

    // -----------------------------------------------------------------
    // Failed messages
    // -----------------------------------------------------------------

    function test_failedMessage_isStored_thenRetriedOnceTheCauseIsFixed() public {
        // Circle blocklists the receiver: its USDC can't move, so buying the licence reverts.
        bytes32 orderId = keccak256("order while blocked");
        bytes32 messageId = keccak256("message while blocked");
        usdc.mint(address(receiver), FEE); // the CCTP mint landed first
        usdc.blacklist(address(receiver));

        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.MessageFailed(
            messageId, abi.encodeWithSignature("Error(string)", "Blacklistable: account is blacklisted")
        );
        _deliver(_message(messageId, ThenarCcipIntent.license(orderId, buyer, policyId, FEE)), 0);

        // CCIP execution succeeded; the message is parked, and nothing else changed.
        ThenarCcipReceiver.FailedMessage memory f = receiver.getFailedMessage(messageId);
        assertEq(uint8(f.status), uint8(ThenarCcipReceiver.MessageStatus.Failed));
        assertEq(f.sourceChainSelector, selector);
        assertEq(f.sender, abi.encode(address(sender)));
        assertEq(f.data, ThenarCcipIntent.license(orderId, buyer, policyId, FEE));
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.None));
        assertEq(receiver.pendingTotal(), 0);
        assertFalse(thenar.licensed(policyId, buyer));

        // Still blocked: a retry reverts and the message stays Failed; the owner may resolve it.
        vm.expectRevert(bytes("Blacklistable: account is blacklisted"));
        receiver.retryFailedMessage(messageId);
        assertEq(uint8(receiver.getFailedMessage(messageId).status), uint8(ThenarCcipReceiver.MessageStatus.Failed));

        // Unblocked: the owner can no longer discard it...
        usdc.unBlacklist(address(receiver));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.StillProcessable.selector, messageId));
        receiver.resolveFailedMessage(messageId);
        assertFalse(thenar.licensed(policyId, buyer), "the refused resolve left no trace");

        // ...and anyone can run it.
        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.MessageRecovered(messageId);
        vm.prank(stranger);
        receiver.retryFailedMessage(messageId);
        assertTrue(thenar.licensed(policyId, buyer));
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Licensed));
        assertEq(uint8(receiver.getFailedMessage(messageId).status), uint8(ThenarCcipReceiver.MessageStatus.Resolved));
        assertEq(usdc.balanceOf(address(receiver)), 0);

        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.NotFailed.selector, messageId));
        receiver.retryFailedMessage(messageId);
    }

    function test_unprocessableMessage_ownerResolvesIt() public {
        bytes32 messageId = keccak256("unknown action");
        bytes memory data = abi.encode(uint8(2), abi.encode(keccak256("o"), buyer, policyId, FEE));
        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.MessageFailed(
            messageId, abi.encodeWithSelector(ThenarCcipReceiver.UnknownAction.selector, uint8(2))
        );
        _deliver(_message(messageId, data), 0);

        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.UnknownAction.selector, uint8(2)));
        receiver.retryFailedMessage(messageId);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        receiver.resolveFailedMessage(messageId);

        vm.expectEmit(address(receiver));
        emit ThenarCcipReceiver.MessageResolved(messageId);
        vm.prank(owner);
        receiver.resolveFailedMessage(messageId);
        assertEq(uint8(receiver.getFailedMessage(messageId).status), uint8(ThenarCcipReceiver.MessageStatus.Resolved));
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.NotFailed.selector, messageId));
        receiver.retryFailedMessage(messageId);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ThenarCcipReceiver.NotFailed.selector, messageId));
        receiver.resolveFailedMessage(messageId);
    }

    function test_retry_refusesASenderThatWasDelisted() public {
        bytes32 messageId = keccak256("delisted");
        usdc.mint(address(receiver), FEE);
        usdc.blacklist(address(receiver));
        _deliver(_message(messageId, ThenarCcipIntent.license(keccak256("o"), buyer, policyId, FEE)), 0);
        usdc.unBlacklist(address(receiver));
        vm.prank(owner);
        receiver.allowSender(selector, address(sender), false);
        vm.expectRevert(
            abi.encodeWithSelector(ThenarCcipReceiver.SourceNotAllowed.selector, selector, address(sender))
        );
        receiver.retryFailedMessage(messageId);
    }

    // -----------------------------------------------------------------
    // The owner can't reach buyers' money
    // -----------------------------------------------------------------

    function test_sweep_onlyTakesWhatNobodyIsOwed() public {
        // Owed: an order for a policy that doesn't exist.
        _buy(other, 99, FEE, 0, STANDARD);
        // Pending: an order whose dollars are still crossing on CCTP.
        cctp.setDeferred(true);
        bytes32 pending = _buy();
        // Stray tokens sent by mistake.
        usdc.mint(address(receiver), 123);

        // In-flight dollars count as committed, so nothing is sweepable yet.
        assertEq(usdc.balanceOf(address(receiver)), FEE + 123);
        vm.prank(owner);
        vm.expectRevert(ThenarCcipReceiver.NothingToSweep.selector);
        receiver.sweep(sweeper);

        cctp.releaseAll();
        vm.prank(owner);
        receiver.sweep(sweeper);
        assertEq(usdc.balanceOf(sweeper), 123, "only the stray tokens");
        assertEq(usdc.balanceOf(address(receiver)), 2 * uint256(FEE));

        receiver.executePending(pending);
        receiver.withdrawOwed(other);
        assertTrue(thenar.licensed(policyId, buyer));
        assertEq(usdc.balanceOf(other), 1_000e6);
        assertEq(usdc.balanceOf(address(receiver)), 0);
    }

    // -----------------------------------------------------------------
    // Gas
    // -----------------------------------------------------------------

    function test_licenceGasLimit_coversALargeCorpusFanOut() public {
        // 24 operators recorded this corpus; the default 900k CCIP gas limit must still buy it in one delivery.
        uint256 n = 24;
        address[] memory who = new address[](n);
        uint16[] memory scores = new uint16[](n);
        for (uint256 i; i < n; ++i) {
            who[i] = makeAddr(string.concat("fan-out operator ", vm.toString(i)));
            scores[i] = uint16(4_000 + i * 200);
        }
        (, uint256 pid) = _filledPolicy(who, scores, FEE);
        (, bytes32 orderId) = _buy(buyer, pid, FEE, 0, STANDARD);
        assertEq(uint8(_status(orderId)), uint8(ThenarCcipReceiver.Status.Licensed));
        assertTrue(thenar.licensed(pid, buyer));
        for (uint256 i; i < n; ++i) assertGt(usdc.balanceOf(who[i]), uint256(REWARD) * scores[i] / 10_000);
    }
}
