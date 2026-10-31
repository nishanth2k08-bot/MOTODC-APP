import React, { useState } from 'react';
import { Truck, Shield, User, KeyRound, ArrowRight, Sun, Moon } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function Login({ onLogin, theme, onToggleTheme }) {
  const [riderName, setRiderName] = useState('');
  const [riderId, setRiderId] = useState('');
  const [passcode, setPasscode] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanName = riderName.trim();
    const cleanId = (riderId.trim() || `RDR-${Math.floor(100 + Math.random() * 900)}`).toUpperCase();

    if (!cleanName) {
      toast.error('Please enter your Driver / Rider Name');
      return;
    }

    if (passcode && passcode.length < 4) {
      toast.error('Passcode must be at least 4 digits');
      return;
    }

    const riderProfile = {
      name: cleanName,
      riderId: cleanId,
      shiftStart: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };

    onLogin(riderProfile);
    toast.success(`Welcome on shift, ${cleanName}!`);
  };

  const handleQuickLogin = (name, id) => {
    const riderProfile = {
      name,
      riderId: id,
      shiftStart: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };
    onLogin(riderProfile);
    toast.success(`Welcome, ${name}!`);
  };

  return (
    <div className="loginWrapper">
      <div className="loginTopBar">
        <div className="brand">
          <Truck size={22} color="#ff3157" />
          <b>Moto<span>DC</span> Partner</b>
        </div>
        <button
          type="button"
          className="themeToggleBtn"
          onClick={onToggleTheme}
          title="Toggle Day / Night Mode"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={17} color="#fbbf24" /> : <Moon size={17} color="#3b82f6" />}
        </button>
      </div>

      <div className="loginCard">
        <div className="loginIconCircle">
          <Shield size={32} color="#ff3157" />
        </div>
        <h2>Delivery Partner Login</h2>
        <p>Sign in to start your delivery shift & verify doorstep handovers</p>

        <form onSubmit={handleSubmit} className="loginForm">
          <div className="inputGroup">
            <label>Rider / Driver Name *</label>
            <div className="inputWrap">
              <User size={16} className="inputIcon" />
              <input
                type="text"
                placeholder="e.g. Ramesh Kumar"
                value={riderName}
                onChange={(e) => setRiderName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>
          </div>

          <div className="inputGroup">
            <label>Rider ID (Optional)</label>
            <div className="inputWrap">
              <Truck size={16} className="inputIcon" />
              <input
                type="text"
                placeholder="e.g. MDC-R01"
                value={riderId}
                onChange={(e) => setRiderId(e.target.value)}
              />
            </div>
          </div>

          <div className="inputGroup">
            <label>Driver Passcode (Default: 1234)</label>
            <div className="inputWrap">
              <KeyRound size={16} className="inputIcon" />
              <input
                type="password"
                placeholder="••••"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                maxLength={8}
              />
            </div>
          </div>

          <button type="submit" className="loginSubmitBtn">
            Start Delivery Shift <ArrowRight size={16} />
          </button>
        </form>

        <div className="quickRidersSection">
          <small>QUICK ROSTER SWITCH:</small>
          <div className="quickRiderChips">
            <button
              type="button"
              className="quickChip"
              onClick={() => handleQuickLogin('Rider 1 (Main Hub)', 'MDC-R01')}
            >
              Rider 1
            </button>
            <button
              type="button"
              className="quickChip"
              onClick={() => handleQuickLogin('Rider 2 (North Route)', 'MDC-R02')}
            >
              Rider 2
            </button>
            <button
              type="button"
              className="quickChip"
              onClick={() => handleQuickLogin('Rider 3 (South Route)', 'MDC-R03')}
            >
              Rider 3
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
