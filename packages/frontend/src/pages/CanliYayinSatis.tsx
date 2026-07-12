import { useState, useMemo, useEffect, useRef } from 'react';
import { Clock, TrendingUp, Wallet, ShoppingBag, Users, BarChart3, Radio, Square, Send, X, Filter, Trash2, History, UserCircle, Plus, Search, UserPlus, Tag, Brain, AlertTriangle, Lightbulb, Sparkles, Package, Target, Share2, Video, Play, Download, Eye, EyeOff, Move, Pin } from 'lucide-react';
import { Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { openChat } from '../components/ChatDock';

ChartJS.register(ArcElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => (s || '').toLowerCase().replace(/^@/, '').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').trim();
const hhmm = (iso: string) => { try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
// IG/FB durum yanıtı içerik olarak değişti mi? (gereksiz re-render'ı önler -> chat sabit kalır)
const feedSig = (s: any) => {
  if (!s) return '';
  const f: any[] = Array.isArray(s.feed) ? s.feed : [];
  const last = f.length ? (f[f.length - 1].id || f[f.length - 1].commentId || f[f.length - 1].text || '') : '';
  return `${!!s.connected}|${f.length}|${last}|${s.matched ?? ''}|${s.live ?? ''}`;
};
const sameFeed = (a: any, b: any) => feedSig(a) === feedSig(b);
// Kod karşılaştırma anahtarı: küçük harf + TR sadeleştirme + harf/rakam dışını at
const codeKey = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
// Beden eşanlam anahtarı: "2XL"=="XXL", "3XL"=="XXXL", büyük/küçük harf duyarsız.
// Sayı önekli bedenler (2xl/3xs) tekrarlı-X formuna indirgenir; varyasyon "XXL" ile yazılan "2xl" eşleşir.
const sizeKey = (s: string) => {
  let k = norm(s).replace(/[^a-z0-9]/g, '');
  const m = k.match(/^([2-6])x([a-z]+)$/); // 2xl, 3xs, 4xl...
  if (m) k = 'x'.repeat(parseInt(m[1], 10)) + m[2];
  return k;
};
// Levenshtein mesafesi (1 harf hatasını tolere etmek için)
const lev = (a: string, b: string): number => {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
};

type Durum = 'onaylandi' | 'rezerve' | 'stok_yok' | 'riskli' | 'iptal';
const DURUM_BADGE: Record<string, { t: string; c: string }> = {
  onaylandi: { t: 'Onaylandı', c: 'bg-green-100 text-green-700' },
  rezerve: { t: 'Rezerve', c: 'bg-amber-100 text-amber-700' },
  stok_yok: { t: 'Stok Yetersiz', c: 'bg-red-100 text-red-700' },
  riskli: { t: 'Kod Bulunamadı', c: 'bg-slate-200 text-slate-600' },
  iptal: { t: 'İptal Edildi', c: 'bg-rose-100 text-rose-600' },
};

// İzole canlı saat: kendi içinde saniyede bir tikler, böylece ana ekran her saniye yeniden render olmaz.
function LiveClock({ startedAt }: { startedAt?: string | null }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!startedAt) { setS(0); return; }
    const calc = () => setS(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const val = startedAt
    ? `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : '--:--:--';
  return (
    <div className="flex items-center gap-1.5 px-2 shrink-0">
      <Clock size={13} className="text-slate-400 shrink-0" />
      <div className="leading-none"><p className="text-[9px] text-slate-400 uppercase tracking-wide">Süre</p><p className="text-sm font-bold text-slate-800 mt-0.5 tabular-nums">{val}</p></div>
    </div>
  );
}

export default function CanliYayinSatis() {
  const { products, customers, categories, campaigns, storeSetting, reload } = useStore();
  const [stream, setStream] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [freeProducts, setFreeProducts] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [satici, setSatici] = useState(() => { try { return localStorage.getItem('cy_active_satici') || ''; } catch { return ''; } });
  const [sellers, setSellers] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('cy_sellers') || '[]'); } catch { return []; } });
  const [search, setSearch] = useState('');
  const [barkodModal, setBarkodModal] = useState<any>(null);
  const [flash, setFlash] = useState<Record<string, { price: number; exp: number }>>({});
  const [priceOverride, setPriceOverride] = useState<Record<string, number>>({});
  const [editPrice, setEditPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState('');
  const [hideNums, setHideNums] = useState<boolean>(() => { try { return localStorage.getItem('cy_hide_nums') === '1'; } catch { return false; } });
  const [histSearch, setHistSearch] = useState('');
  const [histPos, setHistPos] = useState({ x: 0, y: 0 });
  const [histSize, setHistSize] = useState({ w: 560, h: 600 });
  const [feedWin, setFeedWin] = useState({ open: false, pinned: false });
  const [feedPos, setFeedPos] = useState({ x: 90, y: 130 });
  const [feedSize, setFeedSize] = useState({ w: 360, h: 470 });
  const [histPin, setHistPin] = useState(false);
  const [barHistory, setBarHistory] = useState<any[]>([]);
  const [barHistModal, setBarHistModal] = useState(false);
  const [iptalAday, setIptalAday] = useState<any>(null);
  // Katalog her zaman açık: yayında okutulan/yazılan/indirimli ürünler herkese açık katalogda görünür
  const [araQ, setAraQ] = useState('');
  const [fbStatus, setFbStatus] = useState<{ connected: boolean; videoId: string | null; feed: any[] }>({ connected: false, videoId: null, feed: [] });
  const [fbBusy, setFbBusy] = useState(false);
  const [igStatus, setIgStatus] = useState<{ connected: boolean; igUserId: string | null; feed: any[]; saved?: boolean }>({ connected: false, igUserId: null, feed: [], saved: false });
  const [igBusy, setIgBusy] = useState(false);
  const FEED_LIMIT = 20;
  const [yorumShowAll, setYorumShowAll] = useState(false);
  const [imgZoom, setImgZoom] = useState('');
  const [leftTab, setLeftTab] = useState<'yorum' | 'manuel' | 'sohbet'>('manuel');
  const [islenenIds, setIslenenIds] = useState<Record<string, boolean>>({});
  const [duzeltModal, setDuzeltModal] = useState<{ commentId: string; user: string; kod: string; beden: string; raw: string; urun: string } | null>(null);
  const [discForm, setDiscForm] = useState({ price: '', dakika: '7' });
  const [varsayilanIndirim, setVarsayilanIndirim] = useState<number>(() => { try { return Number(localStorage.getItem('cy_def_indirim')) || 0; } catch { return 0; } });
  const saveDefIndirim = (pct: number) => { setVarsayilanIndirim(pct); try { pct > 0 ? localStorage.setItem('cy_def_indirim', String(pct)) : localStorage.removeItem('cy_def_indirim'); } catch { /* */ } };
  const defIndirimPrice = (base: number) => (base > 0 && varsayilanIndirim > 0 ? Math.ceil((base * (1 - varsayilanIndirim / 100)) / 10) * 10 : 0);
  const [tab, setTab] = useState<'tumu' | 'kayit' | Durum>('tumu');
  const [reportOpen, setReportOpen] = useState(false);
  // Şans çarkı: gelen yorumlardan rastgele talihli seçimi
  const [cark, setCark] = useState<{ open: boolean; spinning: boolean; current: string; winner: string | null; registered: boolean }>({ open: false, spinning: false, current: '', winner: null, registered: false });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [histDetail, setHistDetail] = useState<any>(null);
  const [ozet, setOzet] = useState<any>(null);
  const [aiTick, setAiTick] = useState(0);
  const [lightbox, setLightbox] = useState('');
  const [sabitGider, setSabitGider] = useState('');
  const [busy, setBusy] = useState(false);
  const [kayitModal, setKayitModal] = useState(false);
  const [kayitForm, setKayitForm] = useState({ ad: '', instagram: '', telefon: '', anchor: '' });
  const [kampOpen, setKampOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const kampEmpty = { ad: '', tip: 'urun_adet', minAdet: '3', minTutar: '', indirimTip: 'yuzde', indirimDeger: '10', kapsam: 'hepsi', kategoriId: '', productId: '', sureDk: '' };
  const [kampForm, setKampForm] = useState<any>(kampEmpty);
  const saveKampanya = async () => {
    if (!kampForm.ad.trim()) { toast.error('Kampanya adı girin'); return; }
    const body: any = {
      ad: kampForm.ad, aktif: true, tip: kampForm.tip,
      minAdet: kampForm.tip === 'urun_adet' ? Number(kampForm.minAdet) || 1 : null,
      minTutar: kampForm.tip === 'sepet_tutar' ? Number(kampForm.minTutar) || 0 : null,
      indirimTip: kampForm.indirimTip, indirimDeger: Number(kampForm.indirimDeger) || 0,
      kapsam: kampForm.kapsam, kategoriId: kampForm.kapsam === 'kategori' ? (kampForm.kategoriId || null) : null,
      productId: kampForm.kapsam === 'urun' ? (kampForm.productId || null) : null,
    };
    const dk = Number(kampForm.sureDk) || 0;
    if (dk > 0) body.bitisZamani = new Date(Date.now() + dk * 60000).toISOString();
    try { await api.post('/store/campaigns', body); toast.success('Kampanya eklendi' + (dk > 0 ? ` · ${dk} dk süreli` : '')); setKampForm(kampEmpty); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const toggleKampanya = async (k: any) => { try { await api.patch(`/store/campaigns/${k.id}`, k.aktif ? { aktif: false } : { aktif: true, bitisZamani: null }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const stopKampanya = async (k: any) => { if (!confirm(`"${k.ad}" kampanyası durdurulsun mu?\n\nBu kampanyayı zaten uygulamış sepetler indirimini korur; yeni sepetler artık yararlanamaz.`)) return; try { await api.post(`/store/campaigns/${k.id}/stop`); toast.success('Kampanya durduruldu'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const delKampanya = async (id: string) => { if (!confirm('Kampanya silinsin mi?')) return; try { await api.delete(`/store/campaigns/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const kampOzet = (k: any) => {
    const ind = k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : fmt(k.indirimDeger);
    const kos = k.tip === 'urun_adet' ? `${k.minAdet}+ adet alana` : `${fmt(k.minTutar)} üzeri alışverişe`;
    const kap = k.kapsam === 'hepsi' ? 'tüm ürünlerde' : k.kapsam === 'kategori' ? (categories.find((c: any) => c.id === k.kategoriId)?.ad || 'kategoride') : (products.find((p: any) => p.id === k.productId)?.ad || 'üründe');
    return `${kos} ${kap} ${ind} indirim`;
  };

  const kayitOlustur = async () => {
    if (!kayitForm.telefon.trim()) { toast.error('Telefon zorunludur'); return; }
    try {
      // anchorHandle: kayit hangi siparisin handle'i icin acildiysa (o.user). Backend rezerve
      // siparisleri bu handle'a gore saglam eslestirir (operator instagram alanini degistirse bile).
      await api.post('/store/live/musteri', { ad: kayitForm.ad, instagram: kayitForm.instagram, telefon: kayitForm.telefon, anchorHandle: kayitForm.anchor || kayitForm.instagram || '' });
      toast.success('Müşteri kaydedildi, rezerve siparişleri onaylandı');
      setKayitModal(false); setKayitForm({ ad: '', instagram: '', telefon: '', anchor: '' });
      loadActive(); reload();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const ordersSigRef = useRef('');
  // Katalog/stok tazelemesi pahalı (/store/bootstrap: tüm ürün + binlerce müşteri).
  // Her satışta değil, en fazla 15 sn'de bir arka planda yapılır -> sipariş alma anlık kalır.
  const lastReloadRef = useRef(0);
  const bgReload = () => {
    const now = Date.now();
    if (now - lastReloadRef.current < 15000) return;
    lastReloadRef.current = now;
    reload();
  };
  // Polling hata sayacı: 429/network hatasında geçici backoff uygulanır; ekran KİLİTLENMEZ.
  const pollFailRef = useRef(0);
  // loadActive dönüşü: true = istek başarılı (yayın durumu güvenilir), false = ağ/429 hatası (state korunur).
  const loadActive = async (): Promise<boolean> => {
    try {
      const r = await api.get('/store/live/active');
      // Yalnızca GERÇEK yanıt geldiğinde yayın durumunu güncelle.
      // (Hata durumunda catch'e düşer, mevcut stream state'i AYNEN korunur -> yanlışlıkla "kapalı" gösterilmez.)
      setStream(r.data.stream ?? null);
      const newOrders = r.data.orders || [];
      setOrders(newOrders);
      setOzet(r.data.ozet || null);
      pollFailRef.current = 0;
      // Satış/iptal değiştiyse ürün stoklarını arka planda (throttle'lı) tazele
      const sig = newOrders.map((o: any) => `${o.id}:${o.durum}:${o.variation || ''}:${o.adet || 1}`).join('|');
      if (sig !== ordersSigRef.current) { ordersSigRef.current = sig; bgReload(); }
      return true;
    } catch {
      // Ağ / 429 hatası: mevcut yayın+sipariş state'i korunur, buton/akış çalışmaya devam eder.
      pollFailRef.current += 1;
      return false;
    }
  };
  useEffect(() => { loadActive(); }, []);
  // Aktif satıcıyı kalıcı yap (sayfa yenilense de korunur, yeni siparişlerde saticiAd dolu gider)
  useEffect(() => { try { if (satici) localStorage.setItem('cy_active_satici', satici); else localStorage.removeItem('cy_active_satici'); } catch { /* */ } }, [satici]);
  useEffect(() => { try { localStorage.setItem('cy_hide_nums', hideNums ? '1' : '0'); } catch { /* */ } }, [hideNums]);

  // Tedarikçi (drop) ürünlerini yükle — depodan bağımsız geçici stoklu ürünler
  const loadFree = async () => {
    try {
      const r = await api.get('/store/free/products');
      const list = (r.data || []).map((p: any) => ({
        ...p,
        _drop: true,
        stokAdeti: (p.variations || []).reduce((s: number, v: any) => s + (Number(v.stok) || 0), 0),
      }));
      setFreeProducts(list);
    } catch { /* */ }
  };
  useEffect(() => { loadFree(); }, []);

  // Yorum geçmişini 24 saat kalıcı tut: backend feed'i localStorage'daki geçmişle birleştirip
  // id'ye göre tekilleştirir, 24 saatten eski kayıtları düşürür (sayfa yenilense de geçmiş durur).
  const FEED_TTL = 24 * 60 * 60 * 1000;
  const mergeFeed = (src: string, incoming: any[]): any[] => {
    const now = Date.now();
    const key = `cy_feed_${src}`;
    let stored: any[] = [];
    try { stored = JSON.parse(localStorage.getItem(key) || '[]'); } catch { /* */ }
    const map = new Map<string, any>();
    for (const c of stored) { if (c && c.id != null) map.set(String(c.id), c); }
    for (const c of (incoming || [])) {
      if (c && c.id != null) {
        const prev = map.get(String(c.id));
        map.set(String(c.id), { ...prev, ...c, _ts: prev?._ts || c._ts || now });
      }
    }
    const merged = Array.from(map.values()).filter((c) => (now - (c._ts || now)) < FEED_TTL);
    try { localStorage.setItem(key, JSON.stringify(merged.slice(-300))); } catch { /* */ }
    return merged;
  };

  // Facebook canlı yorum durumu + akışı
  const loadFb = async () => {
    try { const r = await api.get('/store/live/fb/status'); const feed = mergeFeed('fb', r.data?.feed || []); const next = { ...r.data, feed }; setFbStatus((prev) => sameFeed(prev, next) ? prev : next); } catch { /* */ }
  };
  const fbDisconnect = async () => {
    setFbBusy(true);
    try { await api.post('/store/live/fb/disconnect'); toast.success('Facebook bağlantısı kesildi'); loadFb(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setFbBusy(false); }
  };

  // Instagram canlı yorum durumu + akışı
  const loadIg = async () => {
    try { const r = await api.get('/store/live/ig/status'); const feed = mergeFeed('ig', r.data?.feed || []); const next = { ...r.data, feed }; setIgStatus((prev) => sameFeed(prev, next) ? prev : next); } catch { /* */ }
  };
  const igDisconnect = async () => {
    setIgBusy(true);
    try { await api.post('/store/live/ig/disconnect'); toast.success('Instagram bağlantısı kesildi'); loadIg(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setIgBusy(false); }
  };

  // Depo + drop ürünleri birleşik liste (arama / barkod / satış bu liste üzerinden)
  const allProds = useMemo(() => [...freeProducts, ...products], [freeProducts, products]);

  // FB + IG yorumlarını tek akışta birleştir (kaynak rozetiyle) — "Yorum Akışı" sekmesi bunu gösterir
  // Sıralama: en yeni yorum en üstte (_ts azalan; eşitse id azalan tiebreak).
  const mergedFeed = useMemo(() => {
    const fb = (fbStatus.feed || []).map((c: any) => ({ ...c, _src: 'fb' }));
    const ig = (igStatus.feed || []).map((c: any) => ({ ...c, _src: 'ig' }));
    const idNum = (c: any) => { const n = Number(String(c?.id ?? '').replace(/\D/g, '')); return Number.isFinite(n) ? n : 0; };
    return [...fb, ...ig].sort((a: any, b: any) => ((b._ts || 0) - (a._ts || 0)) || (idNum(b) - idNum(a)));
  }, [fbStatus.feed, igStatus.feed]);

  // Yayın açıkken seçili satıcıyı backend'e bildir: yorumdan otomatik alınan siparişler bu satıcıya yazılsın
  useEffect(() => {
    if (stream?.id) api.post('/store/live/satici', { satici: satici || '' }).catch(() => {});
  }, [satici, stream?.id]);

  // Yayın açıkken ve bir sosyal kaynak bağlıyken varsayılan sekme "Yorum Akışı" (bir kez otomatik geçiş)
  const autoTabRef = useRef(false);
  useEffect(() => {
    if (!autoTabRef.current && stream && (fbStatus.connected || igStatus.connected)) {
      autoTabRef.current = true;
      setLeftTab('yorum');
    }
  }, [stream, fbStatus.connected, igStatus.connected]);

  // Periyodik yenileme (DAYANIKLI): tek bir self-scheduling döngü kullanılır; aynı tick'te
  // birden fazla AĞIR çağrı üst üste bindirilmez. 429/ağ hatasında ekran KİLİTLENMEZ; interval
  // geçici olarak uzatılır (exponential backoff) ve state korunur, hata bitince otomatik toparlar.
  // Not: döngü stream olmasa da çalışır -> ilk yüklemede 429 alınsa bile yayını sonradan keşfeder.
  const streamRef = useRef<any>(null);
  useEffect(() => { streamRef.current = stream; }, [stream]);
  useEffect(() => {
    let stopped = false;
    let timer: any = null;
    let fbTick = 0; // sosyal akışı her turda değil, gecikmeli/dönüşümlü çağır (tick başına tek ağır istek)
    const BASE_MS = 4000;      // sağlıklı durumda 4 sn
    const MAX_MS = 30000;      // ardışık hatada en fazla 30 sn'ye kadar backoff
    const tick = async () => {
      if (stopped) return;
      const ok = await loadActive();
      // Yayın açıksa sosyal yorumları da tazele — ama loadActive ile AYNI ANDA değil,
      // dönüşümlü (bir tur FB, bir tur IG) => aynı tick'te çoklu ağır istek yığılmaz.
      if (ok && streamRef.current) {
        try { fbTick % 2 === 0 ? await loadFb() : await loadIg(); } catch { /* */ }
        fbTick++;
      }
      if (stopped) return;
      // Backoff: ardışık hata sayısına göre bekleme süresini üstel artır (429'u rahatlatır).
      const fails = pollFailRef.current;
      const delay = fails > 0 ? Math.min(BASE_MS * Math.pow(2, fails), MAX_MS) : BASE_MS;
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, BASE_MS);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yayın açıkken sosyal akışı hemen bir kez çek + drop ürünleri ve ağır bootstrap'i seyrek tazele.
  useEffect(() => {
    if (!stream) return;
    loadFb();
    loadIg();
    const tMid = setInterval(() => { loadFree(); }, 8000);
    const tFull = setInterval(() => { bgReload(); }, 20000);
    return () => { clearInterval(tMid); clearInterval(tFull); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // Acik urun stok karti, urun listesi her tazelendiginde guncel stok/varyasyonlari yansitsin (ekran yenilemeden)
  useEffect(() => {
    setBarkodModal((b: any) => {
      if (!b) return b;
      const src = b._drop ? freeProducts : products;
      const fresh = src.find((x: any) => x.id === b.id);
      if (!fresh) return b;
      return { ...b, stokAdeti: fresh.stokAdeti, variations: fresh.variations };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, freeProducts]);

  // AI analizini periyodik tazele (30 sn) — saat artık izole LiveClock bileşeninde tikler,
  // böylece ana ekran her saniye yeniden render olmaz.
  useEffect(() => {
    if (!stream) { setAiTick(0); return; }
    const t = setInterval(() => setAiTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, [stream]);

  useEffect(() => {
    if (!lightbox) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Control') setLightbox(''); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox]);

  const prodById = useMemo(() => { const m = new Map<string, any>(); for (const p of products) m.set(p.id, p); return m; }, [products]);
  const imgOf = (productId?: string, freeProductId?: string) => {
    const p = (productId ? prodById.get(productId) : null) || (freeProductId ? freeProducts.find((x) => x.id === freeProductId) : null);
    return ((p?.images as string[]) || [])[0] || '';
  };
  const aktifKampanyalar = useMemo(() => (campaigns || []).filter((k: any) => k.aktif && (!k.bitisZamani || new Date(k.bitisZamani).getTime() > Date.now())), [campaigns]);
  const kampanyaOf = (o: any) => {
    const pid = o?.productId || null; const fpid = o?.freeProductId || null;
    if (!pid && !fpid) return null;
    const p = pid ? products.find((x) => x.id === pid) : null;
    return aktifKampanyalar.find((k: any) => k.kapsam === 'hepsi' || (k.kapsam === 'urun' && (k.productId === pid || k.productId === fpid)) || (k.kapsam === 'kategori' && !!p && k.kategoriId === p.kategoriId)) || null;
  };
  const kampKisa = (k: any) => `${k.ad}: ${k.tip === 'urun_adet' ? `${k.minAdet}+ adet` : `${fmt(k.minTutar)} üzeri`} → ${k.indirimTip === 'yuzde' ? '%' + k.indirimDeger : fmt(k.indirimDeger)}`;
  const kampInScope = (k: any, o: any) => {
    const pid = o?.productId || null; const fpid = o?.freeProductId || null;
    if (!pid && !fpid) return false;
    const p = pid ? products.find((x) => x.id === pid) : null;
    return k.kapsam === 'hepsi' || (k.kapsam === 'urun' && (k.productId === pid || k.productId === fpid)) || (k.kapsam === 'kategori' && !!p && k.kategoriId === p.kategoriId);
  };
  // Etiket SADECE kampanya şartı gerçekten sağlandığında gösterilir (müşterinin onaylı siparişleri baz alınır).
  const kampanyaUygulanan = (o: any) => {
    if (o.durum !== 'onaylandi') return null;
    const k = kampanyaOf(o);
    if (!k) return null;
    const userOnayli = orders.filter((x) => x.durum === 'onaylandi' && x.user === o.user);
    if (k.tip === 'urun_adet') {
      const adet = userOnayli.filter((x) => kampInScope(k, x)).reduce((s, x) => s + (x.adet || 1), 0);
      return adet >= (k.minAdet || 1) ? k : null;
    }
    if (k.tip === 'sepet_tutar') {
      const toplam = userOnayli.reduce((s, x) => s + (x.tutar || 0), 0);
      return toplam >= (k.minTutar || 0) ? k : null;
    }
    return null;
  };
  // Bir müşterinin onaylı siparişleri için toplam kampanya indirimi (backend campaignAdjust ile aynı mantık)
  const kampIndirimiHesapla = (list: any[]) => {
    if (!list.length) return 0;
    const ara = list.reduce((s, o) => s + (o.tutar || 0), 0);
    // Tek-en-iyi kampanya: birden çok uygun kampanya varsa yalnız en yüksek indirimi sağlayan uygulanır (backend ile birebir).
    let best = 0;
    for (const k of aktifKampanyalar as any[]) {
      let kInd = 0;
      if (k.tip === 'sepet_tutar') {
        if ((k.minTutar || 0) > 0 && ara >= (k.minTutar || 0)) kInd = k.indirimTip === 'yuzde' ? ara * k.indirimDeger / 100 : k.indirimDeger;
      } else if (k.tip === 'urun_adet') {
        const scoped = list.filter((o) => kampInScope(k, o));
        const tutar = scoped.reduce((s, o) => s + (o.tutar || 0), 0);
        const adetTop = scoped.reduce((s, o) => s + (o.adet || 1), 0);
        if (adetTop >= (k.minAdet || 1) && adetTop > 0) kInd = k.indirimTip === 'yuzde' ? tutar * k.indirimDeger / 100 : k.indirimDeger;
      }
      kInd = Math.round(kInd * 100) / 100;
      if (kInd > best) best = kInd;
    }
    return Math.min(best, ara);
  };
  // Tek bir onaylı satıra düşen kampanya indirim payı (Tutar sütununda indirimli fiyat için)
  const satirIndirimi = (o: any) => {
    const k = kampanyaUygulanan(o);
    if (!k) return 0;
    if (k.indirimTip === 'yuzde') return Math.round((o.tutar || 0) * k.indirimDeger) / 100;
    const userScoped = orders.filter((x) => x.durum === 'onaylandi' && x.user === o.user && kampInScope(k, x));
    const toplam = userScoped.reduce((s, x) => s + (x.tutar || 0), 0);
    if (toplam <= 0) return 0;
    return Math.round(((o.tutar || 0) / toplam) * k.indirimDeger * 100) / 100;
  };

  const startStream = async () => { try { const r = await api.post('/store/live/start', {}); setStream(r.data); setOrders([]); setFbStatus((p) => ({ ...p, feed: [] })); setIgStatus((p) => ({ ...p, feed: [] })); toast.success('Yeni yayın başladı'); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const endStream = async () => {
    if (!confirm('Yayını sonlandırmak istiyor musunuz? Geçmiş yayınlara taşınacak.')) return;
    try { await api.post('/store/live/end', {}); setStream(null); setOrders([]); toast.success('Yayın sonlandırıldı'); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const openHistory = async () => { try { const r = await api.get('/store/live/history'); setHistory(r.data); setHistoryOpen(true); } catch (e) { toast.error(apiErrorMessage(e)); } };
  // Geçmiş yayını yayına devam etmeden salt-okunur görüntüle
  const openHistDetail = async (id: string) => {
    try { const r = await api.get(`/store/live/history/${id}`); setHistDetail(r.data); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  // Ekstreyi Excel ile indir (xlsx yalnızca tıklanınca yüklenir -> sayfa açılışı hızlı)
  const exportExcel = async (ozetData: any, ordersData: any[], streamData: any) => {
    try {
      const XLSX = await import('xlsx');
      const oz = ozetData || {};
      const baslik = streamData?.baslik || 'Canli Yayin';
      const tarih = streamData?.startedAt ? new Date(streamData.startedAt).toLocaleString('tr-TR') : '';
      const ozetRows = [
        { Alan: 'Yayın Başlığı', Değer: baslik },
        { Alan: 'Tarih', Değer: tarih },
        { Alan: 'Net Ciro', Değer: oz.ciro ?? '' },
        { Alan: 'Toplam İndirim', Değer: oz.indirim ?? '' },
        { Alan: 'Brüt Ciro', Değer: oz.brutCiro ?? '' },
        { Alan: 'Tahmini Kâr', Değer: oz.kar ?? '' },
        { Alan: 'Sipariş (sepet) Sayısı', Değer: oz.siparis ?? '' },
        { Alan: 'Aktif Satıcı', Değer: satici || '' },
      ];
      const detayRows = (ordersData || []).map((o) => ({
        Müşteri: o.user || '', Ürün: o.urun || '', Kod: o.kod || '', Beden: o.beden || o.variation || '',
        'Birim Tutar': o.tutar || 0, Durum: o.durum || '', Satıcı: o.saticiAd || '',
        Saat: o.createdAt ? new Date(o.createdAt).toLocaleString('tr-TR') : '',
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ozetRows), 'Özet');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detayRows), 'Detay');
      const safe = baslik.replace(/[^\w\sğüşıöçĞÜŞİÖÇ-]/g, '').trim() || 'yayin';
      XLSX.writeFile(wb, `ekstre-${safe}.xlsx`);
    } catch (e) { toast.error('Excel oluşturulamadı'); }
  };
  const resumeStream = async (id: string) => {
    if (stream && !confirm('Aktif yayın bu yayınla değiştirilecek. Devam edilsin mi?')) return;
    try {
      const r = await api.post(`/store/live/resume/${id}`, {});
      setStream(r.data.stream); setOrders(r.data.orders || []); setHistoryOpen(false);
      toast.success('Yayına kaldığı yerden devam ediliyor');
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const findByCode = (code: string) => {
    const c = codeKey(code); if (!c) return undefined;
    // 1) Birebir eşleşme (satış kodu / barkod) — büyük/küçük harf duyarsız
    let p = allProds.find((pp) => codeKey(pp.salesCode || '') === c || codeKey(pp.barkod || '') === c);
    if (p) return p;
    // 2) Tek harf hatası toleransı (ör. "hila1" → "hilal") — yalnız 3+ karakterli kodlarda
    if (c.length >= 3) {
      let best: any; let bestDist = 2;
      for (const pp of allProds) {
        for (const key of [codeKey(pp.salesCode || ''), codeKey(pp.barkod || '')]) {
          if (key.length >= 3 && Math.abs(key.length - c.length) <= 1) {
            const d = lev(key, c);
            if (d < bestDist) { bestDist = d; best = pp; }
          }
        }
      }
      if (best && bestDist <= 1) return best;
    }
    return undefined;
  };

  // Kayıt kontrolü için O(1) indeks: müşteri listesi (binlerce kayıt) değişince BİR KEZ kurulur.
  // Önceden her satır/render'da customers.some(...) ile 9000+ kayıt lineer taranıyordu (ana ağırlık nedeni).
  const regIndex = useMemo(() => {
    const names = new Set<string>();
    const tels = new Set<string>();
    for (const c of customers) {
      const n = norm(c.ad || ''); if (n) names.add(n);
      const ig = norm(c.instagram || ''); if (ig) names.add(ig);
      const tel = (c.telefon || '').replace(/\D/g, ''); if (tel.length >= 7) tels.add(tel);
    }
    return { names, tels };
  }, [customers]);
  const isRegistered = (u: string) => {
    const n = norm(u); const tel = (u || '').replace(/\D/g, '');
    if (n && regIndex.names.has(n)) return true;
    if (tel.length >= 7 && regIndex.tels.has(tel)) return true;
    return false;
  };
  const activeFlash = (productId?: string) => { if (!productId) return 0; const f = flash[productId]; return f && f.exp > Date.now() ? f.price : 0; };
  // Bir ürün için geçerli birim fiyat override'ı: önce süreli indirim, yoksa çift-tıkla girilen manuel fiyat
  const effFiyat = (productId?: string) => { if (!productId) return 0; const fl = activeFlash(productId); if (fl > 0) return fl; const ov = priceOverride[productId]; return ov > 0 ? ov : 0; };

  const addSeller = () => {
    const name = (satici || '').trim();
    if (!name) { toast.error('Satıcı adı girin'); return; }
    if (!sellers.includes(name)) { const next = [...sellers, name]; setSellers(next); localStorage.setItem('cy_sellers', JSON.stringify(next)); }
    toast.success(`Satıcı: ${name}`);
  };
  const removeSeller = (s: string) => { const next = sellers.filter((x) => x !== s); setSellers(next); try { localStorage.setItem('cy_sellers', JSON.stringify(next)); } catch { /* */ } if (satici === s) setSatici(''); toast.success(`Satıcı listeden çıkarıldı: ${s}`); };

  // Şans çarkı: IG + FB yorumlarındaki benzersiz kullanıcılardan, isimler hızla değişerek rastgele talihli seçilir
  const spinCark = () => {
    const names = Array.from(new Set([...(igStatus.feed || []), ...(fbStatus.feed || [])].map((c: any) => String(c.name || '').trim()).filter(Boolean)));
    if (names.length < 2) { toast.error('Çark için en az 2 farklı yorumcu gerekli'); return; }
    setCark({ open: true, spinning: true, current: names[0], winner: null, registered: false });
    const winner = names[Math.floor(Math.random() * names.length)];
    const maxCount = 30 + Math.floor(Math.random() * 12);
    let count = 0; let delay = 55;
    const step = () => {
      count++;
      const cur = count >= maxCount ? winner : names[Math.floor(Math.random() * names.length)];
      if (count >= maxCount) { setCark({ open: true, spinning: false, current: winner, winner, registered: isRegistered(winner) }); return; }
      setCark((p) => ({ ...p, current: cur }));
      if (count > maxCount * 0.55) delay += 22; // sona doğru yavaşla (heyecan)
      setTimeout(step, delay);
    };
    setTimeout(step, delay);
  };
  const closeCark = () => setCark({ open: false, spinning: false, current: '', winner: null, registered: false });

  // "A12", "M A12", "A12 M" gibi girişten ürün + beden çöz (sıra önemli değil)
  const resolveCodeBeden = (raw: string): { product?: any; beden?: string; code: string } => {
    const toks = String(raw || '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return { code: '' };
    // 1) Klasik: bir token kod, başka bir token beden (büyük/küçük harf + 2XL/XXL eşanlamı duyarsız)
    for (let i = 0; i < toks.length; i++) {
      const p = findByCode(toks[i]);
      if (p) {
        let beden: string | undefined;
        if ((p.variations || []).length) {
          for (let j = 0; j < toks.length; j++) {
            if (j === i) continue;
            const v = (p.variations || []).find((x: any) => sizeKey(x.deger) === sizeKey(toks[j]));
            if (v) { beden = v.deger; break; }
          }
        }
        return { product: p, beden, code: toks[i] };
      }
    }
    // 2) Bitişik kod+beden (ör. "SK1024XL", "hilal2xl"): tokeni ürün koduyla önek eşle, kalanı beden çöz
    for (const tok of toks) {
      const tk = codeKey(tok);
      if (tk.length < 3) continue;
      for (const p of allProds) {
        for (const key of [codeKey(p.salesCode || ''), codeKey(p.barkod || '')]) {
          if (key && key.length >= 2 && tk.startsWith(key) && tk.length > key.length) {
            const rest = tk.slice(key.length);
            const v = (p.variations || []).find((x: any) => sizeKey(x.deger) === sizeKey(rest));
            if (v) return { product: p, beden: v.deger, code: key };
          }
        }
      }
    }
    return { code: toks[0] };
  };

  // Yorumu doğrudan siparişe çevir; çözülemezse düzeltme modalı aç. "İşlendi" rozeti + toast gösterir.
  const islaComment = async (c: any) => {
    if (!stream) { toast.error('Önce "Yeni Yayın" başlatın'); return; }
    const user = String(c.name || '').trim() || 'kullanici';
    const raw = String(c.message || '').trim();
    const { product, beden, code } = resolveCodeBeden(raw);
    if (product && (!(product.variations || []).length || beden)) {
      try {
        await api.post('/store/live/order', { streamId: stream.id, user, kod: code, beden: beden || '', productId: product._drop ? undefined : product.id, freeProductId: product._drop ? product.id : undefined, variation: beden, urun: product.ad || code, saticiAd: satici || null, fiyatOverride: effFiyat(product.id) });
        setIslenenIds((m) => ({ ...m, [String(c.id)]: true }));
        await loadActive(); bgReload();
        toast.success(`✓ İşlendi: ${user} · ${product.ad}${beden ? ' · ' + beden : ''}`);
      } catch (e) { toast.error(apiErrorMessage(e)); }
    } else {
      // Çözülemedi → kullanıcı kodu/bedeni düzeltsin
      setDuzeltModal({ commentId: String(c.id), user, kod: code || raw, beden: beden || '', raw, urun: product?.ad || '' });
    }
  };

  // Düzeltme modalından siparişi işle
  const islaDuzelt = async () => {
    const d = duzeltModal; if (!d) return;
    if (!stream) { toast.error('Yayın kapalı'); return; }
    const combined = `${d.kod} ${d.beden}`.trim();
    const { product, beden, code } = resolveCodeBeden(combined);
    setBusy(true);
    try {
      if (product && (!(product.variations || []).length || beden)) {
        await api.post('/store/live/order', { streamId: stream.id, user: d.user, kod: code, beden: beden || d.beden || '', productId: product._drop ? undefined : product.id, freeProductId: product._drop ? product.id : undefined, variation: beden || d.beden, urun: product.ad, saticiAd: satici || null, fiyatOverride: effFiyat(product.id) });
      } else {
        // Yerelde çözülemedi → ham kodu backend taze DB'den çözsün
        await api.post('/store/live/order', { streamId: stream.id, user: d.user, kod: combined, saticiAd: satici || null });
      }
      setIslenenIds((m) => ({ ...m, [d.commentId]: true }));
      setDuzeltModal(null);
      await loadActive(); bgReload();
      toast.success(`✓ İşlendi: ${d.user}`);
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setBusy(false);
  };


  const openProduct = (p: any, preBeden?: string) => {
    const dp = defIndirimPrice(Number(p.satisFiyat) || 0);
    setBarkodModal({ ...p, _preBeden: preBeden || null }); setDiscForm({ price: dp > 0 ? String(dp) : '', dakika: '7' }); setEditPrice(false);
    setBarHistory((h) => [{ id: Date.now(), productId: p.id, ad: p.ad, kod: p.salesCode || '-', barkod: p.barkod || '-', stok: p.stokAdeti || 0, img: (p.images || [])[0] || '', satisFiyat: p.satisFiyat || 0, eskiFiyat: p.eskiFiyat || 0, drop: !!p._drop, vars: (p.variations || []).map((v: any) => ({ deger: v.deger, stok: v.stok })), time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }, ...h.filter((x) => x.productId !== p.id)].slice(0, 30));
    // Hem normal hem drop (tedarikçi) ürünleri katalogda gösterilir; backend katalog endpoint'i her iki tabloyu çözer
    api.post('/store/catalog/add', { productId: p.id }).catch(() => {});
  };
  // Geçmiş modalı sürükle/boyutlandır (drag header + resize köşesi)
  const startHistDrag = (e: any) => { const sx = e.clientX; const sy = e.clientY; const ox = histPos.x; const oy = histPos.y; const move = (ev: any) => setHistPos({ x: ox + ev.clientX - sx, y: oy + ev.clientY - sy }); const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); };
  const startHistResize = (e: any) => { e.stopPropagation(); const sx = e.clientX; const sy = e.clientY; const ow = histSize.w; const oh = histSize.h; const move = (ev: any) => setHistSize({ w: Math.max(360, ow + ev.clientX - sx), h: Math.max(320, oh + ev.clientY - sy) }); const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); };
  const startFeedDrag = (e: any) => { if (feedWin.pinned) return; const sx = e.clientX; const sy = e.clientY; const ox = feedPos.x; const oy = feedPos.y; const move = (ev: any) => setFeedPos({ x: ox + ev.clientX - sx, y: oy + ev.clientY - sy }); const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); };
  const startFeedResize = (e: any) => { if (feedWin.pinned) return; e.stopPropagation(); const sx = e.clientX; const sy = e.clientY; const ow = feedSize.w; const oh = feedSize.h; const move = (ev: any) => setFeedSize({ w: Math.max(280, ow + ev.clientX - sx), h: Math.max(260, oh + ev.clientY - sy) }); const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }; document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); };
  const openByCode = (code: string) => {
    const { product, beden } = resolveCodeBeden(code);
    if (!product) { toast.error('Ürün bulunamadı: ' + code); return; }
    openProduct(product, beden);
  };
  // Ürün ara (ad / satış kodu / marka / beden / cinsiyet)
  // Arama metni (haystack) ürün listesi değişince BİR KEZ hesaplanır; her tuş vuruşunda yeniden kurulmaz.
  const prodIndex = useMemo(() => allProds.map((p: any) => ({
    p,
    hay: [p.ad, p.salesCode, p.barkod, p.marka, p.cinsiyet, ...(p.variations || []).map((v: any) => v.deger)]
      .map((x: any) => norm(String(x || ''))).join(' '),
  })), [allProds]);
  const araSonuc = useMemo(() => {
    const q = norm(araQ); if (!q) return [];
    const out: any[] = [];
    for (const it of prodIndex) {
      if (it.hay.includes(q)) { out.push(it.p); if (out.length >= 30) break; }
    }
    return out;
  }, [araQ, prodIndex]);

  // Global barkod dinleyici: alan tıklamadan/Enter beklemeden okutulan barkodu yakalar (hızlı tuş + Enter)
  useEffect(() => {
    let buf = ''; let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const editable = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (editable) return; // bir alana yazılıyorsa karışma (o alan kendi yönetir)
      const t = Date.now();
      if (t - last > 120) buf = '';
      last = t;
      if (e.key === 'Enter') { if (buf.length >= 4) { openByCode(buf); } buf = ''; return; }
      if (e.key.length === 1 && /[A-Za-z0-9._\-]/.test(e.key)) buf += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allProds]);

  // Kâr marjı uyarısı: maliyeti (alisFiyat) bilinen üründe satış fiyatı marjı %30 altına düşerse uyar.
  // Maliyeti olmayan (drop) ürünlerde uyarı atlanır. true dönerse marj düşük demektir.
  const MARJ_ESIK = 30;
  const marjUyari = (ad: string, price: number, maliyet: number): boolean => {
    if (!(maliyet > 0) || !(price > 0)) return false;
    const marj = ((price - maliyet) / price) * 100;
    if (marj < MARJ_ESIK) { toast(`Düşük kâr marjı — ${ad}: %${marj.toFixed(0)} (maliyet ${fmt(maliyet)}, fiyat ${fmt(price)})`, { duration: 5000, style: { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' } }); return true; }
    return false;
  };
  const setFlashDiscount = () => {
    if (!barkodModal) return;
    const price = Number(discForm.price); const dk = Number(discForm.dakika);
    if (!(price > 0) || !(dk > 0)) { toast.error('Geçerli fiyat ve süre girin'); return; }
    marjUyari(barkodModal.ad, price, Number(barkodModal.alisFiyat) || 0);
    const exp = Date.now() + dk * 60000;
    setFlash((f) => ({ ...f, [barkodModal.id]: { price, exp } }));
    // Flash indirim her zaman katalog item'a yazılır (katalog sürekli açık); katalog linkinde geri sayım görünür
    api.post('/store/catalog/add', { productId: barkodModal.id, flashFiyat: price, flashBitis: new Date(exp).toISOString() }).catch(() => {});
    toast.success(`${barkodModal.ad}: ${dk} dk boyunca ${price}₺ indirimli`);
    // Ürün detayı/kartı açık kalır (kullanıcı talebi); modal kapatılmaz
  };
  // Çift-tıkla girilen manuel birim fiyatı uygula: bu yayında bu üründen oluşan siparişlerde fiyatı ezer.
  const saveCardPrice = () => {
    if (!barkodModal) return;
    const v = Number(priceDraft);
    if (!(v > 0)) { setEditPrice(false); return; }
    marjUyari(barkodModal.ad, v, Number(barkodModal.alisFiyat) || 0);
    setPriceOverride((m) => ({ ...m, [barkodModal.id]: v }));
    setBarkodModal((b: any) => (b ? { ...b, satisFiyat: v } : b));
    setEditPrice(false);
    toast.success(`${barkodModal.ad} birim fiyatı ${fmt(v)} olarak ayarlandı (bu yayın)`);
  };

  const parse = async () => {
    if (!stream) { toast.error('Önce "Yeni Yayın" başlatın'); return; }
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('Yorum girilmedi'); return; }
    setBusy(true);
    let islenen = 0; let atlanan = 0;
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const user = parts[0] || 'kullanici';
      const rest = parts.slice(1).join(' ');
      if (!rest.trim()) { atlanan++; continue; }
      const { product: p, beden, code } = resolveCodeBeden(rest);
      try {
        if (p && (!(p.variations || []).length || beden)) {
          // Yerel listede çözüldü — hızlı yol (productId ile)
          await api.post('/store/live/order', { streamId: stream.id, user, kod: code, beden: beden || '', productId: p._drop ? undefined : p.id, freeProductId: p._drop ? p.id : undefined, variation: beden, urun: p.ad || code, saticiAd: satici || null, fiyatOverride: effFiyat(p.id) });
        } else {
          // Yerel liste bayat olabilir → ham kodu backend taze DB'den çözsün (kod + beden)
          await api.post('/store/live/order', { streamId: stream.id, user, kod: rest, saticiAd: satici || null });
        }
        islenen++;
      } catch { atlanan++; }
    }
    setText(''); setBusy(false);
    await loadActive(); loadFree(); reload();
    if (islenen === 0) { toast.error('Satışa uygun ürün bulunamadı — geçerli kod girin'); return; }
    toast.success(`${islenen} sipariş işlendi${atlanan ? ` · ${atlanan} satır atlandı (geçersiz)` : ''}`);
  };

  const iptalEt = (o: any) => {
    if (o.durum === 'iptal') return;
    setIptalAday(o);
  };
  const confirmIptal = async () => {
    const o = iptalAday; if (!o) return;
    setIptalAday(null);
    try { const r = await api.post(`/store/live/order/${o.id}/iptal`); setOrders(r.data.orders || []); loadFree(); reload(); toast.success('Sipariş iptal edildi'); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // "Kayıt Gerekli" sekmesi işlemleri
  const [kayitBusy, setKayitBusy] = useState(false);
  // Kaydı oluşturulmuş (sistemde müşteri handle'ı eşleşen) rezerve siparişleri işle:
  // stok yeterliyse onaylandı + sepete bağla, yetersizse stok_yok; eşleşmeyen handle'lar rezerve kalır.
  const kayitKontrolEtIsle = async () => {
    setKayitBusy(true);
    try {
      const r = await api.post('/store/live/reconcile-reserved');
      await loadActive(); reload();
      const n = r.data?.islenen ?? 0;
      toast.success(n > 0 ? `${n} kayıtlı müşterinin rezerve siparişi işlendi` : 'İşlenecek kayıtlı müşteri bulunamadı');
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setKayitBusy(false); }
  };
  // Kayıt Gerekli sekmesindeki TÜM rezerve siparişleri iptal et (onaylı).
  const tumRezerveIptal = async () => {
    const n = orders.filter((o) => o.durum === 'rezerve').length;
    if (n === 0) return;
    if (!confirm(`Kayıt gerektiren ${n} rezerve sipariş iptal edilecek ve stoklar iade edilecek. Emin misiniz?`)) return;
    setKayitBusy(true);
    try {
      const r = await api.post('/store/live/cancel-reserved');
      setOrders(r.data.orders || []); loadFree(); reload();
      toast.success(`${r.data?.iptalEdilen ?? 0} rezerve sipariş iptal edildi`);
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setKayitBusy(false); }
  };

  // İstatistikler (onaylanan = ciro; iptal haric).
  // Net Ciro = Brüt (liste fiyatı) − (kampanya + süreli indirim). Tahmini Kâr = Net Ciro − ürün bedeli (alış).
  const stats = useMemo(() => {
    const ona = orders.filter((o) => o.durum === 'onaylandi');
    // Brüt: indirimsiz liste fiyatı toplamı (listeFiyat yoksa fiili tutara düşer)
    const brutCiro = Math.round(ona.reduce((s, o) => s + (Number(o.listeFiyat ?? o.tutar) || 0), 0) * 100) / 100;
    // Süreli (flash/manuel) indirim: liste ile fiili fiyat farkı
    const flashIndirim = Math.round(ona.reduce((s, o) => s + Math.max(0, (Number(o.listeFiyat ?? o.tutar) || 0) - (o.tutar || 0)), 0) * 100) / 100;
    const maliyet = ona.reduce((s, o) => s + (o.alis || 0), 0);
    // Müşteri bazında kampanya indirimi + kampanyadan yararlanan kişi sayısı
    const byUser: Record<string, any[]> = {};
    ona.forEach((o) => { (byUser[o.user] = byUser[o.user] || []).push(o); });
    let kampanyaIndirimi = 0; let kampanyaYararlanan = 0;
    for (const u in byUser) { const d = kampIndirimiHesapla(byUser[u]); if (d > 0) { kampanyaIndirimi += d; kampanyaYararlanan++; } }
    kampanyaIndirimi = Math.round(kampanyaIndirimi * 100) / 100;
    const indirimToplam = Math.round((kampanyaIndirimi + flashIndirim) * 100) / 100;
    const ciro = Math.max(0, Math.round((brutCiro - indirimToplam) * 100) / 100); // NET ciro
    const kar = Math.round((ciro - maliyet) * 100) / 100;
    return {
      brutCiro, kampanyaIndirimi, flashIndirim, indirimToplam, kampanyaYararlanan,
      ciro, kar, toplam: orders.length,
      onaylandi: ona.length,
      stokYok: orders.filter((o) => o.durum === 'stok_yok').length,
      riskli: orders.filter((o) => o.durum === 'riskli').length,
      // "Kayıt Gerekli" = müşteri kaydı bekleyen (rezerve) siparişler. Kayıt yapılınca backend
      // bunları promoteReserved ile 'onaylandi'ya çevirir; loadActive tazeleyince listeden düşer.
      // (Eski client-side isRegistered(o.user) string eşleşmesi kırılgandı: handle/instagram
      // ufak farkta eşleşmeyip kayıt yapılsa bile listede kalıyordu.)
      kayitGerekli: orders.filter((o) => o.durum === 'rezerve').length,
      iptal: orders.filter((o) => o.durum === 'iptal').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, aktifKampanyalar, products, customers]);

  const series = useMemo(() => {
    const ona = [...orders].filter((o) => o.durum === 'onaylandi').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let c = 0; let k = 0; const labels: string[] = []; const ciroArr: number[] = []; const karArr: number[] = [];
    ona.forEach((o) => { c += o.tutar; k += (o.tutar - o.alis); labels.push(hhmm(o.createdAt)); ciroArr.push(c); karArr.push(Math.round(k)); });
    return { labels, ciroArr, karArr };
  }, [orders]);

  const enCokUrun = useMemo(() => {
    const m: Record<string, number> = {};
    orders.filter((o) => o.durum === 'onaylandi').forEach((o) => { m[o.urun] = (m[o.urun] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [orders]);

  const enCokMusteri = useMemo(() => {
    const m: Record<string, { adet: number; ciro: number }> = {};
    orders.filter((o) => o.durum === 'onaylandi').forEach((o) => { const e = m[o.user] || { adet: 0, ciro: 0 }; e.adet++; e.ciro += o.tutar; m[o.user] = e; });
    return Object.entries(m).sort((a, b) => b[1].ciro - a[1].ciro).slice(0, 5);
  }, [orders]);

  const saticiPerf = useMemo(() => {
    const m: Record<string, { adet: number; ciro: number }> = {};
    orders.filter((o) => o.durum === 'onaylandi').forEach((o) => { const k = o.saticiAd || '(belirsiz)'; const e = m[k] || { adet: 0, ciro: 0 }; e.adet++; e.ciro += o.tutar; m[k] = e; });
    return Object.entries(m).sort((a, b) => b[1].ciro - a[1].ciro);
  }, [orders]);

  // Bu yayından alışveriş yapan tekil kişi sayısı (onaylanmış)
  const alisverisYapan = useMemo(() => new Set(orders.filter((o) => o.durum === 'onaylandi').map((o) => o.user)).size, [orders]);
  // Bu yayında satılan ürünlerin önceki satış birim fiyatı (tekrar okutunca rozetle gösterilir)
  const prevSaleMap = useMemo(() => {
    const m: Record<string, { fiyat: number; adet: number }> = {};
    for (const o of orders) {
      if (o.durum !== 'onaylandi' || !o.productId) continue;
      const birim = (o.adet ? o.tutar / o.adet : o.tutar) || 0;
      const e = m[o.productId] || { fiyat: 0, adet: 0 };
      m[o.productId] = { fiyat: birim, adet: e.adet + (o.adet || 1) };
    }
    return m;
  }, [orders]);

  // Kâr oranı en yüksek ürünler (satış-alış marjı)
  const enKarliUrunler = useMemo(() => (products || [])
    .filter((p: any) => (p.satisFiyat || 0) > 0 && (p.alisFiyat || 0) > 0 && p.satisFiyat > p.alisFiyat)
    .map((p: any) => ({ ad: p.ad, oran: ((p.satisFiyat - p.alisFiyat) / p.satisFiyat) * 100, kar: p.satisFiyat - p.alisFiyat, stok: p.stokAdeti }))
    .sort((a, b) => b.oran - a.oran)
    .slice(0, 6), [products]);

  // Yapay zeka analizi — yayın temposu (zaman bazlı ortalama), yeni alıcı öngörüsü, stok eritme, projeksiyon
  // (aiTick 30 sn'de bir artar; satış dursa da analiz tazelenir)
  const aiAnaliz = useMemo(() => {
    const tips: { t: 'warn' | 'tip' | 'good'; m: string }[] = [];
    const ona = [...orders].filter((o) => o.durum === 'onaylandi').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const now = Date.now();
    const ms = (d: any) => new Date(d).getTime();
    const startMs = stream?.startedAt ? ms(stream.startedAt) : (ona[0] ? ms(ona[0].createdAt) : now);
    const elapsedMin = Math.max(1, (now - startMs) / 60000);
    const total = ona.length;
    const avgPerMin = total / elapsedMin;
    const last5 = ona.filter((o) => now - ms(o.createdAt) < 300000).length;
    const prev5 = ona.filter((o) => { const d = now - ms(o.createdAt); return d >= 300000 && d < 600000; }).length;
    const last5Rate = last5 / 5;
    const ortSepet = alisverisYapan ? stats.ciro / alisverisYapan : 0;
    const iptal = orders.filter((o) => o.durum === 'iptal').length;
    const iptalOran = orders.length ? Math.round((iptal / orders.length) * 100) : 0;

    // Tempo durumu (etiket) — kademeli: hiç boş kalmaz, yayının her anında anlamlı durum gösterir
    let tempoLabel = 'Hazır'; let tempoColor: 'warn' | 'tip' | 'good' = 'tip';
    if (total === 0) {
      // Henüz satış yok: ilk dakikalarda "Başladı", uzadıkça "Durgun"
      if (elapsedMin < 3) { tempoLabel = 'Başladı'; tempoColor = 'tip'; }
      else { tempoLabel = 'Durgun'; tempoColor = 'warn'; }
    } else if (total < 3 || elapsedMin < 6) {
      // Satış var ama analiz için erken — boş bırakma, "Isınıyor" göster
      tempoLabel = last5 > 0 ? 'Isınıyor' : 'Yavaş'; tempoColor = last5 > 0 ? 'good' : 'tip';
    } else {
      if (last5 === 0) { tempoLabel = 'Durgun'; tempoColor = 'warn'; }
      else if (last5Rate < avgPerMin * 0.6) { tempoLabel = 'Yavaşlıyor'; tempoColor = 'warn'; }
      else if (last5Rate > avgPerMin * 1.4) { tempoLabel = 'Hızlanıyor'; tempoColor = 'good'; }
      else { tempoLabel = 'Dengeli'; tempoColor = 'tip'; }
    }

    // ── Tempo tavsiyesi (yayın başından bu yana ortalamaya göre) ──
    if (total === 0 && elapsedMin >= 4) {
      tips.push({ t: 'warn', m: `${Math.round(elapsedMin)} dk oldu, henüz satış yok. Açılış indirimi yap, en dikkat çeken ürünü öne al ve kampanyaları duyur.` });
    } else if (total >= 1 && (total < 3 || elapsedMin < 6)) {
      tips.push({ t: 'tip', m: `İlk ${total} satış geldi (~${avgPerMin.toFixed(1)}/dk). Momentumu büyütmek için en çok ilgi gören ürünü öne çıkar; birkaç satış daha gelince tempo analizi netleşir.` });
    } else if (elapsedMin >= 6 && total >= 3) {
      if (last5 === 0) tips.push({ t: 'warn', m: `Son 5 dk'da hiç satış yok (yayın ort. ${avgPerMin.toFixed(1)}/dk). Hemen kısa süreli flaş indirim başlat ya da yeni ürün çıkar — tempoyu canlandır.` });
      else if (last5Rate < avgPerMin * 0.6) tips.push({ t: 'warn', m: `Satış yavaşladı: son 5 dk ${last5Rate.toFixed(1)}/dk, yayın ort. ${avgPerMin.toFixed(1)}/dk. İndirim/kampanya zamanı; ilgi düşmeden hamle yap.` });
      else if (last5Rate > avgPerMin * 1.4) tips.push({ t: 'good', m: `Tempo hızlandı: son 5 dk ${last5Rate.toFixed(1)}/dk (ort. ${avgPerMin.toFixed(1)}/dk). Talep yüksek — acele indirim yapma, stoklu çok satanı öne çıkarıp eritmeye odaklan.` });
      else if (prev5 > 0 && last5 > prev5) tips.push({ t: 'good', m: `İvme yükseliyor (önceki 5 dk ${prev5} → son 5 dk ${last5}). İlgi gören ürünü tekrar göster, momentumu büyüt.` });
      else tips.push({ t: 'tip', m: `Tempo dengeli (~${avgPerMin.toFixed(1)}/dk). Sepeti büyütmek için kombin / "2 al 1 öde" öner.` });
    }

    // ── Yeni katılan alıcı öngörüsü ──
    const firstByUser = new Map<string, number>();
    ona.forEach((o) => { const t = ms(o.createdAt); if (!firstByUser.has(o.user) || t < firstByUser.get(o.user)!) firstByUser.set(o.user, t); });
    const yeniSon10 = [...firstByUser.values()].filter((t) => now - t < 600000).length;
    const yeniOnceki10 = [...firstByUser.values()].filter((t) => { const d = now - t; return d >= 600000 && d < 1200000; }).length;
    if (firstByUser.size >= 2) {
      if (yeniSon10 === 0 && elapsedMin >= 12) tips.push({ t: 'warn', m: `Son 10 dk'da yeni alıcı katılmadı; hep aynı kişiler alıyor. Yeni kitleyi çekmek için "ilk siparişe özel" teklif duyur ve "üye ol" linkini paylaş.` });
      else if (yeniSon10 > yeniOnceki10 && yeniSon10 >= 2) tips.push({ t: 'good', m: `Yeni alıcı akışı artıyor (son 10 dk ${yeniSon10} yeni kişi, önceki 10 dk ${yeniOnceki10}). Yeni kitle sıcak — çok satanı stok varken öne çıkar.` });
      else if (yeniSon10 > 0) tips.push({ t: 'tip', m: `Son 10 dk'da ${yeniSon10} yeni kişi ilk alışverişini yaptı. Onları elde tutmak için hızlı kazanımlı küçük bir kampanya göster.` });
    }

    // ── Stok eritme / tekleme önleme ──
    const satilan = new Map<string, number>();
    ona.forEach((o) => { if (o.productId) satilan.set(o.productId, (satilan.get(o.productId) || 0) + (o.adet || 1)); });
    const azKalan = products.filter((p: any) => satilan.has(p.id) && typeof p.stokAdeti === 'number' && p.stokAdeti > 0 && p.stokAdeti <= 3).sort((a: any, b: any) => a.stokAdeti - b.stokAdeti);
    if (azKalan.length) {
      const p = azKalan[0];
      tips.push({ t: 'warn', m: `"${p.ad}" son ${p.stokAdeti} adet kaldı — tekleme bırakma. "Son ${p.stokAdeti}!" baskısı ya da küçük indirimle temiz bitir.` });
    }
    // momentumu olup stoğu bol olan ürün -> indirimle eritme fırsatı
    const cokSatanStoklu = products.filter((p: any) => (satilan.get(p.id) || 0) >= 2 && typeof p.stokAdeti === 'number' && p.stokAdeti >= 10);
    if (cokSatanStoklu.length && (last5Rate < avgPerMin * 0.9)) {
      const p = cokSatanStoklu.sort((a: any, b: any) => (satilan.get(b.id) || 0) - (satilan.get(a.id) || 0))[0];
      tips.push({ t: 'tip', m: `"${p.ad}" ilgi görüyor ve stoğu bol (${p.stokAdeti}). Tempo düşmüşken bu üründe kısa indirim açıp stoğu erit.` });
    }

    // ── Projeksiyon ──
    if (elapsedMin >= 8 && avgPerMin > 0) {
      const proj30 = Math.round(avgPerMin * 30);
      tips.push({ t: 'tip', m: `Bu tempoyla önümüzdeki 30 dk'da ~${proj30} sipariş ve ~${fmt(avgPerMin * 30 * (ortSepet || 0))} ciro öngörülüyor.` });
    }

    // ── Kârlılık uyarısı (marj düşüyor mu?) ──
    const karli = ona.filter((o) => typeof o.alis === 'number' && o.tutar > 0);
    let marjGenel = 0;
    if (karli.length >= 1) {
      const cTop = karli.reduce((s, o) => s + o.tutar, 0);
      const kTop = karli.reduce((s, o) => s + (o.tutar - o.alis), 0);
      marjGenel = cTop > 0 ? (kTop / cTop) * 100 : 0;
    }
    if (karli.length >= 6) {
      const half = Math.floor(karli.length / 2);
      const marj = (arr: any[]) => { const c = arr.reduce((s, o) => s + o.tutar, 0); const k = arr.reduce((s, o) => s + (o.tutar - o.alis), 0); return c > 0 ? (k / c) * 100 : 0; };
      const ilkMarj = marj(karli.slice(0, half));
      const sonMarj = marj(karli.slice(half));
      if (sonMarj < ilkMarj - 8) tips.push({ t: 'warn', m: `Kârlılık düşüyor: kâr marjı %${ilkMarj.toFixed(0)} → %${sonMarj.toFixed(0)}. Düşük kârlı ürünler ağır basıyor; yüksek marjlı ürünleri öne çıkar.` });
    }

    // ── İptal uyarısı ──
    if (iptalOran >= 25) tips.push({ t: 'warn', m: `İptal oranı yüksek (%${iptalOran}). Riskli/kayıtsız alıcılardan ön ödeme iste; sahte sipariş riskine dikkat.` });

    if (!tips.length) tips.push({ t: 'tip', m: 'Yayına yeni başladın. İlk ürünü öne çıkar, "üye ol" linkini paylaş; ilk satışlardan sonra tempo analizi burada belirir.' });

    const metrik = {
      tempoLabel, tempoColor,
      last5Rate: last5Rate.toFixed(1),
      avgPerMin: avgPerMin.toFixed(1),
      yeniSon10,
      ortSepet,
      marjGenel,
      marjVar: karli.length >= 1,
      elapsedMin: Math.round(elapsedMin),
    };
    return { tips, metrik };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, products, stream, aiTick, alisverisYapan, stats, aktifKampanyalar]);
  const aiTavsiye = aiAnaliz.tips;

  // Satışa esas kategori oranı (kadın / erkek / çocuk) — onaylı siparişlerden adet bazlı
  const katOran = useMemo(() => {
    const catName = (id?: string) => (id ? (categories.find((c: any) => c.id === id)?.ad || '') : '');
    const classify = (n: string) => {
      const s = (n || '').toLocaleLowerCase('tr-TR');
      if (/(çocuk|cocuk|bebek|kids|junior|genç)/.test(s)) return 'cocuk';
      if (/(kadın|kadin|bayan|women|woman|kdn)/.test(s)) return 'kadin';
      if (/(erkek|bay|men|man)/.test(s)) return 'erkek';
      return 'diger';
    };
    const c: any = { kadin: 0, erkek: 0, cocuk: 0, diger: 0 };
    let toplam = 0;
    for (const o of orders) {
      if (o.durum !== 'onaylandi') continue;
      const p = o.productId ? prodById.get(o.productId) : (o.freeProductId ? freeProducts.find((x) => x.id === o.freeProductId) : null);
      if (!p) continue;
      const k = classify(catName(p.kategoriId) || p.ad || '');
      const ad = o.adet || 1;
      c[k] += ad; toplam += ad;
    }
    const pct = (n: number) => (toplam ? Math.round((n / toplam) * 100) : 0);
    return { toplam, kadinP: pct(c.kadin), erkekP: pct(c.erkek), cocukP: pct(c.cocuk), kadin: c.kadin, erkek: c.erkek, cocuk: c.cocuk };
  }, [orders, prodById, freeProducts, categories]);

  const saticilar = useMemo(() => Array.from(new Set([...sellers, ...orders.map((o) => o.saticiAd).filter(Boolean)])), [sellers, orders]);
  const filtered = useMemo(() => {
    let list = tab === 'tumu' ? orders
      : tab === 'kayit' ? orders.filter((o) => o.durum === 'rezerve')
      : orders.filter((o) => o.durum === tab);
    if (search.trim()) {
      const q = norm(search);
      list = list.filter((o) => [o.user, o.urun, o.kod, o.beden, o.saticiAd].some((f) => norm(f || '').includes(q)));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, tab, search, sellers, customers]);

  // Tablo sayfalama: tek seferde tüm siparişleri render etmek yerine sayfa sayfa göster (açılma hızı + akıcılık).
  const SAYFA = 50;
  const [gorunenSayi, setGorunenSayi] = useState(SAYFA);
  useEffect(() => { setGorunenSayi(SAYFA); }, [tab, search]);
  const sayfaliFiltered = useMemo(() => filtered.slice(0, gorunenSayi), [filtered, gorunenSayi]);

  // Üst-bar metrikleri: filtre/arama/sekme aktifken görünen (filtered) listeden hesaplanır; aksi halde global stats.
  const filtreAktif = tab !== 'tumu' || !!search.trim();
  const barStats = useMemo(() => {
    if (!filtreAktif) return stats;
    const ona = filtered.filter((o) => o.durum === 'onaylandi');
    // Brüt: indirimsiz liste fiyatı toplamı (Net Ciro + İndirim = Brüt denklemi tutsun diye)
    const brutCiro = Math.round(ona.reduce((s, o) => s + (Number(o.listeFiyat ?? o.tutar) || 0), 0) * 100) / 100;
    const maliyet = ona.reduce((s, o) => s + (o.alis || 0), 0);
    const byUser: Record<string, any[]> = {};
    ona.forEach((o) => { (byUser[o.user] = byUser[o.user] || []).push(o); });
    let ki = 0; let ky = 0;
    for (const u in byUser) { const d = kampIndirimiHesapla(byUser[u]); if (d > 0) { ki += d; ky++; } }
    ki = Math.round(ki * 100) / 100;
    // Süreli (flash/manuel) indirim: filtreli görünümde alt kümeden hesapla (global değeri sızdırma)
    const fi = Math.round(ona.reduce((s, o) => s + Math.max(0, (Number(o.listeFiyat ?? o.tutar) || 0) - (o.tutar || 0)), 0) * 100) / 100;
    const indirimToplam = Math.round((ki + fi) * 100) / 100;
    const ciro = Math.max(0, Math.round((brutCiro - indirimToplam) * 100) / 100); // NET ciro
    const kar = Math.round((ciro - maliyet) * 100) / 100;
    return { ...stats, brutCiro, kampanyaIndirimi: ki, kampanyaYararlanan: ky, flashIndirim: fi, indirimToplam, ciro, kar, onaylandi: ona.length, toplam: filtered.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtreAktif, filtered, stats]);
  const alisverisYapanBar = useMemo(() => (filtreAktif ? new Set(filtered.filter((o) => o.durum === 'onaylandi').map((o) => o.user)).size : alisverisYapan), [filtreAktif, filtered, alisverisYapan]);
  const mask = (v: any) => (hideNums ? '•••' : v);

  const Stat = ({ icon: Ic, label, value, color = 'text-slate-800', title }: any) => (
    <div className="flex items-center gap-1.5 px-2 shrink-0" title={title}>
      <Ic size={13} className="text-slate-400 shrink-0" />
      <div className="leading-none"><p className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</p><p className={`text-sm font-bold ${color} mt-0.5 tabular-nums`}>{value}</p></div>
    </div>
  );

  return (
    <div>
      {/* Ust bar — kompakt / minimalist */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-1.5 flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 shrink-0">
          <h1 className="text-sm font-bold text-slate-800">Canlı Yayın</h1>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${stream ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{stream ? 'CANLI' : 'KAPALI'}</span>
        </div>
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto border-l border-slate-100 pl-2">
          <LiveClock startedAt={stream?.startedAt} />
          <Stat icon={TrendingUp} label={filtreAktif ? 'Net Ciro (filtre)' : 'Net Ciro'} value={mask(fmt(barStats.ciro))} color="text-green-600" title={`Brüt: ${fmt(barStats.brutCiro)} − İndirim: ${fmt(barStats.indirimToplam || 0)} = Net Ciro`} />
          {(barStats.indirimToplam || 0) > 0 && <Stat icon={Tag} label="İndirim" value={mask('-' + fmt(barStats.indirimToplam))} color="text-amber-600" title={`Kampanya: ${fmt(barStats.kampanyaIndirimi || 0)} + Süreli: ${fmt(barStats.flashIndirim || 0)}`} />}
          <Stat icon={Wallet} label="Tahmini Kâr" value={mask(fmt(barStats.kar))} color="text-emerald-600" title="Net Ciro − ürün bedeli (alış)" />
          <Stat icon={ShoppingBag} label="Sipariş" value={mask(barStats.onaylandi)} />
          <Stat icon={ShoppingBag} label="Alışveriş Yapan" value={mask(String(alisverisYapanBar))} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setHideNums((v) => !v)} title={hideNums ? 'Rakamları göster' : 'Rakamları gizle'} className={`inline-flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium ${hideNums ? 'bg-slate-700 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{hideNums ? <EyeOff size={14} /> : <Eye size={14} />}<span className="hidden xl:inline">{hideNums ? 'Göster' : 'Gizle'}</span></button>
          <button onClick={openHistory} title="Geçmiş yayınlar" className="inline-flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"><History size={14} /><span className="hidden xl:inline">Geçmiş</span></button>
          <button onClick={() => setKampOpen(true)} title="Kampanyalar" className="inline-flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200"><Tag size={14} /><span className="hidden xl:inline">Kampanya</span></button>
          <button onClick={() => setReportOpen(true)} title="Raporlar" className="inline-flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200"><BarChart3 size={14} /><span className="hidden xl:inline">Rapor</span></button>
          {stream?.token && (
            <button onClick={() => { navigator.clipboard?.writeText(`${location.origin}/katalog/stream/${stream.token}`); toast.success('Yayın katalog linki kopyalandı'); }} title="Yayın katalog linkini kopyala" className="inline-flex items-center gap-1 px-2 h-8 rounded-lg text-xs font-medium bg-teal-100 text-teal-700 hover:bg-teal-200"><Share2 size={14} /><span className="hidden xl:inline">Link</span></button>
          )}
          {!stream ? (
            <button onClick={startStream} className="inline-flex items-center gap-1 bg-emerald-600 text-white px-2.5 h-8 rounded-lg text-xs font-medium hover:bg-emerald-700"><Radio size={14} /> Yeni Yayın</button>
          ) : (
            <button onClick={endStream} className="inline-flex items-center gap-1 bg-red-500 text-white px-2.5 h-8 rounded-lg text-xs font-medium hover:bg-red-600"><Square size={14} /> Durdur</button>
          )}
        </div>
      </div>

      {/* Aktif Satıcı + Canlı Metrikler — tek slim satır */}
      <div className="bg-white rounded-2xl border border-slate-200 px-3 py-1.5 flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shrink-0"><UserCircle size={15} className="text-emerald-600" /> Satıcı</span>
        <input value={satici} onChange={(e) => setSatici(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSeller(); }} placeholder="Satıcı adı" className="px-2.5 py-1 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300 w-28 shrink-0" />
        <button onClick={addSeller} title="Satıcı kaydet" className="bg-emerald-600 text-white px-2 py-1 rounded-lg hover:bg-emerald-700 shrink-0"><Plus size={14} /></button>
        <div className="flex gap-1.5 items-center shrink-0 max-w-[180px] overflow-x-auto">
          {sellers.map((s) => (<button key={s} onClick={() => setSatici(s)} onContextMenu={(e) => { e.preventDefault(); if (confirm(`"${s}" satıcısını listeden çıkar?`)) removeSeller(s); }} title="Tıkla: seç · Sağ tık: listeden çıkar" className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap ${satici === s ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s}</button>))}
        </div>
        {/* Canlı metrikler — kompakt tek satır, taşınca yatay kaydır */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto border-l border-slate-100 pl-2">
          <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 shrink-0 ${aiAnaliz.metrik.tempoColor === 'warn' ? 'bg-red-50 border-red-100' : aiAnaliz.metrik.tempoColor === 'good' ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'}`}>
            <span className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Tempo</span>
            <span className={`text-[12px] font-bold leading-none ${aiAnaliz.metrik.tempoColor === 'warn' ? 'text-red-600' : aiAnaliz.metrik.tempoColor === 'good' ? 'text-green-600' : 'text-slate-700'}`}>{aiAnaliz.metrik.tempoLabel}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border bg-white border-slate-100 px-2 py-1 shrink-0">
            <span className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Yeni Alıcı</span>
            <span className="text-[12px] font-bold text-emerald-600 leading-none">{aiAnaliz.metrik.yeniSon10}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border bg-white border-slate-100 px-2 py-1 shrink-0">
            <span className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Ort. Sepet</span>
            <span className="text-[12px] font-bold text-slate-700 leading-none tabular-nums">{mask(fmt(aiAnaliz.metrik.ortSepet))}</span>
          </div>
          <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 shrink-0 ${aiAnaliz.metrik.marjVar && aiAnaliz.metrik.marjGenel < 25 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
            <span className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Kâr Marjı</span>
            <span className={`text-[12px] font-bold leading-none ${aiAnaliz.metrik.marjVar && aiAnaliz.metrik.marjGenel < 25 ? 'text-red-600' : 'text-green-600'}`}>{aiAnaliz.metrik.marjVar ? `%${aiAnaliz.metrik.marjGenel.toFixed(0)}` : '-'}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border bg-white border-slate-100 px-2 py-1 shrink-0">
            <span className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Süre</span>
            <span className="text-[12px] font-bold text-slate-700 leading-none tabular-nums">{aiAnaliz.metrik.elapsedMin} dk</span>
          </div>
          {[
            { k: 'Kadın', p: katOran.kadinP, n: katOran.kadin, t: 'text-pink-600' },
            { k: 'Erkek', p: katOran.erkekP, n: katOran.erkek, t: 'text-sky-600' },
            { k: 'Çocuk', p: katOran.cocukP, n: katOran.cocuk, t: 'text-amber-600' },
          ].map((x) => (
            <div key={x.k} className="inline-flex items-center gap-1.5 rounded-lg border bg-white border-slate-100 px-2 py-1 shrink-0" title={`${x.n} adet`}>
              <span className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">{x.k}</span>
              <span className={`text-[12px] font-bold leading-none ${x.t}`}>%{x.p}</span>
            </div>
          ))}
        </div>
        {/* Yapay Zeka Asistanı — satırın en sağında, kompakt */}
        <div className="relative ml-auto shrink-0">
          <button onClick={() => setAiOpen((v) => !v)} title="Yapay Zeka önerileri" className={`relative inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${aiOpen ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
            <Brain size={14} /> Öneriler Al
            {aiTavsiye.some((a) => a.t === 'warn') && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />}
          </button>
          {aiOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAiOpen(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-[360px] max-w-[92vw] bg-white rounded-2xl shadow-xl border border-emerald-100 p-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-6 h-6 rounded-md bg-emerald-600 flex items-center justify-center shrink-0"><Brain size={14} className="text-white" /></div>
                  <h3 className="font-bold text-slate-800 text-[13px] leading-none">Yapay Zeka Asistanı</h3>
                  <span className="ml-auto text-[10px] text-emerald-500 inline-flex items-center gap-1"><Sparkles size={11} /> Canlı</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 mb-2.5">
                  <div className={`rounded-lg px-2 py-1.5 border text-center ${aiAnaliz.metrik.tempoColor === 'warn' ? 'bg-red-50 border-red-100' : aiAnaliz.metrik.tempoColor === 'good' ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'}`}>
                    <p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Tempo</p>
                    <p className={`text-[12px] font-bold leading-tight ${aiAnaliz.metrik.tempoColor === 'warn' ? 'text-red-600' : aiAnaliz.metrik.tempoColor === 'good' ? 'text-green-600' : 'text-slate-700'}`}>{aiAnaliz.metrik.tempoLabel}</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100 text-center">
                    <p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Yeni Alıcı</p>
                    <p className="text-[12px] font-bold text-emerald-600 leading-tight">{aiAnaliz.metrik.yeniSon10}</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100 text-center">
                    <p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Ort. Sepet</p>
                    <p className="text-[12px] font-bold text-slate-700 leading-tight">{fmt(aiAnaliz.metrik.ortSepet)}</p>
                  </div>
                  <div className={`rounded-lg px-2 py-1.5 border text-center ${aiAnaliz.metrik.marjVar && aiAnaliz.metrik.marjGenel < 25 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}>
                    <p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Kâr Marjı</p>
                    <p className={`text-[12px] font-bold leading-tight ${aiAnaliz.metrik.marjVar && aiAnaliz.metrik.marjGenel < 25 ? 'text-red-600' : 'text-green-600'}`}>{aiAnaliz.metrik.marjVar ? `%${aiAnaliz.metrik.marjGenel.toFixed(0)}` : '-'}</p>
                  </div>
                  <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100 text-center">
                    <p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Süre</p>
                    <p className="text-[12px] font-bold text-slate-700 leading-tight">{aiAnaliz.metrik.elapsedMin} dk</p>
                  </div>
                </div>
                <div className="space-y-1 mb-2.5">
                  {aiTavsiye.slice(0, 3).map((a, i) => {
                    const cfg = a.t === 'warn' ? { Ic: AlertTriangle, c: 'text-red-500', bg: 'bg-red-50' } : a.t === 'good' ? { Ic: TrendingUp, c: 'text-green-600', bg: 'bg-green-50' } : { Ic: Lightbulb, c: 'text-amber-500', bg: 'bg-amber-50' };
                    const Ic = cfg.Ic;
                    return <div key={i} className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 ${cfg.bg}`}><Ic size={13} className={`${cfg.c} shrink-0 mt-px`} /><span className="text-[11px] text-slate-700 leading-snug">{a.m}</span></div>;
                  })}
                  {aiTavsiye.length === 0 && <p className="text-[11px] text-slate-400 px-2 py-1.5">Henüz öneri yok.</p>}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-emerald-100">
                  <div>
                    <p className="text-[9px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1"><Package size={11} /> En Çok Satan</p>
                    <div className="space-y-0.5">
                      {enCokUrun.slice(0, 3).map(([ad, adet]: any, i: number) => <div key={i} className="flex items-center justify-between text-[10px]"><span className="text-slate-600 truncate pr-2">{i + 1}. {ad}</span><span className="font-semibold text-slate-700 shrink-0">{adet}</span></div>)}
                      {enCokUrun.length === 0 && <p className="text-[10px] text-slate-400">Henüz satış yok.</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1"><TrendingUp size={11} /> En Kârlı</p>
                    <div className="space-y-0.5">
                      {enKarliUrunler.slice(0, 3).map((p: any, i: number) => <div key={i} className="flex items-center justify-between text-[10px]"><span className="text-slate-600 truncate pr-2">{i + 1}. {p.ad}</span><span className="font-semibold text-green-600 shrink-0">%{p.oran.toFixed(0)}</span></div>)}
                      {enKarliUrunler.length === 0 && <p className="text-[10px] text-slate-400">Veri yok.</p>}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <OnayliMusteriler orders={orders} customers={customers} />
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        {/* Sol */}
        <div className="space-y-4">
          {/* Barkod / Ürün Ara */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} className="text-emerald-600" /> Ürün Bul</h3>
              <div className="flex items-center gap-1">
                {storeSetting?.slug && <button onClick={() => { navigator.clipboard?.writeText(`${location.origin}/katalog/${storeSetting.slug}`); toast.success('Katalog linki kopyalandı'); }} className="text-[11px] text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg inline-flex items-center gap-1"><Share2 size={13} /> Katalog Linki</button>}
                <button onClick={() => setBarHistModal(true)} className="text-[11px] text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg inline-flex items-center gap-1"><History size={13} /> Geçmiş{barHistory.length > 0 && <span className="bg-emerald-100 text-emerald-700 px-1.5 rounded-full text-[10px]">{barHistory.length}</span>}</button>
              </div>
            </div>
            {/* Tek alan: barkod okut VEYA ürün ara */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                value={araQ}
                onChange={(e) => setAraQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { const r = resolveCodeBeden(araQ); if (r.product) { openProduct(r.product, r.beden); setAraQ(''); } else if (araSonuc.length === 1) { openProduct(araSonuc[0]); setAraQ(''); } else if (araSonuc.length === 0 && araQ.trim()) { toast.error('Ürün bulunamadı'); } } }}
                placeholder="Barkod · satış kodu · 'A12 M' / 'M A12' · ürün adı, marka, beden..."
                className="w-full pl-8 pr-16 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300"
                autoFocus
              />
              <button onClick={() => { const r = resolveCodeBeden(araQ); if (r.product) { openProduct(r.product, r.beden); setAraQ(''); } else if (araSonuc.length === 1) { openProduct(araSonuc[0]); setAraQ(''); } else if (araQ.trim()) { toast.error('Ürün bulunamadı'); } }} className="absolute right-1 top-1 bottom-1 bg-slate-800 text-white px-3 rounded-md hover:bg-slate-700 text-xs font-medium">Bul</button>
            </div>
            {araQ && (
              <div className="mt-2 max-h-56 overflow-y-auto space-y-1 border border-slate-100 rounded-lg p-1">
                {araSonuc.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-4">Sonuç yok — barkod okutun veya kod yazıp Enter'a basın.</p> : araSonuc.map((p: any) => {
                  const fl = activeFlash(p.id); const ind = fl > 0 ? fl : (p.eskiFiyat && p.eskiFiyat > p.satisFiyat ? p.satisFiyat : 0);
                  return (
                    <button key={p.id} onClick={() => { openProduct(p); setAraQ(''); }} className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-emerald-50 text-left">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">{(p.images || [])[0] && <img src={p.images[0]} className="w-full h-full object-cover" />}</div>
                      <div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-800 truncate flex items-center gap-1">{p.ad}{p._drop && <span className="bg-green-500 text-white text-[8px] px-1 py-0.5 rounded-full font-bold shrink-0">drop</span>}</p><p className="text-[10px] text-slate-400 truncate flex items-center gap-1"><span className="font-mono font-bold text-[10px] bg-slate-800 text-white px-1.5 py-0.5 rounded shrink-0">{p.salesCode || '-'}</span> {p._drop ? (p.supplierAd || 'Tedarikçi') : (p.marka || '-')} · {p.cinsiyet || ''}</p></div>
                      <div className="text-right shrink-0"><p className="text-xs font-bold text-slate-700">{fmt(fl > 0 ? fl : p.satisFiyat)}</p><p className="text-[9px] text-slate-400">{(p.stokAdeti || 0)} adet</p>{ind > 0 && <span className="text-[8px] text-rose-500">indirimli</span>}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Ürün stok kartı — sabit (her zaman görünür) */}
            <div className="mt-3 border border-slate-200 bg-slate-50/60 rounded-xl p-3 min-h-[120px]">
              {barkodModal ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <button onClick={() => (barkodModal.images || [])[0] && setImgZoom(barkodModal.images[0])} className="w-12 h-12 rounded-lg bg-white border border-slate-100 overflow-hidden shrink-0 cursor-zoom-in" title="Büyüt">{(barkodModal.images || [])[0] ? <img src={barkodModal.images[0]} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={18} /></span>}</button>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 text-sm leading-tight truncate flex items-center gap-1">{barkodModal.ad}{barkodModal._drop && <span className="bg-green-500 text-white text-[8px] px-1 py-0.5 rounded-full font-bold shrink-0">drop</span>}</p>
                      <p className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">Kod: <span className="font-mono font-bold text-[11px] bg-slate-800 text-white px-1.5 py-0.5 rounded shrink-0">{barkodModal.salesCode || '-'}</span>{barkodModal.barkod && <span className="font-mono">· {barkodModal.barkod}</span>}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px]">
                        <span className={`${(barkodModal.stokAdeti || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>Stok: <b>{barkodModal.stokAdeti || 0}</b></span>
                        <span className="text-slate-300">·</span>
                        {editPrice ? (
                          <span className="inline-flex items-center gap-1">Fiyat:<input autoFocus type="number" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} onBlur={saveCardPrice} onKeyDown={(e) => { if (e.key === 'Enter') saveCardPrice(); if (e.key === 'Escape') setEditPrice(false); }} className="w-20 font-bold text-slate-800 border border-indigo-300 rounded px-1 py-0.5 text-[11px] outline-none focus:ring-2 focus:ring-indigo-200" /></span>
                        ) : (
                          <span className="text-slate-600 cursor-text" title="Çift tıkla: fiyatı düzenle" onDoubleClick={() => { setPriceDraft(String(barkodModal.satisFiyat || '')); setEditPrice(true); }}>Fiyat: {barkodModal.eskiFiyat && barkodModal.eskiFiyat > barkodModal.satisFiyat && <span className="text-[9px] text-slate-300 line-through mr-0.5">{fmt(barkodModal.eskiFiyat)}</span>}<b className="text-slate-800">{fmt(barkodModal.satisFiyat || 0)}</b>{priceOverride[barkodModal.id] > 0 && <span className="ml-1 text-[8px] text-indigo-500 font-semibold">özel</span>}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => setBarkodModal(null)} className="p-1 hover:bg-white rounded-lg shrink-0" title="Temizle"><X size={16} className="text-slate-400" /></button>
                  </div>
                  {(barkodModal.variations || []).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-slate-400 uppercase mr-0.5">Beden:</span>
                      {barkodModal._preBeden && <span className="text-[10px] text-emerald-500">seçilen <b>{barkodModal._preBeden}</b></span>}
                      {barkodModal.variations.map((v: any) => <span key={v.id} className={`text-[11px] px-1.5 py-0.5 rounded-md border ${barkodModal._preBeden && norm(v.deger) === norm(barkodModal._preBeden) ? 'ring-2 ring-emerald-400 ' : ''}${v.stok > 0 ? 'bg-white border-slate-200 text-slate-700' : 'bg-red-50 border-red-200 text-red-500 line-through'}`}>{v.deger}:<b>{v.stok}</b></span>)}
                    </div>
                  ) : <p className="text-[10px] text-slate-400">Varyasyon yok (tek stok).</p>}
                  {(activeFlash(barkodModal.id) > 0 || prevSaleMap[barkodModal.id]) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {activeFlash(barkodModal.id) > 0 && <span className="text-[11px] text-green-600 font-medium">Aktif indirim: {fmt(activeFlash(barkodModal.id))}</span>}
                      {prevSaleMap[barkodModal.id] && <span className="text-[11px] text-indigo-600 font-medium inline-flex items-center gap-1"><History size={11} /> Önce satıldı: <b>{fmt(prevSaleMap[barkodModal.id].fiyat)}</b> · {prevSaleMap[barkodModal.id].adet} ad.</span>}
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2">
                    <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                      <span className="text-[11px] font-medium text-slate-700 mr-1">Süreli İndirim:</span>
                      {[10, 15, 20].map((pct) => {
                        const base = Number(barkodModal.satisFiyat) || 0;
                        const yeni = Math.ceil((base * (1 - pct / 100)) / 10) * 10;
                        const aktif = base > 0 && Number(discForm.price) === yeni;
                        const isDef = varsayilanIndirim === pct;
                        return (
                          <button
                            key={pct}
                            type="button"
                            disabled={base <= 0}
                            onClick={() => { setDiscForm({ ...discForm, price: String(yeni) }); if (varsayilanIndirim > 0) saveDefIndirim(pct); }}
                            className={`relative px-2 py-0.5 rounded-md text-xs font-semibold border transition disabled:opacity-40 ${aktif ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'} ${isDef ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                            title={base > 0 ? `${fmt(base)} → ${fmt(yeni)}` : 'Satış fiyatı yok'}
                          >
                            %{pct}
                          </button>
                        );
                      })}
                      <label className="flex items-center gap-1 text-[10px] text-slate-600 cursor-pointer ml-auto select-none" title="Seçili % indirimi tüm yayın boyunca her üründe varsayılan uygula">
                        <input
                          type="checkbox"
                          checked={varsayilanIndirim > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const base = Number(barkodModal.satisFiyat) || 0;
                              const pct = [10, 15, 20].find((p) => base > 0 && Number(discForm.price) === Math.ceil((base * (1 - p / 100)) / 10) * 10);
                              if (pct) { saveDefIndirim(pct); toast.success(`Varsayılan indirim: %${pct} — yayın boyunca`); }
                              else toast.error('Önce bir % butonu seçin');
                            } else { saveDefIndirim(0); toast('Varsayılan indirim kapatıldı'); }
                          }}
                          className="accent-rose-600 w-3.5 h-3.5"
                        />
                        Yayın boyu
                      </label>
                    </div>
                    {varsayilanIndirim > 0 && <p className="text-[10px] text-amber-600 -mt-0.5 mb-1.5 font-medium">Varsayılan indirim aktif: %{varsayilanIndirim} — açtığın her ürüne otomatik gelir.</p>}
                    <div className="flex gap-1.5">
                      <input type="number" value={discForm.price} onChange={(e) => setDiscForm({ ...discForm, price: e.target.value })} placeholder="İndirimli ₺" className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg" />
                      <input type="number" value={discForm.dakika} onChange={(e) => setDiscForm({ ...discForm, dakika: e.target.value })} placeholder="dk" className="w-12 shrink-0 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                      <button onClick={setFlashDiscount} className="shrink-0 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-emerald-700">Başlat</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-5 text-slate-400">
                  <Package size={22} className="mb-1.5 text-slate-300" />
                  <p className="text-[12px] font-medium text-slate-500">Ürün Stok Kartı</p>
                  <p className="text-[10px]">Barkod/kod okutunca veya arayınca ürün, stok ve varyasyonlar burada görünür.</p>
                </div>
              )}
            </div>
          </div>

          {/* Yorum Akışı / Manuel Sipariş / Sohbet — tek sekmeli kutu */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-1 mb-3 bg-slate-100 rounded-lg p-1">
              {(fbStatus.connected || igStatus.connected) && (
                <button onClick={() => setLeftTab('yorum')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${leftTab === 'yorum' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>Yorum Akışı <span className="text-slate-400">{mergedFeed.length}</span></button>
              )}
              <button onClick={() => setLeftTab('manuel')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${leftTab === 'manuel' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>Manuel Sipariş</button>
              <button onClick={() => setLeftTab('sohbet')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${leftTab === 'sohbet' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>Sohbet <span className="text-slate-400">{orders.length}</span></button>
            </div>

            {leftTab === 'yorum' ? (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {fbStatus.connected && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Video size={11} /> Facebook<button onClick={fbDisconnect} disabled={fbBusy} className="text-rose-500 hover:underline disabled:opacity-50 ml-0.5">kes</button></span>
                    )}
                    {igStatus.connected && (
                      <span className="text-[10px] bg-pink-50 text-pink-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Video size={11} /> Instagram<button onClick={igDisconnect} disabled={igBusy} className="text-rose-500 hover:underline disabled:opacity-50 ml-0.5">kes</button></span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setFeedWin((w) => ({ ...w, open: true }))} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1"><Move size={12} /> Pencerede Aç</button>
                    <button onClick={spinCark} className="text-[11px] font-semibold text-white bg-gradient-to-r from-fuchsia-500 to-amber-500 hover:from-fuchsia-600 hover:to-amber-600 px-2.5 py-1 rounded-lg">Şans Çarkı</button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mb-2"><b className="text-emerald-600">İşle</b> ile yorumu siparişe çevirin (kod/beden hatalıysa düzeltme açılır). Geçmiş 24 saat saklanır. <span className="text-green-600 font-medium">Yeşil</span> = işlendi.</p>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {mergedFeed.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-4">Henüz yorum gelmedi…</p> : (yorumShowAll ? mergedFeed : mergedFeed.slice(0, FEED_LIMIT)).map((c: any) => {
                    const done = c.matched || islenenIds[String(c.id)];
                    return (
                      <div key={c._src + c.id} className={`text-xs rounded-lg p-2 border ${done ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-700 truncate flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c._src === 'fb' ? 'bg-blue-500' : 'bg-pink-500'}`} />{c.name}</span>
                          {done ? <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">✓ işlendi</span> : <button onClick={() => islaComment(c)} className="text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold shrink-0 hover:bg-emerald-700">İşle</button>}
                        </div>
                        <p className="text-slate-500 break-words">{c.message}</p>
                      </div>
                    );
                  })}
                  {mergedFeed.length > FEED_LIMIT && (
                    <button onClick={() => setYorumShowAll((v) => !v)} className="w-full text-[11px] font-medium text-emerald-600 hover:text-emerald-700 py-1.5">{yorumShowAll ? 'Daha az göster' : `Daha fazla göster (+${mergedFeed.length - FEED_LIMIT})`}</button>
                  )}
                </div>
              </div>
            ) : leftTab === 'manuel' ? (
              <>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={'kullanıcı satışkodu beden\nahmet SK1024 XL\nmehmet SK0712 2XL'} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300" />
                <p className="text-[10px] text-slate-400 mt-1">Satış kodu + beden bitişik (SK1024XL) veya 2XL/XXL farklı yazılsa da eşleşir; stok varsa onaylanır.</p>
                <button onClick={parse} disabled={busy || !stream} className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"><Send size={16} /> {busy ? 'İşleniyor...' : 'Siparişleri Ayrıştır & Al'}</button>
                {!stream && <p className="text-[10px] text-red-500 mt-1">Yayın kapalı. Önce "Yeni Yayın" başlatın.</p>}
              </>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {orders.slice(0, 30).map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1">
                    <div><span className="font-medium text-slate-700">{o.user}</span> <span className="text-slate-400">{o.kod} {o.beden}</span></div>
                    <span className="text-slate-300">{hhmm(o.createdAt)}</span>
                  </div>
                ))}
                {orders.length === 0 && <p className="text-slate-400 text-xs">Henüz sipariş yok.</p>}
              </div>
            )}
          </div>

        </div>

        {/* Sağ kolon */}
        <div className="space-y-4 min-w-0">
          {/* Sipariş tablosu */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {aktifKampanyalar.length > 0 && (
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-amber-700">🏷 Aktif Kampanyalar:</span>
              {aktifKampanyalar.map((k: any) => <span key={k.id} className="text-[11px] bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full" title={kampKisa(k)}>{kampKisa(k)}</span>)}
            </div>
          )}
          <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-1">
            {([['tumu', `Tümü ${stats.toplam}`], ['onaylandi', `Onaylandı ${stats.onaylandi}`], ['stok_yok', `Stok Yetersiz ${stats.stokYok}`], ['riskli', `Riskli ${stats.riskli}`], ['kayit', `Kayıt Gerekli ${stats.kayitGerekli}`], ['iptal', `İptal ${stats.iptal}`]] as [any, string][]).map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${tab === t ? (t === 'kayit' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white') : (t === 'kayit' && stats.kayitGerekli > 0 ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-500 hover:bg-slate-100')}`}>{l}</button>
            ))}
            <span className="ml-auto flex items-center gap-2">
              <span className="relative">
                <Search size={13} className="absolute left-2 top-1.5 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara (ürün, kod, müşteri, satıcı)" className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-40 sm:w-56 outline-none" />
              </span>
            </span>
          </div>
          {/* Kayıt Gerekli sekmesi: kayıtları işle / tümünü iptal butonları (yalnız rezerve varken) */}
          {tab === 'kayit' && stats.kayitGerekli > 0 && (
            <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-amber-50/50">
              <button onClick={kayitKontrolEtIsle} disabled={kayitBusy} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50">
                <UserPlus size={14} /> Kayıtları Kontrol Et ve İşle
              </button>
              <button onClick={tumRezerveIptal} disabled={kayitBusy} className="inline-flex items-center gap-1.5 bg-white border border-rose-200 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-rose-50 disabled:opacity-50">
                <Trash2 size={14} /> Tümünü İptal Et
              </button>
              <span className="text-[11px] text-slate-500">Kaydı bulunan müşterilerin rezerveleri onaylanır; kalanlar kayıt bekler.</span>
            </div>
          )}
          <div className="overflow-x-auto max-h-[calc(100vh-180px)] overflow-y-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-slate-50 text-slate-500 text-left sticky top-0"><tr><th className="px-3 py-2">Kullanıcı</th><th className="px-3 py-2">Ürün</th><th className="px-3 py-2">Kod</th><th className="px-3 py-2">Beden</th><th className="px-3 py-2">Satıcı</th><th className="px-3 py-2">Tutar</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2">Saat</th><th className="px-3 py-2">İşlem</th></tr></thead>
              <tbody>
                {sayfaliFiltered.map((o) => {
                  const img = imgOf(o.productId, o.freeProductId) || o.gorsel;
                  const rowBg = o.durum === 'onaylandi' ? 'bg-green-50' : o.durum === 'rezerve' ? 'bg-blue-50' : o.durum === 'stok_yok' ? 'bg-red-50' : o.durum === 'iptal' ? 'opacity-60' : '';
                  return (
                    <tr key={o.id} className={`border-t border-slate-100 ${rowBg}`}>
                      <td className="px-3 py-2 font-medium text-slate-700"><div className="flex items-center gap-1.5">{o.user}{!isRegistered(o.user) && <><span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full" title="Müşterilerimde kayıtlı değil">Kayıt Yok</span><button onClick={() => { setKayitForm({ ad: '', instagram: o.user, telefon: '', anchor: o.user }); setKayitModal(true); }} title="Hızlı müşteri kaydı oluştur" className="text-emerald-600 hover:bg-emerald-50 rounded p-0.5"><UserPlus size={14} /></button></>}</div></td>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0 cursor-zoom-in" onClick={() => img && setLightbox(img)}>{img ? <img src={img} className="w-full h-full object-cover" /> : null}</div><div><span className="text-slate-600">{o.urun}</span>{o.drop && <span className="ml-1 text-green-500 text-[10px] font-bold align-middle">drop</span>}{(() => { const ku = kampanyaUygulanan(o); return ku ? <span className="block text-[9px] text-amber-600 font-medium" title={kampKisa(ku)}>🏷 {ku.ad}</span> : null; })()}</div></div></td>
                      <td className="px-3 py-2 text-slate-500 font-mono text-xs">{o.kod || '-'}</td>
                      <td className="px-3 py-2 text-slate-500">{o.beden || '-'}</td>
                      <td className="px-3 py-2 text-slate-500">{o.saticiAd || '-'}</td>
                      <td className="px-3 py-2 font-medium">{(() => {
                        const disc = satirIndirimi(o);
                        if (disc > 0) return <div className="leading-tight"><span className="line-through text-slate-400 text-xs">{fmt(o.tutar)}</span><span className="block text-green-600 font-semibold">{fmt(o.tutar - disc)}</span></div>;
                        return fmt(o.tutar);
                      })()}</td>
                      <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_BADGE[o.durum].c}`}>{DURUM_BADGE[o.durum].t}</span></td>
                      <td className="px-3 py-2 text-slate-400">{hhmm(o.createdAt)}</td>
                      <td className="px-3 py-2">
                        {o.durum === 'iptal'
                          ? <span title={`İptal: ${o.user} · ${o.urun} ${o.beden || ''} · ${fmt(o.tutar)}`} className="text-rose-500 text-xs cursor-help">İptal Edildi ⓘ</span>
                          : <button onClick={() => iptalEt(o)} title="Siparişi İptal Et" className="inline-flex items-center gap-1 text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg text-xs"><Trash2 size={13} /> İptal</button>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-12 text-center text-slate-400">{stream ? 'Henüz sipariş yok.' : 'Yayın kapalı. "Yeni Yayın" başlatın.'}</td></tr>}
                {filtered.length > gorunenSayi && (
                  <tr><td colSpan={9} className="px-3 py-3 text-center">
                    <button onClick={() => setGorunenSayi((n) => n + SAYFA)} className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600">
                      Daha fazla göster ({gorunenSayi} / {filtered.length})
                    </button>
                    <span className="ml-3 text-[11px] text-slate-400">Tümünü görmek yerine yukarıdaki aramayı kullanın</span>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      </div>

      {/* Barkod ürün bilgisi artık barkod kutusunun altında inline gösteriliyor (popup kaldırıldı) */}

      {/* Sipariş iptal onay modalı */}
      {iptalAday && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-5" onClick={() => setIptalAday(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-3xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto"><Trash2 size={24} className="text-rose-500" /></div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg">İptal etmek istediğinize emin misiniz?</h3>
              <p className="text-sm text-slate-500 mt-1"><b>{iptalAday.user}</b> · {iptalAday.urun}{iptalAday.beden ? ` (${iptalAday.beden})` : ''} siparişi iptal edilecek ve müşterinin sepetinden de çıkarılacak.</p>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setIptalAday(null)} className="flex-1 bg-white border border-slate-200 text-slate-600 rounded-2xl py-3 font-semibold hover:bg-slate-50">Hayır</button>
              <button onClick={confirmIptal} className="flex-1 bg-rose-500 text-white rounded-2xl py-3 font-bold hover:bg-rose-600">Evet, İptal Et</button>
            </div>
          </div>
        </div>
      )}

      {/* Okutulan barkod geçmişi — taşınabilir / boyutlandırılabilir / pinlenebilir panel */}
      {barHistModal && (
        <div className="fixed inset-0 z-[110]" style={{ pointerEvents: 'none' }}>
          {!histPin && <div className="absolute inset-0 bg-black/40" style={{ pointerEvents: 'auto' }} onClick={() => setBarHistModal(false)} />}
          <div className="absolute bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" style={{ pointerEvents: 'auto', left: '50%', top: '50%', width: histSize.w, height: histSize.h, transform: `translate(calc(-50% + ${histPos.x}px), calc(-50% + ${histPos.y}px))` }}>
            <div onMouseDown={startHistDrag} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 cursor-move select-none bg-slate-50/80">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><History size={18} className="text-emerald-600" /> Okutulan Ürünler <span className="text-[11px] font-normal text-slate-400">({barHistory.length})</span></h3>
              <div className="flex items-center gap-1">
                <button onClick={() => setHistPin((v) => !v)} title={histPin ? 'Sabitlemeyi kaldır' : 'Panele sabitle (arkada çalışmaya devam et)'} className={`px-2 py-1 rounded-lg text-[11px] font-medium ${histPin ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{histPin ? 'Sabit' : 'Sabitle'}</button>
                <button onClick={() => setBarHistModal(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={18} className="text-slate-400" /></button>
              </div>
            </div>
            <div className="px-3 pt-2.5">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input value={histSearch} onChange={(e) => setHistSearch(e.target.value)} placeholder="Geçmişte ara: ad veya kod..." className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {barHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-10 text-slate-400">
                  <Package size={26} className="mb-2 text-slate-300" />
                  <p className="text-sm">Henüz barkod/kod okutulmadı.</p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {barHistory.filter((b) => { const q = norm(histSearch); return !q || norm(b.ad).includes(q) || norm(b.kod).includes(q); }).map((b) => {
                    const p: any = products.find((x) => x.id === b.productId) || {};
                    const img = (p.images || [])[0] || b.img || '';
                    const fl = activeFlash(b.productId);
                    const ovr = priceOverride[b.productId] || 0;
                    const eski = p.eskiFiyat || b.eskiFiyat || 0;
                    const guncel = ovr > 0 ? ovr : (fl > 0 ? fl : (p.satisFiyat || b.satisFiyat || 0));
                    const ind = fl > 0 || ovr > 0 || (eski && eski > guncel);
                    const kalanVar = ((p.variations && p.variations.length ? p.variations : b.vars) || []).filter((v: any) => (v.stok || 0) > 0);
                    const stok = p.stokAdeti ?? b.stok;
                    const prev = prevSaleMap[b.productId];
                    return (
                      <div key={b.id} onClick={() => { const prod = prodById.get(b.productId); if (prod) openProduct(prod); }} className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/60 flex gap-2.5 cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/40">
                        <button onClick={(e) => { e.stopPropagation(); img && setImgZoom(img); }} className="w-16 h-16 rounded-lg bg-white border border-slate-100 overflow-hidden shrink-0 cursor-zoom-in" title="Büyüt">{img ? <img src={img} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={18} /></span>}</button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-1"><p className="font-semibold text-slate-800 text-xs leading-tight line-clamp-2">{b.ad}{b.drop && <span className="ml-1 bg-green-500 text-white text-[8px] px-1 py-0.5 rounded-full font-bold">drop</span>}</p><span className="text-[9px] text-slate-400 shrink-0">{b.time}</span></div>
                          <p className="mt-0.5"><span className="font-mono font-bold text-[9px] bg-slate-800 text-white px-1.5 py-0.5 rounded">{p.salesCode || b.kod}</span></p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {ind && eski ? <span className="text-[9px] text-slate-300 line-through">{fmt(eski)}</span> : null}
                            <span className={`text-xs font-bold ${ind ? 'text-rose-600' : 'text-slate-700'}`}>{fmt(guncel)}</span>
                            <span className={`text-[9px] font-bold ml-auto ${(stok || 0) > 0 ? 'text-green-600' : 'text-red-500'}`}>{stok} ad</span>
                          </div>
                          {prev && <p className="text-[9px] text-indigo-600 font-medium mt-0.5">Önceki satış: {fmt(prev.fiyat)} · {prev.adet} ad</p>}
                          {kalanVar.length > 0 && <div className="flex flex-wrap gap-0.5 mt-1">{kalanVar.slice(0, 6).map((v: any) => <span key={v.id || v.deger} className="text-[8px] px-1 py-0.5 rounded border border-slate-200 text-slate-500 bg-white">{v.deger}:{v.stok}</span>)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {barHistory.length > 0 && (
              <div className="p-2.5 border-t border-slate-100">
                <button onClick={() => { setBarHistory([]); }} className="w-full text-xs text-slate-500 hover:bg-slate-50 border border-slate-200 py-2 rounded-lg">Geçmişi Temizle</button>
              </div>
            )}
            <div onMouseDown={startHistResize} title="Yeniden boyutlandır" className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize text-slate-300 flex items-end justify-end p-0.5"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M9 1 L9 9 L1 9" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></div>
          </div>
        </div>
      )}

      {/* Görsel büyütme (lightbox) */}
      {imgZoom && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/80" onClick={() => setImgZoom('')}>
          <img src={imgZoom} className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setImgZoom('')} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
        </div>
      )}

      {/* Hizli kayit modal */}
      {kayitModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setKayitModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Hızlı Müşteri Kaydı</h3><button onClick={() => setKayitModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-400">Sadece telefon zorunludur. Kayıt sonrası bu müşterinin rezerve siparişleri otomatik onaylanır.</p>
            <input value={kayitForm.ad} onChange={(e) => setKayitForm({ ...kayitForm, ad: e.target.value })} placeholder="Ad Soyad" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <input value={kayitForm.instagram} onChange={(e) => setKayitForm({ ...kayitForm, instagram: e.target.value })} placeholder="Instagram kullanıcı adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <input value={kayitForm.telefon} onChange={(e) => setKayitForm({ ...kayitForm, telefon: e.target.value })} placeholder="Telefon *" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <button onClick={kayitOlustur} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700">Kaydet</button>
          </div>
        </div>
      )}

      {/* Yayın Kampanyaları */}
      {kampOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setKampOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 max-h-[88vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Yayın Kampanyaları</h3><button onClick={() => setKampOpen(false)}><X size={20} className="text-slate-400" /></button></div>

            {/* Yeni kampanya formu */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Yeni Kampanya</p>
              <input value={kampForm.ad} onChange={(e) => setKampForm({ ...kampForm, ad: e.target.value })} placeholder="Kampanya adı (ör. 3 al %10 indirim)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400">Koşul Tipi</label>
                  <select value={kampForm.tip} onChange={(e) => setKampForm({ ...kampForm, tip: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg">
                    <option value="urun_adet">Ürün adedi (X adet alana)</option>
                    <option value="sepet_tutar">Sepet tutarı (X TL üzeri)</option>
                  </select>
                </div>
                {kampForm.tip === 'urun_adet' ? (
                  <div><label className="text-[11px] text-slate-400">Min. Adet</label><input type="number" value={kampForm.minAdet} onChange={(e) => setKampForm({ ...kampForm, minAdet: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                ) : (
                  <div><label className="text-[11px] text-slate-400">Min. Tutar (TL)</label><input type="number" value={kampForm.minTutar} onChange={(e) => setKampForm({ ...kampForm, minTutar: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400">İndirim Tipi</label>
                  <select value={kampForm.indirimTip} onChange={(e) => setKampForm({ ...kampForm, indirimTip: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg">
                    <option value="yuzde">Yüzde (%)</option>
                    <option value="tutar">Tutar (TL)</option>
                  </select>
                </div>
                <div><label className="text-[11px] text-slate-400">İndirim Değeri</label><input type="number" value={kampForm.indirimDeger} onChange={(e) => setKampForm({ ...kampForm, indirimDeger: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              </div>
              <div>
                <label className="text-[11px] text-slate-400">Süre (dk · opsiyonel)</label>
                <input type="number" value={kampForm.sureDk} onChange={(e) => setKampForm({ ...kampForm, sureDk: e.target.value })} placeholder="Süresiz için boş bırakın" className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" />
                <p className="text-[10px] text-slate-400 mt-0.5">Girilirse kampanya bu süre sonunda otomatik biter; biten kampanyayı uygulamış sepetler indirimini korur.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400">Kapsam</label>
                  <select value={kampForm.kapsam} onChange={(e) => setKampForm({ ...kampForm, kapsam: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg">
                    <option value="hepsi">Tüm ürünler</option>
                    <option value="kategori">Kategori</option>
                    <option value="urun">Belirli ürün</option>
                  </select>
                </div>
                {kampForm.kapsam === 'kategori' && (
                  <div><label className="text-[11px] text-slate-400">Kategori</label><select value={kampForm.kategoriId} onChange={(e) => setKampForm({ ...kampForm, kategoriId: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Seçiniz</option>{categories.map((c: any) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select></div>
                )}
                {kampForm.kapsam === 'urun' && (
                  <div><label className="text-[11px] text-slate-400">Ürün</label><select value={kampForm.productId} onChange={(e) => setKampForm({ ...kampForm, productId: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Seçiniz</option>{products.map((p: any) => <option key={p.id} value={p.id}>{p.ad}</option>)}</select></div>
                )}
              </div>
              <button onClick={saveKampanya} className="w-full bg-amber-500 text-white py-2.5 rounded-lg font-medium hover:bg-amber-600 inline-flex items-center justify-center gap-1.5"><Plus size={16} /> Kampanya Ekle</button>
            </div>

            {/* Mevcut kampanyalar */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase">Tanımlı Kampanyalar ({campaigns.length})</p>
              {campaigns.length === 0 && <p className="text-sm text-slate-400">Henüz kampanya yok. Yukarıdan ekleyin.</p>}
              {campaigns.map((k: any) => {
                const bitis = k.bitisZamani ? new Date(k.bitisZamani) : null;
                const bitti = bitis ? bitis.getTime() <= Date.now() : false;
                const aktifSureli = !!bitis && k.aktif && !bitti;
                const kalanDk = aktifSureli ? Math.max(1, Math.ceil((bitis!.getTime() - Date.now()) / 60000)) : 0;
                return (
                <div key={k.id} className="flex items-center gap-2 border border-slate-100 rounded-xl p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{k.ad}</p>
                    <p className="text-[11px] text-slate-500">{kampOzet(k)}</p>
                    {bitis && (aktifSureli
                      ? <p className="text-[10px] text-amber-600 font-medium mt-0.5 inline-flex items-center gap-1"><Clock size={11} /> ~{kalanDk} dk sonra biter</p>
                      : <p className="text-[10px] text-slate-400 mt-0.5">Sonlandırıldı: {bitis.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>)}
                  </div>
                  {k.aktif && !bitti
                    ? <button onClick={() => stopKampanya(k)} className="text-[10px] px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 inline-flex items-center gap-1"><Square size={11} /> Durdur</button>
                    : <button onClick={() => toggleKampanya(k)} className="text-[10px] px-2 py-1 rounded-full font-medium bg-slate-100 text-slate-400 hover:bg-slate-200">Pasif · Aç</button>}
                  <button onClick={() => delKampanya(k.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">Kampanyalar canlı yayında oluşan müşteri sepetlerine otomatik uygulanır; indirim sepet linkinde ve sipariş özetinde görünür.</p>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-6" onClick={() => setLightbox('')}>
          <img src={lightbox} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setLightbox('')} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
          <span className="absolute bottom-4 text-white/60 text-xs">Kapatmak için tıkla, Esc veya Ctrl</span>
        </div>
      )}

      {/* Gecmis yayinlar */}
      {historyOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={() => setHistoryOpen(false)}>
          <div className="w-full max-w-md bg-slate-50 h-full overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">Geçmiş Yayınlar</h2><button onClick={() => setHistoryOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            {history.length === 0 && <p className="text-slate-400 text-sm">Henüz tamamlanmış yayın yok.</p>}
            {history.map((h) => (
              <div key={h.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="font-medium text-slate-800">{new Date(h.startedAt).toLocaleString('tr-TR')}</p>
                <p className="text-xs text-slate-400">{h.endedAt ? `Bitiş: ${new Date(h.endedAt).toLocaleString('tr-TR')}` : ''}</p>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div><p className="text-[10px] text-slate-400">Sipariş</p><p className="font-bold text-slate-700">{h.siparis}</p></div>
                  <div><p className="text-[10px] text-slate-400">Ciro</p><p className="font-bold text-green-600">{fmt(h.ciro)}</p></div>
                  <div><p className="text-[10px] text-slate-400">Kâr</p><p className="font-bold text-emerald-600">{fmt(h.kar)}</p></div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => openHistDetail(h.id)} className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-100 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-200"><Eye size={15} /> Görüntüle</button>
                  <button onClick={() => resumeStream(h.id)} className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700"><Play size={15} /> Devam et</button>
                </div>
                {h.token && (
                  <button onClick={() => { navigator.clipboard?.writeText(`${location.origin}/katalog/stream/${h.token}`); toast.success('Yayın katalog linki kopyalandı'); }} className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-teal-50 text-teal-700 py-1.5 rounded-lg text-xs font-medium hover:bg-teal-100"><Share2 size={13} /> Katalog Linki</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Geçmiş yayın detayı (salt-okunur) */}
      {histDetail && (
        <div className="fixed inset-0 z-[115] flex justify-end bg-black/40" onClick={() => setHistDetail(null)}>
          <div className="w-full max-w-lg bg-slate-50 h-full overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{histDetail.stream?.baslik || 'Yayın Detayı'} <span className="text-xs font-normal text-slate-400">(salt-okunur)</span></h2>
              <button onClick={() => setHistDetail(null)}><X size={20} className="text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-400">{histDetail.stream?.startedAt ? new Date(histDetail.stream.startedAt).toLocaleString('tr-TR') : ''}</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-white rounded-lg border border-slate-200 p-2"><p className="text-[10px] text-slate-400">Net Ciro</p><p className="font-bold text-green-600 text-sm">{fmt(histDetail.ozet?.ciro || 0)}</p></div>
              <div className="bg-white rounded-lg border border-slate-200 p-2"><p className="text-[10px] text-slate-400">İndirim</p><p className="font-bold text-amber-600 text-sm">{fmt(histDetail.ozet?.indirim || 0)}</p></div>
              <div className="bg-white rounded-lg border border-slate-200 p-2"><p className="text-[10px] text-slate-400">Kâr</p><p className="font-bold text-emerald-600 text-sm">{fmt(histDetail.ozet?.kar || 0)}</p></div>
              <div className="bg-white rounded-lg border border-slate-200 p-2"><p className="text-[10px] text-slate-400">Sipariş</p><p className="font-bold text-slate-700 text-sm">{histDetail.ozet?.siparis || 0}</p></div>
            </div>
            <button onClick={() => exportExcel(histDetail.ozet, histDetail.orders || [], histDetail.stream)} className="w-full inline-flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 py-2 rounded-lg text-sm font-medium hover:bg-emerald-200"><Download size={15} /> Excel ile İndir</button>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-2 text-left">Müşteri</th><th className="px-2 py-2 text-left">Ürün</th><th className="px-2 py-2 text-left">Beden</th><th className="px-2 py-2 text-right">Tutar</th><th className="px-2 py-2 text-left">Durum</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {(histDetail.orders || []).map((o: any) => (
                    <tr key={o.id}><td className="px-2 py-1.5 text-slate-700">{o.user}</td><td className="px-2 py-1.5 text-slate-600">{o.urun}</td><td className="px-2 py-1.5 text-slate-500">{o.beden || o.variation || '-'}</td><td className="px-2 py-1.5 text-right">{fmt(o.tutar)}</td><td className="px-2 py-1.5 text-slate-500">{o.durum}</td></tr>
                  ))}
                  {(histDetail.orders || []).length === 0 && <tr><td colSpan={5} className="px-2 py-8 text-center text-slate-400">Sipariş yok.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Rapor modal */}
      {reportOpen && (() => {
        const margin = stats.ciro > 0 ? (stats.kar / stats.ciro) * 100 : 0;
        const sg = Number(sabitGider) || 0;
        const netKar = stats.kar - sg;
        const lowMargin = stats.ciro > 0 && margin < 15;
        return (
          <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={() => setReportOpen(false)}>
            <div className="w-full max-w-lg bg-slate-50 h-full overflow-y-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">Yayın Raporu & Kârlılık</h2><div className="flex items-center gap-1.5">{stream && (<button onClick={() => exportExcel(ozet, orders, stream)} title="Excel'e aktar" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><Download size={15} /> Excel'e Aktar</button>)}<button onClick={() => setReportOpen(false)}><X size={20} className="text-slate-400" /></button></div></div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Ciro</p><p className="text-lg font-bold text-slate-800">{fmt(stats.ciro)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Brüt Kâr</p><p className="text-lg font-bold text-green-600">{fmt(stats.kar)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Kâr Marjı</p><p className={`text-lg font-bold ${lowMargin ? 'text-red-600' : 'text-emerald-600'}`}>%{margin.toFixed(1)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Net Kâr</p><p className={`text-lg font-bold ${netKar < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt(netKar)}</p></div>
              </div>

              <div className="bg-white rounded-xl border border-amber-200 p-4">
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><Tag size={15} className="text-amber-500" /> İndirim Özeti</h3>
                {(stats.kampanyaYararlanan > 0 || stats.kampanyaIndirimi > 0 || stats.flashIndirim > 0) ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-[10px] text-slate-400 uppercase">Yararlanan Müşteri</p><p className="text-lg font-bold text-amber-600">{stats.kampanyaYararlanan} kişi</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Kampanya İndirimi</p><p className="text-lg font-bold text-amber-600">-{fmt(stats.kampanyaIndirimi)}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Süreli İndirim</p><p className="text-lg font-bold text-rose-600">-{fmt(stats.flashIndirim)}</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Toplam İndirim</p><p className="text-lg font-bold text-slate-800">-{fmt(stats.kampanyaIndirimi + stats.flashIndirim)}</p></div>
                  </div>
                ) : <p className="text-slate-400 text-sm">Henüz kampanya/süreli indirimden yararlanan müşteri yok.</p>}
              </div>

              <div className={`rounded-xl border p-4 flex items-start gap-3 ${stats.ciro === 0 ? 'bg-slate-100 border-slate-200 text-slate-500' : netKar < 0 || lowMargin ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                <BarChart3 size={18} className="mt-0.5 shrink-0" />
                <div className="text-sm">
                  {stats.ciro === 0 ? 'Henüz onaylanmış sipariş yok.'
                    : netKar < 0 ? `Dikkat: Sabit giderler sonrası ${fmt(Math.abs(netKar))} zarardasınız. Ciroyu artırın.`
                    : lowMargin ? `Kârlılık düşük (kâr marjı %${margin.toFixed(1)}). Fiyat/maliyetleri gözden geçirin.`
                    : `İlerleme pozitif! Kâr marjı %${margin.toFixed(1)}, net kâr ${fmt(netKar)}.`}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Sabit Giderler</label>
                <input type="number" value={sabitGider} onChange={(e) => setSabitGider(e.target.value)} placeholder="0" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-700 mb-3">Ciro & Kâr Grafiği</h3>
                {series.labels.length === 0 ? <p className="text-slate-400 text-sm">Veri bekleniyor...</p> : (
                  <Line data={{ labels: series.labels, datasets: [{ label: 'Ciro', data: series.ciroArr, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)', fill: true, tension: 0.35, pointRadius: 0 }, { label: 'Kâr', data: series.karArr, borderColor: '#0F7C45', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.35, pointRadius: 0 }] }} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { beginAtZero: true } } }} />
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-700 mb-3">Satıcı Performansı</h3>
                {saticiPerf.length === 0 ? <p className="text-slate-400 text-sm">Veri yok</p> : (
                  <div className="space-y-2">{saticiPerf.map(([ad, v]) => (
                    <div key={ad} className="flex items-center justify-between text-sm"><span className="text-slate-600">{ad}</span><span className="text-slate-400">{v.adet} satış · <strong className="text-green-600">{fmt(v.ciro)}</strong></span></div>
                  ))}</div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-700 mb-3">Günün En Çok Alışveriş Yapanları</h3>
                {enCokMusteri.length === 0 ? <p className="text-slate-400 text-sm">Veri yok</p> : (
                  <div className="space-y-2">{enCokMusteri.map(([ad, v], i) => (
                    <div key={ad} className="flex items-center justify-between text-sm"><span className="text-slate-600">{i + 1}. {ad}</span><span className="text-slate-400">{v.adet} ürün · <strong>{fmt(v.ciro)}</strong></span></div>
                  ))}</div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-700 mb-3">En Çok Satan Ürünler</h3>
                {enCokUrun.length === 0 ? <p className="text-slate-400 text-sm">Veri yok</p> : (
                  <div className="space-y-2">{enCokUrun.map(([ad, adet], i) => (
                    <div key={ad} className="flex items-center justify-between text-sm"><span className="text-slate-600">{i + 1}. {ad}</span><span className="text-slate-400">{adet} adet</span></div>
                  ))}</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Yorum düzeltme modalı: kod/beden otomatik çözülemediğinde elle düzeltip işle */}
      {duzeltModal && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setDuzeltModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800 mb-1">Siparişi Düzelt & İşle</h3>
            <p className="text-[11px] text-slate-400 mb-3 break-words">Yorum: <span className="text-slate-600">{duzeltModal.raw}</span></p>
            <label className="block text-xs font-medium text-slate-500 mb-1">Kullanıcı</label>
            <input value={duzeltModal.user} onChange={(e) => setDuzeltModal({ ...duzeltModal, user: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300 mb-3" />
            <div className="grid grid-cols-2 gap-2 mb-1">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Satış Kodu</label>
                <input value={duzeltModal.kod} onChange={(e) => setDuzeltModal({ ...duzeltModal, kod: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Beden</label>
                <input value={duzeltModal.beden} onChange={(e) => setDuzeltModal({ ...duzeltModal, beden: e.target.value })} placeholder="XL / 2XL / -" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
            </div>
            {(() => { const r = resolveCodeBeden(`${duzeltModal.kod} ${duzeltModal.beden}`.trim()); return r.product ? <p className="text-[11px] text-emerald-600 mb-3">✓ {r.product.ad}{r.beden ? ' · ' + r.beden : ''}</p> : <p className="text-[11px] text-amber-500 mb-3">Ürün yerelde bulunamadı — yine de işlenirse sunucu çözmeyi dener.</p>; })()}
            <div className="flex gap-2">
              <button onClick={() => setDuzeltModal(null)} className="flex-1 py-2 text-sm font-medium text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200">Vazgeç</button>
              <button onClick={islaDuzelt} disabled={busy} className="flex-1 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{busy ? 'İşleniyor...' : 'İşle'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Sürüklenebilir / boyutlandırılabilir yorum akışı penceresi (arka plan yok → ekranı engellemez) */}
      {feedWin.open && (
        <div className="fixed z-[60] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden" style={{ left: feedPos.x, top: feedPos.y, width: feedSize.w, height: feedSize.h }}>
          <div onMouseDown={startFeedDrag} className={`flex items-center justify-between px-3 py-2 border-b border-slate-100 select-none bg-slate-50/90 ${feedWin.pinned ? '' : 'cursor-move'}`}>
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><Video size={13} className="text-emerald-600" /> Yorum Akışı <span className="text-slate-400">{mergedFeed.length}</span></span>
            <div className="flex items-center gap-1">
              <button onClick={() => setFeedWin((w) => ({ ...w, pinned: !w.pinned }))} title={feedWin.pinned ? 'Sabit — taşıma/boyutlandırma kapalı' : 'Bulunduğu yere sabitle'} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 ${feedWin.pinned ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}><Pin size={11} /> {feedWin.pinned ? 'Sabit' : 'Sabitle'}</button>
              <button onClick={() => setFeedWin((w) => ({ ...w, open: false }))} className="text-slate-400 hover:text-slate-600 p-0.5"><X size={15} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {mergedFeed.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-6">Henüz yorum gelmedi…</p> : mergedFeed.map((c: any) => {
              const done = c.matched || islenenIds[String(c.id)];
              return (
                <div key={c._src + c.id} className={`text-xs rounded-lg p-2 border ${done ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700 truncate flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c._src === 'fb' ? 'bg-blue-500' : 'bg-pink-500'}`} />{c.name}</span>
                    {done ? <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">✓ işlendi</span> : <button onClick={() => islaComment(c)} className="text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold shrink-0 hover:bg-emerald-700">İşle</button>}
                  </div>
                  <p className="text-slate-500 break-words">{c.message}</p>
                </div>
              );
            })}
          </div>
          {!feedWin.pinned && (
            <div onMouseDown={startFeedResize} title="Yeniden boyutlandır" className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize text-slate-300 flex items-end justify-end p-0.5"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M9 1 L9 9 L1 9" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></div>
          )}
        </div>
      )}

      {/* Şans Çarkı modalı */}
      {cark.open && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={() => !cark.spinning && closeCark()}>
          <div className="bg-white rounded-3xl w-full max-w-md p-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Şans Çarkı</h3>
            <p className="text-xs text-slate-400 mb-6">Canlı yorumlardan rastgele talihli seçiliyor…</p>
            <div className={`mx-auto rounded-2xl py-10 px-4 mb-6 ${cark.spinning ? 'bg-gradient-to-r from-fuchsia-100 to-amber-100 animate-pulse' : (cark.registered ? 'bg-gradient-to-r from-emerald-100 to-teal-100' : 'bg-slate-100')}`}>
              <div className={`font-extrabold tracking-wide ${cark.spinning ? 'text-2xl text-fuchsia-600' : 'text-3xl text-slate-800'} break-words`}>{cark.current || '—'}</div>
            </div>
            {cark.spinning ? (
              <p className="text-sm font-medium text-fuchsia-600 animate-pulse">Çark dönüyor…</p>
            ) : cark.winner ? (
              <div className="space-y-3">
                <p className="text-base font-bold text-slate-800">🎉 Talihli: <span className="text-fuchsia-600">{cark.winner}</span></p>
                {cark.registered ? (
                  <div className="inline-block bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-xl">Kayıtlı müşteri — TALİHLİ İLAN EDİLDİ</div>
                ) : (
                  <div className="inline-block bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-xl">Müşterilerim'de kayıt yok</div>
                )}
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button onClick={spinCark} className="px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-fuchsia-500 to-amber-500 text-white hover:opacity-90">Tekrar Çevir</button>
                  <button onClick={closeCark} className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">Kapat</button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// Onaylı siparişi bulunan müşteri listesi + WhatsApp + kapora + toplu ödeme talebi
function OnayliMusteriler({ orders, customers }: { orders: any[]; customers: any[] }) {
  const normU = (s: string) => (s || '').toLowerCase().replace(/^@/, '').trim();
  const grup = useMemo(() => {
    const m: Record<string, { user: string; ad: string; telefon: string; instagram: string; adet: number; tutar: number }> = {};
    for (const o of orders) {
      if (o.durum !== 'onaylandi' || !o.user) continue;
      const key = normU(o.user);
      const c = customers.find((x: any) => normU(x.instagram || '') === key);
      if (!m[key]) m[key] = { user: o.user, ad: c?.ad || o.user, telefon: c?.telefon || '', instagram: c?.instagram || o.user, adet: 0, tutar: 0 };
      m[key].adet += 1; m[key].tutar += Number(o.tutar) || 0;
    }
    return Object.values(m).sort((a, b) => b.tutar - a.tutar);
  }, [orders, customers]);

  const LSKEY = 'canli_kapora';
  const [kapora, setKapora] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(LSKEY) || '{}'); } catch { return {}; } });
  const toggleKapora = (u: string) => setKapora((k) => { const n = { ...k, [normU(u)]: !k[normU(u)] }; localStorage.setItem(LSKEY, JSON.stringify(n)); return n; });
  const [modal, setModal] = useState(false);
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [tplId, setTplId] = useState(''); const [sending, setSending] = useState(false);

  const openOdeme = async () => {
    setModal(true);
    try { const r = await api.get('/whatsapp/templates'); setTemplates((r.data?.templates || []).filter((t: any) => t.status === 'approved')); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const gonder = async () => {
    if (!tplId) { toast.error('Onaylı şablon seçin'); return; }
    const hedef = grup.filter((g) => !kapora[normU(g.user)] && g.telefon);
    if (hedef.length === 0) { toast.error('Kapora tiki olmayan ve telefonu olan müşteri yok'); return; }
    setSending(true); let ok = 0;
    for (const g of hedef) { try { await api.post('/whatsapp/send', { phone: String(g.telefon).replace(/\D/g, ''), templateId: tplId, channel: 'api' }); ok++; } catch { /* */ } }
    setSending(false); setModal(false); toast.success(`${ok}/${hedef.length} müşteriye ödeme talebi gönderildi`);
  };

  if (grup.length === 0) return null;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(true)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700"><Users size={14} /> Onaylı Siparişli Müşteriler ({grup.length})</button>
      {open && (
      <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-white border border-slate-200 rounded-xl p-3 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">Onaylı Siparişli Müşteriler ({grup.length})</p>
        <div className="flex items-center gap-2">
          <button onClick={openOdeme} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Send size={12} /> Ödeme İste</button>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
      </div>
      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {grup.map((g) => (
          <div key={g.user} className="flex items-center gap-2 text-xs border-b border-slate-50 py-1.5">
            <label className="inline-flex items-center gap-1 cursor-pointer shrink-0" title="Kapora alındı">
              <input type="checkbox" checked={!!kapora[normU(g.user)]} onChange={() => toggleKapora(g.user)} className="w-3.5 h-3.5 accent-amber-500" />
              <Tag size={11} className={kapora[normU(g.user)] ? 'text-amber-500' : 'text-slate-300'} />
            </label>
            <div className="min-w-0 flex-1"><p className="text-slate-800 truncate">{g.ad}</p><p className="text-[10px] text-pink-600 truncate">@{normU(g.instagram)}</p></div>
            <span className="text-slate-500 shrink-0">{g.adet} ürün · {fmt(g.tutar)}</span>
            <button onClick={() => g.telefon ? openChat(String(g.telefon).replace(/\D/g, ''), g.ad) : toast.error('Telefon yok')} title="WhatsApp Sohbet" className="p-1 rounded hover:bg-green-50 text-green-600 shrink-0"><Send size={13} /></button>
          </div>
        ))}
      </div>
      </div>
      </div>
      )}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><p className="font-bold text-slate-800">Ödeme Talebi Gönder</p><button onClick={() => setModal(false)} className="text-slate-400"><X size={18} /></button></div>
            <p className="text-xs text-slate-500 mb-2">Kapora tiki <b>olmayan</b> ve telefonu olan {grup.filter((g) => !kapora[normU(g.user)] && g.telefon).length} müşteriye onaylı şablon gönderilecek.</p>
            <label className="block text-xs text-slate-400 mb-1">Meta Onaylı Şablon</label>
            <select value={tplId} onChange={(e) => setTplId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm mb-3"><option value="">Şablon seçin...</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name || t.baslik || t.id}</option>)}</select>
            <div className="flex justify-end gap-2"><button onClick={() => setModal(false)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg">İptal</button><button onClick={gonder} disabled={sending} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg disabled:opacity-50">{sending ? 'Gönderiliyor...' : 'Gönder'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
