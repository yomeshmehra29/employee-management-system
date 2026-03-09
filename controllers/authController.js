const bcrypt = require("bcryptjs");
const db = require("../config/db");

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function saveAdminSession(req, res, admin, message, statusCode = 200) {
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

function registerAdmin(req, res) {
  const { email, password, confirmPassword } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters long." });
  }

  if (
    typeof confirmPassword !== "undefined" &&
    String(password) !== String(confirmPassword)
  ) {
    return res.status(400).json({ message: "Password and confirm password must match." });
  }

  const existingAdmin = db
    .prepare("SELECT id FROM admins WHERE email = ?")
    .get(normalizedEmail);

  if (existingAdmin) {
    return res.status(409).json({ message: "An admin account with this email already exists." });
  }

  const hashedPassword = bcrypt.hashSync(String(password), 10);
  const result = db
    .prepare(`
      INSERT INTO admins (email, password, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .run(normalizedEmail, hashedPassword);

  const createdAdmin = db
    .prepare("SELECT id, email FROM admins WHERE id = ?")
    .get(result.lastInsertRowid);

  return saveAdminSession(req, res, createdAdmin, "Sign up successful. Redirecting...", 201);
}

function loginAdmin(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  const admin = db
    .prepare("SELECT id, email, password FROM admins WHERE email = ?")
    .get(normalizedEmail);

  if (!admin) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const passwordMatches = bcrypt.compareSync(String(password), admin.password);

  if (!passwordMatches) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  return saveAdminSession(req, res, admin, "Login successful.");
}

function logoutAdmin(req, res) {
  if (!req.session) {
    return res.json({ message: "Logout successful." });
  }

  return req.session.destroy((error) => {
    if (error) {
      console.error("Session destroy error:", error);
      return res.status(500).json({ message: "Logout failed. Please try again." });
    }

    res.clearCookie("connect.sid");
    return res.json({ message: "Logout successful." });
  });
}

function getCurrentAdmin(req, res) {
  if (!req.session || !req.session.admin) {
    return res.status(200).json({
      authenticated: false,
      admin: null
    });
  }

  return res.json({
    authenticated: true,
    admin: req.session.admin
  });
}

module.exports = {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getCurrentAdmin
};
