const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { Pool } = require("pg");
const seedAdmin = require("../utils/seedAdmin");

const defaultDatabaseDirectory = path.join(__dirname, "..", "data");
const configuredDatabasePath = process.env.SQLITE_DB_PATH;
const databasePath = configuredDatabasePath
  ? path.resolve(configuredDatabasePath)
  : path.join(defaultDatabaseDirectory, "employees.db");
const databaseDirectory = path.dirname(databasePath);
const usesPostgres = Boolean(process.env.DATABASE_URL);

let sqliteDb = null;
let pgPool = null;
let initializationPromise = null;

function formatTimestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function formatDateValue(value) {
  if (!(value instanceof Date)) {
    return value;
  }

  return value.toISOString().slice(0, 10);
}

function mapEmployeeRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    salary: Number(row.salary),
    joining_date: formatDateValue(row.joining_date),
    created_at: formatTimestamp(row.created_at),
    updated_at: formatTimestamp(row.updated_at)
  };
}

function getSqliteDatabase() {
  if (sqliteDb) {
    return sqliteDb;
  }

  fs.mkdirSync(databaseDirectory, { recursive: true });

  sqliteDb = new Database(databasePath);
  sqliteDb.pragma("journal_mode = WAL");

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

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

  return sqliteDb;
}

function createPostgresPool() {
  const connectionString = process.env.DATABASE_URL;
  const normalizedConnectionString = connectionString
    ? connectionString
        .replace(/([?&])sslmode=require&?/i, "$1")
        .replace(/[?&]$/, "")
    : connectionString;
  const shouldUseSsl =
    connectionString &&
    !/sslmode=disable/i.test(connectionString) &&
    !/localhost|127\.0\.0\.1/i.test(connectionString);

  return new Pool({
    connectionString: normalizedConnectionString,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined
  });
}

async function initializePostgresDatabase() {
  pgPool = createPostgresPool();

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

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

async function initializeDatabase() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    if (usesPostgres) {
      await initializePostgresDatabase();
    } else {
      getSqliteDatabase();
    }

    await seedAdmin({
      findAdminByEmail: findAdminByEmailInternal,
      createAdmin: createAdminInternal
    });
  })();

  return initializationPromise;
}

async function ensureInitialized() {
  await initializeDatabase();
}

async function findAdminByEmailInternal(email) {
  if (usesPostgres) {
    const result = await pgPool.query(
      "SELECT id, email, password, created_at, updated_at FROM admins WHERE email = $1 LIMIT 1",
      [email]
    );

    return result.rows[0] || null;
  }

  const sqlite = getSqliteDatabase();
  return (
    sqlite
      .prepare("SELECT id, email, password, created_at, updated_at FROM admins WHERE email = ?")
      .get(email) || null
  );
}

async function createAdminInternal(email, hashedPassword) {
  if (usesPostgres) {
    const result = await pgPool.query(
      `
        INSERT INTO admins (email, password, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, email, created_at, updated_at
      `,
      [email, hashedPassword]
    );

    return result.rows[0];
  }

  const sqlite = getSqliteDatabase();
  const result = sqlite
    .prepare(`
      INSERT INTO admins (email, password, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .run(email, hashedPassword);

  return sqlite
    .prepare("SELECT id, email, created_at, updated_at FROM admins WHERE id = ?")
    .get(result.lastInsertRowid);
}

async function findAdminByEmail(email) {
  await ensureInitialized();
  return findAdminByEmailInternal(email);
}

async function createAdmin(email, hashedPassword) {
  await ensureInitialized();
  return createAdminInternal(email, hashedPassword);
}

async function listEmployees(options) {
  await ensureInitialized();

  const search = String(options.search || "").trim();
  const department = String(options.department || "").trim();
  const requestedPage = Math.max(parseInt(options.page, 10) || 1, 1);
  const requestedLimit = Math.max(parseInt(options.limit, 10) || 10, 1);
  const limit = Math.min(requestedLimit, 100);

  if (usesPostgres) {
    const whereClauses = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      const searchPlaceholder = `$${params.length}`;
      whereClauses.push(
        `(full_name ILIKE ${searchPlaceholder} OR email ILIKE ${searchPlaceholder} OR department ILIKE ${searchPlaceholder} OR job_role ILIKE ${searchPlaceholder})`
      );
    }

    if (department) {
      params.push(department);
      whereClauses.push(`LOWER(department) = LOWER($${params.length})`);
    }

    const whereStatement = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const totalResult = await pgPool.query(
      `SELECT COUNT(*)::int AS total FROM employees ${whereStatement}`,
      params
    );
    const totalItems = totalResult.rows[0].total;
    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * limit;

    const employeeParams = [...params, limit, offset];
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

    const departmentsResult = await pgPool.query(
      "SELECT DISTINCT department FROM employees ORDER BY department ASC"
    );

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

  const sqlite = getSqliteDatabase();
  const whereClauses = [];
  const params = [];

  if (search) {
    whereClauses.push(
      "(full_name LIKE ? OR email LIKE ? OR department LIKE ? OR job_role LIKE ?)"
    );
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (department) {
    whereClauses.push("LOWER(department) = LOWER(?)");
    params.push(department);
  }

  const whereStatement = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const totalResult = sqlite
    .prepare(`SELECT COUNT(*) AS total FROM employees ${whereStatement}`)
    .get(...params);
  const totalItems = totalResult.total;
  const totalPages = Math.max(Math.ceil(totalItems / limit), 1);
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * limit;

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

  const departments = sqlite
    .prepare("SELECT DISTINCT department FROM employees ORDER BY department ASC")
    .all()
    .map((item) => item.department);

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

async function getEmployeeById(employeeId) {
  await ensureInitialized();

  if (usesPostgres) {
    const result = await pgPool.query("SELECT * FROM employees WHERE id = $1 LIMIT 1", [
      employeeId
    ]);

    return mapEmployeeRow(result.rows[0] || null);
  }

  const sqlite = getSqliteDatabase();
  const employee = sqlite.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);
  return mapEmployeeRow(employee || null);
}

async function createEmployee(employee) {
  await ensureInitialized();

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

    return mapEmployeeRow(result.rows[0]);
  }

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

  return getEmployeeById(result.lastInsertRowid);
}

async function updateEmployee(employeeId, employee) {
  await ensureInitialized();

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

    return mapEmployeeRow(result.rows[0] || null);
  }

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

  return getEmployeeById(employeeId);
}

async function deleteEmployee(employeeId) {
  await ensureInitialized();

  if (usesPostgres) {
    await pgPool.query("DELETE FROM employees WHERE id = $1", [employeeId]);
    return;
  }

  const sqlite = getSqliteDatabase();
  sqlite.prepare("DELETE FROM employees WHERE id = ?").run(employeeId);
}

module.exports = {
  client: usesPostgres ? "postgres" : "sqlite",
  initializeDatabase,
  findAdminByEmail,
  createAdmin,
  listEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
};
