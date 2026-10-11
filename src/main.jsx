import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './design/tokens.css';

class StartupErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Collancer startup render error]', error, info?.componentStack || '');
  }

  render() {
    if (this.state.error) {
      const message = this.state.error?.message || String(this.state.error);
      return (
        <main style={{ minHeight: '100dvh', boxSizing: 'border-box', padding: 24, display: 'grid', placeItems: 'center', background: '#f8fafc', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <section style={{ width: 'min(100%, 560px)', border: '1px solid #fecaca', borderRadius: 16, padding: 22, background: '#fff', boxShadow: '0 12px 40px rgba(15,23,42,.08)' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>Collancer couldn't open</h1>
            <p style={{ margin: '0 0 14px', color: '#475569', lineHeight: 1.55 }}>A startup error was caught instead of showing a blank screen. Please share this error with Collancer support.</p>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.5, padding: 12, borderRadius: 8, background: '#f1f5f9', color: '#7f1d1d' }}>{message}</pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: 16, minHeight: 42, padding: '0 16px', border: 0, borderRadius: 9, background: '#0891b2', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Reload app</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StartupErrorBoundary>
      <App />
    </StartupErrorBoundary>
  </React.StrictMode>
);
