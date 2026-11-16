import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider, useToast } from './components/ui/toast';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';
import ProfileManagement from './pages/ProfileManagement.jsx';
import RosterInvitePage from './pages/RosterInvitePage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import StudentDashboardPage from './pages/StudentDashboardPage.jsx';
import ContractsPage from './pages/ContractsPage.jsx';
import ContractAnalysisPage from './pages/ContractAnalysisPage.jsx';
import CoachRostersPage from './pages/CoachRostersPage.jsx';
import EducationDashboardPage from './pages/EducationDashboardPage.jsx';
import MoneyBasicsPage from './pages/MoneyBasicsPage.jsx';
import MoneyBasicsQuizPage from './pages/MoneyBasicsQuizPage.jsx';
import NILDealsPage from './pages/NILDealsPage.jsx';
import NILDealsQuizPage from './pages/NILDealsQuizPage.jsx';
import Contracts101Page from './pages/Contracts101Page.jsx';
import Contracts101QuizPage from './pages/Contracts101QuizPage.jsx';
import ComplianceDashboardPage from './pages/ComplianceDashboardPage.jsx';
import AthletesProfilePage from './pages/AthletesProfilePage.jsx';
import './styles/global.css';
import './App.css';

function EducationProgressSyncNotice() {
  const { showToast } = useToast();

  useEffect(() => {
    const handleSyncError = (event) => {
      showToast({
        variant: 'error',
        title: 'Education progress sync failed',
        detail: event.detail?.message || 'Education progress could not be synced.'
      });
    };

    window.addEventListener('nilguard:education-sync-error', handleSyncError);
    return () => window.removeEventListener('nilguard:education-sync-error', handleSyncError);
  }, [showToast]);

  return null;
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <div className="App">
            <EducationProgressSyncNotice />
            <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfileManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/roster-invite"
              element={
                <ProtectedRoute allowedRole="student">
                  <RosterInvitePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/student"
              element={
                <ProtectedRoute allowedRole="student">
                  <StudentDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
  path="/student/education"
  element={
    <ProtectedRoute allowedRole="student">
      <EducationDashboardPage />
    </ProtectedRoute>
  }
/>
<Route
  path="/student/education/money-basics"
  element={
    <ProtectedRoute allowedRole="student">
      <MoneyBasicsPage />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/education/money-basics/quiz"
  element={
    <ProtectedRoute allowedRole="student">
      <MoneyBasicsQuizPage />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/education/nil-deals"
  element={
    <ProtectedRoute allowedRole="student">
      <NILDealsPage />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/education/nil-deals/quiz"
  element={
    <ProtectedRoute allowedRole="student">
      <NILDealsQuizPage />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/education/contracts"
  element={
    <ProtectedRoute allowedRole="student">
      <Contracts101Page />
    </ProtectedRoute>
  }
/>

<Route
  path="/student/education/contracts/quiz"
  element={
    <ProtectedRoute allowedRole="student">
      <Contracts101QuizPage />
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
              path="/coach/athletes/:id"
              element={
                <ProtectedRoute allowedRole="coach">
                  <AthletesProfilePage />
                </ProtectedRoute>
              }
            />
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
                  <ComplianceDashboardPage />
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
    </ToastProvider>
  );
}

export default App;
