import React, { useState, useEffect } from 'react';
import { Truck, Shield, KeyRound, ArrowRight, Sun, Moon, HelpCircle, PhoneCall, CheckCircle2, AlertTriangle, Phone, X, Bell } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function Login({ onLogin, onEnterChangePassword, theme, onToggleTheme }) {
  // Login Form State
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  // Late Check-in Penalty Modal State
  const [lateBlockData, setLateBlockData] = useState(null);
  const [showLateModal, setShowLateModal] = useState(false);

  // Forgot Password / OTP Flow State: 'login' | 'request_reset' | 'verify_otp'
  const [mode, setMode] = useState('login');
  const [resetUsername, setResetUsername] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Check-In Window Live HUD Status
  const getLoginTimeStatus = () => {
    try {
      const now = new Date();
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const ist = new Date(utc + 330 * 60000);
      const minutes = ist.getHours() * 60 + ist.getMinutes();

      // Morning Window: 8:15 AM (495m) to 9:00 AM (540m)
      if (minutes >= 495 && minutes < 540) {
        const isUrgent = minutes >= 525; // 8:45 AM - 9:00 AM
        return {
          isOpen: true,
          isUrgent,
          label: isUrgent
            ? `⚠️ URGENT: Check-in closes at 9:00 AM (${540 - minutes}m left)`
            : '🟢 Karaikal Hub Check-In Active (Closes at 9:00 AM)',
          sub: isUrgent
            ? 'Log in now to avoid an unpunctuality strike and bonus deduction!'
            : 'Log in now to secure your ₹2,500 monthly punctuality bonus.',
        };
      }
      // Afternoon Window: 1:15 PM (795m) to 2:00 PM (840m)
      if (minutes >= 795 && minutes < 840) {
        return {
          isOpen: true,
          isUrgent: minutes >= 825,
          label: '🟢 Afternoon Check-In Active (Closes at 2:00 PM)',
          sub: 'Log in at Karaikal Hub to begin afternoon deliveries.',
        };
      }
      return { isOpen: false };
    } catch {
      return { isOpen: false };
    }
  };

  const loginTimeStatus = getLoginTimeStatus();

  // 0. Raise Emergency 1-Time Login Request to Hub Manager
  const handleRaiseEmergencyRequest = async () => {
    const cleanUser = username.trim().toUpperCase();
    if (!cleanUser) return;
    setRequestLoading(true);
    try {
      const res = await fetch('https://motodc-official.vercel.app/api/delivery-auth?action=request-emergency-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          reason: `Late check-in attempt at ${lateBlockData?.istTimeString || 'past cutoff'}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      toast.success('Emergency login request sent to Hub Manager!');
      setRequestSent(true);
      setRequestStatus('pending');

      // Auto-poll approval status every 4s
      const pollTimer = setInterval(async () => {
        try {
          const checkRes = await fetch(`https://motodc-official.vercel.app/api/delivery-auth?action=check-emergency-login-status&username=${cleanUser}`);
          const checkData = await checkRes.json();
          if (checkRes.ok && checkData.oneTimePassGranted) {
            clearInterval(pollTimer);
            toast.success('🎉 Hub Manager Approved 1-Time Pass! Logging in...', { icon: '🔑', duration: 4000 });
            setShowLateModal(false);
            const formMock = { preventDefault: () => {} };
            handleLoginSubmit(formMock);
          } else if (checkData.status === 'rejected') {
            clearInterval(pollTimer);
            toast.error('Emergency request was rejected by Admin.');
            setRequestSent(false);
            setRequestStatus('rejected');
          }
        } catch (_) {}
      }, 4000);
    } catch (err) {
      toast.error(err.message || 'Error submitting request');
    } finally {
      setRequestLoading(false);
    }
  };

  // Check Approval Status manually
  const handleCheckApprovalStatus = async () => {
    const cleanUser = username.trim().toUpperCase();
    if (!cleanUser) return;
    setCheckingStatus(true);
    try {
      const res = await fetch(`https://motodc-official.vercel.app/api/delivery-auth?action=check-emergency-login-status&username=${cleanUser}`);
      const data = await res.json();
      if (res.ok && data.oneTimePassGranted) {
        toast.success('🎉 Hub Manager Approved 1-Time Pass! Logging in...', { icon: '🔑', duration: 4000 });
        setShowLateModal(false);
        const formMock = { preventDefault: () => {} };
        handleLoginSubmit(formMock);
      } else if (data.status === 'rejected') {
        toast.error('Hub Manager rejected the emergency login request.');
        setRequestSent(false);
        setRequestStatus('rejected');
      } else {
        toast('Approval is still pending with Hub Manager.', { icon: '⏳' });
      }
    } catch (err) {
      toast.error('Failed to check approval status');
    } finally {
      setCheckingStatus(false);
    }
  };

  // 1. Submit Normal Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const cleanUser = username.trim().toUpperCase();
    const cleanPin = pin.trim();

    if (!cleanUser) {
      toast.error('Please enter your unique Alphanumeric Code');
      return;
    }

    if (!cleanPin || !/^\d{6}$/.test(cleanPin)) {
      toast.error('Password must be your 6-digit security PIN');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('https://motodc-official.vercel.app/api/delivery-auth?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          pin: cleanPin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'LATE_CHECKIN_BLOCKED') {
          setLateBlockData(data);
          setShowLateModal(true);
          return;
        }
        throw new Error(data.error || 'Login failed');
      }

      toast.success(`Welcome on shift, ${data.rider.name}!`);
      onLogin(data.rider);
    } catch (err) {
      console.error('Login error:', err);
      toast.error(err.message || 'Invalid username or PIN');
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit Reset Request to Admin
  const handleRequestReset = async (e) => {
    e.preventDefault();
    const cleanUser = resetUsername.trim().toUpperCase();
    if (!cleanUser) {
      toast.error('Please enter your Alphanumeric Code (e.g. MDC-R01)');
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch('https://motodc-official.vercel.app/api/delivery-auth?action=request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to request reset');
      }

      setMaskedPhone(data.maskedPhone || 'your registered mobile');
      setMode('verify_otp');
      toast.success('Reset request sent to Admin! Admin will generate your 6-digit OTP.');
    } catch (err) {
      console.error('Reset request error:', err);
      toast.error(err.message || 'Error requesting reset');
    } finally {
      setResetLoading(false);
    }
  };

  // 3. Verify 6-Digit OTP (One-Time Use)
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const cleanUser = resetUsername.trim().toUpperCase();
    const cleanOtp = otpInput.trim();

    if (!cleanOtp || !/^\d{6}$/.test(cleanOtp)) {
      toast.error('Please enter the 6-digit OTP provided by Admin');
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch('https://motodc-official.vercel.app/api/delivery-auth?action=verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          otp: cleanOtp,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify OTP');
      }

      toast.success('OTP verified! Proceeding to Change Password.');
      // One-time OTP verified -> Take rider to "Change Password" page
      onEnterChangePassword(cleanUser, data.resetToken);
    } catch (err) {
      console.error('OTP verify error:', err);
      toast.error(err.message || 'Invalid or expired OTP');
    } finally {
      setResetLoading(false);
    }
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

      {/* MODE 1: STANDARD LOGIN */}
      {mode === 'login' && (
        <div className="loginCard">
          <div className="loginIconCircle">
            <Shield size={32} color="#ff3157" />
          </div>
          <h2>Delivery Partner Login</h2>
          <p>Sign in with your unique alphanumeric code & 6-digit PIN</p>

          {loginTimeStatus.isOpen && (
            <div style={{
              margin: '14px 0 16px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: loginTimeStatus.isUrgent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
              border: `1px solid ${loginTimeStatus.isUrgent ? '#ef4444' : '#22c55e'}`,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px'
            }}>
              <Bell size={18} color={loginTimeStatus.isUrgent ? '#ef4444' : '#22c55e'} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: loginTimeStatus.isUrgent ? '#ef4444' : '#22c55e' }}>
                  {loginTimeStatus.label}
                </div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
                  {loginTimeStatus.sub}
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="loginForm">
            <div className="inputGroup">
              <label>Username (Unique Alphanumeric Code) *</label>
              <div className="inputWrap">
                <Truck size={16} className="inputIcon" />
                <input
                  type="text"
                  placeholder="e.g. MDC-4829"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="username"
                  required
                />
              </div>
              <small className="fieldHint">Assigned by admin (e.g. MDC-4829, MDC-1094)</small>
            </div>

            <div className="inputGroup">
              <label>Password (6-Digit PIN) *</label>
              <div className="inputWrap">
                <KeyRound size={16} className="inputIcon" />
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  autoComplete="current-password"
                  required
                />
              </div>
              <small className="fieldHint">6-digit numerical security PIN</small>
            </div>

            <button type="submit" className="loginSubmitBtn" disabled={loading}>
              {loading ? 'Verifying Credentials...' : 'Start Delivery Shift'} <ArrowRight size={16} />
            </button>
          </form>

          <div style={{ marginTop: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '11px', color: '#94a3b8', textAlign: 'center', lineHeight: '1.4' }}>
            <span style={{ color: '#38bdf8', fontWeight: 700 }}>⏰ Delivery Shift Hours (IST):</span>
            <br />
            Standard: 8:30 AM – 8:30 PM • Power Rider: 8:00 AM – 9:30 PM
            <br />
            <span style={{ fontSize: '10px', color: '#64748b' }}>Login is only permitted during shift hours with automatic logoff at cutoff</span>
          </div>

          <div className="forgotPinFooter">
            <button
              type="button"
              className="forgotPinBtn"
              onClick={() => {
                setResetUsername(username);
                setMode('request_reset');
              }}
            >
              <HelpCircle size={14} /> Forgot PIN or Credentials?
            </button>
          </div>
        </div>
      )}

      {/* MODE 2: REQUEST ADMIN RESET */}
      {mode === 'request_reset' && (
        <div className="loginCard">
          <div className="loginIconCircle" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
            <KeyRound size={32} color="#3b82f6" />
          </div>
          <h2>Forgot Login PIN?</h2>
          <p>Enter your unique alphanumeric code. A reset request will be sent to the Admin.</p>

          <form onSubmit={handleRequestReset} className="loginForm">
            <div className="inputGroup">
              <label>Your Unique Alphanumeric Code *</label>
              <div className="inputWrap">
                <Truck size={16} className="inputIcon" />
                <input
                  type="text"
                  placeholder="e.g. MDC-4829"
                  value={resetUsername}
                  onChange={(e) => setResetUsername(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoFocus
                  required
                />
              </div>
            </div>

            <button type="submit" className="loginSubmitBtn" disabled={resetLoading}>
              {resetLoading ? 'Contacting Admin...' : 'Request Admin OTP'} <ArrowRight size={16} />
            </button>

            <button
              type="button"
              className="backToLoginBtn"
              onClick={() => setMode('login')}
            >
              Back to Login
            </button>
          </form>
        </div>
      )}

      {/* MODE 3: ENTER 6-DIGIT OTP */}
      {mode === 'verify_otp' && (
        <div className="loginCard">
          <div className="loginIconCircle" style={{ background: 'rgba(34, 197, 94, 0.15)' }}>
            <PhoneCall size={32} color="#22c55e" />
          </div>
          <h2>Enter 6-Digit OTP</h2>
          <p>
            The admin has triggered an automated 6-digit OTP code to your registered mobile (<strong>{maskedPhone}</strong>).
          </p>

          <form onSubmit={handleVerifyOtp} className="loginForm">
            <div className="inputGroup">
              <label>6-Digit Verification OTP *</label>
              <div className="inputWrap">
                <KeyRound size={16} className="inputIcon" />
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                />
              </div>
              <small className="fieldHint">One-time code • Valid for 15 minutes</small>
            </div>

            <button type="submit" className="loginSubmitBtn" disabled={resetLoading}>
              {resetLoading ? 'Verifying OTP...' : 'Verify OTP & Change PIN'} <ArrowRight size={16} />
            </button>

            <div className="otpHelperRow">
              <button
                type="button"
                className="backToLoginBtn"
                onClick={() => setMode('login')}
              >
                Back to Login
              </button>
              <button
                type="button"
                className="resendBtn"
                onClick={handleRequestReset}
                disabled={resetLoading}
              >
                Notify Admin Again
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LATE CHECK-IN BLOCKED POPUP MODAL */}
      {showLateModal && lateBlockData && (
        <div className="lateModalOverlay" onClick={() => setShowLateModal(false)}>
          <div className="lateModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="lateModalHeader">
              <div className="lateModalIconWrap">
                <AlertTriangle size={30} color="#ef4444" />
              </div>
              <button
                type="button"
                className="lateModalCloseBtn"
                onClick={() => setShowLateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <h3 className="lateModalTitle">Late Check-In Blocked</h3>
            <p className="lateModalSub">
              On-time check-in is mandatory for Karaikal fleet corridor dispatch.
            </p>

            <div className="lateModalDetailsBox">
              <div className="lateDetailRow">
                <span>Shift Start Time:</span>
                <strong>{lateBlockData.shiftStartTime || '08:30 AM'}</strong>
              </div>
              <div className="lateDetailRow">
                <span>Check-In Cutoff:</span>
                <strong style={{ color: '#f59e0b' }}>{lateBlockData.cutoffTime || '09:00 AM'}</strong>
              </div>
              <div className="lateDetailRow">
                <span>Your Attempt Time:</span>
                <strong style={{ color: '#ef4444' }}>{lateBlockData.istTimeString || 'Late'}</strong>
              </div>
            </div>

            {/* Attendance Strike Indicator */}
            <div className="lateStrikeCard">
              <div className="strikeHeader">
                <span>ATTENDANCE STRIKES:</span>
                <strong className={lateBlockData.bonusCutoff ? 'strikeCritical' : 'strikeWarning'}>
                  {lateBlockData.lateStrikes || 1} / 3 Strikes
                </strong>
              </div>
              <div className="strikeProgressBar">
                <div
                  className="strikeProgressFill"
                  style={{
                    width: `${Math.min(100, ((lateBlockData.lateStrikes || 1) / 3) * 100)}%`,
                    background: lateBlockData.bonusCutoff ? '#ef4444' : '#f59e0b',
                  }}
                />
              </div>
              <p className="strikePenaltyText">
                {lateBlockData.bonusCutoff ? (
                  <span style={{ color: '#ef4444', fontWeight: 800 }}>
                    ⚠️ 3 Strikes Exceeded: Your monthly punctuality bonus (₹2,500) has been forfeited.
                  </span>
                ) : (
                  <span>
                    Accumulating 3 late strikes in a month will permanently forfeit your <strong>₹2,500 punctuality bonus</strong>.
                  </span>
                )}
              </p>
            </div>

            <div className="lateModalActions">
              {requestSent ? (
                <div style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '10px',
                  padding: '12px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
                    ⏳ Emergency Request Sent to Hub Manager!
                  </span>
                  <small style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Admin will review and approve 1-Time Pass in the dispatch portal.
                  </small>
                  <button
                    type="button"
                    style={{
                      background: '#0284c7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                    onClick={handleCheckApprovalStatus}
                    disabled={checkingStatus}
                  >
                    {checkingStatus ? 'Checking...' : '🔄 Check Approval Status'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(124, 58, 237, 0.35)'
                  }}
                  onClick={handleRaiseEmergencyRequest}
                  disabled={requestLoading}
                >
                  <KeyRound size={16} />
                  {requestLoading ? 'Submitting Request...' : 'Raise Emergency 1-Time Login Request'}
                </button>
              )}

              <a href="tel:+919842104829" className="hubManagerCallBtn">
                <Phone size={15} /> Call Hub Manager for Clearance
              </a>
              <button
                type="button"
                className="dismissLateModalBtn"
                onClick={() => setShowLateModal(false)}
              >
                Understood & Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
