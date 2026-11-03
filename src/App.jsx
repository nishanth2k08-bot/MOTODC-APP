import { LocalNotifications } from '@capacitor/local-notifications';
import { Geolocation } from '@capacitor/geolocation';
import React, { useState, useEffect } from 'react';
import { initNotifications, checkAndNotifyLoginTime, scheduleNativeShiftAlarms, cancelNativeShiftAlarms, sendLocalNotification, playNotificationChime } from './notificationService';
import { collection, getDocs, updateDoc, doc, arrayUnion, Timestamp, onSnapshot } from 'firebase/firestore';
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
  const [orderSource, setOrderSource] = useState('scanner'); // 'scanner' | 'runsheet'
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

  // Initialize Android Notification Channels & Shift Check-In Reminders (Non-blocking)
  useEffect(() => {
    const timer = setTimeout(() => {
      initNotifications().catch(() => {});
      checkAndNotifyLoginTime(Boolean(rider));
    }, 1000);

    const interval = setInterval(() => {
      checkAndNotifyLoginTime(Boolean(rider));
    }, 60000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [rider]);

  // Real-Time Global Package Assignment Monitoring (Survives tab switching and background runs)
  useEffect(() => {
    if (!rider) return;
    const riderCode = String(rider.username || rider.riderId || '').trim().toUpperCase();
    if (!riderCode) return;

    const storageKey = 'motodc_known_assigned_orders_' + riderCode;

    const checkAssignedOrders = async () => {
      try {
        const url = `https://motodc-official.vercel.app/api/delivery-partner?action=active-deliveries&riderId=${encodeURIComponent(riderCode)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!Array.isArray(data.stops)) return;

        // Current active stop order IDs
        const currentOrderIds = data.stops
          .map((s) => String(s.orderId || s.id || '').replace(/^#/, '').trim())
          .filter(Boolean);

        const storedRaw = localStorage.getItem(storageKey);
        if (storedRaw === null) {
          // First time this device has loaded for this rider session:
          // Record baseline set of order IDs so the user is NOT spammed upon app entry
          localStorage.setItem(storageKey, JSON.stringify(currentOrderIds));
          return;
        }

        let knownIds = [];
        try {
          knownIds = JSON.parse(storedRaw);
          if (!Array.isArray(knownIds)) knownIds = [];
        } catch (_) {
          knownIds = [];
        }

        const knownSet = new Set(knownIds);
        const genuinelyNewIds = currentOrderIds.filter((id) => !knownSet.has(id));

        // ONLY fire notification when genuinely NEW packages are added to the rider's run sheet!
        if (genuinelyNewIds.length > 0) {
          const count = genuinelyNewIds.length;
          const previewList = genuinelyNewIds.slice(0, 2).map((x) => '#' + x).join(', ') + (count > 2 ? '...' : '');
          sendLocalNotification({
            id: Math.floor(2000 + Math.random() * 7000),
            title: `📦 ${count} New Package${count > 1 ? 's' : ''} Assigned!`,
            body: `Admin assigned ${count} parcel(s) to your route (${previewList}). Tap to open run sheet & verify.`,
            channelId: 'motodc_packages_alerts',
          });
          playNotificationChime('package');
          toast.success(`📦 ${count} new package(s) assigned: ${previewList}`, { duration: 6000, icon: '📦' });
        }

        // Always sync latest assigned order IDs snapshot to localStorage
        localStorage.setItem(storageKey, JSON.stringify(currentOrderIds));
      } catch (err) {
        console.warn('[MotoDC] Background package check failed:', err);
      }
    };

    // 1. Check immediately on mount/login
    checkAssignedOrders();

    // 2. Real-Time Firestore Listener on deliveryCorridors:
    // When Admin assigns a corridor or clicks auto-dispatch, Firestore updates in sub-second time!
    let unsubCorridors = null;
    try {
      unsubCorridors = onSnapshot(collection(db, 'deliveryCorridors'), () => {
        checkAssignedOrders();
      }, (err) => {
        console.warn('[MotoDC] Corridors listener fallback:', err);
      });
    } catch (e) {
      console.warn('[MotoDC] Could not attach Firestore listener:', e);
    }

    // 3. Active Background Polling Interval (every 15 seconds while rider is logged in)
    const pollInterval = setInterval(checkAssignedOrders, 15000);

    // 4. Instant Wakeup Check when app regains visibility / screen turns on
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAssignedOrders();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (unsubCorridors) unsubCorridors();
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [rider]);

  const handleLogin = (riderProfile) => {
    setRider(riderProfile);
    try {
      localStorage.setItem('motodc_partner_rider', JSON.stringify(riderProfile));
    } catch (_) {}
    cancelNativeShiftAlarms().catch(() => {});
  };

  const handleLogout = async () => {
    if (window.confirm(`Sign out ${rider?.name || 'driver'} from this device?`)) {
      const riderId = rider?.username || rider?.riderId;
      const riderName = rider?.name || 'Partner';
      try {
        if (riderId) {
          fetch('https://motodc-official.vercel.app/api/delivery-auth?action=logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ riderId }),
          }).catch(() => {});
        }
      } catch (_) {}
      setRider(null);
      try {
        localStorage.removeItem('motodc_partner_rider');
        localStorage.removeItem('motodc_route_active_' + rider?.username);
        localStorage.removeItem('motodc_known_assigned_orders_' + rider?.username);
      } catch (_) {}
      scheduleNativeShiftAlarms().catch(() => {});

      // Send native status bar notification
      sendLocalNotification({
        id: 9921,
        title: '👋 Shift Concluded – Signed Out',
        body: `You signed out successfully, ${riderName}. See you tomorrow morning!`,
        channelId: 'motodc_shift_alerts',
      });

      toast.success('Signed out successfully. One-time pass consumed.');
    }
  };

  const forceAutoLogoff = (reason) => {
    const riderId = rider?.username || rider?.riderId;
    const riderName = rider?.name || 'Partner';
    try {
      if (riderId) {
        fetch('https://motodc-official.vercel.app/api/delivery-auth?action=logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ riderId }),
        }).catch(() => {});
      }
    } catch (_) {}
    setRider(null);
    try {
      localStorage.removeItem('motodc_partner_rider');
      localStorage.removeItem('motodc_route_active_' + rider?.username);
      localStorage.removeItem('motodc_known_assigned_orders_' + rider?.username);
    } catch (_) {}
    scheduleNativeShiftAlarms().catch(() => {});

    // Send immediate native notification to Android status bar
    sendLocalNotification({
      id: 9920,
      title: '🏁 Shift Concluded – Automatically Logged Off',
      body: reason || `Thank you ${riderName}! Your scheduled shift has ended. Shift attendance is recorded at Karaikal Hub. Rest well!`,
      channelId: 'motodc_shift_alerts',
    });

    toast.error(reason || 'Shift ended. Automatically logged off.', { duration: 8000, icon: '⏰' });
  };

  // Strict Shift Monitor: Automatically logs off rider when shift ends
  useEffect(() => {
    if (!rider) return;

    const evaluateShift = () => {
      const now = new Date();
      const utcMillis = now.getTime() + now.getTimezoneOffset() * 60000;
      const istDate = new Date(utcMillis + 330 * 60000);
      const currentMinutes = istDate.getHours() * 60 + istDate.getMinutes();

      const cutoffMinutes = rider.shiftEndMinutes || (rider.serviceMode === 'Power Rider' ? 1290 : 1230);
      const startMinutes = rider.shiftStartMinutes || (rider.serviceMode === 'Power Rider' ? 480 : 510);

      // Advance warning 15 minutes before shift end (e.g. 8:15 PM)
      if (currentMinutes === cutoffMinutes - 15) {
        const warnedKey = 'motodc_shift_ending_warned_' + istDate.toISOString().slice(0, 10);
        if (!sessionStorage.getItem(warnedKey)) {
          sessionStorage.setItem(warnedKey, 'true');
          sendLocalNotification({
            id: 9919,
            title: '⚠️ Shift Ending in 15 Minutes',
            body: `Your shift concludes at ${rider.shiftLabel ? rider.shiftLabel.split('–')[1]?.trim() : '8:30 PM'}. Wrap up active deliveries and head back to Karaikal Hub.`,
            channelId: 'motodc_shift_alerts',
          });
        }
      }

      if (currentMinutes > cutoffMinutes || currentMinutes < startMinutes) {
        forceAutoLogoff(`Shift Ended: Your scheduled delivery hours (${rider.shiftLabel || '8:30 AM – 8:30 PM'}) are complete. Automatically signed out.`);
      }
    };

    const interval = setInterval(evaluateShift, 60000);
    evaluateShift();
    return () => clearInterval(interval);
  }, [rider]);

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

  // Doorstep Scan & Hub Bag Verification States
  const [targetDoorstepStop, setTargetDoorstepStop] = useState(null);
  const [hubScanMode, setHubScanMode] = useState(false);
  const [pendingStopsList, setPendingStopsList] = useState([]);

  const todayDateStr = new Date().toISOString().slice(0, 10);
  const hubStorageKey = `motodc_hub_scanned_${rider?.username || 'rider'}_${todayDateStr}`;

  const [hubScannedIds, setHubScannedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(hubStorageKey) || '[]');
    } catch {
      return [];
    }
  });

  const saveHubScannedIds = (ids) => {
    setHubScannedIds(ids);
    try {
      localStorage.setItem(hubStorageKey, JSON.stringify(ids));
    } catch (_) {}
  };

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

    // 1. Strict Doorstep Scan Mode: Rider is at customer doorstep verifying specific order
    if (targetDoorstepStop) {
      const targetId = String(targetDoorstepStop.orderId || targetDoorstepStop.id || '')
        .replace(/^#/, '')
        .trim()
        .toUpperCase();
      const scannedId = clean.toUpperCase();

      if (scannedId === targetId || scannedId.includes(targetId) || targetId.includes(scannedId)) {
        playNotificationChime('package');
        toast.success(`✅ Parcel Verified for #${targetDoorstepStop.orderId || targetDoorstepStop.id}! Ready for Customer Handover.`, {
          duration: 4000,
        });
        setVerifiedOrder(targetDoorstepStop);
        setTargetDoorstepStop(null);
        setOrderSource('runsheet');
        return;
      } else {
        playNotificationChime('shift');
        toast.error(
          `❌ WRONG PARCEL! Scanned #${clean}, but this stop requires #${targetDoorstepStop.orderId || targetDoorstepStop.id}. Please scan the correct package!`,
          { duration: 6000 }
        );
        return;
      }
    }

    // 2. Hub Bag Loading Scan Mode: Rider is scanning assigned packages into bag before departing Hub
    if (hubScanMode) {
      const scannedId = clean.toUpperCase();
      const matched = pendingStopsList.find((s) => {
        const id1 = String(s.orderId || '')
          .replace(/^#/, '')
          .trim()
          .toUpperCase();
        const id2 = String(s.id || '')
          .replace(/^#/, '')
          .trim()
          .toUpperCase();
        return id1 === scannedId || id2 === scannedId || id1.includes(scannedId) || scannedId.includes(id1);
      });

      if (matched) {
        const matchedKey = String(matched.orderId || matched.id);
        const updated = Array.from(new Set([...hubScannedIds, matchedKey]));
        saveHubScannedIds(updated);
        playNotificationChime('package');
        toast.success(`📦 Verified in Bag: #${matched.orderId || matched.id} (${updated.length}/${pendingStopsList.length})`, {
          icon: '✅',
        });

        if (updated.length >= pendingStopsList.length && pendingStopsList.length > 0) {
          toast.success('🎉 All assigned parcels verified in delivery bag! Route & GPS unlocked.', {
            icon: '🚀',
            duration: 6000,
          });
        }
      } else {
        playNotificationChime('shift');
        toast.error(`⚠️ Parcel #${clean} is not in your assigned stops today!`, { duration: 5000 });
      }
      return;
    }

    setLoadingOrder(true);
    if (!isBatchMode) {
      setVerifiedOrder(null);
    }
    setDeliveredSuccess(null);

    const handleOrderFound = (foundOrder) => {
      const orderIdDisplay = foundOrder.orderId || foundOrder.id;
      toast.success(`Found order #${orderIdDisplay}`);
      setVerifiedOrder(foundOrder);
      setOrderSource('scanner');
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
        toast.error(`Order #${clean} could not be verified. Please check connection or verify the barcode.`);
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

  const handleNextScan = () => {
    setDeliveredSuccess(null);
    setVerifiedOrder(null);
    setActiveTab("scanner");
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
            setTargetDoorstepStop(null);
            setHubScanMode(false);
            setActiveTab('scanner');
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
              <Scanner
                onOrderScanned={handleOrderScanned}
                loading={loadingOrder}
                targetDoorstepStop={targetDoorstepStop}
                onCancelTarget={() => {
                  setTargetDoorstepStop(null);
                  setActiveTab('runsheet');
                }}
                hubScanMode={hubScanMode}
                hubScannedCount={
                  pendingStopsList.filter((s) => hubScannedIds.includes(String(s.orderId || s.id))).length
                }
                totalPendingStops={pendingStopsList.length}
                onExitHubMode={() => {
                  setHubScanMode(false);
                  setActiveTab('runsheet');
                }}
              />
            )}

            {/* 2. Single Order Verified Screen */}
            {verifiedOrder && (
              <VerifiedOrder
                order={verifiedOrder}
                orderSource={orderSource}
                isOnline={isOnline}
                onCancel={() => {
                  setVerifiedOrder(null);
                  if (orderSource === 'runsheet') {
                    setActiveTab('runsheet');
                  }
                }}
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
                {deliveredSuccess.wasSavedOffline && (
                  <div className="offlineSuccessNotice">
                    <WifiOff size={14} color="#f59e0b" />
                    <span>Saved locally in basement/dead zone. Will auto-sync when network returns!</span>
                  </div>
                )}
                <div className="successActionButtons" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '14px' }}>
                  <button
                    type="button"
                    className="nextRunSheetBtn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '12px 18px',
                      borderRadius: '10px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: 'Sora, sans-serif'
                    }}
                    onClick={() => {
                      setDeliveredSuccess(null);
                      setVerifiedOrder(null);
                      setActiveTab('runsheet');
                    }}
                  >
                    <ClipboardList size={16} /> Return to Run Sheet (Next Stop)
                  </button>
                  <button
                    type="button"
                    className="nextScanBtn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      padding: '10px 18px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'Sora, sans-serif'
                    }}
                    onClick={handleNextScan}
                  >
                    <Camera size={14} /> Scan Next Package Barcode
                  </button>
                </div>
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
            hubScannedIds={hubScannedIds}
            onPendingStopsLoaded={(stops) => setPendingStopsList(stops)}
            onStartHubBagScan={() => {
              setHubScanMode(true);
              setTargetDoorstepStop(null);
              setVerifiedOrder(null);
              setActiveTab('scanner');
            }}
            onSelectStopForDelivery={(stop) => {
              setTargetDoorstepStop(stop);
              setHubScanMode(false);
              setVerifiedOrder(null);
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
