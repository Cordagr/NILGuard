import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/pages/Register.css';
import logo from '../assets/NILGUARD.png';
import { getDashboardRouteForRole, getNormalizedRole, ROLE_LABELS } from '../utils/roleRouting';
import { registerUser } from '../services/authApi';
import { useAuth } from '../context/AuthContext';

function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { startSession } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [selectedRole, setSelectedRole] = useState(
    () => getNormalizedRole(searchParams.get('role'))
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const response = await registerUser({
        email: formData.email,
        password: formData.password,
        role: selectedRole
      });
      startSession(response.user);
      navigate(getDashboardRouteForRole(response.user.role));
    } catch (error) {
      setErrorMessage(error.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-logo">
          <img src={logo} alt="NILGuard Logo" />
        </div>

        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="register-role">
              Role
            </label>
            <select
              id="register-role"
              className="form-input"
              value={selectedRole || ''}
              onChange={(e) => setSelectedRole(getNormalizedRole(e.target.value))}
              required
            >
              <option value="" disabled>Select your role</option>
              {Object.entries(ROLE_LABELS)
                .filter(([role]) => role !== 'school')
                .map(([role, label]) => (
                  <option key={role} value={role}>
                    {label}
                  </option>
                ))}
            </select>
          </div>

          <p className="register-hint">
            Use your official university .edu email. NILGuard assigns your school and NCAA division from the email domain.
          </p>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              name="password"
              placeholder="Create a password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              type="password"
              className="form-input"
              name="confirmPassword"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          {errorMessage && (
            <p className="register-error" role="alert">
              {errorMessage}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block btn-lg">
            {isSubmitting ? 'Creating account...' : 'Submit'}
          </button>
        </form>

        <div className="register-footer">
          <p>
            Already have an account?
            <Link to={`/login${selectedRole ? `?role=${selectedRole}` : ''}`}>Login here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
