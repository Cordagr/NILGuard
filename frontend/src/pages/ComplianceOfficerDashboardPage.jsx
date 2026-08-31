import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';
import { getContractFileUrl, listContracts } from '../services/contractApi';
import ProfileIcon from '../assets/ProfileIcon.png';

function formatDateTime(value) {
  if (!value) return 'Not accessed yet';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatFileSize(bytes) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 2 : 1)} MB`;
}

function ComplianceOfficerDashboardPage() {
  const [contracts, setContracts] = useState([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const currentUser = user || { role: 'compliance', school: '', ncaaDivision: '' };

  const fetchContracts = async () => {
    setIsLoadingContracts(true);
    try {
      const response = await listContracts(currentUser, 'lastAccessedAt', 'desc');
      setContracts(response.contracts || []);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load contracts.');
    } finally {
      setIsLoadingContracts(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    fetchContracts();
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="student-dashboard-container">
      <header className="student-dashboard-header">
        <div className="student-dashboard-header-logo-wrap">
          <img src={logo} alt="NILGuard Logo" className="student-dashboard-header-logo" />
        </div>

        <div className="student-dashboard-title-block">
          <h1>Compliance Officer Dashboard</h1>
          {currentUser?.school ? (
            <p className="student-dashboard-identity">{currentUser.school} · {currentUser.ncaaDivision}</p>
          ) : null}
        </div>

        <div className="profile-menu" ref={menuRef}>
          <button
            type="button"
            className="profile-menu-trigger"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Open menu"
          >
            <img src={ProfileIcon} alt="Profile" className="profile-icon-img" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #222', background: '#fff' }} />
          </button>

          {menuOpen && (
            <div className="profile-menu-dropdown">
              <button
                type="button"
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                  navigate('/login');
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="student-dashboard-content">
        <div className="contracts-toolbar">
          <div className="active-contracts-actions-block">
            {errorMessage ? (
              <p className="contracts-feedback contracts-error">{errorMessage}</p>
            ) : (
              <p className="contracts-feedback">
                Showing all student-athlete contracts submitted for compliance review.
              </p>
            )}
          </div>
        </div>

        <section className="contracts-column">
          <div className="contracts-column-header">
            <h2>Received Contracts</h2>
          </div>

          <div className="contracts-list">
            {isLoadingContracts ? (
              <div className="contract-card">Loading contracts...</div>
            ) : contracts.length === 0 ? (
              <div className="contract-card">No contracts submitted for review yet.</div>
            ) : (
              contracts.map((contract) => (
                <article key={contract.id} className="contract-card contract-card-detailed">
                  <div className="contract-card-meta">Contract ID: {contract.id}</div>
                  <h3>{contract.fileName}</h3>
                  <p>Uploaded: {formatDateTime(contract.createdAt)}</p>
                  <p>Last accessed: {formatDateTime(contract.lastAccessedAt)}</p>
                  <p>File size: {formatFileSize(contract.fileSize)}</p>
                  <div className="contract-action-row">
                    <button
                      type="button"
                      className="contract-action-link"
                      onClick={() => window.open(getContractFileUrl(currentUser, contract.id), '_blank', 'noopener,noreferrer')}
                    >
                      View PDF
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="contracts-column past-contracts-column">
          <div className="contracts-column-header">
            <h2>Reviewed</h2>
          </div>
          <div className="contracts-list contracts-list-compact">
            <div className="contract-card">No reviewed contracts yet.</div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default ComplianceOfficerDashboardPage;
