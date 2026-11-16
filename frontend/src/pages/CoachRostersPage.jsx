import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  Check,
  ClipboardList,
  Clock,
  Copy,
  FileSpreadsheet,
  LogOut,
  GraduationCap,
  RefreshCw,
  Shirt,
  Trash2,
  UsersRound
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/CoachRosters.css';
import { Button } from '../components/ui/button';
import { ToastMessage, useToast } from '../components/ui/toast';
import { Spinner } from '../components/ui/spinner';
import UserAvatar from '../components/UserAvatar';
import logo from '../assets/NILGUARD.png';
import pixelBanner from '../assets/SoccerPixel3.PNG?url';
import {
  addRosterPlayer,
  createRosterEducationInvite,
  deleteRoster,
  getRosterFileUrl,
  listRosters,
  removeRosterPlayer,
  updateRosterPlayer,
  uploadRosterCsv
} from '../services/rosterApi';

function formatInviteCode(code) {
  return String(code).replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') || '';
}

function maskInviteCode(code) {
  return String(code)
    .replace(/\s+/g, '')
    .match(/.{1,4}/g)
    ?.map((group) => '•'.repeat(group.length))
    .join(' ') || '';
}

function formatInviteCountdown(expiresAt, now) {
  const remainingMs = Math.max(0, Date.parse(expiresAt) - now);

  if (remainingMs === 0) {
    return 'Expired';
  }

  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  return `Expires in ${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function normalizeCsvHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function parseCsvRows(text) {
  const sanitizedText = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let currentField = '';
  let currentRow = [];
  let insideQuotes = false;

  for (let index = 0; index < sanitizedText.length; index += 1) {
    const character = sanitizedText[index];
    const nextCharacter = sanitizedText[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (!insideQuotes && character === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!insideQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      currentRow.push(currentField);

      if (currentRow.some((value) => String(value || '').trim() !== '')) {
        rows.push(currentRow);
      }

      currentField = '';
      currentRow = [];
      continue;
    }

    currentField += character;
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);

    if (currentRow.some((value) => String(value || '').trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function isEmailOnSchoolDomain(email, schoolDomain) {
  const emailDomain = String(email || '').toLowerCase().trim().split('@')[1] || '';
  const domain = String(schoolDomain || '').toLowerCase().trim();
  return Boolean(emailDomain && domain) && (emailDomain === domain || emailDomain.endsWith(`.${domain}`));
}

function validateRosterCsvForAssignedSchool(csvText, assignedSchool, schoolEmailDomain) {
  const rows = parseCsvRows(csvText);

  if (rows.length < 2) {
    return { error: 'The CSV must include a header row and at least one player row.', warnings: [] };
  }

  const headerRow = rows[0].map(normalizeCsvHeader);
  const requiredColumns = ['student_id', 'first_name', 'last_name', 'email', 'school', 'sport', 'year'];
  const missingColumns = requiredColumns.filter((column) => !headerRow.includes(column));
  if (missingColumns.length) {
    return { error: `The CSV is missing required columns: ${missingColumns.join(', ')}.`, warnings: [] };
  }
  const schoolColumnIndex = headerRow.indexOf('school');
  const emailColumnIndex = headerRow.indexOf('email');
  const warnings = [];
  const emailCounts = new Map();
  for (const [rowIndex, row] of rows.slice(1).entries()) {
    const email = String(row[emailColumnIndex] || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return { error: `Row ${rowIndex + 2} must include a valid email address.`, warnings };
    }
    const rosterKey = ['school', 'sport', 'year']
      .map((column) => String(row[headerRow.indexOf(column)] || '').trim().toLowerCase())
      .join('::');
    const key = `${rosterKey}::${email}`;
    emailCounts.set(key, (emailCounts.get(key) || 0) + 1);
    if (schoolEmailDomain && !isEmailOnSchoolDomain(email, schoolEmailDomain)) {
      warnings.push(`Row ${rowIndex + 2}: ${email} is not on the assigned school email domain.`);
    }
  }

  for (const [key, count] of emailCounts) {
    if (count > 1) {
      warnings.push(`Duplicate email ${key.split('::').pop()} will be marked Needs review.`);
    }
  }

  if (assignedSchool) {
    const normalizedAssignedSchool = assignedSchool.toLowerCase().trim();
    const mismatchedSchool = rows.slice(1).find((row) => {
      const schoolValue = String(row[schoolColumnIndex] || '').trim();
      return schoolValue !== '' && schoolValue.toLowerCase() !== normalizedAssignedSchool;
    });
    if (mismatchedSchool) {
      const csvSchool = String(mismatchedSchool[schoolColumnIndex] || '').trim();
      return {
        error: `This account is assigned to ${assignedSchool}. Every CSV row must use that school in the school column. Found: ${csvSchool || 'blank value'}.`,
        warnings
      };
    }
  }

  return { error: '', warnings };
}

function formatTimestamp(value) {
  if (!value) {
    return 'Just uploaded';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function getLinkStatusLabel(status) {
  return {
    linked: 'Linked',
    invited: 'Invited',
    no_account: 'No account',
    needs_review: 'Needs review'
  }[status] || 'No account';
}

function getLinkStatusClass(status) {
  return {
    linked: 'is-linked',
    invited: 'is-invited',
    no_account: 'is-no-account',
    needs_review: 'is-needs-review'
  }[status] || 'is-no-account';
}

function CoachRostersPage() {
  const [expandedRosterIds, setExpandedRosterIds] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedRosterFile, setSelectedRosterFile] = useState(null);
  const [deletingRosterId, setDeletingRosterId] = useState('');
  const [playerEditor, setPlayerEditor] = useState(null);
  const [playerForm, setPlayerForm] = useState({
    studentId: '', firstName: '', lastName: '', email: '', sport: '', year: ''
  });
  const [playerFormErrors, setPlayerFormErrors] = useState({});
  const [isSavingPlayer, setIsSavingPlayer] = useState(false);
  const [removingPlayerKey, setRemovingPlayerKey] = useState('');
  const [creatingEducationInviteKey, setCreatingEducationInviteKey] = useState('');
  const [educationInviteCodes, setEducationInviteCodes] = useState({});
  const [visibleEducationInviteCodes, setVisibleEducationInviteCodes] = useState({});
  const [copiedEducationInviteKey, setCopiedEducationInviteKey] = useState('');
  const [inviteCountdownNow, setInviteCountdownNow] = useState(() => Date.now());
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [csvWarnings, setCsvWarnings] = useState([]);
  const [rosterSort, setRosterSort] = useState({ key: 'school', direction: 'asc' });
  const [openRosterMenuId, setOpenRosterMenuId] = useState('');
  const [rosterMenuPosition, setRosterMenuPosition] = useState({ top: 0, left: 0 });
  const rosterMenuRef = useRef(null);
  const rosterMenuTriggerRefs = useRef(new Map());
  const fileInputRef = useRef(null);
  const inviteVisibilityTimersRef = useRef({});
  const inviteCopyTimersRef = useRef({});
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user: currentUser, logout } = useAuth();
  const [athleteSearch, setAthleteSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  useEffect(() => {
    if (Object.keys(educationInviteCodes).length === 0) {
      return undefined;
    }

    const expiresAt = Math.min(
      ...Object.values(educationInviteCodes).map((invite) => Date.parse(invite.expiresAt))
    );
    const expirationTimeoutId = window.setTimeout(
      () => setInviteCountdownNow(Date.now()),
      Math.max(0, expiresAt - Date.now())
    );
    const intervalId = window.setInterval(() => setInviteCountdownNow(Date.now()), 60000);
    return () => {
      window.clearTimeout(expirationTimeoutId);
      window.clearInterval(intervalId);
    };
  }, [educationInviteCodes]);

  useEffect(() => () => {
    Object.values(inviteVisibilityTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    Object.values(inviteCopyTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
  }, []);

  const toggleRosterMenu = (rosterId, event) => {
    if (openRosterMenuId === rosterId) {
      setOpenRosterMenuId('');
      return;
    }

    const triggerBounds = event.currentTarget.getBoundingClientRect();
    const menuWidth = 200;
    const menuHeight = 128;
    const canOpenBelow = triggerBounds.bottom + menuHeight + 4 <= window.innerHeight - 8;
    const top = canOpenBelow
      ? triggerBounds.bottom + 4
      : Math.max(8, triggerBounds.top - menuHeight - 4);
    const left = Math.min(
      Math.max(8, triggerBounds.right - menuWidth),
      Math.max(8, window.innerWidth - menuWidth - 8)
    );

    setRosterMenuPosition({ top, left });
    setOpenRosterMenuId(rosterId);
  };

  const handleRosterMenuKeyDown = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const menuItems = Array.from(
      event.currentTarget.querySelectorAll('button[role="menuitem"]:not(:disabled)')
    );

    if (menuItems.length === 0) {
      return;
    }

    const activeIndex = menuItems.indexOf(document.activeElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? menuItems.length - 1
        : event.key === 'ArrowDown'
          ? (activeIndex + 1 + menuItems.length) % menuItems.length
          : (activeIndex <= 0 ? menuItems.length - 1 : activeIndex - 1);

    event.preventDefault();
    menuItems[nextIndex].focus();
  };

  const athletes = rosters.flatMap((roster) =>
    (roster.players || []).map((player) => ({
      ...player,
      school: roster.school,
      sport: player.sport || roster.sport,
      year: player.year || roster.year,
      rosterId: roster.id,
      manuallyEditedAt: roster.manuallyEditedAt
    }))
  );
  const linkedAthletesCount = athletes.filter((athlete) => athlete.linkStatus === 'linked').length;

  const normalizedAthleteSearch = athleteSearch.trim().toLowerCase();
  const filteredAthletes = athletes.filter((athlete) =>
    [
      athlete.firstName,
      athlete.lastName,
      athlete.studentId,
      athlete.school,
      athlete.sport,
      athlete.year
    ].some((value) =>
      String(value || '').toLowerCase().includes(normalizedAthleteSearch)
    ) &&
    (!schoolFilter || athlete.school === schoolFilter) &&
    (!sportFilter || athlete.sport === sportFilter) &&
    (!yearFilter || athlete.year === yearFilter)
  );
  const availableSchools = Array.from(new Set(athletes.map((athlete) => athlete.school))).sort();
  const availableSports = Array.from(new Set(athletes.map((athlete) => athlete.sport))).sort();
  const availableYears = Array.from(new Set(athletes.map((athlete) => athlete.year))).sort();
  const sortedRosters = [...rosters].sort((first, second) => {
    const firstValue = rosterSort.key === 'playerCount'
      ? Number(first.playerCount) || 0
      : rosterSort.key === 'updatedAt'
        ? Date.parse(first.updatedAt || first.createdAt || '') || 0
        : String(first[rosterSort.key] || '').toLowerCase();
    const secondValue = rosterSort.key === 'playerCount'
      ? Number(second.playerCount) || 0
      : rosterSort.key === 'updatedAt'
        ? Date.parse(second.updatedAt || second.createdAt || '') || 0
        : String(second[rosterSort.key] || '').toLowerCase();

    const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
      ? firstValue - secondValue
      : String(firstValue).localeCompare(String(secondValue), undefined, { numeric: true });

    return rosterSort.direction === 'asc' ? comparison : -comparison;
  });

  const handleRosterSort = (key) => {
    setRosterSort((previous) => ({
      key,
      direction: previous.key === key && previous.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  useEffect(() => {
    if (!openRosterMenuId) {
      return;
    }

    rosterMenuRef.current
      ?.querySelector('button[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [openRosterMenuId]);

  useEffect(() => {
    const closeRosterMenu = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('.roster-row-menu, .roster-row-menu-list')) {
        setOpenRosterMenuId('');
      }
    };
    const closeRosterMenuOnEscape = (event) => {
      if (event.key === 'Escape' && openRosterMenuId) {
        event.preventDefault();
        setOpenRosterMenuId('');
        rosterMenuTriggerRefs.current.get(openRosterMenuId)?.focus();
      }
    };
    const closeRosterMenuOnViewportChange = () => {
      setOpenRosterMenuId('');
    };

    document.addEventListener('click', closeRosterMenu);
    document.addEventListener('keydown', closeRosterMenuOnEscape);
    window.addEventListener('resize', closeRosterMenuOnViewportChange);
    window.addEventListener('scroll', closeRosterMenuOnViewportChange, true);
    return () => {
      document.removeEventListener('click', closeRosterMenu);
      document.removeEventListener('keydown', closeRosterMenuOnEscape);
      window.removeEventListener('resize', closeRosterMenuOnViewportChange);
      window.removeEventListener('scroll', closeRosterMenuOnViewportChange, true);
    };
  }, [openRosterMenuId]);

  const fetchRosters = async () => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }

    setIsLoadingRosters(true);

    try {
      const response = await listRosters(currentUser);
      setRosters(response.rosters || []);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load rosters.');
    } finally {
      setIsLoadingRosters(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }

    fetchRosters();
  }, [navigate]);

  const handleUploadClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const selectRosterFile = async (selectedFile) => {
    if (!selectedFile || isUploading) {
      return;
    }

    setSelectedRosterFile(null);
    setCsvWarnings([]);
    setErrorMessage('');
    setSuccessMessage('');

    const isCsvFile = selectedFile.type === 'text/csv' || selectedFile.name.toLowerCase().endsWith('.csv');

    if (!isCsvFile) {
      setErrorMessage('Only CSV files can be uploaded.');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setErrorMessage('CSV uploads are limited to 5 MB.');
      return;
    }

    if (currentUser?.school) {
      try {
        const csvText = await selectedFile.text();
        const validation = validateRosterCsvForAssignedSchool(
          csvText,
          currentUser.school,
          currentUser.schoolEmailDomain
        );

        if (validation.error) {
          setErrorMessage(validation.error);
          return;
        }
        setCsvWarnings(validation.warnings);
      } catch (_error) {
        setErrorMessage('Unable to read this CSV file for validation.');
        return;
      }
    }

    setSelectedRosterFile(selectedFile);
  };

  const handleRosterUpload = async () => {
    if (!selectedRosterFile || isUploading) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsUploading(true);

    try {
      const response = await uploadRosterCsv(currentUser, selectedRosterFile);
      setSelectedRosterFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSuccessMessage(response.message || 'Roster uploaded successfully.');
      if (response.warnings?.length) {
        setCsvWarnings(response.warnings);
      }
      await fetchRosters();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to upload the roster CSV.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelection = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    await selectRosterFile(selectedFile);
  };

  const handleFileDrop = async (event) => {
    event.preventDefault();
    setIsDragOver(false);
    await selectRosterFile(event.dataTransfer.files?.[0]);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenRosterFile = (rosterId) => {
    setErrorMessage('');
    setSuccessMessage('');
    window.open(getRosterFileUrl(currentUser, rosterId), '_blank', 'noopener,noreferrer');
  };

  const handleDeleteRoster = async (roster) => {
    const confirmed = window.confirm(`Delete the ${roster.school} ${roster.sport} ${roster.year} roster?`);

    if (!confirmed) {
      return;
    }

    setDeletingRosterId(roster.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await deleteRoster(currentUser, roster.id);
      setSuccessMessage(response.message || 'Roster deleted successfully.');
      setRosters((previousRosters) => previousRosters.filter((currentRoster) => currentRoster.id !== roster.id));
    } catch (error) {
      setErrorMessage(error.message || 'Unable to delete the roster.');
    } finally {
      setDeletingRosterId('');
    }
  };

  const handleAddPlayerClick = (roster) => {
    setExpandedRosterIds((previous) =>
      previous.includes(roster.id) ? previous : [...previous, roster.id]
    );
    setPlayerEditor({ mode: 'add', rosterId: roster.id });
    setPlayerForm({
      studentId: '',
      firstName: '',
      lastName: '',
      email: '',
      sport: roster.sport || '',
      year: roster.year || ''
    });
    setPlayerFormErrors({});
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleEditPlayerClick = (roster, playerIndex, player) => {
    setPlayerEditor({ mode: 'edit', rosterId: roster.id, playerIndex });
    setPlayerForm({
      studentId: player.studentId || '',
      firstName: player.firstName || '',
      lastName: player.lastName || '',
      email: player.email || '',
      sport: player.sport || roster.sport || '',
      year: player.year || roster.year || ''
    });
    setPlayerFormErrors({});
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleCancelPlayerEdit = () => {
    setPlayerEditor(null);
    setPlayerFormErrors({});
  };

  const handlePlayerEditFieldChange = (field, value) => {
    setPlayerForm((previous) => ({ ...previous, [field]: value }));
    setPlayerFormErrors((previous) => (
      previous[field] && value.trim()
        ? { ...previous, [field]: '' }
        : previous
    ));
  };

  const handleSavePlayer = async (event) => {
    event.preventDefault();

    if (!playerEditor) {
      return;
    }

    const errors = {
      firstName: playerForm.firstName.trim() ? '' : 'Required',
      lastName: playerForm.lastName.trim() ? '' : 'Required',
      studentId: playerForm.studentId.trim() ? '' : 'Required',
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playerForm.email.trim()) ? '' : 'Enter a valid email',
      sport: playerForm.sport.trim() ? '' : 'Required',
      year: playerForm.year.trim() ? '' : 'Required'
    };
    setPlayerFormErrors(errors);

    if (Object.values(errors).some(Boolean)) {
      return;
    }

    setIsSavingPlayer(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const request = playerEditor.mode === 'add'
        ? addRosterPlayer(currentUser, playerEditor.rosterId, playerForm)
        : updateRosterPlayer(currentUser, playerEditor.rosterId, playerEditor.playerIndex, playerForm);
      const response = await request;
      setPlayerEditor(null);
      setPlayerFormErrors({});
      setSuccessMessage(response.message || 'Roster updated.');
      await fetchRosters();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to save this roster athlete.');
    } finally {
      setIsSavingPlayer(false);
    }
  };

  const handleRemovePlayer = async (roster, playerIndex, player) => {
    const confirmed = window.confirm(`Remove ${player.firstName} ${player.lastName} from this roster?`);

    if (!confirmed) {
      return;
    }

    const playerKey = `${roster.id}-${playerIndex}`;
    setRemovingPlayerKey(playerKey);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await removeRosterPlayer(currentUser, roster.id, playerIndex);
      setSuccessMessage(response.message || 'Athlete removed from roster.');
      await fetchRosters();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to remove this athlete.');
    } finally {
      setRemovingPlayerKey('');
    }
  };

  const handleCreateEducationInvite = async (roster, playerIndex, player) => {
    const inviteKey = `${roster.id}-${player.studentId}`;
    setCreatingEducationInviteKey(inviteKey);
    setErrorMessage('');
    setSuccessMessage('');
    window.clearTimeout(inviteVisibilityTimersRef.current[inviteKey]);
    window.clearTimeout(inviteCopyTimersRef.current[inviteKey]);
    delete inviteVisibilityTimersRef.current[inviteKey];
    delete inviteCopyTimersRef.current[inviteKey];
    setVisibleEducationInviteCodes((previous) => ({ ...previous, [inviteKey]: false }));
    setCopiedEducationInviteKey((previous) => previous === inviteKey ? '' : previous);

    try {
      const response = await createRosterEducationInvite(currentUser, roster.id, playerIndex);
      const expiresAt = Date.parse(response.expiresAt);

      if (typeof response.code !== 'string' || !response.code.trim() || !Number.isFinite(expiresAt)) {
        throw new Error('The server did not return a valid invitation code and expiration time.');
      }

      setEducationInviteCodes((previous) => ({
        ...previous,
        [inviteKey]: {
          code: response.code.replace(/\s+/g, ''),
          expiresAt: new Date(expiresAt).toISOString()
        }
      }));
      setInviteCountdownNow(Date.now());
      const athleteName = [player.firstName, player.lastName].filter(Boolean).join(' ');
      showToast({
        variant: 'success',
        title: `Invite code for ${athleteName || 'athlete'}`,
        detail: 'Expires in 24 hours'
      });
    } catch (error) {
      setErrorMessage(error.message || 'Unable to create an education-sharing invitation.');
    } finally {
      setCreatingEducationInviteKey('');
    }
  };

  const toggleEducationInviteVisibility = (inviteKey) => {
    const isCurrentlyVisible = Boolean(visibleEducationInviteCodes[inviteKey]);
    window.clearTimeout(inviteVisibilityTimersRef.current[inviteKey]);
    delete inviteVisibilityTimersRef.current[inviteKey];

    if (isCurrentlyVisible) {
      setVisibleEducationInviteCodes((previous) => ({ ...previous, [inviteKey]: false }));
      return;
    }

    setVisibleEducationInviteCodes((previous) => ({ ...previous, [inviteKey]: true }));
    inviteVisibilityTimersRef.current[inviteKey] = window.setTimeout(() => {
      setVisibleEducationInviteCodes((previous) => ({ ...previous, [inviteKey]: false }));
      delete inviteVisibilityTimersRef.current[inviteKey];
    }, 30000);
  };

  const handleCopyEducationInvite = async (inviteKey, code) => {
    try {
      await navigator.clipboard.writeText(code.replace(/\s+/g, ''));
      setCopiedEducationInviteKey(inviteKey);
      window.clearTimeout(inviteCopyTimersRef.current[inviteKey]);
      inviteCopyTimersRef.current[inviteKey] = window.setTimeout(() => {
        setCopiedEducationInviteKey((previous) => previous === inviteKey ? '' : previous);
        delete inviteCopyTimersRef.current[inviteKey];
      }, 1500);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to copy the invitation code.');
    }
  };

  const renderSortableHeading = (key, label) => (
    <th
      key={key}
      scope="col"
      aria-sort={rosterSort.key === key
        ? rosterSort.direction === 'asc' ? 'ascending' : 'descending'
        : 'none'}
    >
      <Button
        variant="ghost"
        size="sm"
        className="roster-sort-button"
        onClick={() => handleRosterSort(key)}
      >
        {label}
        <span aria-hidden="true">
          {rosterSort.key === key ? (rosterSort.direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </Button>
    </th>
  );

  return (
    <div className="coach-page">
      <div className="coach-shell">
        <aside className="coach-sidebar">
          <a className="coach-brand" href="#overview" aria-label="NILGuard coach workspace">
            <img src={logo} alt="NILGuard" />
          </a>

          <nav className="coach-sidebar-nav" aria-label="Coach dashboard">
            <a href="#overview" aria-current="page">Overview</a>
            <a href="#athletes">Athlete directory</a>
            <a href="#rosters">Rosters</a>
            <Link to="/profile">Profile</Link>
          </nav>

          <div className="coach-sidebar-account">
            <UserAvatar src={currentUser?.avatar} alt="" />
            {[currentUser?.firstName, currentUser?.lastName].filter(Boolean).length ? (
              <Link className="coach-account-profile" to="/profile">
                {[currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ')}
              </Link>
            ) : null}
            <span className="coach-account-school">{currentUser?.school || 'Coach account'}</span>
            {currentUser?.email ? <span className="coach-account-email">{currentUser.email}</span> : null}
            <Button
              variant="ghost"
              size="icon"
              className="coach-text-button logout-icon-button"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={14} className="logout-action-icon" aria-hidden="true" />
            </Button>
          </div>
        </aside>

        <div className="coach-workspace">
          <header className="coach-workspace-header">
            <img className="coach-banner-image" src={pixelBanner} alt="" />
            <div className="coach-banner-content">
              <p className="coach-eyebrow">Roster management</p>
              <h1>Coach Dashboard</h1>
              <p className="coach-header-context">
                {[currentUser?.school, currentUser?.ncaaDivision].filter(Boolean).join(' · ') || 'Manage athletes and rosters'}
              </p>
            </div>
          </header>

          <main className="coach-content">
            <section className="coach-stats" aria-label="Roster summary">
              <article className="coach-stat-tile">
                <span className="coach-stat-icon" aria-hidden="true">
                  <Shirt strokeWidth={2} />
                </span>
                <div className="coach-stat-copy">
                  <strong>{athletes.length}</strong>
                  <span className="coach-stat-label">Total athletes</span>
                </div>
              </article>
              <article className="coach-stat-tile">
                <span className="coach-stat-icon" aria-hidden="true">
                  <ClipboardList strokeWidth={2} />
                </span>
                <div className="coach-stat-copy">
                  <strong>{rosters.length}</strong>
                  <span className="coach-stat-label">Rosters</span>
                </div>
              </article>
              <article className="coach-stat-tile">
                <span className="coach-stat-icon" aria-hidden="true">
                  <GraduationCap strokeWidth={2} />
                </span>
                <div className="coach-stat-copy">
                  <strong>{linkedAthletesCount} of {athletes.length}</strong>
                  <span className="coach-stat-label">Linked athletes</span>
                </div>
              </article>
            </section>

            <ToastMessage message={errorMessage} variant="error" title="Unable to complete action" />
            <ToastMessage message={successMessage} variant="success" title="Success" />

            <section id="overview" className="coach-section coach-upload-section">
              <div className="coach-section-heading">
                <div>
                  <h2>Upload roster</h2>
                  <p>CSV file, up to 5 MB. {currentUser?.school ? `Assigned school: ${currentUser.school}.` : ''}</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="text/csv,.csv"
                className="roster-upload-input"
                onChange={handleFileSelection}
              />
              <div className="roster-upload-controls">
                <Button
                  type="button"
                  variant="outline"
                  className={`roster-drop-zone${isDragOver ? ' is-drag-over' : ''}`}
                  tabIndex={isUploading ? -1 : 0}
                  aria-label={selectedRosterFile?.name || 'Choose a roster CSV file or drop it here'}
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
                      setIsDragOver(true);
                    }
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setIsDragOver(false);
                    }
                  }}
                  onDrop={handleFileDrop}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                  </svg>
                  <span>
                    <strong>{selectedRosterFile?.name || 'Drop a CSV roster'}</strong>
                    <small>{selectedRosterFile ? 'CSV ready to upload' : 'or choose a file · 5 MB max'}</small>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="default"
                  className={`upload-roster-btn${isUploading ? ' is-uploading' : ''}`}
                  onClick={handleRosterUpload}
                  disabled={!selectedRosterFile || isUploading}
                  aria-busy={isUploading}
                >
                  {isUploading ? (
                    <Spinner />
                  ) : (
                    <svg className="upload-roster-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
                    </svg>
                  )}
                  {isUploading ? 'Uploading...' : 'Upload roster'}
                </Button>
              </div>
              <p className="coach-upload-note">Required columns: student ID, first name, last name, email, school, sport, year.</p>
              {csvWarnings.length ? (
                <ul className="roster-csv-warnings" aria-label="CSV warnings">
                  {csvWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : null}
              <div className="sample-csv-links" aria-label="CSV templates">
                <span>Templates</span>
                <a href="/sample-csv/roster_template.csv" className="interactive-link" download>
                  Roster CSV
                </a>
                <a href="/sample-csv/womens_tennis_template.csv" className="interactive-link" download>
                  Women's tennis CSV
                </a>
              </div>
            </section>

            <section id="athletes" className="coach-section">
              <div className="coach-section-heading coach-directory-heading">
                <div>
                  <h2>Athlete directory</h2>
                  <p>{filteredAthletes.length} {filteredAthletes.length === 1 ? 'athlete' : 'athletes'}</p>
                </div>
              </div>

              <div className="athlete-controls">
                <label className="athlete-search-label" htmlFor="athlete-directory-search">
                  Search
                  <input
                    id="athlete-directory-search"
                    className="athlete-search-input"
                    type="search"
                    value={athleteSearch}
                    onChange={(event) => setAthleteSearch(event.target.value)}
                    placeholder="Name or student ID"
                  />
                </label>
                <div className="athlete-filter-grid">
                  <label>
                    School
                    <select value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)}>
                      <option value="">All schools</option>
                      {availableSchools.map((school) => <option key={school} value={school}>{school}</option>)}
                    </select>
                  </label>
                  <label>
                    Sport
                    <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
                      <option value="">All sports</option>
                      {availableSports.map((sport) => <option key={sport} value={sport}>{sport}</option>)}
                    </select>
                  </label>
                  <label>
                    Year
                    <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                      <option value="">All years</option>
                      {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="coach-ghost-button athlete-filter-reset"
                    onClick={() => {
                      setAthleteSearch('');
                      setSchoolFilter('');
                      setSportFilter('');
                      setYearFilter('');
                    }}
                    disabled={!athleteSearch && !schoolFilter && !sportFilter && !yearFilter}
                  >
                    Reset
                  </Button>
                </div>
              </div>

              <div className="coach-table-scroll">
                <table className="coach-data-table athlete-directory-table">
                  <thead>
                    <tr>
                      <th scope="col">Athlete</th>
                      <th scope="col">Student ID</th>
                      <th scope="col">Sport</th>
                      <th scope="col">Year</th>
                      <th scope="col">Link status</th>
                      <th scope="col">Education</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingRosters ? (
                      <tr>                      <td className="coach-table-message" colSpan="6">Loading athletes...</td></tr>
                    ) : filteredAthletes.length === 0 ? (
                      <tr>
                        <td className="coach-table-message" colSpan="6">
                          {athletes.length === 0 ? 'No athletes yet. Upload a roster to get started.' : 'No athletes match these filters.'}
                        </td>
                      </tr>
                    ) : filteredAthletes.map((athlete, index) => (
                      <tr key={`${athlete.rosterId}-${athlete.studentId}-${index}`}>
                        <td><Link className="coach-table-primary" to={`/coach/athletes/${encodeURIComponent(athlete.studentId)}`}>{athlete.firstName} {athlete.lastName}</Link></td>
                        <td>{athlete.studentId}</td>
                        <td><span className="coach-sport-tag">{athlete.sport}</span></td>
                        <td>{athlete.year}</td>
                        <td>
                          <span className={`coach-status-pill ${getLinkStatusClass(athlete.linkStatus)}`}>
                            {getLinkStatusLabel(athlete.linkStatus)}
                          </span>
                        </td>
                        <td>
                          <span className={`coach-status-pill ${athlete.educationShared ? 'is-shared' : 'is-not-shared'}`}>
                            {athlete.educationShared ? 'Shared' : 'Not shared'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="rosters" className="coach-section coach-rosters-section">
              <div className="coach-section-heading">
                <div>
                  <h2>Rosters</h2>
                  <p>{rosters.length} {rosters.length === 1 ? 'roster' : 'rosters'}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`roster-refresh-button${isLoadingRosters ? ' is-refreshing' : ''}`}
                  aria-label={isLoadingRosters ? 'Refreshing rosters' : 'Refresh rosters'}
                  title={isLoadingRosters ? 'Refreshing rosters' : 'Refresh rosters'}
                  aria-busy={isLoadingRosters}
                  onClick={fetchRosters}
                  disabled={isLoadingRosters}
                >
                  <RefreshCw aria-hidden="true" />
                </Button>
              </div>

              <div className="coach-table-scroll">
                <table className="coach-data-table roster-table">
                  <thead>
                    <tr>
                      {[
                        ['school', 'School'],
                        ['sport', 'Sport'],
                        ['year', 'Year'],
                        ['playerCount', 'Athletes'],
                        ['updatedAt', 'Updated']
                      ].map(([key, label]) => renderSortableHeading(key, label))}
                      <th scope="col"><span className="coach-visually-hidden">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingRosters ? (
                      <tr><td className="coach-table-message" colSpan="6">Loading rosters...</td></tr>
                    ) : sortedRosters.length === 0 ? (
                      <tr><td className="coach-table-message" colSpan="6">No rosters yet. Upload a roster to get started.</td></tr>
                    ) : sortedRosters.map((roster) => {
                      const isExpanded = expandedRosterIds.includes(roster.id);
                      const isMenuOpen = openRosterMenuId === roster.id;

                      return (
                        <React.Fragment key={roster.id}>
                          <tr className={`roster-table-row${isExpanded ? ' is-expanded' : ''}`}>
                            <td>
                              <span className="coach-table-primary">{roster.school}</span>
                              <span className="roster-file-name">{roster.fileName || 'Uploaded roster'}</span>
                            </td>
                            <td><span className="coach-sport-tag">{roster.sport}</span></td>
                            <td>{roster.year}</td>
                            <td>{roster.playerCount}</td>
                            <td>
                              <span>{formatTimestamp(roster.updatedAt)}</span>
                              {roster.manuallyEditedAt ? (
                                <span className="coach-status-pill is-edited">Edited in NILGuard</span>
                              ) : null}
                            </td>
                            <td className="roster-menu-cell">
                              <div className="roster-row-menu">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="roster-row-menu-trigger"
                                  ref={(element) => {
                                    if (element) {
                                      rosterMenuTriggerRefs.current.set(roster.id, element);
                                    } else {
                                      rosterMenuTriggerRefs.current.delete(roster.id);
                                    }
                                  }}
                                  aria-label={`Actions for ${roster.school} ${roster.sport} ${roster.year}`}
                                  aria-haspopup="menu"
                                  aria-expanded={isMenuOpen}
                                  onClick={(event) => toggleRosterMenu(roster.id, event)}
                                >
                                  <svg viewBox="0 0 20 20" aria-hidden="true">
                                    <circle cx="10" cy="4" r="1.5" />
                                    <circle cx="10" cy="10" r="1.5" />
                                    <circle cx="10" cy="16" r="1.5" />
                                  </svg>
                                </Button>
                                {isMenuOpen ? (
                                  createPortal(
                                    <div
                                      className="roster-row-menu-list"
                                      role="menu"
                                      ref={rosterMenuRef}
                                      onKeyDown={handleRosterMenuKeyDown}
                                      style={{ top: rosterMenuPosition.top, left: rosterMenuPosition.left }}
                                    >
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="roster-menu-item"
                                        onClick={() => {
                                          setExpandedRosterIds((previous) =>
                                            isExpanded
                                              ? previous.filter((id) => id !== roster.id)
                                              : [...previous, roster.id]
                                          );
                                          setOpenRosterMenuId('');
                                        }}
                                      >
                                        <UsersRound size={16} aria-hidden="true" />
                                        <span>{isExpanded ? 'Hide athletes' : 'Manage athletes'}</span>
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="roster-menu-item"
                                        onClick={() => {
                                          setOpenRosterMenuId('');
                                          handleOpenRosterFile(roster.id);
                                        }}
                                        disabled={!roster.hasSourceFile}
                                      >
                                        <FileSpreadsheet size={16} aria-hidden="true" />
                                        <span>{roster.manuallyEditedAt ? 'Open original CSV' : 'Open CSV'}</span>
                                      </button>
                                      <div className="roster-menu-divider" role="separator" />
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="roster-menu-item is-destructive"
                                        onClick={() => {
                                          setOpenRosterMenuId('');
                                          handleDeleteRoster(roster);
                                        }}
                                        disabled={deletingRosterId === roster.id}
                                      >
                                        <Trash2 size={16} aria-hidden="true" />
                                        <span>{deletingRosterId === roster.id ? 'Deleting...' : 'Delete roster'}</span>
                                      </button>
                                    </div>,
                                    document.body
                                  )
                                ) : null}
                              </div>
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr className="roster-expanded-row">
                              <td colSpan="6">
                                <div className="roster-players-panel">
                                  <div className="roster-expanded-heading">
                                    <h3>
                                      {roster.sport} · {roster.year} · {roster.players?.length || 0}{' '}
                                      {(roster.players?.length || 0) === 1 ? 'athlete' : 'athletes'}
                                    </h3>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="coach-ghost-button"
                                      onClick={() => handleAddPlayerClick(roster)}
                                    >
                                      Add athlete
                                    </Button>
                                  </div>

                                  {playerEditor?.mode === 'add' && playerEditor.rosterId === roster.id ? (
                                    <form className="roster-player-form" onSubmit={handleSavePlayer}>
                                      <label>
                                        Student ID
                                        <input
                                          value={playerForm.studentId}
                                          onChange={(event) => setPlayerForm((previous) => ({ ...previous, studentId: event.target.value }))}
                                          maxLength={100}
                                          required
                                        />
                                      </label>
                                      <label>
                                        First name
                                        <input
                                          value={playerForm.firstName}
                                          onChange={(event) => setPlayerForm((previous) => ({ ...previous, firstName: event.target.value }))}
                                          maxLength={100}
                                          required
                                        />
                                      </label>
                                      <label>
                                        Last name
                                        <input
                                          value={playerForm.lastName}
                                          onChange={(event) => setPlayerForm((previous) => ({ ...previous, lastName: event.target.value }))}
                                          maxLength={100}
                                          required
                                        />
                                      </label>
                                      <label>
                                        Email
                                        <input
                                          type="email"
                                          value={playerForm.email}
                                          onChange={(event) => setPlayerForm((previous) => ({ ...previous, email: event.target.value }))}
                                          maxLength={254}
                                          required
                                        />
                                      </label>
                                      <label>
                                        Sport
                                        <input
                                          value={playerForm.sport}
                                          onChange={(event) => setPlayerForm((previous) => ({ ...previous, sport: event.target.value }))}
                                          maxLength={100}
                                          required
                                        />
                                      </label>
                                      <label>
                                        Year
                                        <input
                                          value={playerForm.year}
                                          onChange={(event) => setPlayerForm((previous) => ({ ...previous, year: event.target.value }))}
                                          maxLength={100}
                                          required
                                        />
                                      </label>
                                      <div className="roster-player-form-actions">
                                        <Button type="submit" variant="ghost" className="coach-ghost-button" disabled={isSavingPlayer}>
                                          {isSavingPlayer ? 'Saving...' : 'Save athlete'}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          className="coach-ghost-button"
                                          onClick={() => setPlayerEditor(null)}
                                          disabled={isSavingPlayer}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </form>
                                  ) : null}

                                  {!roster.players?.length ? (
                                    <p className="roster-detail-empty">No athletes in this roster.</p>
                                  ) : (
                                    <div className="roster-players-list">
                                      {roster.players.map((player, playerIndex) => {
                                        const isEditingPlayer =
                                          playerEditor?.mode === 'edit' &&
                                          playerEditor.rosterId === roster.id &&
                                          playerEditor.playerIndex === playerIndex;
                                        const isAnotherPlayerEditing =
                                          playerEditor?.mode === 'edit' &&
                                          playerEditor.rosterId === roster.id &&
                                          !isEditingPlayer;
                                        const inviteKey = `${roster.id}-${player.studentId}`;
                                        const invite = educationInviteCodes[inviteKey];
                                        const inviteRemainingMs = invite
                                          ? Math.max(0, Date.parse(invite.expiresAt) - inviteCountdownNow)
                                          : 0;
                                        const isInviteExpired = Boolean(invite) && inviteRemainingMs === 0;
                                        const inviteExpiryTone = isInviteExpired
                                          ? ' is-expired'
                                          : inviteRemainingMs < 10 * 60 * 1000
                                            ? ' is-critical'
                                            : inviteRemainingMs < 60 * 60 * 1000
                                              ? ' is-warning'
                                              : '';
                                        const isInviteVisible =
                                          !isInviteExpired && Boolean(visibleEducationInviteCodes[inviteKey]);
                                        const isInviteCopied =
                                          !isInviteExpired && copiedEducationInviteKey === inviteKey;

                                        return (
                                          <div
                                            className={`roster-player${isEditingPlayer ? ' is-editing' : ''}${isAnotherPlayerEditing ? ' is-dimmed' : ''}`}
                                            key={player.studentId}
                                          >
                                            {isEditingPlayer ? (
                                              <form
                                                className="roster-player-edit-form"
                                                onSubmit={handleSavePlayer}
                                                onKeyDown={(event) => {
                                                  if (event.key === 'Escape') {
                                                    event.preventDefault();
                                                    handleCancelPlayerEdit();
                                                  } else if (
                                                    event.key === 'Enter' &&
                                                    event.target.tagName === 'INPUT' &&
                                                    !isSavingPlayer
                                                  ) {
                                                    event.preventDefault();
                                                    event.currentTarget.requestSubmit();
                                                  }
                                                }}
                                              >
                                                <div className="roster-player-edit-fields">
                                                  <label className="roster-player-edit-field">
                                                    <span>First name</span>
                                                    <input
                                                      aria-invalid={Boolean(playerFormErrors.firstName)}
                                                      autoComplete="off"
                                                      autoCapitalize="words"
                                                      spellCheck={false}
                                                      autoFocus
                                                      value={playerForm.firstName}
                                                      onChange={(event) => handlePlayerEditFieldChange('firstName', event.target.value)}
                                                      maxLength={100}
                                                    />
                                                    {playerFormErrors.firstName ? (
                                                      <span className="roster-player-field-error">{playerFormErrors.firstName}</span>
                                                    ) : null}
                                                  </label>
                                                  <label className="roster-player-edit-field">
                                                    <span>Last name</span>
                                                    <input
                                                      aria-invalid={Boolean(playerFormErrors.lastName)}
                                                      autoComplete="off"
                                                      autoCapitalize="words"
                                                      spellCheck={false}
                                                      value={playerForm.lastName}
                                                      onChange={(event) => handlePlayerEditFieldChange('lastName', event.target.value)}
                                                      maxLength={100}
                                                    />
                                                    {playerFormErrors.lastName ? (
                                                      <span className="roster-player-field-error">{playerFormErrors.lastName}</span>
                                                    ) : null}
                                                  </label>
                                                  <label className="roster-player-edit-field roster-player-edit-field-id">
                                                    <span>ID</span>
                                                    <input
                                                      aria-invalid={Boolean(playerFormErrors.studentId)}
                                                      autoComplete="off"
                                                      autoCapitalize="words"
                                                      spellCheck={false}
                                                      value={playerForm.studentId}
                                                      onChange={(event) => handlePlayerEditFieldChange('studentId', event.target.value)}
                                                      maxLength={100}
                                                    />
                                                    {playerFormErrors.studentId ? (
                                                      <span className="roster-player-field-error">{playerFormErrors.studentId}</span>
                                                    ) : null}
                                                  </label>
                                                  <label className="roster-player-edit-field">
                                                    <span>Sport</span>
                                                    <input
                                                      aria-invalid={Boolean(playerFormErrors.sport)}
                                                      autoComplete="off"
                                                      value={playerForm.sport}
                                                      onChange={(event) => handlePlayerEditFieldChange('sport', event.target.value)}
                                                      maxLength={100}
                                                    />
                                                    {playerFormErrors.sport ? (
                                                      <span className="roster-player-field-error">{playerFormErrors.sport}</span>
                                                    ) : null}
                                                  </label>
                                                  <label className="roster-player-edit-field">
                                                    <span>Year</span>
                                                    <input
                                                      aria-invalid={Boolean(playerFormErrors.year)}
                                                      autoComplete="off"
                                                      value={playerForm.year}
                                                      onChange={(event) => handlePlayerEditFieldChange('year', event.target.value)}
                                                      maxLength={100}
                                                    />
                                                    {playerFormErrors.year ? (
                                                      <span className="roster-player-field-error">{playerFormErrors.year}</span>
                                                    ) : null}
                                                  </label>
                                                  <label className="roster-player-edit-field">
                                                    <span>Email</span>
                                                    <input
                                                      aria-invalid={Boolean(playerFormErrors.email)}
                                                      autoComplete="off"
                                                      type="email"
                                                      value={playerForm.email}
                                                      onChange={(event) => handlePlayerEditFieldChange('email', event.target.value)}
                                                      maxLength={254}
                                                    />
                                                    {playerFormErrors.email ? (
                                                      <span className="roster-player-field-error">{playerFormErrors.email}</span>
                                                    ) : null}
                                                  </label>
                                                </div>
                                                <div className="roster-player-actions roster-player-edit-actions">
                                                  <Button type="submit" variant="default" disabled={isSavingPlayer}>
                                                    {isSavingPlayer ? 'Saving...' : 'Save'}
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="roster-player-cancel-button"
                                                    onClick={handleCancelPlayerEdit}
                                                    disabled={isSavingPlayer}
                                                  >
                                                    Cancel
                                                  </Button>
                                                </div>
                                              </form>
                                            ) : (
                                              <>
                                                <div className="roster-player-details">
                                                  <UserAvatar className="roster-player-avatar" src={player.sharedProfile?.avatar} alt="" />
                                                  <Link className="coach-table-primary" to={`/coach/athletes/${encodeURIComponent(player.studentId)}`}>{player.firstName} {player.lastName}</Link>
                                                  <span className="roster-player-id">ID: {player.studentId}</span>
                                                  <span className="roster-player-email">{player.email}</span>
                                                  <span className={`coach-status-pill ${getLinkStatusClass(player.linkStatus)}`}>
                                                    {getLinkStatusLabel(player.linkStatus)}
                                                  </span>
                                                </div>
                                                <div className="roster-player-actions">
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="coach-ghost-button"
                                                    onClick={() => handleEditPlayerClick(roster, playerIndex, player)}
                                                    disabled={isAnotherPlayerEditing}
                                                  >
                                                    Edit
                                                  </Button>
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    className="coach-ghost-button coach-delete-button"
                                                    onClick={() => handleRemovePlayer(roster, playerIndex, player)}
                                                    disabled={isAnotherPlayerEditing || removingPlayerKey === `${roster.id}-${playerIndex}`}
                                                  >
                                                    {removingPlayerKey === `${roster.id}-${playerIndex}` ? 'Removing...' : 'Remove'}
                                                  </Button>
                                                </div>
                                              </>
                                            )}
                                          <div
                                            className={`roster-player-education${isEditingPlayer ? ' is-hidden-for-edit' : ''}`}
                                            aria-hidden={isEditingPlayer}
                                          >
                                            {player.sharedProfile ? (
                                              <div className="roster-player-profile-shares">
                                                {Object.entries(player.sharedProfile).map(([field, value]) => (
                                                  <span key={field}>
                                                    {field === 'contactEmail' ? 'Contact email' : field === 'preferredName' ? 'Preferred name' : field[0].toUpperCase() + field.slice(1)}: {value}
                                                  </span>
                                                ))}
                                              </div>
                                            ) : null}
                                            {player.educationShared ? (
                                              <>
                                                <strong>
                                                  Education shared · {player.educationProgress?.completedModules || 0}/
                                                  {player.educationProgress?.totalModules || 3} modules complete
                                                </strong>
                                                <div className="roster-education-courses">
                                                  {[
                                                    ['moneyBasics', 'Money Basics'],
                                                    ['nilDeals', 'NIL Deals'],
                                                    ['contracts101', 'Contracts 101']
                                                  ].map(([courseId, courseName]) => {
                                                    const course = player.educationProgress?.courses?.[courseId];
                                                    return (
                                                      <span key={courseId}>
                                                        {courseName}: {course?.completedLessons || 0}/{course?.totalLessons || 3} lessons
                                                        {course?.quizPassed
                                                          ? ' · Assessment passed'
                                                          : course?.quizAttempted
                                                            ? ' · Assessment not passed'
                                                            : ' · Assessment not taken'}
                                                      </span>
                                                    );
                                                  })}
                                                </div>
                                              </>
                                            ) : (
                                              <>
                                                <div className="roster-share-prompt">
                                                  <div className="roster-share-prompt-content">
                                                    <strong className="roster-share-prompt-title">Education progress not shared</strong>
                                                    <span className="roster-share-prompt-description">
                                                      {player.linkStatus === 'linked'
                                                        ? 'Your account is linked. Education progress stays private until you choose to share it.'
                                                        : 'Send a sign-up invite to this athlete.'}
                                                    </span>
                                                  </div>
                                                  {player.linkStatus !== 'linked' ? (
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="sm"
                                                      className="coach-ghost-button roster-invite-button"
                                                      onClick={() => handleCreateEducationInvite(roster, playerIndex, player)}
                                                      disabled={isAnotherPlayerEditing || creatingEducationInviteKey === inviteKey}
                                                    >
                                                      <ArrowRight size={14} aria-hidden="true" />
                                                      {creatingEducationInviteKey === inviteKey
                                                        ? 'Sending invite...'
                                                        : isInviteExpired ? 'Send invite again' : 'Send invite'}
                                                    </Button>
                                                  ) : null}
                                                </div>
                                                {invite ? (
                                                  <div className={`roster-education-invite${isInviteExpired ? ' is-expired' : ''}`}>
                                                    <div className={`roster-education-invite-codebox${isInviteExpired ? ' is-expired' : ''}`}>
                                                      <code
                                                        className="roster-education-invite-code"
                                                        style={{ minWidth: `${formatInviteCode(invite.code).length}ch` }}
                                                      >
                                                        {isInviteVisible ? formatInviteCode(invite.code) : maskInviteCode(invite.code)}
                                                      </code>
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="roster-invite-copy-button"
                                                        aria-label={isInviteCopied ? 'One-time invite code copied' : 'Copy one-time invite code'}
                                                        title="Copy one-time invite code"
                                                        onClick={() => handleCopyEducationInvite(inviteKey, invite.code)}
                                                        disabled={isAnotherPlayerEditing || isInviteExpired}
                                                      >
                                                        {isInviteCopied
                                                          ? <Check aria-hidden="true" />
                                                          : <Copy aria-hidden="true" />}
                                                      </Button>
                                                    </div>
                                                    <div className="roster-education-invite-meta">
                                                      <span className={`roster-education-invite-expiry${inviteExpiryTone}`}>
                                                        <Clock aria-hidden="true" />
                                                        <span>
                                                          {isInviteExpired ? 'Expired' : formatInviteCountdown(invite.expiresAt, inviteCountdownNow)}
                                                        </span>
                                                      </span>
                                                      <span className="roster-education-invite-meta-separator" aria-hidden="true">·</span>
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        className="roster-invite-toggle-button"
                                                        aria-label={isInviteVisible ? 'Hide one-time invite code' : 'Show one-time invite code'}
                                                        onClick={() => toggleEducationInviteVisibility(inviteKey)}
                                                        disabled={isAnotherPlayerEditing || isInviteExpired}
                                                      >
                                                        {isInviteVisible ? 'Hide' : 'Show'}
                                                      </Button>
                                                    </div>
                                                    <span className="coach-visually-hidden" aria-live="polite" aria-atomic="true">
                                                      {isInviteCopied ? 'Copied' : ''}
                                                    </span>
                                                  </div>
                                                ) : null}
                                              </>
                                            )}
                                          </div>
                                        </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

export default CoachRostersPage;
