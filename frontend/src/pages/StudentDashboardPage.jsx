import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';

function StudentDashboardPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="student-dashboard-container">
      <header className="student-dashboard-header">
        <div className="student-dashboard-header-logo-wrap">
          <img src={logo} alt="NILGuard Logo" className="student-dashboard-header-logo" />
        </div>

        <h1>Student-Athlete Dashboard</h1>

        <div className="profile-menu" ref={menuRef}>
          <button
            type="button"
            className="profile-menu-trigger"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Open menu"
          >
            <svg className="profile-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"
                fill="currentColor"
              />
            </svg>
          </button>

          {menuOpen && (
            <div className="profile-menu-dropdown">
              <Link to="/dashboard/student" onClick={() => setMenuOpen(false)}>
                Dashboard
              </Link>
              <Link to="/contracts" onClick={() => setMenuOpen(false)}>
                View Contracts
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/login');
                }}
              >
                Exit
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="student-dashboard-content">
        <section className="contracts-column">
          <div className="active-contracts-actions">
            <button type="button" className="upload-button">
              Upload Contract
            </button>
          </div>
          <h2>Active Contracts</h2>
          <div className="contract-card">No active contracts yet.</div>
        </section>

        <section className="contracts-column past-contracts-column">
          <h2>Past Contracts</h2>
          <div className="contract-card">No past contracts yet.</div>
        </section>
      </main>
    </div>
  );
}

export default StudentDashboardPage;
