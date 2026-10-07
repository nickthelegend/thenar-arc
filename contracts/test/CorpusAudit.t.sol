// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CorpusAudit} from "../src/CorpusAudit.sol";

contract CorpusAuditTest is Test {
    CorpusAudit audit;
    address auditor = makeAddr("audit keeper");

    function setUp() public {
        vm.warp(1_800_000_000);
        audit = new CorpusAudit(auditor);
    }

    function _finding(uint256 taskId, bytes32 served, bytes32 committed, uint32 s, uint32 c, CorpusAudit.Verdict v)
        internal
        pure
        returns (CorpusAudit.Finding memory)
    {
        return CorpusAudit.Finding({
            taskId: taskId, servedRoot: served, committedRoot: committed, served: s, committed: c, verdict: v
        });
    }

    function _report(uint64 observedAt, CorpusAudit.Finding memory f) internal pure returns (bytes memory) {
        CorpusAudit.Finding[] memory fs = new CorpusAudit.Finding[](1);
        fs[0] = f;
        return abi.encode(observedAt, fs);
    }

    function test_onlyTheAuditorReports() public {
        bytes memory r = _report(100, _finding(1, keccak256("r"), keccak256("r"), 4, 4, CorpusAudit.Verdict.Matches));
        vm.expectRevert(abi.encodeWithSelector(CorpusAudit.NotAuditor.selector, address(this)));
        audit.onReport(r);
        address verifier = makeAddr("verifier");
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(CorpusAudit.NotAuditor.selector, verifier));
        audit.onReport(r);
        assertEq(audit.findings(), 0);
        assertEq(audit.auditor(), auditor);
    }

    function test_aFindingIsStoredAndEmitted() public {
        assertEq(audit.latest(1).observedAt, 0, "never audited");
        bytes32 root = keccak256("root");
        vm.expectEmit(address(audit));
        emit CorpusAudit.Audited(1, CorpusAudit.Verdict.Matches, root, root, 4, 4, 1_800_000_000);
        vm.prank(auditor);
        audit.onReport(_report(1_800_000_000, _finding(1, root, root, 4, 4, CorpusAudit.Verdict.Matches)));

        CorpusAudit.Audit memory a = audit.latest(1);
        assertEq(a.servedRoot, root);
        assertEq(a.committedRoot, root);
        assertEq(a.served, 4);
        assertEq(a.committed, 4);
        assertEq(uint8(a.verdict), uint8(CorpusAudit.Verdict.Matches));
        assertEq(a.observedAt, 1_800_000_000);
        assertEq(a.blockNumber, block.number);
        assertEq(audit.findings(), 1);
    }

    function test_theNewestObservationWins_inAnyOrderOfArrival() public {
        vm.startPrank(auditor);
        audit.onReport(_report(200, _finding(7, keccak256("b"), keccak256("a"), 5, 4, CorpusAudit.Verdict.Grown)));

        // An older report arriving late is discarded, not reverted on.
        vm.expectEmit(address(audit));
        emit CorpusAudit.StaleFinding(7, 100, 200);
        audit.onReport(_report(100, _finding(7, keccak256("a"), keccak256("a"), 4, 4, CorpusAudit.Verdict.Matches)));
        assertEq(uint8(audit.latest(7).verdict), uint8(CorpusAudit.Verdict.Grown));

        // A retry of the same observation is stale too.
        audit.onReport(_report(200, _finding(7, keccak256("x"), keccak256("a"), 3, 4, CorpusAudit.Verdict.Short)));
        assertEq(uint8(audit.latest(7).verdict), uint8(CorpusAudit.Verdict.Grown));
        assertEq(audit.findings(), 1);

        // A newer one replaces it.
        audit.onReport(_report(300, _finding(7, keccak256("z"), keccak256("a"), 4, 4, CorpusAudit.Verdict.Altered)));
        vm.stopPrank();
        CorpusAudit.Audit memory a = audit.latest(7);
        assertEq(uint8(a.verdict), uint8(CorpusAudit.Verdict.Altered));
        assertEq(a.observedAt, 300);
        assertEq(a.servedRoot, keccak256("z"));
        assertEq(audit.findings(), 2);
    }

    function test_oneReportCoversManyTasks_eachOnItsOwnClock() public {
        vm.prank(auditor);
        audit.onReport(_report(500, _finding(2, keccak256("2"), keccak256("2"), 1, 1, CorpusAudit.Verdict.Matches)));

        CorpusAudit.Finding[] memory fs = new CorpusAudit.Finding[](3);
        fs[0] = _finding(1, bytes32(0), bytes32(0), 0, 0, CorpusAudit.Verdict.Uncommitted);
        fs[1] = _finding(2, keccak256("old"), keccak256("2"), 1, 1, CorpusAudit.Verdict.Altered); // stale for task 2
        fs[2] = _finding(3, keccak256("3"), keccak256("3"), 9, 9, CorpusAudit.Verdict.Matches);
        vm.prank(auditor);
        audit.onReport(abi.encode(uint64(400), fs));

        assertEq(uint8(audit.latest(1).verdict), uint8(CorpusAudit.Verdict.Uncommitted));
        assertEq(audit.latest(1).observedAt, 400);
        assertEq(uint8(audit.latest(2).verdict), uint8(CorpusAudit.Verdict.Matches), "task 2 keeps its newer finding");
        assertEq(audit.latest(2).observedAt, 500);
        assertEq(audit.latest(3).served, 9);
        assertEq(audit.findings(), 3);
    }

    function test_aMalformedReportReverts() public {
        vm.prank(auditor);
        vm.expectRevert();
        audit.onReport(hex"1234");
    }
}
