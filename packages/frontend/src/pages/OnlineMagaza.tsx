import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store, Save, Plus, Trash2, ArrowUp, ArrowDown, Tag, ExternalLink, GripVertical, Star, Percent, X, Menu, ChevronRight,
  ShoppingBag, Users, TrendingUp, Eye, Package, CreditCard, Wrench, Bell, ChevronRight as ArrowR, Megaphone, PackagePlus, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const fmt2 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VALID = (o: any) => o.durum !== 'iptal' && o.durum !== 'sepet';

export default function OnlineMagaza() {
  const { products, categories, storeSetting, discountCodes, orders, customers, campaigns, reload } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState<'genel' | 'ayarlar' | 'urunler' | 'siparisler' | 'kampanyalar' | 'raporlar'>('genel');
  const [period, setPeriod] = useState(7);
  const [overview, setOverview] = useState<any>(null);

  const [s, setS] = useState<any>({ active: false, slug: '', logoText: '', heroTitle: '', heroSubtitle: '', heroImage: '', heroVideo: '', bankaAd: '', iban: '', hesapSahibi: '', slides: [] as any[], productOrder: [] as string[], topMenu: [] as any[], freeShipThreshold: 0, puanOrani: 0 });
  const [disc, setDisc] = useState({ code: '', tip: 'yuzde', deger: '' });
  const [dragId, setDragId] = useState<string | null>(null);
  const [indModal, setIndModal] = useState<any | null>(null);
  const [indForm, setIndForm] = useState({ eskiFiyat: '', satisFiyat: '' });
  const [urunQ, setUrunQ] = useState('');
  const [kampModal, setKampModal] = useState(false);
  const [kampForm, setKampForm] = useState<any>({ ad: '', tip: 'sepet_tutar', minAdet: '', minTutar: '', indirimTip: 'yuzde', indirimDeger: '', kapsam: 'hepsi', kategoriId: '', productId: '' });

  useEffect(() => {
    if (storeSetting) setS({ active: storeSetting.active, slug: storeSetting.slug || '', logoText: storeSetting.logoText || '', heroTitle: storeSetting.heroTitle || '', heroSubtitle: storeSetting.heroSubtitle || '', heroImage: storeSetting.heroImage || '', heroVideo: storeSetting.heroVideo || '', bankaAd: storeSetting.bankaAd || '', iban: storeSetting.iban || '', hesapSahibi: storeSetting.hesapSahibi || '', slides: storeSetting.slides || [], productOrder: storeSetting.productOrder || [], topMenu: storeSetting.topMenu || [], freeShipThreshold: storeSetting.freeShipThreshold || 0, puanOrani: storeSetting.puanOrani || 0 });
  }, [storeSetting]);

  useEffect(() => { api.get(`/store/live/overview?days=${period || 30}`).then((r) => setOverview(r.data)).catch(() => setOverview(null)); }, [period]);

  // ───────── Hesaplamalar (Genel Bakış / Raporlar) ─────────
  const onlineProducts = useMemo(() => products.filter((p) => p.onlineMagaza), [products]);
  const custName = (id?: string) => customers.find((c) => c.id === id)?.ad || customers.find((c) => c.id === id)?.instagram || 'Misafir';
  const dayMs = 86400000;
  const inPeriod = (o: any, d = period) => d === 0 || (Date.now() - new Date(o.createdAt).getTime()) <= d * dayMs;
  const onlineOrders = useMemo(() => orders.filter((o) => o.kanal === 'online'), [orders]);

  const stat = useMemo(() => {
    const cur = onlineOrders.filter((o) => VALID(o) && inPeriod(o));
    const sales = cur.reduce((a, o) => a + (o.toplam || 0), 0);
    const count = cur.length;
    const avg = count ? sales / count : 0;
    // önceki dönem (değişim %)
    const d = period || 30;
    const prev = onlineOrders.filter((o) => { if (!VALID(o)) return false; const age = Date.now() - new Date(o.createdAt).getTime(); return age > d * dayMs && age <= 2 * d * dayMs; });
    const pSales = prev.reduce((a, o) => a + (o.toplam || 0), 0);
    const pCount = prev.length;
    const ch = (c: number, p: number) => p > 0 ? ((c - p) / p) * 100 : (c > 0 ? 100 : 0);
    const ziyaretci = overview?.ziyaretci || 0;
    const donusum = ziyaretci > 0 ? (count / ziyaretci) * 100 : 0;
    return { sales, count, avg, ziyaretci, donusum, dSales: ch(sales, pSales), dCount: ch(count, pCount), dAvg: ch(avg, pCount ? pSales / pCount : 0) };
  }, [onlineOrders, period, overview]);

  // Günlük seri (grafik için)
  const series = useMemo(() => {
    const n = period || 30;
    const days: { gun: string; sales: number; count: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * dayMs);
      const key = d.toISOString().slice(0, 10);
      const dayOrders = onlineOrders.filter((o) => VALID(o) && new Date(o.createdAt).toISOString().slice(0, 10) === key);
      days.push({ gun: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), sales: dayOrders.reduce((a, o) => a + (o.toplam || 0), 0), count: dayOrders.length });
    }
    return days;
  }, [onlineOrders, period]);

  // En çok satılan (sipariş kalemlerinden)
  const bestSellers = useMemo(() => {
    const m = new Map<string, { ad: string; adet: number; ciro: number; img: string }>();
    for (const o of onlineOrders) { if (!VALID(o) || !inPeriod(o)) continue; for (const it of (o.items || [])) { const key = it.productId || it.ad; const p = products.find((x) => x.id === it.productId); const cur = m.get(key) || { ad: it.ad || p?.ad || 'Ürün', adet: 0, ciro: 0, img: (p?.images || [])[0] || '' }; cur.adet += Number(it.adet) || 1; cur.ciro += (Number(it.fiyat) || 0) * (Number(it.adet) || 1); m.set(key, cur); } }
    return [...m.values()].sort((a, b) => b.adet - a.adet).slice(0, 5);
  }, [onlineOrders, period, products]);

  // En çok incelenen (backend overview) — yoksa en çok satılan
  const enCokIncelenen = (overview?.enCokIncelenen && overview.enCokIncelenen.length > 0) ? overview.enCokIncelenen : bestSellers.map((b) => ({ ad: b.ad, sayi: b.adet }));

  // Stok donut (mağazadaki ürünler)
  const stokDonut = useMemo(() => {
    let stokta = 0, az = 0, yok = 0;
    for (const p of onlineProducts) { const st = p.stokAdeti || 0; if (st === 0) yok++; else if (st <= 5) az++; else stokta++; }
    return { stokta, az, yok, total: onlineProducts.length };
  }, [onlineProducts]);

  // Kanal performansı (dönem içi, tüm kanallar)
  const kanalPerf = useMemo(() => {
    let online = 0, canli = 0, kasa = 0;
    for (const o of orders) { if (!VALID(o) || !inPeriod(o)) continue; if (o.kanal === 'online') online += o.toplam || 0; else if (o.kanal === 'canli') canli += o.toplam || 0; else kasa += o.toplam || 0; }
    const total = online + canli + kasa || 1;
    return { online, canli, kasa, total };
  }, [orders, period]);

  // Sipariş özeti (online, dönem)
  const siparisOzet = useMemo(() => {
    const cur = onlineOrders.filter((o) => inPeriod(o) && o.durum !== 'sepet');
    const tamam = cur.filter((o) => o.durum === 'tamamlandi').length;
    const iptal = cur.filter((o) => o.durum === 'iptal').length;
    const bekleyen = cur.length - tamam - iptal;
    return { toplam: cur.length, tamam, bekleyen, iptal };
  }, [onlineOrders, period]);

  const recentOrders = useMemo(() => [...onlineOrders].filter((o) => o.durum !== 'sepet').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6), [onlineOrders]);

  // Son bildirimler (türetilmiş)
  const bildirimler = useMemo(() => {
    const arr: { ic: any; c: string; t: string; s: string; at: string }[] = [];
    for (const o of recentOrders.slice(0, 3)) arr.push({ ic: ShoppingBag, c: 'text-indigo-500', t: `Yeni sipariş #${o.orderNo || o.id.slice(-4)}`, s: `${custName(o.customerId)} ${fmt(o.toplam)} tutarında sipariş verdi.`, at: new Date(o.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) });
    const lowStock = onlineProducts.filter((p) => (p.stokAdeti || 0) > 0 && (p.stokAdeti || 0) <= 5).slice(0, 2);
    for (const p of lowStock) arr.push({ ic: Bell, c: 'text-amber-500', t: 'Stok uyarısı', s: `${p.ad} stok adedi ${p.stokAdeti}'e düştü.`, at: 'Bugün' });
    return arr.slice(0, 4);
  }, [recentOrders, onlineProducts]);

  // ───────── Ayarlar handler'ları (mevcut) ─────────
  const addSlide = () => setS((x: any) => ({ ...x, slides: [...x.slides, { image: '', title: '', subtitle: '', cta: 'Alışverişe Başla' }] }));
  const setSlide = (i: number, patch: any) => setS((x: any) => ({ ...x, slides: x.slides.map((sl: any, idx: number) => idx === i ? { ...sl, ...patch } : sl) }));
  const delSlide = (i: number) => setS((x: any) => ({ ...x, slides: x.slides.filter((_: any, idx: number) => idx !== i) }));

  const ordered = [...onlineProducts].sort((a, b) => { const ia = s.productOrder.indexOf(a.id); const ib = s.productOrder.indexOf(b.id); return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib); });
  const move = (id: string, dir: -1 | 1) => { const ids = ordered.map((p) => p.id); const i = ids.indexOf(id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; setS((x: any) => ({ ...x, productOrder: ids })); };
  const onDrop = (targetId: string) => { if (!dragId || dragId === targetId) { setDragId(null); return; } const ids = ordered.map((p) => p.id); const from = ids.indexOf(dragId); const to = ids.indexOf(targetId); if (from < 0 || to < 0) { setDragId(null); return; } ids.splice(to, 0, ids.splice(from, 1)[0]); setS((x: any) => ({ ...x, productOrder: ids })); setDragId(null); };
  const toggleOne = async (p: any) => { try { await api.patch(`/store/products/${p.id}`, { oneCikan: !p.oneCikan }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const removeFromStore = async (p: any) => { try { await api.patch(`/store/products/${p.id}`, { onlineMagaza: false }); toast.success('Mağazadan kaldırıldı'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const openInd = (p: any) => { setIndForm({ eskiFiyat: String(p.eskiFiyat || p.satisFiyat || ''), satisFiyat: String(p.satisFiyat || '') }); setIndModal(p); };
  const saveInd = async () => { if (!indModal) return; const eski = Number(indForm.eskiFiyat) || 0; const yeni = Number(indForm.satisFiyat) || 0; if (yeni <= 0) { toast.error('Geçerli satış fiyatı girin'); return; } try { await api.patch(`/store/products/${indModal.id}`, { eskiFiyat: eski > yeni ? eski : null, satisFiyat: yeni }); toast.success('İndirim uygulandı'); setIndModal(null); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const clearInd = async (p: any) => { try { await api.patch(`/store/products/${p.id}`, { eskiFiyat: null }); toast.success('İndirim kaldırıldı'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const addMenu = () => setS((x: any) => ({ ...x, topMenu: [...(x.topMenu || []), { id: 'm' + Date.now(), label: 'Yeni Menü', type: 'ozel', value: 'tumu', children: [] }] }));
  const setMenu = (id: string, patch: any) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === id ? { ...m, ...patch } : m) }));
  const delMenu = (id: string) => setS((x: any) => ({ ...x, topMenu: x.topMenu.filter((m: any) => m.id !== id) }));
  const moveMenu = (id: string, dir: -1 | 1) => setS((x: any) => { const arr = [...x.topMenu]; const i = arr.findIndex((m: any) => m.id === id); const j = i + dir; if (j < 0 || j >= arr.length) return x; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...x, topMenu: arr }; });
  const addChild = (mid: string) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: [...(m.children || []), { label: 'Alt Menü', type: 'kategori', value: categories[0]?.id || '' }] } : m) }));
  const setChild = (mid: string, ci: number, patch: any) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: m.children.map((c: any, idx: number) => idx === ci ? { ...c, ...patch } : c) } : m) }));
  const delChild = (mid: string, ci: number) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: m.children.filter((_: any, idx: number) => idx !== ci) } : m) }));

  const buildBody = (over?: any) => ({ active: s.active, slug: s.slug || null, logoText: s.logoText || null, heroTitle: s.heroTitle || null, heroSubtitle: s.heroSubtitle || null, heroImage: s.heroImage || null, heroVideo: s.heroVideo || null, bankaAd: s.bankaAd || null, iban: s.iban || null, hesapSahibi: s.hesapSahibi || null, slides: s.slides, productOrder: s.productOrder, topMenu: s.topMenu, freeShipThreshold: Number(s.freeShipThreshold) || 0, puanOrani: Number(s.puanOrani) || 0, ...over });
  const save = async () => { try { await api.put('/store/settings', buildBody()); toast.success('Mağaza ayarları kaydedildi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const setActive = async (val: boolean) => { setS((x: any) => ({ ...x, active: val })); try { await api.put('/store/settings', buildBody({ active: val })); toast.success(val ? 'Mağaza yayında' : 'Mağaza bakım modunda'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const addDisc = async (e: React.FormEvent) => { e.preventDefault(); if (!disc.code.trim()) return; try { await api.post('/store/discounts', { code: disc.code.trim().toUpperCase(), tip: disc.tip, deger: Number(disc.deger) || 0, aktif: true }); setDisc({ code: '', tip: 'yuzde', deger: '' }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const delDisc = async (id: string) => { try { await api.delete(`/store/discounts/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const toggleDisc = async (d: any) => { try { await api.patch(`/store/discounts/${d.id}`, { aktif: !d.aktif }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  // Kampanya
  const toggleKamp = async (c: any) => { try { await api.patch(`/store/campaigns/${c.id}`, { aktif: !c.aktif }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const delKamp = async (id: string) => { if (!confirm('Kampanya silinsin mi?')) return; try { await api.delete(`/store/campaigns/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const saveKamp = async () => {
    if (!kampForm.ad.trim()) { toast.error('Kampanya adı girin'); return; }
    const body: any = { ad: kampForm.ad, tip: kampForm.tip, indirimTip: kampForm.indirimTip, indirimDeger: Number(kampForm.indirimDeger) || 0, kapsam: kampForm.kapsam, aktif: true };
    if (kampForm.tip === 'urun_adet') body.minAdet = Number(kampForm.minAdet) || 0;
    if (kampForm.tip === 'sepet_tutar') body.minTutar = Number(kampForm.minTutar) || 0;
    if (kampForm.kapsam === 'kategori') body.kategoriId = kampForm.kategoriId || null;
    if (kampForm.kapsam === 'urun') body.productId = kampForm.productId || null;
    try { await api.post('/store/campaigns', body); toast.success('Kampanya oluşturuldu'); setKampModal(false); setKampForm({ ad: '', tip: 'sepet_tutar', minAdet: '', minTutar: '', indirimTip: 'yuzde', indirimDeger: '', kapsam: 'hepsi', kategoriId: '', productId: '' }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const urunList = onlineProducts.filter((p) => !urunQ || (p.ad || '').toLowerCase().includes(urunQ.toLowerCase()) || (p.marka || '').toLowerCase().includes(urunQ.toLowerCase()));

  const TABS: [typeof tab, string, number | null][] = [
    ['genel', 'Genel Bakış', null], ['ayarlar', 'Mağaza Ayarları', null], ['urunler', 'Mağazadaki Ürünler', onlineProducts.length],
    ['siparisler', 'Siparişler', onlineOrders.filter((o) => o.durum !== 'sepet').length], ['kampanyalar', 'Kampanyalar', campaigns.length], ['raporlar', 'Raporlar', null],
  ];

  return (
    <div className="space-y-5">
      {/* Başlık + üst aksiyonlar */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center"><Store className="text-indigo-600" size={22} /></div>
          <div><h1 className="text-2xl font-bold text-slate-800">Online Mağaza Ayarları</h1><p className="text-sm text-slate-400">Mağazanızın performansını analiz edin, ayarlarını yönetin ve büyümenizi takip edin.</p></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href={s.slug ? `/m/${s.slug}` : '#'} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 ${!s.slug ? 'opacity-40 pointer-events-none' : ''}`}><ExternalLink size={15} /> Mağazayı Görüntüle</a>
          <button onClick={() => setActive(!s.active)} className={`inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl border ${s.active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}><span className={`w-9 h-5 rounded-full relative transition-colors ${s.active ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${s.active ? 'left-[18px]' : 'left-0.5'}`} /></span> Mağaza {s.active ? 'Aktif' : 'Kapalı'}</button>
          <button onClick={() => setActive(false)} className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border ${!s.active ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-amber-600'}`}><Wrench size={15} /> Bakım Modu</button>
          <button onClick={save} className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"><Save size={16} /> Kaydet</button>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(([k, t, n]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 ${tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t}{n !== null && <span className={`text-[11px] px-1.5 rounded-full ${tab === k ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>{n}</span>}</button>
          ))}
        </div>
        {(tab === 'genel' || tab === 'raporlar') && (
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="text-sm px-3 py-2 border border-slate-200 rounded-xl bg-white mb-2">
            {[[7, 'Son 7 Gün'], [30, 'Son 30 Gün'], [90, 'Son 90 Gün'], [0, 'Tüm Zamanlar']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        )}
      </div>

      {/* ───────── GENEL BAKIŞ ───────── */}
      {tab === 'genel' && (
        <div className="space-y-5">
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Toplam Satış" value={fmt(stat.sales)} delta={stat.dSales} icon={TrendingUp} cls="bg-indigo-100 text-indigo-600" series={series.map((d) => d.sales)} color="#6366f1" period={period} />
            <Kpi label="Sipariş" value={String(stat.count)} delta={stat.dCount} icon={ShoppingBag} cls="bg-violet-100 text-violet-600" series={series.map((d) => d.count)} color="#8b5cf6" period={period} />
            <Kpi label="Ziyaretçi" value={String(stat.ziyaretci)} icon={Users} cls="bg-sky-100 text-sky-600" series={series.map((d) => d.count)} color="#0ea5e9" period={period} />
            <Kpi label="Dönüşüm Oranı" value={`%${stat.donusum.toFixed(2)}`} icon={Percent} cls="bg-amber-100 text-amber-600" series={series.map((d) => d.count)} color="#f59e0b" period={period} />
            <Kpi label="Ort. Sipariş Tutarı" value={fmt2(stat.avg)} delta={stat.dAvg} icon={CreditCard} cls="bg-emerald-100 text-emerald-600" series={series.map((d) => d.sales)} color="#10b981" period={period} />
          </div>

          {/* Satış grafiği + en çok incelenen + en çok satan */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr_1fr] gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Satış Grafiği</h3>
              <LineChart data={series} />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm flex items-center gap-1.5"><Eye size={15} className="text-violet-600" /> En Çok İncelenen</h3>
              <RankList items={enCokIncelenen.map((x: any, i: number) => ({ rank: i + 1, ad: x.ad, val: `${x.sayi} görüntülenme`, pct: enCokIncelenen[0] ? (x.sayi / enCokIncelenen[0].sayi) * 100 : 0 }))} bar="bg-violet-500" empty="Henüz görüntülenme verisi yok." />
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm flex items-center gap-1.5"><TrendingUp size={15} className="text-emerald-600" /> En Çok Satılan</h3>
              <RankList items={bestSellers.map((b, i) => ({ rank: i + 1, ad: b.ad, val: `${b.adet} adet satıldı`, pct: bestSellers[0] ? (b.adet / bestSellers[0].adet) * 100 : 0 }))} bar="bg-emerald-500" empty="Bu dönemde satış yok." />
            </div>
          </div>

          {/* Donut satırı */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card title="Sipariş Özeti">
              <DonutBlock center={siparisOzet.toplam} centerSub="Toplam Sipariş" segs={[
                { t: 'Tamamlandı', n: siparisOzet.tamam, c: '#22c55e' }, { t: 'Bekleyen', n: siparisOzet.bekleyen, c: '#f59e0b' }, { t: 'İptal Edilen', n: siparisOzet.iptal, c: '#ef4444' },
              ]} unit="" />
              <button onClick={() => setTab('siparisler')} className="w-full mt-3 text-sm text-indigo-600 font-medium">Tüm Siparişleri Gör →</button>
            </Card>
            <Card title="Stok Durumu">
              <DonutBlock center={stokDonut.total} centerSub="Toplam Ürün" segs={[
                { t: 'Stokta', n: stokDonut.stokta, c: '#22c55e' }, { t: 'Stok Az', n: stokDonut.az, c: '#f59e0b' }, { t: 'Stok Yok', n: stokDonut.yok, c: '#ef4444' },
              ]} unit="" />
              <button onClick={() => setTab('urunler')} className="w-full mt-3 text-sm text-indigo-600 font-medium">Stokları Yönet →</button>
            </Card>
            <Card title="Kanal Performansı">
              <DonutBlock center={fmt(kanalPerf.total)} centerSub="Toplam Satış" money segs={[
                { t: 'Online Mağaza', n: kanalPerf.online, c: '#6366f1' }, { t: 'Canlı Yayın', n: kanalPerf.canli, c: '#8b5cf6' }, { t: 'Kasa Satışı', n: kanalPerf.kasa, c: '#0ea5e9' },
              ]} unit="" />
            </Card>
            <Card title="Cihazlara Göre Ziyaretçi">
              <DonutBlock center={(overview?.cihaz?.mobil || 0) + (overview?.cihaz?.web || 0)} centerSub="Toplam Ziyaretçi" segs={[
                { t: 'Mobil', n: overview?.cihaz?.mobil || 0, c: '#6366f1' }, { t: 'Masaüstü', n: overview?.cihaz?.web || 0, c: '#0ea5e9' },
              ]} unit="" />
            </Card>
          </div>

          {/* Son siparişler + bildirimler + hızlı işlemler */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr_1fr] gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-slate-800">Son Siparişler</h3><button onClick={() => setTab('siparisler')} className="text-xs text-indigo-600">Tüm Siparişleri Gör →</button></div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[440px]">
                <thead className="text-[11px] text-slate-400 uppercase text-left border-b border-slate-100"><tr><th className="py-2">Sipariş No</th><th>Müşteri</th><th>Tutar</th><th>Durum</th><th>Tarih</th></tr></thead>
                <tbody>{recentOrders.map((o) => { const st = durumBadge(o.durum); return (
                  <tr key={o.id} className="border-b border-slate-50"><td className="py-2.5 font-mono text-xs text-slate-500">#{o.orderNo || o.id.slice(-4)}</td><td className="text-slate-700">{custName(o.customerId)}</td><td className="font-semibold text-slate-800">{fmt(o.toplam)}</td><td><span className={`text-[11px] px-2 py-0.5 rounded-full ${st.c}`}>{st.t}</span></td><td className="text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}</td></tr>
                ); })}{recentOrders.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Henüz sipariş yok.</td></tr>}</tbody>
              </table></div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Son Bildirimler</h3>
              <div className="space-y-3">{bildirimler.map((b, i) => { const Ic = b.ic; return (
                <div key={i} className="flex items-start gap-2.5"><span className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0"><Ic size={14} className={b.c} /></span><div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-slate-700 leading-tight">{b.t}</p><p className="text-[11px] text-slate-400 leading-snug">{b.s}</p><p className="text-[10px] text-slate-300 mt-0.5">{b.at}</p></div></div>
              ); })}{bildirimler.length === 0 && <p className="text-sm text-slate-400">Bildirim yok.</p>}</div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Hızlı İşlemler</h3>
              <div className="grid grid-cols-2 gap-2">
                <Quick icon={PackagePlus} label="Yeni Ürün Ekle" onClick={() => nav('/depo/urun-ekle')} />
                <Quick icon={Package} label="Ürünleri Yönet" onClick={() => setTab('urunler')} />
                <Quick icon={ShoppingBag} label="Siparişleri Yönet" onClick={() => setTab('siparisler')} />
                <Quick icon={Megaphone} label="Kampanya Oluştur" onClick={() => { setTab('kampanyalar'); setKampModal(true); }} />
                <Quick icon={Tag} label="Kupon Oluştur" onClick={() => setTab('ayarlar')} />
                <Quick icon={FileText} label="Raporları Gör" onClick={() => setTab('raporlar')} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ───────── MAĞAZA AYARLARI (mevcut tüm ayarlar) ───────── */}
      {tab === 'ayarlar' && (
        <div className="space-y-5">
          {/* Genel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Mağaza Adresi (slug)</label>
                <div className="flex items-center gap-1 text-sm"><span className="text-slate-400">/m/</span><input value={s.slug} onChange={(e) => setS({ ...s, slug: e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase() })} placeholder="magaza-adi" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg" /></div>
              </div>
              <div><label className="block text-xs text-slate-500 mb-1">Mağaza / Logo Adı</label><input value={s.logoText} onChange={(e) => setS({ ...s, logoText: e.target.value })} placeholder="LACOS KENAN" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Hero Başlık</label><input value={s.heroTitle} onChange={(e) => setS({ ...s, heroTitle: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Hero Alt Başlık</label><input value={s.heroSubtitle} onChange={(e) => setS({ ...s, heroSubtitle: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">Hero Görseli</label><ImageDropzone images={s.heroImage ? [s.heroImage] : []} onChange={(imgs) => setS({ ...s, heroImage: imgs[0] || '' })} max={1} /></div>
          </div>

          {/* Videolu satış + banka */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h3 className="font-semibold text-slate-800 text-sm">Videolu Satış & Ödeme Bilgileri</h3>
            <div><label className="block text-xs text-slate-500 mb-1">Tanıtım / Canlı Video URL'i (mp4 veya yayın bağlantısı)</label><input value={s.heroVideo} onChange={(e) => setS({ ...s, heroVideo: e.target.value })} placeholder="https://.../video.mp4" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[11px] text-slate-400 mt-1">Doldurulunca ana sayfada video oynatıcı açılır; müşteri izlerken ürün ekleyebilir.</p></div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Banka Adı</label><input value={s.bankaAd} onChange={(e) => setS({ ...s, bankaAd: e.target.value })} placeholder="ör. İş Bankası" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">IBAN</label><input value={s.iban} onChange={(e) => setS({ ...s, iban: e.target.value })} placeholder="TR.." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Hesap Sahibi</label><input value={s.hesapSahibi} onChange={(e) => setS({ ...s, hesapSahibi: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <p className="text-[11px] text-slate-400">Havale/EFT seçen müşteriye asistan bu banka bilgilerini iletir.</p>
            <div className="grid sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
              <div><label className="block text-xs text-slate-500 mb-1">Ücretsiz Kargo Eşiği (TL)</label><input type="number" min={0} value={s.freeShipThreshold} onChange={(e) => setS({ ...s, freeShipThreshold: e.target.value })} placeholder="0 = kapalı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[10px] text-slate-400 mt-1">Bu tutar üzeri sepetlerde "ücretsiz kargo" rozeti gösterilir. 0 = kapalı.</p></div>
              <div><label className="block text-xs text-slate-500 mb-1">VIP Puan Oranı (%)</label><input type="number" min={0} max={100} step="0.5" value={s.puanOrani} onChange={(e) => setS({ ...s, puanOrani: e.target.value })} placeholder="0 = kapalı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[10px] text-slate-400 mt-1">Sepet tutarının %'i kadar puan müşteriye gösterilir. 0 = kapalı.</p></div>
            </div>
          </div>

          {/* Hero Slaytlari */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-slate-700">Hero Slaytları <span className="text-xs text-slate-400 font-normal">(birden fazla banner)</span></h3><button onClick={addSlide} className="inline-flex items-center gap-1 text-sm text-indigo-600"><Plus size={15} /> Slayt Ekle</button></div>
            {s.slides.length === 0 ? <p className="text-sm text-slate-400">Slayt yoksa yukarıdaki tek hero kullanılır.</p> : (
              <div className="space-y-4">{s.slides.map((sl: any, i: number) => (
                <div key={i} className="grid md:grid-cols-[160px_1fr_auto] gap-3 items-start border border-slate-100 rounded-lg p-3">
                  <ImageDropzone images={sl.image ? [sl.image] : []} onChange={(imgs) => setSlide(i, { image: imgs[0] || '' })} max={1} />
                  <div className="space-y-2"><input value={sl.title} onChange={(e) => setSlide(i, { title: e.target.value })} placeholder="Başlık (Yeni Sezon)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><input value={sl.subtitle} onChange={(e) => setSlide(i, { subtitle: e.target.value })} placeholder="Alt başlık" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><input value={sl.cta} onChange={(e) => setSlide(i, { cta: e.target.value })} placeholder="Buton metni" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                  <button onClick={() => delSlide(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}</div>
            )}
          </div>

          {/* Üst Menü */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-1"><h3 className="font-semibold text-slate-700 flex items-center gap-2"><Menu size={16} className="text-indigo-600" /> Üst Menü</h3><button onClick={addMenu} className="inline-flex items-center gap-1 text-sm text-indigo-600"><Plus size={15} /> Menü Ekle</button></div>
            <p className="text-xs text-slate-400 mb-3">Mağazanın üst menüsünde görünecek başlıkları oluşturun. Her başlığa kategori veya cinsiyet bazlı alt menüler ekleyebilirsiniz.</p>
            {(s.topMenu || []).length === 0 ? <p className="text-sm text-slate-400">Menü öğesi yok. Boş bırakılırsa varsayılan menü gösterilir.</p> : (
              <div className="space-y-3">{s.topMenu.map((m: any, mi: number) => (
                <div key={m.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input value={m.label} onChange={(e) => setMenu(m.id, { label: e.target.value })} placeholder="Menü başlığı" className="px-3 py-2 text-sm border border-slate-200 rounded-lg flex-1 min-w-[140px] font-medium" />
                    <select value={m.type} onChange={(e) => { const t = e.target.value; setMenu(m.id, { type: t, value: t === 'kategori' ? (categories[0]?.id || '') : t === 'cinsiyet' ? 'kadin' : 'tumu' }); }} className="px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="ozel">Özel Filtre</option><option value="kategori">Kategori</option><option value="cinsiyet">Cinsiyet</option></select>
                    {m.type === 'kategori' && <select value={m.value} onChange={(e) => setMenu(m.id, { value: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg">{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>}
                    {m.type === 'cinsiyet' && <select value={m.value} onChange={(e) => setMenu(m.id, { value: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg">{[['kadin', 'Kadın'], ['erkek', 'Erkek'], ['cocuk', 'Çocuk'], ['unisex', 'Unisex']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                    {m.type === 'ozel' && <select value={m.value} onChange={(e) => setMenu(m.id, { value: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg">{[['tumu', 'Tümü'], ['indirim', 'İndirimdekiler'], ['coksatan', 'Çok Satanlar'], ['yeni', 'Yeni Fırsatlar'], ['sonsans', 'Son Şans']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                    <button onClick={() => moveMenu(m.id, -1)} disabled={mi === 0} className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowUp size={15} /></button>
                    <button onClick={() => moveMenu(m.id, 1)} disabled={mi === s.topMenu.length - 1} className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowDown size={15} /></button>
                    <button onClick={() => delMenu(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                  </div>
                  <div className="mt-2 pl-4 border-l-2 border-slate-200 space-y-2">
                    {(m.children || []).map((c: any, ci: number) => (
                      <div key={ci} className="flex items-center gap-2 flex-wrap">
                        <ChevronRight size={13} className="text-slate-300 shrink-0" />
                        <input value={c.label} onChange={(e) => setChild(m.id, ci, { label: e.target.value })} placeholder="Alt menü adı" className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg flex-1 min-w-[120px]" />
                        <select value={c.type} onChange={(e) => { const t = e.target.value; setChild(m.id, ci, { type: t, value: t === 'kategori' ? (categories[0]?.id || '') : t === 'cinsiyet' ? 'kadin' : 'tumu' }); }} className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg"><option value="kategori">Kategori</option><option value="cinsiyet">Cinsiyet</option><option value="ozel">Özel</option></select>
                        {c.type === 'kategori' && <select value={c.value} onChange={(e) => setChild(m.id, ci, { value: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg">{categories.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}</select>}
                        {c.type === 'cinsiyet' && <select value={c.value} onChange={(e) => setChild(m.id, ci, { value: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg">{[['kadin', 'Kadın'], ['erkek', 'Erkek'], ['cocuk', 'Çocuk'], ['unisex', 'Unisex']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                        {c.type === 'ozel' && <select value={c.value} onChange={(e) => setChild(m.id, ci, { value: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg">{[['tumu', 'Tümü'], ['indirim', 'İndirimdekiler'], ['coksatan', 'Çok Satanlar'], ['yeni', 'Yeni'], ['sonsans', 'Son Şans']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
                        <button onClick={() => delChild(m.id, ci)} className="p-1 text-slate-400 hover:text-red-500"><X size={14} /></button>
                      </div>
                    ))}
                    <button onClick={() => addChild(m.id)} className="inline-flex items-center gap-1 text-xs text-indigo-600"><Plus size={13} /> Alt Menü Ekle</button>
                  </div>
                </div>
              ))}</div>
            )}
          </div>

          {/* Vitrin düzeni */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-1">Vitrin Düzeni & Ürün Sıralaması</h3>
            <p className="text-xs text-slate-400 mb-3">Kartı sürükleyip bırakarak sırayı belirleyin. <Star size={11} className="inline text-amber-500" /> öne çıkar, <Percent size={11} className="inline text-rose-500" /> indirime al.</p>
            {ordered.length === 0 ? <p className="text-sm text-slate-400">Online mağazada gösterilecek ürün yok. Ürünlerim'de bir ürünün "Mağaza" rozetini açın.</p> : (
              <div className="space-y-2">{ordered.map((p, i) => { const ind = (p.eskiFiyat && p.eskiFiyat > p.satisFiyat) ? Math.round(((p.eskiFiyat - p.satisFiyat) / p.eskiFiyat) * 100) : 0; return (
                <div key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(p.id)} className={`flex items-center gap-3 border rounded-xl p-2 bg-white transition-shadow ${dragId === p.id ? 'border-indigo-400 shadow-md opacity-60' : 'border-slate-100 hover:border-slate-300'}`}>
                  <GripVertical size={16} className="text-slate-300 cursor-grab shrink-0" />
                  <span className="text-xs font-bold text-slate-400 w-5 text-center shrink-0">{i + 1}</span>
                  <div className="relative shrink-0"><img src={(p.images || [])[0] || ''} className="w-11 h-11 rounded-lg object-cover bg-slate-100" />{ind > 0 && <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-bold px-1 rounded-full">%{ind}</span>}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{p.ad}</p><p className="text-xs text-slate-400">{ind > 0 ? <><span className="line-through text-slate-300 mr-1">{fmt(p.eskiFiyat)}</span><span className="text-rose-600 font-semibold">{fmt(p.satisFiyat)}</span></> : fmt(p.satisFiyat)}</p></div>
                  <button onClick={() => toggleOne(p)} title="Öne çıkar" className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${p.oneCikan ? 'bg-amber-50 border-amber-300 text-amber-500' : 'border-slate-200 text-slate-300 hover:text-amber-500'}`}><Star size={15} className={p.oneCikan ? 'fill-amber-400' : ''} /></button>
                  <button onClick={() => openInd(p)} title="İndirime al" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 flex items-center justify-center shrink-0"><Percent size={15} /></button>
                  {ind > 0 && <button onClick={() => clearInd(p)} title="İndirimi kaldır" className="text-[10px] text-rose-500 underline shrink-0">kaldır</button>}
                  <button onClick={() => removeFromStore(p)} title="Mağazadan kaldır" className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center shrink-0"><Trash2 size={15} /></button>
                  <div className="hidden sm:flex flex-col"><button onClick={() => move(p.id, -1)} disabled={i === 0} className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-30"><ArrowUp size={13} /></button><button onClick={() => move(p.id, 1)} disabled={i === ordered.length - 1} className="p-0.5 text-slate-300 hover:text-indigo-600 disabled:opacity-30"><ArrowDown size={13} /></button></div>
                </div>
              ); })}</div>
            )}
          </div>

          {/* İndirim kodları */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-3 flex items-center gap-2"><Tag size={16} /> İndirim Kodları</h3>
            <form onSubmit={addDisc} className="flex flex-wrap gap-2 mb-4">
              <input value={disc.code} onChange={(e) => setDisc({ ...disc, code: e.target.value })} placeholder="KOD" className="px-3 py-2 text-sm border border-slate-200 rounded-lg uppercase" />
              <select value={disc.tip} onChange={(e) => setDisc({ ...disc, tip: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-lg"><option value="yuzde">% Yüzde</option><option value="tutar">₺ Tutar</option></select>
              <input type="number" value={disc.deger} onChange={(e) => setDisc({ ...disc, deger: e.target.value })} placeholder="Değer" className="w-24 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <button className="inline-flex items-center gap-1 bg-indigo-600 text-white px-4 rounded-lg text-sm hover:bg-indigo-700"><Plus size={16} /> Ekle</button>
            </form>
            <div className="flex flex-wrap gap-2">{discountCodes.map((d) => (
              <span key={d.id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${d.aktif ? 'bg-white border-indigo-200 text-indigo-700' : 'bg-slate-100 border-slate-200 text-slate-400'}`}><strong>{d.code}</strong> {d.tip === 'yuzde' ? `%${d.deger}` : fmt(d.deger)}<button onClick={() => toggleDisc(d)} className="text-[10px] underline">{d.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button><button onClick={() => delDisc(d.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={13} /></button></span>
            ))}{discountCodes.length === 0 && <p className="text-sm text-slate-400">Henüz indirim kodu yok.</p>}</div>
          </div>
        </div>
      )}

      {/* ───────── MAĞAZADAKİ ÜRÜNLER ───────── */}
      {tab === 'urunler' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <input value={urunQ} onChange={(e) => setUrunQ(e.target.value)} placeholder="Mağazadaki ürünlerde ara..." className="flex-1 min-w-[200px] px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
            <button onClick={() => nav('/depo/urunlerim')} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50"><Package size={15} /> Tüm Ürünleri Yönet</button>
          </div>
          {urunList.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">Mağazada ürün yok. Ürünlerim'de bir ürünün "Mağaza" rozetini açın.</div> : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{urunList.map((p) => { const ind = (p.eskiFiyat && p.eskiFiyat > p.satisFiyat) ? Math.round(((p.eskiFiyat - p.satisFiyat) / p.eskiFiyat) * 100) : 0; const st = p.stokAdeti || 0; return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="relative aspect-square bg-slate-100"><img src={(p.images || [])[0] || ''} className="w-full h-full object-cover" />{ind > 0 && <span className="absolute top-2 left-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">%{ind}</span>}{p.oneCikan && <span className="absolute top-2 right-2 bg-amber-400 text-white w-6 h-6 rounded-full flex items-center justify-center"><Star size={12} className="fill-white" /></span>}</div>
                <div className="p-3">
                  <p className="font-medium text-slate-800 truncate text-sm">{p.ad}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">{ind > 0 && <span className="text-[11px] text-slate-300 line-through">{fmt(p.eskiFiyat)}</span>}<span className="font-bold text-slate-800">{fmt(p.satisFiyat)}</span><span className={`ml-auto text-[11px] font-bold ${st === 0 ? 'text-red-500' : st <= 5 ? 'text-amber-600' : 'text-green-600'}`}>{st} adet</span></div>
                  <div className="flex items-center gap-1 mt-2">
                    <button onClick={() => toggleOne(p)} title="Öne çıkar" className={`flex-1 h-8 rounded-lg border flex items-center justify-center ${p.oneCikan ? 'bg-amber-50 border-amber-300 text-amber-500' : 'border-slate-200 text-slate-400 hover:text-amber-500'}`}><Star size={14} className={p.oneCikan ? 'fill-amber-400' : ''} /></button>
                    <button onClick={() => openInd(p)} title="İndirime al" className="flex-1 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 flex items-center justify-center"><Percent size={14} /></button>
                    <button onClick={() => removeFromStore(p)} title="Mağazadan kaldır" className="flex-1 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ); })}</div>
          )}
        </div>
      )}

      {/* ───────── SİPARİŞLER ───────── */}
      {tab === 'siparisler' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100"><h3 className="font-semibold text-slate-800">Online Mağaza Siparişleri</h3><button onClick={() => nav('/siparisler/online')} className="text-xs text-indigo-600">Detaylı Yönetim →</button></div>
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
            <thead className="text-[11px] text-slate-400 uppercase text-left border-b border-slate-100"><tr><th className="px-4 py-3">Sipariş No</th><th className="px-4 py-3">Müşteri</th><th className="px-4 py-3">Ürün</th><th className="px-4 py-3">Tutar</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Tarih</th></tr></thead>
            <tbody>{onlineOrders.filter((o) => o.durum !== 'sepet').sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((o) => { const st = durumBadge(o.durum); const adet = (o.items || []).reduce((a: number, it: any) => a + (Number(it.adet) || 1), 0); return (
              <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50"><td className="px-4 py-3 font-mono text-xs text-slate-500">#{o.orderNo || o.id.slice(-4)}</td><td className="px-4 py-3 text-slate-700">{custName(o.customerId)}</td><td className="px-4 py-3 text-slate-500">{adet} ürün</td><td className="px-4 py-3 font-semibold text-slate-800">{fmt(o.toplam)}</td><td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full ${st.c}`}>{st.t}</span></td><td className="px-4 py-3 text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}</td></tr>
            ); })}{onlineOrders.filter((o) => o.durum !== 'sepet').length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Henüz online mağaza siparişi yok.</td></tr>}</tbody>
          </table></div>
        </div>
      )}

      {/* ───────── KAMPANYALAR ───────── */}
      {tab === 'kampanyalar' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800">Kampanyalar</h3><button onClick={() => setKampModal(true)} className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"><Plus size={16} /> Kampanya Oluştur</button></div>
          {campaigns.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">Henüz kampanya yok. "Kampanya Oluştur" ile başlayın.</div> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{campaigns.map((c) => (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><span className="w-9 h-9 rounded-lg bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center"><Megaphone size={17} /></span><div><p className="font-semibold text-slate-800 text-sm leading-tight">{c.ad}</p><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.aktif ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>{c.aktif ? 'Aktif' : 'Pasif'}</span></div></div><button onClick={() => delKamp(c.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button></div>
                <p className="text-xs text-slate-500 mt-2.5">{c.tip === 'urun_adet' ? `${c.minAdet} adet alana` : `${fmt(c.minTutar)} üzeri sepete`} <b className="text-slate-700">{c.indirimTip === 'yuzde' ? `%${c.indirimDeger}` : fmt(c.indirimDeger)}</b> indirim</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Kapsam: {c.kapsam === 'hepsi' ? 'Tüm ürünler' : c.kapsam === 'kategori' ? (categories.find((k) => k.id === c.kategoriId)?.ad || 'Kategori') : (products.find((p) => p.id === c.productId)?.ad || 'Ürün')}</p>
                <button onClick={() => toggleKamp(c)} className={`w-full mt-3 py-2 rounded-lg text-xs font-medium border ${c.aktif ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>{c.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {/* ───────── RAPORLAR ───────── */}
      {tab === 'raporlar' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MiniStat label="Dönem Cirosu" value={fmt(stat.sales)} cls="text-indigo-600" />
            <MiniStat label="Sipariş Sayısı" value={String(stat.count)} cls="text-violet-600" />
            <MiniStat label="Ort. Sepet" value={fmt2(stat.avg)} cls="text-emerald-600" />
            <MiniStat label="Ziyaretçi" value={String(stat.ziyaretci)} cls="text-sky-600" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Günlük Satış Trendi</h3>
            <LineChart data={series} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm">En Çok Satılan Ürünler</h3>
              <RankList items={bestSellers.map((b, i) => ({ rank: i + 1, ad: b.ad, val: `${b.adet} adet · ${fmt(b.ciro)}`, pct: bestSellers[0] ? (b.adet / bestSellers[0].adet) * 100 : 0 }))} bar="bg-emerald-500" empty="Bu dönemde satış yok." />
            </div>
            <Card title="Kanal Bazlı Satış">
              <DonutBlock center={fmt(kanalPerf.total)} centerSub="Toplam" money segs={[
                { t: 'Online Mağaza', n: kanalPerf.online, c: '#6366f1' }, { t: 'Canlı Yayın', n: kanalPerf.canli, c: '#8b5cf6' }, { t: 'Kasa Satışı', n: kanalPerf.kasa, c: '#0ea5e9' },
              ]} unit="" />
            </Card>
          </div>
        </div>
      )}

      {/* İndirime al modal */}
      {indModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setIndModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800 flex items-center gap-2"><Percent size={16} className="text-rose-500" /> İndirime Al</h3><button onClick={() => setIndModal(null)}><X size={18} className="text-slate-400" /></button></div>
            <div className="flex items-center gap-3"><img src={(indModal.images || [])[0] || ''} className="w-12 h-12 rounded-lg object-cover bg-slate-100" /><p className="text-sm font-medium text-slate-700">{indModal.ad}</p></div>
            <div><label className="block text-xs text-slate-500 mb-1">Liste / Eski Fiyat (üstü çizili gösterilir)</label><input type="number" value={indForm.eskiFiyat} onChange={(e) => setIndForm({ ...indForm, eskiFiyat: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">İndirimli Satış Fiyatı</label><input type="number" value={indForm.satisFiyat} onChange={(e) => setIndForm({ ...indForm, satisFiyat: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            {Number(indForm.eskiFiyat) > Number(indForm.satisFiyat) && Number(indForm.satisFiyat) > 0 && (<p className="text-xs text-rose-600 font-medium">İndirim: %{Math.round(((Number(indForm.eskiFiyat) - Number(indForm.satisFiyat)) / Number(indForm.eskiFiyat)) * 100)}</p>)}
            <button onClick={saveInd} className="w-full bg-rose-600 text-white py-2.5 rounded-lg font-medium hover:bg-rose-700">İndirimi Uygula</button>
          </div>
        </div>
      )}

      {/* Kampanya oluştur modal */}
      {kampModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setKampModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-5 space-y-3 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800 flex items-center gap-2"><Megaphone size={16} className="text-fuchsia-600" /> Yeni Kampanya</h3><button onClick={() => setKampModal(false)}><X size={18} className="text-slate-400" /></button></div>
            <input value={kampForm.ad} onChange={(e) => setKampForm({ ...kampForm, ad: e.target.value })} placeholder="Kampanya adı (ör. 3 al %10 indirim)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[11px] text-slate-400">Koşul Tipi</label><select value={kampForm.tip} onChange={(e) => setKampForm({ ...kampForm, tip: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="sepet_tutar">Sepet tutarı (X TL üzeri)</option><option value="urun_adet">Ürün adedi (X adet)</option></select></div>
              {kampForm.tip === 'urun_adet' ? <div><label className="text-[11px] text-slate-400">Min. Adet</label><input type="number" value={kampForm.minAdet} onChange={(e) => setKampForm({ ...kampForm, minAdet: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div> : <div><label className="text-[11px] text-slate-400">Min. Tutar (TL)</label><input type="number" value={kampForm.minTutar} onChange={(e) => setKampForm({ ...kampForm, minTutar: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[11px] text-slate-400">İndirim Tipi</label><select value={kampForm.indirimTip} onChange={(e) => setKampForm({ ...kampForm, indirimTip: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="yuzde">% Yüzde</option><option value="tutar">₺ Tutar</option></select></div>
              <div><label className="text-[11px] text-slate-400">İndirim Değeri</label><input type="number" value={kampForm.indirimDeger} onChange={(e) => setKampForm({ ...kampForm, indirimDeger: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <div><label className="text-[11px] text-slate-400">Kapsam</label><select value={kampForm.kapsam} onChange={(e) => setKampForm({ ...kampForm, kapsam: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="hepsi">Tüm ürünler</option><option value="kategori">Kategori</option><option value="urun">Tek ürün</option></select></div>
            {kampForm.kapsam === 'kategori' && <select value={kampForm.kategoriId} onChange={(e) => setKampForm({ ...kampForm, kategoriId: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Kategori seç</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>}
            {kampForm.kapsam === 'urun' && <select value={kampForm.productId} onChange={(e) => setKampForm({ ...kampForm, productId: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Ürün seç</option>{onlineProducts.map((p) => <option key={p.id} value={p.id}>{p.ad}</option>)}</select>}
            <button onClick={saveKamp} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Kampanyayı Oluştur</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── Yardımcı bileşenler ─────────
function durumBadge(d: string) {
  const map: Record<string, { t: string; c: string }> = {
    tamamlandi: { t: 'Tamamlandı', c: 'bg-green-100 text-green-600' }, yeni: { t: 'Yeni', c: 'bg-sky-100 text-sky-600' }, hazirlaniyor: { t: 'Hazırlanıyor', c: 'bg-amber-100 text-amber-600' }, kargoda: { t: 'Kargoda', c: 'bg-indigo-100 text-indigo-600' }, iptal: { t: 'İptal Edildi', c: 'bg-red-100 text-red-600' }, bekliyor: { t: 'Bekliyor', c: 'bg-amber-100 text-amber-600' },
  };
  return map[d] || { t: d, c: 'bg-slate-100 text-slate-500' };
}

function Kpi({ label, value, delta, icon: Ic, cls, series, color, period }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cls}`}><Ic size={16} /></div><p className="text-[11px] text-slate-400">{label}</p></div>
      </div>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-[10px] text-slate-400">{typeof delta === 'number' ? <span className={delta >= 0 ? 'text-green-600' : 'text-red-500'}>{delta >= 0 ? '↑' : '↓'} %{Math.abs(delta).toFixed(1)}</span> : ''} {period ? `Son ${period} güne göre` : 'Tüm zamanlar'}</p>
        <Spark data={series} color={color} />
      </div>
    </div>
  );
}

function Spark({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <span className="w-16 h-6" />;
  const max = Math.max(...data, 1); const min = Math.min(...data, 0);
  const w = 64, h = 22; const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * h}`).join(' ');
  return <svg width={w} height={h} className="shrink-0"><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}

function LineChart({ data }: { data: { gun: string; sales: number }[] }) {
  if (!data || data.length === 0) return <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Veri yok</div>;
  const w = 600, h = 180, pad = 28;
  const max = Math.max(...data.map((d) => d.sales), 1);
  const x = (i: number) => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const line = data.map((d, i) => `${x(i)},${y(d.sales)}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${x(data.length - 1)},${h - pad}`;
  const step = Math.max(1, Math.ceil(data.length / 7));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 200 }}>
      <defs><linearGradient id="lc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient></defs>
      {[0, 0.5, 1].map((g) => <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="#f1f5f9" strokeWidth="1" />)}
      <polygon points={area} fill="url(#lc)" />
      <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => i % step === 0 && <circle key={i} cx={x(i)} cy={y(d.sales)} r="3" fill="#6366f1" />)}
      {data.map((d, i) => i % step === 0 && <text key={'t' + i} x={x(i)} y={h - 6} fontSize="9" fill="#94a3b8" textAnchor="middle">{d.gun}</text>)}
    </svg>
  );
}

function RankList({ items, bar, empty }: { items: any[]; bar: string; empty: string }) {
  if (!items || items.length === 0) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <div className="space-y-2.5">{items.map((it) => (
      <div key={it.rank} className="flex items-center gap-2.5">
        <span className="text-xs font-bold text-slate-400 w-4">{it.rank}</span>
        <div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-700 truncate">{it.ad}</p><div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className={`h-full rounded-full ${bar}`} style={{ width: `${it.pct}%` }} /></div></div>
        <span className="text-xs text-slate-500 whitespace-nowrap">{it.val}</span>
      </div>
    ))}</div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl border border-slate-200 p-5"><h3 className="font-semibold text-slate-800 text-sm mb-3">{title}</h3>{children}</div>;
}

function DonutBlock({ center, centerSub, segs, money }: { center: any; centerSub: string; segs: { t: string; n: number; c: string }[]; unit?: string; money?: boolean }) {
  const total = segs.reduce((a, s2) => a + s2.n, 0) || 1;
  const r = 34, c = 2 * Math.PI * r; let off = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-24 h-24 shrink-0">
        <svg viewBox="0 0 90 90" className="w-full h-full -rotate-90"><circle cx="45" cy="45" r={r} fill="none" stroke="#eef2f7" strokeWidth="10" />{segs.map((s2, i) => { const len = (s2.n / total) * c; const el = <circle key={i} cx="45" cy="45" r={r} fill="none" stroke={s2.c} strokeWidth="10" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} strokeLinecap="round" />; off += len; return el; })}</svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-base font-bold text-slate-800 leading-none">{center}</span><span className="text-[8px] text-slate-400 mt-0.5 text-center px-1">{centerSub}</span></div>
      </div>
      <div className="flex-1 space-y-1.5">{segs.map((s2) => (
        <div key={s2.t} className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s2.c }} />{s2.t}</span><span className="text-slate-500 font-medium">{money ? fmt(s2.n) : s2.n} {money ? `(%${Math.round((s2.n / total) * 100)})` : `(%${Math.round((s2.n / total) * 100)})`}</span></div>
      ))}</div>
    </div>
  );
}

function Quick({ icon: Ic, label, onClick }: any) {
  return <button onClick={onClick} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-left transition-colors"><span className="inline-flex items-center gap-2 text-[12px] font-medium text-slate-700"><Ic size={15} className="text-indigo-600" /> {label}</span><ArrowR size={14} className="text-slate-300" /></button>;
}

function MiniStat({ label, value, cls }: { label: string; value: string; cls: string }) {
  return <div className="bg-white rounded-2xl border border-slate-200 p-4"><p className="text-[11px] text-slate-400">{label}</p><p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p></div>;
}
