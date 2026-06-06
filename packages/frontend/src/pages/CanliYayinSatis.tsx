import { useState, useMemo, useEffect } from 'react';
import { Clock, TrendingUp, Wallet, ShoppingBag, Users, BarChart3, Radio, Square, Send, X, Filter, Trash2, History, UserCircle, Plus, Search, UserPlus, Tag } from 'lucide-react';
import { Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

ChartJS.register(ArcElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => (s || '').toLowerCase().replace(/^@/, '').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').trim();
const hhmm = (iso: string) => { try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

type Durum = 'onaylandi' | 'rezerve' | 'stok_yok' | 'riskli' | 'iptal';
const DURUM_BADGE: Record<string, { t: string; c: string }> = {
  onaylandi: { t: 'Onaylandı', c: 'bg-green-100 text-green-700' },
  rezerve: { t: 'Rezerve', c: 'bg-amber-100 text-amber-700' },
  stok_yok: { t: 'Stok Yetersiz', c: 'bg-red-100 text-red-700' },
  riskli: { t: 'Kod Bulunamadı', c: 'bg-slate-200 text-slate-600' },
  iptal: { t: 'İptal Edildi', c: 'bg-rose-100 text-rose-600' },
};

export default function CanliYayinSatis() {
  const { products, customers, categories, campaigns, reload } = useStore();
  const [stream, setStream] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [satici, setSatici] = useState('');
  const [sellers, setSellers] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('cy_sellers') || '[]'); } catch { return []; } });
  const [search, setSearch] = useState('');
  const [barkod, setBarkod] = useState('');
  const [barkodModal, setBarkodModal] = useState<any>(null);
  const [flash, setFlash] = useState<Record<string, { price: number; exp: number }>>({});
  const [barHistory, setBarHistory] = useState<any[]>([]);
  const [discForm, setDiscForm] = useState({ price: '', dakika: '' });
  const [tab, setTab] = useState<'tumu' | Durum>('tumu');
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

  // Periyodik yenileme: musteri kaydi/onay durumlarini anlik yansit
  useEffect(() => {
    if (!stream) return;
    const t = setInterval(() => { loadActive(); reload(); }, 12000);
    return () => clearInterval(t);
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
  const kampanyaOf = (productId?: string) => {
    if (!productId) return null;
    const p = products.find((x) => x.id === productId); if (!p) return null;
    return aktifKampanyalar.find((k: any) => k.kapsam === 'hepsi' || (k.kapsam === 'urun' && k.productId === productId) || (k.kapsam === 'kategori' && k.kategoriId === p.kategoriId)) || null;
  };
  const kampKisa = (k: any) => `${k.ad}: ${k.tip === 'urun_adet' ? `${k.minAdet}+ adet` : `${fmt(k.minTutar)} üzeri`} → ${k.indirimTip === 'yuzde' ? '%' + k.indirimDeger : fmt(k.indirimDeger)}`;

  const startStream = async () => { try { const r = await api.post('/store/live/start', {}); setStream(r.data); setOrders([]); toast.success('Yeni yayın başladı'); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const endStream = async () => {
    if (!confirm('Yayını sonlandırmak istiyor musunuz? Geçmiş yayınlara taşınacak.')) return;
    try { await api.post('/store/live/end', {}); setStream(null); setOrders([]); toast.success('Yayın sonlandırıldı'); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const openHistory = async () => { try { const r = await api.get('/store/live/history'); setHistory(r.data); setHistoryOpen(true); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const findByCode = (code: string) => {
    const c = norm(code); if (!c) return undefined;
    return products.find((p) => norm(p.salesCode || '') === c || (p.barkod || '') === code.trim());
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

  const openByCode = (code: string) => {
    const p = findByCode(code);
    if (!p) { toast.error('Ürün bulunamadı: ' + code); return; }
    setBarkodModal(p); setDiscForm({ price: '', dakika: '' });
    setBarHistory((h) => [{ id: Date.now(), ad: p.ad, kod: p.salesCode || '-', barkod: p.barkod || '-', stok: p.stokAdeti || 0, time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) }, ...h].slice(0, 20));
  };
  const scanBarcode = () => { if (!barkod.trim()) return; openByCode(barkod); setBarkod(''); };

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
  }, [products]);

  const setFlashDiscount = () => {
    if (!barkodModal) return;
    const price = Number(discForm.price); const dk = Number(discForm.dakika);
    if (!(price > 0) || !(dk > 0)) { toast.error('Geçerli fiyat ve süre girin'); return; }
    setFlash((f) => ({ ...f, [barkodModal.id]: { price, exp: Date.now() + dk * 60000 } }));
    toast.success(`${barkodModal.ad}: ${dk} dk boyunca ${price}₺ indirimli`);
    setBarkodModal(null);
  };

  const parse = async () => {
    if (!stream) { toast.error('Önce "Yeni Yayın" başlatın'); return; }
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('Yorum girilmedi'); return; }
    setBusy(true);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const user = parts[0] || 'kullanici';
      const kod = parts[1] || '';
      const beden = parts[2] || '';
      const p = findByCode(kod);
      let variation: string | undefined;
      if (p && (p.variations || []).length > 0) {
        const v = p.variations.find((x: any) => norm(x.deger) === norm(beden));
        if (v) variation = v.deger;
      }
      try {
        await api.post('/store/live/order', { streamId: stream.id, user, kod, beden, productId: p?.id, variation, urun: p?.ad || kod, saticiAd: satici || null, fiyatOverride: activeFlash(p?.id) });
      } catch { /* */ }
    }
    setText(''); setBusy(false);
    await loadActive(); reload();
    toast.success('İşlendi');
  };

  const iptalEt = async (o: any) => {
    if (o.durum === 'iptal') return;
    try { const r = await api.post(`/store/live/order/${o.id}/iptal`); setOrders(r.data.orders || []); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // İstatistikler (onaylanan = ciro; iptal haric)
  const stats = useMemo(() => {
    const ona = orders.filter((o) => o.durum === 'onaylandi');
    const ciro = ona.reduce((s, o) => s + o.tutar, 0);
    const maliyet = ona.reduce((s, o) => s + o.alis, 0);
    return {
      ciro, kar: ciro - maliyet, toplam: orders.length,
      onaylandi: ona.length,
      stokYok: orders.filter((o) => o.durum === 'stok_yok').length,
      riskli: orders.filter((o) => o.durum === 'riskli').length,
      iptal: orders.filter((o) => o.durum === 'iptal').length,
    };
  }, [orders]);

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

  const saticilar = useMemo(() => Array.from(new Set([...sellers, ...orders.map((o) => o.saticiAd).filter(Boolean)])), [sellers, orders]);
  const filtered = useMemo(() => {
    let list = tab === 'tumu' ? orders : orders.filter((o) => o.durum === tab);
    if (search.trim()) {
      const q = norm(search);
      list = list.filter((o) => [o.user, o.urun, o.kod, o.beden, o.saticiAd].some((f) => norm(f || '').includes(q)));
    }
    return list;
  }, [orders, tab, search, sellers]);

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
          <Stat icon={Wallet} label="Tahmini Kâr" value={fmt(stats.kar)} color="text-indigo-600" />
          <Stat icon={ShoppingBag} label="Sipariş" value={stats.onaylandi} />
          <Stat icon={Users} label="İzleyici" value={stream ? viewers.toLocaleString('tr-TR') : '0'} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openHistory} className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200"><History size={16} /> Geçmiş</button>
          <button onClick={() => setKampOpen(true)} className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-amber-200"><Tag size={16} /> Kampanyalar</button>
          <button onClick={() => setReportOpen(true)} className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200"><BarChart3 size={16} /> Raporlar</button>
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
          {/* Satici secimi */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><UserCircle size={18} className="text-indigo-600" /> Aktif Satıcı {satici && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{satici}</span>}</h3>
            <div className="flex gap-2">
              <input value={satici} onChange={(e) => setSatici(e.target.value)} placeholder="Satıcı adı" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={addSeller} title="Satıcı kaydet" className="bg-indigo-600 text-white px-3 rounded-lg hover:bg-indigo-700"><Plus size={16} /></button>
            </div>
            {sellers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {sellers.map((s) => (
                  <button key={s} onClick={() => setSatici(s)} className={`px-2.5 py-1 rounded-full text-xs ${satici === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s}</button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1">Kaydettikten sonra isme tıklayarak satıcıyı anında değiştirebilirsiniz.</p>
          </div>

          {/* Barkod ile urun arama */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2"><Filter size={16} className="text-indigo-600" /> Barkod / Kod ile Ürün</h3>
            <div className="flex gap-2">
              <input value={barkod} onChange={(e) => setBarkod(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && scanBarcode()} placeholder="Barkod okut veya kod yaz" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" autoFocus />
              <button onClick={scanBarcode} className="bg-slate-800 text-white px-3 rounded-lg hover:bg-slate-700 text-sm">Okut</button>
            </div>
            {barHistory.length > 0 && (
              <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                <p className="text-[10px] text-slate-400 uppercase">Okutulan Geçmiş</p>
                {barHistory.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs border-b border-slate-50 py-1">
                    <div><span className="font-medium text-slate-700">{b.ad}</span> <span className="text-slate-400">· {b.kod}</span></div>
                    <span className={`${b.stok > 0 ? 'text-green-600' : 'text-red-500'}`}>Stok {b.stok}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 mb-2">Manuel Yorumdan Sipariş</h3>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={'kullanıcı satışkodu beden\nahmet SK1024 XL\nmehmet SK0712 M'} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300" />
            <p className="text-[10px] text-slate-400 mt-1">Satış kodu depodaki ürünle, beden varyasyonla eşleşir; stok varsa onaylanır.</p>
            <button onClick={parse} disabled={busy || !stream} className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"><Send size={16} /> {busy ? 'İşleniyor...' : 'Siparişleri Ayrıştır & Al'}</button>
            {!stream && <p className="text-[10px] text-red-500 mt-1">Yayın kapalı. Önce "Yeni Yayın" başlatın.</p>}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-800 mb-2">Canlı Sohbet Akışı <span className="text-xs text-slate-400">{orders.length}</span></h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {orders.slice(0, 30).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-xs border-b border-slate-50 pb-1">
                  <div><span className="font-medium text-slate-700">{o.user}</span> <span className="text-slate-400">{o.kod} {o.beden}</span></div>
                  <span className="text-slate-300">{hhmm(o.createdAt)}</span>
                </div>
              ))}
              {orders.length === 0 && <p className="text-slate-400 text-xs">Henüz sipariş yok.</p>}
            </div>
          </div>
        </div>

        {/* Orta tablo */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {aktifKampanyalar.length > 0 && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-amber-700">🏷 Aktif Kampanyalar:</span>
              {aktifKampanyalar.map((k: any) => <span key={k.id} className="text-[11px] bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full" title={kampKisa(k)}>{kampKisa(k)}</span>)}
            </div>
          )}
          <div className="px-3 py-2 border-b border-slate-100 flex flex-wrap items-center gap-1">
            {([['tumu', `Tümü ${stats.toplam}`], ['onaylandi', `Onaylandı ${stats.onaylandi}`], ['stok_yok', `Stok Yetersiz ${stats.stokYok}`], ['riskli', `Riskli ${stats.riskli}`], ['iptal', `İptal ${stats.iptal}`]] as [any, string][]).map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{l}</button>
            ))}
            <span className="ml-auto flex items-center gap-2">
              <span className="relative">
                <Search size={13} className="absolute left-2 top-1.5 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara (ürün, kod, müşteri, satıcı)" className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg w-56 outline-none" />
              </span>
            </span>
          </div>
          <div className="overflow-x-auto max-h-[58vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left sticky top-0"><tr><th className="px-3 py-2">Kullanıcı</th><th className="px-3 py-2">Ürün</th><th className="px-3 py-2">Kod</th><th className="px-3 py-2">Beden</th><th className="px-3 py-2">Satıcı</th><th className="px-3 py-2">Tutar</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2">Saat</th><th className="px-3 py-2">İşlem</th></tr></thead>
              <tbody>
                {filtered.map((o) => {
                  const img = imgOf(o.productId);
                  const rowBg = o.durum === 'onaylandi' ? 'bg-green-50' : o.durum === 'rezerve' ? 'bg-blue-50' : o.durum === 'stok_yok' ? 'bg-red-50' : o.durum === 'iptal' ? 'opacity-60' : '';
                  return (
                    <tr key={o.id} className={`border-t border-slate-100 ${rowBg}`}>
                      <td className="px-3 py-2 font-medium text-slate-700"><div className="flex items-center gap-1.5">{o.user}{!isRegistered(o.user) && <><span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full" title="Müşterilerimde kayıtlı değil">Kayıt Yok</span><button onClick={() => { setKayitForm({ ad: '', instagram: o.user, telefon: '' }); setKayitModal(true); }} title="Hızlı müşteri kaydı oluştur" className="text-emerald-600 hover:bg-emerald-50 rounded p-0.5"><UserPlus size={14} /></button></>}</div></td>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="w-9 h-9 rounded-lg bg-slate-100 overflow-hidden shrink-0 cursor-zoom-in" onClick={() => img && setLightbox(img)}>{img ? <img src={img} className="w-full h-full object-cover" /> : null}</div><div><span className="text-slate-600">{o.urun}</span>{o.durum === 'onaylandi' && kampanyaOf(o.productId) && <span className="block text-[9px] text-amber-600 font-medium" title={kampKisa(kampanyaOf(o.productId))}>🏷 {kampanyaOf(o.productId).ad}</span>}</div></div></td>
                      <td className="px-3 py-2 text-slate-500 font-mono text-xs">{o.kod || '-'}</td>
                      <td className="px-3 py-2 text-slate-500">{o.beden || '-'}</td>
                      <td className="px-3 py-2 text-slate-500">{o.saticiAd || '-'}</td>
                      <td className="px-3 py-2 font-medium">{fmt(o.tutar)}</td>
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
      </div>

      {/* Barkod urun modali */}
      {barkodModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setBarkodModal(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Ürün Bilgisi</h3><button onClick={() => setBarkodModal(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0">{(barkodModal.images || [])[0] ? <img src={barkodModal.images[0]} className="w-full h-full object-cover" /> : null}</div>
              <div><p className="font-semibold text-slate-800">{barkodModal.ad}</p><p className="text-xs text-slate-400 font-mono">Kod: {barkodModal.salesCode || '-'} · Barkod: {barkodModal.barkod || '-'}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] text-slate-400">Güncel Stok</p><p className={`font-bold ${(barkodModal.stokAdeti || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>{barkodModal.stokAdeti || 0}</p></div>
              <div className="bg-slate-50 rounded-lg p-2"><p className="text-[10px] text-slate-400">Satış Fiyatı</p><p className="font-bold text-slate-700">{fmt(barkodModal.satisFiyat || 0)}</p></div>
            </div>
            {(barkodModal.variations || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {barkodModal.variations.map((v: any) => <span key={v.id} className={`text-xs px-2 py-0.5 rounded border ${v.stok > 0 ? 'border-slate-200 text-slate-600' : 'border-red-200 text-red-500 line-through'}`}>{v.deger}: {v.stok}</span>)}
              </div>
            )}
            {activeFlash(barkodModal.id) > 0 && <p className="text-xs text-green-600">Aktif süreli indirim: {fmt(activeFlash(barkodModal.id))}</p>}
            <div className="border-t border-slate-100 pt-3">
              <p className="text-sm font-medium text-slate-700 mb-2">Süreli İndirimli Fiyat</p>
              <div className="flex gap-2">
                <input type="number" value={discForm.price} onChange={(e) => setDiscForm({ ...discForm, price: e.target.value })} placeholder="İndirimli fiyat ₺" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                <input type="number" value={discForm.dakika} onChange={(e) => setDiscForm({ ...discForm, dakika: e.target.value })} placeholder="Süre (dk)" className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Yalnızca bu süre içinde gelen siparişler indirimli fiyattan işlenir.</p>
              <button onClick={setFlashDiscount} className="w-full mt-2 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">İndirimi Başlat</button>
            </div>
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
