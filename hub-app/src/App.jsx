import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';
import ShippingLabelModal from './ShippingLabelModal';
import BarcodeScannerModal from './BarcodeScannerModal';
import ThemeToggle from './ThemeToggle';
import { detectDeliveryZone, CORRIDOR_METADATA } from './corridorUtil';
import {
  Package,
  Printer,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  Truck,
  Search,
  RefreshCw,
  Barcode,
  CheckSquare,
  Square,
  Lock,
  Key,
  Clock,
  ArrowRight,
  LogOut,
  Info,
  Camera,
  Zap,
  Volume2,
  Smartphone,
  Copy,
  X
} from 'lucide-react';
import { Toaster, toast } from 'react-hot-toast';
import './hub-station.css';

const DEFAULT_STATION_PIN = '1234';

// Hub Shift Schedule: 7:00 AM to 8:30 PM IST (Daily)
// Auto-lock / logout after shift completion (>= 8:30 PM / 20:30)
const isShiftCompleted = () => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  const shiftEndMinutes = 20 * 60 + 30; // 8:30 PM = 1230 minutes
  const morningShiftStartMinutes = 7 * 60; // 7:00 AM = 420 minutes

  return currentMinutes >= shiftEndMinutes || currentMinutes < morningShiftStartMinutes;
};

export default function App() {
  const [afterHoursOverride, setAfterHoursOverride] = useState(false);
  const [stationAuth, setStationAuth] = useState(() => {
    try {
      if (isShiftCompleted()) {
        localStorage.removeItem('motodc_hub_auth');
        return false;
      }
      return localStorage.getItem('motodc_hub_auth') === 'granted';
    } catch {
      return false;
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Orders State
  const [codOrders, setCodOrders] = useState([]);
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'packed' | 'in_transit'
  const [selectedCorridor, setSelectedCorridor] = useState('all');

  // Modals & Checklist State
  const [labelOrder, setLabelOrder] = useState(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState({}); // { [orderId_itemIdx]: boolean }
  const [updatingId, setUpdatingId] = useState(null);
  const [lastScannedBarcode, setLastScannedBarcode] = useState('');

  // Web Audio Context for Chimes and Barcode Beeps
  const audioContextRef = useRef(null);

  const playTone = (freq = 880, type = 'sine', duration = 0.25) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContextRef.current) audioContextRef.current = new AudioCtx();
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (_) {}
  };

  const playChime = () => {
    playTone(587.33, 'sine', 0.15); // D5
    setTimeout(() => playTone(880, 'sine', 0.25), 120); // A5
  };

  const playScannerBeep = () => {
    playTone(1760, 'square', 0.12); // High crisp barcode scanner beep
  };

  // Auto-logout when shift completes at 8:30 PM
  useEffect(() => {
    const checkShiftTimer = () => {
      if (isShiftCompleted() && stationAuth && !afterHoursOverride) {
        setStationAuth(false);
        try {
          localStorage.removeItem('motodc_hub_auth');
        } catch (_) {}
        toast('Operational shift completed (8:30 PM). Station terminal automatically locked.', {
          icon: 'ðŸŒ™',
          duration: 6000,
        });
      }
    };

    checkShiftTimer();
    const interval = setInterval(checkShiftTimer, 5000);
    return () => clearInterval(interval);
  }, [stationAuth, afterHoursOverride]);

  // Station PIN Authentication
  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pinInput.trim() === DEFAULT_STATION_PIN) {
      const shiftEnded = isShiftCompleted();
      if (shiftEnded) {
        setAfterHoursOverride(true);
        toast('Overtime / After-Hours Access Unlocked (Shift ended at 8:30 PM)', { icon: '⚠️', duration: 5000 });
      } else {
        toast.success('Station Unlocked • Karaikal Hub Packing Terminal Active');
      }
      setStationAuth(true);
      setPinError('');
      try {
        localStorage.setItem('motodc_hub_auth', 'granted');
      } catch (_) {}
    } else {
      setPinError('Incorrect Station PIN');
      toast.error('Invalid Station PIN');
    }
  };

  const handleStationLock = () => {
    setStationAuth(false);
    setAfterHoursOverride(false);
    try {
      localStorage.removeItem('motodc_hub_auth');
    } catch (_) {}
    toast('Station locked', { icon: '🔒' });
  };

  // State for loaded orders from Vercel Serverless Admin API
  const [hubOrders, setHubOrders] = useState([]);
  const lastOrderCountRef = useRef(0);

  // Real-Time / Polled Sync via Vercel Admin API (bypasses unauthenticated Firestore client rules)
  const fetchHubOrders = async () => {
    if (!stationAuth) return;
    try {
      const res = await fetch('https://motodc-official.vercel.app/api/delivery-partner?action=hub-orders');
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.orders)) {
        if (lastOrderCountRef.current > 0 && data.orders.length > lastOrderCountRef.current) {
          playChime();
          toast('New order received for packing!', { icon: '📦' });
        }
        lastOrderCountRef.current = data.orders.length;
        setHubOrders(data.orders);
      }
    } catch (err) {
      console.warn('Hub orders sync error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!stationAuth) return;
    setLoading(true);
    fetchHubOrders();

    const interval = setInterval(fetchHubOrders, 3500);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchHubOrders();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', fetchHubOrders);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', fetchHubOrders);
    };
  }, [stationAuth]);

  // Combine and format active orders
  const allOrders = useMemo(() => {
    return hubOrders.map((o) => {
      const corridorId = o.assignedCorridor || detectDeliveryZone(o.shipping);
      const meta = CORRIDOR_METADATA[corridorId] || CORRIDOR_METADATA.central_town;
      return {
        ...o,
        corridorId,
        corridorMeta: meta,
      };
    });
  }, [hubOrders]);

  // Filtered orders for queue
  const filteredOrders = useMemo(() => {
    return allOrders.filter((o) => {
      const st = String(o.orderStatus || 'placed').toLowerCase();
      const isPacked = Boolean(o.packedAt) || st === 'packed';

      // Tab Filtering:
      // Awaiting Packing: Any order not yet packed
      if (activeTab === 'pending') {
        if (['shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].includes(st)) return false;
        if (isPacked) return false;
      } else if (activeTab === 'packed') {
        // Packed and staged at hub: Has packedAt or st === 'packed', and not yet handed to rider/departed
        if (['shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].includes(st)) return false;
        if (!isPacked) return false;
      } else if (activeTab === 'in_transit') {
        // In Transit: Handed over / on the road with courier
        if (!['shipped', 'out_for_delivery', 'delivered'].includes(st)) return false;
      }

      // Corridor Filtering
      if (selectedCorridor !== 'all' && o.corridorId !== selectedCorridor) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const idMatch = String(o.orderId || o.id || '').toLowerCase().includes(q);
        const nameMatch = String(o.customer?.name || '').toLowerCase().includes(q);
        const phoneMatch = String(o.customer?.phone || '').includes(q);
        const itemMatch = (o.items || []).some((it) => String(it.name || '').toLowerCase().includes(q));
        if (!idMatch && !nameMatch && !phoneMatch && !itemMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      const tA = a.createdAt?.seconds || 0;
      const tB = b.createdAt?.seconds || 0;
      return tB - tA;
    });
  }, [allOrders, activeTab, selectedCorridor, searchQuery]);

  // Barcode Handler (Handles both Camera Scans & Hardware USB Scanner guns)
  const handleBarcodeIdentified = (rawCode) => {
    if (!rawCode) return;
    const clean = String(rawCode).trim().toLowerCase();
    setLastScannedBarcode(rawCode);
    playScannerBeep();

    // Search matching order in full pool
    const matched = allOrders.find((o) => {
      const id = String(o.id || '').toLowerCase();
      const orderId = String(o.orderId || '').toLowerCase();
      return id === clean || orderId === clean || clean.includes(orderId) || clean.includes(id);
    });

    if (matched) {
      toast.success(`📦 Barcode Matched: Order #${matched.orderId || matched.id}`, {
        icon: '⚡',
        duration: 4000,
      });
      // Automatically switch to correct tab and open label modal
      const st = String(matched.orderStatus || 'placed').toLowerCase();
      if (st === 'packed') {
        setActiveTab('packed');
      } else if (['shipped', 'out_for_delivery'].includes(st)) {
        setActiveTab('in_transit');
      } else {
        setActiveTab('pending');
      }
      setSearchQuery('');
      setLabelOrder(matched);
    } else {
      toast(`Scanned: "${rawCode}" (No order match found in queue)`, {
        icon: 'ðŸ”',
        duration: 4500,
      });
      setSearchQuery(rawCode);
    }
  };

  // Hardware USB/Bluetooth Barcode Scanner Listener (Keyboard Wedge)
  useEffect(() => {
    if (!stationAuth) return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in a modal or regular text input
      const tag = e.target?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea';

      // Barcode scanners type very rapidly (< 35ms between characters)
      const now = Date.now();
      const diff = now - lastKeyTime;
      lastKeyTime = now;

      if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          // Hardware barcode scan detected!
          e.preventDefault();
          handleBarcodeIdentified(buffer);
          buffer = '';
        }
        return;
      }

      // If typed manually with large delay in a regular input, reset buffer
      if (isInput && diff > 100) {
        buffer = '';
        return;
      }

      if (e.key.length === 1) {
        if (diff > 80) {
          buffer = '';
        }
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stationAuth, allOrders]);

  // Item Checkbox Toggle
  const toggleItemCheck = (orderKey, idx) => {
    const key = `${orderKey}_${idx}`;
    setCheckedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Stage 2 Completion: Mark Packed & Quality Verified
  const handleMarkPackedAndVerified = async (order) => {
    setUpdatingId(order.id);
    try {
      const res = await fetch('https://motodc-official.vercel.app/api/delivery-partner?action=hub-mark-packed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          collectionType: order.collectionType,
          note: 'Packed & Quality Verified at MotoDC Central Warehouse (Karaikal Hub). Staged in ' + order.corridorMeta.name + ' rack.',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Server rejected pack status');
      }

      playChime();
      toast.success(`✅ Order #${order.orderId || order.id} Packed & Staged into ${order.corridorMeta.name}!`, {
        duration: 5000,
        icon: '📦',
      });
      fetchHubOrders();
    } catch (err) {
      console.error('Mark packed error:', err);
      toast.error('Could not update status: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  // Station Lock Screen
  if (!stationAuth) {
    const shiftEnded = isShiftCompleted();
    return (
      <div className="hubStationLockScreen">
        <Toaster position="top-right" />
        <div className="hubStationLockWrap">
          <div className="hubStationLockCard">
            <div className="hubStationLogoRow">
              <img
                src="/hub-app-icon.png"
                alt="MotoDC Hub"
                style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', boxShadow: '0 4px 14px rgba(255, 49, 87, 0.3)' }}
              />
              <div>
                <h2>Moto<span>DC</span> Hub Terminal</h2>
                <p>Warehouse Fulfillment & Barcode Packing Terminal</p>
              </div>
            </div>

            {shiftEnded && (
              <div
                className="hubShiftEndedNotice"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  marginBottom: '18px',
                  color: '#f87171',
                  fontSize: '12px',
                }}
              >
                <Clock size={18} />
                <span>
                  <strong>Shift Completed (8:30 PM)</strong>
                  <br />
                  Warehouse operations are closed for today. Enter station PIN for after-hours override.
                </span>
              </div>
            )}

            <div className="hubStationLockNotice">
              <ShieldCheck size={20} color="#22c55e" />
              <div>
                <strong>Station Protected</strong>
                <p>Enter the 4-digit terminal access PIN to begin shift packing & courier staging.</p>
              </div>
            </div>

            <form onSubmit={handlePinSubmit} className="hubStationPinForm">
              <label htmlFor="station-pin-input">STATION PIN (4 DIGITS)</label>
              <div className="hubPinInputWrap">
                <Key size={18} color="#94a3b8" />
                <input
                  id="station-pin-input"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="one-time-code"
                  placeholder=""
                  value={pinInput}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setPinInput(clean);
                    setPinError('');
                  }}
                  autoFocus
                />
              </div>

              {/* 4-Digit Visual PIN Indicators */}
              <div className="hubPinDotsRow">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className={`hubPinDot ${pinInput.length > idx ? 'filled' : ''}`}
                  />
                ))}
              </div>

              {pinError && <div className="hubPinError">{pinError}</div>}

              <button type="submit" className="hubStationUnlockBtn">
                Unlock Terminal <ArrowRight size={16} />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Counts for pills
  const pendingCount = allOrders.filter((o) => {
    const st = String(o.orderStatus || 'placed').toLowerCase();
    const isPacked = Boolean(o.packedAt) || st === 'packed';
    return !['shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].includes(st) && !isPacked;
  }).length;

  const packedCount = allOrders.filter((o) => {
    const st = String(o.orderStatus || 'placed').toLowerCase();
    const isPacked = Boolean(o.packedAt) || st === 'packed';
    return !['shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'].includes(st) && isPacked;
  }).length;

  const inTransitCount = allOrders.filter((o) => {
    const st = String(o.orderStatus || '').toLowerCase();
    return ['shipped', 'out_for_delivery', 'delivered'].includes(st);
  }).length;

  return (
    <div className="hubStationContainer">
      <Toaster position="top-right" />

      {/* Top Header Row - Ergonomic & Mobile-First */}
      <header className="hubStationHeader">
        {/* Row 1: Brand + Title + Quick Actions */}
        <div className="hubHeaderTopRow">
          <div className="hubStationBrand">
            <img
              src="/hub-app-icon.png"
              alt="MotoDC Hub"
              className="hubBrandLogo"
            />
            <div className="hubBrandText">
              <h1>Karaikal Hub <span>Terminal</span></h1>
              <p>Warehouse Fulfillment & Staging</p>
            </div>
          </div>

          <div className="hubHeaderQuickActions">
            <ThemeToggle />
            <button
              type="button"
              className="hubLockStationBtn"
              onClick={handleStationLock}
              title="Lock Station Terminal"
              aria-label="Lock Station Terminal"
            >
              <Lock size={14} />
              <span>Lock</span>
            </button>
          </div>
        </div>

        {/* Row 2: Status Indicators */}
        <div className="hubHeaderStatusRow">
          <div className="hubShiftBadge">
            <span className="livePulseDot" />
            <span>Karaikal Central (Active Shift)</span>
          </div>

          <div className="hubScannerIndicator" title="USB / Bluetooth Laser Barcode Scanner is listening">
            <Zap size={13} color="#38bdf8" />
            <span>Hardware Laser: <strong>Ready</strong></span>
          </div>
        </div>

        {/* Row 3: Prominent Barcode Scanner Action Button (Bold Crimson Red) */}
        <button
          type="button"
          className="hubOpenScannerBtn"
          onClick={() => setScannerOpen(true)}
          title="Open Camera Barcode Scanner"
        >
          <Camera size={17} />
          <span>Open Barcode Scanner (Camera)</span>
        </button>
      </header>

      {/* Navigation Toolbar */}
      <div className="hubStationToolbar">
        <div className="hubTabGroup" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pending'}
            className={`hubTabBtn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <Clock size={15} />
            <span className="hubTabTitleFull">Awaiting Packing</span>
            <span className="hubTabTitleShort">Awaiting</span>
            <span className="hubTabCount">{pendingCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'packed'}
            className={`hubTabBtn ${activeTab === 'packed' ? 'active' : ''}`}
            onClick={() => setActiveTab('packed')}
          >
            <CheckCircle2 size={15} />
            <span className="hubTabTitleFull">Packed & Staged</span>
            <span className="hubTabTitleShort">Packed</span>
            <span className="hubTabCount">{packedCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'in_transit'}
            className={`hubTabBtn ${activeTab === 'in_transit' ? 'active' : ''}`}
            onClick={() => setActiveTab('in_transit')}
          >
            <Truck size={15} />
            <span className="hubTabTitleFull">In Transit</span>
            <span className="hubTabTitleShort">Transit</span>
            <span className="hubTabCount">{inTransitCount}</span>
          </button>
        </div>

        <div className="hubToolbarControls">
          {/* Corridor Filter */}
          <div className="hubCorridorSelectWrap">
            <label htmlFor="corridor-filter-select">Corridor:</label>
            <select
              id="corridor-filter-select"
              value={selectedCorridor}
              onChange={(e) => setSelectedCorridor(e.target.value)}
            >
              <option value="all">All Corridors (All Racks)</option>
              {Object.values(CORRIDOR_METADATA).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Search Box / Barcode Scan Input */}
          <div className="hubSearchBox">
            <Search size={15} className="hubSearchIcon" />
            <input
              type="text"
              placeholder="Scan / Search Order ID, Customer, Part..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search orders"
            />
            {searchQuery && (
              <button
                type="button"
                className="clearSearchBtn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Last Scanned Barcode Alert */}
      {lastScannedBarcode && (
        <div className="hubLastScannedBanner">
          <Barcode size={16} />
          <span>Last Barcode Input: <strong>{lastScannedBarcode}</strong></span>
          <button type="button" onClick={() => setLastScannedBarcode('')}>✕</button>
        </div>
      )}

      {/* Main Order Queue */}
      <main className="hubStationMain">
        {loading ? (
          <div className="hubEmptyState">
            <RefreshCw size={32} className="spin" />
            <p>Syncing orders with MotoDC database...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="hubEmptyState">
            <Package size={40} color="#64748b" />
            <h3>No orders in this queue</h3>
            <p>
              {searchQuery
                ? 'No packages match your search or barcode scan.'
                : activeTab === 'pending'
                ? 'All incoming orders have been packed & verified!'
                : 'No orders found in this section.'}
            </p>
          </div>
        ) : (
          <div className="hubOrderGrid">
            {filteredOrders.map((order) => {
              const st = String(order.orderStatus || 'placed').toLowerCase();
              const isPacked = st === 'packed';
              const isInTransit = ['shipped', 'out_for_delivery'].includes(st);
              const isUpdating = updatingId === order.id;
              const allChecked = (order.items || []).every(
                (_, idx) => checkedItems[`${order.id}_${idx}`]
              );

              return (
                <div
                  key={order.id}
                  className={`hubOrderCard ${isPacked ? 'packed' : ''} ${
                    isInTransit ? 'inTransit' : ''
                  }`}
                >
                  {/* Card Header */}
                  <div className="hubCardHeader">
                    <div className="hubCardHeaderLeft">
                      <div className="hubOrderIdBadge">
                        #{order.orderId || order.id}
                      </div>
                      <span className="hubPaymentTag">
                        {order.paymentMethod === 'cod' ? '💵 COD' : '💳 Prepaid (Paid)'}
                      </span>
                    </div>

                    {/* Staging Rack Badge */}
                    <div
                      className="hubRackBadge"
                      style={{
                        backgroundColor: order.corridorMeta.bgLight,
                        borderColor: order.corridorMeta.color,
                        color: order.corridorMeta.color,
                      }}
                    >
                      <MapPin size={12} />
                      <span>{order.corridorMeta.code} • {order.corridorMeta.name}</span>
                    </div>
                  </div>

                  {/* Assigned Rider Badge if dispatched */}
                  {order.assignedRiderName && (
                    <div className="hubAssignedRiderTag">
                      <Truck size={13} color="#38bdf8" />
                      <span>Rider Assigned: <strong>{order.assignedRiderName}</strong> {order.assignedRiderId ? `(${order.assignedRiderId})` : ''}</span>
                    </div>
                  )}

                  {/* Customer & Address Details */}
                  <div className="hubCustomerSection">
                    <div className="hubCustomerName">
                      {order.customer?.name || 'Customer'}
                    </div>
                    <div className="hubCustomerAddress">
                      {[
                        order.shipping?.address,
                        order.shipping?.city,
                        order.shipping?.pincode,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'Address on file'}
                    </div>
                    {order.customer?.phone && (
                      <div className="hubCustomerPhone">
                        Ph: {order.customer.phone}
                      </div>
                    )}
                  </div>

                  {/* Items Verification Checklist */}
                  <div className="hubChecklistSection">
                    <div className="hubChecklistHeader">
                      <span>PACKING CHECKLIST ({order.items?.length || 1})</span>
                      <small>Click to verify spare parts</small>
                    </div>

                    <div className="hubChecklistItems">
                      {(order.items || []).map((item, idx) => {
                        const checked = !!checkedItems[`${order.id}_${idx}`];
                        return (
                          <div
                            key={idx}
                            className={`hubCheckItem ${checked ? 'checked' : ''}`}
                            onClick={() => toggleItemCheck(order.id, idx)}
                          >
                            <span className="hubCheckbox">
                              {checked ? (
                                <CheckSquare size={16} color="#22c55e" />
                              ) : (
                                <Square size={16} color="#64748b" />
                              )}
                            </span>
                            <div className="hubItemDesc">
                              <span className="hubItemName">{item.name}</span>
                              <span className="hubItemMeta">
                                Qty: <strong>{item.qty || 1}</strong>
                                {item.variant ? ` • ${item.variant}` : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="hubCardFooter">
                    {/* Shipping Label Print Trigger */}
                    <button
                      type="button"
                      className="hubLabelBtn"
                      onClick={() => setLabelOrder(order)}
                    >
                      <Barcode size={15} />
                      <Printer size={15} />
                      <span>Print Label</span>
                    </button>

                    {/* Stage 2 Status Updater: Shows whenever order has NOT been packed at hub yet */}
                    {!isPacked && (
                      <button
                        type="button"
                        className={`hubVerifyBtn ${allChecked ? 'ready' : ''}`}
                        disabled={isUpdating}
                        onClick={() => handleMarkPackedAndVerified(order)}
                      >
                        <CheckCircle2 size={16} />
                        <span>
                          {isUpdating
                            ? 'Updating...'
                            : allChecked
                            ? 'Mark Packed & Quality Verified'
                            : 'Mark Packed'}
                        </span>
                      </button>
                    )}

                    {isPacked && (
                      <div className="hubStatusConfirmedBadge">
                        <CheckCircle2 size={16} />
                        <span>Packed • Staged in Rack {order.corridorMeta.code}</span>
                      </div>
                    )}

                    {isInTransit && (
                      <div className="hubStatusConfirmedBadge inTransit">
                        <Truck size={16} />
                        <span>In Transit • Courier Handover Verified</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onBarcodeDetected={handleBarcodeIdentified}
      />

      {/* Printable Shipping Label Modal */}
      {labelOrder && (
        <ShippingLabelModal
          order={labelOrder}
          onClose={() => setLabelOrder(null)}
          onMarkPacked={(o) => {
            handleMarkPackedAndVerified(o);
          }}
        />
      )}

    </div>
  );
}

