// Basic chatbot behavior for the Employee Management System dashboard.
(() => {
  const panel = document.getElementById("chatbotPanel");
  const toggle = document.getElementById("chatbotToggle");
  const closeButton = document.getElementById("chatbotClose");
  const clearButton = document.getElementById("chatbotClear");
  const messages = document.getElementById("chatbotMessages");
  const suggestions = document.getElementById("chatbotSuggestions");
  const form = document.getElementById("chatbotForm");
  const input = document.getElementById("chatbotInput");

  if (!panel || !toggle || !messages || !form || !input) {
    return;
  }

  const STORAGE_KEY = "ems_chatbot_messages";
  const MAX_HISTORY = 20;
  const SEND_COOLDOWN_MS = 700;
  let lastSentAt = 0;
  let userContext = {
    role: "admin",
    name: "",
    route: window.location.pathname || "/",
    pageName: "Dashboard"
  };

  function sanitizeText(value) {
    return String(value || "")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatName(rawName) {
    if (!rawName) {
      return "";
    }

    const trimmed = rawName.split("@")[0].replace(/[^a-zA-Z0-9]+/g, " ").trim();
    if (!trimmed) {
      return "";
    }

    return trimmed
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  async function loadUserContext() {
    try {
      const response = await fetch("/api/auth/me");
      const result = await response.json();

      if (result && result.authenticated && result.admin) {
        userContext = {
          role: "admin",
          name: formatName(result.admin.email),
          route: window.location.pathname || "/",
          pageName: "Dashboard"
        };
      }
    } catch (error) {
      console.error("Chatbot auth context failed:", error);
    }
  }

  function saveHistory(history) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  }

  function readHistory() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function renderMessage(message) {
    const bubble = document.createElement("div");
    bubble.className = `chatbot-message ${message.sender}`;
    bubble.textContent = message.text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  function renderTypingIndicator() {
    const bubble = document.createElement("div");
    bubble.className = "chatbot-message bot typing";
    bubble.dataset.typing = "true";
    bubble.innerHTML =
      '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTypingIndicator() {
    const typingBubble = messages.querySelector("[data-typing='true']");
    if (typingBubble) {
      typingBubble.remove();
    }
  }

  function addMessage(sender, text) {
    const cleanText = sanitizeText(text);
    if (!cleanText) {
      return;
    }

    const message = { sender, text: cleanText, timestamp: Date.now() };
    renderMessage(message);

    const history = readHistory();
    history.push(message);
    saveHistory(history);
  }

  function showWelcomeMessage() {
    const greetingName = userContext.name ? `${userContext.name}, ` : "";
    const welcome = `Hi ${greetingName}I’m your EMS Assistant. I can help with employees, attendance, leave, payroll, dashboard navigation, and common system questions.`;
    addMessage("bot", welcome);
  }

  function restoreHistory() {
    const history = readHistory();
    if (history.length === 0) {
      showWelcomeMessage();
      return;
    }

    history.forEach((message) => renderMessage(message));
  }

  function togglePanel(open) {
    const shouldOpen = typeof open === "boolean" ? open : !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", shouldOpen);
    toggle.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) {
      input.focus();
    }
  }

  async function sendMessage(text) {
    const now = Date.now();
    if (now - lastSentAt < SEND_COOLDOWN_MS) {
      addMessage("bot", "Give me a second to catch up, then ask again.");
      return;
    }

    lastSentAt = now;
    addMessage("user", text);
    renderTypingIndicator();

    try {
      const response = await fetch("/api/chatbot/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          role: userContext.role,
          user: { name: userContext.name },
          context: {
            route: userContext.route,
            pageName: userContext.pageName,
            menuItems: ["Dashboard", "Employees", "Search", "Filters", "Add Employee"]
          }
        })
      });

      const result = await response.json();
      removeTypingIndicator();

      if (!response.ok) {
        addMessage("bot", result.reply || "I hit a snag. Please try again.");
        return;
      }

      addMessage("bot", result.reply);
    } catch (error) {
      console.error("Chatbot request failed:", error);
      removeTypingIndicator();
      addMessage("bot", "I could not reach the server. Please try again.");
    }
  }

  toggle.addEventListener("click", () => togglePanel());
  closeButton.addEventListener("click", () => togglePanel(false));
  clearButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    messages.innerHTML = "";
    showWelcomeMessage();
  });

  if (suggestions) {
    suggestions.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-message]");
      if (!chip) {
        return;
      }

      const message = chip.dataset.message;
      if (message) {
        sendMessage(message);
      }
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = sanitizeText(input.value);
    if (!value) {
      return;
    }

    input.value = "";
    sendMessage(value);
  });

  loadUserContext().finally(() => {
    restoreHistory();
  });
})();
