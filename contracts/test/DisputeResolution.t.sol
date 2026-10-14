// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @title DisputeResolution – extended dispute/resolve edge-case tests for MilestoneEscrowV2.
///
/// This file covers cases NOT already tested in MilestoneEscrowV2.t.sol:
///   1.  disputeMilestone blocked on PENDING (not yet submitted)
///   2.  disputeMilestone blocked on APPROVED (wrong state)
///   3.  disputeMilestone blocked on CLAIMED (already settled)
///   4.  disputeMilestone blocked on REVISION_REQUESTED state
///   5.  Duplicate dispute (second disputeMilestone on same milestone)
///   6.  resolveDispute blocked on SUBMITTED (milestone not disputed)
///   7.  resolveDispute: freelancerAmount exactly equals milestone amount (boundary)
///   8.  resolveDispute: partial split — sum of pendingWithdrawals equals milestone amount
///   9.  resolveDispute: zero freelancerAmount — client gets full refund
///  10.  Dispute blocks claimAfterReviewExpiry even after window elapses
///  11.  Full round-trip: dispute → resolve (partial) → both parties withdraw
///  12.  Multiple milestones disputed simultaneously — resolver settles independently
///  13.  Dispute on last milestone of completed agreement triggers COMPLETED on resolve
///  14.  resolveDispute already resolved — second resolve reverts (MilestoneNotDisputed)
///  15.  Fuzz: partial award amount in [0, milestoneAmount] always satisfies sum invariant
contract DisputeResolutionTest is Test {
    MilestoneEscrowV2 internal escrow;
    MockERC20 internal usdc;

    address internal client     = makeAddr("client");
    address internal freelancer = makeAddr("freelancer");
    address internal resolver   = makeAddr("resolver");
    address internal stranger   = makeAddr("stranger");

    uint256 internal constant M0 = 600e6;
    uint256 internal constant M1 = 400e6;
    uint256 internal constant TOTAL = M0 + M1;

    bytes32 internal constant EV = keccak256("evidence");

    // ─── helpers ───────────────────────────────────────────────────────────────

    function _ms2() internal pure returns (MilestoneEscrowV2.MilestoneInput[] memory ms) {
        ms = new MilestoneEscrowV2.MilestoneInput[](2);
        ms[0] = MilestoneEscrowV2.MilestoneInput("M0", "desc", M0, 0, "AC0");
        ms[1] = MilestoneEscrowV2.MilestoneInput("M1", "desc", M1, 0, "AC1");
    }

    function _ms1(uint256 amount) internal pure returns (MilestoneEscrowV2.MilestoneInput[] memory ms) {
        ms = new MilestoneEscrowV2.MilestoneInput[](1);
        ms[0] = MilestoneEscrowV2.MilestoneInput("Solo", "d", amount, 0, "AC");
    }

    /// Create + fund a 2-milestone agreement.
    function _fund2() internal returns (uint256 id) {
        vm.prank(client);
        id = escrow.createAgreement(freelancer, resolver, "P", "D", _ms2(), address(usdc), false, 0);
        usdc.mint(client, TOTAL);
        vm.startPrank(client);
        usdc.approve(address(escrow), TOTAL);
        escrow.fundAgreement(id);
        vm.stopPrank();
    }

    /// Create + fund a 1-milestone agreement with autoRelease flag.
    function _fund1(uint256 amount, bool autoRelease) internal returns (uint256 id) {
        vm.prank(client);
        id = escrow.createAgreement(freelancer, resolver, "P", "D", _ms1(amount), address(usdc), autoRelease, 0);
        usdc.mint(client, amount);
        vm.startPrank(client);
        usdc.approve(address(escrow), amount);
        escrow.fundAgreement(id);
        vm.stopPrank();
    }

    function setUp() public {
        usdc  = new MockERC20("Mock USDC", "mUSDC", 6);
        escrow = new MilestoneEscrowV2(address(usdc));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  1. disputeMilestone blocked on PENDING state
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Dispute_Revert_MilestoneNotSubmitted_OnPending() public {
        uint256 id = _fund2();
        // M0 is still PENDING — no submission yet
        vm.prank(client);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotSubmitted.selector);
        escrow.disputeMilestone(id, 0, "too early");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  2. disputeMilestone blocked on APPROVED state
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Dispute_Revert_MilestoneNotSubmitted_OnApproved() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.approveMilestone(id, 0);

        // Now APPROVED — dispute should revert
        vm.prank(client);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotSubmitted.selector);
        escrow.disputeMilestone(id, 0, "too late to dispute");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  3. disputeMilestone blocked on CLAIMED state
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Dispute_Revert_MilestoneNotSubmitted_OnClaimed() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.approveMilestone(id, 0);
        vm.prank(freelancer);
        escrow.claimMilestone(id, 0);

        // CLAIMED — cannot dispute after payment
        vm.prank(client);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotSubmitted.selector);
        escrow.disputeMilestone(id, 0, "already paid");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  4. disputeMilestone blocked on REVISION_REQUESTED state
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Dispute_Revert_MilestoneNotSubmitted_OnRevisionRequested() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.requestRevision(id, 0, "needs changes");

        // REVISION_REQUESTED — dispute requires SUBMITTED state
        vm.prank(client);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotSubmitted.selector);
        escrow.disputeMilestone(id, 0, "double action");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  5. Duplicate dispute — second disputeMilestone on DISPUTED milestone
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Dispute_Revert_Duplicate_AlreadyDisputed() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "first dispute");

        // Second dispute on same milestone should revert (not SUBMITTED anymore)
        vm.prank(client);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotSubmitted.selector);
        escrow.disputeMilestone(id, 0, "double dispute");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  6. resolveDispute blocked on SUBMITTED (not disputed)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Resolve_Revert_MilestoneNotDisputed_OnSubmitted() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);

        // Still SUBMITTED — resolver cannot call resolveDispute
        vm.prank(resolver);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotDisputed.selector);
        escrow.resolveDispute(id, 0, true, M0, "premature");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  7. resolveDispute: freelancerAmount == milestone amount (boundary OK)
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Resolve_BoundaryFullAwardToFreelancer() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "r");

        // Exactly milestone amount — should NOT revert (boundary case)
        vm.prank(resolver);
        escrow.resolveDispute(id, 0, true, M0, "full award");

        assertEq(escrow.pendingWithdrawals(freelancer, address(usdc)), M0);
        assertEq(escrow.pendingWithdrawals(client, address(usdc)), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  8. Partial split — sum of pendingWithdrawals equals milestoneAmount
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Resolve_PartialSplit_SumEqualsMilestoneAmount() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "r");

        uint256 flShare = M0 * 70 / 100;
        uint256 clShare = M0 - flShare;

        vm.prank(resolver);
        escrow.resolveDispute(id, 0, true, flShare, "70-30");

        uint256 flPending = escrow.pendingWithdrawals(freelancer, address(usdc));
        uint256 clPending = escrow.pendingWithdrawals(client, address(usdc));

        assertEq(flPending, flShare);
        assertEq(clPending, clShare);
        // INVARIANT: sum never exceeds milestone amount
        assertEq(flPending + clPending, M0);
        assertLe(flPending + clPending, M0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  9. resolveDispute: zero freelancerAmount — full refund to client
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Resolve_ZeroFreelancer_FullClientRefund() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "r");

        vm.prank(resolver);
        escrow.resolveDispute(id, 0, false, 0, "client wins");

        assertEq(escrow.pendingWithdrawals(freelancer, address(usdc)), 0);
        assertEq(escrow.pendingWithdrawals(client, address(usdc)), M0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  10. Dispute blocks claimAfterReviewExpiry even after window elapses
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Dispute_Blocks_AutoRelease_AfterWindowElapsed() public {
        uint256 id = _fund1(M0, true); // autoRelease = true
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);

        // Client disputes before window elapses
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "disputed");

        // Warp past the review window
        skip(7 days + 1);

        // claimAfterReviewExpiry should revert — milestone is DISPUTED, not SUBMITTED
        vm.prank(freelancer);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotSubmitted.selector);
        escrow.claimAfterReviewExpiry(id, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  11. Full round-trip: dispute → partial resolve → both parties withdraw
    // ═══════════════════════════════════════════════════════════════════════════

    function test_FullRoundTrip_DisputeResolveWithdrawBothParties() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "dispute");

        uint256 flShare = M0 / 3;
        uint256 clShare = M0 - flShare;

        vm.prank(resolver);
        escrow.resolveDispute(id, 0, true, flShare, "1/3 to freelancer");

        // Freelancer withdraws
        uint256 flBalBefore = usdc.balanceOf(freelancer);
        vm.prank(freelancer);
        escrow.withdraw(address(usdc));
        assertEq(usdc.balanceOf(freelancer), flBalBefore + flShare);
        assertEq(escrow.pendingWithdrawals(freelancer, address(usdc)), 0);

        // Client withdraws
        uint256 clBalBefore = usdc.balanceOf(client);
        vm.prank(client);
        escrow.withdraw(address(usdc));
        assertEq(usdc.balanceOf(client), clBalBefore + clShare);
        assertEq(escrow.pendingWithdrawals(client, address(usdc)), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  12. Multiple milestones disputed simultaneously — resolver settles each
    // ═══════════════════════════════════════════════════════════════════════════

    function test_MultipleMilestonesDisputed_IndependentResolution() public {
        uint256 id = _fund2();

        // Submit + dispute both milestones
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(freelancer);
            escrow.submitMilestone(id, i, "ref", EV);
            vm.prank(client);
            escrow.disputeMilestone(id, i, string(abi.encodePacked("dispute ", i)));
        }

        // Resolve M0 in favour of freelancer, M1 in favour of client
        vm.prank(resolver);
        escrow.resolveDispute(id, 0, true, M0, "M0: freelancer wins");

        vm.prank(resolver);
        escrow.resolveDispute(id, 1, false, 0, "M1: client wins");

        assertEq(escrow.pendingWithdrawals(freelancer, address(usdc)), M0);
        assertEq(escrow.pendingWithdrawals(client,     address(usdc)), M1);

        // Both milestones are RESOLVED
        assertEq(uint8(escrow.getMilestone(id, 0).state), uint8(MilestoneEscrowV2.MilestoneState.RESOLVED));
        assertEq(uint8(escrow.getMilestone(id, 1).state), uint8(MilestoneEscrowV2.MilestoneState.RESOLVED));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  13. Dispute on last milestone — resolving triggers agreement COMPLETED
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Resolve_LastMilestone_AgreementBecomesCompleted() public {
        // Use a 1-milestone agreement so one resolve = all milestones settled
        uint256 id = _fund1(M0, false);

        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "dispute");

        vm.prank(resolver);
        escrow.resolveDispute(id, 0, true, M0, "full to freelancer");

        // After resolving the only milestone, agreement should be COMPLETED
        assertEq(
            uint8(escrow.getAgreement(id).state),
            uint8(MilestoneEscrowV2.AgreementState.COMPLETED)
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  14. resolveDispute second call — reverts because milestone is now RESOLVED
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Resolve_SecondCallReverts_MilestoneNotDisputed() public {
        uint256 id = _fund2();
        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "r");

        // First resolution
        vm.prank(resolver);
        escrow.resolveDispute(id, 0, true, M0, "first");

        // Second resolution attempt — milestone is now RESOLVED, not DISPUTED
        vm.prank(resolver);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotDisputed.selector);
        escrow.resolveDispute(id, 0, true, M0, "double resolve");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  15. Fuzz: partial award in [0, milestoneAmount] satisfies sum invariant
    // ═══════════════════════════════════════════════════════════════════════════

    function testFuzz_Resolve_PartialAward_SumInvariant(uint256 milestoneAmt, uint256 freelancerAward) public {
        milestoneAmt   = bound(milestoneAmt, 1e6, 10_000e6);
        freelancerAward = bound(freelancerAward, 0, milestoneAmt);

        uint256 id = _fund1(milestoneAmt, false);

        vm.prank(freelancer);
        escrow.submitMilestone(id, 0, "ref", EV);
        vm.prank(client);
        escrow.disputeMilestone(id, 0, "fuzz dispute");

        vm.prank(resolver);
        escrow.resolveDispute(id, 0, freelancerAward > 0, freelancerAward, "fuzz");

        uint256 flPending = escrow.pendingWithdrawals(freelancer, address(usdc));
        uint256 clPending = escrow.pendingWithdrawals(client, address(usdc));

        // INVARIANT: combined pendingWithdrawals == milestoneAmt, never more
        assertEq(flPending + clPending, milestoneAmt, "sum must equal milestone amount");
        assertLe(flPending, milestoneAmt, "freelancer share must not exceed milestone amount");
        assertLe(clPending, milestoneAmt, "client share must not exceed milestone amount");
    }
}
