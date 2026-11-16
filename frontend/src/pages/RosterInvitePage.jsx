import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { useToast } from '../components/ui/toast';
import { acceptRosterEducationInvite, previewRosterEducationInvite } from '../services/educationApi';
import { fetchMe } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/NILGUARD.png';
import '../styles/pages/ProfileManagement.css';

function RosterInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const { showToast } = useToast();
  const [code, setCode] = useState(searchParams.get('code') || '');
  const [invitation, setInvitation] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    const queryCode = searchParams.get('code');
    if (queryCode) {
      setCode(queryCode);
    }
  }, [searchParams]);

  const handlePreview = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setInvitation(null);
    setIsLoading(true);
    try {
      const response = await previewRosterEducationInvite(code.trim());
      setInvitation(response.invitation);
    } catch (error) {
      setErrorMessage(error.message || 'This roster invite is invalid or expired.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    setErrorMessage('');
    setIsAccepting(true);
    try {
      const response = await acceptRosterEducationInvite(code.trim(), undefined, false);
      const userResponse = await fetchMe();
      updateUser(userResponse.user);
      showToast({ variant: 'success', title: 'Roster linked', detail: 'Your education progress remains private.' });
      setInvitation(null);
      setErrorMessage('');
      if (!response.message) {
        throw new Error('The server did not confirm the roster link.');
      }
    } catch (error) {
      setErrorMessage(error.message || 'Unable to link this roster.');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="profile-management-page">
      <header className="profile-management-header">
        <img src={logo} alt="NILGuard" />
        <div><p>Athlete account</p><h1>Link a roster</h1></div>
        <Button type="button" variant="outline" onClick={() => navigate('/dashboard/student')}>Back to dashboard</Button>
      </header>
      <main className="profile-management-content">
        <section className="profile-management-card">
          <p>Enter the one-time code from your coach. Linking your account does not share your education progress.</p>
          <form onSubmit={handlePreview}>
            <label className="profile-field">
              <span>One-time invite code</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={32}
                required
                autoComplete="one-time-code"
              />
            </label>
            <div className="profile-edit-actions">
              <Button type="submit" variant="default" disabled={isLoading || code.trim().length !== 32}>
                {isLoading ? 'Checking...' : 'Check invite'}
              </Button>
            </div>
          </form>
          {errorMessage ? <p className="profile-form-error" role="alert">{errorMessage}</p> : null}
          {invitation ? (
            <div className="roster-invite-preview">
              <p><strong>Athlete:</strong> {invitation.athleteName}</p>
              <p><strong>Student ID:</strong> {invitation.studentId}</p>
              <p><strong>School:</strong> {invitation.school}</p>
              <p><strong>Sport / year:</strong> {invitation.sport} · {invitation.year}</p>
              <Button type="button" variant="default" onClick={handleAccept} disabled={isAccepting}>
                {isAccepting ? 'Linking...' : 'Link roster'}
              </Button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default RosterInvitePage;
