import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentDashboard.css';
import ContractChatCenter from '../components/ContractChatCenter';
import MessengerIcon from '../assets/messenger.png';
import logo from '../assets/NILGUARD.png';
import {
  createAccountByCompliance,
  getComplianceRequestFileUrl,
  listComplianceMessages,
  listComplianceNotifications,
  listComplianceRequests,
  markComplianceNotificationRead,
  updateComplianceRequestStatus
} from '../services/complianceApi';
import InboxIcon from '../assets/inbox.png';
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
  const [isChatOpen, setIsChatOpen] = useState(false);
  const notificationsRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [messagesError, setMessagesError] = useState('');

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
  const unreadChatCount = messages.filter(
    (item) => !item.isRead && item.recipientUserId === String(currentUser?.id)
  ).length;
  const unreadNotificationCount = notifications.filter((item) => !item.isRead).length;
  const unreadChatBadgeCount = unreadChatCount > 99 ? '99+' : unreadChatCount;
  const unreadNotificationBadgeCount =
    unreadNotificationCount > 99 ? '99+' : unreadNotificationCount;

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
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target)
      ) {
        setIsInboxOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    fetchRequests();
    fetchNotifications();
    fetchMessages();

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  const fetchMessages = async () => {
    try {
      const response = await listComplianceMessages();
      setMessages(response.messages || []);
      setMessagesError('');
    } catch (error) {
      setMessagesError(error.message || 'Unable to load contract chats.');
    }
  };

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
        <div className="profile-menu dashboard-communication-actions" ref={notificationsRef}>
          <button
            type="button"
            className={`profile-menu-trigger inbox-trigger${unreadNotificationCount > 0 ? ' has-unread' : ''}`}
            onClick={() => {
              setIsInboxOpen((previous) => !previous);
              setIsChatOpen(false);
            }}
            aria-label={unreadNotificationCount > 0
              ? `Open notifications, ${unreadNotificationBadgeCount} unread`
              : 'Open notifications'}
            aria-expanded={isInboxOpen}
          >
            <img className="inbox-icon" src={InboxIcon} alt="" aria-hidden="true" />
            <span>Notifications</span>
            {unreadNotificationCount > 0 ? (
              <span className="inbox-unread-badge" aria-hidden="true">{unreadNotificationBadgeCount}</span>
            ) : null}
          </button>

          {isInboxOpen && (
            <div className="profile-menu-dropdown student-inbox-dropdown">
              <div className="student-inbox-heading">
                <strong>Notifications</strong>
                <button
                  type="button"
                  className="app-close-button"
                  onClick={() => setIsInboxOpen(false)}
                  aria-label="Close inbox"
                  title="Close inbox"
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
          )}
          <button
            type="button"
            className="profile-menu-trigger chat-launch-trigger"
            onClick={() => {
              setIsChatOpen(true);
              setIsInboxOpen(false);
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
              <p className="contracts-feedback contracts-error notification-error" role="alert">
                {errorMessage}
              </p>
            ) : (
              <p className="contracts-feedback">
                Showing contracts submitted to compliance groups you belong to. Only the designated lead reviewer can make the final decision.
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
                  <p>
                    Lead reviewer: {request.assignedComplianceEmail || 'Not assigned'}
                  </p>
                  <p>
                    Group members: {(request.complianceParticipantEmails || []).join(', ')}
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
                  {String(request.assignedComplianceUserId) !== String(currentUser?.id) ? (
                    <p className="contracts-feedback contract-review-guidance">
                      You can discuss this contract with the group. Only {request.assignedComplianceEmail} can accept or reject it.
                    </p>
                  ) : null}

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
                        updatingRequestId === request.id ||
                        String(request.assignedComplianceUserId) !== String(currentUser?.id)
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
                        updatingRequestId === request.id ||
                        String(request.assignedComplianceUserId) !== String(currentUser?.id)
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
