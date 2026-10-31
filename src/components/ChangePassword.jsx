import React, { useState } from 'react';
import { KeyRound, ShieldCheck, ArrowRight, Lock, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ChangePassword({ username, resetToken, onSuccess }) {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPin = newPin.trim();
    const cleanConfirm = confirmPin.trim();

    if (!cleanPin || !/^\d{6}$/.test(cleanPin)) {
      toast.error('New PIN must be exactly 6 digits');
      return;
    }

    if (cleanPin !== cleanConfirm) {
      toast.error('PINs do not match. Please re-enter.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('https://motodc-official.vercel.app/api/delivery-auth?action=change-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          resetToken,
          newPin: cleanPin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update PIN');
      }

      toast.success('6-Digit PIN updated successfully! Please log in with your new PIN.');
      onSuccess();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Error updating password PIN');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="loginWrapper">
      <div className="loginCard changePasswordCard">
        <div className="loginIconCircle">
          <ShieldCheck size={36} color="#22c55e" />
        </div>
        <h2>Change Password</h2>
        <p>Set a new, secure 6-digit PIN for partner code <strong>{username}</strong></p>

        <form onSubmit={handleSubmit} className="loginForm">
          <div className="inputGroup">
            <label>New 6-Digit PIN *</label>
            <div className="inputWrap">
              <Lock size={16} className="inputIcon" />
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="Enter 6 digits"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                autoFocus
                required
              />
            </div>
            <small className="fieldHint">Must be 6 digits and unique from your previous PIN</small>
          </div>

          <div className="inputGroup">
            <label>Confirm New 6-Digit PIN *</label>
            <div className="inputWrap">
              <KeyRound size={16} className="inputIcon" />
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="Re-enter 6 digits"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                required
              />
            </div>
          </div>

          <button type="submit" className="loginSubmitBtn" disabled={submitting}>
            {submitting ? 'Updating PIN...' : 'Save New PIN & Go to Login'} <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
