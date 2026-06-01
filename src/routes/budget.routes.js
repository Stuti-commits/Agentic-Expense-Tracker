const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { verifyToken } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { sendSuccess, sendError } = require("../utils/response");
const { Budget, User, Transaction } = require("../models");

router.use(verifyToken);

const getUserId = async (firebaseUid) => {
  const user = await User.findOne({ firebaseUid }).select("_id budgetRule incomeStreams");
  if (!user) throw new Error("User not found");
  return user;
};

/**
 * GET /api/budgets/current
 * Returns this month's budget status.
 * Creates the budget document automatically if it doesn't exist yet.
 */
router.get("/current", async (req, res) => {
  try {
    const user = await getUserId(req.user.uid);
    const now = new Date();
    const month = now.getMonth() + 1; // JS months are 0-indexed
    const year = now.getFullYear();

    // Calculate total income from all active streams
    const totalIncome = user.incomeStreams
      .filter((s) => s.isActive)
      .reduce((sum, s) => sum + s.amount, 0);

    // Try to find existing budget, or create a new one
    let budget = await Budget.findOne({ userId: user._id, month, year });

    if (!budget) {
      const rule = user.budgetRule;
      budget = await Budget.create({
        userId: user._id,
        month,
        year,
        totalIncome,
        primaryAllocated: (totalIncome * rule.primary) / 100,
        secondaryAllocated: (totalIncome * rule.secondary) / 100,
        investmentAllocated: (totalIncome * rule.investment) / 100,
      });
    }

    // Calculate spent amounts from actual transactions this month
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const spentByGroup = await Transaction.aggregate([
      {
        $match: {
          userId: user._id,
          date: { $gte: startOfMonth, $lte: endOfMonth },
          type: "debit",
          isConfirmed: true,
        },
      },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
        },
      },
    ]);

    // Map aggregation results onto budget
    const spentMap = {};
    spentByGroup.forEach((g) => { spentMap[g._id] = g.total; });

    budget.primarySpent = spentMap["primary"] || 0;
    budget.secondarySpent = spentMap["secondary"] || 0;
    budget.investmentSpent = spentMap["investment"] || 0;
    await budget.save();

    // Build alert list for categories over 90% of allocation
    const alerts = [];
    const groups = [
      { name: "primary", allocated: budget.primaryAllocated, spent: budget.primarySpent },
      { name: "secondary", allocated: budget.secondaryAllocated, spent: budget.secondarySpent },
      { name: "investment", allocated: budget.investmentAllocated, spent: budget.investmentSpent },
    ];

    groups.forEach(({ name, allocated, spent }) => {
      const percent = allocated > 0 ? (spent / allocated) * 100 : 0;
      if (percent >= 100) {
        alerts.push({ type: "danger", category: name, overshootAmount: spent - allocated });
      } else if (percent >= 90) {
        alerts.push({ type: "warning", category: name, percentUsed: Math.round(percent) });
      }
    });

    return sendSuccess(res, { budget, alerts });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

/**
 * GET /api/budgets/history?months=6
 * Last N months of budget summaries for the chart.
 */
router.get("/history", async (req, res) => {
  try {
    const user = await getUserId(req.user.uid);
    const months = parseInt(req.query.months) || 6;

    const budgets = await Budget.find({ userId: user._id })
      .sort({ year: -1, month: -1 })
      .limit(months);

    return sendSuccess(res, { budgets });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

/**
 * PATCH /api/budgets/rules
 * Update the user's budget rule (50/30/20 or custom).
 * This recalculates the current month's allocations immediately.
 */
router.patch(
  "/rules",
  [
    body("type").isIn(["50/30/20", "custom"]).withMessage("Type must be 50/30/20 or custom"),
    body("primary").isFloat({ min: 0, max: 100 }).withMessage("Primary % must be 0-100"),
    body("secondary").isFloat({ min: 0, max: 100 }).withMessage("Secondary % must be 0-100"),
    body("investment").isFloat({ min: 0, max: 100 }).withMessage("Investment % must be 0-100"),
  ],
  validate,
  async (req, res) => {
    try {
      const { type, primary, secondary, investment } = req.body;

      if (primary + secondary + investment !== 100) {
        return sendError(res, "primary + secondary + investment must equal 100");
      }

      const user = await User.findOneAndUpdate(
        { firebaseUid: req.user.uid },
        { $set: { budgetRule: { type, primary, secondary, investment } } },
        { new: true }
      );

      return sendSuccess(res, { budgetRule: user.budgetRule, message: "Budget rule updated" });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

module.exports = router;
