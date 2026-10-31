import React from 'react';
import { Package, IndianRupee, Trash2, CheckCircle2 } from 'lucide-react';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function DailyRunSheet({ completedDeliveries, onClearRunSheet }) {
  const totalCashCollected = completedDeliveries.reduce((sum, item) => {
    return sum + (item.isCod ? Number(item.total || 0) : 0);
  }, 0);

  return (
    <div className="runSheetSection">
      {/* Tally Banner */}
      <div className="summaryBar" style={{ marginBottom: '16px' }}>
        <div className="summaryItem">
          <div className="summaryIcon" style={{ color: '#22c55e' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <small>Delivered Today</small>
            <strong>{completedDeliveries.length}</strong>
          </div>
        </div>
        <div className="summaryItem">
          <div className="summaryIcon" style={{ color: '#f59e0b' }}>
            <IndianRupee size={20} />
          </div>
          <div>
            <small>Cash Collected</small>
            <strong>{money(totalCashCollected)}</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Today's Run Sheet
        </h3>
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
            <Trash2 size={12} /> Clear Shift History
          </button>
        )}
      </div>

      {!completedDeliveries.length ? (
        <div className="emptyState">
          <Package size={44} color="#334155" style={{ margin: '0 auto' }} />
          <p>No deliveries completed in this shift yet.</p>
          <small style={{ color: '#64748b' }}>Scanned and handed over orders will appear here.</small>
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
                <span className={`runSheetAmount ${it.isCod ? 'cod' : 'prepaid'}`}>
                  {it.isCod ? `COD: ${money(it.total)}` : 'PREPAID'}
                </span>
                <span className="runSheetTime">{it.time || 'Delivered'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
