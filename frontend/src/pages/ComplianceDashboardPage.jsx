import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ToastMessage } from '../components/ui/toast';
import { CheckCircle2, Clock, ClipboardList, LogOut } from 'lucide-react';
import '../styles/pages/StudentDashboard.css';
import '../styles/pages/CoachRosters.css';
import '../styles/pages/ComplianceDashboard.css';
import { Button } from '../components/ui/button';
import UserAvatar from '../components/UserAvatar';
import ContractChatCenter from '../components/ContractChatCenter';
import MessengerIcon from '../assets/messenger.png';
import logo from '../assets/NILGUARD.png';
import pixelBanner from '../assets/SoccerPixel3.PNG?url';
import {
  getComplianceRequestFileUrl,
  listComplianceMessages,
  listComplianceRequests,
  saveComplianceGuidelines,
  updateComplianceRequestStatus
} from '../services/complianceApi';

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
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState('');
  const [editingRequestId, setEditingRequestId] = useState('');
  const [guidelineDrafts, setGuidelineDrafts] = useState({});
  const [savingGuidelinesId, setSavingGuidelinesId] = useState('');
  const [messages, setMessages] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messagesError, setMessagesError] = useState('');

  const unreadChatCount = messages.filter(
    (message) => !message.isRead && message.recipientUserId === String(currentUser?.id)
  ).length;
  const unreadChatBadgeCount = unreadChatCount > 99 ? '99+' : unreadChatCount;
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

    fetchRequests();
    fetchMessages();
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
    <div className="coach-page">
      <div className="coach-shell compliance-dashboard-shell">
        <aside className="coach-sidebar">
          <a className="coach-brand" href="#overview" aria-label="NILGuard compliance workspace">
            <img src={logo} alt="NILGuard" />
          </a>

          <nav className="coach-sidebar-nav" aria-label="Compliance dashboard">
            <a href="#overview" aria-current="page">Overview</a>
            <a href="#received">Pending submissions</a>
            <a href="#reviewed">Reviewed</a>
            <Link to="/profile">Profile</Link>
          </nav>

          <div className="coach-sidebar-account">
            <UserAvatar src={currentUser?.avatar} alt="" />
            <span className="coach-account-school">{currentUser?.school || 'Compliance account'}</span>
            {currentUser?.email ? <span className="coach-account-email">{currentUser.email}</span> : null}
            <Button
              variant="ghost"
              size="icon"
              className="coach-text-button logout-icon-button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={14} className="logout-action-icon" aria-hidden="true" />
            </Button>
          </div>
        </aside>

        <div className="coach-workspace">
          <header className="coach-workspace-header" id="overview">
            <img className="coach-banner-image" src={pixelBanner} alt="" />
            <div className="coach-banner-content">
              <p className="coach-eyebrow">Contract review</p>
              <h1>Compliance Dashboard</h1>
              <p className="coach-header-context">
                {[currentUser?.school, currentUser?.ncaaDivision].filter(Boolean).join(' · ') || 'Review submitted contracts'}
              </p>
            </div>

        <div className="profile-menu dashboard-communication-actions">
          <button
            type="button"
            className="profile-menu-trigger chat-launch-trigger dashboard-header-control student-dashboard-shared-button shadcn-button shadcn-button-outline shadcn-button-size-default"
            onClick={() => setIsChatOpen(true)}
            aria-label={unreadChatCount > 0
              ? `Open contract chats, ${unreadChatBadgeCount} unread`
              : 'Open contract chats'}
            aria-expanded={isChatOpen}
          >
            <img className="chat-launch-icon" src={MessengerIcon} alt="" aria-hidden="true" />
            <span className="dashboard-header-control-label">Chats</span>
            {unreadChatCount > 0 ? (
              <span className="inbox-unread-badge header-control-badge" aria-hidden="true">{unreadChatBadgeCount}</span>
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

        <div className="profile-menu">
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

          <main className="coach-content">
            <section className="coach-stats" aria-label="Request summary">
              <article className="coach-stat-tile">
                <span className="coach-stat-icon" aria-hidden="true">
                  <Clock strokeWidth={2} />
                </span>
                <div className="coach-stat-copy">
                  <strong>{pendingRequests.length}</strong>
                  <span className="coach-stat-label">Pending</span>
                </div>
              </article>
              <article className="coach-stat-tile">
                <span className="coach-stat-icon" aria-hidden="true">
                  <ClipboardList strokeWidth={2} />
                </span>
                <div className="coach-stat-copy">
                  <strong>{reviewedRequests.length}</strong>
                  <span className="coach-stat-label">Reviewed</span>
                </div>
              </article>
              <article className="coach-stat-tile">
                <span className="coach-stat-icon" aria-hidden="true">
                  <CheckCircle2 strokeWidth={2} />
                </span>
                <div className="coach-stat-copy">
                  <strong>{reviewedRequests.filter((request) => request.status === 'accepted').length}</strong>
                  <span className="coach-stat-label">Accepted</span>
                </div>
              </article>
            </section>
        <div className="contracts-toolbar">
          <div className="active-contracts-actions-block">
            {errorMessage ? (
              <ToastMessage message={errorMessage} variant="error" title="Review action failed" />
            ) : successMessage ? (
              <ToastMessage message={successMessage} variant="success" title="Success" />
          ) : null}
          </div>
        </div>

        <section className="contracts-column" id="received">
          <div className="contracts-column-header">
            <h2>Pending requests <span className="compliance-section-count">{pendingRequests.length}</span></h2>
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
                const canReject = allConditionsReviewed &&
                  allConditionsHaveDeadlines &&
                  needsChangesConditions.length > 0 &&
                  needsChangesConditions.every((guideline) => Boolean(guideline.feedback?.trim()));
                const isLeadReviewer =
                  String(request.assignedComplianceUserId) === String(currentUser?.id);
                const isEditing = editingRequestId === request.id;
                const guidelineClausesLocked = Boolean(request.guidelineClausesLocked);
                const decisionGuidance = isEditing
                  ? 'Save or cancel condition editing before making a final decision.'
                  : conditions.length === 0
                    ? 'Add and save at least one NIL condition before making a decision.'
                    : !allConditionsReviewed
                      ? 'Set a result for each condition, then save.'
                      : !allConditionsHaveDeadlines
                        ? 'Set a student deadline for every condition, then save before making a decision.'
                        : needsChangesConditions.some((guideline) => !guideline.feedback?.trim())
                          ? 'Add officer feedback to every condition marked “Needs changes,” then save.'
                          : canApprove
                            ? 'All conditions meet requirements. You can accept the contract.'
                            : canReject
                              ? 'At least one condition needs changes. You can reject the contract.'
                              : 'Review and save the condition results before making a final decision.';

                return (
                <article key={request.id} className="contract-card contract-card-detailed">
                  <div className="compliance-card-topline">
                    <p className="contract-card-meta">Contract ID: {request.contractId || 'Not assigned'}</p>
                    <div className="compliance-request-date">
                      <strong>Uploaded on:</strong>{' '}
                      <time dateTime={request.submittedAt}>{formatDateTime(request.submittedAt)}</time>
                    </div>
                  </div>
                  <div className="compliance-request-head">
                    <div className="compliance-request-title">
                      <h3>{request.contractFileName}</h3>
                    </div>
                  </div>
                  <p>
                    <strong>Lead reviewer:</strong> {request.assignedComplianceEmail || 'Not assigned'}
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
                          <p>{guidelineClausesLocked
                            ? 'Condition wording is locked. Set a result and deadline for every condition, then save to notify the student. Saving does not finalize the contract; make the Accept or Reject decision afterward.'
                            : 'You can update condition wording once. Set a result and deadline for every condition, then save to notify the student. Saving does not finalize the contract; make the Accept or Reject decision afterward.'}</p>
                        </div>
                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          onClick={() => addGuideline(request.id)}
                          disabled={guidelineClausesLocked || guidelineDrafts[request.id]?.length >= 25}
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
                              disabled={guidelineClausesLocked}
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
                              disabled={guidelineClausesLocked}
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
                              disabled={guidelineClausesLocked}
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
                    <Button
                      type="button"
                      variant="outline"
                      className="compliance-open-pdf-button"
                      onClick={() => handleOpenDocument(request.id)}
                    >
                      Open PDF
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openGuidelineEditor(request)}
                      disabled={!isLeadReviewer || isEditing || processingRequestId === request.id || savingGuidelinesId === request.id}
                    >
                      {isEditing ? 'Editing conditions' : guidelineClausesLocked ? 'Review conditions' : 'Edit NIL conditions'}
                    </Button>
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => handleReviewRequest(request.id, 'accepted')}
                      disabled={!isLeadReviewer || processingRequestId === request.id || isEditing || !canApprove}
                    >
                      {processingRequestId === request.id ? 'Saving...' : 'Accept'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="compliance-reject-button"
                      onClick={() => handleReviewRequest(request.id, 'rejected')}
                      disabled={!isLeadReviewer || processingRequestId === request.id || isEditing || !canReject}
                    >
                      {processingRequestId === request.id ? 'Saving...' : 'Reject'}
                    </Button>
                  </div>
                  <p className="contracts-feedback contract-review-guidance" role="status">
                    {decisionGuidance}
                  </p>
                </article>
                );
              })
            )}
          </div>
        </section>

        <section className="contracts-column past-contracts-column" id="reviewed">
          <div className="contracts-column-header">
            <h2>Reviewed requests <span className="compliance-section-count">{reviewedRequests.length}</span></h2>
          </div>

          <div className="contracts-list contracts-list-compact">
            {isLoadingRequests ? (
              <div className="contract-card">Loading reviewed requests...</div>
            ) : reviewedRequests.length === 0 ? (
              <div className="contract-card">No reviewed submissions yet.</div>
            ) : (
              reviewedRequests.map((request) => (
                <article key={request.id} className="contract-card contract-card-detailed">
                  <p className="contract-card-meta">Contract ID: {request.contractId || 'Not assigned'}</p>
                  <div className="compliance-request-title">
                    <h3>{request.contractFileName}</h3>
                  </div>
                  <p>
                    <strong>Student:</strong> {request.studentName || request.studentEmail}
                  </p>
                  <p>
                    <strong>Lead reviewer:</strong> {request.assignedComplianceEmail || 'Not assigned'}
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
                    <strong>Submitted:</strong> {formatDateTime(request.submittedAt)}
                  </p>
                  {request.reviewHistory?.length > 0 && (
                    <div className="compliance-review-history">
                      <h4>Review history</h4>
                      {[...request.reviewHistory].reverse().map((review, index) => (
                        <div
                          className="compliance-review-history-entry"
                          key={`${review.reviewedAt || index}-${review.outcome}-${index}`}
                        >
                          <p>
                            <strong>Decision:</strong>{' '}
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
                  <div className="contract-action-row">
                    <Button
                      type="button"
                      variant="outline"
                      className="compliance-open-pdf-button"
                      onClick={() => handleOpenDocument(request.id)}
                    >
                      Open PDF
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </main>
        </div>
      </div>
    </div>
  );
}

export default ComplianceDashboardPage;
