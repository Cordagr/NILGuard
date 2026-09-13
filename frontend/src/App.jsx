import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import StudentDashboardPage from './pages/StudentDashboardPage.jsx';
import ContractsPage from './pages/ContractsPage.jsx';
import ContractAnalysisPage from './pages/ContractAnalysisPage.jsx';
import CoachRostersPage from './pages/CoachRostersPage.jsx';
import ComplianceDashboardPage from './pages/ComplianceDashboardPage.jsx';
import ComplianceOfficerDashboardPage from './pages/ComplianceOfficerDashboardPage.jsx';
import './styles/global.css';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/dashboard/student"
              element={
                <ProtectedRoute allowedRole="student">
                  <StudentDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/coach"
              element={
                <ProtectedRoute allowedRole="coach">
                  <CoachRostersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/school"
              element={
                <ProtectedRoute allowedRole="school">
                  <CoachRostersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/compliance"
              element={
                <ProtectedRoute allowedRole="compliance">
                  <ComplianceOfficerDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contracts"
              element={
                <ProtectedRoute>
                  <ContractsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/contracts/analyze"
              element={
                <ProtectedRoute>
                  <ContractAnalysisPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
