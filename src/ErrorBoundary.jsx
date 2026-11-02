import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('MotoDC Partner Crash Caught:', error, errorInfo);
  }

  handleReload = () => {
    try {
      localStorage.removeItem('motodc_route_active_MDC-8586');
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) caches.delete(name);
        });
      }
    } catch (_) {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#090d14',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'sans-serif'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: '#ff3157' }}>
            MotoDC Partner Error Recovery
          </h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '320px', marginBottom: '20px' }}>
            The app encountered an unexpected startup error:
          </p>
          <pre style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '11px',
            color: '#f87171',
            maxWidth: '90%',
            overflowX: 'auto',
            marginBottom: '24px',
            textAlign: 'left',
            whiteSpace: 'pre-wrap',
            maxHeight: '200px'
          }}>
            {String(this.state.error?.stack || this.state.error?.message || this.state.error || 'Unknown error')}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              background: '#ff3157',
              color: '#ffffff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Clear Cache & Restart App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
