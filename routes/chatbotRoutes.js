// Router for chatbot endpoints.
const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { handleChatbotMessage } = require("../controllers/chatbotController");

const router = express.Router();

// Handle chatbot requests from authenticated users.
router.post("/message", requireAuth, handleChatbotMessage);

module.exports = router;
