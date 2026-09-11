import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatFileSize(bytes) {
  if (!bytes) {
    return '0 MB';
  }

  return `${(bytes / (1024 * 1024)).toFixed(
    bytes >= 1024 * 1024 ? 2 : 1
  )} MB`;
}

function ComplianceOfficerDashboardPage() {
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState('');

  const menuRef = useRef(null);
  const navigate = useNavigate();

  const { user: currentUser, logout } = useAuth();

  const fetchRequests = async () => {
    if (!currentUser?.id) {
      setErrorMessage('No signed-in compliance officer was found.');
      setIsLoadingRequests(false);
      return;
    }

    setIsLoadingRequests(true);
    setErrorMessage('');

    try {
      // IMPORTANT:
      // Compliance officers need documentRequests, not the
      // contracts owned by the compliance officer themselves.
      const response = await listComplianceRequests(currentUser);

      setRequests(response.requests || []);
    } catch (error) {
      setErrorMessage(
        error.message || 'Unable to load submitted contracts.'
      );
    } finally {
      setIsLoadingRequests(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    fetchRequests();

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  const handleRequestStatus = async (requestId, status) => {
    setUpdatingRequestId(requestId);
    setErrorMessage('');

    try {
      const response = await updateComplianceRequestStatus(
        currentUser,
        requestId,
        status
      );

      setRequests((previousRequests) =>
        previousRequests.map((request) =>
          request.id === requestId
            ? response.request
            : request
        )
      );
    } catch (error) {
      setErrorMessage(
        error.message || 'Unable to update the contract status.'
      );
    } finally {
      setUpdatingRequestId('');
    }
  };

  const pendingRequests = requests.filter(
    (request) => request.status === 'pending'
  );

  const reviewedRequests = requests.filter(
    (request) => request.status !== 'pending'
  );

  return (
    <div className="student-dashboard-container">
      <header className="student-dashboard-header">
        <div className="student-dashboard-header-logo-wrap">
          <img
            src={logo}
            alt="NILGuard Logo"
            className="student-dashboard-header-logo"
          />
        </div>

        <div className="student-dashboard-title-block">
          <h1>Compliance Officer Dashboard</h1>

          {currentUser?.school ? (
            <p className="student-dashboard-identity">
              {currentUser.school} · {currentUser.ncaaDivision}
            </p>
          ) : null}
        </div>

        <div
          className="profile-menu"
          ref={menuRef}
        >
          <button
            type="button"
            className="profile-menu-trigger"
            onClick={() =>
              setMenuOpen((previous) => !previous)
            }
            aria-label="Open menu"
          >
            <img
              src={ProfileIcon}
              alt="Profile"
              className="profile-icon-img"
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid #222',
                background: '#fff'
              }}
            />
          </button>

          {menuOpen && (
            <div className="profile-menu-dropdown">
              <button
                type="button"
                onClick={() => {
                  logout();
                  setMenuOpen(false);
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
              <p className="contracts-feedback contracts-error">
                {errorMessage}
              </p>
            ) : (
              <p className="contracts-feedback">
                Showing contracts that students have submitted
                directly to this compliance officer for review.
              </p>
            )}
          </div>
        </div>

        {/* PENDING / RECEIVED CONTRACTS */}
        <section className="contracts-column">
          <div className="contracts-column-header">
            <h2>Received Contracts</h2>
          </div>

          <div className="contracts-list">
            {isLoadingRequests ? (
              <div className="contract-card">
                Loading submitted contracts...
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="contract-card">
                No contracts submitted for review yet.
              </div>
            ) : (
              pendingRequests.map((request) => (
                <article
                  key={request.id}
                  className="contract-card contract-card-detailed"
                >
                  <div className="contract-card-meta">
                    Request ID: {request.id}
                  </div>

                  <h3>{request.contractFileName}</h3>

                  <p>
                    Student: {request.studentEmail}
                  </p>

                  {request.studentSchool ? (
                    <p>
                      School: {request.studentSchool}
                    </p>
                  ) : null}

                  {request.studentDivision ? (
                    <p>
                      Division: {request.studentDivision}
                    </p>
                  ) : null}

                  <p>
                    Submitted:{' '}
                    {formatDateTime(request.submittedAt)}
                  </p>

                  <p>
                    File size:{' '}
                    {formatFileSize(request.contractFileSize)}
                  </p>

                  <p>
                    Status: {request.status}
                  </p>

                  <div className="contract-action-row">
                    {request.hasSourceFile ? (
                      <button
                        type="button"
                        className="contract-action-link"
                        onClick={() =>
                          window.open(
                            getComplianceRequestFileUrl(
                              currentUser,
                              request.id
                            ),
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                      >
                        View PDF
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-accept-button"
                      onClick={() =>
                        handleRequestStatus(
                          request.id,
                          'accepted'
                        )
                      }
                      disabled={
                        updatingRequestId === request.id
                      }
                    >
                      {updatingRequestId === request.id
                        ? 'Updating...'
                        : 'Accept'}
                    </button>

                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() =>
                        handleRequestStatus(
                          request.id,
                          'rejected'
                        )
                      }
                      disabled={
                        updatingRequestId === request.id
                      }
                    >
                      Reject
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* REVIEWED CONTRACTS */}
        <section className="contracts-column past-contracts-column">
          <div className="contracts-column-header">
            <h2>Reviewed</h2>
          </div>

          <div className="contracts-list contracts-list-compact">
            {reviewedRequests.length === 0 ? (
              <div className="contract-card">
                No reviewed contracts yet.
              </div>
            ) : (
              reviewedRequests.map((request) => (
                <article
                  key={request.id}
                  className="contract-card contract-card-detailed"
                >
                  <div className="contract-card-meta">
                    Request ID: {request.id}
                  </div>

                  <h3>{request.contractFileName}</h3>

                  <p>
                    Student: {request.studentEmail}
                  </p>

                  {request.studentSchool ? (
                    <p>
                      School: {request.studentSchool}
                    </p>
                  ) : null}

                  <p>
                    Submitted:{' '}
                    {formatDateTime(request.submittedAt)}
                  </p>

                  <p>
                    Reviewed:{' '}
                    {formatDateTime(request.reviewedAt)}
                  </p>

                  <p>
                    Status: {request.status}
                  </p>

                  <div className="contract-action-row">
                    {request.hasSourceFile ? (
                      <button
                        type="button"
                        className="contract-action-link"
                        onClick={() =>
                          window.open(
                            getComplianceRequestFileUrl(
                              currentUser,
                              request.id
                            ),
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                      >
                        View PDF
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default ComplianceOfficerDashboardPage;

