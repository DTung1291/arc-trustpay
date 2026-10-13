// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev MilestoneEscrowV2 — adds opt-in auto-release, configurable review windows, revision flow, and evidence hashing. Educational testnet prototype; not audited for mainnet. Resolver is a trust assumption. Evidence hashes commit to content but do not verify work quality. Evidence URLs stored in events are public.
contract MilestoneEscrowV2 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant DEFAULT_REVIEW_WINDOW = 7 days;
    uint256 public constant MAX_MILESTONES = 20;

    address public immutable ACCEPTED_TOKEN;

    enum AgreementState {
        PENDING,
        ACTIVE,
        COMPLETED,
        CANCELLED
    }

    enum MilestoneState {
        PENDING,
        SUBMITTED,
        APPROVED,
        CLAIMED,
        DISPUTED,
        RESOLVED,
        REVISION_REQUESTED
    }

    struct MilestoneInput {
        string title;
        string description;
        uint256 amount;
        uint256 dueDate;
        string acceptanceCriteria;
    }

    struct Milestone {
        string title;
        string description;
        uint256 amount;
        string deliverableRef;
        uint256 dueDate;
        uint256 reviewWindowEnd;
        uint256 submittedAt;
        MilestoneState state;
        string disputeReason;
        string resolutionNote;
        string acceptanceCriteria;
        bytes32 evidenceHash;
        uint256 revisionCount;
        uint256 lastActivityAt;
    }

    struct Agreement {
        uint256 agreementId;
        address client;
        address freelancer;
        address token;
        uint256 totalAmount;
        string title;
        string description;
        address resolver;
        uint256 createdAt;
        uint256 fundedAt;
        AgreementState state;
        uint256 totalPaid;
        bool autoRelease;
        uint256 reviewWindowSeconds;
        bool autoReleaseEnabled;
        Milestone[] milestones;
    }

    struct SubmissionRecord {
        string deliverableRef;
        bytes32 evidenceHash;
        uint256 submittedAt;
        uint256 revisionNumber;
        string clientComment;
    }

    error InvalidAddress();
    error InvalidToken();
    error InvalidMilestoneCount();
    error InvalidAmount();
    error AgreementNotPending();
    error AgreementNotActive();
    error NotClient();
    error NotFreelancer();
    error NotResolver();
    error MilestoneNotPending();
    error MilestoneNotPendingOrRevision();
    error MilestoneNotSubmitted();
    error MilestoneNotApproved();
    error MilestoneNotDisputed();
    error MilestoneIndexOutOfBounds();
    error AlreadyClaimed();
    error ReviewWindowNotSet();
    error ReviewWindowNotElapsed();
    error AggregatePayout();
    error TransferAmountMismatch();
    error TooEarlyToAbort();
    error MilestonesAlreadyStarted();
    error NothingToWithdraw();
    error AutoReleaseDisabled();
    error RevisionNotAllowed();
    error InvalidReviewWindow();

    event AgreementCreated(
        uint256 indexed agreementId,
        address indexed client,
        address indexed freelancer,
        address token,
        uint256 totalAmount,
        string title
    );
    event AgreementFunded(uint256 indexed agreementId, address indexed client, uint256 totalAmount, uint256 fundedAt);
    event MilestoneSubmitted(
        uint256 indexed agreementId,
        uint256 indexed milestoneIndex,
        address indexed freelancer,
        string deliverableRef,
        bytes32 evidenceHash,
        uint256 submittedAt
    );
    event MilestoneResubmitted(
        uint256 indexed agreementId,
        uint256 indexed milestoneIndex,
        address indexed freelancer,
        string deliverableRef,
        bytes32 evidenceHash,
        uint256 revisionCount,
        uint256 resubmittedAt
    );
    event RevisionRequested(
        uint256 indexed agreementId,
        uint256 indexed milestoneIndex,
        address indexed client,
        string comment,
        uint256 revisionCount,
        uint256 requestedAt
    );
    event MilestoneApproved(uint256 indexed agreementId, uint256 indexed milestoneIndex, address indexed client, uint256 approvedAt);
    event MilestoneClaimed(
        uint256 indexed agreementId,
        uint256 indexed milestoneIndex,
        address indexed freelancer,
        uint256 amount,
        uint256 claimedAt
    );
    event MilestoneDisputed(
        uint256 indexed agreementId,
        uint256 indexed milestoneIndex,
        address indexed client,
        string reason,
        uint256 disputedAt
    );
    event DisputeResolved(
        uint256 indexed agreementId,
        uint256 indexed milestoneIndex,
        address indexed resolver,
        bool awardedToFreelancer,
        uint256 freelancerAmount,
        uint256 clientRefund,
        string note
    );
    event AgreementCancelled(uint256 indexed agreementId, address indexed client);
    event AgreementCompleted(uint256 indexed agreementId);
    event Withdrawn(address indexed recipient, address indexed token, uint256 amount);

    uint256 private _nextAgreementId = 1;
    mapping(uint256 => Agreement) private _agreements;
    mapping(address => uint256[]) private _agreementsByClient;
    mapping(address => uint256[]) private _agreementsByFreelancer;
    mapping(address => mapping(address => uint256)) public pendingWithdrawals;
    mapping(uint256 => mapping(uint256 => SubmissionRecord[])) private _submissionHistory;

    constructor(address acceptedToken) {
        if (acceptedToken == address(0)) {
            revert InvalidAddress();
        }
        ACCEPTED_TOKEN = acceptedToken;
    }

    /// @notice Creates a new milestone-based escrow agreement in PENDING state.
    /// @param freelancer The freelancer address for this agreement.
    /// @param resolver The resolver address authorized to resolve disputes for this agreement.
    /// @param title The agreement title.
    /// @param description The agreement description.
    /// @param milestones The milestone inputs defining payouts and due dates.
    /// @param token The ERC20 token address (USDC) used for escrowed payments.
    /// @param autoRelease Whether review-expiry claims are enabled for this agreement.
    /// @param reviewWindowSeconds Review window for milestone submissions (0 uses default).
    /// @return agreementId The newly created agreement id.
    function createAgreement(
        address freelancer,
        address resolver,
        string calldata title,
        string calldata description,
        MilestoneInput[] calldata milestones,
        address token,
        bool autoRelease,
        uint256 reviewWindowSeconds
    ) external returns (uint256 agreementId) {
        if (freelancer == address(0) || resolver == address(0) || token == address(0)) {
            revert InvalidAddress();
        }
        if (token != ACCEPTED_TOKEN) {
            revert InvalidToken();
        }
        if (milestones.length == 0 || milestones.length > MAX_MILESTONES) {
            revert InvalidMilestoneCount();
        }
        if (reviewWindowSeconds != 0 && (reviewWindowSeconds < 3600 || reviewWindowSeconds > 30 days)) {
            revert InvalidReviewWindow();
        }

        uint256 totalAmount;
        for (uint256 i = 0; i < milestones.length; i++) {
            if (milestones[i].amount == 0) {
                revert InvalidAmount();
            }
            totalAmount += milestones[i].amount;
        }

        agreementId = _nextAgreementId++;

        // Write address/scalar fields via storage ref to avoid stack-too-deep on calldata strings
        {
            Agreement storage ag = _agreements[agreementId];
            ag.agreementId = agreementId;
            ag.client = msg.sender;
            ag.freelancer = freelancer;
            ag.resolver = resolver;
            ag.token = token;
            ag.totalAmount = totalAmount;
            ag.createdAt = block.timestamp;
            ag.state = AgreementState.PENDING;
            ag.autoRelease = autoRelease;
            ag.reviewWindowSeconds = reviewWindowSeconds == 0 ? DEFAULT_REVIEW_WINDOW : reviewWindowSeconds;
        }

        // Write string fields separately (each in its own scope to release stack slots)
        _agreements[agreementId].title = title;
        _agreements[agreementId].description = description;

        _addMilestones(_agreements[agreementId], milestones);

        _agreementsByClient[msg.sender].push(agreementId);
        _agreementsByFreelancer[freelancer].push(agreementId);

        // Read title back from storage to avoid keeping calldata ref on stack through emit
        emit AgreementCreated(agreementId, msg.sender, freelancer, token, totalAmount, _agreements[agreementId].title);
    }

    function _addMilestones(Agreement storage agreement, MilestoneInput[] calldata milestones) internal {
        for (uint256 i = 0; i < milestones.length; i++) {
            agreement.milestones.push(
                Milestone({
                    title: milestones[i].title,
                    description: milestones[i].description,
                    amount: milestones[i].amount,
                    deliverableRef: "",
                    dueDate: milestones[i].dueDate,
                    reviewWindowEnd: 0,
                    submittedAt: 0,
                    state: MilestoneState.PENDING,
                    disputeReason: "",
                    resolutionNote: "",
                    acceptanceCriteria: milestones[i].acceptanceCriteria,
                    evidenceHash: bytes32(0),
                    revisionCount: 0,
                    lastActivityAt: 0
                })
            );
        }
    }

    /// @notice Funds a PENDING agreement and activates it.
    /// @param agreementId The agreement id.
    function fundAgreement(uint256 agreementId) external nonReentrant {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.client != msg.sender) {
            revert NotClient();
        }
        if (agreement.state != AgreementState.PENDING) {
            revert AgreementNotPending();
        }

        agreement.state = AgreementState.ACTIVE;
        agreement.fundedAt = block.timestamp;
        if (agreement.autoRelease) {
            agreement.autoReleaseEnabled = true;
        }

        IERC20 token = IERC20(agreement.token);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), agreement.totalAmount);
        uint256 balanceAfter = token.balanceOf(address(this));

        if (balanceAfter - balanceBefore != agreement.totalAmount) {
            revert TransferAmountMismatch();
        }

        emit AgreementFunded(agreementId, msg.sender, agreement.totalAmount, agreement.fundedAt);
    }

    /// @notice Submits or resubmits a milestone deliverable reference for review.
    /// @param agreementId The agreement id.
    /// @param milestoneIndex The milestone index.
    /// @param deliverableRef The IPFS hash or URL describing the deliverable.
    /// @param evidenceHash The SHA-256 hash of an evidence package prepared offchain.
    function submitMilestone(
        uint256 agreementId,
        uint256 milestoneIndex,
        string calldata deliverableRef,
        bytes32 evidenceHash
    ) external {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.freelancer != msg.sender) {
            revert NotFreelancer();
        }
        if (agreement.state != AgreementState.ACTIVE) {
            revert AgreementNotActive();
        }

        Milestone storage milestone = _getMilestoneStorage(agreement, milestoneIndex);

        if (milestone.state == MilestoneState.PENDING) {
            milestone.state = MilestoneState.SUBMITTED;
            milestone.submittedAt = block.timestamp;
            milestone.deliverableRef = deliverableRef;
            milestone.reviewWindowEnd = block.timestamp + agreement.reviewWindowSeconds;
            milestone.evidenceHash = evidenceHash;
            milestone.lastActivityAt = block.timestamp;

            _submissionHistory[agreementId][milestoneIndex].push(
                SubmissionRecord({
                    deliverableRef: deliverableRef,
                    evidenceHash: evidenceHash,
                    submittedAt: block.timestamp,
                    revisionNumber: 0,
                    clientComment: ""
                })
            );

            emit MilestoneSubmitted(agreementId, milestoneIndex, msg.sender, deliverableRef, evidenceHash, milestone.submittedAt);
            return;
        }

        if (milestone.state == MilestoneState.REVISION_REQUESTED) {
            string memory priorComment = milestone.disputeReason;

            milestone.state = MilestoneState.SUBMITTED;
            milestone.deliverableRef = deliverableRef;
            milestone.reviewWindowEnd = block.timestamp + agreement.reviewWindowSeconds;
            milestone.evidenceHash = evidenceHash;
            milestone.lastActivityAt = block.timestamp;

            _submissionHistory[agreementId][milestoneIndex].push(
                SubmissionRecord({
                    deliverableRef: deliverableRef,
                    evidenceHash: evidenceHash,
                    submittedAt: block.timestamp,
                    revisionNumber: milestone.revisionCount,
                    clientComment: priorComment
                })
            );

            milestone.disputeReason = "";

            emit MilestoneResubmitted(
                agreementId,
                milestoneIndex,
                msg.sender,
                deliverableRef,
                evidenceHash,
                milestone.revisionCount,
                block.timestamp
            );
            return;
        }

        revert MilestoneNotPendingOrRevision();
    }

    /// @notice Requests a revision on a submitted milestone.
    /// @param agreementId The agreement id.
    /// @param milestoneIndex The milestone index.
    /// @param comment The client revision comment.
    function requestRevision(uint256 agreementId, uint256 milestoneIndex, string calldata comment) external {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.client != msg.sender) {
            revert NotClient();
        }
        if (agreement.state != AgreementState.ACTIVE) {
            revert AgreementNotActive();
        }

        Milestone storage milestone = _getMilestoneStorage(agreement, milestoneIndex);
        if (milestone.state != MilestoneState.SUBMITTED) {
            revert RevisionNotAllowed();
        }

        milestone.state = MilestoneState.REVISION_REQUESTED;
        milestone.disputeReason = comment;
        milestone.revisionCount += 1;
        milestone.reviewWindowEnd = 0;
        milestone.lastActivityAt = block.timestamp;

        emit RevisionRequested(agreementId, milestoneIndex, msg.sender, comment, milestone.revisionCount, block.timestamp);
    }

    /// @notice Approves a submitted milestone for freelancer claim.
    /// @param agreementId The agreement id.
    /// @param milestoneIndex The milestone index.
    function approveMilestone(uint256 agreementId, uint256 milestoneIndex) external {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.client != msg.sender) {
            revert NotClient();
        }
        if (agreement.state != AgreementState.ACTIVE) {
            revert AgreementNotActive();
        }

        Milestone storage milestone = _getMilestoneStorage(agreement, milestoneIndex);
        if (milestone.state != MilestoneState.SUBMITTED) {
            revert MilestoneNotSubmitted();
        }

        milestone.state = MilestoneState.APPROVED;

        emit MilestoneApproved(agreementId, milestoneIndex, msg.sender, block.timestamp);
    }

    /// @notice Claims payment for an approved milestone.
    /// @param agreementId The agreement id.
    /// @param milestoneIndex The milestone index.
    function claimMilestone(uint256 agreementId, uint256 milestoneIndex) external nonReentrant {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.freelancer != msg.sender) {
            revert NotFreelancer();
        }

        Milestone storage milestone = _getMilestoneStorage(agreement, milestoneIndex);
        if (milestone.state == MilestoneState.CLAIMED) {
            revert AlreadyClaimed();
        }
        if (milestone.state != MilestoneState.APPROVED) {
            revert MilestoneNotApproved();
        }

        uint256 amount = milestone.amount;
        uint256 newTotalPaid = agreement.totalPaid + amount;
        if (newTotalPaid > agreement.totalAmount) {
            revert AggregatePayout();
        }

        milestone.state = MilestoneState.CLAIMED;
        agreement.totalPaid = newTotalPaid;

        _markAgreementCompletedIfTerminal(agreement);

        pendingWithdrawals[agreement.freelancer][agreement.token] += amount;

        emit MilestoneClaimed(agreementId, milestoneIndex, msg.sender, amount, block.timestamp);
    }

    /// @notice Claims payment for a submitted milestone after the review window expires without client action.
    /// @param agreementId The agreement id.
    /// @param milestoneIndex The milestone index.
    function claimAfterReviewExpiry(uint256 agreementId, uint256 milestoneIndex) external nonReentrant {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.freelancer != msg.sender) {
            revert NotFreelancer();
        }
        if (agreement.state != AgreementState.ACTIVE) {
            revert AgreementNotActive();
        }
        if (!agreement.autoReleaseEnabled) {
            revert AutoReleaseDisabled();
        }

        Milestone storage milestone = _getMilestoneStorage(agreement, milestoneIndex);
        if (milestone.state != MilestoneState.SUBMITTED) {
            revert MilestoneNotSubmitted();
        }
        if (milestone.reviewWindowEnd == 0) {
            revert ReviewWindowNotSet();
        }
        if (block.timestamp <= milestone.reviewWindowEnd) {
            revert ReviewWindowNotElapsed();
        }

        uint256 amount = milestone.amount;
        uint256 newTotalPaid = agreement.totalPaid + amount;
        if (newTotalPaid > agreement.totalAmount) {
            revert AggregatePayout();
        }

        milestone.state = MilestoneState.CLAIMED;
        agreement.totalPaid = newTotalPaid;

        _markAgreementCompletedIfTerminal(agreement);

        pendingWithdrawals[agreement.freelancer][agreement.token] += amount;

        emit MilestoneClaimed(agreementId, milestoneIndex, msg.sender, amount, block.timestamp);
    }

    /// @notice Disputes a submitted milestone prior to approval.
    /// @param agreementId The agreement id.
    /// @param milestoneIndex The milestone index.
    /// @param reason The dispute reason.
    function disputeMilestone(uint256 agreementId, uint256 milestoneIndex, string calldata reason) external {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.client != msg.sender) {
            revert NotClient();
        }
        if (agreement.state != AgreementState.ACTIVE) {
            revert AgreementNotActive();
        }

        Milestone storage milestone = _getMilestoneStorage(agreement, milestoneIndex);
        if (milestone.state != MilestoneState.SUBMITTED) {
            revert MilestoneNotSubmitted();
        }

        milestone.state = MilestoneState.DISPUTED;
        milestone.disputeReason = reason;

        emit MilestoneDisputed(agreementId, milestoneIndex, msg.sender, reason, block.timestamp);
    }

    /// @notice Resolves a disputed milestone and splits funds between freelancer and client.
    /// @param agreementId The agreement id.
    /// @param milestoneIndex The milestone index.
    /// @param awardToFreelancer Whether to award any amount to the freelancer.
    /// @param freelancerAmount The amount awarded to freelancer (must be <= milestone amount).
    /// @param note The resolver note.
    function resolveDispute(
        uint256 agreementId,
        uint256 milestoneIndex,
        bool awardToFreelancer,
        uint256 freelancerAmount,
        string calldata note
    ) external nonReentrant {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.resolver != msg.sender) {
            revert NotResolver();
        }

        Milestone storage milestone = _getMilestoneStorage(agreement, milestoneIndex);
        if (milestone.state != MilestoneState.DISPUTED) {
            revert MilestoneNotDisputed();
        }
        if (freelancerAmount > milestone.amount) {
            revert InvalidAmount();
        }

        uint256 payoutToFreelancer = awardToFreelancer ? freelancerAmount : 0;
        uint256 clientRefund = milestone.amount - payoutToFreelancer;

        uint256 newTotalPaid = agreement.totalPaid + milestone.amount;
        if (newTotalPaid > agreement.totalAmount) {
            revert AggregatePayout();
        }

        milestone.state = MilestoneState.RESOLVED;
        milestone.resolutionNote = note;
        agreement.totalPaid = newTotalPaid;

        _markAgreementCompletedIfTerminal(agreement);

        if (payoutToFreelancer > 0) {
            pendingWithdrawals[agreement.freelancer][agreement.token] += payoutToFreelancer;
        }
        if (clientRefund > 0) {
            pendingWithdrawals[agreement.client][agreement.token] += clientRefund;
        }

        emit DisputeResolved(
            agreementId,
            milestoneIndex,
            msg.sender,
            awardToFreelancer,
            payoutToFreelancer,
            clientRefund,
            note
        );
    }

    /// @notice Cancels an unfunded agreement.
    /// @param agreementId The agreement id.
    function cancelAgreement(uint256 agreementId) external {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.client != msg.sender) {
            revert NotClient();
        }
        if (agreement.state != AgreementState.PENDING) {
            revert AgreementNotPending();
        }

        agreement.state = AgreementState.CANCELLED;

        emit AgreementCancelled(agreementId, msg.sender);
    }

    /// @notice Aborts an ACTIVE agreement that has had no milestone submissions for at least 30 days since funding.
    /// @param agreementId The agreement id.
    function clientAbortActive(uint256 agreementId) external nonReentrant {
        Agreement storage agreement = _agreements[agreementId];

        if (agreement.client != msg.sender) {
            revert NotClient();
        }
        if (agreement.state != AgreementState.ACTIVE) {
            revert AgreementNotActive();
        }
        if (block.timestamp < agreement.fundedAt + 30 days) {
            revert TooEarlyToAbort();
        }

        uint256 length = agreement.milestones.length;
        for (uint256 i = 0; i < length; i++) {
            Milestone storage milestone = agreement.milestones[i];
            if (milestone.submittedAt != 0 || milestone.state != MilestoneState.PENDING) {
                revert MilestonesAlreadyStarted();
            }
        }

        agreement.state = AgreementState.CANCELLED;

        IERC20(agreement.token).safeTransfer(agreement.client, agreement.totalAmount);

        emit AgreementCancelled(agreementId, msg.sender);
    }

    /// @notice Withdraws available pull-payment balance for a given token.
    /// @param token The token address to withdraw.
    function withdraw(address token) external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender][token];
        if (amount == 0) {
            revert NothingToWithdraw();
        }

        pendingWithdrawals[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Returns a full agreement by id.
    /// @param id The agreement id.
    /// @return agreement The full agreement struct.
    function getAgreement(uint256 id) external view returns (Agreement memory agreement) {
        agreement = _agreements[id];
    }

    /// @notice Returns a full milestone by agreement id and index.
    /// @param id The agreement id.
    /// @param index The milestone index.
    /// @return milestone The full milestone struct.
    function getMilestone(uint256 id, uint256 index) external view returns (Milestone memory milestone) {
        Agreement storage agreement = _agreements[id];
        if (index >= agreement.milestones.length) {
            revert MilestoneIndexOutOfBounds();
        }
        milestone = agreement.milestones[index];
    }

    /// @notice Returns the number of milestones in an agreement.
    /// @param id The agreement id.
    /// @return count The milestone count.
    function getMilestoneCount(uint256 id) external view returns (uint256 count) {
        count = _agreements[id].milestones.length;
    }

    /// @notice Returns all agreement ids created by a client.
    /// @param client The client address.
    /// @return agreementIds The list of agreement ids.
    function getAgreementsByClient(address client) external view returns (uint256[] memory agreementIds) {
        agreementIds = _agreementsByClient[client];
    }

    /// @notice Returns all agreement ids assigned to a freelancer.
    /// @param freelancer The freelancer address.
    /// @return agreementIds The list of agreement ids.
    function getAgreementsByFreelancer(address freelancer) external view returns (uint256[] memory agreementIds) {
        agreementIds = _agreementsByFreelancer[freelancer];
    }

    /// @notice Returns the submission history for a milestone.
    /// @param agreementId The agreement id.
    /// @param milestoneIndex The milestone index.
    /// @return history The ordered submission records.
    function getSubmissionHistory(
        uint256 agreementId,
        uint256 milestoneIndex
    ) external view returns (SubmissionRecord[] memory history) {
        Agreement storage agreement = _agreements[agreementId];
        if (milestoneIndex >= agreement.milestones.length) {
            revert MilestoneIndexOutOfBounds();
        }
        history = _submissionHistory[agreementId][milestoneIndex];
    }

    function _getMilestoneStorage(
        Agreement storage agreement,
        uint256 milestoneIndex
    ) internal view returns (Milestone storage milestone) {
        if (milestoneIndex >= agreement.milestones.length) {
            revert MilestoneIndexOutOfBounds();
        }
        milestone = agreement.milestones[milestoneIndex];
    }

    function _markAgreementCompletedIfTerminal(Agreement storage agreement) internal {
        uint256 length = agreement.milestones.length;
        for (uint256 i = 0; i < length; i++) {
            MilestoneState state = agreement.milestones[i].state;
            if (state != MilestoneState.CLAIMED && state != MilestoneState.RESOLVED) {
                return;
            }
        }

        if (agreement.state != AgreementState.COMPLETED) {
            agreement.state = AgreementState.COMPLETED;
            emit AgreementCompleted(agreement.agreementId);
        }
    }
}
