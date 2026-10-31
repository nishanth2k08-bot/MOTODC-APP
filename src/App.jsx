import React, { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { toast, Toaster } from 'react-hot-toast';
import {
  Truck,
  Camera,
  ClipboardList,
  CheckCircle2,
  PackageCheck,
  IndianRupee,
  ShieldCheck
} from 'lucide-react';
import Scanner from './components/Scanner';
import VerifiedOrder from './components/VerifiedOrder';
import DailyRunSheet from './components/DailyRunSheet';
import InstallPrompt from './components/InstallPrompt';

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

export default function App() {
  const [activeTab, setActiveTab] = useState('scanner'); // 'scanner' | 'runsheet'
  const [shiftActive, setShiftActive] = useState(true);
  const [verifiedOrder, setVerifiedOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deliveredSuccess, setDeliveredSuccess] = useState(null);

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

  // Lookup order in Firestore by scanned text / typed ID
  const handleOrderScanned = async (queryText) => {
    if (!queryText || loadingOrder) return;
    const clean = String(queryText).trim();
    if (!clean) return;

    setLoadingOrder(true);
    setVerifiedOrder(null);
    setDeliveredSuccess(null);

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
        toast.success(`Found order #${match.orderId || match.id}`);
        setVerifiedOrder(match);
      }
    } catch (err) {
      console.error('Order lookup error:', err);
      toast.error('Could not verify barcode. Check internet connection.');
    } finally {
      setLoadingOrder(false);
    }
  };

  // Confirm Handover and mark order Delivered in Firebase
  const handleConfirmDelivery = async (order) => {
    setSubmitting(true);
    try {
      const isCod = String(order.paymentMethod || '').toLowerCase() === 'cod';
      const orderRef = doc(db, 'orders', order.collectionType, 'records', order.id);

      const updates = {
        orderStatus: 'delivered',
        deliveredAt: Timestamp.now(),
        history: arrayUnion({
          status: 'delivered',
          timestamp: new Date().toISOString(),
          note: 'Doorstep barcode & customer PIN verified via MotoDC Partner App',
        }),
      };

      if (isCod) {
        updates.paymentStatus = 'paid';
      }

      await updateDoc(orderRef, updates);

      // Add to today's run sheet
      const newEntry = {
        id: order.id,
        orderId: order.orderId || order.id,
        customerName: order.customer?.name || 'Customer',
        total: order.total || 0,
        isCod,
        itemsCount: (order.items || []).length,
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      };

      setRunSheet((prev) => [newEntry, ...prev]);
      setDeliveredSuccess(order);
      setVerifiedOrder(null);
      toast.success('Delivery successfully logged & verified!');
    } catch (err) {
      console.error('Delivery update error:', err);
      toast.error('Could not update status in database. Check internet connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextScan = () => {
    setDeliveredSuccess(null);
    setVerifiedOrder(null);
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

  return (
    <div className="appWrapper">
      <Toaster position="top-center" toastOptions={{ duration: 3000 }} />

      {/* Top Header */}
      <header className="appHeader">
        <div className="brand">
          <Truck size={22} color="#ff3157" />
          <b>Moto<span>DC</span> Partner</b>
        </div>
        <button
          type="button"
          className={`shiftBadge ${shiftActive ? 'active' : 'inactive'}`}
          onClick={() => setShiftActive(!shiftActive)}
          title="Toggle Shift Status"
        >
          <span className="shiftDot" />
          {shiftActive ? 'Shift Active' : 'Shift Off'}
        </button>
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
            {!verifiedOrder && !deliveredSuccess && (
              <Scanner onOrderScanned={handleOrderScanned} loading={loadingOrder} />
            )}

            {/* 2. Order Verified Screen */}
            {verifiedOrder && (
              <VerifiedOrder
                order={verifiedOrder}
                onCancel={() => setVerifiedOrder(null)}
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
                  Order <b>#{deliveredSuccess.orderId || deliveredSuccess.id}</b> marked as delivered.
                </p>
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
            onClearRunSheet={handleClearRunSheet}
          />
        )}
      </main>

      {/* PWA 1-Tap Install Prompt */}
      <InstallPrompt />
    </div>
  );
}
