import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/Landing.css';
import logo from '../assets/NILGUARD.png';

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      <div className="landing-content">
        <img src={logo} alt="NILGuard Logo" className="landing-logo" />
        <h1 className="landing-title">Select Your Role To Get Started</h1>
        <div className="landing-divider" />

        <div className="landing-role-grid">
          <button className="landing-role-card" onClick={() => navigate('/dashboard/student')}>
            I'm a Student Athlete
          </button>
          <button className="landing-role-card" onClick={() => navigate('/dashboard/coach')}>
            I'm a Coach
          </button>
          <button className="landing-role-card" onClick={() => navigate('/dashboard/student')}>
            I'm a Compliance Officer
          </button>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
