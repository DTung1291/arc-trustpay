// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MilestoneEscrowV2} from "../MilestoneEscrowV2.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

/// @title DisputeV2.t.sol
/// @notice Extended dispute + arbitration tests for MilestoneEscrowV2.
///         Covers: dispute open/resolve paths, evidence lock-in, partial splits,
///         zero-award full-refund, double-claim guards, non-resolver rejection,
///         aggregate-payout guard, revision-then-dispute, multi-milestone disputes.
contract DisputeV2Test is Test {
    MilestoneEscrowV2 internal escrow;
    MockERC20 internal usdc;

    address internal client      = address(0xC1);
    address internal freelancer  = address(0xF1);
    address internal resolver    = address(0xAB);
    address internal attacker    = address(0xBEEF);

    uint256 internal constant M1_AMT = 100e6;
    uint256 internal constant M2_AMT = 200e6;
    uint256 internal constant M3_AMT = 50e6;

    uint256 internal agreementId;

    /* ------------------------------------------------------------------ */
    /*  Helpers                                                              */
    /* ------------------------------------------------------------------ */

    function _createAndFund(
        uint256 milestoneCount,
        bool autoRelease,
        uint256 reviewWindow
    ) internal returns (uint256 agId) {
        MilestoneEscrowV2.MilestoneInput[] memory ms = new MilestoneEscrowV2.MilestoneInput[](milestoneCount);
        uint256[3] memory amts = [M1_AMT, M2_AMT, M3_AMT];
        for (uint256 i = 0; i < milestoneCount; i++) {
            ms[i] = MilestoneEscrowV2.MilestoneInput({
                title: string(abi.encodePacked("Milestone ", i)),
                description: "desc",
                amount: amts[i % 3],
                dueDate: block.timestamp + 30 days,
                acceptanceCriteria: "Deliver working code"
            });
        }

        vm.startPrank(client);
        usdc.mint(client, 10_000e6);
        agId = escrow.createAgreement(freelancer, resolver, "Test", "desc", ms, address(usdc), autoRelease, reviewWindow);
        usdc.approve(address(escrow), 10_000e6);
        escrow.fundAgreement(agId);
        vm.stopPrank();
    }

    function _submit(uint256 agId, uint256 mIdx, string memory ref) internal {
        vm.prank(freelancer);
        escrow.submitMilestone(agId, mIdx, ref, bytes32(uint256(keccak256(abi.encodePacked(ref)))));
    }

    function _dispute(uint256 agId, uint256 mIdx, string memory reason) internal {
        vm.prank(client);
        escrow.disputeMilestone(agId, mIdx, reason);
    }

    function _resolve(
        uint256 agId,
        uint256 mIdx,
        bool toFreelancer,
        uint256 amount,
        string memory note
    ) internal {
        vm.prank(resolver);
        escrow.resolveDispute(agId, mIdx, toFreelancer, amount, note);
    }

    /* ------------------------------------------------------------------ */
    /*  Setup                                                               */
    /* ------------------------------------------------------------------ */

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        escrow = new MilestoneEscrowV2(address(usdc));
        agreementId = _createAndFund(1, false, 0);
    }

    /* ------------------------------------------------------------------ */
    /*  Test 1: Dispute opened → state is DISPUTED                         */
    /* ------------------------------------------------------------------ */
    function test_DisputeOpens_StateIsDisputed() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "Work does not meet spec");
        MilestoneEscrowV2.Milestone memory m = escrow.getMilestone(agreementId, 0);
        assertEq(uint8(m.state), uint8(MilestoneEscrowV2.MilestoneState.DISPUTED));
        assertEq(m.disputeReason, "Work does not meet spec");
    }

    /* ------------------------------------------------------------------ */
    /*  Test 2: Disputed → resolver awards full amount to freelancer        */
    /* ------------------------------------------------------------------ */
    function test_Resolve_FullAwardToFreelancer() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        uint256 milestoneAmt = escrow.getMilestone(agreementId, 0).amount;
        _resolve(agreementId, 0, true, milestoneAmt, "Quality meets spec");

        MilestoneEscrowV2.Milestone memory m = escrow.getMilestone(agreementId, 0);
        assertEq(uint8(m.state), uint8(MilestoneEscrowV2.MilestoneState.RESOLVED));
        assertEq(escrow.pendingWithdrawals(freelancer, address(usdc)), milestoneAmt);
        assertEq(escrow.pendingWithdrawals(client, address(usdc)), 0);
    }

    /* ------------------------------------------------------------------ */
    /*  Test 3: Disputed → resolver full refund to client                  */
    /* ------------------------------------------------------------------ */
    function test_Resolve_FullRefundToClient() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        uint256 milestoneAmt = escrow.getMilestone(agreementId, 0).amount;
        _resolve(agreementId, 0, false, 0, "Insufficient delivery");

        MilestoneEscrowV2.Milestone memory m = escrow.getMilestone(agreementId, 0);
        assertEq(uint8(m.state), uint8(MilestoneEscrowV2.MilestoneState.RESOLVED));
        assertEq(escrow.pendingWithdrawals(client, address(usdc)), milestoneAmt);
        assertEq(escrow.pendingWithdrawals(freelancer, address(usdc)), 0);
    }

    /* ------------------------------------------------------------------ */
    /*  Test 4: Partial split — 60% freelancer / 40% client               */
    /* ------------------------------------------------------------------ */
    function test_Resolve_PartialSplit() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        uint256 milestoneAmt = escrow.getMilestone(agreementId, 0).amount; // 100e6
        uint256 flAmt = (milestoneAmt * 60) / 100;   // 60e6
        uint256 clAmt = milestoneAmt - flAmt;         // 40e6

        _resolve(agreementId, 0, true, flAmt, "Partial delivery");
        assertEq(escrow.pendingWithdrawals(freelancer, address(usdc)), flAmt);
        assertEq(escrow.pendingWithdrawals(client, address(usdc)), clAmt);
    }

    /* ------------------------------------------------------------------ */
    /*  Test 5: Non-resolver cannot call resolveDispute                    */
    /* ------------------------------------------------------------------ */
    function test_Resolve_RevertsForNonResolver() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        vm.prank(attacker);
        vm.expectRevert(MilestoneEscrowV2.NotResolver.selector);
        escrow.resolveDispute(agreementId, 0, true, M1_AMT, "hack");
    }

    /* ------------------------------------------------------------------ */
    /*  Test 6: Client cannot call resolveDispute                          */
    /* ------------------------------------------------------------------ */
    function test_Resolve_RevertsForClient() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        vm.prank(client);
        vm.expectRevert(MilestoneEscrowV2.NotResolver.selector);
        escrow.resolveDispute(agreementId, 0, true, M1_AMT, "client");
    }

    /* ------------------------------------------------------------------ */
    /*  Test 7: Freelancer cannot call resolveDispute                      */
    /* ------------------------------------------------------------------ */
    function test_Resolve_RevertsForFreelancer() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        vm.prank(freelancer);
        vm.expectRevert(MilestoneEscrowV2.NotResolver.selector);
        escrow.resolveDispute(agreementId, 0, true, M1_AMT, "fl");
    }

    /* ------------------------------------------------------------------ */
    /*  Test 8: freelancerAmount > milestone.amount reverts                */
    /* ------------------------------------------------------------------ */
    function test_Resolve_RevertsIfAmountExceedsEscrow() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        vm.prank(resolver);
        vm.expectRevert(MilestoneEscrowV2.InvalidAmount.selector);
        escrow.resolveDispute(agreementId, 0, true, M1_AMT + 1, "over");
    }

    /* ------------------------------------------------------------------ */
    /*  Test 9: Resolving a non-disputed milestone reverts                 */
    /* ------------------------------------------------------------------ */
    function test_Resolve_RevertsIfNotDisputed() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        // Do NOT dispute — still SUBMITTED
        vm.prank(resolver);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotDisputed.selector);
        escrow.resolveDispute(agreementId, 0, true, M1_AMT, "note");
    }

    /* ------------------------------------------------------------------ */
    /*  Test 10: Cannot double-resolve the same milestone                  */
    /* ------------------------------------------------------------------ */
    function test_Resolve_CannotDoubleResolve() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        _resolve(agreementId, 0, true, M1_AMT, "done");
        vm.prank(resolver);
        vm.expectRevert(MilestoneEscrowV2.MilestoneNotDisputed.selector);
        escrow.resolveDispute(agreementId, 0, true, M1_AMT, "again");
    }

    /* ------------------------------------------------------------------ */
    /*  Test 11: Funds withdrawable after resolution                       */
    /* ------------------------------------------------------------------ */
    function test_Resolve_FundsWithdrawable() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");
        _resolve(agreementId, 0, true, M1_AMT, "done");

        uint256 before = usdc.balanceOf(freelancer);
        vm.prank(freelancer);
        escrow.withdraw(address(usdc));
        assertEq(usdc.balanceOf(freelancer), before + M1_AMT);
        assertEq(escrow.pendingWithdrawals(freelancer, address(usdc)), 0);
    }

    /* ------------------------------------------------------------------ */
    /*  Test 12: Revision requested → freelancer resubmits → client        */
    /*  disputes new submission → resolver awards full refund               */
    /* ------------------------------------------------------------------ */
    function test_RevisionThenDispute_FullRefund() public {
        _submit(agreementId, 0, "ipfs://rev0");

        vm.prank(client);
        escrow.requestRevision(agreementId, 0, "Need to redo section 3");

        vm.prank(freelancer);
        escrow.submitMilestone(agreementId, 0, "ipfs://rev1", bytes32(uint256(0xDEAD)));

        _dispute(agreementId, 0, "Still incomplete");
        uint256 milestoneAmt = escrow.getMilestone(agreementId, 0).amount;
        _resolve(agreementId, 0, false, 0, "Insufficient revision");

        assertEq(escrow.pendingWithdrawals(client, address(usdc)), milestoneAmt);
    }

    /* ------------------------------------------------------------------ */
    /*  Test 13: Multi-milestone: dispute on M0 does not affect M1         */
    /* ------------------------------------------------------------------ */
    function test_MultiMilestone_DisputeM0_M1Unaffected() public {
        uint256 agId = _createAndFund(2, false, 0);

        // Submit both milestones
        _submit(agId, 0, "ipfs://m0");
        _submit(agId, 1, "ipfs://m1");

        // Dispute M0
        _dispute(agId, 0, "M0 bad");

        // M1 should still be in SUBMITTED state, client can approve normally
        vm.prank(client);
        escrow.approveMilestone(agId, 1);

        MilestoneEscrowV2.Milestone memory m1 = escrow.getMilestone(agId, 1);
        assertEq(uint8(m1.state), uint8(MilestoneEscrowV2.MilestoneState.APPROVED));
    }

    /* ------------------------------------------------------------------ */
    /*  Test 14: DisputeResolved event emitted with correct args           */
    /* ------------------------------------------------------------------ */
    function test_DisputeResolved_EventEmitted() public {
        _submit(agreementId, 0, "ipfs://QmABC");
        _dispute(agreementId, 0, "reason");

        vm.expectEmit(true, true, true, true);
        emit MilestoneEscrowV2.DisputeResolved(agreementId, 0, resolver, true, M1_AMT, 0, "awarded");
        _resolve(agreementId, 0, true, M1_AMT, "awarded");
    }

    /* ------------------------------------------------------------------ */
    /*  Test 15: Aggregate payout guard — two milestones both resolved      */
    /*  freelancer + client refunds must not exceed total escrow            */
    /* ------------------------------------------------------------------ */
    function test_AggregatePayout_NotExceeded_TwoMilestones() public {
        uint256 agId = _createAndFund(2, false, 0);
        _submit(agId, 0, "ipfs://m0");
        _dispute(agId, 0, "bad");
        _submit(agId, 1, "ipfs://m1");
        _dispute(agId, 1, "bad2");

        // Resolve M0: 100e6 to freelancer
        _resolve(agId, 0, true, M1_AMT, "m0 ok");
        // Resolve M1: 200e6 to client
        _resolve(agId, 1, false, 0, "m1 bad");

        uint256 flBal = escrow.pendingWithdrawals(freelancer, address(usdc));
        uint256 clBal = escrow.pendingWithdrawals(client, address(usdc));
        assertEq(flBal, M1_AMT);
        assertEq(clBal, M2_AMT);
        assertEq(flBal + clBal, M1_AMT + M2_AMT); // total = 300e6, matches original escrow
    }
}
