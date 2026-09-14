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
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 2 : 1)} MB`;
}

function ComplianceOfficerDashboardPage() {
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState('');

  const menuRef = useRef(null);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const inboxRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [messagesError, setMessagesError] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [conversationReply, setConversationReply] = useState('');
  const [sendingMessageId, setSendingMessageId] = useState('');
  const [newMessage, setNewMessage] = useState({ requestId: '', subject: '', body: '' });
  const [isSendingNewMessage, setIsSendingNewMessage] = useState(false);

  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [newAccountEmail, setNewAccountEmail] = useState('');
  const [newAccountPassword, setNewAccountPassword] = useState('');
  const [newAccountRole, setNewAccountRole] = useState('student');
  const [createAccountError, setCreateAccountError] = useState('');
  const [createAccountSuccess, setCreateAccountSuccess] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const currentUser = useAuth().user || { role: 'compliance', school: '', ncaaDivision: '' };
  const pendingRequests = requests.filter((request) => request.status === 'pending');
  const reviewedRequests = requests.filter((request) => request.status !== 'pending');
  const unreadMessageCount = messages.filter((item) => !item.isRead).length;

  const conversations = Object.values(messages.reduce((groups, message) => {
    const conversationId = message.requestId || message.contractId || message.id;
    if (!groups[conversationId]) {
      groups[conversationId] = {
        id: conversationId,
        studentEmail: message.senderUserId === String(currentUser?.id)
          ? message.recipientEmail
          : message.senderEmail,
        messages: []
      };
    }
    groups[conversationId].messages.push(message);
    return groups;
  }, {}));

  const activeConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId
  );

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

  const handleSendNewMessage = async () => {
    if (!newMessage.requestId || !newMessage.body.trim()) return;

    setIsSendingNewMessage(true);
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

  const reviewedRequests = requests.filter(
    (request) => request.status !== 'pending'
  );

  return (
    <div className={`student-dashboard-container ${isInboxOpen ? 'inbox-overlay-open' : ''}`}>
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

        {currentUser?.email ? (
          <span style={{ marginRight: '0.75rem', fontSize: '0.9rem', color: '#555' }}>{currentUser.email}</span>
        ) : null}
        <div className="profile-menu" ref={inboxRef}>
          <button
            type="button"
            className="profile-menu-trigger inbox-trigger"
            onClick={() => setIsInboxOpen((prev) => !prev)}
            aria-label="Open inbox"
          >
            <span className="inbox-icon" aria-hidden="true" />
            <span>Inbox</span>
            {unreadMessageCount > 0 ? (
              <span className="inbox-unread-badge">
                {unreadMessageCount}
              </span>
            ) : null}
          </button>

          {isInboxOpen && (
            <div className="profile-menu-dropdown student-inbox-dropdown">
              <div className="student-inbox-heading">Student Messages</div>
              <div className="student-inbox-compose">
                <select
                  value={newMessage.requestId}
                  onChange={(event) => setNewMessage((previous) => ({ ...previous, requestId: event.target.value }))}
                >
                  <option value="">Choose a student contract</option>
                  {requests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.studentEmail} · {request.contractFileName}
                    </option>
                  ))}
                </select>
                <input
                  value={newMessage.subject}
                  onChange={(event) => setNewMessage((previous) => ({ ...previous, subject: event.target.value }))}
                  placeholder="Subject"
                />
                <textarea
                  rows="3"
                  value={newMessage.body}
                  onChange={(event) => setNewMessage((previous) => ({ ...previous, body: event.target.value }))}
                  placeholder="Message student and press Enter"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSendNewMessage();
                    }
                  }}
                />
              </div>
              {messagesError ? (
                <div style={{ padding: '1em 1.4em', fontSize: '0.85rem', color: '#c0392b' }}>{messagesError}</div>
              ) : isLoadingMessages ? (
                <div style={{ padding: '1em 1.4em', fontSize: '0.85rem' }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="student-inbox-empty">No messages from students yet.</div>
              ) : (
                <div className="inbox-conversation-list">
                  {conversations.map((conversation) => (
                    <button
                      type="button"
                      className="inbox-conversation"
                      key={conversation.id}
                      aria-expanded={selectedConversationId === conversation.id}
                      onClick={() => setSelectedConversationId((previous) => previous === conversation.id ? '' : conversation.id)}
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
                    <strong>{activeConversation.messages[0].subject}</strong>
                    <span>{activeConversation.studentEmail}</span>
                  </div>
                  <div className="inbox-thread-messages">
                    {activeConversation.messages.map((message) => (
                      <div className={`student-inbox-message ${message.senderUserId === String(currentUser?.id) ? 'message-sent' : 'message-received'}`} key={message.id}>
                        <small className="message-direction">{message.senderUserId === String(currentUser?.id) ? 'You' : message.senderEmail} · {formatDateTime(message.createdAt)}</small>
                        <span>{message.body}</span>
                      </div>
                    ))}
                  </div>
                  <textarea
                    className="inbox-message-reply"
                    value={conversationReply}
                    onChange={(event) => setConversationReply(event.target.value)}
                    placeholder="Reply and press Enter"
                    rows={2}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSendReply(activeConversation);
                      }
                    }}
                  />
                </div>
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

