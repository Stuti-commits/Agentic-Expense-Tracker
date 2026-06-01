const mongoose = require("mongoose");

/**
 * @typedef {Object} FamilyLink
 * @property {mongoose.Types.ObjectId} inviterUserId - User who sent the invite
 * @property {mongoose.Types.ObjectId} inviteeUserId - User who was invited
 * @property {'pending'|'active'|'revoked'} status - Current link state
 * @property {'summary_only'|'categories_only'|'full'} scope - What invitee allows inviter to see
 * @property {string} inviteToken - One-time token sent via email to accept the invite
 * @property {Date} [acceptedAt] - When the invite was accepted
 * @property {string} [label] - Optional label for the relationship (e.g. "Spouse", "Father")
 *
 * PRIVACY RULES (enforced at service layer):
 * - summary_only: inviter sees only total spent, total saved this month — no categories, no descriptions
 * - categories_only: inviter sees category group totals (primary/secondary/investment) — no individual transactions
 * - full: inviter sees all transactions where familyVisible = true — never sees familyVisible = false transactions
 */
const FamilyLinkSchema = new mongoose.Schema(
  {
    inviterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Inviter user ID is required"],
      index: true,
    },
    inviteeUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null until invite is accepted
      index: true,
    },
    inviteEmail: {
      // Stores the email the invite was sent to (before invitee has an account)
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "revoked"],
      default: "pending",
      index: true,
    },
    /**
     * Scope is set by the INVITEE when they accept — not by the inviter.
     * The invitee controls what they share.
     */
    scope: {
      type: String,
      enum: ["summary_only", "categories_only", "full"],
      default: "summary_only",
    },
    inviteToken: {
      type: String,
      required: true,
      unique: true,
      select: false, // Never returned in API responses
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    label: {
      type: String,
      trim: true,
      maxlength: [30, "Label cannot exceed 30 characters"],
      // e.g. "Spouse", "Father", "Mother", "Partner"
    },
  },
  { timestamps: true }
);

// Prevent duplicate active links between the same two users
FamilyLinkSchema.index(
  { inviterUserId: 1, inviteEmail: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["pending", "active"] } } }
);

// Quick lookup: all active links for a given user (as either inviter or invitee)
FamilyLinkSchema.index({ inviteeUserId: 1, status: 1 });

module.exports = mongoose.model("FamilyLink", FamilyLinkSchema);
