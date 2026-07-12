import { useEffect, useRef, useState, useMemo, Fragment } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Plus, RefreshCw, LogOut, Trash2, Send, Search, QrCode, AlertTriangle, Inbox, Smartphone, Settings as SettingsIcon, X, FileText, Megaphone, Paperclip, CreditCard, LifeBuoy, CheckCircle, Cloud, Copy, ChevronDown, ShoppingCart, LayoutGrid, TrendingUp, Clock, Shield, ChevronRight, Zap, BarChart3, Link2, Bell, Ban, CheckSquare, Truck, Bot, Sparkles, Wand2, Upload, Download, MoreVertical, Pencil, Power, Package, ChevronLeft, Eye, BadgeCheck, CornerUpLeft, StickyNote, Receipt, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { DetailModal } from './Siparislerim';
import WorkflowEditor, { TEMPLATE_GALLERY } from '../components/WorkflowEditor';

type Line = {
  id: string; label: string; phone?: string | null; jid?: string | null;
  status: string; active: boolean; gunlukLimit: number; gonderimAralikSn: number;
  sentToday: number; newChatToday: number; lastSentAt?: string | null; lastConnectedAt?: string | null; hasQr: boolean;
  channel?: string; wabaId?: string | null; phoneNumberId?: string | null; hasToken?: boolean; apiTokenMasked?: string | null; apiVerified?: boolean;
};
type Convo = {
  id: string; customerPhone: string; customerName?: string | null; customerId?: string | null; customerExists?: boolean;
  lineId: string; lineLabel: string; channel?: string; lastMessageAt: string; lastPreview?: string | null; lastDirection?: string | null; unread: number; matchPreview?: string | null;
  closed?: boolean; windowOpen?: boolean; tags?: string[]; note?: string | null;
};
type Msg = { id: string; direction: string; body: string; mediaType?: string | null; mediaUrl?: string | null; fileName?: string | null; templateName?: string | null; status: string; error?: string | null; createdAt: string; reaction?: string | null; deleted?: boolean; replyToWaId?: string | null; replyToText?: string | null; sentByName?: string | null };
type Template = { id: string; name: string; language: string; category: string; headerType?: string | null; headerText?: string | null; bodyText: string; footerText?: string | null; status: string; rejectReason?: string | null; sampleJson?: any; updatedAt: string };
type BulkJob = { id: string; templateId: string; total: number; sent: number; failed: number; status: string; createdAt: string };

const API_BASE = (api.defaults.baseURL || '').replace(/\/api\/v1\/?$/, '');
const REACT_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
function mediaSrc(url?: string | null) { if (!url) return ''; return /^https?:/.test(url) ? url : `${API_BASE}${url}`; }

// Sohbet metnindeki linkleri tıklanabilir yap (yeni sekmede açılır)
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
function Linkified({ text, out }: { text: string; out: boolean }) {
  const parts = String(text).split(URL_RE);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part && URL_RE.test(part)) {
          URL_RE.lastIndex = 0;
          const href = /^https?:/i.test(part) ? part : `https://${part}`;
          return (
            <a key={i} href={href} target="_blank" rel="noreferrer" className={`underline break-all ${out ? 'text-emerald-50' : 'text-sky-600'}`}>{part}</a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  connected: { t: 'Açık', c: 'bg-emerald-100 text-emerald-700' },
  qr: { t: 'QR Bekliyor', c: 'bg-amber-100 text-amber-700' },
  connecting: { t: 'Bağlanıyor', c: 'bg-sky-100 text-sky-700' },
  disconnected: { t: 'Kapalı', c: 'bg-slate-100 text-slate-500' },
  logout: { t: 'Çıkış Yapıldı', c: 'bg-red-100 text-red-700' },
};

function fmtTime(s?: string | null) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const STATUS_TR: Record<string, string> = {
  queued: 'Sırada',
  pending: 'Sırada',
  sent: 'Gönderildi',
  delivered: 'İletildi',
  read: 'Okundu',
  failed: 'İletilemedi',
};
function statusTr(s?: string | null) {
  return STATUS_TR[String(s || '')] || s || '';
}

function dayLabel(s?: string | null) {
  if (!s) return '';
  const d = new Date(s);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Bugün';
  if (d.toDateString() === yest.toDateString()) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

type QuickReply = { id?: string; baslik?: string; metin: string; kategori?: string; dil?: string; kisayol?: string; aktif?: boolean; kullanim?: number; sonKullanim?: string | null };

// Aranan kelimeyi sohbet önizlemesinde vurgula; eşleşen kısmı ortala ve işaretle
function highlightTerm(text: string, term: string) {
  if (!term) return text;
  const i = text.toLocaleLowerCase('tr-TR').indexOf(term.toLocaleLowerCase('tr-TR'));
  if (i < 0) return text;
  const start = Math.max(0, i - 18);
  const pre = (start > 0 ? '…' : '') + text.slice(start, i);
  const hit = text.slice(i, i + term.length);
  const post = text.slice(i + term.length);
  return (<>{pre}<mark className="bg-amber-200 text-slate-800 rounded px-0.5">{hit}</mark>{post}</>);
}

const DEFAULT_CHIPS: QuickReply[] = [
  { baslik: 'Ödeme bekleniyor', metin: 'Merhaba, sepetinizin ödemesi bekleniyor. Sepet linkinizden tamamlayabilirsiniz.' },
  { baslik: 'Ödeme alındı teşekkür', metin: 'Ödemeniz alınmıştır, teşekkür ederiz. Siparişiniz hazırlanıyor.' },
  { baslik: 'Kargoya verildi', metin: 'Siparişiniz kargoya verilmiştir.' },
  { baslik: 'Kargo yola çıktı', metin: 'Kargonuz yola çıkmıştır, en kısa sürede elinizde olacaktır.' },
  { baslik: 'Ürün stoğu yok', metin: 'Maalesef ilgili ürünün stoğu tükenmiştir.' },
];

function PinEditor({ templates, quickReplies, pinnedTplIds, busy, onClose, onSave }: {
  templates: { id: string; name: string; bodyText?: string; language?: string }[];
  quickReplies: QuickReply[];
  pinnedTplIds: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (qrs: QuickReply[], pinIds: string[]) => void;
}) {
  const [qrs, setQrs] = useState<QuickReply[]>(() => quickReplies.map((q) => ({ ...q })));
  const [pins, setPins] = useState<string[]>(() => [...pinnedTplIds]);
  const [nb, setNb] = useState('');
  const [nm, setNm] = useState('');

  const togglePin = (id: string) => setPins((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleQr = (i: number) => setQrs((arr) => arr.map((q, idx) => (idx === i ? { ...q, aktif: q.aktif === false } : q)));
  const delQr = (i: number) => setQrs((arr) => arr.filter((_, idx) => idx !== i));
  const addQr = () => {
    const metin = nm.trim(); if (!metin) return;
    setQrs((arr) => [...arr, { id: 'qr_' + Date.now().toString(36), baslik: nb.trim() || metin.slice(0, 22), metin, aktif: true }]);
    setNb(''); setNm('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Pencil size={17} /> Hızlı Cevap & Şablon Sabitle</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Sabitlenecek onaylı şablonlar */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><BadgeCheck size={14} className="text-emerald-600" /> Meta Onaylı Şablonlar</p>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">Onaylı şablon yok. Şablonlar sekmesinden ekleyip onaya gönderin.</p>
          ) : (
            <div className="space-y-1.5">
              {templates.map((t) => {
                const on = pins.includes(t.id);
                return (
                  <button key={t.id} onClick={() => togglePin(t.id)} className={`w-full text-left p-2.5 rounded-lg border flex items-center gap-2.5 transition ${on ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-emerald-200'}`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${on ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>{on && <CheckCircle size={12} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-slate-800 block truncate">{t.name}</span>
                      {t.bodyText && <span className="text-xs text-slate-400 block truncate">{t.bodyText}</span>}
                    </span>
                    {on && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">sabit</span>}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1.5">Sabitlenen şablonlar sohbet kutusunda tek tıkla <b>Meta onaylı</b> olarak gönderilir.</p>
        </div>

        {/* Hızlı cevaplar */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><Zap size={14} className="text-amber-500" /> Hızlı Cevaplar</p>
          <div className="space-y-1.5">
            {qrs.map((q, i) => (
              <div key={q.id || i} className={`p-2.5 rounded-lg border flex items-center gap-2.5 ${q.aktif === false ? 'border-slate-200 opacity-60' : 'border-emerald-200 bg-emerald-50/40'}`}>
                <button onClick={() => toggleQr(i)} title={q.aktif === false ? 'Sabitle (göster)' : 'Gizle'} className={`w-9 h-5 rounded-full shrink-0 relative transition ${q.aktif === false ? 'bg-slate-300' : 'bg-emerald-500'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${q.aktif === false ? 'left-0.5' : 'left-4'}`} /></button>
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-slate-800 block truncate">{q.baslik || q.metin.slice(0, 22)}</span>
                  <span className="text-xs text-slate-400 block truncate">{q.metin}</span>
                </span>
                <button onClick={() => delQr(i)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={15} /></button>
              </div>
            ))}
            {qrs.length === 0 && <p className="text-sm text-slate-400 py-2">Henüz hızlı cevap yok. Aşağıdan ekleyin.</p>}
          </div>
          <div className="mt-2.5 grid grid-cols-[160px_1fr_auto] gap-2 items-start">
            <input value={nb} onChange={(e) => setNb(e.target.value)} placeholder="Başlık (ops.)" className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100" />
            <input value={nm} onChange={(e) => setNm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addQr(); }} placeholder="Hızlı cevap metni" className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100" />
            <button onClick={addQr} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 flex items-center gap-1"><Plus size={15} /> Ekle</button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100">Vazgeç</button>
          <button onClick={() => onSave(qrs, pins)} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">{busy ? 'Kaydediliyor...' : 'Kaydet'}</button>
        </div>
      </div>
    </div>
  );
}

export default function WhatsappPaneli() {
  const [params] = useSearchParams();
  const location = useLocation();
  const phoneParam = (params.get('phone') || '').replace(/\D/g, '');
  const view: 'panel' | 'settings' =
    location.pathname.endsWith('/ayarlar') ? 'settings' : 'panel';
  const [tab, setTab] = useState<'inbox' | 'lines' | 'bulk'>('inbox');
  const [bulkPrefill, setBulkPrefill] = useState('');
  const [chatInject, setChatInject] = useState<{ link: string; ts: number } | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);

  const loadStatus = () => api.get('/whatsapp/status').then((r) => setStatus(r.data)).catch(() => {});
  const loadDash = () => api.get('/whatsapp/dashboard').then((r) => setDash(r.data)).catch(() => {});
  useEffect(() => { loadStatus(); const t = setInterval(loadStatus, 8000); return () => clearInterval(t); }, []);
  useEffect(() => { loadDash(); const t = setInterval(loadDash, 20000); return () => clearInterval(t); }, []);
  useEffect(() => { if (phoneParam) setTab('inbox'); }, [phoneParam]);

  const dstats = dash?.stats || {};
  const dlines = (dash?.lines || []) as any[];

  const headTitle = view === 'settings' ? 'Panel Ayarları' : 'WhatsApp Paneli';
  const headSub = view === 'settings'
    ? 'Otomasyonlar, şablonlar, hazır metinler ve anti-spam ayarlarını tek yerden yönetin.'
    : 'Tüm hatlardan gelen mesajlar tek kutuda. Siparişlerde otomatik bildirim, sticky hat ve anti-spam dağıtım.';

  const hat1 = dlines[0];
  const hat2 = dlines[1];

  return (
    <div className="flex flex-col gap-4 md:h-[calc(100dvh-40px)] md:min-h-[520px]">
      <div className="flex items-start gap-3 flex-wrap shrink-0">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20"><MessageCircle className="text-white" size={24} /></div>
        <div className="flex-1 min-w-[180px]">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">{headTitle}</h1>
          <p className="text-sm text-slate-400 line-clamp-1">{headSub}</p>
        </div>
        {view === 'panel' && (
          <div className="flex items-stretch gap-2 flex-wrap">
            <HatPill label="Hat 1" line={hat1} onClick={() => setTab('lines')} />
            <HatPill label="Hat 2" line={hat2} onClick={() => setTab('lines')} />
            <StatPill label="Bugün" value={`${dstats.sentToday ?? status?.sentToday ?? 0} Gönderim`} />
            <StatPill label="Başarı Oranı" value={`%${dstats.successRate ?? 100}`} />
            <StatPill label="Bekleyen Sepet" value={`${dstats.pendingCarts ?? 0}`} accent="text-rose-500" />
            <StatPill label="Ödeme Bekleyen" value={`${dstats.overdue ?? 0}`} accent="text-amber-500" />
          </div>
        )}
      </div>

      {view === 'panel' && (
        <>
          {tab === 'inbox' && (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="shrink-0"><ToolRow onBulk={() => setTab('bulk')} onSendLink={(link) => { setBulkPrefill(link); setTab('bulk'); }} onSendChat={(link) => setChatInject({ link, ts: Date.now() })} /></div>
              <Inbox_ initialPhone={phoneParam} inject={chatInject} />
            </div>
          )}
          {tab === 'lines' && (
            <div className="space-y-3 flex-1 min-h-0 md:overflow-y-auto">
              <button onClick={() => setTab('inbox')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600"><ChevronRight size={16} className="rotate-180" /> Gelen Kutusuna dön</button>
              <Lines onChange={() => { loadStatus(); loadDash(); }} />
            </div>
          )}
          {tab === 'bulk' && (
            <div className="space-y-3 flex-1 min-h-0 md:overflow-y-auto">
              <button onClick={() => setTab('inbox')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-600"><ChevronRight size={16} className="rotate-180" /> Gelen Kutusuna dön</button>
              <Bulk prefill={bulkPrefill} />
            </div>
          )}
        </>
      )}

      {view === 'settings' && <div className="flex-1 min-h-0 md:overflow-y-auto"><SettingsTab /></div>}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, badge }: any) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${active ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      <Icon size={16} /> {label}
      {badge ? <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] leading-none">{badge}</span> : null}
    </button>
  );
}

function HatPill({ label, line, onClick }: { label: string; line?: any; onClick: () => void }) {
  const ok = line && (line.connected || line.status === 'connected' || line.active);
  const exists = !!line;
  return (
    <button onClick={onClick} className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm text-left min-w-[88px] transition-all">
      <div className="text-[10px] text-slate-400 font-medium">{label}</div>
      <div className={`flex items-center gap-1 text-[13px] font-semibold ${exists ? (ok ? 'text-emerald-600' : 'text-rose-500') : 'text-slate-400'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${exists ? (ok ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500') : 'bg-slate-300'}`} />
        {exists ? (ok ? 'Bağlı' : 'Kapalı') : 'Yok'}
      </div>
    </button>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white min-w-[92px] hover:shadow-sm transition-shadow">
      <div className="text-[10px] text-slate-400 font-medium">{label}</div>
      <div className={`text-[13px] font-bold ${accent || 'text-slate-700'}`}>{value}</div>
    </div>
  );
}

const TOOLS: { icon: any; label: string; sub: string; color: string; key: string }[] = [
  { icon: Megaphone, label: 'Yayın Özeti', sub: 'Canlı yayın özeti gönder', color: 'text-violet-600 bg-violet-50', key: 'yayin' },
  { icon: LayoutGrid, label: 'Özel Katalog', sub: 'Katalog gönder', color: 'text-pink-600 bg-pink-50', key: 'katalog' },
  { icon: Receipt, label: 'Dekont Sorgula', sub: 'Dekont ara & sepete işle', color: 'text-emerald-600 bg-emerald-50', key: 'dekont' },
  { icon: BarChart3, label: 'Stok Sorgula', sub: 'Ürün stok kontrolü', color: 'text-green-600 bg-green-50', key: 'stok' },
  { icon: Clock, label: 'Sepet Hatırlat', sub: 'Sepeti hatırlat', color: 'text-amber-600 bg-amber-50', key: 'bulk' },
  { icon: LifeBuoy, label: 'Destek Talebi Aç', sub: 'Yeni destek talebi oluştur', color: 'text-rose-600 bg-rose-50', key: 'destek' },
  { icon: RefreshCw, label: 'Değişim / İade', sub: 'Değişim veya iade kodu', color: 'text-sky-600 bg-sky-50', key: 'iade' },
  { icon: FileText, label: 'Müşteri Notu', sub: 'Not ekle ve kaydet', color: 'text-slate-600 bg-slate-100', key: 'not' },
];

function ToolRow({ onBulk, onSendLink, onSendChat }: { onBulk: () => void; onSendLink: (link: string) => void; onSendChat: (link: string) => void }) {
  const [yayinOpen, setYayinOpen] = useState(false);
  const [streams, setStreams] = useState<any[]>([]);
  const [loadingY, setLoadingY] = useState(false);
  // Dekont sorgula
  const [dekontOpen, setDekontOpen] = useState(false);
  const [dekontQ, setDekontQ] = useState('');
  const [dekontRows, setDekontRows] = useState<any[]>([]);
  const [dekontLoading, setDekontLoading] = useState(false);
  const [dekontOrders, setDekontOrders] = useState<any[]>([]);
  const [dekontPick, setDekontPick] = useState<any>(null); // row being matched to an order
  const [dekontOrderQ, setDekontOrderQ] = useState('');
  const [dekontBusy, setDekontBusy] = useState(false);
  // Destek talebi
  const [destekOpen, setDestekOpen] = useState(false);
  const [destekBusy, setDestekBusy] = useState(false);
  const [destekForm, setDestekForm] = useState({ musteriAd: '', baslik: '', konu: '', detay: '' });
  const store = useStore();

  const submitDestek = async (e: any) => {
    e.preventDefault();
    if (!destekForm.baslik.trim()) { toast.error('Konu başlığı gerekli'); return; }
    setDestekBusy(true);
    try {
      await api.post('/assistant/destek-talepleri', destekForm);
      toast.success('Destek talebi oluşturuldu');
      setDestekOpen(false);
      setDestekForm({ musteriAd: '', baslik: '', konu: '', detay: '' });
    } catch (err) { toast.error(apiErrorMessage(err)); }
    finally { setDestekBusy(false); }
  };

  const openDekont = () => { setDekontOpen(true); setDekontQ(''); setDekontRows([]); setDekontPick(null); };
  const searchDekont = async (query: string) => {
    setDekontQ(query);
    if (!query.trim()) { setDekontRows([]); return; }
    setDekontLoading(true);
    try {
      const r = await api.get('/store/bank-imports', { params: { q: query, page: 1 } });
      setDekontRows(r.data.rows || []);
    } catch { toast.error('Arama hatası'); }
    finally { setDekontLoading(false); }
  };
  const loadDekontOrders = async (q2: string) => {
    setDekontOrderQ(q2);
    const all = (store.orders || []).filter((o: any) => o.durum !== 'iptal' && o.durum !== 'tamamlandi');
    if (!q2.trim()) { setDekontOrders(all); return; }
    const lq = q2.toLowerCase();
    setDekontOrders(all.filter((o: any) => (o.sipNo || '').toLowerCase().includes(lq) || (o.musteriHandle || '').toLowerCase().includes(lq) || (o.customer?.ad || '').toLowerCase().includes(lq)));
  };
  const matchDekont = async (rowId: string, orderId: string, sipNo: string) => {
    setDekontBusy(true);
    try {
      await api.post(`/store/bank-imports/${rowId}/match`, { orderId });
      toast.success(`${sipNo} siparişine ödeme işlendi`);
      setDekontPick(null);
      searchDekont(dekontQ);
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
    finally { setDekontBusy(false); }
  };
  const releaseDekont = async (rowId: string) => {
    try { await api.post(`/store/bank-imports/${rowId}/release`); toast.success('Serbest bırakıldı'); searchDekont(dekontQ); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '₺';

  const openYayin = () => {
    setYayinOpen(true);
    setLoadingY(true);
    api.get('/store/live/history')
      .then((r) => setStreams(Array.isArray(r.data) ? r.data : []))
      .catch(() => setStreams([]))
      .finally(() => setLoadingY(false));
  };
  const linkOf = (token: string) => `${location.origin}/katalog/stream/${token}`;
  const fmtY = (s?: string | null) => s ? new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  // Özel Katalog
  const [katalogOpen, setKatalogOpen] = useState(false);
  const [kataloglar, setKataloglar] = useState<any[]>([]);
  const [katalogLoading, setKatalogLoading] = useState(false);
  const [katalogSending, setKatalogSending] = useState<string | null>(null);
  const openKatalog = () => {
    setKatalogOpen(true); setKatalogLoading(true);
    api.get('/store/catalogs').then((r) => setKataloglar((r.data.rows || []).filter((c: any) => c.aktif !== false))).catch(() => setKataloglar([])).finally(() => setKatalogLoading(false));
  };
  const sendKatalog = async (catalog: any) => {
    setKatalogSending(catalog.id);
    const slug = catalog.slug || catalog.id;
    const link = `${location.origin}/ozel-katalog/${slug}`;
    const msg = `Merhaba,\nGüncel ürün kataloğumuza aşağıdaki bağlantıdan ulaşabilirsiniz.\n\n🔗 ${link}\n\nBeğendiğiniz ürünleri tek tıkla sepetinize ekleyebilir, siparişinizi hızlı ve güvenli şekilde oluşturabilirsiniz.\n\nKeyifli alışverişler dileriz. 🛍️`;
    onSendChat(msg);
    toast.success('Katalog linki sohbete gönderildi');
    setKatalogOpen(false);
    setKatalogSending(null);
  };

  // Stok Sorgula
  const [stokOpen, setStokOpen] = useState(false);
  const [stokQ, setStokQ] = useState('');
  const [stokResults, setStokResults] = useState<any[]>([]);
  const [stokSelProduct, setStokSelProduct] = useState<any>(null);
  const [stokSelVar, setStokSelVar] = useState<string>('');
  const [stokAdet, setStokAdet] = useState(1);
  const [stokCustQ, setStokCustQ] = useState('');
  const [stokCustResults, setStokCustResults] = useState<any[]>([]);
  const [stokStep, setStokStep] = useState<'search' | 'customer'>('search');
  const [stokBusy, setStokBusy] = useState(false);

  const openStok = () => { setStokOpen(true); setStokQ(''); setStokResults([]); setStokSelProduct(null); setStokStep('search'); };
  const searchStok = (q: string) => {
    setStokQ(q);
    if (!q.trim()) { setStokResults([]); return; }
    const lq = q.toLowerCase();
    const prods = (store.products || []).filter((p: any) => {
      if (p.aktif === false) return false;
      const ad = (p.ad || '').toLowerCase();
      const kod = (p.salesCode || p.satisKodu || '').toLowerCase();
      const barkod = (p.barkod || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      return ad.includes(lq) || kod.includes(lq) || barkod.includes(lq) || sku.includes(lq);
    });
    setStokResults(prods.slice(0, 30));
  };
  const selectStokProduct = (p: any) => {
    setStokSelProduct(p);
    const vars = (p.variations || []).filter((v: any) => (Number(v.stok) || 0) > 0);
    setStokSelVar(vars.length === 1 ? vars[0].deger : '');
    setStokAdet(1);
  };
  const stokAddToCart = () => {
    if (!stokSelProduct) return;
    setStokStep('customer');
    setStokCustQ('');
    setStokCustResults([]);
  };
  const searchStokCust = (q: string) => {
    setStokCustQ(q);
    if (!q.trim()) { setStokCustResults([]); return; }
    const lq = q.toLowerCase();
    const custs = (store.customers || []).filter((c: any) => {
      const ad = (c.ad || '').toLowerCase();
      const ig = (c.instagram || '').toLowerCase();
      const tel = (c.telefon || '').toLowerCase();
      return ad.includes(lq) || ig.includes(lq) || tel.includes(lq);
    });
    setStokCustResults(custs.slice(0, 20));
  };
  const stokCreateOrder = async (customer: any) => {
    if (!stokSelProduct || stokBusy) return;
    setStokBusy(true);
    try {
      const p = stokSelProduct;
      const v = stokSelVar;
      const adet = stokAdet;
      // Stok kontrolü
      if (v) {
        const vr = (p.variations || []).find((x: any) => x.deger === v);
        if (!vr || (Number(vr.stok) || 0) < adet) { toast.error('Stok yetersiz'); setStokBusy(false); return; }
      } else {
        if ((Number(p.stokAdeti) || 0) < adet) { toast.error('Stok yetersiz'); setStokBusy(false); return; }
      }
      const satisFiyat = Number(p.satisFiyat) || 0;
      const alisFiyat = Number(p.alisFiyat) || 0;
      const item = { productId: p.id, ad: p.ad, satisKodu: p.salesCode || p.satisKodu || '', barkod: p.barkod || '', gorsel: (p.images || [])[0] || p.gorsel || '', varyasyon: v || '', adet, birimFiyat: satisFiyat, alisFiyat, toplam: satisFiyat * adet, stokDusuldu: false };

      // Açık sepet var mı kontrol et
      const openOrder = (store.orders || []).find((o: any) => o.customerId === customer.id && o.durum !== 'iptal' && o.durum !== 'tamamlandi');
      if (openOrder) {
        // Mevcut sepete ekle
        const existingItems = Array.isArray(openOrder.items) ? [...openOrder.items] : [];
        existingItems.push(item);
        const araToplam = existingItems.reduce((s: number, it: any) => s + (Number(it.toplam) || 0), 0);
        const indirim = Number(openOrder.indirim) || 0;
        const kargo = Number(openOrder.kargoUcreti) || 0;
        await api.patch(`/store/orders/${openOrder.id}`, { items: existingItems, araToplam, toplam: araToplam - indirim + kargo, _log: `Stok sorguladan ürün eklendi: ${p.ad} ${v ? `(${v})` : ''} x${adet}` });
        toast.success(`${p.ad} ${v ? `(${v})` : ''} → ${openOrder.sipNo || 'sepet'} eklendi`);
      } else {
        // Yeni sepet oluştur
        const araToplam = satisFiyat * adet;
        await api.post('/store/orders', {
          customerId: customer.id,
          musteriHandle: customer.instagram || customer.ad || '',
          items: [item],
          araToplam,
          toplam: araToplam,
          durum: 'acik',
          kanal: 'whatsapp',
        });
        toast.success(`${p.ad} ${v ? `(${v})` : ''} → Yeni sepet oluşturuldu`);
      }
      store.reload?.();
      setStokOpen(false); setStokSelProduct(null); setStokStep('search');
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
    finally { setStokBusy(false); }
  };

  const handleClick = (key: string) => {
    if (key === 'bulk') onBulk();
    else if (key === 'yayin') openYayin();
    else if (key === 'dekont') openDekont();
    else if (key === 'katalog') openKatalog();
    else if (key === 'stok') openStok();
    else if (key === 'destek') setDestekOpen(true);
    else toast('Bu özellik yakında etkinleşecek');
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
      {TOOLS.map((t) => (
        <button
          key={t.key}
          onClick={() => handleClick(t.key)}
          className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm transition text-left"
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${t.color}`}><t.icon size={18} /></div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-700 truncate">{t.label}</div>
            <div className="text-[10px] text-slate-400 truncate">{t.sub}</div>
          </div>
        </button>
      ))}

      {destekOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setDestekOpen(false)}>
          <form onSubmit={submitDestek} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><LifeBuoy size={18} /></div>
                <div className="font-semibold text-slate-800">Destek Talebi Aç</div>
              </div>
              <button type="button" onClick={() => setDestekOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-500">Konu Başlığı *</label>
                <input value={destekForm.baslik} onChange={(e) => setDestekForm({ ...destekForm, baslik: e.target.value })} placeholder="Örn: Kargo entegrasyon hatası" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-200 outline-none" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500">Kategori</label>
                  <select value={destekForm.konu} onChange={(e) => setDestekForm({ ...destekForm, konu: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white outline-none">
                    <option value="">Genel</option>
                    <option value="teknik">Teknik</option>
                    <option value="fatura">Fatura / Ödeme</option>
                    <option value="siparis">Sipariş</option>
                    <option value="kargo">Kargo</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Müşteri Adı (opsiyonel)</label>
                  <input value={destekForm.musteriAd} onChange={(e) => setDestekForm({ ...destekForm, musteriAd: e.target.value })} placeholder="İlgili müşteri" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500">Mesaj / Detay</label>
                <textarea value={destekForm.detay} onChange={(e) => setDestekForm({ ...destekForm, detay: e.target.value })} rows={4} placeholder="Talebinizi detaylandırın..." className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button type="button" onClick={() => setDestekOpen(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50">Vazgeç</button>
              <button type="submit" disabled={destekBusy} className="px-5 py-2 text-sm bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 disabled:opacity-60">{destekBusy ? 'Gönderiliyor...' : 'Talebi Oluştur'}</button>
            </div>
          </form>
        </div>
      )}

      {yayinOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setYayinOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><Megaphone size={18} /></div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Yayın Özeti & Katalog Linki</h3>
                  <p className="text-[11px] text-slate-400">Son 5 canlı yayını seçip katalog linkini gönderin.</p>
                </div>
              </div>
              <button onClick={() => setYayinOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2.5">
              {loadingY ? (
                <p className="text-sm text-slate-400 text-center py-8">Yükleniyor…</p>
              ) : streams.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Henüz tamamlanmış canlı yayın yok.</p>
              ) : streams.slice(0, 5).map((s) => (
                <div key={s.id} className="border border-slate-200 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-700 text-sm truncate">{s.baslik || 'Canlı Yayın'}</p>
                      <p className="text-[11px] text-slate-400">{fmtY(s.endedAt || s.startedAt)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium">{s.siparis || 0} sipariş</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{(s.ciro || 0).toLocaleString('tr-TR')} ₺</span>
                    </div>
                  </div>
                  {s.token ? (
                    <>
                      <div className="mt-2 flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5">
                        <Link2 size={13} className="text-slate-400 shrink-0" />
                        <span className="text-[11px] text-slate-500 truncate flex-1">{linkOf(s.token)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button onClick={() => { navigator.clipboard?.writeText(linkOf(s.token)); toast.success('Katalog linki kopyalandı'); }} className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 py-1.5 rounded-lg"><Copy size={13} /> Kopyala</button>
                        <button onClick={() => { onSendChat(linkOf(s.token)); setYayinOpen(false); }} className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-violet-500 hover:bg-violet-600 py-1.5 rounded-lg"><MessageCircle size={13} /> Sohbete Gönder</button>
                        <button onClick={() => { onSendLink(linkOf(s.token)); setYayinOpen(false); toast.success('Katalog linki toplu mesaja aktarıldı'); }} className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 py-1.5 rounded-lg"><Send size={13} /> Topluya</button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-[11px] text-amber-500">Bu yayın için katalog linki yok.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dekont Sorgula Modal */}
      {dekontOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => { setDekontOpen(false); setDekontPick(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Receipt size={18} /></div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Dekont Sorgula</h3>
                  <p className="text-[11px] text-slate-400">Ref no, açıklama veya sipariş no ile arama yapın</p>
                </div>
              </div>
              <button onClick={() => { setDekontOpen(false); setDekontPick(null); }} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input autoFocus value={dekontQ} onChange={(e) => searchDekont(e.target.value)} placeholder="Ref no, açıklama, sipariş no ara..." className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-100" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {dekontLoading ? <p className="text-sm text-slate-400 text-center py-8">Aranıyor...</p>
               : !dekontQ.trim() ? <p className="text-sm text-slate-400 text-center py-8">Arama yapmak için ref no, açıklama veya sipariş numarası yazın</p>
               : dekontRows.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Sonuç bulunamadı</p>
               : dekontRows.map((r) => {
                const matchedOrd = r.orderId ? (store.orders || []).find((o: any) => o.id === r.orderId) : null;
                const suggestedOrd = !r.orderId && r.suggestedOrderId ? (store.orders || []).find((o: any) => o.id === r.suggestedOrderId) : null;
                return (
                  <div key={r.id} className={`border rounded-xl p-3 ${r.orderId ? 'border-green-200 bg-green-50/30' : r.suggestedOrderId ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-emerald-700 text-sm">{fmt(r.tutar)}</span>
                          <span className="text-xs text-slate-400">{r.tarih}{r.saat ? ` ${r.saat}` : ''}</span>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{r.refNo}</span>
                          {r.orderId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">İşlendi → {r.orderSipNo || '?'}</span>}
                          {!r.orderId && r.suggestedOrderId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium border border-orange-200">Eşleşme: {r.suggestedSipNo || '?'}</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-1 truncate" title={r.aciklama}>{r.aciklama}</p>
                        {matchedOrd && <p className="text-[11px] text-green-600 mt-1">Sepet: {matchedOrd.sipNo} · {matchedOrd.musteriHandle || matchedOrd.customer?.ad || '-'} · Toplam: {fmt(Number(matchedOrd.toplam) || 0)}</p>}
                        {suggestedOrd && <p className="text-[11px] text-orange-600 mt-1">Önerilen: {suggestedOrd.sipNo} · {suggestedOrd.musteriHandle || suggestedOrd.customer?.ad || '-'} · Toplam: {fmt(Number(suggestedOrd.toplam) || 0)}</p>}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {r.orderId ? (
                          <button onClick={() => releaseDekont(r.id)} className="px-2.5 py-1.5 text-[11px] font-medium border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 flex items-center gap-1"><X size={12} /> Serbest Bırak</button>
                        ) : r.suggestedOrderId ? (<>
                          <button disabled={dekontBusy} onClick={() => matchDekont(r.id, r.suggestedOrderId, r.suggestedSipNo || '?')} className="px-2.5 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"><CheckCircle size={12} /> Onayla & İşle</button>
                          <button onClick={() => { setDekontPick(r); setDekontOrderQ(''); loadDekontOrders(''); }} className="px-2.5 py-1.5 text-[11px] font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-1"><Search size={12} /> Başka Sepet</button>
                        </>) : (
                          <button onClick={() => { setDekontPick(r); setDekontOrderQ(''); loadDekontOrders(''); }} className="px-2.5 py-1.5 text-[11px] font-medium border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-1"><Search size={12} /> Sepet Seç</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Dekont → Sepet Seçici */}
      {dekontPick && (
        <div className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center p-4" onClick={() => setDekontPick(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Sepet Seç & İşle</h3>
                <p className="text-[11px] text-slate-400">{fmt(dekontPick.tutar)} · {dekontPick.refNo}</p>
              </div>
              <button onClick={() => setDekontPick(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input autoFocus value={dekontOrderQ} onChange={(e) => loadDekontOrders(e.target.value)} placeholder="Sipariş no, müşteri adı ara..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-100" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {dekontOrders.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Açık sepet bulunamadı</p>
              : dekontOrders.slice(0, 30).map((o) => {
                const kalan = (Number(o.toplam) || 0) - (Number(o.tahsilat) || 0);
                const isSuggested = dekontPick.suggestedOrderId === o.id;
                return (
                  <div key={o.id} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border cursor-pointer hover:shadow-sm transition ${isSuggested ? 'border-orange-300 bg-orange-50' : 'border-slate-200 bg-white hover:border-emerald-200'}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sm text-slate-700">{o.sipNo || o.id.slice(-6)}</span>
                        {isSuggested && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-200 text-orange-700 font-medium">Önerilen</span>}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{o.musteriHandle || o.customer?.ad || '-'}</p>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span>Toplam: {fmt(Number(o.toplam) || 0)}</span>
                        {kalan > 0.01 && <span className="text-red-500 font-medium">Kalan: {fmt(kalan)}</span>}
                      </div>
                    </div>
                    <button disabled={dekontBusy} onClick={() => matchDekont(dekontPick.id, o.id, o.sipNo || '?')} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 shrink-0">İşle</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stok Sorgula Modal */}
      {stokOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setStokOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center"><BarChart3 size={18} /></div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{stokStep === 'search' ? 'Stok Sorgula' : 'Müşteri Seç'}</h3>
                  <p className="text-[11px] text-slate-400">{stokStep === 'search' ? 'Satış kodu veya ürün adı ile arama yapın' : 'Siparişi eklemek için müşteri seçin'}</p>
                </div>
              </div>
              <button onClick={() => setStokOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            {stokStep === 'search' && (<>
              <div className="px-5 py-3 border-b border-slate-100">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input autoFocus value={stokQ} onChange={(e) => searchStok(e.target.value)} placeholder="Satış kodu, ürün adı veya barkod ile ara..." className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-100" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {!stokQ.trim() ? <p className="text-sm text-slate-400 text-center py-8">Satış kodu veya ürün adı yazarak stok sorgulayın</p>
                 : stokResults.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Ürün bulunamadı</p>
                 : stokResults.map((p) => {
                  const vars = (p.variations || []).filter((v: any) => (Number(v.stok) || 0) > 0);
                  const totalStok = vars.length > 0 ? vars.reduce((s: number, v: any) => s + (Number(v.stok) || 0), 0) : (Number(p.stokAdeti) || 0);
                  const isSelected = stokSelProduct?.id === p.id;
                  return (
                    <div key={p.id} className={`border rounded-xl overflow-hidden transition ${isSelected ? 'border-green-400 bg-green-50/30 shadow-sm' : 'border-slate-200 bg-white hover:border-green-200'}`}>
                      <div className="flex items-center gap-3 p-3 cursor-pointer" onClick={() => selectStokProduct(p)}>
                        {((p.images || [])[0] || p.gorsel) && <img src={(p.images || [])[0] || p.gorsel} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-100" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-800 truncate">{p.ad}</span>
                            {(p.salesCode || p.satisKodu) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-mono font-medium">{p.salesCode || p.satisKodu}</span>}
                            {p.barkod && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-mono">{p.barkod}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] flex-wrap">
                            <span className="font-bold text-green-700">{Number(p.satisFiyat || 0).toLocaleString('tr-TR')} ₺</span>
                            {Number(p.alisFiyat || 0) > 0 && <span className="text-slate-400">Alış: {Number(p.alisFiyat).toLocaleString('tr-TR')} ₺</span>}
                            {p.marka && <span className="text-slate-400">{p.marka}</span>}
                            <span className={`px-1.5 py-0.5 rounded-full font-medium ${totalStok > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                              {totalStok > 0 ? `${totalStok} adet stok` : 'Stok yok'}
                            </span>
                          </div>
                        </div>
                        <ChevronRight size={16} className={`text-slate-300 shrink-0 transition ${isSelected ? 'rotate-90' : ''}`} />
                      </div>

                      {isSelected && totalStok > 0 && (
                        <div className="px-3 pb-3 border-t border-slate-100 pt-3 space-y-3">
                          {vars.length > 0 ? (
                            <div>
                              <p className="text-[11px] font-medium text-slate-500 mb-1.5">Beden / Varyasyon</p>
                              <div className="flex flex-wrap gap-1.5">
                                {vars.map((v: any) => (
                                  <button key={v.id} onClick={() => setStokSelVar(v.deger)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${stokSelVar === v.deger ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-green-300'}`}>
                                    {v.deger} <span className="text-[10px] text-slate-400 ml-1">({v.stok})</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500">Stok: {totalStok} adet</p>
                          )}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-slate-500">Adet:</span>
                              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                                <button onClick={() => setStokAdet(Math.max(1, stokAdet - 1))} className="px-2 py-1 text-sm text-slate-500 hover:bg-slate-50">-</button>
                                <span className="px-3 py-1 text-sm font-medium text-slate-700 bg-slate-50 min-w-[2rem] text-center">{stokAdet}</span>
                                <button onClick={() => { const maxS = stokSelVar ? (vars.find((v: any) => v.deger === stokSelVar)?.stok || 1) : totalStok; setStokAdet(Math.min(maxS, stokAdet + 1)); }} className="px-2 py-1 text-sm text-slate-500 hover:bg-slate-50">+</button>
                              </div>
                            </div>
                            <div className="text-sm font-bold text-green-700 ml-auto">{(Number(p.satisFiyat || 0) * stokAdet).toLocaleString('tr-TR')} ₺</div>
                            <button disabled={vars.length > 0 && !stokSelVar} onClick={stokAddToCart} className="px-4 py-2 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5">
                              <ShoppingCart size={13} /> Sipariş Oluştur
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>)}

            {stokStep === 'customer' && (<>
              <div className="px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => setStokStep('search')} className="text-sm text-slate-500 hover:text-green-600 flex items-center gap-1"><ChevronLeft size={14} /> Geri</button>
                  <span className="text-[11px] text-slate-400">Ürün: {stokSelProduct?.ad} {stokSelVar ? `(${stokSelVar})` : ''} x{stokAdet}</span>
                </div>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input autoFocus value={stokCustQ} onChange={(e) => searchStokCust(e.target.value)} placeholder="Müşteri adı, Instagram veya telefon ile ara..." className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-100" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                {!stokCustQ.trim() ? <p className="text-sm text-slate-400 text-center py-8">Müşteri adı, Instagram veya telefon yazarak arama yapın</p>
                 : stokCustResults.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Müşteri bulunamadı</p>
                 : stokCustResults.map((c) => {
                  const openOrd = (store.orders || []).find((o: any) => o.customerId === c.id && o.durum !== 'iptal' && o.durum !== 'tamamlandi');
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-green-200 hover:shadow-sm transition">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-slate-800 truncate">{c.ad || c.instagram || '-'}</div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          {c.instagram && <span>@{c.instagram.replace(/^@/, '')}</span>}
                          {c.telefon && <span>{c.telefon}</span>}
                        </div>
                        {openOrd && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium mt-1 inline-block">Açık sepet: {openOrd.sipNo || '?'}</span>}
                      </div>
                      <button disabled={stokBusy} onClick={() => stokCreateOrder(c)} className="px-3 py-2 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 shrink-0 flex items-center gap-1.5">
                        {stokBusy ? <span className="animate-spin">⏳</span> : <ShoppingCart size={13} />}
                        {openOrd ? 'Sepete Ekle' : 'Yeni Sepet'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* Özel Katalog Modal */}
      {katalogOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => setKatalogOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><LayoutGrid size={18} /></div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Katalog Gönder</h3>
                  <p className="text-[11px] text-slate-400">Aktif katalog seçin, sohbete link olarak gönderilecek</p>
                </div>
              </div>
              <button onClick={() => setKatalogOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {katalogLoading ? <p className="text-sm text-slate-400 text-center py-8">Yükleniyor...</p>
               : kataloglar.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Aktif katalog bulunamadı</p>
               : kataloglar.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-violet-200 hover:shadow-sm transition">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-slate-800 truncate">{c.ad}</div>
                    <div className="text-[11px] text-slate-400">{c.slug ? `diljar.com/ozel-katalog/${c.slug}` : '—'}</div>
                  </div>
                  <button disabled={katalogSending === c.id} onClick={() => sendKatalog(c)} className="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0 flex items-center gap-1"><Send size={12} /> Sohbete Gönder</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gelen Kutusu ───────────────────────────────────────────────────────────────
function Inbox_({ initialPhone, inject }: { initialPhone?: string; inject?: { link: string; ts: number } | null }) {
  const [convos, setConvos] = useState<Convo[]>([]);
  const [q, setQ] = useState(initialPhone || '');
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed' | ''>('');
  const [inboxFilter, setInboxFilter] = useState<'' | 'unanswered'>('');
  const [sel, setSel] = useState<Convo | null>(null);
  const [autoDone, setAutoDone] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const MSG_PAGE = 50; // ilk render'da gösterilecek son mesaj sayısı (ağır yükleme performansı)
  const [msgLimit, setMsgLimit] = useState(MSG_PAGE);
  const [convMeta, setConvMeta] = useState<any>(null);
  const [text, setText] = useState('');
  // Taslaklar konuşma bazlı tutulur: A'da yazılan metin B'ye geçince taşınmaz
  const draftsRef = useRef<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [viaQr, setViaQr] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSug, setAiSug] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<Convo | null>(null);
  // Yeni özellikler
  const [imgModal, setImgModal] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [newChat, setNewChat] = useState<{ phone: string; body: string; templateId?: string } | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [paymentFilter, setPaymentFilter] = useState('');
  const [notesView, setNotesView] = useState(false);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [tagInput, setTagInput] = useState('');
  const [custModal, setCustModal] = useState<{ instagram: string; ad: string } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [custBusy, setCustBusy] = useState(false);
  const [activeCart, setActiveCart] = useState<any>(null);
  // Dekont sorgula (mesajdan tıklama)
  const [dekontModal, setDekontModal] = useState(false);
  const [dekontQ, setDekontQ] = useState('');
  const [dekontRows, setDekontRows] = useState<any[]>([]);
  const [dekontLoading, setDekontLoading] = useState(false);
  const [dekontPick, setDekontPick] = useState<any>(null);
  const [dekontOrderQ, setDekontOrderQ] = useState('');
  const [dekontBusy, setDekontBusy] = useState(false);
  const searchDekont = async (query: string) => {
    setDekontQ(query);
    if (!query.trim()) { setDekontRows([]); return; }
    setDekontLoading(true);
    try { const r = await api.get('/store/bank-imports', { params: { q: query, page: 1 } }); setDekontRows(r.data.rows || []); } catch { toast.error('Arama hatası'); } finally { setDekontLoading(false); }
  };
  const openDekontFromMsg = () => {
    setDekontModal(true); setDekontPick(null);
    // Otomatik sorgula: açık sepetin sipNo'su veya müşteri adı ile
    const autoQ = activeCart?.sipNo || sel?.customerName || '';
    if (autoQ) { searchDekont(autoQ); } else { setDekontQ(''); setDekontRows([]); }
  };
  const matchDekontInline = async (rowId: string, orderId: string, sipNo: string) => {
    setDekontBusy(true);
    try { await api.post(`/store/bank-imports/${rowId}/match`, { orderId }); toast.success(`${sipNo} siparişine ödeme işlendi`); setDekontPick(null); searchDekont(dekontQ); } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setDekontBusy(false); }
  };
  const releaseDekontInline = async (rowId: string) => {
    try { await api.post(`/store/bank-imports/${rowId}/release`); toast.success('Serbest bırakıldı'); searchDekont(dekontQ); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const fmtTL = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '₺';
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [pinnedTplIds, setPinnedTplIds] = useState<string[]>([]);
  const [pinEdit, setPinEdit] = useState(false);
  const [savingPins, setSavingPins] = useState(false);
  const store: any = useStore();

  const loadTags = () => api.get('/whatsapp/conversation-tags').then((r) => setAllTags(r.data.tags || [])).catch(() => {});
  useEffect(() => { loadTags(); }, []);
  useEffect(() => {
    api.get('/whatsapp/settings').then((r) => {
      const s = r.data?.settings || {};
      setQuickReplies(Array.isArray(s.hazirCevaplar) ? s.hazirCevaplar : []);
      setPinnedTplIds(Array.isArray(s.sabitSablonlar) ? s.sabitSablonlar : []);
    }).catch(() => {});
    api.get('/whatsapp/templates').then((r) => setTemplates((r.data?.templates || []).filter((t: Template) => t.status === 'approved'))).catch(() => {});
  }, []);

  const savePins = async (qrs: QuickReply[], pinIds: string[]) => {
    setSavingPins(true);
    try {
      await api.put('/whatsapp/settings', { hazirCevaplar: qrs, sabitSablonlar: pinIds });
      setQuickReplies(qrs); setPinnedTplIds(pinIds);
      toast.success('Sabitlenenler kaydedildi'); setPinEdit(false);
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
    finally { setSavingPins(false); }
  };

  const convosSigRef = useRef('');
  const loadConvos = () => api.get('/whatsapp/conversations', { params: { q, status: statusFilter, inbox: inboxFilter, tag: tagFilter, payment: paymentFilter, notes: notesView ? 'yes' : '' } }).then((r) => {
    const list: Convo[] = r.data.conversations || [];
    // Performans: veri değişmediyse setState yapma (5sn polling'de gereksiz re-render önlenir)
    const sig = JSON.stringify(list);
    if (sig === convosSigRef.current) return;
    convosSigRef.current = sig;
    setConvos(list);
  }).catch((e) => console.warn('[WA] loadConvos hata:', e?.message || e));
  // O1: interval her zaman EN GÜNCEL loadConvos'u çağırsın (q/filtre değişince stale kapatma olmasın)
  const loadConvosRef = useRef(loadConvos);
  loadConvosRef.current = loadConvos;
  // O1: filtre/q değişince listeyi yenile — q için ~350ms debounce (her tuşta backend dövülmez).
  // Diğer filtreler (dropdown/toggle) anında; sadece q yazımı debounce'lanır.
  useEffect(() => {
    const delay = 350;
    const t = setTimeout(() => loadConvosRef.current(), delay);
    return () => clearTimeout(t);
  }, [q, statusFilter, inboxFilter, tagFilter, paymentFilter, notesView]);
  // O1: polling AYRI effect — q/filtre bağımlılığı yok; interval teardown/kurulum yaşamaz.
  useEffect(() => { const t = setInterval(() => loadConvosRef.current(), 5000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (autoDone || !initialPhone || sel || !convos.length) return;
    const hit = convos.find((c) => c.customerPhone.replace(/\D/g, '').endsWith(initialPhone.slice(-10)));
    if (hit) { setSel(hit); setAutoDone(true); }
  }, [convos, initialPhone, sel, autoDone]);

  // Yayın Özeti "Sohbete Gönder": seçili sohbetin mesaj kutusuna katalog linkini ekler
  const injectTs = useRef(0);
  useEffect(() => {
    if (!inject || inject.ts === injectTs.current) return;
    injectTs.current = inject.ts;
    if (!sel) { toast.error('Önce bir sohbet açın, sonra linki gönderin'); return; }
    setText((t) => (t ? `${t} ${inject.link}` : inject.link));
    toast.success('Katalog linki sohbete eklendi — Gönder ile iletin');
  }, [inject, sel]);

  // Aktif konuşma id'si (fetch yarış koruması) — senkron güncellenir
  const activeIdRef = useRef<string | null>(null);
  // BASİT + DOĞRU: her çağrıda sunucudan gelen mesajları state'e yaz.
  // Tek koruma: fetch dönene kadar aktif konuşma değiştiyse yazma (yanlış sohbete yazmayı önler).
  const loadMsgs = (c: Convo, opts?: { showLoading?: boolean }) => {
    const convId = c.id;
    if (opts?.showLoading) setMsgsLoading(true);
    api.get(`/whatsapp/conversations/${convId}/messages`).then((r) => {
      // RACE GUARD: cevap dönene kadar aktif konuşma değiştiyse state'i yazma.
      if (activeIdRef.current !== convId) return;
      const server: Msg[] = r.data.messages || [];
      // OPTIMISTIK BİRLEŞTİRME (saf): bekleyen __opt_ mesajları, sunucuda henüz yoksa sona ekle.
      // Sunucuda aynı mesaj varsa (id eşit ya da body+~zaman yakınsa) opt'u düşür.
      setMsgs((prev) => {
        const pending = prev.filter((m) => m.id.startsWith('__opt_'));
        if (!pending.length) return server;
        const kept = pending.filter((o) => {
          const ot = new Date(o.createdAt).getTime();
          const dup = server.some((s) =>
            s.id === o.id ||
            (s.direction === 'out' && (s.body || '') === (o.body || '') &&
              Math.abs(new Date(s.createdAt).getTime() - ot) < 120000)
          );
          return !dup;
        });
        return kept.length ? [...server, ...kept] : server;
      });
      setConvMeta(r.data.conversation || null);
    }).catch((e) => console.warn('[WA] loadMsgs hata:', e?.message || e))
      .finally(() => { if (opts?.showLoading && activeIdRef.current === convId) setMsgsLoading(false); });
  };
  // selRef ve activeIdRef her zaman güncel sel'i tutsun (polling + fetch yarış koruması)
  useEffect(() => { selRef.current = sel; activeIdRef.current = sel?.id ?? null; }, [sel]);
  // Konuşma seçimi: eski mesaj/taslak/durumu ANINDA temizle, yeni konuşmanın taslağını yükle
  const selectConvo = (c: Convo) => {
    if (sel?.id === c.id) return;
    // Mevcut taslağı konuşma bazlı sakla
    if (sel) draftsRef.current[sel.id] = text;
    activeIdRef.current = c.id; // yarış koruması senkron güncellensin
    setSel(c);
    setMsgs([]);            // eski konuşmanın mesajlarını hemen gizle
    setMsgLimit(MSG_PAGE);  // yeni konuşmada son N mesajdan başla
    setConvMeta(null);
    setReplyTo(null);
    setAiSug(null);
    setActiveCart(null);
    setMenuFor(null);
    setText(draftsRef.current[c.id] || ''); // yeni konuşmanın kendi taslağı
  };
  // Sohbet açılınca OTOMATİK okundu yapılmaz; yalnızca cevap gönderince veya "Cevaplandı" ile işaretlenir
  const markAnswered = async (id: string) => {
    try { await api.post(`/whatsapp/conversations/${id}/read`); loadConvos(); setSel((s) => (s && s.id === id ? { ...s, unread: 0 } : s)); setConvMeta((m: any) => (m && m.id === id ? { ...m, unread: 0 } : m)); } catch {}
  };
  // Konuşma değişince (selectConvo veya initialPhone auto-select) mesajları KESİN yükle.
  useEffect(() => {
    if (!sel) return;
    activeIdRef.current = sel.id; // guard senkron doğru id'de olsun (auto-select yolu için de)
    loadMsgs(sel, { showLoading: true });
  }, [sel?.id]);
  // Açık sepet bilgisini yükle
  useEffect(() => {
    if (!sel) { setActiveCart(null); return; }
    const convId = sel.id;
    setActiveCart(null);
    api.get(`/whatsapp/conversations/${convId}/cart`).then((r) => {
      if (activeIdRef.current !== convId) return; // yarış koruması
      const c = r.data.cart;
      if (c && !c.empty && c.id) {
        const ord = (store.orders || []).find((o: any) => o.id === c.id);
        setActiveCart(ord || c);
      }
    }).catch(() => {});
  }, [sel?.id, store.orders]);
  useEffect(() => {
    if (!sel) return;
    const t = setInterval(() => { const cur = selRef.current; if (cur) loadMsgs(cur); }, 5000);
    return () => clearInterval(t);
  }, [sel?.id]);
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => endRef.current?.scrollIntoView({ behavior });
  useEffect(() => { scrollToBottom('auto'); }, [msgs.length, sel?.id]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(dist > 240);
  };

  const send = async () => {
    if (!sel || !text.trim()) return;
    const msgBody = text.trim();
    const cur = sel;
    const convId = sel.id;               // K1: gönderim sırasındaki konuşma id'si
    const savedReplyTo = replyTo;        // D4: hata durumunda geri yüklemek için
    // D4: metin/taslak SADECE başarıda temizlenir (aşağıda). Hata olursa korunur.
    setSending(true);
    try {
      await api.post(`/whatsapp/conversations/${convId}/send`, { body: msgBody, channel: viaQr ? 'qr' : undefined, replyToId: replyTo?.id || undefined });
      // K1: await sonrası konuşma değişmediyse ekrana/kutuya yaz
      if (activeIdRef.current === convId) {
        setText(''); delete draftsRef.current[convId]; setReplyTo(null);
      } else {
        // Başka sohbete geçildi: taslağı bu konuşmaya sakla, ama aktif metni bozma
        delete draftsRef.current[convId];
      }
      toast.success(viaQr ? 'QR (Baileys) hattından kuyruğa eklendi' : 'Gönderiliyor');
      // Optimistik güncelleme: mesajı hemen göster (yalnızca hâlâ bu sohbetteysek)
      const optimistic: Msg = { id: '__opt_' + Date.now(), direction: 'out', body: msgBody, status: 'sending', createdAt: new Date().toISOString(), sentByName: null };
      if (activeIdRef.current === convId) { setMsgs((prev) => [...prev, optimistic]); }
      markAnswered(convId);
      // processOutbox async çalışır, birden fazla retry ile mesajları yükle (loadMsgs kendi guard'ıyla korunur)
      setTimeout(() => loadMsgs(cur), 800);
      setTimeout(() => loadMsgs(cur), 2500);
      setTimeout(() => loadMsgs(cur), 5000);
    } catch (e: any) {
      toast.error(apiErrorMessage(e));
      // D4: hata olursa yazılan metni + taslağı geri yükle (yalnızca hâlâ bu sohbetteysek)
      if (activeIdRef.current === convId) { setText(msgBody); setReplyTo(savedReplyTo); }
      else { draftsRef.current[convId] = msgBody; }
    } finally { setSending(false); }
  };

  // AI cevap önerisi: gelen son mesaja göre öneri üret
  const suggestAI = async () => {
    if (!sel || aiBusy) return;
    setAiBusy(true); setAiSug(null);
    try {
      const r = await api.post(`/whatsapp/conversations/${sel.id}/suggest`);
      if (r.data.suggestion) setAiSug(r.data.suggestion);
      else toast.error(r.data.reason || 'Öneri üretilemedi.');
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setAiBusy(false); }
  };
  const react = async (m: Msg, emoji: string) => {
    setMenuFor(null);
    if (!sel) return;
    const convId = sel.id;               // K1: işlem sırasındaki konuşma id'si
    const next = m.reaction === emoji ? '' : emoji;
    setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, reaction: next || null } : x)));
    try { await api.post(`/whatsapp/messages/${m.id}/react`, { emoji: next }); }
    catch (e: any) { toast.error(apiErrorMessage(e)); if (activeIdRef.current === convId) { const cur = sel; setTimeout(() => loadMsgs(cur), 300); } }
  };

  // Mesajı sil (giden) — QR'da herkesten, API'de panelden gizler
  const delMsg = async (m: Msg) => {
    setMenuFor(null);
    if (!sel) return;
    if (!window.confirm('Bu mesaj silinsin mi?')) return;
    const convId = sel.id;               // K1: işlem sırasındaki konuşma id'si
    setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, deleted: true } : x)));
    try {
      const r = await api.delete(`/whatsapp/messages/${m.id}`);
      toast.success(r.data?.everyone ? 'Mesaj herkesten silindi' : 'Mesaj panelden gizlendi (resmi API silmeyi desteklemez)');
    } catch (e: any) { toast.error(apiErrorMessage(e)); if (activeIdRef.current === convId) { const cur = sel; setTimeout(() => loadMsgs(cur), 300); } }
  };

  const attachFile = async (f: File) => {
    if (!sel) return;
    if (f.size > 15 * 1024 * 1024) { toast.error('Dosya 15MB sınırını aşıyor'); return; }
    const cur = sel;
    const convId = sel.id;               // K1: işlem sırasındaki konuşma id'si
    const capBody = text.trim();         // D4: caption metni (hata durumunda geri yüklenir)
    const savedReplyTo = replyTo;
    const reader = new FileReader();
    reader.onload = async () => {
      setSending(true);
      try {
        await api.post(`/whatsapp/conversations/${convId}/send`, { body: capBody, mediaDataUrl: reader.result, fileName: f.name, channel: viaQr ? 'qr' : undefined, replyToId: replyTo?.id || undefined });
        // K1 + D4: başarı + hâlâ aynı sohbet → metin/taslak temizle
        if (activeIdRef.current === convId) { setText(''); delete draftsRef.current[convId]; setReplyTo(null); }
        else { delete draftsRef.current[convId]; }
        toast.success('Dosya kuyruğa eklendi');
        markAnswered(convId);
        setTimeout(() => loadMsgs(cur), 800);
        setTimeout(() => loadMsgs(cur), 2500);
        setTimeout(() => loadMsgs(cur), 5000);
      } catch (e: any) {
        toast.error(apiErrorMessage(e));
        // D4: hata → caption metnini geri yükle
        if (activeIdRef.current === convId) { setText(capBody); setReplyTo(savedReplyTo); }
        else if (capBody) { draftsRef.current[convId] = capBody; }
      } finally { setSending(false); }
    };
    reader.readAsDataURL(f);
  };

  const askPayment = async () => {
    if (!sel) return;
    try { await api.post(`/whatsapp/conversations/${sel.id}/payment`, {}); toast.success('Ödeme isteği kuyruğa eklendi'); setTimeout(() => loadMsgs(sel), 800); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const toggleClose = async () => {
    if (!sel) return;
    const closing = !sel.closed;
    try {
      await api.post(`/whatsapp/conversations/${sel.id}/${closing ? 'close' : 'reopen'}`);
      toast.success(closing ? 'Sohbet kapatıldı' : 'Sohbet yeniden açıldı');
      setSel({ ...sel, closed: closing }); loadConvos();
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  // Yeni sohbet: numaraya ilk mesajı gönder (serbest metin veya Meta onaylı şablon)
  const startNewChat = async () => {
    if (!newChat) return;
    const phone = newChat.phone.replace(/\D/g, '');
    if (phone.length < 10) { toast.error('Geçerli numara girin'); return; }
    if (!newChat.templateId && !newChat.body.trim()) { toast.error('Mesaj yazın veya onaylı şablon seçin'); return; }
    try {
      await api.post('/whatsapp/send', { phone, body: newChat.body.trim(), templateId: newChat.templateId || undefined });
      toast.success(newChat.templateId ? 'Onaylı şablon gönderiliyor' : 'Yeni sohbet başlatıldı, gönderiliyor');
      setNewChat(null); setQ(phone.slice(-10)); setTimeout(loadConvos, 800);
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  // Hazır şablon gönder
  const openTemplates = () => {
    setTplOpen(true);
    api.get('/whatsapp/templates').then((r) => setTemplates((r.data.templates || []).filter((t: Template) => t.status === 'approved'))).catch(() => {});
  };
  const sendTemplate = async (t: Template) => {
    if (!sel) return;
    const cur = sel;
    const convId = sel.id;               // K1: işlem sırasındaki konuşma id'si
    try {
      await api.post(`/whatsapp/conversations/${convId}/send`, { templateId: t.id });
      toast.success(`Şablon gönderiliyor: ${t.name}`); setTplOpen(false);
      markAnswered(convId);
      setTimeout(() => loadMsgs(cur), 600);
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  // Açık sepeti Siparişlerim detay modalında aç
  const openCart = async () => {
    if (!sel) return;
    try {
      const r = await api.get(`/whatsapp/conversations/${sel.id}/cart`);
      const cart = r.data.cart;
      if (!cart || cart.empty || cart.id == null) { toast('Bu müşterinin açık sepeti yok'); return; }
      const ord = (store.orders || []).find((o: any) => o.id === cart.id);
      if (ord) { setDetailOrder(ord); return; }
      // Liste yerelde yoksa siparişi doğrudan çek (sepet bulunamadı sorununun kökü)
      try {
        const fr = await api.get(`/store/orders/${cart.id}`);
        const full = fr.data?.order || fr.data;
        if (full && full.id) { setDetailOrder(full); return; }
      } catch {}
      toast.error('Sipariş açılamadı, Siparişlerim sayfasından deneyin');
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  // Müşteri kaydı oluştur (Instagram kullanıcı adı zorunlu)
  const createCustomer = () => {
    if (!sel) return;
    setCustModal({ instagram: convMeta?.customerName || '', ad: '' });
  };
  const submitCustomer = async () => {
    if (!sel || !custModal) return;
    const instagram = custModal.instagram.trim().replace(/^@+/, '');
    if (!instagram) { toast.error('Instagram kullanıcı adı zorunlu'); return; }
    setCustBusy(true);
    try {
      const r = await api.post(`/whatsapp/conversations/${sel.id}/customer`, { instagram, ad: custModal.ad.trim() });
      toast.success('Müşteri kaydı oluşturuldu');
      setConvMeta((m: any) => ({ ...(m || {}), customerExists: true, customerId: r.data?.customer?.id }));
      setCustModal(null);
      loadConvos();
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setCustBusy(false); }
  };

  // Sohbet durumu etiketlerini güncelle
  const saveTags = async (tags: string[]) => {
    if (!sel) return;
    try {
      const r = await api.put(`/whatsapp/conversations/${sel.id}/tags`, { tags });
      const nt = r.data?.tags || tags;
      setConvMeta((m: any) => ({ ...(m || {}), tags: nt }));
      setConvos((cs) => cs.map((c) => (c.id === sel.id ? { ...c, tags: nt } : c)));
      loadTags();
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const addTag = (t: string) => { const v = t.trim(); if (!v) return; const cur = (convMeta?.tags || []) as string[]; if (cur.includes(v)) return; saveTags([...cur, v]); setTagInput(''); };
  const removeTag = (t: string) => { const cur = (convMeta?.tags || []) as string[]; saveTags(cur.filter((x) => x !== t)); };

  // Sohbete tutturulan (pinned) müşteri notu
  const saveNote = async (note: string) => {
    if (!sel) return;
    setNoteBusy(true);
    try {
      const r = await api.put(`/whatsapp/conversations/${sel.id}/note`, { note });
      const nv = r.data?.note ?? (note.trim() || null);
      setConvMeta((m: any) => ({ ...(m || {}), note: nv }));
      setNoteOpen(false);
      toast.success(nv ? 'Not kaydedildi' : 'Not kaldırıldı');
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setNoteBusy(false); }
  };
  const openNote = () => { setNoteDraft(convMeta?.note || ''); setNoteOpen(true); };

  const filterKey = notesView ? 'notes' : paymentFilter ? 'payment' : inboxFilter === 'unanswered' ? 'pending' : (statusFilter || 'all');
  const setFilter = (k: string) => {
    setNotesView(false); setPaymentFilter('');
    if (k === 'pending') { setInboxFilter('unanswered'); setStatusFilter(''); }
    else if (k === 'payment') { setInboxFilter(''); setStatusFilter(''); setPaymentFilter('pending'); }
    else if (k === 'notes') { setInboxFilter(''); setStatusFilter(''); setNotesView(true); }
    else { setInboxFilter(''); setStatusFilter(k === 'all' ? '' : (k as any)); }
  };
  const FILTERS: { k: string; l: string }[] = [
    { k: 'all', l: 'Tümü' }, { k: 'open', l: 'Açık' }, { k: 'pending', l: 'Bekleyen' }, { k: 'payment', l: 'Ödeme Bekleniyor' }, { k: 'notes', l: 'Notlarım' }, { k: 'closed', l: 'Kapalı' },
  ];
  const avatarOf = (s?: string) => (s || '?').replace(/^@+/, '').trim().charAt(0).toUpperCase() || '?';
  // Performans: çok uzun sohbetlerde ilk render'da yalnızca son N mesajı göster
  const visibleMsgs = useMemo(() => (msgs.length > msgLimit ? msgs.slice(msgs.length - msgLimit) : msgs), [msgs, msgLimit]);
  const hasOlder = msgs.length > visibleMsgs.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] gap-3 flex-1 min-h-0">
      {/* Liste */}
      <div className="bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden max-md:h-[50vh] max-md:min-h-[320px] shadow-sm">
        <div className="p-3 border-b border-slate-100 space-y-2.5 bg-gradient-to-b from-white to-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="İsim / numara / mesaj ara" className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-200 transition" />
            </div>
            <button onClick={() => setNewChat({ phone: '', body: '' })} title="Yeni sohbet" className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center hover:shadow-md hover:shadow-emerald-500/20 transition-all"><Plus size={18} /></button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button key={f.k} onClick={() => setFilter(f.k)} className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${filterKey === f.k ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'}`}>
                {f.l}{filterKey === f.k ? <span className="text-[10px] opacity-90">{convos.length}</span> : null}
              </button>
            ))}
          </div>
          {allTags.length > 0 && (
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 border border-slate-200 text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-100">
              <option value="">Tüm Etiketler</option>
              {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {convos.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">Henüz konuşma yok.</p>}
          {convos.map((c) => (
            <button key={c.id} onClick={() => selectConvo(c)} className={`w-full text-left px-3 py-2.5 border-b border-slate-50 hover:bg-emerald-50/40 transition-all flex gap-2.5 ${sel?.id === c.id ? 'bg-emerald-50 border-l-[3px] border-l-emerald-500' : 'border-l-[3px] border-l-transparent'} ${c.closed ? 'opacity-60' : ''}`}>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">{avatarOf(c.customerName || c.customerPhone)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-slate-800 truncate">{c.customerName || c.customerPhone}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{fmtTime(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  {c.matchPreview && q.trim() ? (
                    <span className="text-xs text-slate-500 truncate flex items-center gap-1"><Search size={11} className="text-emerald-500 shrink-0" />{highlightTerm(c.matchPreview, q.trim())}</span>
                  ) : (
                    <span className="text-xs text-slate-400 truncate">{c.lastDirection === 'out' ? '↗ ' : ''}{c.lastPreview || ''}</span>
                  )}
                  {c.unread > 0 && <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center shrink-0">{c.unread}</span>}
                </div>
                {notesView && c.note && <p className="text-[10px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 mt-1 truncate">📌 {c.note}</p>}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">{c.lineLabel}</span>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${c.channel === 'api' ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>{c.channel === 'api' ? 'API' : 'QR'}</span>
                  {c.closed && <span className="inline-block px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 text-[10px]">Kapalı</span>}
                  {!notesView && c.note && <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">📌</span>}
                  {(c.tags || []).map((t) => <span key={t} className="inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 text-[10px]">#{t}</span>)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Sohbet */}
      <div className="bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden max-md:h-[75vh] max-md:min-h-[460px] shadow-sm">
        {!sel ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-gradient-to-br from-slate-50 to-white">
            <Inbox size={40} className="mb-2 opacity-40" /><p className="text-sm">Soldan bir konuşma seçin</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-gradient-to-r from-white to-slate-50/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">{avatarOf(sel.customerName || sel.customerPhone)}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 text-sm truncate">{sel.customerName || sel.customerPhone}</p>
                  <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                    <span>{sel.customerPhone}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${convMeta?.channel === 'api' ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>{convMeta?.channel === 'api' ? 'WP API' : 'QR'}</span>
                    {convMeta?.channel === 'api' && (convMeta?.windowOpen
                      ? <span className="inline-flex items-center gap-1 text-emerald-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 24s pencere açık</span>
                      : <span className="inline-flex items-center gap-1 text-amber-600"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> pencere kapalı (şablon)</span>)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {((convMeta?.unread ?? sel.unread) > 0) && (
                  <button onClick={() => markAnswered(sel.id)} title="Okundu/cevaplandı olarak işaretle" className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 flex items-center gap-1"><CheckCircle size={14} /> Cevaplandı</button>
                )}
                {convMeta && convMeta.customerExists === false && (
                  <button onClick={createCustomer} title="Müşteri kaydı oluştur" className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 flex items-center justify-center"><Plus size={16} /></button>
                )}
                <button onClick={openNote} title="Müşteri notu ekle/düzenle" className={`w-8 h-8 rounded-lg flex items-center justify-center ${convMeta?.note ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><StickyNote size={16} /></button>
                <button onClick={openCart} title="Açık sepeti görüntüle" className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 flex items-center justify-center"><ShoppingCart size={16} /></button>
                <button onClick={askPayment} title="Ödeme/sepet linki gönder" className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 flex items-center justify-center"><CreditCard size={16} /></button>
                <button onClick={toggleClose} title={sel.closed ? 'Yeniden aç' : 'Sohbeti kapat'} className={`w-8 h-8 rounded-lg flex items-center justify-center ${sel.closed ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{sel.closed ? <RefreshCw size={15} /> : <X size={16} />}</button>
              </div>
            </div>
            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-1.5 flex-wrap bg-slate-50/60">
              <span className="text-[11px] text-slate-400">Etiketler:</span>
              {((convMeta?.tags || []) as string[]).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px]">#{t}<button onClick={() => removeTag(t)} className="hover:text-indigo-900"><X size={11} /></button></span>
              ))}
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }} list="wa-tag-list" placeholder="+ etiket ekle" className="px-2 py-0.5 text-[11px] rounded-full bg-white border border-slate-200 w-28 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
              <datalist id="wa-tag-list">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            {convMeta?.note && (
              <div className="px-4 py-2 border-b border-amber-100 bg-amber-50 flex items-start gap-2">
                <StickyNote size={15} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800 flex-1 whitespace-pre-wrap break-words">{convMeta.note}</p>
                <button onClick={openNote} title="Notu düzenle" className="text-amber-500 hover:text-amber-700 shrink-0"><Pencil size={13} /></button>
                <button onClick={() => saveNote('')} title="Notu kaldır" className="text-amber-500 hover:text-rose-600 shrink-0"><X size={14} /></button>
              </div>
            )}
            {activeCart && (() => {
              const toplam = Number(activeCart.toplam) || 0;
              const tahsilat = Number(activeCart.tahsilat) || 0;
              const kalan = toplam - tahsilat;
              const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20BA';
              return (
                <div className="px-4 py-2 border-b border-emerald-100 bg-emerald-50 flex items-center gap-3">
                  <ShoppingCart size={15} className="text-emerald-600 shrink-0" />
                  <div className="flex items-center gap-3 flex-1 text-xs">
                    <span className="font-bold text-emerald-800">Açık Sepet: {activeCart.sipNo || '—'}</span>
                    <span className="text-slate-600">Toplam: <b>{fmt(toplam)}</b></span>
                    <span className="text-slate-600">Tahsilat: <b className="text-emerald-700">{fmt(tahsilat)}</b></span>
                    {kalan > 0.01 && <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Kalan Bakiye: {fmt(kalan)}</span>}
                    {kalan <= 0.01 && <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Ödeme Tamamlandı</span>}
                  </div>
                  <button onClick={() => { if (activeCart?.id) setDetailOrder(activeCart); }} title="Sepet detayı" className="text-emerald-600 hover:text-emerald-800"><Eye size={15} /></button>
                </div>
              );
            })()}
            <div ref={scrollRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto p-4 space-y-1.5 bg-slate-50">
              {msgsLoading && msgs.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-10 text-slate-400">
                  <span className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin mb-2" />
                  <p className="text-xs">Mesajlar yükleniyor…</p>
                </div>
              )}
              {hasOlder && (
                <div className="flex justify-center mb-2">
                  <button onClick={() => setMsgLimit((n) => n + MSG_PAGE)} className="px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-500 hover:bg-slate-50 shadow-sm">Daha eski mesajları göster</button>
                </div>
              )}
              {visibleMsgs.map((m, i) => {
                const prev = visibleMsgs[i - 1];
                const showDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                const out = m.direction === 'out';
                return (
                  <Fragment key={m.id}>
                    {showDay && (
                      <div className="flex justify-center my-2 sticky top-1 z-10 pointer-events-none"><span className="px-3 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] text-slate-500 shadow-sm">{dayLabel(m.createdAt)}</span></div>
                    )}
                    {m.deleted ? (
                      <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow-sm italic flex items-center gap-1.5 ${out ? 'bg-slate-100 text-slate-400 rounded-br-sm' : 'bg-white border border-slate-200 text-slate-400 rounded-bl-sm'}`}><Trash2 size={13} /> Bu mesaj silindi</div>
                      </div>
                    ) : (
                    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div className="relative group max-w-[75%]">
                        <div onClick={() => setMenuFor((v) => (v === m.id ? null : m.id))} className={`px-3 py-2 rounded-2xl text-sm shadow-sm cursor-pointer ${out ? 'bg-emerald-100 text-slate-800 rounded-br-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm'} ${m.reaction ? 'mb-2' : ''}`}>
                        {m.replyToText && (
                          <div className={`mb-1 px-2 py-1 rounded-lg border-l-2 text-[11px] truncate ${out ? 'bg-emerald-200/60 border-emerald-500 text-emerald-800' : 'bg-slate-100 border-slate-300 text-slate-500'}`}>{m.replyToText}</div>
                        )}
                        {m.mediaUrl && m.mediaType === 'image' && <img src={mediaSrc(m.mediaUrl)} alt="" className="w-40 h-40 object-cover rounded-lg mb-1 cursor-pointer hover:opacity-90" onClick={(e) => { e.stopPropagation(); setImgModal(mediaSrc(m.mediaUrl!)); }} />}
                        {m.mediaUrl && m.mediaType === 'video' && <video src={mediaSrc(m.mediaUrl)} controls className="w-48 rounded-lg mb-1" />}
                        {m.mediaUrl && m.mediaType === 'audio' && <audio src={mediaSrc(m.mediaUrl)} controls className="mb-1" />}
                        {m.mediaUrl && !['image', 'video', 'audio'].includes(m.mediaType || '') && <a href={mediaSrc(m.mediaUrl)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 mb-1 underline text-sky-600"><Paperclip size={14} /> {m.fileName || 'Dosya'}</a>}
                        {!out && m.mediaUrl && (m.mediaType === 'image' || m.mediaType === 'document' || !['video', 'audio'].includes(m.mediaType || '')) && (
                          <button onClick={(e) => { e.stopPropagation(); openDekontFromMsg(); }} className="flex items-center gap-1 mt-1 px-2 py-1 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 border border-emerald-200"><Receipt size={11} /> Dekont Sorgula</button>
                        )}
                        {m.body && <Linkified text={m.body} out={false} />}
                        {m.templateName && <p className="text-[10px] italic text-slate-400">şablon: {m.templateName}</p>}
                        <p className="text-[10px] mt-0.5 text-slate-400 flex items-center gap-1 justify-end">{out && m.sentByName ? <span className="text-emerald-600 font-medium mr-0.5">{m.sentByName}</span> : null}{fmtTime(m.createdAt)}{out ? <span className={m.status === 'read' ? 'text-sky-500' : 'text-slate-400'}>{m.status === 'failed' ? '⚠' : '✓✓'}</span> : null}</p>
                        {out && m.status === 'failed' && (
                          <p className="text-[10px] mt-0.5 font-medium text-rose-500">İletilemedi{m.error ? `: ${m.error}` : ''}</p>
                        )}
                        </div>
                        {m.reaction && (
                          <span className={`absolute -bottom-2 ${out ? 'right-2' : 'left-2'} bg-white border border-slate-200 rounded-full px-1 text-[12px] leading-none py-0.5 shadow-sm`}>{m.reaction}</span>
                        )}
                        {menuFor === m.id && (
                          <div className={`absolute z-20 -top-9 ${out ? 'right-0' : 'left-0'} bg-white rounded-full border border-slate-200 shadow-lg px-1.5 py-1 flex items-center gap-0.5`}>
                            {REACT_EMOJIS.map((e) => (
                              <button key={e} onClick={() => react(m, e)} className={`w-7 h-7 rounded-full hover:bg-slate-100 text-[15px] leading-none ${m.reaction === e ? 'bg-emerald-50' : ''}`}>{e}</button>
                            ))}
                            <span className="w-px h-5 bg-slate-200 mx-0.5" />
                            <button onClick={() => { setReplyTo(m); setMenuFor(null); }} title="Yanıtla" className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><CornerUpLeft size={15} /></button>
                            {out && <button onClick={() => delMsg(m)} title="Sil" className="w-7 h-7 rounded-full hover:bg-rose-50 flex items-center justify-center text-rose-500"><Trash2 size={15} /></button>}
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                  </Fragment>
                );
              })}
              <div ref={endRef} />
              {showScrollBtn && (
                <button onClick={() => scrollToBottom('smooth')} title="En alta in" className="sticky bottom-2 left-full ml-auto -mr-1 flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600">
                  <ChevronDown size={18} />
                </button>
              )}
            </div>
            <div className="px-3 pt-2.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
                {templates.filter((t) => pinnedTplIds.includes(t.id)).map((t) => (
                  <button key={t.id} onClick={() => sendTemplate(t)} title={`Meta onaylı şablon gönder: ${t.name}`} className="shrink-0 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[12px] font-medium hover:bg-emerald-100 transition flex items-center gap-1">
                    <BadgeCheck size={12} /> {t.name}
                  </button>
                ))}
                {(quickReplies.length ? quickReplies.filter((qr) => qr.aktif !== false) : DEFAULT_CHIPS).map((qr, i) => (
                  <button key={i} onClick={() => { setText((prev) => prev ? prev + '\n' + qr.metin : qr.metin); if (qr.id) api.post('/whatsapp/quick-replies/use', { id: qr.id }).catch(() => {}); }} title={qr.metin} className="shrink-0 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-medium hover:bg-emerald-50 hover:text-emerald-600 transition">
                    {qr.baslik || qr.metin.slice(0, 22)}
                  </button>
                ))}
                <button onClick={suggestAI} disabled={aiBusy} title="Gelen mesaja göre AI cevap önerisi hazırla" className="shrink-0 px-3 py-1.5 rounded-full bg-violet-600 text-white text-[12px] font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1">
                  {aiBusy ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Sparkles size={12} />} AI Öneri
                </button>
                <button onClick={() => setPinEdit(true)} title="Hızlı cevap ve şablonları sabitle / düzenle" className="shrink-0 px-3 py-1.5 rounded-full bg-emerald-600 text-white text-[12px] font-medium hover:bg-emerald-700 flex items-center gap-1"><Pencil size={12} /> Düzenle</button>
                <button onClick={openTemplates} className="shrink-0 px-3 py-1.5 rounded-full border border-dashed border-slate-300 text-slate-500 text-[12px] font-medium hover:border-emerald-300 hover:text-emerald-600 flex items-center gap-1"><FileText size={12} /> Şablonlar</button>
              </div>
            </div>
            {aiSug && (
              <div className="px-3 pt-2 -mb-1">
                <div className="px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles size={13} className="text-violet-500 shrink-0" />
                    <p className="text-[11px] font-semibold text-violet-600">AI Cevap Önerisi</p>
                  </div>
                  <p className="text-[13px] text-slate-700 whitespace-pre-wrap leading-snug">{aiSug}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => { setText((prev) => prev ? prev + '\n' + aiSug : aiSug); setAiSug(null); }} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[12px] font-medium hover:bg-violet-700 flex items-center gap-1"><Sparkles size={12} /> Kullan</button>
                    <button onClick={suggestAI} disabled={aiBusy} className="px-3 py-1.5 rounded-lg bg-white text-violet-600 border border-violet-200 text-[12px] font-medium hover:bg-violet-100 disabled:opacity-50">Yeniden Üret</button>
                    <button onClick={() => setAiSug(null)} className="px-3 py-1.5 rounded-lg text-slate-500 text-[12px] font-medium hover:bg-slate-100">Kapat</button>
                  </div>
                </div>
              </div>
            )}
            {replyTo && (
              <div className="px-3 pt-2 -mb-1">
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border-l-2 border-emerald-400">
                  <CornerUpLeft size={15} className="text-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-emerald-600">{replyTo.direction === 'out' ? 'Siz' : (sel?.customerName || 'Müşteri')} yanıtlanıyor</p>
                    <p className="text-[12px] text-slate-500 truncate">{replyTo.body || (replyTo.mediaType ? '[medya]' : '—')}</p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={15} /></button>
                </div>
              </div>
            )}
            <div className="px-3 pb-3 bg-gradient-to-t from-white to-transparent">
              <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); e.target.value = ''; }} />
                <button onClick={() => fileRef.current?.click()} disabled={sending} title="Dosya ekle" className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:shadow-sm disabled:opacity-50 flex items-center justify-center shrink-0 transition-all"><Paperclip size={17} /></button>
                <button onClick={openTemplates} title="Hazır şablon" className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:shadow-sm flex items-center justify-center shrink-0 transition-all"><Zap size={17} /></button>
                <textarea value={text} onChange={(e) => { setText(e.target.value); const ta = e.target; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); const ta = e.currentTarget; ta.style.height = 'auto'; } }} rows={1} placeholder="Mesaj yazın... (Enter gönder, Shift+Enter satır)" className="flex-1 px-3 py-2.5 text-sm rounded-xl bg-white border border-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200 transition shadow-sm" style={{ minHeight: '40px', maxHeight: '120px', overflow: 'auto' }} />
                <div className="flex items-stretch shrink-0">
                  <button onClick={send} disabled={sending || !text.trim()} className="px-4 rounded-l-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-medium hover:shadow-md hover:shadow-emerald-500/20 disabled:opacity-50 flex items-center transition-all"><Send size={16} /></button>
                  <div className="relative">
                    <button onClick={() => setQrOpen((v) => !v)} title="Gönderim hattı" className="h-full px-2 rounded-r-xl bg-emerald-600 text-white hover:bg-emerald-700 flex items-center"><ChevronDown size={15} /></button>
                    {qrOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setQrOpen(false)} />
                        <div className="absolute right-0 bottom-full mb-1 z-50 w-52 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 text-sm">
                          <div className="px-2 py-1 text-[11px] text-slate-400">Gönderim hattı</div>
                          <button onClick={() => { setViaQr(false); setQrOpen(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-slate-50 ${!viaQr ? 'text-emerald-600 font-medium' : 'text-slate-600'}`}>API (varsayılan){!viaQr && <CheckCircle size={14} />}</button>
                          <button onClick={() => { setViaQr(true); setQrOpen(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-slate-50 ${viaQr ? 'text-violet-600 font-medium' : 'text-slate-600'}`}>QR (Baileys){viaQr && <CheckCircle size={14} />}</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Görsel büyüt modalı */}
      {imgModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setImgModal(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setImgModal(null)}><X size={28} /></button>
          <img src={imgModal} alt="" className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Dekont Sorgula Modal (mesajdan tıklama) */}
      {dekontModal && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4" onClick={() => { setDekontModal(false); setDekontPick(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Receipt size={18} /></div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Dekont Sorgula</h3>
                  <p className="text-[11px] text-slate-400">Ref no, açıklama veya sipariş no ile arayın</p>
                </div>
              </div>
              <button onClick={() => { setDekontModal(false); setDekontPick(null); }} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input autoFocus value={dekontQ} onChange={(e) => searchDekont(e.target.value)} placeholder="Ref no, açıklama, sipariş no ara..." className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-100" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {dekontLoading ? <p className="text-sm text-slate-400 text-center py-8">Aranıyor...</p>
               : !dekontQ.trim() ? <p className="text-sm text-slate-400 text-center py-8">Ref no, açıklama veya sipariş numarası yazın</p>
               : dekontRows.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">Sonuç bulunamadı</p>
               : dekontRows.map((r: any) => (
                <div key={r.id} className={`border rounded-xl p-3 ${r.orderId ? 'border-green-200 bg-green-50/30' : r.suggestedOrderId ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-emerald-700 text-sm">{fmtTL(r.tutar)}</span>
                        <span className="text-xs text-slate-400">{r.tarih}{r.saat ? ` ${r.saat}` : ''}</span>
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{r.refNo}</span>
                        {r.orderId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">İşlendi → {r.orderSipNo || '?'}</span>}
                        {!r.orderId && r.suggestedOrderId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium border border-orange-200">Eşleşme: {r.suggestedSipNo || '?'}</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate" title={r.aciklama}>{r.aciklama}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {r.orderId ? (
                        <button onClick={() => releaseDekontInline(r.id)} className="px-2.5 py-1.5 text-[11px] font-medium border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 flex items-center gap-1"><X size={12} /> Serbest Bırak</button>
                      ) : r.suggestedOrderId ? (<>
                        <button disabled={dekontBusy} onClick={() => matchDekontInline(r.id, r.suggestedOrderId, r.suggestedSipNo || '?')} className="px-2.5 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"><CheckCircle size={12} /> Onayla & İşle</button>
                        <button onClick={() => { setDekontPick(r); setDekontOrderQ(''); }} className="px-2.5 py-1.5 text-[11px] font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex items-center gap-1"><Search size={12} /> Başka Sepet</button>
                      </>) : (
                        <button onClick={() => { setDekontPick(r); setDekontOrderQ(''); }} className="px-2.5 py-1.5 text-[11px] font-medium border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 flex items-center gap-1"><Search size={12} /> Sepet Seç</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dekont → Sepet Seçici */}
      {dekontPick && (
        <div className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center p-4" onClick={() => setDekontPick(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Sepet Seç & İşle</h3>
                <p className="text-[11px] text-slate-400">{fmtTL(dekontPick.tutar)} · {dekontPick.refNo}</p>
              </div>
              <button onClick={() => setDekontPick(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input autoFocus value={dekontOrderQ} onChange={(e) => setDekontOrderQ(e.target.value)} placeholder="Sipariş no, müşteri adı ara..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-100" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {(() => {
                const all = (store.orders || []).filter((o: any) => o.durum !== 'iptal' && o.durum !== 'tamamlandi');
                const lq = dekontOrderQ.toLowerCase();
                const list = lq ? all.filter((o: any) => (o.sipNo || '').toLowerCase().includes(lq) || (o.musteriHandle || '').toLowerCase().includes(lq) || (o.customer?.ad || '').toLowerCase().includes(lq)) : all;
                return list.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">Açık sepet bulunamadı</p>
                : list.slice(0, 30).map((o: any) => {
                  const kalan = (Number(o.toplam) || 0) - (Number(o.tahsilat) || 0);
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-white hover:border-emerald-200 cursor-pointer hover:shadow-sm transition">
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-sm text-slate-700">{o.sipNo || o.id.slice(-6)}</span>
                        <p className="text-[11px] text-slate-500 truncate">{o.musteriHandle || o.customer?.ad || '-'}</p>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>Toplam: {fmtTL(Number(o.toplam) || 0)}</span>
                          {kalan > 0.01 && <span className="text-red-500 font-medium">Kalan: {fmtTL(kalan)}</span>}
                        </div>
                      </div>
                      <button disabled={dekontBusy} onClick={() => matchDekontInline(dekontPick.id, o.id, o.sipNo || '?')} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 shrink-0">İşle</button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Müşteri kaydı modalı (Instagram zorunlu) */}
      {custModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCustModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Müşteri Kaydı Oluştur</h3>
              <button onClick={() => setCustModal(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-600">Instagram kullanıcı adı <span className="text-rose-500">*</span></label>
              <div className="flex items-center mt-1 rounded-lg bg-slate-50 border border-slate-200 focus-within:ring-2 focus-within:ring-emerald-100">
                <span className="pl-3 text-slate-400 text-sm">@</span>
                <input autoFocus value={custModal.instagram} onChange={(e) => setCustModal({ ...custModal, instagram: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submitCustomer(); }} placeholder="kullaniciadi" className="flex-1 px-2 py-2 text-sm bg-transparent focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-600">Ad Soyad (opsiyonel)</label>
              <input value={custModal.ad} onChange={(e) => setCustModal({ ...custModal, ad: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submitCustomer(); }} placeholder="Boş bırakılırsa Instagram adı kullanılır" className="w-full mt-1 px-3 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCustModal(null)} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200">İptal</button>
              <button onClick={submitCustomer} disabled={custBusy || !custModal.instagram.trim()} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Yeni sohbet modalı */}
      {newChat && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setNewChat(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Yeni Sohbet</h3>
              <button onClick={() => setNewChat(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <input autoFocus value={newChat.phone} onChange={(e) => setNewChat({ ...newChat, phone: e.target.value })} placeholder="Telefon (örn. 5xx xxx xx xx)" className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            <div>
              <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1"><BadgeCheck size={13} className="text-emerald-600" /> Meta Onaylı Şablon</label>
              <select value={newChat.templateId || ''} onChange={(e) => setNewChat({ ...newChat, templateId: e.target.value || undefined })} className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-100">
                <option value="">Şablon yok — serbest mesaj</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {newChat.templateId && (
                <p className="text-[11px] text-slate-500 mt-1 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">{templates.find((t) => t.id === newChat.templateId)?.bodyText || 'Onaylı şablon gönderilecek.'}</p>
              )}
            </div>
            <textarea value={newChat.body} onChange={(e) => setNewChat({ ...newChat, body: e.target.value })} rows={3} placeholder={newChat.templateId ? 'Şablon seçili — serbest mesaj opsiyonel' : 'İlk mesaj...'} className="w-full px-3 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-100" />
            <p className="text-[11px] text-slate-400">24 saatlik pencere dışındaki yeni numaralara WhatsApp yalnızca <b>Meta onaylı şablon</b> teslim eder. İlk teması şablonla başlatmanız önerilir.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setNewChat(null)} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200">İptal</button>
              <button onClick={startNewChat} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 flex items-center gap-1.5"><Send size={15} /> Başlat</button>
            </div>
          </div>
        </div>
      )}

      {/* Hazır şablon seçici */}
      {tplOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTplOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Hazır Şablon Gönder</h3>
              <button onClick={() => setTplOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            {templates.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">Onaylı şablon bulunamadı. Şablonlar sekmesinden ekleyip onaya gönderebilirsiniz.</p>
            ) : templates.map((t) => (
              <button key={t.id} onClick={() => sendTemplate(t)} className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-slate-800">{t.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{t.language}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">{t.bodyText}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {pinEdit && (
        <PinEditor
          templates={templates}
          quickReplies={quickReplies}
          pinnedTplIds={pinnedTplIds}
          busy={savingPins}
          onClose={() => setPinEdit(false)}
          onSave={savePins}
        />
      )}

      {/* Müşteri notu düzenleme modalı */}
      {noteOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setNoteOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-slate-800 flex items-center gap-2"><StickyNote size={17} className="text-amber-600" /> Müşteri Notu</h3><button onClick={() => setNoteOpen(false)}><X size={18} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-400 mb-2">Bu not sohbetin üst kısmında başa tutturulu kalır. Silmek için boş bırakıp kaydedin.</p>
            <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={4} maxLength={1000} placeholder="Örn. Toptan müşteri, kapıda ödeme istiyor…" className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-100 resize-none" autoFocus />
            <div className="flex items-center justify-end gap-2 mt-3">
              {convMeta?.note && <button disabled={noteBusy} onClick={() => saveNote('')} className="px-3 py-2 text-sm rounded-xl text-rose-600 hover:bg-rose-50">Notu kaldır</button>}
              <button onClick={() => setNoteOpen(false)} className="px-3 py-2 text-sm rounded-xl border border-slate-200 hover:bg-slate-50">İptal</button>
              <button disabled={noteBusy} onClick={() => saveNote(noteDraft)} className="px-4 py-2 text-sm rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Açık sepet modalı */}
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
function Lines({ onChange }: { onChange: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [limit, setLimit] = useState('');
  const [qrModal, setQrModal] = useState<{ id: string; label: string } | null>(null);
  const [qr, setQr] = useState<{ status: string; qr?: string }>({ status: 'connecting' });
  const [apiEdit, setApiEdit] = useState<string | null>(null);
  const [apiForm, setApiForm] = useState<{ phoneNumberId: string; wabaId: string; accessToken: string }>({ phoneNumberId: '', wabaId: '', accessToken: '' });
  const [webhook, setWebhook] = useState<{ url: string; verifyToken: string } | null>(null);
  const [limitEdit, setLimitEdit] = useState<string | null>(null);
  const [limitVal, setLimitVal] = useState('');

  const openLimitEdit = (l: Line) => { setLimitEdit(l.id); setLimitVal(l.gunlukLimit ? String(l.gunlukLimit) : ''); };
  const saveLimit = async (l: Line) => {
    try {
      await api.put(`/whatsapp/lines/${l.id}`, { gunlukLimit: Number(limitVal) || 0 });
      toast.success('Günlük limit güncellendi'); setLimitEdit(null); load();
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const load = () => api.get('/whatsapp/lines').then((r) => { setLines(r.data.lines || []); onChange(); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);
  const loadWebhook = () => api.get('/whatsapp/webhook-info').then((r) => setWebhook(r.data)).catch(() => {});
  useEffect(() => { loadWebhook(); }, []);

  useEffect(() => {
    if (!qrModal) return;
    let stop = false;
    const poll = async () => {
      try {
        const r = await api.get(`/whatsapp/lines/${qrModal.id}/qr`);
        if (stop) return;
        setQr(r.data);
        if (r.data.status === 'connected') { toast.success('Hat bağlandı!'); setQrModal(null); load(); }
      } catch { /* */ }
    };
    poll();
    const t = setInterval(poll, 2500);
    return () => { stop = true; clearInterval(t); };
  }, [qrModal?.id]);

  const add = async () => {
    if (!label.trim()) { toast.error('Hat etiketi girin'); return; }
    try {
      await api.post('/whatsapp/lines', { label: label.trim(), gunlukLimit: Number(limit) || 0 });
      setLabel(''); setLimit(''); setAdding(false); load();
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const connect = async (l: Line) => {
    try { await api.post(`/whatsapp/lines/${l.id}/connect`); setQr({ status: 'connecting' }); setQrModal({ id: l.id, label: l.label }); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const logout = async (l: Line) => {
    if (!confirm(`${l.label} oturumu kapatılsın mı?`)) return;
    try { await api.post(`/whatsapp/lines/${l.id}/logout`); load(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const remove = async (l: Line) => {
    if (!confirm(`${l.label} silinsin mi? Bu işlem geri alınamaz.`)) return;
    try { await api.delete(`/whatsapp/lines/${l.id}`); load(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const switchChannel = async (l: Line, channel: string) => {
    try { await api.put(`/whatsapp/lines/${l.id}/channel`, { channel }); load(); if (channel === 'api') openApiEdit(l); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const openApiEdit = (l: Line) => { setApiEdit(l.id); setApiForm({ phoneNumberId: l.phoneNumberId || '', wabaId: l.wabaId || '', accessToken: '' }); };
  const saveApi = async (l: Line) => {
    try {
      const body: any = { phoneNumberId: apiForm.phoneNumberId.trim(), wabaId: apiForm.wabaId.trim() };
      if (apiForm.accessToken.trim()) body.accessToken = apiForm.accessToken.trim();
      await api.put(`/whatsapp/lines/${l.id}/api`, body);
      toast.success('API bilgileri kaydedildi'); setApiEdit(null); load();
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const verifyApi = async (l: Line) => {
    try { const r = await api.post(`/whatsapp/lines/${l.id}/api/verify`); toast.success(`Doğrulandı: ${r.data.name || ''} ${r.data.phone ? '+' + r.data.phone : ''}`); load(); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success('Kopyalandı'); };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <p><b>QR (Baileys)</b> hatları resmi API değildir; aşırı/spam gönderim numaranın <b>banlanmasına</b> yol açabilir. <b>API (Cloud)</b> hatları resmî WhatsApp Business Cloud API'sini kullanır; pencere dışı gönderimde onaylı şablon gerekir.</p>
      </div>

      {/* Webhook bilgisi (Meta'ya yapıştırmak için) */}
      {webhook && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sm text-sky-900 space-y-2">
          <p className="font-medium flex items-center gap-1.5"><Cloud size={15} /> Cloud API Webhook (Meta → WhatsApp → Configuration)</p>
          <div className="flex items-center gap-2"><span className="text-xs text-sky-700 w-28 shrink-0">Callback URL</span><code className="flex-1 bg-white rounded px-2 py-1 text-xs truncate">{webhook.url}</code><button onClick={() => copy(webhook.url)} className="text-sky-600 hover:text-sky-800"><Copy size={14} /></button></div>
          <div className="flex items-center gap-2"><span className="text-xs text-sky-700 w-28 shrink-0">Verify Token</span><code className="flex-1 bg-white rounded px-2 py-1 text-xs truncate">{webhook.verifyToken}</code><button onClick={() => copy(webhook.verifyToken)} className="text-sky-600 hover:text-sky-800"><Copy size={14} /></button></div>
          <p className="text-[11px] text-sky-700">Webhook alanlarından <b>messages</b> ve <b>message_template_status_update</b> aboneliklerini açın.</p>
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{lines.length} hat tanımlı</p>
        <button onClick={() => setAdding(true)} className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 flex items-center gap-1.5"><Plus size={16} /> Yeni Hat Ekle</button>
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
          <div><label className="text-xs text-slate-500 block mb-1">Hat Etiketi</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ör. Satış 1" className="px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-100" /></div>
          <div><label className="text-xs text-slate-500 block mb-1">Günlük Limit (boş=varsayılan)</label><input value={limit} onChange={(e) => setLimit(e.target.value)} type="number" placeholder="200" className="px-3 py-2 text-sm rounded-lg border border-slate-200 w-32 focus:outline-none focus:ring-2 focus:ring-emerald-100" /></div>
          <button onClick={add} className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">Ekle</button>
          <button onClick={() => setAdding(false)} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm">Vazgeç</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {lines.map((l) => {
          const isApi = l.channel === 'api';
          const st = isApi
            ? (l.apiVerified ? { t: 'API · Doğrulandı', c: 'bg-emerald-100 text-emerald-700' } : { t: 'API · Doğrulanmadı', c: 'bg-amber-100 text-amber-700' })
            : (STATUS_LABEL[l.status] || STATUS_LABEL.disconnected);
          return (
            <div key={l.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{l.label}</p>
                  <p className="text-xs text-slate-400">{l.phone ? '+' + l.phone : 'Bağlı numara yok'}</p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-[11px] font-medium ${st.c}`}>{st.t}</span>
              </div>

              {/* Kanal seçici */}
              <div className="mt-3 flex gap-1 bg-slate-100 rounded-lg p-0.5">
                <button onClick={() => switchChannel(l, 'qr')} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${!isApi ? 'bg-white text-violet-600 shadow-sm' : 'text-slate-500'}`}>QR (Baileys)</button>
                <button onClick={() => switchChannel(l, 'api')} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${isApi ? 'bg-white text-sky-600 shadow-sm' : 'text-slate-500'}`}>API (Cloud)</button>
              </div>

              <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
                <span title="Bugün bu hattan başlatılan yeni sohbet / limit">Yeni sohbet: <b className="text-slate-700">{l.newChatToday ?? 0}</b> / {l.gunlukLimit || 'varsayılan'}</span>
                <span title="Bugün toplam gönderim">{l.sentToday} gönderim</span>
              </div>

              {limitEdit === l.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <input value={limitVal} onChange={(e) => setLimitVal(e.target.value)} type="number" min={0} placeholder="0 = varsayılan" className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-100" autoFocus />
                  <button onClick={() => saveLimit(l)} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600">Kaydet</button>
                  <button onClick={() => setLimitEdit(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs">Vazgeç</button>
                </div>
              ) : (
                <button onClick={() => openLimitEdit(l)} className="mt-2 text-[11px] text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"><Pencil size={11} /> Günlük limiti düzenle</button>
              )}

              {!isApi ? (
                <div className="mt-3 flex gap-2">
                  {l.status !== 'connected'
                    ? <button onClick={() => connect(l)} className="flex-1 px-3 py-2 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 flex items-center justify-center gap-1.5"><QrCode size={14} /> Bağlan</button>
                    : <button onClick={() => logout(l)} className="flex-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200 flex items-center justify-center gap-1.5"><LogOut size={14} /> Çıkış Yap</button>}
                  <button onClick={() => connect(l)} title="Yeniden bağlan" className="px-3 py-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><RefreshCw size={14} /></button>
                  <button onClick={() => remove(l)} title="Sil" className="px-3 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 size={14} /></button>
                </div>
              ) : apiEdit === l.id ? (
                <div className="mt-3 space-y-2">
                  <input value={apiForm.phoneNumberId} onChange={(e) => setApiForm((p) => ({ ...p, phoneNumberId: e.target.value }))} placeholder="Phone Number ID" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-100" />
                  <input value={apiForm.wabaId} onChange={(e) => setApiForm((p) => ({ ...p, wabaId: e.target.value }))} placeholder="WhatsApp Business Account ID (WABA)" className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-100" />
                  <input value={apiForm.accessToken} onChange={(e) => setApiForm((p) => ({ ...p, accessToken: e.target.value }))} placeholder={l.hasToken ? `Token (mevcut: ${l.apiTokenMasked}) — değiştirmek için girin` : 'Kalıcı Erişim Token (System User)'} className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-100" />
                  <div className="flex gap-2">
                    <button onClick={() => saveApi(l)} className="flex-1 px-3 py-1.5 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600">Kaydet</button>
                    <button onClick={() => setApiEdit(null)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs">Vazgeç</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] text-slate-400 truncate">PN ID: {l.phoneNumberId || '—'} · Token: {l.hasToken ? l.apiTokenMasked : 'yok'}</p>
                  <div className="flex gap-2">
                    <button onClick={() => verifyApi(l)} disabled={!l.hasToken || !l.phoneNumberId} className="flex-1 px-3 py-2 rounded-lg bg-sky-500 text-white text-xs font-medium hover:bg-sky-600 disabled:opacity-40 flex items-center justify-center gap-1.5"><CheckCircle size={14} /> Bağlantıyı Test Et</button>
                    <button onClick={() => openApiEdit(l)} title="API bilgilerini düzenle" className="px-3 py-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"><SettingsIcon size={14} /></button>
                    <button onClick={() => remove(l)} title="Sil" className="px-3 py-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 size={14} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {qrModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={() => setQrModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800">{qrModal.label} · QR Okut</h3>
              <button onClick={() => setQrModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            {qr.status === 'qr' && qr.qr ? (
              <>
                <img src={qr.qr} alt="QR" className="w-64 h-64 mx-auto" />
                <p className="text-sm text-slate-500 mt-3">Telefonda WhatsApp → <b>Bağlı Cihazlar</b> → <b>Cihaz Bağla</b> ile bu kodu okutun.</p>
              </>
            ) : qr.status === 'connected' ? (
              <p className="text-emerald-600 py-16">Bağlandı!</p>
            ) : (
              <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                <span className="w-8 h-8 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-sm">QR oluşturuluyor...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel Ayarları ─────────────────────────────────────────────────────────────
// ─── Genel Durum panosu (referans tasarım) ────────────────────────────────────
function fmtMoney(n: number) { return '₺' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtHM(d?: string | null) { return d ? new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—'; }
function fmtWait(dk: number) { if (dk < 60) return `${dk} dk`; const h = Math.floor(dk / 60); return h < 24 ? `${h} sa` : `${Math.floor(h / 24)} gün`; }

function StatCard({ icon: Icon, color, label, value, sub, trend }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color.bg}`}><Icon size={20} className={color.fg} /></div>
        {trend != null && <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5"><TrendingUp size={12} /> {trend}</span>}
      </div>
      <div>
        <p className="text-[12px] text-slate-400 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        <p className="text-[11px] text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

const SEND_STATUS: Record<string, { t: string; c: string }> = {
  delivered: { t: 'Başarılı', c: 'bg-emerald-100 text-emerald-700' },
  sent: { t: 'Gönderildi', c: 'bg-emerald-100 text-emerald-700' },
  read: { t: 'Okundu', c: 'bg-emerald-100 text-emerald-700' },
  pending: { t: 'Bekliyor', c: 'bg-amber-100 text-amber-700' },
  failed: { t: 'Başarısız', c: 'bg-rose-100 text-rose-700' },
};

function GenelDurum({ onTab }: { onTab: (k: any) => void }) {
  const [d, setD] = useState<any>(null);
  const [sendFilter, setSendFilter] = useState<'all' | 'failed' | 'sent' | 'pending'>('all');
  const navigate = useNavigate();
  const location = useLocation();
  const panelPath = location.pathname.replace(/\/ayarlar\/?$/, '') || '/whatsapp';
  const goConvo = (phone?: string) => { if (!phone) { toast.error('Bu kayıt için numara yok'); return; } navigate(`${panelPath}?phone=${encodeURIComponent(phone)}`); };
  const load = () => api.get('/whatsapp/dashboard').then((r) => setD(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  if (!d) return <div className="p-10 flex justify-center"><span className="w-8 h-8 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" /></div>;

  const s = d.stats || {};
  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const flow = [
    { t: 'Sipariş Alındı', s: 'Tetikleyici', c: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: ShoppingCart },
    { t: 'Ödeme Linki Gönder', s: 'Hemen', c: 'bg-sky-50 border-sky-200 text-sky-700', icon: Send },
    { t: '20 dk Bekle', s: 'Bekleme', c: 'bg-amber-50 border-amber-200 text-amber-700', icon: Clock },
    { t: 'Ödeme Hatırlatma', s: 'Mesaj Gönder', c: 'bg-violet-50 border-violet-200 text-violet-700', icon: MessageCircle },
    { t: 'Ödeme Yoksa İptal', s: 'Sipariş İptal Et', c: 'bg-rose-50 border-rose-200 text-rose-700', icon: X },
  ];
  const autoList = [
    { k: 'odemeHatirlatma', t: 'Ödeme Hatırlatma', d: 'Ödeme yapılmadığında' },
    { k: 'sepetLinki', t: 'Sepet Linki Gönderimi', d: 'Sepet terk edildiğinde' },
    { k: 'iptalBilgi', t: 'İptal Sonrası Bilgilendirme', d: 'İptal edildiğinde' },
    { k: 'siparisBildirim', t: 'Sipariş Bildirimi', d: 'Sipariş alındığında' },
    { k: 'stok', t: 'Stok Bildirimi', d: 'Stok azaldığında' },
  ];

  return (
    <div className="space-y-4">
      {/* 6 istatistik kartı */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard icon={Send} color={{ bg: 'bg-emerald-50', fg: 'text-emerald-600' }} label="Bugün Gönderilen" value={s.sentToday ?? 0} sub="Toplam mesaj" />
        <StatCard icon={ShoppingCart} color={{ bg: 'bg-violet-50', fg: 'text-violet-600' }} label="Bekleyen Sepet" value={s.pendingCarts ?? 0} sub="Ödeme bekleyen" />
        <StatCard icon={CreditCard} color={{ bg: 'bg-amber-50', fg: 'text-amber-600' }} label="Ödeme Bekleyen" value={s.overdue ?? 0} sub="Süresi geçen" />
        <StatCard icon={BarChart3} color={{ bg: 'bg-sky-50', fg: 'text-sky-600' }} label="Başarı Oranı" value={`%${s.successRate ?? 100}`} sub="Son 7 gün" />
        <StatCard icon={MessageCircle} color={{ bg: 'bg-emerald-50', fg: 'text-emerald-600' }} label="Aktif Hat" value={`${s.acik ?? 0} / ${s.hatSayisi ?? 0}`} sub="Hatlar aktif" />
        <StatCard icon={Shield} color={{ bg: 'bg-rose-50', fg: 'text-rose-600' }} label="Spam Risk Skoru" value={(s.successRate ?? 100) >= 90 ? 'Düşük' : (s.successRate >= 70 ? 'Orta' : 'Yüksek')} sub="Güvenli gönderim" />
      </div>

      {/* Son Gönderimler + Bekleyen Sepetler + Hat Durumu */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Son Gönderimler */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2"><Send size={16} className="text-emerald-500" /><h3 className="font-bold text-slate-800 text-sm">Son Gönderimler</h3></div>
            <div className="flex items-center gap-1">
              {([['all', 'Tümü'], ['failed', 'Başarısız'], ['sent', 'Giden'], ['pending', 'Bekleyen']] as const).map(([k, lbl]) => {
                const cnt = k === 'all' ? d.recentSends.length : d.recentSends.filter((m: any) => k === 'failed' ? m.durum === 'failed' : k === 'pending' ? m.durum === 'pending' : (m.durum !== 'failed' && m.durum !== 'pending')).length;
                return <button key={k} onClick={() => setSendFilter(k)} className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition ${sendFilter === k ? (k === 'failed' ? 'bg-rose-600 text-white border-rose-600' : 'bg-emerald-600 text-white border-emerald-600') : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{lbl}{cnt > 0 && <span className="ml-1 opacity-70">{cnt}</span>}</button>;
              })}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="font-medium pb-2 pr-2">Alıcı</th><th className="font-medium pb-2 pr-2">Mesaj Türü</th><th className="font-medium pb-2 pr-2">İçerik</th><th className="font-medium pb-2 pr-2">Durum</th><th className="font-medium pb-2">Saat</th>
              </tr></thead>
              <tbody>
                {(() => {
                  const rows = d.recentSends.filter((m: any) => sendFilter === 'all' ? true : sendFilter === 'failed' ? m.durum === 'failed' : sendFilter === 'pending' ? m.durum === 'pending' : (m.durum !== 'failed' && m.durum !== 'pending'));
                  if (rows.length === 0) return <tr><td colSpan={5} className="text-center text-slate-400 py-6">{sendFilter === 'failed' ? 'Başarısız gönderim yok.' : 'Kayıt yok.'}</td></tr>;
                  return rows.map((m: any, i: number) => { const st = SEND_STATUS[m.durum] || SEND_STATUS.sent; return (
                    <tr key={i} onClick={() => goConvo(m.phone)} className="border-b border-slate-50 cursor-pointer hover:bg-emerald-50/50" title="Mesaj ekranını aç">
                      <td className="py-2 pr-2 text-slate-600 whitespace-nowrap">{m.alici}</td>
                      <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">{m.tur}</td>
                      <td className="py-2 pr-2 text-slate-600 max-w-[220px] truncate" title={m.icerik}>{m.icerik}</td>
                      <td className="py-2 pr-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.c}`}>{st.t}</span>{m.durum === 'failed' && m.error && <span className="block text-[10px] text-rose-400 mt-0.5 max-w-[160px] truncate" title={m.error}>{m.error}</span>}</td>
                      <td className="py-2 text-slate-400 whitespace-nowrap">{fmtHM(m.saat)}</td>
                    </tr>
                  ); });
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bekleyen Sepetler */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><ShoppingCart size={16} className="text-violet-500" /><h3 className="font-bold text-slate-800 text-sm">Bekleyen Sepetler</h3></div></div>
          {d.pendingCarts.length === 0 ? <p className="text-[13px] text-slate-400 py-4 text-center">Bekleyen sepet yok.</p> : (
            <div className="space-y-2">
              <div className="flex text-[11px] text-slate-400 font-medium"><span className="flex-1">Müşteri</span><span className="w-20 text-right">Tutar</span><span className="w-14 text-right">Süre</span></div>
              {d.pendingCarts.map((c: any, i: number) => (
                <div key={i} className="flex items-center text-[13px] border-b border-slate-50 pb-2">
                  <span className="flex-1 text-slate-600 truncate" title={c.musteri}>{c.musteri}</span>
                  <span className="w-20 text-right font-medium text-slate-700">{fmtMoney(c.tutar)}</span>
                  <span className="w-14 text-right text-slate-400">{fmtWait(c.bekleyenDk)}</span>
                </div>
              ))}
              <button onClick={() => onTab('otomasyon')} className="w-full text-center text-emerald-600 text-[13px] font-medium pt-1 hover:underline">Tümünü Gör →</button>
            </div>
          )}
        </div>

        {/* Hat Durumu */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800 text-sm">Hat Durumu</h3><button onClick={() => onTab('hat')} className="text-emerald-600 text-[12px] font-medium hover:underline">Tümünü Gör</button></div>
          <div className="space-y-3">
            {d.lines.length === 0 && <p className="text-[13px] text-slate-400 py-2">Hat yok.</p>}
            {d.lines.map((l: any) => (
              <div key={l.id} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center"><MessageCircle size={15} className="text-emerald-600" /></div><div><p className="text-[13px] font-semibold text-slate-700">{l.label || 'Hat'}</p><p className="text-[11px] text-slate-400">{l.phone || '—'}</p></div></div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${l.connected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{l.connected ? 'Aktif' : 'Pasif'}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1"><span>Günlük Limit</span><span>{l.sentToday}/{l.limit}</span></div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, l.limit ? (l.sentToday / l.limit) * 100 : 0)}%` }} /></div>
                <p className="text-[10px] text-slate-400 mt-1.5">Son bağlantı: {fmtHM(l.lastConnectedAt)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Otomasyon Özeti + Çalışma Saatleri + Anlık İstatistik + Hızlı İşlemler */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Otomasyon Özeti */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3"><Zap size={16} className="text-amber-500" /><h3 className="font-bold text-slate-800 text-sm">Otomasyon Özeti</h3></div>
          <div className="space-y-2.5">
            {autoList.map((a) => { const on = !!d.automations[a.k]; return (
              <div key={a.k} className="flex items-center justify-between">
                <div><p className="text-[13px] text-slate-700 font-medium">{a.t}</p><p className="text-[11px] text-slate-400">{a.d}</p></div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{on ? 'Aktif' : 'Pasif'}</span>
              </div>
            ); })}
          </div>
        </div>

        {/* Çalışma Saatleri */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><Clock size={16} className="text-sky-500" /><h3 className="font-bold text-slate-800 text-sm">Çalışma Saatleri</h3></div><button onClick={() => onTab('antispam')} className="text-emerald-600 text-[12px] font-medium hover:underline">Düzenle</button></div>
          <p className="text-[11px] text-slate-400 mb-3">{d.calisma.aktif ? 'Çalışma saatleri dışında otomatik gönderim yapılmaz.' : 'Çalışma saati kısıtı kapalı — her saat gönderim yapılır.'}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] text-slate-400">Başlangıç</p><p className="text-sm font-semibold text-slate-700">{d.calisma.basla}</p></div>
            <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] text-slate-400">Bitiş</p><p className="text-sm font-semibold text-slate-700">{d.calisma.bitis}</p></div>
          </div>
          <div className="flex justify-between">{days.map((dn, i) => (<div key={dn} className="flex flex-col items-center gap-1"><span className="text-[10px] text-slate-400">{dn}</span><span className={`w-5 h-5 rounded-full flex items-center justify-center ${i < 5 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-300'}`}>{i < 5 ? <CheckCircle size={12} /> : ''}</span></div>))}</div>
        </div>

        {/* Anlık İstatistik */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3"><BarChart3 size={16} className="text-violet-500" /><h3 className="font-bold text-slate-800 text-sm">Anlık İstatistik</h3></div>
          <div className="space-y-2.5 text-[13px]">
            <div className="flex justify-between"><span className="text-slate-500 flex items-center gap-1.5"><Send size={13} className="text-emerald-500" /> Gönderilen</span><span className="font-semibold text-slate-700">{d.anlik.gonderilen}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 flex items-center gap-1.5"><CheckCircle size={13} className="text-emerald-500" /> Başarılı</span><span className="font-semibold text-emerald-600">{d.anlik.basarili} ({d.anlik.gonderilen ? Math.round(d.anlik.basarili / d.anlik.gonderilen * 100) : 0}%)</span></div>
            <div className="flex justify-between"><span className="text-slate-500 flex items-center gap-1.5"><X size={13} className="text-rose-500" /> Başarısız</span><span className="font-semibold text-rose-600">{d.anlik.basarisiz} ({d.anlik.gonderilen ? Math.round(d.anlik.basarisiz / d.anlik.gonderilen * 100) : 0}%)</span></div>
            <div className="flex justify-between"><span className="text-slate-500 flex items-center gap-1.5"><Clock size={13} className="text-amber-500" /> Bekleyen</span><span className="font-semibold text-slate-700">{d.anlik.bekleyen}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-2"><span className="text-slate-500">Son Gönderim</span><span className="font-semibold text-slate-700">{fmtHM(d.anlik.sonGonderim)}</span></div>
          </div>
        </div>

        {/* Hızlı İşlemler */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3">Hızlı İşlemler</h3>
          <div className="space-y-2">
            {[
              { t: 'Yeni Şablon Mesajı Oluştur', go: () => onTab('sablon') },
              { t: 'Hazır Metin Ekle', go: () => onTab('hazir') },
              { t: 'Otomasyon Ayarları', go: () => onTab('otomasyon') },
              { t: 'Anti-Spam & Güvenlik', go: () => onTab('antispam') },
            ].map((q) => (
              <button key={q.t} onClick={q.go} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 text-[13px] text-slate-600 font-medium">
                {q.t}<ChevronRight size={15} className="text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Otomasyon Akışları + Sistem Durumu */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-4">Otomasyon Akışları</h3>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {flow.map((f, i) => (
              <div key={i} className="flex items-center gap-2 shrink-0">
                <div className={`rounded-xl border p-3 w-40 ${f.c}`}>
                  <f.icon size={18} className="mb-2" />
                  <p className="text-[13px] font-semibold leading-tight">{f.t}</p>
                  <p className="text-[11px] opacity-70">{f.s}</p>
                </div>
                {i < flow.length - 1 && <ChevronRight size={18} className="text-slate-300 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3">Sistem Durumu</h3>
          <div className="flex items-center gap-2 text-[13px] text-emerald-700 bg-emerald-50 rounded-xl p-3 mb-2"><CheckCircle size={16} /> Tüm sistemler çalışıyor.</div>
          <p className="text-[12px] text-slate-400">Kuyrukta {s.queue ?? 0} mesaj · {s.acik ?? 0}/{s.hatSayisi ?? 0} hat aktif</p>
        </div>
      </div>
    </div>
  );
}

// ─── Otomasyonlar (referans tasarım) ─────────────────────────────────────────
type AutoRow = { id: string; key?: string; on: boolean; Ic: any; ic: string; ad: string; desc: string; trig: string; sent: number; rate: number; last: string };

const AUTO_STATS: { Ic: any; ic: string; label: string; value: string; sub: string }[] = [
  { Ic: Zap, ic: 'text-amber-600 bg-amber-50', label: 'Aktif Otomasyonlar', value: '7', sub: "Tüm akışların %71'i aktif" },
  { Ic: Send, ic: 'text-sky-600 bg-sky-50', label: 'Bugün Gönderilen', value: '153', sub: 'Toplam mesaj' },
  { Ic: Clock, ic: 'text-amber-600 bg-amber-50', label: 'Bekleyen Hatırlatma', value: '12', sub: 'Ödeme hatırlatma' },
  { Ic: Package, ic: 'text-emerald-600 bg-emerald-50', label: 'Kurtarılan Sepet', value: '₺14.400', sub: 'Son 7 gün' },
  { Ic: Bot, ic: 'text-violet-600 bg-violet-50', label: 'AI Yanıt', value: 'Açık', sub: 'Yapay zeka aktif' },
  { Ic: BarChart3, ic: 'text-emerald-600 bg-emerald-50', label: 'Başarı Oranı', value: '%100', sub: 'Son 7 gün' },
];

const AUTO_ROWS_DEF: AutoRow[] = [
  { id: 'siparis', key: 'siparisBildirimAktif', on: true, Ic: ShoppingCart, ic: 'text-emerald-600 bg-emerald-50', ad: 'Sipariş Alındı', desc: 'Yeni siparişlerde müşteriye onay mesajı gönderir.', trig: 'Yeni Sipariş', sent: 123, rate: 100, last: '05:44' },
  { id: 'odemeLink', key: 'odemeAktif', on: true, Ic: Link2, ic: 'text-sky-600 bg-sky-50', ad: 'Ödeme Linki Gönder', desc: 'Ödeme linkini müşteriye otomatik gönderir.', trig: 'Sipariş Sonrası', sent: 87, rate: 100, last: '05:43' },
  { id: 'bekle', key: 'otoYanitAktif', on: true, Ic: Clock, ic: 'text-amber-600 bg-amber-50', ad: '20 dk Bekle', desc: 'Ödeme yapmayan müşteriler için bekleme süresi.', trig: 'Zamanlayıcı', sent: 87, rate: 100, last: '05:22' },
  { id: 'hatirlat', key: 'odemeHatirlatmaAktif', on: true, Ic: Bell, ic: 'text-violet-600 bg-violet-50', ad: 'Ödeme Hatırlatma', desc: 'Ödeme yapmayan müşterilere hatırlatma mesajı gönderir.', trig: 'Ödeme Yoksa', sent: 65, rate: 100, last: '05:41' },
  { id: 'iptal', key: 'iptalAktif', on: false, Ic: Ban, ic: 'text-rose-600 bg-rose-50', ad: 'Ödeme Yoksa İptal', desc: 'Belirli süre sonunda ödeme yapılmazsa sipariş iptal edilir.', trig: 'Süre Doldu', sent: 12, rate: 0, last: '—' },
  { id: 'tamam', key: 'stokAktif', on: true, Ic: CheckSquare, ic: 'text-emerald-600 bg-emerald-50', ad: 'Sipariş Tamamlandı', desc: 'Ödeme sonrası müşteriye teşekkür mesajı gönderir.', trig: 'Ödeme Geldi', sent: 45, rate: 100, last: '05:40' },
  { id: 'kargo', key: 'riskliAktif', on: true, Ic: Truck, ic: 'text-sky-600 bg-sky-50', ad: 'Kargo Bilgisi Gönder', desc: 'Kargo bilgisi sisteme girildiğinde müşteriye gönderir.', trig: 'Kargo Oluştu', sent: 23, rate: 100, last: '05:18' },
];

// Her standart otomasyonun düzenlenebilir gerçek ayar alanı
const ROW_EDIT: Record<string, { field: string; type: 'text' | 'hours'; vars: string }> = {
  siparis: { field: 'siparisSablon', type: 'text', vars: '{ad} {no} {tutar}' },
  odemeLink: { field: 'odemeSablon', type: 'text', vars: '{ad} {no} {link}' },
  bekle: { field: 'otoYanitMetin', type: 'text', vars: '' },
  hatirlat: { field: 'odemeHatirlatmaSaatleri', type: 'hours', vars: '' },
  iptal: { field: 'iptalSablon', type: 'text', vars: '{ad} {no} {urun}' },
  tamam: { field: 'stokSablon', type: 'text', vars: '{ad} {urun}' },
  kargo: { field: 'riskliSablon', type: 'text', vars: '{ad} {urun}' },
};

const AUTO_AI: { Ic: any; t: string; d: string }[] = [
  { Ic: Sparkles, t: 'Yeni otomasyon oluştur', d: 'Sıfırdan otomasyon akışı oluşturun.' },
  { Ic: Wand2, t: 'Mesajı optimize et', d: 'Mevcut mesajları daha etkili hale getirin.' },
  { Ic: Shield, t: 'Spam riskini analiz et', d: 'Mesajlarınızın spam riskini kontrol edin.' },
];

const AUTO_QUICK: { Ic: any; t: string; d: string }[] = [
  { Ic: Power, t: 'Toplu Aç / Kapat', d: 'Seçili otomasyonları toplu olarak aç/kapatın.' },
  { Ic: Upload, t: 'İçe Aktar', d: 'Otomasyonları dosyadan içe aktarın.' },
  { Ic: Download, t: 'Dışa Aktar', d: 'Otomasyonları dosyaya dışa aktarın.' },
  { Ic: FileText, t: 'Şablonlardan Oluştur', d: 'Hazır şablonlardan otomasyon oluşturun.' },
];

const AUTO_STEPS: { n: number; Ic: any; ic: string; bar: string; t: string; d: string; on: boolean }[] = [
  { n: 1, Ic: ShoppingCart, ic: 'text-amber-500', bar: 'border-t-amber-400', t: 'Sipariş Alındı', d: 'Müşteri sipariş verdiğinde sistem tetiklenir.', on: true },
  { n: 2, Ic: Send, ic: 'text-sky-500', bar: 'border-t-sky-400', t: 'Ödeme Linki Gönder', d: 'Ödeme linki müşteriye otomatik gönderilir.', on: true },
  { n: 3, Ic: Clock, ic: 'text-amber-500', bar: 'border-t-amber-400', t: '20 dk Bekle', d: 'Müşterinin ödeme yapması için beklenir.', on: true },
  { n: 4, Ic: Bell, ic: 'text-violet-500', bar: 'border-t-violet-400', t: 'Ödeme Hatırlatma', d: 'Ödeme yapmayan müşteriye hatırlatma gönderilir.', on: true },
  { n: 5, Ic: X, ic: 'text-rose-500', bar: 'border-t-rose-400', t: 'Ödeme Yoksa İptal', d: 'Belirli süre içinde ödeme yapılmazsa iptal edilir.', on: false },
  { n: 6, Ic: CheckCircle, ic: 'text-emerald-500', bar: 'border-t-emerald-400', t: 'Sipariş Tamamlandı', d: 'Ödeme sonrası teşekkür mesajı gönderilir.', on: true },
];

function AutoSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} className={`w-10 h-[22px] rounded-full relative transition-colors shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} />
    </button>
  );
}

// ─── Bildirim Merkezi: WhatsApp + NetGSM SMS tek panel ──────────────────────────
type NotifyCh = { on: string; map?: string | null; text?: string; tpl?: string } | null;
type NotifyRow = { key: string; label: string; desc: string; wa: NotifyCh; sms: NotifyCh };
const NOTIFY_ROWS: NotifyRow[] = [
  { key: 'new', label: 'Sipariş Alındı', desc: 'Yeni sipariş oluşturulduğunda', wa: null, sms: { on: 'notify_new', tpl: 'tpl_new' } },
  { key: 'approved', label: 'Onaylandı / Kargo Hazırlık', desc: 'Sepet hazırlanıyor durumuna alınınca bilgi mesajı', wa: { on: 'hazirlikAktif', text: 'hazirlikSablon', map: 'hazirlik' }, sms: { on: 'notify_approved', tpl: 'tpl_approved' } },
  { key: 'odemeonay', label: 'Ödeme Onaylandı', desc: 'Tahsilat tamamlanınca müşteriye otomatik onay mesajı ({ad}, {tutar})', wa: { on: 'odemeOnayAktif', text: 'odemeOnaySablon', map: 'odemeonay' }, sms: null },
  { key: 'shipped', label: 'Kargoya Verildi', desc: 'Kargoda durumuna geçince veya takip no girilince', wa: null, sms: { on: 'notify_shipped', tpl: 'tpl_shipped' } },
  { key: 'cancel', label: 'Sipariş İptal', desc: 'Sipariş iptal edilince', wa: { on: 'iptalAktif', map: 'iptal' }, sms: { on: 'notify_cancel', tpl: 'tpl_cancel' } },
  { key: 'lowstock', label: 'Yetersiz Stok', desc: 'Stok yetersizliğiyle sipariş iptal olunca', wa: { on: 'stokAktif', map: 'stok' }, sms: { on: 'notify_lowstock', tpl: 'tpl_lowstock' } },
  { key: 'riskli', label: 'Riskli / Teyit', desc: 'Riskli sipariş teyit mesajı', wa: { on: 'riskliAktif', map: 'riskli' }, sms: null },
  { key: 'odeme', label: 'Ödeme Linki Gönder', desc: 'Ödenmemiş siparişe ödeme linki', wa: { on: 'odemeAktif', text: 'odemeSablon' }, sms: null },
  { key: 'odemeHat', label: 'Ödeme Hatırlatma', desc: 'Ödeme yapmayanlara zamanlı hatırlatma', wa: { on: 'odemeHatirlatmaAktif', map: 'payment' }, sms: null },
];
const SMS_VARS = '{ad} {no} {tutar} {kargo} {takip} {firma} {urun} {beden} {kod} {sepet}';

function NotifyToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center cursor-pointer shrink-0" aria-pressed={on}>
      <span className={`w-10 h-5 rounded-full relative transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-all ${on ? 'translate-x-5' : ''}`} />
      </span>
    </button>
  );
}

function BildirimMerkezi() {
  const [data, setData] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/whatsapp/notify-center').then((r) => setData(r.data)).catch((e) => toast.error(apiErrorMessage(e))); }, []);

  if (!data) return <div className="p-6 flex justify-center"><span className="w-7 h-7 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" /></div>;

  const wa = data.wa || {};
  const sms = data.sms || {};
  const templates: any[] = data.templates || [];
  const tplVarCount = (t: any) => { let m = 0; for (const x of String(t?.bodyText || '').matchAll(/\{\{(\d+)\}\}/g)) m = Math.max(m, parseInt(x[1], 10)); return m; };

  const setWa = (k: string, v: any) => setData((d: any) => ({ ...d, wa: { ...d.wa, [k]: v } }));
  const setWaMap = (k: string, v: string) => setData((d: any) => ({ ...d, wa: { ...d.wa, sablonEslesme: { ...(d.wa.sablonEslesme || {}), [k]: v } } }));
  const setSms = (k: string, v: any) => setData((d: any) => ({ ...d, sms: { ...d.sms, [k]: v } }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put('/whatsapp/notify-center', { wa: data.wa, sms: data.sms });
      setData((d: any) => ({ ...d, wa: r.data.wa, sms: r.data.sms }));
      toast.success('Bildirim ayarları kaydedildi');
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSaving(false); }
  };

  const smsOk = !!(sms.configured && sms.enabled);

  const waCell = (ch: NotifyCh) => {
    if (!ch) return <div className="text-xs text-slate-300 italic py-2">Bu durumda WhatsApp tetiklenmiyor</div>;
    const on = !!wa[ch.on];
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2"><NotifyToggle on={on} onClick={() => setWa(ch.on, !on)} /><span className={`text-xs font-medium ${on ? 'text-emerald-600' : 'text-slate-400'}`}>{on ? 'Açık' : 'Kapalı'}</span></div>
        {ch.text && (
          <textarea value={wa[ch.text] || ''} onChange={(e) => setWa(ch.text!, e.target.value)} rows={2} placeholder="WhatsApp mesaj metni…" className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50" disabled={!on} />
        )}
        {ch.map && (
          <select value={(wa.sablonEslesme || {})[ch.map] || ''} onChange={(e) => setWaMap(ch.map!, e.target.value)} disabled={!on} className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50">
            <option value="">Onaylı şablon seçin… (24s pencere kapalıysa)</option>
            {templates.map((t) => <option key={t.id} value={t.name}>{t.name}{tplVarCount(t) ? ` · ${tplVarCount(t)} değişken` : ''}</option>)}
          </select>
        )}
        {ch.map && on && !(wa.sablonEslesme || {})[ch.map] && <p className="text-[10px] text-amber-600">Şablon seçilmezse varsayılan eşleşme kullanılır.</p>}
      </div>
    );
  };

  const smsCell = (ch: NotifyCh) => {
    if (!ch) return <div className="text-xs text-slate-300 italic py-2">Bu durumda SMS tetiklenmiyor</div>;
    const on = !!sms[ch.on];
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2"><NotifyToggle on={on} onClick={() => setSms(ch.on, !on)} /><span className={`text-xs font-medium ${on ? 'text-emerald-600' : 'text-slate-400'}`}>{on ? 'Açık' : 'Kapalı'}</span></div>
        <textarea value={sms[ch.tpl!] || ''} onChange={(e) => setSms(ch.tpl!, e.target.value)} rows={2} placeholder="SMS metni…" className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50" disabled={!on} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Başlık + kanal durumları */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center"><Bell size={18} className="text-emerald-600" /></div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Bildirim Merkezi</h3>
              <p className="text-[11px] text-slate-400 max-w-xl">Hangi sipariş durumunda hangi kanaldan (WhatsApp / SMS) hangi şablonun gönderileceğini tek yerden yönetin. SMS değişkenleri: <code className="text-emerald-500">{SMS_VARS}</code></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"><MessageCircle size={12} /> WhatsApp · {templates.length} onaylı şablon</span>
            <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1 ${smsOk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}><Smartphone size={12} /> NetGSM SMS · {smsOk ? 'bağlı' : 'bilgi eksik'}</span>
          </div>
        </div>
        {!smsOk && <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">SMS bildirimlerinin gönderilebilmesi için <b>Entegrasyonlar &gt; SMS</b> bölümünden NetGSM bilgilerini girip etkinleştirin. WhatsApp tarafı bundan bağımsız çalışır.</p>}
      </div>

      {/* Matris başlık (desktop) */}
      <div className="hidden md:grid grid-cols-[1.1fr_1fr_1fr] gap-3 px-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
        <div>Durum</div>
        <div className="flex items-center gap-1.5"><MessageCircle size={13} className="text-emerald-500" /> WhatsApp</div>
        <div className="flex items-center gap-1.5"><Smartphone size={13} className="text-emerald-500" /> SMS (NetGSM)</div>
      </div>

      {/* Satırlar */}
      <div className="space-y-3">
        {NOTIFY_ROWS.map((row) => (
          <div key={row.key} className="bg-white rounded-2xl border border-slate-200 p-3 md:p-4 grid grid-cols-1 md:grid-cols-[1.1fr_1fr_1fr] gap-3 md:items-start">
            <div>
              <p className="text-sm font-semibold text-slate-700">{row.label}</p>
              <p className="text-[11px] text-slate-400">{row.desc}</p>
            </div>
            <div className="md:border-l md:border-slate-100 md:pl-3">
              <p className="md:hidden text-[10px] font-semibold text-emerald-500 uppercase mb-1">WhatsApp</p>
              {waCell(row.wa)}
            </div>
            <div className="md:border-l md:border-slate-100 md:pl-3">
              <p className="md:hidden text-[10px] font-semibold text-emerald-500 uppercase mb-1">SMS</p>
              {smsCell(row.sms)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2"><CheckCircle size={16} /> {saving ? 'Kaydediliyor…' : 'Tümünü Kaydet'}</button>
      </div>
    </div>
  );
}

function Otomasyonlar({ onTab }: { onTab: (k: any) => void }) {
  const [st, setSt] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'' | 'aktif' | 'pasif'>('');
  const [edit, setEdit] = useState<any>(null); // standart düzenleme: { row, value, on }
  const [cust, setCust] = useState<any>(null); // özel otomasyon modalı
  const [autoTab, setAutoTab] = useState<'bildirim' | 'akis' | 'klasik'>('bildirim');
  const soon = () => toast('Bu özellik yakında etkinleşecek');

  // Gerçek WhatsApp ayarlarını + onaylı şablonları yükle
  useEffect(() => {
    api.get('/whatsapp/settings').then((r) => setSt(r.data?.settings || {})).catch(() => {});
    api.get('/whatsapp/templates').then((r) => setTemplates((r.data?.templates || []).filter((t: any) => t.status === 'approved'))).catch(() => {});
  }, []);

  const tplVarCount = (t: any) => { let m = 0; for (const x of String(t?.bodyText || '').matchAll(/\{\{(\d+)\}\}/g)) m = Math.max(m, parseInt(x[1], 10)); return m; };
  const tplById = (id: string) => templates.find((t) => t.id === id);
  const VAR_DEFAULTS = ['{ad}', '{no}', '{tutar}', '{link}', '{urun}', '-'];

  const custom: any[] = Array.isArray(st?.ozelOtomasyonlar) ? st.ozelOtomasyonlar : [];
  const isOn = (r: AutoRow) => (st && r.key ? !!st[r.key] : r.on);

  const persist = async (r: AutoRow, val: boolean) => {
    if (!r.key) return;
    const prev = st;
    setSt((p: any) => ({ ...p, [r.key!]: val }));
    try { await api.put('/whatsapp/settings', { [r.key]: val }); toast.success(`${r.ad} ${val ? 'açıldı' : 'kapatıldı'}`); }
    catch (e: any) { toast.error(apiErrorMessage(e)); setSt(prev); }
  };
  const toggle = (r: AutoRow) => persist(r, !isOn(r));

  const toggleAll = async () => {
    const allOn = AUTO_ROWS_DEF.every((r) => (st && r.key ? !!st[r.key] : r.on));
    const val = !allOn;
    const body: Record<string, boolean> = {};
    AUTO_ROWS_DEF.forEach((r) => { if (r.key) body[r.key] = val; });
    setSt((p: any) => ({ ...p, ...body }));
    try { await api.put('/whatsapp/settings', body); toast.success(val ? 'Tüm otomasyonlar açıldı' : 'Tüm otomasyonlar kapatıldı'); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  // ── Standart otomasyon düzenleme ──────────────────────────────────────────
  const openEdit = (r: AutoRow) => {
    const ed = ROW_EDIT[r.id];
    const cur = st?.[ed.field];
    const value = ed.type === 'hours' ? (Array.isArray(cur) ? cur.join(', ') : '') : (cur || '');
    setEdit({ row: r, value, on: isOn(r) });
  };
  const submitEdit = async () => {
    const { row, value, on } = edit;
    const ed = ROW_EDIT[row.id];
    const body: any = { [row.key]: on };
    body[ed.field] = ed.type === 'hours' ? String(value).split(',').map((s: string) => s.trim()).filter(Boolean) : value;
    setSt((p: any) => ({ ...p, ...body }));
    setEdit(null);
    try { await api.put('/whatsapp/settings', body); toast.success(`${row.ad} güncellendi`); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  // ── Özel (kullanıcı tanımlı) otomasyonlar ─────────────────────────────────
  const saveCustom = async (list: any[]) => {
    setSt((p: any) => ({ ...p, ozelOtomasyonlar: list }));
    try { await api.put('/whatsapp/settings', { ozelOtomasyonlar: list }); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const openNew = () => setCust({ ad: '', tetikleyici: 'order', gecikmeDk: 0, mod: 'template', sablonId: '', sablonVars: [], mesaj: '', aktif: true });
  const openCust = (c: any) => setCust({ tetikleyici: 'order', gecikmeDk: 0, sablonId: '', sablonVars: [], mesaj: '', aktif: true, ...c, mod: c.mod || (c.sablonId ? 'template' : 'manual') });
  const submitCustom = async () => {
    if (!String(cust.ad).trim()) { toast.error('Otomasyon adı zorunludur'); return; }
    if (cust.mod === 'template' && !cust.sablonId) { toast.error('Bir şablon seçin'); return; }
    if (cust.mod === 'manual' && !String(cust.mesaj).trim()) { toast.error('Mesaj metni zorunludur'); return; }
    const item = {
      id: cust.id || Math.random().toString(36).slice(2, 10),
      ad: cust.ad.trim(),
      tetikleyici: cust.tetikleyici || 'order',
      gecikmeDk: Number(cust.gecikmeDk) || 0,
      mod: cust.mod,
      sablonId: cust.mod === 'template' ? cust.sablonId : '',
      sablonVars: cust.mod === 'template' ? (cust.sablonVars || []) : [],
      mesaj: cust.mod === 'manual' ? cust.mesaj.trim() : '',
      aktif: cust.aktif !== false,
    };
    const list = cust.id ? custom.map((c) => (c.id === cust.id ? item : c)) : [...custom, item];
    await saveCustom(list);
    setCust(null);
    toast.success(cust.id ? 'Otomasyon güncellendi' : 'Otomasyon oluşturuldu');
  };
  // Şablon seçilince değişken kutularını otomatik hazırla
  const pickTemplate = (id: string) => {
    const t = tplById(id);
    const n = t ? tplVarCount(t) : 0;
    setCust((p: any) => ({ ...p, sablonId: id, sablonVars: Array.from({ length: n }, (_, i) => (p.sablonVars?.[i] ?? VAR_DEFAULTS[i] ?? '')) }));
  };
  const setVar = (i: number, val: string) => setCust((p: any) => { const a = [...(p.sablonVars || [])]; a[i] = val; return { ...p, sablonVars: a }; });
  const toggleCustom = (c: any) => saveCustom(custom.map((x) => (x.id === c.id ? { ...x, aktif: !(x.aktif !== false) } : x)));
  const delCustom = (c: any) => { if (!confirm(`"${c.ad}" otomasyonu silinsin mi?`)) return; saveCustom(custom.filter((x) => x.id !== c.id)); toast.success('Otomasyon silindi'); };

  const TRIG_LBL: Record<string, string> = { order: 'Yeni Sipariş', status: 'Sipariş Durumu', payment: 'Ödeme Sonrası', manual: 'Manuel' };

  const rows: AutoRow[] = AUTO_ROWS_DEF.map((r) => ({ ...r, on: isOn(r) }));
  const matchQF = (ad: string, on: boolean) => (!q || ad.toLowerCase().includes(q.toLowerCase())) && (!filter || (filter === 'aktif' ? on : !on));
  const view = rows.filter((r) => matchQF(r.ad, r.on));
  const viewCustom = custom.filter((c) => matchQF(c.ad, c.aktif !== false));
  const activeCount = rows.filter((r) => r.on).length + custom.filter((c) => c.aktif !== false).length;
  const totalCount = rows.length + custom.length;

  return (
    <div className="space-y-4">
      {/* Alt sekmeler: Bildirim Merkezi / Akışlar (yeni workflow) / Klasik otomasyonlar */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <button onClick={() => setAutoTab('bildirim')} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${autoTab === 'bildirim' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Bildirim Merkezi</button>
        <button onClick={() => setAutoTab('akis')} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${autoTab === 'akis' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Akışlar (Workflow)</button>
        <button onClick={() => setAutoTab('klasik')} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${autoTab === 'klasik' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Klasik Otomasyonlar</button>
      </div>

      {autoTab === 'bildirim' && <BildirimMerkezi />}

      {autoTab === 'akis' && <WorkflowSection templates={templates} />}

      {autoTab === 'klasik' && (<div className="space-y-4">
      {/* Üst aksiyon */}
      <div className="flex items-center justify-end">
        <button onClick={openNew} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 flex items-center gap-1.5"><Plus size={16} /> Yeni Otomasyon</button>
      </div>

      {/* 6 istatistik kartı */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {AUTO_STATS.map((c) => {
          const isActive = c.label === 'Aktif Otomasyonlar';
          const value = isActive ? String(activeCount) : c.value;
          const sub = isActive ? `Tüm akışların %${Math.round((activeCount / Math.max(totalCount, 1)) * 100)}'i aktif` : c.sub;
          return (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.ic}`}><c.Ic size={18} /></div>
              <span className="text-[12px] text-slate-400 font-medium leading-tight">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
          </div>
          );
        })}
      </div>

      {/* Akış tablosu + sağ panel */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Otomasyon Akışları tablosu */}
        <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h3 className="font-bold text-slate-800 text-sm">Otomasyon Akışları</h3>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara..." className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-100 w-44" />
              </div>
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-100 text-slate-600">
                <option value="">Tümü</option>
                <option value="aktif">Aktif</option>
                <option value="pasif">Pasif</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[820px]">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="font-medium pb-2.5 pr-3 w-12">Durum</th>
                  <th className="font-medium pb-2.5 pr-3">Otomasyon Adı</th>
                  <th className="font-medium pb-2.5 pr-3">Tetikleyici</th>
                  <th className="font-medium pb-2.5 pr-3 whitespace-nowrap">Gönderilen (Bugün)</th>
                  <th className="font-medium pb-2.5 pr-3 whitespace-nowrap">Başarı Oranı</th>
                  <th className="font-medium pb-2.5 pr-3 whitespace-nowrap">Son Çalışma</th>
                  <th className="font-medium pb-2.5 pr-3">Durum</th>
                  <th className="font-medium pb-2.5 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {view.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="py-3 pr-3"><AutoSwitch on={r.on} onToggle={() => toggle(r)} /></td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5 min-w-[220px]">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${r.ic}`}><r.Ic size={17} /></div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-700 leading-tight">{r.ad}</p>
                          <p className="text-[11px] text-slate-400 leading-tight">{r.desc}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-3"><span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[12px] font-medium whitespace-nowrap">{r.trig}</span></td>
                    <td className="py-3 pr-3 text-slate-600 font-medium">{r.sent}</td>
                    <td className={`py-3 pr-3 font-semibold ${r.rate >= 90 ? 'text-emerald-600' : r.rate > 0 ? 'text-amber-600' : 'text-rose-500'}`}>%{r.rate}</td>
                    <td className="py-3 pr-3 text-slate-500 whitespace-nowrap">{r.on ? r.last : '—'}</td>
                    <td className="py-3 pr-3"><span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${r.on ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>{r.on ? 'Aktif' : 'Pasif'}</span></td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 flex items-center justify-center"><Pencil size={14} /></button>
                        <button onClick={() => openEdit(r)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center"><MoreVertical size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Kullanıcı tanımlı (özel) otomasyonlar */}
                {viewCustom.map((c) => {
                  const on = c.aktif !== false;
                  return (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="py-3 pr-3"><AutoSwitch on={on} onToggle={() => toggleCustom(c)} /></td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2.5 min-w-[220px]">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-indigo-600 bg-indigo-50"><Zap size={17} /></div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-700 leading-tight">{c.ad}</p>
                            <p className="text-[11px] text-slate-400 leading-tight truncate max-w-[260px]">{c.mod === 'template' ? `Şablon: ${tplById(c.sablonId)?.name || c.sablonId || '—'}${c.gecikmeDk ? ` · +${c.gecikmeDk}dk` : ''}` : c.mesaj}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-3"><span className="inline-block px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[12px] font-medium whitespace-nowrap">{TRIG_LBL[c.tetikleyici] || 'Yeni Sipariş'}</span></td>
                      <td className="py-3 pr-3 text-slate-600 font-medium">0</td>
                      <td className="py-3 pr-3 font-semibold text-slate-400">—</td>
                      <td className="py-3 pr-3 text-slate-500 whitespace-nowrap">—</td>
                      <td className="py-3 pr-3"><span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${on ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>{on ? 'Aktif' : 'Pasif'}</span></td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openCust(c)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 flex items-center justify-center"><Pencil size={14} /></button>
                          <button onClick={() => delCustom(c)} className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 flex items-center justify-center"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Yeni Otomasyon (taslak satırı) */}
                <tr className="hover:bg-slate-50/60">
                  <td className="py-3 pr-3"><AutoSwitch on={false} onToggle={openNew} /></td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2.5 min-w-[220px]">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 text-slate-400"><Plus size={17} /></div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-700 leading-tight">Yeni Otomasyon</p>
                        <p className="text-[11px] text-slate-400 leading-tight">Sıfırdan yeni otomasyon akışı oluşturun.</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-slate-300">—</td>
                  <td className="py-3 pr-3 text-slate-600 font-medium">0</td>
                  <td className="py-3 pr-3 text-slate-300">—</td>
                  <td className="py-3 pr-3 text-slate-300">—</td>
                  <td className="py-3 pr-3"><span className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">Taslak</span></td>
                  <td className="py-3 text-right"><button onClick={openNew} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-[12px] font-medium hover:bg-emerald-100">Oluştur</button></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tablo alt bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-3 mt-1 text-[12px] text-slate-400">
            <span>1 - {totalCount + 1} / {totalCount + 1} sonuç</span>
            <div className="flex items-center gap-1.5">
              <button onClick={soon} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600"><ChevronLeft size={15} /></button>
              <span className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-medium">1</span>
              <button onClick={soon} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600"><ChevronRight size={15} /></button>
            </div>
            <select className="px-2.5 py-1.5 rounded-lg border border-slate-200 outline-none text-slate-500"><option>10 / sayfa</option><option>25 / sayfa</option><option>50 / sayfa</option></select>
          </div>
        </div>

        {/* Sağ panel */}
        <div className="space-y-4">
          {/* AI Asistan */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1"><Bot size={16} className="text-violet-500" /><h3 className="font-bold text-slate-800 text-sm">AI Asistan</h3></div>
            <p className="text-[11px] text-slate-400 mb-3">Otomasyonlarınızı yapay zeka ile iyileştirin.</p>
            <div className="space-y-2">
              {AUTO_AI.map((a) => (
                <button key={a.t} onClick={() => (a.t.includes('Yeni') ? openNew() : a.t.includes('Spam') ? onTab('antispam') : soon())} className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/40 text-left transition">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0"><a.Ic size={16} /></div>
                  <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-slate-700 leading-tight">{a.t}</p><p className="text-[11px] text-slate-400 leading-tight">{a.d}</p></div>
                  <ChevronRight size={15} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Hızlı İşlemler */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-bold text-slate-800 text-sm mb-3">Hızlı İşlemler</h3>
            <div className="space-y-2">
              {AUTO_QUICK.map((a) => (
                <button key={a.t} onClick={() => (a.t.includes('Aç') ? toggleAll() : a.t.includes('Şablon') ? onTab('sablon') : soon())} className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 text-left transition">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><a.Ic size={16} /></div>
                  <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-slate-700 leading-tight">{a.t}</p><p className="text-[11px] text-slate-400 leading-tight">{a.d}</p></div>
                  <ChevronRight size={15} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Otomasyon Zaman Çizelgesi */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Otomasyon Zaman Çizelgesi</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Siparişten ödemeye kadar otomatik sürecinizin akışını görüntüleyin.</p>
          </div>
          <select className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 outline-none text-slate-600"><option>Varsayılan Akış</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {AUTO_STEPS.map((sp) => (
            <div key={sp.n} className={`rounded-xl border border-slate-200 border-t-4 ${sp.bar} p-3 bg-slate-50/40`}>
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center ${sp.ic}`}><sp.Ic size={16} /></div>
                <span className="text-[11px] font-bold text-slate-300">{sp.n}</span>
              </div>
              <p className="text-[13px] font-semibold text-slate-700 leading-tight mb-1">{sp.n}. {sp.t}</p>
              <p className="text-[11px] text-slate-400 leading-snug mb-2">{sp.d}</p>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${sp.on ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className={`text-[11px] font-medium ${sp.on ? 'text-emerald-600' : 'text-rose-500'}`}>{sp.on ? 'Aktif' : 'Pasif'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Standart otomasyon düzenleme modalı */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${edit.row.ic}`}><edit.row.Ic size={17} /></div>
                <div><h3 className="font-bold text-slate-800">{edit.row.ad}</h3><p className="text-[11px] text-slate-400">{edit.row.desc}</p></div>
              </div>
              <button onClick={() => setEdit(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 mb-3">
              <span className="text-sm font-medium text-slate-600">Otomasyon durumu</span>
              <AutoSwitch on={edit.on} onToggle={() => setEdit((p: any) => ({ ...p, on: !p.on }))} />
            </div>
            {ROW_EDIT[edit.row.id].type === 'hours' ? (
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Gönderim saatleri (HH:MM, virgülle ayırın)</label>
                <input value={edit.value} onChange={(e) => setEdit((p: any) => ({ ...p, value: e.target.value }))} placeholder="10:00, 15:00" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100" />
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Mesaj metni</label>
                <textarea value={edit.value} onChange={(e) => setEdit((p: any) => ({ ...p, value: e.target.value }))} rows={5} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 resize-none" />
                {ROW_EDIT[edit.row.id].vars && <p className="text-[11px] text-slate-400 mt-1">Değişkenler: {ROW_EDIT[edit.row.id].vars}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEdit(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">İptal</button>
              <button onClick={submitEdit} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Özel otomasyon oluştur / düzenle modalı */}
      {cust && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCust(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-indigo-600 bg-indigo-50"><Zap size={17} /></div>
                <div>
                  <h3 className="font-bold text-slate-800">{cust.id ? 'Otomasyonu Düzenle' : 'Yeni Otomasyon'}</h3>
                  <p className="text-[11px] text-slate-400">Tetikleyici, zamanlayıcı ve mesaj kaynağını belirleyin.</p>
                </div>
              </div>
              <button onClick={() => setCust(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-3.5">
              {/* 1. Otomasyon adı + Aktif */}
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Otomasyon adı <span className="text-rose-500">*</span></label>
                <input value={cust.ad} onChange={(e) => setCust((p: any) => ({ ...p, ad: e.target.value }))} placeholder="Örn. Teşekkür Mesajı" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100" />
              </div>

              {/* 2. Tetikleyici */}
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Tetikleyici</label>
                <select value={cust.tetikleyici} onChange={(e) => setCust((p: any) => ({ ...p, tetikleyici: e.target.value }))} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 bg-white">
                  <option value="order">Yeni Sipariş — sipariş oluştuğunda</option>
                  <option value="status">Sipariş Durumu — durum değiştiğinde</option>
                </select>
              </div>

              {/* 3. Zamanlayıcı (gecikme) */}
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1">Zamanlayıcı (gecikme)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={10080} value={cust.gecikmeDk ?? 0} onChange={(e) => setCust((p: any) => ({ ...p, gecikmeDk: e.target.value }))} className="w-32 px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100" />
                  <span className="text-sm text-slate-500">dakika sonra gönder</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">0 = anında. Maksimum 10080 dk (7 gün). Tetiklendiği anda zamanlanır.</p>
              </div>

              {/* 4. Mesaj kaynağı: şablon / manuel */}
              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1.5">Mesaj kaynağı</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button type="button" onClick={() => setCust((p: any) => ({ ...p, mod: 'template' }))} className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${cust.mod === 'template' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Onaylı Şablon</button>
                  <button type="button" onClick={() => setCust((p: any) => ({ ...p, mod: 'manual' }))} className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${cust.mod === 'manual' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>Manuel Yaz</button>
                </div>

                {cust.mod === 'template' ? (
                  <div className="space-y-2.5">
                    <select value={cust.sablonId || ''} onChange={(e) => pickTemplate(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 bg-white">
                      <option value="">— Onaylı şablon seçin —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name || t.ad || t.id}</option>
                      ))}
                    </select>
                    {templates.length === 0 && <p className="text-[11px] text-amber-600">Onaylı şablon bulunamadı. Şablonlar sekmesinden oluşturup Meta onayına gönderin.</p>}
                    {cust.sablonId && (() => {
                      const t = tplById(cust.sablonId);
                      const n = t ? tplVarCount(t) : 0;
                      return (
                        <div className="space-y-2">
                          {t?.bodyText && <div className="bg-slate-50 rounded-lg p-2.5 text-[12px] text-slate-500 leading-snug">{t.bodyText}</div>}
                          {n > 0 && <p className="text-[11px] text-slate-400">Şablon değişkenleri ({n} adet) — sipariş bilgileriyle doldurun:</p>}
                          {Array.from({ length: n }, (_, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-[12px] font-mono text-slate-400 w-10 shrink-0">{`{{${i + 1}}}`}</span>
                              <input value={cust.sablonVars?.[i] ?? ''} onChange={(e) => setVar(i, e.target.value)} placeholder={VAR_DEFAULTS[i] || 'değer'} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 text-sm" />
                            </div>
                          ))}
                          <p className="text-[11px] text-slate-400">Kullanılabilir: {'{ad} {no} {tutar} {link} {urun}'}</p>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    <textarea value={cust.mesaj} onChange={(e) => setCust((p: any) => ({ ...p, mesaj: e.target.value }))} rows={5} placeholder="Merhaba {ad}, ..." className="w-full px-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100 resize-none" />
                    <p className="text-[11px] text-slate-400 mt-1">Değişkenler: {'{ad} {no} {tutar} {link} {urun}'}. Manuel mesaj yalnızca 24 saatlik müşteri penceresi açıkken gönderilir.</p>
                  </div>
                )}
              </div>

              {/* Aktif */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <span className="text-sm font-medium text-slate-600">Aktif</span>
                <AutoSwitch on={cust.aktif !== false} onToggle={() => setCust((p: any) => ({ ...p, aktif: !(p.aktif !== false) }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setCust(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">İptal</button>
              <button onClick={submitCustom} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">{cust.id ? 'Güncelle' : 'Oluştur'}</button>
            </div>
          </div>
        </div>
      )}
      </div>)}
    </div>
  );
}

const WF_TRIG_LBL: Record<string, string> = { order: 'Sipariş Alındı', status: 'Sipariş Durumu', payment_received: 'Ödeme Alındı', cart_abandon: 'Sepet Terk', membership: 'Yeni Üyelik', login: 'Giriş', vip: 'VIP Oldu' };

function WfStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 rounded-lg px-2.5 py-2 text-center">
      <div className="text-base font-bold text-slate-800 leading-none">{value}</div>
      <div className="text-[10px] text-slate-400 mt-1 leading-tight">{label}</div>
    </div>
  );
}

function WorkflowSection({ templates }: { templates: any[] }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null); // workflow obj (id) ya da {} (yeni)
  const [gallery, setGallery] = useState(false);

  const load = () => { setLoading(true); api.get('/whatsapp/workflows').then((r) => setList(r.data?.workflows || [])).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const toggle = async (wf: any) => {
    setList((p) => p.map((x) => (x.id === wf.id ? { ...x, aktif: !wf.aktif } : x)));
    try { await api.put(`/whatsapp/workflows/${wf.id}`, { aktif: !wf.aktif }); } catch (e: any) { toast.error(apiErrorMessage(e)); load(); }
  };
  const del = async (wf: any) => { if (!confirm(`"${wf.ad}" akışı silinsin mi? Devam eden çalışmalar iptal edilir.`)) return; try { await api.delete(`/whatsapp/workflows/${wf.id}`); toast.success('Akış silindi'); load(); } catch (e: any) { toast.error(apiErrorMessage(e)); } };
  const dup = async (wf: any) => { try { await api.post('/whatsapp/workflows', { ad: wf.ad + ' (kopya)', triggerKind: wf.triggerKind, triggerFilter: wf.triggerFilter, graph: wf.graph, aktif: false }); toast.success('Akış kopyalandı'); load(); } catch (e: any) { toast.error(apiErrorMessage(e)); } };
  const fromTpl = async (key: string) => { try { const r = await api.post('/whatsapp/workflows/from-template', { key }); setGallery(false); toast.success('Akış oluşturuldu'); load(); if (r.data?.workflow) setEditing(r.data.workflow); } catch (e: any) { toast.error(apiErrorMessage(e)); } };

  const saveWf = async (data: any) => {
    try {
      let saved: any;
      if (editing?.id) { const r = await api.put(`/whatsapp/workflows/${editing.id}`, data); saved = r.data?.workflow; }
      else { const r = await api.post('/whatsapp/workflows', data); saved = r.data?.workflow; }
      toast.success('Akış kaydedildi'); load();
      if (saved) setEditing(saved); // düzenlemeye devam (id'yi koru)
      return true;
    } catch (e: any) { toast.error(apiErrorMessage(e)); return false; }
  };

  if (editing) return <WorkflowEditor initial={editing.id ? editing : null} templates={templates} onClose={() => { setEditing(null); load(); }} onSave={saveWf} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800">Otomasyon Akışları</h3>
          <p className="text-xs text-slate-400">Sürükle-bırak akış editörüyle gelişmiş otomasyonlar kurun.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setGallery(true)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"><LayoutGrid size={15} /> Hazır Şablonlar</button>
          <button onClick={() => setEditing({})} className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 flex items-center gap-1.5"><Plus size={15} /> Yeni Akış</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Yükleniyor…</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
          <Zap size={28} className="mx-auto text-slate-300" />
          <p className="text-sm text-slate-500 mt-2">Henüz akış yok.</p>
          <p className="text-xs text-slate-400 mt-1">Hazır bir şablonla başlayın veya sıfırdan oluşturun.</p>
          <button onClick={() => setGallery(true)} className="mt-3 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">Hazır Şablonları Gör</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map((wf) => (
            <div key={wf.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-800 truncate">{wf.ad}</h4>
                    {!wf.aktif && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">Pasif</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tetikleyici: {WF_TRIG_LBL[wf.triggerKind] || wf.triggerKind}{wf.triggerFilter?.durum ? ` · ${wf.triggerFilter.durum}` : ''}</p>
                </div>
                <AutoSwitch on={!!wf.aktif} onToggle={() => toggle(wf)} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <WfStat label="Toplam Çalıştırma" value={wf.stats?.total ?? 0} />
                <WfStat label="Başarı Oranı" value={`%${wf.stats?.basariOrani ?? 0}`} />
                <WfStat label="Son 24 Saat" value={wf.stats?.son24 ?? 0} />
                <WfStat label="Dönüşüm Oranı" value={`%${wf.stats?.donusumOrani ?? 0}`} />
                <WfStat label="Bekleyen" value={wf.stats?.bekleyen ?? 0} />
                <WfStat label="Aktif Kullanıcı" value={wf.stats?.aktifKullanici ?? 0} />
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-3">
                <button onClick={() => setEditing(wf)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:text-emerald-600 hover:border-emerald-300 flex items-center gap-1"><Pencil size={13} /> Düzenle</button>
                <button onClick={() => dup(wf)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 flex items-center gap-1"><Copy size={13} /> Kopyala</button>
                <button onClick={() => del(wf)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-400 text-xs font-medium hover:text-rose-600 hover:border-rose-300 flex items-center gap-1"><Trash2 size={13} /> Sil</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hazır şablon galerisi */}
      {gallery && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setGallery(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">Hazır Akış Şablonları</h3>
              <button onClick={() => setGallery(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TEMPLATE_GALLERY.map((t) => (
                <button key={t.key} onClick={() => fromTpl(t.key)} className="text-left p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Zap size={15} /></div>
                    <span className="font-semibold text-slate-800 text-sm">{t.ad}</span>
                    {!t.aktif && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 ml-auto">Taslak</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const QR_DEFAULT_CATS = ['Genel', 'Ödeme', 'Sipariş', 'Kargo', 'İade & Değişim', 'Kayıt', 'Pazarlama', 'Karşılama'];
const QR_VAR_LBL: Record<string, string> = { '1': 'Kullanıcı Adı', '2': 'Sipariş No', '3': 'Tutar', '4': 'Kargo Takip No', '5': 'Durum', '6': 'Link' };
const QR_CAT_COLORS = ['bg-violet-50 text-violet-700', 'bg-sky-50 text-sky-700', 'bg-emerald-50 text-emerald-700', 'bg-amber-50 text-amber-700', 'bg-rose-50 text-rose-700', 'bg-indigo-50 text-indigo-700', 'bg-teal-50 text-teal-700', 'bg-orange-50 text-orange-700'];
const qrCatColor = (cat: string, cats: string[]) => QR_CAT_COLORS[Math.max(0, cats.indexOf(cat)) % QR_CAT_COLORS.length];
const qrVarsOf = (metin?: string) => { const set = new Set<string>(); for (const m of String(metin || '').matchAll(/\{\{?(\d+)\}?\}/g)) set.add(m[1]); return Array.from(set).sort((a, b) => +a - +b); };
const qrFmtTime = (s?: string | null) => { if (!s) return '—'; const d = new Date(s); if (isNaN(d.getTime())) return '—'; const sameDay = d.toDateString() === new Date().toDateString(); return sameDay ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' }); };

function QrStat({ icon: Icon, label, value, c }: { icon: any; label: string; value: any; c: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c}`}><Icon size={18} /></div>
      <div><div className="text-[12px] text-slate-400">{label}</div><div className="text-xl font-extrabold text-slate-800 leading-tight">{value}</div></div>
    </div>
  );
}

function QuickReplies({ s, patch }: { s: any; patch: (p: any) => Promise<boolean> }) {
  const items: QuickReply[] = Array.isArray(s?.hazirCevaplar) ? s.hazirCevaplar : [];
  const cats: string[] = Array.isArray(s?.hazirKategoriler) && s.hazirKategoriler.length ? s.hazirKategoriler : QR_DEFAULT_CATS;

  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('');
  const [langF, setLangF] = useState('');
  const [statF, setStatF] = useState('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [selId, setSelId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [catModal, setCatModal] = useState(false);
  const [catDraft, setCatDraft] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');
  const [busy, setBusy] = useState(false);

  if (!s) return <div className="text-center py-16 text-slate-400 text-sm">Yükleniyor…</div>;

  const stat = { toplam: items.length, kategoriler: cats.length, aktif: items.filter((x) => x.aktif !== false).length, kullanim: items.reduce((a, x) => a + (Number(x.kullanim) || 0), 0) };
  const shortcuts = items.filter((x) => x.kisayol);

  const filtered = items
    .filter((x) => !catF || x.kategori === catF)
    .filter((x) => !langF || (x.dil || 'tr') === langF)
    .filter((x) => !statF || (statF === 'aktif' ? x.aktif !== false : x.aktif === false))
    .filter((x) => !onlyActive || x.aktif !== false)
    .filter((x) => { const t = q.trim().toLowerCase(); if (!t) return true; return String(x.baslik || '').toLowerCase().includes(t) || String(x.metin || '').toLowerCase().includes(t) || String(x.kisayol || '').toLowerCase().includes(t); });
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const pg = Math.min(page, pageCount);
  const rows = filtered.slice((pg - 1) * perPage, pg * perPage);
  const selected = items.find((x) => x.id === selId) || filtered[0] || items[0] || null;

  const persist = async (arr: QuickReply[]) => { setBusy(true); const ok = await patch({ hazirCevaplar: arr }); setBusy(false); return ok; };
  const saveItem = async (it: QuickReply) => {
    if (!String(it.metin || '').trim()) { toast.error('Metin boş olamaz'); return; }
    const id = it.id || ('qr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const next = it.id && items.some((x) => x.id === it.id) ? items.map((x) => (x.id === it.id ? { ...it, id } : x)) : [{ ...it, id }, ...items];
    const ok = await persist(next);
    if (ok) { toast.success('Hazır metin kaydedildi'); setEditing(null); setSelId(id); }
  };
  const toggleActive = async (it: QuickReply) => { await persist(items.map((x) => (x.id === it.id ? { ...x, aktif: x.aktif === false } : x))); };
  const delItem = async (it: QuickReply) => { if (!confirm(`"${it.baslik || (it.metin || '').slice(0, 20)}" silinsin mi?`)) return; const ok = await persist(items.filter((x) => x.id !== it.id)); if (ok) { toast.success('Silindi'); if (selId === it.id) setSelId(null); } };
  const openCats = () => { setCatDraft([...cats]); setNewCat(''); setCatModal(true); };
  const saveCats = async () => { const cleaned = Array.from(new Set(catDraft.map((c) => c.trim()).filter(Boolean))); const ok = await patch({ hazirKategoriler: cleaned }); if (ok) { toast.success('Kategoriler kaydedildi'); setCatModal(false); } };
  const blank = (): QuickReply => ({ id: '', baslik: '', metin: '', kategori: cats[0] || 'Genel', dil: 'tr', kisayol: '', aktif: true });

  return (
    <div className="space-y-4">
      {/* Başlık + aksiyonlar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2"><MessageCircle size={17} className="text-emerald-500" /> Hazır Metinler</h3>
          <p className="text-xs text-slate-400">Sık kullanılan mesaj şablonlarını oluştur, yönet ve sohbette tek tıkla kullan.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openCats} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"><LayoutGrid size={15} /> Kategorileri Yönet</button>
          <button onClick={() => setEditing(blank())} className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 flex items-center gap-1.5"><Plus size={16} /> Yeni Metin</button>
        </div>
      </div>

      {/* İstatistik + Kısayollarım */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1fr_1fr_1.4fr] gap-3">
        <QrStat icon={FileText} label="Toplam Metin" value={stat.toplam} c="bg-sky-50 text-sky-600" />
        <QrStat icon={LayoutGrid} label="Kategoriler" value={stat.kategoriler} c="bg-violet-50 text-violet-600" />
        <QrStat icon={CheckCircle} label="Aktif Metin" value={stat.aktif} c="bg-emerald-50 text-emerald-600" />
        <QrStat icon={BarChart3} label="Kullanılan (30 Gün)" value={stat.kullanim.toLocaleString('tr-TR')} c="bg-amber-50 text-amber-600" />
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2"><span className="text-[12px] font-semibold text-slate-500">Kısayollarım</span></div>
          <div className="flex flex-wrap gap-1.5">
            {shortcuts.length === 0 && <span className="text-[11px] text-slate-400">Kısayol tanımlı metin yok.</span>}
            {shortcuts.slice(0, 8).map((x) => (
              <button key={x.id} onClick={() => setSelId(x.id || null)} title={x.baslik || x.metin} className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-[12px] font-medium hover:bg-emerald-50 hover:text-emerald-600">{x.kisayol}</button>
            ))}
            <button onClick={() => setEditing(blank())} className="px-2 py-1 rounded-md border border-dashed border-slate-300 text-slate-400 text-[12px] hover:text-emerald-600 hover:border-emerald-300"><Plus size={12} /></button>
          </div>
        </div>
      </div>

      {/* Filtre çubuğu */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Metin ara (başlık veya içerik)…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-emerald-100" />
        </div>
        <select value={catF} onChange={(e) => { setCatF(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="">Tüm Kategoriler</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={langF} onChange={(e) => { setLangF(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="">Tüm Diller</option><option value="tr">Türkçe</option><option value="en">English</option>
        </select>
        <select value={statF} onChange={(e) => { setStatF(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="">Tüm Durumlar</option><option value="aktif">Aktif</option><option value="pasif">Pasif</option>
        </select>
        <label className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-500 select-none">Yalnızca Aktif <AutoSwitch on={onlyActive} onToggle={() => { setOnlyActive((v) => !v); setPage(1); }} /></label>
      </div>

      {/* Tablo + önizleme */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Tablo */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="hidden md:grid grid-cols-[2.2fr_1fr_0.8fr_1fr_0.9fr_0.9fr_auto] gap-3 px-4 py-2.5 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            <span>Başlık</span><span>Kategori</span><span>Dil</span><span>Kullanım (30 Gün)</span><span>Durum</span><span>Kısayol</span><span className="text-right">İşlemler</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((x) => (
              <div key={x.id} onClick={() => setSelId(x.id || null)} className={`grid grid-cols-1 md:grid-cols-[2.2fr_1fr_0.8fr_1fr_0.9fr_0.9fr_auto] gap-3 px-4 py-3 items-center cursor-pointer transition ${selected?.id === x.id ? 'bg-emerald-50/50' : 'hover:bg-slate-50/60'}`}>
                <div className="min-w-0"><p className="font-semibold text-slate-800 text-sm truncate uppercase">{x.baslik || '(başlıksız)'}</p><p className="text-[12px] text-slate-400 truncate">{x.metin}</p></div>
                <div><span className={`px-2 py-1 rounded-md text-[11px] font-medium ${qrCatColor(x.kategori || 'Genel', cats)}`}>{x.kategori || 'Genel'}</span></div>
                <div className="text-[13px] text-slate-500">{(x.dil || 'tr') === 'en' ? 'English' : 'Türkçe'}</div>
                <div className="text-[13px] font-semibold text-slate-700">{(Number(x.kullanim) || 0).toLocaleString('tr-TR')}</div>
                <div><span className={`px-2 py-1 rounded-md text-[11px] font-medium ${x.aktif !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{x.aktif !== false ? 'Aktif' : 'Pasif'}</span></div>
                <div>{x.kisayol ? <span className="px-2 py-1 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500">{x.kisayol}</span> : <span className="text-slate-300 text-xs">—</span>}</div>
                <div className="flex items-center justify-end gap-1 relative" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setEditing({ ...x })} title="Düzenle" className="w-8 h-8 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 flex items-center justify-center"><Pencil size={15} /></button>
                  <button onClick={() => setMenuId(menuId === x.id ? null : (x.id || null))} title="Diğer" className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"><MoreVertical size={15} /></button>
                  {menuId === x.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                      <div className="absolute right-0 top-9 z-20 w-40 bg-white rounded-xl border border-slate-200 shadow-lg py-1 text-sm">
                        <button onClick={() => { setMenuId(null); setSelId(x.id || null); }} className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Eye size={14} /> Önizle</button>
                        <button onClick={() => { setMenuId(null); toggleActive(x); }} className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Power size={14} /> {x.aktif !== false ? 'Pasif Yap' : 'Aktif Yap'}</button>
                        <button onClick={() => { setMenuId(null); const c = blank(); saveItem({ ...x, id: '', baslik: (x.baslik || '') + ' (kopya)', kisayol: '' }); void c; }} className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Copy size={14} /> Kopyala</button>
                        <button onClick={() => { setMenuId(null); delItem(x); }} className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2"><Trash2 size={14} /> Sil</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <div className="text-center py-14 text-slate-400"><MessageCircle size={28} className="mx-auto text-slate-300" /><p className="text-sm mt-2">{items.length === 0 ? 'Henüz hazır metin yok.' : 'Filtreye uygun metin bulunamadı.'}</p></div>
            )}
          </div>
          {/* Sayfalama */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-[12px] text-slate-400">
            <span>{filtered.length === 0 ? '0' : `${(pg - 1) * perPage + 1} - ${Math.min(pg * perPage, filtered.length)}`} / {filtered.length} sonuç</span>
            {pageCount > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pg <= 1} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"><ChevronLeft size={14} /></button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).slice(Math.max(0, pg - 3), pg + 2).map((n) => (
                  <button key={n} onClick={() => setPage(n)} className={`w-7 h-7 rounded-lg text-[12px] font-medium ${n === pg ? 'bg-emerald-500 text-white' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{n}</button>
                ))}
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={pg >= pageCount} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"><ChevronRight size={14} /></button>
              </div>
            )}
          </div>
        </div>

        {/* Önizleme paneli */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-slate-800 text-sm">Metin Önizleme</h4>
            {selected && <button onClick={() => setEditing({ ...selected })} className="text-[12px] text-emerald-600 hover:underline flex items-center gap-1"><Pencil size={12} /> Düzenle</button>}
          </div>
          {!selected ? (
            <p className="text-[12px] text-slate-400 py-8 text-center">Önizlemek için bir metin seçin.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-800 uppercase text-sm truncate">{selected.baslik || '(başlıksız)'}</p>
                <span className={`px-2 py-1 rounded-md text-[11px] font-medium ${selected.aktif !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{selected.aktif !== false ? 'Aktif' : 'Pasif'}</span>
              </div>
              <div className="text-[12px] text-slate-500 space-y-1">
                <div className="flex items-center gap-1.5">Kategori: <span className={`px-1.5 py-0.5 rounded ${qrCatColor(selected.kategori || 'Genel', cats)}`}>{selected.kategori || 'Genel'}</span></div>
                <div>Dil: {(selected.dil || 'tr') === 'en' ? 'English' : 'Türkçe'}</div>
                <div>Kısayol: {selected.kisayol ? <span className="text-emerald-600 font-medium">{selected.kisayol}</span> : '—'}</div>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-[13px] text-slate-700 whitespace-pre-wrap break-words">{selected.metin}</div>
              {qrVarsOf(selected.metin).length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-slate-600 mb-1">Değişkenler</p>
                  <div className="space-y-1">{qrVarsOf(selected.metin).map((n) => <div key={n} className="text-[12px] text-slate-500">({n}) - {QR_VAR_LBL[n] || 'Değişken'}</div>)}</div>
                </div>
              )}
              <div>
                <p className="text-[12px] font-semibold text-slate-600 mb-1">İstatistikler (30 Gün)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-lg p-2 text-center"><div className="text-base font-bold text-emerald-600 leading-none">{(Number(selected.kullanim) || 0).toLocaleString('tr-TR')}</div><div className="text-[10px] text-slate-400 mt-1">Kullanım</div></div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center"><div className="text-base font-bold text-sky-600 leading-none">—</div><div className="text-[10px] text-slate-400 mt-1">Başarı Oranı</div></div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center"><div className="text-base font-bold text-violet-600 leading-none">{qrFmtTime(selected.sonKullanim)}</div><div className="text-[10px] text-slate-400 mt-1">Son Kullanım</div></div>
                </div>
              </div>
              <button onClick={() => delItem(selected)} className="w-full mt-1 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50 flex items-center justify-center gap-1.5"><Trash2 size={14} /> Sil</button>
            </div>
          )}
        </div>
      </div>

      {/* Editör modalı */}
      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-3 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">{editing.id ? 'Metni Düzenle' : 'Yeni Hazır Metin'}</h3><button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <Field label="Başlık"><input value={editing.baslik || ''} onChange={(e) => setEditing({ ...editing, baslik: e.target.value })} className="inp" placeholder="Örn. İBAN Bilgisi" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kategori"><select value={editing.kategori || cats[0]} onChange={(e) => setEditing({ ...editing, kategori: e.target.value })} className="inp">{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              <Field label="Dil"><select value={editing.dil || 'tr'} onChange={(e) => setEditing({ ...editing, dil: e.target.value })} className="inp"><option value="tr">Türkçe</option><option value="en">English</option></select></Field>
            </div>
            <Field label="Kısayol (opsiyonel)"><input value={editing.kisayol || ''} onChange={(e) => setEditing({ ...editing, kisayol: e.target.value })} className="inp" placeholder="/iban" /></Field>
            <Field label="Metin"><textarea value={editing.metin || ''} onChange={(e) => setEditing({ ...editing, metin: e.target.value })} rows={5} className="inp resize-none" placeholder="Mesaj metni… Değişken için {1}, {2} kullanabilirsiniz." /></Field>
            {qrVarsOf(editing.metin).length > 0 && <p className="text-[11px] text-slate-400">Algılanan değişkenler: {qrVarsOf(editing.metin).map((n) => `{${n}} ${QR_VAR_LBL[n] || ''}`).join(', ')}</p>}
            <label className="flex items-center justify-between"><span className="text-sm text-slate-600">Aktif</span><AutoSwitch on={editing.aktif !== false} onToggle={() => setEditing({ ...editing, aktif: editing.aktif === false })} /></label>
            <div className="flex gap-2 pt-1">
              <button onClick={() => saveItem(editing)} disabled={busy} className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* Kategori yönetim modalı */}
      {catModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={() => setCatModal(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-md w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">Kategorileri Yönet</h3><button onClick={() => setCatModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="flex gap-2">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newCat.trim()) { setCatDraft((d) => Array.from(new Set([...d, newCat.trim()]))); setNewCat(''); } }} placeholder="Yeni kategori adı" className="inp flex-1" />
              <button onClick={() => { if (newCat.trim()) { setCatDraft((d) => Array.from(new Set([...d, newCat.trim()]))); setNewCat(''); } }} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200"><Plus size={15} /></button>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {catDraft.length === 0 && <p className="text-[12px] text-slate-400 py-2">Kategori yok.</p>}
              {catDraft.map((c, i) => {
                const used = items.filter((x) => x.kategori === c).length;
                return (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200">
                    <span className="flex items-center gap-2"><span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${qrCatColor(c, catDraft)}`}>{c}</span><span className="text-[11px] text-slate-400">{used} metin</span></span>
                    <button onClick={() => setCatDraft((d) => d.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-1"><button onClick={saveCats} className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">Kaydet</button><button onClick={() => setCatModal(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm">İptal</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

const KIND_LABELS: Record<string, string> = { bulk: 'Toplu Mesaj', auto: 'Otomatik', manual: 'Manuel', template: 'Şablon', order: 'Sipariş', status: 'Durum', payment: 'Ödeme' };

function Queue() {
  const [rows, setRows] = useState<any[]>([]);
  const [byKind, setByKind] = useState<Record<string, number>>({});
  const [totalAll, setTotalAll] = useState(0);
  const [total, setTotal] = useState(0);
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const pageSize = 50;

  const load = () => {
    setLoading(true);
    api.get('/whatsapp/queue', { params: { kind, page, pageSize } })
      .then((r) => { setRows(r.data.rows || []); setByKind(r.data.byKind || {}); setTotalAll(r.data.totalAll || 0); setTotal(r.data.total || 0); })
      .catch((e) => toast.error(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); setSel(new Set()); }, [kind, page]);

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel((p) => { const n = new Set(p); if (allOnPage) rows.forEach((r) => n.delete(r.id)); else rows.forEach((r) => n.add(r.id)); return n; });

  const cancel = async (payload: any, soru: string) => {
    if (!window.confirm(soru)) return;
    setBusy(true);
    try { const r = await api.post('/whatsapp/queue/cancel', payload); toast.success(`${r.data.cancelled} mesaj iptal edildi`); setSel(new Set()); setPage(1); load(); }
    catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {/* Özet + toplu aksiyon */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><Clock size={15} className="text-amber-500" /> Bekleyen Mesaj Kuyruğu</h3>
            <p className="text-[12px] text-slate-400 mt-0.5">İletilmemiş <b className="text-slate-600">{totalAll}</b> mesaj bekliyor.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-[12px] font-medium hover:bg-slate-200 flex items-center gap-1"><RefreshCw size={13} /> Yenile</button>
            <button disabled={busy || totalAll === 0} onClick={() => cancel({ all: true }, `Bekleyen TÜM ${totalAll} mesajı iptal etmek istediğinize emin misiniz?`)} className="px-3 py-2 rounded-lg bg-red-500 text-white text-[12px] font-medium hover:bg-red-600 disabled:opacity-40 flex items-center gap-1"><Trash2 size={13} /> Tümünü İptal Et</button>
          </div>
        </div>
        {/* Kind filtreleri */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => { setKind(''); setPage(1); }} className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${kind === '' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>Tümü ({totalAll})</button>
          {Object.entries(byKind).map(([k, n]) => (
            <span key={k} className="inline-flex items-center">
              <button onClick={() => { setKind(k); setPage(1); }} className={`px-2.5 py-1 rounded-l-full text-[11px] font-medium border ${kind === k ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{KIND_LABELS[k] || k} ({n})</button>
              <button disabled={busy} onClick={() => cancel({ all: true, kind: k }, `"${KIND_LABELS[k] || k}" türündeki ${n} mesajı iptal et?`)} title="Bu türü iptal et" className={`px-1.5 py-1 rounded-r-full text-[11px] border border-l-0 ${kind === k ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-red-500 border-slate-200 hover:bg-red-50'}`}>×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Seçim aksiyon barı */}
      {sel.size > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-sm">
          <span className="text-emerald-800 font-medium">{sel.size} mesaj seçildi</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSel(new Set())} className="text-slate-500 text-[12px] hover:underline">Seçimi Temizle</button>
            <button disabled={busy} onClick={() => cancel({ ids: Array.from(sel) }, `Seçili ${sel.size} mesajı iptal et?`)} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[12px] font-medium hover:bg-red-600 disabled:opacity-40 flex items-center gap-1"><Trash2 size={13} /> Seçilenleri İptal Et</button>
          </div>
        </div>
      )}

      {/* Tablo */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-[12px]">
            <tr>
              <th className="p-2.5 w-8 text-left"><input type="checkbox" checked={allOnPage} onChange={toggleAll} /></th>
              <th className="p-2.5 text-left font-medium">Tarih</th>
              <th className="p-2.5 text-left font-medium">Telefon</th>
              <th className="p-2.5 text-left font-medium">Tür</th>
              <th className="p-2.5 text-left font-medium">İçerik</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center"><span className="w-6 h-6 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin inline-block" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-slate-400">Kuyrukta bekleyen mesaj yok.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className={`border-t border-slate-100 hover:bg-slate-50 ${sel.has(r.id) ? 'bg-emerald-50/50' : ''}`}>
                <td className="p-2.5"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="p-2.5 text-[12px] text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="p-2.5 text-[12px] text-slate-700 whitespace-nowrap">{r.customerPhone}</td>
                <td className="p-2.5"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">{KIND_LABELS[r.kind] || r.kind}</span></td>
                <td className="p-2.5 text-[12px] text-slate-600 max-w-[420px] truncate" title={r.body}>{r.templateId ? <span className="text-violet-600">[şablon] </span> : null}{r.body || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-2.5 border-t border-slate-100 text-[12px] text-slate-500">
            <span>Sayfa {page} / {totalPages}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2.5 py-1 rounded-lg bg-slate-100 disabled:opacity-40">Önceki</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2.5 py-1 rounded-lg bg-slate-100 disabled:opacity-40">Sonraki</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsTab() {
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<'genel' | 'otomasyon' | 'sablon' | 'hazir' | 'hat' | 'kuyruk' | 'antispam'>('genel');

  useEffect(() => { api.get('/whatsapp/settings').then((r) => setS(r.data.settings)).catch(() => {}); }, []);

  const save = async () => {
    setSaving(true);
    // sablonEslesme bu sekmede yönetilmiyor (Şablonlar sekmesine ait); göndermezsek üzerine yazıp silmeyiz.
    const payload: any = { ...s };
    delete payload.sablonEslesme;
    delete payload._yeniSaat;
    try { const r = await api.put('/whatsapp/settings', payload); setS(r.data.settings); toast.success('Ayarlar kaydedildi'); }
    catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSaving(false); }
  };
  const up = (k: string, v: any) => setS((p: any) => ({ ...p, [k]: v }));
  // Kısmi kayıt (yalnızca verilen alanları gönderir; diğer ayarları ezmez, stale-closure önler)
  const patch = async (partial: any) => {
    try { const r = await api.put('/whatsapp/settings', partial); setS(r.data.settings); return true; }
    catch (e: any) { toast.error(apiErrorMessage(e)); return false; }
  };

  // Alt sekmeler her zaman görünür; veri yüklenirken sadece içerik spinner gösterir
  const SUBS: { k: typeof sub; icon: any; label: string }[] = [
    { k: 'genel', icon: LayoutGrid, label: 'Genel Durum' },
    { k: 'otomasyon', icon: Zap, label: 'Otomasyonlar' },
    { k: 'sablon', icon: FileText, label: 'Şablonlar' },
    { k: 'hazir', icon: MessageCircle, label: 'Hazır Metinler' },
    { k: 'hat', icon: Smartphone, label: 'Hat Yönetimi' },
    { k: 'kuyruk', icon: Clock, label: 'Mesaj Kuyruğu' },
    { k: 'antispam', icon: Shield, label: 'Anti-Spam & Güvenlik' },
  ];

  const preview = s ? String(s.siparisSablon || '').replace(/\{ad\}/g, 'Ayşe Yılmaz').replace(/\{no\}/g, '2026-042').replace(/\{tutar\}/g, '1.250') : '';

  return (
    <div className="space-y-4">
      {/* Alt sekme barı (referans tasarım) */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {SUBS.map((it) => (
          <TabBtn key={it.k} active={sub === it.k} onClick={() => setSub(it.k)} icon={it.icon} label={it.label} />
        ))}
      </div>

      {sub === 'genel' ? (
        <GenelDurum onTab={setSub} />
      ) : sub === 'otomasyon' ? (
        <Otomasyonlar onTab={setSub} />
      ) : sub === 'sablon' ? (
        <Templates />
      ) : sub === 'hat' ? (
        <Lines onChange={() => {}} />
      ) : sub === 'kuyruk' ? (
        <Queue />
      ) : sub === 'hazir' ? (
        <QuickReplies s={s} patch={patch} />
      ) : !s ? (
        <div className="p-6 flex justify-center"><span className="w-7 h-7 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" /></div>
      ) : (
        <div className="max-w-5xl space-y-4">
          {sub === 'antispam' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <p>Anti-spam ayarlarını düşürmek ban riskini artırır. Önerilen: hat başına en az 8sn aralık, günlük 200 mesaj sınırı.</p>
            </div>
          )}

          <div className="columns-1 lg:columns-2 gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid">

            {false && (<>
              {/* Sipariş bildirimi (eski form — yeni Otomasyonlar sekmesiyle değiştirildi) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm">Sipariş Bildirimi</h3>
                <Toggle label="Sipariş alındığında müşteriye otomatik mesaj gönder" checked={s.siparisBildirimAktif} onChange={(v) => up('siparisBildirimAktif', v)} />
                <Field label="Mesaj şablonu">
                  <textarea value={s.siparisSablon} onChange={(e) => up('siparisSablon', e.target.value)} rows={3} className="inp resize-none" />
                  <p className="text-[11px] text-slate-400 mt-1">Değişkenler: <code>{'{ad}'}</code> müşteri adı · <code>{'{no}'}</code> sipariş no · <code>{'{tutar}'}</code> toplam</p>
                </Field>
                <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600"><span className="text-xs text-slate-400 block mb-1">Önizleme</span>{preview}</div>
              </div>

              {/* Durum bildirimleri */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm">Durum Bildirimleri <span className="font-normal text-slate-400">(yalnızca kayıtlı müşteriye)</span></h3>
                <Toggle label="Sipariş iptalinde mesaj gönder" checked={!!s.iptalAktif} onChange={(v) => up('iptalAktif', v)} />
                {s.iptalAktif && (
                  <Field label="İptal şablonu">
                    <textarea value={s.iptalSablon || ''} onChange={(e) => up('iptalSablon', e.target.value)} rows={2} className="inp resize-none" />
                    <p className="text-[11px] text-slate-400 mt-1">Değişkenler: <code>{'{ad}'}</code> · <code>{'{no}'}</code> · <code>{'{urun}'}</code></p>
                  </Field>
                )}
                <Toggle label="Yetersiz stok durumunda mesaj gönder" checked={!!s.stokAktif} onChange={(v) => up('stokAktif', v)} />
                {s.stokAktif && (
                  <Field label="Yetersiz stok şablonu">
                    <textarea value={s.stokSablon || ''} onChange={(e) => up('stokSablon', e.target.value)} rows={2} className="inp resize-none" />
                    <p className="text-[11px] text-slate-400 mt-1">Değişkenler: <code>{'{ad}'}</code> · <code>{'{urun}'}</code></p>
                  </Field>
                )}
                <Toggle label="Riskli / teyit gereken siparişte mesaj gönder" checked={!!s.riskliAktif} onChange={(v) => up('riskliAktif', v)} />
                {s.riskliAktif && (
                  <Field label="Riskli/teyit şablonu">
                    <textarea value={s.riskliSablon || ''} onChange={(e) => up('riskliSablon', e.target.value)} rows={2} className="inp resize-none" />
                    <p className="text-[11px] text-slate-400 mt-1">Değişkenler: <code>{'{ad}'}</code> · <code>{'{urun}'}</code></p>
                  </Field>
                )}
              </div>

              {/* Oto-yanıt */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm">Otomatik Yanıt</h3>
                <Toggle label="İlk kez yazan müşteriye otomatik karşılama gönder" checked={s.otoYanitAktif} onChange={(v) => up('otoYanitAktif', v)} />
                {s.otoYanitAktif && (
                  <Field label="Karşılama metni"><textarea value={s.otoYanitMetin || ''} onChange={(e) => up('otoYanitMetin', e.target.value)} rows={2} className="inp resize-none" placeholder="Merhaba, mesajınız alındı, en kısa sürede dönüş yapacağız." /></Field>
                )}
              </div>

              {/* Ödeme isteme */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm">Ödeme İsteme</h3>
                <Toggle label="Gelen kutusundan ödeme/sepet linki gönderimini etkinleştir" checked={!!s.odemeAktif} onChange={(v) => up('odemeAktif', v)} />
                {s.odemeAktif && (
                  <Field label="Ödeme mesajı şablonu">
                    <textarea value={s.odemeSablon || ''} onChange={(e) => up('odemeSablon', e.target.value)} rows={2} className="inp resize-none" placeholder="Merhaba {ad}, {no} numaralı siparişinizin ödemesini şu linkten tamamlayabilirsiniz: {link}" />
                    <p className="text-[11px] text-slate-400 mt-1">Değişkenler: <code>{'{ad}'}</code> · <code>{'{no}'}</code> · <code>{'{link}'}</code> ödeme/sepet linki</p>
                  </Field>
                )}
              </div>

              {/* Ödeme yapmayanlara zamanlı toplu hatırlatma */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <h3 className="font-bold text-slate-800 text-sm">Otomatik Ödeme Hatırlatması</h3>
                <Toggle label="Ödeme yapmayan tüm sepetlere ayarlı saatlerde otomatik ödeme talebi gönder" checked={!!s.odemeHatirlatmaAktif} onChange={(v) => up('odemeHatirlatmaAktif', v)} />
                {s.odemeHatirlatmaAktif && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-400">Gün içinde hangi saatlerde gönderileceğini siz belirleyin. Her saatte ödeme bekleyen tüm siparişlere ödeme talebi iletilir.</p>
                    <div className="flex flex-wrap gap-2">
                      {(Array.isArray(s.odemeHatirlatmaSaatleri) ? s.odemeHatirlatmaSaatleri : []).map((hh: string, i: number) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-lg">
                          {hh}
                          <button onClick={() => up('odemeHatirlatmaSaatleri', (s.odemeHatirlatmaSaatleri as string[]).filter((_: string, j: number) => j !== i))} className="text-emerald-500 hover:text-rose-600"><Trash2 size={13} /></button>
                        </span>
                      ))}
                      {(!Array.isArray(s.odemeHatirlatmaSaatleri) || s.odemeHatirlatmaSaatleri.length === 0) && <span className="text-[12px] text-slate-400 py-1">Henüz saat eklenmedi.</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="time" value={s._yeniSaat || ''} onChange={(e) => up('_yeniSaat', e.target.value)} className="inp w-auto" />
                      <button onClick={() => { const v = String(s._yeniSaat || '').trim(); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { toast.error('Geçerli bir saat seçin'); return; } const cur = Array.isArray(s.odemeHatirlatmaSaatleri) ? s.odemeHatirlatmaSaatleri : []; if (cur.includes(v)) { toast.error('Bu saat zaten ekli'); return; } setS((p: any) => ({ ...p, odemeHatirlatmaSaatleri: [...cur, v].sort(), _yeniSaat: '' })); }} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-600 text-[12px] font-medium hover:bg-slate-200 flex items-center gap-1"><Plus size={13} /> Saat Ekle</button>
                    </div>
                  </div>
                )}
              </div>

              {/* AI oto-yanıt */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm">AI Otomatik Yanıt</h3>
                <Toggle label="Gelen sorulara yapay zeka ile otomatik cevap ver" checked={!!s.aiAutoReplyAktif} onChange={(v) => up('aiAutoReplyAktif', v)} />
                {s.aiAutoReplyAktif && (
                  <>
                    <Toggle label="Yalnızca 24 saatlik pencere içinde yanıt ver (önerilir)" checked={s.aiSadecePencereIci !== false} onChange={(v) => up('aiSadecePencereIci', v)} />
                    <Field label="AI talimatı / işletme bilgisi (opsiyonel)">
                      <textarea value={s.aiPrompt || ''} onChange={(e) => up('aiPrompt', e.target.value)} rows={3} className="inp resize-none" placeholder="Mağazamız hakkında: çalışma saatleri, kargo süresi, iade politikası vb." />
                    </Field>
                    <p className="text-[11px] text-slate-400">AI yalnızca gelen müşteri mesajlarına yanıt verir; kendi gönderdiği veya şablon mesajlara yanıt vermez (döngü koruması).</p>
                  </>
                )}
              </div>
            </>)}

            {sub === 'antispam' && (<>
              {/* Anti-spam */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm">Anti-Spam & Dağıtım</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Min gönderim aralığı (sn)"><input type="number" value={s.globalAralikSn} onChange={(e) => up('globalAralikSn', Number(e.target.value))} className="inp" /></Field>
                  <Field label="Rastgele ek gecikme / jitter (sn)"><input type="number" value={s.jitterSn} onChange={(e) => up('jitterSn', Number(e.target.value))} className="inp" /></Field>
                  <Field label="Hat başına günlük yeni sohbet limiti"><input type="number" value={s.lineDefaultLimit} onChange={(e) => up('lineDefaultLimit', Number(e.target.value))} className="inp" /></Field>
                </div>
                <p className="text-[11px] text-slate-400">Limit, <b>yeni başlatılan sohbet</b> sayısını sınırlar (son 24 saatte mesajı olmayan müşteri). Mevcut sohbete devam eden mesajlar limite sayılmaz, böylece spam riski azalır.</p>
                <Toggle label="Çalışma saatleri dışında gönderme" checked={s.calismaSaatAktif} onChange={(v) => up('calismaSaatAktif', v)} />
                {s.calismaSaatAktif && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Başlangıç"><input type="time" value={s.calismaBasla} onChange={(e) => up('calismaBasla', e.target.value)} className="inp" /></Field>
                    <Field label="Bitiş"><input type="time" value={s.calismaBitis} onChange={(e) => up('calismaBitis', e.target.value)} className="inp" /></Field>
                  </div>
                )}
              </div>

              {/* Cloud API */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><Cloud size={15} className="text-sky-500" /> Cloud API (Resmî WhatsApp)</h3>
                <Toggle label="Şablon onayı yokken QR (Baileys) hattından otomatik gönder (fallback)" checked={s.apiFallbackBaileys !== false} onChange={(v) => up('apiFallbackBaileys', v)} />
                <p className="text-[11px] text-slate-400">Açıkken: API hattının 24s penceresi kapalı ve onaylı şablon yoksa mesaj bir QR hattından gönderilir, böylece bekleme olmaz.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Meta App ID (opsiyonel)"><input value={s.metaAppId || ''} onChange={(e) => up('metaAppId', e.target.value)} className="inp" placeholder="123456789012345" /></Field>
                  <Field label="Meta App Secret (opsiyonel · webhook imzası)"><input value={s.metaAppSecret || ''} onChange={(e) => up('metaAppSecret', e.target.value)} className="inp" placeholder="••••••••" /></Field>
                </div>
              </div>
            </>)}

          </div>

          <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">{saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}</button>
        </div>
      )}

      <style>{`.inp{width:100%;padding:0.5rem 0.75rem;font-size:0.875rem;border-radius:0.5rem;border:1px solid #e2e8f0;outline:none}.inp:focus{box-shadow:0 0 0 2px #d1fae5}`}</style>
    </div>
  );
}

// ─── Şablonlar ───────────────────────────────────────────────────────────────────
const TPL_STATUS: Record<string, { t: string; c: string }> = {
  draft: { t: 'Taslak', c: 'bg-slate-100 text-slate-600' },
  pending: { t: 'Onay bekliyor', c: 'bg-amber-100 text-amber-700' },
  approved: { t: 'Onaylı', c: 'bg-emerald-100 text-emerald-700' },
  rejected: { t: 'Reddedildi', c: 'bg-red-100 text-red-700' },
  disabled: { t: 'Pasif', c: 'bg-slate-200 text-slate-500' },
};

function Templates() {
  const [list, setList] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [busy, setBusy] = useState(false);
  const [sMap, setSMap] = useState<Record<string, string>>({});
  const [mapSaving, setMapSaving] = useState(false);
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('');
  const [langF, setLangF] = useState('');
  const [statF, setStatF] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');
  const [preview, setPreview] = useState<Template | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [catSel, setCatSel] = useState('');

  useEffect(() => { api.get('/store/catalogs').then((r) => setCats((r.data.rows || []).filter((c: any) => c.aktif !== false))).catch(() => {}); }, []);

  // En büyük {{n}} değişken indeksi
  const maxVarIndex = (text?: string) => { let m = 0; for (const x of String(text || '').matchAll(/\{\{(\d+)\}\}/g)) m = Math.max(m, parseInt(x[1], 10)); return m; };
  // Bir değişkenin şablon bazlı örnek değerini güncelle (sampleJson dizisi)
  const setSample = (i: number, v: string) => {
    const arr = Array.isArray(editing?.sampleJson) ? [...(editing!.sampleJson as any[])] : [];
    while (arr.length < i + 1) arr.push('');
    arr[i] = v;
    setEditing({ ...editing!, sampleJson: arr });
  };
  // Seçili kataloğun linkini yeni bir {{n}} değişkeni olarak gövdeye ekle + örneğini doldur
  const addCatalogVar = () => {
    const c = cats.find((x) => x.id === catSel);
    if (!c) { toast.error('Önce bir katalog seçin'); return; }
    const link = `${location.origin}/ozel-katalog/${c.slug || c.id}`;
    const body = String(editing?.bodyText || '');
    const n = maxVarIndex(body) + 1;
    const newBody = (body ? body.replace(/\s*$/, '') + '\n' : '') + `🔗 {{${n}}}`;
    const arr = Array.isArray(editing?.sampleJson) ? [...(editing!.sampleJson as any[])] : [];
    while (arr.length < n) arr.push('');
    arr[n - 1] = link;
    setEditing({ ...editing!, bodyText: newBody, sampleJson: arr });
    toast.success(`Katalog linki {{${n}}} değişkeni olarak eklendi`);
  };

  const load = () => api.get('/whatsapp/templates').then((r) => setList(r.data.templates || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get('/whatsapp/settings').then((r) => setSMap(r.data?.settings?.sablonEslesme || {})).catch(() => {}); }, []);
  const saveMap = async () => { setMapSaving(true); try { await api.put('/whatsapp/settings', { sablonEslesme: sMap }); toast.success('Şablon eşleştirmesi kaydedildi'); } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setMapSaving(false); } };

  const sync = async () => { setBusy(true); try { const r = await api.post('/whatsapp/templates/sync'); setList(r.data.templates || []); toast.success('Durumlar senkronlandı'); } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setBusy(false); } };
  const seedDefaults = async () => {
    if (!confirm('Varsayılan sistem şablonları (sipariş güncelleme + ödeme talebi) oluşturulup Meta onayına gönderilsin mi?')) return;
    setBusy(true);
    try { const r = await api.post('/whatsapp/templates/seed-defaults'); setList(r.data.templates || []); toast.success('Varsayılan şablonlar oluşturuldu ve onaya gönderildi'); }
    catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setBusy(false); }
  };
  const saveTpl = async () => {
    if (!editing) return;
    try {
      if (editing.id) await api.put(`/whatsapp/templates/${editing.id}`, editing);
      else await api.post('/whatsapp/templates', editing);
      toast.success('Kaydedildi'); setEditing(null); load();
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const submit = async (t: Template) => {
    if (!confirm(`"${t.name}" şablonu Meta onayına gönderilsin mi?`)) return;
    try { const r = await api.post(`/whatsapp/templates/${t.id}/submit`); toast.success(`Gönderildi (${TPL_STATUS[r.data.status]?.t || r.data.status})`); load(); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (t: Template) => { if (!confirm(`"${t.name}" silinsin mi?`)) return; try { await api.delete(`/whatsapp/templates/${t.id}`); load(); } catch (e: any) { toast.error(apiErrorMessage(e)); } };

  const varCount = editing?.bodyText ? (String(editing.bodyText).match(/\{\{(\d+)\}\}/g) || []).length : 0;

  // ── Görünüm yardımcıları (yalnızca sunum — veriye dokunmaz) ──
  const CAT_META: Record<string, { label: string; icon: any; chip: string; ic: string }> = {
    UTILITY: { label: 'İşlem', icon: ShoppingCart, chip: 'bg-sky-50 text-sky-700', ic: 'bg-sky-100 text-sky-600' },
    MARKETING: { label: 'Pazarlama', icon: Megaphone, chip: 'bg-violet-50 text-violet-700', ic: 'bg-violet-100 text-violet-600' },
    AUTHENTICATION: { label: 'Doğrulama', icon: Shield, chip: 'bg-amber-50 text-amber-700', ic: 'bg-amber-100 text-amber-600' },
  };
  const catMeta = (c?: string) => CAT_META[String(c || 'UTILITY').toUpperCase()] || CAT_META.UTILITY;
  const langLbl = (l?: string) => (String(l || 'tr') === 'en' ? 'English' : 'Türkçe');
  const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const tplVars = (t?: any) => { let m = 0; for (const x of String(t?.bodyText || '').matchAll(/\{\{(\d+)\}\}/g)) m = Math.max(m, parseInt(x[1], 10)); return m; };

  const stat = {
    total: list.length,
    approved: list.filter((t) => t.status === 'approved').length,
    pending: list.filter((t) => t.status === 'pending').length,
    rejected: list.filter((t) => t.status === 'rejected').length,
    draft: list.filter((t) => t.status === 'draft').length,
    langs: new Set(list.map((t) => t.language || 'tr')).size,
  };
  const basari = stat.total ? Math.round((stat.approved / stat.total) * 100) : 0;
  const catCounts: Record<string, number> = {};
  list.forEach((t) => { const c = String(t.category || 'UTILITY').toUpperCase(); catCounts[c] = (catCounts[c] || 0) + 1; });

  const filtered = list
    .filter((t) => (!catF || String(t.category || 'UTILITY').toUpperCase() === catF))
    .filter((t) => (!langF || String(t.language || 'tr') === langF))
    .filter((t) => (!statF || t.status === statF))
    .filter((t) => { const s = q.trim().toLowerCase(); if (!s) return true; return String(t.name || '').toLowerCase().includes(s) || String(t.bodyText || '').toLowerCase().includes(s); })
    .sort((a, b) => (sort === 'name' ? String(a.name || '').localeCompare(String(b.name || '')) : new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()));

  return (
    <div className="space-y-4">
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sm text-sky-900 flex gap-2">
        <FileText size={18} className="shrink-0 mt-0.5" />
        <p>Cloud API'de 24 saatlik pencere dışında mesaj göndermek için <b>onaylı şablon</b> gerekir. Şablonu oluşturup <b>Onaya Gönder</b> deyin; onay genelde dakikalar içinde gelir. <b>Utility</b> kategorisi en hızlı onaylanır. Onay beklerken sistem (fallback açıksa) QR hattından gönderir.</p>
      </div>

      {/* Aksiyon çubuğu */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 className="font-bold text-slate-800">Şablonlar</h3>
          <p className="text-xs text-slate-400">Onaylı mesaj şablonlarını yönet, yeni şablon oluştur ve performanslarını takip et.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={sync} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Durumları Yenile</button>
          <button onClick={seedDefaults} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-1.5"><FileText size={15} /> Varsayılanları Oluştur</button>
          <button onClick={() => setEditing({ language: 'tr', category: 'UTILITY', headerType: 'none', bodyText: '' })} className="px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 flex items-center gap-1.5"><Plus size={16} /> Yeni Şablon</button>
        </div>
      </div>

      {/* 6 istatistik kartı (gerçek verilerden) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { icon: Send, lbl: 'Toplam Şablon', val: stat.total, sub: 'Tüm kategoriler', c: 'bg-emerald-50 text-emerald-600' },
          { icon: CheckCircle, lbl: 'Onaylı Şablon', val: stat.approved, sub: `%${basari} başarılı`, c: 'bg-emerald-50 text-emerald-600' },
          { icon: Clock, lbl: 'Onay Bekleyen', val: stat.pending, sub: 'İnceleniyor', c: 'bg-amber-50 text-amber-600' },
          { icon: Ban, lbl: 'Reddedilen', val: stat.rejected, sub: 'Düzeltme gerekli', c: 'bg-rose-50 text-rose-600' },
          { icon: Pencil, lbl: 'Taslak', val: stat.draft, sub: 'Gönderilmedi', c: 'bg-slate-100 text-slate-500' },
          { icon: MessageCircle, lbl: 'Dil Sayısı', val: stat.langs, sub: 'Aktif diller', c: 'bg-sky-50 text-sky-600' },
        ].map((s) => (
          <div key={s.lbl} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.c}`}><s.icon size={16} /></div>
              <span className="text-[12px] text-slate-500 font-medium leading-tight">{s.lbl}</span>
            </div>
            <div className="text-2xl font-extrabold text-slate-800 mt-2 leading-none">{s.val}</div>
            <div className="text-[11px] text-slate-400 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtre çubuğu */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={catF} onChange={(e) => setCatF(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="">Tüm Kategoriler</option>
          <option value="UTILITY">İşlem (Utility)</option>
          <option value="MARKETING">Pazarlama</option>
          <option value="AUTHENTICATION">Doğrulama</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Şablon ara (isim veya içerik)…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-emerald-100" />
        </div>
        <select value={langF} onChange={(e) => setLangF(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="">Tüm Diller</option>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
        <select value={statF} onChange={(e) => setStatF(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="">Tüm Durumlar</option>
          <option value="approved">Onaylı</option>
          <option value="pending">Onay bekliyor</option>
          <option value="rejected">Reddedildi</option>
          <option value="draft">Taslak</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100">
          <option value="updated">Sırala: Son Güncellenen</option>
          <option value="name">Sırala: İsim (A-Z)</option>
        </select>
      </div>

      {/* Tablo + sağ panel */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Tablo */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="hidden md:grid grid-cols-[2.4fr_1fr_0.8fr_1fr_1.3fr_auto] gap-3 px-4 py-2.5 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            <span>Şablon Adı</span><span>Kategori</span><span>Dil</span><span>Durum</span><span>Son Güncelleme</span><span className="text-right">İşlemler</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filtered.map((t) => {
              const ts = TPL_STATUS[t.status] || TPL_STATUS.draft;
              const cm = catMeta(t.category);
              const editable = t.status === 'draft' || t.status === 'rejected';
              const submittable = t.status !== 'approved' && t.status !== 'pending';
              return (
                <div key={t.id} className="grid grid-cols-1 md:grid-cols-[2.4fr_1fr_0.8fr_1fr_1.3fr_auto] gap-3 px-4 py-3 items-center hover:bg-slate-50/60 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${cm.ic}`}><cm.icon size={16} /></div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">{t.name}</p>
                      <p className="text-[12px] text-slate-400 truncate">{t.bodyText}</p>
                    </div>
                  </div>
                  <div><span className={`px-2 py-1 rounded-md text-[11px] font-medium ${cm.chip}`}>{cm.label}</span></div>
                  <div className="text-[13px] text-slate-500">{langLbl(t.language)}</div>
                  <div><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium ${ts.c}`}>{ts.t}</span></div>
                  <div className="text-[12px] text-slate-500">{fmtDate(t.updatedAt)}</div>
                  <div className="flex items-center justify-end gap-1 relative">
                    <button onClick={() => setPreview(t)} title="Önizle" className="w-8 h-8 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 flex items-center justify-center"><Eye size={15} /></button>
                    <button onClick={() => editable ? setEditing(t) : setPreview(t)} title={editable ? 'Düzenle' : 'Onaylı/bekleyen şablon düzenlenemez'} disabled={!editable} className={`w-8 h-8 rounded-lg flex items-center justify-center ${editable ? 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50' : 'text-slate-200 cursor-not-allowed'}`}><Pencil size={15} /></button>
                    <button onClick={() => setMenuId(menuId === t.id ? null : t.id)} title="Diğer" className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"><MoreVertical size={15} /></button>
                    {menuId === t.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                        <div className="absolute right-0 top-9 z-20 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 text-sm">
                          {submittable && <button onClick={() => { setMenuId(null); submit(t); }} className="w-full text-left px-3 py-2 text-sky-600 hover:bg-sky-50 flex items-center gap-2"><Send size={14} /> Onaya Gönder</button>}
                          {t.status === 'pending' && <span className="block px-3 py-2 text-amber-600 flex items-center gap-2"><Clock size={14} /> Onay bekleniyor</span>}
                          <button onClick={() => { setMenuId(null); setPreview(t); }} className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Eye size={14} /> Önizle</button>
                          {editable && <button onClick={() => { setMenuId(null); setEditing(t); }} className="w-full text-left px-3 py-2 text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Pencil size={14} /> Düzenle</button>}
                          <button onClick={() => { setMenuId(null); del(t); }} className="w-full text-left px-3 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2"><Trash2 size={14} /> Sil</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-14 text-slate-400">
                <FileText size={28} className="mx-auto text-slate-300" />
                <p className="text-sm mt-2">{list.length === 0 ? 'Henüz şablon yok.' : 'Filtreye uygun şablon bulunamadı.'}</p>
              </div>
            )}
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 text-[12px] text-slate-400">{filtered.length} / {list.length} şablon</div>
          )}
        </div>

        {/* Sağ panel */}
        <div className="space-y-3">
          {/* Kategoriler */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-slate-800 text-sm">Kategoriler</h4>
              {catF && <button onClick={() => setCatF('')} className="text-[11px] text-emerald-600 hover:underline">Temizle</button>}
            </div>
            <div className="space-y-1">
              {(['UTILITY', 'MARKETING', 'AUTHENTICATION'] as const).map((c) => {
                const cm = catMeta(c);
                return (
                  <button key={c} onClick={() => setCatF(catF === c ? '' : c)} className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition ${catF === c ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                    <span className="flex items-center gap-2 text-slate-600"><span className={`w-6 h-6 rounded-md flex items-center justify-center ${cm.ic}`}><cm.icon size={13} /></span>{cm.label}</span>
                    <span className="text-[12px] font-semibold text-slate-400">{catCounts[c] || 0}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hızlı Bilgiler */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h4 className="font-bold text-slate-800 text-sm mb-3">Hızlı Bilgiler</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle size={14} /></span>
                <div className="flex-1"><div className="text-[12px] text-slate-500">Onay Oranı</div></div>
                <div className="text-sm font-bold text-slate-800">%{basari}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Clock size={14} /></span>
                <div className="flex-1"><div className="text-[12px] text-slate-500">Onay Bekleyen</div></div>
                <div className="text-sm font-bold text-slate-800">{stat.pending}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center"><Ban size={14} /></span>
                <div className="flex-1"><div className="text-[12px] text-slate-500">Reddedilen</div></div>
                <div className="text-sm font-bold text-slate-800">{stat.rejected}</div>
              </div>
            </div>
          </div>

          {/* Durum → Şablon Eşleştirme (açılır-kapanır, korunmuş işlevsellik) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <button onClick={() => setMapOpen((v) => !v)} className="w-full flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-sm">Durum → Şablon Eşleştirme</h4>
              <ChevronDown size={16} className={`text-slate-400 transition ${mapOpen ? 'rotate-180' : ''}`} />
            </button>
            {mapOpen && (
              <div className="mt-3 space-y-3">
                <p className="text-[11px] text-slate-400">24 saatlik pencere kapalıyken her durum için gönderilecek onaylı şablonu seçin. Boş bırakılırsa varsayılan kullanılır.</p>
                {[
                  { k: 'manual', label: 'Manuel sohbet (pencere kapalı)', def: '' },
                  { k: 'order', label: 'Sipariş bildirimi', def: 'siparis_wpbildir' },
                  { k: 'payment', label: 'Ödeme talebi', def: 'odeme_talebi' },
                  { k: 'iptal', label: 'Sipariş iptali', def: 'siparis_wpbildir' },
                  { k: 'stok', label: 'Stok yetersiz', def: 'siparis_wpbildir' },
                  { k: 'riskli', label: 'Riskli sipariş', def: 'siparis_wpbildir' },
                  { k: 'status', label: 'Genel durum', def: 'siparis_wpbildir' },
                ].map((row) => (
                  <div key={row.k}>
                    <label className="text-[12px] font-medium text-slate-600">{row.label}</label>
                    <select value={sMap[row.k] || ''} onChange={(e) => setSMap((m) => ({ ...m, [row.k]: e.target.value }))} className="inp mt-1">
                      <option value="">{row.def ? `Varsayılan (${row.def})` : 'Otomatik gönderme (mesaj bekler)'}</option>
                      {list.filter((t) => t.status === 'approved').map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <button onClick={saveMap} disabled={mapSaving} className="w-full px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">{mapSaving ? 'Kaydediliyor...' : 'Eşleştirmeyi Kaydet'}</button>
              </div>
            )}
          </div>

          {/* Yardım */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <h4 className="font-bold text-slate-800 text-sm">Yardım</h4>
            <p className="text-[12px] text-slate-500 mt-1 leading-snug">Şablon oluşturma ve onay süreci için değişkenleri <code className="text-slate-600">{'{{1}}'}</code> şeklinde <b>1'den başlayıp boşluksuz</b> sırayla kullanın.</p>
          </div>
        </div>
      </div>

      {/* Önizleme modalı */}
      {preview && (() => {
        const ts = TPL_STATUS[preview.status] || TPL_STATUS.draft;
        const cm = catMeta(preview.category);
        const editable = preview.status === 'draft' || preview.status === 'rejected';
        const submittable = preview.status !== 'approved' && preview.status !== 'pending';
        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 overflow-y-auto" onClick={() => setPreview(null)}>
            <div className="bg-white rounded-2xl p-5 max-w-md w-full space-y-3 my-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${cm.ic}`}><cm.icon size={16} /></div>
                  <div className="min-w-0"><p className="font-bold text-slate-800 truncate">{preview.name}</p><p className="text-[12px] text-slate-400">{cm.label} · {langLbl(preview.language)}</p></div>
                </div>
                <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-md text-[11px] font-medium ${ts.c}`}>{ts.t}</span>
                <span className="text-[11px] text-slate-400">{tplVars(preview)} değişken · {fmtDate(preview.updatedAt)}</span>
              </div>
              {/* WhatsApp baloncuğu önizleme */}
              <div className="bg-[#e5ddd5] rounded-xl p-3">
                <div className="bg-white rounded-lg rounded-tl-none shadow-sm p-3 max-w-[92%]">
                  {preview.headerText && <p className="text-sm font-semibold text-slate-800 mb-1">{preview.headerText}</p>}
                  <p className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">{preview.bodyText}</p>
                  {preview.footerText && <p className="text-[11px] text-slate-400 mt-2">{preview.footerText}</p>}
                </div>
              </div>
              {preview.status === 'rejected' && preview.rejectReason && <p className="text-[12px] text-rose-500 bg-rose-50 rounded-lg p-2">Red sebebi: {preview.rejectReason}</p>}
              <div className="flex gap-2 pt-1">
                {submittable && <button onClick={() => { const t = preview; setPreview(null); submit(t); }} className="flex-1 px-4 py-2 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600">Onaya Gönder</button>}
                {editable && <button onClick={() => { const t = preview; setPreview(null); setEditing(t); }} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200">Düzenle</button>}
                <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-500 text-sm">Kapat</button>
              </div>
            </div>
          </div>
        );
      })()}

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-3 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">{editing.id ? 'Şablonu Düzenle' : 'Yeni Şablon'}</h3><button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ad (küçük harf + _)"><input value={editing.name || ''} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="siparis_onay" className="inp disabled:bg-slate-100" /></Field>
              <Field label="Dil"><select value={editing.language} onChange={(e) => setEditing({ ...editing, language: e.target.value })} className="inp"><option value="tr">Türkçe (tr)</option><option value="en">English (en)</option></select></Field>
            </div>
            <Field label="Kategori"><select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="inp"><option value="UTILITY">Utility (işlem bildirimi · hızlı onay)</option><option value="MARKETING">Marketing (kampanya)</option><option value="AUTHENTICATION">Authentication (kod)</option></select></Field>
            <Field label="Başlık türü"><select value={editing.headerType || 'none'} onChange={(e) => setEditing({ ...editing, headerType: e.target.value })} className="inp"><option value="none">Yok</option><option value="text">Metin</option><option value="image">Görsel</option><option value="document">Belge</option></select></Field>
            {editing.headerType === 'text' && <Field label="Başlık metni"><input value={editing.headerText || ''} onChange={(e) => setEditing({ ...editing, headerText: e.target.value })} className="inp" /></Field>}
            <Field label="Gövde metni">
              <textarea value={editing.bodyText || ''} onChange={(e) => setEditing({ ...editing, bodyText: e.target.value })} rows={4} className="inp resize-none" placeholder="Merhaba {{1}}, {{2}} numaralı siparişiniz hazırlanıyor." />
              <p className="text-[11px] text-slate-400 mt-1">Değişken için <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code> kullanın. {varCount > 0 && `(${varCount} değişken)`}</p>
            </Field>

            {/* Katalog linki: gövdeye değişken olarak ekle */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-violet-700"><FileText size={14} /> Katalog Linki Ekle</div>
              <p className="text-[11px] text-violet-600/80">Seçtiğiniz kataloğun bağlantısı gövdeye yeni bir değişken olarak eklenir; örnek değeri otomatik dolar.</p>
              <div className="flex gap-2">
                <select value={catSel} onChange={(e) => setCatSel(e.target.value)} className="inp flex-1">
                  <option value="">Katalog seçin…</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.ad || c.slug || c.id}</option>)}
                </select>
                <button type="button" onClick={addCatalogVar} className="px-3 py-2 rounded-lg bg-violet-600 text-white text-[12px] font-medium hover:bg-violet-700 shrink-0 flex items-center gap-1"><Plus size={14} /> Ekle</button>
              </div>
            </div>

            {/* Şablon bazlı değişken örnek değerleri (Meta onayı + varsayılan) */}
            {maxVarIndex(editing.bodyText) > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <div className="text-[12px] font-semibold text-slate-700">Değişken Örnek Değerleri</div>
                <p className="text-[11px] text-slate-400 -mt-1">Her değişken için bir örnek girin. Meta onayında kullanılır ve bu şablonun varsayılan değeri olur.</p>
                {Array.from({ length: maxVarIndex(editing.bodyText) }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[12px] font-mono text-slate-500 shrink-0 w-10">{`{{${i + 1}}}`}</span>
                    <input
                      value={(Array.isArray(editing.sampleJson) ? editing.sampleJson[i] : '') || ''}
                      onChange={(e) => setSample(i, e.target.value)}
                      placeholder={`Örnek değer ${i + 1}`}
                      className="inp"
                    />
                  </div>
                ))}
              </div>
            )}

            <Field label="Alt bilgi (opsiyonel)"><input value={editing.footerText || ''} onChange={(e) => setEditing({ ...editing, footerText: e.target.value })} className="inp" /></Field>
            <div className="flex gap-2 pt-1"><button onClick={saveTpl} className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600">Kaydet</button><button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm">Vazgeç</button></div>
            <style>{`.inp{width:100%;padding:0.5rem 0.75rem;font-size:0.875rem;border-radius:0.5rem;border:1px solid #e2e8f0;outline:none}.inp:focus{box-shadow:0 0 0 2px #d1fae5}`}</style>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toplu Mesaj ───────────────────────────────────────────────────────────────
function Bulk({ prefill }: { prefill?: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [phonesText, setPhonesText] = useState('');
  const [varsText, setVarsText] = useState('');
  const [sending, setSending] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  // Yayın Özeti'nden aktarılan katalog linkini şablon değişkenine yerleştir
  useEffect(() => { if (prefill) setVarsText(prefill); }, [prefill]);

  const bulkPay = async () => {
    if (!confirm('Ödeme bekleyen TÜM sepetlere ödeme talebi gönderilsin mi? (Sohbet penceresi açık olanlara normal mesaj, kapalı olanlara onaylı şablon gider)')) return;
    setPayBusy(true);
    try {
      const r = await api.post('/whatsapp/payment/bulk-pending');
      const d = r.data || {};
      toast.success(`${d.sent || 0}/${d.total || 0} sepete ödeme talebi kuyruğa alındı${d.skipped ? ` · ${d.skipped} atlandı` : ''}`);
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setPayBusy(false); }
  };

  const loadTpl = () => api.get('/whatsapp/templates').then((r) => setTemplates((r.data.templates || []).filter((t: Template) => t.status === 'approved'))).catch(() => {});
  const loadJobs = () => api.get('/whatsapp/bulk').then((r) => setJobs(r.data.jobs || [])).catch(() => {});
  useEffect(() => { loadTpl(); loadJobs(); const t = setInterval(loadJobs, 4000); return () => clearInterval(t); }, []);

  const phones = phonesText.split(/[\s,;\n]+/).map((p) => p.replace(/\D/g, '')).filter((p) => p.length >= 10);

  const start = async () => {
    if (!templateId) { toast.error('Onaylı bir şablon seçin'); return; }
    if (!phones.length) { toast.error('En az bir geçerli telefon girin'); return; }
    setSending(true);
    try {
      const vars = varsText.split('|').map((v) => v.trim()).filter(Boolean);
      await api.post('/whatsapp/bulk', { templateId, filter: { phones, vars } });
      toast.success(`${phones.length} alıcı kuyruğa eklendi`); setPhonesText(''); setVarsText(''); loadJobs();
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSending(false); }
  };
  const cancel = async (j: BulkJob) => { try { await api.post(`/whatsapp/bulk/${j.id}/cancel`); loadJobs(); } catch (e: any) { toast.error(apiErrorMessage(e)); } };

  const BULK_STATUS: Record<string, string> = { queued: 'Hazırlanıyor', running: 'Gönderiliyor', done: 'Tamamlandı', canceled: 'İptal' };

  return (
    <div className="space-y-4">
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sm text-sky-900 flex gap-2">
        <Megaphone size={18} className="shrink-0 mt-0.5" />
        <p>Toplu mesaj yalnızca <b>onaylı şablonla</b> gönderilir. Mesajlar anti-spam kurallarına göre (aralık/limit/dengeli dağıtım) sıraya alınır. Onaylı şablon yoksa önce <b>Şablonlar</b> sekmesinden oluşturun.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><CreditCard size={16} className="text-emerald-500" /> Ödeme Bekleyen Sepetler</h3>
          <p className="text-xs text-slate-400 mt-0.5">Ödemesi tamamlanmamış tüm açık sepetlere tek tıkla ödeme talebi gönderin. Sohbet penceresi <b>açık</b> olanlara normal mesaj, <b>kapalı</b> olanlara onaylı <b>ödeme talebi</b> şablonu gider.</p>
        </div>
        <button onClick={bulkPay} disabled={payBusy} className="shrink-0 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5"><CreditCard size={15} /> Tümüne Ödeme Talebi</button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-sm text-slate-400">Henüz onaylı şablon yok. Önce Şablonlar sekmesinden bir şablon oluşturup onaylatın.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">Yeni Kampanya</h3>
          <Field label="Onaylı şablon"><select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="inp"><option value="">Seçin…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}</select></Field>
          <Field label="Alıcı telefonlar (virgül/satır ile ayırın)"><textarea value={phonesText} onChange={(e) => setPhonesText(e.target.value)} rows={4} className="inp resize-none" placeholder="905551112233, 905554445566" /></Field>
          <Field label="Şablon değişkenleri ( | ile ayırın · {{1}}|{{2}} )"><input value={varsText} onChange={(e) => setVarsText(e.target.value)} className="inp" placeholder="Kampanya|%20 indirim" /></Field>
          {varsText.includes('/katalog/stream/') && <p className="text-[11px] text-violet-600 -mt-1.5">Katalog linki aktarıldı. Linki şablonunuzdaki ilgili {'{{1}}'} değişkenine denk gelecek şekilde sıralayın.</p>}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">{phones.length} geçerli alıcı</p>
            <button onClick={start} disabled={sending} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1.5"><Send size={15} /> Gönder</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-bold text-slate-800 text-sm">Kampanyalar</h3>
        {jobs.length === 0 && <p className="text-sm text-slate-400">Henüz kampanya yok.</p>}
        {jobs.map((j) => {
          const done = j.sent + j.failed;
          const pct = j.total ? Math.round((done / j.total) * 100) : 0;
          const tpl = templates.find((t) => t.id === j.templateId);
          return (
            <div key={j.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-800 text-sm truncate">{tpl?.name || j.templateId}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">{BULK_STATUS[j.status] || j.status}</span>
                  {(j.status === 'queued' || j.status === 'running') && <button onClick={() => cancel(j)} className="text-xs text-red-500 hover:underline">İptal</button>}
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-[11px] text-slate-400">{done}/{j.total} · {j.sent} gönderildi · {j.failed} başarısız</p>
            </div>
          );
        })}
      </div>
      <style>{`.inp{width:100%;padding:0.5rem 0.75rem;font-size:0.875rem;border-radius:0.5rem;border:1px solid #e2e8f0;outline:none}.inp:focus{box-shadow:0 0 0 2px #d1fae5}`}</style>
    </div>
  );
}

function Field({ label, children }: any) {
  return <div><label className="text-xs text-slate-500 block mb-1">{label}</label>{children}</div>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button type="button" onClick={() => onChange(!checked)} className={`w-10 h-5 rounded-full transition relative ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}
