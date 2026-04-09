import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import StudentDashboardPage from './pages/StudentDashboardPage.jsx';
import ContractsPage from './pages/ContractsPage.jsx';
import CoachRostersPage from './pages/CoachRostersPage.jsx';
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
          <Route path="/contracts" element={<ContractsPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
