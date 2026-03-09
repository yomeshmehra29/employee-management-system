// Import bcrypt so passwords can be safely hashed and compared.
const bcrypt = require("bcryptjs");
// Import the database abstraction for admin lookup and creation.
const db = require("../config/db");

// Check whether the supplied email has a basic valid structure.
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Persist the authenticated admin into the session and send a success response.
function saveAdminSession(req, res, admin, message, statusCode = 200) {
  // Store only the fields needed to identify the logged-in admin later.
  req.session.admin = {
    id: admin.id,
    email: admin.email
  };

  // Only store the minimal admin data needed for route protection.
  return req.session.save((error) => {
    if (error) {
      console.error("Session save error:", error);
      return res.status(500).json({ message: "Authentication failed. Please try again." });
    }

    return res.status(statusCode).json({
      message,
      admin: req.session.admin
    });
  });
}

// Handle new admin registration requests.
async function registerAdmin(req, res) {
  // Pull the expected fields from the request body.
  const { email, password, confirmPassword } = req.body;

  // Reject requests that omit the required credentials.
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  // Normalize email input so duplicate accounts differ only by casing are avoided.
  const normalizedEmail = String(email).trim().toLowerCase();

  // Stop early if the email format is invalid.
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  // Enforce a minimum password length for basic account security.
  if (String(password).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters long." });
  }

  // When confirmPassword is provided, require it to match.
  if (
    typeof confirmPassword !== "undefined" &&
    String(password) !== String(confirmPassword)
  ) {
    return res.status(400).json({ message: "Password and confirm password must match." });
  }

  try {
    // Check whether an admin with this email already exists.
    const existingAdmin = await db.findAdminByEmail(normalizedEmail);

    // Return a conflict response instead of creating duplicates.
    if (existingAdmin) {
      return res
        .status(409)
        .json({ message: "An admin account with this email already exists." });
    }

    // Hash the password before storing it in the database.
    const hashedPassword = bcrypt.hashSync(String(password), 10);
    // Create the admin account in storage.
    const createdAdmin = await db.createAdmin(normalizedEmail, hashedPassword);

    // Save the login session immediately after successful registration.
    return saveAdminSession(
      req,
      res,
      createdAdmin,
      "Sign up successful. Redirecting...",
      201
    );
  } catch (error) {
    // Handle uniqueness errors from MongoDB, Postgres, or SQLite.
    if (
      error.code === 11000 ||
      error.code === "23505" ||
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return res
        .status(409)
        .json({ message: "An admin account with this email already exists." });
    }

    // Log unexpected failures and return a generic error response.
    console.error("Register admin error:", error);
    return res.status(500).json({ message: "Unable to create admin account." });
  }
}

// Handle admin login requests.
async function loginAdmin(req, res) {
  // Read credentials from the request body.
  const { email, password } = req.body;

  // Reject empty login submissions.
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  // Normalize the email before querying the database.
  const normalizedEmail = String(email).trim().toLowerCase();

  // Validate the email format before continuing.
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  try {
    // Look up the admin account by email.
    const admin = await db.findAdminByEmail(normalizedEmail);

    // Avoid revealing whether the email or password was wrong.
    if (!admin) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Compare the plain password against the stored hash.
    const passwordMatches = bcrypt.compareSync(String(password), admin.password);

    // Reject invalid credentials.
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Persist the successful login in the session cookie.
    return saveAdminSession(req, res, admin, "Login successful.");
  } catch (error) {
    // Log and mask unexpected server-side issues.
    console.error("Login admin error:", error);
    return res.status(500).json({ message: "Unable to sign in right now." });
  }
}

// Destroy the current admin session and clear the session cookie.
function logoutAdmin(req, res) {
  // If no session exists, treat logout as already complete.
  if (!req.session) {
    return res.json({ message: "Logout successful." });
  }

  // Remove the session from the store.
  return req.session.destroy((error) => {
    // Report session destruction issues.
    if (error) {
      console.error("Session destroy error:", error);
      return res.status(500).json({ message: "Logout failed. Please try again." });
    }

    // Remove the browser cookie after the server-side session is gone.
    res.clearCookie("ems.sid");
    // Confirm logout to the client.
    return res.json({ message: "Logout successful." });
  });
}

// Return the current authentication status for frontend route protection.
function getCurrentAdmin(req, res) {
  // Report an unauthenticated state when the session is missing or empty.
  if (!req.session || !req.session.admin) {
    return res.status(200).json({
      authenticated: false,
      admin: null
    });
  }

  // Return the stored admin data for authenticated requests.
  return res.json({
    authenticated: true,
    admin: req.session.admin
  });
}

// Export each auth controller for route registration.
module.exports = {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getCurrentAdmin
};
