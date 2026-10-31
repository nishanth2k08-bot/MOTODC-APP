import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { toast, Toaster } from 'react-hot-toast';
import {
  Truck,
  Camera,
  ClipboardList,
  CheckCircle2,
  IndianRupee,
  LogOut,
  Sun,
  Moon
} from 'lucide-react';
import Scanner from './components/Scanner';
import VerifiedOrder from './components/VerifiedOrder';
import DailyRunSheet from './components/DailyRunSheet';
import InstallPrompt from './components/InstallPrompt';
import Login from './components/Login';
import ChangePassword from './components/ChangePassword';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function App() {
  const [activeTab, setActiveTab] = useState('scanner'); // 'scanner' | 'runsheet'
  const [shiftActive, setShiftActive] = useState(true);
  const [verifiedOrder, setVerifiedOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deliveredSuccess, setDeliveredSuccess] = useState(null);
  const [changePasswordSession, setChangePasswordSession] = useState(null);

  // Theme Management (Light / Dark)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('motodc_partner_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('lightTheme');
    } else {
      document.body.classList.remove('lightTheme');
    }
    try {
      localStorage.setItem('motodc_partner_theme', theme);
    } catch (_) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Rider Authentication State
  const [rider, setRider] = useState(() => {
    try {
      const saved = localStorage.getItem('motodc_partner_rider');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (riderProfile) => {
    setRider(riderProfile);
    try {
      localStorage.setItem('motodc_partner_rider', JSON.stringify(riderProfile));
    } catch (_) {}
  };

  const handleLogout = () => {
    if (window.confirm(`Sign out ${rider?.name || 'driver'} from this device?`)) {
      setRider(null);
      try {
        localStorage.removeItem('motodc_partner_rider');
      } catch (_) {}
      toast.success('Signed out successfully');
    }
  };

  // Run sheet persistence
  const [runSheet, setRunSheet] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('motodc_partner_run_sheet') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('motodc_partner_run_sheet', JSON.stringify(runSheet));
    } catch (e) {
      console.warn('Run sheet save error:', e);
    }
  }, [runSheet]);

  // Lookup order by scanned text / typed ID
  const handleOrderScanned = async (queryText) => {
    if (!queryText || loadingOrder) return;
    const clean = String(queryText).replace(/^#/, '').trim();
    if (!clean) return;

    setLoadingOrder(true);
    setVerifiedOrder(null);
    setDeliveredSuccess(null);

    try {
      // 1. High-speed backend API (bypasses Firestore client-rule roadblocks)
      const apiUrl = `https://motodc-official.vercel.app/api/delivery-partner?q=${encodeURIComponent(clean)}`;
      const response = await fetch(apiUrl);
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.order) {
        toast.success(`Found order #${data.order.orderId || data.order.id}`);
        setVerifiedOrder(data.order);
        return;
      }

      if (response.status === 404 || data.error) {
        toast.error(data.error || `No order found matching "${clean}".`);
        return;
      }

      throw new Error(data.error || 'Server error looking up order');
    } catch (err) {
      console.warn('Backend API lookup failed, trying direct Firestore fallback:', err);
      // 2. Direct Firestore fallback
      try {
        const [codSnap, onlineSnap] = await Promise.all([
          getDocs(collection(db, 'orders', 'cod orders', 'records')),
          getDocs(collection(db, 'orders', 'online orders', 'records')),
        ]);

        const all = [
          ...codSnap.docs.map((d) => ({ ...d.data(), id: d.id, collectionType: 'cod orders' })),
          ...onlineSnap.docs.map((d) => ({ ...d.data(), id: d.id, collectionType: 'online orders' })),
        ];

        const match = all.find((o) => {
          const id1 = String(o.orderId || '').toLowerCase().trim();
          const id2 = String(o.id || '').toLowerCase().trim();
          const q = clean.toLowerCase();
          return id1 === q || id2 === q || id1.includes(q) || q.includes(id1);
        });

        if (!match) {
          toast.error(`No order found matching "${clean}". Check barcode label.`);
        } else {
          toast.success(`Found order #${match.orderId || match.id}`);
          setVerifiedOrder(match);
        }
      } catch (directErr) {
        console.error('All lookup paths failed:', directErr);
        toast.error(`Lookup failed: ${directErr.message || 'Check connection'}`);
      }
    } finally {
      setLoadingOrder(false);
    }
  };

  // Confirm Handover and mark order Delivered
  const handleConfirmDelivery = async (order, paymentMode = 'cash') => {
    setSubmitting(true);
    try {
      const isCodOrder = String(order.paymentMethod || '').toLowerCase() === 'cod';
      const isUpiDoorstep = paymentMode === 'upi_doorstep';
      const physicalCashCollected = isCodOrder && !isUpiDoorstep;

      // 1. Try high-speed serverless API
      try {
        const res = await fetch('https://motodc-official.vercel.app/api/delivery-partner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docId: order.id,
            collectionType: order.collectionType,
            paymentMethod: order.paymentMethod,
            paymentSettledVia: paymentMode,
            riderName: rider?.name || 'MotoDC Partner',
            riderId: rider?.riderId || 'MDC-R01',
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Server rejected delivery update');
        }
      } catch (apiErr) {
        console.warn('API update failed, trying direct Firestore update:', apiErr);
        const orderRef = doc(db, 'orders', order.collectionType, 'records', order.id);
        const updates = {
          orderStatus: 'delivered',
          deliveredAt: Timestamp.now(),
          deliveredBy: {
            riderName: rider?.name || 'MotoDC Partner',
            riderId: rider?.riderId || 'MDC-R01',
            timestamp: new Date().toISOString(),
          },
          history: arrayUnion({
            status: 'delivered',
            timestamp: new Date().toISOString(),
            note: isUpiDoorstep
              ? `Doorstep verified via UPI QR Code by ${rider?.name || 'Rider'} (${rider?.riderId || 'MDC-R01'}) via MotoDC Partner App`
              : `Doorstep verified by ${rider?.name || 'Rider'} (${rider?.riderId || 'MDC-R01'}) via MotoDC Partner App`,
          }),
        };
        if (isUpiDoorstep) {
          updates.paymentStatus = 'paid';
          updates.paymentMethod = 'upi_doorstep';
          updates.paidVia = 'Doorstep UPI QR Code';
        } else if (isCodOrder) {
          updates.paymentStatus = 'paid';
        }
        await updateDoc(orderRef, updates);
      }

      // Add to today's run sheet
      const newEntry = {
        id: order.id,
        orderId: order.orderId || order.id,
        customerName: order.customer?.name || 'Customer',
        total: order.total || 0,
        isCod: physicalCashCollected,
        paymentMode: isUpiDoorstep ? 'upi_doorstep' : (isCodOrder ? 'cash' : 'prepaid'),
        itemsCount: (order.items || []).length,
        deliveredBy: rider?.name || 'Rider',
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      };

      setRunSheet((prev) => [newEntry, ...prev]);
      setDeliveredSuccess(order);
      setVerifiedOrder(null);
      toast.success(isUpiDoorstep ? 'Delivered & UPI Payment Confirmed!' : 'Delivery successfully logged & verified!');
    } catch (err) {
      console.error('Delivery update error:', err);
      toast.error(`Could not update status: ${err.message || 'Check network'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextScan = () => {
    setDeliveredSuccess(null);
    setVerifiedOrder(null);
  };

  const handleClearRunSheet = () => {
    if (window.confirm("Clear today's run sheet history on this device?")) {
      setRunSheet([]);
      toast.success('Run sheet cleared for new shift.');
    }
  };

  const totalCashCollected = runSheet.reduce((sum, item) => {
    return sum + (item.isCod ? Number(item.total || 0) : 0);
  }, 0);

  // If rider in Password Reset Flow -> Show Change Password Page
  if (changePasswordSession) {
    return (
      <div className="appWrapper">
        <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
        <ChangePassword
          username={changePasswordSession.username}
          resetToken={changePasswordSession.resetToken}
          onSuccess={() => setChangePasswordSession(null)}
        />
      </div>
    );
  }

  // If no rider logged in, show Login Screen
  if (!rider) {
    return (
      <div className="appWrapper">
        <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
        <Login
          onLogin={handleLogin}
          onEnterChangePassword={(user, token) => setChangePasswordSession({ username: user, resetToken: token })}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>
    );
  }

  return (
    <div className="appWrapper">
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />

      {/* Top Header */}
      <header className="appHeader">
        <div className="brand">
          <Truck size={22} color="#ff3157" />
          <b>Moto<span>DC</span> Partner</b>
        </div>

        <div className="headerActions">
          {/* Day / Night Theme Toggle */}
          <button
            type="button"
            className="themeToggleBtn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Daylight Theme' : 'Switch to Dark Theme'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={17} color="#fbbf24" /> : <Moon size={17} color="#3b82f6" />}
          </button>

          {/* Rider Profile & Logout */}
          <div className="riderProfileChip">
            <span className="riderAvatarDot" />
            <div className="riderInfoText">
              <b>{rider.name}</b>
              <small>{rider.riderId}</small>
            </div>
            <button
              type="button"
              className="logoutBtn"
              onClick={handleLogout}
              title="End Shift / Sign Out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="appTabs">
        <button
          type="button"
          className={`tabBtn ${activeTab === 'scanner' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('scanner');
            setVerifiedOrder(null);
            setDeliveredSuccess(null);
          }}
        >
          <Camera size={16} /> Scanner
        </button>
        <button
          type="button"
          className={`tabBtn ${activeTab === 'runsheet' ? 'active' : ''}`}
          onClick={() => setActiveTab('runsheet')}
        >
          <ClipboardList size={16} /> Run Sheet
          <span className="tabBadge">{runSheet.length}</span>
        </button>
      </div>

      <main className="mainContainer">
        {activeTab === 'scanner' && (
          <>
            {/* Shift Summary Bar */}
            <div className="summaryBar">
              <div className="summaryItem">
                <div className="summaryIcon" style={{ color: '#22c55e' }}>
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <small>Deliveries Today</small>
                  <strong>{runSheet.length}</strong>
                </div>
              </div>
              <div className="summaryItem">
                <div className="summaryIcon" style={{ color: '#f59e0b' }}>
                  <IndianRupee size={18} />
                </div>
                <div>
                  <small>COD Cash</small>
                  <strong>{money(totalCashCollected)}</strong>
                </div>
              </div>
            </div>

            {/* 1. Camera Scanner View */}
            {!verifiedOrder && !deliveredSuccess && (
              <Scanner onOrderScanned={handleOrderScanned} loading={loadingOrder} />
            )}

            {/* 2. Order Verified Screen */}
            {verifiedOrder && (
              <VerifiedOrder
                order={verifiedOrder}
                onCancel={() => setVerifiedOrder(null)}
                onConfirmDelivery={handleConfirmDelivery}
                submitting={submitting}
              />
            )}

            {/* 3. Delivery Success Screen */}
            {deliveredSuccess && (
              <div className="successCard">
                <div className="successIconWrap">
                  <CheckCircle2 size={42} />
                </div>
                <h2>Doorstep Handover Complete!</h2>
                <p>
                  Order <b>#{deliveredSuccess.orderId || deliveredSuccess.id}</b> marked as delivered by{' '}
                  <b>{rider.name}</b>.
                </p>
                <button type="button" className="nextScanBtn" onClick={handleNextScan}>
                  <Camera size={16} /> Scan Next Package
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'runsheet' && (
          <DailyRunSheet
            completedDeliveries={runSheet}
            onClearRunSheet={handleClearRunSheet}
            onSelectStopForDelivery={(stop) => {
              setVerifiedOrder(stop);
              setActiveTab('scanner');
            }}
          />
        )}
      </main>

      {/* PWA 1-Tap Install Prompt */}
      <InstallPrompt />
    </div>
  );
}
