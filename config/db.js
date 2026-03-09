// Import filesystem helpers so the SQLite database directory can still be created for fallback mode.
const fs = require("fs");
// Import path utilities to resolve the SQLite file path safely.
const path = require("path");
// Import the local SQLite client used when MongoDB is not configured.
const Database = require("better-sqlite3");
// Import the Postgres pool used for the existing hosted fallback mode.
const { Pool } = require("pg");
// Import Mongoose so MongoDB can be used as the primary document database.
const mongoose = require("mongoose");
// Import the admin seeding helper run during initialization.
const seedAdmin = require("../utils/seedAdmin");

// Define the default folder where the SQLite database file will live in fallback mode.
const defaultDatabaseDirectory = path.join(__dirname, "..", "data");
// Read an optional custom SQLite file path from the environment.
const configuredDatabasePath = process.env.SQLITE_DB_PATH;
// Resolve the final SQLite file path, preferring the configured path when present.
const databasePath = configuredDatabasePath
  ? path.resolve(configuredDatabasePath)
  : path.join(defaultDatabaseDirectory, "employees.db");
// Resolve the directory containing the SQLite database file.
const databaseDirectory = path.dirname(databasePath);
// Use MongoDB when a connection string is available.
const usesMongo = Boolean(process.env.MONGODB_URI);
// Preserve the existing Postgres support when MongoDB is not configured.
const usesPostgres = !usesMongo && Boolean(process.env.DATABASE_URL);

// Hold the SQLite connection once it has been created.
let sqliteDb = null;
// Hold the Postgres connection pool once it has been created.
let pgPool = null;
// Hold the MongoDB admin model once the connection is ready.
let adminModel = null;
// Hold the MongoDB employee model once the connection is ready.
let employeeModel = null;
// Cache the initialization promise so startup logic only runs once.
let initializationPromise = null;

// Define the supported employee status values once for schema reuse.
const VALID_STATUSES = ["Active", "Inactive", "On Leave"];

// Define the admin schema used by MongoDB.
const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String,
      required: true
    }
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at"
    },
    versionKey: false
  }
);

// Define the employee schema used by MongoDB.
const employeeSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    department: {
      type: String,
      required: true,
      trim: true
    },
    job_role: {
      type: String,
      required: true,
      trim: true
    },
    salary: {
      type: Number,
      required: true,
      min: 0
    },
    joining_date: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      required: true,
      enum: VALID_STATUSES
    }
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at"
    },
    versionKey: false
  }
);

// Escape special regex characters before using user input inside MongoDB search patterns.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Convert timestamps to ISO strings when they are real Date objects.
function formatTimestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

// Convert Date objects to YYYY-MM-DD strings for employee joining dates.
function formatDateValue(value) {
  // Return non-Date values unchanged.
  if (!(value instanceof Date)) {
    return value;
  }

  // Keep only the calendar portion of the date.
  return value.toISOString().slice(0, 10);
}

// Normalize raw admin rows so callers receive a consistent shape across databases.
function mapAdminRow(row, options = {}) {
  const { includePassword = true } = options;

  // Preserve null results for missing admins.
  if (!row) {
    return null;
  }

  // Resolve the public admin identifier from either SQL or MongoDB.
  const resolvedId =
    typeof row.id !== "undefined"
      ? row.id
      : row._id
        ? String(row._id)
        : null;

  // Build the mapped admin object.
  const mappedAdmin = {
    id: resolvedId,
    email: row.email,
    created_at: formatTimestamp(row.created_at),
    updated_at: formatTimestamp(row.updated_at)
  };

  // Include the password hash only when the caller needs it for authentication checks.
  if (includePassword && row.password) {
    mappedAdmin.password = row.password;
  }

  return mappedAdmin;
}

// Normalize raw employee rows so the API returns consistent types.
function mapEmployeeRow(row) {
  // Preserve null results for missing employees.
  if (!row) {
    return null;
  }

  // Resolve the public employee identifier from either SQL or MongoDB.
  const resolvedId =
    typeof row.id !== "undefined"
      ? row.id
      : row._id
        ? String(row._id)
        : null;

  // Return the stable employee shape used by the frontend.
  return {
    id: resolvedId,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    department: row.department,
    job_role: row.job_role,
    salary: Number(row.salary),
    joining_date: formatDateValue(row.joining_date),
    status: row.status,
    created_at: formatTimestamp(row.created_at),
    updated_at: formatTimestamp(row.updated_at)
  };
}

// Lazily create and initialize the SQLite database connection.
function getSqliteDatabase() {
  // Reuse the existing connection after the first call.
  if (sqliteDb) {
    return sqliteDb;
  }

  // Ensure the database directory exists before opening the file.
  fs.mkdirSync(databaseDirectory, { recursive: true });

  // Open or create the SQLite database file.
  sqliteDb = new Database(databasePath);
  // Enable write-ahead logging for better concurrency and durability.
  sqliteDb.pragma("journal_mode = WAL");

  // Create the admins table when it does not already exist.
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create the employees table when it does not already exist.
  sqliteDb.exec(`
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

  // Return the initialized SQLite connection.
  return sqliteDb;
}

// Build a Postgres connection pool with environment-aware SSL handling.
function createPostgresPool() {
  // Read the full Postgres connection string from the environment.
  const connectionString = process.env.DATABASE_URL;
  // Remove sslmode=require from the URL because SSL is configured separately below.
  const normalizedConnectionString = connectionString
    ? connectionString
        .replace(/([?&])sslmode=require&?/i, "$1")
        .replace(/[?&]$/, "")
    : connectionString;
  // Enable SSL for hosted databases unless the URL explicitly disables it or points to localhost.
  const shouldUseSsl =
    connectionString &&
    !/sslmode=disable/i.test(connectionString) &&
    !/localhost|127\.0\.0\.1/i.test(connectionString);

  // Return a reusable pg pool instance.
  return new Pool({
    connectionString: normalizedConnectionString,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined
  });
}

// Create the required tables in Postgres.
async function initializePostgresDatabase() {
  // Open the Postgres pool before executing schema queries.
  pgPool = createPostgresPool();

  // Create the admins table if it does not already exist.
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create the employees table if it does not already exist.
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      department TEXT NOT NULL,
      job_role TEXT NOT NULL,
      salary DOUBLE PRECISION NOT NULL CHECK (salary >= 0),
      joining_date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Active', 'Inactive', 'On Leave')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Connect to MongoDB and initialize the models used by the app.
async function initializeMongoDatabase() {
  // Reuse the existing ready connection.
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // Connect to MongoDB using the provided URI and optional database name.
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || undefined
  });

  // Create or reuse the admin model on the active Mongoose connection.
  adminModel = mongoose.models.Admin || mongoose.model("Admin", adminSchema);
  // Create or reuse the employee model on the active Mongoose connection.
  employeeModel = mongoose.models.Employee || mongoose.model("Employee", employeeSchema);

  // Ensure the declared indexes exist before the app starts serving requests.
  await Promise.all([adminModel.init(), employeeModel.init()]);
}

// Initialize the active database exactly once and seed the default admin account.
async function initializeDatabase() {
  // Reuse the same promise when initialization has already started.
  if (initializationPromise) {
    return initializationPromise;
  }

  // Run database setup in an immediately invoked async function and cache the promise.
  initializationPromise = (async () => {
    // Prefer MongoDB when a Mongo connection string is configured.
    if (usesMongo) {
      await initializeMongoDatabase();
    } else if (usesPostgres) {
      // Otherwise keep the Postgres behavior for existing hosted environments.
      await initializePostgresDatabase();
    } else {
      // Fall back to SQLite for simple local development.
      getSqliteDatabase();
    }

    // Ensure a default admin exists after the schema is ready.
    await seedAdmin({
      findAdminByEmail: findAdminByEmailInternal,
      createAdmin: createAdminInternal
    });
  })();

  // Return the cached initialization promise.
  return initializationPromise;
}

// Make sure the database setup has completed before a query runs.
async function ensureInitialized() {
  await initializeDatabase();
}

// Convert the route parameter into the correct ID shape for the active database.
function normalizeEmployeeId(employeeId) {
  // MongoDB uses ObjectId strings as primary keys.
  if (usesMongo) {
    const normalizedId = String(employeeId || "").trim();
    return mongoose.Types.ObjectId.isValid(normalizedId) ? normalizedId : null;
  }

  // SQL databases use positive integer identifiers.
  const numericEmployeeId = Number(employeeId);
  return Number.isInteger(numericEmployeeId) && numericEmployeeId > 0 ? numericEmployeeId : null;
}

// Look up one admin by email without triggering another initialization cycle.
async function findAdminByEmailInternal(email) {
  // Use MongoDB document lookup when MongoDB is active.
  if (usesMongo) {
    const admin = await adminModel.findOne({ email }).lean();
    return mapAdminRow(admin);
  }

  // Use parameterized SQL in Postgres to avoid SQL injection.
  if (usesPostgres) {
    const result = await pgPool.query(
      "SELECT id, email, password, created_at, updated_at FROM admins WHERE email = $1 LIMIT 1",
      [email]
    );

    return mapAdminRow(result.rows[0] || null);
  }

  // Use a prepared statement in SQLite for the same lookup.
  const sqlite = getSqliteDatabase();
  return mapAdminRow(
    sqlite
      .prepare("SELECT id, email, password, created_at, updated_at FROM admins WHERE email = ?")
      .get(email) || null
  );
}

// Insert a new admin record without re-running initialization checks.
async function createAdminInternal(email, hashedPassword) {
  // Insert and return the new admin in MongoDB.
  if (usesMongo) {
    const createdAdmin = await adminModel.create({
      email,
      password: hashedPassword
    });

    return mapAdminRow(createdAdmin.toObject(), { includePassword: false });
  }

  // Insert and return the new admin in Postgres.
  if (usesPostgres) {
    const result = await pgPool.query(
      `
        INSERT INTO admins (email, password, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, email, created_at, updated_at
      `,
      [email, hashedPassword]
    );

    return mapAdminRow(result.rows[0], { includePassword: false });
  }

  // Insert the admin in SQLite and then query it back by generated ID.
  const sqlite = getSqliteDatabase();
  const result = sqlite
    .prepare(`
      INSERT INTO admins (email, password, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .run(email, hashedPassword);

  // Return the stored admin row after insertion.
  return mapAdminRow(
    sqlite
      .prepare("SELECT id, email, created_at, updated_at FROM admins WHERE id = ?")
      .get(result.lastInsertRowid),
    { includePassword: false }
  );
}

// Public admin lookup that guarantees initialization has completed first.
async function findAdminByEmail(email) {
  await ensureInitialized();
  return findAdminByEmailInternal(email);
}

// Public admin creation that guarantees initialization has completed first.
async function createAdmin(email, hashedPassword) {
  await ensureInitialized();
  return createAdminInternal(email, hashedPassword);
}

// Return a paginated employee list with optional search and department filtering.
async function listEmployees(options) {
  await ensureInitialized();

  // Normalize query options and clamp paging values to sensible ranges.
  const search = String(options.search || "").trim();
  const department = String(options.department || "").trim();
  const requestedPage = Math.max(parseInt(options.page, 10) || 1, 1);
  const requestedLimit = Math.max(parseInt(options.limit, 10) || 10, 1);
  const limit = Math.min(requestedLimit, 100);

  // Use MongoDB queries when MongoDB is active.
  if (usesMongo) {
    // Build the MongoDB filter object based on the supplied search and department filters.
    const filter = {};

    // Search across multiple text fields with a case-insensitive regex.
    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { full_name: searchRegex },
        { email: searchRegex },
        { department: searchRegex },
        { job_role: searchRegex }
      ];
    }

    // Filter by department while ignoring text casing.
    if (department) {
      filter.department = new RegExp(`^${escapeRegex(department)}$`, "i");
    }

    // Count the total number of matching employees for pagination.
    const totalItems = await employeeModel.countDocuments(filter);
    // Keep at least one page even when the result set is empty.
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
    // Clamp the current page so it never exceeds the available page count.
    const page = Math.min(requestedPage, totalPages);
    // Translate the page number into a document skip count.
    const offset = (page - 1) * limit;

    // Fetch the current page of employees sorted by recent updates first.
    const employees = await employeeModel
      .find(filter)
      .sort({ updated_at: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    // Fetch the distinct department list for the frontend filter dropdown.
    const departments = (await employeeModel.distinct("department"))
      .filter(Boolean)
      .sort((left, right) => String(left).localeCompare(String(right)));

    // Return employees, filter options, and pagination metadata in one response shape.
    return {
      data: employees.map(mapEmployeeRow),
      departments,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      }
    };
  }

  // Use Postgres-specific SQL syntax when Postgres is active.
  if (usesPostgres) {
    // Build optional WHERE clauses dynamically based on supplied filters.
    const whereClauses = [];
    const params = [];

    // Search across several text fields with a case-insensitive pattern.
    if (search) {
      params.push(`%${search}%`);
      const searchPlaceholder = `$${params.length}`;
      whereClauses.push(
        `(full_name ILIKE ${searchPlaceholder} OR email ILIKE ${searchPlaceholder} OR department ILIKE ${searchPlaceholder} OR job_role ILIKE ${searchPlaceholder})`
      );
    }

    // Filter by department while ignoring text casing.
    if (department) {
      params.push(department);
      whereClauses.push(`LOWER(department) = LOWER($${params.length})`);
    }

    // Join the WHERE clauses only when filters are present.
    const whereStatement = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Count the total number of matching employees for pagination.
    const totalResult = await pgPool.query(
      `SELECT COUNT(*)::int AS total FROM employees ${whereStatement}`,
      params
    );
    const totalItems = totalResult.rows[0].total;
    // Keep at least one page even when the result set is empty.
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
    // Clamp the current page so it never exceeds the available page count.
    const page = Math.min(requestedPage, totalPages);
    // Translate the page number into a SQL offset.
    const offset = (page - 1) * limit;

    // Append limit and offset to the parameter list for the employee query.
    const employeeParams = [...params, limit, offset];
    // Fetch the current page of employees sorted by recent updates first.
    const employeesResult = await pgPool.query(
      `
        SELECT *
        FROM employees
        ${whereStatement}
        ORDER BY updated_at DESC, id DESC
        LIMIT $${employeeParams.length - 1} OFFSET $${employeeParams.length}
      `,
      employeeParams
    );

    // Fetch the distinct department list for the frontend filter dropdown.
    const departmentsResult = await pgPool.query(
      "SELECT DISTINCT department FROM employees ORDER BY department ASC"
    );

    // Return employees, filter options, and pagination metadata in one response shape.
    return {
      data: employeesResult.rows.map(mapEmployeeRow),
      departments: departmentsResult.rows.map((item) => item.department),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      }
    };
  }

  // Fall back to the SQLite implementation when neither MongoDB nor Postgres is configured.
  const sqlite = getSqliteDatabase();
  // Build optional WHERE clauses and parameter values for SQLite.
  const whereClauses = [];
  const params = [];

  // Search across multiple fields with a LIKE pattern.
  if (search) {
    whereClauses.push(
      "(full_name LIKE ? OR email LIKE ? OR department LIKE ? OR job_role LIKE ?)"
    );
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  // Filter by department case-insensitively.
  if (department) {
    whereClauses.push("LOWER(department) = LOWER(?)");
    params.push(department);
  }

  // Build the final WHERE clause only when needed.
  const whereStatement = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  // Count matching employees for pagination.
  const totalResult = sqlite
    .prepare(`SELECT COUNT(*) AS total FROM employees ${whereStatement}`)
    .get(...params);
  const totalItems = totalResult.total;
  // Keep at least one page in the metadata.
  const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
  // Clamp the current page to the valid range.
  const page = Math.min(requestedPage, totalPages);
  // Translate the page number into a row offset.
  const offset = (page - 1) * limit;

  // Fetch the current page of employee rows.
  const employees = sqlite
    .prepare(
      `
        SELECT *
        FROM employees
        ${whereStatement}
        ORDER BY updated_at DESC, id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(...params, limit, offset);

  // Fetch distinct departments for the filter dropdown.
  const departments = sqlite
    .prepare("SELECT DISTINCT department FROM employees ORDER BY department ASC")
    .all()
    .map((item) => item.department);

  // Return the same API shape as the Postgres branch.
  return {
    data: employees.map(mapEmployeeRow),
    departments,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages
    }
  };
}

// Return one employee by primary key.
async function getEmployeeById(employeeId) {
  await ensureInitialized();

  // Use MongoDB document lookup when MongoDB is active.
  if (usesMongo) {
    const employee = await employeeModel.findById(employeeId).lean();
    return mapEmployeeRow(employee || null);
  }

  // Use a parameterized query in Postgres.
  if (usesPostgres) {
    const result = await pgPool.query("SELECT * FROM employees WHERE id = $1 LIMIT 1", [
      employeeId
    ]);

    // Normalize the returned row before sending it upward.
    return mapEmployeeRow(result.rows[0] || null);
  }

  // Use a prepared statement in SQLite.
  const sqlite = getSqliteDatabase();
  const employee = sqlite.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);
  return mapEmployeeRow(employee || null);
}

// Insert a new employee and return the created record.
async function createEmployee(employee) {
  await ensureInitialized();

  // Use MongoDB document creation when MongoDB is active.
  if (usesMongo) {
    const createdEmployee = await employeeModel.create({
      ...employee,
      joining_date: new Date(employee.joining_date)
    });

    return mapEmployeeRow(createdEmployee.toObject());
  }

  // Use Postgres insert syntax when Postgres is active.
  if (usesPostgres) {
    const result = await pgPool.query(
      `
        INSERT INTO employees (
          full_name,
          email,
          phone,
          department,
          job_role,
          salary,
          joining_date,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `,
      [
        employee.full_name,
        employee.email,
        employee.phone,
        employee.department,
        employee.job_role,
        employee.salary,
        employee.joining_date,
        employee.status
      ]
    );

    // Normalize the created row before returning it.
    return mapEmployeeRow(result.rows[0]);
  }

  // Insert the new employee into SQLite.
  const sqlite = getSqliteDatabase();
  const result = sqlite
    .prepare(`
      INSERT INTO employees (
        full_name,
        email,
        phone,
        department,
        job_role,
        salary,
        joining_date,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .run(
      employee.full_name,
      employee.email,
      employee.phone,
      employee.department,
      employee.job_role,
      employee.salary,
      employee.joining_date,
      employee.status
    );

  // Query the inserted row back by its generated SQLite ID.
  return getEmployeeById(result.lastInsertRowid);
}

// Update an existing employee and return the saved record.
async function updateEmployee(employeeId, employee) {
  await ensureInitialized();

  // Use MongoDB update syntax when MongoDB is active.
  if (usesMongo) {
    const updatedEmployee = await employeeModel
      .findByIdAndUpdate(
        employeeId,
        {
          ...employee,
          joining_date: new Date(employee.joining_date)
        },
        {
          new: true,
          runValidators: true
        }
      )
      .lean();

    return mapEmployeeRow(updatedEmployee || null);
  }

  // Use Postgres update syntax when Postgres is active.
  if (usesPostgres) {
    const result = await pgPool.query(
      `
        UPDATE employees
        SET
          full_name = $1,
          email = $2,
          phone = $3,
          department = $4,
          job_role = $5,
          salary = $6,
          joining_date = $7,
          status = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING *
      `,
      [
        employee.full_name,
        employee.email,
        employee.phone,
        employee.department,
        employee.job_role,
        employee.salary,
        employee.joining_date,
        employee.status,
        employeeId
      ]
    );

    // Normalize the updated row before returning it.
    return mapEmployeeRow(result.rows[0] || null);
  }

  // Run the update in SQLite.
  const sqlite = getSqliteDatabase();
  sqlite
    .prepare(`
      UPDATE employees
      SET
        full_name = ?,
        email = ?,
        phone = ?,
        department = ?,
        job_role = ?,
        salary = ?,
        joining_date = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    .run(
      employee.full_name,
      employee.email,
      employee.phone,
      employee.department,
      employee.job_role,
      employee.salary,
      employee.joining_date,
      employee.status,
      employeeId
    );

  // Query the row back so callers receive the latest stored record.
  return getEmployeeById(employeeId);
}

// Delete an employee record by ID.
async function deleteEmployee(employeeId) {
  await ensureInitialized();

  // Use MongoDB document deletion when MongoDB is active.
  if (usesMongo) {
    await employeeModel.findByIdAndDelete(employeeId);
    return;
  }

  // Use a parameterized Postgres delete when Postgres is active.
  if (usesPostgres) {
    await pgPool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
    return;
  }

  // Use a prepared SQLite delete when running locally.
  const sqlite = getSqliteDatabase();
  sqlite.prepare("DELETE FROM employees WHERE id = ?").run(employeeId);
}

// Export the active client type and all database operations used by the rest of the app.
module.exports = {
  client: usesMongo ? "mongo" : usesPostgres ? "postgres" : "sqlite",
  initializeDatabase,
  normalizeEmployeeId,
  findAdminByEmail,
  createAdmin,
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
};
