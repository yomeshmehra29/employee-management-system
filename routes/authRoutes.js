const express = require("express");
const {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getCurrentAdmin
} = require("../controllers/authController");

const router = express.Router();

router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/logout", logoutAdmin);
router.get("/me", getCurrentAdmin);

module.exports = router;
