import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertCircle, RefreshCw, Zap, CheckCircle2 } from 'lucide-react';

export default function BarcodeScannerModal({ isOpen, onClose, onBarcodeDetected }) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [manualCode, setManualCode] = useState('');
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ text: '', time: 0 });

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    // Auto-start camera when modal opens
    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('hub-barcode-reader', {
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 20,
          qrbox: { width: 300, height: 160 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          if (!decodedText) return;
          const now = Date.now();
          if (decodedText === lastScanRef.current.text && now - lastScanRef.current.time < 2000) {
            return;
          }
          lastScanRef.current = { text: decodedText, time: now };

          // Haptic feedback if supported
          if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
          }

          onBarcodeDetected(decodedText);
          onClose();
        },
        () => {} // Silent non-match frame
      );

      setCameraActive(true);
    } catch (err) {
      console.warn('Hub Camera start error:', err);
      setCameraError('Camera access unavailable or denied. You can still use your USB handheld barcode scanner or manual search.');
      setCameraActive(false);
    }
  };

  const stopCamera = async () => {
    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      setCameraActive(false);
    } catch (err) {
      console.warn('Hub Camera stop error:', err);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    onBarcodeDetected(manualCode.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="hubScannerModalOverlay" onClick={onClose}>
      <div className="hubScannerModal" onClick={(e) => e.stopPropagation()}>
        <div className="hubScannerHeader">
          <div className="hubScannerTitleBox">
            <Camera size={20} color="#ff3157" />
            <div>
              <h3>Warehouse Barcode Scanner</h3>
              <p>Scan 1D Linear Barcode (Code-128) or 2D QR Code on package label</p>
            </div>
          </div>
          <button type="button" className="hubScannerCloseBtn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Scanner Body */}
        <div className="hubScannerBody">
          {cameraError ? (
            <div className="hubScannerErrorBox">
              <AlertCircle size={32} color="#ef4444" />
              <p>{cameraError}</p>
              <button type="button" className="hubScannerRetryBtn" onClick={startCamera}>
                <RefreshCw size={14} /> Retry Camera
              </button>
            </div>
          ) : (
            <div className="hubScannerViewport">
              <div id="hub-barcode-reader" style={{ width: '100%', minHeight: '260px' }} />
              <div className="hubScannerReticle">
                <div className="hubScannerLaser" />
              </div>
            </div>
          )}

          {/* USB Handheld Hardware Scanner Callout */}
          <div className="hubHardwareScannerBanner">
            <Zap size={16} color="#38bdf8" />
            <div>
              <strong>USB / Bluetooth Barcode Gun Listening</strong>
              <small>You can also pull the trigger on any physical scanner anywhere in the app</small>
            </div>
          </div>

          {/* Manual Input Fallback */}
          <form className="hubScannerManualForm" onSubmit={handleManualSubmit}>
            <input
              type="text"
              placeholder="Or enter Order ID (e.g. MDC-80280625)..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
            <button type="submit">Verify</button>
          </form>
        </div>
      </div>
    </div>
  );
}
