import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/pages/StudentDashboard.css';

function ContractsPage() {
  return (
    <div className="student-dashboard-container">
      <header className="student-dashboard-header">
        <h1>Contracts</h1>
        <Link to="/dashboard/student" className="upload-button contracts-back-link">
          Back To Dashboard
        </Link>
      </header>

      <main className="student-dashboard-content contracts-single-column">
        <section className="contracts-column">
          <h2>All Contracts</h2>
          <div className="contract-card">No contracts uploaded yet.</div>
        </section>
      </main>
    </div>
  );
}

export default ContractsPage;
