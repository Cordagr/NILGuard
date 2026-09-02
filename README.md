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
- **(US-02)** Register an account and await verification by a school representative
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
- Sessions use a JWT stored in an httpOnly cookie that expires after 30 minutes. The user id always comes from the session, never from the request body or headers.
- After 3 failed login attempts the account locks for 15 minutes.
- Register, login, failed logins, and lockouts are written to an `audit_logs` table in PostgreSQL.
- All `/api/contracts`, `/api/rosters`, and `/api/compliance` endpoints require a valid session.

## Local Setup

1. PostgreSQL: any local instance works, for example `docker run -d -p 5432:5432 --name nilguard-postgres -e POSTGRES_PASSWORD=nilguarddev postgres:16`.
2. Create a `.env` file in the project root:
   - `DATABASE_URL=postgres://postgres:nilguarddev@localhost:5432/nilguard`
   - `JWT_SECRET=<any long random string>`
   - Optional: `PORT`, `CORS_ORIGIN`, `JWT_EXPIRES_IN`
3. Backend: `npm install` then `npm run server` (runs on port 5000, creates the tables on first start).
4. Frontend: `cd frontend`, `npm install`, then `npm run dev` (runs on port 5173).
