import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ShoppingBag, Star, X, ImagePlus, Send, Truck, ShieldCheck, RotateCcw, Heart, Search, User, ChevronLeft, ChevronRight, Menu, Zap, Plus, ChevronDown } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';
import toast from 'react-hot-toast';

const GOLD = '#C9A227';
const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const disc = (eski?: number, satis?: number) => (eski && satis && eski > satis) ? Math.round(((eski - satis) / eski) * 100) : 0;

// Meta Pixel guvenli guard: window.fbq varsa cagirir, yoksa/hatada sessiz gecer.
const fbqTrack = (ev: string, data?: Record<string, any>) => {
  try { const f = (window as any).fbq; if (typeof f === 'function') f('track', ev, data); } catch { /* sessiz */ }
};

// StoreHeader ile ayni kategori nav eslemesi (gorsel + davranis tutarliligi)
const katKey = (it: any) => (it.type === 'kategori' ? `kat:${it.value}` : it.type === 'cinsiyet' ? `cins:${it.value}` : it.value);
const katToPath = (v: string) => {
  if (!v) return '/';
  if (v.startsWith('kat:')) return `/kategori/${v.slice(4)}`;
  if (v.startsWith('cins:')) return `/cinsiyet/${v.slice(5)}`;
  return (({ indirim: '/fiyati-dusenler', coksatan: '/one-cikanlar', yeni: '/yeni-gelenler', sonsans: '/son-sans', tumu: '/' } as Record<string, string>)[v]) ?? '/';
};

function Stars({ value, size = 14, onPick }: { value: number; size?: number; onPick?: (n: number) => void }) {
  return <span className="inline-flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} onClick={onPick ? () => onPick(n) : undefined} className={`${n <= Math.round(value) ? 'fill-[#C9A227] text-[#C9A227]' : 'text-slate-300'} ${onPick ? 'cursor-pointer' : ''}`} />)}</span>;
}

export default function UrunDetayPublic() {
  const params = useParams();
  const { id } = params;
  const nav = useNavigate();
  const [slug, setSlug] = useState<string | undefined>(params.slug);
  const [storeName, setStoreName] = useState('');
  const [storeTopMenu, setStoreTopMenu] = useState<any[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [shopLogin, setShopLogin] = useState(false);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [imgIdx, setImgIdx] = useState(0);
  const [varSel, setVarSel] = useState('');
  const [adet, setAdet] = useState(1);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [busy] = useState(false);
  const [fav, setFav] = useState(false);
  // yorum formu
  const [ypuan, setYpuan] = useState(5);
  const [yyorum, setYyorum] = useState('');
  const [ygorsel, setYgorsel] = useState('');
  const [ygonder, setYgonder] = useState(false);

  // slug yoksa (/urun/:id) birincil mağaza slug'ını çöz
  useEffect(() => { api.get('/public/primary-store').then((r) => { if (!slug) setSlug(r.data?.slug || ''); setStoreName(r.data?.magaza || ''); setStoreTopMenu(Array.isArray(r.data?.topMenu) ? r.data.topMenu : []); }).catch(() => { if (!slug) setSlug(''); }); /* eslint-disable-next-line */ }, []);
  useEffect(() => { try { const c = JSON.parse(localStorage.getItem('wt_cart') || '{}'); setCartCount(Object.values(c).reduce((s: number, x: any) => s + (x.adet || 0), 0)); } catch { /* */ } }, []);
  // Musteri girisi var mi? (shopToken_<slug>)
  useEffect(() => { if (slug) setShopLogin(!!localStorage.getItem('shopToken_' + slug)); }, [slug]);
  const load = () => { if (!slug) return; const tok = localStorage.getItem('shopToken_' + slug); const authH = tok ? { Authorization: 'Bearer ' + tok } : {}; api.get(`/public/store/${slug}/urun/${id}`, { headers: authH }).then((r) => { setD(r.data); }).catch((e) => setErr(apiErrorMessage(e))); api.post(`/public/store/${slug}/urun/${id}/view`, {}, { headers: { ...authH } }).catch(() => {}); };
  useEffect(() => { load(); window.scrollTo(0, 0); /* eslint-disable-next-line */ }, [slug, id]);

  // ── Canlı ziyaretçi takibi: ürün ekranı ──
  const sessionId = useMemo(() => { let s = localStorage.getItem('wt_sess'); if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('wt_sess', s); } return s; }, []);
  const deviceType = useMemo(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'mobil' : 'web'), []);
  useEffect(() => {
    const ad = d?.urun?.ad;
    if (!slug || !ad) return;
    const send = (type?: string) => api.post(`/public/store/${slug}/track`, { sessionId, screen: 'product', label: ad, type, device: deviceType }).catch(() => {});
    send('product');
    const t = setInterval(() => send(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, d?.urun?.ad]);

  const p = d?.urun;
  const fiyat = useMemo(() => { if (!p) return 0; let f = p.satisFiyat; if (varSel) { const v = (p.variations || []).find((x: any) => x.deger === varSel); if (v) f += v.ekFiyat || 0; } return f; }, [p, varSel]);

  // ── Meta Pixel: ViewContent (urun sayfasi acilinca, urun basina bir kez) ──
  const vcRef = useRef<string | null>(null);
  useEffect(() => {
    if (!p || !p.id || vcRef.current === p.id) return;
    vcRef.current = p.id;
    fbqTrack('ViewContent', { content_ids: [p.id], content_name: p.ad, value: p.satisFiyat, currency: 'TRY' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  // ── wt_cart stok kirpma (bu urun) ──────────────────────────────────────────
  // Urun detayi (stok bilgisi) gelince, wt_cart'ta BU urune ait kalemleri gercek
  // varyasyon/urun stoguna kirp (stok 0 -> kalemi cikar). Diger urunlerin stogu
  // burada bilinmedigi icin onlara DOKUNMA (guvenli). Rozet kirpik toplami gosterir.
  const trimRef = useRef(false);
  useEffect(() => {
    if (!p || trimRef.current) return;
    trimRef.current = true;
    try {
      const cart = JSON.parse(localStorage.getItem('wt_cart') || '{}');
      const vars: any[] = p.variations || [];
      const stokOf = (vary: string): number => {
        if (vars.length > 0) {
          if (!vary) return vars.reduce((s: number, v: any) => s + Math.max(0, v.stok || 0), 0);
          const v = vars.find((x: any) => x.deger === vary);
          return Math.max(0, v?.stok || 0);
        }
        return Math.max(0, p.stokAdeti || 0);
      };
      let changed = false;
      for (const key of Object.keys(cart)) {
        const it = cart[key];
        if (!it || it.productId !== p.id) continue; // sadece bu urun
        const stok = stokOf(it.varyasyon || '');
        const istenen = Math.max(0, Number(it.adet) || 0);
        const kirpik = Math.min(istenen, stok);
        if (kirpik <= 0) { delete cart[key]; changed = true; }
        else if (kirpik < istenen) { cart[key] = { ...it, adet: kirpik }; changed = true; }
      }
      if (changed) {
        localStorage.setItem('wt_cart', JSON.stringify(cart));
        toast('Sepet stok durumuna göre güncellendi');
      }
      setCartCount(Object.values(cart).reduce((s: number, x: any) => s + (x.adet || 0), 0));
    } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  // Secili varyasyon (yoksa urun) icin toplam stok adedi
  const stokAdedi = useMemo(() => {
    if (!p) return 0;
    if ((p.variations || []).length > 0) {
      if (!varSel) return 0;
      const v = (p.variations || []).find((x: any) => x.deger === varSel);
      return Math.max(0, v?.stok || 0);
    }
    return Math.max(0, p.stokAdeti || 0);
  }, [p, varSel]);

  // wt_cart'ta bu urun/varyasyon icin halihazirda bulunan adet
  const sepettekiAdet = useMemo(() => {
    if (!p) return 0;
    try {
      const cart = JSON.parse(localStorage.getItem('wt_cart') || '{}');
      return cart[`${p.id}:${varSel || ''}`]?.adet || 0;
    } catch { return 0; }
    // cartCount degisince yeniden hesapla (sepete ekleme sonrasi)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, varSel, cartCount]);

  // Bu turda secilebilecek maksimum ek adet (stok - sepetteki)
  const kalanEklenebilir = Math.max(0, stokAdedi - sepettekiAdet);
  // Varyasyonlu urun ama henuz beden/varyasyon secilmemis mi? (stok bilinemez -> '+' pasif)
  const varyasyonluSecimYok = !!p && (p.variations || []).length > 0 && !varSel;

  const sepeteEkle = () => {
    if (!p) return;
    if ((p.variations || []).length > 0 && !varSel) { toast.error('Lütfen beden/varyasyon seçin'); return; }
    if (stokAdedi <= 0) { toast.error('Tükendi'); return; }
    if (sepettekiAdet + adet > stokAdedi) {
      toast.error(`Yetersiz stok, en fazla ${stokAdedi} adet` + (sepettekiAdet > 0 ? ` (sepetinizde ${sepettekiAdet} adet var)` : ''));
      return;
    }
    try {
      const cart = JSON.parse(localStorage.getItem('wt_cart') || '{}');
      const key = `${p.id}:${varSel || ''}`;
      cart[key] = { productId: p.id, varyasyon: varSel || null, ad: p.ad, fiyat, img: (p.images || [])[0] || '', adet: (cart[key]?.adet || 0) + adet };
      localStorage.setItem('wt_cart', JSON.stringify(cart));
      // Sayfada kal: sepet rozetini guncelle + bildirim goster (ana sayfaya yonlendirme YOK)
      setCartCount(Object.values(cart).reduce((s: number, x: any) => s + (x.adet || 0), 0));
      setAdet(1);
      toast.success('Sepete eklendi');
      fbqTrack('AddToCart', { content_ids: [p.id], content_name: p.ad, value: fiyat * adet, currency: 'TRY', contents: [{ id: p.id, quantity: adet }] });
    } catch { toast.error('Sepete eklenemedi'); }
  };

  const pickImg = (file: File) => { const reader = new FileReader(); reader.onload = () => { const im = new Image(); im.onload = () => { let { width, height } = im; const max = 900; if (width > max || height > max) { if (width > height) { height = Math.round(height * max / width); width = max; } else { width = Math.round(width * max / height); height = max; } } const c = document.createElement('canvas'); c.width = width; c.height = height; c.getContext('2d')!.drawImage(im, 0, 0, width, height); setYgorsel(c.toDataURL('image/jpeg', 0.7)); }; im.src = reader.result as string; }; reader.readAsDataURL(file); };
  const yorumGonder = async () => {
    setYgonder(true);
    try {
      const tok = localStorage.getItem('shopToken_' + slug);
      const authH = tok ? { Authorization: 'Bearer ' + tok } : {};
      await api.post(`/public/store/${slug}/urun/${id}/yorum`, { puan: ypuan, yorum: yyorum, gorsel: ygorsel || undefined }, { headers: authH });
      setYyorum(''); setYgorsel(''); setYpuan(5); load();
    }
    catch (e) { alert(apiErrorMessage(e)); } finally { setYgonder(false); }
  };

  // Kategori nav: topMenu varsa ondan, yoksa mockup statik seti (ana sayfa rotalarina yonlendirir)
  const STATIC_NAV = [
    { key: 'tumu', label: 'TÜM ÜRÜNLER' },
    { key: 'yeni', label: 'YENİ GELENLER' },
    { key: 'indirim', label: 'FİYATI DÜŞENLER' },
    { key: 'coksatan', label: 'ÖNE ÇIKANLAR' },
    { key: 'sonsans', label: 'SON ŞANS' },
  ];
  const menu = (Array.isArray(storeTopMenu) && storeTopMenu.length)
    ? storeTopMenu.map((m: any) => ({ key: katKey(m), label: (m.label || '').toString(), children: m.children || [] }))
    : STATIC_NAV.map((m) => ({ ...m, children: [] as any[] }));

  // Basit header render (StoreHeader yerine mockup paletiyle birebir)
  const Header = () => (
    <>
      {/* (A) Üst duyuru barı */}
      <div className="bg-[#0a0a0a] text-white text-[11px] sm:text-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-9 sm:h-10 flex items-center gap-4 overflow-x-auto whitespace-nowrap">
          <span className="flex items-center gap-1.5 shrink-0">🚚 7.500 TL ve üzeri alışverişlerde ücretsiz kargo!</span>
          <span className="hidden md:inline text-white/25">|</span>
          <span className="hidden md:flex items-center gap-1.5 shrink-0 mx-auto">🏅 İLK SİPARİŞE ÖZEL %20 İNDİRİM</span>
          <span className="hidden md:inline text-white/25">|</span>
          <span className="hidden lg:inline shrink-0 ml-auto">Vade farksız 3 taksit fırsatı!</span>
        </div>
      </div>

      {/* (B) Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-3 sm:gap-5">
          <button onClick={() => nav('/')} className="text-[#111] lg:hidden shrink-0"><Menu size={26} /></button>
          <div className="flex-1 lg:flex-none text-center lg:text-left">
            <Link to="/" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }} className="font-bold text-3xl sm:text-4xl tracking-tight text-[#0a0a0a] whitespace-nowrap">{storeName || 'DiLjar'}</Link>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value || ''; nav(v ? `/?ara=${encodeURIComponent(v)}` : '/'); }} className="hidden lg:flex flex-1 relative max-w-2xl">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="q" placeholder="Ürün, marka veya kategori ara..." className="w-full pl-11 pr-24 py-3 border border-slate-300 rounded-full text-sm outline-none focus:border-[#0a0a0a]" />
            <button type="submit" className="absolute right-1.5 top-1.5 bottom-1.5 px-6 bg-[#0a0a0a] hover:bg-[#C9A227] text-white text-sm font-bold rounded-full transition-colors">ARA</button>
          </form>
          <div className="flex items-center gap-4 sm:gap-6 shrink-0 text-[#111]">
            <button onClick={() => nav(shopLogin ? '/hesabim' : '/giris')} className="hidden sm:flex flex-col items-center gap-0.5 hover:text-[#C9A227] transition-colors"><User size={22} /><span className="text-[11px] font-medium">{shopLogin ? 'Hesabım' : 'Giriş Yap'}</span></button>
            <button onClick={() => nav('/?cart=1')} className="relative flex flex-col items-center gap-0.5 hover:text-[#C9A227] transition-colors">
              <div className="relative"><ShoppingBag size={22} />{cartCount > 0 && <span className="absolute -top-2 -right-2.5 bg-[#C9A227] text-white text-[10px] min-w-4 h-4 px-1 rounded-full flex items-center justify-center font-bold">{cartCount}</span>}</div>
              <span className="hidden sm:block text-[11px] font-medium">Sepetim ({cartCount})</span>
            </button>
          </div>
        </div>
        {/* Arama (mobil) */}
        <form onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('qm') as HTMLInputElement)?.value || ''; nav(v ? `/?ara=${encodeURIComponent(v)}` : '/'); }} className="lg:hidden px-3 sm:px-4 pb-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input name="qm" placeholder="Ürün, marka veya kategori ara..." className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-full text-sm outline-none focus:border-[#0a0a0a]" />
          </div>
          <button type="submit" className="px-6 bg-[#0a0a0a] text-white text-sm font-bold rounded-full">ARA</button>
        </form>
      </header>

      {/* (C) Kategori nav barı */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 flex items-center gap-2 sm:gap-4">
          <button onClick={() => nav('/')} className="shrink-0 my-2.5 px-3 sm:px-4 py-2 bg-[#0a0a0a] hover:bg-[#C9A227] text-white text-xs sm:text-sm font-bold rounded-lg inline-flex items-center gap-2 tracking-wide transition-colors">
            <Menu size={16} /> <span className="hidden sm:inline">TÜM KATEGORİLER</span><span className="sm:hidden">KATEGORİLER</span>
          </button>
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-2.5 flex-1">
            {menu.map((m: any, i: number) => (
              <div key={i} className="relative group shrink-0">
                <button onClick={() => nav(katToPath(m.key))} className="px-2.5 sm:px-3 py-1.5 text-[13px] sm:text-sm font-bold rounded-md whitespace-nowrap tracking-wide text-[#111] hover:text-[#C9A227] transition-colors inline-flex items-center gap-1">{m.label}{(m.children || []).length > 0 && <ChevronDown size={13} />}</button>
                {(m.children || []).length > 0 && (
                  <div className="absolute left-0 top-full pt-1 hidden group-hover:block z-40">
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-xl py-1.5 min-w-[190px]">
                      {m.children.map((c: any, ci: number) => (
                        <button key={ci} onClick={() => nav(katToPath(katKey(c)))} className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:text-[#C9A227] hover:bg-slate-50 rounded-lg">{c.label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </nav>
          <button onClick={() => nav('/fiyati-dusenler')} className="shrink-0 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap tracking-wide hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
            <Zap size={16} className="fill-current" /> KAMPANYALAR
          </button>
        </div>
      </div>
    </>
  );

  if (err) return <div className="min-h-screen bg-white text-[#111]"><Header /><div className="flex items-center justify-center text-slate-500 p-10">{err}</div></div>;
  if (!d) return <div className="min-h-screen bg-white text-[#111]"><Header /><div className="flex items-center justify-center py-24"><span className="w-8 h-8 border-2 border-slate-200 border-t-[#0a0a0a] rounded-full animate-spin" /></div></div>;

  const dd = disc(p.eskiFiyat, p.satisFiyat);
  const imgs: string[] = p.images || [];
  const hasRating = (d.puanOrt || 0) > 0 && (d.yorumSayi || 0) > 0;
  const stokVar = (p.stokAdeti || 0) > 0 || (p.variations || []).some((v: any) => (v.stok || 0) > 0);

  const SimilarCard = ({ b }: { b: any }) => {
    const bd = disc(b.eskiFiyat, b.satisFiyat);
    return (
      <div className="bg-white rounded-xl border border-slate-200/70 hover:border-slate-300 hover:shadow-lg overflow-hidden flex flex-col group transition-all">
        <div className="relative aspect-square bg-slate-100 cursor-pointer overflow-hidden" onClick={() => nav('/urun/' + b.id)}>
          {(b.images || [])[0] ? <img src={b.images[0]} alt={b.ad || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">Görsel yok</div>}
          {bd > 0 && <span className="absolute top-2.5 left-2.5 bg-[#0a0a0a] text-white text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wide">%{bd} İNDİRİM</span>}
        </div>
        <div className="p-3.5 flex flex-col flex-1">
          {b.marka && <span className="text-[11px] text-slate-400 uppercase tracking-wide">{b.marka}</span>}
          <h3 className="text-sm font-semibold text-[#111] line-clamp-1 cursor-pointer hover:text-[#C9A227] transition-colors" onClick={() => nav('/urun/' + b.id)}>{b.ad || ''}</h3>
          <div className="mt-auto pt-2.5 flex items-center gap-2">
            <span className="font-extrabold text-[#111] text-[15px]">{fmt(b.satisFiyat)}</span>
            {bd > 0 && <span className="text-xs text-slate-400 line-through">{fmt(b.eskiFiyat)}</span>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <Header />

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-5 sm:py-8">
        {/* breadcrumb */}
        <div className="text-xs text-slate-400 mb-4 flex items-center gap-1.5 flex-wrap">
          <Link to="/" className="hover:text-[#C9A227]">Anasayfa</Link>
          {p.kategoriAd && <><span>/</span><span className="text-slate-500">{p.kategoriAd}</span></>}
          <span>/</span><span className="text-[#111] font-medium truncate max-w-[60vw]">{p.ad}</span>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-10">
          {/* SOL: Galeri */}
          <div>
            <div className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/70 aspect-square cursor-zoom-in group" onClick={() => imgs[imgIdx] && setLightbox(imgs[imgIdx])}>
              {imgs[imgIdx] ? <img src={imgs[imgIdx]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-slate-300">Görsel yok</div>}
              {dd > 0 && <span className="absolute top-3 left-3 text-[11px] font-bold bg-[#0a0a0a] text-white px-2.5 py-1 rounded-md tracking-wide">%{dd} İNDİRİM</span>}
              {imgs.length > 1 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setImgIdx((imgIdx - 1 + imgs.length) % imgs.length); }} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/85 hover:bg-white text-[#0a0a0a] rounded-full flex items-center justify-center shadow-md"><ChevronLeft size={18} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setImgIdx((imgIdx + 1) % imgs.length); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/85 hover:bg-white text-[#0a0a0a] rounded-full flex items-center justify-center shadow-md"><ChevronRight size={18} /></button>
                </>
              )}
            </div>
            {imgs.length > 1 && <div className="flex gap-2 mt-3 overflow-x-auto">{imgs.map((im, i) => <button key={i} onClick={() => setImgIdx(i)} className={`w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${i === imgIdx ? 'border-[#0a0a0a]' : 'border-transparent hover:border-slate-300'}`}><img src={im} className="w-full h-full object-cover" /></button>)}</div>}
          </div>

          {/* SAĞ: Bilgi */}
          <div>
            {p.marka && <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{p.marka}</p>}
            <h1 className="text-2xl sm:text-3xl font-black text-[#111] leading-tight mt-1">{p.ad}</h1>

            {hasRating && (
              <div className="flex items-center gap-2 mt-2">
                <Stars value={d.puanOrt} size={16} />
                <span className="text-sm font-semibold text-slate-700">{d.puanOrt}</span>
                <span className="text-sm text-slate-400">({d.yorumSayi} değerlendirme)</span>
              </div>
            )}

            <div className="flex items-baseline gap-3 mt-4">
              <span className="text-3xl sm:text-4xl font-black text-[#0a0a0a]">{fmt(fiyat)}</span>
              {dd > 0 && <span className="text-slate-400 line-through text-lg">{fmt(p.eskiFiyat)}</span>}
              {dd > 0 && <span className="text-[11px] font-bold text-white px-2 py-1 rounded-md tracking-wide" style={{ backgroundColor: GOLD }}>%{dd} İNDİRİM</span>}
            </div>

            <p className={`text-sm mt-2 flex items-center gap-1.5 font-medium ${stokVar ? 'text-emerald-600' : 'text-red-500'}`}><span className={`w-2 h-2 rounded-full ${stokVar ? 'bg-emerald-500' : 'bg-red-500'}`} /> {stokVar ? 'Stokta var' : 'Stok yok'}</p>

            {/* Varyasyon / Beden */}
            {(p.variations || []).length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-bold text-[#111] mb-2 tracking-wide">BEDEN / VARYASYON</p>
                <div className="flex flex-wrap gap-2">
                  {p.variations.map((v: any, i: number) => {
                    const out = (v.stok || 0) <= 0;
                    const sel = varSel === v.deger;
                    return (
                      <button key={(v.deger || '') + i} disabled={out} onClick={() => { setVarSel(v.deger); setAdet(1); }} title={out ? `${v.deger} — tükendi` : v.deger}
                        className={`relative overflow-hidden min-w-[46px] px-4 py-2.5 rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${sel ? 'bg-[#0a0a0a] text-white border-[#0a0a0a]' : out ? 'border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed' : 'border-slate-300 text-[#111] hover:border-[#0a0a0a]'}`}>
                        {v.deger}
                        {out && <span className="absolute left-1/2 top-1/2 w-[150%] h-[1.5px] bg-slate-300 -translate-x-1/2 -translate-y-1/2 -rotate-[20deg] pointer-events-none" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Adet + Sepete Ekle + Favori */}
            <div className="flex items-center gap-3 mt-6">
              <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden">
                <button onClick={() => setAdet(Math.max(1, adet - 1))} className="px-4 py-3 text-lg hover:bg-slate-50">−</button>
                <span className="px-3 text-sm font-bold w-9 text-center">{adet}</span>
                <button onClick={() => { if (adet >= kalanEklenebilir) { toast.error(kalanEklenebilir <= 0 ? (varyasyonluSecimYok ? 'Önce beden/varyasyon seçin' : 'Yetersiz stok') : `Yetersiz stok, en fazla ${stokAdedi} adet`); return; } setAdet(adet + 1); }} disabled={adet >= kalanEklenebilir} className="px-4 py-3 text-lg hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent">+</button>
              </div>
              <button onClick={sepeteEkle} disabled={busy || !stokVar} className="flex-1 bg-[#0a0a0a] hover:bg-[#C9A227] text-white py-3.5 rounded-xl font-bold tracking-wide disabled:opacity-40 disabled:hover:bg-[#0a0a0a] inline-flex items-center justify-center gap-2 transition-colors"><ShoppingBag size={19} /> {busy ? 'HAZIRLANIYOR...' : 'SEPETE EKLE'}</button>
              <button onClick={() => setFav((f) => !f)} title="Favorilere ekle" className="w-[52px] h-[52px] shrink-0 border border-slate-300 rounded-xl flex items-center justify-center hover:border-[#C9A227] transition-colors">
                <Heart size={22} className={fav ? 'fill-[#C9A227] text-[#C9A227]' : 'text-slate-500'} />
              </button>
            </div>

            {/* Güven rozetleri */}
            <div className="grid grid-cols-3 gap-2.5 mt-6">
              {[[Truck, 'Ücretsiz Kargo', '4.000 TL ve üzeri alışverişlerde'], [RotateCcw, 'Kolay İade', ''], [ShieldCheck, 'Güvenli Ödeme', '']].map(([Ic, t, sub]: any, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200/70 py-3 px-1.5 text-center">
                  <Ic size={20} className="mx-auto text-[#0a0a0a]" />
                  <p className="text-[11px] font-semibold text-slate-600 mt-1.5">{t}</p>
                  {sub && <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Ürün kodu / kategori */}
            <div className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-500 space-y-1">
              {p.barkod && <p><span className="text-slate-400">Ürün Kodu:</span> <span className="text-[#111] font-medium">{p.barkod}</span></p>}
              {p.kategoriAd && <p><span className="text-slate-400">Kategori:</span> <span className="text-[#111] font-medium">{p.kategoriAd}</span></p>}
            </div>
          </div>
        </div>

        {/* Açıklama */}
        {p.aciklama && (
          <div className="mt-10 bg-white rounded-2xl border border-slate-200/70 p-5 sm:p-6">
            <h2 className="text-base sm:text-lg font-black text-[#111] uppercase tracking-tight border-b-2 border-[#0a0a0a] pb-2 inline-block mb-4">Ürün Açıklaması</h2>
            <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{p.aciklama}</p>
          </div>
        )}

        {/* Değerlendirmeler */}
        <div className="mt-8 bg-white rounded-2xl border border-slate-200/70 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <h2 className="text-base sm:text-lg font-black text-[#111] uppercase tracking-tight">Değerlendirmeler & Yorumlar</h2>
            {hasRating && <div className="flex items-center gap-2"><Stars value={d.puanOrt} size={16} /><span className="text-sm text-slate-500">{d.puanOrt} / 5 · {d.yorumSayi} yorum</span></div>}
          </div>

          {/* Yorum yaz — yalnızca ürünü satın alan üyeler */}
          {d.satinAldi ? (
            <div className="bg-slate-50 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-bold text-[#111]">{d.zatenYorumladi ? 'Değerlendirmeni güncelle' : 'Bu ürünü değerlendir'}</p>
                <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Onaylı Alışveriş</span>
              </div>
              <div className="flex items-center gap-3 mb-2"><Stars value={ypuan} size={22} onPick={setYpuan} /><span className="text-xs text-slate-400">Puanınız: {ypuan}/5</span></div>
              <textarea value={yyorum} onChange={(e) => setYyorum(e.target.value)} rows={3} placeholder="Ürün hakkında düşüncelerinizi paylaşın..." className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg outline-none focus:border-[#0a0a0a]" />
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <label className="inline-flex items-center gap-1.5 text-sm font-medium text-[#111] hover:text-[#C9A227] cursor-pointer"><ImagePlus size={18} /> Fotoğraf Ekle<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImg(f); }} /></label>
                {ygorsel && <div className="relative"><img src={ygorsel} className="w-12 h-12 rounded object-cover" /><button onClick={() => setYgorsel('')} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-700 text-white rounded-full text-[10px]">×</button></div>}
                <button onClick={yorumGonder} disabled={ygonder} className="ml-auto bg-[#0a0a0a] hover:bg-[#C9A227] text-white px-5 py-2.5 rounded-xl text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"><Send size={15} /> {d.zatenYorumladi ? 'GÜNCELLE' : 'GÖNDER'}</button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-4 mb-6 text-center">
              <p className="text-sm text-slate-500">
                {d.girisYapildi
                  ? 'Yalnızca bu ürünü satın alan üyeler değerlendirme yapabilir.'
                  : 'Değerlendirme yapabilmek için üye girişi yapmalı ve bu ürünü satın almış olmalısınız.'}
              </p>
              {!d.girisYapildi && <Link to="/" className="inline-block mt-2 text-sm font-bold text-[#C9A227]">Üye Girişi Yap</Link>}
            </div>
          )}

          {/* Yorum listesi */}
          <div className="space-y-4">
            {(d.yorumlar || []).length === 0 && <p className="text-sm text-slate-400 text-center py-6">Henüz değerlendirme yok. İlk yorumu siz yazın!</p>}
            {(d.yorumlar || []).map((y: any) => (
              <div key={y.id} className="border-b border-slate-100 pb-4 last:border-0">
                <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-full bg-[#0a0a0a] text-white flex items-center justify-center text-sm font-bold">{(y.ad || '?')[0].toUpperCase()}</div><div><p className="text-sm font-semibold text-[#111]">{y.ad}</p><div className="flex items-center gap-2"><Stars value={y.puan} size={12} /><span className="text-[11px] text-slate-400">{new Date(y.createdAt).toLocaleDateString('tr-TR')}</span></div></div></div>
                {y.yorum && <p className="text-sm text-slate-600 mt-2">{y.yorum}</p>}
                {y.gorsel && <img src={y.gorsel} onClick={() => setLightbox(y.gorsel)} className="w-20 h-20 rounded-lg object-cover mt-2 cursor-zoom-in" />}
              </div>
            ))}
          </div>
        </div>

        {/* Benzer ürünler */}
        {(d.benzer || []).length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl sm:text-2xl font-black text-[#111] uppercase tracking-tight mb-4">Benzer Ürünler</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {d.benzer.map((b: any) => <SimilarCard key={b.id} b={b} />)}
            </div>
          </div>
        )}
      </div>

      {/* Mobil sticky sepete-ekle barı */}
      <div className="lg:hidden sticky bottom-0 z-20 bg-white border-t border-slate-200 px-3 py-2.5 flex items-center gap-3">
        <div className="shrink-0">
          <p className="text-[11px] text-slate-400 leading-none">Fiyat</p>
          <p className="text-lg font-black text-[#0a0a0a] leading-tight">{fmt(fiyat)}</p>
        </div>
        <button onClick={sepeteEkle} disabled={busy || !stokVar} className="flex-1 bg-[#0a0a0a] hover:bg-[#C9A227] text-white py-3 rounded-xl font-bold tracking-wide disabled:opacity-40 inline-flex items-center justify-center gap-2 transition-colors"><ShoppingBag size={18} /> SEPETE EKLE</button>
        <button onClick={() => setFav((f) => !f)} className="w-[46px] h-[46px] shrink-0 border border-slate-300 rounded-xl flex items-center justify-center"><Heart size={20} className={fav ? 'fill-[#C9A227] text-[#C9A227]' : 'text-slate-500'} /></button>
      </div>

      {lightbox && <div className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(null)}><img src={lightbox} className="max-w-full max-h-full rounded-xl" /><button className="absolute top-5 right-5 text-white/80"><X size={28} /></button></div>}
    </div>
  );
}
