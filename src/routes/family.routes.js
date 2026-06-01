const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const crypto = require("crypto");
const { verifyToken } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { sendSuccess, sendError } = require("../utils/response");
const { FamilyLink, User, Transaction, Budget } = require("../models");

router.use(verifyToken);

const getUser = async (firebaseUid) => {
  const user = await User.findOne({ firebaseUid });
  if (!user) throw new Error("User not found");
  return user;
};

/**
 * POST /api/family/invite
 * Send a family link invite to another user by email.
 */
router.post(
  "/invite",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("label").optional().trim().isLength({ max: 30 }),
  ],
  validate,
  async (req, res) => {
    try {
      const inviter = await getUser(req.user.uid);
      const { email, label } = req.body;

      if (email === inviter.email) {
        return sendError(res, "You cannot invite yourself");
      }

      // Check if an active/pending invite already exists
      const existing = await FamilyLink.findOne({
        inviterUserId: inviter._id,
        inviteEmail: email,
        status: { $in: ["pending", "active"] },
      });

      if (existing) {
        return sendError(res, "An invite to this email already exists");
      }

      const inviteToken = crypto.randomBytes(32).toString("hex");

      const link = await FamilyLink.create({
        inviterUserId: inviter._id,
        inviteEmail: email,
        label,
        inviteToken,
        status: "pending",
      });

      // In production: send email with invite link containing the token
      // For now we return the token so you can test it directly
      return sendSuccess(
        res,
        {
          message: `Invite sent to ${email}`,
          inviteToken, // Remove this in production — send via email only
          linkId: link._id,
        },
        201
      );
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * POST /api/family/accept/:token
 * Invitee accepts the invite and sets their preferred scope.
 * scope controls what the inviter can see about the invitee.
 */
router.post(
  "/accept/:token",
  [
    param("token").notEmpty().withMessage("Token is required"),
    body("scope")
      .isIn(["summary_only", "categories_only", "full"])
      .withMessage("scope must be summary_only, categories_only, or full"),
  ],
  validate,
  async (req, res) => {
    try {
      const invitee = await getUser(req.user.uid);

      // Find the invite by token (select: false field, must explicitly select it)
      const link = await FamilyLink.findOne({ inviteToken: req.params.token }).select(
        "+inviteToken"
      );

      if (!link) return sendError(res, "Invalid or expired invite token", 404);
      if (link.status !== "pending") return sendError(res, "This invite has already been used");
      if (link.inviteEmail !== invitee.email) {
        return sendError(res, "This invite was not sent to your email");
      }

      link.inviteeUserId = invitee._id;
      link.status = "active";
      link.scope = req.body.scope; // Invitee chooses what to share
      link.acceptedAt = new Date();
      await link.save();

      return sendSuccess(res, { message: "Family link activated", scope: link.scope });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * GET /api/family/members
 * Get all people linked to the current user (both as inviter and invitee).
 */
router.get("/members", async (req, res) => {
  try {
    const user = await getUser(req.user.uid);

    const links = await FamilyLink.find({
      $or: [{ inviterUserId: user._id }, { inviteeUserId: user._id }],
      status: "active",
    }).populate("inviterUserId inviteeUserId", "name email");

    return sendSuccess(res, { links });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

/**
 * GET /api/family/dashboard/:memberId
 * Get a linked member's financial data — ONLY what their scope allows.
 *
 * PRIVACY ENFORCED HERE:
 * - summary_only   → total spent + total saved this month only
 * - categories_only → spending per category group (no transaction details)
 * - full           → individual transactions where familyVisible = true
 */
router.get("/dashboard/:memberId", async (req, res) => {
  try {
    const viewer = await getUser(req.user.uid);

    // Verify an active link exists and viewer is allowed to see this member
    const link = await FamilyLink.findOne({
      inviterUserId: viewer._id,
      inviteeUserId: req.params.memberId,
      status: "active",
    });

    if (!link) return sendError(res, "No active family link with this member", 403);

    const memberId = link.inviteeUserId;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // ── summary_only: just totals ──
    if (link.scope === "summary_only") {
      const result = await Transaction.aggregate([
        { $match: { userId: memberId, date: { $gte: startOfMonth, $lte: endOfMonth }, type: "debit", isConfirmed: true } },
        { $group: { _id: null, totalSpent: { $sum: "$amount" } } },
      ]);
      const totalSpent = result[0]?.totalSpent || 0;
      const budget = await Budget.findOne({ userId: memberId, month: now.getMonth() + 1, year: now.getFullYear() });
      return sendSuccess(res, {
        scope: "summary_only",
        totalSpent,
        totalIncome: budget?.totalIncome || 0,
        totalSaved: (budget?.totalIncome || 0) - totalSpent,
      });
    }

    // ── categories_only: group totals ──
    if (link.scope === "categories_only") {
      const result = await Transaction.aggregate([
        { $match: { userId: memberId, date: { $gte: startOfMonth, $lte: endOfMonth }, type: "debit", isConfirmed: true } },
        { $group: { _id: "$category", total: { $sum: "$amount" } } },
      ]);
      return sendSuccess(res, { scope: "categories_only", categoryTotals: result });
    }

    // ── full: individual transactions (familyVisible = true only) ──
    if (link.scope === "full") {
      const transactions = await Transaction.find({
        userId: memberId,
        date: { $gte: startOfMonth, $lte: endOfMonth },
        familyVisible: true,
        isConfirmed: true,
      }).sort({ date: -1 });
      return sendSuccess(res, { scope: "full", transactions });
    }
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

/**
 * PATCH /api/family/scope
 * Invitee updates what they share with a specific inviter.
 */
router.patch(
  "/scope",
  [
    body("linkId").isMongoId().withMessage("Valid linkId is required"),
    body("scope").isIn(["summary_only", "categories_only", "full"]),
  ],
  validate,
  async (req, res) => {
    try {
      const invitee = await getUser(req.user.uid);
      const link = await FamilyLink.findOneAndUpdate(
        { _id: req.body.linkId, inviteeUserId: invitee._id, status: "active" },
        { $set: { scope: req.body.scope } },
        { new: true }
      );
      if (!link) return sendError(res, "Link not found or you are not the invitee", 404);
      return sendSuccess(res, { message: "Scope updated", scope: link.scope });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * DELETE /api/family/:linkId
 * Revoke a family link. Either party can revoke.
 */
router.delete("/:linkId", async (req, res) => {
  try {
    const user = await getUser(req.user.uid);
    const link = await FamilyLink.findOneAndUpdate(
      {
        _id: req.params.linkId,
        $or: [{ inviterUserId: user._id }, { inviteeUserId: user._id }],
        status: "active",
      },
      { $set: { status: "revoked" } },
      { new: true }
    );
    if (!link) return sendError(res, "Link not found", 404);
    return sendSuccess(res, { message: "Family link revoked" });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

module.exports = router;
