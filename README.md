# NILGuard
Group Number: 2 Group Name: Team Apex Product Name: NIL Guard 
Team Lead: Giancarlo Ramirez 
Team Members: Giancarlo Ramirez, Alfredo Guevara, Adedoyin Omopariola, Samuel Cherry, Gerald Cofie, Aakash Thapa
Selected Project: NIL Guard
Instructor: Diana Rabah
TA: Sai Sri Harsha Chakravarthula
a
## Sprint Requirements & Testing

### At the End of Sprint 1, a User Must Be Able To:
- **(US-01)** Log in securely using valid credentials
- **(US-02)** Register an account after a coach invitation and verify the email address
- **(US-03)** Be assigned a role (Student / Compliance Officer) after verification
- **(US-04)** Access a role-based dashboard after login
- **(US-05)** Create and manage a student profile
- **(US-06)** Upload NIL contracts in PDF or text format
- **(US-07)** View uploaded contracts within the dashboard

**Additional Testing Conducted:**
- Authentication Testing (valid/invalid login scenarios)
- Authorization Testing (role-based access control)
- Input Validation Testing (file upload formats, required fields)
- Basic Security Testing (unauthorized access prevention)
- Usability Testing (dashboard navigation and user flow)

### At the End of Sprint 2, a User Must Be Able To:
- **(US-08)** Analyze uploaded contracts using AI-based processing
- **(US-09)** View flagged risks and compliance issues within contracts
- **(US-10)** Generate and view contract analysis reports
- **(US-11)** Allow compliance officers to review assigned contracts
- **(US-12)** Allow compliance officers to view student profiles and associated documents
- **(US-13)** Track contract status (e.g., pending, reviewed, approved)

**Additional Testing Conducted:**
- Functional Testing (AI analysis workflow and report generation)
- Integration Testing (AI service with backend system)
- Data Validation Testing (correct risk flags and outputs)
- Performance Testing (analysis response time)
- Error Handling Testing (invalid or corrupted contract inputs)

### At the End of Sprint 3, a User Must Be Able To:
- **(US-14)** Generate finalized compliance reports
- **(US-15)** Allow compliance officers to approve or reject contracts
- **(US-16)** Maintain an audit trail of all actions performed in the system
- **(US-17)** Manage rosters and student associations (Admin/Coach role)
- **(US-18)** View historical contracts and reports
- **(US-19)** Access educational modules related to NIL and financial literacy

**Additional Testing Conducted:**
- Security Testing (data protection, role restrictions, secure endpoints)
- Audit & Logging Testing (accuracy of recorded actions)
- System Testing (end-to-end workflows)
- Performance & Load Testing (multiple concurrent users)
- User Acceptance Testing (UAT) (validate system meets user needs)

## Authentication

- Accounts register and log in with an official university `.edu` email address.
- Roles: `student`, `coach`, `school`, and `compliance` (contract reviewers use the compliance role).
- Sessions use a JWT stored in an httpOnly cookie that expires after 45 minutes. The user id always comes from the session, never from the request body or headers.
- After 3 failed login attempts the account locks for 15 minutes.
- Register, login, failed logins, and lockouts are written to the PostgreSQL `audit_logs` table.
- All `/api/contracts`, `/api/rosters`, and `/api/compliance` endpoints require a valid session.

## Local Setup

Requirements: Node.js 18 or later, npm, and PostgreSQL 14 or later. Docker Desktop is the easiest way to run PostgreSQL locally.

1. Start PostgreSQL once:
   ```powershell
   docker run --name nilguard-postgres -e POSTGRES_USER=nilguard -e POSTGRES_PASSWORD=nilguard_dev_password -e POSTGRES_DB=nilguard -p 5432:5432 -d postgres:16
   ```
   On later starts, use `docker start nilguard-postgres`.
2. Copy `.env.example` to `.env` in the project root. Set `JWT_SECRET` to a long random value. The example `DATABASE_URL` matches the Docker command above; keep `DATABASE_SSL=false` for local development.
3. Install and start the backend from the project root:
   ```powershell
   npm install
   npm run server
   ```
   The server listens on `http://localhost:5000` and creates its PostgreSQL tables and indexes at startup.
4. In a second terminal, start the frontend:
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

Athlete sign-up requires a coach-issued roster invite. Email verification is disabled by default for the demo; set `REQUIRE_STUDENT_EMAIL_VERIFICATION=true` to require student email verification again. When enabled, verification emails require SMTP settings in `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. Set `APP_BASE_URL` to the public frontend origin for deployed verification and invite links. Roster CSVs require `student_id,first_name,last_name,email,school,sport,year`; duplicate emails are flagged for coach review, and non-school-domain email addresses produce warnings.

Application records are stored in PostgreSQL JSONB tables. Uploaded contract PDFs and roster CSVs are stored under `server/uploads/` by default. For Render, attach a persistent disk to the server service (for example, mounted at `/var/data`) and set `UPLOADS_DIR=/var/data/uploads`; without a mounted persistent disk, uploaded files can disappear during redeploys or restarts. Files already lost from an ephemeral filesystem cannot be recovered and must be uploaded again. PDF routes remain authenticated, so users must be signed in to view their files. Existing MongoDB records are not imported automatically; a fresh PostgreSQL database starts empty. For a hosted PostgreSQL service, set `DATABASE_URL` to its connection string and set `DATABASE_SSL=true` when the provider requires TLS.
