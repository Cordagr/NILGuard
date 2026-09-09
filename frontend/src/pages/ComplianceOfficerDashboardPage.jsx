import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';
import { getComplianceRequestFileUrl, listComplianceRequests, updateComplianceRequestStatus } from '../services/complianceApi';
import { createAccountByCompliance, listComplianceMessages, sendComplianceMessage } from '../services/complianceApi';
import ProfileIcon from '../assets/ProfileIcon.png';

function formatDateTime(value) {
  if (!value) return 'Not accessed yet';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

const NIL_GUIDELINES = [
  ['compensation', 'Compensation clause', 'Confirm compensation, consideration, or payment terms are clear.'],
  ['termination', 'Termination clause', 'Confirm the contract includes a termination date or termination process.'],
  ['governing-law', 'Governing law', 'Confirm the governing law or jurisdiction is specified.'],
  ['signature', 'Signature block', 'Confirm all required parties have a signature or signed section.'],
  ['party-definitions', 'Party definitions', 'Confirm the student and other parties are clearly identified.'],
  ['nil-disclosure', 'NIL disclosure', 'Confirm the contract addresses Name, Image, and Likeness rights.'],
  ['exclusivity', 'Exclusivity statement', 'Confirm exclusivity or non-exclusivity terms are clear.']
].map(([id, title, summary]) => ({ id: `compliance-missing-${id}`, title, summary }));

function getRequestGuidelines(request) {
  return request.guidelines?.length ? request.guidelines : NIL_GUIDELINES.map((guideline) => ({
    ...guideline,
    aiStatus: 'pending',
    decision: null,
    feedback: '',
    dueAt: null
  }));
}

function getGuidelineDraft(request) {
  return getRequestGuidelines(request).reduce((draft, guideline) => {
    draft[guideline.id] = {
      decision: guideline.decision || '',
      feedback: guideline.feedback || '',
      dueAt: guideline.dueAt || ''
    };
    return draft;
  }, {});
}

function formatFileSize(bytes) {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 2 : 1)} MB`;
}

function ComplianceOfficerDashboardPage() {
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
  const [guidelineDrafts, setGuidelineDrafts] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const inboxRef = useRef(null);
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const currentUser = user || { role: 'compliance', school: '', ncaaDivision: '' };

  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState('');
  const [replyRequestId, setReplyRequestId] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [newAccountRole, setNewAccountRole] = useState('student');
  const [createAccountError, setCreateAccountError] = useState('');
  const [createAccountSuccess, setCreateAccountSuccess] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const pendingRequests = requests.filter((request) => request.status === 'pending');
  const reviewedRequests = requests.filter((request) => request.status !== 'pending');
  const unreadMessageCount = messages.filter((item) => !item.isRead).length;

  const handleSendReply = async (event) => {
    event.preventDefault();
    if (!replyRequestId || !replyBody.trim()) return;
    setIsSendingReply(true);
    try {
      await sendComplianceMessage(replyRequestId, 'Reply from compliance', replyBody.trim());
      setReplyBody('');
      setReplyRequestId('');
      await fetchMessages();
    } catch (error) {
      setMessagesError(error.message || 'Unable to send reply.');
    } finally {
      setIsSendingReply(false);
    }
  };

  const fetchRequests = async () => {
    setIsLoadingRequests(true);
    try {
      const response = await listComplianceRequests(currentUser);
      setRequests(response.requests || []);
      setGuidelineDrafts((previousDrafts) => ({
        ...previousDrafts,
        ...(response.requests || []).reduce((drafts, request) => {
          drafts[request.id] = getGuidelineDraft(request);
          return drafts;
        }, {})
      }));
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load contract requests.');
    } finally {
      setIsLoadingRequests(false);
    }
  };

  const handleOpenDocument = (requestId) => {
    setErrorMessage('');
    setSuccessMessage('');
    window.open(getComplianceRequestFileUrl(currentUser, requestId), '_blank', 'noopener,noreferrer');
  };

  const handleGuidelineChange = (requestId, guidelineId, field, value) => {
    setGuidelineDrafts((previousDrafts) => ({
      ...previousDrafts,
      [requestId]: {
        ...previousDrafts[requestId],
        [guidelineId]: {
          ...previousDrafts[requestId]?.[guidelineId],
          [field]: value
        }
      }
    }));
  };

  const handleReviewRequest = async (request, status) => {
    const draft = guidelineDrafts[request.id] || {};
    const guidelines = getRequestGuidelines(request).map((guideline) => ({
      id: guideline.id,
      decision: draft[guideline.id]?.decision || '',
      feedback: draft[guideline.id]?.feedback || '',
      dueAt: draft[guideline.id]?.dueAt || ''
    }));

    if (guidelines.some((guideline) => !guideline.decision)) {
      setErrorMessage('Choose a decision for every NIL guideline before submitting the review.');
      return;
    }

    if (guidelines.some((guideline) => guideline.decision === 'needs_changes' && !guideline.feedback.trim())) {
      setErrorMessage('Add feedback for every guideline marked Needs changes.');
      return;
    }

    setProcessingRequestId(request.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await updateComplianceRequestStatus(currentUser, request.id, status, guidelines);
      setSuccessMessage(response.message || `Request ${status}.`);
      setRequests((previousRequests) =>
        previousRequests.map((item) => (item.id === request.id ? response.request : item))
      );
    } catch (error) {
      setErrorMessage(error.message || 'Unable to update the request status.');
    } finally {
      setProcessingRequestId('');
    }
  };

  const fetchMessages = async () => {
    setIsLoadingMessages(true);
    try {
      const response = await listComplianceMessages();
      setMessages(response.messages || []);
    } catch (error) {
      setMessagesError(error.message || 'Unable to load inbox messages.');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleCreateAccount = async (event) => {
    event.preventDefault();
    setCreateAccountError('');
    setCreateAccountSuccess('');

    if (!newAccountEmail.trim() || !newAccountPassword.trim()) {
      setCreateAccountError('Email and password are required.');
      return;
    }

    setIsCreatingAccount(true);

    try {
      const response = await createAccountByCompliance(newAccountEmail.trim(), newAccountPassword, newAccountRole);
      setCreateAccountSuccess(response.message || 'Account created successfully.');
      setNewAccountEmail('');
      setNewAccountPassword('');
      setNewAccountRole('student');
    } catch (error) {
      setCreateAccountError(error.message || 'Unable to create the account.');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  useEffect(() => {
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
    fetchMessages();
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

        {currentUser?.email ? (
          <span style={{ marginRight: '0.75rem', fontSize: '0.9rem', color: '#555' }}>{currentUser.email}</span>
        ) : null}
        <div className="profile-menu" ref={inboxRef} style={{ marginRight: '0.5rem' }}>
          <button
            type="button"
            className="profile-menu-trigger"
            onClick={() => setIsInboxOpen((prev) => !prev)}
            aria-label="Open inbox"
            style={{ position: 'relative' }}
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 16a2 2 0 0 0 1.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 0 0 8 16ZM8 1.5A3.5 3.5 0 0 0 4.5 5v2.947c0 .346-.102.683-.294.97l-1.703 2.556a.99.99 0 0 0 .824 1.527h9.346a.99.99 0 0 0 .824-1.527l-1.703-2.556a1.75 1.75 0 0 1-.294-.97V5A3.5 3.5 0 0 0 8 1.5Z" />
            </svg>
            {unreadMessageCount > 0 ? (
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  minWidth: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#FF4D00',
                  color: '#fff',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px'
                }}
              >
                {unreadMessageCount}
              </span>
            ) : null}
          </button>

          {isInboxOpen && (
            <div className="profile-menu-dropdown" style={{ minWidth: 340, maxHeight: 420, overflowY: 'auto', right: 0 }}>
              <div style={{ padding: '0.9em 1.4em', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem', borderBottom: '2px solid #F0E6D8' }}>
                Inbox
              </div>
              {messagesError ? (
                <div style={{ padding: '1em 1.4em', fontSize: '0.85rem', color: '#c0392b' }}>{messagesError}</div>
              ) : isLoadingMessages ? (
                <div style={{ padding: '1em 1.4em', fontSize: '0.85rem' }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={{ padding: '1em 1.4em', fontSize: '0.85rem', color: '#999' }}>No messages from students yet.</div>
              ) : (
                messages.map((item) => (
                  <div key={item.id} style={{ padding: '0.9em 1.4em', borderBottom: '1px solid #F0E6D8' }}>
                    <div style={{ fontSize: '0.72rem', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {item.senderEmail}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', margin: '0.2em 0' }}>{item.subject}</div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{item.body}</div>
                    <div style={{ fontSize: '0.72rem', color: '#bbb', marginTop: '0.3em' }}>{formatDateTime(item.createdAt)}</div>
                    {item.requestId ? (
                      <button
                        type="button"
                        className="inbox-reply-button"
                        onClick={() => setReplyRequestId(item.requestId)}
                      >
                        Reply to assigned student
                      </button>
                    ) : null}
                  </div>
                ))
              )}
              {replyRequestId ? (
                <form className="inbox-reply-form" onSubmit={handleSendReply}>
                  <textarea
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                    placeholder="Reply about this assigned contract"
                    rows={3}
                  />
                  <button type="submit" disabled={isSendingReply || !replyBody.trim()}>
                    {isSendingReply ? 'Sending...' : 'Send reply'}
                  </button>
                </form>
              ) : null}
            </div>
          )}
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
                  setIsCreateAccountOpen(true);
                  setMenuOpen(false);
                }}
              >
                Create Account
              </button>
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
            ) : successMessage ? (
              <p className="contracts-feedback contracts-success">{successMessage}</p>
            ) : (
              null
            )}
          </div>
        </div>

        <section className="contracts-column">
          <div className="contracts-column-header">
            <div>
              <h2>Pending Requests</h2>
            </div>
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
                  <p>Student: {request.studentEmail}</p>
                  <p>Submitted: {formatDateTime(request.submittedAt)}</p>
                  <p>Review due: <strong>{formatDateTime(request.reviewDueAt)}</strong></p>
                  <p>Status: <span className="request-status-pill request-status-pending">Pending</span></p>
                  <div className="guideline-review-list">
                    <h4>NIL Guideline Review: Complete These 7 Tasks</h4>
                    {getRequestGuidelines(request).map((guideline) => {
                      const draft = guidelineDrafts[request.id]?.[guideline.id] || {};
                      return (
                        <div key={guideline.id} className="guideline-review-item">
                          <div className="guideline-review-heading">
                            <strong>{guideline.title}</strong>
                            <label>
                              Due
                              <input
                                type="date"
                                value={draft.dueAt ? new Date(draft.dueAt).toISOString().slice(0, 10) : ''}
                                onChange={(event) => handleGuidelineChange(request.id, guideline.id, 'dueAt', event.target.value)}
                                aria-label={`Due date for ${guideline.title}`}
                              />
                            </label>
                          </div>
                          <p>{guideline.summary}</p>
                          <div className="guideline-review-controls">
                            <select
                              value={draft.decision || ''}
                              onChange={(event) => handleGuidelineChange(request.id, guideline.id, 'decision', event.target.value)}
                              aria-label={`Decision for ${guideline.title}`}
                            >
                              <option value="">Select decision</option>
                              <option value="pass">Pass</option>
                              <option value="needs_changes">Needs changes</option>
                            </select>
                            <textarea
                              value={draft.feedback || ''}
                              onChange={(event) => handleGuidelineChange(request.id, guideline.id, 'feedback', event.target.value)}
                              placeholder="Feedback for the student"
                              aria-label={`Feedback for ${guideline.title}`}
                              rows="2"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="contract-action-row">
                    <button type="button" className="contract-action-link" onClick={() => handleOpenDocument(request.id)}>
                      Open PDF
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-accept-button"
                      onClick={() => handleReviewRequest(request, 'accepted')}
                      disabled={processingRequestId === request.id}
                    >
                      {processingRequestId === request.id ? 'Saving...' : 'Accept'}
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-reject-button"
                      onClick={() => handleReviewRequest(request, 'rejected')}
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

        <div className="past-contracts-column">
          <section className="contracts-column">
            <div className="contracts-column-header">
              <h2>Reviewed</h2>
            </div>
            <div className="contracts-list contracts-list-compact">
              {reviewedRequests.length === 0 ? (
                <div className="contract-card">No reviewed requests yet.</div>
              ) : (
                reviewedRequests.map((request) => (
                  <article key={request.id} className="contract-card">
                    <div className="contract-card-meta">Request ID: {request.id}</div>
                    <h3>{request.contractFileName}</h3>
                    <p>Student: {request.studentEmail}</p>
                    <p>
                      Status:{' '}
                      <span className={`request-status-pill request-status-${request.status}`}>
                        {request.status}
                      </span>
                    </p>
                    <div className="contract-action-row">
                      <button type="button" className="contract-action-link" onClick={() => handleOpenDocument(request.id)}>
                        Open PDF
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {isCreateAccountOpen ? (
        <div className="dashboard-dialog-backdrop" role="presentation">
          <div className="dashboard-dialog" role="dialog" aria-modal="true" aria-labelledby="create-account-title">
            <h2 id="create-account-title">Create Account</h2>
            <p className="dashboard-dialog-copy">
              Create a login for a student or coach at your school.
            </p>
            <form onSubmit={handleCreateAccount}>
              <label className="contracts-sort-label">
                Email
                <input
                  type="email"
                  className="dashboard-dialog-input"
                  value={newAccountEmail}
                  onChange={(event) => setNewAccountEmail(event.target.value)}
                  placeholder="student@school.edu"
                />
              </label>
              <label className="contracts-sort-label">
                Temporary Password
                <input
                  type="password"
                  className="dashboard-dialog-input"
                  value={newAccountPassword}
                  onChange={(event) => setNewAccountPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
              <label className="contracts-sort-label">
                Role
                <select
                  className="contracts-sort-select"
                  value={newAccountRole}
                  onChange={(event) => setNewAccountRole(event.target.value)}
                >
                  <option value="student">Student</option>
                  <option value="coach">Coach</option>
                  <option value="compliance">Compliance</option>
                </select>
              </label>

              {createAccountError ? (
                <p className="contracts-feedback contracts-error">{createAccountError}</p>
              ) : createAccountSuccess ? (
                <p className="contracts-feedback contracts-success">{createAccountSuccess}</p>
              ) : null}

              <div className="contract-action-row">
                <button
                  type="button"
                  className="dashboard-secondary-button"
                  onClick={() => {
                    setIsCreateAccountOpen(false);
                    setCreateAccountError('');
                    setCreateAccountSuccess('');
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="dashboard-secondary-button dashboard-accept-button"
                  disabled={isCreatingAccount}
                >
                  {isCreatingAccount ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ComplianceOfficerDashboardPage;
