// Import the web framework used to create the HTTP server and routes.
const express = require("express");
// Import session support so login state can be stored between requests.
const session = require("express-session");
// Import dotenv so local environment variables can be loaded from .env.local.
const dotenv = require("dotenv");
// Import path helpers for building safe cross-platform file paths.
const path = require("path");
// Import OS utilities so the server can print reachable network URLs.
const os = require("os");

// Load local environment variables before reading configuration or requiring the database layer.
dotenv.config({ path: path.join(__dirname, ".env.local") });

// Import the database layer, which also initializes the schema and default admin.
const db = require("./config/db");

// Import authentication-related API routes.
const authRoutes = require("./routes/authRoutes");
// Import employee CRUD API routes.
const employeeRoutes = require("./routes/employeeRoutes");
// Import chatbot API routes.
const chatbotRoutes = require("./routes/chatbotRoutes");

// Create the Express application instance.
const app = express();
// Use the hosting platform port when available, otherwise default to 3000 locally.
const PORT = Number(process.env.PORT) || 3000;
// Listen on all interfaces so the app works in local networks and on hosts like Render.
const HOST = "0.0.0.0";
// Detect production mode to tighten cookie security settings.
const isProduction = process.env.NODE_ENV === "production";

// Hide the Express signature header as a small security hardening step.
app.disable("x-powered-by");
// Trust the first proxy so secure cookies and client IPs work behind deployment proxies.
app.set("trust proxy", 1);
// Parse incoming JSON request bodies.
app.use(express.json());
// Parse traditional HTML form submissions.
app.use(express.urlencoded({ extended: true }));
// Register session middleware before protected routes so auth data is available on req.session.
app.use(
  session({
    // Use a custom cookie name instead of the default connect.sid.
    name: "ems.sid",
    // Sign the session cookie with an environment secret in production.
    secret: process.env.SESSION_SECRET || "employee-management-system-secret",
    // Avoid saving sessions when nothing changed.
    resave: false,
    // Do not create empty sessions for anonymous visitors.
    saveUninitialized: false,
    // Respect reverse proxy headers when setting secure cookies.
    proxy: true,
    cookie: {
      // Prevent JavaScript in the browser from reading the session cookie.
      httpOnly: true,
      // Only send the cookie over HTTPS in production.
      secure: isProduction,
      // Allow normal top-level navigation while still reducing CSRF risk.
      sameSite: "lax",
      // Keep the session alive for eight hours.
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

// Mount authentication APIs under /api/auth.
app.use("/api/auth", authRoutes);
// Mount employee management APIs under /api/employees.
app.use("/api/employees", employeeRoutes);
// Mount chatbot APIs under /api/chatbot.
app.use("/api/chatbot", chatbotRoutes);
// Serve static frontend files from the public directory.
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Send authenticated users to the dashboard and unauthenticated users to login.
app.get("/", (req, res) => {
  // Redirect if no logged-in admin session exists.
  if (!req.session || !req.session.admin) {
    return res.redirect("/login");
  }

  // Serve the main dashboard page after auth succeeds.
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Show the login page unless the admin is already signed in.
app.get("/login", (req, res) => {
  // Skip the login screen for already authenticated admins.
  if (req.session && req.session.admin) {
    return res.redirect("/");
  }

  // Serve the login/signup page.
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Expose a simple health endpoint for deployments and monitoring.
app.get("/api/health", (req, res) => {
  // Report the app status and which database client is active.
  res.json({ status: "ok", database: db.client });
});

// Return a JSON 404 for unknown API routes.
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found." });
});

// Catch unexpected errors that bubble up through Express.
app.use((err, req, res, next) => {
  // Log the real error for debugging on the server.
  console.error("Unexpected server error:", err);
  // Return a generic message so internal details are not exposed to clients.
  res.status(500).json({ message: "Something went wrong on the server." });
});

// Build a list of local network URLs so the server can advertise reachable addresses.
function getNetworkUrls(port) {
  // Read all network interfaces from the operating system.
  const interfaces = os.networkInterfaces();
  // Collect URLs here before returning them.
  const urls = [];

  // Loop through every network interface object.
  Object.values(interfaces).forEach((networkInterface) => {
    // Skip empty interface entries.
    if (!networkInterface) {
      return;
    }

    // Inspect each IP address attached to the current interface.
    networkInterface.forEach((address) => {
      // Only expose non-internal IPv4 addresses for easy LAN access.
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    });
  });

  return urls;
}

// Initialize storage first, then begin accepting requests.
async function startServer() {
  try {
    // Ensure the database schema exists and the default admin is seeded.
    await db.initializeDatabase();
  } catch (error) {
    // Exit immediately if the app cannot reach or prepare the database.
    console.error("Database initialization failed:", error);
    process.exit(1);
  }

  // Start the HTTP server after startup checks succeed.
  app.listen(PORT, HOST, () => {
    // Compute network URLs for the startup log message.
    const networkUrls = getNetworkUrls(PORT);
    // Always include the localhost URL in the startup log.
    const localUrl = `http://localhost:${PORT}`;

    // Print both URLs so the app is easy to open locally or from another device.
    console.log(`Local:   ${localUrl}`);

    // Print one or more LAN-accessible URLs when available.
    if (networkUrls.length > 0) {
      console.log(`Network: ${networkUrls[0]}`);

      // Print any additional network addresses on separate lines.
      networkUrls.slice(1).forEach((url) => {
        console.log(`Network: ${url}`);
      });
    } else {
      // Explain why no network URL was printed.
      console.log("Network: No external network interface detected.");
    }
  });
}

// Kick off application startup.
startServer();
