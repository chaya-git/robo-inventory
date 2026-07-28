# RoboManthan Inventory Management System

## Overview

The RoboManthan Inventory Management System is a full-stack web application developed during a software development internship at RoboManthan.

The system is designed to manage electronic components and inventory used in projects, workshops, and testing activities. It provides inventory tracking, stock management, approval workflows, damaged component handling, component exchange requests, and role-based access control for administrators and employees.

The objective of the system is to maintain accurate inventory records, streamline component issuance, and provide transparency into inventory usage across the organization.

---

## Features

### Inventory Management

* Add and manage inventory products
* Track available stock
* Track damaged stock
* Maintain original stock records
* Product search functionality
* Product image support

### Issue Management

The system supports component issuance for:

* Projects
* Workshops
* Testing

Each issue record stores:

* Employee details
* Project/Workshop information
* Components issued
* Quantity issued
* Issue date
* Status tracking

---

### Return Management

Employees can:

* Return issued components
* Return components partially
* View issue history

Administrators can:

* Approve return requests
* Track returned inventory

---

### Exchange Workflow

Employees can request component exchanges when:

* Components become faulty
* Components need replacement

Administrators can:

* Approve exchange requests
* Update stock automatically

---

### Damaged Component Management

Employees can:

* Report damaged components

Administrators can:

* Review damage requests
* Approve damaged component replacements
* Maintain damaged inventory records

---

### Add Component Requests

Employees can request additional components for an already issued:

* Project
* Workshop
* Testing session

Administrators can approve or reject requests.

---

### Testing Extension Requests

Employees can request additional testing duration.

Administrators can:

* Approve extension requests
* Reject extension requests

---

### Authentication & Authorization

The application supports:

* JWT-based authentication
* Admin login
* Employee accounts
* Signup approval workflow
* Role-based access control

Different functionality is exposed depending on user role.

---

### Notifications

The system includes notification support for:

* Signup approvals
* Request updates
* Workflow actions

---

## Technology Stack

### Frontend

* HTML5
* CSS3
* Vanilla JavaScript

### Backend

* Node.js
* Express.js

### Database

* PostgreSQL

### Authentication

* JSON Web Tokens (JWT)

### Version Control

* Git
* GitHub

---

## Project Structure

```text
robomanthan_inventory
│
├── frontend
│   ├── index.html
│   ├── login.html
│   ├── signup.html
│   ├── script.js
│   ├── style.css
│   ├── damaged-report.html
│   ├── damaged-report.js
│   └── damaged-report.css
│
├── backend
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── updateInventory.js
│   └── migrations
│
├── .gitignore
└── README.md
```

---

## Main Database Tables

### Core Tables

* products
* users
* issues
* issue_components

### Request Tables

* issue_requests
* return_requests
* exchange_requests
* damaged_requests
* add_component_requests
* extension_requests

### Other Tables

* signup_requests
* damaged_components

---

## Installation

### Clone Repository

```bash
git clone <repository-url>
```

### Backend Setup

```bash
cd backend
npm install
```

### Configure PostgreSQL

Update database credentials inside:

```text
backend/server.js
```

Example:

```javascript
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "robomanthan",
  password: "your_password",
  port: 5432,
});
```

### Start Backend Server

```bash
node server.js
```

### Run Frontend

Open:

```text
frontend/login.html
```

or use a local development server.

---

## Environment Variables

Create a `.env` file inside the backend folder and add the following:

```env
PORT=5000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_database_username
DB_PASSWORD=your_database_password
JWT_SECRET=
ADMIN_PASSWORD=
```

## Inventory Workflow

### Project Issue Workflow

Employee
↓
Creates Issue Request
↓
Admin Reviews Request
↓
Admin Approves Request
↓
Inventory Updated
↓
History Recorded

---

### Return Workflow

Employee
↓
Creates Return Request
↓
Admin Approves
↓
Stock Updated
↓
History Updated

---

### Exchange Workflow

Employee
↓
Requests Component Exchange
↓
Admin Reviews Request
↓
Admin Approves
↓
Stock Updated

---

### Damaged Component Workflow

Employee
↓
Reports Damaged Component
↓
Admin Reviews Request
↓
Admin Approves
↓
Damaged Inventory Updated

---

## Bulk Inventory Import

The system includes an inventory migration utility:

```text
backend/updateInventory.js
```

Purpose:

* Import inventory quantities from Excel sheets
* Update stock values
* Update damaged quantities
* Update original stock values

Usage:

```bash
node updateInventory.js
```

This utility was used to migrate real RoboManthan inventory data into the system.

---
## Deployment

Frontend: Vercel
Backend: Render
Database: Neon PostgreSQL
CI/CD: GitHub Integration

## Security Features

* JWT Authentication
* Protected API routes
* Role-based authorization
* Admin-only approval workflows
* Restricted inventory modification access

---

## Optimizations Implemented

### API Optimization

Reduced excessive API requests by:

* Eliminating repeated component-fetch requests
* Bundling inventory data more efficiently
* Improving history page performance

### Request Handling Improvements

* Improved issue request display
* Product name resolution from inventory records
* Cleaner approval workflow handling

---

## Future Improvements

Potential future enhancements include:


* Email notifications
* Excel upload from admin dashboard
* Product location tracking
* Inventory analytics dashboard
* Export reports to Excel/PDF
* Barcode or QR code support
* Advanced search and filtering

---
## Challenges Solved

- Implemented approval-based inventory workflows.
- Managed component returns and partial returns.
- Designed exchange request system.
- Built role-based access control.
- Optimized API requests to reduce redundant database calls.
- Migrated inventory data from Excel into PostgreSQL.
- Deployed a full-stack application using Vercel, Render, and Neon.
- Added mobile responsiveness for production usage.

## Internship Project

This project was developed during a Software Development Internship at RoboManthan.

The project evolved from a basic inventory tracker into a workflow-driven inventory management platform capable of handling real inventory data, approval systems, stock tracking, damaged inventory management, and employee request workflows.

---

## Author

**Vatsal Narain**

Software Development Intern
RoboManthan

Repository:
https://github.com/Vatsal-Narain/Robomanthan-Inventory

---
