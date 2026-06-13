import { useState, useMemo, useEffect } from 'react';
import { Clock, TrendingUp, Wallet, ShoppingBag, Users, BarChart3, Radio, Square, Send, X, Filter, Trash2, History, UserCircle, Plus, Search, UserPlus, Tag, Brain, AlertTriangle, Lightbulb, Sparkles, Package, Target, Share2, Video, MessageSquare, Link2, Unlink } from 'lucide-react';
import { Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

ChartJS.register(ArcElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => (s || '').toLowerCase().replace(/^@/, '').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').trim();
const hhmm = (iso: string) => { try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
// Kod karşılaştırma anahtarı: küçük harf + TR sadeleştirme + harf/rakam dışını at
const codeKey = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');
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

export default function CanliYayinSatis() {
  const { products, customers, categories, campaigns, storeSetting, reload } = useStore();
  const [stream, setStream] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [freeProducts, setFreeProducts] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [satici, setSatici] = useState('');
  const [sellers, setSellers] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('cy_sellers') || '[]'); } catch { return []; } });
  const [search, setSearch] = useState('');
  const [barkodModal, setBarkodModal] = useState<any>(null);
  const [flash, setFlash] = useState<Record<string, { price: number; exp: number }>>({});
  const [barHistory, setBarHistory] = useState<any[]>([]);
  const [barHistModal, setBarHistModal] = useState(false);
  const [iptalAday, setIptalAday] = useState<any>(null);
  const katalogGoster = ((storeSetting?.config as any)?.canliKatalogGoster) !== false; // varsayılan açık
  const setKatalogGoster = async (val: boolean) => {
    try { await api.put('/store/settings', { config: { ...((storeSetting?.config as any) || {}), canliKatalogGoster: val } }); toast.success(val ? 'Yayındaki ürünler katalogda gösterilecek' : 'Yayındaki ürünler katalogda gizlenecek'); reload(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const [araQ, setAraQ] = useState('');
  const [fbStatus, setFbStatus] = useState<{ connected: boolean; videoId: string | null; feed: any[] }>({ connected: false, videoId: null, feed: [] });
  const [fbModal, setFbModal] = useState(false);
  const [fbForm, setFbForm] = useState({ videoId: '', token: '' });
  const [fbBusy, setFbBusy] = useState(false);
  const [igStatus, setIgStatus] = useState<{ connected: boolean; igUserId: string | null; feed: any[]; saved?: boolean }>({ connected: false, igUserId: null, feed: [], saved: false });
  const [igModal, setIgModal] = useState(false);
  const [igForm, setIgForm] = useState({ token: '' });
  const [igBusy, setIgBusy] = useState(false);
  const [imgZoom, setImgZoom] = useState('');
  const [leftTab, setLeftTab] = useState<'manuel' | 'sohbet'>('manuel');
  const [discForm, setDiscForm] = useState({ price: '', dakika: '' });
  const [tab, setTab] = useState<'tumu' | 'kayit' | Durum>('tumu');
  const [reportOpen, setReportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [lightbox, setLightbox] = useState('');
  const [sabitGider, setSabitGider] = useState('');
  const [busy, setBusy] = useState(false);
  const [kayitModal, setKayitModal] = useState(false);
  const [kayitForm, setKayitForm] = useState({ ad: '', instagram: '', telefon: '' });
  const [kampOpen, setKampOpen] = useState(false);
  const kampEmpty = { ad: '', tip: 'urun_adet', minAdet: '3', minTutar: '', indirimTip: 'yuzde', indirimDeger: '10', kapsam: 'hepsi', kategoriId: '', productId: '' };
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
    try { await api.post('/store/campaigns', body); toast.success('Kampanya eklendi'); setKampForm(kampEmpty); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const toggleKampanya = async (k: any) => { try { await api.patch(`/store/campaigns/${k.id}`, { aktif: !k.aktif }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
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
      await api.post('/store/live/musteri', kayitForm);
      toast.success('Müşteri kaydedildi, rezerve siparişleri onaylandı');
      setKayitModal(false); setKayitForm({ ad: '', instagram: '', telefon: '' });
      loadActive(); reload();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const loadActive = async () => {
    try { const r = await api.get('/store/live/active'); setStream(r.data.stream); setOrders(r.data.orders || []); } catch { /* */ }
  };
  useEffect(() => { loadActive(); }, []);

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

  // Facebook canlı yorum durumu + akışı
  const loadFb = async () => {
    try { const r = await api.get('/store/live/fb/status'); setFbStatus(r.data); } catch { /* */ }
  };
  const fbConnect = async () => {
    if (!fbForm.videoId.trim() || !fbForm.token.trim()) { toast.error('Video ID/URL ve token gerekli'); return; }
    setFbBusy(true);
    try {
      await api.post('/store/live/fb/connect', { videoId: fbForm.videoId.trim(), token: fbForm.token.trim() });
      toast.success('Facebook yayını bağlandı — yorumlar otomatik çekilecek');
      setFbModal(false); setFbForm({ videoId: '', token: '' }); loadFb();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setFbBusy(false); }
  };
  const fbDisconnect = async () => {
    setFbBusy(true);
    try { await api.post('/store/live/fb/disconnect'); toast.success('Facebook bağlantısı kesildi'); loadFb(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setFbBusy(false); }
  };

  // Instagram canlı yorum durumu + akışı
  const loadIg = async () => {
    try { const r = await api.get('/store/live/ig/status'); setIgStatus(r.data); } catch { /* */ }
  };
  const igConnect = async () => {
    if (!igForm.token.trim()) { toast.error('Instagram erişim token gerekli'); return; }
    setIgBusy(true);
    try {
      await api.post('/store/live/ig/connect', { token: igForm.token.trim() });
      toast.success('Instagram yayını bağlandı — yorumlar otomatik çekilecek');
      setIgModal(false); setIgForm({ token: '' }); loadIg();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setIgBusy(false); }
  };
  const igDisconnect = async () => {
    setIgBusy(true);
    try { await api.post('/store/live/ig/disconnect'); toast.success('Instagram bağlantısı kesildi'); loadIg(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setIgBusy(false); }
  };

  // Depo + drop ürünleri birleşik liste (arama / barkod / satış bu liste üzerinden)
  const allProds = useMemo(() => [...freeProducts, ...products], [freeProducts, products]);

  // Periyodik yenileme: musteri kaydi/onay durumlarini anlik yansit
  useEffect(() => {
    if (!stream) return;
    loadFb();
    loadIg();
    const t = setInterval(() => { loadActive(); loadFree(); reload(); }, 4000);
    const tSocial = setInterval(() => { loadFb(); loadIg(); }, 8000);
    return () => { clearInterval(t); clearInterval(tSocial); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream]);

  // Süre sayaci (yayin baslangicindan)
  useEffect(() => {
    if (!stream) { setSeconds(0); return; }
    const calc = () => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(stream.startedAt).getTime()) / 1000)));
    calc(); const t = setInterval(() => { calc(); setViewers(1000 + Math.floor(Math.random() * 400)); }, 1000);
    return () => clearInterval(t);
  }, [stream]);

  const sure = useMemo(() => {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }, [seconds]);

  useEffect(() => {
    if (!lightbox) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Control') setLightbox(''); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox]);

  const imgOf = (productId?: string) => (products.find((p) => p.id === productId)?.images || [])[0] || '';
  const aktifKampanyalar = useMemo(() => (campaigns || []).filter((k: any) => k.aktif), [campaigns]);
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
    let indirim = 0;
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
      if (kInd > 0) indirim += Math.round(kInd * 100) / 100;
    }
    return Math.min(Math.round(indirim * 100) / 100, ara);
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

  const startStream = async () => { try { const r = await api.post('/store/live/start', {}); setStream(r.data); setOrders([]); toast.success('Yeni yayın başladı'); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const endStream = async () => {
    if (!confirm('Yayını sonlandırmak istiyor musunuz? Geçmiş yayınlara taşınacak.')) return;
    try { await api.post('/store/live/end', {}); setStream(null); setOrders([]); toast.success('Yayın sonlandırıldı'); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const openHistory = async () => { try { const r = await api.get('/store/live/history'); setHistory(r.data); setHistoryOpen(true); } catch (e) { toast.error(apiErrorMessage(e)); } };

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

  const isRegistered = (u: string) => {
    const n = norm(u); const tel = u.replace(/\D/g, '');
    return customers.some((c) => (n && (norm(c.ad) === n || norm(c.instagram || '') === n)) || (tel.length >= 7 && (c.telefon || '').replace(/\D/g, '') === tel));
  };
  const activeFlash = (productId?: string) => { if (!productId) return 0; const f = flash[productId]; return f && f.exp > Date.now() ? f.price : 0; };

  const addSeller = () => {
    const name = (satici || '').trim();
    if (!name) { toast.error('Satıcı adı girin'); return; }
    if (!sellers.includes(name)) { const next = [...sellers, name]; setSellers(next); localStorage.setItem('cy_sellers', JSON.stringify(next)); }
    toast.success(`Satıcı: ${name}`);
  };

  // "A12", "M A12", "A12 M" gibi girişten ürün + beden çöz (sıra önemli değil)
  const resolveCodeBeden = (raw: string): { product?: any; beden?: string; code: string } => {
    const toks = String(raw || '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return { code: '' };
    for (let i = 0; i < toks.length; i++) {
      const p = findByCode(toks[i]);
      if (p) {
        let beden: string | undefined;
        if ((p.variations || []).length) {
          for (let j = 0; j < toks.length; j++) {
            if (j === i) continue;
            const v = (p.variations || []).find((x: any) => norm(x.deger) === norm(toks[j]));
            if (v) { beden = v.deger; break; }
          }
        }
        return { product: p, beden, code: toks[i] };
      }
    }
    return { code: toks[0] };
  };

  const openProduct = (p: any, preBeden?: string) => {
    setBarkodModal({ ...p, _preBeden: preBeden || null }); setDiscForm({ price: '', dakika: '' });
    setBarHistory((h) => [{ id: Date.now(), productId: p.id, ad: p.ad, kod: p.salesCode || '-', barkod: p.barkod || '-', stok: p.stokAdeti || 0, time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }, ...h.filter((x) => x.productId !== p.id)].slice(0, 30));
    if (!p._drop && katalogGoster) api.post('/store/catalog/add', { productId: p.id }).catch(() => {});
  };
  const openByCode = (code: string) => {
    const { product, beden } = resolveCodeBeden(code);
    if (!product) { toast.error('Ürün bulunamadı: ' + code); return; }
    openProduct(product, beden);
  };
  // Ürün ara (ad / satış kodu / marka / beden / cinsiyet)
  const araSonuc = useMemo(() => {
    const q = norm(araQ); if (!q) return [];
    return allProds.filter((p: any) => {
      const hay = [p.ad, p.salesCode, p.barkod, p.marka, p.cinsiyet, ...(p.variations || []).map((v: any) => v.deger)].map((x: any) => norm(String(x || ''))).join(' ');
      return hay.includes(q);
    }).slice(0, 30);
  }, [araQ, allProds]);

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

  const setFlashDiscount = () => {
    if (!barkodModal) return;
    const price = Number(discForm.price); const dk = Number(discForm.dakika);
    if (!(price > 0) || !(dk > 0)) { toast.error('Geçerli fiyat ve süre girin'); return; }
    const exp = Date.now() + dk * 60000;
    setFlash((f) => ({ ...f, [barkodModal.id]: { price, exp } }));
    if (katalogGoster) api.post('/store/catalog/add', { productId: barkodModal.id, flashFiyat: price, flashBitis: new Date(exp).toISOString() }).catch(() => {});
    toast.success(`${barkodModal.ad}: ${dk} dk boyunca ${price}₺ indirimli`);
    setBarkodModal(null);
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
      const { product: p, beden, code } = resolveCodeBeden(rest);
      // Satışa uygun ürün yoksa satır açma — boş/geçersiz kod phantom sipariş oluşturmasın
      if (!p) { atlanan++; continue; }
      // Varyasyonlu üründe beden zorunlu — beden yoksa sipariş açma
      if ((p.variations || []).length > 0 && !beden) { atlanan++; continue; }
      try {
        await api.post('/store/live/order', { streamId: stream.id, user, kod: code, beden: beden || '', productId: p._drop ? undefined : p.id, freeProductId: p._drop ? p.id : undefined, variation: beden, urun: p.ad || code, saticiAd: satici || null, fiyatOverride: activeFlash(p.id) });
        islenen++;
      } catch { /* */ }
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

  // İstatistikler (onaylanan = ciro; iptal haric). Ciro/kâr kampanya indirimi düşülmüş NET değerdir.
  const stats = useMemo(() => {
    const ona = orders.filter((o) => o.durum === 'onaylandi');
    const brutCiro = ona.reduce((s, o) => s + o.tutar, 0);
    const maliyet = ona.reduce((s, o) => s + o.alis, 0);
    // Müşteri bazında kampanya indirimi + kampanyadan yararlanan kişi sayısı
    const byUser: Record<string, any[]> = {};
    ona.forEach((o) => { (byUser[o.user] = byUser[o.user] || []).push(o); });
    let kampanyaIndirimi = 0; let kampanyaYararlanan = 0;
    for (const u in byUser) { const d = kampIndirimiHesapla(byUser[u]); if (d > 0) { kampanyaIndirimi += d; kampanyaYararlanan++; } }
    kampanyaIndirimi = Math.round(kampanyaIndirimi * 100) / 100;
    const ciro = Math.max(0, brutCiro - kampanyaIndirimi);
    return {
      brutCiro, kampanyaIndirimi, kampanyaYararlanan,
      ciro, kar: ciro - maliyet, toplam: orders.length,
      onaylandi: ona.length,
      stokYok: orders.filter((o) => o.durum === 'stok_yok').length,
      riskli: orders.filter((o) => o.durum === 'riskli').length,
      kayitGerekli: orders.filter((o) => o.durum !== 'iptal' && !isRegistered(o.user)).length,
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

  // Kâr oranı en yüksek ürünler (satış-alış marjı)
  const enKarliUrunler = useMemo(() => (products || [])
    .filter((p: any) => (p.satisFiyat || 0) > 0 && (p.alisFiyat || 0) > 0 && p.satisFiyat > p.alisFiyat)
    .map((p: any) => ({ ad: p.ad, oran: ((p.satisFiyat - p.alisFiyat) / p.satisFiyat) * 100, kar: p.satisFiyat - p.alisFiyat, stok: p.stokAdeti }))
    .sort((a, b) => b.oran - a.oran)
    .slice(0, 6), [products]);

  // Yapay zeka analizi — yayın temposu (zaman bazlı ortalama), yeni alıcı öngörüsü, stok eritme, projeksiyon
  const aiTick = Math.floor((seconds || 0) / 30); // 30 sn'de bir yenile (satış dursa da uyarsın)
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

  const saticilar = useMemo(() => Array.from(new Set([...sellers, ...orders.map((o) => o.saticiAd).filter(Boolean)])), [sellers, orders]);
  const filtered = useMemo(() => {
    let list = tab === 'tumu' ? orders
      : tab === 'kayit' ? orders.filter((o) => o.durum !== 'iptal' && !isRegistered(o.user))
      : orders.filter((o) => o.durum === tab);
    if (search.trim()) {
      const q = norm(search);
      list = list.filter((o) => [o.user, o.urun, o.kod, o.beden, o.saticiAd].some((f) => norm(f || '').includes(q)));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, tab, search, sellers, customers]);

  const Stat = ({ icon: Ic, label, value, color = 'text-slate-800' }: any) => (
    <div className="flex items-center gap-3 px-4">
      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><Ic size={18} className="text-slate-500" /></div>
      <div><p className="text-[10px] text-slate-400 uppercase">{label}</p><p className={`text-lg font-bold ${color}`}>{value}</p></div>
    </div>
  );

  return (
    <div>
      {/* Ust bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 pr-3">
          <h1 className="text-lg font-bold text-slate-800">Canlı Yayın Satış</h1>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${stream ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{stream ? 'CANLI' : 'KAPALI'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 flex-1 border-l border-slate-100">
          <Stat icon={Clock} label="Süre" value={stream ? sure : '--:--:--'} />
          <Stat icon={TrendingUp} label="Ciro" value={fmt(stats.ciro)} color="text-green-600" />
          {stats.kampanyaIndirimi > 0 && <Stat icon={Tag} label="Kampanya İnd." value={'-' + fmt(stats.kampanyaIndirimi)} color="text-amber-600" />}
          <Stat icon={Wallet} label="Tahmini Kâr" value={fmt(stats.kar)} color="text-indigo-600" />
          <Stat icon={ShoppingBag} label="Sipariş" value={stats.onaylandi} />
          <Stat icon={ShoppingBag} label="Alışveriş Yapan" value={String(alisverisYapan)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openHistory} className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200"><History size={16} /> Geçmiş</button>
          <button onClick={() => setKampOpen(true)} className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-200"><Tag size={16} /> Kampanyalar</button>
          <button onClick={() => setReportOpen(true)} className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200"><BarChart3 size={16} /> Raporlar</button>
          {stream && (
            <button onClick={() => setFbModal(true)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${fbStatus.connected ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}><Video size={16} /> {fbStatus.connected ? 'FB Bağlı' : 'Facebook'}</button>
          )}
          {stream && (
            <button onClick={() => setIgModal(true)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${(igStatus.connected || igStatus.saved) ? 'bg-pink-600 text-white hover:bg-pink-700' : 'bg-pink-50 text-pink-600 hover:bg-pink-100'}`}><Video size={16} /> {igStatus.connected ? 'IG Bağlı' : igStatus.saved ? 'IG Kayıtlı' : 'Instagram'}</button>
          )}
          {!stream ? (
            <button onClick={startStream} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><Radio size={16} /> Yeni Yayın</button>
          ) : (
            <button onClick={endStream} className="inline-flex items-center gap-2 bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-600"><Square size={16} /> Yayını Durdur</button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        {/* Sol */}
        <div className="space-y-4">
          {/* Barkod / Ürün Ara */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} className="text-indigo-600" /> Ürün Bul</h3>
              <div className="flex items-center gap-1">
                <button onClick={() => setKatalogGoster(!katalogGoster)} title="Yayında okutulan/yazılan ürünleri herkese açık katalogda göster" className={`text-[11px] px-2 py-1 rounded-lg inline-flex items-center gap-1 border ${katalogGoster ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${katalogGoster ? 'bg-emerald-500' : 'bg-slate-400'}`} /> Katalogda Göster: {katalogGoster ? 'Açık' : 'Kapalı'}
                </button>
                {storeSetting?.slug && <button onClick={() => { navigator.clipboard?.writeText(`${location.origin}/katalog/${storeSetting.slug}`); toast.success('Katalog linki kopyalandı'); }} className="text-[11px] text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg inline-flex items-center gap-1"><Share2 size={13} /> Katalog Linki</button>}
                <button onClick={() => setBarHistModal(true)} className="text-[11px] text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg inline-flex items-center gap-1"><History size={13} /> Geçmiş{barHistory.length > 0 && <span className="bg-indigo-100 text-indigo-700 px-1.5 rounded-full text-[10px]">{barHistory.length}</span>}</button>
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
                className="w-full pl-8 pr-16 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
                autoFocus
              />
              <button onClick={() => { const r = resolveCodeBeden(araQ); if (r.product) { openProduct(r.product, r.beden); setAraQ(''); } else if (araSonuc.length === 1) { openProduct(araSonuc[0]); setAraQ(''); } else if (araQ.trim()) { toast.error('Ürün bulunamadı'); } }} className="absolute right-1 top-1 bottom-1 bg-slate-800 text-white px-3 rounded-md hover:bg-slate-700 text-xs font-medium">Bul</button>
            </div>
            {araQ && (
              <div className="mt-2 max-h-56 overflow-y-auto space-y-1 border border-slate-100 rounded-lg p-1">
                {araSonuc.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-4">Sonuç yok — barkod okutun veya kod yazıp Enter'a basın.</p> : araSonuc.map((p: any) => {
                  const fl = activeFlash(p.id); const ind = fl > 0 ? fl : (p.eskiFiyat && p.eskiFiyat > p.satisFiyat ? p.satisFiyat : 0);
                  return (
                    <button key={p.id} onClick={() => { openProduct(p); setAraQ(''); }} className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-indigo-50 text-left">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">{(p.images || [])[0] && <img src={p.images[0]} className="w-full h-full object-cover" />}</div>
                      <div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-800 truncate flex items-center gap-1">{p.ad}{p._drop && <span className="bg-green-500 text-white text-[8px] px-1 py-0.5 rounded-full font-bold shrink-0">drop</span>}</p><p className="text-[10px] text-slate-400 truncate">{p.salesCode || '-'} · {p._drop ? (p.supplierAd || 'Tedarikçi') : (p.marka || '-')} · {p.cinsiyet || ''}</p></div>
                      <div className="text-right shrink-0"><p className="text-xs font-bold text-slate-700">{fmt(fl > 0 ? fl : p.satisFiyat)}</p><p className="text-[9px] text-slate-400">{(p.stokAdeti || 0)} adet</p>{ind > 0 && <span className="text-[8px] text-rose-500">indirimli</span>}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Ürün stok kartı — sabit (her zaman görünür) */}
            <div className="mt-3 border border-slate-200 bg-slate-50/60 rounded-xl p-3 min-h-[120px]">
              {barkodModal ? (
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <button onClick={() => (barkodModal.images || [])[0] && setImgZoom(barkodModal.images[0])} className="w-14 h-14 rounded-lg bg-white border border-slate-100 overflow-hidden shrink-0 cursor-zoom-in" title="Büyüt">{(barkodModal.images || [])[0] ? <img src={barkodModal.images[0]} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={18} /></span>}</button>
                      <div className="min-w-0"><p className="font-semibold text-slate-800 text-sm leading-tight truncate flex items-center gap-1">{barkodModal.ad}{barkodModal._drop && <span className="bg-green-500 text-white text-[8px] px-1 py-0.5 rounded-full font-bold shrink-0">drop</span>}</p><p className="text-[10px] text-slate-400 font-mono truncate">Kod: {barkodModal.salesCode || '-'} · Barkod: {barkodModal.barkod || '-'}</p></div>
                    </div>
                    <button onClick={() => setBarkodModal(null)} className="p-1 hover:bg-white rounded-lg shrink-0" title="Temizle"><X size={16} className="text-slate-400" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white rounded-lg p-2 border border-slate-100"><p className="text-[10px] text-slate-400">Güncel Stok</p><p className={`font-bold ${(barkodModal.stokAdeti || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>{barkodModal.stokAdeti || 0} adet</p></div>
                    <div className="bg-white rounded-lg p-2 border border-slate-100"><p className="text-[10px] text-slate-400">Satış Fiyatı</p>{barkodModal.eskiFiyat && barkodModal.eskiFiyat > barkodModal.satisFiyat ? <p className="font-bold text-slate-700"><span className="text-[10px] text-slate-300 line-through mr-1">{fmt(barkodModal.eskiFiyat)}</span>{fmt(barkodModal.satisFiyat || 0)}</p> : <p className="font-bold text-slate-700">{fmt(barkodModal.satisFiyat || 0)}</p>}</div>
                  </div>
                  {(barkodModal.variations || []).length > 0 ? (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase mb-1">Varyasyon / Beden Stoğu{barkodModal._preBeden && <span className="ml-1 text-indigo-500 normal-case">· seçilen: <b>{barkodModal._preBeden}</b></span>}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {barkodModal.variations.map((v: any) => <span key={v.id} className={`text-xs px-2 py-1 rounded-lg border ${barkodModal._preBeden && norm(v.deger) === norm(barkodModal._preBeden) ? 'ring-2 ring-indigo-400 ' : ''}${v.stok > 0 ? 'bg-white border-slate-200 text-slate-700' : 'bg-red-50 border-red-200 text-red-500 line-through'}`}>{v.deger}: <b>{v.stok}</b></span>)}
                      </div>
                    </div>
                  ) : <p className="text-[10px] text-slate-400">Varyasyon yok (tek stok).</p>}
                  {activeFlash(barkodModal.id) > 0 && <p className="text-xs text-green-600 font-medium">Aktif süreli indirim: {fmt(activeFlash(barkodModal.id))}</p>}
                  <div className="border-t border-slate-200 pt-2">
                    <p className="text-[11px] font-medium text-slate-700 mb-1.5">Süreli İndirimli Fiyat</p>
                    <div className="flex gap-2 mb-2">
                      <input type="number" value={discForm.price} onChange={(e) => setDiscForm({ ...discForm, price: e.target.value })} placeholder="İndirimli ₺" className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg" />
                      <input type="number" value={discForm.dakika} onChange={(e) => setDiscForm({ ...discForm, dakika: e.target.value })} placeholder="dk" className="w-14 shrink-0 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                    </div>
                    <button onClick={setFlashDiscount} className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700">Süreli İndirimi Başlat</button>
                    <p className="text-[10px] text-slate-400 mt-1">Yalnızca bu süre içinde gelen siparişler indirimli işlenir; katalogda geri sayım görünür.</p>
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

          {/* Facebook canlı yorum akışı */}
          {fbStatus.connected && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Video size={16} className="text-blue-600" /> Facebook Yorumları</h3>
                <button onClick={fbDisconnect} disabled={fbBusy} className="text-[11px] text-rose-500 hover:bg-rose-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 disabled:opacity-50"><Unlink size={12} /> Kes</button>
              </div>
              <p className="text-[10px] text-slate-400 mb-2">Yorumdaki satış kodu/barkod otomatik siparişe dönüşür. <span className="text-green-600 font-medium">Yeşil</span> = sipariş açıldı.</p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {fbStatus.feed.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-4">Henüz yorum gelmedi…</p> : fbStatus.feed.map((c: any) => (
                  <div key={c.id} className={`text-xs rounded-lg p-2 border ${c.matched ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700 truncate">{c.name}</span>
                      {c.matched ? <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">✓ {c.urun ? String(c.urun).slice(0, 14) : 'sipariş'}</span> : <MessageSquare size={11} className="text-slate-300 shrink-0" />}
                    </div>
                    <p className="text-slate-500 break-words">{c.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instagram canlı yorum akışı */}
          {igStatus.connected && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Video size={16} className="text-pink-600" /> Instagram Yorumları</h3>
                <button onClick={igDisconnect} disabled={igBusy} className="text-[11px] text-rose-500 hover:bg-rose-50 px-2 py-1 rounded-lg inline-flex items-center gap-1 disabled:opacity-50"><Unlink size={12} /> Kes</button>
              </div>
              <p className="text-[10px] text-slate-400 mb-2">Canlı yayındaki yorumlar otomatik çekilir; satış kodu/barkod geçen yorum siparişe dönüşür. <span className="text-green-600 font-medium">Yeşil</span> = sipariş açıldı.</p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {igStatus.feed.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-4">Henüz yorum gelmedi…</p> : igStatus.feed.map((c: any) => (
                  <div key={c.id} className={`text-xs rounded-lg p-2 border ${c.matched ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700 truncate">{c.name}</span>
                      {c.matched ? <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">✓ {c.urun ? String(c.urun).slice(0, 14) : 'sipariş'}</span> : <MessageSquare size={11} className="text-slate-300 shrink-0" />}
                    </div>
                    <p className="text-slate-500 break-words">{c.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manuel Sipariş / Sohbet — sekmeli */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-1 mb-3 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setLeftTab('manuel')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${leftTab === 'manuel' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Manuel Sipariş</button>
              <button onClick={() => setLeftTab('sohbet')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${leftTab === 'sohbet' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Sohbet Akışı <span className="text-slate-400">{orders.length}</span></button>
            </div>
            {leftTab === 'manuel' ? (
              <>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={'kullanıcı satışkodu beden\nahmet SK1024 XL\nmehmet SK0712 M'} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" />
                <p className="text-[10px] text-slate-400 mt-1">Satış kodu depodaki ürünle, beden varyasyonla eşleşir; stok varsa onaylanır.</p>
                <button onClick={parse} disabled={busy || !stream} className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"><Send size={16} /> {busy ? 'İşleniyor...' : 'Siparişleri Ayrıştır & Al'}</button>
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
          {/* Aktif Satıcı — sağ üst */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shrink-0"><UserCircle size={16} className="text-indigo-600" /> Aktif Satıcı{satici && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">{satici}</span>}</span>
            <input value={satici} onChange={(e) => setSatici(e.target.value)} placeholder="Satıcı adı" className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 w-36" />
            <button onClick={addSeller} title="Satıcı kaydet" className="bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700"><Plus size={14} /></button>
            <div className="flex flex-wrap gap-1.5">
              {sellers.map((s) => (<button key={s} onClick={() => setSatici(s)} className={`px-2.5 py-1 rounded-full text-xs ${satici === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s}</button>))}
            </div>
          </div>

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
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${tab === t ? (t === 'kayit' ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white') : (t === 'kayit' && stats.kayitGerekli > 0 ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-500 hover:bg-slate-100')}`}>{l}</button>
            ))}
            <span className="ml-auto flex items-center gap-2">
              <span className="relative">
                <Search size={13} className="absolute left-2 top-1.5 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara (ürün, kod, müşteri, satıcı)" className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-40 sm:w-56 outline-none" />
              </span>
            </span>
          </div>
          <div className="overflow-x-auto max-h-[52vh] overflow-y-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead className="bg-slate-50 text-slate-500 text-left sticky top-0"><tr><th className="px-3 py-2">Kullanıcı</th><th className="px-3 py-2">Ürün</th><th className="px-3 py-2">Kod</th><th className="px-3 py-2">Beden</th><th className="px-3 py-2">Satıcı</th><th className="px-3 py-2">Tutar</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2">Saat</th><th className="px-3 py-2">İşlem</th></tr></thead>
              <tbody>
                {filtered.map((o) => {
                  const img = o.gorsel || imgOf(o.productId);
                  const rowBg = o.durum === 'onaylandi' ? 'bg-green-50' : o.durum === 'rezerve' ? 'bg-blue-50' : o.durum === 'stok_yok' ? 'bg-red-50' : o.durum === 'iptal' ? 'opacity-60' : '';
                  return (
                    <tr key={o.id} className={`border-t border-slate-100 ${rowBg}`}>
                      <td className="px-3 py-2 font-medium text-slate-700"><div className="flex items-center gap-1.5">{o.user}{!isRegistered(o.user) && <><span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full" title="Müşterilerimde kayıtlı değil">Kayıt Yok</span><button onClick={() => { setKayitForm({ ad: '', instagram: o.user, telefon: '' }); setKayitModal(true); }} title="Hızlı müşteri kaydı oluştur" className="text-emerald-600 hover:bg-emerald-50 rounded p-0.5"><UserPlus size={14} /></button></>}</div></td>
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
              </tbody>
            </table>
          </div>
          </div>

          {/* Yapay Zeka Asistanı — kompakt / kuş bakışı */}
          <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0"><Brain size={14} className="text-white" /></div>
              <h3 className="font-bold text-slate-800 text-[13px] leading-none">Yapay Zeka Asistanı</h3>
              <span className="ml-auto text-[10px] text-indigo-500 inline-flex items-center gap-1"><Sparkles size={11} /> Canlı</span>
            </div>
            {/* Canlı metrikler — tek satır kompakt şerit */}
            <div className="grid grid-cols-5 gap-1.5 mb-2.5">
              <div className={`rounded-lg px-2 py-1.5 border text-center ${aiAnaliz.metrik.tempoColor === 'warn' ? 'bg-red-50 border-red-100' : aiAnaliz.metrik.tempoColor === 'good' ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'}`}>
                <p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Tempo</p>
                <p className={`text-[12px] font-bold leading-tight ${aiAnaliz.metrik.tempoColor === 'warn' ? 'text-red-600' : aiAnaliz.metrik.tempoColor === 'good' ? 'text-green-600' : 'text-slate-700'}`}>{aiAnaliz.metrik.tempoLabel}</p>
              </div>
              <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100 text-center">
                <p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Yeni Alıcı</p>
                <p className="text-[12px] font-bold text-indigo-600 leading-tight">{aiAnaliz.metrik.yeniSon10}</p>
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
            {/* Tavsiyeler — kompakt satırlar (en önemli 3) */}
            <div className="space-y-1 mb-2.5">
              {aiTavsiye.slice(0, 3).map((a, i) => {
                const cfg = a.t === 'warn' ? { Ic: AlertTriangle, c: 'text-red-500', bg: 'bg-red-50' } : a.t === 'good' ? { Ic: TrendingUp, c: 'text-green-600', bg: 'bg-green-50' } : { Ic: Lightbulb, c: 'text-amber-500', bg: 'bg-amber-50' };
                const Ic = cfg.Ic;
                return <div key={i} className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 ${cfg.bg}`}><Ic size={13} className={`${cfg.c} shrink-0 mt-px`} /><span className="text-[11px] text-slate-700 leading-snug">{a.m}</span></div>;
              })}
            </div>
            {/* En çok satan + En kârlı — yan yana kompakt */}
            <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-indigo-100">
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

      {/* Okutulan barkod geçmişi — stok kartları modalı */}
      {barHistModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setBarHistModal(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl p-5 max-h-[85vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><History size={18} className="text-indigo-600" /> Okutulan Ürünler</h3>
              <button onClick={() => setBarHistModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            {barHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 text-slate-400">
                <Package size={26} className="mb-2 text-slate-300" />
                <p className="text-sm">Henüz barkod/kod okutulmadı.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {barHistory.map((b) => {
                  const p: any = products.find((x) => x.id === b.productId) || {};
                  const img = (p.images || [])[0] || '';
                  const fl = activeFlash(b.productId);
                  const ind = fl > 0 ? fl : (p.eskiFiyat && p.eskiFiyat > p.satisFiyat ? p.satisFiyat : 0);
                  const kalanVar = (p.variations || []).filter((v: any) => (v.stok || 0) > 0);
                  return (
                    <div key={b.id} className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/60 flex gap-2.5">
                      <button onClick={() => img && setImgZoom(img)} className="w-16 h-16 rounded-lg bg-white border border-slate-100 overflow-hidden shrink-0 cursor-zoom-in" title="Büyüt">{img ? <img src={img} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={18} /></span>}</button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1"><p className="font-semibold text-slate-800 text-xs leading-tight line-clamp-2">{b.ad}</p><span className="text-[9px] text-slate-400 shrink-0">{b.time}</span></div>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">Kod: {p.salesCode || b.kod}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {ind > 0 && p.eskiFiyat ? <span className="text-[9px] text-slate-300 line-through">{fmt(p.eskiFiyat)}</span> : null}
                          <span className={`text-xs font-bold ${ind > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{fmt(fl > 0 ? fl : (p.satisFiyat || 0))}</span>
                          <span className={`text-[9px] font-bold ml-auto ${(p.stokAdeti || 0) > 0 ? 'text-green-600' : 'text-red-500'}`}>{p.stokAdeti ?? b.stok} ad</span>
                        </div>
                        {kalanVar.length > 0 && <div className="flex flex-wrap gap-0.5 mt-1">{kalanVar.slice(0, 6).map((v: any) => <span key={v.id || v.deger} className="text-[8px] px-1 py-0.5 rounded border border-slate-200 text-slate-500 bg-white">{v.deger}:{v.stok}</span>)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {barHistory.length > 0 && (
              <button onClick={() => { setBarHistory([]); setBarHistModal(false); }} className="w-full text-xs text-slate-500 hover:bg-slate-50 border border-slate-200 py-2 rounded-lg">Geçmişi Temizle</button>
            )}
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

      {/* Facebook canlı yayın bağlama modalı */}
      {fbModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={() => setFbModal(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Video size={20} className="text-blue-600" /> Facebook Canlı Yayın</h3>
              <button onClick={() => setFbModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            {fbStatus.connected ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2"><Link2 size={16} /> Bağlı — Video ID: <b className="font-mono">{fbStatus.videoId}</b></div>
                <p className="text-xs text-slate-500">Yorumlar her 5 saniyede bir otomatik çekiliyor. İçinde satış kodu/barkod geçen yorumlar siparişe dönüşür.</p>
                <button onClick={fbDisconnect} disabled={fbBusy} className="w-full inline-flex items-center justify-center gap-2 bg-rose-500 text-white py-2.5 rounded-lg font-medium hover:bg-rose-600 disabled:opacity-50"><Unlink size={16} /> Bağlantıyı Kes</button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">Facebook'ta yayını başlattıktan sonra <b>canlı videonun ID'sini</b> (veya video bağlantısını) ve <b>Sayfa Erişim Token'ınızı</b> yapıştırın.</p>
                <div>
                  <label className="text-[11px] font-medium text-slate-600">Canlı Video ID veya URL</label>
                  <input value={fbForm.videoId} onChange={(e) => setFbForm({ ...fbForm, videoId: e.target.value })} placeholder="örn. 1234567890123456 veya facebook.com/.../videos/123..." className="w-full mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-600">Sayfa Erişim Token (Page Access Token)</label>
                  <textarea value={fbForm.token} onChange={(e) => setFbForm({ ...fbForm, token: e.target.value })} rows={3} placeholder="EAAB... ile başlayan uzun token" className="w-full mt-1 px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 font-mono" />
                </div>
                <button onClick={fbConnect} disabled={fbBusy} className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"><Link2 size={16} /> {fbBusy ? 'Bağlanıyor…' : 'Bağla ve Yorumları Çek'}</button>
                <p className="text-[10px] text-slate-400">Token'ı Facebook Developer panelinden (Graph API Explorer veya Sayfa ayarları) alabilirsiniz. Gerekli izinler: <span className="font-mono">pages_read_engagement</span>.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Instagram canlı yayın bağlama modalı */}
      {igModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={() => setIgModal(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Video size={20} className="text-pink-600" /> Instagram Canlı Yayın</h3>
              <button onClick={() => setIgModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            {(igStatus.connected || igStatus.saved) ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2"><Link2 size={16} /> {igStatus.connected ? 'Yayına bağlı' : 'Kayıtlı'} — Hesap ID: <b className="font-mono">{igStatus.igUserId}</b></div>
                <p className="text-xs text-slate-500">Token <b>kalıcı kaydedildi</b>. Her yayın başlattığınızda otomatik bağlanır — bir daha token girmenize gerek yok. Canlı yayındaki yorumlar 5 sn'de bir çekilir; satış kodu/barkod geçen yorumlar siparişe dönüşür.</p>
                <button onClick={igDisconnect} disabled={igBusy} className="w-full inline-flex items-center justify-center gap-2 bg-rose-500 text-white py-2.5 rounded-lg font-medium hover:bg-rose-600 disabled:opacity-50"><Unlink size={16} /> Kayıtlı Token'ı Kaldır</button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">Instagram <b>erişim token'ınızı</b> yapıştırın. Hesap, token'dan otomatik çözülür. Yayını Instagram'da başlattığınızda yorumlar otomatik çekilmeye başlar.</p>
                <div>
                  <label className="text-[11px] font-medium text-slate-600">Instagram Erişim Token</label>
                  <textarea value={igForm.token} onChange={(e) => setIgForm({ ...igForm, token: e.target.value })} rows={3} placeholder="IGAA... ile başlayan token" className="w-full mt-1 px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-pink-300 font-mono" />
                </div>
                <button onClick={igConnect} disabled={igBusy} className="w-full inline-flex items-center justify-center gap-2 bg-pink-600 text-white py-2.5 rounded-lg font-medium hover:bg-pink-700 disabled:opacity-50"><Link2 size={16} /> {igBusy ? 'Bağlanıyor…' : 'Bağla ve Yorumları Çek'}</button>
                <p className="text-[10px] text-slate-400">Token'ı Meta Developer panelinden (Instagram API ile giriş) alabilirsiniz. Gerekli izin: canlı medya ve yorum okuma.</p>
              </div>
            )}
          </div>
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
              {campaigns.map((k: any) => (
                <div key={k.id} className="flex items-center gap-2 border border-slate-100 rounded-xl p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{k.ad}</p>
                    <p className="text-[11px] text-slate-500">{kampOzet(k)}</p>
                  </div>
                  <button onClick={() => toggleKampanya(k)} className={`text-[10px] px-2 py-1 rounded-full font-medium ${k.aktif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>{k.aktif ? 'Aktif' : 'Pasif'}</button>
                  <button onClick={() => delKampanya(k.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              ))}
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
                  <div><p className="text-[10px] text-slate-400">Kâr</p><p className="font-bold text-indigo-600">{fmt(h.kar)}</p></div>
                </div>
              </div>
            ))}
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
              <div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">Yayın Raporu & Kârlılık</h2><button onClick={() => setReportOpen(false)}><X size={20} className="text-slate-400" /></button></div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Ciro</p><p className="text-lg font-bold text-slate-800">{fmt(stats.ciro)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Brüt Kâr</p><p className="text-lg font-bold text-green-600">{fmt(stats.kar)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Kâr Marjı</p><p className={`text-lg font-bold ${lowMargin ? 'text-red-600' : 'text-indigo-600'}`}>%{margin.toFixed(1)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Net Kâr</p><p className={`text-lg font-bold ${netKar < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt(netKar)}</p></div>
              </div>

              <div className="bg-white rounded-xl border border-amber-200 p-4">
                <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><Tag size={15} className="text-amber-500" /> Kampanya Özeti</h3>
                {stats.kampanyaYararlanan > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-[10px] text-slate-400 uppercase">Yararlanan Müşteri</p><p className="text-lg font-bold text-amber-600">{stats.kampanyaYararlanan} kişi</p></div>
                    <div><p className="text-[10px] text-slate-400 uppercase">Toplam Kampanya İndirimi</p><p className="text-lg font-bold text-amber-600">-{fmt(stats.kampanyaIndirimi)}</p></div>
                  </div>
                ) : <p className="text-slate-400 text-sm">Henüz kampanyadan yararlanan müşteri yok.</p>}
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
                  <Line data={{ labels: series.labels, datasets: [{ label: 'Ciro', data: series.ciroArr, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)', fill: true, tension: 0.35, pointRadius: 0 }, { label: 'Kâr', data: series.karArr, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.35, pointRadius: 0 }] }} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { beginAtZero: true } } }} />
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
    </div>
  );
}
