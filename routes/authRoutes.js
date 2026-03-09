// Import Express so a modular router can be created for auth endpoints.
const express = require("express");
// Import the auth controller functions used by each route.
const {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getCurrentAdmin
} = require("../controllers/authController");

// Create a dedicated router instance for authentication APIs.
const router = express.Router();

// Register a new admin account.
router.post("/register", registerAdmin);
// Log an admin into the current session.
router.post("/login", loginAdmin);
// Log the current admin out and destroy the session.
router.post("/logout", logoutAdmin);
// Return the current authentication state for frontend checks.
router.get("/me", getCurrentAdmin);

// Export the router so server.js can mount it under /api/auth.
module.exports = router;
