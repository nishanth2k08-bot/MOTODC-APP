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
  Moon,
  WifiOff,
  RefreshCw,
  Zap
} from 'lucide-react';
import Scanner from './components/Scanner';
import VerifiedOrder from './components/VerifiedOrder';
import BatchVerifiedOrder from './components/BatchVerifiedOrder';
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
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchOrders, setBatchOrders] = useState([]);
  const [isVerifyingBatch, setIsVerifyingBatch] = useState(false);
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

  // Offline-First Handover Sync Queue (Basements & Dead Zones)
  const [offlineQueue, setOfflineQueue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('motodc_offline_sync_queue') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('motodc_offline_sync_queue', JSON.stringify(offlineQueue));
    } catch (e) {
      console.warn('Offline queue save error:', e);
    }
  }, [offlineQueue]);

  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [isSyncing, setIsSyncing] = useState(false);

  // Network listener & auto-sync trigger
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('📶 Back online! Testing cloud sync...');
      flushOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast('📶 Basement/dead zone detected. Handovers will be saved locally.', { icon: '⚠️' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [offlineQueue]);

  // Flush offline queue to cloud serverless API
  const flushOfflineQueue = async (manual = false) => {
    const currentQueue = JSON.parse(localStorage.getItem('motodc_offline_sync_queue') || '[]');
    if (currentQueue.length === 0) {
      if (manual) toast.success('All deliveries are already in sync with cloud!');
      return;
    }

    if (isSyncing) return;
    setIsSyncing(true);

    const remaining = [];
    let syncedCount = 0;

    for (const item of currentQueue) {
      try {
        const res = await fetch('https://motodc-official.vercel.app/api/delivery-partner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            docId: item.docId,
            collectionType: item.collectionType,
            paymentMethod: item.paymentMethod,
            paymentSettledVia: item.paymentSettledVia,
            riderName: item.riderName,
            riderId: item.riderId,
          }),
        });

        if (res.ok) {
          syncedCount++;
          // Mark as synced in runSheet state
          setRunSheet((prev) =>
            prev.map((entry) =>
              entry.orderId === item.orderId ? { ...entry, pendingSync: false } : entry
            )
          );
        } else {
          remaining.push(item);
        }
      } catch (err) {
        console.warn(`Could not sync #${item.orderId}:`, err);
        remaining.push(item);
      }
    }

    setOfflineQueue(remaining);
    setIsSyncing(false);

    if (syncedCount > 0) {
      toast.success(`⚡ Synced ${syncedCount} offline delivery${syncedCount > 1 ? 'ies' : ''} to cloud!`);
    } else if (manual && remaining.length > 0) {
      toast.error('Could not reach cloud. Still in offline mode.');
    }
  };

  // Lookup order by scanned text / typed ID
  const handleOrderScanned = async (queryText) => {
    if (!queryText || loadingOrder) return;
    const clean = String(queryText).replace(/^#/, '').trim();
    if (!clean) return;

    setLoadingOrder(true);
    if (!isBatchMode) {
      setVerifiedOrder(null);
    }
    setDeliveredSuccess(null);

    const handleOrderFound = (foundOrder) => {
      const orderIdDisplay = foundOrder.orderId || foundOrder.id;
      if (isBatchMode) {
        const alreadyInBatch = batchOrders.some(
          (o) => String(o.orderId || o.id) === String(orderIdDisplay)
        );
        if (alreadyInBatch) {
          toast(`Order #${orderIdDisplay} is already in the batch tray!`, { icon: 'ℹ️' });
        } else {
          setBatchOrders((prev) => [...prev, foundOrder]);
          toast.success(`Added #${orderIdDisplay} to Batch Tray (${batchOrders.length + 1} parcels)`);
        }
      } else {
        toast.success(`Found order #${orderIdDisplay}`);
        setVerifiedOrder(foundOrder);
      }
    };

    try {
      // 1. High-speed backend API (bypasses Firestore client-rule roadblocks)
      const riderCode = rider?.username || rider?.riderId || '';
      const apiUrl = `https://motodc-official.vercel.app/api/delivery-partner?q=${encodeURIComponent(clean)}${
        riderCode ? `&riderId=${encodeURIComponent(riderCode)}` : ''
      }`;
      const response = await fetch(apiUrl);
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.order) {
        handleOrderFound(data.order);
        return;
      }

      if (response.status === 403 && data.code === 'ROUTE_LOCKED') {
        toast.error(data.error, { duration: 6500 });
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
          handleOrderFound(match);
        }
      } catch (directErr) {
        console.error('All lookup paths failed:', directErr);
        toast.error(`Lookup failed: ${directErr.message || 'Check connection'}`);
      }
    } finally {
      setLoadingOrder(false);
    }
  };

  // Confirm Handover and mark order Delivered (Offline-First Resilient)
  const handleConfirmDelivery = async (order, paymentMode = 'cash') => {
    setSubmitting(true);
    try {
      const isCodOrder = String(order.paymentMethod || '').toLowerCase() === 'cod';
      const isUpiDoorstep = paymentMode === 'upi_doorstep';
      const physicalCashCollected = isCodOrder && !isUpiDoorstep;
      const orderIdClean = order.orderId || order.id;

      let savedToCloud = false;

      // 1. If device reports online, attempt cloud serverless API or direct Firestore
      if (navigator.onLine) {
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
              riderId: rider?.username || rider?.riderId || 'MDC-R01',
            }),
          });

          if (res.ok) {
            savedToCloud = true;
          }
        } catch (apiErr) {
          console.warn('API cloud update failed, trying direct Firestore update:', apiErr);
          try {
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
            savedToCloud = true;
          } catch (fireErr) {
            console.warn('Direct Firestore fallback failed (network dead zone):', fireErr);
            savedToCloud = false;
          }
        }
      }

      // 2. If not saved to cloud (basement / elevator / dead zone), queue in offline storage
      if (!savedToCloud) {
        const queueItem = {
          queueId: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          docId: order.id,
          orderId: orderIdClean,
          collectionType: order.collectionType,
          paymentMethod: order.paymentMethod,
          paymentSettledVia: paymentMode,
          riderName: rider?.name || 'MotoDC Partner',
          riderId: rider?.riderId || 'MDC-R01',
          timestamp: new Date().toISOString(),
        };

        setOfflineQueue((prev) => [queueItem, ...prev]);
        toast('📶 Offline Mode: Handover recorded locally. Will auto-sync when network returns.', {
          icon: '💾',
          duration: 4000,
        });
      } else {
        toast.success(isUpiDoorstep ? 'Delivered & UPI Payment Confirmed!' : 'Delivery verified & synced to cloud!');
      }

      // 3. Add to today's run sheet (Always succeeds!)
      const newEntry = {
        id: order.id,
        orderId: orderIdClean,
        customerName: order.customer?.name || 'Customer',
        total: order.total || 0,
        isCod: physicalCashCollected,
        paymentMode: isUpiDoorstep ? 'upi_doorstep' : (isCodOrder ? 'cash' : 'prepaid'),
        itemsCount: (order.items || []).length,
        deliveredBy: rider?.name || 'Rider',
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        pendingSync: !savedToCloud,
      };

      setRunSheet((prev) => [newEntry, ...prev]);
      setDeliveredSuccess({ ...order, wasSavedOffline: !savedToCloud });
      setVerifiedOrder(null);
    } catch (err) {
      console.error('Delivery update unexpected exception:', err);
      toast.error(`Error logging delivery: ${err.message || 'Please retry'}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Multi-Parcel Batch Handover (Enhancement 5)
  const handleConfirmBatchDelivery = async (ordersToDeliver, paymentMode = 'cash') => {
    setSubmitting(true);
    try {
      const isUpi = paymentMode === 'upi_doorstep';
      const updatedEntries = [];
      const offlineQueueItems = [];

      for (const order of ordersToDeliver) {
        const isCodOrder = String(order.paymentMethod || '').toLowerCase() === 'cod';
        const physicalCashCollected = isCodOrder && !isUpi;
        const orderIdClean = order.orderId || order.id;

        let savedToCloud = false;

        if (navigator.onLine) {
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
                riderId: rider?.username || rider?.riderId || 'MDC-R01',
              }),
            });
            if (res.ok) savedToCloud = true;
          } catch (e) {
            console.warn(`Cloud update failed for #${orderIdClean}, trying direct Firestore:`, e);
            try {
              const orderRef = doc(db, 'orders', order.collectionType, 'records', order.id);
              const updates = {
                orderStatus: 'delivered',
                deliveredAt: Timestamp.now(),
                deliveredBy: {
                  riderName: rider?.name || 'MotoDC Partner',
                  riderId: rider?.username || rider?.riderId || 'MDC-R01',
                  timestamp: new Date().toISOString(),
                },
                history: arrayUnion({
                  status: 'delivered',
                  timestamp: new Date().toISOString(),
                  note: `Batch doorstep verified (${ordersToDeliver.length} parcels) by ${rider?.name || 'Rider'} (${rider?.riderId || 'MDC-R01'}) via MotoDC Partner App`,
                }),
              };
              if (isUpi) {
                updates.paymentStatus = 'paid';
                updates.paymentMethod = 'upi_doorstep';
                updates.paidVia = 'Doorstep UPI QR Code';
              } else if (isCodOrder) {
                updates.paymentStatus = 'paid';
              }
              await updateDoc(orderRef, updates);
              savedToCloud = true;
            } catch (fireErr) {
              console.warn(`Firestore update also failed for #${orderIdClean}:`, fireErr);
              savedToCloud = false;
            }
          }
        }

        if (!savedToCloud) {
          offlineQueueItems.push({
            queueId: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            docId: order.id,
            orderId: orderIdClean,
            collectionType: order.collectionType,
            paymentMethod: order.paymentMethod,
            paymentSettledVia: paymentMode,
            riderName: rider?.name || 'MotoDC Partner',
            riderId: rider?.riderId || 'MDC-R01',
            timestamp: new Date().toISOString(),
          });
        }

        updatedEntries.push({
          id: order.id,
          orderId: orderIdClean,
          customerName: order.customer?.name || 'Customer',
          total: order.total || 0,
          isCod: physicalCashCollected,
          paymentMode: isUpi ? 'upi_doorstep' : (isCodOrder ? 'cash' : 'prepaid'),
          itemsCount: (order.items || []).length,
          deliveredBy: rider?.name || 'Rider',
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          pendingSync: !savedToCloud,
        });
      }

      if (offlineQueueItems.length > 0) {
        setOfflineQueue((prev) => [...offlineQueueItems, ...prev]);
        toast(`📶 ${offlineQueueItems.length} parcels saved offline in queue. Will auto-sync!`, { icon: '💾' });
      } else {
        toast.success(`⚡ All ${ordersToDeliver.length} parcels delivered & synced to cloud!`);
      }

      setRunSheet((prev) => [...updatedEntries, ...prev]);
      setDeliveredSuccess({
        isBatch: true,
        batchOrders: ordersToDeliver,
        count: ordersToDeliver.length,
        wasSavedOffline: offlineQueueItems.length > 0,
      });
      setBatchOrders([]);
      setIsVerifyingBatch(false);
    } catch (err) {
      console.error('Batch delivery critical error:', err);
      toast.error(`Error confirming batch: ${err.message || 'Please retry'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextScan = () => {
    setDeliveredSuccess(null);
    setVerifiedOrder(null);
    setIsVerifyingBatch(false);
    setBatchOrders([]);
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
          {/* Offline / Pending Sync Status Pill */}
          {(!isOnline || offlineQueue.length > 0) && (
            <button
              type="button"
              className={`offlineSyncPill ${!isOnline ? 'disconnected' : 'pending'}`}
              onClick={() => flushOfflineQueue(true)}
              title={!isOnline ? 'Basement/Offline - Tap to test sync' : `${offlineQueue.length} handovers queued for cloud upload`}
            >
              {!isOnline ? <WifiOff size={13} /> : <RefreshCw size={13} className={isSyncing ? 'spinning' : ''} />}
              <span>{!isOnline ? 'Offline' : `${offlineQueue.length} Sync`}</span>
            </button>
          )}

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
            {!verifiedOrder && !isVerifyingBatch && !deliveredSuccess && (
              <Scanner
                onOrderScanned={handleOrderScanned}
                loading={loadingOrder}
                isBatchMode={isBatchMode}
                onToggleBatchMode={(val) => {
                  setIsBatchMode(val);
                  setBatchOrders([]);
                }}
                batchOrders={batchOrders}
                onRemoveFromBatch={(id) =>
                  setBatchOrders((prev) => prev.filter((o) => (o.orderId || o.id) !== id))
                }
                onProceedBatch={() => setIsVerifyingBatch(true)}
              />
            )}

            {/* 2A. Single Order Verified Screen */}
            {verifiedOrder && !isVerifyingBatch && (
              <VerifiedOrder
                order={verifiedOrder}
                isOnline={isOnline}
                onCancel={() => setVerifiedOrder(null)}
                onConfirmDelivery={handleConfirmDelivery}
                submitting={submitting}
              />
            )}

            {/* 2B. Multi-Parcel Batch Verified Screen (Enhancement 5) */}
            {isVerifyingBatch && batchOrders.length > 0 && (
              <BatchVerifiedOrder
                orders={batchOrders}
                isOnline={isOnline}
                onCancel={() => setIsVerifyingBatch(false)}
                onRemoveOrder={(id) => {
                  const rem = batchOrders.filter((o) => (o.orderId || o.id) !== id);
                  setBatchOrders(rem);
                  if (rem.length === 0) setIsVerifyingBatch(false);
                }}
                onConfirmBatchDelivery={handleConfirmBatchDelivery}
                submitting={submitting}
              />
            )}

            {/* 3. Delivery Success Screen */}
            {deliveredSuccess && (
              <div className="successCard">
                <div className="successIconWrap">
                  <CheckCircle2 size={42} />
                </div>
                <h2>
                  {deliveredSuccess.isBatch ? 'Batch Handover Complete!' : 'Doorstep Handover Complete!'}
                </h2>
                <p>
                  {deliveredSuccess.isBatch ? (
                    <>
                      Consignment of <b>{deliveredSuccess.count} parcels</b> successfully handed over by{' '}
                      <b>{rider.name}</b>.
                    </>
                  ) : (
                    <>
                      Order <b>#{deliveredSuccess.orderId || deliveredSuccess.id}</b> marked as delivered by{' '}
                      <b>{rider.name}</b>.
                    </>
                  )}
                </p>
                {deliveredSuccess.wasSavedOffline && (
                  <div className="offlineSuccessNotice">
                    <WifiOff size={14} color="#f59e0b" />
                    <span>Saved locally in basement/dead zone. Will auto-sync when network returns!</span>
                  </div>
                )}
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
            rider={rider}
            offlineQueue={offlineQueue}
            onSyncQueue={flushOfflineQueue}
            isOnline={isOnline}
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
