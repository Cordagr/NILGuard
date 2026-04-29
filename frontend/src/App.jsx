import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/dashboard/student" element={<StudentDashboardPage />} />
          <Route path="/dashboard/coach" element={<CoachRostersPage />} />
          <Route path="/dashboard/school" element={<CoachRostersPage />} />
          <Route path="/dashboard/compliance" element={<ComplianceOfficerDashboardPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/contracts/analyze" element={<ContractAnalysisPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
