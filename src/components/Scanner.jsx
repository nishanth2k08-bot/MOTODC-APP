import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, RefreshCw, Search, AlertCircle } from 'lucide-react';

export default function Scanner({ onOrderScanned, loading }) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [manualId, setManualId] = useState('');
  const scannerRef = useRef(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('reader');
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 250, height: 170 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (decodedText) {
            // Silent haptic vibration
            if (navigator.vibrate) {
              navigator.vibrate([80, 40, 100]);
            }
            onOrderScanned(decodedText);
          }
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
  };

  return (
    <div className="scannerCard">
      <div className="scannerCardHeader">
        <h2>
          <Camera size={18} color="#ff3157" />
          Doorstep Barcode Scanner
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
            placeholder="Scan failed? Enter Order ID (e.g. MDC-08492)"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
          />
          <button type="submit" className="manualSearchBtn" disabled={loading}>
            <Search size={14} />
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  );
}
