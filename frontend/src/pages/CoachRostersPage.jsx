import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/pages/CoachRosters.css';
import logo from '../assets/NILGUARD.png';
import ProfileIcon from '../assets/ProfileIcon.png';
import { deleteRoster, getRosterFileUrl, listRosters, uploadRosterCsv, listCoachAthletes } from '../services/rosterApi';

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

function validateRosterCsvForAssignedSchool(csvText, assignedSchool) {
  if (!assignedSchool) {
    return null;
  }

  const rows = parseCsvRows(csvText);

  if (rows.length < 2) {
    return 'The CSV must include a header row and at least one player row.';
  }

  const headerRow = rows[0].map(normalizeCsvHeader);
  const schoolColumnIndex = headerRow.indexOf('school');

  if (schoolColumnIndex === -1) {
    return 'The CSV must include a school column.';
  }

  const normalizedAssignedSchool = assignedSchool.toLowerCase().trim();
  const mismatchedSchool = rows.slice(1).find((row) => {
    const schoolValue = String(row[schoolColumnIndex] || '').trim();
    return schoolValue !== '' && schoolValue.toLowerCase() !== normalizedAssignedSchool;
  });

  if (!mismatchedSchool) {
    return null;
  }

  const csvSchool = String(mismatchedSchool[schoolColumnIndex] || '').trim();
  return `This account is assigned to ${assignedSchool}. Every CSV row must use that school in the school column. Found: ${csvSchool || 'blank value'}.`;
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
  const [expandedRosterIds, setExpandedRosterIds] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [isLoadingRosters, setIsLoadingRosters] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingRosterId, setDeletingRosterId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [athleteSearch, setAthleteSearch] = useState('');

  const athletes = rosters.flatMap((roster) =>
    (roster.players || []).map((player) => ({
      ...player,
      school: roster.school,
      sport: roster.sport,
      year: roster.year,
      rosterId: roster.id
    }))
  );

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
    )
  );

  const fetchRosters = async () => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }

    setIsLoadingRosters(true);

    try {
      const rostersResponse = await listRosters(currentUser);
      setRosters(rostersResponse.rosters || []);
      
      const athletesResponse = await listCoachAthletes(currentUser);
      setAthletes(athletesResponse.athletes || []);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load rosters and athletes.');
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

  // UPDATED: Now gracefully handles the nested assignments array from the backend
  const groupedTeams = useMemo(() => {
    const groups = {};
    
    athletes.forEach((athlete) => {
      if (athlete.assignments && athlete.assignments.length > 0) {
        // If they have an assignments array, map them into each sport they play
        athlete.assignments.forEach((assignment) => {
          const sport = assignment.sport || 'Unknown Sport';
          const year = assignment.year || 'Unknown Year';
          const key = `${sport} - ${year}`;
          
          if (!groups[key]) {
            groups[key] = [];
          }
          // Merge the assignment data (sport, year) into the athlete object for rendering
          groups[key].push({ ...athlete, sport, year });
        });
      } else {
        // Fallback for flat structure
        const sport = athlete.sport || 'Unknown Sport';
        const year = athlete.year || 'Unknown Year';
        const key = `${sport} - ${year}`;
        
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(athlete);
      }
    });

    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {});
  }, [athletes]);

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

    if (currentUser?.school) {
      try {
        const csvText = await selectedFile.text();
        const csvValidationError = validateRosterCsvForAssignedSchool(csvText, currentUser.school);

        if (csvValidationError) {
          setSuccessMessage('');
          setErrorMessage(csvValidationError);
          return;
        }
      } catch (_error) {
        setSuccessMessage('');
        setErrorMessage('Unable to read this CSV file for validation.');
        return;
      }
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
      await fetchRosters();
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

        <div className="coach-header-title-block">
          <h1 className="coach-header-title">Coach Dashboard</h1>
          {currentUser?.school ? (
            <p className="coach-header-identity">{currentUser.school} · {currentUser.ncaaDivision || 'NCAA'}</p>
          ) : null}
        </div>

        <div className="coach-header-actions">
          {currentUser?.email ? (
            <span style={{ marginRight: '0.75rem', fontSize: '0.9rem', color: '#555' }}>{currentUser.email}</span>
          ) : null}
         <div className="profile-menu" style={{ position: 'relative' }}>
            <button
              type="button"
              className="profile-menu-trigger"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <img src={ProfileIcon} alt="Profile" className="profile-icon-img" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #222', background: '#fff' }} />
            </button>
            {menuOpen && (
              <div className="profile-menu-dropdown" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', border: '2px solid #F0E6D8', borderRadius: '1em', boxShadow: '0 8px 32px rgba(24,24,24,0.12)', minWidth: 140, zIndex: 100 }}>
                <button
                  type="button"
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '0.9em 1.4em', textAlign: 'left', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#181818', cursor: 'pointer', borderRadius: 0 }}
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="coach-overview" aria-label="Roster overview">
        <div className="coach-welcome"><span className="coach-eyebrow">YOUR TEAM. YOUR NEXT MOVE.</span><h2>Build your team’s starting lineup.</h2><p>Bring your rosters together and keep every athlete in view.</p></div>
        <div className="coach-stat"><span>Roster groups</span><strong>{isLoadingRosters || errorMessage ? '—' : rosters.length}</strong></div>
        <div className="coach-stat"><span>Players on rosters</span><strong>{isLoadingRosters || errorMessage ? '—' : rosters.reduce((total, roster) => total + (Number(roster.playerCount) || 0), 0)}</strong></div>
      </section>
      <main className="coach-layout">
        
        <section className="coach-left-column coach-panel">
          <span className="coach-eyebrow">01 / BUILD YOUR ROSTER</span>
          <h2>Upload roster</h2>
          <p className="coach-panel-subtext">
            Select a CSV file. NILGuard validates the required columns and groups players into rosters by school, sport, and year.
          </p>
          {currentUser?.school ? (
            <p className="coach-assignment-note">
              Assigned school: <strong>{currentUser.school}</strong>. The CSV must still include the school column, and every row must use that exact school value.
            </p>
          ) : null}

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

          {errorMessage ? <p role="alert" className="roster-feedback roster-error">{errorMessage}</p> : null}
          {!errorMessage && successMessage ? <p role="status" className="roster-feedback roster-success">{successMessage}</p> : null}
          {!errorMessage && !successMessage ? (
            <p className="roster-feedback">
              Required columns: student_id, first_name, last_name, school, sport, year.
              {currentUser?.school ? ` School values must be ${currentUser.school}.` : ''}
            </p>
          ) : null}

          <div className="sample-csv-card" aria-label="Sample CSV format">
            <div className="sample-csv-head">Sample CSV Format</div>
            <div className="sample-csv-row">student_id,first_name,last_name,school,sport,year</div>
            <div className="sample-csv-row">1042,Jordan,Reed,{currentUser?.school || 'State University'},Basketball,2026</div>
            <div className="sample-csv-row">1043,Talia,Nguyen,{currentUser?.school || 'State University'},Basketball,2026</div>
            <div className="sample-csv-row">1044,Marcus,Brown,{currentUser?.school || 'State University'},Basketball,2026</div>
          </div>

          <div className="sample-csv-links" aria-label="Sample CSV links">
            <a href="/sample-csv/roster_template.csv" className="interactive-link" download>
              roster_template.csv
            </a>
          </div>
        </section>

        <section className="coach-right-column coach-panel">
          <span className="coach-eyebrow">02 / YOUR TEAM HUB</span>
          <h2>Athlete Directory</h2>
          <p className="coach-panel-subtext">
            Browse individual student-athletes across your uploaded rosters.
          </p>

          <label className="athlete-search-label" htmlFor="athlete-directory-search">
            Search athletes
          </label>
          <input
            id="athlete-directory-search"
            className="athlete-search-input"
            type="search"
            value={athleteSearch}
            onChange={(event) => setAthleteSearch(event.target.value)}
            placeholder="Search by name, student ID, sport, or year"
          />

          <div className="athlete-directory-list">
            {isLoadingRosters ? (
              <div className="roster-empty-state">Loading athletes...</div>
            ) : filteredAthletes.length === 0 ? (
              <div className="roster-empty-state">
                {athletes.length === 0
                  ? 'No athletes found. Upload a roster CSV to get started.'
                  : 'No athletes match your search.'}
              </div>
            ) : (
              filteredAthletes.map((athlete, index) => (
                <article
                  className="athlete-directory-card"
                  key={`${athlete.rosterId}-${athlete.studentId}-${index}`}
                >
                  <div className="athlete-directory-identity">
                    <h3>{athlete.firstName} {athlete.lastName}</h3>
                    <span className="roster-player-id">
                      Student ID: {athlete.studentId}
                    </span>
                  </div>
                  <div className="athlete-directory-details">
                    <span><strong>Sport:</strong> {athlete.sport}</span>
                    <span><strong>Year:</strong> {athlete.year}</span>
                    <span><strong>School:</strong> {athlete.school}</span>
                  </div>
                </article>
              ))
            )}
          </div>

          <h2 className="athlete-rosters-heading">Current Rosters</h2>
          <p className="coach-panel-subtext">Uploaded by current coach</p>

          <div className="roster-list-card" style={{ marginBottom: '40px' }}>
            <div className="roster-list-header">
              <span>School</span>
              <span>Year</span>
              <span>Sport</span>
              <span>Players</span>
              <span>Actions</span>
            </div>

            {isLoadingRosters ? (
              <div className="roster-empty-state">Loading rosters...</div>
            ) : null}
            {!isLoadingRosters && rosters.length === 0 ? (
              <div className="roster-empty-state">No roster groups uploaded yet.</div>
            ) : null}
            {!isLoadingRosters
              ? rosters.map((roster) => (
                  <React.Fragment key={roster.id}>
                    <div className="roster-item">
                      <div>
                        <div className="roster-school">{roster.school}</div>
                        <div className="roster-file-name">
                          {roster.fileName || 'Uploaded roster CSV'}
                        </div>
                        <div className="roster-updated">
                          Updated {formatTimestamp(roster.updatedAt)}
                        </div>
                      </div>
                      <span>{roster.year}</span>
                      <span className="roster-sport">{roster.sport}</span>
                      <span>{roster.playerCount}</span>
                      <div className="roster-actions">
                        <button
                          type="button"
                          className="roster-action-button"
                          onClick={() =>
                            setExpandedRosterIds((previous) =>
                              previous.includes(roster.id)
                                ? previous.filter((id) => id !== roster.id)
                                : [...previous, roster.id]
                            )
                          }
                          aria-expanded={expandedRosterIds.includes(roster.id)}
                        >
                          {expandedRosterIds.includes(roster.id)
                            ? 'Hide Athletes'
                            : 'View Athletes'}
                        </button>
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

                    {expandedRosterIds.includes(roster.id) && (
                      <div className="roster-players-panel">
                        <h3>Athletes ({roster.players?.length || 0})</h3>
                        {!roster.players?.length ? (
                          <p>No athlete records found in this roster.</p>
                        ) : (
                          <div className="roster-players-list">
                            {roster.players.map((player) => (
                              <div className="roster-player" key={player.studentId}>
                                <span>{player.firstName} {player.lastName}</span>
                                <span className="roster-player-id">
                                  ID: {player.studentId}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))
              : null}

          </div>

          <h2>Your Assigned Teams</h2>
          <p className="coach-panel-subtext" style={{ marginBottom: '24px' }}>
            Rosters grouped by sport and year. Select any athlete to open their profile.
          </p>

          {isLoadingRosters ? (
            <div className="roster-empty-state">Loading teams...</div>
          ) : Object.keys(groupedTeams).length === 0 ? (
            <div className="roster-empty-state">No athletes found. Upload a roster to begin.</div>
          ) : (
            <div className="assigned-teams-wrapper">
              {Object.entries(groupedTeams).map(([teamName, teamAthletes]) => (
                <div key={teamName} className="team-group">
                  
                  <div className="team-header">
                    <h3>{teamName}</h3>
                    <span className="team-count">
                      {teamAthletes.length} {teamAthletes.length === 1 ? 'player' : 'players'}
                    </span>
                  </div>

                  <div className="team-table-container">
                    <table className="team-table">
                      <thead>
                        <tr>
                          <th>NAME</th>
                          <th>STUDENT ID</th>
                          <th>SPORT</th>
                          <th>YEAR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamAthletes.map((athlete) => {
                          const fullName = `${athlete.firstName || ''} ${athlete.lastName || ''}`.trim();
                          return (
                            <tr
                              key={`${athlete.studentId}-${athlete.sport}`}
                              onClick={() => navigate(`/athlete/${athlete.studentId}`)}
                            >
                              <td className="team-player-name">{fullName || 'Unknown'}</td>
                              <td>{athlete.studentId || '—'}</td>
                              <td>{athlete.sport || '—'}</td>
                              <td>{athlete.year || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default CoachRostersPage;