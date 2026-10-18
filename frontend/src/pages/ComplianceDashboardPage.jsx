import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';
import {
  getComplianceRequestFileUrl,
  listComplianceMessages,
  listComplianceNotifications,
  listComplianceRequests,
  markComplianceNotificationRead,
  sendComplianceMessage,
  updateComplianceRequestStatus
} from '../services/complianceApi';
import ProfileIcon from '../assets/ProfileIcon.png';
import inboxIcon from '../assets/inbox.png';

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
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [validationPopup, setValidationPopup] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [guidelinesByRequestId, setGuidelinesByRequestId] = useState({});
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
  const menuRef = useRef(null);
  const inboxRef = useRef(null);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [inboxError, setInboxError] = useState('');
  const [replyByMessage, setReplyByMessage] = useState({});
  const [sendingReplyId, setSendingReplyId] = useState('');
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);

  const unreadCount =
    messages.filter((message) => !message.isRead).length +
    notifications.filter((notification) => !notification.isRead).length;

  const fetchInbox = async () => {
    setIsLoadingInbox(true);
    try {
      const [messageResponse, notificationResponse] = await Promise.all([
        listComplianceMessages(),
        listComplianceNotifications()
      ]);
      setMessages(messageResponse.messages || []);
      setNotifications(notificationResponse.notifications || []);
      setInboxError('');
    } catch (error) {
      setInboxError(error.message || 'Unable to load inbox.');
    } finally {
      setIsLoadingInbox(false);
    }
  };

  const handleInboxReply = async (message) => {
    const body = (replyByMessage[message.id] || '').trim();
    if (!body || !message.requestId) return;

    setSendingReplyId(message.id);
    setInboxError('');
    try {
      await sendComplianceMessage(
        message.requestId,
        `Re: ${message.subject || 'Contract message'}`,
        body
      );
      setReplyByMessage((previous) => ({ ...previous, [message.id]: '' }));
      await fetchInbox();
    } catch (error) {
      setInboxError(error.message || 'Unable to send reply.');
    } finally {
      setSendingReplyId('');
    }
  };
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();

  const fetchRequests = async () => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }

    setIsLoadingRequests(true);

    try {
      const response = await listComplianceRequests(currentUser);
      const loadedRequests = response.requests || [];
      setRequests(loadedRequests);

      setGuidelinesByRequestId((previous) => {
        const next = { ...previous };

        loadedRequests.forEach((request) => {
          if (!Array.isArray(next[request.id])) {
            next[request.id] = (request.guidelines || []).map((guideline) => ({
              ...guideline,
              decision: guideline.decision || '',
              feedback: guideline.feedback || ''
            }));
          }
        });

        return next;
      });
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
      if (inboxRef.current && !inboxRef.current.contains(event.target)) {
        setIsInboxOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    fetchRequests();
    fetchInbox();

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
    const guidelines = guidelinesByRequestId[requestId] || [];

    const rejectionReason = (rejectionReasons[requestId] || '').trim();

    if (
      status === 'rejected' &&
      guidelines.length > 0 &&
      guidelines.every((guideline) => guideline.decision === 'pass') &&
      !rejectionReason
    ) {
      setValidationPopup(
        'All guidelines pass. Please explain why this contract is still being rejected.'
      );
      return;
    }

    if (guidelines.length === 0) {
      setValidationPopup('No NIL guidelines are available for review.');
      return;
    }

    for (const guideline of guidelines) {
      if (!['pass', 'needs_changes'].includes(guideline.decision)) {
        setValidationPopup(`Please review "${guideline.title}" before continuing.`)
        return;
      }

      if (guideline.decision === 'needs_changes' && !guideline.feedback.trim()) {
        setValidationPopup(`Please provide feedback for "${guideline.title}".`);
        return;
      }
    }

    if (status === 'accepted' && guidelines.some((item) => item.decision !== 'pass')) {
      setValidationPopup('Every NIL guideline must pass before approving this contract.');
      return;
    }

    setProcessingRequestId(requestId);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await updateComplianceRequestStatus(
        currentUser,
        requestId,
        status,
        guidelines,
        rejectionReason
      );

      setSuccessMessage(response.message || `Request ${status}.`);
      setRequests((previousRequests) =>
        previousRequests.map((request) =>
          request.id === requestId ? response.request : request
        )
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

        <div className="profile-menu" ref={inboxRef}>
          <button
            type="button"
            className="profile-menu-trigger inbox-trigger compliance-inbox-trigger"
            onClick={() => setIsInboxOpen((previous) => !previous)}
            aria-label="Open compliance inbox"
            aria-expanded={isInboxOpen}
          >
            <img src={inboxIcon} alt="" aria-hidden="true" className="compliance-inbox-icon" />
            <span>Inbox</span>
            {unreadCount > 0 ? <span className="inbox-unread-badge">{unreadCount}</span> : null}
          </button>

          {isInboxOpen ? (
            <div className="profile-menu-dropdown student-inbox-dropdown compliance-inbox-dropdown">
              <div className="student-inbox-heading">Compliance Notifications</div>
              {isLoadingInbox ? (
                <div className="student-inbox-empty">Loading inbox...</div>
              ) : (
                <>
                  {inboxError ? <div className="compliance-inbox-error" role="alert">{inboxError}</div> : null}
                  {notifications.length === 0 ? (
                    <div className="student-inbox-empty">No notifications yet.</div>
                  ) : notifications.map((notification) => (
                    <button
                      type="button"
                      className={`student-notification ${notification.isRead ? '' : 'student-notification-unread'}`}
                      key={notification.id}
                      onClick={async () => {
                        if (notification.isRead) return;
                        try {
                          await markComplianceNotificationRead(notification.id);
                          setNotifications((previous) => previous.map((item) =>
                            item.id === notification.id ? { ...item, isRead: true } : item
                          ));
                        } catch (error) {
                          setInboxError(error.message || 'Unable to mark notification as read.');
                        }
                      }}
                    >
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                      <small>{notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ''}</small>
                    </button>
                  ))}

                  <div className="student-inbox-heading">Student Messages</div>
                  {messages.length === 0 ? (
                    <div className="student-inbox-empty">No messages yet.</div>
                  ) : (
                    <div className="compliance-inbox-messages">
                      {messages.map((message) => (
                        <div className="inbox-conversation" key={message.id}>
                          <strong>{message.senderEmail || 'Student'}</strong>
                          <small>{message.subject || 'Contract message'}</small>
                          <span>{message.body}</span>
                          <small>{message.createdAt ? new Date(message.createdAt).toLocaleString() : ''}</small>
                          <textarea
                            style={{ resize: 'none' }}
                            rows={2}
                            aria-label={`Reply to ${message.senderEmail || 'student'}`}
                            placeholder="Write a reply..."
                            value={replyByMessage[message.id] || ''}
                            onChange={(event) => setReplyByMessage((previous) => ({
                              ...previous,
                              [message.id]: event.target.value
                            }))}
                          />
                          <button
                            type="button"
                            disabled={Boolean(sendingReplyId) || !(replyByMessage[message.id] || '').trim()}
                            onClick={() => handleInboxReply(message)}
                          >
                            {sendingReplyId === message.id ? 'Sending...' : 'Send Reply'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
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

          {validationPopup && (
            <div
              className="compliance-modal-overlay"
              onClick={() => setValidationPopup('')}
            >
              <div
                className="compliance-validation-modal"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="compliance-validation-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="compliance-validation-icon">!</div>
                <h2 id="compliance-validation-title">Review Required</h2>
                <p>{validationPopup}</p>
                <button
                  type="button"
                  className="compliance-validation-button"
                  onClick={() => setValidationPopup('')}
                >
                  Got it
                </button>
              </div>
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
                  {request.reviewHistory?.length > 0 && (
                    <div className="compliance-review-history">
                      <h4>Previous Review History</h4>
                      {[...request.reviewHistory].reverse().map((review, index) => (
                        <div
                          className="compliance-review-history-entry"
                          key={`${review.reviewedAt || index}-${review.outcome}-${index}`}
                        >
                          <p>
                            <strong>Previous decision:</strong>{' '}
                            <span
                              className={`request-status-pill ${
                                review.outcome === 'accepted'
                                  ? 'request-status-accepted'
                                  : 'request-status-rejected'
                              }`}
                            >
                              {review.outcome}
                            </span>
                          </p>
                          <p>
                            <strong>Reviewed:</strong>{' '}
                            {formatDateTime(review.reviewedAt)}
                          </p>
                          {review.reviewerEmail && (
                            <p>
                              <strong>Reviewer:</strong> {review.reviewerEmail}
                            </p>
                          )}
                          {review.rejectionReason && (
                            <p>
                              <strong>Rejection reason:</strong>{' '}
                              {review.rejectionReason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <p>Status: <span className="request-status-pill request-status-pending">Pending</span></p>


                  <div className="compliance-guidelines">
                    <h4>NIL Compliance Review</h4>
                    {(guidelinesByRequestId[request.id] || []).map((guideline) => (
                      <div className="compliance-guideline-card" key={guideline.id}>
                        <h5>{guideline.title}</h5>
                        <p>{guideline.summary}</p>
                        <p>
                          <strong>Automated screening:</strong>{' '}
                          {guideline.aiStatus || 'pending'}
                        </p>

                        <div className="compliance-guideline-decisions">
                          <label>
                            <input
                              type="radio"
                              name={`decision-${request.id}-${guideline.id}`}
                              checked={guideline.decision === 'pass'}
                              onChange={() =>
                                setGuidelinesByRequestId((previous) => ({
                                  ...previous,
                                  [request.id]: previous[request.id].map((item) =>
                                    item.id === guideline.id
                                      ? { ...item, decision: 'pass', feedback: '' }
                                      : item
                                  )
                                }))
                              }
                            />
                            Pass
                          </label>

                          <label>
                            <input
                              type="radio"
                              name={`decision-${request.id}-${guideline.id}`}
                              checked={guideline.decision === 'needs_changes'}
                              onChange={() =>
                                setGuidelinesByRequestId((previous) => ({
                                  ...previous,
                                  [request.id]: previous[request.id].map((item) =>
                                    item.id === guideline.id
                                      ? { ...item, decision: 'needs_changes' }
                                      : item
                                  )
                                }))
                              }
                            />
                            Needs Changes
                          </label>
                        </div>

                        {guideline.decision === 'needs_changes' && (
                          <label className="compliance-guideline-feedback">
                            Feedback (required)
                            <textarea
                              value={guideline.feedback}
                              onChange={(event) =>
                                setGuidelinesByRequestId((previous) => ({
                                  ...previous,
                                  [request.id]: previous[request.id].map((item) =>
                                    item.id === guideline.id
                                      ? { ...item, feedback: event.target.value }
                                      : item
                                  )
                                }))
                              }
                              placeholder="Explain what needs to be corrected..."
                              rows={3}
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>


                  {(guidelinesByRequestId[request.id] || []).length > 0 &&
                    (guidelinesByRequestId[request.id] || []).every(
                      (guideline) => guideline.decision === 'pass'
                    ) && (
                      <label className="compliance-guideline-feedback">
                        Rejection reason (required if rejecting this contract)
                        <textarea
                          value={rejectionReasons[request.id] || ''}
                          onChange={(event) =>
                            setRejectionReasons((previous) => ({
                              ...previous,
                              [request.id]: event.target.value
                            }))
                          }
                          placeholder="Explain why the contract is being rejected despite passing all guidelines..."
                          rows={3}
                        />
                      </label>
                    )}



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
                  {request.reviewHistory?.length > 0 && (
                    <div className="compliance-review-history">
                      <h4>Previous Review History</h4>
                      {[...request.reviewHistory].reverse().map((review, index) => (
                        <div
                          className="compliance-review-history-entry"
                          key={`${review.reviewedAt || index}-${review.outcome}-${index}`}
                        >
                          <p>
                            <strong>Previous decision:</strong>{' '}
                            <span
                              className={`request-status-pill ${
                                review.outcome === 'accepted'
                                  ? 'request-status-accepted'
                                  : 'request-status-rejected'
                              }`}
                            >
                              {review.outcome}
                            </span>
                          </p>
                          <p>
                            <strong>Reviewed:</strong>{' '}
                            {formatDateTime(review.reviewedAt)}
                          </p>
                          {review.reviewerEmail && (
                            <p>
                              <strong>Reviewer:</strong> {review.reviewerEmail}
                            </p>
                          )}
                          {review.rejectionReason && (
                            <p>
                              <strong>Rejection reason:</strong>{' '}
                              {review.rejectionReason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
