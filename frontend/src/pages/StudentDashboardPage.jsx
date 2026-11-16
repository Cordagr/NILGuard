import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, FileText, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { useToast } from '../components/ui/toast';

import '../styles/pages/StudentDashboard.css';
import '../styles/pages/CoachRosters.css';

import ContractChatCenter from '../components/ContractChatCenter';
import UserAvatar from '../components/UserAvatar';
import exitIcon from '../assets/exit.png';
import MessengerIcon from '../assets/messenger.png';
import logo from '../assets/NILGUARD.png';
import FilterIcon from '../assets/filter.png';

import {
  deleteContract,
  getContractFileUrl,
  listContracts,
  saveContractMetadata as saveContractMetadataToServer,
  uploadContract
} from '../services/contractApi';

import {
  listComplianceMessages,
  listComplianceOfficers,
  listComplianceRequests,
  saveComplianceOfficer,
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

function formatComplianceDeadline(value) {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC'
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

function normalizeDateInput(value) {
  if (!value) return '';

  const text = String(value).trim();

  // Already in the format required by <input type="date">
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  // ISO date/time or another string beginning with YYYY-MM-DD
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Handle dates such as "Oct 1, 2026"
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
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
      startDate: normalizeDateInput(parsed.startDate),
      endDate: normalizeDateInput(parsed.endDate),
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
  const { user: currentUser, logout } = useAuth();
  const { showToast } = useToast();

  const sortMenuRef = useRef(null);
  const fileInputRef = useRef(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messagesError, setMessagesError] = useState('');
  const unreadChatCount = messages.filter(
    (message) => !message.isRead && message.recipientUserId === String(currentUser?.id)
  ).length;
  const unreadChatBadgeCount = unreadChatCount > 99 ? '99+' : unreadChatCount;
  const [complianceOfficers, setComplianceOfficers] = useState([]);
  const [savedComplianceOfficerIds, setSavedComplianceOfficerIds] = useState([]);
  const [isLoadingComplianceOfficers, setIsLoadingComplianceOfficers] = useState(false);
  const [leadComplianceUserId, setLeadComplianceUserId] = useState('');
  const [additionalComplianceUserIds, setAdditionalComplianceUserIds] = useState([]);
  const [newComplianceOfficerEmail, setNewComplianceOfficerEmail] = useState('');
  const [isSavingComplianceOfficer, setIsSavingComplianceOfficer] = useState(false);
  const [complianceOfficerSaveError, setComplianceOfficerSaveError] = useState('');
  const [complianceOfficerSaveMessage, setComplianceOfficerSaveMessage] = useState('');

  const [contracts, setContracts] = useState([]);
  const [complianceRequests, setComplianceRequests] =
    useState([]);

  const [isLoadingContracts, setIsLoadingContracts] =
    useState(true);

  const [isLoadingHistory, setIsLoadingHistory] =
    useState(true);

  const [isUploading, setIsUploading] =
    useState(false);

  const [selectedContractFile, setSelectedContractFile] = useState(null);
  const [isContractDragOver, setIsContractDragOver] = useState(false);

  const [deletingContractId, setDeletingContractId] =
    useState('');

  const [
    isSubmittingRequestForContractId,
    setIsSubmittingRequestForContractId
  ] = useState('');

  const [sendDialogContractId, setSendDialogContractId] =
    useState('');

  const [errorMessage, setErrorMessage] =
    useState('');

  const [successMessage, setSuccessMessage] =
    useState('');

  useEffect(() => {
    if (!errorMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(
      () => setErrorMessage(''),
      45000
    );

    return () => window.clearTimeout(timeoutId);
  }, [errorMessage]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(
      () => setSuccessMessage(''),
      35000
    );

    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const [sortMode, setSortMode] =
    useState('lastAccessedAt');
  const [isSortMenuOpen, setIsSortMenuOpen] =
    useState(false);
  const [openContractActionMenuId, setOpenContractActionMenuId] =
    useState('');

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
  const fetchComplianceRequests = async () => {
    if (!currentUser?.id) {
      return;
    }

    setIsLoadingHistory(true);

    try {
      const response = await listComplianceRequests(currentUser);
      setComplianceRequests(response.requests || []);
    } catch (error) {
      setErrorMessage(
        error.message || 'Unable to load compliance history.'
      );
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchComplianceOfficers = async () => {
    setIsLoadingComplianceOfficers(true);

    try {
      const response = await listComplianceOfficers();
      if (!Array.isArray(response.officers) || !Array.isArray(response.savedOfficerIds)) {
        throw new Error('Unable to load saved compliance officers.');
      }
      setComplianceOfficers(response.officers);
      setSavedComplianceOfficerIds(response.savedOfficerIds);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load compliance officers.');
    } finally {
      setIsLoadingComplianceOfficers(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const response = await listComplianceMessages();
      setMessages(response.messages || []);
      setMessagesError('');
    } catch (error) {
      setMessagesError(error.message || 'Unable to load contract chats.');
    }
  };

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

  useEffect(() => {
    if (!currentUser?.id) {
      navigate('/login');
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setIsSortMenuOpen(false);
      }

      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[data-contract-action-menu]')
      ) {
        setOpenContractActionMenuId('');
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenContractActionMenuId('');
      }
    };

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );
    document.addEventListener('keydown', handleEscape);

    fetchContracts();
    fetchComplianceRequests();
    fetchComplianceOfficers();
    fetchMessages();

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
      document.removeEventListener('keydown', handleEscape);
    };
  }, [navigate]);

  const handleSortChange = async (nextSortMode) => {
    setSortMode(nextSortMode);
    setIsSortMenuOpen(false);

    await fetchContracts(nextSortMode);
  };

  const handleUploadClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const selectContractFile = (selectedFile) => {
    if (!selectedFile || isUploading) {
      return;
    }

    setSelectedContractFile(null);
    setErrorMessage('');
    setSuccessMessage('');

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

    setSelectedContractFile(selectedFile);
  };

  const handleFileSelection = (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    selectContractFile(selectedFile);
  };

  const handleFileDrop = (event) => {
    event.preventDefault();
    setIsContractDragOver(false);
    selectContractFile(event.dataTransfer.files?.[0]);
  };

  const handleContractUpload = async () => {
    if (!selectedContractFile || isUploading) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsUploading(true);

    try {
      const response = await uploadContract(
        currentUser,
        selectedContractFile
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

      setSelectedContractFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      setSuccessMessage(
        'Contract uploaded successfully.'
      );

      await fetchContracts(sortMode);
      await fetchComplianceRequests();
    } catch (error) {
      if (error.code === 'NOT_A_CONTRACT') {
        showToast({
          variant: 'error',
          title: 'Contract upload rejected',
          detail: error.message
        });
      } else {
        setErrorMessage(
          error.message ||
            'Unable to upload the contract.'
        );
      }
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
    const existingRequest = complianceRequests.find(
      (request) => request.contractId === contractId
    );
    const leadId = existingRequest?.assignedComplianceUserId ||
      savedComplianceOfficerIds[0] ||
      '';
    setLeadComplianceUserId(leadId);
    setAdditionalComplianceUserIds(
      (existingRequest?.complianceParticipantIds || []).filter((id) => id !== leadId)
    );
    setNewComplianceOfficerEmail('');
    setComplianceOfficerSaveError('');
    setComplianceOfficerSaveMessage('');
    setSendDialogContractId(contractId);
  };

  const closeSendDialog = () => {
    setSendDialogContractId('');
  };

  const handleSaveComplianceOfficer = async (event) => {
    event.preventDefault();
    const email = newComplianceOfficerEmail.trim().toLowerCase();
    if (!email) {
      return;
    }

    setIsSavingComplianceOfficer(true);
    setComplianceOfficerSaveError('');
    setComplianceOfficerSaveMessage('');

    try {
      const response = await saveComplianceOfficer(email);
      if (!response.officer?.id || !Array.isArray(response.savedOfficerIds)) {
        throw new Error('Unable to verify the saved compliance officer.');
      }

      setComplianceOfficers((previous) => [
        ...previous.filter((officer) => officer.id !== response.officer.id),
        response.officer
      ].sort((left, right) => left.email.localeCompare(right.email)));
      setSavedComplianceOfficerIds(response.savedOfficerIds);
      setLeadComplianceUserId((previous) => previous || response.officer.id);
      setAdditionalComplianceUserIds((previous) =>
        previous.filter((id) => id !== response.officer.id)
      );
      setNewComplianceOfficerEmail('');
      setComplianceOfficerSaveMessage(`${response.officer.email} was added to your saved officers.`);
    } catch (error) {
      setComplianceOfficerSaveError(
        error.message || 'Unable to save this compliance officer.'
      );
    } finally {
      setIsSavingComplianceOfficer(false);
    }
  };

  const handleSubmitToCompliance = async () => {
    if (!sendDialogContractId) {
      return;
    }

    if (!leadComplianceUserId) {
      setErrorMessage(
        'Choose a lead compliance officer before sending the contract.'
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
          leadComplianceUserId,
          additionalComplianceUserIds
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
  const contractProgress = contracts.reduce(
    (summary, contract) => {
      const request = getComplianceRequestForContract(
        complianceRequests,
        contract.id
      );

      summary.total += 1;

      if (!request) {
        summary.notSubmitted += 1;
      } else if (request.status === 'accepted') {
        summary.approved += 1;
      } else if (request.status === 'rejected') {
        summary.rejected += 1;
      } else {
        summary.inReview += 1;
      }

      return summary;
    },
    {
      total: 0,
      notSubmitted: 0,
      inReview: 0,
      approved: 0,
      rejected: 0
    }
  );
  const isLoadingContractProgress =
    isLoadingContracts || isLoadingHistory;

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
      {successMessage && (
        <div
          className="contract-success-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="contract-success-toast-icon" aria-hidden="true">
            &#10003;
          </span>
          <p>{successMessage}</p>
          <button
            type="button"
            className="contract-success-toast-dismiss"
            aria-label="Dismiss success message"
            onClick={() => setSuccessMessage('')}
          >
            <img src={exitIcon} alt="" aria-hidden="true" />
          </button>
        </div>
      )}
      {errorMessage && (
        <div
          className="contract-error-toast notification-error"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <p>{errorMessage}</p>
          <button
            type="button"
            className="app-close-button"
            aria-label="Dismiss error notification"
            onClick={() => setErrorMessage('')}
          >
            <img src={exitIcon} alt="" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="coach-shell student-dashboard-shell">
        <aside className="coach-sidebar">
          <a className="coach-brand" href="#overview" aria-label="NILGuard student workspace">
            <img src={logo} alt="NILGuard" />
          </a>

          <nav className="coach-sidebar-nav" aria-label="Student dashboard">
            <a href="#overview" aria-current="page">Overview</a>
            <a href="#contracts">Contracts</a>
            <Link to="/student/education">Education</Link>
            <Link to="/profile">Profile</Link>
          </nav>

          <div className="coach-sidebar-account">
            <UserAvatar src={currentUser?.avatar} alt="" />
            {[currentUser?.firstName, currentUser?.lastName].filter(Boolean).length ? (
              <Link className="coach-account-profile" to="/profile">
                {[currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')}
              </Link>
            ) : null}
            <span className="coach-account-school">{currentUser?.school || 'Student account'}</span>
            {currentUser?.email ? <span className="coach-account-email">{currentUser.email}</span> : null}
            <Button
              variant="ghost"
              size="icon"
              className="coach-text-button logout-icon-button"
              onClick={logout}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={14} className="logout-action-icon" aria-hidden="true" />
            </Button>
          </div>
        </aside>

        <div className="coach-workspace student-dashboard-workspace">
      <header className="student-dashboard-header student-athlete-header" id="overview">
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
              <span className="inbox-unread-badge header-control-badge" aria-hidden="true">
                {unreadChatBadgeCount}
              </span>
            ) : null}
          </button>
          <ContractChatCenter
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            currentUser={currentUser}
            requests={complianceRequests}
            messages={messages}
            onRefresh={fetchMessages}
            loadError={messagesError}
          />
        </div>

      </header>

      <main className="student-dashboard-content">
        <section className="coach-stats student-dashboard-stats" aria-label="Contract summary">
          <article className="coach-stat-tile">
            <span className="coach-stat-icon" aria-hidden="true">
              <FileText strokeWidth={2} />
            </span>
            <div className="coach-stat-copy">
              <strong>{isLoadingContractProgress ? '...' : contractProgress.total}</strong>
              <span className="coach-stat-label">Total contracts</span>
            </div>
          </article>
          <article className="coach-stat-tile">
            <span className="coach-stat-icon" aria-hidden="true">
              <Clock strokeWidth={2} />
            </span>
            <div className="coach-stat-copy">
              <strong>{isLoadingContractProgress ? '...' : contractProgress.inReview}</strong>
              <span className="coach-stat-label">In review</span>
            </div>
          </article>
          <article className="coach-stat-tile">
            <span className="coach-stat-icon" aria-hidden="true">
              <CheckCircle2 strokeWidth={2} />
            </span>
            <div className="coach-stat-copy">
              <strong>{isLoadingContractProgress ? '...' : contractProgress.approved}</strong>
              <span className="coach-stat-label">Approved</span>
            </div>
          </article>
        </section>

        {/* UPLOAD TOOLBAR */}


        <div className="contracts-toolbar">
          <div className="active-contracts-actions-block">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="contract-upload-input"
              onChange={handleFileSelection}
            />

            <div className="roster-upload-controls">
              <Button
                type="button"
                variant="outline"
                className={`roster-drop-zone${isContractDragOver ? ' is-drag-over' : ''}`}
                tabIndex={isUploading ? -1 : 0}
                aria-label={selectedContractFile?.name || 'Choose a contract PDF file or drop it here'}
                aria-disabled={isUploading}
                onClick={handleUploadClick}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleUploadClick();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!isUploading) {
                    setIsContractDragOver(true);
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsContractDragOver(false);
                  }
                }}
                onDrop={handleFileDrop}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                </svg>
                <span>
                  <strong>{selectedContractFile?.name || 'Drop a contract PDF'}</strong>
                  {selectedContractFile ? <small>PDF ready to upload</small> : null}
                </span>
              </Button>
              <Button
                type="button"
                variant="default"
                className="student-dashboard-shared-button"
                onClick={handleContractUpload}
                disabled={!selectedContractFile || isUploading}
                aria-busy={isUploading}
              >
                {isUploading ? 'Screening PDF...' : 'Upload contract PDF'}
              </Button>
              <div className="contracts-sort-menu" ref={sortMenuRef}>
                <button
                  type="button"
                  className="contracts-filter-button"
                  aria-label="Filter current contracts"
                  aria-expanded={isSortMenuOpen}
                  aria-controls="contracts-sort-options"
                  onClick={() => setIsSortMenuOpen((open) => !open)}
                >
                  <img src={FilterIcon} alt="" aria-hidden="true" />
                </button>
                {isSortMenuOpen && (
                  <div
                    id="contracts-sort-options"
                    className="contracts-sort-popover"
                    role="group"
                    aria-label="Sort current contracts"
                  >
                    <span className="contracts-sort-popover-title">Filter by</span>
                    {Object.entries(sortOptions).map(([value, option]) => (
                      <button
                        key={value}
                        type="button"
                        className={`contracts-sort-option ${sortMode === value ? 'is-selected' : ''}`}
                        aria-pressed={sortMode === value}
                        onClick={() => handleSortChange(value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ACTIVE CONTRACTS */}

        <section className="contracts-column" id="contracts">
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
              <div className="contract-card contract-empty-state">
                <span className="contract-empty-mark" aria-hidden="true">+</span>
                <div className="contract-empty-copy">
                  <strong>Your next deal starts here.</strong>
                  <p>Upload a NIL contract PDF to add it to your dashboard and start a compliance review.</p>
                </div>
                <button
                  type="button"
                  className="student-dashboard-shared-button shadcn-button shadcn-button-outline shadcn-button-size-default"
                  onClick={handleUploadClick}
                  disabled={isUploading}
                >
                  Upload a contract
                </button>
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
                          className="student-dashboard-shared-button shadcn-button shadcn-button-default shadcn-button-size-default"
                          onClick={() =>
                            navigate(
                              `/contracts/analyze?contractId=${contract.id}&fileName=${encodeURIComponent(
                                contract.fileName
                              )}`
                            )
                          }
                        >
                          Analyze contract
                        </button>

                        <button
                          type="button"
                          className="student-dashboard-shared-button shadcn-button shadcn-button-outline shadcn-button-size-default"
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
                          className="student-dashboard-shared-button shadcn-button shadcn-button-outline shadcn-button-size-default"
                          onClick={() =>
                            openMetadataDialog(
                              contract
                            )
                          }
                        >
                          Edit agreement
                        </button>

                        <div className="contract-action-overflow" data-contract-action-menu>
                          <button
                            type="button"
                            className="student-dashboard-shared-button shadcn-button shadcn-button-ghost shadcn-button-size-icon contract-action-overflow-trigger"
                            aria-label="More actions"
                            aria-haspopup="menu"
                            aria-expanded={openContractActionMenuId === `active:${contract.id}`}
                            onClick={() =>
                              setOpenContractActionMenuId((openId) =>
                                openId === `active:${contract.id}` ? '' : `active:${contract.id}`
                              )
                            }
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                            </svg>
                          </button>
                          {openContractActionMenuId === `active:${contract.id}` ? (
                            <div className="contract-action-overflow-menu" role="group" aria-label="More contract actions">
                              <button
                                type="button"
                                className="contract-action-menu-item"
                                onClick={() => {
                                  setOpenContractActionMenuId('');
                                  setSelectedHistoricalContractId(contract.id);
                                }}
                              >
                                View complete record
                              </button>
                              <button
                                type="button"
                                className="contract-action-menu-item"
                                onClick={() => {
                                  setOpenContractActionMenuId('');
                                  openSendDialog(contract.id);
                                }}
                                disabled={isSubmittingRequestForContractId === contract.id}
                                aria-busy={isSubmittingRequestForContractId === contract.id}
                              >
                                {isSubmittingRequestForContractId === contract.id
                                  ? 'Sending...'
                                  : 'Send to compliance'}
                              </button>
                              <div className="contract-action-menu-divider" role="separator" />
                              <button
                                type="button"
                                className="contract-action-menu-item is-destructive"
                                onClick={() => {
                                  setOpenContractActionMenuId('');
                                  handleDeleteContract(contract);
                                }}
                                disabled={deletingContractId === contract.id}
                                aria-busy={deletingContractId === contract.id}
                              >
                                {deletingContractId === contract.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                }
              )
            )}
          </div>
        </section>

        {/* HISTORICAL CONTRACTS */}

        <section className="contracts-column past-contracts-column">
          <div className="contracts-column-header">
            <h2>
              Historical NIL Contracts
            </h2>

          </div>

          <div className="contracts-list">
            {isLoadingHistory ||
            isLoadingContracts ? (
              <div className="contract-card">
                Loading historical records...
              </div>
            ) : historicalContracts.length ===
              0 ? (
              <div className="contract-card contract-empty-state contract-empty-history">
                <div className="contract-empty-copy">
                  <strong>Your timeline is ready to grow.</strong>
                  <p>Your uploaded contracts and their review history will appear here.</p>
                </div>
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
                          className="student-dashboard-shared-button shadcn-button shadcn-button-outline shadcn-button-size-default"
                          onClick={() =>
                            handleOpenContract(
                              contract.id
                            )
                          }
                        >
                          Open original PDF
                        </button>

                        <button
                          type="button"
                          className="student-dashboard-shared-button shadcn-button shadcn-button-outline shadcn-button-size-default"
                          onClick={() =>
                            openMetadataDialog(
                              contract
                            )
                          }
                        >
                          Edit agreement
                        </button>

                        <div className="contract-action-overflow" data-contract-action-menu>
                          <button
                            type="button"
                            className="student-dashboard-shared-button shadcn-button shadcn-button-ghost shadcn-button-size-icon contract-action-overflow-trigger"
                            aria-label="More actions"
                            aria-haspopup="menu"
                            aria-expanded={openContractActionMenuId === `historical:${contract.id}`}
                            onClick={() =>
                              setOpenContractActionMenuId((openId) =>
                                openId === `historical:${contract.id}` ? '' : `historical:${contract.id}`
                              )
                            }
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                              <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                            </svg>
                          </button>
                          {openContractActionMenuId === `historical:${contract.id}` ? (
                            <div className="contract-action-overflow-menu" role="group" aria-label="More contract actions">
                              <button
                                type="button"
                                className="contract-action-menu-item"
                                onClick={() => {
                                  setOpenContractActionMenuId('');
                                  setSelectedHistoricalContractId(contract.id);
                                }}
                              >
                                View complete record
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                }
              )
            )}
          </div>
        </section>
      </main>
        </div>
      </div>

      {/* SEND TO COMPLIANCE DIALOG */}

      {sendDialogContractId ? (
        <div
          className="dashboard-dialog-backdrop"
          role="presentation"
        >
          <div
            className="dashboard-dialog send-compliance-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-compliance-title"
          >
            <button
              type="button"
              className="app-close-button send-compliance-dialog-exit"
              onClick={closeSendDialog}
              aria-label="Close send contract dialog"
              title="Close send contract dialog"
            >
              <img src={exitIcon} alt="" aria-hidden="true" />
            </button>
            <h2 id="send-compliance-title">
              Send Contract To Compliance
            </h2>

            <p className="dashboard-dialog-copy">
              Choose a lead reviewer and add other compliance officers from your school to this contract conversation.
            </p>

            <form
              className="compliance-officer-entry"
              onSubmit={handleSaveComplianceOfficer}
            >
              <label htmlFor="saved-compliance-officer-email">
                Add an existing compliance officer
              </label>
              <div className="compliance-officer-entry-controls">
                <input
                  id="saved-compliance-officer-email"
                  className="dashboard-dialog-input"
                  type="email"
                  value={newComplianceOfficerEmail}
                  onChange={(event) => setNewComplianceOfficerEmail(event.target.value)}
                  placeholder="officer@school.edu"
                  autoComplete="email"
                  disabled={isSavingComplianceOfficer}
                  required
                />
                <button
                  type="submit"
                  className="student-dashboard-shared-button shadcn-button shadcn-button-outline shadcn-button-size-default"
                  disabled={isSavingComplianceOfficer || !newComplianceOfficerEmail.trim()}
                >
                  {isSavingComplianceOfficer ? 'Adding...' : 'Add'}
                </button>
              </div>
              <p className="compliance-officer-entry-help">
                Use the email on their registered compliance account at your school.
              </p>
              {complianceOfficerSaveError ? (
                <p className="compliance-officer-entry-error" role="alert">
                  {complianceOfficerSaveError}
                </p>
              ) : null}
              {complianceOfficerSaveMessage ? (
                <p className="compliance-officer-entry-success" role="status">
                  {complianceOfficerSaveMessage}
                </p>
              ) : null}
            </form>

            <label className="contracts-sort-label">
              Lead reviewer
              <select
                className="dashboard-dialog-input"
                value={leadComplianceUserId}
                onChange={(event) =>
                  {
                    const nextLeadId = event.target.value;
                    setLeadComplianceUserId(nextLeadId);
                    setAdditionalComplianceUserIds((previous) => {
                      const next = new Set(previous);
                      if (leadComplianceUserId && leadComplianceUserId !== nextLeadId) {
                        next.add(leadComplianceUserId);
                      }
                      next.delete(nextLeadId);
                      return [...next];
                    });
                  }
                }
                disabled={isLoadingComplianceOfficers}
                required
              >
                <option value="">
                  {isLoadingComplianceOfficers ? 'Loading officers...' : 'Choose a lead reviewer'}
                </option>
                {savedComplianceOfficerIds.length ? (
                  <optgroup label="Saved officers">
                    {complianceOfficers
                      .filter((officer) => savedComplianceOfficerIds.includes(officer.id))
                      .map((officer) => (
                        <option key={officer.id} value={officer.id}>
                          {officer.email}
                        </option>
                      ))}
                  </optgroup>
                ) : null}
                <optgroup
                  label={savedComplianceOfficerIds.length ? 'Other officers at your school' : 'Officers at your school'}
                >
                  {complianceOfficers
                    .filter((officer) => !savedComplianceOfficerIds.includes(officer.id))
                    .map((officer) => (
                      <option key={officer.id} value={officer.id}>
                        {officer.email}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>

            <fieldset className="compliance-group-members">
              <legend>Additional conversation members (optional)</legend>
              {complianceOfficers
                .filter((officer) => officer.id !== leadComplianceUserId)
                .map((officer) => (
                  <label key={officer.id}>
                    <input
                      type="checkbox"
                      checked={additionalComplianceUserIds.includes(officer.id)}
                      onChange={(event) => {
                        setAdditionalComplianceUserIds((previous) =>
                          event.target.checked
                            ? [...previous, officer.id]
                            : previous.filter((id) => id !== officer.id)
                        );
                      }}
                    />
                    <span>{officer.email}</span>
                  </label>
                ))}
              {!isLoadingComplianceOfficers && complianceOfficers.length === 0 ? (
                <p>No compliance officers are available for your school.</p>
              ) : null}
              {!isLoadingComplianceOfficers &&
                complianceOfficers.length > 0 &&
                complianceOfficers.filter((officer) => officer.id !== leadComplianceUserId).length === 0 ? (
                <p>No additional compliance officers are available for your school.</p>
              ) : null}
              {isLoadingComplianceOfficers ? <p>Loading compliance officers...</p> : null}
            </fieldset>

            <div className="contract-action-row">
              <button
                type="button"
                className="student-dashboard-shared-button shadcn-button shadcn-button-outline shadcn-button-size-default"
                onClick={
                  closeSendDialog
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="student-dashboard-shared-button shadcn-button shadcn-button-default shadcn-button-size-default"
                onClick={
                  handleSubmitToCompliance
                }
                disabled={
                  isSubmittingRequestForContractId ===
                  sendDialogContractId ||
                  isLoadingComplianceOfficers ||
                  !leadComplianceUserId
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
              Edit Agreement
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

      {selectedHistoricalContract && !metadataDialogContractId ? (
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

                {selectedComplianceRequest.rejectionReason ? (
                  <p>
                    <strong>Rejection reason:</strong>{' '}
                    {selectedComplianceRequest.rejectionReason}
                  </p>
                ) : null}

                <h4 className="compliance-tasks-heading">Compliance Tasks</h4>

                {selectedComplianceRequest.guidelines?.length ? (
                  <div className="student-compliance-review">
                    {selectedComplianceRequest.guidelines.map((guideline) => (
                      <div className="guideline-review-item" key={guideline.id}>
                        <div className="guideline-review-heading">
                          <strong>{guideline.title}</strong>
                          <span className={`request-status-pill request-status-${guideline.decision || 'pending'}`}>
                            {guideline.decision === 'needs_changes'
                              ? 'Needs changes'
                              : guideline.decision || 'Pending'}
                          </span>
                        </div>
                        <p>{guideline.summary}</p>
                        <div className="student-guideline-feedback">
                          <span>
                            Due: {formatComplianceDeadline(guideline.dueAt)}
                          </span>
                          <span>
                            Reviewed: {guideline.reviewedAt ? formatDate(guideline.reviewedAt) : 'Not reviewed'}
                          </span>
                          {guideline.feedback ? (
                            <p>Officer feedback: {guideline.feedback}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No compliance tasks recorded.</p>
                )}
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
                className="dashboard-secondary-button"
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
                onClick={() => {
                  const contract = selectedHistoricalContract;

                  setSelectedHistoricalContractId('');
                  openMetadataDialog(contract);
                }}
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
