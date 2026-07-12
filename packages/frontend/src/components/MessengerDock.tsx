import { useEffect, useState, useRef, useCallback } from 'react';
import { MessageCircle } from 'lucide-react';
import api from '../lib/api';
import ChatDock from './ChatDock';

// Tüm sitede alta sabit duran, tıklayınca açılan global Messenger.
// TenantApp içinde bir kez mount edilir; sayfa gezintisinde unmount olmaz.
// Sürükle-bırak destekli: butonu tutup istediğin yere taşıyabilirsin.
export default function MessengerDock() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ phone: string; name?: string } | null>(null);
  const [unread, setUnread] = useState(0);

  // Sürükleme state
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try { const s = localStorage.getItem('wa_fab_pos'); if (s) return JSON.parse(s); } catch { /* */ }
    return { x: window.innerWidth - 72, y: window.innerHeight - 100 };
  });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const hasMoved = useRef(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const clamp = useCallback((x: number, y: number) => {
    const sz = 56;
    return {
      x: Math.max(4, Math.min(window.innerWidth - sz - 4, x)),
      y: Math.max(4, Math.min(window.innerHeight - sz - 4, y)),
    };
  }, []);

  // Resize'da viewport dışına çıkmasını önle
  useEffect(() => {
    const h = () => setPos((p) => clamp(p.x, p.y));
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    hasMoved.current = false;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true;
    const np = clamp(dragStart.current.px + dx, dragStart.current.py + dy);
    setPos(np);
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    // Kaydet
    try { localStorage.setItem('wa_fab_pos', JSON.stringify(pos)); } catch { /* */ }
    // Sadece taşımadıysa tıklama olarak kabul et
    if (!hasMoved.current) { setTarget(null); setOpen(true); }
  };

  // Herhangi bir sayfadan openChat() ile gelen istekleri yakala
  useEffect(() => {
    const h = (e: any) => { setTarget(e?.detail?.phone ? { phone: e.detail.phone, name: e.detail.name } : null); setOpen(true); };
    window.addEventListener('open-chat', h as any);
    return () => window.removeEventListener('open-chat', h as any);
  }, []);

  // Baloncuk için okunmamış sayısını periyodik çek (kapalıyken)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const r = await api.get('/whatsapp/conversations'); if (alive) setUnread((r.data.conversations || []).filter((c: any) => (c.unread || 0) > 0).length); } catch { /* sessiz */ }
    };
    load(); const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [open]);

  if (open) {
    return <ChatDock key={target?.phone || 'list'} phone={target?.phone || ''} name={target?.name} onClose={() => { setOpen(false); setTarget(null); }} />;
  }

  return (
    <button
      ref={btnRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      title="Mesajlar — sürükleyerek taşıyabilirsiniz"
      className="fixed z-[60] w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-2xl flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing select-none touch-none"
      style={{ left: pos.x, top: pos.y }}
    >
      <MessageCircle size={26} />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
