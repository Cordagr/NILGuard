import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../services/authApi';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/NILGUARD.png';
import '../styles/pages/Register.css';

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { startSession } = useAuth();
  const verificationStarted = useRef(false);
  const [message, setMessage] = useState('Verifying your email...');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token || verificationStarted.current) {
      if (!token) {
        setMessage('');
        setErrorMessage('This verification link is invalid or expired.');
      }
      return;
    }

    verificationStarted.current = true;
    verifyEmail(token)
      .then((response) => {
        startSession(response.user);
        const inviteCode = searchParams.get('inviteCode');
        navigate(response.user.role === 'student'
          ? inviteCode
            ? `/student/roster-invite?code=${encodeURIComponent(inviteCode)}`
            : '/dashboard/student'
          : '/dashboard/coach', { replace: true });
      })
      .catch((error) => {
        setMessage('');
        setErrorMessage(error.message || 'This verification link is invalid or expired.');
      });
  }, [navigate, searchParams, startSession]);

  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-logo"><img src={logo} alt="NILGuard Logo" /></div>
        <h1>Email verification</h1>
        {message ? <p role="status">{message}</p> : null}
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        {errorMessage ? <Link to="/login">Return to login</Link> : null}
      </div>
    </div>
  );
}

export default VerifyEmailPage;
