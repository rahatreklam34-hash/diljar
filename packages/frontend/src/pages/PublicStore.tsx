import { useEffect, useState, useMemo, useCallback, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUrlState } from '../lib/useUrlState';
import {
  ShoppingBag, Plus, Minus, X, Check, Search, User, Heart, Menu, Send,
  ChevronLeft, ChevronRight, Zap, PackageSearch,
  Truck, ShieldCheck, Headphones, RefreshCcw, Clock,
  Trash2, ArrowRight, Lock, MapPin, Phone, Mail, SlidersHorizontal,
  Star, Loader,
} from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';
import toast from 'react-hot-toast';

// Instagram ikonu (lucide sürümünde export yok) -> inline SVG
const IgIcon = ({ size = 18, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
);

const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const disc = (eski: number, satis: number) => Math.round(((eski - satis) / eski) * 100);

// Meta Pixel guvenli guard: window.fbq varsa cagirir, yoksa/hatada sessiz gecer.
// opts (ornek: { eventID }) verilirse server CAPI ile deduplication icin fbq'ya iletilir.
const fbqTrack = (ev: string, data?: Record<string, any>, opts?: Record<string, any>) => {
  try {
    const f = (window as any).fbq;
    if (typeof f !== 'function') return;
    if (opts) f('track', ev, data, opts); else f('track', ev, data);
  } catch { /* sessiz */ }
};

interface P { id: string; ad: string; satisFiyat: number; eskiFiyat?: number | null; oneCikan?: boolean; images: string[] | null; marka?: string; cinsiyet?: string; kategoriId?: string; aciklama?: string; createdAt?: string; stokAdeti?: number; variations?: { ad: string; deger: string; stok: number }[] }

// Kirik / eksik gorsel yerine inline SVG placeholder
const IMG_PH = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f1f5f9"/><g fill="none" stroke="%23cbd5e1" stroke-width="6"><rect x="55" y="55" width="90" height="90" rx="10"/><circle cx="82" cy="85" r="10"/><path d="M60 135l30-30 25 22 20-18 20 26"/></g></svg>');
const onImgErr = (e: React.SyntheticEvent<HTMLImageElement>) => { const t = e.currentTarget; if (t.src !== IMG_PH) t.src = IMG_PH; };

// Modul seviyesinde memoize edilmis urun karti.
// Tum girdiler prop olarak alinir (saf) -> React.memo ile gereksiz re-render engellenir.
// Callback'ler (onNav/onToggleFav/onAdd) parent'ta useCallback ile stabilize edilir.
interface ProductCardProps {
  p: P;
  badge?: boolean;
  isFav: boolean;
  rating: number | null;
  ratingCnt: number | null;
  alt: string;
  onNav: (id: string) => void;
  onToggleFav: (id: string) => void;
  onAdd: (id: string) => void;
}
const ProductCard = memo(function ProductCard({ p, badge, isFav, rating, ratingCnt, alt, onNav, onToggleFav, onAdd }: ProductCardProps) {
  const indirimli = !!(p.eskiFiyat && p.eskiFiyat > p.satisFiyat);
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 hover:border-slate-300 hover:shadow-lg overflow-hidden flex flex-col group transition-all">
      <div className="relative aspect-square bg-slate-100 cursor-pointer overflow-hidden" onClick={() => onNav(p.id)}>
        <img src={(p.images || [])[0] || IMG_PH} onError={onImgErr} alt={p.ad || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        {badge && indirimli && <span className="absolute top-2.5 left-2.5 bg-[#0a0a0a] text-white text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wide">%{disc(p.eskiFiyat!, p.satisFiyat)} İNDİRİM</span>}
        <button onClick={(e) => { e.stopPropagation(); onToggleFav(p.id); }} className="absolute top-2.5 right-2.5 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
          <Heart size={16} className={isFav ? 'fill-[#C9A227] text-[#C9A227]' : 'text-slate-400'} />
        </button>
      </div>
      <div className="p-3.5 flex flex-col flex-1">
        <h3 className="text-sm font-semibold text-[#111] line-clamp-1 cursor-pointer hover:text-[#C9A227] transition-colors" onClick={() => onNav(p.id)}>{p.ad || ''}</h3>
        {alt && <span className="text-xs text-slate-400 mt-0.5">{alt}</span>}
        {rating !== null && (
          <div className="flex items-center gap-1 mt-1.5">
            <Star size={13} className="fill-[#C9A227] text-[#C9A227]" />
            <span className="text-xs font-semibold text-slate-700">{rating.toFixed(1)}</span>
            {ratingCnt !== null && <span className="text-[11px] text-slate-400">({ratingCnt})</span>}
          </div>
        )}
        <div className="mt-auto pt-2.5 flex items-center gap-2">
          <span className="font-extrabold text-[#111] text-[15px]">{fmt(p.satisFiyat)}</span>
          {indirimli && <span className="text-xs text-slate-400 line-through">{fmt(p.eskiFiyat!)}</span>}
          <button onClick={(e) => { e.stopPropagation(); if ((p.variations || []).length > 0) { onNav(p.id); return; } onAdd(p.id); }} className="ml-auto bg-[#0a0a0a] hover:bg-[#C9A227] text-white p-2 rounded-lg shrink-0 transition-colors"><Plus size={15} /></button>
        </div>
      </div>
    </div>
  );
});

// Filtre bari icerigi (masaustu panel + mobil drawer'da yeniden kullanilir)
function FilterBody(props: {
  q: string; setQ: (v: string) => void;
  cats?: { id: string; ad: string }[]; kat: string; setKat: (v: string) => void;
  markalar: string[]; fMarka: string; setFMarka: (v: string) => void;
  cinsiyetler: string[]; fCinsiyet: string; setFCinsiyet: (v: string) => void;
  GENDER_LBL: Record<string, string>;
  bedenler: string[]; fBeden: string; setFBeden: (v: string) => void;
  fMin: string; setFMin: (v: string) => void; fMax: string; setFMax: (v: string) => void;
}) {
  const { q, setQ, cats, kat, setKat, markalar, fMarka, setFMarka, cinsiyetler, fCinsiyet, setFCinsiyet, GENDER_LBL, bedenler, fBeden, setFBeden, fMin, setFMin, fMax, setFMax } = props;
  const inputCls = 'w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white outline-none focus:border-[#0a0a0a] text-slate-700 transition-colors';
  return (
    <>
      {/* Arama */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Ürün Ara</label>
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, marka veya kod" className={inputCls + ' pl-8'} />
        </div>
      </div>
      {/* Kategori */}
      {Array.isArray(cats) && cats.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Kategori</label>
          <select value={kat} onChange={(e) => setKat(e.target.value)} className={inputCls}>
            <option value="">Tümü</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}
          </select>
        </div>
      )}
      {/* Marka */}
      {markalar.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Marka</label>
          <select value={fMarka} onChange={(e) => setFMarka(e.target.value)} className={inputCls}>
            <option value="">Tümü</option>
            {markalar.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}
      {/* Cinsiyet */}
      {cinsiyetler.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cinsiyet</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFCinsiyet('')} className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${!fCinsiyet ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white' : 'border-slate-300 text-slate-700 hover:border-[#C9A227] hover:text-[#C9A227]'}`}>Tümü</button>
            {cinsiyetler.map((c) => (
              <button key={c} onClick={() => setFCinsiyet(c)} className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition ${fCinsiyet === c ? 'border-[#0a0a0a] bg-[#0a0a0a] text-white' : 'border-slate-300 text-slate-700 hover:border-[#C9A227] hover:text-[#C9A227]'}`}>{GENDER_LBL[c] || c}</button>
            ))}
          </div>
        </div>
      )}
      {/* Beden */}
      {bedenler.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Beden</label>
          <select value={fBeden} onChange={(e) => setFBeden(e.target.value)} className={inputCls}>
            <option value="">Tümü</option>
            {bedenler.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      )}
      {/* Fiyat araligi */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Fiyat Aralığı (₺)</label>
        <div className="flex items-center gap-2">
          <input type="number" min={0} value={fMin} onChange={(e) => setFMin(e.target.value)} placeholder="Min" className={inputCls} />
          <span className="text-slate-300">–</span>
          <input type="number" min={0} value={fMax} onChange={(e) => setFMax(e.target.value)} placeholder="Max" className={inputCls} />
        </div>
      </div>
    </>
  );
}


export default function PublicStore({ slug: slugProp }: { slug?: string } = {}) {
  const params = useParams();
  const navigate = useNavigate();
  const slug = slugProp || params.slug;
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [kat, setKat] = useUrlState('kat', '');
  const [q, setQ] = useUrlState('q', '');
  // Arama input'u local (controlled) + ~250ms debounce ile q'ya (URL/filtre) yazilir.
  // Boylece her tus vurusunda URL guncellenmez / agir filtre tetiklenmez.
  // qInput mount'ta q'dan seed edilir -> deep-link korunur.
  const [qInput, setQInput] = useState(q);
  const qSeeded = useRef(false);
  // Deep-link / disaridan q degisimini (mount + programatik setQ) input'a yansit.
  useEffect(() => {
    if (!qSeeded.current) { qSeeded.current = true; setQInput(q); return; }
    // Programatik q degisimi (nav butonlari clickNav/temizleFiltre) input ile senkron kalsin.
    if (q !== qInput) setQInput(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // qInput -> setQ debounce (deger degismediyse yazma).
  useEffect(() => {
    if (qInput === q) return;
    const t = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  // Ürün detayından "Sepetim" (nav('/?cart=1')) ile gelindiğinde sepet drawer'ını aç,
  // ardından query'yi temizle (geri/yenile davranışı bozulmasın).
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('cart') === '1') {
        setCartOpen(true);
        sp.delete('cart');
        const qs = sp.toString();
        window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
      }
    } catch { /* */ }
    // yalnızca mount'ta çalışsın
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [checkout, setCheckout] = useState(false);
  const [done, setDone] = useState<any>(null);
  // Talep başarı ekranı kendi URL'ine sahip (/talep/:talepNo). Sayfa bu URL ile açılırsa
  // (yenileme/paylaşım) done verisini sessionStorage'dan geri yükle → ekran kaybolmaz.
  useEffect(() => {
    const tno = String(params.talepNo || '').trim();
    if (!tno) return;
    try {
      const raw = sessionStorage.getItem('talep_' + tno);
      if (raw) { setDone(JSON.parse(raw)); return; }
    } catch { /* sessiz */ }
    // sessionStorage'da yoksa (farklı cihaz/temizlenmiş): en azından talepNo'yu göster.
    setDone((d: any) => d || { talepNo: tno, _restoredMinimal: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.talepNo]);
  const [fav, setFav] = useState<Record<string, boolean>>({});
  const [slide, setSlide] = useState(0);
  const [detail, setDetail] = useState<P | null>(null);
  const [detailImg, setDetailImg] = useState(0);
  const [detailVar, setDetailVar] = useState('');
  const [varSel, setVarSel] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [paytrUrl, setPaytrUrl] = useState('');
  const [cust, setCust] = useState({ ad: '', telefon: '', email: '', adres: '', instagram: '', not: '' });
  const [discount, setDiscount] = useState('');
  const [busy, setBusy] = useState(false);
  // Checkout formu zorunlu alan hatalari (alan bazli inline uyari)
  const [formErr, setFormErr] = useState<{ ad?: string; telefon?: string; adres?: string; instagram?: string }>({});
  // Urun filtreleri
  const [fMarka, setFMarka] = useUrlState('marka', '');
  const [fCinsiyet, setFCinsiyet] = useUrlState('cinsiyet', '');
  const [fMin, setFMin] = useUrlState('min', '');
  const [fMax, setFMax] = useUrlState('max', '');
  const [fBeden, setFBeden] = useUrlState('beden', '');
  const [siralama, setSiralama] = useUrlState('sirala', 'oneri');
  const [filterOpen, setFilterOpen] = useState(false);
  // 'Tum Urunler' vitrini: ilk render maliyetini dusurmek icin limit (buton ile artar).
  const TUMU_STEP = 24;
  const [tumuLimit, setTumuLimit] = useState(TUMU_STEP);
  // Liste degisince (filtre/arama) limiti bastan basla -> davranis tutarli.
  useEffect(() => { setTumuLimit(TUMU_STEP); }, [q, kat, fMarka, fCinsiyet, fMin, fMax, fBeden, siralama]);
  // Musteri girisi var mi? (shopToken_<slug>)
  const [shopLogin, setShopLogin] = useState(false);
  useEffect(() => { if (slug) setShopLogin(!!localStorage.getItem('shopToken_' + slug)); }, [slug]);

  useEffect(() => { api.get(`/public/store/${slug}`).then((r) => setData(r.data)).catch((e) => setErr(apiErrorMessage(e))); }, [slug]);

  // ── wt_cart hidrasyon + stok kirpma ──────────────────────────────────────
  // wt_cart formati: { "<productId>:<varyasyon>": { productId, varyasyon, ad, fiyat, img, adet } }
  // Bu drawer sepeti bare productId -> adet tuttugundan, wt_cart girdilerini urune gore
  // toplayip cart'a + varSel'e aktariyoruz. Ayni anda her kalemin adedini gercek stoga
  // KIRPIYORUZ (stok 0 ise CIKAR). Stok bilinemiyorsa (urun data'da yoksa) guvenli: kirpma yok.
  // Hidrasyon data (stok bilgisi) geldikten sonra bir kez calisir.
  const wtHydratedRef = useRef(false);
  const wtReadyRef = useRef(false);
  useEffect(() => {
    if (!data || wtHydratedRef.current) return;
    wtHydratedRef.current = true;
    let raw: Record<string, any> = {};
    try { raw = JSON.parse(localStorage.getItem('wt_cart') || '{}'); } catch { raw = {}; }
    const nextCart: Record<string, number> = {};
    const nextVarSel: Record<string, string> = {};
    let trimmed = false;
    for (const [key, item] of Object.entries(raw)) {
      if (!item || typeof item !== 'object') continue;
      const pid = String((item as any).productId || key.split(':')[0] || '');
      if (!pid) continue;
      const vary = (item as any).varyasyon || (key.includes(':') ? key.slice(key.indexOf(':') + 1) : '') || '';
      const istenen = Math.max(0, Number((item as any).adet) || 0);
      if (istenen <= 0) continue;
      const p = prodMap.get(pid);
      // Stok bilinemiyor (urun data'da yok) -> guvenli, oldugu gibi tasi.
      if (!p) { nextCart[pid] = (nextCart[pid] || 0) + istenen; if (vary && !nextVarSel[pid]) nextVarSel[pid] = vary; continue; }
      const stok = stokOf(p, vary || undefined);
      const kirpik = Math.min(istenen, stok);
      if (kirpik < istenen) trimmed = true;
      if (kirpik <= 0) continue; // stok 0 -> kalemi cikar
      nextCart[pid] = (nextCart[pid] || 0) + kirpik;
      if (vary && !nextVarSel[pid]) nextVarSel[pid] = vary;
    }
    setCart(nextCart);
    setVarSel((v) => ({ ...nextVarSel, ...v }));
    wtReadyRef.current = true;
    if (trimmed) toast('Sepet stok durumuna göre güncellendi');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // cart degisince wt_cart'i tekrar yaz (drawer sil/adet degisimi UrunDetay rozetiyle senkron).
  // Hidrasyon tamamlanmadan yazma (wt_cart'i erken silmeyelim).
  useEffect(() => {
    if (!wtReadyRef.current) return;
    try {
      const out: Record<string, any> = {};
      for (const [id, adet] of Object.entries(cart)) {
        if (!adet || adet <= 0) continue;
        const p = prodMap.get(id);
        const vary = varSel[id] || '';
        const key = `${id}:${vary}`;
        out[key] = {
          productId: id,
          varyasyon: vary || null,
          ad: p?.ad || '',
          fiyat: p?.satisFiyat || 0,
          img: (p?.images || [])[0] || '',
          adet,
        };
      }
      localStorage.setItem('wt_cart', JSON.stringify(out));
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, varSel]);

  // Modal acikken arka plan kaydirmayi kilitle
  const anyModal = !!(detail || cartOpen || checkout || menuOpen || paytrUrl || filterOpen);
  useEffect(() => {
    document.body.style.overflow = anyModal ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [anyModal]);

  const DEFAULT_SLIDES = useMemo(() => ([
    { title: 'Yeni Sezon Fırsatları', subtitle: 'Premium ürünlerde şık ve uygun seçenekler seni bekliyor', image: '/hero/hero1.jpg', cta: 'ALIŞVERİŞE BAŞLA' },
    { title: 'Kaçırılmayacak İndirimler', subtitle: 'Seçili ürünlerde büyük fırsatlar, hemen keşfet', image: '/hero/hero2.jpg', cta: 'ALIŞVERİŞE BAŞLA' },
  ]), []);
  const slides = useMemo(() => {
    const sl = (data?.slides || []).filter((x: any) => x.title || x.image);
    if (sl.length) return sl;
    if (data?.hero?.title || data?.hero?.image) return [{ title: data.hero.title, subtitle: data.hero.subtitle, image: data.hero.image, cta: 'Alışverişe Başla' }];
    return DEFAULT_SLIDES;
  }, [data, DEFAULT_SLIDES]);
  // Hero görselleri aynı URL'e (ör. /hero/hero1.jpg) tekrar yüklendiğinde tarayıcı
  // "immutable" cache nedeniyle eski görseli gösterebiliyor; sürüm query'si ile taze çekilir.
  const heroSrc = (u?: string) => {
    if (!u) return u as any;
    if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
    return u.includes('?') ? `${u}&v=2` : `${u}?v=2`;
  };
  useEffect(() => { if (slides.length < 2) return; const t = setInterval(() => setSlide((x) => (x + 1) % slides.length), 5000); return () => clearInterval(t); }, [slides.length]);

  // Kategori menü barı linkleri: topMenu -> categories -> sabit liste (fallback)
  // Her link bir "tip" tasir: 'cinsiyet' | 'kampanya' | 'kat' -> tiklaninca ilgili filtre uygulanir.
  const GENDER_MAP: Record<string, string> = { KADIN: 'kadin', 'KADİN': 'kadin', ERKEK: 'erkek', UNISEX: 'unisex', 'ÇOCUK': 'cocuk', COCUK: 'cocuk' };
  const STATIC_MENU = ['KADIN', 'ERKEK', 'UNISEX', 'ÇOCUK', 'KAMPANYALAR'];
  const menuLinks = useMemo(() => {
    const norm = (label: string, catId: string) => {
      const up = label.toString().toUpperCase();
      const g = GENDER_MAP[up];
      if (g) return { label: up, type: 'cinsiyet', value: g, children: [] as any[] };
      if (up.includes('KAMPANYA') || up.includes('İNDİRİM') || up.includes('INDIRIM') || up.includes('FIRSAT') || up.includes('FIRSAT')) return { label: up, type: 'kampanya', value: '', children: [] as any[] };
      return { label: up, type: 'kat', value: catId, children: [] as any[] };
    };
    const tm = data?.topMenu;
    // Panel semasini DOGRUDAN kullan: {label,type,value,children:[{label,type,value}]}
    if (Array.isArray(tm) && tm.length) {
      return tm.map((m: any) => ({
        label: String(m.label || m.ad || ''),
        type: (m.type || ''),
        value: (m.value ?? ''),
        children: Array.isArray(m.children)
          ? m.children.map((c: any) => ({ label: String(c.label || ''), type: c.type || '', value: c.value ?? '' }))
          : [],
      }));
    }
    // GERIYE UYUM: topMenu tanimlamamis magazalar icin eski label-tahmin fallback
    const cats = data?.categories;
    if (Array.isArray(cats) && cats.length) {
      return cats.map((c: any) => norm((c.ad || '').toString(), c.id));
    }
    return STATIC_MENU.map((s) => norm(s, ''));
  }, [data]);
  const scrollToProducts = () => { setTimeout(() => document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }), 60); };
  const selectCat = (catId: string) => { setKat(catId); setFCinsiyet(''); setMenuOpen(false); scrollToProducts(); };
  const selectGender = (g: string) => { setFCinsiyet(g); setKat(''); setMenuOpen(false); scrollToProducts(); };
  const selectKampanya = () => { setSiralama('indirim'); setKat(''); setMenuOpen(false); scrollToProducts(); };
  // Panel 'ozel' filtresi -> mevcut siralama secenegine esle (yalniz oneri/fiyatArtan/fiyatAzalan/indirim var)
  const selectOzel = (v: string) => {
    if (v === 'indirim' || v === 'sonsans') setSiralama('indirim');
    else if (v === 'tumu') temizleFiltre();
    else setSiralama('oneri'); // 'coksatan' / 'yeni' icin uygun siralama yok -> Onerilen + scroll
    setKat(''); setFCinsiyet(''); setMenuOpen(false); scrollToProducts();
  };
  // Ust menu / drawer link tiklama yonlendiricisi (hem yeni panel hem eski tip isimlerini destekle)
  const handleMenuLink = (m: { type: string; value: string }) => {
    const t = m.type;
    if (t === 'cinsiyet') selectGender(m.value);
    else if (t === 'kategori' || t === 'kat') selectCat(m.value);
    else if (t === 'ozel') selectOzel(m.value);
    else if (t === 'kampanya') selectKampanya();
    else selectCat(m.value);
  };
  // Aktif rozet: yeni panel + eski tiplere gore (guvenli opsiyonel)
  const menuAktif = (m: { type?: string; value?: string }) => {
    const t = m?.type; const v = m?.value ?? '';
    if (t === 'cinsiyet') return fCinsiyet === v;
    if (t === 'kategori' || t === 'kat') return !!v && kat === v;
    if (t === 'ozel') return (v === 'indirim' || v === 'sonsans') && siralama === 'indirim';
    if (t === 'kampanya') return siralama === 'indirim';
    return false;
  };

  const products: P[] = data?.products || [];
  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  // Arama terimi bir kez lowercase'e cevrilir (her urun icin degil).
  const qLower = useMemo(() => q.toLowerCase(), [q]);
  const match = useCallback(
    (p: P) => (!kat || p.kategoriId === kat) && (!qLower || [p.ad, p.marka].some((f) => (f || '').toLowerCase().includes(qLower))),
    [kat, qLower],
  );
  const oneCikanlar = useMemo(() => products.filter((p) => p.oneCikan && match(p)), [products, match]);
  const yeniGelenler = useMemo(() => [...products].filter(match).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 8), [products, match]);
  const indirimliler = useMemo(() => products.filter((p) => p.eskiFiyat && p.eskiFiyat > p.satisFiyat && match(p)), [products, match]);

  // Filtre bari: markalar / cinsiyetler (products'tan benzersiz)
  const GENDER_LBL: Record<string, string> = { kadin: 'Kadın', erkek: 'Erkek', unisex: 'Unisex', cocuk: 'Çocuk' };
  const markalar = useMemo(() => [...new Set(products.map((p) => (p.marka || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [products]);
  const cinsiyetler = useMemo(() => [...new Set(products.map((p) => ((p as any).cinsiyet || '').trim()).filter(Boolean))], [products]);
  const filtreAktif = !!(fMarka || fCinsiyet || fMin || fMax || fBeden || siralama !== 'oneri' || kat || q);
  const temizleFiltre = () => { setFMarka(''); setFCinsiyet(''); setFMin(''); setFMax(''); setFBeden(''); setSiralama('oneri'); setKat(''); setQ(''); };

  // BEDEN HARIC diger aktif filtreler (kategori/arama match, marka, cinsiyet->unisex kurali, fiyat)
  // uygulanmis ara liste. Hem 'bedenler' secenekleri hem de nihai 'tumu' bundan turer.
  // Not: fBeden'e BAGLI DEGIL -> beden secince liste/secenekler daralmasin.
  const tumuBedensiz = useMemo(() => {
    const min = parseFloat(fMin), max = parseFloat(fMax);
    return products.filter((p) => {
      if (!match(p)) return false;
      if (fMarka && (p.marka || '').trim() !== fMarka) return false;
      // Cinsiyet: erkek/kadin secildiginde 'unisex' urunler de gorunsun.
      // 'unisex' secilirse yalniz unisex urunler gorunur.
      if (fCinsiyet) {
        const pc = ((p as any).cinsiyet || '').trim();
        if (fCinsiyet === 'unisex') { if (pc !== 'unisex') return false; }
        else if (pc !== fCinsiyet && pc !== 'unisex') return false;
      }
      if (!isNaN(min) && p.satisFiyat < min) return false;
      if (!isNaN(max) && p.satisFiyat > max) return false;
      return true;
    });
  }, [products, match, fMarka, fCinsiyet, fMin, fMax]);

  // Beden listesi: MEVCUT aktif kategori/marka/cinsiyet/arama/fiyat kapsamindaki urunlerin
  // variations[].deger degerlerinden benzersiz (stoklu tercihli, numeric sort).
  // fBeden'e bagli olmadigi icin beden secince liste daralmaz.
  const bedenler = useMemo(() => {
    const set = new Set<string>();
    for (const p of tumuBedensiz) {
      for (const v of (p.variations || [])) {
        const d = (v?.deger || v?.ad || '').trim();
        if (d && (v?.stok || 0) > 0) set.add(d);
      }
    }
    // Stoklu beden yoksa (nadir), stok bakmadan tum bedenleri goster (bos kalmasin).
    if (set.size === 0) {
      for (const p of tumuBedensiz) {
        for (const v of (p.variations || [])) {
          const d = (v?.deger || v?.ad || '').trim();
          if (d) set.add(d);
        }
      }
    }
    // Siralama: once HARF bedenler (mantikli beden sirasi: XS,S,M,L,XL,XXL...; bilinmeyenler alfabetik),
    // sonra RAKAM bedenler (ilk sayiya gore numeric artan). '27-28','36.5' gibi degerler ilk sayilarina
    // gore sayisal grupta yer alir; 'L','XL' harf grubunda.
    const HARF_SIRA = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL', '5XL'];
    const firstNum = (s: string) => { const m = s.match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
    const isNum = (s: string) => !isNaN(parseFloat(s)) && /^[\s\d.,+/-]*$/.test(s.trim());
    return [...set].sort((a, b) => {
      const na = isNum(a), nb = isNum(b);
      // Harf grubu once, rakam grubu sonra
      if (na !== nb) return na ? 1 : -1;
      if (!na && !nb) {
        // Iki harf bedeni: bilinen beden sirasina gore; ikisi de bilinmiyorsa alfabetik
        const ia = HARF_SIRA.indexOf(a.toUpperCase()), ib = HARF_SIRA.indexOf(b.toUpperCase());
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.localeCompare(b, 'tr');
      }
      // Iki sayisal beden: ilk sayilarina gore artan, esitse locale-numeric
      const fa = firstNum(a), fb = firstNum(b);
      if (fa !== fb) return fa - fb;
      return a.localeCompare(b, 'tr', { numeric: true });
    });
  }, [tumuBedensiz]);

  // Secili fBeden guncel beden listesinde yoksa (kategori/filtre degisince) otomatik temizle.
  // Kosullu setState -> gereksiz render/dongu olusmaz.
  useEffect(() => {
    if (fBeden && bedenler.length > 0 && !bedenler.includes(fBeden)) setFBeden('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bedenler, fBeden]);

  const tumu = useMemo(() => {
    // Ara liste (tumuBedensiz) uzerine yalniz fBeden filtresi + siralama uygula.
    let list = fBeden
      ? tumuBedensiz.filter((p) => (p.variations || []).some((v) => ((v?.deger || v?.ad || '').trim() === fBeden) && (v?.stok || 0) > 0))
      : tumuBedensiz;
    if (siralama === 'fiyatArtan') list = [...list].sort((a, b) => a.satisFiyat - b.satisFiyat);
    else if (siralama === 'fiyatAzalan') list = [...list].sort((a, b) => b.satisFiyat - a.satisFiyat);
    else if (siralama === 'indirim') list = [...list].sort((a, b) => {
      const da = a.eskiFiyat && a.eskiFiyat > a.satisFiyat ? disc(a.eskiFiyat, a.satisFiyat) : 0;
      const db = b.eskiFiyat && b.eskiFiyat > b.satisFiyat ? disc(b.eskiFiyat, b.satisFiyat) : 0;
      return db - da;
    });
    return list;
  }, [tumuBedensiz, fBeden, siralama]);

  // Öne Çıkanlar görünümü: admin seçimi (oneCikan) varsa onu, yoksa yeni gelenleri göster.
  // NOT: Vitrin karıştırma özelliği storefront'tan kaldırıldı; sıralama yönetim panelinde yapılır.
  const shuffledOneCikanlar = useMemo(() => (oneCikanlar.length ? oneCikanlar : yeniGelenler), [oneCikanlar, yeniGelenler]);

  // Tüm ürünler vitrini: yönetim panelinde belirlenen kalıcı sıraya göre gösterilir.
  const tumuVitrin = tumu;

  // Infinite scroll için yükleme bayrağı ve observer target ref'i.
  const [tumuLoading, setTumuLoading] = useState(false);
  const tumuObserverRef = useRef<HTMLDivElement | null>(null);
  // 'Daha Fazla Göster' yerine IntersectionObserver ile otomatik ilerle.
  useEffect(() => {
    if (!tumuObserverRef.current) return;
    const el = tumuObserverRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && tumuVitrin.length > tumuLimit) {
          setTumuLoading(true);
          // Kısa gecikme: kullanıcıya yükleme hissi verir ve çift tetiklenmeyi azaltır.
          const t = setTimeout(() => {
            setTumuLimit((n) => Math.min(n + TUMU_STEP, tumuVitrin.length));
            setTumuLoading(false);
          }, 250);
          return () => clearTimeout(t);
        }
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tumuVitrin.length, tumuLimit]);

  const cartItems = Object.entries(cart).map(([id, adet]) => ({ p: prodMap.get(id)!, adet })).filter((x) => x.p);
  const araToplam = cartItems.reduce((sm, x) => sm + x.p.satisFiyat * x.adet, 0);
  const count = Object.values(cart).reduce((sm, n) => sm + n, 0);
  // Bir urun/varyasyon icin gecerli stok adedini hesaplar (add + wt_cart kirpma ortak kullanir).
  const stokOf = (p: P, sel?: string): number => {
    const vars = p.variations || [];
    if (sel) { const v = vars.find((x) => x.deger === sel); return Math.max(0, v?.stok || 0); }
    if (vars.length > 0) return vars.reduce((s, v) => s + Math.max(0, v.stok || 0), 0);
    return Math.max(0, (p as any).stokAdeti ?? Number.MAX_SAFE_INTEGER);
  };
  const add = (id: string, varOverride?: string) => {
    const p = prodMap.get(id);
    if (!p) return;
    // Stok hesabi: secili varyasyon (varSel/override) varsa onun stogu; yoksa varyasyonlarin toplami; yoksa urun stokAdeti
    const sel = varOverride ?? varSel[id];
    const stok = stokOf(p, sel);
    const mevcut = cart[id] || 0;
    if (stok <= 0) { toast.error('Tükendi'); return; }
    if (mevcut + 1 > stok) { toast.error(`Yetersiz stok, en fazla ${stok} adet`); return; }
    setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 })); setCartOpen(true);
    fbqTrack('AddToCart', { content_ids: [id], content_name: p.ad, value: p.satisFiyat, currency: 'TRY' });
  };
  // ProductCard'a verilen stabil callback'ler (React.memo'yu bozmasin).
  // add stok hesabi icin guncel cart/varSel'e ref uzerinden erisir -> stale closure yok.
  const cartRef = useRef(cart); cartRef.current = cart;
  const varSelRef = useRef(varSel); varSelRef.current = varSel;
  const prodMapRef = useRef(prodMap); prodMapRef.current = prodMap;
  // NOT: Client-side Purchase (fbq) KALDIRILDI — güvenilmezdi (sekme değişimi/pixel geç yükleme
  // dönüşümü kaçırıyordu). Purchase artık tek kaynak olarak SUNUCU TARAFLI Meta Conversions API
  // ile (backend catalog.trigger.ts, gerçek StoreOrder oluşunca) gönderilir → tarayıcıdan bağımsız KESİN sayar.
  const cardAdd = useCallback((id: string) => {
    const p = prodMapRef.current.get(id);
    if (!p) return;
    const sel = varSelRef.current[id];
    const vars = p.variations || [];
    let stok: number;
    if (sel) { const v = vars.find((x) => x.deger === sel); stok = Math.max(0, v?.stok || 0); }
    else if (vars.length > 0) { stok = vars.reduce((s, v) => s + Math.max(0, v.stok || 0), 0); }
    else { stok = Math.max(0, (p as any).stokAdeti ?? Number.MAX_SAFE_INTEGER); }
    const mevcut = cartRef.current[id] || 0;
    if (stok <= 0) { toast.error('Tükendi'); return; }
    if (mevcut + 1 > stok) { toast.error(`Yetersiz stok, en fazla ${stok} adet`); return; }
    setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 })); setCartOpen(true);
    fbqTrack('AddToCart', { content_ids: [id], content_name: p.ad, value: p.satisFiyat, currency: 'TRY' });
  }, []);
  const cardNav = useCallback((id: string) => {
    const p = prodMapRef.current.get(id);
    fbqTrack('ViewContent', { content_ids: [id], content_name: p?.ad, value: p?.satisFiyat, currency: 'TRY' });
    navigate('/urun/' + id);
  }, [navigate]);
  const cardToggleFav = useCallback((id: string) => setFav((f) => {
    const next = !f[id];
    if (next) { const p = prodMapRef.current.get(id); fbqTrack('AddToWishlist', { content_ids: [id], content_name: p?.ad, value: p?.satisFiyat, currency: 'TRY' }); }
    return { ...f, [id]: next };
  }), []);
  const sub = (id: string) => setCart((c) => { const n = (c[id] || 0) - 1; const copy = { ...c }; if (n <= 0) delete copy[id]; else copy[id] = n; return copy; });
  const removeItem = (id: string) => setCart((c) => { const copy = { ...c }; delete copy[id]; return copy; });

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    // Zorunlu alan + format dogrulamasi (ad soyad, telefon, adres, instagram)
    const ad = (cust.ad || '').trim();
    const telefon = (cust.telefon || '').trim();
    const adres = (cust.adres || '').trim();
    const instagram = (cust.instagram || '').trim();
    const telDigits = telefon.replace(/\D/g, '');
    const errs: { ad?: string; telefon?: string; adres?: string; instagram?: string } = {};
    if (!ad) errs.ad = 'Ad soyad zorunlu';
    if (!telefon) errs.telefon = 'Telefon zorunlu';
    else if (telDigits.length < 10) errs.telefon = 'Geçerli bir telefon girin (en az 10 hane)';
    if (!adres) errs.adres = 'Teslimat adresi zorunlu';
    if (!instagram) errs.instagram = 'Instagram kullanıcı adı zorunlu';
    if (Object.keys(errs).length > 0) {
      setFormErr(errs);
      toast.error('Lütfen zorunlu alanları eksiksiz doldurun');
      return;
    }
    setFormErr({});
    setBusy(true);
    try {
      const customer = { ...cust, ad, telefon, adres, instagram };
      const items = Object.entries(cart).map(([productId, adet]) => ({ productId, adet, varyasyon: varSel[productId] || undefined }));
      // "Talebi Gönder": backend yalnızca TASLAK oluşturur (sipariş/stok YOK). Prefilled metin +
      // mağaza WhatsApp numarası döner. Müşteri wa.me üzerinden mesajı KENDİ WhatsApp'ından
      // mağazaya gönderir; sipariş ancak o mesaj webhook'a ulaşınca oluşur.
      const r = await api.post(`/public/store/${slug}/order`, { customer, items, discountCode: discount || undefined });
      const num = String(r.data?.whatsapp || '').replace(/\D/g, '');
      const waLink = num && r.data?.whatsappMsg ? `https://wa.me/${num}?text=${encodeURIComponent(r.data.whatsappMsg)}` : null;
      // WhatsApp'ı yeni sekmede aç (müşteri mesajı gönderecek)
      if (waLink) window.open(waLink, '_blank', 'noopener');
      const doneObj = { ...r.data, waLink };
      // Talep başarı ekranını KENDİ URL'ine taşı (/talep/:talepNo): yenilenince/paylaşınca kaybolmasın.
      // done verisi sessionStorage'da talepNo ile saklanır; mount'ta URL param'ından geri yüklenir.
      const talepNo = String(r.data?.talepNo || '').trim();
      if (talepNo) {
        try { sessionStorage.setItem('talep_' + talepNo, JSON.stringify(doneObj)); } catch { /* kota/gizli mod: sessiz */ }
      }
      // Client-side Meta Pixel Purchase — 'Talebi Gönder' anında tetiklenir.
      // eventID SERVER CAPI ile AYNI ('talep_<talepNo>') → Meta deduplication (çift saymaz).
      // Değer modal 'Toplam' = araToplam; content_ids = sepetteki ürün id'leri (setCart({}) öncesi yakala).
      if (talepNo) {
        const purchaseValue = typeof r.data?.toplam === 'number' ? r.data.toplam : araToplam;
        const contentIds = Object.keys(cart);
        fbqTrack('Purchase', { value: purchaseValue, currency: 'TRY', content_ids: contentIds }, { eventID: 'talep_' + talepNo });
      }
      setDone(doneObj); setCart({}); setCheckout(false); setCartOpen(false);
      // URL'i talep sayfasına çevir (geçmişe ekle → 'Mağazaya Dön' geri gidebilir)
      if (talepNo) { try { navigate('/talep/' + encodeURIComponent(talepNo)); } catch { /* sessiz */ } }
      // NOT: 'Purchase' hem SUNUCU TARAFLI (Meta Conversions API, StoreOrder oluşunca) hem de
      // yukarıda CLIENT-side (fbq) sayılır; ikisi de eventID='talep_<talepNo>' kullandığından
      // Meta deduplication ile tek dönüşüm olarak birleştirilir (çift sayım YOK).
    } catch (e: any) {
      const msg = apiErrorMessage(e);
      toast.error(msg || 'Şu an talebiniz hazırlanamadı, lütfen tekrar deneyin.');
    } finally { setBusy(false); }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 text-center">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><span className="w-8 h-8 border-2 border-slate-200 border-t-rose-500 rounded-full animate-spin" /></div>;

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4"><Send className="text-amber-600" size={28} /></div>
        <h1 className="text-xl font-bold text-slate-800">Talebinizi WhatsApp'tan Gönderin</h1>
        {done.talepNo && <p className="text-2xl font-mono font-bold text-slate-800 mt-2">{done.talepNo}</p>}
        {typeof done.toplam === 'number' && <p className="text-slate-500 mt-2">Tutar: <strong>{fmt(done.toplam)}</strong></p>}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3 text-left">
          <p className="text-sm font-semibold text-amber-800 mb-1">Siparişiniz henüz oluşmadı.</p>
          <p className="text-xs text-amber-700">Açılan WhatsApp ekranından hazırlanan mesajı mağazamıza <strong>göndermeniz</strong> gerekir. Talebiniz WhatsApp üzerinden iletildiğinde işlenecektir. İletilmeyen talepler için sipariş oluşmaz.</p>
        </div>
        {done.waLink && <a href={done.waLink} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 shadow"><Send size={18} /> WhatsApp'ta Aç ve Gönder</a>}
        {done.waLink && (
          <div className="mt-4 text-left">
            <p className="text-[11px] text-slate-400 mb-1">WhatsApp bağlantınız (bu sayfayı kaydedebilir veya linki kopyalayabilirsiniz):</p>
            <div className="flex items-stretch gap-2">
              <input readOnly value={done.waLink} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 px-3 py-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg" />
              <button type="button" onClick={() => { try { navigator.clipboard?.writeText(done.waLink); toast.success('Bağlantı kopyalandı'); } catch { /* */ } }} className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap">Kopyala</button>
            </div>
          </div>
        )}
        <button onClick={() => { setDone(null); navigate('/'); }} className="mt-4 block mx-auto text-slate-500 text-sm underline">Mağazaya Dön</button>
      </div>
    </div>
  );

  // Ürün alt satırı: kategori adı -> yoksa cinsiyet+marka -> marka
  const katAdOf = (p: P) => (data?.categories || []).find((c: any) => c.id === p.kategoriId)?.ad || '';
  const altSatir = (p: P) => {
    const kad = katAdOf(p);
    const cins = GENDER_LBL[(p as any).cinsiyet] || '';
    return [cins, kad].filter(Boolean).join(' ') || p.marka || '';
  };
  // rating alanı verilerde YOK -> yıldız satırı gizlenir (uydurma veri gömülmez)
  const ratingOf = (p: P) => (typeof (p as any).rating === 'number' ? (p as any).rating : null);
  const ratingCntOf = (p: P) => (typeof (p as any).ratingCount === 'number' ? (p as any).ratingCount : null);

  // ── (Vitrini Karıştır butonu storefront'tan kaldırıldı; artık yönetim panelinde.)

  // ProductCard (modul seviyesi, React.memo) icin prop uretici.
  // Turetilmis degerleri (isFav/rating/alt) hesaplar; callback'ler stabil (cardNav/cardToggleFav/cardAdd).
  const renderCard = (p: P, badge?: boolean) => (
    <ProductCard
      key={p.id}
      p={p}
      badge={badge}
      isFav={!!fav[p.id]}
      rating={ratingOf(p)}
      ratingCnt={ratingCntOf(p)}
      alt={altSatir(p)}
      onNav={cardNav}
      onToggleFav={cardToggleFav}
      onAdd={cardAdd}
    />
  );

  const favCount = Object.values(fav).filter(Boolean).length;
  const GOLD = '#C9A227';
  // ── Kategori nav barı görünen linkleri: topMenu varsa ondan, yoksa mockup statik seti (handleMenuLink ile calisir)
  const STATIC_NAV: { label: string; type: string; value: string }[] = [
    { label: 'ERKEK', type: 'cinsiyet', value: 'erkek' },
    { label: 'KADIN', type: 'cinsiyet', value: 'kadin' },
    { label: 'UNISEX', type: 'cinsiyet', value: 'unisex' },
    { label: 'AYAKKABI', type: 'kat', value: '' },
    { label: 'ÇANTA', type: 'kat', value: '' },
    { label: 'SAAT', type: 'kat', value: '' },
    { label: 'AKSESUAR', type: 'kat', value: '' },
    { label: 'KOZMETİK', type: 'kat', value: '' },
    { label: 'MARKALAR', type: 'kat', value: '' },
  ];
  // Statik nav etiketini gerçek kategori id'sine eşle (varsa) -> handleMenuLink kategoriye yönlendirir
  const resolveNav = (n: { label: string; type: string; value: string }) => {
    if (n.type === 'kat' && !n.value) {
      const found = (data?.categories || []).find((c: any) => (c.ad || '').toString().toLocaleUpperCase('tr') === n.label);
      if (found) return { type: 'kat', value: found.id };
      // eşleşme yoksa arama filtresine düş (q) -> ürünlere kaydır
      return { type: '__q', value: n.label };
    }
    return { type: n.type, value: n.value };
  };
  const clickNav = (n: { label: string; type: string; value: string }) => {
    const r = resolveNav(n);
    if (r.type === '__q') { setQ(n.label.charAt(0) + n.label.slice(1).toLocaleLowerCase('tr')); setKat(''); setFCinsiyet(''); scrollToProducts(); return; }
    handleMenuLink(r);
  };
  const navSource: any[] = (Array.isArray(data?.topMenu) && data.topMenu.length) ? menuLinks : STATIC_NAV;

  // ── Kategori koleksiyon kartları (F): mockup 6 kart. Gorsel: kategori image -> ilk urun gorseli -> placeholder
  const COLLECTIONS: { label: string; nav: { label: string; type: string; value: string } }[] = [
    { label: 'ERKEK', nav: { label: 'ERKEK', type: 'cinsiyet', value: 'erkek' } },
    { label: 'KADIN', nav: { label: 'KADIN', type: 'cinsiyet', value: 'kadin' } },
    { label: 'AYAKKABI', nav: { label: 'AYAKKABI', type: 'kat', value: '' } },
    { label: 'ÇANTA', nav: { label: 'ÇANTA', type: 'kat', value: '' } },
    { label: 'SAAT', nav: { label: 'SAAT', type: 'kat', value: '' } },
    { label: 'AKSESUAR', nav: { label: 'AKSESUAR', type: 'kat', value: '' } },
  ];
  const collImg = (label: string, type: string, value: string) => {
    // kategori image
    const cat = (data?.categories || []).find((c: any) => c.id === value || (c.ad || '').toString().toLocaleUpperCase('tr') === label);
    if (cat?.image) return cat.image;
    // ilgili urun gorseli
    let src: P | undefined;
    if (type === 'cinsiyet') src = products.find((p) => ((p as any).cinsiyet || '') === value && (p.images || [])[0]);
    else if (cat) src = products.find((p) => p.kategoriId === cat.id && (p.images || [])[0]);
    if (!src) src = products.find((p) => (p.ad || '').toLocaleUpperCase('tr').includes(label) && (p.images || [])[0]);
    return (src?.images || [])[0] || IMG_PH;
  };

  const BRANDS = ['NIKE', 'adidas', 'LACOSTE', 'BOSS', 'TOMMY HILFIGER', 'Calvin Klein', 'EMPORIO ARMANI', 'GUESS'];

  return (
    <div className="min-h-screen bg-white text-[#111]">
      {/* (A) Üst duyuru barı */}
      <div className="bg-[#0a0a0a] text-white text-[11px] sm:text-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-9 sm:h-10 flex items-center gap-4 overflow-x-auto scrollbar-hide whitespace-nowrap">
          <span className="flex items-center gap-1.5 shrink-0">🚚 {data.kargoText || `${(data.freeShipThreshold || 7500).toLocaleString('tr-TR')} TL ve üzeri alışverişlerde ücretsiz kargo!`}</span>
          <span className="hidden md:inline text-white/25">|</span>
          <span className="hidden md:flex items-center gap-2 shrink-0 mx-auto">
            <span className="flex items-center gap-1.5">🏅 {data.topBarText || 'İLK SİPARİŞE ÖZEL %20 İNDİRİM'}</span>
            <span className="border rounded px-2 py-0.5 font-bold tracking-wide" style={{ borderColor: GOLD, color: GOLD }}>KUPON KODU: {data.kuponKodu || data.topBarKupon || 'GENCALLAR20'}</span>
          </span>
          <span className="hidden md:inline text-white/25">|</span>
          <span className="hidden lg:inline shrink-0 ml-auto">{data.topBarSag || 'Vade farksız 3 taksit fırsatı!'}</span>
          {/* mobil: sadece kupon kısaltması */}
          <span className="md:hidden flex items-center gap-2 shrink-0 ml-auto font-semibold" style={{ color: GOLD }}>KUPON: {data.kuponKodu || data.topBarKupon || 'GENCALLAR20'}</span>
        </div>
      </div>

      {/* (B) Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-3 sm:gap-5">
          {/* Mobil hamburger */}
          <button onClick={() => setMenuOpen(true)} className="text-[#111] lg:hidden shrink-0"><Menu size={26} /></button>
          {/* Logo (serif) */}
          <div className="flex-1 lg:flex-none text-center lg:text-left">
            <span style={{ fontFamily: 'Georgia, "Times New Roman", serif' }} className="font-bold text-3xl sm:text-4xl tracking-tight text-[#0a0a0a] whitespace-nowrap">{data.logoText || data.name || 'DiLjar'}</span>
          </div>
          {/* Arama (masaüstü) */}
          <div className="hidden lg:flex flex-1 relative max-w-2xl">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Ürün, marka veya kategori ara..." className="w-full pl-11 pr-24 py-3 border border-slate-300 rounded-full text-sm outline-none focus:border-[#0a0a0a]" />
            <button onClick={scrollToProducts} className="absolute right-1.5 top-1.5 bottom-1.5 px-6 bg-[#0a0a0a] hover:bg-[#C9A227] text-white text-sm font-bold rounded-full transition-colors">ARA</button>
          </div>
          {/* Sağ ikonlar */}
          <div className="flex items-center gap-4 sm:gap-6 shrink-0 text-[#111]">
            <button className="relative flex flex-col items-center gap-0.5 hover:text-[#C9A227] transition-colors">
              <div className="relative"><Heart size={22} />{favCount > 0 && <span className="absolute -top-2 -right-2.5 bg-[#C9A227] text-white text-[10px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center font-bold">{favCount}</span>}</div>
              <span className="hidden sm:block text-[11px] font-medium">Favorilerim</span>
            </button>
            <button onClick={() => navigate(shopLogin ? '/hesabim' : '/giris')} className="hidden sm:flex flex-col items-center gap-0.5 hover:text-[#C9A227] transition-colors"><User size={22} /><span className="text-[11px] font-medium">{shopLogin ? 'Hesabım' : 'Giriş Yap'}</span></button>
            <button onClick={() => setCartOpen(true)} className="relative flex flex-col items-center gap-0.5 hover:text-[#C9A227] transition-colors">
              <div className="relative"><ShoppingBag size={22} />{count > 0 && <span className="absolute -top-2 -right-2.5 bg-[#C9A227] text-white text-[10px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center font-bold">{count}</span>}</div>
              <span className="hidden sm:block text-[11px] font-medium">Sepetim ({count})</span>
            </button>
          </div>
        </div>
        {/* Arama (mobil) */}
        <div className="lg:hidden px-3 sm:px-4 pb-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Ürün, marka veya kategori ara..." className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-full text-sm outline-none focus:border-[#0a0a0a]" />
          </div>
          <button onClick={scrollToProducts} className="px-6 bg-[#0a0a0a] text-white text-sm font-bold rounded-full">ARA</button>
        </div>
      </header>

      {/* (C) Kategori nav barı */}
      <div className="bg-white border-b border-slate-200 sticky top-[57px] lg:top-[69px] z-20">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 flex items-center gap-2 sm:gap-4">
          <button onClick={() => setMenuOpen(true)} className="shrink-0 my-2.5 px-3 sm:px-4 py-2 bg-[#0a0a0a] hover:bg-[#C9A227] text-white text-xs sm:text-sm font-bold rounded-lg inline-flex items-center gap-2 tracking-wide transition-colors">
            <Menu size={16} /> <span className="hidden xs:inline sm:inline">TÜM KATEGORİLER</span><span className="xs:hidden sm:hidden">KATEGORİLER</span>
          </button>
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-2.5 flex-1 scrollbar-hide">
            {navSource.map((m: any, i: number) => {
              const aktif = menuAktif(m);
              const onClick = (Array.isArray(data?.topMenu) && data.topMenu.length) ? () => handleMenuLink(m) : () => clickNav(m);
              return (
                <button key={i} onClick={onClick} className={`shrink-0 px-2.5 sm:px-3 py-1.5 text-[13px] sm:text-sm font-bold rounded-md whitespace-nowrap tracking-wide transition-colors ${aktif ? 'text-[#C9A227]' : 'text-[#111] hover:text-[#C9A227]'}`}>{m.label}</button>
              );
            })}
          </nav>
          <button onClick={selectKampanya} className="shrink-0 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap tracking-wide hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
            <Zap size={16} className="fill-current" /> KAMPANYALAR
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        {/* Canlı / videolu satış (mevcut işlev korunur) */}
        {data.hero?.video && (() => {
          const feat = (data.products || [])[0];
          return (
            <section className="mt-4">
              <div className="relative rounded-2xl overflow-hidden bg-black">
                <video src={data.hero.video} controls playsInline className="w-full max-h-[70vh] bg-black" poster={data.hero.image || undefined} />
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded">● CANLI</span>
              </div>
              {feat && (
                <div className="mt-2 bg-white rounded-2xl border border-slate-100 p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0">{(feat.images || [])[0] && <img src={feat.images[0]} onError={onImgErr} className="w-full h-full object-cover" />}</div>
                  <div className="flex-1 min-w-0"><p className="font-semibold text-slate-800 truncate">{feat.ad}</p><div className="flex items-center gap-2"><span className="font-bold text-slate-900">{fmt(feat.satisFiyat)}</span>{feat.eskiFiyat > feat.satisFiyat && <span className="text-xs text-slate-400 line-through">{fmt(feat.eskiFiyat)}</span>}</div></div>
                  <button onClick={() => (feat.variations || []).length ? navigate('/urun/' + feat.id) : add(feat.id)} className="bg-[#0a0a0a] hover:bg-[#C9A227] text-white px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors"><ShoppingBag size={16} /> Sepete Ekle</button>
                </div>
              )}
            </section>
          );
        })()}

        {/* (D) Hero slider */}
        <section className="relative mt-4 sm:mt-5 rounded-2xl overflow-hidden bg-[#0f0f0f] lg:bg-[#e9e9ea] h-[420px] sm:h-[460px] lg:h-[440px]">
          {slides.map((sl: any, i: number) => {
            const title = sl.title || 'PERFORMANS SINIR TANIMAZ';
            return (
              <div key={i} className={`absolute inset-0 transition-opacity duration-500 ${i === slide ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                {sl.image && <img src={heroSrc(sl.image)} onError={(e) => { const t = e.currentTarget; const fb = heroSrc(i === 1 ? '/hero/hero2.jpg' : '/hero/hero1.jpg'); if (t.src.indexOf('/hero/hero') === -1) { t.src = fb; } else { onImgErr(e); } }} className="absolute inset-0 w-full h-full object-cover object-center lg:object-right" alt="" />}
                {/* koyu -> mobil gradient; masaüstü soldan açık */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/90 via-[#0a0a0a]/40 to-transparent lg:bg-gradient-to-r lg:from-[#eeeeef] lg:via-[#eeeeef]/70 lg:to-transparent" />
                <div className="relative h-full flex flex-col justify-center px-6 sm:px-10 lg:px-14 max-w-md lg:max-w-lg">
                  <span className="text-xs sm:text-sm font-bold tracking-[0.25em] mb-2 sm:mb-3" style={{ color: GOLD }}>YENİ SEZON</span>
                  <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.05] text-white lg:text-[#0a0a0a] uppercase">
                    {title.split(' ').map((w: string, wi: number) => (
                      <span key={wi} className={/SINIR/i.test(w) ? '' : ''} style={/SINIR/i.test(w) ? { color: GOLD } : undefined}>{w}{wi < title.split(' ').length - 1 ? ' ' : ''}</span>
                    ))}
                  </h2>
                  {(sl.subtitle || true) && <p className="mt-3 sm:mt-4 text-sm sm:text-base text-white/85 lg:text-[#333] max-w-xs">{sl.subtitle || 'En seçkin markalar, en özel koleksiyonlar.'}</p>}
                  <button onClick={scrollToProducts} className="mt-5 sm:mt-6 w-fit bg-[#0a0a0a] hover:bg-[#C9A227] text-white px-6 sm:px-7 py-3 sm:py-3.5 rounded-md text-sm font-bold inline-flex items-center gap-2 transition-colors">{sl.cta || 'ALIŞVERİŞE BAŞLA'} <ChevronRight size={18} /></button>
                </div>
              </div>
            );
          })}
          <button onClick={() => setSlide((slide - 1 + slides.length) % slides.length)} className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 bg-white/80 hover:bg-white lg:bg-white/90 text-[#0a0a0a] rounded-full flex items-center justify-center shadow-md transition-colors"><ChevronLeft size={20} /></button>
          <button onClick={() => setSlide((slide + 1) % slides.length)} className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-11 sm:h-11 bg-white/80 hover:bg-white lg:bg-white/90 text-[#0a0a0a] rounded-full flex items-center justify-center shadow-md transition-colors"><ChevronRight size={20} /></button>
          <div className="absolute bottom-4 sm:bottom-5 left-1/2 -translate-x-1/2 flex gap-2">{(slides.length > 1 ? slides : [0, 0, 0, 0]).map((_: any, i: number) => <button key={i} onClick={() => slides.length > 1 && setSlide(i)} className={`h-2 rounded-full transition-all ${i === slide ? 'w-7' : 'w-2 bg-white/50 lg:bg-black/25'}`} style={i === slide ? { backgroundColor: GOLD } : undefined} />)}</div>
        </section>

        {/* (E) Marka şeridi */}
        <section className="mt-4 sm:mt-5">
          <div className="bg-white border border-slate-100 rounded-2xl px-4 sm:px-8 py-6 sm:py-7">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-y-6 gap-x-4 items-center justify-items-center">
              {BRANDS.map((b, i) => (
                <span
                  key={b}
                  className={`text-slate-500 hover:text-[#0a0a0a] transition-colors grayscale opacity-70 hover:opacity-100 whitespace-nowrap text-center ${i >= 6 ? 'hidden lg:block' : ''} ${
                    b === 'NIKE' ? 'italic font-black text-lg tracking-tighter' :
                    b === 'adidas' ? 'font-black text-lg' :
                    b === 'LACOSTE' ? 'font-bold tracking-[0.2em] text-sm' :
                    b === 'BOSS' ? 'font-black text-xl tracking-widest' :
                    b === 'TOMMY HILFIGER' ? 'font-semibold tracking-[0.15em] text-[11px]' :
                    b === 'Calvin Klein' ? 'font-light tracking-[0.2em] text-sm' :
                    b === 'EMPORIO ARMANI' ? 'font-light tracking-[0.15em] text-xs' :
                    'font-bold tracking-[0.25em] text-sm'
                  }`}
                >
                  {b === 'BOSS' ? <>BOSS<span className="block text-[8px] tracking-[0.2em] font-medium">HUGO BOSS</span></> : b}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* (F) Kategori koleksiyon kartları */}
        <section className="mt-4 sm:mt-5">
          <div className="flex lg:grid lg:grid-cols-6 gap-3 sm:gap-4 overflow-x-auto lg:overflow-visible scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
            {COLLECTIONS.map((c) => (
              <button
                key={c.label}
                onClick={() => clickNav(c.nav)}
                className="relative shrink-0 w-[46%] xs:w-[42%] sm:w-[30%] lg:w-auto aspect-[3/4] rounded-2xl overflow-hidden group text-left"
              >
                <img src={collImg(c.label, c.nav.type, c.nav.value)} onError={onImgErr} alt={c.label} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between">
                  <div>
                    <p className="text-white font-black text-base sm:text-lg leading-tight uppercase">{c.label}</p>
                    <p className="text-white/70 text-[11px] sm:text-xs font-semibold tracking-wide uppercase">Koleksiyonu</p>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-white group-hover:bg-[#C9A227] transition-colors shrink-0"><ArrowRight size={15} /></span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* (G) Güven şeridi */}
        <section className="mt-4 sm:mt-5">
          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 sm:p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-3">
              {[
                [Truck, data.guvenKargo || 'ÜCRETSİZ KARGO', data.guvenKargoAlt || `${(data.freeShipThreshold || 7500).toLocaleString('tr-TR')} TL ve üzeri alışverişlerde`],
                [ShieldCheck, 'GÜVENLİ ALIŞVERİŞ', '256 bit SSL ile korunur'],
                [RefreshCcw, 'KOLAY İADE', '14 gün içinde iade hakkı'],
                [Clock, 'HIZLI TESLİMAT', '24 saatte kargoda'],
                [Headphones, 'MÜŞTERİ DESTEĞİ', '7/24 canlı destek hattı'],
              ].map(([Ic, t, s]: any, i) => (
                <div key={i} className={`flex items-center gap-3 sm:justify-center sm:px-2 ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    <Ic size={19} className="text-[#0a0a0a]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-[#111] leading-tight">{t}</p>
                    <p className="text-[11px] text-slate-400 leading-tight">{s}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Vitrini Karıştır butonu storefront'tan kaldırıldı; sıralama yönetim panelinde yapılır. */}

        {/* ==== FILTRE BARI (YENI GELENLER'in hemen ustunde) ==== */}
        <section id="urunler" className="mt-8 scroll-mt-[130px]">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
            {/* Baslik + siralama + mobil filtre butonu */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-base sm:text-lg font-extrabold text-[#111] inline-flex items-center gap-2">
                <SlidersHorizontal size={18} style={{ color: GOLD }} /> Ürünleri Filtrele
                {filtreAktif && <span className="text-slate-400 font-medium text-sm">· {tumu.length} sonuç</span>}
              </h2>
              <div className="flex items-center gap-2">
                <select value={siralama} onChange={(e) => setSiralama(e.target.value)} className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white outline-none focus:border-[#0a0a0a] text-slate-700">
                  <option value="oneri">Önerilen</option>
                  <option value="fiyatArtan">Fiyat: Artan</option>
                  <option value="fiyatAzalan">Fiyat: Azalan</option>
                  <option value="indirim">İndirim Oranı</option>
                </select>
                {/* Mobil filtre butonu */}
                <button onClick={() => setFilterOpen(true)} className="lg:hidden inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-[#0a0a0a] hover:bg-[#C9A227] rounded-lg px-3 py-2 transition-colors">
                  <SlidersHorizontal size={16} /> Filtrele
                </button>
                {filtreAktif && (
                  <button onClick={temizleFiltre} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#111] hover:text-[#C9A227] rounded-lg px-3 py-2 border border-slate-300 hover:border-[#C9A227] transition-colors">
                    <RefreshCcw size={15} /> <span className="hidden sm:inline">Filtreleri Temizle</span><span className="sm:hidden">Temizle</span>
                  </button>
                )}
              </div>
            </div>
            {/* Masaustu: yatay filtre gridi */}
            <div className="hidden lg:grid grid-cols-2 xl:grid-cols-5 gap-4 mt-4">
              <FilterBody
                q={qInput} setQ={setQInput}
                cats={data.categories} kat={kat} setKat={setKat}
                markalar={markalar} fMarka={fMarka} setFMarka={setFMarka}
                cinsiyetler={cinsiyetler} fCinsiyet={fCinsiyet} setFCinsiyet={setFCinsiyet}
                GENDER_LBL={GENDER_LBL}
                bedenler={bedenler} fBeden={fBeden} setFBeden={setFBeden}
                fMin={fMin} setFMin={setFMin} fMax={fMax} setFMax={setFMax}
              />
            </div>
          </div>

          {/* Filtre AKTIF ise: tek bir filtrelenmis sonuc gridi goster */}
          {filtreAktif && (
            <div className="mt-6">
              <h3 className="text-lg font-black text-[#111] mb-4 uppercase tracking-tight">Filtrelenmiş Sonuçlar <span className="text-slate-400 font-medium text-sm">({tumu.length})</span></h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {tumuVitrin.map((p) => renderCard(p, !!(p.eskiFiyat && p.eskiFiyat > p.satisFiyat)))}
              </div>
              {/* Infinite scroll sentinel + durum */}
              <div ref={tumuObserverRef} className="py-6 flex justify-center">
                {tumuLoading && (
                  <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                    <Loader size={18} className="animate-spin text-[#C9A227]" /> Yükleniyor...
                  </span>
                )}
                {!tumuLoading && tumuVitrin.length >= tumu.length && tumu.length > 0 && (
                  <span className="text-xs text-slate-400">Sonuna ulaştınız ({tumu.length} ürün)</span>
                )}
              </div>
              {tumu.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3"><PackageSearch size={30} className="text-slate-300" /></div>
                  <p className="text-[#111] font-semibold">Ürün bulunamadı</p>
                  <p className="text-slate-400 text-sm mt-1">Filtreleri değiştirmeyi veya temizlemeyi deneyin.</p>
                  <button onClick={temizleFiltre} className="mt-4 text-sm font-semibold text-[#111] hover:text-[#C9A227] inline-flex items-center gap-1"><RefreshCcw size={14} /> Filtreleri Temizle</button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ==== NORMAL VITRIN (yalnizca filtre BOSken) ==== */}
        {!filtreAktif && (
          <>
            {/* (I) Promo bannerlar */}
            <section className="mt-8 sm:mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* 1 - Spor Giyim (siyah) */}
              <button onClick={scrollToProducts} className="relative rounded-2xl overflow-hidden bg-[#0a0a0a] text-white h-44 sm:h-52 text-left group order-3 lg:order-1">
                <img src={collImg('ERKEK', 'cinsiyet', 'erkek')} onError={onImgErr} alt="" className="absolute right-0 top-0 h-full w-1/2 object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />
                <div className="relative h-full flex flex-col justify-center p-6">
                  <span className="text-[11px] font-bold tracking-[0.2em] mb-1" style={{ color: GOLD }}>YENİ SEZON</span>
                  <h3 className="text-2xl font-black leading-tight uppercase">Spor Giyim<br />Koleksiyonu</h3>
                  <span className="mt-4 w-fit bg-white text-[#0a0a0a] px-4 py-2 rounded-md text-xs font-bold inline-flex items-center gap-1.5 group-hover:bg-[#C9A227] group-hover:text-white transition-colors">KEŞFET <ArrowRight size={14} /></span>
                </div>
              </button>
              {/* 2 - TAXITCARD (bej) */}
              <button onClick={selectKampanya} className="relative rounded-2xl overflow-hidden bg-[#e8e0d3] text-[#0a0a0a] h-44 sm:h-52 text-left group order-2">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 w-32 h-20 rounded-xl bg-gradient-to-br from-fuchsia-500 via-orange-400 to-yellow-400 shadow-lg flex items-center justify-center rotate-6 group-hover:rotate-3 transition-transform">
                  <span className="text-white font-black italic text-lg tracking-tight drop-shadow">TAXITCARD</span>
                </div>
                <div className="relative h-full flex flex-col justify-center p-6 max-w-[62%]">
                  <span className="text-[11px] font-bold tracking-[0.15em] mb-1 text-[#8a7a5c]">TAXITCARD'A ÖZEL</span>
                  <h3 className="text-xl sm:text-2xl font-black leading-tight uppercase">Vade Farksız<br />3 Taksit!</h3>
                  <span className="mt-4 w-fit bg-[#0a0a0a] text-white px-4 py-2 rounded-md text-xs font-bold inline-flex items-center gap-1.5 group-hover:bg-[#C9A227] transition-colors">HEMEN ALIŞVERİŞE BAŞLA <ArrowRight size={14} /></span>
                </div>
              </button>
              {/* 3 - Premium Saatler (siyah) */}
              <button onClick={() => clickNav({ label: 'SAAT', type: 'kat', value: '' })} className="relative rounded-2xl overflow-hidden bg-[#0a0a0a] text-white h-44 sm:h-52 text-left group order-1 lg:order-3">
                <img src={collImg('SAAT', 'kat', '')} onError={onImgErr} alt="" className="absolute right-0 top-0 h-full w-1/2 object-cover opacity-70 group-hover:opacity-90 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />
                <div className="relative h-full flex flex-col justify-center p-6">
                  <h3 className="text-xl sm:text-2xl font-black leading-tight uppercase"><span style={{ color: GOLD }}>Premium Saatlerde</span><br />Özel Fırsatlar</h3>
                  <span className="mt-4 w-fit border border-white/40 text-white px-4 py-2 rounded-md text-xs font-bold inline-flex items-center gap-1.5 group-hover:bg-white group-hover:text-[#0a0a0a] transition-colors">İNCELE <ArrowRight size={14} /></span>
                </div>
              </button>
            </section>

            {/* (J) Öne Çıkanlar (admin secimi; yoksa yeni gelenler) */}
            {shuffledOneCikanlar.length > 0 && (
              <section className="mt-8 sm:mt-10">
                <div className="flex items-center justify-between mb-4 sm:mb-5">
                  <h2 className="text-xl sm:text-2xl font-black text-[#111] uppercase tracking-tight">Öne Çıkanlar</h2>
                  <button onClick={scrollToProducts} className="text-sm font-bold inline-flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ color: GOLD }}>TÜMÜNÜ GÖR <ArrowRight size={15} /></button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">{shuffledOneCikanlar.map((p) => renderCard(p, !!(p.eskiFiyat && p.eskiFiyat > p.satisFiyat)))}</div>
              </section>
            )}

            {/* İndirimli ürünler */}
            {indirimliler.length > 0 && (
              <section className="mt-8 sm:mt-10">
                <div className="flex items-center justify-between mb-4 sm:mb-5">
                  <h2 className="text-xl sm:text-2xl font-black text-[#111] uppercase tracking-tight">İndirimli Ürünler</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">{indirimliler.slice(0, 8).map((p) => renderCard(p, true))}</div>
              </section>
            )}

            {/* Tüm ürünler */}
            {tumuVitrin.length > 0 && (
              <section className="mt-8 sm:mt-10">
                <div className="flex items-center justify-between mb-4 sm:mb-5">
                  <h2 className="text-xl sm:text-2xl font-black text-[#111] uppercase tracking-tight">Tüm Ürünler <span className="text-slate-400 font-medium text-sm">({tumuVitrin.length})</span></h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                  {tumuVitrin.slice(0, tumuLimit).map((p) => renderCard(p, !!(p.eskiFiyat && p.eskiFiyat > p.satisFiyat)))}
                </div>
                {/* Infinite scroll sentinel + durum */}
                <div ref={tumuObserverRef} className="py-6 flex justify-center">
                  {tumuLoading && (
                    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <Loader size={18} className="animate-spin text-[#C9A227]" /> Yükleniyor...
                    </span>
                  )}
                  {!tumuLoading && tumuVitrin.length <= tumuLimit && tumuVitrin.length > 0 && (
                    <span className="text-xs text-slate-400">Sonuna ulaştınız ({tumuVitrin.length} ürün)</span>
                  )}
                </div>
              </section>
            )}

            {/* (K) Instagram'da Biz */}
            {(() => {
              const cfg = data.config || {};
              const igRaw = cfg.instagram || cfg.instagramUrl || '';
              const igUser = igRaw ? '@' + String(igRaw).replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/$/, '') : '@diljarcom';
              const igHref = igRaw ? (/^https?:\/\//.test(igRaw) ? igRaw : `https://instagram.com/${String(igRaw).replace(/^@/, '')}`) : 'https://instagram.com/diljarcom';
              // 6 kare görsel: ürün görsellerinden (varsa), yoksa placeholder
              const igImgs = products.map((p) => (p.images || [])[0]).filter(Boolean).slice(0, 6);
              while (igImgs.length < 6) igImgs.push(IMG_PH);
              return (
                <section className="mt-8 sm:mt-10 mb-4">
                  <div className="flex items-center justify-between mb-4 sm:mb-5">
                    <h2 className="text-xl sm:text-2xl font-black text-[#111] uppercase tracking-tight">Instagram'da Biz</h2>
                    <a href={igHref} target="_blank" rel="noreferrer" className="text-sm font-bold inline-flex items-center gap-1.5 text-[#111] hover:text-[#C9A227] transition-colors">{igUser} <IgIcon size={17} /></a>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
                    {igImgs.map((src, i) => (
                      <a key={i} href={igHref} target="_blank" rel="noreferrer" className="relative aspect-square rounded-xl overflow-hidden group bg-slate-100">
                        <img src={src} onError={onImgErr} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute inset-0 bg-[#0a0a0a]/0 group-hover:bg-[#0a0a0a]/40 flex items-center justify-center transition-colors">
                          <IgIcon size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              );
            })()}
          </>
        )}
      </div>

      {(() => {
        const cfg = data.config || {};
        const tel = cfg.telefon || cfg.phone || cfg.tel || '';
        const mail = cfg.email || cfg.eposta || cfg.mail || '';
        const adres = cfg.adres || cfg.address || '';
        const ig = cfg.instagram || cfg.instagramUrl || '';
        const fb = cfg.facebook || cfg.facebookUrl || '';
        const igHref = ig ? (/^https?:\/\//.test(ig) ? ig : `https://instagram.com/${String(ig).replace(/^@/, '')}`) : '';
        const fbHref = fb ? (/^https?:\/\//.test(fb) ? fb : `https://facebook.com/${fb}`) : '';
        const hasContact = !!(tel || mail || adres);
        const hasSocial = !!(igHref || fbHref);
        const footCats = (menuLinks || []).slice(0, 6);
        return (
      <footer className="relative bg-slate-900 text-slate-300 mt-16">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Marka */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="font-extrabold text-2xl tracking-tight text-white mb-3">
              {data.logoText || data.name}
            </div>
            <p className="text-sm leading-relaxed text-slate-400 max-w-xs">
              Güvenli alışveriş, hızlı teslimat. Tüm ürünler orijinal ve garantilidir.
            </p>
            {hasSocial && (
              <div className="flex items-center gap-3 mt-5">
                {igHref && (
                  <a href={igHref} target="_blank" rel="noreferrer" aria-label="Instagram" className="w-9 h-9 rounded-full bg-slate-800 hover:bg-rose-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                  </a>
                )}
                {fbHref && (
                  <a href={fbHref} target="_blank" rel="noreferrer" aria-label="Facebook" className="w-9 h-9 rounded-full bg-slate-800 hover:bg-rose-600 flex items-center justify-center text-slate-300 hover:text-white transition-colors">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Kategoriler */}
          {footCats.length > 0 && (
            <div>
              <h4 className="text-white font-semibold mb-4 text-sm tracking-wide">Kategoriler</h4>
              <ul className="space-y-2.5 text-sm">
                {footCats.map((m: any, i: number) => (
                  <li key={i}>
                    <button
                      onClick={() => handleMenuLink(m)}
                      className="group inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                    >
                      <ChevronRight size={14} className="text-rose-500 -ml-0.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Kurumsal / Yardım */}
          <div>
            <h4 className="text-white font-semibold mb-4 text-sm tracking-wide">Kurumsal & Yardım</h4>
            <ul className="space-y-2.5 text-sm">
              {[
                ['/hakkimizda', 'Hakkımızda'],
                ['/iletisim', 'İletişim'],
                ['/iade-iptal', 'İade & Değişim'],
                ['/mesafeli-satis', 'Mesafeli Satış Sözleşmesi'],
                ['/kvkk', 'KVKK Aydınlatma'],
                ['/gizlilik', 'Gizlilik & Güvenlik'],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="group inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
                    <ChevronRight size={14} className="text-rose-500 -ml-0.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* İletişim + Ödeme */}
          <div>
            {hasContact && (
              <>
                <h4 className="text-white font-semibold mb-4 text-sm tracking-wide">İletişim</h4>
                <ul className="space-y-3 text-sm mb-6">
                  {tel && (
                    <li>
                      <a href={`tel:${String(tel).replace(/\s/g, '')}`} className="flex items-start gap-2.5 text-slate-400 hover:text-white transition-colors">
                        <Phone size={16} className="text-rose-500 mt-0.5 shrink-0" />
                        <span>{tel}</span>
                      </a>
                    </li>
                  )}
                  {mail && (
                    <li>
                      <a href={`mailto:${mail}`} className="flex items-start gap-2.5 text-slate-400 hover:text-white transition-colors">
                        <Mail size={16} className="text-rose-500 mt-0.5 shrink-0" />
                        <span className="break-all">{mail}</span>
                      </a>
                    </li>
                  )}
                  {adres && (
                    <li className="flex items-start gap-2.5 text-slate-400">
                      <MapPin size={16} className="text-rose-500 mt-0.5 shrink-0" />
                      <span>{adres}</span>
                    </li>
                  )}
                </ul>
              </>
            )}
            <h4 className="text-white font-semibold mb-3 text-sm tracking-wide">Güvenli Ödeme</h4>
            <p className="text-xs text-slate-500 mb-3">256-bit SSL ve 3D Secure ile korumalı ödeme.</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-7 px-2 bg-white rounded flex items-center"><span className="font-bold italic text-[#1a1f71] text-sm tracking-wide">VISA</span></div>
              <div className="h-7 px-2 bg-white rounded flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-[#eb001b] inline-block" /><span className="w-4 h-4 rounded-full bg-[#f79e1b] inline-block -ml-2 opacity-90" /><span className="text-[10px] font-semibold text-slate-700 ml-0.5">mastercard</span></div>
              <div className="h-7 px-2 bg-white rounded flex items-center"><span className="font-bold text-[#00a4a6] text-sm">troy</span></div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>© {new Date().getFullYear()} {data.logoText || data.name} — Tüm hakları saklıdır.</span>
            <span className="text-slate-600">WTech altyapısıyla</span>
          </div>
        </div>
      </footer>
        );
      })()}

      {/* Mobil alt sabit sepet cubugu (sadece mobil, sepette urun varken, modal kapaliyken) */}
      {count >= 1 && !anyModal && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.6rem)] pt-2 bg-gradient-to-t from-white via-white to-white/0 pointer-events-none">
          <button
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto w-full bg-[#0a0a0a] hover:bg-[#C9A227] text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 transition-colors"
          >
            <span className="relative shrink-0">
              <ShoppingBag size={22} />
              <span className="absolute -top-2 -right-2 bg-[#C9A227] text-white text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center font-bold">{count}</span>
            </span>
            <span className="flex flex-col items-start leading-tight min-w-0">
              <span className="text-[11px] text-white/70">{count} ürün · Toplam</span>
              <span className="text-base font-extrabold">{fmt(araToplam)}</span>
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold shrink-0">Sepeti Gör <ArrowRight size={16} /></span>
          </button>
        </div>
      )}

      {/* Sepet drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setCartOpen(false)}>
          <div className="w-full max-w-md bg-slate-50 h-full flex flex-col shadow-2xl animate-[slidein_.25s_ease]" onClick={(e) => e.stopPropagation()}>
            {/* Baslik */}
            <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-slate-100">
              <h2 className="font-bold text-slate-900 flex items-center gap-2 text-lg"><ShoppingBag size={20} className="text-rose-600" /> Sepetim <span className="text-slate-400 font-medium">({count})</span></h2>
              <button onClick={() => setCartOpen(false)} aria-label="Kapat" className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"><X size={20} /></button>
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center h-full py-16">
                  <div className="w-20 h-20 rounded-full bg-white shadow-sm flex items-center justify-center mb-4"><ShoppingBag size={34} className="text-slate-300" /></div>
                  <p className="text-slate-800 font-semibold text-lg">Sepetiniz boş</p>
                  <p className="text-slate-400 text-sm mt-1">Beğendiğiniz ürünleri sepete ekleyin.</p>
                  <button onClick={() => setCartOpen(false)} className="mt-6 bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-colors">Alışverişe Devam <ArrowRight size={16} /></button>
                </div>
              ) : (
                cartItems.map(({ p, adet }) => (
                  <div key={p.id} className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex gap-3">
                    <img src={(p.images || [])[0] || IMG_PH} onError={onImgErr} alt={p.ad || ''} className="w-20 h-20 rounded-lg object-cover bg-slate-100 shrink-0" />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug">{p.ad || ''}</p>
                        <button onClick={() => removeItem(p.id)} aria-label="Kaldır" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition"><Trash2 size={16} /></button>
                      </div>
                      {varSel[p.id] && <span className="text-xs text-slate-400 mt-0.5">{varSel[p.id]}</span>}
                      <span className="text-xs text-slate-400 mt-0.5">Birim: {fmt(p.satisFiyat)}</span>
                      <div className="mt-auto pt-2 flex items-center justify-between">
                        <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden">
                          <button onClick={() => sub(p.id)} aria-label="Azalt" className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-50"><Minus size={14} /></button>
                          <span className="w-9 text-center text-sm font-semibold text-slate-800">{adet}</span>
                          <button onClick={() => add(p.id)} aria-label="Arttır" className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-50"><Plus size={14} /></button>
                        </div>
                        <span className="font-bold text-slate-900">{fmt(p.satisFiyat * adet)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Alt (sticky ozet) */}
            {cartItems.length > 0 && (
              <div className="bg-white border-t border-slate-100 px-5 py-4 space-y-3 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
                <div className="flex justify-between text-sm text-slate-500"><span>Ara Toplam</span><span className="text-slate-700 font-medium">{fmt(araToplam)}</span></div>
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Kargo</span>
                  <span className="text-emerald-600 font-medium">{araToplam >= (data.freeShipThreshold || 7500) ? 'Ücretsiz' : 'Ödeme adımında'}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className="font-bold text-slate-900">Toplam</span>
                  <span className="text-xl font-extrabold text-rose-600">{fmt(araToplam)}</span>
                </div>
                <button onClick={() => { fbqTrack('InitiateCheckout', { value: araToplam, currency: 'TRY', content_ids: Object.keys(cart), num_items: count }); setCheckout(true); setCartOpen(false); }} disabled={busy} className="w-full bg-[#0a0a0a] hover:bg-[#C9A227] text-white py-3.5 rounded-xl font-semibold inline-flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 transition-colors">
                  {busy ? 'Hazırlanıyor...' : <>Ödemeye Geç <ArrowRight size={18} /></>}
                </button>
                <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1"><Lock size={11} /> Güvenli · Talebiniz mağazamıza WhatsApp üzerinden iletilir.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout */}
      {checkout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setCheckout(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={placeOrder} className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto border border-slate-200">
            {/* Baslik */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-[#0a0a0a] flex items-center gap-2"><MapPin size={20} style={{ color: GOLD }} /> Sipariş Bilgileri</h3>
              <button type="button" onClick={() => setCheckout(false)} aria-label="Kapat" className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-[#0a0a0a] hover:bg-slate-100 transition"><X size={20} /></button>
            </div>

            {/* Adim gostergesi */}
            <div className="flex items-center gap-2 px-6 py-3.5 border-b border-slate-100 bg-[#111]">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-white"><span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-[#0a0a0a]" style={{ background: GOLD }}>1</span> Adres</span>
              <span className="flex-1 h-px bg-white/20" />
              <span className="flex items-center gap-1.5 text-xs font-semibold text-white/60"><span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold bg-white/15 text-white">2</span> Ödeme</span>
              <span className="flex-1 h-px bg-white/20" />
              <span className="flex items-center gap-1.5 text-xs font-semibold text-white/60"><span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold bg-white/15 text-white">3</span> Onay</span>
            </div>

            <div className="grid md:grid-cols-5 gap-6 p-6">
              {/* Adres/teslimat formu (mobilde ustte) */}
              <div className="md:col-span-3 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#111] mb-1.5">Ad Soyad *</label>
                    <input required value={cust.ad} onChange={(e) => { setCust({ ...cust, ad: e.target.value }); if (formErr.ad) setFormErr((f) => ({ ...f, ad: undefined })); }} placeholder="Ad Soyad" className={`w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-slate-100 transition ${formErr.ad ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-[#0a0a0a]'}`} />
                    {formErr.ad && <p className="mt-1 text-[11px] font-medium text-red-500">{formErr.ad}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#111] mb-1.5">Telefon *</label>
                    <input required value={cust.telefon} onChange={(e) => { setCust({ ...cust, telefon: e.target.value }); if (formErr.telefon) setFormErr((f) => ({ ...f, telefon: undefined })); }} placeholder="05XX XXX XX XX" className={`w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-slate-100 transition ${formErr.telefon ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-[#0a0a0a]'}`} />
                    {formErr.telefon && <p className="mt-1 text-[11px] font-medium text-red-500">{formErr.telefon}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111] mb-1.5">E-posta</label>
                  <input type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="ornek@eposta.com" className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:border-[#0a0a0a] focus:ring-2 focus:ring-slate-100 transition" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111] mb-1.5">Instagram Kullanıcı Adı *</label>
                  <input required value={cust.instagram} onChange={(e) => { setCust({ ...cust, instagram: e.target.value }); if (formErr.instagram) setFormErr((f) => ({ ...f, instagram: undefined })); }} placeholder="@kullaniciadi" className={`w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-slate-100 transition ${formErr.instagram ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-[#0a0a0a]'}`} />
                  {formErr.instagram && <p className="mt-1 text-[11px] font-medium text-red-500">{formErr.instagram}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111] mb-1.5">Teslimat Adresi *</label>
                  <textarea required rows={3} value={cust.adres} onChange={(e) => { setCust({ ...cust, adres: e.target.value }); if (formErr.adres) setFormErr((f) => ({ ...f, adres: undefined })); }} placeholder="Mahalle, cadde, sokak, bina/daire no, ilçe, il" className={`w-full px-3.5 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-slate-100 transition resize-none ${formErr.adres ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-[#0a0a0a]'}`} />
                  {formErr.adres && <p className="mt-1 text-[11px] font-medium text-red-500">{formErr.adres}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111] mb-1.5">Sipariş Notu</label>
                  <textarea rows={2} value={cust.not || ''} onChange={(e) => setCust({ ...cust, not: e.target.value })} placeholder="Eklemek istediğiniz not (opsiyonel)" className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:border-[#0a0a0a] focus:ring-2 focus:ring-slate-100 transition resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#111] mb-1.5">İndirim Kodu</label>
                  <input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Kupon / indirim kodu (varsa)" className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl outline-none focus:border-[#0a0a0a] focus:ring-2 focus:ring-slate-100 transition uppercase" />
                </div>
              </div>

              {/* Siparis ozeti (mobilde altta, sticky) */}
              <div className="md:col-span-2">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm sticky bottom-0 md:top-20 md:bottom-auto">
                  <h4 className="text-sm font-bold text-[#0a0a0a] mb-3 flex items-center gap-1.5"><ShoppingBag size={16} style={{ color: GOLD }} /> Sipariş Özeti</h4>
                  <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                    {cartItems.map(({ p, adet }) => (
                      <div key={p.id} className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <img src={(p.images || [])[0] || IMG_PH} onError={onImgErr} alt={p.ad || ''} className="w-11 h-11 rounded-lg object-cover bg-slate-100 border border-slate-100" />
                          <span className="absolute -top-1.5 -right-1.5 bg-[#0a0a0a] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-semibold">{adet}</span>
                        </div>
                        <span className="flex-1 min-w-0 text-xs text-slate-600 line-clamp-2 leading-tight">{p.ad || ''}</span>
                        <span className="text-xs font-semibold text-[#111] shrink-0">{fmt(p.satisFiyat * adet)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-200 mt-3 pt-3 space-y-1.5">
                    <div className="flex justify-between text-sm text-slate-500"><span>Ara Toplam</span><span className="text-slate-700">{fmt(araToplam)}</span></div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="font-bold text-[#0a0a0a]">Toplam</span>
                      <span className="text-lg font-extrabold" style={{ color: GOLD }}>{fmt(araToplam)}</span>
                    </div>
                  </div>
                  <button type="submit" disabled={busy} className="w-full mt-4 bg-[#0a0a0a] hover:bg-[#C9A227] text-white py-3 rounded-xl font-bold inline-flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 transition-colors">
                    {busy ? 'Gönderiliyor...' : <>Talebi Gönder <ArrowRight size={18} /></>}
                  </button>
                  <p className="text-[11px] text-slate-400 text-center mt-2.5 flex items-center justify-center gap-1"><Lock size={11} /> Güvenli ödeme (256-bit SSL & 3D Secure)</p>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Urun detay */}
      {detail && (() => {
        const imgs = (detail.images || []).filter(Boolean);
        const vars = detail.variations || [];
        const hasVar = vars.length > 0;
        const indirimli = !!(detail.eskiFiyat && detail.eskiFiyat > detail.satisFiyat);
        // Varyasyon varsa: tüm bedenler tükendiyse ürün tükenmiş sayılır. Varyasyon yoksa daima satılabilir.
        const tukenmis = hasVar && vars.every((v) => (v.stok || 0) <= 0);
        const aktifImg = imgs[detailImg] || imgs[0] || '';
        const kod = (detail as any).salesCode || (detail as any).barkod || '';
        const katAd = (data?.categories || []).find((c: any) => c.id === detail.kategoriId)?.ad || '';
        // Açıklama: gerçek aciklama alanı varsa onu kullan; yoksa marka/ad/kategoriden jenerik metin türet.
        const aciklamaMetni = (detail.aciklama && detail.aciklama.trim())
          ? detail.aciklama
          : `${[detail.marka, detail.ad].filter(Boolean).join(' ')}, özenle seçilmiş malzemesi ve şık tasarımıyla${katAd ? ` ${katAd.toLowerCase()} kategorisinde` : ''} günlük kullanıma uygun bir üründür. Konfor ve modern görünümü bir arada sunar; farklı kombinlerle rahatça tamamlayabilirsiniz.`;
        const kargoBadge: any[] = [
          [Truck, data?.guvenKargo || 'Ücretsiz Kargo', data?.guvenKargoAlt || `${(data?.freeShipThreshold || 7500).toLocaleString('tr-TR')} TL üzeri`],
          [RefreshCcw, 'Kolay İade', '14 gün içinde iade'],
          [ShieldCheck, 'Güvenli Ödeme', '256-bit SSL & 3D Secure'],
        ];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <button onClick={() => setDetail(null)} aria-label="Kapat" className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-white transition"><X size={20} /></button>
            <div className="grid md:grid-cols-2">
              {/* SOL: görsel galerisi */}
              <div className="bg-slate-50 p-5 sm:p-6 flex flex-col">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-white flex items-center justify-center border border-slate-100">
                  {aktifImg ? (
                    <img src={aktifImg} onError={onImgErr} alt={detail.ad || ''} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-300"><PackageSearch size={44} /><span className="text-xs font-medium">Görsel yok</span></div>
                  )}
                  {indirimli && (
                    <span className="absolute top-3 left-3 bg-rose-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow">%{disc(detail.eskiFiyat as number, detail.satisFiyat)} İNDİRİM</span>
                  )}
                  {tukenmis && (
                    <span className="absolute top-3 right-3 bg-slate-800 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">Tükendi</span>
                  )}
                </div>
                {imgs.length > 1 && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {imgs.map((src, i) => (
                      <button key={i} onClick={() => setDetailImg(i)} aria-label={`Görsel ${i + 1}`} className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition ${i === detailImg ? 'border-rose-600 ring-2 ring-rose-100' : 'border-slate-200 hover:border-rose-300'}`}><img src={src} onError={onImgErr} alt="" className="w-full h-full object-cover" /></button>
                    ))}
                  </div>
                )}
              </div>
              {/* SAĞ: bilgiler */}
              <div className="flex flex-col p-6 md:p-8">
                {detail.marka && <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{detail.marka}</span>}
                <h2 className="text-2xl font-bold text-slate-900 leading-snug mt-1">{detail.ad || ''}</h2>

                <div className="flex items-center flex-wrap gap-2 mt-4">
                  {indirimli && <span className="text-base text-slate-400 line-through">{fmt(detail.eskiFiyat as number)}</span>}
                  <span className="text-3xl font-extrabold text-rose-600">{fmt(detail.satisFiyat)}</span>
                  {indirimli && <span className="bg-rose-50 text-rose-600 text-xs font-bold px-2 py-1 rounded-full">%{disc(detail.eskiFiyat as number, detail.satisFiyat)} İNDİRİM</span>}
                </div>

                {hasVar && (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-slate-700 mb-2.5">{vars[0]?.ad || 'Seçenek'} Seçin</p>
                    <div className="flex flex-wrap gap-2">
                      {vars.map((v, i) => {
                        const tukendi = (v.stok || 0) <= 0;
                        const secili = detailVar === v.deger;
                        return (
                          <button key={i} disabled={tukendi} onClick={() => setDetailVar(v.deger)} className={`px-4 py-2 rounded-lg border text-sm font-medium transition inline-flex items-center gap-1.5 ${secili ? 'border-rose-600 bg-rose-600 text-white shadow-sm' : 'border-slate-200 text-slate-700 hover:border-rose-300'} ${tukendi ? 'opacity-40 line-through cursor-not-allowed' : ''}`}>
                            {secili && <Check size={14} />}{v.deger}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    disabled={tukenmis}
                    onClick={() => {
                      if (hasVar && !detailVar) { toast.error('Lütfen bir seçenek seçin'); return; }
                      if (detailVar) setVarSel((m) => ({ ...m, [detail.id]: detailVar }));
                      add(detail.id, detailVar || undefined);
                      setDetail(null);
                    }}
                    className={`flex-1 py-3.5 rounded-xl font-semibold inline-flex items-center justify-center gap-2 transition ${tukenmis ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200'}`}
                  >
                    <ShoppingBag size={18} /> {tukenmis ? 'Tükendi' : 'Sepete Ekle'}
                  </button>
                  <button onClick={() => setFav((f) => ({ ...f, [detail.id]: !f[detail.id] }))} aria-label="Favori" className="w-12 border border-slate-200 rounded-xl flex items-center justify-center hover:border-rose-300 transition"><Heart size={20} className={fav[detail.id] ? 'fill-rose-500 text-rose-500' : 'text-slate-400'} /></button>
                </div>

                {/* Güven / bilgi rozetleri */}
                <div className="mt-5 grid gap-2.5">
                  {kargoBadge.map(([Ic, t, s], i) => (
                    <div key={i} className="flex items-center gap-2.5 text-sm">
                      <span className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0"><Ic size={16} /></span>
                      <span className="text-slate-700 font-medium">{t}</span>
                      <span className="text-slate-400 text-xs">· {s}</span>
                    </div>
                  ))}
                </div>

                {/* Açıklama (gerçek veya jenerik fallback) */}
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <p className="text-sm font-semibold text-slate-700 mb-2">Ürün Açıklaması</p>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{aciklamaMetni}</p>
                </div>

                {(katAd || kod) && (
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    {katAd && <span>Kategori: <span className="font-medium text-slate-500">{katAd}</span></span>}
                    {kod && <span>Ürün Kodu: <span className="font-medium text-slate-500">{kod}</span></span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Menu drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex bg-slate-900/50 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)}>
          <div className="w-[85%] max-w-sm bg-white h-full flex flex-col shadow-2xl animate-[slideIn_.25s_ease-out]" onClick={(e) => e.stopPropagation()}>
            {/* Üst: logo + kapat */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <span className="font-extrabold text-xl tracking-tight text-rose-600">{data.logoText || data.name}</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Kapat" className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition">
                <X size={20} />
              </button>
            </div>

            {/* Kategori linkleri */}
            <div className="flex-1 overflow-y-auto px-3 py-4">
              {/* Ust menu linkleri (menuLinks) + girintili alt menuler */}
              {menuLinks.length > 0 && (
                <>
                  <p className="px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Keşfet</p>
                  {menuLinks.map((m: any, i: number) => {
                    const aktif = menuAktif(m);
                    const kids: any[] = Array.isArray(m.children) ? m.children : [];
                    return (
                      <div key={'ml' + i}>
                        <button
                          onClick={() => handleMenuLink(m)}
                          className={`group flex items-center justify-between w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${aktif ? 'bg-rose-50 text-rose-700' : 'text-slate-700 hover:bg-slate-50'}`}
                        >
                          {m.label}
                          <ChevronRight size={16} className={`${aktif ? 'text-rose-500' : 'text-slate-300 group-hover:text-rose-400'} transition-colors`} />
                        </button>
                        {kids.length > 0 && (
                          <div className="ml-3 pl-2 border-l border-slate-100">
                            {kids.map((c: any, ci: number) => {
                              const ca = menuAktif(c);
                              return (
                                <button
                                  key={'ch' + ci}
                                  onClick={() => handleMenuLink(c)}
                                  className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${ca ? 'bg-rose-50 text-rose-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                  {c.label}
                                  <ChevronRight size={14} className={`${ca ? 'text-rose-500' : 'text-slate-300'} transition-colors`} />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="my-3 border-t border-slate-100" />
                </>
              )}
              <p className="px-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Kategoriler</p>
              <button
                onClick={() => { setKat(''); setMenuOpen(false); scrollToProducts(); }}
                className={`group flex items-center justify-between w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${!kat ? 'bg-rose-50 text-rose-700' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                Tüm Ürünler
                <ChevronRight size={16} className={`${!kat ? 'text-rose-500' : 'text-slate-300 group-hover:text-rose-400'} transition-colors`} />
              </button>
              {data.categories?.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => { setKat(c.id); setMenuOpen(false); scrollToProducts(); }}
                  className={`group flex items-center justify-between w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${kat === c.id ? 'bg-rose-50 text-rose-700' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  {c.ad}
                  <ChevronRight size={16} className={`${kat === c.id ? 'text-rose-500' : 'text-slate-300 group-hover:text-rose-400'} transition-colors`} />
                </button>
              ))}
            </div>

            {/* Alt: kısayollar + kurumsal linkler */}
            <div className="border-t border-slate-100 px-3 py-4 space-y-1">
              <button onClick={() => { setMenuOpen(false); setCartOpen(true); }} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <ShoppingBag size={18} className="text-rose-500" /> Sepetim{count > 0 && <span className="ml-auto text-xs font-bold bg-rose-600 text-white rounded-full px-2 py-0.5">{count}</span>}
              </button>
              <div className="grid grid-cols-2 gap-1 pt-1">
                {[
                  ['/hakkimizda', 'Hakkımızda'],
                  ['/iletisim', 'İletişim'],
                  ['/iade-iptal', 'İade & Değişim'],
                  ['/gizlilik', 'Gizlilik'],
                ].map(([href, label]) => (
                  <a key={href} href={href} className="px-3 py-2 text-xs text-slate-500 hover:text-rose-600 transition-colors">{label}</a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobil filtre drawer */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-[2px] lg:hidden" onClick={() => setFilterOpen(false)}>
          <div className="w-[85%] max-w-sm bg-white h-full flex flex-col shadow-2xl animate-[slidein_.25s_ease]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-[#111] inline-flex items-center gap-2"><SlidersHorizontal size={18} style={{ color: GOLD }} /> Filtreler</h2>
              <button onClick={() => setFilterOpen(false)} aria-label="Kapat" className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-[#0a0a0a] hover:bg-slate-100 transition"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
              <FilterBody
                q={qInput} setQ={setQInput}
                cats={data.categories} kat={kat} setKat={setKat}
                markalar={markalar} fMarka={fMarka} setFMarka={setFMarka}
                cinsiyetler={cinsiyetler} fCinsiyet={fCinsiyet} setFCinsiyet={setFCinsiyet}
                GENDER_LBL={GENDER_LBL}
                bedenler={bedenler} fBeden={fBeden} setFBeden={setFBeden}
                fMin={fMin} setFMin={setFMin} fMax={fMax} setFMax={setFMax}
              />
            </div>
            <div className="border-t border-slate-100 px-5 py-4 flex gap-3">
              <button onClick={temizleFiltre} className="flex-1 border border-slate-300 text-[#111] py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:border-[#C9A227] hover:text-[#C9A227] transition-colors"><RefreshCcw size={15} /> Temizle</button>
              <button onClick={() => setFilterOpen(false)} className="flex-1 bg-[#0a0a0a] hover:bg-[#C9A227] text-white py-3 rounded-xl text-sm font-semibold transition-colors">{tumu.length} Ürünü Göster</button>
            </div>
          </div>
        </div>
      )}

      {/* PayTR odeme iframe */}
      {paytrUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh] border border-slate-200">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-[#0a0a0a]">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(201,162,39,0.15)' }}><Lock size={18} style={{ color: GOLD }} /></div>
                <div className="leading-tight">
                  <span className="block font-bold text-white text-sm">Güvenli Ödeme</span>
                  <span className="block text-[11px] text-white/50">PayTR · 256-bit SSL & 3D Secure</span>
                </div>
              </div>
              <button onClick={() => { setPaytrUrl(''); setCart({}); setDone({ toplam: araToplam }); }} aria-label="Kapat" className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition"><X size={20} /></button>
            </div>
            <iframe src={paytrUrl} className="flex-1 w-full bg-slate-50" frameBorder={0} title="PayTR" />
          </div>
        </div>
      )}
    </div>
  );
}
