import { Geolocation } from '@capacitor/geolocation';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { sendLocalNotification } from '../notificationService';
import {
  Camera,
  Package,
  IndianRupee,
  Trash2,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  MessageCircle,
  RefreshCw,
  ExternalLink,
  Clock,
  QrCode,
  Wallet,
  ChevronRight,
  Coins,
  WifiOff,
  Zap,
  Radio,
  ShieldCheck
} from 'lucide-react';
import ShiftSettlementDrawer from './ShiftSettlementDrawer';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function DailyRunSheet({
  completedDeliveries,
  onClearRunSheet,
  onSelectStopForDelivery,
  rider,
  offlineQueue = [],
  onSyncQueue,
  isOnline = true,
  hubScannedIds = [],
  onStartHubBagScan,
  onPendingStopsLoaded,
}) {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'completed'
  const [pendingStops, setPendingStops] = useState([]);
  const [corridor, setCorridor] = useState(null);
  const [isStagedAtHub, setIsStagedAtHub] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);
  const prevCountRef = useRef(null);
  const [showSettlement, setShowSettlement] = useState(false);

  const hubScannedCount = pendingStops.filter((s) =>
    hubScannedIds.includes(String(s.orderId || s.id))
  ).length;
  const allHubScanned =
    pendingStops.length > 0 &&
    pendingStops.every((s) => hubScannedIds.includes(String(s.orderId || s.id)));

  useEffect(() => {
    onPendingStopsLoaded?.(pendingStops);
  }, [pendingStops]);

  // Privacy-First Route GPS Tracking State: Active ONLY after collecting packages at Hub
  const [isRouteActive, setIsRouteActive] = useState(false);
  const [lastGpsCoords, setLastGpsCoords] = useState(null);

  const gpsIntervalRef = useRef(null);
  const gpsWatchRef = useRef(null);
  const isTrackingActiveRef = useRef(false);

  // Send coordinates to MotoDC backend API
  const sendLocationPing = useCallback(async (coords) => {
    if (!coords || coords.latitude == null || coords.longitude == null) return;
    const { latitude, longitude, speed, heading, accuracy } = coords;

    const formattedTime = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    setLastGpsCoords({
      lat: latitude,
      lng: longitude,
      accuracy: accuracy || 0,
      updatedAt: formattedTime,
    });

    const riderCode = String(rider?.username || rider?.riderId || 'MDC-8586').trim().toUpperCase();
    const riderName = String(rider?.name || 'MotoDC Partner').trim();

    try {
      await fetch('https://motodc-official.vercel.app/api/delivery-partner?action=update-rider-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riderId: riderCode,
          riderName: riderName,
          lat: latitude,
          lng: longitude,
          speed: Number(speed || 0),
          heading: Number(heading || 0),
          accuracy: Number(accuracy || 0),
          isGpsActive: true,
        }),
      });
    } catch (err) {
      console.warn('[GPS Engine] Transmit warning:', err);
    }
  }, [rider]);

  // Acquire current location using fastest & most reliable method
  const acquirePosition = useCallback(async () => {
    // Strategy 1: Capacitor Native with Balanced Accuracy (fastest indoor/outdoor fix)
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 6000,
        maximumAge: 30000,
      });
      if (pos?.coords?.latitude != null) return pos.coords;
    } catch (_) {}

    // Strategy 2: Capacitor Native with High Accuracy (GPS hardware fix)
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 10000,
      });
      if (pos?.coords?.latitude != null) return pos.coords;
    } catch (_) {}

    // Strategy 3: Standard Web Geolocation API fallback
    if (typeof window !== 'undefined' && navigator.geolocation) {
      try {
        const coords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p.coords),
            (err) => reject(err),
            { enableHighAccuracy: false, timeout: 6000, maximumAge: 30000 }
          );
        });
        if (coords?.latitude != null) return coords;
      } catch (_) {}
    }

    return null;
  }, []);

  // Ensure Location Permissions on Android & Web
  const ensureGpsPermissions = useCallback(async () => {
    try {
      let perm = await Geolocation.checkPermissions().catch(() => null);
      if (!perm || (perm.location !== 'granted' && perm.coarseLocation !== 'granted')) {
        perm = await Geolocation.requestPermissions({ permissions: ['location'] }).catch(() => null);
      }
      return Boolean(perm && (perm.location === 'granted' || perm.coarseLocation === 'granted'));
    } catch (_) {
      return true;
    }
  }, []);

  // Start Continuous Resilient GPS Heartbeat & Watcher
  const startGpsWatch = useCallback(async () => {
    isTrackingActiveRef.current = true;

    // 1. Check / request permissions
    await ensureGpsPermissions();

    // 2. Transmit immediate fix right away
    const initialCoords = await acquirePosition();
    if (initialCoords) {
      await sendLocationPing(initialCoords);
    }

    // 3. Setup Heartbeat Interval (Every 10 seconds while on route)
    if (gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
    }
    gpsIntervalRef.current = setInterval(async () => {
      if (!isTrackingActiveRef.current) return;
      const coords = await acquirePosition();
      if (coords) {
        await sendLocationPing(coords);
      }
    }, 10000);

    // 4. Setup Native Watcher for instantaneous movement/speed updates
    if (!gpsWatchRef.current) {
      try {
        const watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
          (pos) => {
            if (pos?.coords) {
              sendLocationPing(pos.coords);
            }
          }
        );
        gpsWatchRef.current = watchId;
      } catch (capErr) {
        if (typeof window !== 'undefined' && navigator.geolocation) {
          const webWatchId = navigator.geolocation.watchPosition(
            (pos) => sendLocationPing(pos.coords),
            () => {},
            { enableHighAccuracy: false, maximumAge: 5000, timeout: 15000 }
          );
          gpsWatchRef.current = webWatchId;
        }
      }
    }
  }, [acquirePosition, ensureGpsPermissions, sendLocationPing]);

  // Stop GPS Tracking (Immediately ceases pings upon returning to Hub)
  const stopGpsWatch = useCallback(async () => {
    isTrackingActiveRef.current = false;

    if (gpsIntervalRef.current) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
    }

    if (gpsWatchRef.current) {
      try {
        if (typeof gpsWatchRef.current === 'string') {
          await Geolocation.clearWatch({ id: gpsWatchRef.current });
        } else if (navigator.geolocation) {
          navigator.geolocation.clearWatch(gpsWatchRef.current);
        }
      } catch (_) {}
      gpsWatchRef.current = null;
    }

    setIsRouteActive(false);
    const riderCode = String(rider?.username || rider?.riderId || 'MDC-8586').trim().toUpperCase();
    try {
      localStorage.removeItem('motodc_route_active_' + riderCode);
    } catch (_) {}

    // Tell backend route is paused
    try {
      fetch('https://motodc-official.vercel.app/api/delivery-partner?action=update-rider-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riderId: riderCode,
          isGpsActive: false,
        }),
      }).catch(() => {});
    } catch (_) {}

    toast('Live GPS Tracking paused. Returned to Karaikal Hub.', { icon: '🛑' });
  }, [rider]);

  // Package Collection & Native Android GPS Permission Request at Hub Station
  const handleDepartHubWithPackages = async () => {
    if (!allHubScanned) {
      toast.error(
        `Please scan all ${pendingStops.length} assigned parcels into your delivery bag before departing Karaikal Hub! (${hubScannedCount}/${pendingStops.length} scanned)`,
        { duration: 6000, icon: '🔒' }
      );
      return;
    }

    toast.loading('Activating Live Route GPS & Connecting to Radar...', { id: 'gps-start' });

    setIsRouteActive(true);
    const riderCode = String(rider?.username || rider?.riderId || 'MDC-8586').trim().toUpperCase();
    try {
      localStorage.setItem('motodc_route_active_' + riderCode, 'true');
    } catch (_) {}

    await startGpsWatch();

    toast.success('Packages Checked Out! Live Route GPS Active.', {
      id: 'gps-start',
      icon: '🏍️',
      duration: 4000,
    });
  };

  // Safety: If new pending parcels arrive that are not yet scanned at Hub, ensure Route GPS stays off
  useEffect(() => {
    if (pendingStops.length > 0 && !allHubScanned && isRouteActive) {
      setIsRouteActive(false);
      stopGpsWatch();
    }
  }, [pendingStops.length, allHubScanned, isRouteActive, stopGpsWatch]);

  // Resume tracking if route was active, all hub parcels are scanned into bag, and stops remain
  useEffect(() => {
    if (isRouteActive && pendingStops.length > 0 && allHubScanned) {
      startGpsWatch();
    }
    return () => {
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
      if (gpsWatchRef.current) {
        try {
          if (typeof gpsWatchRef.current === 'string') {
            Geolocation.clearWatch({ id: gpsWatchRef.current });
          } else if (navigator.geolocation) {
            navigator.geolocation.clearWatch(gpsWatchRef.current);
          }
        } catch (_) {}
        gpsWatchRef.current = null;
      }
    };
  }, [isRouteActive, pendingStops.length, startGpsWatch]);

  // Terminate GPS tracking immediately once all deliveries are complete
  useEffect(() => {
    if (pendingStops.length === 0 && isRouteActive) {
      stopGpsWatch();
    }
  }, [pendingStops.length, isRouteActive, stopGpsWatch]);

  // Fetch pending stops from live backend (scoped by riderId for Solution A)
  const fetchPendingStops = async () => {
    setLoadingStops(true);
    try {
      const riderCode = rider?.username || rider?.riderId || '';
      const url = `https://motodc-official.vercel.app/api/delivery-partner?action=active-deliveries${
        riderCode ? `&riderId=${encodeURIComponent(riderCode)}` : ''
      }`;
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.corridor) {
          setCorridor(data.corridor);
        } else {
          setCorridor(null);
        }
        setIsStagedAtHub(Boolean(data.isStagedAtHub));

        if (Array.isArray(data.stops)) {
          // Exclude deliveries already completed in this shift
          const completedIds = new Set(completedDeliveries.map((c) => String(c.orderId || c.id)));
          const uncompleted = data.stops.filter((s) => !completedIds.has(String(s.orderId || s.id)));
          setPendingStops(uncompleted);

          // In-App Toast Alert if count increases while viewing Run Sheet
          const currentCount = uncompleted.length;
          if (currentCount > 0 && prevCountRef.current !== null && currentCount > prevCountRef.current) {
            const diff = currentCount - prevCountRef.current;
            toast.success(`📦 ${diff} new package(s) assigned to your run sheet!`, { duration: 5000, icon: '📦' });
          }
          prevCountRef.current = currentCount;
        }
      }
    } catch (err) {
      console.warn('Error fetching pending stops:', err);
    } finally {
      setLoadingStops(false);
    }
  };

  // 30-Second Polling for Real-Time Package Assignments from Dispatch Console
  useEffect(() => {
    fetchPendingStops();
    const pollInterval = setInterval(() => {
      fetchPendingStops();
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [completedDeliveries, rider?.username]);

  const totalCashCollected = completedDeliveries.reduce((sum, item) => {
    return sum + (item.isCod ? Number(item.total || 0) : 0);
  }, 0);

  const totalUpiCollected = completedDeliveries.reduce((sum, item) => {
    return sum + (item.paymentMode === 'upi_doorstep' ? Number(item.total || 0) : 0);
  }, 0);

  // 1-Tap Google Maps Turn-by-Turn Navigation (Optimized for Two-Wheelers / Delivery Bikes)
  const handleOpenGoogleMaps = (shipping) => {
    const addressParts = [shipping?.address, shipping?.city, shipping?.state, shipping?.pincode]
      .filter(Boolean)
      .join(', ');
    const destination = encodeURIComponent(addressParts || 'Karaikal, Puducherry');
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=two-wheeler`;

    // Native anchor trigger ensures reliable intent dispatch to the Google Maps Android app
    const a = document.createElement('a');
    a.href = mapsUrl;
    a.target = '_system';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 1-Tap WhatsApp "Arriving in 5 Mins" Alert
  const handleSendWhatsAppAlert = (stop) => {
    const rawPhone = stop.customer?.phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const customerName = stop.customer?.name || 'Customer';
    const orderId = stop.orderId || stop.id;

    const message = encodeURIComponent(
      `Hi ${customerName}! 🏍️ Your MotoDC delivery partner is arriving at your doorstep in 5–10 minutes with Order #${orderId}. Please keep your 4-digit Handover PIN ready!`
    );

    window.open(`https://wa.me/${phoneWithCountry}?text=${message}`, '_blank');
  };

  // 1-Tap Call Customer
  const handleCallCustomer = (phone) => {
    if (!phone) return;
    window.open(`tel:${phone.replace(/\D/g, '')}`, '_system');
  };

  return (
    <div className="runSheetSection">
      {/* Solution A: Assigned Route Corridor Manifest Banner */}
      {corridor && (
        <div className="corridorManifestBanner" style={{ '--manifest-color': corridor.color || '#3b82f6' }}>
          <div className="manifestTopRow">
            <div className="manifestCodeBadge" style={{ background: corridor.color || '#3b82f6' }}>
              {corridor.code || 'ROUTE'}
            </div>
            <div className="manifestTitleGroup">
              <h3 className="manifestCorridorName">{corridor.name}</h3>
              <span className="manifestSubtag">
                {pendingStops.length} stops left ({completedDeliveries.length} completed)
              </span>
            </div>
            <div className="manifestPayoutBadge">
              <small>Route Pay</small>
              <strong>₹{(pendingStops.length + completedDeliveries.length) * 45}</strong>
            </div>
          </div>
          <div className="manifestAreaRow">
            <MapPin size={12} style={{ color: corridor.color || '#3b82f6', flexShrink: 0 }} />
            <span>{corridor.areas}</span>
          </div>
        </div>
      )}

      {/* Shift Tally HUD */}
      <div className="summaryBar" style={{ marginBottom: '14px' }}>
        <div className="summaryItem">
          <div className="summaryIcon" style={{ color: '#38bdf8' }}>
            <Clock size={18} />
          </div>
          <div>
            <small>Stops Left</small>
            <strong>{pendingStops.length}</strong>
          </div>
        </div>
        <div className="summaryItem">
          <div className="summaryIcon" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <small>Completed</small>
            <strong>{completedDeliveries.length}</strong>
          </div>
        </div>
        <div className="summaryItem">
          <div className="summaryIcon" style={{ color: '#f59e0b' }}>
            <IndianRupee size={18} />
          </div>
          <div>
            <small>Cash in Hand</small>
            <strong>{money(totalCashCollected)}</strong>
          </div>
        </div>
        {totalUpiCollected > 0 && (
          <div className="summaryItem">
            <div className="summaryIcon" style={{ color: '#a855f7' }}>
              <QrCode size={18} />
            </div>
            <div>
              <small>UPI Settled</small>
              <strong style={{ color: '#c084fc' }}>{money(totalUpiCollected)}</strong>
            </div>
          </div>
        )}
      </div>

      {/* 💰 Shift Settlement & Cash Reconciler Banner */}
      <button
        type="button"
        className="shiftSettlementTriggerBtn"
        onClick={() => setShowSettlement(true)}
      >
        <div className="settlementBtnLeft">
          <div className="settlementIconPulse">
            <Wallet size={18} color="#f59e0b" />
          </div>
          <div>
            <div className="settlementBtnTitle">
              <span>Shift Settlement & Reconciler</span>
              <span className="settlementMiniBadge">
                {totalCashCollected > 0 ? `Cash: ${money(totalCashCollected)}` : 'Settle Shift'}
              </span>
            </div>
            <p className="settlementBtnSubtitle">
              Banknote counter, ₹45/drop earnings & WhatsApp cashier slip
            </p>
          </div>
        </div>
        <ChevronRight size={18} className="settlementChevron" />
      </button>

      {/* Offline Pending Sync Banner */}
      {offlineQueue.length > 0 && (
        <div className="offlineQueueBanner">
          <div className="queueBannerLeft">
            <div className="queuePulseIcon">
              <Zap size={16} color="#fbbf24" />
            </div>
            <div>
              <strong>{offlineQueue.length} Handover{offlineQueue.length > 1 ? 's' : ''} Stored Locally</strong>
              <small>Recorded in basement/dead zone. Tap to sync with cloud.</small>
            </div>
          </div>
          <button
            type="button"
            className="syncQueueBtn"
            onClick={() => onSyncQueue?.(true)}
          >
            <RefreshCw size={12} /> Sync Now
          </button>
        </div>
      )}

      {/* 📦 Hub Package Collection & Bag Scanning Gate */}
      {pendingStops.length > 0 && !isRouteActive && (
        <div className="hubPickupCard">
          <div className="hubPickupHeader">
            <div className="hubPickupIcon">📦</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '14px', color: '#f8fafc' }}>
                Karaikal Hub Bag Verification Gate
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {allHubScanned
                  ? `✅ All ${pendingStops.length} parcels verified in delivery bag! Route & GPS unlocked.`
                  : `Scan all ${pendingStops.length} assigned parcels into your delivery bag before departing`}
              </div>
            </div>
          </div>

          {/* Bag Scanning Progress Bar */}
          <div style={{ margin: '12px 0 8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '5px', fontWeight: 700 }}>
              <span style={{ color: allHubScanned ? '#22c55e' : '#38bdf8' }}>
                Bag Loading Verification: {hubScannedCount} of {pendingStops.length} Scanned
              </span>
              <span style={{ color: allHubScanned ? '#22c55e' : '#f59e0b' }}>
                {Math.round((hubScannedCount / (pendingStops.length || 1)) * 100)}%
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, (hubScannedCount / (pendingStops.length || 1)) * 100)}%`,
                  height: '100%',
                  background: allHubScanned ? '#22c55e' : 'linear-gradient(90deg, #0284c7, #38bdf8)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {!allHubScanned ? (
            <>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: '6px 0 10px 0', lineHeight: 1.4 }}>
                🔒 <strong>Strict Dispatch Rule:</strong> Destination addresses, map navigation, and live GPS are locked until every parcel is scanned into custody at the Hub.
              </p>
              <button
                type="button"
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                }}
                onClick={() => onStartHubBagScan?.()}
              >
                <Camera size={15} /> Scan Packages into Delivery Bag ({pendingStops.length - hubScannedCount} remaining)
              </button>
            </>
          ) : (
            <button
              type="button"
              className="startRouteGpsBtn"
              onClick={handleDepartHubWithPackages}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '8px',
                boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)',
              }}
            >
              <Radio size={16} /> All Scanned! Depart Hub & Start Live Route GPS
            </button>
          )}
        </div>
      )}

      {/* 🛰️ Live Route GPS Active Bar */}
      {isRouteActive && (
        <div className="liveGpsActiveBar">
          <div className="liveGpsDot pulsing" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ShieldCheck size={14} /> Live Route GPS Active (Customer Radar On)
            </span>
            <span style={{ fontSize: '10px', color: '#86efac' }}>
              {lastGpsCoords?.updatedAt
                ? `Live Ping: ${lastGpsCoords.updatedAt}${lastGpsCoords.accuracy ? ` • Acc: ${Math.round(lastGpsCoords.accuracy)}m` : ''}`
                : 'Connecting to GPS radar & transmitting pings...'}
            </span>
          </div>
          <button
            type="button"
            className="pauseGpsBtn"
            onClick={stopGpsWatch}
            title="Pause tracking if returning to Hub station"
          >
            Pause / Return to Hub
          </button>
        </div>
      )}

      {/* Sub Tabs: Pending Stops vs Completed */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '10px',
            border: activeTab === 'pending' ? '1px solid #ff3157' : '1px solid rgba(255,255,255,0.08)',
            background: activeTab === 'pending' ? 'rgba(255,49,87,0.15)' : 'rgba(15,23,42,0.6)',
            color: activeTab === 'pending' ? '#ff3157' : '#94a3b8',
            fontFamily: 'Sora, sans-serif',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          📍 Stops for Today ({pendingStops.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '10px',
            border: activeTab === 'completed' ? '1px solid #22c55e' : '1px solid rgba(255,255,255,0.08)',
            background: activeTab === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(15,23,42,0.6)',
            color: activeTab === 'completed' ? '#22c55e' : '#94a3b8',
            fontFamily: 'Sora, sans-serif',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          ✓ Completed ({completedDeliveries.length})
        </button>
      </div>

      {/* TAB 1: PENDING RUN SHEET STOPS */}
      {activeTab === 'pending' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
              Optimized Delivery Route
            </span>
            <button
              type="button"
              onClick={fetchPendingStops}
              disabled={loadingStops}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={12} className={loadingStops ? 'spin' : ''} /> Refresh Route
            </button>
          </div>

          {!pendingStops.length ? (
            isStagedAtHub ? (
              <div className="hubStagingCard">
                <div className="hubStagingPulse">
                  <Clock size={36} color="#f59e0b" />
                </div>
                <h4>Hub Staging: Waiting for Route Dispatch</h4>
                <p>
                  Welcome <strong>{rider?.name}</strong> ({rider?.username})! You are staged at the Karaikal Depot. Your supervisor will assign your corridor manifest based on your <strong>{rider?.serviceMode || 'Standard'}</strong> shift.
                </p>
                <button
                  type="button"
                  className="refreshStagingBtn"
                  onClick={fetchPendingStops}
                  disabled={loadingStops}
                >
                  <RefreshCw size={14} className={loadingStops ? 'spin' : ''} />
                  {loadingStops ? 'Checking Hub Assignments...' : 'Refresh Route Assignment'}
                </button>
              </div>
            ) : (
              <div className="emptyState" style={{ padding: '30px 16px' }}>
                <CheckCircle2 size={40} color="#22c55e" style={{ margin: '0 auto 8px' }} />
                <h4 style={{ color: '#fff', margin: '0 0 4px', fontSize: '14px' }}>All Deliveries Complete!</h4>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                  No pending parcels left in your shift queue. Great work!
                </p>
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingStops.map((stop, index) => {
                const stopId = String(stop.orderId || stop.id || '');
                const isStopScannedAtHub = hubScannedIds.includes(stopId);
                const isCod = String(stop.paymentMethod || '').toLowerCase() === 'cod';
                const fullAddress = [stop.shipping?.address, stop.shipping?.city, stop.shipping?.pincode]
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={stop.id || index}
                    style={{
                      background: '#0d131f',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '14px',
                      padding: '14px 16px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    }}
                  >
                    {/* Stop Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            background: '#ff3157',
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          STOP {index + 1}
                        </span>
                        <b style={{ color: '#f8fafc', fontSize: '13px', fontFamily: 'monospace' }}>
                          #{stop.orderId || stop.id}
                        </b>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: isStopScannedAtHub ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                            color: isStopScannedAtHub ? '#22c55e' : '#f59e0b',
                            border: isStopScannedAtHub ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(245,158,11,0.35)',
                          }}
                        >
                          {isStopScannedAtHub ? '✅ In Bag' : '⏳ Bag Scan'}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(56,189,248,0.12)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56,189,248,0.25)',
                          }}
                          title="Requires Customer Handover PIN"
                        >
                          🔒 PIN
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: isCod ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
                            color: isCod ? '#f59e0b' : '#22c55e',
                            border: isCod ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(34,197,94,0.3)',
                          }}
                        >
                          {isCod ? `COD: ${money(stop.total)}` : 'PAID'}
                        </span>
                      </div>
                    </div>

                    {/* Customer & Address Details */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '13px' }}>
                        {stop.customer?.name || 'Customer'}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                        <MapPin size={13} style={{ flexShrink: 0, marginTop: '2px', color: allHubScanned ? '#ff3157' : '#64748b' }} />
                        {allHubScanned ? (
                          <span>{fullAddress || 'Address on file'}</span>
                        ) : (
                          <span style={{ color: '#64748b', fontStyle: 'italic' }}>
                            🔒 Destination Hidden • Scan all parcels at Hub to unlock route map
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                        📦 {stop.items?.[0]?.name || 'Automotive Parts'} {stop.items?.length > 1 ? `(+${stop.items.length - 1} more)` : ''}
                      </div>
                    </div>

                    {/* ENHANCEMENT 1: 3 DIRECT ACTION BUTTONS */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                      {/* 1. Google Maps Navigation */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!allHubScanned) {
                            toast.error('🔒 Destination maps are locked until you scan all parcels into your delivery bag at Karaikal Hub!');
                            return;
                          }
                          handleOpenGoogleMaps(stop.shipping);
                        }}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          background: allHubScanned ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
                          border: allHubScanned ? '1px solid rgba(56,189,248,0.35)' : '1px solid rgba(255,255,255,0.08)',
                          color: allHubScanned ? '#38bdf8' : '#64748b',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          cursor: allHubScanned ? 'pointer' : 'not-allowed',
                          opacity: allHubScanned ? 1 : 0.6,
                        }}
                      >
                        <Navigation size={13} /> {allHubScanned ? 'Maps' : 'Locked'}
                      </button>

                      {/* 2. WhatsApp "Arriving in 5 Mins" Alert */}
                      <button
                        type="button"
                        onClick={() => {
                          if (!allHubScanned) {
                            toast.error('🔒 Scan all packages at Karaikal Hub before alerting customers.');
                            return;
                          }
                          handleSendWhatsAppAlert(stop);
                        }}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          background: allHubScanned ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                          border: allHubScanned ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(255,255,255,0.08)',
                          color: allHubScanned ? '#22c55e' : '#64748b',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          cursor: allHubScanned ? 'pointer' : 'not-allowed',
                          opacity: allHubScanned ? 1 : 0.6,
                        }}
                      >
                        <MessageCircle size={13} /> 5-Min Alert
                      </button>

                      {/* 3. Call Customer */}
                      <button
                        type="button"
                        onClick={() => handleCallCustomer(stop.customer?.phone)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          color: '#f8fafc',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <Phone size={13} /> Call
                      </button>
                    </div>

                    {/* Doorstep Verification Button (Strict Barcode Verification Rule) */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!allHubScanned) {
                          toast.error('🔒 Scan all assigned packages at Karaikal Hub before starting doorstep deliveries.');
                          return;
                        }
                        onSelectStopForDelivery?.(stop);
                      }}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: '9px',
                        background: allHubScanned
                          ? 'linear-gradient(135deg, #ff3157, #e11d48)'
                          : 'rgba(255,255,255,0.06)',
                        border: 'none',
                        color: allHubScanned ? '#ffffff' : '#64748b',
                        fontSize: '12px',
                        fontFamily: 'Sora, sans-serif',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: allHubScanned ? 'pointer' : 'not-allowed',
                        boxShadow: allHubScanned ? '0 4px 14px rgba(255,49,87,0.35)' : 'none',
                      }}
                    >
                      <Camera size={14} /> Scan Parcel Barcode for Handover
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMPLETED DELIVERIES */}
      {activeTab === 'completed' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
              Completed in this shift
            </span>
            {completedDeliveries.length > 0 && (
              <button
                type="button"
                onClick={onClearRunSheet}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={12} /> Clear Shift
              </button>
            )}
          </div>

          {!completedDeliveries.length ? (
            <div className="emptyState">
              <Package size={44} color="#334155" style={{ margin: '0 auto 8px' }} />
              <p>No deliveries completed in this shift yet.</p>
              <small style={{ color: '#64748b' }}>Complete stops from your pending route to log them here.</small>
            </div>
          ) : (
            <div className="runSheetList">
              {completedDeliveries.map((it, idx) => (
                <div className="runSheetItem" key={idx}>
                  <div className="runSheetLeft">
                    <b>#{it.orderId || it.id}</b>
                    <small>{it.customerName || 'Customer'} • {it.itemsCount || 1} items</small>
                  </div>
                  <div className="runSheetRight">
                    <span
                      className={`runSheetAmount ${
                        it.paymentMode === 'upi_doorstep' ? 'upi' : it.isCod ? 'cod' : 'prepaid'
                      }`}
                    >
                      {it.paymentMode === 'upi_doorstep'
                        ? `UPI: ${money(it.total)}`
                        : it.isCod
                        ? `CASH: ${money(it.total)}`
                        : 'PREPAID'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                      {it.pendingSync && (
                        <span className="pendingSyncBadge" title="Saved locally in basement. Queued for auto-sync.">
                          <WifiOff size={10} /> Queued
                        </span>
                      )}
                      <span className="runSheetTime">{it.time || 'Delivered'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {completedDeliveries.length > 0 && (
            <button
              type="button"
              className="endShiftBottomBtn"
              onClick={() => setShowSettlement(true)}
            >
              <Wallet size={16} /> Reconcile & Handover Cash to Depot ({money(totalCashCollected)})
            </button>
          )}
        </div>
      )}

      {/* Slide-over Cash Settlement Drawer */}
      <ShiftSettlementDrawer
        isOpen={showSettlement}
        onClose={() => setShowSettlement(false)}
        completedDeliveries={completedDeliveries}
        rider={rider}
        onConfirmShiftDeposit={() => {
          onClearRunSheet?.();
          setShowSettlement(false);
        }}
      />
    </div>
  );
}
