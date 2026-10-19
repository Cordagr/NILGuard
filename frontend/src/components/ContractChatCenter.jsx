import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  markComplianceMessagesRead,
  sendComplianceMessage
} from '../services/complianceApi';
import './ContractChatCenter.css';

function formatChatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function getTime(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export default function ContractChatCenter({
  isOpen,
  onClose,
  currentUser,
  requests = [],
  messages = [],
  onRefresh,
  loadError = ''
}) {
  const [activeRequestId, setActiveRequestId] = useState('');
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const messagesEndRef = useRef(null);
  const refreshRef = useRef(onRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    refreshRef.current?.();
    const intervalId = window.setInterval(() => refreshRef.current?.(), 15000);
    return () => window.clearInterval(intervalId);
  }, [isOpen]);

  const conversations = useMemo(() => requests
    .map((request) => {
      const threadMessages = messages
        .filter((message) => message.requestId === request.id)
        .sort((left, right) => getTime(left.createdAt) - getTime(right.createdAt));

      return {
        request,
        messages: threadMessages,
        unreadCount: threadMessages.filter((message) =>
          !message.isRead &&
          message.recipientUserId === String(currentUser?.id)
        ).length,
        lastActivity: threadMessages[threadMessages.length - 1]?.createdAt ||
          request.updatedAt ||
          request.submittedAt
      };
    })
    .sort((left, right) => getTime(right.lastActivity) - getTime(left.lastActivity)),
  [currentUser?.id, messages, requests]);

  const activeConversation = conversations.find(
    (conversation) => conversation.request.id === activeRequestId
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!conversations.length) {
      setActiveRequestId('');
      return;
    }

    if (!conversations.some((conversation) => conversation.request.id === activeRequestId)) {
      setActiveRequestId(conversations[0].request.id);
    }
  }, [activeRequestId, conversations, isOpen]);

  useEffect(() => {
    if (!isOpen || !activeRequestId) {
      return;
    }

    let isCurrent = true;
    markComplianceMessagesRead(activeRequestId)
      .then(() => refreshRef.current?.())
      .catch((error) => {
        if (isCurrent) {
          setErrorMessage(error.message || 'Unable to mark chat messages as read.');
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeRequestId, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  const handleSend = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!activeConversation || !body) {
      return;
    }

    setIsSending(true);
    setErrorMessage('');
    try {
      await sendComplianceMessage(
        activeConversation.request.id,
        activeConversation.request.contractFileName || 'Contract discussion',
        body
      );
      setDraft('');
      await refreshRef.current?.();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to send your chat message.');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  const participantEmails = activeConversation?.request.complianceParticipantEmails ||
    (activeConversation?.request.assignedComplianceEmail
      ? [activeConversation.request.assignedComplianceEmail]
      : []);
  const groupMembers = currentUser?.role === 'student'
    ? [currentUser.email, ...participantEmails].filter(Boolean)
    : [activeConversation?.request.studentEmail, ...participantEmails].filter(Boolean);

  return createPortal(
    <div
      className="contract-chat-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="contract-chat-window"
        role="dialog"
        aria-modal="true"
        aria-label="Contract chats"
      >
        <header className="contract-chat-topbar">
          <p>One shared conversation for each submitted contract.</p>
          <button
            type="button"
            className="app-close-button"
            onClick={onClose}
            aria-label="Close chats"
            title="Close chats"
          >
            ×
          </button>
        </header>

        <div className="contract-chat-layout">
          <aside className="contract-chat-sidebar" aria-label="Contract conversations">
            <div className="contract-chat-sidebar-heading">
              <strong>Conversations</strong>
              <span>{conversations.length}</span>
            </div>
            {conversations.length ? (
              <div className="contract-chat-list">
                {conversations.map(({ request, messages: threadMessages, unreadCount }) => {
                  const latestMessage = threadMessages[threadMessages.length - 1];
                  return (
                    <button
                      type="button"
                      key={request.id}
                      className={`contract-chat-list-item${activeRequestId === request.id ? ' is-active' : ''}`}
                      aria-current={activeRequestId === request.id ? 'true' : undefined}
                      onClick={() => {
                        setErrorMessage('');
                        setActiveRequestId(request.id);
                      }}
                    >
                      <span className="contract-chat-list-item-title">
                        {request.contractFileName || 'Contract conversation'}
                      </span>
                      <span className="contract-chat-list-item-subtitle">
                        {currentUser?.role === 'student'
                          ? `${participantEmailsFor(request).length} compliance officer${participantEmailsFor(request).length === 1 ? '' : 's'}`
                          : request.studentEmail}
                      </span>
                      <span className="contract-chat-list-item-preview">
                        {latestMessage?.body || 'No messages yet'}
                      </span>
                      {unreadCount > 0 ? (
                        <span className="contract-chat-unread" aria-label={`${unreadCount} unread messages`}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="contract-chat-empty-list">
                Contract conversations will appear here after a contract is submitted.
              </p>
            )}
          </aside>

          <main className="contract-chat-thread">
            {activeConversation ? (
              <>
                <header className="contract-chat-thread-header">
                  <div>
                    <h3>{activeConversation.request.contractFileName || 'Contract conversation'}</h3>
                    <p>
                      {currentUser?.role === 'student'
                        ? `Lead reviewer: ${activeConversation.request.assignedComplianceEmail || 'Not assigned'}`
                        : `Student: ${activeConversation.request.studentEmail}`}
                      {' · '}{activeConversation.request.status}
                    </p>
                    <small>Members: {groupMembers.join(', ')}</small>
                  </div>
                </header>

                <div className="contract-chat-messages" role="log" aria-label="Conversation messages">
                  {loadError ? (
                    <p className="notification-error" role="alert">{loadError}</p>
                  ) : null}
                  {activeConversation.messages.length ? (
                    activeConversation.messages.map((message) => {
                      const isOwnMessage = message.senderUserId === String(currentUser?.id);
                      return (
                        <article
                          key={message.id}
                          className={`contract-chat-message${isOwnMessage ? ' is-own-message' : ''}`}
                        >
                          <div className="contract-chat-message-meta">
                            <strong>{isOwnMessage ? 'You' : message.senderEmail}</strong>
                            <time dateTime={new Date(message.createdAt).toISOString()}>
                              {formatChatTime(message.createdAt)}
                            </time>
                          </div>
                          <p>{message.body}</p>
                        </article>
                      );
                    })
                  ) : (
                    <p className="contract-chat-empty-thread">
                      Start the conversation with this contract group.
                    </p>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form className="contract-chat-composer" onSubmit={handleSend}>
                  {errorMessage ? (
                    <p className="notification-error" role="alert">{errorMessage}</p>
                  ) : null}
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Message everyone in this contract group..."
                    rows={2}
                    aria-label="Chat message"
                  />
                  <button type="submit" disabled={isSending || !draft.trim()}>
                    {isSending ? 'Sending...' : 'Send'}
                  </button>
                </form>
              </>
            ) : (
              <div className="contract-chat-no-selection">
                <h3>No contract chats yet</h3>
                <p>Submit a contract to create a shared conversation with its compliance group.</p>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>,
    document.body
  );
}

function participantEmailsFor(request) {
  return request.complianceParticipantEmails ||
    (request.assignedComplianceEmail ? [request.assignedComplianceEmail] : []);
}
