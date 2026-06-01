const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const { verifyToken } = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { sendSuccess, sendError } = require("../utils/response");
const { User } = require("../models");

/**
 * POST /api/auth/register
 * Called after Firebase login to create/sync the user in MongoDB.
 * Frontend must send Firebase token in Authorization header.
 */
router.post(
  "/register",
  verifyToken,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("currency").optional().isLength({ min: 3, max: 3 }).withMessage("Currency must be a 3-letter code like INR"),
  ],
  validate,
  async (req, res) => {
    try {
      const { name, currency } = req.body;
      const { uid, email } = req.user; // From Firebase token

      // Check if user already exists (re-login case)
      let user = await User.findOne({ firebaseUid: uid });

      if (user) {
        return sendSuccess(res, { user, message: "User already exists, logged in." });
      }

      // Create new user in MongoDB
      user = await User.create({
        firebaseUid: uid,
        email,
        name,
        currency: currency || "INR",
      });

      return sendSuccess(res, { user }, 201);
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

/**
 * GET /api/auth/me
 * Returns the current logged-in user's profile.
 */
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) return sendError(res, "User not found.", 404);
    return sendSuccess(res, { user });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
});

/**
 * PATCH /api/auth/me
 * Update user profile — name, currency, income streams, budget rule.
 */
router.patch(
  "/me",
  verifyToken,
  [
    body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
    body("budgetRule.primary").optional().isNumeric().withMessage("Primary % must be a number"),
    body("budgetRule.secondary").optional().isNumeric().withMessage("Secondary % must be a number"),
    body("budgetRule.investment").optional().isNumeric().withMessage("Investment % must be a number"),
  ],
  validate,
  async (req, res) => {
    try {
      const updates = req.body;
      const user = await User.findOneAndUpdate(
        { firebaseUid: req.user.uid },
        { $set: updates },
        { new: true, runValidators: true } // runValidators ensures budgetRule % = 100 check runs
      );
      if (!user) return sendError(res, "User not found.", 404);
      return sendSuccess(res, { user });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }
);

module.exports = router;
