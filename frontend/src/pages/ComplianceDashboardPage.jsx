import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';
import {
  getComplianceRequestFileUrl,
  listComplianceRequests,
  updateComplianceRequestStatus
} from '../services/complianceApi';
import ProfileIcon from '../assets/ProfileIcon.png';

function getCurrentUser() {
  const storedUser = localStorage.getItem('nilguard_user');

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch (_error) {
    localStorage.removeItem('nilguard_user');
    return null;
  }
}

function formatDateTime(value) {
  if (!value) {
    return 'Not reviewed yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function ComplianceDashboardPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const fetchRequests = async () => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }

    setIsLoadingRequests(true);

    try {
      const response = await listComplianceRequests(currentUser);
      setRequests(response.requests || []);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load compliance requests.');
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) {
      navigate('/login');
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    fetchRequests();

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [navigate]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests]
  );

  const reviewedRequests = useMemo(
    () => requests.filter((request) => request.status !== 'pending'),
    [requests]
  );

  const handleOpenDocument = (requestId) => {
    setErrorMessage('');
    setSuccessMessage('');
    window.open(getComplianceRequestFileUrl(currentUser, requestId), '_blank', 'noopener,noreferrer');
  };

  const handleReviewRequest = async (requestId, status) => {
    setProcessingRequestId(requestId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await updateComplianceRequestStatus(currentUser, requestId, status);
      setSuccessMessage(response.message || `Request ${status}.`);
      setRequests((previousRequests) =>
        previousRequests.map((request) => (request.id === requestId ? response.request : request))
      );
    } catch (error) {
      setErrorMessage(error.message || 'Unable to update the request status.');
    } finally {
      setProcessingRequestId('');
    }
  };

  return (
    <div className="student-dashboard-container">
      <header className="student-dashboard-header">
        <div className="student-dashboard-header-logo-wrap">
          <img src={logo} alt="NILGuard Logo" className="student-dashboard-header-logo" />
        </div>

        <div className="student-dashboard-title-block">
          <h1>Compliance Dashboard</h1>
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
                  localStorage.removeItem('nilguard_user');
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
            <div className="dashboard-summary-panel">
              <strong>{pendingRequests.length}</strong>
              <span>Pending student submissions awaiting review</span>
            </div>

            {errorMessage ? (
              <p className="contracts-feedback contracts-error">{errorMessage}</p>
            ) : successMessage ? (
              <p className="contracts-feedback contracts-success">{successMessage}</p>
            ) : (
              <p className="contracts-feedback">
                Review student-submitted documents for your assigned school. You can open each file, then accept or reject it.
              </p>
            )}
          </div>
        </div>

        <section className="contracts-column">
          <div className="contracts-column-header">
            <h2>Pending Requests</h2>
          </div>

          <div className="contracts-list">
            {isLoadingRequests ? (
              <div className="contract-card">Loading pending requests...</div>
            ) : pendingRequests.length === 0 ? (
              <div className="contract-card">No pending student submissions.</div>
            ) : (
              pendingRequests.map((request) => (
                <article key={request.id} className="contract-card contract-card-detailed">
                  <div className="contract-card-meta">Request ID: {request.id}</div>
                  <h3>{request.contractFileName}</h3>
                  <p>
                    <strong>Student:</strong> {request.studentEmail}
                  </p>
                  {request.studentSchool && (
                    <p>
                      <strong>School:</strong> {request.studentSchool}
                    </p>
                  )}
                  {request.studentDivision && (
                    <p>
                      <strong>Division:</strong> {request.studentDivision}
                    </p>
                  )}
                  <p>
                    <strong>Contract ID:</strong> {request.contractId}
                  </p>
                  <p>
                    <strong>Submitted:</strong> {formatDateTime(request.submittedAt)}
                  </p>
                  <p>Status: <span className="request-status-pill request-status-pending">Pending</span></p>
                  <div className="contract-action-row">
                    <button type="button" className="contract-action-link" onClick={() => handleOpenDocument(request.id)}>
                      Open PDF
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-accept-button"
                      onClick={() => handleReviewRequest(request.id, 'accepted')}
                      disabled={processingRequestId === request.id}
                    >
                      {processingRequestId === request.id ? 'Saving...' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-reject-button"
                      onClick={() => handleReviewRequest(request.id, 'rejected')}
                      disabled={processingRequestId === request.id}
                    >
                      {processingRequestId === request.id ? 'Saving...' : 'Reject'}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="contracts-column past-contracts-column">
          <div className="contracts-column-header">
            <h2>Reviewed Requests</h2>
          </div>

          <div className="contracts-list contracts-list-compact">
            {isLoadingRequests ? (
              <div className="contract-card">Loading reviewed requests...</div>
            ) : reviewedRequests.length === 0 ? (
              <div className="contract-card">No reviewed submissions yet.</div>
            ) : (
              reviewedRequests.map((request) => (
                <article key={request.id} className="contract-card contract-card-detailed">
                  <div className="contract-card-meta">Request ID: {request.id}</div>
                  <h3>{request.contractFileName}</h3>
                  <p>
                    <strong>Student:</strong> {request.studentEmail}
                  </p>
                  {request.studentSchool && (
                    <p>
                      <strong>School:</strong> {request.studentSchool}
                    </p>
                  )}
                  {request.studentDivision && (
                    <p>
                      <strong>Division:</strong> {request.studentDivision}
                    </p>
                  )}
                  <p>
                    <strong>Contract ID:</strong> {request.contractId}
                  </p>
                  <p>
                    <strong>Submitted:</strong> {formatDateTime(request.submittedAt)}
                  </p>
                  <p>
                    Status:{' '}
                    <span
                      className={`request-status-pill ${
                        request.status === 'accepted' ? 'request-status-accepted' : 'request-status-rejected'
                      }`}
                    >
                      {request.status}
                    </span>
                  </p>
                  <button type="button" className="contract-action-link" onClick={() => handleOpenDocument(request.id)}>
                    Open PDF
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default ComplianceDashboardPage;