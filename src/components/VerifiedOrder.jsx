import React, { useState } from 'react';
import {
  CheckCircle2,
  Phone,
  MapPin,
  ShieldCheck,
  RotateCcw,
  PackageCheck,
  AlertTriangle
} from 'lucide-react';
import { verifyDeliveryPin } from '../deliveryPinUtil';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function VerifiedOrder({ order, onCancel, onConfirmDelivery, submitting }) {
  const [pinInput, setPinInput] = useState('');
  const [codCollected, setCodCollected] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isCod = String(order.paymentMethod || '').toLowerCase() === 'cod';

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (isCod && !codCollected) {
      setErrorMsg(`Please confirm that you have collected ${money(order.total)} cash.`);
      return;
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
    onConfirmDelivery(order);
  };

  return (
    <div className="orderVerifiedCard">
      <div className="orderVerifiedHeader">
        <div>
          <h3>
            <CheckCircle2 size={18} color="#22c55e" />
            Package Verified & Grounded
          </h3>
          <div className="orderVerifiedId">Order #{order.orderId || order.id}</div>
        </div>
        <button type="button" className="cancelScanBtn" onClick={onCancel}>
          <RotateCcw size={12} style={{ display: 'inline', marginRight: '4px' }} />
          Cancel Scan
        </button>
      </div>

      {/* Payment Banner */}
      {isCod ? (
        <div className="paymentNotice cod">
          <div>
            <b>⚠ CASH ON DELIVERY (COD)</b>
            <small>Collect cash from customer before handing over package</small>
          </div>
          <div className="amountHighlight">{money(order.total)}</div>
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

        {/* COD Confirmation Checkbox */}
        {isCod && (
          <label className="codCheckboxLabel">
            <input
              type="checkbox"
              checked={codCollected}
              onChange={(e) => setCodCollected(e.target.checked)}
            />
            <span>I confirm I have received <b>{money(order.total)}</b> cash from customer</span>
          </label>
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
