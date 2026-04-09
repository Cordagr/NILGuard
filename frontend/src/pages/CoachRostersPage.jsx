import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/pages/CoachRosters.css';
import logo from '../assets/NILGUARD.png';
import { deleteRoster, getRosterFileUrl, listRosters, uploadRosterCsv } from '../services/rosterApi';

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

function formatTimestamp(value) {
  if (!value) {
    return 'Just uploaded';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function CoachRostersPage() {
  const [rosters, setRosters] = useState([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingRosterId, setDeletingRosterId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

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
    fileInputRef.current?.click();
  };

  const handleFileSelection = async (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    const isCsvFile = selectedFile.type === 'text/csv' || selectedFile.name.toLowerCase().endsWith('.csv');

    if (!isCsvFile) {
      setSuccessMessage('');
      setErrorMessage('Only CSV files can be uploaded.');
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setSuccessMessage('');
      setErrorMessage('CSV uploads are limited to 5 MB.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsUploading(true);

    try {
      const response = await uploadRosterCsv(currentUser, selectedFile);
      setSuccessMessage(response.message || 'Roster uploaded successfully.');
      await fetchRosters();
    } catch (error) {
      setErrorMessage(error.message || 'Unable to upload the roster CSV.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('nilguard_user');
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

  return (
    <div className="coach-page">
      <header className="coach-header">
        <div className="coach-logo-wrap">
          <img src={logo} alt="NILGuard Logo" className="coach-logo" />
        </div>

        <button type="button" className="coach-logout-link" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <main className="coach-layout">
        <section className="coach-left-column coach-panel">
          <h2>Upload Roster</h2>
          <p className="coach-panel-subtext">
            Select a CSV file. NILGuard validates the required columns and groups players into rosters by school, sport, and year.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="text/csv,.csv"
            className="roster-upload-input"
            onChange={handleFileSelection}
          />

          <button type="button" className="upload-roster-btn" onClick={handleUploadClick} disabled={isUploading}>
            {isUploading ? 'Uploading CSV...' : 'Upload Roster CSV'}
          </button>

          {errorMessage ? <p className="roster-feedback roster-error">{errorMessage}</p> : null}
          {!errorMessage && successMessage ? <p className="roster-feedback roster-success">{successMessage}</p> : null}
          {!errorMessage && !successMessage ? (
            <p className="roster-feedback">Required columns: student_id, first_name, last_name, school, sport, year.</p>
          ) : null}

          <div className="sample-csv-card" aria-label="Sample CSV format">
            <div className="sample-csv-head">Sample CSV Format</div>
            <div className="sample-csv-row">student_id,first_name,last_name,school,sport,year</div>
            <div className="sample-csv-row">1042,Jordan,Reed,State University,Basketball,2026</div>
            <div className="sample-csv-row">1043,Talia,Nguyen,State University,Basketball,2026</div>
            <div className="sample-csv-row">1044,Marcus,Brown,State University,Basketball,2026</div>
            <div className="sample-csv-row">1045,Ava,Patel,Lakeside College,Tennis,2026</div>
            <div className="sample-csv-row">1046,Noah,Davis,Lakeside College,Tennis,2026</div>
          </div>

          <div className="sample-csv-links" aria-label="Sample CSV links">
            <a href="/sample-csv/roster_template.csv" className="interactive-link" download>
              roster_template.csv
            </a>
            <a href="/sample-csv/womens_tennis_template.csv" className="interactive-link" download>
              womens_tennis_template.csv
            </a>
          </div>
        </section>

        <section className="coach-right-column coach-panel">
          <h2>Current Rosters</h2>
          <p className="coach-panel-subtext">Uploaded by current coach</p>

          <div className="roster-list-card">
            <div className="roster-list-header">
              <span>School</span>
              <span>Year</span>
              <span>Sport</span>
              <span>Players</span>
              <span>Actions</span>
            </div>

            {isLoadingRosters ? <div className="roster-empty-state">Loading rosters...</div> : null}
            {!isLoadingRosters && rosters.length === 0 ? (
              <div className="roster-empty-state">No roster groups uploaded yet.</div>
            ) : null}
            {!isLoadingRosters
              ? rosters.map((roster) => (
                  <div className="roster-item" key={roster.id}>
                    <div>
                      <div className="roster-school">{roster.school}</div>
                      <div className="roster-file-name">{roster.fileName || 'Uploaded roster CSV'}</div>
                      <div className="roster-updated">Updated {formatTimestamp(roster.updatedAt)}</div>
                    </div>
                    <span>{roster.year}</span>
                    <span className="roster-sport">{roster.sport}</span>
                    <span>{roster.playerCount}</span>
                    <div className="roster-actions">
                      <button
                        type="button"
                        className="roster-action-button roster-open-button"
                        onClick={() => handleOpenRosterFile(roster.id)}
                        disabled={!roster.hasSourceFile}
                      >
                        <span>Open CSV</span>
                        <span className="roster-open-lock" aria-hidden="true">
                          <svg viewBox="0 0 24 24" focusable="false">
                            <path
                              d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-6 0V7a1 1 0 0 1 2 0v2Zm1 7.75A1.75 1.75 0 1 1 13.75 15 1.75 1.75 0 0 1 12 16.75Z"
                              fill="currentColor"
                            />
                          </svg>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="roster-action-button roster-delete-button"
                        onClick={() => handleDeleteRoster(roster)}
                        disabled={deletingRosterId === roster.id}
                      >
                        {deletingRosterId === roster.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))
              : null}
          </div>
        </section>
      </main>
    </div>
  );
}

export default CoachRostersPage;
