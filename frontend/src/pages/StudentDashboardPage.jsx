import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/StudentDashboard.css';
import logo from '../assets/NILGUARD.png';
import { getContractFileUrl, listContracts, uploadContract } from '../services/contractApi';

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sortMode, setSortMode] = useState('lastAccessedAt');
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

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
      return;
    }

    if (selectedFile.size > 12 * 1024 * 1024) {
      setErrorMessage('PDF uploads are limited to 12 MB.');
      return;
    }

    setErrorMessage('');
    setIsUploading(true);

    try {
      await uploadContract(currentUser, selectedFile);
      await fetchContracts(sortMode);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to upload the contract.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenContract = async (contractId) => {
    setErrorMessage('');
    window.open(getContractFileUrl(currentUser, contractId), '_blank', 'noopener,noreferrer');

    window.setTimeout(() => {
      fetchContracts(sortMode);
    }, 700);
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
            <svg className="profile-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5Z"
                fill="currentColor"
              />
            </svg>
          </button>

          {menuOpen && (
            <div className="profile-menu-dropdown">
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('nilguard_user');
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
            <h2>My Contracts</h2>
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
                  <button
                    type="button"
                    className="contract-action-link"
                    onClick={() => handleOpenContract(contract.id)}
                  >
                    Open PDF
                  </button>
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
    </div>
  );
}

export default StudentDashboardPage;
