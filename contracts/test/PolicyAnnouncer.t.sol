// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {
    PolicyAnnouncer, TeleporterMessageInput, IAxonPolicies
} from "../src/PolicyAnnouncer.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";

/// @dev Stands in for the messenger so the announcement can be inspected. The
///      real messenger's job — checking validator signatures — is the chain's,
///      not something a unit test can or should reproduce.
contract RecordingMessenger {
    bytes32 public lastDestination;
    address public lastAddress;
    uint256 public lastGasLimit;
    bytes public lastMessage;
    bool public sent;

    function sendCrossChainMessage(TeleporterMessageInput calldata input) external returns (bytes32) {
        lastDestination = input.destinationBlockchainID;
        lastAddress = input.destinationAddress;
        lastGasLimit = input.requiredGasLimit;
        lastMessage = input.message;
        sent = true;
        return keccak256(abi.encode(input.destinationBlockchainID, input.message));
    }
}

/// @dev A protocol holding one policy, so the announcer has something true to read.
contract Policies {
    IAxonPolicies.Policy private _p;
    uint256 private _n;

    function set(IAxonPolicies.Policy memory p) external {
        _p = p;
        _n = 1;
    }

    function getPolicy(uint256) external view returns (IAxonPolicies.Policy memory) {
        return _p;
    }

    function policyCount() external view returns (uint256) {
        return _n;
    }
}

contract PolicyAnnouncerTest is Test {
    RecordingMessenger messenger;
    Policies protocol;
    PolicyAnnouncer announcer;
    PolicyRegistry registry;

    bytes32 constant SOURCE = bytes32(uint256(0xC0FFEE));
    bytes32 constant DEST = bytes32(uint256(0xDEC0DE));
    address constant MINTER = address(0xBEEF);

    function setUp() public {
        messenger = new RecordingMessenger();
        protocol = new Policies();
        protocol.set(
            IAxonPolicies.Policy({
                taskId: 7,
                minter: MINTER,
                trajectories: 12,
                mintedAt: 1_700_000_000,
                licenceFee: 0.5 ether,
                licencesSold: 3,
                distributed: 1 ether
            })
        );
        announcer = new PolicyAnnouncer(address(messenger), address(protocol));
        registry = new PolicyRegistry(address(messenger), SOURCE, address(announcer));
    }

    /// The announcement carries what the protocol holds, not what a caller says.
    function test_announcementCarriesTheProtocolsOwnFigures() public {
        announcer.announce(0, DEST, address(registry));
        assertTrue(messenger.sent());

        assertEq(messenger.lastDestination(), DEST);
        assertEq(messenger.lastAddress(), address(registry));
        assertEq(messenger.lastGasLimit(), announcer.RECEIVE_GAS());

        (uint256 policyId, uint256 taskId, address minter, uint32 trajectories,, uint128 fee) =
            abi.decode(messenger.lastMessage(), (uint256, uint256, address, uint32, uint64, uint128));
        assertEq(policyId, 0);
        assertEq(taskId, 7);
        assertEq(minter, MINTER);
        assertEq(trajectories, 12);
        assertEq(fee, 0.5 ether);
    }

    function test_cannotAnnounceAPolicyThatDoesNotExist() public {
        vm.expectRevert(PolicyAnnouncer.NoSuchPolicy.selector);
        announcer.announce(1, DEST, address(registry));
    }

    // ------------------------------------------------------- the trust rule

    /// A registry that believed direct calls would be worth no more than an
    /// unauthenticated endpoint. This is the check that makes it worth more.
    function test_registryRejectsACallThatDidNotComeFromTheMessenger() public {
        bytes memory message = _message();
        vm.prank(address(0xBAD));
        vm.expectRevert(PolicyRegistry.NotMessenger.selector);
        registry.receiveTeleporterMessage(SOURCE, address(announcer), message);
    }

    function test_registryRejectsAnotherChainsAnnouncement() public {
        bytes32 wrong = bytes32(uint256(0xFACADE));
        bytes memory message = _message();
        vm.prank(address(messenger));
        vm.expectRevert(abi.encodeWithSelector(PolicyRegistry.WrongSourceChain.selector, wrong));
        registry.receiveTeleporterMessage(wrong, address(announcer), message);
    }

    function test_registryRejectsAStrangerOnTheRightChain() public {
        address stranger = address(0xDEAD);
        bytes memory message = _message();
        vm.prank(address(messenger));
        vm.expectRevert(abi.encodeWithSelector(PolicyRegistry.WrongAnnouncer.selector, stranger));
        registry.receiveTeleporterMessage(SOURCE, stranger, message);
    }

    function test_registryRecordsAProperDelivery() public {
        bytes memory message = _message();
        vm.prank(address(messenger));
        registry.receiveTeleporterMessage(SOURCE, address(announcer), message);

        assertTrue(registry.knows(0));
        PolicyRegistry.Policy memory got = registry.getPolicy(0);
        assertEq(got.taskId, 7);
        assertEq(got.minter, MINTER);
        assertEq(got.trajectories, 12);
        assertEq(got.licenceFee, 0.5 ether);
        assertEq(registry.count(), 1);
        assertEq(registry.idAt(0), 0);
    }

    /// A relayer may deliver twice. The record must not move under a reader.
    function test_deliveringTheSamePolicyTwiceChangesNothing() public {
        bytes memory message = _message();
        vm.prank(address(messenger));
        registry.receiveTeleporterMessage(SOURCE, address(announcer), message);
        uint64 first = registry.getPolicy(0).receivedAt;

        vm.warp(block.timestamp + 1 days);
        bytes memory again = _message();
        vm.prank(address(messenger));
        registry.receiveTeleporterMessage(SOURCE, address(announcer), again);

        assertEq(registry.getPolicy(0).receivedAt, first);
        assertEq(registry.count(), 1);
    }

    // ------------------------------------------------------------- helpers

    /// Produce a real announcement and hand back the bytes it put on the wire,
    /// so the registry is fed exactly what the announcer emits.
    function _message() internal returns (bytes memory) {
        announcer.announce(0, DEST, address(registry));
        return messenger.lastMessage();
    }
}
