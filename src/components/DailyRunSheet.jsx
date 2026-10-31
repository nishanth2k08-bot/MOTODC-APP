import React, { useState, useEffect } from 'react';
import {
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
  Coins
} from 'lucide-react';
import ShiftSettlementDrawer from './ShiftSettlementDrawer';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function DailyRunSheet({ completedDeliveries, onClearRunSheet, onSelectStopForDelivery, rider }) {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'completed'
  const [pendingStops, setPendingStops] = useState([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);

  // Fetch pending stops from live backend
  const fetchPendingStops = async () => {
    setLoadingStops(true);
    try {
      const res = await fetch('https://motodc-official.vercel.app/api/delivery-partner?action=active-deliveries');
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.stops)) {
        // Exclude deliveries already completed in this shift
        const completedIds = new Set(completedDeliveries.map((c) => String(c.orderId || c.id)));
        const uncompleted = data.stops.filter((s) => !completedIds.has(String(s.orderId || s.id)));
        setPendingStops(uncompleted);
      }
    } catch (err) {
      console.warn('Error fetching pending stops:', err);
    } finally {
      setLoadingStops(false);
    }
  };

  useEffect(() => {
    fetchPendingStops();
  }, [completedDeliveries]);

  const totalCashCollected = completedDeliveries.reduce((sum, item) => {
    return sum + (item.isCod ? Number(item.total || 0) : 0);
  }, 0);

  const totalUpiCollected = completedDeliveries.reduce((sum, item) => {
    return sum + (item.paymentMode === 'upi_doorstep' ? Number(item.total || 0) : 0);
  }, 0);

  // 1-Tap Google Maps Turn-by-Turn Navigation
  const handleOpenGoogleMaps = (shipping) => {
    const addressParts = [shipping?.address, shipping?.city, shipping?.state, shipping?.pincode]
      .filter(Boolean)
      .join(', ');
    const destination = encodeURIComponent(addressParts || 'Karaikal, Puducherry');
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}`, '_system');
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
            <div className="emptyState" style={{ padding: '30px 16px' }}>
              <CheckCircle2 size={40} color="#22c55e" style={{ margin: '0 auto 8px' }} />
              <h4 style={{ color: '#fff', margin: '0 0 4px', fontSize: '14px' }}>All Deliveries Complete!</h4>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                No pending parcels left in your shift queue. Great work!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingStops.map((stop, index) => {
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
                        {isCod ? `COLLECT COD: ${money(stop.total)}` : 'PAID ONLINE'}
                      </span>
                    </div>

                    {/* Customer & Address Details */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '13px' }}>
                        {stop.customer?.name || 'Customer'}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '2px', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                        <MapPin size={13} style={{ flexShrink: 0, marginTop: '2px', color: '#ff3157' }} />
                        <span>{fullAddress || 'Address on file'}</span>
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
                        onClick={() => handleOpenGoogleMaps(stop.shipping)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          background: 'rgba(56,189,248,0.12)',
                          border: '1px solid rgba(56,189,248,0.35)',
                          color: '#38bdf8',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        <Navigation size={13} /> Maps
                      </button>

                      {/* 2. WhatsApp "Arriving in 5 Mins" Alert */}
                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppAlert(stop)}
                        style={{
                          padding: '8px 4px',
                          borderRadius: '8px',
                          background: 'rgba(34,197,94,0.12)',
                          border: '1px solid rgba(34,197,94,0.35)',
                          color: '#22c55e',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          cursor: 'pointer',
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

                    {/* Doorstep Verification Button */}
                    <button
                      type="button"
                      onClick={() => onSelectStopForDelivery?.(stop)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '9px',
                        background: 'linear-gradient(135deg, #ff3157, #e11d48)',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontFamily: 'Sora, sans-serif',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(255,49,87,0.35)',
                      }}
                    >
                      <QrCode size={14} /> Doorstep Handover & Verify
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
                    <span className="runSheetTime">{it.time || 'Delivered'}</span>
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
