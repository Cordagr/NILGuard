import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import '../styles/pages/StudentDashboard.css';

import logo from '../assets/NILGUARD.png';
import ProfileIcon from '../assets/ProfileIcon.png';

import {
  deleteContract,
  getContractFileUrl,
  listContracts,
  saveContractMetadata as saveContractMetadataToServer,
  uploadContract
} from '../services/contractApi';

import {
  listComplianceRequests,
  submitComplianceRequest
} from '../services/complianceApi';

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

function formatDate(value) {
  if (!value) {
    return 'Not specified';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not specified';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatFileSize(bytes) {
  if (!bytes) {
    return '0 MB';
  }

  return `${(bytes / (1024 * 1024)).toFixed(
    bytes >= 1024 * 1024 ? 2 : 1
  )} MB`;
}

function getMetadataStorageKey(userId, contractId) {
  return `nilguard_contract_metadata_${userId}_${contractId}`;
}

function getContractMetadata(userId, contractId) {
  try {
    const raw = localStorage.getItem(
      getMetadataStorageKey(userId, contractId)
    );

    if (!raw) {
      return {
        athleteName: '',
        brandPayer: '',
        contractValue: '',
        startDate: '',
        endDate: '',
        deliverables: [],
        paymentStatus: 'Not recorded',
        disclosureStatus: 'Pending',
        amendments: []
      };
    }

    const parsed = JSON.parse(raw);

    return {
      athleteName: parsed.athleteName || '',
      brandPayer: parsed.brandPayer || '',
      contractValue: parsed.contractValue || '',
      startDate: parsed.startDate || '',
      endDate: parsed.endDate || '',
      deliverables: Array.isArray(parsed.deliverables)
        ? parsed.deliverables
        : [],
      paymentStatus:
        parsed.paymentStatus || 'Not recorded',
      disclosureStatus:
        parsed.disclosureStatus || 'Pending',
      amendments: Array.isArray(parsed.amendments)
        ? parsed.amendments
        : []
    };
  } catch (_error) {
    return {
      athleteName: '',
      brandPayer: '',
      contractValue: '',
      startDate: '',
      endDate: '',
      deliverables: [],
      paymentStatus: 'Not recorded',
      disclosureStatus: 'Pending',
      amendments: []
    };
  }
}

function saveContractMetadata(userId, contractId, metadata) {
  localStorage.setItem(
    getMetadataStorageKey(userId, contractId),
    JSON.stringify(metadata)
  );
}

function getComplianceRequestForContract(
  complianceRequests,
  contractId
) {
  return complianceRequests.find(
    (request) => request.contractId === contractId
  );
}

function getContractStatus(complianceRequest) {
  if (!complianceRequest) {
    return 'Not Submitted';
  }

  if (complianceRequest.status === 'accepted') {
    return 'Accepted';
  }

  if (complianceRequest.status === 'rejected') {
    return 'Rejected';
  }

  return 'Pending Review';
}

function getDisclosureStatus(
  metadata,
  complianceRequest
) {
  if (complianceRequest?.status === 'accepted') {
    return 'Compliant';
  }

  if (complianceRequest?.status === 'rejected') {
    return 'Non-Compliant';
  }

  return metadata?.disclosureStatus || 'Pending';
}

function buildTimeline(
  contract,
  complianceRequest,
  metadata
) {
  const events = [];

  if (contract.createdAt) {
    events.push({
      id: `uploaded-${contract.id}`,
      type: 'Contract Uploaded',
      date: contract.createdAt,
      description:
        'The NIL agreement was uploaded to NILGuard.'
    });
  }

  if (complianceRequest?.submittedAt) {
    events.push({
      id: `submitted-${complianceRequest.id}`,
      type: 'Submitted to Compliance',
      date: complianceRequest.submittedAt,
      description: complianceRequest.assignedComplianceEmail
        ? `Submitted to ${complianceRequest.assignedComplianceEmail}.`
        : 'Submitted to the assigned compliance officer.'
    });
  }

  if (
    complianceRequest?.reviewedAt &&
    complianceRequest.status === 'accepted'
  ) {
    events.push({
      id: `accepted-${complianceRequest.id}`,
      type: 'Compliance Approved',
      date: complianceRequest.reviewedAt,
      description: complianceRequest.reviewerEmail
        ? `Approved by ${complianceRequest.reviewerEmail}.`
        : 'Approved by the compliance officer.'
    });
  }

  if (
    complianceRequest?.reviewedAt &&
    complianceRequest.status === 'rejected'
  ) {
    events.push({
      id: `rejected-${complianceRequest.id}`,
      type: 'Compliance Rejected',
      date: complianceRequest.reviewedAt,
      description: complianceRequest.reviewerEmail
        ? `Rejected by ${complianceRequest.reviewerEmail}.`
        : 'Rejected by the compliance officer.'
    });
  }

  if (metadata?.amendments?.length) {
    metadata.amendments.forEach((amendment, index) => {
      events.push({
        id: `amendment-${contract.id}-${index}`,
        type: 'Contract Amendment',
        date: amendment.date,
        description:
          amendment.notes ||
          'Contract amendment or change recorded.'
      });
    });
  }

  return events.sort(
    (a, b) =>
      new Date(a.date).getTime() -
      new Date(b.date).getTime()
  );
}

function StudentDashboardPage() {
  const navigate = useNavigate();

  const currentUser = getCurrentUser();

  const menuRef = useRef(null);
  const fileInputRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);

  const [contracts, setContracts] = useState([]);
  const [complianceRequests, setComplianceRequests] =
    useState([]);

  const [isLoadingContracts, setIsLoadingContracts] =
    useState(true);

  const [isLoadingHistory, setIsLoadingHistory] =
    useState(true);

  const [isUploading, setIsUploading] =
    useState(false);

  const [deletingContractId, setDeletingContractId] =
    useState('');

  const [
    isSubmittingRequestForContractId,
    setIsSubmittingRequestForContractId
  ] = useState('');

  const [sendDialogContractId, setSendDialogContractId] =
    useState('');

  const [complianceEmail, setComplianceEmail] =
    useState('');

  const [errorMessage, setErrorMessage] =
    useState('');

  const [successMessage, setSuccessMessage] =
    useState('');

  const [sortMode, setSortMode] =
    useState('lastAccessedAt');

  const [selectedHistoricalContractId, setSelectedHistoricalContractId] =
    useState('');

  const [metadataDialogContractId, setMetadataDialogContractId] =
    useState('');

  const [metadataForm, setMetadataForm] = useState({
    athleteName: '',
    brandPayer: '',
    contractValue: '',
    startDate: '',
    endDate: '',
    deliverablesText: '',
    paymentStatus: 'Not recorded',
    disclosureStatus: 'Pending'
  });

  const [amendmentForm, setAmendmentForm] = useState({
    date: '',
    notes: ''
  });

  const [metadataVersion, setMetadataVersion] = useState(0);

  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  const fetchContracts = async (
    nextSortMode = sortMode
  ) => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }

    const selectedSort =
      sortOptions[nextSortMode] ||
      sortOptions.lastAccessedAt;

    setIsLoadingContracts(true);

    try {
      const response = await listContracts(
        currentUser,
        selectedSort.sortBy,
        selectedSort.sortDirection
      );

      setContracts(response.contracts || []);
    } catch (error) {
      setErrorMessage(
        error.message || 'Unable to load contracts.'
      );
    } finally {
      setIsLoadingContracts(false);
    }
  };

  const fetchComplianceRequests = async () => {
    if (!currentUser?.id) {
      return;
    }

    setIsLoadingHistory(true);

    try {
      const response =
        await listComplianceRequests(currentUser);

      setComplianceRequests(
        response.requests || []
      );
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Unable to load compliance history.'
      );
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) {
      navigate('/login');
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    fetchContracts();
    fetchComplianceRequests();

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
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

    const isPdfFile =
      selectedFile.type === 'application/pdf' ||
      selectedFile.name
        .toLowerCase()
        .endsWith('.pdf');

    if (!isPdfFile) {
      setErrorMessage(
        'Only PDF files can be uploaded.'
      );
      setSuccessMessage('');
      return;
    }

    if (selectedFile.size > 12 * 1024 * 1024) {
      setErrorMessage(
        'PDF uploads are limited to 12 MB.'
      );
      setSuccessMessage('');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsUploading(true);

    try {
      const response = await uploadContract(
        currentUser,
        selectedFile
      );

      const uploadedContract = response.contract;

      if (uploadedContract?.id) {
        const serverMetadata =
          uploadedContract.agreementMetadata || {
            athleteName: '',
            brandPayer: '',
            contractValue: '',
            startDate: '',
            endDate: '',
            deliverables: [],
            paymentStatus: 'Not recorded',
            disclosureStatus: 'Pending',
            amendments: []
          };

        saveContractMetadata(
          currentUser.id,
          uploadedContract.id,
          serverMetadata
        );
      }

      setSuccessMessage(
        'Contract uploaded successfully. Add its agreement details from the Historical NIL Agreements section.'
      );

      await fetchContracts(sortMode);
      await fetchComplianceRequests();
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Unable to upload the contract.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenContract = async (
    contractId
  ) => {
    setErrorMessage('');
    setSuccessMessage('');

    window.open(
      getContractFileUrl(
        currentUser,
        contractId
      ),
      '_blank',
      'noopener,noreferrer'
    );

    window.setTimeout(() => {
      fetchContracts(sortMode);
    }, 700);
  };

  const handleDeleteContract = async (
    contract
  ) => {
    const confirmed = window.confirm(
      `Delete contract "${contract.fileName}"? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingContractId(contract.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await deleteContract(
        currentUser,
        contract.id
      );

      localStorage.removeItem(
        getMetadataStorageKey(
          currentUser.id,
          contract.id
        )
      );

      setSuccessMessage(
        'Contract deleted successfully.'
      );

      if (
        selectedHistoricalContractId ===
        contract.id
      ) {
        setSelectedHistoricalContractId('');
      }

      await fetchContracts(sortMode);
      await fetchComplianceRequests();
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Unable to delete the contract.'
      );
    } finally {
      setDeletingContractId('');
    }
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
      setErrorMessage(
        'Enter a compliance officer email before sending the contract.'
      );
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    setIsSubmittingRequestForContractId(
      sendDialogContractId
    );

    try {
      const response =
        await submitComplianceRequest(
          currentUser,
          sendDialogContractId,
          complianceEmail.trim()
        );

      setSuccessMessage(
        response.message ||
          'Document submitted to compliance.'
      );

      closeSendDialog();

      await fetchComplianceRequests();
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Unable to submit the document to compliance.'
      );
    } finally {
      setIsSubmittingRequestForContractId('');
    }
  };

  const openMetadataDialog = (contract) => {
    const metadata = getContractMetadata(
      currentUser.id,
      contract.id
    );

    setMetadataDialogContractId(contract.id);

    setMetadataForm({
      athleteName: metadata.athleteName,
      brandPayer: metadata.brandPayer,
      contractValue: metadata.contractValue,
      startDate: metadata.startDate,
      endDate: metadata.endDate,
      deliverablesText:
        metadata.deliverables.join('\n'),
      paymentStatus:
        metadata.paymentStatus,
      disclosureStatus:
        metadata.disclosureStatus
    });

    setAmendmentForm({
      date: '',
      notes: ''
    });

    setErrorMessage('');
    setSuccessMessage('');
  };

  const closeMetadataDialog = () => {
    setMetadataDialogContractId('');
  };

  const handleSaveMetadata = async () => {
    if (!metadataDialogContractId) {
      return;
    }

    const existingMetadata =
      getContractMetadata(
        currentUser.id,
        metadataDialogContractId
      );

    const deliverables =
      metadataForm.deliverablesText
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);

    const nextMetadata = {
      athleteName:
        metadataForm.athleteName.trim(),

      brandPayer:
        metadataForm.brandPayer.trim(),
      contractValue:
        metadataForm.contractValue.trim(),
      startDate:
        metadataForm.startDate || '',
      endDate:
        metadataForm.endDate || '',
      deliverables,
      paymentStatus:
        metadataForm.paymentStatus,
      disclosureStatus:
        metadataForm.disclosureStatus,
      amendments:
        existingMetadata.amendments || []
    };

    setIsSavingMetadata(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response =
        await saveContractMetadataToServer(
          currentUser,
          metadataDialogContractId,
          nextMetadata
        );

      const savedContract = response.contract;
      const savedMetadata =
        savedContract?.agreementMetadata ||
        nextMetadata;

      saveContractMetadata(
        currentUser.id,
        metadataDialogContractId,
        savedMetadata
      );

      if (savedContract) {
        setContracts((previous) =>
          previous.map((contract) =>
            contract.id === savedContract.id
              ? { ...contract, ...savedContract }
              : contract
          )
        );
      }

      setMetadataVersion((value) => value + 1);
      setSuccessMessage(
        response.message ||
          'Agreement details saved successfully.'
      );
      closeMetadataDialog();
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Unable to save agreement details.'
      );
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const handleAddAmendment = async () => {
    if (!metadataDialogContractId) {
      return;
    }

    if (!amendmentForm.date) {
      setErrorMessage(
        'Select the amendment date.'
      );
      return;
    }

    if (!amendmentForm.notes.trim()) {
      setErrorMessage(
        'Enter a description of the amendment or change.'
      );
      return;
    }

    const metadata = getContractMetadata(
      currentUser.id,
      metadataDialogContractId
    );

    const nextMetadata = {
      ...metadata,
      amendments: [
        ...(metadata.amendments || []),
        {
          date: amendmentForm.date,
          notes: amendmentForm.notes.trim()
        }
      ]
    };

    setIsSavingMetadata(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response =
        await saveContractMetadataToServer(
          currentUser,
          metadataDialogContractId,
          nextMetadata
        );

      const savedContract = response.contract;
      const savedMetadata =
        savedContract?.agreementMetadata ||
        nextMetadata;

      saveContractMetadata(
        currentUser.id,
        metadataDialogContractId,
        savedMetadata
      );

      if (savedContract) {
        setContracts((previous) =>
          previous.map((contract) =>
            contract.id === savedContract.id
              ? { ...contract, ...savedContract }
              : contract
          )
        );
      }

      setMetadataVersion((value) => value + 1);
      setAmendmentForm({
        date: '',
        notes: ''
      });
      setSuccessMessage(
        'Amendment saved successfully.'
      );
    } catch (error) {
      setErrorMessage(
        error.message ||
          'Unable to save the amendment.'
      );
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const historicalContracts = contracts;

  const selectedHistoricalContract =
    historicalContracts.find(
      (contract) =>
        contract.id ===
        selectedHistoricalContractId
    );

  const selectedComplianceRequest =
    selectedHistoricalContract
      ? getComplianceRequestForContract(
          complianceRequests,
          selectedHistoricalContract.id
        )
      : null;

  const selectedMetadata =
    selectedHistoricalContract
      ? getContractMetadata(
          currentUser?.id,
          selectedHistoricalContract.id
        )
      : null;

  void metadataVersion;

  const selectedTimeline =
    selectedHistoricalContract
      ? buildTimeline(
          selectedHistoricalContract,
          selectedComplianceRequest,
          selectedMetadata
        )
      : [];

  return (
    <div className="student-dashboard-container">
      <header className="student-dashboard-header">
        <div className="student-dashboard-header-logo-wrap">
          <img
            src={logo}
            alt="NILGuard Logo"
            className="student-dashboard-header-logo"
          />
        </div>

        <div className="student-dashboard-title-block">
          <h1>
            Student-Athlete Dashboard
          </h1>

          {currentUser?.school ? (
            <p className="student-dashboard-identity">
              {currentUser.school} ·{' '}
              {currentUser.ncaaDivision}
            </p>
          ) : null}
        </div>

        <div
          className="profile-menu"
          ref={menuRef}
        >
          <button
            type="button"
            className="profile-menu-trigger"
            onClick={() =>
              setMenuOpen(
                (previous) => !previous
              )
            }
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

          {menuOpen ? (
            <div className="profile-menu-dropdown">
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem(
                    'nilguard_user'
                  );

                  setMenuOpen(false);

                  navigate('/login');
                }}
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="student-dashboard-content">
        {/* UPLOAD TOOLBAR */}

        <div className="contracts-toolbar">
          <div className="active-contracts-actions-block">
            <div className="active-contracts-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="contract-upload-input"
                onChange={
                  handleFileSelection
                }
              />

              <button
                type="button"
                className="upload-button"
                onClick={handleUploadClick}
                disabled={isUploading}
              >
                {isUploading
                  ? 'Screening PDF...'
                  : 'Upload Contract PDF'}
              </button>
            </div>

            {errorMessage ? (
              <p className="contracts-feedback contracts-error">
                {errorMessage}
              </p>
            ) : successMessage ? (
              <p className="contracts-feedback contracts-success">
                {successMessage}
              </p>
            ) : (
              <p className="contracts-feedback">
                PDF uploads only, up to 12 MB per
                file. NILGuard screens each PDF
                before storing it.
              </p>
            )}
          </div>

          <label className="contracts-sort-label contracts-sort-toolbar">
            Sort Current Contracts

            <select
              className="contracts-sort-select"
              value={sortMode}
              onChange={handleSortChange}
            >
              {Object.entries(
                sortOptions
              ).map(
                ([value, option]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        {/* ACTIVE CONTRACTS */}

        <section className="contracts-column">
          <div className="contracts-column-header">
            <h2>
              Active Contracts
            </h2>
          </div>

          <div className="contracts-list">
            {isLoadingContracts ? (
              <div className="contract-card">
                Loading your contracts...
              </div>
            ) : contracts.length === 0 ? (
              <div className="contract-card">
                No contracts uploaded yet.
              </div>
            ) : (
              contracts.map(
                (contract) => {
                  const request =
                    getComplianceRequestForContract(
                      complianceRequests,
                      contract.id
                    );

                  const metadata =
                    getContractMetadata(
                      currentUser.id,
                      contract.id
                    );

                  const contractStatus =
                    getContractStatus(
                      request
                    );

                  return (
                    <article
                      key={contract.id}
                      className="contract-card contract-card-detailed"
                    >
                      <div className="contract-card-meta">
                        Contract ID:{' '}
                        {contract.id}
                      </div>

                      <h3>
                        {metadata.brandPayer ||
                          contract.fileName}
                      </h3>

                      <p>
                        Athlete:{' '}
                        {metadata.athleteName ||
                          'Not specified'}
                      </p>

                      <p>
                        Brand / Payer:{' '}
                        {metadata.brandPayer ||
                          'Not specified'}
                      </p>

                      <p>
                        Contract Value:{' '}
                        {metadata.contractValue ||
                          'Not specified'}
                      </p>

                      <p>
                        Contract Status:{' '}
                        {contractStatus}
                      </p>

                      <p>
                        Uploaded:{' '}
                        {formatDateTime(
                          contract.createdAt
                        )}
                      </p>

                      <p>
                        File size:{' '}
                        {formatFileSize(
                          contract.fileSize
                        )}
                      </p>

                      <div className="contract-action-row">
                        <button
                          type="button"
                          className="contract-action-link"
                          onClick={() =>
                            handleOpenContract(
                              contract.id
                            )
                          }
                        >
                          Open PDF
                        </button>

                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          onClick={() =>
                            openMetadataDialog(
                              contract
                            )
                          }
                        >
                          Agreement Details
                        </button>

                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          onClick={() =>
                            setSelectedHistoricalContractId(
                              contract.id
                            )
                          }
                        >
                          View Complete Record
                        </button>

                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          onClick={() =>
                            navigate(
                              `/contracts/analyze?contractId=${contract.id}&fileName=${encodeURIComponent(
                                contract.fileName
                              )}`
                            )
                          }
                        >
                          Analyze Contract
                        </button>

                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          onClick={() =>
                            openSendDialog(
                              contract.id
                            )
                          }
                          disabled={
                            isSubmittingRequestForContractId ===
                            contract.id
                          }
                        >
                          {isSubmittingRequestForContractId ===
                          contract.id
                            ? 'Sending...'
                            : 'Send to Compliance'}
                        </button>

                        <button
                          type="button"
                          className="dashboard-secondary-button dashboard-delete-button"
                          style={{
                            color: '#b00020',
                            borderColor:
                              '#b00020',
                            marginLeft: 8
                          }}
                          onClick={() =>
                            handleDeleteContract(
                              contract
                            )
                          }
                          disabled={
                            deletingContractId ===
                            contract.id
                          }
                        >
                          {deletingContractId ===
                          contract.id
                            ? 'Deleting...'
                            : 'Delete'}
                        </button>
                      </div>
                    </article>
                  );
                }
              )
            )}
          </div>
        </section>

        {/* HISTORICAL AGREEMENTS */}

        <section className="contracts-column past-contracts-column">
          <div className="contracts-column-header">
            <h2>
              Historical NIL Agreements
            </h2>

            <span>
              {historicalContracts.length}{' '}
              {historicalContracts.length === 1
                ? 'agreement'
                : 'agreements'}
            </span>
          </div>

          <div className="contracts-list">
            {isLoadingHistory ||
            isLoadingContracts ? (
              <div className="contract-card">
                Loading historical records...
              </div>
            ) : historicalContracts.length ===
              0 ? (
              <div className="contract-card">
                No historical NIL agreements
                yet.
              </div>
            ) : (
              historicalContracts.map(
                (contract) => {
                  const metadata =
                    getContractMetadata(
                      currentUser.id,
                      contract.id
                    );

                  const request =
                    getComplianceRequestForContract(
                      complianceRequests,
                      contract.id
                    );

                  const status =
                    getContractStatus(
                      request
                    );

                  const disclosureStatus =
                    getDisclosureStatus(
                      metadata,
                      request
                    );

                  return (
                    <article
                      key={`history-${contract.id}`}
                      className="contract-card contract-card-detailed"
                    >
                      <div className="contract-card-meta">
                        Agreement ID:{' '}
                        {contract.id}
                      </div>

                      <h3>
                        {metadata.brandPayer ||
                          contract.fileName}
                      </h3>

                      <p>
                        <strong>
                          Athlete:
                        </strong>{' '}
                        {metadata.athleteName ||
                          'Not specified'}
                      </p>

                      <p>
                        <strong>
                          Brand / Payer:
                        </strong>{' '}
                        {metadata.brandPayer ||
                          'Not specified'}
                      </p>

                      <p>
                        <strong>
                          Contract Value:
                        </strong>{' '}
                        {metadata.contractValue ||
                          'Not specified'}
                      </p>

                      <p>
                        <strong>
                          Dates:
                        </strong>{' '}
                        {metadata.startDate
                          ? formatDate(
                              metadata.startDate
                            )
                          : 'Not specified'}{' '}
                        →{' '}
                        {metadata.endDate
                          ? formatDate(
                              metadata.endDate
                            )
                          : 'Not specified'}
                      </p>

                      <p>
                        <strong>
                          Contract Status:
                        </strong>{' '}
                        {status}
                      </p>

                      <p>
                        <strong>
                          Payment Status:
                        </strong>{' '}
                        {metadata.paymentStatus}
                      </p>

                      <p>
                        <strong>
                          Disclosure /
                          Compliance:
                        </strong>{' '}
                        {disclosureStatus}
                      </p>

                      <p>
                        <strong>
                          Deliverables:
                        </strong>{' '}
                        {metadata.deliverables
                          .length || 0}
                      </p>

                      <p>
                        <strong>
                          Amendments:
                        </strong>{' '}
                        {metadata.amendments
                          .length || 0}
                      </p>

                      <div className="contract-action-row">
                        <button
                          type="button"
                          className="dashboard-secondary-button dashboard-accept-button"
                          onClick={() =>
                            setSelectedHistoricalContractId(
                              contract.id
                            )
                          }
                        >
                          View Complete Record
                        </button>

                        <button
                          type="button"
                          className="contract-action-link"
                          onClick={() =>
                            handleOpenContract(
                              contract.id
                            )
                          }
                        >
                          Open Original PDF
                        </button>

                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          onClick={() =>
                            openMetadataDialog(
                              contract
                            )
                          }
                        >
                          Edit Agreement
                        </button>
                      </div>
                    </article>
                  );
                }
              )
            )}
          </div>
        </section>
      </main>

      {/* SEND TO COMPLIANCE DIALOG */}

      {sendDialogContractId ? (
        <div
          className="dashboard-dialog-backdrop"
          role="presentation"
        >
          <div
            className="dashboard-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-compliance-title"
          >
            <h2 id="send-compliance-title">
              Send Contract To Compliance
            </h2>

            <p className="dashboard-dialog-copy">
              Enter the compliance officer
              email for your school.
            </p>

            <label className="contracts-sort-label">
              Compliance Officer Email

              <input
                type="email"
                className="dashboard-dialog-input"
                value={complianceEmail}
                onChange={(event) =>
                  setComplianceEmail(
                    event.target.value
                  )
                }
                placeholder="compliance@school.edu"
              />
            </label>

            <div className="contract-action-row">
              <button
                type="button"
                className="dashboard-secondary-button"
                onClick={
                  closeSendDialog
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="dashboard-secondary-button dashboard-accept-button"
                onClick={
                  handleSubmitToCompliance
                }
                disabled={
                  isSubmittingRequestForContractId ===
                  sendDialogContractId
                }
              >
                {isSubmittingRequestForContractId ===
                sendDialogContractId
                  ? 'Sending...'
                  : 'Send Contract'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* AGREEMENT DETAILS DIALOG */}

      {metadataDialogContractId ? (
        <div
          className="dashboard-dialog-backdrop"
          role="presentation"
        >
          <div
            className="dashboard-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agreement-details-title"
            style={{
              maxWidth: 720,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <h2 id="agreement-details-title">
              Agreement Details
            </h2>

            <p className="dashboard-dialog-copy">
              Add or confirm the details of
              this NIL agreement. These fields
              are kept separate from the PDF so
              payment status and later changes
              can be tracked accurately.
            </p>

            <label className="contracts-sort-label">
              Athlete Name

              <input
                type="text"
                className="dashboard-dialog-input"
                value={
                  metadataForm.athleteName
                }
                onChange={(event) =>
                  setMetadataForm(
                    (previous) => ({
                      ...previous,
                      athleteName:
                        event.target.value
                    })
                  )
                }
                placeholder="Jordan Williams"
              />
            </label>

            <label className="contracts-sort-label">
              Brand / Payer

              <input
                type="text"
                className="dashboard-dialog-input"
                value={
                  metadataForm.brandPayer
                }
                onChange={(event) =>
                  setMetadataForm(
                    (previous) => ({
                      ...previous,
                      brandPayer:
                        event.target.value
                    })
                  )
                }
                placeholder="Nike, Adidas, Local Business, etc."
              />
            </label>

            <label className="contracts-sort-label">
              Contract Value

              <input
                type="text"
                className="dashboard-dialog-input"
                value={
                  metadataForm.contractValue
                }
                onChange={(event) =>
                  setMetadataForm(
                    (previous) => ({
                      ...previous,
                      contractValue:
                        event.target.value
                    })
                  )
                }
                placeholder="$5,000"
              />
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                gap: 16
              }}
            >
              <label className="contracts-sort-label">
                Start Date

                <input
                  type="date"
                  className="dashboard-dialog-input"
                  value={
                    metadataForm.startDate
                  }
                  onChange={(event) =>
                    setMetadataForm(
                      (previous) => ({
                        ...previous,
                        startDate:
                          event.target.value
                      })
                    )
                  }
                />
              </label>

              <label className="contracts-sort-label">
                End Date

                <input
                  type="date"
                  className="dashboard-dialog-input"
                  value={
                    metadataForm.endDate
                  }
                  onChange={(event) =>
                    setMetadataForm(
                      (previous) => ({
                        ...previous,
                        endDate:
                          event.target.value
                      })
                    )
                  }
                />
              </label>
            </div>

            <label className="contracts-sort-label">
              Key Deliverables

              <textarea
                className="dashboard-dialog-input"
                value={
                  metadataForm.deliverablesText
                }
                onChange={(event) =>
                  setMetadataForm(
                    (previous) => ({
                      ...previous,
                      deliverablesText:
                        event.target.value
                    })
                  )
                }
                placeholder={
                  'One deliverable per line\n2 Instagram posts\n1 promotional appearance\n1 photo shoot'
                }
                rows={5}
              />
            </label>

            <label className="contracts-sort-label">
              Payment Status

              <select
                className="contracts-sort-select"
                value={
                  metadataForm.paymentStatus
                }
                onChange={(event) =>
                  setMetadataForm(
                    (previous) => ({
                      ...previous,
                      paymentStatus:
                        event.target.value
                    })
                  )
                }
              >
                <option>
                  Not recorded
                </option>
                <option>
                  Pending
                </option>
                <option>
                  Partially Paid
                </option>
                <option>
                  Paid
                </option>
                <option>
                  Disputed
                </option>
              </select>
            </label>

            <label className="contracts-sort-label">
              Disclosure / Compliance Status

              <select
                className="contracts-sort-select"
                value={
                  metadataForm.disclosureStatus
                }
                onChange={(event) =>
                  setMetadataForm(
                    (previous) => ({
                      ...previous,
                      disclosureStatus:
                        event.target.value
                    })
                  )
                }
              >
                <option>
                  Pending
                </option>
                <option>
                  Compliant
                </option>
                <option>
                  Needs Review
                </option>
                <option>
                  Non-Compliant
                </option>
              </select>
            </label>

            <hr
              style={{
                margin: '24px 0'
              }}
            />

            <h3>
              Contract Amendments
            </h3>

            <p className="dashboard-dialog-copy">
              Record any amendment, extension,
              payment change, deliverable change,
              or other modification.
            </p>

            <label className="contracts-sort-label">
              Amendment Date

              <input
                type="date"
                className="dashboard-dialog-input"
                value={
                  amendmentForm.date
                }
                onChange={(event) =>
                  setAmendmentForm(
                    (previous) => ({
                      ...previous,
                      date:
                        event.target.value
                    })
                  )
                }
              />
            </label>

            <label className="contracts-sort-label">
              Amendment / Change

              <textarea
                className="dashboard-dialog-input"
                value={
                  amendmentForm.notes
                }
                onChange={(event) =>
                  setAmendmentForm(
                    (previous) => ({
                      ...previous,
                      notes:
                        event.target.value
                    })
                  )
                }
                placeholder="Describe the change..."
                rows={3}
              />
            </label>

            <button
              type="button"
              className="dashboard-secondary-button"
              onClick={
                handleAddAmendment
              }
            >
              Add Amendment
            </button>

            <div
              style={{
                marginTop: 16
              }}
            >
              {getContractMetadata(
                currentUser.id,
                metadataDialogContractId
              ).amendments.length === 0 ? (
                <p>
                  No amendments recorded.
                </p>
              ) : (
                getContractMetadata(
                  currentUser.id,
                  metadataDialogContractId
                ).amendments.map(
                  (amendment, index) => (
                    <div
                      key={index}
                      style={{
                        padding:
                          '10px 0',
                        borderBottom:
                          '1px solid #ddd'
                      }}
                    >
                      <strong>
                        {formatDate(
                          amendment.date
                        )}
                      </strong>

                      <div>
                        {amendment.notes}
                      </div>
                    </div>
                  )
                )
              )}
            </div>

            <div
              className="contract-action-row"
              style={{
                marginTop: 24
              }}
            >
              <button
                type="button"
                className="dashboard-secondary-button"
                onClick={
                  closeMetadataDialog
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="dashboard-secondary-button dashboard-accept-button"
                onClick={
                  handleSaveMetadata
                }
                disabled={isSavingMetadata}
              >
                {isSavingMetadata
                  ? 'Saving...'
                  : 'Save Agreement'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* COMPLETE HISTORICAL RECORD */}

      {selectedHistoricalContract ? (
        <div
          className="dashboard-dialog-backdrop"
          role="presentation"
        >
          <div
            className="dashboard-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="historical-record-title"
            style={{
              maxWidth: 850,
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <h2 id="historical-record-title">
              Complete Agreement Record
            </h2>

            <h3
              style={{
                marginTop: 8
              }}
            >
              {selectedMetadata?.brandPayer ||
                selectedHistoricalContract.fileName}
            </h3>

            <p className="dashboard-dialog-copy">
              Agreement ID:{' '}
              {selectedHistoricalContract.id}
            </p>

            <hr />

            {/* CORE DETAILS */}

            <h3>
              Agreement Details
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(2, minmax(0, 1fr))',
                gap: 16,
                marginBottom: 24
              }}
            >
              <div>
                <strong>
                  Athlete
                </strong>

                <div>
                  {selectedMetadata?.athleteName ||
                    'Not specified'}
                </div>
              </div>

              <div>
                <strong>
                  Brand / Payer
                </strong>

                <div>
                  {selectedMetadata?.brandPayer ||
                    'Not specified'}
                </div>
              </div>

              <div>
                <strong>
                  Contract Value
                </strong>

                <div>
                  {selectedMetadata?.contractValue ||
                    'Not specified'}
                </div>
              </div>

              <div>
                <strong>
                  Start Date
                </strong>

                <div>
                  {selectedMetadata?.startDate
                    ? formatDate(
                        selectedMetadata.startDate
                      )
                    : 'Not specified'}
                </div>
              </div>

              <div>
                <strong>
                  End Date
                </strong>

                <div>
                  {selectedMetadata?.endDate
                    ? formatDate(
                        selectedMetadata.endDate
                      )
                    : 'Not specified'}
                </div>
              </div>

              <div>
                <strong>
                  Contract Status
                </strong>

                <div>
                  {getContractStatus(
                    selectedComplianceRequest
                  )}
                </div>
              </div>

              <div>
                <strong>
                  Payment Status
                </strong>

                <div>
                  {selectedMetadata?.paymentStatus ||
                    'Not recorded'}
                </div>
              </div>

              <div>
                <strong>
                  Disclosure /
                  Compliance
                </strong>

                <div>
                  {getDisclosureStatus(
                    selectedMetadata,
                    selectedComplianceRequest
                  )}
                </div>
              </div>

              <div>
                <strong>
                  File
                </strong>

                <div>
                  {selectedHistoricalContract.fileName}
                </div>
              </div>
            </div>

            {/* DELIVERABLES */}

            <h3>
              Key Deliverables
            </h3>

            {selectedMetadata?.deliverables
              ?.length ? (
              <ul>
                {selectedMetadata.deliverables.map(
                  (deliverable, index) => (
                    <li key={index}>
                      {deliverable}
                    </li>
                  )
                )}
              </ul>
            ) : (
              <p>
                No deliverables recorded.
              </p>
            )}

            {/* TIMELINE */}

            <h3
              style={{
                marginTop: 28
              }}
            >
              Contract Timeline
            </h3>

            {selectedTimeline.length === 0 ? (
              <p>
                No timeline events recorded
                yet.
              </p>
            ) : (
              <div>
                {selectedTimeline.map(
                  (event, index) => (
                    <div
                      key={event.id}
                      style={{
                        display: 'flex',
                        gap: 16,
                        padding:
                          '14px 0',
                        borderBottom:
                          '1px solid #ddd'
                      }}
                    >
                      <div
                        style={{
                          minWidth: 26,
                          fontSize: 20
                        }}
                      >
                        {index ===
                        selectedTimeline.length -
                          1
                          ? '●'
                          : '○'}
                      </div>

                      <div>
                        <strong>
                          {event.type}
                        </strong>

                        <div
                          style={{
                            marginTop: 4
                          }}
                        >
                          {formatDateTime(
                            event.date
                          )}
                        </div>

                        <div
                          style={{
                            marginTop: 4
                          }}
                        >
                          {event.description}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {/* AMENDMENTS */}

            <h3
              style={{
                marginTop: 28
              }}
            >
              Amendments / Changes
            </h3>

            {selectedMetadata?.amendments
              ?.length ? (
              selectedMetadata.amendments.map(
                (amendment, index) => (
                  <div
                    key={index}
                    style={{
                      padding:
                        '12px 0',
                      borderBottom:
                        '1px solid #ddd'
                    }}
                  >
                    <strong>
                      {formatDate(
                        amendment.date
                      )}
                    </strong>

                    <p>
                      {amendment.notes}
                    </p>
                  </div>
                )
              )
            ) : (
              <p>
                No amendments or changes
                recorded.
              </p>
            )}

            {/* COMPLIANCE */}

            <h3
              style={{
                marginTop: 28
              }}
            >
              Compliance Review
            </h3>

            {selectedComplianceRequest ? (
              <div>
                <p>
                  <strong>
                    Submitted:
                  </strong>{' '}
                  {formatDateTime(
                    selectedComplianceRequest.submittedAt
                  )}
                </p>

                <p>
                  <strong>
                    Compliance Officer:
                  </strong>{' '}
                  {selectedComplianceRequest.assignedComplianceEmail ||
                    'Not specified'}
                </p>

                <p>
                  <strong>
                    Status:
                  </strong>{' '}
                  {selectedComplianceRequest.status}
                </p>

                {selectedComplianceRequest.reviewedAt ? (
                  <p>
                    <strong>
                      Reviewed:
                    </strong>{' '}
                    {formatDateTime(
                      selectedComplianceRequest.reviewedAt
                    )}
                  </p>
                ) : null}

                {selectedComplianceRequest.reviewerEmail ? (
                  <p>
                    <strong>
                      Reviewer:
                    </strong>{' '}
                    {selectedComplianceRequest.reviewerEmail}
                  </p>
                ) : null}
              </div>
            ) : (
              <p>
                This agreement has not been
                submitted to compliance yet.
              </p>
            )}

            {/* ACTIONS */}

            <div
              className="contract-action-row"
              style={{
                marginTop: 28
              }}
            >
              <button
                type="button"
                className="dashboard-secondary-button dashboard-accept-button"
                onClick={() =>
                  handleOpenContract(
                    selectedHistoricalContract.id
                  )
                }
              >
                Open Original PDF
              </button>

              <button
                type="button"
                className="dashboard-secondary-button"
                onClick={() =>
                  openMetadataDialog(
                    selectedHistoricalContract
                  )
                }
              >
                Edit Agreement
              </button>

              <button
                type="button"
                className="dashboard-secondary-button"
                onClick={() =>
                  setSelectedHistoricalContractId(
                    ''
                  )
                }
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default StudentDashboardPage;