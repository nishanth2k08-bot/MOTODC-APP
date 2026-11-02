import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, RefreshCw, Search, AlertCircle } from 'lucide-react';

export default function Scanner({
  onOrderScanned,
  loading,
  targetDoorstepStop = null,
  onCancelTarget = null,
  hubScanMode = false,
  hubScannedCount = 0,
  totalPendingStops = 0,
  onExitHubMode = null,
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
          if (decodedText === lastScanRef.current.text && now - lastScanRef.current.time < 3000) {
            return;
          }
          lastScanRef.current = { text: decodedText, time: now };

          try {
            if (scannerRef.current && scannerRef.current.isScanning) {
              scannerRef.current.pause(true);
            }
          } catch (_) {}

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
    if (!loading && scannerRef.current && scannerRef.current.isPaused) {
      try {
        scannerRef.current.resume();
      } catch (_) {}
    }
  }, [loading]);

  const stopCamera = async () => {
    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      setCameraActive(false);
    } catch (err) {
      console.warn('Camera stop error:', err);
    }
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

  return (
    <div className="scannerCard">
      <div className="scannerCardHeader">
        <h2>
          <Camera size={18} color="#ff3157" />
          {targetDoorstepStop
            ? 'Doorstep Handover Verification'
            : hubScanMode
            ? 'Hub Bag Loading Verification'
            : 'Doorstep Barcode Scanner'}
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

      {/* Contextual Banner: Doorstep Specific Target Scan */}
      {targetDoorstepStop && (
        <div className="scannerContextBanner doorstep">
          <div className="bannerLeft">
            <span className="bannerTag">🎯 Doorstep Scan Required</span>
            <strong>Order #{targetDoorstepStop.orderId || targetDoorstepStop.id}</strong>
            <small>
              Customer: {targetDoorstepStop.customer?.name} • Scan package barcode to unlock PIN
            </small>
          </div>
          {onCancelTarget && (
            <button type="button" className="bannerActionBtn" onClick={onCancelTarget}>
              ✕ Back to Stops
            </button>
          )}
        </div>
      )}

      {/* Contextual Banner: Hub Bag Loading Verification Scan */}
      {hubScanMode && (
        <div className="scannerContextBanner hub">
          <div className="bannerLeft">
            <span className="bannerTag">📦 Hub Bag Loading Scan</span>
            <strong>
              {hubScannedCount} of {totalPendingStops} Parcels Verified
            </strong>
            <small>Scan every assigned parcel into your bag before leaving Karaikal Hub</small>
          </div>
          {onExitHubMode && (
            <button type="button" className="bannerActionBtn hub" onClick={onExitHubMode}>
              ✓ Run Sheet
            </button>
          )}
        </div>
      )}

      <div className="cameraViewport">
        <div id="reader" />
        {cameraActive && (
          <div className="reticleOverlay">
            <div className="reticleFrame">
              <span className="reticleCorner tl" />
              <span className="reticleCorner tr" />
              <span className="reticleCorner bl" />
              <span className="reticleCorner br" />
              <span className="laserScanLine" />
            </div>
            <div className="reticleHint">ALIGN BARCODE / QR CODE</div>
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
              targetDoorstepStop
                ? `Scan failed? Enter #${targetDoorstepStop.orderId || targetDoorstepStop.id} to verify`
                : hubScanMode
                ? 'Scan failed? Enter Order ID to verify in bag (e.g. MDC-08492)'
                : 'Scan failed? Enter Order ID (e.g. MDC-08492)'
            }
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
          />
          <button type="submit" className="manualSearchBtn" disabled={loading}>
            <Search size={14} />
            {loading ? 'Searching...' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  );
}
