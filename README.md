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
- Register, login, failed logins, and lockouts are written to an `auditLogs` collection in MongoDB.
- All `/api/contracts`, `/api/rosters`, and `/api/compliance` endpoints require a valid session.

## Local Setup

1. MongoDB: any local instance works, for example `docker run -d -p 27017:27017 --name nilguard-mongo mongo:7`.
2. Copy `.env.example` to `.env` in the project root and set the required local values:
   - `MONGODB_URI=mongodb://localhost:27017`
   - `JWT_SECRET=<any long random string>`
   - Optional: `PORT`, `CORS_ORIGIN`, `JWT_EXPIRES_IN`
3. Backend: `npm install` then `npm run server` (runs on port 5000).
4. Frontend: `cd frontend`, `npm install`, then `npm run dev` (runs on port 5173).

## AI Contract Analysis (Backend)

The contract analysis endpoint keeps the existing rule-based report and adds an AI-generated analysis. The current frontend does not display the AI result yet.

### Configure the AI provider

Set the provider key in the project-root `.env` file:

```env
AI_API_KEY=your_api_key_here
```

Do not put a real API key in `.env.example`, source code, or a commit. The root `.env` file is for local secrets and should remain untracked. The backend uses an OpenAI-compatible Chat Completions API. Optional settings are:

```env
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-6-luna
```

`AI_BASE_URL` defaults to the OpenAI API URL shown above, and `AI_MODEL` defaults to `gpt-6-luna`. Use the base URL and model required by your provider if they differ. Restart the backend after changing `.env`.

### Run an analysis

1. Start MongoDB and configure the project-root `.env` file.
2. Start the backend with `npm run server`, then sign in to NILGuard and upload a contract PDF.
3. While signed in, request the contract's analysis endpoint:

   ```text
   GET http://localhost:5000/api/contracts/{contractId}/analysis
   ```

   The request needs the normal authenticated session cookie, and the contract must belong to the signed-in account. The response retains the existing `analysis`, `summary`, and `findings` fields, and adds:

   - `aiStatus`: whether the AI analysis completed, failed, or is unavailable.
   - `aiMessage`: a short status or error message.
   - `aiCacheHit`: whether a saved result was reused.
   - `aiAnalysis`: the structured AI report, or `null` if no report is available.

The first analysis can take a few minutes. Results are cached by PDF content, model, and rubric version. Add `?refresh=true` to request a fresh analysis; this makes another provider request and may incur usage charges. If `AI_API_KEY` is not configured, the endpoint still returns the existing rule-based report and marks AI as unavailable.

Note: the SRS describes PostgreSQL, but the current implementation uses MongoDB.
