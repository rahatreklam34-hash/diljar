import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Search, RefreshCw, ExternalLink, CheckCircle2, PackageCheck, Clock, Tag,
  Plus, ChevronDown, List, LayoutGrid, Copy,
  CircleCheck, CircleAlert, ChevronLeft, ChevronRight, Package,
  X, ShoppingCart, MessageCircle, RotateCcw, Navigation, Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useUrlState } from '../lib/useUrlState';
import { printCargoBarcode, DetailModal } from './Siparislerim';
import { openChat } from '../components/ChatDock';
import { useStore } from '../context/StoreContext';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt = (d: string | null) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const dtShort = (d: string | null) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

interface Shipment {
  id: string;
  siparisNo: string;
  musteri: string;
  telefon: string | null;
  token: string | null;
  kargoFirmasi: string;
  kargoTakip: string | null;
  takipBekliyor?: boolean;
  referans?: string | null;
  kargoTip: string | null;
  kargoDurum: string | null;
  kargoAsama: string;
  kargoMaliyet: number | null;
  kargoOdeme: 'alici' | 'gonderici';
  durum: string;
  kargoZamani: string | null;
  provider: string;
  trackingUrl: string;
  canQuery: boolean;
  cargoKey: string | null;
}

interface Stats { toplamKargo: number; hazirlaniyor: number; teslimEdildi: number; yolda: number; teslimEdilmedi: number; iadeSurecinde: number; toplamMaliyet: number; }

interface Hareket { tarih: string; durum: string; birim: string }
interface TrackData { takip: string | null; trackingUrl: string; durum: string; asama?: string; asamaLabel?: string; ucret?: number; teslim?: boolean; hareketler: Hareket[]; takipBekliyor?: boolean; hata?: string }

// Aşama -> görsel tanım (rozet + accent + ikon + emoji). 6 durum.
const ASAMA: Record<string, { label: string; emoji: string; badge: string; accent: string; dot: string; icon: any }> = {
  hazirlaniyor:     { label: 'Kargoya Hazırlanıyor', emoji: '📦', badge: 'bg-amber-50 text-amber-700',   accent: 'bg-amber-400',   dot: 'bg-amber-400',   icon: Package },
  kabul:            { label: 'Kargoya Verildi',      emoji: '🚚', badge: 'bg-blue-50 text-blue-700',     accent: 'bg-blue-500',    dot: 'bg-blue-500',    icon: Truck },
  dagitim:          { label: 'Dağıtıma Çıktı',       emoji: '🚛', badge: 'bg-indigo-50 text-indigo-700', accent: 'bg-indigo-500',  dot: 'bg-indigo-500',  icon: Navigation },
  teslim:           { label: 'Teslim Edildi',        emoji: '✅', badge: 'bg-emerald-50 text-emerald-700', accent: 'bg-emerald-500', dot: 'bg-emerald-500', icon: PackageCheck },
  teslim_edilemedi: { label: 'Teslim Edilemedi',     emoji: '⚠️', badge: 'bg-red-50 text-red-600',       accent: 'bg-red-500',     dot: 'bg-red-500',     icon: CircleAlert },
  iade:             { label: 'İade Sürecinde',       emoji: '↩️', badge: 'bg-orange-50 text-orange-600', accent: 'bg-orange-500',  dot: 'bg-orange-500',  icon: RotateCcw },
};
const asamaOf = (s: Shipment) => ASAMA[s.kargoAsama] || ASAMA.hazirlaniyor;

// Ana akış adımları (lineer ilerleme)
const FLOW = ['hazirlaniyor', 'kabul', 'dagitim', 'teslim'] as const;

const TABS = [
  { key: '', label: 'Tümü', emoji: '', icon: Truck },
  { key: 'hazirlaniyor', label: 'Kargoya Hazırlanıyor', emoji: '📦', icon: Package },
  { key: 'kabul', label: 'Kargoya Verildi', emoji: '🚚', icon: Truck },
  { key: 'dagitim', label: 'Dağıtıma Çıktı', emoji: '🚛', icon: Navigation },
  { key: 'teslim', label: 'Teslim Edildi', emoji: '✅', icon: CircleCheck },
  { key: 'teslimedilmedi', label: 'Teslim Edilemedi', emoji: '⚠️', icon: CircleAlert },
  { key: 'iade', label: 'İade Sürecinde', emoji: '↩️', icon: RotateCcw },
];

const KPI_META = [
  { key: 'toplamKargo', label: 'Toplam Kargo', unit: 'Gönderi', icon: Truck, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  { key: 'hazirlaniyor', label: 'Hazırlanıyor', unit: 'Gönderi', icon: Package, iconBg: 'bg-amber-50', iconColor: 'text-amber-500' },
  { key: 'yolda', label: 'Yolda', unit: 'Gönderi', icon: Truck, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { key: 'teslimEdildi', label: 'Teslim Edildi', unit: 'Gönderi', icon: PackageCheck, iconBg: 'bg-teal-50', iconColor: 'text-teal-600' },
  { key: 'teslimEdilmedi', label: 'Teslim Edilemedi', unit: 'Gönderi', icon: CircleAlert, iconBg: 'bg-red-50', iconColor: 'text-red-500' },
  { key: 'iadeSurecinde', label: 'İade Sürecinde', unit: 'Gönderi', icon: RotateCcw, iconBg: 'bg-orange-50', iconColor: 'text-orange-500' },
] as const;

// Yurtiçi hareket metnini istemci tarafında aşamaya eşle (modal tarihleri için)
function classifyHareket(text: string): string | null {
  const s = (text || '').toLocaleLowerCase('tr-TR');
  if (!s) return null;
  if (/iade|geri gönder|geri gonder|göndericiye|gondericiye/.test(s)) return 'iade';
  if (/edilemedi|edileme|bulunamad|başarısız|basarisiz|reddedildi|hasarl|çıkmad/.test(s)) return 'teslim_edilemedi';
  if (/teslim edil|teslim alındı|teslim alindi/.test(s)) return 'teslim';
  if (/dağıt|dagit|teslimat|kurye/.test(s)) return 'dagitim';
  if (/şube|sube|aktarma|transfer|çıkış|cikis|kabul|teslim aldı|teslim aldi|yola çıktı/.test(s)) return 'kabul';
  if (/oluştur|olustur|hazır|barkod|kayıt/.test(s)) return 'hazirlaniyor';
  return null;
}

export default function KargoIslemleri() {
  const navigate = useNavigate();
  const { customers, products, categories, discountCodes, campaigns, storeSetting, reload: storeReload } = useStore();
  const [tab, setTab] = useUrlState('tab', '');
  const [q, setQ] = useUrlState('q', '');
  const [sort, setSort] = useUrlState<'tarih_desc' | 'tarih_asc' | 'maliyet_desc' | 'maliyet_asc'>('sort', 'tarih_desc');
  const [odeme, setOdeme] = useUrlState<'' | 'alici' | 'gonderici'>('odeme', '');
  const [items, setItems] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [toplamMaliyet, setToplamMaliyet] = useState(0);
  const [page, setPage] = useUrlState('page', 1);
  const [pageSize, setPageSize] = useUrlState('pp', 10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [view, setView] = useUrlState<'list' | 'grid'>('view', 'list');
  // Takip modalı
  const [trackOpen, setTrackOpen] = useState<Shipment | null>(null);
  const [trackData, setTrackData] = useState<TrackData | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  // Sepet (sipariş detay) modalı
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/cargo/shipments', { params: { durum: tab || undefined, q: q || undefined, page, pageSize, sort, odeme: odeme || undefined } });
      setItems(r.data?.items || []);
      setTotal(r.data?.total || 0);
      setTotalPages(r.data?.totalPages || 1);
      setToplamMaliyet(r.data?.toplamMaliyet || 0);
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [tab, q, page, pageSize, sort, odeme]);

  const loadStats = useCallback(async () => {
    try {
      const r = await api.get('/cargo/stats');
      setStats(r.data || null);
    } catch { /* sessiz */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const refreshAll = () => { load(); loadStats(); };

  const teslimEt = async (s: Shipment) => {
    if (!confirm(`${s.siparisNo} numaralı kargo teslim edildi olarak işaretlensin mi?`)) return;
    setBusyId(s.id);
    try {
      await api.post(`/cargo/${s.id}/teslim`);
      toast.success('Teslim edildi olarak işaretlendi');
      refreshAll();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setBusyId(null); }
  };

  const sorgula = async (s: Shipment) => {
    setBusyId(s.id);
    try {
      const r = await api.get(`/cargo/track/${s.id}`);
      const label = r.data?.asamaLabel || r.data?.durum;
      if (r.data?.asama === 'teslim') toast.success(`${s.siparisNo}: Teslim edildi`);
      else if (r.data?.takip && !s.kargoTakip) toast.success(`${s.siparisNo}: Yurtiçi takip no alındı (${r.data.takip})`);
      else if (r.data?.asama === 'hazirlaniyor') toast(`${s.siparisNo}: Kargo hazırlanıyor — Yurtiçi henüz işleme almadı`);
      else toast(`${s.siparisNo}: ${label || 'Güncellendi'}`);
      refreshAll();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setBusyId(null); }
  };

  const openTrack = async (s: Shipment) => {
    setTrackOpen(s); setTrackData(null); setTrackLoading(true);
    try {
      const r = await api.get(`/cargo/track/${s.id}`);
      setTrackData(r.data || null);
      // canlı sorgu listeyi güncelleyebilir
      if (r.data?.asama && r.data.asama !== s.kargoAsama) refreshAll();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setTrackLoading(false); }
  };

  const sepetAc = async (s: Shipment) => {
    setDetailLoading(true);
    setDetailOrder({ id: s.id, __loading: true });
    try {
      const r = await api.get(`/store/orders/${s.id}`);
      const o = r.data?.order || r.data;
      if (!o || !o.id) { toast.error('Sipariş detayı yüklenemedi'); setDetailOrder(null); return; }
      setDetailOrder(o);
    } catch (e) { toast.error(apiErrorMessage(e)); setDetailOrder(null); }
    finally { setDetailLoading(false); }
  };
  const whatsappAc = (s: Shipment) => {
    if (!s.telefon) { toast.error('Müşteri telefonu yok'); return; }
    openChat(s.telefon, s.musteri);
  };

  const copyText = (t: string) => { navigator.clipboard?.writeText(t).then(() => toast.success('Kopyalandı')).catch(() => {}); };

  const statVal = (k: string) => stats ? Number((stats as any)[k] ?? 0).toLocaleString('tr-TR') : '—';

  const pageNumbers = (() => {
    const tp = totalPages;
    if (tp <= 5) return Array.from({ length: tp }, (_, i) => i + 1);
    const out: (number | '…')[] = [1];
    if (page > 3) out.push('…');
    for (let p = Math.max(2, page - 1); p <= Math.min(tp - 1, page + 1); p++) out.push(p);
    if (page < tp - 2) out.push('…');
    out.push(tp);
    return out;
  })();

  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);

  const DurumBadge = ({ s }: { s: Shipment }) => {
    const a = asamaOf(s);
    return <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-medium ${a.badge}`}><span>{a.emoji}</span> {a.label}</span>;
  };

  const TakipNo = ({ s }: { s: Shipment }) => s.kargoTakip ? (
    s.trackingUrl
      ? <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-600 font-medium hover:underline">{s.kargoTakip}<ExternalLink size={13} /></a>
      : <span className="text-slate-600 font-medium">{s.kargoTakip}</span>
  ) : s.takipBekliyor ? (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium w-fit"><Clock size={10} /> No bekleniyor</span>
      {s.referans && <span className="text-[11px] text-slate-400">Ref: {s.referans}</span>}
    </div>
  ) : <span className="text-slate-300">-</span>;

  const Ucret = ({ s }: { s: Shipment }) => s.kargoMaliyet != null && s.kargoMaliyet > 0
    ? <span className="text-slate-700 font-semibold whitespace-nowrap">{fmt(s.kargoMaliyet)}</span>
    : <span className="text-slate-300">—</span>;

  // Kompakt yatay stepper (kart içi) — ulaşılan adımlar yeşil, mevcut vurgulu
  const MiniStepper = ({ s }: { s: Shipment }) => {
    const branch = s.kargoAsama === 'teslim_edilemedi' || s.kargoAsama === 'iade';
    const curIdx = branch ? 2 : FLOW.indexOf(s.kargoAsama as any);
    const nodes = FLOW.map((k, i) => ({ k, def: ASAMA[k], reached: curIdx >= 0 && i <= curIdx, current: i === curIdx && !branch }));
    return (
      <div className="flex items-center w-full mt-1">
        {nodes.map((n, i) => (
          <div key={n.k} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] border-2 transition
                ${n.reached ? (n.current ? `${n.def.accent} border-transparent text-white` : 'bg-emerald-500 border-transparent text-white') : 'bg-white border-slate-200 text-slate-300'}`}>
                {n.reached && !n.current ? <CheckCircle2 size={14} /> : <span>{n.def.emoji}</span>}
              </div>
              <span className={`text-[9px] mt-1 text-center leading-tight w-14 ${n.reached ? 'text-slate-600 font-medium' : 'text-slate-300'}`}>{n.def.label}</span>
              {n.current && s.kargoZamani && <span className="text-[8px] text-slate-400">{dtShort(s.kargoZamani)}</span>}
            </div>
            {i < nodes.length - 1 && <div className={`flex-1 h-0.5 mx-0.5 -mt-4 ${curIdx > i ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
          </div>
        ))}
        {branch && (
          <div className="flex flex-col items-center ml-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] ${asamaOf(s).accent}`}>{asamaOf(s).emoji}</div>
            <span className="text-[9px] mt-1 text-center leading-tight w-14 text-slate-600 font-medium">{asamaOf(s).label}</span>
          </div>
        )}
      </div>
    );
  };

  // Kart aksiyon butonları
  const CardButtons = ({ s }: { s: Shipment }) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <button onClick={() => openTrack(s)} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-medium"><Navigation size={13} /> Kargoyu Takip Et</button>
      <button onClick={() => sepetAc(s)} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"><ShoppingCart size={13} /> Sepeti Göster</button>
      <button onClick={() => whatsappAc(s)} disabled={!s.telefon} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 border border-green-200 text-green-600 rounded-lg hover:bg-green-50 disabled:opacity-40"><MessageCircle size={13} /> WhatsApp</button>
      {s.cargoKey && <button onClick={() => printCargoBarcode(s.cargoKey!, s.musteri, '')} title="Barkod Yazdır" className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50"><Tag size={13} /> Barkod</button>}
      {s.canQuery && s.durum !== 'teslim' && <button onClick={() => sorgula(s)} disabled={busyId === s.id} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={13} className={busyId === s.id ? 'animate-spin' : ''} /> Sorgula</button>}
      {s.durum !== 'teslim' && <button onClick={() => teslimEt(s)} disabled={busyId === s.id} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50"><CheckCircle2 size={13} /> Teslim</button>}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 w-full">
      {/* Üst başlık + arama + aksiyonlar */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><Truck className="text-emerald-600" size={22} /></div>
            <h1 className="text-2xl font-bold text-slate-800">Kargo İşlemleri</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 ml-0.5">Kargolanan tüm gönderiler ve teslim durumları.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative w-full sm:w-80">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Takip no, müşteri, firma ara..."
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-300" />
          </div>
          <div className="flex items-center gap-2.5">
            <button onClick={refreshAll} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 whitespace-nowrap"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Yenile</button>
            <button onClick={() => navigate('/siparisler')} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm whitespace-nowrap"><Plus size={17} /> Yeni Kargo <ChevronDown size={15} className="opacity-80" /></button>
          </div>
        </div>
      </div>

      {/* KPI kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-6">
        {KPI_META.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.key} className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl ${m.iconBg} flex items-center justify-center shrink-0`}><Icon size={20} className={m.iconColor} /></div>
              <div className="min-w-0">
                <div className="text-[12px] text-slate-500 font-medium leading-tight">{m.label}</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight mt-0.5 truncate">{statVal(m.key)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filtre çubuğu — 6 durum sekmesi */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-xl font-medium transition border ${active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                {t.emoji ? <span>{t.emoji}</span> : <t.icon size={15} />} {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center bg-white border border-slate-200 rounded-xl p-0.5">
            <button onClick={() => setView('grid')} className={`p-1.5 rounded-lg ${view === 'grid' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={17} /></button>
            <button onClick={() => setView('list')} className={`p-1.5 rounded-lg ${view === 'list' ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}><List size={17} /></button>
          </div>
        </div>
      </div>

      {/* Alt filtre çubuğu — ödeme tipi (kargoTip ön ekinden) + filtrelenen toplam ücret */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-slate-400 font-medium mr-0.5">Ödeme:</span>
          {([['', 'Tümü'], ['gonderici', 'Gönderici Ödemeli (GÖ)'], ['alici', 'Alıcı Ödemeli (AÖ)']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => { setOdeme(k as any); setPage(1); }}
              className={`px-3 py-1.5 text-[12px] rounded-lg font-medium border transition ${odeme === k ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{lbl}</button>
          ))}
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold whitespace-nowrap">
          <Wallet size={15} /> Filtrelenen Kargo Ücreti: {fmt(toplamMaliyet)}
        </div>
      </div>

      {/* GRID görünümü — takip kartları (stepper + butonlar) */}
      {view === 'grid' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {items.map((s) => (
              <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1 h-10 rounded-full ${asamaOf(s).accent} shrink-0`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-700 truncate">{s.siparisNo}</span>
                        <button onClick={() => copyText(s.siparisNo)} className="text-slate-300 hover:text-slate-500"><Copy size={12} /></button>
                      </div>
                      <div className="text-[12px] text-slate-500 truncate">{s.musteri}{s.telefon ? ` · ${s.telefon}` : ''}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0"><DurumBadge s={s} /><div className="text-[11px] text-slate-400 mt-1 whitespace-nowrap">{dt(s.kargoZamani)}</div></div>
                </div>

                {/* Stepper */}
                <div className="px-1 py-2"><MiniStepper s={s} /></div>

                {/* Bilgi satırı */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-3 text-[12px] border-t border-slate-100 pt-3">
                  <div><div className="text-slate-400">Firma</div><div className="text-slate-600 font-medium">{s.kargoFirmasi}</div></div>
                  <div><div className="text-slate-400">Takip No</div><div><TakipNo s={s} /></div></div>
                  <div><div className="text-slate-400">Tarih</div><div className="text-slate-600">{dt(s.kargoZamani)}</div></div>
                  <div><div className="text-slate-400">Kargo Ücreti</div><div><Ucret s={s} /></div></div>
                </div>

                <div className="pt-2 border-t border-slate-100"><CardButtons s={s} /></div>
              </div>
            ))}
            {items.length === 0 && !loading && (
              <div className="col-span-full py-12 text-center text-slate-400 bg-white border border-slate-200 rounded-2xl">Kayıt bulunamadı</div>
            )}
          </div>
          <Pagination />
        </>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Sipariş</th>
                  <th className="text-left font-semibold px-4 py-3">Müşteri</th>
                  <th className="text-left font-semibold px-4 py-3">Firma</th>
                  <th className="text-left font-semibold px-4 py-3">Takip No</th>
                  <th className="text-left font-semibold px-4 py-3">Durum</th>
                  <th className="text-left font-semibold px-4 py-3">
                    <button onClick={() => { setSort((s) => s === 'tarih_desc' ? 'tarih_asc' : 'tarih_desc'); setPage(1); }} className={`inline-flex items-center gap-1 uppercase tracking-wide ${sort.startsWith('tarih') ? 'text-emerald-600' : 'hover:text-slate-600'}`}>
                      Kargo Tarihi <span className="text-[10px]">{sort === 'tarih_asc' ? '▲' : sort === 'tarih_desc' ? '▼' : '↕'}</span>
                    </button>
                  </th>
                  <th className="text-left font-semibold px-4 py-3">
                    <button onClick={() => { setSort((s) => s === 'maliyet_desc' ? 'maliyet_asc' : 'maliyet_desc'); setPage(1); }} className={`inline-flex items-center gap-1 uppercase tracking-wide ${sort.startsWith('maliyet') ? 'text-emerald-600' : 'hover:text-slate-600'}`}>
                      Kargo Ücreti <span className="text-[10px]">{sort === 'maliyet_asc' ? '▲' : sort === 'maliyet_desc' ? '▼' : '↕'}</span>
                    </button>
                  </th>
                  <th className="text-center font-semibold px-4 py-3">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-1 h-9 rounded-full ${asamaOf(s).accent} shrink-0`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5"><span className="font-semibold text-slate-700">{s.siparisNo}</span><button onClick={() => copyText(s.siparisNo)} className="text-slate-300 hover:text-slate-500"><Copy size={12} /></button></div>
                          {s.referans && <div className="text-[11px] text-slate-400">#{s.referans}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="text-slate-700 font-medium">{s.musteri}</div>{s.telefon && <div className="text-[11px] text-slate-400">{s.telefon}</div>}</td>
                    <td className="px-4 py-3"><span className="text-slate-600">{s.kargoFirmasi}</span>{s.kargoTip && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">{s.kargoTip}</span>}</td>
                    <td className="px-4 py-3"><TakipNo s={s} /></td>
                    <td className="px-4 py-3"><DurumBadge s={s} /><div className="text-[11px] text-slate-400 mt-1 whitespace-nowrap">{dt(s.kargoZamani)}</div></td>
                    <td className="px-4 py-3 text-slate-500 text-[12px] whitespace-nowrap">{dt(s.kargoZamani)}</td>
                    <td className="px-4 py-3"><Ucret s={s} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1.5">
                        <button onClick={() => openTrack(s)} title="Kargoyu Takip Et" className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"><Navigation size={13} /> Takip</button>
                        <button onClick={() => sepetAc(s)} title="Sepeti Göster" className="inline-flex items-center text-[12px] px-2 py-1.5 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"><ShoppingCart size={14} /></button>
                        <button onClick={() => whatsappAc(s)} disabled={!s.telefon} title="WhatsApp" className="inline-flex items-center text-[12px] px-2 py-1.5 border border-green-200 text-green-600 rounded-lg hover:bg-green-50 disabled:opacity-40"><MessageCircle size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && !loading && (<tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Kayıt bulunamadı</td></tr>)}
              </tbody>
            </table>
          </div>
          <Pagination border />
        </div>
      )}

      {/* Takip Modalı */}
      {trackOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => setTrackOpen(null)}>
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <div>
                <div className="font-bold text-slate-800">{trackOpen.siparisNo}</div>
                <div className="text-[12px] text-slate-500">{trackOpen.musteri}{trackOpen.telefon ? ` · ${trackOpen.telefon}` : ''}</div>
              </div>
              <button onClick={() => setTrackOpen(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="p-5">
              {trackLoading ? (
                <div className="py-10 text-center text-slate-400"><RefreshCw size={22} className="animate-spin mx-auto mb-2" /> Kargo durumu sorgulanıyor...</div>
              ) : (
                <TrackTimeline s={trackOpen} data={trackData} />
              )}
              <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100">
                {(trackData?.trackingUrl || trackOpen.trackingUrl) && (
                  <a href={trackData?.trackingUrl || trackOpen.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-medium"><ExternalLink size={15} /> Kargoyu Takip Et</a>
                )}
                <button onClick={() => sepetAc(trackOpen)} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><ShoppingCart size={15} /> Sepeti Göster</button>
                <button onClick={() => whatsappAc(trackOpen)} disabled={!trackOpen.telefon} className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-xl border border-green-200 text-green-600 hover:bg-green-50 disabled:opacity-40"><MessageCircle size={15} /> WhatsApp</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sepet (sipariş detay) modalı — yönetim panelindeki tam detay */}
      {detailOrder && (
        detailOrder.__loading || detailLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl px-6 py-5 text-slate-500 flex items-center gap-2"><RefreshCw size={18} className="animate-spin" /> Sipariş yükleniyor...</div>
          </div>
        ) : (
          <DetailModal
            order={detailOrder}
            customer={customers?.find((c: any) => c.id === detailOrder.customerId) || null}
            custName={customers?.find((c: any) => c.id === detailOrder.customerId)?.ad || detailOrder.musteriHandle || '-'}
            custPhone={customers?.find((c: any) => c.id === detailOrder.customerId)?.telefon || ''}
            products={products}
            categories={categories}
            discountCodes={discountCodes}
            campaigns={campaigns}
            storeSetting={storeSetting}
            onClose={() => setDetailOrder(null)}
            reload={() => { storeReload?.(); refreshAll(); }}
          />
        )
      )}
    </div>
  );

  function Pagination({ border }: { border?: boolean }) {
    return (
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 ${border ? 'px-4 py-3 border-t border-slate-100' : 'mt-4'} text-sm`}>
        <span className="text-slate-400">Gösterilen {startIdx} - {endIdx} / {total} gönderi</span>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"><ChevronLeft size={16} /></button>
          {pageNumbers.map((p, i) => p === '…'
            ? <span key={`e${i}`} className="px-1.5 text-slate-400">…</span>
            : <button key={p} onClick={() => setPage(p as number)} className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium ${p === page ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{p}</button>)}
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span>Sayfa başına</span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
    );
  }
}

// Modal içi dikey zaman çizelgesi — gerçek hareket tarihleriyle
function TrackTimeline({ s, data }: { s: Shipment; data: TrackData | null }) {
  const asama = data?.asama || s.kargoAsama;
  const branch = asama === 'teslim_edilemedi' || asama === 'iade';
  const curIdx = branch ? 2 : FLOW.indexOf(asama as any);
  // Hareketlerden adım başına ilk tarih
  const stageDate: Record<string, string> = {};
  (data?.hareketler || []).forEach((h) => {
    const st = classifyHareket(h.durum) || classifyHareket(h.birim);
    if (st && !stageDate[st]) stageDate[st] = h.tarih;
  });
  if (!stageDate['kabul'] && s.kargoZamani) stageDate['kabul'] = s.kargoZamani;

  const steps = FLOW.map((k, i) => ({ k, def: ASAMA[k], date: stageDate[k], reached: curIdx >= 0 && i <= curIdx, current: i === curIdx && !branch }));

  return (
    <div>
      {/* Güncel durum bandı */}
      <div className={`rounded-xl px-4 py-3 mb-4 flex items-center gap-2.5 ${(ASAMA[asama] || ASAMA.hazirlaniyor).badge}`}>
        <span className="text-lg">{(ASAMA[asama] || ASAMA.hazirlaniyor).emoji}</span>
        <div>
          <div className="font-semibold text-sm">{data?.asamaLabel || (ASAMA[asama] || ASAMA.hazirlaniyor).label}</div>
          {data?.durum && <div className="text-[11px] opacity-80">{data.durum}</div>}
        </div>
        {data?.ucret != null && data.ucret > 0 && <span className="ml-auto text-[12px] font-semibold">{fmt(data.ucret)}</span>}
      </div>

      {/* Dikey adımlar */}
      <ol className="relative">
        {steps.map((st, i) => (
          <li key={st.k} className="flex gap-3 pb-5 last:pb-0 relative">
            {i < steps.length - 1 && <span className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${st.reached && steps[i + 1].reached ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] shrink-0 z-10 border-2
              ${st.reached ? (st.current ? `${st.def.accent} border-transparent text-white` : 'bg-emerald-500 border-transparent text-white') : 'bg-white border-slate-200 text-slate-300'}`}>
              {st.reached && !st.current ? <CheckCircle2 size={16} /> : <span>{st.def.emoji}</span>}
            </div>
            <div className="pt-1">
              <div className={`text-sm font-medium ${st.reached ? 'text-slate-700' : 'text-slate-300'}`}>{st.def.label}</div>
              {st.date && <div className="text-[12px] text-slate-400">{dt(st.date)}</div>}
            </div>
          </li>
        ))}
        {branch && (
          <li className="flex gap-3 relative">
            <span className="absolute left-[15px] -top-5 h-5 w-0.5 bg-slate-200" />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] shrink-0 z-10 ${(ASAMA[asama] || ASAMA.hazirlaniyor).accent}`}>{(ASAMA[asama] || ASAMA.hazirlaniyor).emoji}</div>
            <div className="pt-1">
              <div className="text-sm font-medium text-slate-700">{(ASAMA[asama] || ASAMA.hazirlaniyor).label}</div>
              {stageDate[asama] && <div className="text-[12px] text-slate-400">{dt(stageDate[asama])}</div>}
            </div>
          </li>
        )}
      </ol>

      {/* Ham hareket geçmişi */}
      {data?.hareketler && data.hareketler.length > 0 && (
        <details className="mt-4">
          <summary className="text-[12px] text-slate-500 cursor-pointer hover:text-slate-700">Tüm hareket geçmişi ({data.hareketler.length})</summary>
          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {data.hareketler.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <span className="text-slate-400 whitespace-nowrap">{dtShort(h.tarih)}</span>
                <span className="text-slate-600">{h.durum}{h.birim ? ` · ${h.birim}` : ''}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      {data?.takipBekliyor && <div className="mt-3 text-[12px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">Yurtiçi henüz takip numarası üretmedi — gönderi işleme alınınca otomatik güncellenecek.</div>}
      {data?.hata && <div className="mt-3 text-[12px] text-red-500">{data.hata}</div>}
    </div>
  );
}
