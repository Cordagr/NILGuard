import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import { ToastMessage } from './ui/toast';
import {
  markComplianceMessagesRead,
  sendComplianceMessage
} from '../services/complianceApi';
import exitIcon from '../assets/exit.png';
import './ContractChatCenter.css';

function formatChatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function getDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatChatDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (getDayKey(date) === getDayKey(today)) {
    return 'Today';
  }
  if (getDayKey(date) === getDayKey(yesterday)) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function getConversationTimeline(messages) {
  const previousDecisions = new Map();
  const items = [];

  messages.forEach((message) => {
    const isComplianceUpdate = message.type === 'compliance_update' ||
      message.subject === 'NIL guideline review updated';
    if (!isComplianceUpdate) {
      items.push({ type: 'message', key: message.id, message });
      return;
    }

    const guidelines = Array.isArray(message.guidelines) ? message.guidelines : [];
    let changes = message.changes;
    if (!Array.isArray(changes)) {
      changes = [];
      guidelines.forEach((guideline) => {
        const clauseId = String(guideline.id || guideline.title);
        const status = guideline.decision || 'pending';
        const previousStatus = previousDecisions.get(clauseId);
        if (previousStatus !== undefined && previousStatus !== status) {
          changes.push({
            clauseId,
            title: guideline.title,
            previousStatus,
            status
          });
        }
      });
    }

    guidelines.forEach((guideline) => {
      previousDecisions.set(
        String(guideline.id || guideline.title),
        guideline.decision || 'pending'
      );
    });

    changes.forEach((change, index) => {
      items.push({
        type: 'clause-status',
        key: `${message.id}-${change.clauseId || index}`,
        title: change.title || change.clauseTitle || 'Clause',
        status: change.status || change.toStatus || 'pending',
        createdAt: message.createdAt
      });
    });
  });

  return items;
}

function groupTimelineItemsByDay(items) {
  const groups = [];
  items.forEach((item) => {
    const key = getDayKey(item.createdAt || item.message?.createdAt);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        label: formatChatDay(item.createdAt || item.message?.createdAt),
        items: []
      };
      groups.push(group);
    }

    if (item.type === 'message') {
      const previousItem = group.items[group.items.length - 1];
      if (
        previousItem?.type === 'message-group' &&
        previousItem.senderUserId === item.message.senderUserId
      ) {
        previousItem.messages.push(item.message);
      } else {
        group.items.push({
          type: 'message-group',
          key: item.key,
          senderUserId: item.message.senderUserId,
          messages: [item.message]
        });
      }
    } else {
      group.items.push(item);
    }
  });
  return groups;
}

function getUserDisplayName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
}

function getMessageSenderLabel(message, request, currentUser) {
  if (message.senderUserId === String(currentUser?.id)) {
    return getUserDisplayName(currentUser);
  }
  if (message.senderUserId === String(request.studentUserId)) {
    return request.studentDisplayName || 'Student';
  }
  return message.senderUserId === String(request.assignedComplianceUserId)
    ? 'Lead compliance officer'
    : 'Compliance officer';
}

function getConversationMemberDetails(request) {
  const complianceEmails = participantEmailsFor(request);
  const complianceIds = Array.isArray(request.complianceParticipantIds) &&
      request.complianceParticipantIds.length
    ? request.complianceParticipantIds
    : complianceEmails;
  const memberKeys = [request.studentUserId || request.studentEmail, ...complianceIds]
    .filter(Boolean)
    .map(String);
  const emails = [
    request.studentEmail ? `Student: ${request.studentEmail}` : '',
    ...complianceEmails.map((email) => `Compliance officer: ${email}`)
  ].filter(Boolean);

  return {
    count: new Set(memberKeys).size,
    lead: request.assignedComplianceEmail ? 'Compliance officer' : 'Not assigned',
    tooltip: emails.join('\n')
  };
}

function getStatusClass(status) {
  return String(status || 'pending').toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function getStatusLabel(status) {
  return String(status || 'pending')
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getClauseProgress(guidelines) {
  const clauses = Array.isArray(guidelines) ? guidelines : [];
  const passed = clauses.filter((guideline) => guideline.decision === 'pass').length;
  const needsChanges = clauses.filter((guideline) => guideline.decision === 'needs_changes');
  const pendingClause = clauses.find((guideline) =>
    guideline.decision !== 'pass' && guideline.decision !== 'needs_changes'
  );
  return {
    passed,
    total: clauses.length,
    needsChanges,
    pendingClause,
    allPassed: clauses.length > 0 && passed === clauses.length,
    progress: clauses.length ? (passed / clauses.length) * 100 : 0
  };
}

function getInitials(name) {
  return String(name || 'User')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function getTimelineStatusLabel(status) {
  if (status === 'pass') {
    return 'passed';
  }
  if (status === 'needs_changes') {
    return 'needs changes';
  }
  return getStatusLabel(status).toLowerCase();
}

function formatTimelineDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function getDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function getConversationPreview(items) {
  const latestItem = items[items.length - 1];
  if (!latestItem) {
    return 'No messages yet';
  }
  if (latestItem.type === 'clause-status') {
    return `${latestItem.title} marked ${getTimelineStatusLabel(latestItem.status)}`;
  }
  return latestItem.message.body || 'No messages yet';
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
  const draftTextareaRef = useRef(null);
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
        timelineItems: getConversationTimeline(threadMessages),
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
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [activeConversation?.messages.length, activeRequestId, isOpen]);

  useEffect(() => {
    const textarea = draftTextareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [draft, isOpen]);

  const handleSend = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!activeConversation || !body || isSending) {
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

  const handleComposerKeyDown = (event) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    if (!isSending && draft.trim()) {
      event.currentTarget.form?.requestSubmit();
    }
  };

  if (!isOpen) {
    return null;
  }

  const messageGroups = activeConversation
    ? groupTimelineItemsByDay(activeConversation.timelineItems)
    : [];
  const memberDetails = activeConversation
    ? getConversationMemberDetails(activeConversation.request)
    : null;
  const clauseProgress = activeConversation
    ? getClauseProgress(activeConversation.request.guidelines)
    : null;
  const detailsHref = activeConversation
    ? `/contracts/analyze?contractId=${encodeURIComponent(activeConversation.request.contractId || '')}&fileName=${encodeURIComponent(activeConversation.request.contractFileName || '')}`
    : '';

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
        <div className="contract-chat-layout">
          <aside className="contract-chat-sidebar" aria-label="Contract conversations">
            <div className="contract-chat-sidebar-heading">
              <strong>Conversations</strong>
            </div>
            {conversations.length ? (
              <div className="contract-chat-list">
                {conversations.map(({ request, timelineItems, lastActivity, unreadCount }) => {
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
                      <span className="contract-chat-list-title-row">
                        <span className="contract-chat-list-item-title">
                          {request.contractFileName || 'Contract conversation'}
                        </span>
                        {unreadCount > 0 ? (
                          <span
                            className="contract-chat-unread"
                            aria-label={`${unreadCount} unread messages`}
                            title={`${unreadCount} unread messages`}
                          />
                        ) : null}
                      </span>
                      <span className="contract-chat-list-preview-row">
                        <span className="contract-chat-list-item-preview">
                          {getConversationPreview(timelineItems)}
                        </span>
                        <time className="contract-chat-list-time">
                          {formatChatTime(lastActivity)}
                        </time>
                      </span>
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
                  <div className="contract-chat-title-row">
                    <div className="contract-chat-title-content">
                      <h3>{activeConversation.request.contractFileName || 'Contract conversation'}</h3>
                      <span className={`contract-chat-status-pill is-${getStatusClass(activeConversation.request.status)}`}>
                        {getStatusLabel(activeConversation.request.status)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="app-close-button contract-chat-close-button"
                      onClick={onClose}
                      aria-label="Close chats"
                      title="Close chats"
                    >
                      <img src={exitIcon} alt="" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="contract-chat-progress">
                    <div className="contract-chat-progress-copy">
                      <strong>{clauseProgress.passed} of {clauseProgress.total} clauses passed</strong>
                      <div
                        className="contract-chat-progress-track"
                        role="progressbar"
                        aria-label="Contract clauses passed"
                        aria-valuemin="0"
                        aria-valuemax={clauseProgress.total}
                        aria-valuenow={clauseProgress.passed}
                      >
                        <span style={{ width: `${clauseProgress.progress}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className={`contract-chat-clause-alert${clauseProgress.allPassed ? ' is-passed' : ''}`}>
                    {clauseProgress.allPassed ? (
                      <strong>All clauses passed</strong>
                    ) : (
                      <>
                        <span className="contract-chat-alert-dot" aria-hidden="true" />
                        <span className="contract-chat-alert-text">
                          {clauseProgress.needsChanges.length ? (
                            <>
                              Needs changes: <strong>{clauseProgress.needsChanges[0].title || 'Clause'}</strong>
                              {clauseProgress.needsChanges.length > 1
                                ? ` +${clauseProgress.needsChanges.length - 1} more`
                                : ''}
                            </>
                          ) : clauseProgress.pendingClause ? (
                            <>
                              Pending: <strong>{clauseProgress.pendingClause.title || 'Clause'}</strong>
                            </>
                          ) : (
                            'No clauses to review'
                          )}
                        </span>
                      </>
                    )}
                    <Link className="contract-chat-details-link" to={detailsHref}>
                      View details
                    </Link>
                  </div>
                  <p
                    className="contract-chat-members-line"
                    title={memberDetails.tooltip}
                  >
                    {memberDetails.count} members · Lead: {memberDetails.lead}
                  </p>
                </header>

                <div className="contract-chat-messages" role="log" aria-label="Conversation messages">
                  {loadError ? (
                    <ToastMessage message={loadError} variant="error" title="Conversation unavailable" />
                  ) : null}
                  {messageGroups.some((group) => group.items.length) ? (
                    messageGroups.map((group) => (
                      <div className="contract-chat-day-group" key={group.key}>
                        <div className="contract-chat-date-divider">
                          <span>{group.label}</span>
                        </div>
                        {group.items.map((item) => {
                          if (item.type === 'clause-status') {
                            return (
                              <article
                                key={item.key}
                                className="contract-chat-timeline-event"
                              >
                                {item.title} marked {getTimelineStatusLabel(item.status)} · {formatTimelineDate(item.createdAt)}
                              </article>
                            );
                          }

                          const firstMessage = item.messages[0];
                          const lastMessage = item.messages[item.messages.length - 1];
                          const isOwnMessage = item.senderUserId === String(currentUser?.id);
                          const senderLabel = getMessageSenderLabel(
                            firstMessage,
                            activeConversation.request,
                            currentUser
                          );
                          const senderEmail = firstMessage.senderEmail || undefined;
                          return (
                            <article
                              key={item.key}
                              className={`contract-chat-message-group${isOwnMessage ? ' is-own' : ''}`}
                              title={!isOwnMessage ? senderEmail : undefined}
                            >
                              {!isOwnMessage ? (
                                <span className="contract-chat-avatar" aria-hidden="true">
                                  {getInitials(senderLabel)}
                                </span>
                              ) : null}
                              <div className="contract-chat-message-group-content">
                                {!isOwnMessage ? (
                                  <strong className="contract-chat-sender-label">{senderLabel}</strong>
                                ) : null}
                                <div className="contract-chat-message-bubbles">
                                  {item.messages.map((message) => (
                                    <div className="contract-chat-message" key={message.id}>
                                      <p>{message.body}</p>
                                    </div>
                                  ))}
                                </div>
                                <time
                                  className="contract-chat-message-time"
                                  dateTime={getDateTime(lastMessage.createdAt)}
                                  title={new Date(lastMessage.createdAt).toLocaleString()}
                                >
                                  {formatChatTime(lastMessage.createdAt)}
                                </time>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ))
                  ) : (
                    <p className="contract-chat-empty-thread">
                      No messages or clause status changes yet.
                    </p>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="contract-chat-composer-area">
                  {errorMessage ? (
                    <ToastMessage message={errorMessage} variant="error" title="Message could not be sent" />
                  ) : null}
                  <form className="contract-chat-composer" onSubmit={handleSend}>
                    <div className="contract-chat-composer-field">
                      <textarea
                        ref={draftTextareaRef}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder="Message everyone in this contract group..."
                        rows={2}
                        aria-label="Chat message"
                      />
                      <Button
                        type="submit"
                        variant="default"
                        size="sm"
                        className={`contract-chat-send-button${draft.trim() ? ' has-text' : ''}`}
                        disabled={isSending || !draft.trim()}
                        aria-label="Send message"
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </Button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <div className="contract-chat-no-selection">
                <div className="contract-chat-title-row">
                  <h3>No contract chats yet</h3>
                  <button
                    type="button"
                    className="app-close-button contract-chat-close-button"
                    onClick={onClose}
                    aria-label="Close chats"
                    title="Close chats"
                  >
                    <img src={exitIcon} alt="" aria-hidden="true" />
                  </button>
                </div>
                <p>
                  {currentUser?.role === 'compliance'
                    ? 'Conversations appear here after a student submits a contract to you.'
                    : 'Submit a contract to create a shared conversation with its compliance group.'}
                </p>
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
