import React, { useState } from 'react';
import {
  CheckCircle2,
  Phone,
  MapPin,
  ShieldCheck,
  RotateCcw,
  PackageCheck,
  AlertTriangle,
  QrCode,
  Banknote,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  WifiOff
} from 'lucide-react';
import { verifyDeliveryPin } from '../deliveryPinUtil';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function VerifiedOrder({ order, onCancel, onConfirmDelivery, submitting, isOnline = true }) {
  const [pinInput, setPinInput] = useState('');
  const [paymentChoice, setPaymentChoice] = useState('cash'); // 'cash' | 'upi'
  const [codCollected, setCodCollected] = useState(false);
  const [upiConfirmed, setUpiConfirmed] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [qrImgError, setQrImgError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isCod = String(order.paymentMethod || '').toLowerCase() === 'cod';
  const orderIdClean = order.orderId || order.id || 'ORDER';
  const upiId = 'motodc@upi';
  const orderAmount = Number(order.total || 0);

  // Dynamic NPCI Standard UPI Intent URI
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('MotoDC Automotive')}&am=${orderAmount}&tr=${encodeURIComponent(orderIdClean)}&tn=${encodeURIComponent(`MotoDC Order ${orderIdClean}`)}&cu=INR`;
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiUrl)}&margin=10`;

  const handleCopyUpi = () => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(upiId);
      }
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2200);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const handleOpenUpiApp = () => {
    window.open(upiUrl, '_system');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (isCod) {
      if (paymentChoice === 'cash' && !codCollected) {
        setErrorMsg(`Please confirm that you have collected ${money(order.total)} cash.`);
        return;
      }
      if (paymentChoice === 'upi' && !upiConfirmed) {
        setErrorMsg(`Please verify that the customer has completed the ${money(order.total)} UPI payment.`);
        return;
      }
    }

    if (!pinInput || pinInput.length !== 4) {
      setErrorMsg("Please enter the customer's 4-digit handover PIN.");
      return;
    }

    const isValid = verifyDeliveryPin(order, pinInput);
    if (!isValid) {
      setErrorMsg('Incorrect PIN! Please ask the customer to check their MotoDC Orders page.');
      if (navigator.vibrate) {
        navigator.vibrate([150, 80, 150]);
      }
      return;
    }

    // PIN is valid!
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 150, 50, 200]);
    }

    const finalPaymentMode = isCod ? (paymentChoice === 'upi' ? 'upi_doorstep' : 'cash') : 'prepaid';
    onConfirmDelivery(order, finalPaymentMode);
  };

  return (
    <div className="orderVerifiedCard">
      <div className="orderVerifiedHeader">
        <div>
          <h3>
            <CheckCircle2 size={18} color="#22c55e" />
            Package Verified & Grounded
          </h3>
          <div className="orderVerifiedId">Order #{orderIdClean}</div>
        </div>
        <button type="button" className="cancelScanBtn" onClick={onCancel}>
          <RotateCcw size={12} style={{ display: 'inline', marginRight: '4px' }} />
          Cancel Scan
        </button>
      </div>

      {/* Offline Mode / Basement Alert */}
      {!isOnline && (
        <div className="offlineHandoverNotice">
          <WifiOff size={15} color="#f59e0b" style={{ flexShrink: 0 }} />
          <div>
            <b>Apartment Basement / Offline Mode Active</b>
            <small>Security PIN verification works 100% offline. Handover will be recorded locally and auto-synced when you ride back into range.</small>
          </div>
        </div>
      )}

      {/* Payment Banner / Mode Selection */}
      {isCod ? (
        <div className="paymentChoiceBox">
          <div className="paymentModeTabs">
            <button
              type="button"
              className={`modeTabBtn ${paymentChoice === 'cash' ? 'active cash' : ''}`}
              onClick={() => {
                setPaymentChoice('cash');
                setErrorMsg('');
              }}
            >
              <Banknote size={15} /> Cash Payment
            </button>
            <button
              type="button"
              className={`modeTabBtn ${paymentChoice === 'upi' ? 'active upi' : ''}`}
              onClick={() => {
                setPaymentChoice('upi');
                setErrorMsg('');
              }}
            >
              <QrCode size={15} /> Dynamic UPI QR <span className="tabBadge">No Change</span>
            </button>
          </div>

          {paymentChoice === 'cash' ? (
            <div className="paymentNotice cod">
              <div>
                <b>⚠ CASH ON DELIVERY (COD)</b>
                <small>Collect cash from customer before handing over package</small>
              </div>
              <div className="amountHighlight">{money(order.total)}</div>
            </div>
          ) : (
            <div className="upiQrContainer">
              <div className="upiQrHeader">
                <div>
                  <span className="upiHeaderBadge">
                    <Sparkles size={11} /> Instant Doorstep Scan
                  </span>
                  <h4>Doorstep Dynamic UPI QR</h4>
                  <p>Customer scans with any UPI app — exact amount preloaded</p>
                </div>
                <div className="upiAmountLarge">{money(order.total)}</div>
              </div>

              {/* QR Image Frame */}
              <div className="upiQrFrame">
                <div className="qrWhiteBg">
                  {qrImgError || !isOnline ? (
                    <div className="offlineQrPlaceholder">
                      <QrCode size={48} color="#a855f7" />
                      <div className="offlineQrText">
                        <b>Offline Mode QR</b>
                        <small>Scan via UPI or enter ID below</small>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={qrImgSrc}
                      alt={`UPI QR for ${money(order.total)}`}
                      className="upiQrImage"
                      onError={() => setQrImgError(true)}
                    />
                  )}
                </div>
                <div className="upiQrInstruction">
                  Exact amount of <b>{money(order.total)}</b> locked in QR
                </div>
              </div>

              {/* Supported Apps Strip */}
              <div className="upiAppsList">
                <span className="upiAppTag gpay">GPay</span>
                <span className="upiAppTag phonepe">PhonePe</span>
                <span className="upiAppTag paytm">Paytm</span>
                <span className="upiAppTag bhim">BHIM</span>
                <span className="upiAppTag cred">Cred</span>
                <span className="upiAppTag any">Any UPI App</span>
              </div>

              {/* UPI ID & Direct Actions */}
              <div className="upiActionRow">
                <div className="upiIdPill">
                  <span>UPI ID:</span>
                  <b>{upiId}</b>
                  <button type="button" onClick={handleCopyUpi} className="copyUpiBtn">
                    {copiedUpi ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                    {copiedUpi ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleOpenUpiApp}
                  className="openUpiBtn"
                  title="Open in UPI App on this device"
                >
                  <ExternalLink size={13} /> Open App
                </button>
              </div>

              {/* Driver Confirmation State */}
              <div className="upiConfirmBox">
                {upiConfirmed ? (
                  <div className="upiVerifiedBadge">
                    <CheckCircle2 size={18} color="#22c55e" />
                    <div>
                      <strong>UPI Payment Confirmed</strong>
                      <small>{money(order.total)} verified on customer screen</small>
                    </div>
                    <button
                      type="button"
                      className="upiChangeBtn"
                      onClick={() => setUpiConfirmed(false)}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="upiMarkReceivedBtn"
                    onClick={() => {
                      setUpiConfirmed(true);
                      setErrorMsg('');
                      if (navigator.vibrate) navigator.vibrate(80);
                    }}
                  >
                    <CheckCircle2 size={16} /> I Verified Customer Paid {money(order.total)} via UPI
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="paymentNotice prepaid">
          <div>
            <b>✓ PREPAID ORDER (PAID ONLINE)</b>
            <small>Payment fully settled via Razorpay. Collect ₹0.</small>
          </div>
          <div className="amountHighlight">₹0 TO COLLECT</div>
        </div>
      )}

      {/* Deliver To Customer Card */}
      <div className="customerSection">
        <h4>Deliver To:</h4>
        <div className="customerName">{order.customer?.name || 'Customer'}</div>
        <div className="addressText">
          <MapPin size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
          {order.shipping?.address || 'Doorstep Address'}, {order.shipping?.city || ''},{' '}
          {order.shipping?.state || ''} - {order.shipping?.pincode || ''}
        </div>

        <div className="actionRow">
          {order.customer?.phone && (
            <a href={`tel:${order.customer.phone}`} className="actionBtn">
              <Phone size={14} color="#22c55e" /> Call Customer
            </a>
          )}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${order.shipping?.address || ''} ${order.shipping?.city || ''} ${order.shipping?.pincode || ''}`
            )}`}
            target="_blank"
            rel="noreferrer"
            className="actionBtn"
          >
            <MapPin size={14} color="#ff3157" /> Open in Maps
          </a>
        </div>
      </div>

      {/* Package Contents */}
      <div className="itemsSection">
        <h4>Package Contents ({order.items?.length || 0} items):</h4>
        {(order.items || []).map((it, idx) => (
          <div className="itemRow" key={idx}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              {it.image && (
                <img
                  src={it.image}
                  alt=""
                  className="itemThumbnail"
                />
              )}
              <span className="itemName">{it.name || 'Automotive Part'}</span>
            </div>
            <span className="itemQty">Qty {it.qty || 1}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Handover PIN Box */}
        <div className="pinBox">
          <h4>
            <ShieldCheck size={18} color="#ff3157" />
            Customer Handover PIN
          </h4>
          <p>Ask the customer for their 4-digit Security PIN (shown on their MotoDC Orders screen)</p>

          <div className="pinInputsWrap">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="••••"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={{
                width: '180px',
                height: '52px',
                fontSize: '28px',
                fontWeight: '900',
                letterSpacing: '14px',
                textAlign: 'center',
                background: '#070a10',
                border: '2px solid #2b3950',
                borderRadius: '10px',
                color: '#fff',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* COD Confirmation Checkbox (Only if Cash mode selected) */}
        {isCod && paymentChoice === 'cash' && (
          <div style={{ marginBottom: '14px' }}>
            <label className="codCheckboxLabel">
              <input
                type="checkbox"
                checked={codCollected}
                onChange={(e) => setCodCollected(e.target.checked)}
              />
              <span>I confirm I have received <b>{money(order.total)}</b> cash from customer</span>
            </label>
            <button
              type="button"
              onClick={() => setPaymentChoice('upi')}
              style={{
                marginTop: '8px',
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '11px',
                fontWeight: 700,
                textAlign: 'center',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <QrCode size={13} /> Customer has no cash change? Tap to switch to UPI QR code →
            </button>
          </div>
        )}

        {errorMsg && (
          <div style={{ color: '#ef4444', fontSize: '12px', fontWeight: '700', marginBottom: '12px', textAlign: 'center' }}>
            <AlertTriangle size={14} style={{ display: 'inline', marginRight: '4px' }} />
            {errorMsg}
          </div>
        )}

        <button type="submit" className="completeDeliveryBtn" disabled={submitting}>
          <PackageCheck size={18} />
          {submitting ? 'Confirming Delivery...' : 'Confirm Doorstep Handover'}
        </button>
      </form>
    </div>
  );
}
