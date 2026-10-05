import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';
import {
  getComplianceRequestFileUrl,
  listComplianceMessages,
  listComplianceRequests,
  markComplianceMessagesRead,
  saveComplianceGuidelines,
  sendComplianceMessage,
  updateComplianceRequestStatus
} from '../services/complianceApi';
import InboxIcon from '../assets/inbox.png';
import ProfileIcon from '../assets/ProfileIcon.png';

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
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [conversationReply, setConversationReply] = useState('');
  const [sendingMessageId, setSendingMessageId] = useState('');
  const [newMessage, setNewMessage] = useState({ requestId: '', subject: '', body: '' });
  const [isSendingNewMessage, setIsSendingNewMessage] = useState(false);
  const menuRef = useRef(null);
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
      setRequests(response.requests || []);
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
          ? { ...guideline, [key]: value }
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
    setSavingGuidelinesId(requestId);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await saveComplianceGuidelines(
        currentUser,
        requestId,
        guidelineDrafts[requestId]
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

  const handleSelectConversation = async (conversationId) => {
    setSelectedConversationId((previous) => previous === conversationId ? '' : conversationId);
    setConversationReply('');
    if (conversationId === selectedConversationId) return;
    try {
      await markComplianceMessagesRead(conversationId);
      setMessages((previous) => previous.map((message) =>
        message.requestId === conversationId &&
        message.recipientUserId === String(currentUser?.id)
          ? { ...message, isRead: true }
          : message
      ));
    } catch (error) {
      setMessagesError(error.message || 'Unable to mark messages as read.');
    }
  };

  const handleSendNewMessage = async () => {
    if (!newMessage.requestId || !newMessage.body.trim()) {
      setMessagesError('Choose a contract and enter a message.');
      return;
    }

    setIsSendingNewMessage(true);
    setMessagesError('');
    try {
      await sendComplianceMessage(newMessage.requestId, newMessage.subject, newMessage.body);
      setNewMessage({ requestId: '', subject: '', body: '' });
      await fetchMessages();
    } catch (error) {
      setMessagesError(error.message || 'Unable to send message.');
    } finally {
      setIsSendingNewMessage(false);
    }
  };

  const handleSendReply = async (conversation) => {
    const body = conversationReply.trim();
    if (!body) return;

    setSendingMessageId(conversation.id);
    setMessagesError('');
    try {
      const subject = conversation.messages[0]?.subject || 'Re: contract review';
      await sendComplianceMessage(conversation.id, `Re: ${subject}`, body);
      setConversationReply('');
      await fetchMessages();
    } catch (error) {
      setMessagesError(error.message || 'Unable to send reply.');
    } finally {
      setSendingMessageId('');
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
    fetchMessages();

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [navigate]);

  useEffect(() => {
    if (!isInboxOpen) return undefined;
    fetchMessages(true);
    const intervalId = window.setInterval(() => fetchMessages(), 15000);
    return () => window.clearInterval(intervalId);
  }, [isInboxOpen]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests]
  );

  const reviewedRequests = useMemo(
    () => requests.filter((request) => request.status !== 'pending'),
    [requests]
  );
  const unreadMessageCount = messages.filter(
    (message) => !message.isRead && message.recipientUserId === String(currentUser?.id)
  ).length;
  const conversations = useMemo(() => {
    const groups = messages.reduce((result, message) => {
      const conversationId = message.requestId || message.contractId || message.id;
      if (!result[conversationId]) {
        result[conversationId] = {
          id: conversationId,
          studentEmail: message.senderUserId === String(currentUser?.id)
            ? message.recipientEmail
            : message.senderEmail,
          messages: []
        };
      }
      result[conversationId].messages.push(message);
      return result;
    }, {});

    return Object.values(groups).map((conversation) => ({
      ...conversation,
      messages: conversation.messages.sort(
        (left, right) => new Date(left.createdAt) - new Date(right.createdAt)
      )
    }));
  }, [messages, currentUser?.id]);
  const activeConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId
  );

  const fetchMessages = async (showLoading = false) => {
    if (showLoading) setIsLoadingMessages(true);
    setMessagesError('');
    try {
      const response = await listComplianceMessages();
      setMessages(response.messages || []);
    } catch (error) {
      setMessagesError(error.message || 'Unable to load inbox messages.');
    } finally {
      if (showLoading) setIsLoadingMessages(false);
    }
  };

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
      const request = requests.find((item) => item.id === requestId);
      const response = await updateComplianceRequestStatus(
        currentUser,
        requestId,
        status,
        request?.guidelines
      );
      setSuccessMessage(response.message || `Request ${status}.`);
      setRequests((previousRequests) =>
        previousRequests.map((request) => (request.id === requestId ? response.request : request))
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

        <div className="profile-menu">
          <button
            type="button"
            className="profile-menu-trigger inbox-trigger"
            onClick={() => setIsInboxOpen(true)}
            aria-label="Open inbox"
            aria-expanded={isInboxOpen}
          >
            <img className="inbox-icon" src={InboxIcon} alt="" aria-hidden="true" />
            <span>Inbox</span>
            {unreadMessageCount > 0 ? (
              <span className="inbox-unread-badge">{unreadMessageCount}</span>
            ) : null}
          </button>
          {isInboxOpen ? (
            <div className="profile-menu-dropdown student-inbox-dropdown">
              <div className="student-inbox-heading">
                <button
                  type="button"
                  className="student-inbox-close"
                  onClick={() => setIsInboxOpen(false)}
                  aria-label="Close inbox"
                  title="Close inbox"
                >
                  ×
                </button>
              </div>
              <div className="student-inbox-compose">
                <select
                  value={newMessage.requestId}
                  onChange={(event) => setNewMessage((previous) => ({
                    ...previous,
                    requestId: event.target.value
                  }))}
                >
                  <option value="">Choose a contract</option>
                  {requests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.studentEmail} · {request.contractFileName}
                    </option>
                  ))}
                </select>
                <input
                  value={newMessage.subject}
                  onChange={(event) => setNewMessage((previous) => ({
                    ...previous,
                    subject: event.target.value
                  }))}
                  placeholder="Subject"
                />
                <textarea
                  rows="3"
                  value={newMessage.body}
                  onChange={(event) => setNewMessage((previous) => ({
                    ...previous,
                    body: event.target.value
                  }))}
                  placeholder="Message student (Enter to send)"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSendNewMessage();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleSendNewMessage}
                  disabled={isSendingNewMessage}
                >
                  {isSendingNewMessage ? 'Sending...' : 'Send message'}
                </button>
              </div>
              {messagesError ? (
                <div className="student-inbox-empty" role="alert">{messagesError}</div>
              ) : isLoadingMessages ? (
                <div className="student-inbox-empty">Loading messages...</div>
              ) : conversations.length === 0 ? (
                <div className="student-inbox-empty">No messages from students yet.</div>
              ) : (
                <div className="inbox-conversation-list">
                  {conversations.map((conversation) => (
                    <button
                      type="button"
                      className="inbox-conversation"
                      key={conversation.id}
                      aria-expanded={selectedConversationId === conversation.id}
                      onClick={() => handleSelectConversation(conversation.id)}
                    >
                      <strong>{conversation.studentEmail}</strong>
                      <span>{conversation.messages.length} messages</span>
                    </button>
                  ))}
                </div>
              )}
              {activeConversation ? (
                <div className="inbox-thread">
                  <div className="inbox-thread-header">
                    <strong>{activeConversation.messages[0]?.subject}</strong>
                    <span>{activeConversation.studentEmail}</span>
                  </div>
                  <div className="inbox-thread-messages">
                    {activeConversation.messages.map((message) => (
                      <div
                        className={`student-inbox-message ${message.senderUserId === String(currentUser?.id) ? 'message-sent' : 'message-received'}`}
                        key={message.id}
                      >
                        <small className="message-direction">
                          {message.senderUserId === String(currentUser?.id) ? 'You' : message.senderEmail}
                          {' · '}{formatDateTime(message.createdAt)}
                        </small>
                        <span>{message.body}</span>
                      </div>
                    ))}
                  </div>
                  <textarea
                    className="inbox-message-reply"
                    value={conversationReply}
                    onChange={(event) => setConversationReply(event.target.value)}
                    placeholder="Reply (Enter to send)"
                    rows={2}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSendReply(activeConversation);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="inbox-reply-button"
                    disabled={sendingMessageId === activeConversation.id || !conversationReply.trim()}
                    onClick={() => handleSendReply(activeConversation)}
                  >
                    {sendingMessageId === activeConversation.id ? 'Sending...' : 'Send reply'}
                  </button>
                </div>
              ) : null}
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
                const isEditing = editingRequestId === request.id;

                return (
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
                  {isEditing ? (
                    <section className="officer-guideline-editor" aria-label="NIL guideline conditions">
                      <div className="officer-guideline-editor-heading">
                        <div>
                          <h4>NIL guideline conditions</h4>
                          <p>Review every condition and assign a student deadline. Add feedback to each condition marked “Needs changes”; save before accepting or rejecting.</p>
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
                      disabled={isEditing || processingRequestId === request.id || savingGuidelinesId === request.id}
                    >
                      {isEditing ? 'Editing conditions' : 'Edit NIL conditions'}
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-accept-button"
                      onClick={() => handleReviewRequest(request.id, 'accepted')}
                      disabled={processingRequestId === request.id || isEditing || !canApprove}
                    >
                      {processingRequestId === request.id ? 'Saving...' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-reject-button"
                      onClick={() => handleReviewRequest(request.id, 'rejected')}
                      disabled={processingRequestId === request.id || isEditing || !canReject}
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
