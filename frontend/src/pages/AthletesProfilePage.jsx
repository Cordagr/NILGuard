import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCoachAthlete } from '../services/rosterApi';
import '../styles/pages/AthletesProfilePage.css';

export default function AthleteProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [athlete, setAthlete] = useState(null);
  const [contracts, setContracts] = useState([]); // Ready for real backend data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await getCoachAthlete(user, id);
        setAthlete(data.athlete);
        
        // TODO: Replace with actual API call once the database relationship is clarified
        // const contractData = await getAthleteContracts(user, id);
        // setContracts(contractData.contracts);
      } catch (err) {
        setError(err.message || 'Unable to load athlete profile.');
      } finally {
        setLoading(false);
      }
    }

    if (user && id) {
      fetchProfile();
    }
  }, [user, id]);

  const handleMessageAthlete = () => {
    if (athlete) {
      // Constructs a generated email and opens the default email client
      const athleteEmail = `${athlete.firstName.toLowerCase()}@example.edu`;
      const subject = encodeURIComponent(`NILGuard: Message from Coach ${user.email}`);
      window.location.href = `mailto:${athleteEmail}?subject=${subject}`;
    }
  };

  if (loading) {
    return (
      <div className="athlete-profile-page">
        <div className="profile-loading">Loading athlete profile...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="athlete-profile-page">
        <div className="profile-error notification-error" role="alert">
          <h3>Error Loading Profile</h3>
          <p>{error}</p>
          <button className="profile-back-btn" onClick={() => navigate(-1)} style={{ marginTop: '16px' }}>
            &larr; Go Back
          </button>
        </div>
      </div>
    );
  }

  const initials = `${athlete.firstName?.charAt(0) || ''}${athlete.lastName?.charAt(0) || ''}`.toUpperCase();

  return (
    <div className="athlete-profile-page">
      <div className="profile-container">
        
        <button className="profile-back-btn" onClick={() => navigate(-1)}>
          &larr; BACK TO DASHBOARD
        </button>
        
        {/* HEADER SECTION */}
        <div className="profile-header-card">
          <div className="profile-banner"></div>
          <div className="profile-header-content">
            <div className="profile-avatar-large">{initials}</div>
            <div className="profile-header-text">
              <h1>{athlete.firstName} {athlete.lastName}</h1>
              <p className="profile-school">{athlete.school} • ID: {athlete.studentId}</p>
            </div>
            <div className="profile-header-actions">
              <button className="action-btn primary" onClick={handleMessageAthlete}>
                Message Athlete
              </button>
            </div>
          </div>
        </div>

        {/* GRID LAYOUT */}
        <div className="profile-grid">
          
          {/* LEFT COLUMN: Bio & Roster */}
          <div className="profile-grid-left">
            <div className="profile-card">
              <h3 className="profile-section-title">Roster Assignments</h3>
              {athlete.assignments && athlete.assignments.length > 0 ? (
                <ul className="assignments-list">
                  {athlete.assignments.map((assignment, index) => (
                    <li className="assignment-item" key={index}>
                      <span className="assignment-sport">{assignment.sport}</span>
                      <span className="assignment-year">Class of {assignment.year}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="no-assignments">No active roster assignments found.</p>
              )}
            </div>

            <div className="profile-card">
              <h3 className="profile-section-title">Contact Info</h3>
              <div className="contact-info-row">
                <strong>Email:</strong> {athlete.firstName.toLowerCase()}@example.edu
              </div>
              <div className="contact-info-row">
                <strong>Phone:</strong> (555) 123-4567
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: NIL Activity */}
          <div className="profile-grid-right">
            <div className="profile-card">
              <h3 className="profile-section-title">NIL Compliance Status</h3>
              <div className="status-widget">
                <div className="status-indicator good"></div>
                <div className="status-text">
                  <h4>Eligible to Compete</h4>
                  <p>All current contracts have passed compliance review.</p>
                </div>
              </div>
            </div>

            <div className="profile-card">
              <h3 className="profile-section-title">Recent Contracts</h3>
              <div className="contract-placeholder-list">
                {contracts.length > 0 ? (
                  contracts.map((contract, index) => (
                    <div className="contract-item" key={index}>
                      <div className="contract-brand">{contract.brandPayer || 'Unknown Brand'}</div>
                      <div className="contract-date">
                        Approved {new Date(contract.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="no-assignments">No historical contracts found.</p>
                )}
              </div>
              {contracts.length > 0 && (
                <button className="view-all-btn">View All Contracts &rarr;</button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}