// Serbest Satış Ekranı — CanliYayinSatis'in tam kopyası
// Fark: /store/live → /store/free, useStore().products yerine yerel freeProducts,
// "Kayıt Aç" paneli (görsel + virgüllü bedenler + adet kutucukları), Satış Extresi
import { useState, useMemo, useEffect, useRef } from 'react';
import { Clock, TrendingUp, Wallet, ShoppingBag, BarChart3, Radio, Square, Send, X, Filter, Trash2, History, UserCircle, Plus, Search, UserPlus, Tag, Brain, AlertTriangle, Lightbulb, Sparkles, Package, Target, Share2, PackagePlus, FileText } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => (s || '').toLowerCase().replace(/^@/, '').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').trim();
const hhmm = (iso: string) => { try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

type Durum = 'onaylandi' | 'rezerve' | 'stok_yok' | 'iptal';
const DURUM_BADGE: Record<string, { t: string; c: string }> = {
  onaylandi: { t: 'Onaylandı', c: 'bg-green-100 text-green-700' },
  rezerve: { t: 'Rezerve', c: 'bg-amber-100 text-amber-700' },
  stok_yok: { t: 'Stok Yok', c: 'bg-red-100 text-red-700' },
  iptal: { t: 'İptal', c: 'bg-rose-100 text-rose-600' },
};

export default function SerbestSatis() {
  const { customers, categories, campaigns, storeSetting, reload } = useStore();

  // ── Geçici ürünler (depodan bağımsız) ──────────────────────────────────────
  const [freeProducts, setFreeProducts] = useState<any[]>([]);
  const loadFreeProducts = async () => { try { const r = await api.get('/store/free/products'); setFreeProducts(r.data || []); } catch { /* */ } };

  // ── Yayın & Siparişler ─────────────────────────────────────────────────────
  const [stream, setStream] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [satici, setSatici] = useState('');
  const [sellers, setSellers] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('ss_sellers') || '[]'); } catch { return []; } });
  const [search, setSearch] = useState('');
  const [barkod, setBarkod] = useState('');
  const [barkodModal, setBarkodModal] = useState<any>(null);
  const [flash, setFlash] = useState<Record<string, { price: number; exp: number }>>({});
  const [barHistory, setBarHistory] = useState<any[]>([]);
  const [barHistModal, setBarHistModal] = useState(false);
  const [scanTab, setScanTab] = useState<'barkod' | 'ara'>('barkod');
  const [araQ, setAraQ] = useState('');
  const [imgZoom, setImgZoom] = useState('');
  const [leftTab, setLeftTab] = useState<'manuel' | 'sohbet'>('manuel');
  const [discForm, setDiscForm] = useState({ price: '', dakika: '' });
  const [tab, setTab] = useState<'tumu' | Durum>('tumu');
  const [reportOpen, setReportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [kayitModal, setKayitModal] = useState(false);
  const [kayitForm, setKayitForm] = useState({ ad: '', instagram: '', telefon: '' });
  const [kampOpen, setKampOpen] = useState(false);
  const [sabitGider, setSabitGider] = useState('');
  const [lightbox, setLightbox] = useState('');

  // ── Satış Extresi ──────────────────────────────────────────────────────────
  const [extreOpen, setExtreOpen] = useState(false);
  const [extreData, setExtreData] = useState<any[]>([]);
  const loadExtre = async () => {
    try { const r = await api.get('/store/free/extract'); setExtreData(r.data || []); setExtreOpen(true); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // ── Kayıt Aç (yeni geçici ürün) ────────────────────────────────────────────
  const [kayitAcOpen, setKayitAcOpen] = useState(false);
  const [kayitAcForm, setKayitAcForm] = useState({ ad: '', bedenler: '', satisFiyat: '', alisFiyat: '', images: [] as string[] });
  const [kayitAcVars, setKayitAcVars] = useState<{ deger: string; stok: number }[]>([]);
  const [kayitAcBusy, setKayitAcBusy] = useState(false);

  const parseBedenler = (s: string) => s.split(',').map((b) => b.trim()).filter(Boolean).map((b) => ({ deger: b, stok: 1 }));

  const onBedenlerChange = (val: string) => {
    setKayitAcForm((f) => ({ ...f, bedenler: val }));
    setKayitAcVars(parseBedenler(val));
  };

  const saveKayitAc = async () => {
    if (!kayitAcForm.ad.trim()) { toast.error('Ürün adı zorunludur'); return; }
    setKayitAcBusy(true);
    try {
      await api.post('/store/free/products', {
        ad: kayitAcForm.ad,
        images: kayitAcForm.images,
        variations: kayitAcVars,
        satisFiyat: Number(kayitAcForm.satisFiyat) || 0,
        alisFiyat: Number(kayitAcForm.alisFiyat) || 0,
      });
      toast.success('Ürün kaydedildi');
      setKayitAcForm({ ad: '', bedenler: '', satisFiyat: '', alisFiyat: '', images: [] });
      setKayitAcVars([]);
      setKayitAcOpen(false);
      await loadFreeProducts();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setKayitAcBusy(false);
  };

  // ── Kampanya ───────────────────────────────────────────────────────────────
  const kampEmpty = { ad: '', tip: 'urun_adet', minAdet: '3', minTutar: '', indirimTip: 'yuzde', indirimDeger: '10', kapsam: 'hepsi', kategoriId: '', productId: '' };
  const [kampForm, setKampForm] = useState<any>(kampEmpty);
  const saveKampanya = async () => {
    if (!kampForm.ad.trim()) { toast.error('Kampanya adı girin'); return; }
    const body: any = { ad: kampForm.ad, aktif: true, tip: kampForm.tip, minAdet: kampForm.tip === 'urun_adet' ? Number(kampForm.minAdet) || 1 : null, minTutar: kampForm.tip === 'sepet_tutar' ? Number(kampForm.minTutar) || 0 : null, indirimTip: kampForm.indirimTip, indirimDeger: Number(kampForm.indirimDeger) || 0, kapsam: kampForm.kapsam, kategoriId: kampForm.kapsam === 'kategori' ? (kampForm.kategoriId || null) : null, productId: kampForm.kapsam === 'urun' ? (kampForm.productId || null) : null };
    try { await api.post('/store/campaigns', body); toast.success('Kampanya eklendi'); setKampForm(kampEmpty); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const toggleKampanya = async (k: any) => { try { await api.patch(`/store/campaigns/${k.id}`, { aktif: !k.aktif }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const delKampanya = async (id: string) => { if (!confirm('Kampanya silinsin mi?')) return; try { await api.delete(`/store/campaigns/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const kampOzet = (k: any) => { const ind = k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : fmt(k.indirimDeger); const kos = k.tip === 'urun_adet' ? `${k.minAdet}+ adet alana` : `${fmt(k.minTutar)} üzeri alışverişe`; return `${kos} ${ind} indirim`; };

  // ── Müşteri kaydı ──────────────────────────────────────────────────────────
  const kayitOlustur = async () => {
    if (!kayitForm.telefon.trim()) { toast.error('Telefon zorunludur'); return; }
    try { await api.post('/store/free/musteri', kayitForm); toast.success('Müşteri kaydedildi, rezerve siparişleri onaylandı'); setKayitModal(false); setKayitForm({ ad: '', instagram: '', telefon: '' }); loadActive(); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // ── Yayın yönetimi ─────────────────────────────────────────────────────────
  const loadActive = async () => { try { const r = await api.get('/store/free/active'); setStream(r.data.stream); setOrders(r.data.orders || []); } catch { /* */ } };
  useEffect(() => { loadActive(); loadFreeProducts(); }, []);
  useEffect(() => { if (!stream) return; const t = setInterval(() => { loadActive(); }, 12000); return () => clearInterval(t); }, [stream]);
  useEffect(() => { if (!stream) { setSeconds(0); return; } const calc = () => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(stream.startedAt).getTime()) / 1000))); calc(); const t = setInterval(calc, 1000); return () => clearInterval(t); }, [stream]);

  const sure = useMemo(() => { const h = String(Math.floor(seconds / 3600)).padStart(2, '0'); const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0'); const s = String(seconds % 60).padStart(2, '0'); return `${h}:${m}:${s}`; }, [seconds]);

  useEffect(() => { if (!lightbox) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(''); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [lightbox]);

  const startStream = async () => { try { const r = await api.post('/store/free/start', {}); setStream(r.data); setOrders([]); toast.success('Yeni serbest satış başladı'); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const endStream = async () => {
    if (!confirm('Satışı sonlandırmak istiyor musunuz?')) return;
    try { await api.post('/store/free/end', {}); setStream(null); setOrders([]); toast.success('Satış sonlandırıldı'); await loadExtre(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const openHistory = async () => { try { const r = await api.get('/store/free/history'); setHistory(r.data); setHistoryOpen(true); } catch (e) { toast.error(apiErrorMessage(e)); } };

  // ── Ürün bulma (geçici depodan) ────────────────────────────────────────────
  const findByCode = (code: string) => { const c = norm(code); if (!c) return undefined; return freeProducts.find((p) => norm(p.salesCode || '') === c); };
  const activeFlash = (productId?: string) => { if (!productId) return 0; const f = flash[productId]; return f && f.exp > Date.now() ? f.price : 0; };

  const openProduct = (p: any) => {
    setBarkodModal(p); setDiscForm({ price: '', dakika: '' });
    setBarHistory((h) => [{ id: Date.now(), productId: p.id, ad: p.ad, kod: p.salesCode || '-', stok: (Array.isArray(p.variations) ? p.variations.reduce((s: number, v: any) => s + (v.stok || 0), 0) : 0), time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }, ...h.filter((x) => x.productId !== p.id)].slice(0, 30));
  };
  const openByCode = (code: string) => { const p = findByCode(code); if (!p) { toast.error('Ürün bulunamadı: ' + code); return; } openProduct(p); };
  const scanBarcode = () => { if (!barkod.trim()) return; openByCode(barkod); setBarkod(''); };

  const araSonuc = useMemo(() => { const q = norm(araQ); if (!q) return []; return freeProducts.filter((p: any) => { const hay = [p.ad, p.salesCode, ...(Array.isArray(p.variations) ? p.variations.map((v: any) => v.deger) : [])].map((x: any) => norm(String(x || ''))).join(' '); return hay.includes(q); }).slice(0, 30); }, [araQ, freeProducts]);

  useEffect(() => {
    let buf = ''; let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const editable = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (editable) return;
      const t = Date.now(); if (t - last > 120) buf = ''; last = t;
      if (e.key === 'Enter') { if (buf.length >= 4) openByCode(buf); buf = ''; return; }
      if (e.key.length === 1 && /[A-Za-z0-9._\-]/.test(e.key)) buf += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [freeProducts]);

  const setFlashDiscount = () => {
    if (!barkodModal) return;
    const price = Number(discForm.price); const dk = Number(discForm.dakika);
    if (!(price > 0) || !(dk > 0)) { toast.error('Geçerli fiyat ve süre girin'); return; }
    const exp = Date.now() + dk * 60000;
    setFlash((f) => ({ ...f, [barkodModal.id]: { price, exp } }));
    toast.success(`${barkodModal.ad}: ${dk} dk boyunca ${price}₺ indirimli`);
    setBarkodModal(null);
  };

  // ── Sipariş ayrıştır ───────────────────────────────────────────────────────
  const parse = async () => {
    if (!stream) { toast.error('Önce "Yeni Satış" başlatın'); return; }
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('Yorum girilmedi'); return; }
    setBusy(true);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const user = parts[0] || 'kullanici';
      const kod = parts[1] || '';
      const beden = parts[2] || '';
      const p = findByCode(kod);
      const fl = activeFlash(p?.id);
      try {
        await api.post('/store/free/order', { streamId: stream.id, user, beden, freeProductId: p?.id, urun: p?.ad || kod, saticiAd: satici || null, fiyatOverride: fl > 0 ? fl : undefined });
      } catch { /* */ }
    }
    setText(''); setBusy(false);
    await loadActive();
    toast.success('İşlendi');
  };

  const iptalEt = async (o: any) => {
    if (o.durum === 'iptal') return;
    try { const r = await api.post(`/store/free/order/${o.id}/iptal`); setOrders(r.data.orders || []); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // ── İstatistikler ──────────────────────────────────────────────────────────
  const aktifKampanyalar = useMemo(() => (campaigns || []).filter((k: any) => k.aktif), [campaigns]);
  const kampKisa = (k: any) => `${k.ad}: ${k.tip === 'urun_adet' ? `${k.minAdet}+ adet` : `${fmt(k.minTutar)} üzeri`} → ${k.indirimTip === 'yuzde' ? '%' + k.indirimDeger : fmt(k.indirimDeger)}`;

  const stats = useMemo(() => {
    const ona = orders.filter((o) => o.durum === 'onaylandi');
    const ciro = ona.reduce((s, o) => s + o.tutar, 0);
    const maliyet = ona.reduce((s, o) => s + o.alis, 0);
    return { ciro, kar: ciro - maliyet, toplam: orders.length, onaylandi: ona.length, iptal: orders.filter((o) => o.durum === 'iptal').length, stokYok: orders.filter((o) => o.durum === 'stok_yok').length };
  }, [orders]);

  const series = useMemo(() => {
    const ona = [...orders].filter((o) => o.durum === 'onaylandi').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let c = 0; let k = 0; const labels: string[] = []; const ciroArr: number[] = []; const karArr: number[] = [];
    ona.forEach((o) => { c += o.tutar; k += (o.tutar - o.alis); labels.push(hhmm(o.createdAt)); ciroArr.push(c); karArr.push(Math.round(k)); });
    return { labels, ciroArr, karArr };
  }, [orders]);

  const enCokUrun = useMemo(() => { const m: Record<string, number> = {}; orders.filter((o) => o.durum === 'onaylandi').forEach((o) => { m[o.urun] = (m[o.urun] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5); }, [orders]);
  const enCokMusteri = useMemo(() => { const m: Record<string, { adet: number; ciro: number }> = {}; orders.filter((o) => o.durum === 'onaylandi').forEach((o) => { const e = m[o.user] || { adet: 0, ciro: 0 }; e.adet++; e.ciro += o.tutar; m[o.user] = e; }); return Object.entries(m).sort((a, b) => b[1].ciro - a[1].ciro).slice(0, 5); }, [orders]);
  const alisverisYapan = useMemo(() => new Set(orders.filter((o) => o.durum === 'onaylandi').map((o) => o.user)).size, [orders]);

  const enKarliUrunler = useMemo(() => freeProducts.filter((p: any) => (p.satisFiyat || 0) > 0 && (p.alisFiyat || 0) > 0 && p.satisFiyat > p.alisFiyat).map((p: any) => ({ ad: p.ad, oran: ((p.satisFiyat - p.alisFiyat) / p.satisFiyat) * 100, kar: p.satisFiyat - p.alisFiyat })).sort((a, b) => b.oran - a.oran).slice(0, 6), [freeProducts]);

  // ── Yapay Zeka Asistanı ────────────────────────────────────────────────────
  const aiTick = Math.floor((seconds || 0) / 30);
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
    const iptalOran = orders.length ? Math.round((orders.filter((o) => o.durum === 'iptal').length / orders.length) * 100) : 0;

    let tempoLabel = 'Hazır'; let tempoColor: 'warn' | 'tip' | 'good' = 'tip';
    if (total === 0) { if (elapsedMin < 3) { tempoLabel = 'Başladı'; tempoColor = 'tip'; } else { tempoLabel = 'Durgun'; tempoColor = 'warn'; } }
    else if (total < 3 || elapsedMin < 6) { tempoLabel = last5 > 0 ? 'Isınıyor' : 'Yavaş'; tempoColor = last5 > 0 ? 'good' : 'tip'; }
    else { if (last5 === 0) { tempoLabel = 'Durgun'; tempoColor = 'warn'; } else if (last5Rate < avgPerMin * 0.6) { tempoLabel = 'Yavaşlıyor'; tempoColor = 'warn'; } else if (last5Rate > avgPerMin * 1.4) { tempoLabel = 'Hızlanıyor'; tempoColor = 'good'; } else { tempoLabel = 'Dengeli'; tempoColor = 'tip'; } }

    if (total === 0 && elapsedMin >= 4) tips.push({ t: 'warn', m: `${Math.round(elapsedMin)} dk oldu, henüz satış yok. Açılış indirimi yap, en dikkat çeken ürünü öne al.` });
    else if (total >= 1 && (total < 3 || elapsedMin < 6)) tips.push({ t: 'tip', m: `İlk ${total} satış geldi (~${avgPerMin.toFixed(1)}/dk). Momentumu büyütmek için en çok ilgi gören ürünü öne çıkar.` });
    else if (elapsedMin >= 6 && total >= 3) {
      if (last5 === 0) tips.push({ t: 'warn', m: `Son 5 dk'da hiç satış yok (ort. ${avgPerMin.toFixed(1)}/dk). Flaş indirim başlat ya da yeni ürün çıkar.` });
      else if (last5Rate < avgPerMin * 0.6) tips.push({ t: 'warn', m: `Satış yavaşladı: son 5 dk ${last5Rate.toFixed(1)}/dk, ort. ${avgPerMin.toFixed(1)}/dk. İndirim zamanı.` });
      else if (last5Rate > avgPerMin * 1.4) tips.push({ t: 'good', m: `Tempo hızlandı: son 5 dk ${last5Rate.toFixed(1)}/dk. Talep yüksek — stoklu çok satanı öne çıkar.` });
      else if (prev5 > 0 && last5 > prev5) tips.push({ t: 'good', m: `İvme yükseliyor (önceki 5 dk ${prev5} → son 5 dk ${last5}). Momentumu büyüt.` });
      else tips.push({ t: 'tip', m: `Tempo dengeli (~${avgPerMin.toFixed(1)}/dk). Sepeti büyütmek için kombin öner.` });
    }

    const firstByUser = new Map<string, number>();
    ona.forEach((o) => { const t = ms(o.createdAt); if (!firstByUser.has(o.user) || t < firstByUser.get(o.user)!) firstByUser.set(o.user, t); });
    const yeniSon10 = [...firstByUser.values()].filter((t) => now - t < 600000).length;
    const yeniOnceki10 = [...firstByUser.values()].filter((t) => { const d = now - t; return d >= 600000 && d < 1200000; }).length;
    if (firstByUser.size >= 2) {
      if (yeniSon10 === 0 && elapsedMin >= 12) tips.push({ t: 'warn', m: `Son 10 dk'da yeni alıcı katılmadı. "İlk siparişe özel" teklif duyur.` });
      else if (yeniSon10 > yeniOnceki10 && yeniSon10 >= 2) tips.push({ t: 'good', m: `Yeni alıcı akışı artıyor (son 10 dk ${yeniSon10} yeni kişi). Çok satanı öne çıkar.` });
    }

    if (elapsedMin >= 8 && avgPerMin > 0) { const proj30 = Math.round(avgPerMin * 30); tips.push({ t: 'tip', m: `Bu tempoyla önümüzdeki 30 dk'da ~${proj30} sipariş ve ~${fmt(avgPerMin * 30 * (ortSepet || 0))} ciro öngörülüyor.` }); }
    if (iptalOran >= 25) tips.push({ t: 'warn', m: `İptal oranı yüksek (%${iptalOran}). Riskli alıcılardan ön ödeme iste.` });
    if (!tips.length) tips.push({ t: 'tip', m: 'Satışa yeni başladın. İlk ürünü öne çıkar; ilk satışlardan sonra tempo analizi burada belirir.' });

    const karli = ona.filter((o) => typeof o.alis === 'number' && o.tutar > 0);
    let marjGenel = 0;
    if (karli.length >= 4) { const cTop = karli.reduce((s, o) => s + o.tutar, 0); const kTop = karli.reduce((s, o) => s + (o.tutar - o.alis), 0); marjGenel = cTop > 0 ? (kTop / cTop) * 100 : 0; }

    return { tips, metrik: { tempoLabel, tempoColor, last5Rate: last5Rate.toFixed(1), avgPerMin: avgPerMin.toFixed(1), yeniSon10, ortSepet, marjGenel, elapsedMin: Math.round(elapsedMin) } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, freeProducts, stream, aiTick, alisverisYapan, stats, aktifKampanyalar]);

  const isRegistered = (u: string) => { const n = norm(u); const tel = u.replace(/\D/g, ''); return customers.some((c) => (n && (norm(c.ad) === n || norm(c.instagram || '') === n)) || (tel.length >= 7 && (c.telefon || '').replace(/\D/g, '') === tel)); };

  const addSeller = () => { const name = (satici || '').trim(); if (!name) { toast.error('Satıcı adı girin'); return; } if (!sellers.includes(name)) { const next = [...sellers, name]; setSellers(next); localStorage.setItem('ss_sellers', JSON.stringify(next)); } toast.success(`Satıcı: ${name}`); };

  const filtered = useMemo(() => {
    let list = tab === 'tumu' ? orders : orders.filter((o) => o.durum === tab);
    if (search.trim()) { const q = norm(search); list = list.filter((o) => [o.user, o.urun, o.beden].some((f) => norm(f || '').includes(q))); }
    return list;
  }, [orders, tab, search]);

  const Stat = ({ icon: Ic, label, value, color = 'text-slate-800' }: any) => (
    <div className="flex items-center gap-3 px-4">
      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><Ic size={18} className="text-slate-500" /></div>
      <div><p className="text-[10px] text-slate-400 uppercase">{label}</p><p className={`text-lg font-bold ${color}`}>{value}</p></div>
    </div>
  );

  return (
    <div>
      {/* Üst bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 pr-3">
          <h1 className="text-lg font-bold text-slate-800">Serbest Satış</h1>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${stream ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{stream ? 'AKTİF' : 'KAPALI'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 flex-1 border-l border-slate-100">
          <Stat icon={Clock} label="Süre" value={stream ? sure : '--:--:--'} />
          <Stat icon={TrendingUp} label="Ciro" value={fmt(stats.ciro)} color="text-green-600" />
          <Stat icon={Wallet} label="Tahmini Kâr" value={fmt(stats.kar)} color="text-indigo-600" />
          <Stat icon={ShoppingBag} label="Sipariş" value={stats.onaylandi} />
          <Stat icon={ShoppingBag} label="Alışveriş Yapan" value={String(alisverisYapan)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setKayitAcOpen(true)} className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-200"><PackagePlus size={16} /> Kayıt Aç</button>
          <button onClick={loadExtre} className="inline-flex items-center gap-2 bg-violet-100 text-violet-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-violet-200"><FileText size={16} /> Satış Extresi</button>
          <button onClick={openHistory} className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200"><History size={16} /> Geçmiş</button>
          <button onClick={() => setKampOpen(true)} className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-200"><Tag size={16} /> Kampanyalar</button>
          <button onClick={() => setReportOpen(true)} className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200"><BarChart3 size={16} /> Raporlar</button>
          {!stream ? (
            <button onClick={startStream} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"><Radio size={16} /> Yeni Satış</button>
          ) : (
            <button onClick={endStream} className="inline-flex items-center gap-2 bg-red-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-600"><Square size={16} /> Satışı Bitir</button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        {/* Sol */}
        <div className="space-y-4">
          {/* Ürün Bul */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Filter size={16} className="text-indigo-600" /> Ürün Bul</h3>
              <button onClick={() => setBarHistModal(true)} className="text-[11px] text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg inline-flex items-center gap-1"><History size={13} /> Geçmiş{barHistory.length > 0 && <span className="bg-indigo-100 text-indigo-700 px-1.5 rounded-full text-[10px]">{barHistory.length}</span>}</button>
            </div>
            <div className="flex items-center gap-1 mb-2 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setScanTab('barkod')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${scanTab === 'barkod' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Kod</button>
              <button onClick={() => setScanTab('ara')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${scanTab === 'ara' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Ürün Ara</button>
            </div>
            {scanTab === 'barkod' ? (
              <div className="flex gap-2">
                <input value={barkod} onChange={(e) => setBarkod(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scanBarcode()} placeholder="Satış kodu yaz veya okut" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" autoFocus />
                <button onClick={scanBarcode} className="bg-slate-800 text-white px-3 rounded-lg hover:bg-slate-700 text-sm">Okut</button>
              </div>
            ) : (
              <div>
                <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input value={araQ} onChange={(e) => setAraQ(e.target.value)} placeholder="Ürün adı, satış kodu, beden..." className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" autoFocus /></div>
                {araQ && (
                  <div className="mt-2 max-h-56 overflow-y-auto space-y-1 border border-slate-100 rounded-lg p-1">
                    {araSonuc.length === 0 ? <p className="text-[11px] text-slate-400 text-center py-4">Sonuç yok.</p> : araSonuc.map((p: any) => {
                      const fl = activeFlash(p.id);
                      const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
                      const topStok = vars.reduce((s: number, v: any) => s + (v.stok || 0), 0);
                      return (
                        <button key={p.id} onClick={() => { openProduct(p); setAraQ(''); }} className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-indigo-50 text-left">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">{(Array.isArray(p.images) && p.images[0]) && <img src={p.images[0]} className="w-full h-full object-cover" />}</div>
                          <div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-800 truncate">{p.ad}</p><p className="text-[10px] text-slate-400 truncate">{p.salesCode || '-'}</p></div>
                          <div className="text-right shrink-0"><p className="text-xs font-bold text-slate-700">{fmt(fl > 0 ? fl : p.satisFiyat)}</p><p className="text-[9px] text-slate-400">{topStok} adet</p></div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Ürün stok kartı — sabit */}
            <div className="mt-3 border border-slate-200 bg-slate-50/60 rounded-xl p-3 min-h-[120px]">
              {barkodModal ? (
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <button onClick={() => (Array.isArray(barkodModal.images) && barkodModal.images[0]) && setImgZoom(barkodModal.images[0])} className="w-14 h-14 rounded-lg bg-white border border-slate-100 overflow-hidden shrink-0 cursor-zoom-in">
                        {(Array.isArray(barkodModal.images) && barkodModal.images[0]) ? <img src={barkodModal.images[0]} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={18} /></span>}
                      </button>
                      <div className="min-w-0"><p className="font-semibold text-slate-800 text-sm leading-tight truncate">{barkodModal.ad}</p><p className="text-[10px] text-slate-400 font-mono truncate">Kod: {barkodModal.salesCode || '-'}</p></div>
                    </div>
                    <button onClick={() => setBarkodModal(null)} className="p-1 hover:bg-white rounded-lg shrink-0"><X size={16} className="text-slate-400" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white rounded-lg p-2 border border-slate-100"><p className="text-[10px] text-slate-400">Satış Fiyatı</p><p className="font-bold text-slate-700">{fmt(barkodModal.satisFiyat || 0)}</p></div>
                    <div className="bg-white rounded-lg p-2 border border-slate-100"><p className="text-[10px] text-slate-400">Alış Fiyatı</p><p className="font-bold text-slate-500">{fmt(barkodModal.alisFiyat || 0)}</p></div>
                  </div>
                  {(Array.isArray(barkodModal.variations) && barkodModal.variations.length > 0) ? (
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase mb-1">Beden / Stok</p>
                      <div className="flex flex-wrap gap-1.5">
                        {barkodModal.variations.map((v: any, i: number) => <span key={i} className={`text-xs px-2 py-1 rounded-lg border ${v.stok > 0 ? 'bg-white border-slate-200 text-slate-700' : 'bg-red-50 border-red-200 text-red-500 line-through'}`}>{v.deger}: <b>{v.stok}</b></span>)}
                      </div>
                    </div>
                  ) : <p className="text-[10px] text-slate-400">Bedensiz ürün.</p>}
                  {activeFlash(barkodModal.id) > 0 && <p className="text-xs text-green-600 font-medium">Aktif süreli indirim: {fmt(activeFlash(barkodModal.id))}</p>}
                  <div className="border-t border-slate-200 pt-2">
                    <p className="text-[11px] font-medium text-slate-700 mb-1.5">Süreli İndirimli Fiyat</p>
                    <div className="flex gap-2 mb-2">
                      <input type="number" value={discForm.price} onChange={(e) => setDiscForm({ ...discForm, price: e.target.value })} placeholder="İndirimli ₺" className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg" />
                      <input type="number" value={discForm.dakika} onChange={(e) => setDiscForm({ ...discForm, dakika: e.target.value })} placeholder="dk" className="w-14 shrink-0 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                    </div>
                    <button onClick={setFlashDiscount} className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700">Süreli İndirimi Başlat</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-5 text-slate-400">
                  <Package size={22} className="mb-1.5 text-slate-300" />
                  <p className="text-[12px] font-medium text-slate-500">Ürün Stok Kartı</p>
                  <p className="text-[10px]">Kod okutunca veya arayınca ürün burada görünür.</p>
                </div>
              )}
            </div>
          </div>

          {/* Manuel Sipariş / Sohbet */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-1 mb-3 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setLeftTab('manuel')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${leftTab === 'manuel' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Manuel Sipariş</button>
              <button onClick={() => setLeftTab('sohbet')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${leftTab === 'sohbet' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Sohbet Akışı <span className="text-slate-400">{orders.length}</span></button>
            </div>
            {leftTab === 'manuel' ? (
              <>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={'kullanıcı satışkodu beden\nahmet SK1024 XL\nmehmet SK0712 M'} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" />
                <p className="text-[10px] text-slate-400 mt-1">Satış kodu serbest depodaki ürünle eşleşir; geçici stok varsa onaylanır.</p>
                <button onClick={parse} disabled={busy || !stream} className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"><Send size={16} /> {busy ? 'İşleniyor...' : 'Siparişleri Ayrıştır & Al'}</button>
                {!stream && <p className="text-[10px] text-red-500 mt-1">Satış kapalı. Önce "Yeni Satış" başlatın.</p>}
              </>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {orders.slice(0, 30).map((o) => (<div key={o.id} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1"><div><span className="font-medium text-slate-700">{o.user}</span> <span className="text-slate-400">{o.urun} {o.beden}</span></div><span className="text-slate-300">{hhmm(o.createdAt)}</span></div>))}
                {orders.length === 0 && <p className="text-slate-400 text-xs">Henüz sipariş yok.</p>}
              </div>
            )}
          </div>
        </div>

        {/* Sağ kolon */}
        <div className="space-y-4 min-w-0">
          {/* Aktif Satıcı */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shrink-0"><UserCircle size={16} className="text-indigo-600" /> Aktif Satıcı{satici && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">{satici}</span>}</span>
            <input value={satici} onChange={(e) => setSatici(e.target.value)} placeholder="Satıcı adı" className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300 w-36" />
            <button onClick={addSeller} className="bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700"><Plus size={14} /></button>
            <div className="flex flex-wrap gap-1.5">{sellers.map((s) => (<button key={s} onClick={() => setSatici(s)} className={`px-2.5 py-1 rounded-full text-xs ${satici === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s}</button>))}</div>
          </div>

          {/* Sipariş tablosu */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {aktifKampanyalar.length > 0 && <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold text-amber-700">🏷 Aktif Kampanyalar:</span>{aktifKampanyalar.map((k: any) => <span key={k.id} className="text-[11px] bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">{kampKisa(k)}</span>)}</div>}
            <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-1">
              {([['tumu', `Tümü ${stats.toplam}`], ['onaylandi', `Onaylandı ${stats.onaylandi}`], ['stok_yok', `Stok Yok ${stats.stokYok}`], ['iptal', `İptal ${stats.iptal}`]] as [any, string][]).map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{l}</button>
              ))}
              <span className="ml-auto flex items-center gap-2"><span className="relative"><Search size={13} className="absolute left-2 top-1.5 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara (ürün, müşteri)" className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-40 sm:w-56 outline-none" /></span></span>
            </div>
            <div className="overflow-x-auto max-h-[52vh] overflow-y-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-slate-50 text-slate-500 text-left sticky top-0"><tr><th className="px-3 py-2">Kullanıcı</th><th className="px-3 py-2">Ürün</th><th className="px-3 py-2">Beden</th><th className="px-3 py-2">Satıcı</th><th className="px-3 py-2">Tutar</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2">Saat</th><th className="px-3 py-2">İşlem</th></tr></thead>
                <tbody>
                  {filtered.map((o) => {
                    const fp = freeProducts.find((p) => p.id === o.freeProductId);
                    const img = fp && Array.isArray(fp.images) ? fp.images[0] : null;
                    const rowBg = o.durum === 'onaylandi' ? 'bg-green-50' : o.durum === 'rezerve' ? 'bg-blue-50' : o.durum === 'stok_yok' ? 'bg-red-50' : o.durum === 'iptal' ? 'opacity-60' : '';
                    return (
                      <tr key={o.id} className={`border-t border-slate-100 ${rowBg}`}>
                        <td className="px-3 py-2 font-medium text-slate-700"><div className="flex items-center gap-1.5">{o.user}{!isRegistered(o.user) && <><span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Kayıt Yok</span><button onClick={() => { setKayitForm({ ad: '', instagram: o.user, telefon: '' }); setKayitModal(true); }} className="text-emerald-600 hover:bg-emerald-50 rounded p-0.5"><UserPlus size={14} /></button></>}</div></td>
                        <td className="px-3 py-2"><div className="flex items-center gap-2">{img && <div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0 cursor-zoom-in" onClick={() => setLightbox(img)}><img src={img} className="w-full h-full object-cover" /></div>}<span className="text-slate-600">{o.urun}</span></div></td>
                        <td className="px-3 py-2 text-slate-500">{o.beden || '-'}</td>
                        <td className="px-3 py-2 text-slate-500">{o.saticiAd || '-'}</td>
                        <td className="px-3 py-2 font-medium">{fmt(o.tutar)}</td>
                        <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${DURUM_BADGE[o.durum]?.c || 'bg-slate-100 text-slate-500'}`}>{DURUM_BADGE[o.durum]?.t || o.durum}</span></td>
                        <td className="px-3 py-2 text-slate-400">{hhmm(o.createdAt)}</td>
                        <td className="px-3 py-2">{o.durum === 'iptal' ? <span className="text-rose-500 text-xs">İptal</span> : <button onClick={() => iptalEt(o)} className="inline-flex items-center gap-1 text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg text-xs"><Trash2 size={13} /> İptal</button>}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-400">{stream ? 'Henüz sipariş yok.' : 'Satış kapalı. "Yeni Satış" başlatın.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Yapay Zeka Asistanı */}
          <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl border border-indigo-100 p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0"><Brain size={14} className="text-white" /></div>
              <h3 className="font-bold text-slate-800 text-[13px] leading-none">Yapay Zeka Asistanı</h3>
              <span className="ml-auto text-[10px] text-indigo-500 inline-flex items-center gap-1"><Sparkles size={11} /> Canlı</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5 mb-2.5">
              <div className={`rounded-lg px-2 py-1.5 border text-center ${aiAnaliz.metrik.tempoColor === 'warn' ? 'bg-red-50 border-red-100' : aiAnaliz.metrik.tempoColor === 'good' ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'}`}>
                <p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Tempo</p>
                <p className={`text-[12px] font-bold leading-tight ${aiAnaliz.metrik.tempoColor === 'warn' ? 'text-red-600' : aiAnaliz.metrik.tempoColor === 'good' ? 'text-green-600' : 'text-slate-700'}`}>{aiAnaliz.metrik.tempoLabel}</p>
              </div>
              <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100 text-center"><p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Yeni Alıcı</p><p className="text-[12px] font-bold text-indigo-600 leading-tight">{aiAnaliz.metrik.yeniSon10}</p></div>
              <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100 text-center"><p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Ort. Sepet</p><p className="text-[12px] font-bold text-slate-700 leading-tight">{fmt(aiAnaliz.metrik.ortSepet)}</p></div>
              <div className={`rounded-lg px-2 py-1.5 border text-center ${aiAnaliz.metrik.marjGenel > 0 && aiAnaliz.metrik.marjGenel < 25 ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'}`}><p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Kâr Marjı</p><p className={`text-[12px] font-bold leading-tight ${aiAnaliz.metrik.marjGenel > 0 && aiAnaliz.metrik.marjGenel < 25 ? 'text-red-600' : 'text-green-600'}`}>{aiAnaliz.metrik.marjGenel > 0 ? `%${aiAnaliz.metrik.marjGenel.toFixed(0)}` : '-'}</p></div>
              <div className="rounded-lg px-2 py-1.5 border bg-white border-slate-100 text-center"><p className="text-[8px] text-slate-400 font-medium uppercase tracking-wide">Süre</p><p className="text-[12px] font-bold text-slate-700 leading-tight">{aiAnaliz.metrik.elapsedMin} dk</p></div>
            </div>
            <div className="space-y-1 mb-2.5">
              {aiAnaliz.tips.slice(0, 3).map((a, i) => {
                const cfg = a.t === 'warn' ? { Ic: AlertTriangle, c: 'text-red-500', bg: 'bg-red-50' } : a.t === 'good' ? { Ic: TrendingUp, c: 'text-green-600', bg: 'bg-green-50' } : { Ic: Lightbulb, c: 'text-amber-500', bg: 'bg-amber-50' };
                const Ic = cfg.Ic;
                return <div key={i} className={`flex items-start gap-1.5 rounded-lg px-2 py-1.5 ${cfg.bg}`}><Ic size={13} className={`${cfg.c} shrink-0 mt-px`} /><span className="text-[11px] text-slate-700 leading-snug">{a.m}</span></div>;
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-indigo-100">
              <div><p className="text-[9px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1"><Package size={11} /> En Çok Satan</p><div className="space-y-0.5">{enCokUrun.slice(0, 3).map(([ad, adet]: any, i: number) => <div key={i} className="flex items-center justify-between text-[10px]"><span className="text-slate-600 truncate pr-2">{i + 1}. {ad}</span><span className="font-semibold text-slate-700 shrink-0">{adet}</span></div>)}{enCokUrun.length === 0 && <p className="text-[10px] text-slate-400">Henüz satış yok.</p>}</div></div>
              <div><p className="text-[9px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1"><TrendingUp size={11} /> En Kârlı</p><div className="space-y-0.5">{enKarliUrunler.slice(0, 3).map((p: any, i: number) => <div key={i} className="flex items-center justify-between text-[10px]"><span className="text-slate-600 truncate pr-2">{i + 1}. {p.ad}</span><span className="font-semibold text-green-600 shrink-0">%{p.oran.toFixed(0)}</span></div>)}{enKarliUrunler.length === 0 && <p className="text-[10px] text-slate-400">Veri yok.</p>}</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Kayıt Aç Modal ─────────────────────────────────────────────────── */}
      {kayitAcOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setKayitAcOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><PackagePlus size={18} className="text-emerald-600" /> Yeni Ürün Kaydı</h3><button onClick={() => setKayitAcOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-400">Geçici depo — depo yönetiminizle bağlantısı yoktur. Satış kodu havuzdan otomatik atanır.</p>

            <div><label className="block text-xs text-slate-500 mb-1">Ürün Adı *</label><input value={kayitAcForm.ad} onChange={(e) => setKayitAcForm({ ...kayitAcForm, ad: e.target.value })} placeholder="Ürün adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>

            <div><label className="block text-xs text-slate-500 mb-1">Görsel</label><ImageDropzone images={kayitAcForm.images} onChange={(imgs) => setKayitAcForm({ ...kayitAcForm, images: imgs })} max={3} /></div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Bedenler (virgülle ayır: S,M,L,XL)</label>
              <input value={kayitAcForm.bedenler} onChange={(e) => onBedenlerChange(e.target.value)} placeholder="S,M,L,XL" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              {kayitAcVars.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] text-slate-400">Her beden için stok adedi (varsayılan 1, tıklayıp değiştir):</p>
                  <div className="flex flex-wrap gap-2">
                    {kayitAcVars.map((v, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                        <span className="text-xs font-medium text-slate-700">{v.deger}</span>
                        <input type="number" min={0} value={v.stok} onChange={(e) => { const next = [...kayitAcVars]; next[i] = { ...next[i], stok: Math.max(0, Number(e.target.value) || 0) }; setKayitAcVars(next); }} className="w-12 text-center text-xs border border-slate-200 rounded px-1 py-0.5" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Satış Fiyatı (₺)</label><input type="number" value={kayitAcForm.satisFiyat} onChange={(e) => setKayitAcForm({ ...kayitAcForm, satisFiyat: e.target.value })} placeholder="0" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Alış Fiyatı (₺)</label><input type="number" value={kayitAcForm.alisFiyat} onChange={(e) => setKayitAcForm({ ...kayitAcForm, alisFiyat: e.target.value })} placeholder="0" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>

            <button onClick={saveKayitAc} disabled={kayitAcBusy} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50">{kayitAcBusy ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </div>
      )}

      {/* ── Satış Extresi Modal ────────────────────────────────────────────── */}
      {extreOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setExtreOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 max-h-[88vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-violet-600" /> Satış Extresi</h3><button onClick={() => setExtreOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            {extreData.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">Henüz satış yok.</p> : (
              <div className="space-y-3">
                {extreData.map((e: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 border border-slate-200 rounded-xl p-3">
                    {e.image && <button onClick={() => setLightbox(e.image)} className="w-16 h-16 rounded-lg overflow-hidden shrink-0 cursor-zoom-in"><img src={e.image} className="w-full h-full object-cover" /></button>}
                    {!e.image && <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={20} className="text-slate-300" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm">{e.ad}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Toplam: <strong>{e.toplam} adet</strong> · Ciro: <strong className="text-green-600">{fmt(e.tutar)}</strong></p>
                      {Object.keys(e.bedenler || {}).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {Object.entries(e.bedenler).map(([b, n]: any) => <span key={b} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{b}: {n}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="border-t border-slate-200 pt-3 flex justify-between text-sm font-semibold">
                  <span>Toplam Satış</span>
                  <span className="text-green-600">{fmt(extreData.reduce((s: number, e: any) => s + (e.tutar || 0), 0))}</span>
                </div>
              </div>
            )}
            <button onClick={loadExtre} className="w-full text-xs text-indigo-600 hover:bg-indigo-50 border border-indigo-200 py-2 rounded-lg">Yenile</button>
          </div>
        </div>
      )}

      {/* ── Barkod Geçmişi Modal ───────────────────────────────────────────── */}
      {barHistModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setBarHistModal(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl p-5 max-h-[85vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><History size={18} className="text-indigo-600" /> Okutulan Ürünler</h3><button onClick={() => setBarHistModal(false)}><X size={20} className="text-slate-400" /></button></div>
            {barHistory.length === 0 ? <div className="flex flex-col items-center justify-center text-center py-10 text-slate-400"><Package size={26} className="mb-2 text-slate-300" /><p className="text-sm">Henüz kod okutulmadı.</p></div> : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {barHistory.map((b) => {
                  const p: any = freeProducts.find((x) => x.id === b.productId) || {};
                  const img = Array.isArray(p.images) ? p.images[0] : null;
                  const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
                  const kalanVar = vars.filter((v) => (v.stok || 0) > 0);
                  return (
                    <div key={b.id} className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/60 flex gap-2.5">
                      <button onClick={() => img && setImgZoom(img)} className="w-16 h-16 rounded-lg bg-white border border-slate-100 overflow-hidden shrink-0 cursor-zoom-in">{img ? <img src={img} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={18} /></span>}</button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1"><p className="font-semibold text-slate-800 text-xs leading-tight line-clamp-2">{b.ad}</p><span className="text-[9px] text-slate-400 shrink-0">{b.time}</span></div>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">Kod: {p.salesCode || b.kod}</p>
                        <span className="text-xs font-bold text-slate-700">{fmt(p.satisFiyat || 0)}</span>
                        {kalanVar.length > 0 && <div className="flex flex-wrap gap-0.5 mt-1">{kalanVar.slice(0, 6).map((v: any, i: number) => <span key={i} className="text-[8px] px-1 py-0.5 rounded border border-slate-200 text-slate-500 bg-white">{v.deger}:{v.stok}</span>)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {barHistory.length > 0 && <button onClick={() => { setBarHistory([]); setBarHistModal(false); }} className="w-full text-xs text-slate-500 hover:bg-slate-50 border border-slate-200 py-2 rounded-lg">Geçmişi Temizle</button>}
          </div>
        </div>
      )}

      {/* ── Hızlı Müşteri Kaydı ───────────────────────────────────────────── */}
      {kayitModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setKayitModal(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Hızlı Müşteri Kaydı</h3><button onClick={() => setKayitModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-400">Sadece telefon zorunludur. Kayıt sonrası rezerve siparişler otomatik onaylanır.</p>
            <input value={kayitForm.ad} onChange={(e) => setKayitForm({ ...kayitForm, ad: e.target.value })} placeholder="Ad Soyad" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <input value={kayitForm.instagram} onChange={(e) => setKayitForm({ ...kayitForm, instagram: e.target.value })} placeholder="Instagram kullanıcı adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <input value={kayitForm.telefon} onChange={(e) => setKayitForm({ ...kayitForm, telefon: e.target.value })} placeholder="Telefon *" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <button onClick={kayitOlustur} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700">Kaydet</button>
          </div>
        </div>
      )}

      {/* ── Kampanyalar Modal ─────────────────────────────────────────────── */}
      {kampOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setKampOpen(false)}>
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 max-h-[88vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Kampanyalar</h3><button onClick={() => setKampOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <div className="bg-slate-50 rounded-xl p-3 space-y-2.5">
              <p className="text-xs font-semibold text-slate-500 uppercase">Yeni Kampanya</p>
              <input value={kampForm.ad} onChange={(e) => setKampForm({ ...kampForm, ad: e.target.value })} placeholder="Kampanya adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[11px] text-slate-400">Koşul Tipi</label><select value={kampForm.tip} onChange={(e) => setKampForm({ ...kampForm, tip: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="urun_adet">Ürün adedi</option><option value="sepet_tutar">Sepet tutarı</option></select></div>
                {kampForm.tip === 'urun_adet' ? <div><label className="text-[11px] text-slate-400">Min. Adet</label><input type="number" value={kampForm.minAdet} onChange={(e) => setKampForm({ ...kampForm, minAdet: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div> : <div><label className="text-[11px] text-slate-400">Min. Tutar (TL)</label><input type="number" value={kampForm.minTutar} onChange={(e) => setKampForm({ ...kampForm, minTutar: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[11px] text-slate-400">İndirim Tipi</label><select value={kampForm.indirimTip} onChange={(e) => setKampForm({ ...kampForm, indirimTip: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="yuzde">Yüzde (%)</option><option value="tutar">Tutar (TL)</option></select></div>
                <div><label className="text-[11px] text-slate-400">İndirim Değeri</label><input type="number" value={kampForm.indirimDeger} onChange={(e) => setKampForm({ ...kampForm, indirimDeger: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              </div>
              <button onClick={saveKampanya} className="w-full bg-amber-500 text-white py-2.5 rounded-lg font-medium hover:bg-amber-600 inline-flex items-center justify-center gap-1.5"><Plus size={16} /> Kampanya Ekle</button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase">Tanımlı Kampanyalar ({campaigns.length})</p>
              {campaigns.length === 0 && <p className="text-sm text-slate-400">Henüz kampanya yok.</p>}
              {campaigns.map((k: any) => (<div key={k.id} className="flex items-center gap-2 border border-slate-100 rounded-xl p-2.5"><div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{k.ad}</p><p className="text-[11px] text-slate-500">{kampOzet(k)}</p></div><button onClick={() => toggleKampanya(k)} className={`text-[10px] px-2 py-1 rounded-full font-medium ${k.aktif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>{k.aktif ? 'Aktif' : 'Pasif'}</button><button onClick={() => delKampanya(k.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></div>))}
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightbox && (<div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/80" onClick={() => setLightbox('')}><img src={lightbox} className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} /><button onClick={() => setLightbox('')} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button></div>)}
      {imgZoom && (<div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/80" onClick={() => setImgZoom('')}><img src={imgZoom} className="max-w-full max-h-full rounded-xl object-contain" /><button onClick={() => setImgZoom('')} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button></div>)}

      {/* ── Geçmiş Yayınlar ───────────────────────────────────────────────── */}
      {historyOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={() => setHistoryOpen(false)}>
          <div className="w-full max-w-md bg-slate-50 h-full overflow-y-auto p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">Geçmiş Satışlar</h2><button onClick={() => setHistoryOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            {history.length === 0 && <p className="text-slate-400 text-sm">Henüz tamamlanmış satış yok.</p>}
            {history.map((h) => (<div key={h.id} className="bg-white rounded-xl border border-slate-200 p-4"><p className="font-medium text-slate-800">{new Date(h.startedAt).toLocaleString('tr-TR')}</p><p className="text-xs text-slate-400">{h.endedAt ? `Bitiş: ${new Date(h.endedAt).toLocaleString('tr-TR')}` : ''}</p><div className="grid grid-cols-3 gap-2 mt-3 text-center"><div><p className="text-[10px] text-slate-400">Sipariş</p><p className="font-bold text-slate-700">{h.siparis}</p></div><div><p className="text-[10px] text-slate-400">Ciro</p><p className="font-bold text-green-600">{fmt(h.ciro)}</p></div><div><p className="text-[10px] text-slate-400">Kâr</p><p className="font-bold text-indigo-600">{fmt(h.kar)}</p></div></div></div>))}
          </div>
        </div>
      )}

      {/* ── Rapor Modal ───────────────────────────────────────────────────── */}
      {reportOpen && (() => {
        const margin = stats.ciro > 0 ? (stats.kar / stats.ciro) * 100 : 0;
        const sg = Number(sabitGider) || 0;
        const netKar = stats.kar - sg;
        const lowMargin = stats.ciro > 0 && margin < 15;
        return (
          <div className="fixed inset-0 z-[100] flex justify-end bg-black/40" onClick={() => setReportOpen(false)}>
            <div className="w-full max-w-lg bg-slate-50 h-full overflow-y-auto p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between"><h2 className="font-bold text-slate-800">Satış Raporu & Kârlılık</h2><button onClick={() => setReportOpen(false)}><X size={20} className="text-slate-400" /></button></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Ciro</p><p className="text-lg font-bold text-slate-800">{fmt(stats.ciro)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Brüt Kâr</p><p className="text-lg font-bold text-green-600">{fmt(stats.kar)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Kâr Marjı</p><p className={`text-lg font-bold ${lowMargin ? 'text-red-600' : 'text-indigo-600'}`}>%{margin.toFixed(1)}</p></div>
                <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] text-slate-400 uppercase">Net Kâr</p><p className={`text-lg font-bold ${netKar < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt(netKar)}</p></div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4"><label className="block text-sm font-medium text-slate-700 mb-1">Sabit Giderler</label><input type="number" value={sabitGider} onChange={(e) => setSabitGider(e.target.value)} placeholder="0" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div className="bg-white rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-700 mb-3">Ciro & Kâr Grafiği</h3>{series.labels.length === 0 ? <p className="text-slate-400 text-sm">Veri bekleniyor...</p> : <Line data={{ labels: series.labels, datasets: [{ label: 'Ciro', data: series.ciroArr, borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)', fill: true, tension: 0.35, pointRadius: 0 }, { label: 'Kâr', data: series.karArr, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.35, pointRadius: 0 }] }} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { beginAtZero: true } } }} />}</div>
              <div className="bg-white rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-700 mb-3">En Çok Alışveriş Yapanlar</h3>{enCokMusteri.length === 0 ? <p className="text-slate-400 text-sm">Veri yok</p> : <div className="space-y-2">{enCokMusteri.map(([ad, v], i) => <div key={ad} className="flex items-center justify-between text-sm"><span className="text-slate-600">{i + 1}. {ad}</span><span className="text-slate-400">{v.adet} ürün · <strong>{fmt(v.ciro)}</strong></span></div>)}</div>}</div>
              <div className="bg-white rounded-xl border border-slate-200 p-4"><h3 className="font-semibold text-slate-700 mb-3">En Çok Satan Ürünler</h3>{enCokUrun.length === 0 ? <p className="text-slate-400 text-sm">Veri yok</p> : <div className="space-y-2">{enCokUrun.map(([ad, adet], i) => <div key={ad} className="flex items-center justify-between text-sm"><span className="text-slate-600">{i + 1}. {ad}</span><span className="text-slate-400">{adet} adet</span></div>)}</div>}</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
