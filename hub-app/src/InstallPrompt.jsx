import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, CheckCircle2, ArrowRight } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already in standalone app mode
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    setIsStandalone(standalone);
    if (standalone) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Show prompt on mobile devices after 2 seconds if not yet installed
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 2000);
      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        clearTimeout(timer);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowInstructions(true);
    }
  };

  if (isStandalone) return null;

  return (
    <>
      {/* Floating Bottom Install Banner */}
      {showBanner && (
        <div className="hubInstallBanner">
          <div className="hubInstallInfo">
            <div className="hubInstallIcon">
              <Smartphone size={20} color="#ff3157" />
            </div>
            <div className="hubInstallText">
              <strong>Download MotoDC Hub to Phone</strong>
              <small>Install as a standalone app with camera scanner</small>
            </div>
          </div>

          <div className="hubInstallActionRow">
            <button
              type="button"
              className="hubInstallPrimaryBtn"
              onClick={handleInstallClick}
            >
              <Download size={14} /> Install Now
            </button>
            <button
              type="button"
              className="hubInstallDismissBtn"
              onClick={() => setShowBanner(false)}
              aria-label="Dismiss banner"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Manual Instructions Modal (Fallback for browsers that don't auto-prompt) */}
      {showInstructions && (
        <div className="hubScannerModalOverlay" onClick={() => setShowInstructions(false)}>
          <div className="hubScannerModal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="hubScannerHeader">
              <div className="hubScannerTitleBox">
                <Smartphone size={20} color="#ff3157" />
                <div>
                  <h3>Install on Your Phone</h3>
                  <p>Fast standalone access on your mobile screen</p>
                </div>
              </div>
              <button
                type="button"
                className="hubScannerCloseBtn"
                onClick={() => setShowInstructions(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="hubScannerBody">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', color: '#cbd5e1' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'rgba(255,49,87,0.15)', color: '#ff3157', width: '28px', height: '28px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 'bold', flexShrink: 0 }}>
                    1
                  </div>
                  <div>
                    <strong style={{ color: '#fff', display: 'block', marginBottom: '2px' }}>Open in Chrome / Browser</strong>
                    <span>Open this website link on your Android phone browser.</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'rgba(255,49,87,0.15)', color: '#ff3157', width: '28px', height: '28px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 'bold', flexShrink: 0 }}>
                    2
                  </div>
                  <div>
                    <strong style={{ color: '#fff', display: 'block', marginBottom: '2px' }}>Tap Browser Menu (⋮)</strong>
                    <span>Tap the 3 dots in the top right corner of Chrome (or Share on iPhone).</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ background: 'rgba(255,49,87,0.15)', color: '#ff3157', width: '28px', height: '28px', borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 'bold', flexShrink: 0 }}>
                    3
                  </div>
                  <div>
                    <strong style={{ color: '#fff', display: 'block', marginBottom: '2px' }}>Tap "Install app" or "Add to Home screen"</strong>
                    <span>MotoDC Hub will download and appear as an app icon on your phone!</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="hubStationUnlockBtn"
                style={{ marginTop: '14px' }}
                onClick={() => setShowInstructions(false)}
              >
                Got It <CheckCircle2 size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
