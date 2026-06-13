import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store, Save, Plus, Trash2, ArrowUp, ArrowDown, Tag, ExternalLink, GripVertical, Star, Percent, X, Menu, ChevronRight,
  ShoppingBag, Users, TrendingUp, Eye, Package, CreditCard, Wrench, Bell, ChevronRight as ArrowR, Megaphone, PackagePlus, FileText, Pencil, SlidersHorizontal, Truck, Palette, Search, Share2, Image as ImageIcon, BarChart3, Folder, Sparkles, LayoutGrid,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const fmt2 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VALID = (o: any) => o.durum !== 'iptal' && o.durum !== 'sepet';

const DEFAULT_CONFIG = {
  aciklama: '', logo: '', featuredCats: [] as string[],
  email: '', telefon: '', whatsapp: '', adres: '', calismaHafta: '', calismaPazar: '',
  instagram: '', facebook: '', youtube: '', tiktok: '', twitter: '',
  primaryColor: '#6366f1', secondaryColor: '#0ea5e9', font: 'Inter', currency: 'TRY', dil: 'tr',
  seoTitle: '', metaDescription: '', keywords: '',
  kargoUcret: '', kargoNot: '',
  odemeHavale: true, odemeKart: true, odemeKapida: false,
  bildirimYeniSiparis: true, bildirimStok: true, bildirimYorum: true,
  iade: '', gizlilik: '', kullanim: '',
  firmaUnvan: '', vkn: '', vergiDairesi: '', firmaAdres: '', firmaEmail: '', firmaTel: '', mersis: '',
  metaPixel: '', tiktokPixel: '', ga4: '', googleAds: '', googleAdsLabel: '', customHead: '',
  collections: [] as { id: string; ad: string }[],
  collectionItems: {} as Record<string, string[]>, // productId -> [collectionId]
};

const AYARLAR_NAV: { k: string; t: string; sub: string; Ic: any }[] = [
  { k: 'bilgi', t: 'Mağaza Bilgileri', sub: 'Mağaza adı, adres, logo ve açıklama', Ic: Store },
  { k: 'banner', t: 'Banner & Slaytlar', sub: 'Hero görsel, başlık ve slaytlar', Ic: ImageIcon },
  { k: 'menu', t: 'Üst Menü', sub: 'Mağaza üst menüsü ve kategoriler', Ic: Menu },
  { k: 'story', t: 'Hikayeler (Story)', sub: 'Ana sayfa hikaye daireleri ve bağlantıları', Ic: Sparkles },
  { k: 'widget', t: 'Vitrin Widget’ları', sub: 'Renkli tanıtım kartları ve link yönlendirme', Ic: LayoutGrid },
  { k: 'kargo', t: 'Kargo & Teslimat', sub: 'Kargo eşiği, ücreti ve VIP puan', Ic: Truck },
  { k: 'odeme', t: 'Ödeme Ayarları', sub: 'Banka, IBAN ve ödeme yöntemleri', Ic: CreditCard },
  { k: 'kupon', t: 'Kupon Kodları', sub: 'İndirim kuponları', Ic: Tag },
  { k: 'iletisim', t: 'İletişim & Sosyal', sub: 'İletişim bilgileri ve sosyal medya', Ic: Share2 },
  { k: 'tema', t: 'Tema & Görünüm', sub: 'Renkler, font, para birimi ve dil', Ic: Palette },
  { k: 'seo', t: 'SEO & Arama', sub: 'SEO başlık, açıklama ve anahtar kelimeler', Ic: Search },
  { k: 'pixel', t: 'Takip Kodları (Pixel)', sub: 'Meta, TikTok, GA4, Google Ads', Ic: BarChart3 },
  { k: 'bildirim', t: 'Bildirim Ayarları', sub: 'E-posta ve bildirim tercihleri', Ic: Bell },
  { k: 'politika', t: 'Politikalar', sub: 'İade, gizlilik ve kullanım şartları', Ic: FileText },
];

export default function OnlineMagaza() {
  const { products, categories, storeSetting, discountCodes, orders, customers, campaigns, reload } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState<'genel' | 'ayarlar' | 'urunler' | 'siparisler' | 'kampanyalar' | 'raporlar'>('genel');
  const [period, setPeriod] = useState(7);
  const [overview, setOverview] = useState<any>(null);

  const [s, setS] = useState<any>({ active: false, slug: '', logoText: '', heroTitle: '', heroSubtitle: '', heroImage: '', heroVideo: '', bankaAd: '', iban: '', hesapSahibi: '', slides: [] as any[], stories: [] as any[], widgets: [] as any[], productOrder: [] as string[], topMenu: [] as any[], freeShipThreshold: 0, puanOrani: 0, config: { ...DEFAULT_CONFIG } });
  const [aTab, setATab] = useState('bilgi');
  const [paytr, setPaytr] = useState<any>({ merchant_id: '', merchant_key: '', merchant_salt: '', mode: 'TEST', enabled: false });
  useEffect(() => { api.get('/store/paytr').then((r) => setPaytr((p: any) => ({ ...p, ...r.data }))).catch(() => {}); }, []);
  const savePaytr = () => { api.put('/store/paytr', paytr).then(() => toast.success('PayTR ayarları kaydedildi')).catch(() => toast.error('Kaydedilemedi')); };
  const [disc, setDisc] = useState({ code: '', tip: 'yuzde', deger: '' });
  const [dragId, setDragId] = useState<string | null>(null);
  const [urunQ, setUrunQ] = useState('');
  const [kampModal, setKampModal] = useState(false);
  const [kampForm, setKampForm] = useState<any>({ ad: '', tip: 'sepet_tutar', minAdet: '', minTutar: '', indirimTip: 'yuzde', indirimDeger: '', kapsam: 'hepsi', kategoriId: '', productId: '' });
  // Tedarikçi deposu (drop) ürünleri — kampanya kapsam seçiminde de listelensin
  const [freeProducts, setFreeProducts] = useState<any[]>([]);
  useEffect(() => { api.get('/store/free/products').then((r) => setFreeProducts(r.data || [])).catch(() => {}); }, []);
  // Mağazadaki ürünler — filtre & düzenleme
  const [uFilters, setUFilters] = useState(false);
  const [uMarka, setUMarka] = useState('');
  const [uCinsiyet, setUCinsiyet] = useState('');
  const [uKategori, setUKategori] = useState('');
  const [uGorunum, setUGorunum] = useState('tumu'); // tumu | one | indirim | var:N
  const [activeColl, setActiveColl] = useState('tumu'); // koleksiyon sekmesi
  const [imgZoom, setImgZoom] = useState('');
  const [editModal, setEditModal] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({ satisFiyat: '', eskiFiyat: '', aciklama: '', oneCikan: false, collections: [] as string[] });
  const [nameEdit, setNameEdit] = useState<{ id: string; val: string } | null>(null);
  const saveName = async (p: any, val: string) => {
    const t = (val || '').trim();
    setNameEdit(null);
    if (!t || t === p.ad) return;
    try { await api.patch(`/store/products/${p.id}`, { ad: t }); toast.success('Ürün adı güncellendi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  useEffect(() => {
    if (storeSetting) setS({ active: storeSetting.active, slug: storeSetting.slug || '', logoText: storeSetting.logoText || '', heroTitle: storeSetting.heroTitle || '', heroSubtitle: storeSetting.heroSubtitle || '', heroImage: storeSetting.heroImage || '', heroVideo: storeSetting.heroVideo || '', bankaAd: storeSetting.bankaAd || '', iban: storeSetting.iban || '', hesapSahibi: storeSetting.hesapSahibi || '', slides: storeSetting.slides || [], stories: storeSetting.stories || [], widgets: storeSetting.widgets || [], productOrder: storeSetting.productOrder || [], topMenu: storeSetting.topMenu || [], freeShipThreshold: storeSetting.freeShipThreshold || 0, puanOrani: storeSetting.puanOrani || 0, config: { ...DEFAULT_CONFIG, ...(storeSetting.config || {}) } });
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
  const toggleOne = async (p: any) => { try { await api.patch(`/store/products/${p.id}`, { oneCikan: !p.oneCikan }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const removeFromStore = async (p: any) => { try { await api.patch(`/store/products/${p.id}`, { onlineMagaza: false }); toast.success('Mağazadan kaldırıldı'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const addMenu = () => setS((x: any) => ({ ...x, topMenu: [...(x.topMenu || []), { id: 'm' + Date.now(), label: 'Yeni Menü', type: 'ozel', value: 'tumu', children: [] }] }));
  const setMenu = (id: string, patch: any) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === id ? { ...m, ...patch } : m) }));
  const delMenu = (id: string) => setS((x: any) => ({ ...x, topMenu: x.topMenu.filter((m: any) => m.id !== id) }));
  const moveMenu = (id: string, dir: -1 | 1) => setS((x: any) => { const arr = [...x.topMenu]; const i = arr.findIndex((m: any) => m.id === id); const j = i + dir; if (j < 0 || j >= arr.length) return x; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...x, topMenu: arr }; });
  const addChild = (mid: string) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: [...(m.children || []), { label: 'Alt Menü', type: 'kategori', value: categories[0]?.id || '' }] } : m) }));
  const setChild = (mid: string, ci: number, patch: any) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: m.children.map((c: any, idx: number) => idx === ci ? { ...c, ...patch } : c) } : m) }));
  const delChild = (mid: string, ci: number) => setS((x: any) => ({ ...x, topMenu: x.topMenu.map((m: any) => m.id === mid ? { ...m, children: m.children.filter((_: any, idx: number) => idx !== ci) } : m) }));

  // ── Story yönetimi ──
  const addStory = () => setS((x: any) => ({ ...x, stories: [...(x.stories || []), { id: 'st' + Date.now(), image: '', title: 'Yeni Hikaye', link: { type: 'filtre', value: 'yeni' } }] }));
  const setStory = (id: string, patch: any) => setS((x: any) => ({ ...x, stories: (x.stories || []).map((it: any) => it.id === id ? { ...it, ...patch } : it) }));
  const delStory = (id: string) => setS((x: any) => ({ ...x, stories: (x.stories || []).filter((it: any) => it.id !== id) }));
  const moveStory = (id: string, dir: -1 | 1) => setS((x: any) => { const arr = [...(x.stories || [])]; const i = arr.findIndex((it: any) => it.id === id); const j = i + dir; if (j < 0 || j >= arr.length) return x; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...x, stories: arr }; });

  // ── Vitrin widget yönetimi ──
  const WIDGET_COLORS = ['#7c3aed', '#db2777', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#6366f1', '#0f172a'];
  const addWidget = () => setS((x: any) => ({ ...x, widgets: [...(x.widgets || []), { id: 'wg' + Date.now(), title: 'Yeni Widget', subtitle: '', badge: '', image: '', color: WIDGET_COLORS[(x.widgets || []).length % WIDGET_COLORS.length], ctaLabel: 'İncele', link: { type: 'filtre', value: 'indirim' } }] }));
  const setWidget = (id: string, patch: any) => setS((x: any) => ({ ...x, widgets: (x.widgets || []).map((it: any) => it.id === id ? { ...it, ...patch } : it) }));
  const delWidget = (id: string) => setS((x: any) => ({ ...x, widgets: (x.widgets || []).filter((it: any) => it.id !== id) }));
  const moveWidget = (id: string, dir: -1 | 1) => setS((x: any) => { const arr = [...(x.widgets || [])]; const i = arr.findIndex((it: any) => it.id === id); const j = i + dir; if (j < 0 || j >= arr.length) return x; [arr[i], arr[j]] = [arr[j], arr[i]]; return { ...x, widgets: arr }; });


  const buildBody = (over?: any) => ({ active: s.active, slug: s.slug || null, logoText: s.logoText || null, heroTitle: s.heroTitle || null, heroSubtitle: s.heroSubtitle || null, heroImage: s.heroImage || null, heroVideo: s.heroVideo || null, bankaAd: s.bankaAd || null, iban: s.iban || null, hesapSahibi: s.hesapSahibi || null, slides: s.slides, stories: s.stories, widgets: s.widgets, productOrder: s.productOrder, topMenu: s.topMenu, config: s.config, freeShipThreshold: Number(s.freeShipThreshold) || 0, puanOrani: Number(s.puanOrani) || 0, ...over });
  const setCfg = (k: string, v: any) => setS((x: any) => ({ ...x, config: { ...x.config, [k]: v } }));
  const cfg = s.config || DEFAULT_CONFIG;
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

  // ── Mağazadaki ürünler: filtre + sıralama + düzenleme ──
  const vStok = (p: any) => (p.variations || []).filter((v: any) => (v.stok || 0) > 0).length;
  const uBrands = [...new Set(onlineProducts.map((p) => p.marka).filter(Boolean))].sort() as string[];
  const uGenders = [...new Set(onlineProducts.map((p) => p.cinsiyet).filter(Boolean))] as string[];
  const varCounts = [...new Set(onlineProducts.map(vStok).filter((n) => n > 0))].sort((a, b) => a - b);
  const GENDER_LBL: Record<string, string> = { kadin: 'Kadın', erkek: 'Erkek', cocuk: 'Çocuk', unisex: 'Unisex' };
  const matchU = (p: any) => {
    if (activeColl !== 'tumu') { const m = (cfg.collectionItems || {})[p.id] || []; if (!m.includes(activeColl)) return false; }
    if (urunQ && !((p.ad || '').toLowerCase().includes(urunQ.toLowerCase()) || (p.marka || '').toLowerCase().includes(urunQ.toLowerCase()))) return false;
    if (uMarka && p.marka !== uMarka) return false;
    if (uCinsiyet && p.cinsiyet !== uCinsiyet) return false;
    if (uKategori && p.kategoriId !== uKategori) return false;
    if (uGorunum === 'one' && !p.oneCikan) return false;
    if (uGorunum === 'indirim' && !(p.eskiFiyat && p.eskiFiyat > p.satisFiyat)) return false;
    if (uGorunum.startsWith('var:') && vStok(p) !== Number(uGorunum.slice(4))) return false;
    return true;
  };
  const uFilterActive = !!(urunQ || uMarka || uCinsiyet || uKategori || uGorunum !== 'tumu');
  const uOrdered = ordered.filter(matchU);
  // Sürükle-bırak: filtre açıkken yalnız filtreli liste içinde, global productOrder'a yazılır
  const onDropU = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const globalIds = ordered.map((p) => p.id);
    const filteredIds = new Set(uOrdered.map((p) => p.id));
    const slots: number[] = []; globalIds.forEach((id, idx) => { if (filteredIds.has(id)) slots.push(idx); });
    const curOrder = slots.map((i) => globalIds[i]);
    const from = curOrder.indexOf(dragId); const to = curOrder.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    curOrder.splice(to, 0, curOrder.splice(from, 1)[0]);
    const result = [...globalIds]; slots.forEach((slotIdx, k) => { result[slotIdx] = curOrder[k]; });
    setS((x: any) => ({ ...x, productOrder: result })); setDragId(null);
  };
  // Sıra numarası: genel vitrin sırasını etkiler
  const setPosition = (id: string, pos: number) => {
    const ids = ordered.map((p) => p.id).filter((x) => x !== id);
    let idx = (Number(pos) || 1) - 1; if (idx < 0) idx = 0; if (idx > ids.length) idx = ids.length;
    ids.splice(idx, 0, id);
    setS((x: any) => ({ ...x, productOrder: ids }));
  };
  const globalPos = (id: string) => ordered.findIndex((p) => p.id === id) + 1;
  // Koleksiyon (manuel başlık) yönetimi — config'e kaydedilir
  const persistCfg = (cfgPart: any) => { const merged = { ...s.config, ...cfgPart }; setS((x: any) => ({ ...x, config: merged })); api.put('/store/settings', buildBody({ config: merged })).catch(() => {}); };
  const addColl = () => { const ad = prompt('Başlık adı (ör. Öne Çıkanlar, Fiyatı Düşenler)'); if (!ad || !ad.trim()) return; persistCfg({ collections: [...(cfg.collections || []), { id: 'c' + Date.now(), ad: ad.trim() }] }); };
  const renameColl = (id: string) => { const c = (cfg.collections || []).find((x: any) => x.id === id); const ad = prompt('Başlık adı', c?.ad || ''); if (ad == null) return; persistCfg({ collections: (cfg.collections || []).map((x: any) => x.id === id ? { ...x, ad: ad.trim() || x.ad } : x) }); };
  const delColl = (id: string) => { if (!confirm('Bu başlık silinsin mi?')) return; const items = { ...(cfg.collectionItems || {}) }; Object.keys(items).forEach((pid) => { items[pid] = (items[pid] || []).filter((x: string) => x !== id); }); persistCfg({ collections: (cfg.collections || []).filter((x: any) => x.id !== id), collectionItems: items }); if (activeColl === id) setActiveColl('tumu'); };
  // Ürün düzenleme modalı
  const openEdit = (p: any) => { setEditForm({ satisFiyat: String(p.satisFiyat ?? ''), eskiFiyat: String(p.eskiFiyat ?? ''), aciklama: p.aciklama || '', oneCikan: !!p.oneCikan, collections: (cfg.collectionItems || {})[p.id] || [] }); setEditModal(p); };
  const saveEdit = async () => {
    if (!editModal) return;
    const yeni = Number(editForm.satisFiyat) || 0;
    const eski = editForm.eskiFiyat ? Number(editForm.eskiFiyat) : 0;
    if (yeni <= 0) { toast.error('Geçerli satış fiyatı girin'); return; }
    const body = { satisFiyat: yeni, eskiFiyat: eski > yeni ? eski : null, aciklama: editForm.aciklama || null, oneCikan: !!editForm.oneCikan };
    const newItems = { ...(cfg.collectionItems || {}), [editModal.id]: editForm.collections };
    const merged = { ...s.config, collectionItems: newItems };
    try { await api.patch(`/store/products/${editModal.id}`, body); await api.put('/store/settings', buildBody({ config: merged })); setS((x: any) => ({ ...x, config: merged })); toast.success('Ürün güncellendi'); setEditModal(null); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

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
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border bg-white border-slate-200 text-slate-600 hover:bg-slate-50"><ExternalLink size={15} /> Mağazayı Görüntüle</a>
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
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Sol alt-menü */}
          <aside className="w-full lg:w-72 shrink-0 bg-white rounded-2xl border border-slate-200 p-2 space-y-0.5 lg:sticky lg:top-4">
            {AYARLAR_NAV.map((n) => { const Ic = n.Ic; const on = aTab === n.k; return (
              <button key={n.k} onClick={() => setATab(n.k)} className={`w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded-xl transition-colors ${on ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Ic size={16} /></span>
                <span className="min-w-0"><span className={`block text-sm font-medium leading-tight ${on ? 'text-indigo-700' : 'text-slate-700'}`}>{n.t}</span><span className="block text-[11px] text-slate-400 leading-tight truncate">{n.sub}</span></span>
              </button>
            ); })}
          </aside>

          {/* Sağ içerik */}
          <div className="flex-1 min-w-0 space-y-5">

          {/* ── Mağaza Bilgileri ── */}
          {aTab === 'bilgi' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-1">Mağaza Bilgileri</h3>
            <p className="text-xs text-slate-400 mb-4">Mağazanızın temel bilgilerini düzenleyin.</p>
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="space-y-3">
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza Adı</label><div className="relative"><input maxLength={100} value={s.logoText} onChange={(e) => setS({ ...s, logoText: e.target.value })} placeholder="KENAN CANLI MEZAT" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><span className="absolute right-2 top-2 text-[10px] text-slate-300">{(s.logoText || '').length}/100</span></div></div>
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza Adresi (slug)</label><div className="flex items-center gap-1 text-sm"><span className="text-slate-400 shrink-0">/m/</span><div className="relative flex-1"><input maxLength={50} value={s.slug} onChange={(e) => setS({ ...s, slug: e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase() })} placeholder="magaza-adi" className="w-full px-3 py-2 border border-slate-200 rounded-lg" /><span className="absolute right-2 top-2.5 text-[10px] text-slate-300">{(s.slug || '').length}/50</span></div></div></div>
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza Açıklaması</label><div className="relative"><textarea maxLength={500} rows={3} value={cfg.aciklama} onChange={(e) => setCfg('aciklama', e.target.value)} placeholder="İndirimli ürünler, sezon fırsatları ve özel koleksiyonlar için mağazamızı takip edin." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><span className="absolute right-2 bottom-2 text-[10px] text-slate-300">{(cfg.aciklama || '').length}/500</span></div></div>
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza Logosu</label><ImageDropzone images={cfg.logo ? [cfg.logo] : []} onChange={(imgs) => setCfg('logo', imgs[0] || '')} max={1} /><p className="text-[10px] text-slate-400 mt-1">Önerilen boyut: 500x500px, JPG/PNG</p></div>
              </div>
              <div className="space-y-3">
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza Banner</label><ImageDropzone images={s.heroImage ? [s.heroImage] : []} onChange={(imgs) => setS({ ...s, heroImage: imgs[0] || '' })} max={1} /></div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Mağaza Kategorileri (Öne Çıkan)</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">{(cfg.featuredCats || []).map((c: string) => (<span key={c} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-lg">{c}<button onClick={() => setCfg('featuredCats', cfg.featuredCats.filter((x: string) => x !== c))}><X size={12} /></button></span>))}</div>
                  <select value="" onChange={(e) => { const v = e.target.value; if (v && !(cfg.featuredCats || []).includes(v) && (cfg.featuredCats || []).length < 8) setCfg('featuredCats', [...(cfg.featuredCats || []), v]); }} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg">
                    <option value="">+ Kategori ekle</option>
                    {[...categories.map((c) => c.ad), 'İndirimli Ürünler', 'Sezon Ürünleri', 'Yeni Gelenler', 'Çok Satanlar'].filter((v, i, a) => a.indexOf(v) === i && !(cfg.featuredCats || []).includes(v)).map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Maksimum 8 kategori seçebilirsiniz.</p>
                </div>
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza Durumu</label><select value={s.active ? '1' : '0'} onChange={(e) => setS({ ...s, active: e.target.value === '1' })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"><option value="1">🟢 Aktif</option><option value="0">⏸ Bakım / Kapalı</option></select></div>
              </div>
            </div>
          </div>
          )}

          {/* ── Kargo & Teslimat ── */}
          {aTab === 'kargo' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><Truck size={16} className="text-indigo-600" /> Kargo & Teslimat</h3>
            <p className="text-xs text-slate-400 mb-4">Kargo seçenekleri, ücretleri ve sadakat puanı.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Standart Kargo Ücreti (TL)</label><input type="number" min={0} value={cfg.kargoUcret} onChange={(e) => setCfg('kargoUcret', e.target.value)} placeholder="0 = ücretsiz" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Ücretsiz Kargo Eşiği (TL)</label><input type="number" min={0} value={s.freeShipThreshold} onChange={(e) => setS({ ...s, freeShipThreshold: e.target.value })} placeholder="0 = kapalı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[10px] text-slate-400 mt-1">Bu tutar üzeri sepetlerde "ücretsiz kargo" rozeti gösterilir.</p></div>
              <div><label className="block text-xs text-slate-500 mb-1">VIP Puan Oranı (%)</label><input type="number" min={0} max={100} step="0.5" value={s.puanOrani} onChange={(e) => setS({ ...s, puanOrani: e.target.value })} placeholder="0 = kapalı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[10px] text-slate-400 mt-1">Sepet tutarının %'i kadar puan müşteriye gösterilir.</p></div>
              <div><label className="block text-xs text-slate-500 mb-1">Teslimat Notu</label><input value={cfg.kargoNot} onChange={(e) => setCfg('kargoNot', e.target.value)} placeholder="ör. 1-3 iş günü içinde kargoda" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
          </div>
          )}

          {/* ── Ödeme Ayarları ── */}
          {aTab === 'odeme' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div><h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><CreditCard size={16} className="text-indigo-600" /> Ödeme Ayarları</h3><p className="text-xs text-slate-400">Banka bilgileri ve kabul edilen ödeme yöntemleri.</p></div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Banka Adı</label><input value={s.bankaAd} onChange={(e) => setS({ ...s, bankaAd: e.target.value })} placeholder="ör. İş Bankası" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">IBAN</label><input value={s.iban} onChange={(e) => setS({ ...s, iban: e.target.value })} placeholder="TR.." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Hesap Sahibi</label><input value={s.hesapSahibi} onChange={(e) => setS({ ...s, hesapSahibi: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">Ödeme Açıklaması / Banka Notu</label><textarea rows={3} value={cfg.bankaNot || ''} onChange={(e) => setCfg('bankaNot', e.target.value)} placeholder="ör. Açıklama kısmına sipariş numaranızı yazınız. Ödeme sonrası 'Ödemeni Bildir' butonuna basınız." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[11px] text-slate-400 mt-1">Sepet linkinde banka bilgileri kartında müşteriye gösterilir.</p></div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Kabul Edilen Ödeme Yöntemleri</label>
              <div className="flex flex-wrap gap-2">
                {[['odemeHavale', 'Havale / EFT'], ['odemeKart', 'Kredi Kartı'], ['odemeKapida', 'Kapıda Ödeme']].map(([k, t]) => (
                  <label key={k} className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${cfg[k] ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500'}`}><input type="checkbox" checked={!!cfg[k]} onChange={(e) => setCfg(k, e.target.checked)} /> {t}</label>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Havale/EFT seçen müşteriye asistan banka bilgilerini iletir.</p>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-2"><CreditCard size={15} className="text-violet-600" /> PayTR Sanal POS (Kredi/Banka Kartı)</h4>
                <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs ${paytr.enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-500'}`}><input type="checkbox" checked={!!paytr.enabled} onChange={(e) => setPaytr({ ...paytr, enabled: e.target.checked })} /> {paytr.enabled ? 'Aktif' : 'Pasif'}</label>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">PayTR Mağaza Paneli → Bilgi sayfasındaki bilgileri girin. Doldurulup "Aktif" yapıldığında müşteri ödeme adımında kart ile ödeme ekranı açılır.</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza No (merchant_id)</label><input value={paytr.merchant_id} onChange={(e) => setPaytr({ ...paytr, merchant_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza Parolası (merchant_key)</label><input value={paytr.merchant_key} onChange={(e) => setPaytr({ ...paytr, merchant_key: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Mağaza Gizli Anahtarı (merchant_salt)</label><input value={paytr.merchant_salt} onChange={(e) => setPaytr({ ...paytr, merchant_salt: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              </div>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div><label className="block text-xs text-slate-500 mb-1">Mod</label><select value={paytr.mode} onChange={(e) => setPaytr({ ...paytr, mode: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-lg"><option value="TEST">Test</option><option value="LIVE">Canlı</option></select></div>
                <button onClick={savePaytr} className="self-end inline-flex items-center gap-1.5 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700"><Save size={15} /> PayTR Ayarlarını Kaydet</button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Not: PayTR panelinizde "Bildirim/Callback URL" alanına mağaza alan adınız + <b>/api/v1/public/paytr/callback</b> yazılmalıdır.</p>
            </div>
          </div>
          )}

          {/* ── Banner & Slaytlar (hero) ── */}
          {aTab === 'banner' && (
          <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div><h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><ImageIcon size={16} className="text-indigo-600" /> Ana Banner (Hero)</h3><p className="text-xs text-slate-400">Mağaza giriş alanındaki başlık, alt başlık, görsel ve tanıtım videosu.</p></div>
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div><label className="block text-xs text-slate-500 mb-1">Hero Başlık</label><input value={s.heroTitle} onChange={(e) => setS({ ...s, heroTitle: e.target.value })} placeholder="Yeni Sezon İndirimleri" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Hero Alt Başlık</label><input value={s.heroSubtitle} onChange={(e) => setS({ ...s, heroSubtitle: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Tanıtım / Canlı Video URL'i</label><input value={s.heroVideo} onChange={(e) => setS({ ...s, heroVideo: e.target.value })} placeholder="https://.../video.mp4" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[10px] text-slate-400 mt-1">Doldurulunca ana sayfada video oynatıcı açılır.</p></div>
              </div>
              <div><label className="block text-xs text-slate-500 mb-1">Hero / Banner Görseli</label><ImageDropzone images={s.heroImage ? [s.heroImage] : []} onChange={(imgs) => setS({ ...s, heroImage: imgs[0] || '' })} max={1} /></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5">
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
          </div>
          )}

          {/* ── Üst Menü ── */}
          {aTab === 'menu' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
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
          )}

          {/* ── Hikayeler (Story) ── */}
          {aTab === 'story' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-1"><h3 className="font-semibold text-slate-700 flex items-center gap-2"><Sparkles size={16} className="text-indigo-600" /> Hikayeler (Story)</h3><button onClick={addStory} className="inline-flex items-center gap-1 text-sm text-indigo-600"><Plus size={15} /> Hikaye Ekle</button></div>
            <p className="text-xs text-slate-400 mb-3">Ana sayfada slider altında görünen yuvarlak hikayeler. Her hikayeye görsel, başlık ve bir bağlantı tanımlayın. Müşteri hikayeye dokununca tam ekran açılır ve bağlantıya yönlenebilir.</p>
            {(s.stories || []).length === 0 ? <p className="text-sm text-slate-400">Henüz hikaye yok. “Hikaye Ekle” ile başlayın.</p> : (
              <div className="space-y-3">{s.stories.map((st: any, i: number) => (
                <div key={st.id} className="grid md:grid-cols-[110px_1fr_auto] gap-3 items-start border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                  <ImageDropzone images={st.image ? [st.image] : []} onChange={(imgs) => setStory(st.id, { image: imgs[0] || '' })} max={1} />
                  <div className="space-y-2">
                    <input value={st.title} onChange={(e) => setStory(st.id, { title: e.target.value })} placeholder="Hikaye başlığı (Yeni Sezon)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-medium" />
                    <LinkFields value={st.link} onChange={(lk: any) => setStory(st.id, { link: lk })} categories={categories} collections={cfg.collections || []} products={products} />
                  </div>
                  <div className="flex md:flex-col gap-1">
                    <button onClick={() => moveStory(st.id, -1)} disabled={i === 0} className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowUp size={15} /></button>
                    <button onClick={() => moveStory(st.id, 1)} disabled={i === s.stories.length - 1} className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowDown size={15} /></button>
                    <button onClick={() => delStory(st.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}</div>
            )}
          </div>
          )}

          {/* ── Vitrin Widget'ları ── */}
          {aTab === 'widget' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-1"><h3 className="font-semibold text-slate-700 flex items-center gap-2"><LayoutGrid size={16} className="text-indigo-600" /> Vitrin Widget’ları</h3><button onClick={addWidget} className="inline-flex items-center gap-1 text-sm text-indigo-600"><Plus size={15} /> Widget Ekle</button></div>
            <p className="text-xs text-slate-400 mb-3">Ürün listesinin üstünde görünen renkli tanıtım kartları (Günün Fırsatı, Yeni Gelenler, İndirimli Ürünler…). Her karta başlık, rozet, renk/görsel, buton metni ve bir bağlantı tanımlayın.</p>
            {(s.widgets || []).length === 0 ? <p className="text-sm text-slate-400">Henüz widget yok. “Widget Ekle” ile başlayın.</p> : (
              <div className="space-y-3">{s.widgets.map((w: any, i: number) => (
                <div key={w.id} className="grid lg:grid-cols-[220px_1fr_auto] gap-3 items-start border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                  {/* Canlı önizleme */}
                  <div className="rounded-2xl p-3 text-white relative overflow-hidden min-h-[96px] flex flex-col justify-between" style={{ background: w.image ? undefined : `linear-gradient(135deg, ${w.color || '#7c3aed'}, ${w.color || '#7c3aed'}cc)` }}>
                    {w.image && <img src={w.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />}
                    <div className="relative">
                      {w.badge && <span className="inline-block text-[9px] font-bold bg-white/25 px-1.5 py-0.5 rounded-full mb-1">{w.badge}</span>}
                      <p className="font-extrabold text-sm leading-tight drop-shadow">{w.title || 'Başlık'}</p>
                      {w.subtitle && <p className="text-[11px] text-white/90 mt-0.5 drop-shadow">{w.subtitle}</p>}
                    </div>
                    <span className="relative inline-flex w-fit items-center gap-1 text-[11px] font-semibold bg-white/90 text-slate-800 px-2 py-1 rounded-full mt-2">{w.ctaLabel || 'İncele'} →</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input value={w.title} onChange={(e) => setWidget(w.id, { title: e.target.value })} placeholder="Başlık (Günün Fırsatı)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-medium" />
                      <input value={w.badge || ''} onChange={(e) => setWidget(w.id, { badge: e.target.value })} placeholder="Rozet (opsiyonel)" className="w-40 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                    </div>
                    <input value={w.subtitle || ''} onChange={(e) => setWidget(w.id, { subtitle: e.target.value })} placeholder="Alt başlık / açıklama" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                    <div className="flex gap-2 items-center flex-wrap">
                      <input value={w.ctaLabel || ''} onChange={(e) => setWidget(w.id, { ctaLabel: e.target.value })} placeholder="Buton metni (İncele)" className="w-40 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                      <div className="flex items-center gap-1">{WIDGET_COLORS.map((c) => <button key={c} onClick={() => setWidget(w.id, { color: c, image: '' })} className={`w-6 h-6 rounded-full border-2 ${w.color === c && !w.image ? 'border-slate-800' : 'border-white'}`} style={{ background: c }} />)}</div>
                      <div className="w-32"><ImageDropzone images={w.image ? [w.image] : []} onChange={(imgs) => setWidget(w.id, { image: imgs[0] || '' })} max={1} /></div>
                    </div>
                    <LinkFields value={w.link} onChange={(lk: any) => setWidget(w.id, { link: lk })} categories={categories} collections={cfg.collections || []} products={products} />
                  </div>
                  <div className="flex lg:flex-col gap-1">
                    <button onClick={() => moveWidget(w.id, -1)} disabled={i === 0} className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowUp size={15} /></button>
                    <button onClick={() => moveWidget(w.id, 1)} disabled={i === s.widgets.length - 1} className="p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-30"><ArrowDown size={15} /></button>
                    <button onClick={() => delWidget(w.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}</div>
            )}
          </div>
          )}

          {/* ── Kupon Kodları ── */}
          {aTab === 'kupon' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-700 mb-1 flex items-center gap-2"><Tag size={16} className="text-indigo-600" /> Kupon Kodları</h3>
            <p className="text-xs text-slate-400 mb-3">Müşterilerin sepette kullanabileceği indirim kodları. Aktif kodlar sepette otomatik uygulanır.</p>
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
          )}

          {/* ── İletişim & Sosyal ── */}
          {aTab === 'iletisim' && (
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <div><h3 className="font-semibold text-slate-800 mb-1">İletişim Bilgileri</h3><p className="text-xs text-slate-400">Müşterilerinizin size ulaşabileceği bilgiler.</p></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="block text-xs text-slate-500 mb-1">E-posta</label><input value={cfg.email} onChange={(e) => setCfg('email', e.target.value)} placeholder="info@magaza.com" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Telefon</label><input value={cfg.telefon} onChange={(e) => setCfg('telefon', e.target.value)} placeholder="+90 5xx xxx xx xx" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-500 mb-1">WhatsApp</label><input value={cfg.whatsapp} onChange={(e) => setCfg('whatsapp', e.target.value)} placeholder="+90 5xx xxx xx xx" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Çalışma (Hafta içi)</label><input value={cfg.calismaHafta} onChange={(e) => setCfg('calismaHafta', e.target.value)} placeholder="09:00 - 18:00" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              </div>
              <div><label className="block text-xs text-slate-500 mb-1">Adres</label><textarea rows={2} value={cfg.adres} onChange={(e) => setCfg('adres', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Çalışma (Hafta sonu)</label><input value={cfg.calismaPazar} onChange={(e) => setCfg('calismaPazar', e.target.value)} placeholder="Kapalı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <div><h3 className="font-semibold text-slate-800 mb-1">Sosyal Medya Hesapları</h3><p className="text-xs text-slate-400">Mağazanın sosyal medya bağlantılarını ekleyin.</p></div>
              {[['instagram', 'Instagram', 'https://instagram.com/...'], ['facebook', 'Facebook', 'https://facebook.com/...'], ['youtube', 'YouTube', 'https://youtube.com/@...'], ['tiktok', 'TikTok', 'https://tiktok.com/@...'], ['twitter', 'Twitter / X', 'https://x.com/...']].map(([k, t, ph]) => (
                <div key={k}><label className="block text-xs text-slate-500 mb-1">{t}</label><input value={cfg[k]} onChange={(e) => setCfg(k, e.target.value)} placeholder={ph} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              ))}
            </div>
          </div>
          )}

          {/* ── Tema & Görünüm ── */}
          {aTab === 'tema' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div><h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><Palette size={16} className="text-indigo-600" /> Tema & Görünüm</h3><p className="text-xs text-slate-400">Mağazanızın görünümünü kişiselleştirin.</p></div>
            {[['primaryColor', 'Tema Rengi'], ['secondaryColor', 'İkincil Renk']].map(([k, t]) => (
              <div key={k}>
                <label className="block text-xs text-slate-500 mb-1.5">{t}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {['#6366f1', '#3b82f6', '#06b6d4', '#22c55e', '#f97316', '#ef4444', '#a855f7', '#475569'].map((c) => <button key={c} onClick={() => setCfg(k, c)} className={`w-8 h-8 rounded-full border-2 ${cfg[k] === c ? 'border-slate-800 scale-110' : 'border-white shadow'}`} style={{ background: c }} />)}
                  <input type="color" value={cfg[k] || '#6366f1'} onChange={(e) => setCfg(k, e.target.value)} className="w-8 h-8 rounded-full border-0 cursor-pointer bg-transparent" />
                </div>
              </div>
            ))}
            <div className="grid sm:grid-cols-3 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Font</label><select value={cfg.font} onChange={(e) => setCfg('font', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">{['Inter', 'Poppins', 'Roboto', 'Montserrat', 'Nunito'].map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
              <div><label className="block text-xs text-slate-500 mb-1">Para Birimi</label><select value={cfg.currency} onChange={(e) => setCfg('currency', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"><option value="TRY">₺ Türk Lirası (TL)</option><option value="USD">$ Dolar (USD)</option><option value="EUR">€ Euro (EUR)</option></select></div>
              <div><label className="block text-xs text-slate-500 mb-1">Dil</label><select value={cfg.dil} onChange={(e) => setCfg('dil', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"><option value="tr">Türkçe</option><option value="en">English</option></select></div>
            </div>
          </div>
          )}

          {/* ── SEO & Arama ── */}
          {aTab === 'seo' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div><h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><Search size={16} className="text-indigo-600" /> SEO Ayarları</h3><p className="text-xs text-slate-400">Mağazanızın arama motoru görünürlüğünü artırın.</p></div>
            <div><label className="block text-xs text-slate-500 mb-1">SEO Başlık</label><div className="relative"><input maxLength={60} value={cfg.seoTitle} onChange={(e) => setCfg('seoTitle', e.target.value)} placeholder="Mağaza Adı | İndirimli Ürünler" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><span className="absolute right-2 top-2 text-[10px] text-slate-300">{(cfg.seoTitle || '').length}/60</span></div></div>
            <div><label className="block text-xs text-slate-500 mb-1">Meta Açıklama</label><div className="relative"><textarea maxLength={160} rows={2} value={cfg.metaDescription} onChange={(e) => setCfg('metaDescription', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><span className="absolute right-2 bottom-2 text-[10px] text-slate-300">{(cfg.metaDescription || '').length}/160</span></div></div>
            <div><label className="block text-xs text-slate-500 mb-1">Anahtar Kelimeler</label><input value={cfg.keywords} onChange={(e) => setCfg('keywords', e.target.value)} placeholder="indirim, sezon, fırsat" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /><p className="text-[10px] text-slate-400 mt-1">Virgülle ayırarak birden fazla anahtar kelime ekleyebilirsiniz.</p></div>
          </div>
          )}

          {/* ── Takip Kodları (Pixel) ── */}
          {aTab === 'pixel' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div><h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><BarChart3 size={16} className="text-indigo-600" /> Takip Kodları (Pixel)</h3><p className="text-xs text-slate-400">Pazarlama ve dönüşüm takibi için reklam piksellerinizi ekleyin. <b>Aynı anda birden fazla piksel</b> kullanabilirsiniz — her alana ID'leri <b>virgülle</b> ayırarak yazın. Kodlar mağaza sayfanıza otomatik yüklenir.</p></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="block text-xs text-slate-500 mb-1">Meta (Facebook) Pixel ID(ler)</label><input value={cfg.metaPixel} onChange={(e) => setCfg('metaPixel', e.target.value)} placeholder="123..., 456... (virgülle çoklu)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">TikTok Pixel ID(ler)</label><input value={cfg.tiktokPixel} onChange={(e) => setCfg('tiktokPixel', e.target.value)} placeholder="CXXX..., CYYY... (virgülle çoklu)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Google Analytics 4 (Measurement ID)</label><input value={cfg.ga4} onChange={(e) => setCfg('ga4', e.target.value)} placeholder="G-XXXX, G-YYYY (virgülle çoklu)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Google Ads Conversion ID(ler)</label><input value={cfg.googleAds} onChange={(e) => setCfg('googleAds', e.target.value)} placeholder="AW-XXXX, AW-YYYY (virgülle çoklu)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Google Ads Conversion Label (ops.)</label><input value={cfg.googleAdsLabel} onChange={(e) => setCfg('googleAdsLabel', e.target.value)} placeholder="ör. AbC-D_efG..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">Özel Kod (head'e eklenir — gelişmiş)</label><textarea rows={4} value={cfg.customHead} onChange={(e) => setCfg('customHead', e.target.value)} placeholder="<!-- Ek script / doğrulama meta etiketleri -->" className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg" /><p className="text-[10px] text-slate-400 mt-1">Her platformda birden fazla piksel aynı anda çalışır (örn. 2 Meta + 1 TikTok). Yalnızca güvendiğiniz kaynaklardan kod ekleyin.</p></div>
          </div>
          )}

          {/* ── Bildirim Ayarları ── */}
          {aTab === 'bildirim' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div><h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><Bell size={16} className="text-indigo-600" /> Bildirim Ayarları</h3><p className="text-xs text-slate-400">Hangi durumlarda bildirim almak istediğinizi seçin.</p></div>
            {[['bildirimYeniSiparis', 'Yeni sipariş bildirimi', 'Mağazaya yeni sipariş geldiğinde bildirim al'], ['bildirimStok', 'Düşük stok uyarısı', 'Bir ürünün stoğu kritik seviyeye indiğinde uyar'], ['bildirimYorum', 'Yeni yorum bildirimi', 'Ürünlere yeni yorum yapıldığında haber ver']].map(([k, t, d]) => (
              <label key={k} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-50">
                <span><span className="block text-sm font-medium text-slate-700">{t}</span><span className="block text-[11px] text-slate-400">{d}</span></span>
                <input type="checkbox" checked={!!cfg[k]} onChange={(e) => setCfg(k, e.target.checked)} className="w-4 h-4" />
              </label>
            ))}
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span><span className="block text-sm font-medium text-slate-700">Sepette ürün önerisi göster</span><span className="block text-[11px] text-slate-400">Müşterinin sepet/yayın sayfasında "Bunlar da ilgini çekebilir" önerileri</span></span>
                <input type="checkbox" checked={cfg.oneriEnabled !== false} onChange={(e) => setCfg('oneriEnabled', e.target.checked)} className="w-4 h-4" />
              </div>
              {cfg.oneriEnabled !== false && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Önerilecek ürünler (boş = otomatik çok satanlar)</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(cfg.oneriProductIds || []).map((id: string) => { const p = onlineProducts.find((x) => x.id === id); if (!p) return null; return (
                      <span key={id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2 py-1 rounded-lg">{p.ad}<button onClick={() => setCfg('oneriProductIds', (cfg.oneriProductIds || []).filter((x: string) => x !== id))}><X size={12} /></button></span>
                    ); })}
                  </div>
                  <select value="" onChange={(e) => { const v = e.target.value; if (v && !(cfg.oneriProductIds || []).includes(v)) setCfg('oneriProductIds', [...(cfg.oneriProductIds || []), v]); }} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg">
                    <option value="">+ Ürün ekle...</option>
                    {onlineProducts.filter((p) => !(cfg.oneriProductIds || []).includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.ad}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          )}
          {aTab === 'politika' && (
          <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div><h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><FileText size={16} className="text-indigo-600" /> Yasal & Kurumsal Bilgiler <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Sanal POS için zorunlu</span></h3><p className="text-xs text-slate-400">Bu bilgiler mağaza altındaki sözleşme/iletişim sayfalarında ve sanal POS başvurunuzda kullanılır.</p></div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><label className="block text-xs text-slate-500 mb-1">Firma Ünvanı</label><input value={cfg.firmaUnvan} onChange={(e) => setCfg('firmaUnvan', e.target.value)} placeholder="ör. RAHAT REKLAM SANAYİ TİCARET LİMİTED ŞİRKETİ" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Vergi / VKN</label><input value={cfg.vkn} onChange={(e) => setCfg('vkn', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Vergi Dairesi</label><input value={cfg.vergiDairesi} onChange={(e) => setCfg('vergiDairesi', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-slate-500 mb-1">Firma Adresi</label><input value={cfg.firmaAdres} onChange={(e) => setCfg('firmaAdres', e.target.value)} placeholder="Mahalle, Sokak, No, İlçe/İl" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Kurumsal E-posta</label><input value={cfg.firmaEmail} onChange={(e) => setCfg('firmaEmail', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Kurumsal Telefon</label><input value={cfg.firmaTel} onChange={(e) => setCfg('firmaTel', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">MERSİS No (ops.)</label><input value={cfg.mersis} onChange={(e) => setCfg('mersis', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <p className="text-[11px] text-slate-400">Mesafeli Satış, İade/Cayma, Gizlilik ve KVKK metinleri bu bilgilerle otomatik oluşturulur ve mağaza alt menüsünde (footer) gösterilir. Aşağıdaki alanları doldurursanız ilgili metin sizin yazdığınızla değiştirilir.</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div><h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><FileText size={16} className="text-indigo-600" /> Özel Metinler (opsiyonel)</h3><p className="text-xs text-slate-400">Boş bırakırsanız standart (sanal POS uyumlu) metinler kullanılır.</p></div>
            <div><label className="block text-xs text-slate-500 mb-1">İade & Değişim / Cayma Politikası</label><textarea rows={3} value={cfg.iade} onChange={(e) => setCfg('iade', e.target.value)} placeholder="Boş = standart metin" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">Gizlilik Politikası</label><textarea rows={3} value={cfg.gizlilik} onChange={(e) => setCfg('gizlilik', e.target.value)} placeholder="Boş = standart metin" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div><label className="block text-xs text-slate-500 mb-1">Kullanım Şartları</label><textarea rows={3} value={cfg.kullanim} onChange={(e) => setCfg('kullanim', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
          </div>
          </div>
          )}

          </div>
        </div>
      )}

      {/* ───────── MAĞAZADAKİ ÜRÜNLER ───────── */}
      {tab === 'urunler' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <input value={urunQ} onChange={(e) => setUrunQ(e.target.value)} placeholder="Mağazadaki ürünlerde ara..." className="flex-1 min-w-[180px] px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
            <button onClick={() => setUFilters((o) => !o)} className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-sm rounded-xl border ${(uMarka || uCinsiyet || uKategori || uGorunum !== 'tumu') ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}><SlidersHorizontal size={15} /> Filtreler{(uMarka || uCinsiyet || uKategori || uGorunum !== 'tumu') && <span className="bg-white/25 px-1.5 rounded-full text-[11px]">{(uMarka ? 1 : 0) + (uCinsiyet ? 1 : 0) + (uKategori ? 1 : 0) + (uGorunum !== 'tumu' ? 1 : 0)}</span>}</button>
            <button onClick={() => nav('/depo/urunlerim')} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50"><Package size={15} /> Tüm Ürünleri Yönet</button>
          </div>

          {/* Koleksiyon başlıkları — ürünlerin üstünde sekmeler */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setActiveColl('tumu')} className={`px-3 py-1.5 text-xs font-medium rounded-full border ${activeColl === 'tumu' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>Tümü</button>
            {(cfg.collections || []).map((c: any) => (
              <span key={c.id} className={`inline-flex items-center rounded-full border ${activeColl === c.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                <button onClick={() => setActiveColl(c.id)} className="pl-3 pr-1.5 py-1.5 text-xs font-medium inline-flex items-center gap-1"><Folder size={12} /> {c.ad}</button>
                {activeColl === c.id && (<><button onClick={() => renameColl(c.id)} title="Yeniden adlandır" className="px-1 hover:opacity-70"><Pencil size={11} /></button><button onClick={() => delColl(c.id)} title="Sil" className="pr-2 pl-0.5 hover:opacity-70"><X size={12} /></button></>)}
              </span>
            ))}
            <button onClick={addColl} className="px-3 py-1.5 text-xs font-medium rounded-full border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 inline-flex items-center gap-1"><Plus size={13} /> Başlık Ekle</button>
          </div>
          {activeColl !== 'tumu' && <p className="text-[11px] text-slate-400 -mt-2">Bu başlığa ürün eklemek için ürünün <b>Düzenle</b> (kalem) butonundan "Koleksiyonlar" alanını kullanın.</p>}

          {uFilters && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5"><SlidersHorizontal size={14} className="text-indigo-600" /> Detaylı Filtreler</h4><button onClick={() => { setUMarka(''); setUCinsiyet(''); setUKategori(''); setUGorunum('tumu'); }} className="text-xs text-slate-400 hover:text-red-500">Temizle</button></div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div><label className="text-[11px] text-slate-400">Görünüm</label>
                  <select value={uGorunum} onChange={(e) => setUGorunum(e.target.value)} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg">
                    <option value="tumu">Tümü</option><option value="one">Öne Çıkanlar</option><option value="indirim">İndirimliler</option>
                    {varCounts.map((n) => <option key={n} value={`var:${n}`}>{n} varyasyon kalanlar</option>)}
                  </select>
                </div>
                <div><label className="text-[11px] text-slate-400">Marka</label><select value={uMarka} onChange={(e) => setUMarka(e.target.value)} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Tümü</option>{uBrands.map((b) => <option key={b} value={b}>{b}</option>)}</select></div>
                <div><label className="text-[11px] text-slate-400">Cinsiyet</label><select value={uCinsiyet} onChange={(e) => setUCinsiyet(e.target.value)} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Tümü</option>{uGenders.map((g) => <option key={g} value={g}>{GENDER_LBL[g] || g}</option>)}</select></div>
                <div><label className="text-[11px] text-slate-400">Kategori</label><select value={uKategori} onChange={(e) => setUKategori(e.target.value)} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Tümü</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select></div>
              </div>
            </div>
          )}

          <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ${uFilterActive ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-50 text-slate-500'}`}>
            <GripVertical size={13} className="shrink-0" />
            {uFilterActive ? <span>Filtre açık — <b>sürükle-bırak</b> yalnız bu liste içinde sıralar. <b>Sıra no</b> ise genel vitrin sırasını değiştirir.</span> : <span>Kartı sürükleyip bırakarak veya <b>sıra no</b> girerek vitrin sırasını düzenleyin. Sıralama değişikliklerini üstteki <b>Kaydet</b> ile kalıcı yapın.</span>}
          </div>

          {uOrdered.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">{onlineProducts.length === 0 ? 'Mağazada ürün yok. Ürünlerim\'de bir ürünün "Mağaza" rozetini açın.' : 'Bu filtreye uygun ürün yok.'}</div> : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-2">{uOrdered.map((p) => {
              const ind = (p.eskiFiyat && p.eskiFiyat > p.satisFiyat) ? Math.round(((p.eskiFiyat - p.satisFiyat) / p.eskiFiyat) * 100) : 0;
              const bedenler = (p.variations || []).filter((v: any) => (v.stok || 0) > 0);
              const img = (p.images || [])[0] || '';
              return (
                <div key={p.id} draggable onDragStart={() => setDragId(p.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDropU(p.id)} className={`bg-white rounded-lg border overflow-hidden flex flex-col transition-shadow ${dragId === p.id ? 'border-indigo-400 shadow-lg opacity-60' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="relative aspect-square bg-slate-100">
                    <button onClick={() => img && setImgZoom(img)} className="w-full h-full cursor-zoom-in" title="Büyüt">{img ? <img src={img} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={18} /></span>}</button>
                    <span className="absolute top-0.5 left-0.5 bg-black/55 text-white rounded p-0.5 cursor-grab"><GripVertical size={10} /></span>
                    {ind > 0 && <span className="absolute top-0.5 right-0.5 bg-rose-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-full">%{ind}</span>}
                    {p.oneCikan && <span className="absolute bottom-0.5 left-0.5 bg-amber-400 text-white w-4 h-4 rounded-full flex items-center justify-center"><Star size={9} className="fill-white" /></span>}
                  </div>
                  <div className="p-1.5 flex flex-col flex-1">
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[8px] text-slate-400 shrink-0">Sıra</span>
                      <input type="number" min={1} defaultValue={globalPos(p.id)} key={globalPos(p.id)} onBlur={(e) => { const v = Number(e.target.value); if (v && v !== globalPos(p.id)) setPosition(p.id, v); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-8 px-0.5 py-0.5 text-[10px] text-center border border-slate-200 rounded" title="Genel vitrin sırası" />
                      {(cfg.collectionItems?.[p.id]?.length || 0) > 0 && <span className="ml-auto text-[8px] text-indigo-500 inline-flex items-center gap-0.5" title="Koleksiyonlarda"><Folder size={9} />{cfg.collectionItems[p.id].length}</span>}
                    </div>
                    {nameEdit?.id === p.id ? (
                      <input autoFocus value={nameEdit!.val} onChange={(e) => setNameEdit({ id: p.id, val: e.target.value })} onBlur={() => saveName(p, nameEdit!.val)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') setNameEdit(null); }} className="w-full px-1 py-0.5 text-[11px] font-medium border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                    ) : (
                      <p onDoubleClick={() => setNameEdit({ id: p.id, val: p.ad })} title="Düzenlemek için çift tıkla" className="text-[11px] font-medium text-slate-800 leading-tight line-clamp-2 cursor-text hover:bg-indigo-50/60 rounded px-0.5 -mx-0.5">{p.ad}</p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">{ind > 0 && <span className="text-[9px] text-slate-300 line-through">{fmt(p.eskiFiyat)}</span>}<span className={`text-xs font-bold ${ind > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmt(p.satisFiyat)}</span></div>
                    {bedenler.length > 0 && <div className="flex flex-wrap gap-0.5 mt-0.5">{bedenler.slice(0, 4).map((v: any) => <span key={v.id || v.deger} className="text-[8px] px-1 py-0.5 rounded border border-slate-200 text-slate-500">{v.deger}</span>)}</div>}
                    <div className="flex items-center gap-0.5 mt-auto pt-1.5">
                      <button onClick={() => toggleOne(p)} title="Öne çıkar" className={`flex-1 h-6 rounded-md border flex items-center justify-center ${p.oneCikan ? 'bg-amber-50 border-amber-300 text-amber-500' : 'border-slate-200 text-slate-400 hover:text-amber-500'}`}><Star size={12} className={p.oneCikan ? 'fill-amber-400' : ''} /></button>
                      <button onClick={() => openEdit(p)} title="Düzenle" className="flex-1 h-6 rounded-md border border-slate-200 text-slate-400 hover:text-indigo-600 flex items-center justify-center"><Pencil size={12} /></button>
                      <button onClick={() => removeFromStore(p)} title="Mağazadan kaldır" className="flex-1 h-6 rounded-md border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center"><Trash2 size={12} /></button>
                    </div>
                  </div>
                </div>
              );
            })}</div>
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
                <p className="text-[11px] text-slate-400 mt-0.5">Kapsam: {c.kapsam === 'hepsi' ? 'Tüm ürünler' : c.kapsam === 'kategori' ? (categories.find((k) => k.id === c.kategoriId)?.ad || 'Kategori') : (products.find((p) => p.id === c.productId)?.ad || freeProducts.find((p) => p.id === c.productId)?.ad || 'Ürün')}</p>
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

      {/* Ürün düzenleme modalı (fiyat / eski fiyat / açıklama / öne çıkar) */}
      {editModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setEditModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800 flex items-center gap-2"><Pencil size={16} className="text-indigo-600" /> Ürünü Düzenle</h3><button onClick={() => setEditModal(null)}><X size={18} className="text-slate-400" /></button></div>
            <div className="flex items-center gap-3"><img src={(editModal.images || [])[0] || ''} className="w-14 h-14 rounded-lg object-cover bg-slate-100" /><div className="min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{editModal.ad}</p><p className="text-[11px] text-slate-400">{editModal.marka || ''} {editModal.barkod ? `· ${editModal.barkod}` : ''}</p></div></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs text-slate-500 mb-1">Mağazada Geçerli Fiyat (₺)</label><input type="number" value={editForm.satisFiyat} onChange={(e) => setEditForm({ ...editForm, satisFiyat: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Eski Fiyat Etiketi (₺)</label><input type="number" value={editForm.eskiFiyat} onChange={(e) => setEditForm({ ...editForm, eskiFiyat: e.target.value })} placeholder="boş = etiket yok" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            {Number(editForm.eskiFiyat) > Number(editForm.satisFiyat) && Number(editForm.satisFiyat) > 0 && (<p className="text-xs text-rose-600 font-medium">İndirim etiketi: %{Math.round(((Number(editForm.eskiFiyat) - Number(editForm.satisFiyat)) / Number(editForm.eskiFiyat)) * 100)} — ürün "indirimliler" arasında gösterilir.</p>)}
            <div><label className="block text-xs text-slate-500 mb-1">Ürün Açıklaması</label><textarea rows={3} value={editForm.aciklama} onChange={(e) => setEditForm({ ...editForm, aciklama: e.target.value })} placeholder="Mağaza sayfasında görünecek açıklama..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            {(editModal.variations || []).length > 0 && (
              <div><label className="block text-xs text-slate-500 mb-1">Varyasyonlar (stok)</label><div className="flex flex-wrap gap-1">{(editModal.variations || []).map((v: any) => <span key={v.id || v.deger} className={`text-xs px-2 py-1 rounded-lg border ${(v.stok || 0) > 0 ? 'bg-white border-slate-200 text-slate-600' : 'bg-red-50 border-red-200 text-red-400 line-through'}`}>{v.deger}: <b>{v.stok}</b></span>)}</div></div>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={editForm.oneCikan} onChange={(e) => setEditForm({ ...editForm, oneCikan: e.target.checked })} /> <Star size={14} className="text-amber-500" /> Öne çıkan ürün</label>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 flex items-center gap-1"><Folder size={13} className="text-indigo-500" /> Koleksiyonlar (üst sekme başlıkları)</label>
              {(cfg.collections || []).length === 0 ? <p className="text-[11px] text-slate-400">Henüz başlık yok. "Mağazadaki Ürünler" üstündeki <b>Başlık Ekle</b> ile oluşturun.</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {(cfg.collections || []).map((c: any) => { const on = (editForm.collections || []).includes(c.id); return (
                    <button key={c.id} onClick={() => setEditForm((f: any) => ({ ...f, collections: on ? f.collections.filter((x: string) => x !== c.id) : [...(f.collections || []), c.id] }))} className={`text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1 ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{on ? '✓' : '+'} {c.ad}</button>
                  ); })}
                </div>
              )}
            </div>
            <button onClick={saveEdit} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Kaydet</button>
            <p className="text-[11px] text-slate-400">Stok ve varyasyon düzenlemesi için "Tüm Ürünleri Yönet" sayfasını kullanın.</p>
          </div>
        </div>
      )}

      {/* Görsel büyütme (lightbox) */}
      {imgZoom && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80" onClick={() => setImgZoom('')}>
          <img src={imgZoom} className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setImgZoom('')} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
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
            {kampForm.kapsam === 'urun' && <select value={kampForm.productId} onChange={(e) => setKampForm({ ...kampForm, productId: e.target.value })} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Ürün seç</option><optgroup label="Kendi Ürünlerim">{onlineProducts.map((p) => <option key={p.id} value={p.id}>{p.ad}</option>)}</optgroup>{freeProducts.length > 0 && <optgroup label="Tedarikçi Deposu">{freeProducts.map((p) => <option key={p.id} value={p.id}>{p.ad}{p.supplierAd ? ` — ${p.supplierAd}` : ''}</option>)}</optgroup>}</select>}
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

// Story / Widget bağlantı seçici — { type, value }
function LinkFields({ value, onChange, categories, collections, products }: { value: any; onChange: (lk: any) => void; categories: any[]; collections: any[]; products: any[] }) {
  const link = value || { type: 'filtre', value: 'yeni' };
  const set = (patch: any) => onChange({ ...link, ...patch });
  const sel = 'px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white';
  const defVal = (t: string) => t === 'kategori' ? (categories[0]?.id || '') : t === 'cinsiyet' ? 'kadin' : t === 'koleksiyon' ? (collections[0]?.id || '') : t === 'urun' ? (products[0]?.id || '') : t === 'url' ? '' : 'yeni';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold text-slate-400 inline-flex items-center gap-1"><ExternalLink size={12} /> Bağlantı</span>
      <select value={link.type} onChange={(e) => set({ type: e.target.value, value: defVal(e.target.value) })} className={sel}>
        <option value="filtre">Özel Filtre</option>
        <option value="kategori">Kategori</option>
        <option value="cinsiyet">Cinsiyet</option>
        <option value="koleksiyon">Koleksiyon</option>
        <option value="urun">Ürün</option>
        <option value="url">Dış Bağlantı (URL)</option>
      </select>
      {link.type === 'filtre' && <select value={link.value} onChange={(e) => set({ value: e.target.value })} className={sel}>{[['yeni', 'Yeni Gelenler'], ['indirim', 'İndirimdekiler'], ['coksatan', 'Öne Çıkanlar'], ['sonsans', 'Son Şans'], ['tumu', 'Tümü']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
      {link.type === 'kategori' && <select value={link.value} onChange={(e) => set({ value: e.target.value })} className={sel}>{categories.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>}
      {link.type === 'cinsiyet' && <select value={link.value} onChange={(e) => set({ value: e.target.value })} className={sel}>{[['kadin', 'Kadın'], ['erkek', 'Erkek'], ['cocuk', 'Çocuk'], ['unisex', 'Unisex']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}
      {link.type === 'koleksiyon' && (collections.length ? <select value={link.value} onChange={(e) => set({ value: e.target.value })} className={sel}>{collections.map((c: any) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select> : <span className="text-[11px] text-amber-500">Önce Vitrin sekmesinden koleksiyon ekleyin</span>)}
      {link.type === 'urun' && <select value={link.value} onChange={(e) => set({ value: e.target.value })} className={`${sel} max-w-[220px]`}>{products.map((p: any) => <option key={p.id} value={p.id}>{p.ad}</option>)}</select>}
      {link.type === 'url' && <input value={link.value || ''} onChange={(e) => set({ value: e.target.value })} placeholder="https://..." className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg flex-1 min-w-[180px]" />}
    </div>
  );
}
