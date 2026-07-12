import { useEffect, useRef, useState, Fragment } from 'react';
import { X, Send, MessageCircle, Paperclip, Zap, MessageSquare, Clock, Users, ChevronLeft, Search, CornerUpLeft, Trash2, StickyNote, ShoppingCart, Pencil, Eye, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { DetailModal } from '../pages/Siparislerim';

const API_BASE = (api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
function mediaSrc(url?: string | null) { if (!url) return ''; return /^https?:/.test(url) ? url : `${API_BASE}${url}`; }
function fmtTime(s?: string) { if (!s) return ''; const d = new Date(s); return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }
function dayLabel(s?: string) { if (!s) return ''; const d = new Date(s); const today = new Date(); const yest = new Date(); yest.setDate(today.getDate() - 1); if (d.toDateString() === today.toDateString()) return 'Bugün'; if (d.toDateString() === yest.toDateString()) return 'Dün'; return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }); }
function relTime(s?: string | null) {
  if (!s) return '';
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}sa`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}g`;
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}
function initials(name?: string | null, phone?: string) {
  const n = (name || '').trim();
  if (n) return n.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || n[0].toUpperCase();
  return (phone || '').replace(/\D/g, '').slice(-2);
}

type DockMsg = { id: string; direction: string; body?: string; mediaType?: string | null; mediaUrl?: string | null; fileName?: string | null; templateName?: string | null; status?: string; error?: string | null; createdAt: string; reaction?: string | null; deleted?: boolean; replyToWaId?: string | null; replyToText?: string | null };
type ConvoMeta = { windowOpen?: boolean; windowExpiresAt?: string | null; channel?: string; closed?: boolean; note?: string | null };
type QuickReply = { id?: string; baslik?: string; metin: string; aktif?: boolean };
type Tpl = { id: string; name: string; bodyText: string; status: string; category?: string };
type Convo = { id: string; customerPhone: string; customerName?: string | null; channel?: string; lastMessageAt?: string | null; lastPreview?: string | null; lastDirection?: string | null; unread: number; windowOpen?: boolean };

// Siteden herhangi bir yerden global Messenger'ı belirli bir sohbetle aç
export function openChat(phone: string, name?: string) {
  window.dispatchEvent(new CustomEvent('open-chat', { detail: { phone, name } }));
}

const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function ChatDock({ phone, name, onClose }: { phone: string; name?: string; onClose: () => void }) {
  // Aktif sohbet (Messenger mantığı: alttaki listeden başka sohbete geçilebilir)
  const [active, setActive] = useState<{ phone: string; name?: string }>({ phone, name });
  useEffect(() => { setActive({ phone, name }); if (phone) setShowList(false); }, [phone, name]);
  const digits = (active.phone || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);

  const [convoId, setConvoId] = useState<string | null>(null);
  const [meta, setMeta] = useState<ConvoMeta>({});
  const [msgs, setMsgs] = useState<DockMsg[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [activeCart, setActiveCart] = useState<any>(null);
  const [showTpl, setShowTpl] = useState(false);
  const [showList, setShowList] = useState(!phone); // hedef sohbet yoksa listeyle aç
  const [convos, setConvos] = useState<Convo[]>([]);
  const [listQuery, setListQuery] = useState('');
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [now, setNow] = useState(Date.now());
  const [replyTo, setReplyTo] = useState<DockMsg | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null); // aksiyon menüsü açık mesaj id
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const store: any = useStore();
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const findConvo = async () => {
    if (last10.length < 7) { setConvoId(null); setMsgs([]); setMeta({}); return; } // hedef yok → liste modu
    try {
      const r = await api.get('/whatsapp/conversations', { params: { q: last10 } });
      const hit = (r.data.conversations || []).find((c: any) => c.customerPhone.replace(/\D/g, '').endsWith(last10));
      if (hit) {
        setConvoId(hit.id);
        const m = await api.get(`/whatsapp/conversations/${hit.id}/messages`);
        setMsgs(m.data.messages || []);
        const c = m.data.conversation || {};
        setMeta({ windowOpen: c.windowOpen, windowExpiresAt: c.windowExpiresAt, channel: c.channel, closed: c.closed, note: c.note });
        setConvos((prev) => prev.map((p) => (p.id === hit.id ? { ...p, unread: 0 } : p))); // açılınca okunmuş say
      } else { setConvoId(null); setMsgs([]); setMeta({}); }
    } catch { /* sessiz */ }
  };
  useEffect(() => { findConvo(); const t = setInterval(findConvo, 5000); return () => clearInterval(t); }, [last10]);
  // Açık sepet bilgisini yükle
  useEffect(() => {
    if (!convoId) { setActiveCart(null); return; }
    api.get(`/whatsapp/conversations/${convoId}/cart`).then((r) => {
      const c = r.data.cart;
      if (c && !c.empty && c.id) {
        const ord = (store.orders || []).find((o: any) => o.id === c.id);
        setActiveCart(ord || c);
      } else setActiveCart(null);
    }).catch(() => setActiveCart(null));
  }, [convoId, store.orders]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // Sohbet listesi (alta sabit) — periyodik yenilenir
  const loadConvos = async () => {
    try { const r = await api.get('/whatsapp/conversations', { params: { q: listQuery.trim() || undefined } }); setConvos(r.data.conversations || []); } catch { /* sessiz */ }
  };
  useEffect(() => { loadConvos(); const t = setInterval(loadConvos, 8000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [listQuery]);

  // Hazır cevaplar + onaylı şablonlar (bir kez)
  useEffect(() => {
    api.get('/whatsapp/settings').then((r) => { const s = r.data?.settings || {}; setQuickReplies(Array.isArray(s.hazirCevaplar) ? s.hazirCevaplar : []); }).catch(() => {});
    api.get('/whatsapp/templates').then((r) => { setTemplates((r.data?.templates || []).filter((t: Tpl) => t.status === 'approved')); }).catch(() => {});
  }, []);

  const isApi = (meta.channel || 'qr') === 'api';
  const windowOpen = !!meta.windowOpen;
  const winLeft = (() => {
    if (!isApi || !meta.windowExpiresAt) return null;
    const ms = new Date(meta.windowExpiresAt).getTime() - now;
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}s ${m}dk` : `${m}dk`;
  })();
  const totalUnread = convos.filter(c => (c.unread || 0) > 0).length;

  const openConvo = (c: Convo) => { setActive({ phone: c.customerPhone, name: c.customerName || undefined }); setShowList(false); setText(''); setShowQr(false); setShowTpl(false); };

  const send = async (override?: string) => {
    const t = (override ?? text).trim();
    if (!t) return;
    setSending(true);
    const replyId = replyTo?.id || undefined;
    try {
      if (convoId) await api.post(`/whatsapp/conversations/${convoId}/send`, { body: t, replyToId: replyId });
      else await api.post('/whatsapp/send', { phone: digits, body: t, replyToId: replyId });
      setText(''); setReplyTo(null); toast.success('Gönderiliyor'); setTimeout(findConvo, 700);
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSending(false); }
  };

  // Emoji tepki ver / kaldır (aynı emojiye tekrar basınca kaldırır)
  const react = async (m: DockMsg, emoji: string) => {
    setMenuFor(null);
    const next = m.reaction === emoji ? '' : emoji;
    setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, reaction: next || null } : x))); // optimistic
    try { await api.post(`/whatsapp/messages/${m.id}/react`, { emoji: next }); }
    catch (e: any) { toast.error(apiErrorMessage(e)); setTimeout(findConvo, 300); }
  };

  // Mesajı sil (giden) — QR'da herkesten, API'de panelden gizler
  const del = async (m: DockMsg) => {
    setMenuFor(null);
    if (!window.confirm('Bu mesaj silinsin mi?')) return;
    setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted: true } : x))); // optimistic
    try {
      const r = await api.delete(`/whatsapp/messages/${m.id}`);
      toast.success(r.data?.everyone ? 'Mesaj herkesten silindi' : 'Mesaj panelden gizlendi (resmi API silmeyi desteklemez)');
    } catch (e: any) { toast.error(apiErrorMessage(e)); setTimeout(findConvo, 300); }
  };

  // Sohbete tutturulan (pinned) müşteri notu
  const saveNote = async (note: string) => {
    if (!convoId) { toast.error('Önce bir mesaj gönderip sohbeti başlatın'); return; }
    setNoteBusy(true);
    try {
      const r = await api.put(`/whatsapp/conversations/${convoId}/note`, { note });
      const nv = r.data?.note ?? (note.trim() || null);
      setMeta((m) => ({ ...m, note: nv }));
      setNoteOpen(false);
      toast.success(nv ? 'Not kaydedildi' : 'Not kaldırıldı');
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setNoteBusy(false); }
  };
  const openNote = () => { setNoteDraft(meta.note || ''); setNoteOpen(true); };

  // Açık sepeti detay modalında aç — activeCart zaten doğru sepeti tutuyor, onu kullan
  const openCart = async () => {
    // activeCart varsa doğrudan onu kullan (banner'daki ile aynı)
    const cartId = activeCart?.id;
    if (cartId) {
      const ord = (store.orders || []).find((o: any) => o.id === cartId);
      if (ord) { setDetailOrder(ord); return; }
      try {
        const fr = await api.get(`/store/orders/${cartId}`);
        const full = fr.data?.order || fr.data;
        if (full && full.id) { setDetailOrder(full); return; }
      } catch {}
      toast.error('Sipariş açılamadı, Siparişlerim sayfasından deneyin');
      return;
    }
    // activeCart yoksa API'den çek
    if (!convoId) { toast('Bu müşterinin açık sohbeti/sepeti yok'); return; }
    try {
      const r = await api.get(`/whatsapp/conversations/${convoId}/cart`);
      const cart = r.data.cart;
      if (!cart || cart.empty || cart.id == null) { toast('Bu müşterinin açık sepeti yok'); return; }
      const ord = (store.orders || []).find((o: any) => o.id === cart.id);
      if (ord) { setDetailOrder(ord); return; }
      try {
        const fr = await api.get(`/store/orders/${cart.id}`);
        const full = fr.data?.order || fr.data;
        if (full && full.id) { setDetailOrder(full); return; }
      } catch {}
      toast.error('Sipariş açılamadı, Siparişlerim sayfasından deneyin');
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const sendTemplate = async (tpl: Tpl) => {
    setSending(true); setShowTpl(false);
    try {
      if (convoId) await api.post(`/whatsapp/conversations/${convoId}/send`, { templateId: tpl.id });
      else await api.post('/whatsapp/send', { phone: digits, templateId: tpl.id });
      toast.success('Şablon gönderiliyor'); setTimeout(findConvo, 800);
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSending(false); }
  };
  const attachFile = async (f: File) => {
    if (!convoId) { toast.error('Önce bir mesaj gönderip sohbeti başlatın'); return; }
    if (f.size > 15 * 1024 * 1024) { toast.error('Dosya 15MB sınırını aşıyor'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      setSending(true);
      try {
        await api.post(`/whatsapp/conversations/${convoId}/send`, { body: text.trim(), mediaDataUrl: reader.result, fileName: f.name, replyToId: replyTo?.id || undefined });
        setText(''); setReplyTo(null); toast.success('Dosya kuyruğa eklendi'); setTimeout(findConvo, 900);
      } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSending(false); }
    };
    reader.readAsDataURL(f);
  };

  const activeQr = quickReplies.filter((q) => q.aktif !== false);

  return (
    <div className="fixed bottom-20 right-4 z-[60] w-[380px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[70vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
      <div className="px-3 py-3 bg-emerald-500 text-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {showList ? (
            <Users size={18} />
          ) : (
            <button onClick={() => setShowList(true)} title="Sohbetler" className="relative shrink-0 hover:opacity-90">
              <ChevronLeft size={18} />
              {totalUnread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-[9px] font-bold flex items-center justify-center">{totalUnread > 99 ? '99+' : totalUnread}</span>}
            </button>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{showList ? 'Sohbetler' : (active.name || digits)}</p>
            <p className="text-[11px] text-emerald-50 truncate">{showList ? `${convos.length} sohbet${totalUnread ? ` · ${totalUnread} okunmamış` : ''}` : digits}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!showList && <button onClick={openNote} title="Müşteri notu" className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.note ? 'bg-amber-300/40 text-white' : 'hover:bg-white/15'}`}><StickyNote size={16} /></button>}
          {!showList && <button onClick={openCart} title="Açık sepeti görüntüle" className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center"><ShoppingCart size={16} /></button>}
          {!showList && <button onClick={() => setShowList(true)} title="Sohbet listesi" className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center"><Users size={16} /></button>}
          <button onClick={() => window.open(`/whatsapp?phone=${encodeURIComponent(active.phone || '')}`, '_blank')} title="WhatsApp Paneli" className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center"><ExternalLink size={16} /></button>
          <button onClick={onClose} title="Kapat" className="w-7 h-7 rounded-lg hover:bg-white/15 flex items-center justify-center"><X size={18} /></button>
        </div>
      </div>

      {showList ? (
        /* ===== Messenger tarzı sohbet listesi ===== */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={listQuery} onChange={(e) => setListQuery(e.target.value)} placeholder="İsim, numara veya mesaj ara..." className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convos.length === 0 && <p className="text-xs text-slate-400 text-center py-8">Sohbet bulunamadı.</p>}
            {convos.map((c) => {
              const isActive = c.customerPhone.replace(/\D/g, '').endsWith(last10);
              const preview = (c as any).matchPreview || c.lastPreview || '';
              return (
                <button key={c.id} onClick={() => openConvo(c)} className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-50 text-left hover:bg-slate-50 ${isActive ? 'bg-emerald-50/60' : ''}`}>
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-sm flex items-center justify-center">{initials(c.customerName, c.customerPhone)}</div>
                    {c.windowOpen && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" title="24s pencere açık" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${c.unread > 0 ? 'font-bold text-slate-800' : 'font-medium text-slate-700'}`}>{c.customerName || c.customerPhone}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{relTime(c.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[12px] truncate ${c.unread > 0 ? 'text-slate-700' : 'text-slate-400'}`}>{c.lastDirection === 'out' ? 'Siz: ' : ''}{preview || '—'}</span>
                      {c.unread > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{c.unread > 99 ? '99+' : c.unread}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* ===== Aktif sohbet ===== */
        <>
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-[11px]">
            <span className={`px-1.5 py-0.5 rounded font-medium ${isApi ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>{isApi ? 'WP API' : 'QR'}</span>
            {isApi ? (
              windowOpen
                ? <span className="inline-flex items-center gap-1 text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 24s pencere açık{winLeft ? ` · ${winLeft} kaldı` : ''}</span>
                : <span className="inline-flex items-center gap-1 text-amber-600"><Clock size={12} /> Pencere kapalı — yalnızca onaylı şablon gider</span>
            ) : (
              <span className="text-slate-400">QR hattı — pencere kısıtı yok</span>
            )}
          </div>

          {meta.note && (
            <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 flex items-start gap-2">
              <StickyNote size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-800 flex-1 whitespace-pre-wrap break-words">{meta.note}</p>
              <button onClick={openNote} title="Notu düzenle" className="text-amber-500 hover:text-amber-700 shrink-0"><Pencil size={12} /></button>
              <button onClick={() => saveNote('')} title="Notu kaldır" className="text-amber-500 hover:text-rose-600 shrink-0"><X size={13} /></button>
            </div>
          )}

          {activeCart && (() => {
            const toplam = Number(activeCart.toplam) || 0;
            const tahsilat = Number(activeCart.tahsilat) || 0;
            const kalan = toplam - tahsilat;
            const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20BA';
            return (
              <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2 cursor-pointer" onClick={openCart}>
                <ShoppingCart size={13} className="text-emerald-600 shrink-0" />
                <div className="flex items-center gap-2 flex-1 text-[11px]">
                  <span className="font-bold text-emerald-800">{activeCart.sipNo || 'Sepet'}</span>
                  {kalan > 0.01 ? <span className="font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full">Kalan: {fmt(kalan)}</span>
                   : <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">Ödendi</span>}
                </div>
                <Eye size={13} className="text-emerald-500" />
              </div>
            );
          })()}

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {msgs.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Henüz mesaj yok. İlk mesajı yazın.</p>}
            {msgs.map((m, i) => {
              const out = m.direction === 'out';
              const menuOpen = menuFor === m.id;
              const prev = msgs[i - 1];
              const showDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const sep = showDay ? (<div className="flex justify-center my-1.5 sticky top-1 z-10 pointer-events-none"><span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] text-slate-500 shadow-sm">{dayLabel(m.createdAt)}</span></div>) : null;
              if (m.deleted) {
                return (
                  <Fragment key={m.id}>{sep}
                  <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm italic flex items-center gap-1.5 ${out ? 'bg-slate-200 text-slate-400 rounded-br-sm' : 'bg-white border border-slate-200 text-slate-400 rounded-bl-sm'}`}>
                      <Trash2 size={13} /> Bu mesaj silindi
                    </div>
                  </div>
                  </Fragment>
                );
              }
              return (
                <Fragment key={m.id}>{sep}
                <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                  <div className="relative group max-w-[80%]">
                    <div
                      onClick={() => setMenuFor((v) => (v === m.id ? null : m.id))}
                      className={`px-3 py-2 rounded-2xl text-sm cursor-pointer ${out ? 'bg-emerald-500 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'} ${m.reaction ? 'mb-2' : ''}`}
                    >
                      {m.replyToText && (
                        <div className={`mb-1 px-2 py-1 rounded-lg border-l-2 text-[11px] truncate ${out ? 'bg-emerald-600/40 border-white/60 text-emerald-50' : 'bg-slate-100 border-slate-300 text-slate-500'}`}>{m.replyToText}</div>
                      )}
                      {m.mediaUrl && m.mediaType === 'image' && <img src={mediaSrc(m.mediaUrl)} alt="" className="w-36 h-36 object-cover rounded-lg mb-1" />}
                      {m.mediaUrl && m.mediaType === 'video' && <video src={mediaSrc(m.mediaUrl)} controls className="w-44 rounded-lg mb-1" />}
                      {m.mediaUrl && m.mediaType === 'audio' && <audio src={mediaSrc(m.mediaUrl)} controls className="mb-1 max-w-full" />}
                      {m.mediaUrl && !['image', 'video', 'audio'].includes(m.mediaType || '') && <a href={mediaSrc(m.mediaUrl)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={`flex items-center gap-1.5 mb-1 underline ${out ? 'text-white' : 'text-sky-600'}`}><Paperclip size={14} /> {m.fileName || 'Dosya'}</a>}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      {m.templateName && <p className={`text-[10px] italic ${out ? 'text-emerald-100' : 'text-slate-400'}`}>şablon: {m.templateName}</p>}
                      <p className={`text-[10px] mt-0.5 flex items-center gap-1 justify-end ${out ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {fmtTime(m.createdAt)}
                        {out && (m.status === 'failed'
                          ? <span className="text-rose-200" title={m.error || 'Gönderilemedi'}>⚠</span>
                          : <span className={m.status === 'read' ? 'text-sky-200' : 'text-emerald-100'} title={m.status === 'read' ? 'Okundu' : m.status === 'delivered' ? 'İletildi' : 'Gönderildi'}>✓✓</span>)}
                      </p>
                    </div>
                    {/* tepki rozeti */}
                    {m.reaction && (
                      <span className={`absolute -bottom-2 ${out ? 'right-2' : 'left-2'} bg-white border border-slate-200 rounded-full px-1 text-[12px] leading-none py-0.5 shadow-sm`}>{m.reaction}</span>
                    )}
                    {/* aksiyon menüsü */}
                    {menuOpen && (
                      <div className={`absolute z-20 -top-9 ${out ? 'right-0' : 'left-0'} bg-white rounded-full border border-slate-200 shadow-lg px-1.5 py-1 flex items-center gap-0.5`}>
                        {REACT_EMOJIS.map((e) => (
                          <button key={e} onClick={() => react(m, e)} className={`w-7 h-7 rounded-full hover:bg-slate-100 text-[15px] leading-none ${m.reaction === e ? 'bg-emerald-50' : ''}`}>{e}</button>
                        ))}
                        <span className="w-px h-5 bg-slate-200 mx-0.5" />
                        <button onClick={() => { setReplyTo(m); setMenuFor(null); }} title="Yanıtla" className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><CornerUpLeft size={15} /></button>
                        {out && <button onClick={() => del(m)} title="Sil" className="w-7 h-7 rounded-full hover:bg-rose-50 flex items-center justify-center text-rose-500"><Trash2 size={15} /></button>}
                      </div>
                    )}
                  </div>
                </div>
                </Fragment>
              );
            })}
            <div ref={endRef} />
          </div>

          {showQr && (
            <div className="border-t border-slate-100 bg-white max-h-32 overflow-y-auto p-2 space-y-1">
              {activeQr.length === 0 && <p className="text-[11px] text-slate-400 px-1 py-1">Tanımlı hazır cevap yok.</p>}
              {activeQr.map((q, i) => (
                <button key={q.id || i} onClick={() => { setText((p) => p ? p + '\n' + q.metin : q.metin); setShowQr(false); if (q.id) api.post('/whatsapp/quick-replies/use', { id: q.id }).catch(() => {}); }} title={q.metin} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50">
                  <span className="block text-[12px] font-medium text-slate-700 truncate">{q.baslik || q.metin.slice(0, 24)}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{q.metin}</span>
                </button>
              ))}
            </div>
          )}

          {showTpl && (
            <div className="border-t border-slate-100 bg-white max-h-32 overflow-y-auto p-2 space-y-1">
              {templates.length === 0 && <p className="text-[11px] text-slate-400 px-1 py-1">Onaylı şablon yok.</p>}
              {templates.map((t) => (
                <button key={t.id} onClick={() => sendTemplate(t)} title={t.bodyText} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-sky-50">
                  <span className="block text-[12px] font-medium text-slate-700 truncate">{t.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{t.bodyText}</span>
                </button>
              ))}
              {!windowOpen && isApi && <p className="text-[10px] text-amber-600 px-1 pt-1">Pencere kapalı; mesaj yalnızca onaylı şablonla teslim edilir.</p>}
            </div>
          )}

          {replyTo && (
            <div className="px-2.5 pt-2 -mb-1 bg-white">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 border-l-2 border-emerald-400">
                <CornerUpLeft size={14} className="text-emerald-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-emerald-600">{replyTo.direction === 'out' ? 'Siz' : (active.name || 'Müşteri')} yanıtlanıyor</p>
                  <p className="text-[11px] text-slate-500 truncate">{replyTo.body || (replyTo.mediaType ? '[medya]' : '—')}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={14} /></button>
              </div>
            </div>
          )}

          <div className="p-2.5 border-t border-slate-100 flex items-end gap-1.5">
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} disabled={sending} title="Dosya / görsel ekle" className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50 flex items-center justify-center shrink-0"><Paperclip size={16} /></button>
            <button onClick={() => { setShowQr((v) => !v); setShowTpl(false); }} title="Hazır cevaplar" className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${showQr ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><MessageSquare size={16} /></button>
            <button onClick={() => { setShowTpl((v) => !v); setShowQr(false); }} title="Onaylı şablon gönder" className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${showTpl ? 'bg-sky-100 text-sky-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Zap size={16} /></button>
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Mesaj yaz..." className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            <button onClick={() => send()} disabled={sending || !text.trim()} className="w-9 h-9 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center shrink-0"><Send size={16} /></button>
          </div>
        </>
      )}

      {noteOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/40" onClick={() => setNoteOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full bg-white rounded-2xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-2"><h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5"><StickyNote size={15} className="text-amber-600" /> Müşteri Notu</h3><button onClick={() => setNoteOpen(false)}><X size={16} className="text-slate-400" /></button></div>
            <p className="text-[11px] text-slate-400 mb-2">Not sohbetin üstünde başa tutturulu kalır.</p>
            <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={4} maxLength={1000} placeholder="Örn. Toptan müşteri…" className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-100 resize-none" autoFocus />
            <div className="flex items-center justify-end gap-2 mt-3">
              {meta.note && <button disabled={noteBusy} onClick={() => saveNote('')} className="px-3 py-1.5 text-sm rounded-lg text-rose-600 hover:bg-rose-50">Kaldır</button>}
              <button onClick={() => setNoteOpen(false)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">İptal</button>
              <button disabled={noteBusy} onClick={() => saveNote(noteDraft)} className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {detailOrder && (() => {
        const customer = (store.customers || []).find((c: any) => c.id === detailOrder.customerId);
        const custName = customer?.ad || detailOrder.musteriHandle || 'Misafir';
        const custPhone = customer?.telefon || '';
        return (
          <DetailModal
            order={detailOrder}
            customer={customer}
            custName={custName}
            custPhone={custPhone}
            products={store.products || []}
            categories={store.categories || []}
            discountCodes={store.discountCodes || []}
            campaigns={store.campaigns || []}
            storeSetting={store.storeSetting}
            onClose={() => setDetailOrder(null)}
            reload={store.reload}
          />
        );
      })()}
    </div>
  );
}
