import { deleteContract } from '../services/contractApi';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';
import { getContractFileUrl, listContracts, uploadContract } from '../services/contractApi';
import { listComplianceMessages, listComplianceRequests, submitComplianceRequest, sendComplianceMessage } from '../services/complianceApi';
import ProfileIcon from '../assets/ProfileIcon.png';

const sortOptions = {
  lastAccessedAt: {
    label: 'Last Accessed',
    sortBy: 'lastAccessedAt',
    sortDirection: 'desc'
  },
  createdAtNewest: {
    label: 'Creation Date: Newest',
    sortBy: 'createdAt',
    sortDirection: 'desc'
  },
  createdAtOldest: {
    label: 'Creation Date: Oldest',
    sortBy: 'createdAt',
    sortDirection: 'asc'
  }
};

function formatDateTime(value) {
  if (!value) {
    return 'Not accessed yet';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatDueDate(value) {
  return value ? formatDateTime(value) : 'N/A';
}

function getReviewDueDate(request) {
  if (request.reviewDueAt) return request.reviewDueAt;
  const submittedAt = request.submittedAt || request.timeline?.find((event) => event.type === 'submitted')?.at;
  return submittedAt ? new Date(new Date(submittedAt).getTime() + 5 * 24 * 60 * 60 * 1000) : null;
}

function getGuidelineDueDate(guideline, request) {
  if (guideline.dueAt) return guideline.dueAt;
  if (['accepted', 'rejected'].includes(request.status)) return getReviewDueDate(request);
  return null;
}

const NIL_GUIDELINES = [
  ['compensation', 'Compensation clause', 'Compensation, consideration, or payment terms.'],
  ['termination', 'Termination clause', 'Termination date or termination process.'],
  ['governing-law', 'Governing law', 'Governing law or jurisdiction.'],
  ['signature', 'Signature block', 'Required signatures from all parties.'],
  ['party-definitions', 'Party definitions', 'Clear identification of the student and other parties.'],
  ['nil-disclosure', 'NIL disclosure', 'Name, Image, and Likeness rights.'],
  ['exclusivity', 'Exclusivity statement', 'Exclusivity or non-exclusivity terms.']
].map(([id, title, summary]) => ({ id: `compliance-missing-${id}`, title, summary }));

function getStudentGuidelines(request) {
  return request.guidelines?.length
    ? request.guidelines
    : NIL_GUIDELINES.map((guideline) => ({
        ...guideline,
        decision: null,
        feedback: '',
        dueAt: null
      }));
}

function getRequestTimeline(request) {
  const timeline = request.timeline?.length
    ? [...request.timeline]
    : request.submittedAt
      ? [{ type: 'submitted', at: request.submittedAt }]
      : [];

  if (
    ['accepted', 'rejected'].includes(request.status) &&
    request.reviewedAt &&
    !timeline.some((event) => event.type === 'closed')
  ) {
    timeline.push({ type: 'closed', outcome: request.status, at: request.reviewedAt });
  }

  return timeline;
}

function getTimelineLabel(event) {
  if (event.type === 'submitted') return 'Submitted to compliance';
  if (event.type === 'opened') return 'Contract opened';
  if (event.type === 'closed' && event.outcome === 'accepted') return 'Review closed: accepted';
  if (event.type === 'closed' && event.outcome === 'rejected') return 'Review closed: changes requested';
  return 'Review activity';
}

function getGuidelineStatus(guideline, requestStatus) {
  if (guideline.decision === 'pass') return 'Passed';
  if (guideline.decision === 'needs_changes') return 'Needs changes';
  if (requestStatus === 'accepted') return 'Passed';
  if (requestStatus === 'rejected') return 'Needs changes';
  return 'Awaiting officer review';
}

function formatFileSize(bytes) {
  if (!bytes) {
    return '0 MB';
  }

  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 1024 * 1024 ? 2 : 1)} MB`;
}

function StudentDashboardPage() {
    const [deletingContractId, setDeletingContractId] = useState('');

    const handleDeleteContract = async (contract) => {
      const confirmed = window.confirm(`Delete contract "${contract.fileName}"? This cannot be undone.`);
      if (!confirmed) return;
      setDeletingContractId(contract.id);
      setErrorMessage('');
      setSuccessMessage('');
      try {
        await deleteContract(currentUser, contract.id);
        setSuccessMessage('Contract deleted successfully.');
        await fetchContracts(sortMode);
      } catch (error) {
        setErrorMessage(error.message || 'Unable to delete the contract.');
      } finally {
        setDeletingContractId('');
      }
    };
  const [menuOpen, setMenuOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messagesError, setMessagesError] = useState('');
  const [contracts, setContracts] = useState([]);
  const [complianceRequests, setComplianceRequests] = useState([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmittingRequestForContractId, setIsSubmittingRequestForContractId] = useState('');
  const [sendDialogContractId, setSendDialogContractId] = useState('');
  const [complianceEmail, setComplianceEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [sortMode, setSortMode] = useState('lastAccessedAt');
  const menuRef = useRef(null);
  const inboxRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();

  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [contactRequestId, setContactRequestId] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactBody, setContactBody] = useState('');
  const [isSendingContact, setIsSendingContact] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactSuccess, setContactSuccess] = useState('');

  const openContactDialog = () => {
    setContactError('');
    setContactSuccess('');
    setContactEmail('');
    setContactRequestId(complianceRequests[0]?.id || '');
    setContactSubject('');
    setContactBody('');
    setIsContactDialogOpen(true);
  };

  const closeContactDialog = () => {
    setIsContactDialogOpen(false);
  };

  const handleSendContactMessage = async (event) => {
    event.preventDefault();
    setContactError('');
    setContactSuccess('');

    if (!contactRequestId || !contactBody.trim()) {
      setContactError('Choose an assigned contract and enter a message.');
      return;
    }

    setIsSendingContact(true);

    try {
      const response = await sendComplianceMessage(contactRequestId, contactSubject.trim(), contactBody.trim());
      setContactSuccess(response.message || 'Message sent.');
      setContactSubject('');
      setContactBody('');
    } catch (error) {
      setContactError(error.message || 'Unable to send the message.');
    } finally {
      setIsSendingContact(false);
    }
  };

  const fetchContracts = async (nextSortMode = sortMode) => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }

    const selectedSort = sortOptions[nextSortMode] || sortOptions.lastAccessedAt;

    setIsLoadingContracts(true);

    try {
      const response = await listContracts(currentUser, selectedSort.sortBy, selectedSort.sortDirection);
      setContracts(response.contracts || []);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load contracts.');
    } finally {
      setIsLoadingContracts(false);
    }
  };

  const fetchComplianceRequests = async () => {
    try {
      const response = await listComplianceRequests(currentUser);
      setComplianceRequests(response.requests || []);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load compliance reviews.');
    }
  };

  const fetchMessages = async () => {
    try {
      const response = await listComplianceMessages();
      setMessages(response.messages || []);
    } catch (error) {
      setMessagesError(error.message || 'Unable to load messages.');
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
    fetchContracts();
    fetchComplianceRequests();
    fetchMessages();
    window.addEventListener('focus', fetchComplianceRequests);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('focus', fetchComplianceRequests);
    };
  }, [navigate]);

  const unreadMessageCount = messages.filter((message) => !message.isRead).length;

  const handleSortChange = async (event) => {
    const nextSortMode = event.target.value;
    setSortMode(nextSortMode);
    await fetchContracts(nextSortMode);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelection = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    const isPdfFile = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');

    if (!isPdfFile) {
      setErrorMessage('Only PDF files can be uploaded.');
      setSuccessMessage('');
      return;
    }

    if (selectedFile.size > 12 * 1024 * 1024) {
      setErrorMessage('PDF uploads are limited to 12 MB.');
      setSuccessMessage('');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsUploading(true);

    try {
      await uploadContract(currentUser, selectedFile);
      setSuccessMessage('Contract uploaded successfully.');
      await fetchContracts(sortMode);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to upload the contract.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenContract = async (contractId) => {
    setErrorMessage('');
    setSuccessMessage('');
    window.open(getContractFileUrl(currentUser, contractId), '_blank', 'noopener,noreferrer');

    window.setTimeout(() => {
      fetchContracts(sortMode);
    }, 700);
  };

  const openSendDialog = (contractId) => {
    setErrorMessage('');
    setSuccessMessage('');
    setComplianceEmail('');
    setSendDialogContractId(contractId);
  };

  const closeSendDialog = () => {
    setSendDialogContractId('');
    setComplianceEmail('');
  };

  const handleSubmitToCompliance = async () => {
    if (!sendDialogContractId) {
      return;
    }

    if (!complianceEmail.trim()) {
      setErrorMessage('Enter a compliance officer email before sending the contract.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmittingRequestForContractId(sendDialogContractId);

    try {
      const response = await submitComplianceRequest(currentUser, sendDialogContractId, complianceEmail.trim());
      setSuccessMessage(response.message || 'Document submitted to compliance.');
      closeSendDialog();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to submit the document to compliance.');
    } finally {
      setIsSubmittingRequestForContractId('');
    }
  };

  return (
    <div className="student-dashboard-container">
      <header className="student-dashboard-header">
        <div className="student-dashboard-header-logo-wrap">
          <img src={logo} alt="NILGuard Logo" className="student-dashboard-header-logo" />
        </div>

        <div className="student-dashboard-title-block">
          <h1>Student-Athlete Dashboard</h1>
          {currentUser?.school ? (
            <p className="student-dashboard-identity">{currentUser.school} · {currentUser.ncaaDivision}</p>
          ) : null}
        </div>

        {currentUser?.email ? (
          <span style={{ marginRight: '0.75rem', fontSize: '0.9rem', color: '#555' }}>{currentUser.email}</span>
        ) : null}
        <div className="profile-menu" ref={inboxRef}>
          <button
            type="button"
            className="profile-menu-trigger"
            onClick={() => setIsInboxOpen((previous) => !previous)}
            aria-label="Open inbox"
            style={{ position: 'relative' }}
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 16a2 2 0 0 0 1.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 0 0 8 16ZM8 1.5A3.5 3.5 0 0 0 4.5 5v2.947c0 .346-.102.683-.294.97l-1.703 2.556a.99.99 0 0 0 .824 1.527h9.346a.99.99 0 0 0 .824-1.527l-1.703-2.556a1.75 1.75 0 0 1-.294-.97V5A3.5 3.5 0 0 0 8 1.5Z" />
            </svg>
            {unreadMessageCount > 0 ? <span className="inbox-unread-badge">{unreadMessageCount}</span> : null}
          </button>
          {isInboxOpen ? (
            <div className="profile-menu-dropdown student-inbox-dropdown">
              <div className="student-inbox-heading">Compliance Inbox</div>
              {messagesError ? (
                <div className="student-inbox-empty">{messagesError}</div>
              ) : messages.length === 0 ? (
                <div className="student-inbox-empty">No messages yet.</div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className="student-inbox-message">
                    <strong>{message.subject}</strong>
                    <span>{message.body}</span>
                    <small>{formatDateTime(message.createdAt)}</small>
                  </div>
                ))
              )}
              {complianceRequests.length > 0 ? (
                <button type="button" className="student-inbox-compose" onClick={openContactDialog}>
                  New message about an assigned contract
                </button>
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
                  openContactDialog();
                  setMenuOpen(false);
                }}
              >
                Contact Compliance
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
            <div className="active-contracts-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="contract-upload-input"
                onChange={handleFileSelection}
              />
              <button type="button" className="upload-button" onClick={handleUploadClick} disabled={isUploading}>
                {isUploading ? 'Screening PDF...' : 'Upload Contract PDF'}
              </button>
            </div>

            {errorMessage ? (
              <p className="contracts-feedback contracts-error">{errorMessage}</p>
            ) : successMessage ? (
              <p className="contracts-feedback contracts-success">{successMessage}</p>
            ) : (
              <p className="contracts-feedback">
                PDF uploads only, up to 12 MB per file. NILGuard screens each PDF and rejects files that do not look like contracts.
              </p>
            )}
          </div>

          <label className="contracts-sort-label contracts-sort-toolbar">
            Sort Current Contracts
            <select className="contracts-sort-select" value={sortMode} onChange={handleSortChange}>
              {Object.entries(sortOptions).map(([value, option]) => (
                <option key={value} value={value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="contracts-column">
          <div className="contracts-column-header">
            <h2>Active Contracts</h2>
          </div>

          <div className="contracts-list">
            {isLoadingContracts ? (
              <div className="contract-card">Loading your contracts...</div>
            ) : contracts.length === 0 ? (
              <div className="contract-card">No contracts uploaded yet.</div>
            ) : (
              contracts.map((contract) => (
                <article key={contract.id} className="contract-card contract-card-detailed">
                  {(() => {
                    const request = complianceRequests.find((item) => item.contractId === contract.id);
                    return (
                      <>
                  <div className="contract-card-meta">Contract ID: {contract.id}</div>
                  <h3>{contract.fileName}</h3>
                  <p>Uploaded: {formatDateTime(contract.createdAt)}</p>
                  <p>Last accessed: {formatDateTime(contract.lastAccessedAt)}</p>
                  <p>File size: {formatFileSize(contract.fileSize)}</p>
                  {request ? (
                    <div className="student-compliance-review">
                      <p>
                        Compliance review: <span className={`request-status-pill request-status-${request.status}`}>{request.status}</span>
                      </p>
                      <p>Review due: <strong>{formatDueDate(getReviewDueDate(request))}</strong></p>
                      <div className="student-guideline-tasks">
                        <h4>Guideline tasks</h4>
                        {getStudentGuidelines(request).map((guideline) => (
                          <div key={guideline.id} className="student-guideline-feedback">
                            <strong>{guideline.title}</strong>
                            <span>{getGuidelineStatus(guideline, request.status)}</span>
                            <span>Due: {formatDueDate(getGuidelineDueDate(guideline, request))}</span>
                            {guideline.feedback ? <p>{guideline.feedback}</p> : null}
                          </div>
                        ))}
                      </div>
                      <div className="student-contract-timeline">
                        <h4>Contract timeline</h4>
                        <ol>
                          {getRequestTimeline(request).map((event, index) => (
                            <li key={`${event.type}-${event.at}-${index}`} className={`timeline-event timeline-event-${event.type}`}>
                              <span className="timeline-event-marker" aria-hidden="true" />
                              <div>
                                <strong>{getTimelineLabel(event)}</strong>
                                <span>{formatDateTime(event.at)}</span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  ) : null}
                  <div className="contract-action-row">
                    <button
                      type="button"
                      className="contract-action-link"
                      onClick={() => handleOpenContract(contract.id)}
                    >
                      Open PDF
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() => navigate(`/contracts/analyze?contractId=${contract.id}&fileName=${encodeURIComponent(contract.fileName)}`)}
                    >
                      Analyze Contract
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() => openSendDialog(contract.id)}
                      disabled={isSubmittingRequestForContractId === contract.id}
                    >
                      {isSubmittingRequestForContractId === contract.id
                        ? 'Sending...'
                        : 'Send to Compliance'}
                    </button>
                    <button
                      type="button"
                      className="dashboard-secondary-button dashboard-delete-button"
                      style={{ color: '#b00020', borderColor: '#b00020', marginLeft: 8 }}
                      onClick={() => handleDeleteContract(contract)}
                      disabled={deletingContractId === contract.id}
                    >
                      {deletingContractId === contract.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                      </>
                    );
                  })()}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="contracts-column past-contracts-column">
          <div className="contracts-column-header">
            <h2>Past Contracts</h2>
          </div>
          <div className="contracts-list contracts-list-compact">
            <div className="contract-card">No past contracts yet.</div>
          </div>
        </section>
      </main>

      {sendDialogContractId ? (
        <div className="dashboard-dialog-backdrop" role="presentation">
          <div className="dashboard-dialog" role="dialog" aria-modal="true" aria-labelledby="send-compliance-title">
            <h2 id="send-compliance-title">Send Contract To Compliance</h2>
            <p className="dashboard-dialog-copy">
              Enter the compliance officer email for your school. NILGuard will only send if that compliance account already exists.
            </p>
            <label className="contracts-sort-label">
              Compliance Officer Email
              <input
                type="email"
                className="dashboard-dialog-input"
                value={complianceEmail}
                onChange={(event) => setComplianceEmail(event.target.value)}
                placeholder="compliance@school.edu"
              />
            </label>
            <div className="contract-action-row">
              <button type="button" className="dashboard-secondary-button" onClick={closeSendDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-secondary-button dashboard-accept-button"
                onClick={handleSubmitToCompliance}
                disabled={isSubmittingRequestForContractId === sendDialogContractId}
              >
                {isSubmittingRequestForContractId === sendDialogContractId ? 'Sending...' : 'Send Contract'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isContactDialogOpen ? (
        <div className="dashboard-dialog-backdrop" role="presentation">
          <div className="dashboard-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-compliance-title">
            <h2 id="contact-compliance-title">Contact Compliance</h2>
            <p className="dashboard-dialog-copy">
              Send a message about one of your assigned contract reviews.
            </p>
            <form onSubmit={handleSendContactMessage}>
              <label className="contracts-sort-label">
                Assigned Contract
                <select
                  className="dashboard-dialog-input"
                  value={contactRequestId}
                  onChange={(event) => setContactRequestId(event.target.value)}
                >
                  <option value="">Select a contract</option>
                  {complianceRequests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {request.contractFileName} ({request.status})
                    </option>
                  ))}
                </select>
              </label>
              <label className="contracts-sort-label">
                Subject
                <input
                  type="text"
                  className="dashboard-dialog-input"
                  value={contactSubject}
                  onChange={(event) => setContactSubject(event.target.value)}
                  placeholder="Question about my contract"
                />
              </label>
              <label className="contracts-sort-label">
                Message
                <textarea
                  className="dashboard-dialog-input"
                  value={contactBody}
                  onChange={(event) => setContactBody(event.target.value)}
                  rows={4}
                />
              </label>

              {contactError ? (
                <p className="contracts-feedback contracts-error">{contactError}</p>
              ) : contactSuccess ? (
                <p className="contracts-feedback contracts-success">{contactSuccess}</p>
              ) : null}

              <div className="contract-action-row">
                <button type="button" className="dashboard-secondary-button" onClick={closeContactDialog}>
                  Close
                </button>
                <button
                  type="submit"
                  className="dashboard-secondary-button dashboard-accept-button"
                  disabled={isSendingContact}
                >
                  {isSendingContact ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default StudentDashboardPage;
