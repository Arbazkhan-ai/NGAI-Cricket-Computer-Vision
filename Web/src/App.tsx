import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';


import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import Home from './pages/Home';
import RuleBasedGame from './pages/RuleBasedGame';
import Analytics from './pages/Analytics';
import MatchHistory from './pages/MatchHistory';
import DetectionSource from './pages/DetectionSource';
import LiveDetection from './pages/LiveDetection';
import Settings from './pages/Settings';
import LandingPage from './pages/LandingPage';
import DashboardLayout from './components/DashboardLayout';
import { GameProvider } from './context/GameContext';

function App() {
  return (
    <GameProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />

          {/* Authenticated Routes with Dashboard Layout */}
          <Route path="/home" element={
            <DashboardLayout>
              <Home />
            </DashboardLayout>
          } />
          <Route path="/source" element={
            <DashboardLayout>
              <DetectionSource />
            </DashboardLayout>
          } />
          <Route path="/live" element={
            <DashboardLayout>
              <LiveDetection />
            </DashboardLayout>
          } />
          <Route path="/analytics" element={
            <DashboardLayout>
              <Analytics />
            </DashboardLayout>
          } />
          <Route path="/game" element={
            <DashboardLayout>
              <RuleBasedGame />
            </DashboardLayout>
          } />
          <Route path="/match-history" element={
            <DashboardLayout>
              <MatchHistory />
            </DashboardLayout>
          } />
          <Route path="/settings" element={
            <DashboardLayout>
              <Settings />
            </DashboardLayout>
          } />

          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </GameProvider>
  );
}

export default App;