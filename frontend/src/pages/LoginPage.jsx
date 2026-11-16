import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ToastMessage } from '../components/ui/toast';
import '../styles/pages/Login.css';
import logo from '../assets/NILGUARD.png';
import { getDashboardRouteForRole, getNormalizedRole, ROLE_LABELS } from '../utils/roleRouting';
import { loginUser, resendEmailVerification } from '../services/authApi';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { startSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [verificationMessage, setVerificationMessage] = useState('');
  const [isResendingVerification, setIsResendingVerification] = useState(false);

  const [selectedRole, setSelectedRole] = useState(
    () => getNormalizedRole(searchParams.get('role'))
  );

  const noticeMessage = searchParams.get('reason') === 'timeout'
    ? 'Your session expired. Please log in again.'
    : searchParams.get('reason') === 'auth'
      ? 'Please log in to access that page.'
      : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const response = await loginUser({ email, password, role: selectedRole });
      startSession(response.user);
      navigate(getDashboardRouteForRole(response.user.role));
    } catch (error) {
      setErrorMessage(error.message || 'Login failed. Please try again.');
      setVerificationMessage(error.message?.includes('Verify your email address') ? 'Your account needs email verification.' : '');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setIsResendingVerification(true);
    setVerificationMessage('');
    try {
      const response = await resendEmailVerification(email);
      setVerificationMessage(response.message);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to send a verification email.');
    } finally {
      setIsResendingVerification(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <img src={logo} alt="NILGuard Logo" />
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-role">
              Role
            </label>
            <select
              id="login-role"
              className="form-input"
              value={selectedRole}
              onChange={(e) => setSelectedRole(getNormalizedRole(e.target.value))}
              required
            >
              {Object.entries(ROLE_LABELS)
                .filter(([role]) => role !== 'school')
                .map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
            </select>
          </div>

          {noticeMessage && (
            <p className="login-hint">{noticeMessage}</p>
          )}

          <p className="login-hint">
            Sign in with your official university .edu email.
          </p>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="Enter your school email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {errorMessage && (
            <ToastMessage message={errorMessage} variant="error" title="Sign in failed" />
          )}
          {verificationMessage ? (
            <div className="login-verification-prompt">
              <p>{verificationMessage}</p>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={handleResendVerification}
                disabled={isResendingVerification}
              >
                {isResendingVerification ? 'Sending...' : 'Resend verification email'}
              </button>
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary btn-block btn-lg">
            {isSubmitting ? 'Signing in...' : 'Submit'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            <Link to={`/register${selectedRole ? `?role=${selectedRole}` : ''}`}>Register New User</Link>
            <span className="footer-divider">•</span>
            <Link to="/">Back to Role Selection</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
