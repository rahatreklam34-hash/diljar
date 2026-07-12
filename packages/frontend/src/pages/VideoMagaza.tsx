import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Search, Heart, ShoppingBag, Zap, Home, LayoutGrid, Radio, User, Plus, Minus, X, Star, ChevronDown, Grid2x2, List, Truck, RotateCcw, ShieldCheck, Headphones, Lock, SlidersHorizontal, Tag, CreditCard, Check, Send } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';
import StoreHeader from '../components/StoreHeader';
import { IL_ILCE, ILLER } from '../lib/turkiye';

const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const disc = (eski?: number, satis?: number) => (eski && satis && eski > satis) ? Math.round(((eski - satis) / eski) * 100) : 0;
const discColor = (d: number) => d >= 30 ? 'bg-red-500' : d >= 20 ? 'bg-orange-500' : 'bg-green-500';

export default function VideoMagaza({ slug: slugProp }: { slug?: string }) {
  const params = useParams();
  const slug = slugProp || params.slug;
  const nav = useNavigate();
  const loc = useLocation();
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState(sp.get('ara') || '');
  // URL tabanlı durum (kategori / sıralama / sayfa) — adres çubuğuna yansır, ileri/geri ve link paylaşımı çalışır
  const updateParams = (patch: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(sp);
    Object.entries(patch).forEach(([k, v]) => { if (!v) next.delete(k); else next.set(k, v); });
    setSp(next, { replace });
  };
  const sort = sp.get('sirala') || 'yeni';
  const setSort = (v: string) => updateParams({ sirala: v === 'yeni' ? null : v, sayfa: null });
  // Yol tabanlı kategori/bölüm (kök dizin, Trendyol gibi): /kategori/erkek, /fiyati-dusenler ...
  const restPath = loc.pathname.replace(/^\/+|\/+$/g, '');
  const kat = (() => {
    if (!restPath || restPath === 'tum-urunler') return 'tumu';
    if (restPath.startsWith('kategori/')) return 'kat:' + restPath.slice(9);
    if (restPath.startsWith('cinsiyet/')) return 'cins:' + restPath.slice(9);
    return (({ 'fiyati-dusenler': 'indirim', 'one-cikanlar': 'coksatan', 'yeni-gelenler': 'yeni', 'son-sans': 'sonsans' } as Record<string, string>)[restPath]) || 'tumu';
  })();
  const katToPath = (v: string) => {
    if (v.startsWith('kat:')) return `/kategori/${v.slice(4)}`;
    if (v.startsWith('cins:')) return `/cinsiyet/${v.slice(5)}`;
    return (({ indirim: '/fiyati-dusenler', coksatan: '/one-cikanlar', yeni: '/yeni-gelenler', sonsans: '/son-sans', tumu: '/' } as Record<string, string>)[v]) ?? '/';
  };
  const setKat = (v: string) => {
    const qs = new URLSearchParams(sp); qs.delete('sayfa');
    const query = qs.toString();
    nav(`${katToPath(v)}${query ? `?${query}` : ''}`);
  };
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [genderSel, setGenderSel] = useState<Set<string>>(new Set());
  const [brandSel, setBrandSel] = useState<Set<string>>(new Set());
  const [sizeSel, setSizeSel] = useState<Set<string>>(new Set());
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [cart, setCart] = useState<Record<string, any>>(() => { try { return JSON.parse(localStorage.getItem('wt_cart') || '{}'); } catch { return {}; } });
  const [varModal, setVarModal] = useState<any>(null);
  const [varSel, setVarSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [checkout, setCheckout] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<'sepet' | 'teslimat' | 'odeme' | 'onay'>('sepet');
  const [cust, setCust] = useState({ ad: '', telefon: '', email: '', adres: '', il: '', ilce: '' });
  const [paytrUrl, setPaytrUrl] = useState('');
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [tcard, setTcard] = useState({ number: '', holderName: '', expireMonth: '', expireYear: '', cvv: '' });
  const [payErr, setPayErr] = useState('');
  const [sozlesmeOk, setSozlesmeOk] = useState(false);
  const openCart = () => { setOrderInfo(null); setPaytrUrl(''); setPayErr(''); setCheckoutStep('sepet'); setCheckout(true); };
  const [done, setDone] = useState<any>(null);
  const [legalModal, setLegalModal] = useState('');
  const [siparisDetay, setSiparisDetay] = useState<any>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [storyView, setStoryView] = useState<number | null>(null);
  const PER_PAGE = 24;
  const page = Number(sp.get('sayfa')) || 1;
  const setPage = (p: number) => updateParams({ sayfa: p <= 1 ? null : String(p) });
  // Sepeti localStorage'a kaydet (ürün detay sayfasından eklenenler de görünsün)
  useEffect(() => { try { localStorage.setItem('wt_cart', JSON.stringify(cart)); } catch { /* */ } }, [cart]);
  // Ürün detayından "Sepete Ekle" sonrası sepet ekranını aç (?cart=1)
  useEffect(() => { if (sp.get('cart') === '1') openCart(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const pay = sp.get('payment');
    if (!pay) return;
    if (pay === 'success') { setCart({}); try { localStorage.removeItem('wt_cart'); } catch { /* */ } setCheckout(false); setDone({ ok: true }); }
    else if (pay === 'fail') { alert('Ödeme tamamlanamadı veya iptal edildi. Siparişiniz beklemede; tekrar deneyebilirsiniz.'); }
    const next = new URLSearchParams(sp); next.delete('payment'); setSp(next, { replace: true });
    /* eslint-disable-next-line */
  }, []);
  // İndirim kodu + sepet önizleme (kampanya/kupon otomatik)
  const [codeInput, setCodeInput] = useState('');
  const [discountCode, setDiscountCode] = useState('');
  const [preview, setPreview] = useState<any>(null);
  // Üyelik / hesap
  const [shopUser, setShopUser] = useState<any>(null);
  const [acc, setAcc] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [af, setAf] = useState({ ad: '', telefon: '', sifre: '', instagram: '' });
  const [hesap, setHesap] = useState<any>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const SHOP_KEY = 'shopToken_' + slug;
  useEffect(() => {
    const tk = localStorage.getItem(SHOP_KEY);
    if (tk && slug) api.get(`/public/store/${slug}/hesabim`, { headers: { Authorization: 'Bearer ' + tk } }).then((r) => { setShopUser(r.data.musteri); setHesap(r.data); }).catch(() => localStorage.removeItem(SHOP_KEY));
  }, [slug]);

  const authSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthBusy(true);
    try {
      const url = authMode === 'register' ? `/public/store/${slug}/uye-kayit` : `/public/store/${slug}/uye-giris`;
      const r = await api.post(url, af);
      localStorage.setItem(SHOP_KEY, r.data.token); setShopUser(r.data.musteri);
      const h = await api.get(`/public/store/${slug}/hesabim`, { headers: { Authorization: 'Bearer ' + r.data.token } }); setHesap(h.data);
      setAf({ ad: '', telefon: '', sifre: '', instagram: '' });
    } catch (err) { alert(apiErrorMessage(err)); } finally { setAuthBusy(false); }
  };
  const cikis = () => { localStorage.removeItem(SHOP_KEY); setShopUser(null); setHesap(null); setAcc(false); };

  useEffect(() => { api.get(`/public/store/${slug}`).then((r) => setData(r.data)).catch((e) => setErr(apiErrorMessage(e))); }, [slug]);

  // Reklam pikselleri / takip kodları enjeksiyonu (Meta, TikTok, GA4, Google Ads) — her platformda birden fazla ID desteklenir
  useEffect(() => {
    const c: any = data?.config; if (!c) return;
    const ids = (s: any) => String(s || '').split(/[\s,;\n]+/).map((x) => x.trim()).filter(Boolean);
    const add = (id: string, html: string) => { if (document.getElementById(id)) return; const s = document.createElement('script'); s.id = id; s.innerHTML = html; document.head.appendChild(s); };
    const addExt = (id: string, src: string) => { if (document.getElementById(id)) return; const s = document.createElement('script'); s.id = id; s.async = true; s.src = src; document.head.appendChild(s); };
    const ga4s = ids(c.ga4), adsIds = ids(c.googleAds), metas = ids(c.metaPixel), tts = ids(c.tiktokPixel);
    const gtagIds = [...ga4s, ...adsIds];
    if (gtagIds.length) { addExt('wt-gtag-src', `https://www.googletagmanager.com/gtag/js?id=${gtagIds[0]}`); add('wt-gtag', `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${gtagIds.map((id) => `gtag('config','${id}');`).join('')}`); }
    if (metas.length) add('wt-meta', `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');${metas.map((id) => `fbq('init','${id}');`).join('')}fbq('track','PageView');`);
    if (tts.length) add('wt-tiktok', `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};${tts.map((id) => `ttq.load('${id}');`).join('')}ttq.page()}(window,document,'ttq');`);
    if (c.customHead && !document.getElementById('wt-customhead')) { const d = document.createElement('div'); d.id = 'wt-customhead'; d.style.display = 'none'; d.innerHTML = c.customHead; document.head.appendChild(d); }
  }, [data?.config]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const products: any[] = data?.products || [];
  const topMenu: any[] = Array.isArray(data?.topMenu) ? data.topMenu : [];
  const slides: any[] = Array.isArray(data?.slides) ? data.slides.filter((sl: any) => sl && (sl.image || sl.title)) : [];
  const stories: any[] = Array.isArray(data?.stories) ? data.stories.filter((st: any) => st && (st.image || st.title)) : [];
  const widgets: any[] = Array.isArray(data?.widgets) ? data.widgets.filter((w: any) => w && w.title) : [];
  // Filtre havuzları
  const GENDER_LBL: Record<string, string> = { kadin: 'Kadın', erkek: 'Erkek', cocuk: 'Çocuk', unisex: 'Unisex' };
  const allGenders = useMemo(() => [...new Set(products.map((p) => p.cinsiyet).filter(Boolean))], [products]);
  const allBrands = useMemo(() => [...new Set(products.map((p) => p.marka).filter(Boolean))].sort(), [products]);
  const allSizes = useMemo(() => [...new Set(products.flatMap((p) => (p.variations || []).map((v: any) => v.deger)).filter(Boolean))], [products]);
  const activeFilterCount = genderSel.size + brandSel.size + sizeSel.size + (priceMin ? 1 : 0) + (priceMax ? 1 : 0);
  const toggleSet = (setter: any, val: string) => setter((s: Set<string>) => { const n = new Set(s); n.has(val) ? n.delete(val) : n.add(val); return n; });
  const clearFilters = () => { setGenderSel(new Set()); setBrandSel(new Set()); setSizeSel(new Set()); setPriceMin(''); setPriceMax(''); };
  // Story / Widget bağlantısını çöz (mağaza içi filtre/kategori/ürün veya dış URL)
  const goProducts = () => setTimeout(() => document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }), 60);
  const resolveLink = (link: any) => {
    if (!link || !link.type) { goProducts(); return; }
    const v = link.value;
    if (link.type === 'url') { if (v) window.open(v, '_blank', 'noopener'); return; }
    if (link.type === 'urun') { if (v) nav(`/urun/${v}`); return; }
    if (link.type === 'kategori') setKat(`kat:${v}`);
    else if (link.type === 'cinsiyet') setKat(`cins:${v}`);
    else if (link.type === 'koleksiyon') setKat('tumu');
    else setKat(v || 'tumu'); // filtre: yeni/indirim/coksatan/sonsans/tumu
    goProducts();
  };

  // Slider otomatik dönüş
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 4500);
    return () => clearInterval(t);
  }, [slides.length]);
  useEffect(() => { if (slideIdx >= slides.length) setSlideIdx(0); }, [slides.length, slideIdx]);

  // Bölümlü listeleme (Öne Çıkanlar / Fiyatı Düşenler / Yeni Gelenler / Son Şans)
  const sections = useMemo(() => {
    const byNew = [...products].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return [
      { key: 'coksatan', title: 'Öne Çıkanlar', items: products.filter((p) => p.oneCikan).slice(0, 12) },
      { key: 'indirim', title: 'Fiyatı Düşenler', items: products.filter((p) => disc(p.eskiFiyat, p.satisFiyat) > 0).sort((a, b) => disc(b.eskiFiyat, b.satisFiyat) - disc(a.eskiFiyat, a.satisFiyat)).slice(0, 12) },
      { key: 'yeni', title: 'Yeni Gelenler', items: byNew.slice(0, 12) },
      { key: 'sonsans', title: 'Son Şans', items: products.filter((p) => (p.stokAdeti || 0) > 0 && (p.stokAdeti || 0) <= 5).slice(0, 12) },
    ].filter((s) => s.items.length > 0);
  }, [products]);

  // ── Canlı ziyaretçi takibi (presence + olay) ──
  const sessionId = useMemo(() => { let s = localStorage.getItem('wt_sess'); if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('wt_sess', s); } return s; }, []);
  const deviceType = useMemo(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'mobil' : 'web'), []);
  const track = (screen: string, label?: string | null, type?: string) => { if (!slug) return; api.post(`/public/store/${slug}/track`, { sessionId, screen, label: label || null, type, device: deviceType }).catch(() => {}); };
  const OZEL_LBL: Record<string, string> = { indirim: 'İndirimdekiler', coksatan: 'Çok Satanlar', yeni: 'Yeni Fırsatlar', sonsans: 'Son Şans' };
  const screenInfo = useMemo(() => {
    if (checkout && checkoutStep === 'sepet') return { screen: 'cart', label: null as string | null };
    if (checkout) return { screen: 'checkout', label: null as string | null };
    if (kat.startsWith('kat:')) { const c = (data?.categories || []).find((x: any) => x.id === kat.slice(4)); return { screen: 'category', label: c?.ad || 'Kategori' }; }
    if (kat.startsWith('cins:')) return { screen: 'category', label: GENDER_LBL[kat.slice(5)] || 'Cinsiyet' };
    if (OZEL_LBL[kat]) return { screen: 'category', label: OZEL_LBL[kat] };
    return { screen: 'browse', label: null as string | null };
  }, [checkout, checkoutStep, kat, data]);
  const screenRef = useRef(screenInfo);
  const lastCatRef = useRef<string | null>(null);
  useEffect(() => {
    screenRef.current = screenInfo;
    track(screenInfo.screen, screenInfo.label);
    if (screenInfo.screen === 'category' && screenInfo.label && screenInfo.label !== lastCatRef.current) {
      lastCatRef.current = screenInfo.label; track('category', screenInfo.label, 'category');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenInfo]);
  useEffect(() => {
    if (!slug) return;
    track('browse', null, 'view');
    const t = setInterval(() => { const s = screenRef.current; track(s.screen, s.label); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, sessionId]);
  useEffect(() => { if (checkout) track('checkout', null, 'checkout'); /* eslint-disable-next-line */ }, [checkout]);
  useEffect(() => { if (checkout && checkoutStep === 'sepet') track('cart', null, 'cart_view'); /* eslint-disable-next-line */ }, [checkout, checkoutStep]);

  const filtered = useMemo(() => {
    let l = products.filter((p) => !q || p.ad.toLowerCase().includes(q.toLowerCase()) || (p.marka || '').toLowerCase().includes(q.toLowerCase()));
    if (kat.startsWith('kat:')) l = l.filter((p) => p.kategoriId === kat.slice(4));
    else if (kat.startsWith('cins:')) l = l.filter((p) => (p.cinsiyet || '') === kat.slice(5));
    else if (kat === 'indirim') l = l.filter((p) => disc(p.eskiFiyat, p.satisFiyat) > 0);
    else if (kat === 'coksatan') l = l.filter((p) => p.oneCikan);
    else if (kat === 'yeni') l = [...l].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    else if (kat === 'sonsans') l = l.filter((p) => (p.stokAdeti || 0) > 0 && (p.stokAdeti || 0) <= 5);
    // Detaylı filtreler
    if (genderSel.size > 0) l = l.filter((p) => genderSel.has(p.cinsiyet));
    if (brandSel.size > 0) l = l.filter((p) => brandSel.has(p.marka));
    if (sizeSel.size > 0) l = l.filter((p) => (p.variations || []).some((v: any) => sizeSel.has(v.deger) && (v.stok || 0) > 0));
    const pmin = Number(priceMin) || 0; const pmax = Number(priceMax) || 0;
    if (pmin > 0) l = l.filter((p) => (p.satisFiyat || 0) >= pmin);
    if (pmax > 0) l = l.filter((p) => (p.satisFiyat || 0) <= pmax);
    if (sort === 'fiyat_artan') l = [...l].sort((a, b) => a.satisFiyat - b.satisFiyat);
    else if (sort === 'fiyat_azalan') l = [...l].sort((a, b) => b.satisFiyat - a.satisFiyat);
    else if (sort === 'indirim') l = [...l].sort((a, b) => disc(b.eskiFiyat, b.satisFiyat) - disc(a.eskiFiyat, a.satisFiyat));
    else if (sort === 'yeni') l = [...l].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return l;
  }, [products, q, kat, sort, genderSel, brandSel, sizeSel, priceMin, priceMax]);

  // Sayfalama
  const isDefaultView = kat === 'tumu' && !q && activeFilterCount === 0;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pageItems = useMemo(() => filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE), [filtered, safePage]);
  const gotoPage = (p: number) => { const np = Math.min(pageCount, Math.max(1, p)); setPage(np); setTimeout(() => document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }), 40); };
  // Arama metnini URL'ye yansıt (debounce, geçmişi kirletmeden)
  useEffect(() => {
    if ((sp.get('ara') || '') === q) return;
    const t = setTimeout(() => updateParams({ ara: q || null, sayfa: null }, true), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const cartItems = Object.values(cart);
  const count = cartItems.reduce((s: number, x: any) => s + x.adet, 0);
  const araToplam = cartItems.reduce((s: number, x: any) => s + x.fiyat * x.adet, 0);

  const geri = useMemo(() => { const k = 3 * 3600 - (Math.floor(now / 1000) % (3 * 3600)); return { s: Math.floor(k / 3600), dk: Math.floor((k % 3600) / 60), sn: k % 60 }; }, [now]);

  // Sepet önizleme: kampanya (otomatik) + kupon indirimi canlı hesaplanır
  const cartKey = cartItems.map((x: any) => `${x.productId}:${x.varyasyon || ''}:${x.adet}`).join('|');
  useEffect(() => {
    if (!slug || cartItems.length === 0) { setPreview(null); return; }
    const body = { items: cartItems.map((x: any) => ({ productId: x.productId, adet: x.adet, varyasyon: x.varyasyon || undefined })), discountCode: discountCode || undefined };
    const t = setTimeout(() => { api.post(`/public/store/${slug}/cart-preview`, body).then((r) => setPreview(r.data)).catch(() => setPreview(null)); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, discountCode, slug]);
  const kuponUygula = () => { const c = codeInput.trim().toUpperCase(); if (!c) return; setDiscountCode(c); };
  const kuponKaldir = () => { setDiscountCode(''); setCodeInput(''); };
  const odenecek = preview ? preview.toplam : araToplam;
  const toplamIndirim = preview ? (preview.kampanyaIndirim + preview.kuponIndirim) : 0;

  const addToCart = (p: any, varyasyon?: string) => {
    const key = p.id + '|' + (varyasyon || '');
    let fiyat = p.satisFiyat;
    if (varyasyon) { const v = (p.variations || []).find((x: any) => x.deger === varyasyon); if (v) fiyat += v.ekFiyat || 0; }
    setCart((c) => ({ ...c, [key]: { productId: p.id, varyasyon: varyasyon || null, ad: p.ad, fiyat, img: (p.images || [])[0] || '', adet: (c[key]?.adet || 0) + 1 } }));
    openCart();
    track('cart', p.ad, 'cart_add');
  };
  const sepeteEkle = (p: any) => { if ((p.variations || []).length > 0) { setVarModal(p); setVarSel(''); } else addToCart(p); };
  const sub = (key: string) => setCart((c) => { const n = (c[key]?.adet || 0) - 1; const copy = { ...c }; if (n <= 0) delete copy[key]; else copy[key] = { ...copy[key], adet: n }; return copy; });
  const inc = (key: string) => setCart((c) => ({ ...c, [key]: { ...c[key], adet: c[key].adet + 1 } }));
  const tamamla = () => { if (cartItems.length === 0) return; setCheckoutStep('teslimat'); setCheckout(true); };
  const odemeYap = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!cust.ad || !cust.telefon || !cust.adres || !cust.il || !cust.ilce) { alert('Ad Soyad, telefon, il, ilçe ve teslimat adresi zorunludur'); return; }
    setBusy(true);
    try {
      const items = cartItems.map((x: any) => ({ productId: x.productId, adet: x.adet, varyasyon: x.varyasyon || undefined }));
      // "Talebi Gönder": backend yalnızca TASLAK oluşturur (sipariş/stok YOK). Prefilled metin +
      // mağaza WhatsApp numarası döner; müşteri wa.me ile mesajı kendi WhatsApp'ından mağazaya
      // gönderir. Sipariş ancak o mesaj webhook'a ulaşınca oluşur.
      const r = await api.post(`/public/store/${slug}/order`, { customer: cust, items, discountCode: discountCode || undefined });
      const num = String(r.data?.whatsapp || '').replace(/\D/g, '');
      const waLink = num && r.data?.whatsappMsg ? `https://wa.me/${num}?text=${encodeURIComponent(r.data.whatsappMsg)}` : null;
      if (waLink) window.open(waLink, '_blank', 'noopener');
      track('browse', null, 'order');
      setDone({ ...r.data, waLink }); setCart({}); setCheckout(false); setDiscountCode(''); setCodeInput(''); setPreview(null);
    } catch (e) { alert(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  // Tami 3D ödeme: kart bilgileri → /tami/pay → 3DS HTML'i tam sayfada aç
  const tamiPay = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const num = tcard.number.replace(/\s/g, '');
    if (num.length < 15 || !tcard.cvv || !tcard.expireMonth || !tcard.expireYear) { setPayErr('Kart bilgilerini eksiksiz girin.'); return; }
    setBusy(true); setPayErr('');
    try {
      const yil = tcard.expireYear.length === 2 ? '20' + tcard.expireYear : tcard.expireYear;
      const r = await api.post(`/public/store/${slug}/tami/pay`, { orderId: orderInfo.orderId, card: { number: num, cvv: tcard.cvv, expireMonth: Number(tcard.expireMonth), expireYear: Number(yil), holderName: tcard.holderName || cust.ad }, buyer: { ad: cust.ad, telefon: cust.telefon, email: cust.email, adres: cust.adres, il: cust.il, ilce: cust.ilce } });
      if (r.data.ok && r.data.html) { document.open(); document.write(r.data.html); document.close(); return; }
      setPayErr(r.data.message || 'Ödeme başlatılamadı.');
    } catch (er: any) { setPayErr(er?.response?.data?.message || apiErrorMessage(er)); } finally { setBusy(false); }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 text-center bg-slate-100">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center bg-slate-100"><span className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" /></div>;
  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3"><Send size={28} /></div>
        <h1 className="text-xl font-bold text-slate-800">Talebinizi WhatsApp'tan Gönderin</h1>
        {done.talepNo && <p className="text-2xl font-mono font-bold text-slate-800 mt-2">{done.talepNo}</p>}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3 text-left">
          <p className="text-sm font-semibold text-amber-800 mb-1">Siparişiniz henüz oluşmadı.</p>
          <p className="text-xs text-amber-700">Açılan WhatsApp ekranından hazırlanan mesajı mağazamıza <strong>göndermeniz</strong> gerekir. Talebiniz WhatsApp üzerinden iletildiğinde işlenecektir. İletilmeyen talepler için sipariş oluşmaz.</p>
        </div>
        {done.waLink && <a href={done.waLink} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-2 px-5 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 shadow"><Send size={18} /> WhatsApp'ta Aç ve Gönder</a>}
        <button onClick={() => { setDone(null); nav('/'); }} className="mt-4 block mx-auto text-slate-500 text-sm underline">Alışverişe Devam Et</button>
      </div>
    </div>
  );

  const Card = ({ p }: any) => {
    const d = disc(p.eskiFiyat, p.satisFiyat);
    const vars = (p.variations || []);
    return (
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col">
        <div className="relative">
          <div onClick={() => nav(`/urun/${p.id}`)} className="aspect-square bg-slate-50 cursor-pointer">{(p.images || [])[0] && <img src={p.images[0]} loading="lazy" decoding="async" className="w-full h-full object-cover" />}</div>
          {d > 0 && <span className={`absolute top-2 left-2 text-[10px] font-bold text-white px-2 py-0.5 rounded ${discColor(d)}`}>%{d} İNDİRİM</span>}
          <button className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-slate-400 hover:text-red-500"><Heart size={15} /></button>
        </div>
        <div className="p-3 flex flex-col flex-1">
          <p onClick={() => nav(`/urun/${p.id}`)} className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2 min-h-[2.5em] cursor-pointer hover:text-indigo-600">{p.ad}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{p.marka || '\u00A0'}</p>
          {vars.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {vars.slice(0, 8).map((v: any, i: number) => { const out = (v.stok || 0) <= 0; return (
                <span key={(v.deger || '') + i} title={out ? `${v.deger} — tükendi` : v.deger} className={`relative overflow-hidden text-[10px] font-medium px-1.5 py-0.5 rounded border ${out ? 'border-slate-200 text-slate-400 bg-slate-50' : 'border-slate-200 text-slate-600 bg-white'}`}>
                  {v.deger}
                  {out && <span className="absolute left-1/2 top-1/2 w-[140%] h-px bg-red-500 -translate-x-1/2 -translate-y-1/2 -rotate-[20deg] pointer-events-none" />}
                </span>
              ); })}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">{d > 0 && <span className="text-[11px] text-slate-400 line-through">{fmt(p.eskiFiyat)}</span>}<span className="text-base font-bold text-red-600">{fmt(p.satisFiyat)}</span></div>
          <span className={`text-[11px] mt-1 flex items-center gap-1 ${(p.stokAdeti || 0) > 0 ? 'text-green-600' : 'text-red-500'}`}><span className={`w-1.5 h-1.5 rounded-full ${(p.stokAdeti || 0) > 0 ? 'bg-green-500' : 'bg-red-500'}`} /> {(p.stokAdeti || 0) > 0 ? 'Stokta var' : 'Stok yok'}</span>
          <button onClick={() => sepeteEkle(p)} disabled={(p.stokAdeti || 0) <= 0} className="w-full mt-auto pt-2.5 bg-indigo-600 text-white rounded-lg py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-indigo-700 disabled:opacity-40"><ShoppingBag size={14} /> Sepete Ekle</button>
        </div>
      </div>
    );
  };

  // Kurumsal / yasal bilgiler (sanal POS için) — mağaza ayarlarından
  const cfg: any = data.config || {};
  const comp = {
    magaza: data.logoText || data.name || 'Mağaza',
    unvan: cfg.firmaUnvan || data.logoText || data.name || '',
    vkn: cfg.vkn || '', vd: cfg.vergiDairesi || '', mersis: cfg.mersis || '',
    adres: cfg.firmaAdres || cfg.adres || '',
    email: cfg.firmaEmail || cfg.email || '',
    tel: cfg.firmaTel || cfg.telefon || cfg.whatsapp || '',
  };
  const legalDocs = legalContent(comp, cfg);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <StoreHeader
        logoText={data.logoText || data.name}
        topMenu={topMenu}
        cartCount={count}
        searchValue={q}
        onSearchChange={setQ}
        onAccount={() => setAcc(true)}
        onCart={openCart}
        accountLabel={shopUser ? shopUser.ad.split(' ')[0] : 'Üye Ol / Giriş'}
      />

      <div className="max-w-6xl mx-auto px-4 pb-28 sm:pb-10">
        {/* Geri sayım bandı */}
        <div className="mt-4 rounded-2xl bg-slate-900 text-white p-4 flex items-center gap-3 flex-wrap">
          <span className="w-10 h-10 rounded-xl bg-indigo-500/30 flex items-center justify-center"><Zap size={20} className="text-indigo-300" /></span>
          <div className="flex-1 min-w-[140px]"><p className="font-bold">Sınırlı Süreli Fırsatlar</p><p className="text-xs text-white/60">Acele et, fırsatlar bitmeden yakala!</p></div>
          <div className="flex items-center gap-2">{[['SAAT', geri.s], ['DAKİKA', geri.dk], ['SANİYE', geri.sn]].map(([l, v]: any) => <div key={l} className="bg-white/10 rounded-lg px-2.5 py-1 text-center"><p className="text-lg font-bold tabular-nums leading-none">{String(v).padStart(2, '0')}</p><p className="text-[8px] text-white/50 mt-0.5">{l}</p></div>)}</div>
        </div>

        {/* Hareketli Slider (slides) — yoksa varsayılan hero */}
        {slides.length > 0 ? (
          <div className="mt-3 rounded-3xl overflow-hidden relative h-48 sm:h-72 bg-slate-900">
            {slides.map((sl: any, i: number) => (
              <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${i === slideIdx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {sl.image && <img src={sl.image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-transparent" />
                <div className="relative h-full flex flex-col justify-center p-6 sm:p-10 max-w-lg">
                  {sl.title && <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight drop-shadow">{sl.title}</h1>}
                  {sl.subtitle && <p className="text-sm sm:text-lg text-white/90 mt-2 drop-shadow">{sl.subtitle}</p>}
                  {sl.cta && <button onClick={() => { setKat('indirim'); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className="mt-4 w-fit bg-white text-indigo-700 font-bold px-5 py-2.5 rounded-full text-sm hover:bg-indigo-50">{sl.cta}</button>}
                </div>
              </div>
            ))}
            {slides.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                {slides.map((_: any, i: number) => <button key={i} onClick={() => setSlideIdx(i)} className={`h-1.5 rounded-full transition-all ${i === slideIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`} />)}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-800 text-white overflow-hidden relative">
            <div className="relative p-6 sm:p-10 flex items-center">
              <div className="flex-1 z-10">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/15 px-2.5 py-1 rounded-full mb-3"><Zap size={12} className="text-amber-300" /> KAÇIRILMAYACAK FIRSATLAR</span>
                <h1 className="text-3xl sm:text-5xl font-extrabold leading-none tracking-tight">FIRSATLAR</h1>
                <p className="text-lg sm:text-2xl font-bold text-white/90 mt-2">Büyük İndirim Fırsatları Başladı!</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button onClick={() => { setQ(''); setKat('indirim'); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className="bg-white text-indigo-700 font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-indigo-50">Tüm Fırsatlar</button>
                </div>
              </div>
              <div className="hidden sm:flex relative w-48 h-40 shrink-0 items-center justify-center">
                <div className="absolute top-2 left-2 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl font-extrabold rotate-12">%</div>
                <Star size={24} className="absolute top-6 right-8 text-white/70 fill-white/70" />
                <span className="text-[110px] leading-none drop-shadow-2xl -rotate-12">🛍️</span>
              </div>
            </div>
          </div>
        )}

        {/* Hikayeler (Story) */}
        {stories.length > 0 && (
          <div className="flex gap-4 overflow-x-auto py-4 no-scrollbar">
            {stories.map((st: any, i: number) => (
              <button key={st.id || i} onClick={() => setStoryView(i)} className="flex flex-col items-center gap-1.5 shrink-0 w-[68px]">
                <span className="w-16 h-16 rounded-full p-[2.5px] bg-gradient-to-tr from-amber-400 via-pink-500 to-indigo-600">
                  <span className="block w-full h-full rounded-full bg-white p-[2px] overflow-hidden">
                    {st.image ? <img src={st.image} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="w-full h-full rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><Zap size={20} /></span>}
                  </span>
                </span>
                <span className="text-[11px] text-slate-600 text-center leading-tight line-clamp-1 w-full">{st.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* Vitrin Widget kartları */}
        {widgets.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-1">
            {widgets.map((w: any) => (
              <button key={w.id} onClick={() => resolveLink(w.link)} className="text-left rounded-2xl p-4 text-white relative overflow-hidden min-h-[120px] flex flex-col justify-between hover:brightness-105 transition" style={{ background: w.image ? undefined : `linear-gradient(135deg, ${w.color || '#22A95C'}, ${w.color || '#22A95C'}cc)` }}>
                {w.image && <><img src={w.image} alt="" className="absolute inset-0 w-full h-full object-cover" /><span className="absolute inset-0 bg-black/35" /></>}
                <div className="relative">
                  {w.badge && <span className="inline-block text-[9px] font-bold bg-white/25 px-2 py-0.5 rounded-full mb-1.5">{w.badge}</span>}
                  <p className="font-extrabold leading-tight drop-shadow">{w.title}</p>
                  {w.subtitle && <p className="text-[11px] text-white/90 mt-1 drop-shadow line-clamp-2">{w.subtitle}</p>}
                </div>
                <span className="relative inline-flex w-fit items-center gap-1 text-[11px] font-semibold bg-white/95 text-slate-800 px-2.5 py-1 rounded-full mt-2">{w.ctaLabel || 'İncele'} →</span>
              </button>
            ))}
          </div>
        )}

        {/* Sırala + filtre + görünüm */}
        <div id="urunler" className="flex items-center gap-2 mb-3 flex-wrap">
          <button onClick={() => setFiltersOpen((o) => !o)} className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border ${activeFilterCount > 0 ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}><SlidersHorizontal size={15} /> Filtrele{activeFilterCount > 0 && <span className="bg-white/25 px-1.5 rounded-full text-[11px]">{activeFilterCount}</span>}</button>
          <div className="relative"><select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none bg-white border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-sm"><option value="yeni">Sırala: En Yeni</option><option value="indirim">En Yüksek İndirim</option><option value="fiyat_artan">Ucuzdan Pahalıya</option><option value="fiyat_azalan">Pahalıdan Ucuza</option></select><ChevronDown size={14} className="absolute right-2.5 top-3 text-slate-400 pointer-events-none" /></div>
          <span className="text-xs text-slate-400 ml-1">{filtered.length} ürün</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setView('grid')} className={`w-9 h-9 rounded-lg flex items-center justify-center ${view === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}><Grid2x2 size={16} /></button>
            <button onClick={() => setView('list')} className={`w-9 h-9 rounded-lg flex items-center justify-center ${view === 'list' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}><List size={16} /></button>
          </div>
        </div>

        {/* Filtre paneli */}
        {filtersOpen && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-3 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm inline-flex items-center gap-1.5"><SlidersHorizontal size={15} className="text-indigo-600" /> Filtreler</h3>
              <div className="flex items-center gap-2">
                {activeFilterCount > 0 && <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-red-500">Temizle</button>}
                <button onClick={() => setFiltersOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>
            </div>
            {allGenders.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Cinsiyet</p>
                <div className="flex flex-wrap gap-1.5">
                  {allGenders.map((g) => <button key={g} onClick={() => toggleSet(setGenderSel, g)} className={`text-xs px-3 py-1.5 rounded-full border ${genderSel.has(g) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{GENDER_LBL[g] || g}</button>)}
                </div>
              </div>
            )}
            {allSizes.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Beden</p>
                <div className="flex flex-wrap gap-1.5">
                  {allSizes.map((s) => <button key={s} onClick={() => toggleSet(setSizeSel, s)} className={`text-xs px-3 py-1.5 rounded-lg border min-w-[36px] ${sizeSel.has(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{s}</button>)}
                </div>
              </div>
            )}
            {allBrands.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Marka</p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {allBrands.map((b) => <button key={b} onClick={() => toggleSet(setBrandSel, b)} className={`text-xs px-3 py-1.5 rounded-full border ${brandSel.has(b) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{b}</button>)}
                </div>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Fiyat Aralığı (₺)</p>
              <div className="flex items-center gap-2">
                <input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="En az" className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                <span className="text-slate-400">—</span>
                <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="En çok" className="w-28 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
            </div>
          </div>
        )}

        {/* Bölümlü vitrin (varsayılan görünüm) — yatay kaydırma yok, grid */}
        {isDefaultView && sections.map((sec) => (
          <div key={sec.key} className="mb-6">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-base sm:text-lg font-bold text-slate-800">{sec.title}</h2>
              <button onClick={() => { setKat(sec.key); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className="text-xs font-semibold text-indigo-600 hover:underline">Tümünü Gör →</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {sec.items.slice(0, 6).map((p: any) => <Card key={p.id} p={p} />)}
            </div>
          </div>
        ))}

        {/* Ürünler */}
        {isDefaultView && <h2 className="text-base sm:text-lg font-bold text-slate-800 mb-2.5">Tüm Ürünler</h2>}
        {filtered.length === 0 ? <div className="text-center text-slate-400 py-16 bg-white rounded-2xl">Ürün bulunamadı.</div> : (
          <>
            <div className={view === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>{pageItems.map((p) => <Card key={p.id} p={p} />)}</div>
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-6 flex-wrap">
                <button onClick={() => gotoPage(safePage - 1)} disabled={safePage === 1} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50">‹ Önceki</button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).filter((p) => p === 1 || p === pageCount || Math.abs(p - safePage) <= 2).map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-slate-300">…</span>}
                    <button onClick={() => gotoPage(p)} className={`w-9 h-9 rounded-xl text-sm font-semibold ${p === safePage ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{p}</button>
                  </span>
                ))}
                <button onClick={() => gotoPage(safePage + 1)} disabled={safePage === pageCount} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50">Sonraki ›</button>
              </div>
            )}
            <p className="text-center text-[11px] text-slate-400 mt-2">{filtered.length} ürün · Sayfa {safePage}/{pageCount}</p>
          </>
        )}
      </div>

      {/* Story görüntüleyici */}
      {storyView !== null && stories[storyView] && (
        <div className="fixed inset-0 z-[80] bg-black flex items-center justify-center" onClick={() => setStoryView(null)}>
          <div className="relative w-full max-w-md h-full sm:h-[92vh] sm:rounded-2xl overflow-hidden bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="absolute top-2 left-2 right-2 flex gap-1 z-20">
              {stories.map((_: any, i: number) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= (storyView as number) ? 'bg-white' : 'bg-white/30'}`} />)}
            </div>
            <button onClick={() => setStoryView(null)} className="absolute top-4 right-3 z-20 text-white bg-black/30 rounded-full p-1.5"><X size={18} /></button>
            {stories[storyView].image ? <img src={stories[storyView].image} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-violet-700" />}
            <div className="absolute bottom-0 inset-x-0 p-5 bg-gradient-to-t from-black/70 to-transparent z-10">
              <p className="text-white font-bold text-lg drop-shadow">{stories[storyView].title}</p>
              {stories[storyView].link && <button onClick={() => { const lk = stories[storyView as number].link; setStoryView(null); resolveLink(lk); }} className="mt-2 inline-flex items-center gap-1 bg-white text-slate-900 font-semibold px-4 py-2 rounded-full text-sm">Git →</button>}
            </div>
            <button aria-label="onceki" onClick={() => setStoryView((v) => (v !== null && v > 0 ? v - 1 : v))} className="absolute left-0 top-10 bottom-24 w-1/4" />
            <button aria-label="sonraki" onClick={() => setStoryView((v) => (v !== null && v < stories.length - 1 ? v + 1 : null))} className="absolute right-0 top-10 bottom-24 w-1/4" />
          </div>
        </div>
      )}

      {/* Footer + Sanal POS bilgileri */}
      <footer className="bg-slate-900 text-slate-300 mt-6">
        <div className="max-w-6xl mx-auto px-4 py-8 grid sm:grid-cols-4 gap-6 text-sm">
          <div className="sm:col-span-1"><p className="font-extrabold text-white text-lg mb-2">{data.logoText || data.name}</p><p className="text-slate-400 text-xs leading-relaxed">Güvenli alışverişin adresi. Tüm ödemeler 256-bit SSL ile şifrelenir.</p></div>
          <div><p className="font-semibold text-white mb-2">Kurumsal</p><ul className="space-y-1.5 text-slate-400 text-xs"><li><button onClick={() => setLegalModal('hakkimizda')} className="hover:text-white">Hakkımızda</button></li><li><button onClick={() => setLegalModal('iletisim')} className="hover:text-white">İletişim</button></li><li><button onClick={() => setLegalModal('teslimat')} className="hover:text-white">Teslimat & Kargo</button></li></ul></div>
          <div><p className="font-semibold text-white mb-2">Yasal</p><ul className="space-y-1.5 text-slate-400 text-xs"><li><button onClick={() => setLegalModal('mesafeli')} className="hover:text-white text-left">Mesafeli Satış Sözleşmesi</button></li><li><button onClick={() => setLegalModal('iade')} className="hover:text-white text-left">İade, İptal ve Cayma Hakkı</button></li><li><button onClick={() => setLegalModal('gizlilik')} className="hover:text-white text-left">Gizlilik & Çerez Politikası</button></li><li><button onClick={() => setLegalModal('kvkk')} className="hover:text-white text-left">KVKK Aydınlatma Metni</button></li></ul></div>
          <div><p className="font-semibold text-white mb-2">Güvenli Ödeme</p>
            <a href="https://www.iyzico.com" target="_blank" rel="noopener noreferrer" className="inline-block">
              <img src="/iyzico-ile-ode.svg" alt="iyzico ile Öde — VISA, Mastercard, Troy, American Express" className="h-8 w-auto" loading="lazy" />
            </a>
            <div className="flex items-center gap-2 mt-3 text-[11px] text-slate-400"><Lock size={13} /> 256-bit SSL Güvenli Ödeme</div>
          </div>
        </div>
        <div className="border-t border-white/10"><div className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[[Truck, 'Ücretsiz Kargo', (Number(data?.freeShipThreshold) || 0) > 0 ? `${Number(data.freeShipThreshold).toLocaleString('tr-TR')} TL üzeri` : 'Hızlı teslimat'], [RotateCcw, 'Kolay İade', '14 gün içinde'], [ShieldCheck, 'Güvenli Ödeme', '256 bit SSL'], [Headphones, 'Canlı Destek', '7/24 ulaşılır']].map(([Ic, t, s]: any, i) => (
            <div key={i} className="flex items-center gap-2"><Ic size={20} className="text-indigo-400 shrink-0" /><div><p className="text-xs font-semibold text-white">{t}</p><p className="text-[10px] text-slate-400">{s}</p></div></div>
          ))}
        </div></div>
        <div className="border-t border-white/10 text-center py-4 text-[11px] text-slate-500 space-y-1">
          {comp.unvan && <p className="text-slate-400">{comp.unvan}{comp.vkn ? ` · VKN: ${comp.vkn}` : ''}{comp.vd ? ` · Vergi Dairesi: ${comp.vd}` : ''}</p>}
          {comp.adres && <p>{comp.adres}</p>}
          <p>© {new Date().getFullYear()} {comp.magaza} · Tüm hakları saklıdır</p>
        </div>
      </footer>

      {/* Yasal / kurumsal metin modalı (storefront içinde) */}
      {legalModal && legalDocs[legalModal] && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60" onClick={() => setLegalModal('')}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-white rounded-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800">{legalDocs[legalModal].t}</h3>
              <button onClick={() => setLegalModal('')} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="p-5 overflow-y-auto text-[13px] text-slate-600 leading-relaxed whitespace-pre-line">{legalDocs[legalModal].body}</div>
            <div className="p-3 border-t border-slate-100 text-right shrink-0"><button onClick={() => setLegalModal('')} className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">Kapat</button></div>
          </div>
        </div>
      )}

      {/* Online mağaza sipariş detayı (storefront içinde) */}
      {siparisDetay && (() => {
        const o = siparisDetay; const dl = durumLbl(o.durum);
        const ara = o.araToplam || ((o.toplam || 0) + (o.indirim || 0));
        const odendi = (o.tahsilat || 0) >= (o.toplam || 0) - 0.01 && (o.toplam || 0) > 0;
        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60" onClick={() => setSiparisDetay(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
                <div><h3 className="font-bold text-slate-800">Sipariş Detayı</h3><p className="text-[11px] text-slate-400">No: {o.orderNo ? `${o.orderYil}-${String(o.orderNo).padStart(3, '0')}` : o.id.slice(-5)} · {new Date(o.createdAt).toLocaleDateString('tr-TR')}</p></div>
                <button onClick={() => setSiparisDetay(null)}><X size={20} className="text-slate-400" /></button>
              </div>
              <div className="p-4 overflow-y-auto space-y-4">
                <div className="flex items-center justify-between gap-2"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${dl.c}`}>{dl.t}</span><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${odendi ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{odendi ? 'Ödendi' : 'Ödeme Bekliyor'}</span></div>
                {dl.step >= 0 && (
                  <div className="flex items-center">
                    {['Alındı', 'Hazırlanıyor', 'Kargoda', 'Teslim'].map((t, i, arr) => (
                      <div key={t} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center shrink-0"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${dl.step >= i + 1 ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>{dl.step >= i + 1 ? <Check size={12} /> : i + 1}</span><span className="text-[9px] text-slate-400 mt-0.5">{t}</span></div>
                        {i < arr.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${dl.step >= i + 2 ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                      </div>
                    ))}
                  </div>
                )}
                {o.kargoTakip && <div className="bg-indigo-50 rounded-xl p-3"><p className="text-sm text-indigo-700 font-medium inline-flex items-center gap-1.5"><Truck size={14} /> {o.kargoFirmasi || 'Kargo'}</p><p className="text-xs text-slate-500 mt-0.5">Takip No: <b className="text-slate-700">{o.kargoTakip}</b></p></div>}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Ürünler</p>
                  <div className="space-y-2">{(o.items || []).map((it: any, i: number) => { const p = (data.products || []).find((x: any) => x.id === it.productId); const img = it.img || (p?.images || [])[0] || ''; return (
                    <div key={i} className="flex items-center gap-2.5"><div className="w-11 h-11 rounded-lg bg-slate-100 overflow-hidden shrink-0">{img && <img src={img} className="w-full h-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-slate-800 truncate">{it.ad}</p><p className="text-[11px] text-slate-400">{it.varyasyon ? `Beden: ${it.varyasyon} · ` : ''}Adet: {it.adet}</p></div><span className="text-sm font-semibold text-slate-800 shrink-0">{fmt((it.fiyat || 0) * (it.adet || 1))}</span></div>
                  ); })}</div>
                </div>
                {o.adres && <div><p className="text-xs font-semibold text-slate-500 uppercase mb-1">Teslimat Adresi</p><p className="text-sm text-slate-600">{o.adres}</p></div>}
                <div className="border-t border-slate-100 pt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-slate-500"><span>Ara Toplam</span><span>{fmt(ara)}</span></div>
                  {(o.indirim || 0) > 0 && <div className="flex justify-between text-emerald-600"><span>İndirim</span><span>-{fmt(o.indirim)}</span></div>}
                  <div className="flex justify-between text-slate-500"><span>Kargo</span><span className="text-emerald-600">Ücretsiz</span></div>
                  <div className="flex justify-between font-bold text-slate-800 border-t border-slate-100 pt-1.5 mt-1"><span>Toplam</span><span className="text-indigo-600">{fmt(o.toplam)}</span></div>
                </div>
              </div>
              <div className="p-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <span className="text-[11px] text-slate-400 inline-flex items-center gap-1"><ShieldCheck size={13} className="text-emerald-500" /> 256-bit SSL güvenli</span>
                <button onClick={() => setSiparisDetay(null)} className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">Kapat</button>
              </div>
            </div>
          </div>
        );
      })()}
      <nav className="fixed bottom-0 left-0 right-0 sm:hidden bg-white border-t border-slate-100 px-2 py-1.5 flex items-center justify-between z-30">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex flex-col items-center gap-0.5 text-indigo-600 flex-1"><Home size={20} /><span className="text-[10px]">Ana Sayfa</span></button>
        <button onClick={() => document.getElementById('urunler')?.scrollIntoView()} className="flex flex-col items-center gap-0.5 text-slate-400 flex-1"><LayoutGrid size={20} /><span className="text-[10px]">Kataloglar</span></button>
        <button onClick={() => { setKat('indirim'); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className="w-12 h-12 rounded-full bg-indigo-600 text-white flex flex-col items-center justify-center -mt-5 shadow-lg flex-1 max-w-12 mx-auto"><Radio size={18} /><span className="text-[8px]">FIRSAT</span></button>
        <button onClick={openCart} className="flex flex-col items-center gap-0.5 text-slate-400 flex-1 relative"><ShoppingBag size={20} />{count > 0 && <span className="absolute top-0 right-5 w-3.5 h-3.5 rounded-full bg-indigo-600 text-white text-[8px] flex items-center justify-center">{count}</span>}<span className="text-[10px]">Sepetim</span></button>
        <button onClick={() => setAcc(true)} className="flex flex-col items-center gap-0.5 text-slate-400 flex-1"><User size={20} /><span className="text-[10px]">Hesabım</span></button>
      </nav>

      {/* Varyasyon modal */}
      {varModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setVarModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">{varModal.ad}</h3><button onClick={() => setVarModal(null)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-500 mb-2">Beden / varyasyon seçin:</p>
            <div className="flex flex-wrap gap-2 mb-4">{(varModal.variations || []).map((v: any, i: number) => { const out = v.stok <= 0; return <button key={(v.deger || '') + i} disabled={out} onClick={() => setVarSel(v.deger)} className={`relative overflow-hidden px-3 py-2 rounded-xl border text-sm ${varSel === v.deger ? 'bg-indigo-600 text-white border-indigo-600' : out ? 'border-slate-200 text-slate-400 bg-slate-50' : 'border-slate-200 text-slate-600'}`}>{v.deger}{out && <span className="absolute left-1/2 top-1/2 w-[150%] h-[1.5px] bg-red-500 -translate-x-1/2 -translate-y-1/2 -rotate-[20deg] pointer-events-none" />}</button>; })}</div>
            <button disabled={!varSel} onClick={() => { addToCart(varModal, varSel); setVarModal(null); }} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold disabled:opacity-50">Sepete Ekle</button>
          </div>
        </div>
      )}

      {/* Sepet drawer */}
      {/* Çok adımlı akış (Sepet → Teslimat → Ödeme → Onay) */}
      {checkout && (
        <div className="fixed inset-0 z-[100] bg-slate-50 overflow-y-auto">
          {/* Üst bar */}
          <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                {data.logo ? <img src={data.logo} className="w-8 h-8 rounded-lg object-cover" /> : <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">{(comp.magaza || 'M')[0]}</div>}
                <span className="font-bold text-slate-800 hidden sm:block">{comp.magaza}</span>
              </div>
              <button onClick={() => setCheckout(false)} className="ml-auto text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><X size={16} /> Alışverişe Dön</button>
            </div>
            {/* Adım göstergesi */}
            <div className="max-w-3xl mx-auto px-4 pb-3">
              <div className="flex items-center">
                {[
                  { t: 'Sepetim', done: checkoutStep !== 'sepet', active: checkoutStep === 'sepet', go: () => { setOrderInfo(null); setPaytrUrl(''); setPayErr(''); setCheckoutStep('sepet'); } },
                  { t: 'Teslimat Bilgileri', done: checkoutStep === 'odeme', active: checkoutStep === 'teslimat', go: () => { setCheckoutStep('teslimat'); setOrderInfo(null); setPaytrUrl(''); setPayErr(''); } },
                  { t: 'Ödeme', done: false, active: checkoutStep === 'odeme', go: null as any },
                  { t: 'Sipariş Onayı', done: false, active: false, go: null as any },
                ].map((s, i, arr) => (
                  <div key={s.t} className="flex items-center flex-1 last:flex-none">
                    <button type="button" disabled={!s.go} onClick={s.go || undefined} className={`flex items-center gap-1.5 ${s.go ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${s.done ? 'bg-emerald-500 text-white' : s.active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{s.done ? <Check size={13} /> : i + 1}</span>
                      <span className={`text-[11px] sm:text-xs font-medium ${s.active ? 'text-indigo-600' : s.done ? 'text-emerald-600' : 'text-slate-400'} hidden xs:inline sm:inline`}>{s.t}</span>
                    </button>
                    {i < arr.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${s.done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-4 py-5 grid lg:grid-cols-[1fr_minmax(300px,360px)] gap-5 items-start">
            {/* Sol: adım içeriği */}
            <div className="space-y-4 min-w-0">
              {checkoutStep === 'sepet' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2 mb-3"><ShoppingBag size={18} className="text-indigo-600" /> Sepetim ({count})</h2>
                  {cartItems.length === 0 ? (
                    <div className="text-center py-12">
                      <ShoppingBag size={40} className="mx-auto text-slate-200" />
                      <p className="text-slate-500 mt-3 font-medium">Sepetiniz boş</p>
                      <button onClick={() => setCheckout(false)} className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium">Alışverişe Başla</button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(cart).map(([key, x]: any) => (
                        <div key={key} className="flex items-center gap-3 pb-3 border-b border-slate-50 last:border-0">
                          <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0">{x.img && <img src={x.img} loading="lazy" className="w-full h-full object-cover" />}</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{x.ad}</p>{x.varyasyon && <p className="text-xs text-slate-400">Beden / Varyasyon: {x.varyasyon}</p>}<p className="text-sm font-bold text-slate-900 mt-0.5">{fmt(x.fiyat * x.adet)}</p></div>
                          <div className="flex items-center gap-1.5"><button onClick={() => sub(key)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"><Minus size={14} /></button><span className="w-6 text-center text-sm font-medium">{x.adet}</span><button onClick={() => inc(key)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50"><Plus size={14} /></button></div>
                          <button onClick={() => setCart((c) => { const copy = { ...c }; delete copy[key]; return copy; })} title="Kaldır" className="text-slate-300 hover:text-red-500 ml-1"><X size={18} /></button>
                        </div>
                      ))}
                      {/* İndirim kodu */}
                      <div className="pt-2">
                        {discountCode && preview?.kuponGecerli ? (
                          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-sm">
                            <span className="text-emerald-700 font-medium inline-flex items-center gap-1"><Tag size={13} /> {preview.kuponKod} uygulandı</span>
                            <button onClick={kuponKaldir} className="text-[11px] text-emerald-600 underline">kaldır</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && kuponUygula()} placeholder="İndirim kodu" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg uppercase" />
                            <button onClick={kuponUygula} className="px-4 py-2 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">Uygula</button>
                          </div>
                        )}
                        {discountCode && preview && !preview.kuponGecerli && <p className="text-[11px] text-red-500 mt-1">Kod geçersiz veya pasif.</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {checkoutStep === 'teslimat' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <h2 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Truck size={18} className="text-indigo-600" /> Teslimat Bilgileri</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2"><label className="block text-xs text-slate-500 mb-1">Ad Soyad *</label><input value={cust.ad} onChange={(e) => setCust({ ...cust, ad: e.target.value })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" /></div>
                    <div><label className="block text-xs text-slate-500 mb-1">Telefon *</label><input value={cust.telefon} onChange={(e) => setCust({ ...cust, telefon: e.target.value })} placeholder="05xx xxx xx xx" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" /></div>
                    <div><label className="block text-xs text-slate-500 mb-1">E-posta</label><input value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="ornek@mail.com" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" /></div>
                    <div><label className="block text-xs text-slate-500 mb-1">İl *</label><select value={cust.il} onChange={(e) => setCust({ ...cust, il: e.target.value, ilce: '' })} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"><option value="">İl seçiniz</option>{ILLER.map((il) => <option key={il} value={il}>{il}</option>)}</select></div>
                    <div><label className="block text-xs text-slate-500 mb-1">İlçe *</label><select value={cust.ilce} onChange={(e) => setCust({ ...cust, ilce: e.target.value })} disabled={!cust.il} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white disabled:bg-slate-50 disabled:text-slate-400"><option value="">{cust.il ? 'İlçe seçiniz' : 'Önce il seçiniz'}</option>{(IL_ILCE[cust.il] || []).map((ilce) => <option key={ilce} value={ilce}>{ilce}</option>)}</select></div>
                    <div className="sm:col-span-2"><label className="block text-xs text-slate-500 mb-1">Teslimat Adresi *</label><textarea rows={3} value={cust.adres} onChange={(e) => setCust({ ...cust, adres: e.target.value })} placeholder="Mahalle, sokak, no, daire" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" /></div>
                  </div>
                  <p className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Lock size={12} /> Bilgileriniz yalnızca siparişinizin teslimatı için kullanılır.</p>
                </div>
              )}

              {checkoutStep === 'odeme' && (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2"><span className="w-9 h-9 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center"><CreditCard size={18} /></span><div><h2 className="font-bold text-slate-800">Kredi / Banka Kartı ile Ödeme</h2><p className="text-[11px] text-slate-400">Kart bilgileriniz 256-bit SSL ile güvenli altyapı üzerinden işlenir, saklanmaz.</p></div></div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400"><span className="px-1.5 py-0.5 bg-slate-100 rounded">VISA</span><span className="px-1.5 py-0.5 bg-slate-100 rounded">MC</span><span className="px-1.5 py-0.5 bg-slate-100 rounded">TROY</span></div>
                  </div>
                  {paytrUrl ? (
                    <iframe src={paytrUrl} className="w-full" style={{ height: '70vh', minHeight: 520 }} title="Kart ile Ödeme" />
                  ) : orderInfo ? (
                    <form onSubmit={tamiPay} className="p-5 space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-500">Kart Numarası</label>
                        <input value={tcard.number} onChange={(e) => setTcard({ ...tcard, number: e.target.value.replace(/[^0-9]/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19) })} inputMode="numeric" placeholder="0000 0000 0000 0000" className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm tracking-wider" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-500">Kart Üzerindeki İsim</label>
                        <input value={tcard.holderName} onChange={(e) => setTcard({ ...tcard, holderName: e.target.value })} placeholder="Ad Soyad" className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div><label className="text-xs font-semibold text-slate-500">Ay</label><input value={tcard.expireMonth} onChange={(e) => setTcard({ ...tcard, expireMonth: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })} inputMode="numeric" placeholder="AA" className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm" /></div>
                        <div><label className="text-xs font-semibold text-slate-500">Yıl</label><input value={tcard.expireYear} onChange={(e) => setTcard({ ...tcard, expireYear: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })} inputMode="numeric" placeholder="YYYY" className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm" /></div>
                        <div><label className="text-xs font-semibold text-slate-500">CVV</label><input value={tcard.cvv} onChange={(e) => setTcard({ ...tcard, cvv: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })} inputMode="numeric" placeholder="000" className="w-full mt-1 px-3 py-2.5 border border-slate-200 rounded-xl text-sm" /></div>
                      </div>
                      {payErr && <p className="text-rose-600 text-sm flex items-center gap-1.5"><Lock size={14} /> {payErr}</p>}
                      <button type="submit" disabled={busy} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"><Lock size={16} /> {busy ? '3D doğrulamaya yönlendiriliyor...' : `${fmt(odenecek)} Güvenli Öde`}</button>
                      <p className="text-[11px] text-slate-400 text-center inline-flex items-center gap-1 justify-center w-full"><ShieldCheck size={12} className="text-emerald-500" /> 3D Secure ile bankanıza yönlendirileceksiniz.</p>
                    </form>
                  ) : (
                    <div className="p-6 text-center text-slate-500">
                      <Lock size={26} className="mx-auto mb-3 text-slate-300" />
                      <p className="font-medium text-slate-700">Kart ödeme ekranı yüklenemedi.</p>
                      <p className="text-sm mt-1">Siparişiniz alındı; ödeme/iletişim için sizinle iletişime geçilecektir.{cfg.iban ? ` Havale/EFT: ${cfg.bankaAd || ''} ${cfg.iban}` : ''}</p>
                      <button onClick={() => { setCheckout(false); setDone({ ok: true }); }} className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium">Tamam</button>
                    </div>
                  )}
                  <div className="p-3 bg-slate-50 text-[11px] text-slate-400 flex items-center justify-center gap-1.5"><Lock size={12} /> Taksit seçenekleri ödeme ekranında kartınıza göre gösterilir.</div>
                </div>
              )}
            </div>

            {/* Sağ: Sipariş Özeti */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 lg:sticky lg:top-24">
              <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">Sipariş Özeti</h3><span className="text-xs text-slate-400">{cartItems.length} Ürün</span></div>
              <div className="space-y-3 max-h-56 overflow-y-auto mb-3">
                {cartItems.map((it: any, i: number) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0">{it.img && <img src={it.img} className="w-full h-full object-cover" />}</div>
                    <div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-slate-800 truncate">{it.ad}</p><p className="text-[11px] text-slate-400">{it.varyasyon ? `Beden: ${it.varyasyon} · ` : ''}Adet: {it.adet}</p></div>
                    <span className="text-sm font-semibold text-slate-800 shrink-0">{fmt(it.fiyat * it.adet)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 text-sm border-t border-slate-100 pt-3">
                <div className="flex justify-between text-slate-500"><span>Ara Toplam</span><span>{fmt(preview ? preview.araToplam : araToplam)}</span></div>
                {toplamIndirim > 0 && <div className="flex justify-between text-emerald-600"><span>İndirimler</span><span>-{fmt(toplamIndirim)}</span></div>}
                <div className="flex justify-between text-slate-500"><span>Kargo</span><span className="text-emerald-600 font-medium">Ücretsiz</span></div>
              </div>
              <div className="flex justify-between items-center border-t border-slate-100 mt-2 pt-2"><span className="font-bold text-slate-800">Toplam <span className="text-[10px] text-slate-400 font-normal">(KDV Dahil)</span></span><span className="text-xl font-extrabold text-indigo-600">{fmt(odenecek)}</span></div>
              {(Number(data.puanOrani) || 0) > 0 && <div className="mt-3 bg-violet-50 rounded-xl px-3 py-2 text-xs text-violet-700 flex items-center justify-between"><span>Bu siparişten kazanılacak puan</span><span className="font-bold">+{Math.round(odenecek * Number(data.puanOrani) / 100)}</span></div>}

              {checkoutStep === 'sepet' && (
                <button onClick={tamamla} disabled={cartItems.length === 0} className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-2">Teslimat Bilgilerine Geç →</button>
              )}
              {checkoutStep === 'teslimat' && (
                <>
                  <label className="flex items-start gap-2 mt-4 text-[11px] text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={sozlesmeOk} onChange={(e) => setSozlesmeOk(e.target.checked)} className="mt-0.5 rounded accent-indigo-600" />
                    <span><button type="button" onClick={() => setLegalModal('mesafeli')} className="text-indigo-600 underline">Mesafeli Satış Sözleşmesi ve Ön Bilgilendirme Formu</button>'nu okudum, onaylıyorum.</span>
                  </label>
                  <button onClick={() => odemeYap()} disabled={busy || !sozlesmeOk} className="w-full mt-3 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"><Lock size={16} /> {busy ? 'Hazırlanıyor...' : 'Ödemeye Geç'}</button>
                  {!sozlesmeOk && <p className="text-[11px] text-amber-500 text-center mt-1">Devam etmek için sözleşmeyi onaylayın.</p>}
                </>
              )}
              {checkoutStep === 'odeme' && (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => { setCheckoutStep('sepet'); setOrderInfo(null); setPaytrUrl(''); setPayErr(''); }} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-2xl font-medium hover:bg-slate-50">← Sepete Dön</button>
                  <button onClick={() => { setCheckoutStep('teslimat'); setOrderInfo(null); setPaytrUrl(''); setPayErr(''); }} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-2xl font-medium hover:bg-slate-50">← Teslimat Bilgileri</button>
                </div>
              )}

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-[11px] text-slate-500"><ShieldCheck size={15} className="text-emerald-500" /> 256-bit SSL Güvenli Ödeme</div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500"><RotateCcw size={15} className="text-indigo-500" /> 14 gün içinde kolay iade</div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500"><Headphones size={15} className="text-violet-500" /> 7/24 müşteri desteği</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hesabım / Üyelik modal */}
      {acc && (
        <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setAcc(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">{shopUser ? 'Hesabım' : (authMode === 'login' ? 'Üye Girişi' : 'Üye Ol')}</h3><button onClick={() => setAcc(false)}><X size={20} className="text-slate-400" /></button></div>
            {shopUser ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-4">
                  <p className="text-sm text-white/70">Hoş geldin,</p>
                  <p className="text-xl font-bold">{shopUser.ad}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm"><span>Müşteri No: <b>#M{shopUser.musteriNo}</b></span>{(shopUser.bakiye || 0) > 0 && <span>Bakiye: <b>{fmt(shopUser.bakiye)}</b></span>}</div>
                </div>
                <h4 className="font-semibold text-slate-700 text-sm">Siparişlerim</h4>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(hesap?.siparisler || []).length === 0 && <p className="text-sm text-slate-400">Henüz siparişiniz yok.</p>}
                  {(hesap?.siparisler || []).map((o: any) => (
                    <button key={o.id} onClick={() => setSiparisDetay(o)} className="w-full text-left border border-slate-100 rounded-xl p-3 flex items-center justify-between hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors">
                      <div><p className="text-sm font-medium text-slate-800">{o.orderNo ? `${o.orderYil}-${String(o.orderNo).padStart(3, '0')}` : '#' + o.id.slice(-5)}</p><p className="text-[11px] text-slate-400">{new Date(o.createdAt).toLocaleDateString('tr-TR')} · {(o.items || []).length} ürün · {durumLbl(o.durum).t}</p>{o.kargoTakip && <p className="text-[11px] text-indigo-600">Kargo: {o.kargoFirmasi} · {o.kargoTakip}</p>}</div>
                      <div className="text-right"><p className="font-bold text-slate-900">{fmt(o.toplam)}</p><span className="text-[11px] text-indigo-600">Detay →</span></div>
                    </button>
                  ))}
                </div>
                <button onClick={cikis} className="w-full border border-slate-200 text-slate-600 py-2.5 rounded-xl font-medium hover:bg-slate-50">Çıkış Yap</button>
              </div>
            ) : (
              <form onSubmit={authSubmit} className="space-y-3">
                <div className="flex rounded-xl border border-slate-200 p-1">
                  <button type="button" onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${authMode === 'login' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Giriş Yap</button>
                  <button type="button" onClick={() => setAuthMode('register')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${authMode === 'register' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Üye Ol</button>
                </div>
                {authMode === 'register' && <input required value={af.ad} onChange={(e) => setAf({ ...af, ad: e.target.value })} placeholder="Ad Soyad *" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />}
                <input required value={af.telefon} onChange={(e) => setAf({ ...af, telefon: e.target.value })} placeholder="Telefon *" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />
                {authMode === 'register' && <input value={af.instagram} onChange={(e) => setAf({ ...af, instagram: e.target.value })} placeholder="Instagram (opsiyonel)" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />}
                <input required type="password" value={af.sifre} onChange={(e) => setAf({ ...af, sifre: e.target.value })} placeholder="Şifre *" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />
                <button type="submit" disabled={authBusy} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50">{authBusy ? '...' : (authMode === 'login' ? 'Giriş Yap' : 'Üye Ol')}</button>
                <p className="text-[11px] text-slate-400 text-center">Üye girişi yaptıktan sonra çıkış yapmadıkça oturumunuz açık kalır.</p>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Destek asistanı (yalnız destek) */}
      <button onClick={() => window.open(`/sohbet/${slug}`, '_blank')} className="fixed z-40 bottom-20 sm:bottom-6 right-4 flex items-center gap-2 pl-3 pr-4 py-3 rounded-full bg-slate-900 text-white shadow-2xl hover:bg-slate-800">
        <Headphones size={20} /><span className="text-sm font-semibold">Destek</span>
      </button>
    </div>
  );
}

// ───────── Sanal POS uyumlu yasal/kurumsal metinler ─────────
function durumLbl(d: string): { t: string; c: string; step: number } {
  const m: Record<string, { t: string; c: string; step: number }> = {
    sepet: { t: 'Sepet', c: 'bg-slate-100 text-slate-600', step: 0 },
    yeni: { t: 'Sipariş Alındı', c: 'bg-sky-100 text-sky-700', step: 1 },
    onaylandi: { t: 'Onaylandı', c: 'bg-sky-100 text-sky-700', step: 1 },
    hazirlaniyor: { t: 'Hazırlanıyor', c: 'bg-amber-100 text-amber-700', step: 2 },
    kargoda: { t: 'Kargoda', c: 'bg-indigo-100 text-indigo-700', step: 3 },
    tamamlandi: { t: 'Teslim Edildi', c: 'bg-green-100 text-green-700', step: 4 },
    iptal: { t: 'İptal Edildi', c: 'bg-red-100 text-red-600', step: -1 },
  };
  return m[d] || { t: d || 'Sipariş Alındı', c: 'bg-slate-100 text-slate-600', step: 1 };
}

function legalContent(c: any, cfg: any): Record<string, { t: string; body: string }> {
  const unvan = c.unvan || c.magaza;
  const satici = `${unvan}${c.adres ? `\nAdres: ${c.adres}` : ''}${c.vkn ? `\nVergi/VKN: ${c.vkn}` : ''}${c.vd ? `\nVergi Dairesi: ${c.vd}` : ''}${c.mersis ? `\nMERSİS: ${c.mersis}` : ''}${c.tel ? `\nTelefon: ${c.tel}` : ''}${c.email ? `\nE-posta: ${c.email}` : ''}`;
  return {
    hakkimizda: {
      t: 'Hakkımızda',
      body: `${unvan}, müşterilerine güvenli ve hızlı bir alışveriş deneyimi sunmak amacıyla faaliyet göstermektedir. Ürünlerimiz orijinal olup, tüm ödemeleriniz 256-bit SSL ile şifrelenerek güvence altına alınır.\n\nMağazamızda yer alan ürünler stok durumuna göre güncellenmekte, siparişleriniz en kısa sürede hazırlanıp kargoya teslim edilmektedir.\n\nKurumsal Bilgiler:\n${satici}`,
    },
    iletisim: {
      t: 'İletişim',
      body: `Bize aşağıdaki kanallardan ulaşabilirsiniz:\n\n${satici}\n\nÇalışma Saatleri: ${cfg.calismaHafta || 'Hafta içi 09:00 - 18:00'}${cfg.calismaPazar ? `\nHafta Sonu: ${cfg.calismaPazar}` : ''}\n\nSipariş, iade ve her türlü talebiniz için yukarıdaki iletişim bilgilerinden bize yazabilirsiniz.`,
    },
    teslimat: {
      t: 'Teslimat & Kargo',
      body: `Teslimat Süreci:\n• Siparişiniz, ödemenizin onaylanmasının ardından genellikle 1-3 iş günü içinde kargoya teslim edilir.\n• Kargo teslim süresi, bulunduğunuz bölgeye göre 1-4 iş günü arasında değişebilir.\n${cfg.kargoNot ? `• ${cfg.kargoNot}\n` : ''}${(Number(cfg.kargoUcret) || 0) > 0 ? `• Standart kargo ücreti: ${Number(cfg.kargoUcret).toLocaleString('tr-TR')} TL.\n` : ''}${(Number(cfg.freeShipThreshold) || 0) > 0 ? `• ${Number(cfg.freeShipThreshold).toLocaleString('tr-TR')} TL ve üzeri alışverişlerde kargo ücretsizdir.\n` : ''}\nKargo takip bilgisi, ürününüz kargoya verildiğinde tarafınıza iletilir. Teslimat sırasında paketinizi kontrol etmenizi, hasarlı paketleri teslim almamanızı öneririz.\n\nSatıcı:\n${satici}`,
    },
    mesafeli: {
      t: 'Mesafeli Satış Sözleşmesi',
      body: `MADDE 1 - TARAFLAR\nSATICI:\n${satici}\n\nALICI: İşbu sözleşme kapsamında ürün/hizmet satın alan müşteri.\n\nMADDE 2 - KONU\nİşbu sözleşmenin konusu, ALICI'nın SATICI'ya ait internet sitesi üzerinden elektronik ortamda siparişini verdiği ürünün satışı ve teslimi ile ilgili olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri gereğince tarafların hak ve yükümlülüklerinin belirlenmesidir.\n\nMADDE 3 - SÖZLEŞME KONUSU ÜRÜN\nÜrünün cinsi, türü, miktarı, satış bedeli ve ödeme şekli sipariş sayfasında belirtildiği gibidir. Tüm fiyatlar Türk Lirası (TL) cinsinden olup KDV dahildir.\n\nMADDE 4 - GENEL HÜKÜMLER\n4.1. ALICI, ürünün temel nitelikleri, satış fiyatı ve ödeme şekli ile teslimata ilişkin ön bilgileri okuyup bilgi sahibi olduğunu ve elektronik ortamda gerekli teyidi verdiğini kabul eder.\n4.2. Sözleşme konusu ürün, yasal 30 günlük süreyi aşmamak kaydıyla ALICI'nın belirttiği adrese kargo ile teslim edilir.\n4.3. Ödemeler, anlaşmalı bankaların sanal POS altyapısı üzerinden 256-bit SSL şifreleme ile güvenli şekilde alınır. Kart bilgileri SATICI tarafından saklanmaz.\n\nMADDE 5 - CAYMA HAKKI\nALICI, ürünü teslim aldığı tarihten itibaren 14 (on dört) gün içinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin cayma hakkına sahiptir. Cayma hakkının kullanımı için bu süre içinde SATICI'ya yazılı bildirimde bulunulması gerekir.\n\nMADDE 6 - UYUŞMAZLIKLAR\nİşbu sözleşmeden doğabilecek uyuşmazlıklarda, Gümrük ve Ticaret Bakanlığı'nca ilan edilen değere kadar Tüketici Hakem Heyetleri, bu değerin üzerindeki uyuşmazlıklarda Tüketici Mahkemeleri yetkilidir.`,
    },
    iade: {
      t: 'İade, İptal ve Cayma Hakkı',
      body: cfg.iade ? cfg.iade : `Cayma Hakkı:\nALICI, ürünü teslim aldığı tarihten itibaren 14 (on dört) gün içinde cayma hakkını kullanabilir. Cayma bildiriminin bu süre içinde tarafımıza ulaştırılması gerekmektedir.\n\nİade Koşulları:\n• Ürün, orijinal ambalajı, faturası ve tüm aksesuarları ile birlikte, kullanılmamış ve yeniden satılabilir durumda iade edilmelidir.\n• İade onayının ardından ürün bedeli, ödemenin yapıldığı yönteme (kredi kartı / havale) en geç 14 gün içinde iade edilir. Kredi kartı iadelerinin hesaba yansıma süresi bankanıza göre değişebilir.\n• Hijyenik nedenlerle iadesi mümkün olmayan ürünler (iç giyim vb.) ile kişiye özel üretilen ürünler cayma hakkı kapsamı dışındadır.\n\nSipariş İptali:\nKargoya verilmemiş siparişler için iptal talebinizi iletişim kanallarımızdan iletebilirsiniz. Kargoya verilmiş siparişlerde iade prosedürü uygulanır.\n\nSatıcı:\n${satici}`,
    },
    gizlilik: {
      t: 'Gizlilik & Çerez Politikası',
      body: cfg.gizlilik ? cfg.gizlilik : `${unvan} olarak kişisel verilerinizin gizliliğine önem veriyoruz.\n\n1. Toplanan Bilgiler: Sipariş ve teslimat süreçlerini yürütmek amacıyla ad-soyad, adres, telefon ve e-posta gibi bilgileriniz toplanır.\n2. Kullanım Amacı: Bilgileriniz yalnızca siparişlerinizin işlenmesi, teslimatı ve müşteri hizmetleri amacıyla kullanılır; üçüncü kişilerle pazarlama amacıyla paylaşılmaz.\n3. Ödeme Güvenliği: Kart bilgileriniz tarafımızca görülmez ve saklanmaz; ödemeler bankaların güvenli sanal POS altyapısı üzerinden 256-bit SSL ile gerçekleştirilir.\n4. Çerezler: Sitemiz, alışveriş deneyiminizi iyileştirmek ve site trafiğini analiz etmek için çerezler kullanır. Tarayıcı ayarlarınızdan çerezleri yönetebilirsiniz.\n5. Haklarınız: Verilerinizin işlenmesine ilişkin her türlü talebiniz için bizimle iletişime geçebilirsiniz.\n\nVeri Sorumlusu:\n${satici}`,
    },
    kvkk: {
      t: 'KVKK Aydınlatma Metni',
      body: `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla ${unvan} tarafından kişisel verileriniz aşağıda açıklanan kapsamda işlenmektedir.\n\n1. İşlenen Veriler: Kimlik, iletişim, adres ve sipariş/işlem bilgileri.\n2. İşleme Amaçları: Sipariş ve teslimat süreçlerinin yürütülmesi, faturalandırma, müşteri ilişkileri yönetimi ve yasal yükümlülüklerin yerine getirilmesi.\n3. Hukuki Sebep: KVKK m.5 kapsamında sözleşmenin kurulması/ifası ve meşru menfaat.\n4. Aktarım: Verileriniz, yalnızca teslimat (kargo) ve ödeme (banka/sanal POS) süreçlerinin gerektirdiği ölçüde ilgili taraflarla paylaşılır.\n5. Haklarınız (KVKK m.11): Verilerinize erişme, düzeltilmesini veya silinmesini isteme, işlenmesine itiraz etme haklarına sahipsiniz.\n\nBaşvurularınızı aşağıdaki iletişim bilgilerinden iletebilirsiniz:\n${satici}`,
    },
  };
}
