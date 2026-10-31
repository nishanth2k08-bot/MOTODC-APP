import React, { useState } from 'react';
import {
  CheckCircle2,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  QrCode,
  Banknote,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  WifiOff,
  Boxes,
  Trash2,
  Phone,
  MapPin
} from 'lucide-react';
import { verifyDeliveryPin } from '../deliveryPinUtil';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function BatchVerifiedOrder({
  orders = [],
  onCancel,
  onRemoveOrder,
  onConfirmBatchDelivery,
  submitting,
  isOnline = true
}) {
  const [pinInput, setPinInput] = useState('');
  const [paymentChoice, setPaymentChoice] = useState('cash'); // 'cash' | 'upi'
  const [codCollected, setCodCollected] = useState(false);
  const [upiConfirmed, setUpiConfirmed] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [qrImgError, setQrImgError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!orders || orders.length === 0) {
    return (
      <div className="orderVerifiedCard">
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
          No parcels in batch tray. Scan parcels to continue.
        </p>
        <button type="button" className="cancelScanBtn" onClick={onCancel}>
          Back to Scanner
        </button>
      </div>
    );
  }

  // Financial aggregates across all parcels in batch
  const codOrders = orders.filter((o) => String(o.paymentMethod || '').toLowerCase() === 'cod');
  const hasCod = codOrders.length > 0;
  const totalCodAmount = codOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const totalVolume = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);

  // Common customer & address (using first order as representative)
  const primaryOrder = orders[0];
  const customerName = primaryOrder.customer?.name || 'Customer / Garage';
  const customerPhone = primaryOrder.customer?.phone || '';
  const shippingAddress = primaryOrder.shipping?.address || 'Doorstep Delivery';
  const shippingCity = primaryOrder.shipping?.city || '';

  // Dynamic NPCI Standard UPI Intent URI for Combined Batch Total
  const upiId = 'motodc@upi';
  const batchRef = `BATCH_${orders.map((o) => String(o.orderId || o.id).slice(-4)).join('_')}`;
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('MotoDC Automotive')}&am=${totalCodAmount}&tr=${encodeURIComponent(batchRef)}&tn=${encodeURIComponent(`MotoDC Batch (${orders.length} Parcels)`)}&cu=INR`;
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiUrl)}&margin=10`;

  const handleCopyUpi = () => {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(upiId);
      }
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2200);
    } catch (e) {
      console.warn('Copy error:', e);
    }
  };

  const handleOpenUpiApp = () => {
    window.open(upiUrl, '_system');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (hasCod) {
      if (paymentChoice === 'cash' && !codCollected) {
        setErrorMsg(`Please confirm that you have collected ${money(totalCodAmount)} cash for this batch.`);
        return;
      }
      if (paymentChoice === 'upi' && !upiConfirmed) {
        setErrorMsg(`Please verify customer has completed the ${money(totalCodAmount)} UPI payment.`);
        return;
      }
    }

    if (!pinInput || pinInput.length !== 4) {
      setErrorMsg("Please enter the customer's 4-digit handover PIN.");
      return;
    }

    // Verify PIN against any order in the batch (they usually share the same customer phone)
    const isValid = orders.some((ord) => verifyDeliveryPin(ord, pinInput));
    if (!isValid) {
      setErrorMsg('Incorrect PIN! Please ask customer for the PIN on their MotoDC Orders page.');
      if (navigator.vibrate) {
        navigator.vibrate([150, 80, 150]);
      }
      return;
    }

    // PIN is valid!
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 150, 50, 200]);
    }

    const finalPaymentMode = hasCod
      ? paymentChoice === 'upi'
        ? 'upi_doorstep'
        : 'cash'
      : 'prepaid';

    onConfirmBatchDelivery(orders, finalPaymentMode);
  };

  return (
    <div className="orderVerifiedCard">
      {/* Batch Header */}
      <div className="orderVerifiedHeader">
        <div>
          <div className="batchHeroBadge">
            <Boxes size={14} color="#38bdf8" />
            <span>Multi-Parcel Batch Handover</span>
          </div>
          <h3 style={{ marginTop: '4px' }}>
            <CheckCircle2 size={18} color="#22c55e" />
            {orders.length} Parcels Grounded & Ready
          </h3>
          <div className="orderVerifiedId">
            Deliver To: <b>{customerName}</b>
          </div>
        </div>
        <button type="button" className="cancelScanBtn" onClick={onCancel}>
          <RotateCcw size={12} style={{ display: 'inline', marginRight: '4px' }} />
          Edit Batch
        </button>
      </div>

      {/* Offline Mode / Basement Alert */}
      {!isOnline && (
        <div className="offlineHandoverNotice">
          <WifiOff size={15} color="#f59e0b" style={{ flexShrink: 0 }} />
          <div>
            <b>Apartment Basement / Offline Mode Active</b>
            <small>Security PIN verification works 100% offline. Batch will be recorded locally and auto-synced.</small>
          </div>
        </div>
      )}

      {/* Combined Payment Section */}
      {hasCod ? (
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
              <Banknote size={15} /> Collect Cash ({money(totalCodAmount)})
            </button>
            <button
              type="button"
              className={`modeTabBtn ${paymentChoice === 'upi' ? 'active upi' : ''}`}
              onClick={() => {
                setPaymentChoice('upi');
                setErrorMsg('');
              }}
            >
              <QrCode size={15} /> Combined UPI QR <span className="tabBadge">Exact</span>
            </button>
          </div>

          {paymentChoice === 'cash' ? (
            <div className="paymentNotice cod">
              <div>
                <b>⚠ COLLECT COD CASH FOR {codOrders.length} PARCEL{codOrders.length > 1 ? 'S' : ''}</b>
                <small>Combined total for all COD orders in this consignment</small>
              </div>
              <div className="amountHighlight">{money(totalCodAmount)}</div>
            </div>
          ) : (
            <div className="upiQrContainer">
              <div className="upiQrHeader">
                <div>
                  <span className="upiHeaderBadge">
                    <Sparkles size={11} /> Combined Batch QR
                  </span>
                  <h4>Doorstep Dynamic UPI QR</h4>
                  <p>Customer scans once to pay for all {orders.length} parcels</p>
                </div>
                <div className="upiAmountLarge">{money(totalCodAmount)}</div>
              </div>

              {/* QR Image Frame */}
              <div className="upiQrFrame">
                <div className="qrWhiteBg">
                  {qrImgError || !isOnline ? (
                    <div className="offlineQrPlaceholder">
                      <QrCode size={48} color="#a855f7" />
                      <div className="offlineQrText">
                        <b>Offline Batch UPI</b>
                        <small>Scan via UPI or enter ID below</small>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={qrImgSrc}
                      alt={`Combined UPI QR for ${money(totalCodAmount)}`}
                      className="upiQrImage"
                      onError={() => setQrImgError(true)}
                    />
                  )}
                </div>
                <div className="upiQrInstruction">
                  Exact combined total of <b>{money(totalCodAmount)}</b> locked in QR
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
                      <strong>Combined UPI Payment Confirmed</strong>
                      <small>{money(totalCodAmount)} verified on customer screen</small>
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
                    <CheckCircle2 size={16} /> I Verified Customer Paid {money(totalCodAmount)} via UPI
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="paymentNotice prepaid">
          <div>
            <b>✓ ALL {orders.length} PARCELS PREPAID ONLINE</b>
            <small>All items fully settled online. Collect ₹0 from customer.</small>
          </div>
          <div className="amountHighlight">₹0 TO COLLECT</div>
        </div>
      )}

      {/* Deliver To Customer Card */}
      <div className="customerSection">
        <h4>Batch Destination:</h4>
        <div className="customerName">{customerName}</div>
        <div className="addressText">
          <MapPin size={13} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
          {shippingAddress}, {shippingCity}
        </div>

        <div className="actionRow">
          {customerPhone && (
            <a href={`tel:${customerPhone}`} className="actionBtn">
              <Phone size={14} color="#22c55e" /> Call Customer
            </a>
          )}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${shippingAddress} ${shippingCity}`
            )}`}
            target="_blank"
            rel="noreferrer"
            className="actionBtn"
          >
            <MapPin size={14} color="#ff3157" /> Open in Maps
          </a>
        </div>
      </div>

      {/* Batch Parcels List Accordion */}
      <div className="batchParcelsListSection">
        <div className="batchListHeader">
          <h4>Consignment Parcels ({orders.length} Boxes):</h4>
          <span className="batchVolumeTag">Total: {money(totalVolume)}</span>
        </div>

        <div className="batchParcelCardsWrap">
          {orders.map((ord, idx) => {
            const isOrderCod = String(ord.paymentMethod || '').toLowerCase() === 'cod';
            return (
              <div className="batchParcelCard" key={idx}>
                <div className="batchCardTop">
                  <div className="batchCardIndex">#{idx + 1}</div>
                  <div className="batchCardOrderInfo">
                    <b>Order #{ord.orderId || ord.id}</b>
                    <small>
                      {ord.items?.length || 1} item(s) •{' '}
                      <span style={{ color: isOrderCod ? '#fbbf24' : '#22c55e' }}>
                        {isOrderCod ? `COD: ${money(ord.total)}` : 'Prepaid'}
                      </span>
                    </small>
                  </div>
                  {orders.length > 1 && (
                    <button
                      type="button"
                      className="removeParcelFromBatchBtn"
                      onClick={() => onRemoveOrder(ord.orderId || ord.id)}
                      title="Remove from batch"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <div className="batchItemsRow">
                  {(ord.items || []).map((it, itemIdx) => (
                    <div className="batchItemChip" key={itemIdx}>
                      {it.image && <img src={it.image} alt="" className="itemThumbnailMini" />}
                      <span>{it.name || 'Part'}</span>
                      <small>x{it.qty || 1}</small>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Handover PIN Form */}
      <form onSubmit={handleSubmit}>
        <div className="pinBox">
          <h4>
            <ShieldCheck size={18} color="#ff3157" />
            1-Tap Customer Handover PIN
          </h4>
          <p>
            Enter customer's 4-digit PIN <b>once</b> to confirm all <b>{orders.length} parcels</b> in this batch!
          </p>

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

        {/* COD Confirmation Checkbox for Batch */}
        {hasCod && paymentChoice === 'cash' && (
          <div style={{ marginBottom: '14px' }}>
            <label className="codCheckboxLabel">
              <input
                type="checkbox"
                checked={codCollected}
                onChange={(e) => setCodCollected(e.target.checked)}
              />
              <span>
                I confirm I received combined cash of <b>{money(totalCodAmount)}</b> from customer
              </span>
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
              <QrCode size={13} /> Customer wants to pay combined total via UPI QR? Tap here →
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
          {submitting ? 'Confirming Batch...' : `Confirm Batch Handover (${orders.length} Parcels)`}
        </button>
      </form>
    </div>
  );
}
