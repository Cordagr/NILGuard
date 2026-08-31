import { deleteContract } from '../services/contractApi';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';
import { getContractFileUrl, listContracts, uploadContract } from '../services/contractApi';
import { submitComplianceRequest } from '../services/complianceApi';
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
  const [contracts, setContracts] = useState([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmittingRequestForContractId, setIsSubmittingRequestForContractId] = useState('');
  const [sendDialogContractId, setSendDialogContractId] = useState('');
  const [complianceEmail, setComplianceEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [sortMode, setSortMode] = useState('lastAccessedAt');
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();

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
    fetchContracts();

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [navigate]);

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
                  <div className="contract-card-meta">Contract ID: {contract.id}</div>
                  <h3>{contract.fileName}</h3>
                  <p>Uploaded: {formatDateTime(contract.createdAt)}</p>
                  <p>Last accessed: {formatDateTime(contract.lastAccessedAt)}</p>
                  <p>File size: {formatFileSize(contract.fileSize)}</p>
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
    </div>
  );
}

export default StudentDashboardPage;
