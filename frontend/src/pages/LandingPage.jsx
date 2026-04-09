import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/Landing.css';
import logo from '../assets/NILGUARD.png';
import { ROLE_LABELS } from '../utils/roleRouting';

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      <div className="landing-content">
        <img src={logo} alt="NILGuard Logo" className="landing-logo" />
        <h1 className="landing-title">Select Your Role To Get Started</h1>
        <div className="landing-divider" />

        <div className="landing-role-grid">
          <button className="landing-role-card" onClick={() => navigate('/login?role=student')}>
            {ROLE_LABELS.student}
          </button>
          <button className="landing-role-card" onClick={() => navigate('/login?role=coach')}>
            {ROLE_LABELS.coach}
          </button>
          <button className="landing-role-card" onClick={() => navigate('/login?role=compliance')}>
            {ROLE_LABELS.compliance}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
