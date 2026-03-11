// Controller for chatbot API requests.
const {
  buildChatbotReply,
  sanitizeMessage,
  sanitizeContext
} = require("../services/chatbotService");

function handleChatbotMessage(req, res) {
  const now = Date.now();
  const lastSentAt = req.session?.chatbotLastSent || 0;

  if (now - lastSentAt < 600) {
    return res.status(429).json({
      reply: "Give me a second to catch up, then try again."
    });
  }

  req.session.chatbotLastSent = now;

  const { message, role, user, context } = req.body || {};
  const cleanMessage = sanitizeMessage(message);

  if (!cleanMessage) {
    return res.status(400).json({
      reply: "Please type a short question so I can help."
    });
  }

  const cleanRole = sanitizeMessage(role || "admin").toLowerCase() || "admin";
  const cleanUser = { name: sanitizeMessage(user?.name || "") };
  const cleanContext = sanitizeContext(context);

  const reply = buildChatbotReply({
    message: cleanMessage,
    role: cleanRole,
    user: cleanUser,
    context: cleanContext
  });

  return res.json({ reply });
}

module.exports = {
  handleChatbotMessage
};
