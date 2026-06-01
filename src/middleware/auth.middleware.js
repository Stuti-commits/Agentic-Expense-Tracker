const admin = require("firebase-admin");
const { sendError } = require("../utils/response");

/**
 * Firebase JWT verification middleware.
 *
 * How it works:
 * 1. Frontend logs in via Firebase (Google/Email)
 * 2. Firebase gives the frontend a token (a long string)
 * 3. Frontend sends that token in every request header: Authorization: Bearer <token>
 * 4. This middleware verifies the token is real and not expired
 * 5. If valid, it attaches the decoded user info to req.user
 * 6. Every protected route then has access to req.user.uid
 */

// Initialize Firebase Admin SDK once
// Make sure FIREBASE_SERVICE_ACCOUNT_KEY is set in your .env
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check header exists and starts with "Bearer "
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, "No token provided. Please log in.", 401);
  }

  const token = authHeader.split(" ")[1]; // Extract the token part

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded; // { uid, email, name, ... }
    next(); // Move to the actual route handler
  } catch (err) {
    return sendError(res, "Invalid or expired token. Please log in again.", 401);
  }
};

module.exports = { verifyToken };
