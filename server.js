const express = require("express");
const session = require("express-session");
const path = require("path");
const os = require("os");

require("./config/db");

const authRoutes = require("./routes/authRoutes");
const employeeRoutes = require("./routes/employeeRoutes");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: "ems.sid",
    secret: process.env.SESSION_SECRET || "employee-management-system-secret",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use(express.static(path.join(__dirname, "public"), { index: false }));

app.get("/", (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.redirect("/login");
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
  if (req.session && req.session.admin) {
    return res.redirect("/");
  }

  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", (req, res) => {
  res.status(404).json({ message: "API route not found." });
});

app.use((err, req, res, next) => {
  console.error("Unexpected server error:", err);
  res.status(500).json({ message: "Something went wrong on the server." });
});

function getNetworkUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  Object.values(interfaces).forEach((networkInterface) => {
    if (!networkInterface) {
      return;
    }

    networkInterface.forEach((address) => {
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    });
  });

  return urls;
}

app.listen(PORT, HOST, () => {
  const networkUrls = getNetworkUrls(PORT);
  const localUrl = `http://localhost:${PORT}`;

  // Print both URLs so the app is easy to open locally or from another device.
  console.log(`Local:   ${localUrl}`);

  if (networkUrls.length > 0) {
    console.log(`Network: ${networkUrls[0]}`);

    networkUrls.slice(1).forEach((url) => {
      console.log(`Network: ${url}`);
    });
  } else {
    console.log("Network: No external network interface detected.");
  }
});
