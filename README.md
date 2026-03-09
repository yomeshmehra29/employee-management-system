# Employee Management System

A complete full-stack Employee Management System CRUD app built with:

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Database: SQLite locally, PostgreSQL in cloud deployments

## Features

- Admin sign up and login authentication with hashed passwords
- Default admin user seeded automatically on first run
- Protected employee routes using session-based authentication
- Employee Create, Read, Update, Delete
- Automatic database bootstrap for both SQLite and PostgreSQL
- Search by name, email, department, and job role
- Department filter
- Pagination on employee list
- Responsive modern UI
- Frontend and backend form validation
- Edit form preloads existing employee data
- Delete confirmation before removal
- Runs on `0.0.0.0` and prints both localhost and network URLs

## Default Admin Login

- Email: `admin@example.com`
- Password: `admin123`

## Project Structure

```text
employee-management-system/
├── config/
│   └── db.js
├── controllers/
│   ├── authController.js
│   └── employeeController.js
├── data/
│   └── employees.db
├── middleware/
│   └── auth.js
├── public/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js
│   │   └── login.js
│   ├── index.html
│   └── login.html
├── routes/
│   ├── authRoutes.js
│   └── employeeRoutes.js
├── utils/
│   └── seedAdmin.js
├── package.json
├── README.md
└── server.js
```

## Setup

1. Open a terminal in the project folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the app:

   ```bash
   npm start
   ```

4. Open one of the printed URLs:
   - Local: `http://localhost:3000`
   - Network: `http://YOUR_LOCAL_IP:3000`

## Database Modes

- Local development defaults to SQLite at `data/employees.db`
- If `DATABASE_URL` is set, the app switches automatically to PostgreSQL
- On first run, the app creates the required tables and seeds the default admin user

## Development Mode

```bash
npm run dev
```

## Deployment

### Render Backend

This project includes [render.yaml](./render.yaml) for deploying the Express backend on Render.

- The free deployment path uses a hosted PostgreSQL database instead of SQLite.
- Set `DATABASE_URL` on the Render service to a valid Postgres connection string.
- The included `render.yaml` keeps `DATABASE_URL` external so you can supply it from Neon, Supabase, or another hosted Postgres provider.

### Free Cloud Database

The current free deployment setup uses Neon Postgres through the Vercel Marketplace.

- Neon provides the hosted PostgreSQL database
- Render runs the Express backend
- Vercel serves the static frontend and rewrites `/api/*` to the Render backend

### Vercel Frontend

This project includes [vercel.json](./vercel.json) for deploying the frontend from the `public` directory on Vercel.

- Vercel is forced to use the `Other` framework preset.
- The build step is skipped because this frontend is plain HTML, CSS, and JavaScript.
- Vercel serves the static frontend from `public`.
- Vercel rewrites `/api/*` requests to the Render backend.

## API Routes

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Employees

- `GET /api/employees`
- `GET /api/employees/:id`
- `POST /api/employees`
- `PUT /api/employees/:id`
- `DELETE /api/employees/:id`

## Query Parameters for `GET /api/employees`

- `search`
- `department`
- `page`
- `limit`

Example:

```bash
GET /api/employees?search=developer&department=Engineering&page=1&limit=10
```

## Notes

- The SQLite database file is created automatically inside the `data` folder on first run.
- If `DATABASE_URL` is present, PostgreSQL is used instead of SQLite.
- The default admin user is inserted only if it does not already exist.
- New admins can create accounts from the sign-up tab on the auth page.
- Employee API routes require a logged-in admin session.
