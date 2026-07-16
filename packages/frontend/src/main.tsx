import { Component } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Stale-chunk (yeni deploy sonrası eski dosya isteme) hatasını yakala ve oturumda bir kez otomatik yenile.
function isChunkError(err: any): boolean {
  const msg = String((err && (err.message || err.stack)) || err || '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|error loading dynamically/i.test(msg);
}
function tryAutoReload(): boolean {
  const key = 'chunk_reload_at';
  const last = Number(sessionStorage.getItem(key) || '0');
  if (Date.now() - last > 10000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
    return true;
  }
  return false;
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error?: string; chunk?: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.stack || error.message, chunk: isChunkError(error) };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(error, info);
    if (isChunkError(error)) tryAutoReload();
  }
  render() {
    if (this.state.hasError) {
      // Chunk (yeni sürüm) hatası → kırmızı ekran YERİNE nazik yükleyici; reload zaten tetiklendi.
      if (this.state.chunk) {
        return (
          <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: 'system-ui, sans-serif', color: '#334155' }}>
            <span style={{ width: 34, height: 34, border: '3px solid #e2e8f0', borderTopColor: '#10b981', borderRadius: '50%', display: 'inline-block', animation: 'djspin 0.8s linear infinite' }} />
            <div style={{ fontSize: 14 }}>Güncelleniyor…</div>
            <style>{'@keyframes djspin{to{transform:rotate(360deg)}}'}</style>
          </div>
        );
      }
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
    if (isChunkError(e) && tryAutoReload()) return;
    showFatalError((e && (e.stack || e.message || String(e))) || 'Bilinmeyen hata');
  });

// Vite, preload edilen bir chunk yüklenemezse bu event'i fırlatır (yeni deploy senaryosu).
window.addEventListener('vite:preloadError', (e: any) => {
  e.preventDefault?.();
  tryAutoReload();
});
