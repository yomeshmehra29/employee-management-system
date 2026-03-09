# MongoDB Deploy And Data Guide

## What Changes In Production

The backend now prefers MongoDB when `MONGODB_URI` is set.

Priority order in the code:

1. `MONGODB_URI` -> MongoDB
2. `DATABASE_URL` -> PostgreSQL fallback
3. no DB env var -> SQLite fallback

This means the deployed backend will switch to MongoDB without changing the frontend API routes.

## Deploy The MongoDB Version

### 1. Push the current code to GitHub

Render is configured with `autoDeployTrigger: commit`, so the backend updates when the linked branch receives the latest commit.

### 2. Set MongoDB environment variables in Render

Open your Render backend service and add these environment variables:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

You can keep `DATABASE_URL` there as a fallback, but the code will use MongoDB first whenever `MONGODB_URI` exists.

Suggested values:

- `DEFAULT_ADMIN_EMAIL=yomeshmehra@gmail.com`
- `DEFAULT_ADMIN_PASSWORD=<your chosen admin password>`

### 3. Make sure Atlas allows your Render backend to connect

In Render:

- open the backend service
- click `Connect`
- open the `Outbound` tab
- copy the outbound IP addresses or ranges

In MongoDB Atlas:

- go to `Security`
- open `Database & Network Access`
- add the Render outbound IPs to the project IP access list

If you cannot configure exact IPs right away, Atlas also supports `0.0.0.0/0`, but that is less secure.

### 4. Deploy the backend

In Render you can either:

- save environment variables and deploy immediately
- or use `Manual Deploy` -> `Deploy latest commit`

### 5. Verify the live backend

Check:

- `https://employee-management-system-api-k731.onrender.com/api/health`

The JSON response should show:

- `"database": "mongo"`

## Does Vercel Need Changes?

Usually no.

The frontend already sends `/api/...` requests to the same Render backend URL through `vercel.json`.

So if only the backend storage changes, the frontend can continue working without a rewrite change.

## Important Data Note

Switching the deployed backend to MongoDB does **not** migrate old PostgreSQL or SQLite data automatically.

What happens:

- existing app logic starts reading from MongoDB
- if MongoDB is empty, the employee list will be empty
- the seed admin will be created if no admin exists

If you need old employee data to remain in production, create a migration step before switching fully.

## How To View Data In MongoDB Atlas

Use MongoDB Atlas `Data Explorer`.

You will typically see:

- database: `employee_management_system` (or your configured DB name)
- collection: `admins`
- collection: `employees`

In `employees`, each document stores:

- `_id`
- `full_name`
- `email`
- `phone`
- `department`
- `job_role`
- `salary`
- `joining_date`
- `status`
- `created_at`
- `updated_at`

In `admins`, each document stores:

- `_id`
- `email`
- `password` (hashed, not plain text)
- `created_at`
- `updated_at`

## How To Change Data In Atlas

### Employees

Safe ways to change employee data:

- use the app UI for create, edit, and delete
- or use Atlas Data Explorer for direct document editing

Good direct edits:

- `full_name`
- `email`
- `phone`
- `department`
- `job_role`
- `salary`
- `joining_date`
- `status`

Avoid changing:

- `_id`
- `created_at` unless you really intend to

### Admins

Safe direct edits:

- `email`

Be careful with:

- `password`

The admin password in MongoDB is stored as a bcrypt hash. Do not paste a plain password into the `password` field directly, or login will break.

## How To Insert Or Edit Documents In Atlas

Common workflow:

1. open Atlas
2. open `Data Explorer`
3. choose your database
4. open `employees` or `admins`
5. click a document to inspect it
6. use the edit icon to change fields
7. save the update

## Better Local/Desktop Option: MongoDB Compass

You can also use MongoDB Compass to:

- connect to your Atlas cluster
- browse databases and collections
- filter documents
- insert documents
- update documents
- delete documents

This is often easier to explain in an interview or manager call because it visually shows the live database contents.

## Best Explanation For Your Manager

Use this:

`I updated the backend data layer so the same employee management app can now run on MongoDB. In production, I only need to set the MongoDB connection string in Render, allow Render's outbound IPs in MongoDB Atlas, deploy the backend, and then the app starts reading and writing employee data from MongoDB. I can inspect or edit the stored data using MongoDB Atlas Data Explorer or MongoDB Compass.`
