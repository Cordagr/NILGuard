import React, { useEffect, useMemo, useState } from 'react';
import { listAthletes } from '../services/rosterApi';
import '../styles/pages/AllAthletes.css';
import { useAuth } from '../context/AuthContext';


export default function AllAthletes({ onSelectAthlete }) {
  const { user } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [search, setSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('All Schools');
  const [sportFilter, setSportFilter] = useState('All Sports');
  const [yearFilter, setYearFilter] = useState('All Years');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAthletes();
  }, []);

  async function loadAthletes() {
    try {
      setLoading(true);
      setError('');

      const result = await listAthletes(user);

      setAthletes(result?.athletes || []);
    } catch (err) {
      console.error('Failed to load athletes:', err);
      setError(err.message || 'Unable to load athletes.');
    } finally {
      setLoading(false);
    }
  }

  const schools = useMemo(() => {
    return [
      'All Schools',
      ...Array.from(
        new Set(athletes.map((athlete) => athlete.school).filter(Boolean))
      ).sort()
    ];
  }, [athletes]);

  const sports = useMemo(() => {
    return [
      'All Sports',
      ...Array.from(
        new Set(athletes.map((athlete) => athlete.sport).filter(Boolean))
      ).sort()
    ];
  }, [athletes]);

  const years = useMemo(() => {
    return [
      'All Years',
      ...Array.from(
        new Set(athletes.map((athlete) => athlete.year).filter(Boolean))
      ).sort()
    ];
  }, [athletes]);

  const filteredAthletes = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return athletes.filter((athlete) => {
      const fullName =
        `${athlete.firstName || ''} ${athlete.lastName || ''}`
          .trim()
          .toLowerCase();

      const matchesSearch =
        !searchValue ||
        fullName.includes(searchValue) ||
        String(athlete.studentId || '')
          .toLowerCase()
          .includes(searchValue);

      const matchesSchool =
        schoolFilter === 'All Schools' ||
        athlete.school === schoolFilter;

      const matchesSport =
        sportFilter === 'All Sports' ||
        athlete.sport === sportFilter;

      const matchesYear =
        yearFilter === 'All Years' ||
        athlete.year === yearFilter;

      return (
        matchesSearch &&
        matchesSchool &&
        matchesSport &&
        matchesYear
      );
    });
  }, [athletes, search, schoolFilter, sportFilter, yearFilter]);

  const groupedAthletes = useMemo(() => {
    // Sort athletes alphabetically by last name
    const sorted = [...filteredAthletes].sort((a, b) => {
      const nameA = a.lastName || a.firstName || '';
      const nameB = b.lastName || b.firstName || '';
      return nameA.localeCompare(nameB);
    });

    // Group by the first letter of the last name
    const groups = {};
    sorted.forEach((athlete) => {
      const targetName = athlete.lastName || athlete.firstName || '?';
      const firstLetter = targetName.charAt(0).toUpperCase();

      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(athlete);
    });

    return groups;
  }, [filteredAthletes]);

  function handleAthleteClick(athlete) {
    if (onSelectAthlete) {
      onSelectAthlete(athlete);
    }
  }

  function clearFilters() {
    setSearch('');
    setSchoolFilter('All Schools');
    setSportFilter('All Sports');
    setYearFilter('All Years');
  }

  return (
    <div className="all-athletes-page">
      <div className="all-athletes-header">
        <div>
          <h1>All Athletes</h1>
        </div>
        <button
          type="button"
          className="clear-filters-btn"
          onClick={clearFilters}
        >
          Clear Filters
        </button>
      </div>

      <div className="search-controls">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search athlete or ID"
          className="athlete-search-input"
        />

        <select
          value={schoolFilter}
          onChange={(e) => setSchoolFilter(e.target.value)}
          className="athlete-filter"
        >
          {schools.map((school) => (
            <option key={school} value={school}>
              {school}
            </option>
          ))}
        </select>

        <select
          value={sportFilter}
          onChange={(e) => setSportFilter(e.target.value)}
          className="athlete-filter"
        >
          {sports.map((sport) => (
            <option key={sport} value={sport}>
              {sport}
            </option>
          ))}
        </select>

        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="athlete-filter"
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-state">Loading athletes...</div>
      ) : error ? (
        <div className="error-state notification-error" role="alert">{error}</div>
      ) : Object.keys(groupedAthletes).length === 0 ? (
        <div className="empty-state">No athletes match your filters.</div>
      ) : (
        <div className="alphabet-group-list">
          {Object.keys(groupedAthletes)
            .sort()
            .map((letter) => (
              <div key={letter} className="alphabet-group">
                <div className="group-letter">{letter}</div>
                <div className="group-items">
                  {groupedAthletes[letter].map((athlete) => {
                    const fullName =
                      `${athlete.firstName || ''} ${athlete.lastName || ''}`.trim() ||
                      'Unknown Athlete';
                    const initials = (athlete.firstName?.charAt(0) || '').toUpperCase() +
                      (athlete.lastName?.charAt(0) || '').toUpperCase();

                    return (
                      <div
                        key={`${athlete.rosterId || athlete.studentId || fullName}-${athlete.studentId || 'no-id'}`}
                        className="alphabet-athlete-card"
                        onClick={() => handleAthleteClick(athlete)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleAthleteClick(athlete);
                          }
                        }}
                      >
                        <div className="athlete-avatar">{initials || '?'}</div>

                        <div className="athlete-details" style={{ flex: 1 }}>
                          <div className="athlete-name">{fullName}</div>
                          <div className="athlete-subtext">
                            {athlete.sport || 'Unknown Sport'} · Class of{' '}
                            {athlete.year || 'Unknown'} · ID {athlete.studentId || '—'}
                          </div>
                        </div>

                        <div className="arrow-icon">→</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}