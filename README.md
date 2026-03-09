# Employee Management System

A complete full-stack Employee Management System CRUD app built with:

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js + Express
- Database: SQLite

## Features

- Admin sign up and login authentication with hashed passwords
- Default admin user seeded automatically on first run
- Protected employee routes using session-based authentication
- Employee Create, Read, Update, Delete
- SQLite database auto-created with required tables
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

## Development Mode

```bash
npm run dev
```

## Deployment

### Render Backend

This project includes [render.yaml](./render.yaml) for deploying the Express + SQLite backend on Render.

- The backend uses `SQLITE_DB_PATH` so the database can live on Render's persistent disk.
- The Blueprint attaches a disk at `/var/data` and stores SQLite at `/var/data/employees.db`.
- Because SQLite needs persistent storage, the Render service should use a paid plan with a disk attached.

### Vercel Frontend

This project includes [vercel.ts](./vercel.ts) for deploying the frontend from the `public` directory on Vercel.

- Vercel serves the static frontend from `public`.
- Vercel rewrites `/api/*` requests to the Render backend.
- Set `RENDER_BACKEND_URL` in Vercel before deploying, for example:

  ```text
  https://your-render-service.onrender.com
  ```

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
- The default admin user is inserted only if it does not already exist.
- New admins can create accounts from the sign-up tab on the auth page.
- Employee API routes require a logged-in admin session.
