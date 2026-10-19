import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentDashboard.css';
import ContractChatCenter from '../components/ContractChatCenter';
import MessengerIcon from '../assets/messenger.png';
import logo from '../assets/NILGUARD.png';
import {
  getComplianceRequestFileUrl,
  listComplianceMessages,
  listComplianceNotifications,
  listComplianceRequests,
  markComplianceNotificationRead,
  saveComplianceGuidelines,
  updateComplianceRequestStatus
} from '../services/complianceApi';
import InboxIcon from '../assets/inbox.png';
import ProfileIcon from '../assets/ProfileIcon.png';
import inboxIcon from '../assets/inbox.png';

function toInputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function makeGuidelineDrafts(request) {
  return (request.guidelines || []).map((guideline) => ({
    ...guideline,
    decision: guideline.decision || 'pending',
    dueAt: toInputDate(guideline.dueAt || request.reviewDueAt)
  }));
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
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [validationPopup, setValidationPopup] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
  const [editingRequestId, setEditingRequestId] = useState('');
  const [guidelineDrafts, setGuidelineDrafts] = useState({});
  const [savingGuidelinesId, setSavingGuidelinesId] = useState('');
  const [messages, setMessages] = useState([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const menuRef = useRef(null);
  const notificationsRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState('');
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);

  const unreadChatCount = messages.filter(
    (message) => !message.isRead && message.recipientUserId === String(currentUser?.id)
  ).length;
  const unreadNotificationCount = notifications.filter((notification) => !notification.isRead).length;
  const unreadChatBadgeCount = unreadChatCount > 99 ? '99+' : unreadChatCount;
  const unreadNotificationBadgeCount =
    unreadNotificationCount > 99 ? '99+' : unreadNotificationCount;

  const fetchNotifications = async () => {
    setIsLoadingNotifications(true);
    try {
      const response = await listComplianceNotifications();
      setNotifications(response.notifications || []);
      setNotificationsError('');
    } catch (error) {
      setNotificationsError(error.message || 'Unable to load notifications.');
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  const handleOpenNotification = async (notification) => {
    if (notification.isRead) return;

    try {
      await markComplianceNotificationRead(notification.id);
      setNotifications((previous) => previous.map((item) =>
        item.id === notification.id ? { ...item, isRead: true } : item
      ));
    } catch (error) {
      setNotificationsError(error.message || 'Unable to mark notification as read.');
    }
  };
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
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load compliance requests.');
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const openGuidelineEditor = (request) => {
    setGuidelineDrafts((previous) => ({
      ...previous,
      [request.id]: makeGuidelineDrafts(request)
    }));
    setEditingRequestId(request.id);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const updateGuideline = (requestId, index, key, value) => {
    setGuidelineDrafts((previous) => ({
      ...previous,
      [requestId]: previous[requestId].map((guideline, guidelineIndex) =>
        guidelineIndex === index
          ? {
              ...guideline,
              [key]: value,
              ...(
                ['title', 'summary', 'dueAt'].includes(key) && guideline[key] !== value
                  ? { decision: 'pending', feedback: '' }
                  : {}
              )
            }
          : guideline
      )
    }));
  };

  const addGuideline = (requestId) => {
    setGuidelineDrafts((previous) => ({
      ...previous,
      [requestId]: [
        ...previous[requestId],
        {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: '',
          summary: '',
          decision: 'pending',
          feedback: '',
          dueAt: ''
        }
      ]
    }));
  };

  const removeGuideline = (requestId, index) => {
    setGuidelineDrafts((previous) => ({
      ...previous,
      [requestId]: previous[requestId].filter((_, guidelineIndex) => guidelineIndex !== index)
    }));
  };

  const handleSaveGuidelines = async (requestId) => {
    const guidelines = guidelineDrafts[requestId] || [];
    setErrorMessage('');
    setSuccessMessage('');
    for (const [index, guideline] of guidelines.entries()) {
      if (!guideline.title.trim()) {
        setErrorMessage(`Enter a title for condition ${index + 1}.`);
        return;
      }
      if (!guideline.summary.trim()) {
        setErrorMessage(`Describe what the student needs to do for condition ${index + 1}.`);
        return;
      }
      if (!guideline.dueAt) {
        setErrorMessage(`Choose a student deadline for condition ${index + 1}.`);
        return;
      }
      if (guideline.decision === 'needs_changes' && !guideline.feedback.trim()) {
        setErrorMessage(`Add officer feedback for condition ${index + 1} marked “Needs changes”.`);
        return;
      }
    }

    setSavingGuidelinesId(requestId);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await saveComplianceGuidelines(
        currentUser,
        requestId,
        guidelines
      );
      setRequests((previous) =>
        previous.map((request) => request.id === requestId ? response.request : request)
      );
      setGuidelineDrafts((previous) => ({
        ...previous,
        [requestId]: makeGuidelineDrafts(response.request)
      }));
      setEditingRequestId('');
      setSuccessMessage(response.message || 'Guideline conditions saved.');
    } catch (error) {
      setErrorMessage(error.message || 'Unable to save guideline conditions.');
    } finally {
      setSavingGuidelinesId('');
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
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    fetchRequests();
    fetchNotifications();
    fetchMessages();

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
  const fetchMessages = async () => {
    setMessagesError('');
    try {
      const response = await listComplianceMessages();
      setMessages(response.messages || []);
    } catch (error) {
      setMessagesError(error.message || 'Unable to load contract chats.');
    }
  };

  const handleOpenDocument = (requestId) => {
    setErrorMessage('');
    setSuccessMessage('');
    window.open(getComplianceRequestFileUrl(currentUser, requestId), '_blank', 'noopener,noreferrer');
  };

  
  const handleReviewRequest = async (requestId, status) => {
    const request = requests.find((item) => item.id === requestId);
    if (!request) {
      setValidationPopup('This request is no longer available. Refresh the page and try again.');
      return;
    }

    const guidelines = request.guidelines || [];

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

      if (guideline.decision === 'needs_changes' && !(guideline.feedback || '').trim()) {
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
        request?.guidelines
      );
      setSuccessMessage(response.message || `Request ${status}.`);
      setRequests((previousRequests) =>
        previousRequests.map((request) =>
          request.id === requestId ? response.request : request
        )
      );
      setEditingRequestId('');
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

        <div className="profile-menu dashboard-communication-actions" ref={notificationsRef}>
          <button
            type="button"
            className={`profile-menu-trigger inbox-trigger${unreadNotificationCount > 0 ? ' has-unread' : ''}`}
            onClick={() => {
              setIsNotificationsOpen((previous) => !previous);
              setIsChatOpen(false);
            }}
            aria-label={unreadNotificationCount > 0
              ? `Open notifications, ${unreadNotificationBadgeCount} unread`
              : 'Open notifications'}
            aria-expanded={isNotificationsOpen}
          >
            <img className="inbox-icon" src={InboxIcon} alt="" aria-hidden="true" />
            <span>Notifications</span>
            {unreadNotificationCount > 0 ? (
              <span className="inbox-unread-badge" aria-hidden="true">
                {unreadNotificationBadgeCount}
              </span>
            ) : null}
          </button>
          {isNotificationsOpen ? (
            <div className="profile-menu-dropdown student-inbox-dropdown">
              <div className="student-inbox-heading">
                <strong>Notifications</strong>
                <button
                  type="button"
                  className="app-close-button"
                  onClick={() => setIsNotificationsOpen(false)}
                  aria-label="Close notifications"
                  title="Close notifications"
                >
                  ×
                </button>
              </div>
              {notificationsError ? (
                <div className="student-inbox-empty notification-error" role="alert">{notificationsError}</div>
              ) : isLoadingNotifications ? (
                <div className="student-inbox-empty">Loading notifications...</div>
              ) : notifications.length ? (
                <div className="student-notification-list">
                  {notifications.map((notification) => (
                    <button
                      type="button"
                      key={notification.id}
                      className={`student-notification ${notification.isRead ? '' : 'student-notification-unread'}`}
                      onClick={() => handleOpenNotification(notification)}
                    >
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                      <small>{formatDateTime(notification.createdAt)}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="student-inbox-empty">No notifications yet.</div>
              )}
            </div>
          ) : null}
          <button
            type="button"
            className="profile-menu-trigger chat-launch-trigger"
            onClick={() => {
              setIsChatOpen(true);
              setIsNotificationsOpen(false);
            }}
            aria-label={unreadChatCount > 0
              ? `Open contract chats, ${unreadChatBadgeCount} unread`
              : 'Open contract chats'}
            aria-expanded={isChatOpen}
          >
            <img className="chat-launch-icon" src={MessengerIcon} alt="" aria-hidden="true" />
            <span>Chats</span>
            {unreadChatCount > 0 ? (
              <span className="inbox-unread-badge" aria-hidden="true">{unreadChatBadgeCount}</span>
            ) : null}
          </button>
          <ContractChatCenter
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            currentUser={currentUser}
            requests={requests}
            messages={messages}
            onRefresh={fetchMessages}
            loadError={messagesError}
          />
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
              <p className="contracts-feedback contracts-error notification-error" role="alert">{errorMessage}</p>
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
              pendingRequests.map((request) => {
                const conditions = request.guidelines || [];
                const allConditionsReviewed = conditions.length > 0 &&
                  conditions.every((guideline) => ['pass', 'needs_changes'].includes(guideline.decision));
                const allConditionsHaveDeadlines = conditions.every((guideline) => Boolean(guideline.dueAt));
                const canApprove = allConditionsReviewed &&
                  allConditionsHaveDeadlines &&
                  conditions.every((guideline) => guideline.decision === 'pass');
                const needsChangesConditions = conditions.filter(
                  (guideline) => guideline.decision === 'needs_changes'
                );
                const rejectionGuidance = conditions.length === 0
                  ? 'Add and save at least one NIL condition before rejecting.'
                  : !allConditionsReviewed
                    ? 'Review every condition and save before rejecting.'
                    : !allConditionsHaveDeadlines
                      ? 'Set a student deadline for every condition before rejecting.'
                      : needsChangesConditions.length === 0
                        ? 'Mark at least one condition “Needs changes” to reject.'
                        : 'Add feedback to every “Needs changes” condition before rejecting.';
                const canReject = allConditionsReviewed &&
                  allConditionsHaveDeadlines &&
                  needsChangesConditions.length > 0 &&
                  needsChangesConditions.every((guideline) => Boolean(guideline.feedback?.trim()));
                const isLeadReviewer =
                  String(request.assignedComplianceUserId) === String(currentUser?.id);
                const isEditing = editingRequestId === request.id;

                return (
                <article key={request.id} className="contract-card contract-card-detailed">
                  <div className="contract-card-meta">Request ID: {request.id}</div>
                  <h3>{request.contractFileName}</h3>
                  <p>
                    <strong>Student:</strong> {request.studentEmail}
                  </p>
                  <p>
                    <strong>Lead reviewer:</strong> {request.assignedComplianceEmail || 'Not assigned'}
                  </p>
                  <p>
                    <strong>Group members:</strong>{' '}
                    {(request.complianceParticipantEmails || []).join(', ')}
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
                  {!isLeadReviewer ? (
                    <p className="contracts-feedback contract-review-guidance">
                      You can discuss this contract with the group. Only {request.assignedComplianceEmail} can edit conditions or make the final decision.
                    </p>
                  ) : null}
                  {isEditing ? (
                    <section className="officer-guideline-editor" aria-label="NIL guideline conditions">
                      <div className="officer-guideline-editor-heading">
                        <div>
                          <h4>NIL guideline conditions</h4>
                          <p>Editing a condition resets its review result to Pending review. Choose a result after editing, assign a student deadline, and add feedback for each condition marked “Needs changes”. Save to notify the student; accept or reject after saving.</p>
                        </div>
                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          onClick={() => addGuideline(request.id)}
                          disabled={guidelineDrafts[request.id]?.length >= 25}
                        >
                          Add condition
                        </button>
                      </div>
                      {(guidelineDrafts[request.id] || []).map((guideline, index) => (
                        <div className="officer-guideline-item" key={guideline.id}>
                          <div className="officer-guideline-item-heading">
                            <strong>Condition {index + 1}</strong>
                            <button
                              type="button"
                              className="officer-guideline-remove"
                              onClick={() => removeGuideline(request.id, index)}
                            >
                              Remove
                            </button>
                          </div>
                          <label>
                            Condition title
                            <input
                              type="text"
                              maxLength={120}
                              value={guideline.title}
                              onChange={(event) => updateGuideline(request.id, index, 'title', event.target.value)}
                              placeholder="e.g. Disclose the sponsorship on each post"
                              required
                            />
                          </label>
                          <label>
                            What the student needs to do
                            <textarea
                              rows={3}
                              maxLength={2000}
                              value={guideline.summary}
                              onChange={(event) => updateGuideline(request.id, index, 'summary', event.target.value)}
                              placeholder="Describe the condition clearly."
                              required
                            />
                          </label>
                          <div className="officer-guideline-fields">
                            <label>
                              Student deadline
                              <input
                                type="date"
                                value={guideline.dueAt}
                                onChange={(event) => updateGuideline(request.id, index, 'dueAt', event.target.value)}
                                required
                              />
                            </label>
                            <label>
                              Review result
                              <select
                                value={guideline.decision}
                                onChange={(event) => updateGuideline(request.id, index, 'decision', event.target.value)}
                              >
                                <option value="pending">Pending review</option>
                                <option value="pass">Meets condition</option>
                                <option value="needs_changes">Needs changes</option>
                              </select>
                            </label>
                          </div>
                          <label>
                            Officer feedback
                            <textarea
                              rows={2}
                              maxLength={2000}
                              value={guideline.feedback || ''}
                              onChange={(event) => updateGuideline(request.id, index, 'feedback', event.target.value)}
                              placeholder={guideline.decision === 'needs_changes'
                                ? 'Explain the change the student must make.'
                                : 'Optional note for the student.'}
                              required={guideline.decision === 'needs_changes'}
                            />
                          </label>
                        </div>
                      ))}
                      <div className="contract-action-row">
                        <button
                          type="button"
                          className="dashboard-secondary-button dashboard-accept-button"
                          onClick={() => handleSaveGuidelines(request.id)}
                          disabled={savingGuidelinesId === request.id || (guidelineDrafts[request.id] || []).length === 0}
                        >
                          {savingGuidelinesId === request.id ? 'Saving...' : 'Save and notify student'}
                        </button>
                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          onClick={() => setEditingRequestId('')}
                          disabled={savingGuidelinesId === request.id}
                        >
                          Cancel
                        </button>
                      </div>
                    </section>
                  ) : null}
                  <div className="contract-action-row">
                    <button type="button" className="contract-action-link" onClick={() => handleOpenDocument(request.id)}>
                      Open PDF
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() => openGuidelineEditor(request)}
                      disabled={!isLeadReviewer || isEditing || processingRequestId === request.id || savingGuidelinesId === request.id}
                    >
                      {isEditing ? 'Editing conditions' : 'Edit NIL conditions'}
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-accept-button"
                      onClick={() => handleReviewRequest(request.id, 'accepted')}
                      disabled={!isLeadReviewer || processingRequestId === request.id || isEditing || !canApprove}
                    >
                      {processingRequestId === request.id ? 'Saving...' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-reject-button"
                      onClick={() => handleReviewRequest(request.id, 'rejected')}
                      disabled={!isLeadReviewer || processingRequestId === request.id || isEditing || !canReject}
                    >
                      {processingRequestId === request.id ? 'Saving...' : 'Reject'}
                    </button>
                  </div>
                  {!isEditing && !canReject && (
                    <p className="contracts-feedback contract-review-guidance">
                      {rejectionGuidance}
                    </p>
                  )}
                </article>
                );
              })
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
