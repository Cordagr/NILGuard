import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children, allowedRole }) {
  const { user, isCheckingSession } = useAuth();
  const location = useLocation();

  if (isCheckingSession) {
    return <p style={{ padding: '2rem' }}>Checking your session...</p>;
  }

  if (!user) {
    return <Navigate to="/login?reason=auth" state={{ from: location }} replace />;
  }

  if (allowedRole && user.role !== allowedRole) {
    return (
      <div style={{ padding: '2rem' }}>
        <h2>Access denied</h2>
        <p>
          Your account is registered as {user.role}. This page is for the {allowedRole} role.
        </p>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;
