import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  RefreshCw,
  Search,
  AlertCircle,
  Boxes,
  Trash2,
  PackageCheck
} from 'lucide-react';

export default function Scanner({
  onOrderScanned,
  loading,
  isBatchMode = false,
  onToggleBatchMode,
  batchOrders = [],
  onRemoveFromBatch,
  onProceedBatch
}) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [manualId, setManualId] = useState('');
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ text: '', time: 0 });

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('reader', {
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 20,
          qrbox: { width: 280, height: 180 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (!decodedText) return;
          const now = Date.now();
          // Prevent repeated triggers of the same barcode within 3 seconds
          if (
            decodedText === lastScanRef.current.text &&
            now - lastScanRef.current.time < 3000
          ) {
            return;
          }
          lastScanRef.current = { text: decodedText, time: now };

          // If in single mode, pause scanner immediately
          if (!isBatchMode) {
            try {
              if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.pause(true);
              }
            } catch (_) {}
          } else {
            // In batch mode, brief pause to give scan feedback, then auto-resume
            try {
              if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.pause(true);
                setTimeout(() => {
                  try {
                    if (scannerRef.current && scannerRef.current.isScanning) {
                      scannerRef.current.resume();
                    }
                  } catch (_) {}
                }, 1000);
              }
            } catch (_) {}
          }

          // Silent haptic vibration
          if (navigator.vibrate) {
            navigator.vibrate([80, 40, 100]);
          }

          onOrderScanned(decodedText);
        },
        () => {} // Silent on per-frame non-match
      );

      setCameraActive(true);
    } catch (err) {
      console.warn('Camera start error:', err);
      setCameraError('Camera access unavailable or denied. Enter Order ID below.');
      setCameraActive(false);
    }
  };

  // Resume camera scanning if lookup finishes or user restarts
  useEffect(() => {
    if (!loading && scannerRef.current && cameraActive) {
      try {
        scannerRef.current.resume();
      } catch (_) {}
    }
  }, [loading, cameraActive]);

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn('Stop camera error:', err);
      }
    }
    setCameraActive(false);
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    if (navigator.vibrate) {
      navigator.vibrate([60]);
    }
    onOrderScanned(manualId.trim());
    setManualId('');
  };

  const totalBatchVolume = batchOrders.reduce(
    (sum, o) => sum + Number(o.total || 0),
    0
  );

  return (
    <div className="scannerCard">
      {/* Mode Selector Toggle: Single vs Multi-Parcel Batch */}
      <div className="scannerModeToggleBar">
        <button
          type="button"
          className={`scanModeBtn ${!isBatchMode ? 'active single' : ''}`}
          onClick={() => onToggleBatchMode?.(false)}
        >
          <Camera size={14} /> Single Parcel
        </button>
        <button
          type="button"
          className={`scanModeBtn ${isBatchMode ? 'active batch' : ''}`}
          onClick={() => onToggleBatchMode?.(true)}
        >
          <Boxes size={14} /> Multi-Parcel Batch
          <span className="batchModeTag">Garages</span>
        </button>
      </div>

      <div className="scannerCardHeader">
        <h2>
          {isBatchMode ? (
            <>
              <Boxes size={18} color="#38bdf8" />
              Batch Barcode Scanner
            </>
          ) : (
            <>
              <Camera size={18} color="#ff3157" />
              Doorstep Barcode Scanner
            </>
          )}
        </h2>
        <button
          type="button"
          className={`cameraToggleBtn ${cameraActive ? 'active' : ''}`}
          onClick={cameraActive ? stopCamera : startCamera}
        >
          <RefreshCw size={13} />
          {cameraActive ? 'Restart' : 'Start Camera'}
        </button>
      </div>

      <div className="cameraViewport">
        <div id="reader" />
        {cameraActive && (
          <div className="reticleOverlay">
            <div className={`reticleFrame ${isBatchMode ? 'batchFrame' : ''}`}>
              <span className="reticleCorner tl" />
              <span className="reticleCorner tr" />
              <span className="reticleCorner bl" />
              <span className="reticleCorner br" />
              <span className={`laserScanLine ${isBatchMode ? 'batchLaser' : ''}`} />
            </div>
            <div className="reticleHint">
              {isBatchMode ? 'SCAN MULTIPLE BOXES CONSECUTIVELY' : 'ALIGN BARCODE / QR CODE'}
            </div>
          </div>
        )}
        {!cameraActive && (
          <div className="cameraMessage">
            <AlertCircle size={36} color="#ff3157" style={{ margin: '0 auto 8px', display: 'block' }} />
            <h3>Camera is paused</h3>
            <p>{cameraError || 'Tap "Start Camera" above or type Order ID manually below'}</p>
          </div>
        )}
      </div>

      <div className="manualSearchSection">
        <form className="manualSearchForm" onSubmit={handleManualSubmit}>
          <input
            type="text"
            className="manualSearchInput"
            placeholder={
              isBatchMode
                ? 'Type Order ID to add to batch...'
                : 'Scan failed? Enter Order ID (e.g. MDC-08492)'
            }
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
          />
          <button type="submit" className="manualSearchBtn" disabled={loading}>
            <Search size={14} />
            {loading ? 'Adding...' : isBatchMode ? '+ Add to Batch' : 'Verify'}
          </button>
        </form>
      </div>

      {/* Batch Tray Section */}
      {isBatchMode && (
        <div className="batchTraySection">
          <div className="batchTrayHeader">
            <div className="batchTrayTitle">
              <Boxes size={15} color="#38bdf8" />
              <span>Batch Tray ({batchOrders.length} Parcels)</span>
            </div>
            {batchOrders.length > 0 && (
              <span className="batchTrayTotal">
                ₹{totalBatchVolume.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {batchOrders.length === 0 ? (
            <div className="emptyBatchTray">
              <p>Scan parcel barcodes one after another to fill your batch tray.</p>
              <small>Ideal for garages & customers receiving 2+ boxes.</small>
            </div>
          ) : (
            <>
              <div className="batchTrayList">
                {batchOrders.map((ord, idx) => {
                  const isCod = String(ord.paymentMethod || '').toLowerCase() === 'cod';
                  return (
                    <div className="batchTrayItem" key={idx}>
                      <div className="trayItemLeft">
                        <b>#{ord.orderId || ord.id}</b>
                        <small>
                          {ord.customer?.name || 'Customer'} •{' '}
                          <span style={{ color: isCod ? '#fbbf24' : '#22c55e' }}>
                            {isCod ? `COD: ₹${ord.total}` : 'Prepaid'}
                          </span>
                        </small>
                      </div>
                      <button
                        type="button"
                        className="removeTrayItemBtn"
                        onClick={() => onRemoveFromBatch?.(ord.orderId || ord.id)}
                        title="Remove parcel"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="proceedBatchBtn"
                onClick={onProceedBatch}
              >
                <PackageCheck size={16} />
                Verify & Handover Batch ({batchOrders.length} Parcels) →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
