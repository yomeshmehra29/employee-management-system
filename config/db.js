const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const seedAdmin = require("../utils/seedAdmin");

const defaultDatabaseDirectory = path.join(__dirname, "..", "data");
const configuredDatabasePath = process.env.SQLITE_DB_PATH;
const databasePath = configuredDatabasePath
  ? path.resolve(configuredDatabasePath)
  : path.join(defaultDatabaseDirectory, "employees.db");
const databaseDirectory = path.dirname(databasePath);

fs.mkdirSync(databaseDirectory, { recursive: true });

const db = new Database(databasePath);

// Bootstrap the SQLite file and required tables on first run.
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    department TEXT NOT NULL,
    job_role TEXT NOT NULL,
    salary REAL NOT NULL CHECK (salary >= 0),
    joining_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Active', 'Inactive', 'On Leave')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

seedAdmin(db);

module.exports = db;
