import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/pages/CoachRosters.css';
import logo from '../assets/NILGUARD.png';

function CoachRostersPage() {
  const preventNavigation = (event) => {
    event.preventDefault();
  };

  return (
    <div className="coach-page">
      <header className="coach-header">
        <div className="coach-logo-wrap">
          <img src={logo} alt="NILGuard Logo" className="coach-logo" />
        </div>

        <Link to="/login" className="coach-logout-link">
          Logout
        </Link>
      </header>

      <main className="coach-layout">
        <section className="coach-left-column coach-panel">
          <h2>Upload Roster</h2>
          <p className="coach-panel-subtext">
            Drag and drop or select a CSV file. The backend validates format and required columns.
          </p>

          <button type="button" className="upload-roster-btn">
            Upload Roster CSV
          </button>

          <div className="sample-csv-card" aria-label="Sample CSV format">
            <div className="sample-csv-head">Sample CSV Format</div>
            <div className="sample-csv-row">student_id,first_name,last_name,school,sport,year</div>
            <div className="sample-csv-row">1042,Jordan,Reed,State University,Basketball,Sophomore</div>
            <div className="sample-csv-row">1043,Talia,Nguyen,Lakeside College,Tennis,Freshman</div>
            <div className="sample-csv-row">1044,Marcus,Brown,State University,Football,Senior</div>
            <div className="sample-csv-row">1045,Ava,Patel,Lakeside College,Soccer,Junior</div>
            <div className="sample-csv-row">1046,Noah,Davis,Westfield University,Baseball,Senior</div>
          </div>

          <div className="sample-csv-links" aria-label="Sample CSV links">
            <a href="#" className="interactive-link" onClick={preventNavigation}>
              roster_template.csv
            </a>
            <a href="#" className="interactive-link" onClick={preventNavigation}>
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
            </div>

            <div className="roster-item">
              <a href="#" className="roster-school interactive-link" onClick={preventNavigation}>
                State University
              </a>
              <span>2026</span>
              <span className="roster-sport">Basketball</span>
              <span>18</span>
            </div>

            <div className="roster-item">
              <a href="#" className="roster-school interactive-link" onClick={preventNavigation}>
                Lakeside College
              </a>
              <span>2026</span>
              <span className="roster-sport">Tennis</span>
              <span>12</span>
            </div>

            <div className="roster-item">
              <a href="#" className="roster-school interactive-link" onClick={preventNavigation}>
                State University
              </a>
              <span>2025</span>
              <span className="roster-sport">Football</span>
              <span>64</span>
            </div>

            <div className="roster-item">
              <a href="#" className="roster-school interactive-link" onClick={preventNavigation}>
                Westfield University
              </a>
              <span>2025</span>
              <span className="roster-sport">Baseball</span>
              <span>32</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default CoachRostersPage;
