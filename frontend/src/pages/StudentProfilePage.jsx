import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentProfile.css';
import logo from '../assets/NILGUARD.png';

function StudentProfilePage() {
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();

  useEffect(() => {
    if (!currentUser?.id) {
      navigate('/login');
    }
  }, [currentUser?.id, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="student-profile-page">
      <header className="student-profile-header">
        <div className="student-profile-logo-wrap">
          <img src={logo} alt="NILGuard Logo" className="student-profile-logo" />
        </div>

        <div className="student-profile-heading">
          <h1>Profile</h1>
        </div>
      </header>

      <main className="student-profile-content">
        <section className="student-profile-card" aria-label="Student account profile">
          <div className="student-profile-row">
            <span className="student-profile-label">School</span>
            <strong className="student-profile-value">{currentUser?.school || 'No school assigned'}</strong>
          </div>

          <div className="student-profile-row">
            <span className="student-profile-label">Email</span>
            <strong className="student-profile-value">{currentUser?.email || 'No email available'}</strong>
          </div>

          {currentUser?.ncaaDivision ? (
            <div className="student-profile-row">
              <span className="student-profile-label">NCAA Division</span>
              <strong className="student-profile-value">{currentUser.ncaaDivision}</strong>
            </div>
          ) : null}

          <div className="student-profile-actions">
            <button
              type="button"
              className="student-profile-button student-profile-button-secondary"
              onClick={() => navigate('/dashboard/student')}
            >
              Back to Dashboard
            </button>

            <button
              type="button"
              className="student-profile-button student-profile-button-primary"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

export default StudentProfilePage;
