import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchMe, logoutUser } from '../services/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // when the app loads, ask the backend if the session cookie is still valid
  useEffect(() => {
    fetchMe()
      .then((response) => setUser(response.user))
      .catch(() => setUser(null))
      .finally(() => setIsCheckingSession(false));
  }, []);

  function startSession(userData) {
    setUser(userData);
  }

  async function logout() {
    try {
      await logoutUser();
    } catch (_error) {
      // clear the local user even if the request fails
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, isCheckingSession, startSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
