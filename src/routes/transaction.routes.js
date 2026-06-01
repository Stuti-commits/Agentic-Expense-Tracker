const express = require("express");
const router = express.Router();
const { body, query, param } = require("express-validator");
const { verifyToken } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { sendSuccess, sendError } = require("../utils/response");
const { Transaction, User, Budget } = require("../models");

// All transaction routes require login
router.use(verifyToken);

// ── Helper: get MongoDB userId from Firebase UID ────────
const getUserId = async (firebaseUid) => {
  const user = await User.findOne({ firebaseUid }).select("_id");
  if (!user) throw new Error("User not found");
  return user._id;
};

/**
 * GET /api/transactions
 * Fetch transactions with optional filters.
 * Query params: startDate, endDate, category, source, isConfirmed, page, limit
 *
 * Example: GET /api/transactions?category=primary&startDate=2025-01-01&page=1&limit=20
 */
router.get(
  "/",
  [
    query("startDate").optional().isISO8601().withMessage("startDate must be a valid date (YYYY-MM-DD)"),
    query("endDate").optional().isISO8601().withMessage("endDate must be a valid date (YYYY-MM-DD)"),
    query("category").optional().isIn(["primary", "secondary", "investment", "income", "uncategorized"]),
    query("source").optional().isIn(["manual", "pdf_import", "auto"]),
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive number"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
  ],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const { startDate, endDate, category, source, isConfirmed, page = 1, limit = 20 } = req.query;

      // Build the filter object dynamically
      const filter = { userId };
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) filter.date.$gte = new Date(startDate);
        if (endDate) filter.date.$lte = new Date(endDate);
      }
      if (category) filter.category = category;
      if (source) filter.source = source;
      if (isConfirmed !== undefined) filter.isConfirmed = isConfirmed === "true";

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [transactions, total] = await Promise.all([
        Transaction.find(filter).sort({ date: -1 }).skip(skip).limit(parseInt(limit)),
        Transaction.countDocuments(filter),
      ]);

      return sendSuccess(res, {
        transactions,
        pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
      });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * POST /api/transactions
 * Create a single transaction manually.
 */
router.post(
  "/",
  [
    body("amount").isFloat({ min: 0.01 }).withMessage("Amount must be greater than 0"),
    body("type").isIn(["debit", "credit"]).withMessage("Type must be debit or credit"),
    body("date").isISO8601().withMessage("Date must be valid (YYYY-MM-DD)"),
    body("description").trim().notEmpty().withMessage("Description is required"),
    body("category").optional().isIn(["primary", "secondary", "investment", "income", "uncategorized"]),
    body("subcategory").optional().trim().isLength({ max: 50 }),
    body("familyVisible").optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const transaction = await Transaction.create({
        ...req.body,
        userId,
        source: "manual",
        isConfirmed: true, // Manual entries are confirmed by default
      });
      return sendSuccess(res, { transaction }, 201);
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * GET /api/transactions/:id
 * Get a single transaction by ID.
 */
router.get(
  "/:id",
  [param("id").isMongoId().withMessage("Invalid transaction ID")],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const transaction = await Transaction.findOne({ _id: req.params.id, userId });
      if (!transaction) return sendError(res, "Transaction not found", 404);
      return sendSuccess(res, { transaction });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * PATCH /api/transactions/:id
 * Update a transaction. Commonly used to confirm auto-classified ones.
 */
router.patch(
  "/:id",
  [
    param("id").isMongoId().withMessage("Invalid transaction ID"),
    body("amount").optional().isFloat({ min: 0.01 }),
    body("category").optional().isIn(["primary", "secondary", "investment", "income", "uncategorized"]),
    body("isConfirmed").optional().isBoolean(),
    body("familyVisible").optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const transaction = await Transaction.findOneAndUpdate(
        { _id: req.params.id, userId },
        { $set: req.body },
        { new: true, runValidators: true }
      );
      if (!transaction) return sendError(res, "Transaction not found", 404);
      return sendSuccess(res, { transaction });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * DELETE /api/transactions/:id
 */
router.delete(
  "/:id",
  [param("id").isMongoId().withMessage("Invalid transaction ID")],
  validate,
  async (req, res) => {
    try {
      const userId = await getUserId(req.user.uid);
      const transaction = await Transaction.findOneAndDelete({ _id: req.params.id, userId });
      if (!transaction) return sendError(res, "Transaction not found", 404);
      return sendSuccess(res, { message: "Transaction deleted" });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * POST /api/transactions/bulk-confirm
 * Confirm multiple PDF-imported or auto-classified transactions at once.
 * Body: { ids: ["id1", "id2", ...] }
 */
router.post("/bulk-confirm", async (req, res) => {
  try {
    const userId = await getUserId(req.user.uid);
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "ids must be a non-empty array");
    }

    const result = await Transaction.updateMany(
      { _id: { $in: ids }, userId },
      { $set: { isConfirmed: true } }
    );

    return sendSuccess(res, { confirmedCount: result.modifiedCount });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

module.exports = router;
