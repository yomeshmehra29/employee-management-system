// Intent detection and response generation for the EMS assistant.

function sanitizeMessage(value) {
  if (!value) {
    return "";
  }

  return String(value)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function sanitizeContext(context) {
  if (!context || typeof context !== "object") {
    return {};
  }

  return {
    route: sanitizeMessage(context.route || ""),
    pageName: sanitizeMessage(context.pageName || ""),
    menuItems: Array.isArray(context.menuItems)
      ? context.menuItems.map((item) => sanitizeMessage(item)).filter(Boolean)
      : []
  };
}

function keywordMatch(message, keywords) {
  const text = message.toLowerCase();
  return keywords.some((keyword) => {
    if (keyword.includes(" ")) {
      return text.includes(keyword);
    }

    return new RegExp(`\\b${keyword}\\b`, "i").test(text);
  });
}

function detectIntent(message) {
  const intents = [
    {
      name: "greeting",
      keywords: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"]
    },
    {
      name: "leave",
      keywords: ["leave", "time off", "vacation", "pto", "sick"]
    },
    {
      name: "attendance",
      keywords: ["attendance", "check in", "check-in", "check out", "clock in", "clock out", "timesheet"]
    },
    {
      name: "payroll",
      keywords: ["payroll", "salary", "payslip", "pay stub", "compensation"]
    },
    {
      name: "employee_management",
      keywords: ["add employee", "new employee", "edit employee", "update employee", "delete employee", "employee"]
    },
    {
      name: "search",
      keywords: ["search", "filter", "department", "find employee"]
    },
    {
      name: "dashboard",
      keywords: ["dashboard", "navigate", "where", "menu", "page", "section"]
    },
    {
      name: "profile",
      keywords: ["profile", "account", "password", "settings", "update profile"]
    },
    {
      name: "reports",
      keywords: ["report", "reports", "analytics", "help", "support"]
    },
    {
      name: "contact",
      keywords: ["contact", "hr", "admin", "manager", "support"]
    }
  ];

  for (const intent of intents) {
    if (keywordMatch(message, intent.keywords)) {
      return intent.name;
    }
  }

  return "fallback";
}

function formatName(name) {
  if (!name) {
    return "";
  }

  const trimmed = name.split("@")[0].replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildChatbotReply({ message, role, user, context }) {
  const intent = detectIntent(message);
  const isAdmin = role === "admin" || role === "manager";
  const name = formatName(user?.name || "");
  const pageName = context?.pageName || "Dashboard";

  const greetingName = name ? `${name}, ` : "";
  const scopeNotice =
    "This EMS build focuses on employee records, search, filters, and admin actions.";

  if (intent === "greeting") {
    return `Hi ${greetingName}I’m your EMS Assistant. Ask me about employees, navigation, or dashboard actions.`;
  }

  if (intent === "employee_management") {
    if (isAdmin) {
      return "To manage employees, use the Add Employee button on the dashboard. Use the row Actions to edit or delete records.";
    }

    return "Employee self-service is limited here. For updates, contact your admin or HR team.";
  }

  if (intent === "search") {
    return "Use the Search box and Department filter above the table, then adjust Rows per page to browse results.";
  }

  if (intent === "dashboard") {
    return `You are on the ${pageName} page. Use the Employees table to review records, and the Add Employee button for new entries.`;
  }

  if (intent === "leave") {
    return isAdmin
      ? `Leave approvals are not in this EMS build yet. ${scopeNotice}`
      : "Leave requests are handled outside this EMS build. Contact HR for the correct process.";
  }

  if (intent === "attendance") {
    return isAdmin
      ? `Attendance tracking is not available in this EMS build. ${scopeNotice}`
      : "Attendance details are not available here yet. Contact your manager or HR.";
  }

  if (intent === "payroll") {
    return isAdmin
      ? "Payroll views are not part of this EMS build yet. Use your payroll system or HR tool for salary details."
      : "Payroll access is not available here. Contact HR or payroll support for your payslip.";
  }

  if (intent === "profile") {
    return isAdmin
      ? "Admin profile updates are not exposed in the UI. Use a new admin account if needed."
      : "Profile updates are not available here. Contact HR for account changes.";
  }

  if (intent === "reports") {
    return isAdmin
      ? "Reports and analytics are not built in. You can use search, filters, and the employee list for quick insights."
      : "Reports are not available in this EMS view. Ask your admin for reporting access.";
  }

  if (intent === "contact") {
    return isAdmin
      ? "Need support? Share the issue with your engineering or HR admin team."
      : "For help, contact your manager or HR team for the correct channel.";
  }

  return "I can help with employee records, search, filters, and dashboard navigation. Ask me about adding, editing, or finding employees.";
}

module.exports = {
  sanitizeMessage,
  sanitizeContext,
  buildChatbotReply
};
