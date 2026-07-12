import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUrlState } from '../lib/useUrlState';
import toast from 'react-hot-toast';
import {
  FileText, Settings, RefreshCw, Copy, CheckCircle2, Search, Percent,
  FileBarChart, Clock, CheckCheck, Wallet, Plus, MoreHorizontal,
  Eye, Download, ChevronsUpDown, ChevronLeft, ChevronRight, Calendar,
  ChevronDown, X, ArrowRight, Zap, Tag, ListChecks, Bell, LayoutGrid,
  Save, ShoppingCart, Truck, Receipt,
} from 'lucide-react';
import api from '../lib/api';

const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(n) || 0);
const maskName = (s: string) => {
  const v = String(s || '').trim();
  if (v.length <= 4) return v ? v[0] + '**' : '—';
  return v.slice(0, 2) + '**' + v.slice(-2);
};
const maskPhone = (s: string) => {
  const v = String(s || '').replace(/\s/g, '');
  if (!v) return '';
  if (v.length <= 6) return v;
  return v.slice(0, 4) + ' 5** *** ** ' + v.slice(-2);
};

interface Kategori { id: string; ad: string; }
interface Ayar {
  token: string; aktif: boolean; indirimModu: string; kdvOrani: number;
  kategoriKdv?: Record<string, number> | null;
  faturaDurumlari?: string[];
  otomatikKesim?: boolean;
  eFaturaTipi?: string;
  faturaOnEki?: string | null;
  faturaAciklama?: string | null;
  sepetteGoster?: boolean;
  bildirimKesilince?: boolean;
  bildirimBekleyen?: boolean;
  kategoriler?: Kategori[];
}

const DURUM_OPTS: { key: string; label: string }[] = [
  { key: 'yeni', label: 'Yeni' },
  { key: 'hazirlaniyor', label: 'Hazırlanıyor' },
  { key: 'kargoda', label: 'Kargoda' },
  { key: 'tamamlandi', label: 'Tamamlandı' },
  { key: 'iptal', label: 'İptal' },
];

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition ${on ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );
}
function SettingRow({ title, desc, children }: { title: string; desc?: string; children: any }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-700">{title}</div>
        {desc && <div className="text-xs text-slate-400 mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
interface Row {
  orderId: string; sipNo?: string; displayNo?: string; durum?: string;
  musteri: string; telefon?: string; tutar: number; kdvDahil?: boolean;
  createdAt: string; kategori: string; faturali?: boolean;
  invoiceNo?: string | null; invoiceLink?: string | null;
}
interface Stats { toplam: number; bekleyen: number; odenen: number; toplamTutar: number; }

type CatKey = 'tumu' | 'bekleyen' | 'odenen' | 'iptal';
type SortKey = 'sipNo' | 'musteri' | 'tutar' | 'createdAt' | 'durum';

const durumBadge = (durum?: string) => {
  const map: Record<string, { t: string; c: string }> = {
    yeni: { t: 'Yeni', c: 'bg-emerald-50 text-emerald-600' },
    hazirlaniyor: { t: 'Hazırlanıyor', c: 'bg-blue-50 text-blue-600' },
    kargoda: { t: 'Kargoda', c: 'bg-indigo-50 text-indigo-600' },
    tamamlandi: { t: 'Tamamlandı', c: 'bg-slate-100 text-slate-600' },
    iptal: { t: 'İptal', c: 'bg-rose-50 text-rose-600' },
  };
  return map[durum || ''] || { t: durum || '—', c: 'bg-slate-100 text-slate-500' };
};

function StatCard({ icon, iconBg, iconColor, label, value, sub, trend, trendColor }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg} ${iconColor}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-slate-500">{label}</div>
          <div className="text-2xl font-bold text-slate-800 mt-0.5 truncate">{value}</div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-slate-400">{sub}</span>
            {trend && <span className={`text-xs font-semibold ${trendColor}`}>↗ {trend}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Fatura({ tab }: { tab?: string }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const isAyarlar = tab === 'ayarlar' || loc.pathname.includes('/ayarlar');

  const [ayar, setAyar] = useState<Ayar | null>(null);
  const [katKdv, setKatKdv] = useState<Record<string, string>>({});
  const [ayarTab, setAyarTab] = useState('genel');
  const [headerMenu, setHeaderMenu] = useState(false);
  const [kdvEdit, setKdvEdit] = useState(false);
  const [tokenGor, setTokenGor] = useState(false);
  const secRefs = {
    genel: useRef<HTMLDivElement>(null),
    kdv: useRef<HTMLDivElement>(null),
    kesim: useRef<HTMLDivElement>(null),
    bildirim: useRef<HTMLDivElement>(null),
    parametre: useRef<HTMLDivElement>(null),
  };
  const goSection = (k: keyof typeof secRefs) => {
    setAyarTab(k);
    secRefs[k].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [stats, setStats] = useState<Stats>({ toplam: 0, bekleyen: 0, odenen: 0, toplamTutar: 0 });
  const [odenen, setOdenen] = useState<Row[]>([]);
  const [bekleyen, setBekleyen] = useState<Row[]>([]);
  const [iptal, setIptal] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [cat, setCat] = useUrlState<CatKey>('cat', 'bekleyen');
  const [q, setQ] = useUrlState('q', '');
  const [tarih, setTarih] = useUrlState('tarih', '');
  const [durumFilter, setDurumFilter] = useUrlState('durum', '');
  const [maskeli, setMaskeli] = useState(true);
  const [sortKey, setSortKey] = useUrlState<SortKey>('sk', 'createdAt');
  const [sortDir, setSortDir] = useUrlState<'asc' | 'desc'>('sd', 'desc');
  const [page, setPage] = useUrlState('page', 1);
  const [perPage, setPerPage] = useUrlState('pp', 10);
  const [detail, setDetail] = useState<Row | null>(null);
  const [showRapor, setShowRapor] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, f] = await Promise.all([
        api.get('/store/birfatura/ayar'),
        api.get('/store/birfatura/faturalar'),
      ]);
      setAyar(a.data);
      const seed: Record<string, string> = {};
      const kk = a.data?.kategoriKdv || {};
      (a.data?.kategoriler || []).forEach((c: Kategori) => { seed[c.id] = kk[c.id] != null ? String(kk[c.id]) : ''; });
      setKatKdv(seed);
      setStats(f.data.stats || { toplam: 0, bekleyen: 0, odenen: 0, toplamTutar: 0 });
      setOdenen(f.data.odenen || []);
      setBekleyen(f.data.bekleyen || []);
      setIptal(f.data.iptal || []);
    } catch {
      toast.error('Veriler yüklenemedi');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const saveAyar = async (patch: Partial<Ayar>) => {
    try { const r = await api.post('/store/birfatura/ayar', patch); setAyar(r.data); toast.success('Ayar kaydedildi'); }
    catch { toast.error('Kaydedilemedi'); }
  };
  const saveKatKdv = async () => {
    const m: Record<string, number> = {};
    Object.entries(katKdv).forEach(([k, v]) => { if (v !== '' && Number.isFinite(Number(v))) m[k] = Number(v); });
    await saveAyar({ kategoriKdv: m });
  };
  const saveAll = async () => {
    const m: Record<string, number> = {};
    Object.entries(katKdv).forEach(([k, v]) => { if (v !== '' && Number.isFinite(Number(v))) m[k] = Number(v); });
    await saveAyar({ kategoriKdv: m });
    setKdvEdit(false);
    toast.success('Tüm fatura ayarları kaydedildi');
  };
  const toggleDurum = (key: string) => {
    const cur = ayar?.faturaDurumlari || ['kargoda'];
    const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
    saveAyar({ faturaDurumlari: next.length ? next : ['kargoda'] });
  };
  const yenileToken = async () => {
    if (!confirm('Token yenilenecek. BirFatura panelindeki token ile değiştirmeniz gerekecek. Devam?')) return;
    try { const r = await api.post('/store/birfatura/token-yenile', {}); setAyar(r.data); toast.success('Token yenilendi'); }
    catch { toast.error('Yenilenemedi'); }
  };
  const kopyala = (v: string) => { navigator.clipboard.writeText(v); toast.success('Kopyalandı'); };
  const baseUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://diljar.com');

  // ---- Liste hesaplama ----
  const allRows = useMemo(() => [...bekleyen, ...odenen, ...iptal], [bekleyen, odenen, iptal]);
  const catRows = useMemo(() => {
    if (cat === 'tumu') return allRows;
    if (cat === 'bekleyen') return bekleyen;
    if (cat === 'odenen') return odenen;
    return iptal;
  }, [cat, allRows, bekleyen, odenen, iptal]);

  const filtered = useMemo(() => {
    let r = catRows.filter((x) =>
      !q || [x.musteri, x.sipNo, x.displayNo, x.invoiceNo, x.telefon].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))
    );
    if (durumFilter) r = r.filter((x) => x.durum === durumFilter);
    if (tarih) r = r.filter((x) => new Date(x.createdAt).toISOString().slice(0, 10) === tarih);
    const dir = sortDir === 'asc' ? 1 : -1;
    r = [...r].sort((a, b) => {
      if (sortKey === 'tutar') return (a.tutar - b.tutar) * dir;
      if (sortKey === 'createdAt') return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      const av = String((a as any)[sortKey] || '').toLowerCase();
      const bv = String((b as any)[sortKey] || '').toLowerCase();
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return r;
  }, [catRows, q, durumFilter, tarih, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [cat, q, durumFilter, tarih, perPage]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  const cats: { key: CatKey; label: string; n?: number }[] = [
    { key: 'tumu', label: 'Tümü' },
    { key: 'bekleyen', label: 'Kalan / Bekleyen', n: bekleyen.length },
    { key: 'odenen', label: 'Ödenenler' },
    { key: 'iptal', label: 'İptal Edilenler' },
  ];

  const kdv = ayar?.kdvOrani || 10;
  const toplamFaturali = odenen.reduce((s, k) => s + (k.tutar || 0), 0);
  const toplamKdv = toplamFaturali - toplamFaturali / (1 + kdv / 100);

  // ==================== AYARLAR ====================
  if (isAyarlar) {
    const durumlar = ayar?.faturaDurumlari || ['kargoda'];
    const aktifKatSayisi = Object.values(katKdv).filter((v) => v !== '').length;
    const bildirimSayisi = (ayar?.bildirimKesilince !== false ? 1 : 0) + (ayar?.bildirimBekleyen ? 1 : 0) + (ayar?.sepetteGoster !== false ? 1 : 0);
    const ayarTabs: { key: keyof typeof secRefs; label: string; icon: any }[] = [
      { key: 'genel', label: 'Genel Ayarlar', icon: LayoutGrid },
      { key: 'kdv', label: 'KDV & Kategoriler', icon: Tag },
      { key: 'kesim', label: 'Kesim Koşulları', icon: ListChecks },
      { key: 'bildirim', label: 'Bildirimler', icon: Bell },
      { key: 'parametre', label: 'Fatura Parametreleri', icon: FileText },
    ];
    const effKdv = (id: string) => (katKdv[id] !== '' && katKdv[id] != null ? katKdv[id] : String(ayar?.kdvOrani ?? 18));
    return (
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto fatura-ayar">
        <style>{`
          @keyframes faUp { from { opacity:0; transform: translateY(16px); } to { opacity:1; transform:none; } }
          @keyframes faPop { from { opacity:0; transform: scale(.97); } to { opacity:1; transform:none; } }
          .fatura-ayar .fa-card { animation: faUp .5s cubic-bezier(.21,1,.21,1) both; }
          .fatura-ayar .fa-hero { animation: faPop .45s cubic-bezier(.21,1,.21,1) both; }
        `}</style>

        {/* Başlık */}
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800">Fatura Ayarları</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 ${ayar?.aktif ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                <CheckCircle2 size={13} /> {ayar?.aktif ? 'Entegrasyon Aktif' : 'Entegrasyon Pasif'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">BirFatura entegrasyonu, KDV kuralları, kesim koşulları ve bildirim ayarları</p>
          </div>
          <div className="flex items-center gap-2 relative">
            <button onClick={saveAll}
              className="px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm transition">
              <Save size={16} /> Kaydet
            </button>
            <button onClick={() => setHeaderMenu((m) => !m)}
              className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 flex items-center justify-center"><MoreHorizontal size={18} /></button>
            {headerMenu && (
              <div className="absolute right-0 top-12 z-30 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1 text-sm">
                <button onClick={() => { yenileToken(); setHeaderMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 flex items-center gap-2"><RefreshCw size={14} /> Token Yenile</button>
                <button onClick={() => { load(); setHeaderMenu(false); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 flex items-center gap-2"><RefreshCw size={14} /> Ayarları Yenile</button>
                <a href="/fatura" className="block px-3 py-2 hover:bg-slate-50 text-slate-600 flex items-center gap-2"><ChevronLeft size={14} /> Faturalara Dön</a>
              </div>
            )}
          </div>
        </div>

        {/* Sekme çubuğu */}
        <div className="bg-white rounded-2xl border border-slate-200 px-2 mb-5 flex items-center gap-1 overflow-x-auto">
          {ayarTabs.map((t) => {
            const on = ayarTab === t.key;
            return (
              <button key={t.key} onClick={() => goSection(t.key)}
                className={`relative px-4 py-3.5 text-sm font-medium whitespace-nowrap flex items-center gap-2 transition ${on ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <t.icon size={16} /> {t.label}
                {on && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-emerald-600 rounded-full" />}
              </button>
            );
          })}
        </div>

        {ayar && (
          <div className="space-y-5">
            {/* Özet hero kart */}
            <div ref={secRefs.genel} className="fa-hero relative bg-white rounded-2xl border border-slate-200 p-5 overflow-hidden shadow-sm">
              <div className="absolute right-0 top-0 bottom-0 w-72 pointer-events-none hidden lg:block opacity-90">
                <div className="absolute right-8 top-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-emerald-50" />
                <div className="absolute right-24 top-6 w-20 h-20 rounded-full bg-emerald-100/60" />
                <svg className="absolute right-12 top-1/2 -translate-y-1/2" width="120" height="140" viewBox="0 0 120 140" fill="none">
                  <rect x="14" y="10" width="80" height="110" rx="10" fill="#fff" stroke="#d1fae5" strokeWidth="2" />
                  <rect x="28" y="28" width="52" height="6" rx="3" fill="#a7f3d0" />
                  <rect x="28" y="44" width="40" height="5" rx="2.5" fill="#e2e8f0" />
                  <rect x="28" y="56" width="46" height="5" rx="2.5" fill="#e2e8f0" />
                  <rect x="28" y="68" width="34" height="5" rx="2.5" fill="#e2e8f0" />
                  <circle cx="86" cy="104" r="20" fill="#10b981" />
                  <path d="M78 104l6 6 11-12" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                <div className="flex items-start gap-3 pb-4 sm:pb-0 sm:pr-5">
                  <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 size={22} /></div>
                  <div>
                    <div className="text-[13px] text-slate-500">Entegrasyon Durumu</div>
                    <div className="text-xl font-bold text-slate-800 mt-0.5">{ayar.aktif ? 'Aktif' : 'Pasif'}</div>
                    <div className="text-xs text-slate-400 mt-0.5">BirFatura entegrasyonu {ayar.aktif ? 'çalışıyor' : 'pasif'}</div>
                  </div>
                </div>
                <div className="py-4 sm:py-0 sm:px-5">
                  <div className="text-[13px] text-slate-500">Genel KDV</div>
                  <div className="text-3xl font-bold text-emerald-600 mt-0.5">%{ayar.kdvOrani}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Varsayılan oran</div>
                </div>
                <div className="py-4 sm:py-0 sm:px-5">
                  <div className="text-[13px] text-slate-500">Özel Kategori KDV</div>
                  <div className="text-3xl font-bold text-slate-800 mt-0.5">{aktifKatSayisi}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Kategori bazlı oran</div>
                </div>
                <div className="pt-4 sm:pt-0 sm:px-5">
                  <div className="text-[13px] text-slate-500">Aktif Bildirim</div>
                  <div className="text-3xl font-bold text-blue-600 mt-0.5">{bildirimSayisi}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Bildirim kuralı</div>
                </div>
              </div>
            </div>

            {/* 3'lü kart grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Entegrasyon Bilgileri */}
              <div className="fa-card bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" style={{ animationDelay: '40ms' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow"><Zap size={16} /></div>
                    <h3 className="font-semibold text-slate-800">Entegrasyon Bilgileri</h3>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Bağlantı Aktif</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-500">API Token (BirFatura "API Şifresi")</label>
                    <div className="flex gap-2 mt-1.5">
                      <input readOnly type={tokenGor ? 'text' : 'password'} value={ayar.token} onClick={() => setTokenGor((s) => !s)}
                        className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 font-mono cursor-pointer" />
                      <button onClick={() => kopyala(ayar.token)} title="Kopyala" className="px-3 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 text-slate-500 transition"><Copy size={15} /></button>
                      <button onClick={yenileToken} title="Yenile" className="px-3 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 text-amber-600 transition"><RefreshCw size={15} /></button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Web Site Adresi (BirFatura paneline giriş adresi)</label>
                    <div className="flex gap-2 mt-1.5">
                      <input readOnly value={baseUrl} className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 font-mono" />
                      <button onClick={() => kopyala(baseUrl)} title="Kopyala" className="px-3 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 text-slate-500 transition"><Copy size={15} /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm text-slate-600">Entegrasyon Durumu</span>
                    <Toggle on={!!ayar.aktif} onChange={(v) => saveAyar({ aktif: v })} />
                  </div>
                </div>
              </div>

              {/* KDV & Kategoriler */}
              <div ref={secRefs.kdv} className="fa-card bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" style={{ animationDelay: '120ms' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow"><Tag size={16} /></div>
                    <h3 className="font-semibold text-slate-800">KDV & Kategoriler</h3>
                  </div>
                  <button onClick={() => { if (kdvEdit) saveKatKdv(); setKdvEdit((e) => !e); }}
                    className={`text-xs font-medium px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition ${kdvEdit ? 'bg-emerald-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {kdvEdit ? <><Save size={13} /> Kaydet</> : <><Settings size={13} /> Düzenle</>}
                  </button>
                </div>
                <div className="mb-3">
                  <label className="text-xs text-slate-500">Genel Varsayılan KDV (%)</label>
                  <input type="number" defaultValue={ayar.kdvOrani} onBlur={(e) => saveAyar({ kdvOrani: Number(e.target.value) })}
                    className="w-full mt-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-100 focus:border-violet-400 outline-none transition" />
                </div>
                {ayar.kategoriler && ayar.kategoriler.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                    {ayar.kategoriler.map((c, i) => (
                      <div key={c.id} style={{ animationDelay: `${140 + i * 25}ms` }}
                        className="fa-card flex items-center gap-1.5 rounded-lg px-2.5 py-2 border border-slate-200 hover:border-violet-200 transition">
                        <span className="flex-1 text-sm text-slate-700 truncate">{c.ad}</span>
                        {kdvEdit ? (
                          <input type="number" value={katKdv[c.id] ?? ''} placeholder={`${ayar.kdvOrani}`}
                            onChange={(e) => setKatKdv((m) => ({ ...m, [c.id]: e.target.value }))}
                            className="w-14 px-1.5 py-1 text-sm border border-violet-200 rounded-md text-right text-violet-600 font-medium focus:ring-2 focus:ring-violet-100 outline-none" />
                        ) : (
                          <span className="text-sm font-semibold text-emerald-600">%{effKdv(c.id)}</span>
                        )}
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">Henüz kategori tanımlı değil</div>
                )}
                <button onClick={() => navigate('/depo/urunlerim')}
                  className="mt-3 w-full py-2.5 text-sm rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50/40 transition flex items-center justify-center gap-1.5">
                  <Plus size={15} /> Kategori Ekle
                </button>
              </div>

              {/* Fatura Kesim Koşulları */}
              <div ref={secRefs.kesim} className="fa-card bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow"><Receipt size={16} /></div>
                  <h3 className="font-semibold text-slate-800">Fatura Kesim Koşulları</h3>
                </div>
                <div className="text-sm font-medium text-slate-600 mb-2.5">Faturası kesilecek siparişlerin durumu</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {DURUM_OPTS.map((d) => {
                    const on = durumlar.includes(d.key);
                    return (
                      <button key={d.key} onClick={() => toggleDurum(d.key)}
                        className={`px-3 py-2 text-sm rounded-lg border flex items-center gap-1.5 transition-all duration-200 ${on ? 'bg-amber-50 border-amber-300 text-amber-700 shadow-sm scale-105' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                        {on && <CheckCircle2 size={13} />} {d.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <div className="text-sm font-medium text-slate-700">Otomatik Fatura Aktarımı</div>
                    <div className="text-xs text-slate-400 mt-0.5">Sipariş seçilen duruma geçtiğinde otomatik olarak BirFatura'ya gönderilir.</div>
                  </div>
                  <Toggle on={!!ayar.otomatikKesim} onChange={(v) => saveAyar({ otomatikKesim: v })} />
                </div>
              </div>
            </div>

            {/* 2'li kart grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Bildirimler & Görünürlük */}
              <div ref={secRefs.bildirim} className="fa-card bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" style={{ animationDelay: '40ms' }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shadow"><Bell size={16} /></div>
                  <h3 className="font-semibold text-slate-800">Bildirimler & Görünürlük</h3>
                </div>
                {[
                  { icon: ShoppingCart, t: 'Sepet / Sipariş detayında göster', d: 'Fatura bilgisi sipariş detay ekranında görüntülensin', on: ayar.sepetteGoster !== false, set: (v: boolean) => saveAyar({ sepetteGoster: v }) },
                  { icon: Receipt, t: 'Fatura kesildiğinde bildirim oluştur', d: 'Fatura oluşturulduğunda bildirim gönderilsin', on: ayar.bildirimKesilince !== false, set: (v: boolean) => saveAyar({ bildirimKesilince: v }) },
                  { icon: Truck, t: 'Bekleyen fatura hatırlatması', d: 'Faturalanmamış kargolanmış siparişler için hatırlatma bildirimi', on: !!ayar.bildirimBekleyen, set: (v: boolean) => saveAyar({ bildirimBekleyen: v }) },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><r.icon size={16} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">{r.t}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{r.d}</div>
                    </div>
                    <Toggle on={r.on} onChange={r.set} />
                  </div>
                ))}
              </div>

              {/* Fatura Parametreleri */}
              <div ref={secRefs.parametre} className="fa-card bg-white rounded-2xl border border-slate-200 p-5 shadow-sm" style={{ animationDelay: '120ms' }}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-600 to-slate-500 text-white flex items-center justify-center shadow"><FileText size={16} /></div>
                  <h3 className="font-semibold text-slate-800">Fatura Parametreleri</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500">Fatura Tipi</label>
                    <select defaultValue={ayar.eFaturaTipi || 'eArsiv'} onChange={(e) => saveAyar({ eFaturaTipi: e.target.value })}
                      className="w-full mt-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:border-emerald-400 outline-none">
                      <option value="eArsiv">e-Arşiv Fatura</option>
                      <option value="eFatura">e-Fatura</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">İndirim Modu</label>
                    <select defaultValue={ayar.indirimModu} onChange={(e) => saveAyar({ indirimModu: e.target.value })}
                      className="w-full mt-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:border-emerald-400 outline-none">
                      <option value="DiscountAlanindan">İndirim Alanından</option>
                      <option value="BirimFiyattan">Birim Fiyattan</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Fatura Seri Ön Eki (opsiyonel)</label>
                    <input defaultValue={ayar.faturaOnEki || ''} onBlur={(e) => saveAyar({ faturaOnEki: e.target.value })}
                      placeholder="örn. DLJ" className="w-full mt-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:border-emerald-400 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Fatura Açıklama Şablonu (opsiyonel)</label>
                    <input defaultValue={ayar.faturaAciklama || ''} onBlur={(e) => saveAyar({ faturaAciklama: e.target.value })}
                      placeholder="örn. {sipNo} numaralı sipariş" className="w-full mt-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:border-emerald-400 outline-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== ANA LİSTE ====================
  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Fatura Yönetimi</h1>
          <p className="text-sm text-slate-500 mt-0.5">BirFatura entegrasyonu — faturalar, bekleyenler ve ayarlar</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.open('https://app.birfatura.com', '_blank')}
            className="px-4 py-2.5 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 shadow-sm">
            <Plus size={16} /> Yeni Fatura
          </button>
          <button onClick={load} title="Yenile"
            className="px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500">
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
          </button>
        </div>
      </div>

      {/* Stat kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard icon={<FileBarChart size={20} />} iconBg="bg-emerald-50" iconColor="text-emerald-600"
          label="Toplam Fatura" value={stats.toplam} sub="Bu ay" trend="%18" trendColor="text-emerald-600" />
        <StatCard icon={<Clock size={20} />} iconBg="bg-amber-50" iconColor="text-amber-600"
          label="Bekleyen Faturalar" value={stats.bekleyen} sub="Toplam" trend="%100" trendColor="text-amber-600" />
        <StatCard icon={<CheckCheck size={20} />} iconBg="bg-indigo-50" iconColor="text-indigo-600"
          label="Ödenen Faturalar" value={stats.odenen} sub="Bu ay" trend="%15" trendColor="text-indigo-600" />
        <StatCard icon={<Wallet size={20} />} iconBg="bg-purple-50" iconColor="text-purple-600"
          label="Toplam Tutar" value={fmt(stats.toplamTutar)} sub="Bu ay" trend="%22" trendColor="text-purple-600" />
      </div>

      {/* Sekme + sağ aksiyonlar */}
      <div className="bg-white rounded-t-2xl border border-slate-200 border-b-0 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {cats.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)}
              className={`relative px-4 py-2.5 text-sm font-medium transition flex items-center gap-2 ${cat === c.key ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
              {c.label}
              {c.n != null && c.n > 0 && <span className="text-[11px] min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center">{c.n}</span>}
              {cat === c.key && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-emerald-600 rounded-full" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowRapor(true)}
            className="px-3.5 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center gap-1.5">
            <Percent size={15} /> Raporlama
          </button>
          <a href="/fatura/ayarlar"
            className="px-3.5 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center gap-1.5">
            <Settings size={15} /> Fatura Ayarları
          </a>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white border-x border-slate-200 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Müşteri / No ara..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 outline-none" />
        </div>
        <div className="relative">
          <Calendar size={16} className="absolute left-3 top-3 text-slate-400 pointer-events-none" />
          <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 outline-none focus:border-emerald-400" />
        </div>
        <div className="relative">
          <select value={durumFilter} onChange={(e) => setDurumFilter(e.target.value)}
            className="w-full appearance-none px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 outline-none focus:border-emerald-400 bg-white">
            <option value="">Durum seçin</option>
            <option value="yeni">Yeni</option>
            <option value="hazirlaniyor">Hazırlanıyor</option>
            <option value="kargoda">Kargoda</option>
            <option value="tamamlandi">Tamamlandı</option>
            <option value="iptal">İptal</option>
          </select>
          <ChevronDown size={16} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={() => setMaskeli((m) => !m)}
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 flex items-center justify-between hover:bg-slate-50">
          <span className="flex items-center gap-2"><Eye size={16} className="text-slate-400" /> Maskeler</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${maskeli ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{maskeli ? 'Açık' : 'Kapalı'}</span>
        </button>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-b-2xl border border-slate-200 border-t-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-slate-500 border-y border-slate-100 bg-slate-50/50">
              <Th label="Sipariş No" onClick={() => toggleSort('sipNo')} active={sortKey === 'sipNo'} dir={sortDir} />
              <Th label="Müşteri" onClick={() => toggleSort('musteri')} active={sortKey === 'musteri'} dir={sortDir} />
              <Th label="Tutar" onClick={() => toggleSort('tutar')} active={sortKey === 'tutar'} dir={sortDir} />
              <Th label="Tarih" onClick={() => toggleSort('createdAt')} active={sortKey === 'createdAt'} dir={sortDir} />
              <Th label="Durum" onClick={() => toggleSort('durum')} active={sortKey === 'durum'} dir={sortDir} />
              <th className="px-5 py-3 text-right font-medium">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const db = durumBadge(r.durum);
              const waBekliyor = r.kategori === 'bekleyen';
              const fatBadge = r.kategori === 'odenen'
                ? { t: 'Faturalandı', c: 'bg-emerald-50 text-emerald-600' }
                : r.kategori === 'iptal'
                  ? { t: 'İptal Edildi', c: 'bg-rose-50 text-rose-600' }
                  : { t: 'Fatura bekliyor', c: 'bg-amber-50 text-amber-600' };
              return (
                <tr key={r.orderId} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-800">{r.sipNo || '—'}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-slate-400">{r.displayNo}</span>
                      {r.displayNo && <button onClick={() => kopyala(r.displayNo!)} className="text-slate-300 hover:text-slate-500"><Copy size={12} /></button>}
                    </div>
                    <span className={`inline-block mt-1.5 text-[11px] px-2 py-0.5 rounded ${db.c}`}>{db.t}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-slate-700">{maskeli ? maskName(r.musteri) : r.musteri}</div>
                    {r.telefon && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
                        {maskeli ? maskPhone(r.telefon) : r.telefon}
                        <a href={`https://wa.me/${String(r.telefon).replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                          className="text-emerald-500 hover:text-emerald-600">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2Zm5.2 14c-.2.6-1.2 1.1-1.7 1.2-.5.1-1 .2-2.9-.6-2.4-1-4-3.5-4.1-3.6-.1-.2-1-1.3-1-2.5s.6-1.8.9-2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.1-.2.3-.1.5.1.2.6 1 1.3 1.6.9.8 1.6 1 1.8 1.1.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.5-.1l1.8.9c.2.1.4.2.4.3.1.1.1.6 0 1Z" /></svg>
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-800">{fmt(r.tutar)}</div>
                    <span className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded bg-violet-50 text-violet-600">KDV Dahil</span>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <div>{new Date(r.createdAt).toLocaleDateString('tr-TR')}</div>
                    <div className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg ${fatBadge.c}`}>
                      {waBekliyor && <Clock size={13} />} {fatBadge.t}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5 relative">
                      <button onClick={() => setDetail(r)} title="Detay"
                        className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 flex items-center justify-center"><Eye size={15} /></button>
                      <button onClick={() => r.invoiceLink ? window.open(r.invoiceLink, '_blank') : toast('Fatura linki yok')} title="İndir"
                        className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 flex items-center justify-center"><Download size={15} /></button>
                      <button onClick={() => setMenuOpen(menuOpen === r.orderId ? null : r.orderId)}
                        className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 flex items-center justify-center"><MoreHorizontal size={15} /></button>
                      {menuOpen === r.orderId && (
                        <div className="absolute right-0 top-11 z-20 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 text-sm">
                          <button onClick={() => { setDetail(r); setMenuOpen(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 flex items-center gap-2"><Eye size={14} /> Detayları Gör</button>
                          {r.invoiceLink && <a href={r.invoiceLink} target="_blank" rel="noreferrer" className="block px-3 py-2 hover:bg-slate-50 text-slate-600 flex items-center gap-2"><FileText size={14} /> Faturayı Aç</a>}
                          <button onClick={() => { kopyala(r.sipNo || ''); setMenuOpen(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-600 flex items-center gap-2"><Copy size={14} /> Sipariş No Kopyala</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {paged.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-400">
                <FileText size={40} className="mx-auto mb-2 text-slate-200" />
                Bu sekmede kayıt bulunmuyor
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sayfalama */}
      <div className="flex items-center justify-between flex-wrap gap-3 mt-4 px-1">
        <span className="text-sm text-slate-500">
          {filtered.length} sonuçtan {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} arası gösteriliyor
        </span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center text-slate-500"><ChevronLeft size={16} /></button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`w-9 h-9 rounded-lg text-sm font-medium ${p === page ? 'bg-emerald-600 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{p}</button>
          ))}
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center text-slate-500"><ChevronRight size={16} /></button>
          <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 outline-none">
            <option value={10}>10 / sayfa</option>
            <option value={25}>25 / sayfa</option>
            <option value={50}>50 / sayfa</option>
          </select>
        </div>
      </div>

      {/* Alt CTA banner */}
      <div className="mt-5 bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><FileText size={22} /></div>
          <div>
            <div className="font-semibold text-slate-800">Faturalarınızı kolayca yönetin</div>
            <div className="text-sm text-slate-500">BirFatura entegrasyonu ile faturalarınızı hızlıca oluşturun, takip edin ve yönetin.</div>
          </div>
        </div>
        <button onClick={() => window.open('https://app.birfatura.com', '_blank')}
          className="px-4 py-2.5 text-sm font-medium rounded-xl border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5">
          Fatura Oluşturmayı Keşfet <ArrowRight size={16} />
        </button>
      </div>

      {/* Detay modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-lg">Fatura Detayı</h3>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="space-y-2.5 text-sm">
              <Row2 k="Sipariş No" v={detail.sipNo || '—'} />
              <Row2 k="Görünen No" v={detail.displayNo || '—'} />
              <Row2 k="Müşteri" v={maskeli ? maskName(detail.musteri) : detail.musteri} />
              {detail.telefon && <Row2 k="Telefon" v={maskeli ? maskPhone(detail.telefon) : detail.telefon} />}
              <Row2 k="Tutar" v={fmt(detail.tutar)} />
              <Row2 k="Durum" v={durumBadge(detail.durum).t} />
              <Row2 k="Tarih" v={new Date(detail.createdAt).toLocaleString('tr-TR')} />
              {detail.invoiceNo && <Row2 k="Fatura No" v={detail.invoiceNo} />}
            </div>
            {detail.invoiceLink && (
              <a href={detail.invoiceLink} target="_blank" rel="noreferrer"
                className="mt-4 w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-emerald-700">
                <Download size={16} /> Faturayı Görüntüle
              </a>
            )}
          </div>
        </div>
      )}

      {/* Raporlama modal */}
      {showRapor && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowRapor(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 text-lg flex items-center gap-2"><Percent size={18} /> Raporlama</h3>
              <button onClick={() => setShowRapor(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <RapKart k="Kesilen Fatura" v={String(odenen.length)} c="text-slate-800" />
              <RapKart k="Bekleyen Fatura" v={String(bekleyen.length)} c="text-amber-600" />
              <RapKart k="Faturalanan Toplam" v={fmt(toplamFaturali)} c="text-emerald-600" />
              <RapKart k={`KDV Tutarı (%${kdv})`} v={fmt(toplamKdv)} c="text-slate-800" />
              <RapKart k="Bekleyen Tutar" v={fmt(bekleyen.reduce((s, b) => s + b.tutar, 0))} c="text-slate-800" />
              <RapKart k="İptal Edilen" v={String(iptal.length)} c="text-rose-600" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ label, onClick, active, dir }: { label: string; onClick: () => void; active: boolean; dir: string }) {
  return (
    <th className="px-5 py-3 font-medium text-left">
      <button onClick={onClick} className={`flex items-center gap-1 ${active ? 'text-slate-700' : 'hover:text-slate-700'}`}>
        {label} <ChevronsUpDown size={13} className={active ? 'text-emerald-500' : 'text-slate-300'} />
        {active && <span className="text-[10px] text-emerald-500">{dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}
function Row2({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-800 text-right">{v}</span></div>;
}
function RapKart({ k, v, c }: { k: string; v: string; c: string }) {
  return <div className="bg-slate-50 rounded-xl p-4"><div className="text-xs text-slate-500">{k}</div><div className={`text-xl font-bold mt-1 ${c}`}>{v}</div></div>;
}
