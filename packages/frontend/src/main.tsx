import { Component } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error?: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.stack || error.message };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ color: '#dc2626' }}>Bir hata olustu</h1>
          <p>Uygulama baslatilamadi. Lutfen tarayici konsolunu (F12) kontrol edin.</p>
          <pre style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>
            {this.state.error}
          </pre>
          <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ marginTop: 16, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Verileri Temizle ve Yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<h1 style="color:red;padding:40px">Root element (#root) bulunamadi</h1>';
  throw new Error('Root element bulunamadi');
}

function showFatalError(msg: string) {
  rootEl!.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#dc2626"><h2>Uygulama baslatilamadi</h2><pre style="background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap">${msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre><button onclick="localStorage.clear();location.reload()" style="margin-top:16px;padding:8px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer">Verileri Temizle ve Yenile</button></div>`;
}

import('./App')
  .then(({ default: App }) => {
    const root = ReactDOM.createRoot(rootEl);
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
  })
  .catch((e: any) => {
    console.error(e);
    showFatalError((e && (e.stack || e.message || String(e))) || 'Bilinmeyen hata');
  });
