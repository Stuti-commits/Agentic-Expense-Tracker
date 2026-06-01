const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const { verifyToken } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { sendSuccess, sendError } = require("../utils/response");
const { Goal, User } = require("../models");

router.use(verifyToken);

const getUserId = async (firebaseUid) => {
  const user = await User.findOne({ firebaseUid }).select("_id");
  if (!user) throw new Error("User not found");
  return user._id;
};

/**
 * Helper: calculate how much needs to be saved per month.
 * Formula: (target - current) / months remaining
 */
const calcMonthlyRequired = (targetAmount, currentAmount, deadline) => {
  const now = new Date();
  const monthsLeft =
    (new Date(deadline).getFullYear() - now.getFullYear()) * 12 +
    (new Date(deadline).getMonth() - now.getMonth());
  if (monthsLeft <= 0) return 0;
  return Math.ceil((targetAmount - currentAmount) / monthsLeft);
};

/**
 * GET /api/goals
 * Get all goals for the user. Filter by status optionally.
 */
router.get("/", async (req, res) => {
  try {
    const userId = await getUserId(req.user.uid);
    const filter = { userId };
    if (req.query.status) filter.status = req.query.status;

    const goals = await Goal.find(filter).sort({ deadline: 1 });
    return sendSuccess(res, { goals });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

/**
 * POST /api/goals
 * Create a new savings goal. monthlyRequired is calculated automatically.
 */
router.post(
  "/",
  [
    body("name").trim().notEmpty().withMessage("Goal name is required"),
    body("targetAmount").isFloat({ min: 1 }).withMessage("Target amount must be greater than 0"),
    body("deadline").isISO8601().withMessage("Deadline must be a valid date"),
    body("currentAmount").optional().isFloat({ min: 0 }),
    body("linkedInvestmentType")
      .optional()
      .isIn(["mutual_fund", "sip", "stocks", "etf", "fd", "savings", "mixed"]),
  ],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const { targetAmount, currentAmount = 0, deadline } = req.body;

      const monthlyRequired = calcMonthlyRequired(targetAmount, currentAmount, deadline);

      const goal = await Goal.create({
        ...req.body,
        userId,
        currentAmount,
        monthlyRequired,
      });

      return sendSuccess(res, { goal }, 201);
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * GET /api/goals/:id
 */
router.get(
  "/:id",
  [param("id").isMongoId().withMessage("Invalid goal ID")],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const goal = await Goal.findOne({ _id: req.params.id, userId });
      if (!goal) return sendError(res, "Goal not found", 404);
      return sendSuccess(res, { goal });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * PATCH /api/goals/:id
 * Update goal — also recalculates monthlyRequired if amounts or deadline change.
 */
router.patch(
  "/:id",
  [
    param("id").isMongoId().withMessage("Invalid goal ID"),
    body("targetAmount").optional().isFloat({ min: 1 }),
    body("currentAmount").optional().isFloat({ min: 0 }),
    body("deadline").optional().isISO8601(),
    body("status").optional().isIn(["active", "completed", "paused"]),
  ],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const existing = await Goal.findOne({ _id: req.params.id, userId });
      if (!existing) return sendError(res, "Goal not found", 404);

      // Use updated values or fall back to existing ones
      const targetAmount = req.body.targetAmount ?? existing.targetAmount;
      const currentAmount = req.body.currentAmount ?? existing.currentAmount;
      const deadline = req.body.deadline ?? existing.deadline;

      const monthlyRequired = calcMonthlyRequired(targetAmount, currentAmount, deadline);

      const goal = await Goal.findOneAndUpdate(
        { _id: req.params.id, userId },
        { $set: { ...req.body, monthlyRequired } },
        { new: true, runValidators: true }
      );

      return sendSuccess(res, { goal });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * DELETE /api/goals/:id
 */
router.delete(
  "/:id",
  [param("id").isMongoId().withMessage("Invalid goal ID")],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const goal = await Goal.findOneAndDelete({ _id: req.params.id, userId });
      if (!goal) return sendError(res, "Goal not found", 404);
      return sendSuccess(res, { message: "Goal deleted" });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

module.exports = router;
