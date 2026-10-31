import React, { useState } from 'react';
import {
  X,
  Wallet,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Copy,
  Check,
  Share2,
  Plus,
  Minus,
  Sparkles,
  Award,
  PackageCheck,
  Send
} from 'lucide-react';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const DENOMINATIONS = [
  { value: 500, label: '₹500 Note' },
  { value: 200, label: '₹200 Note' },
  { value: 100, label: '₹100 Note' },
  { value: 50, label: '₹50 Note' },
  { value: 20, label: '₹20 Note' },
  { value: 10, label: '₹10 Note' },
  { value: 5, label: 'Coins (₹5 / ₹2 / ₹1)' }
];

export default function ShiftSettlementDrawer({
  isOpen,
  onClose,
  completedDeliveries = [],
  rider = null,
  onConfirmShiftDeposit
}) {
  const [counts, setCounts] = useState({
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0
  });

  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Financial aggregates
  const totalCashExpected = completedDeliveries.reduce(
    (sum, it) => sum + (it.isCod ? Number(it.total || 0) : 0),
    0
  );

  const totalUpiCollected = completedDeliveries.reduce(
    (sum, it) => sum + (it.paymentMode === 'upi_doorstep' ? Number(it.total || 0) : 0),
    0
  );

  const prepaidOrdersCount = completedDeliveries.filter(
    (it) => !it.isCod && it.paymentMode !== 'upi_doorstep'
  ).length;

  const totalDeliveryVolume = completedDeliveries.reduce(
    (sum, it) => sum + Number(it.total || 0),
    0
  );

  // Rider earnings calculation (₹45 per completed delivery + ₹100 bonus if 5+ deliveries)
  const deliveryCount = completedDeliveries.length;
  const baseEarnings = deliveryCount * 45;
  const performanceBonus = deliveryCount >= 5 ? 100 : 0;
  const totalRiderEarnings = baseEarnings + performanceBonus;

  // Physical cash counted by driver
  const totalCashCounted = DENOMINATIONS.reduce((sum, d) => {
    return sum + (Number(counts[d.value] || 0) * d.value);
  }, 0);

  const cashDiff = totalCashCounted - totalCashExpected;

  const updateCount = (denom, delta) => {
    setCounts((prev) => {
      const current = prev[denom] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [denom]: next };
    });
  };

  const handleInputChange = (denom, val) => {
    const cleanNum = parseInt(val.replace(/\D/g, '') || '0', 10);
    setCounts((prev) => ({
      ...prev,
      [denom]: Math.max(0, cleanNum)
    }));
  };

  const resetCounter = () => {
    setCounts({
      500: 0,
      200: 0,
      100: 0,
      50: 0,
      20: 0,
      10: 0,
      5: 0
    });
  };

  // Pre-generate WhatsApp & Clipboard Settlement Slip
  const buildSettlementSlip = () => {
    const riderName = rider?.name || 'MotoDC Delivery Partner';
    const riderId = rider?.riderId || 'MDC-R01';
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const timeStr = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const notesSummary = DENOMINATIONS
      .filter((d) => (counts[d.value] || 0) > 0)
      .map((d) => `  • ₹${d.value} × ${counts[d.value]} = ${money(d.value * counts[d.value])}`)
      .join('\n');

    let reconciliationStatus = 'PERFECTLY BALANCED (MATCHES SYSTEM)';
    if (cashDiff < 0) reconciliationStatus = `SHORTAGE: -${money(Math.abs(cashDiff))}`;
    if (cashDiff > 0) reconciliationStatus = `SURPLUS: +${money(cashDiff)}`;

    return `🏍️ *MOTODC PARTNER - SHIFT CASH SETTLEMENT*
━━━━━━━━━━━━━━━━━━━
👤 *Rider:* ${riderName} (${riderId})
📅 *Date:* ${dateStr} at ${timeStr}
📦 *Completed Deliveries:* ${deliveryCount}

📊 *FINANCIAL SUMMARY*
• Physical Cash in Hand (COD): ${money(totalCashExpected)}
• Doorstep UPI Settled: ${money(totalUpiCollected)}
• Prepaid Online Packages: ${prepaidOrdersCount}
• Total Order Value Handled: ${money(totalDeliveryVolume)}

💵 *PHYSICAL BANKNOTE BREAKDOWN*
${notesSummary || '  (No physical notes entered yet)'}
-----------------------------------
• Total Counted Cash: ${money(totalCashCounted)}
• Cash Reconciliation: *${reconciliationStatus}*

⭐ *ESTIMATED SHIFT EARNINGS*
• Delivery Incentives (${deliveryCount} × ₹45): ${money(baseEarnings)}
• High Performance Bonus: ${money(performanceBonus)}
• *Total Rider Payout:* ${money(totalRiderEarnings)}
━━━━━━━━━━━━━━━━━━━
_Generated via MotoDC Partner App v1.0.6_`;
  };

  const handleCopySummary = () => {
    try {
      const text = buildSettlementSlip();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (e) {
      console.warn('Clipboard error:', e);
    }
  };

  const handleShareWhatsApp = () => {
    const text = buildSettlementSlip();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCompleteDeposit = () => {
    if (totalCashExpected > 0 && totalCashCounted === 0) {
      if (!window.confirm(`You have ${money(totalCashExpected)} cash in hand to deposit. Confirm you handed this physical cash to the depot cashier?`)) {
        return;
      }
    } else if (cashDiff !== 0) {
      if (!window.confirm(`Warning: Counted cash (${money(totalCashCounted)}) does not match expected COD cash (${money(totalCashExpected)}). Proceed with deposit anyway?`)) {
        return;
      }
    } else {
      if (!window.confirm(`Confirm depositing ${money(totalCashExpected)} cash with the MotoDC Hub cashier? This will clear today's run sheet for your next shift.`)) {
        return;
      }
    }

    onConfirmShiftDeposit?.();
    onClose();
  };

  return (
    <div className="settlementDrawerOverlay" onClick={onClose}>
      <div className="settlementDrawerContent" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="settlementDrawerHeader">
          <div className="headerTitleBlock">
            <div className="titleBadge">
              <Wallet size={14} color="#f59e0b" />
              <span>Shift Reconciliation</span>
            </div>
            <h3>Cash Settlement HUD</h3>
            <p className="riderSubtitle">
              {rider?.name || 'Rider'} • {rider?.riderId || 'MDC-R01'}
            </p>
          </div>
          <button type="button" className="closeDrawerBtn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="settlementDrawerBody">
          {/* Shift Financial Overview Grid */}
          <div className="settlementStatsGrid">
            <div className="statCard cash">
              <div className="statLabel">Cash to Deposit</div>
              <div className="statValue">{money(totalCashExpected)}</div>
              <small>COD Physical Notes</small>
            </div>
            <div className="statCard upi">
              <div className="statLabel">UPI Settled</div>
              <div className="statValue">{money(totalUpiCollected)}</div>
              <small>Digital Doorstep</small>
            </div>
            <div className="statCard stops">
              <div className="statLabel">Drops Done</div>
              <div className="statValue">{deliveryCount}</div>
              <small>{prepaidOrdersCount} Prepaid</small>
            </div>
            <div className="statCard earnings">
              <div className="statLabel">Shift Earnings</div>
              <div className="statValue">{money(totalRiderEarnings)}</div>
              <small>₹45/drop + Bonus</small>
            </div>
          </div>

          {/* Interactive Denomination Counter */}
          <div className="denominationSection">
            <div className="denomHeader">
              <div>
                <h4>
                  <IndianRupee size={16} color="#f59e0b" />
                  Banknote Counter
                </h4>
                <p>Count your physical notes before meeting the cashier</p>
              </div>
              {totalCashCounted > 0 && (
                <button type="button" className="resetDenomBtn" onClick={resetCounter}>
                  <RotateCcw size={12} /> Reset
                </button>
              )}
            </div>

            <div className="denomList">
              {DENOMINATIONS.map((d) => {
                const count = counts[d.value] || 0;
                const subtotal = count * d.value;
                return (
                  <div className="denomRow" key={d.value}>
                    <div className="denomLabelBlock">
                      <span className="denomTitle">{d.label}</span>
                      <span className="denomSubtotal">{money(subtotal)}</span>
                    </div>

                    <div className="denomControls">
                      <button
                        type="button"
                        className="counterBtn"
                        onClick={() => updateCount(d.value, -1)}
                        disabled={count <= 0}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={count === 0 ? '' : count}
                        placeholder="0"
                        className="counterInput"
                        onChange={(e) => handleInputChange(d.value, e.target.value)}
                      />
                      <button
                        type="button"
                        className="counterBtn"
                        onClick={() => updateCount(d.value, 1)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reconciliation Balance Bar */}
            <div className="balanceBar">
              <div className="balanceSummary">
                <div>
                  <small>Counted Cash</small>
                  <strong>{money(totalCashCounted)}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <small>Expected COD</small>
                  <strong>{money(totalCashExpected)}</strong>
                </div>
              </div>

              {totalCashCounted === 0 && totalCashExpected > 0 ? (
                <div className="balanceStatus hint">
                  <span>💡 Enter your note counts above to verify against COD orders.</span>
                </div>
              ) : cashDiff === 0 ? (
                <div className="balanceStatus match">
                  <CheckCircle2 size={16} />
                  <span>
                    <b>Perfect Match!</b> Counted cash matches system records exactly ({money(totalCashCounted)}).
                  </span>
                </div>
              ) : cashDiff < 0 ? (
                <div className="balanceStatus shortage">
                  <AlertTriangle size={16} />
                  <span>
                    <b>Cash Shortage:</b> You are short by <b>{money(Math.abs(cashDiff))}</b>. Check your pocket or bag.
                  </span>
                </div>
              ) : (
                <div className="balanceStatus surplus">
                  <Sparkles size={16} />
                  <span>
                    <b>Surplus Cash:</b> You have <b>+{money(cashDiff)}</b> extra cash in hand.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Rider Payout Summary Box */}
          <div className="earningsCard">
            <div className="earningsHeader">
              <div className="earningsBadge">
                <Award size={15} color="#22c55e" />
                <span>Today's Payout Estimate</span>
              </div>
              <div className="earningsTotal">{money(totalRiderEarnings)}</div>
            </div>
            <div className="earningsBreakdown">
              <div className="breakdownRow">
                <span>Completed Deliveries ({deliveryCount} × ₹45)</span>
                <b>{money(baseEarnings)}</b>
              </div>
              {performanceBonus > 0 && (
                <div className="breakdownRow bonus">
                  <span>Target Achiever Bonus (5+ Drops)</span>
                  <b>+{money(performanceBonus)}</b>
                </div>
              )}
              <div className="breakdownRow muted">
                <span>Disbursal Schedule</span>
                <span>Direct Bank Transfer • Friday</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="drawerActionStack">
            <div className="shareActionsRow">
              <button
                type="button"
                className="shareBtn copy"
                onClick={handleCopySummary}
              >
                {copied ? <Check size={16} color="#22c55e" /> : <Copy size={16} />}
                {copied ? 'Copied Slip!' : 'Copy Summary Slip'}
              </button>
              <button
                type="button"
                className="shareBtn whatsapp"
                onClick={handleShareWhatsApp}
              >
                <Send size={16} />
                Send to Hub (WhatsApp)
              </button>
            </div>

            <button
              type="button"
              className="endShiftDepositBtn"
              onClick={handleCompleteDeposit}
            >
              <PackageCheck size={18} />
              Confirm Cash Deposited & End Shift
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
