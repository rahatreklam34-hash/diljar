import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShoppingBag, Plus, Minus, X, Check, Search, User, Heart, Menu,
  ChevronLeft, ChevronRight, Tv, Sparkles, Zap, LayoutGrid, Flame, PackageSearch,
  Truck, ShieldCheck, Headphones,
} from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const disc = (eski: number, satis: number) => Math.round(((eski - satis) / eski) * 100);

interface P { id: string; ad: string; satisFiyat: number; eskiFiyat?: number | null; oneCikan?: boolean; images: string[] | null; marka?: string; kategoriId?: string; aciklama?: string; createdAt?: string; variations?: { ad: string; deger: string; stok: number }[] }

const TILES = [
  { icon: Tv, t: 'Yayın Özeti', s: 'Son yayın ürünleri' },
  { icon: Sparkles, t: 'Yeni Eklenenler', s: 'En yeni ürünler' },
  { icon: Zap, t: 'Fırsatlar', s: 'Kaçırılmayacak fırsatlar' },
  { icon: LayoutGrid, t: 'Kataloglar', s: 'Tüm koleksiyonlar' },
  { icon: Flame, t: 'Çok Satanlar', s: 'En çok tercih edilenler' },
  { icon: PackageSearch, t: 'Sipariş Sorgula', s: 'Siparişini takip et' },
];

export default function PublicStore() {
  const { slug } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [kat, setKat] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [fav, setFav] = useState<Record<string, boolean>>({});
  const [slide, setSlide] = useState(0);
  const [detail, setDetail] = useState<P | null>(null);
  const [detailImg, setDetailImg] = useState(0);
  const [detailVar, setDetailVar] = useState('');
  const [varSel, setVarSel] = useState<Record<string, string>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [paytrUrl, setPaytrUrl] = useState('');
  const [cust, setCust] = useState({ ad: '', telefon: '', email: '', adres: '', not: '' });
  const [discount, setDiscount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get(`/public/store/${slug}`).then((r) => setData(r.data)).catch((e) => setErr(apiErrorMessage(e))); }, [slug]);

  // Modal acikken arka plan kaydirmayi kilitle
  const anyModal = !!(detail || cartOpen || checkout || menuOpen || paytrUrl);
  useEffect(() => {
    document.body.style.overflow = anyModal ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [anyModal]);

  const slides = useMemo(() => {
    const sl = (data?.slides || []).filter((x: any) => x.title || x.image);
    if (sl.length) return sl;
    if (data?.hero?.title || data?.hero?.image) return [{ title: data.hero.title, subtitle: data.hero.subtitle, image: data.hero.image, cta: 'Alışverişe Başla' }];
    return [{ title: data?.name, subtitle: 'Premium ürünler', image: '', cta: 'Alışverişe Başla' }];
  }, [data]);
  useEffect(() => { if (slides.length < 2) return; const t = setInterval(() => setSlide((x) => (x + 1) % slides.length), 5000); return () => clearInterval(t); }, [slides.length]);

  const products: P[] = data?.products || [];
  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const match = (p: P) => (!kat || p.kategoriId === kat) && (!q || [p.ad, p.marka].some((f) => (f || '').toLowerCase().includes(q.toLowerCase())));
  const oneCikanlar = products.filter((p) => p.oneCikan && match(p));
  const yeniGelenler = [...products].filter(match).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 8);
  const indirimliler = products.filter((p) => p.eskiFiyat && p.eskiFiyat > p.satisFiyat && match(p));
  const tumu = products.filter(match);

  const cartItems = Object.entries(cart).map(([id, adet]) => ({ p: prodMap.get(id)!, adet })).filter((x) => x.p);
  const araToplam = cartItems.reduce((sm, x) => sm + x.p.satisFiyat * x.adet, 0);
  const count = Object.values(cart).reduce((sm, n) => sm + n, 0);
  const add = (id: string) => { setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 })); setCartOpen(true); };
  const sub = (id: string) => setCart((c) => { const n = (c[id] || 0) - 1; const copy = { ...c }; if (n <= 0) delete copy[id]; else copy[id] = n; return copy; });

  // Siparişi tamamla -> asistan sohbeti (sepet linki üzerinden)
  const tamamlaAsistan = async () => {
    if (cartItems.length === 0) return;
    setBusy(true);
    try {
      const items = Object.entries(cart).map(([productId, adet]) => ({ productId, adet, varyasyon: varSel[productId] || undefined }));
      const r = await api.post(`/public/store/${slug}/cart-order`, { items });
      window.location.href = `/sepet/${r.data.token}?chat=1`;
    } catch (e) { alert(apiErrorMessage(e)); setBusy(false); }
  };

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const items = Object.entries(cart).map(([productId, adet]) => ({ productId, adet, varyasyon: varSel[productId] || undefined }));
      const r = await api.post(`/public/store/${slug}/order`, { customer: cust, items, discountCode: discount || undefined });
      if (r.data.paytr && r.data.iframeUrl) { setPaytrUrl(r.data.iframeUrl); setCheckout(false); setCartOpen(false); return; }
      if (r.data.paytrError) { alert('Ödeme başlatılamadı: ' + r.data.paytrError + '\nSipariş kaydedildi.'); }
      setDone(r.data); setCart({}); setCheckout(false); setCartOpen(false);
    } catch (e) { alert(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 text-center">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><span className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" /></div>;

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><Check className="text-green-600" size={30} /></div>
        <h1 className="text-xl font-bold text-slate-800">Siparişiniz Alındı!</h1>
        <p className="text-slate-500 mt-2">Tutar: <strong>{fmt(done.toplam)}</strong></p>
        <p className="text-sm text-slate-400 mt-1">En kısa sürede sizinle iletişime geçilecektir.</p>
        <button onClick={() => setDone(null)} className="mt-6 bg-slate-900 text-white px-6 py-2.5 rounded-lg font-medium">Mağazaya Dön</button>
      </div>
    </div>
  );

  const ProductCard = ({ p, badge }: { p: P; badge?: boolean }) => (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden flex flex-col group">
      <div className="relative aspect-square bg-slate-50 cursor-pointer" onClick={() => { setDetail(p); setDetailImg(0); setDetailVar(''); }}>
        <img src={(p.images || [])[0] || ''} alt={p.ad} className="w-full h-full object-cover" />
        {badge && p.eskiFiyat && <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">-%{disc(p.eskiFiyat, p.satisFiyat)}</span>}
        <button onClick={(e) => { e.stopPropagation(); setFav((f) => ({ ...f, [p.id]: !f[p.id] })); }} className="absolute top-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center">
          <Heart size={16} className={fav[p.id] ? 'fill-red-500 text-red-500' : 'text-slate-400'} />
        </button>
      </div>
      <div className="p-3 flex flex-col flex-1">
        {p.marka && <span className="text-[10px] text-slate-400 uppercase tracking-wide">{p.marka}</span>}
        <h3 className="text-sm font-medium text-slate-800 line-clamp-2 min-h-[2.5rem] cursor-pointer" onClick={() => { setDetail(p); setDetailImg(0); setDetailVar(''); }}>{p.ad}</h3>
        <div className="mt-auto pt-2 flex items-end justify-between">
          <div>
            {p.eskiFiyat && p.eskiFiyat > p.satisFiyat && <span className="block text-xs text-slate-400 line-through">{fmt(p.eskiFiyat)}</span>}
            <span className="font-bold text-slate-900">{fmt(p.satisFiyat)}</span>
          </div>
          <button onClick={() => add(p.id)} className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-700"><Plus size={16} /></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setMenuOpen(true)} className="text-slate-700"><Menu size={22} /></button>
          <div className="font-extrabold text-xl tracking-tight text-slate-900 whitespace-nowrap">{data.logoText || data.name}</div>
          <div className="hidden sm:flex flex-1 relative">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün, kategori veya marka ara..." className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-full text-sm outline-none" />
          </div>
          <div className="flex items-center gap-3 ml-auto sm:ml-0 text-slate-700">
            <User size={22} className="hidden sm:block" />
            <button onClick={() => setCartOpen(true)} className="relative"><ShoppingBag size={22} />{count > 0 && <span className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{count}</span>}</button>
          </div>
        </div>
        <div className="sm:hidden px-4 pb-3 relative">
          <Search size={16} className="absolute left-7 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara..." className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-full text-sm outline-none" />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4">
        {/* Canlı / videolu satış */}
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
                  <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0">{(feat.images || [])[0] && <img src={feat.images[0]} className="w-full h-full object-cover" />}</div>
                  <div className="flex-1 min-w-0"><p className="font-semibold text-slate-800 truncate">{feat.ad}</p><div className="flex items-center gap-2"><span className="font-bold text-slate-900">{fmt(feat.satisFiyat)}</span>{feat.eskiFiyat > feat.satisFiyat && <span className="text-xs text-slate-400 line-through">{fmt(feat.eskiFiyat)}</span>}</div></div>
                  <button onClick={() => (feat.variations || []).length ? setDetail(feat) : add(feat.id)} className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 hover:bg-indigo-700"><ShoppingBag size={16} /> Sepete Ekle</button>
                </div>
              )}
            </section>
          );
        })()}
        {/* Hero carousel */}
        <section className="relative mt-4 rounded-2xl overflow-hidden bg-slate-900 text-white h-56 sm:h-72">
          {slides.map((sl: any, i: number) => (
            <div key={i} className={`absolute inset-0 transition-opacity duration-500 ${i === slide ? 'opacity-100' : 'opacity-0'}`}>
              {sl.image && <img src={sl.image} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="" />}
              <div className="relative h-full flex flex-col justify-center px-6 sm:px-10 max-w-md">
                <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight">{sl.title}</h2>
                {sl.subtitle && <p className="text-slate-200 mt-2 text-sm">{sl.subtitle}</p>}
                <button onClick={() => document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' })} className="mt-4 w-fit bg-white text-slate-900 px-5 py-2.5 rounded-full text-sm font-semibold">{sl.cta || 'Alışverişe Başla'}</button>
              </div>
            </div>
          ))}
          {slides.length > 1 && (
            <>
              <button onClick={() => setSlide((slide - 1 + slides.length) % slides.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 rounded-full flex items-center justify-center"><ChevronLeft size={18} /></button>
              <button onClick={() => setSlide((slide + 1) % slides.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 rounded-full flex items-center justify-center"><ChevronRight size={18} /></button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">{slides.map((_: any, i: number) => <span key={i} className={`w-2 h-2 rounded-full ${i === slide ? 'bg-white' : 'bg-white/40'}`} />)}</div>
            </>
          )}
        </section>

        {/* Hizli erisim kutulari */}
        <section className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-5">
          {TILES.map((t) => (
            <div key={t.t} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2"><t.icon size={18} className="text-slate-700" /></div>
              <p className="text-xs font-semibold text-slate-800 leading-tight">{t.t}</p>
              <p className="hidden sm:block text-[10px] text-slate-400 mt-0.5">{t.s}</p>
            </div>
          ))}
        </section>

        {/* Kategoriler */}
        {data.categories?.length > 0 && (
          <section className="flex gap-4 sm:gap-6 mt-6 overflow-x-auto pb-2">
            <button onClick={() => setKat('')} className="flex flex-col items-center gap-2 shrink-0">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${!kat ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}><LayoutGrid size={22} /></div>
              <span className="text-xs text-slate-600">Tümü</span>
            </button>
            {data.categories.map((c: any) => (
              <button key={c.id} onClick={() => setKat(c.id)} className="flex flex-col items-center gap-2 shrink-0">
                <div className={`w-16 h-16 rounded-full overflow-hidden bg-slate-100 ${kat === c.id ? 'ring-2 ring-slate-900' : ''}`}>
                  {c.image ? <img src={c.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 text-lg">{c.ad[0]}</div>}
                </div>
                <span className="text-xs text-slate-600 max-w-[72px] truncate">{c.ad}</span>
              </button>
            ))}
          </section>
        )}

        {/* One cikan urunler */}
        {oneCikanlar.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-slate-900 mb-4">ÖNE ÇIKAN ÜRÜNLER</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{oneCikanlar.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} />)}</div>
          </section>
        )}

        {/* Yeni gelenler */}
        {yeniGelenler.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-slate-900 mb-4">YENİ GELENLER</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{yeniGelenler.map((p) => <ProductCard key={p.id} p={p} badge={!!(p.eskiFiyat && p.eskiFiyat > p.satisFiyat)} />)}</div>
          </section>
        )}

        {/* Indirimli urunler */}
        {indirimliler.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-slate-900 mb-4">İNDİRİMLİ ÜRÜNLER</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">{indirimliler.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} badge />)}</div>
          </section>
        )}

        {/* Tum urunler */}
        <section id="urunler" className="mt-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4">TÜM ÜRÜNLER</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {tumu.map((p) => <ProductCard key={p.id} p={p} badge={!!(p.eskiFiyat && p.eskiFiyat > p.satisFiyat)} />)}
          </div>
          {tumu.length === 0 && <p className="text-center text-slate-400 py-16">Ürün bulunamadı.</p>}
        </section>

        {/* Guven rozetleri */}
        <section className="grid sm:grid-cols-3 gap-3 my-10">
          {[[Truck, 'Hızlı & Güvenli Teslimat', '1-3 iş günü içinde kapında'], [ShieldCheck, '%100 Orijinal Ürün', 'Tüm ürünler orijinal'], [Headphones, '7/24 Müşteri Desteği', 'Her zaman yanınızdayız']].map(([Ic, t, s]: any, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center gap-3">
              <Ic size={26} className="text-slate-700 shrink-0" />
              <div><p className="text-sm font-semibold text-slate-800">{t}</p><p className="text-xs text-slate-400">{s}</p></div>
            </div>
          ))}
        </section>
      </div>

      <footer className="bg-slate-900 text-slate-300 mt-4">
        <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="font-extrabold text-lg text-white mb-2">{data.logoText || data.name}</div>
            <p className="text-sm text-slate-400">Güvenli alışveriş, hızlı teslimat. Tüm ürünler orijinal ve garantilidir.</p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Kurumsal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/hakkimizda" className="hover:text-white">Hakkımızda</a></li>
              <li><a href="/iletisim" className="hover:text-white">İletişim</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Yasal & Sözleşmeler</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/mesafeli-satis" className="hover:text-white">Mesafeli Satış Sözleşmesi</a></li>
              <li><a href="/iade-iptal" className="hover:text-white">İptal & İade Koşulları</a></li>
              <li><a href="/kvkk" className="hover:text-white">KVKK Aydınlatma Metni</a></li>
              <li><a href="/gizlilik" className="hover:text-white">Gizlilik & Güvenlik</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3">Güvenli Ödeme</h4>
            <p className="text-xs text-slate-400 mb-3">256-bit SSL ve 3D Secure ile korumalı ödeme.</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-7 px-2 bg-white rounded flex items-center"><span className="font-bold italic text-[#1a1f71] text-sm tracking-wide">VISA</span></div>
              <div className="h-7 px-2 bg-white rounded flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-[#eb001b] inline-block" /><span className="w-4 h-4 rounded-full bg-[#f79e1b] inline-block -ml-2 opacity-90" /><span className="text-[10px] font-semibold text-slate-700 ml-0.5">mastercard</span></div>
              <div className="h-7 px-2 bg-white rounded flex items-center"><span className="font-bold text-[#00a4a6] text-sm">troy</span></div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800 text-center text-xs text-slate-500 py-4 px-4">
          © {new Date().getFullYear()} {data.logoText || data.name} · Tüm hakları saklıdır · WTech altyapısıyla
        </div>
      </footer>

      {/* Sepet drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setCartOpen(false)}>
          <div className="w-full max-w-md bg-white h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100"><h2 className="font-bold text-slate-800">Sepetim ({count})</h2><button onClick={() => setCartOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cartItems.length === 0 && <p className="text-slate-400 text-center py-10">Sepetiniz boş.</p>}
              {cartItems.map(({ p, adet }) => (
                <div key={p.id} className="flex items-center gap-3">
                  <img src={(p.images || [])[0] || ''} className="w-14 h-14 rounded-lg object-cover bg-slate-100" />
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{p.ad}</p><p className="text-sm text-slate-900 font-semibold">{fmt(p.satisFiyat)}</p></div>
                  <div className="flex items-center gap-2"><button onClick={() => sub(p.id)} className="p-1 border border-slate-200 rounded"><Minus size={14} /></button><span className="text-sm w-5 text-center">{adet}</span><button onClick={() => add(p.id)} className="p-1 border border-slate-200 rounded"><Plus size={14} /></button></div>
                </div>
              ))}
            </div>
            {cartItems.length > 0 && (
              <div className="p-4 border-t border-slate-100">
                <div className="flex justify-between font-bold text-slate-800 mb-3"><span>Toplam</span><span>{fmt(araToplam)}</span></div>
                <button onClick={tamamlaAsistan} disabled={busy} className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">{busy ? 'Hazırlanıyor...' : 'Siparişi Tamamla'}</button>
                <p className="text-[11px] text-slate-400 text-center mt-2">Siparişiniz asistanımıza iletilecek ve ödeme adımları sunulacaktır.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout */}
      {checkout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setCheckout(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={placeOrder} className="w-full max-w-md bg-white rounded-2xl p-6 max-h-[90vh] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Sipariş Bilgileri</h3><button type="button" onClick={() => setCheckout(false)}><X size={20} className="text-slate-400" /></button></div>
            <input required value={cust.ad} onChange={(e) => setCust({ ...cust, ad: e.target.value })} placeholder="Ad Soyad *" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg" />
            <input required value={cust.telefon} onChange={(e) => setCust({ ...cust, telefon: e.target.value })} placeholder="Telefon *" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg" />
            <input value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="E-posta" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg" />
            <textarea required rows={2} value={cust.adres} onChange={(e) => setCust({ ...cust, adres: e.target.value })} placeholder="Teslimat Adresi *" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg" />
            <input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="İndirim kodu (varsa)" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg" />
            <div className="bg-slate-50 rounded-lg p-3 flex justify-between font-bold text-slate-800"><span>Toplam</span><span>{fmt(araToplam)}</span></div>
            <p className="text-[11px] text-slate-400">Siparişiniz alındıktan sonra ödeme için sizinle iletişime geçilecektir.</p>
            <button type="submit" disabled={busy} className="w-full bg-slate-900 text-white py-3 rounded-lg font-medium disabled:opacity-60">{busy ? 'Gönderiliyor...' : 'Siparişi Onayla'}</button>
          </form>
        </div>
      )}

      {/* Urun detay */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl bg-white rounded-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="flex justify-end p-2"><button onClick={() => setDetail(null)}><X size={22} className="text-slate-400" /></button></div>
            <div className="grid md:grid-cols-2 gap-6 px-6 pb-6">
              <div>
                <div className="aspect-square rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center"><img src={(detail.images || [])[detailImg] || ''} className="max-w-full max-h-full object-contain" /></div>
                {(detail.images || []).length > 1 && (
                  <div className="flex gap-2 mt-3">
                    {(detail.images || []).map((src, i) => (
                      <button key={i} onClick={() => setDetailImg(i)} className={`w-14 h-14 rounded-lg overflow-hidden border-2 ${i === detailImg ? 'border-slate-900' : 'border-transparent'}`}><img src={src} className="w-full h-full object-cover" /></button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col">
                {detail.marka && <span className="text-xs text-slate-400 uppercase">{detail.marka}</span>}
                <h2 className="text-xl font-bold text-slate-900">{detail.ad}</h2>
                <div className="mt-3">
                  {detail.eskiFiyat && detail.eskiFiyat > detail.satisFiyat && <span className="text-sm text-slate-400 line-through mr-2">{fmt(detail.eskiFiyat)}</span>}
                  <span className="text-2xl font-extrabold text-slate-900">{fmt(detail.satisFiyat)}</span>
                  {detail.eskiFiyat && detail.eskiFiyat > detail.satisFiyat && <span className="ml-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded">-%{disc(detail.eskiFiyat, detail.satisFiyat)}</span>}
                </div>
                {detail.aciklama && <p className="text-sm text-slate-600 mt-4 whitespace-pre-line">{detail.aciklama}</p>}
                {detail.variations && detail.variations.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2">{detail.variations[0].ad} Seçin</p>
                    <div className="flex flex-wrap gap-2">
                      {detail.variations.map((v, i) => {
                        const tukendi = v.stok <= 0;
                        return (
                          <button key={i} disabled={tukendi} onClick={() => setDetailVar(v.deger)} className={`px-3 py-1.5 rounded-lg border text-sm ${detailVar === v.deger ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-700'} ${tukendi ? 'opacity-40 line-through' : ''}`}>{v.deger}</button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="mt-auto pt-6 flex gap-2">
                  <button onClick={() => {
                    if (detail.variations && detail.variations.length > 0 && !detailVar) { alert('Lütfen bir seçenek seçin'); return; }
                    if (detailVar) setVarSel((m) => ({ ...m, [detail.id]: detailVar }));
                    add(detail.id);
                    setDetail(null);
                  }} className="flex-1 bg-slate-900 text-white py-3 rounded-lg font-medium hover:bg-slate-700">Sepete Ekle</button>
                  <button onClick={() => setFav((f) => ({ ...f, [detail.id]: !f[detail.id] }))} className="w-12 border border-slate-200 rounded-lg flex items-center justify-center"><Heart size={18} className={fav[detail.id] ? 'fill-red-500 text-red-500' : 'text-slate-400'} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Menu drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/40" onClick={() => setMenuOpen(false)}>
          <div className="w-72 bg-white h-full p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><span className="font-bold text-slate-900">{data.logoText || data.name}</span><button onClick={() => setMenuOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Kategoriler</p>
            <button onClick={() => { setKat(''); setMenuOpen(false); }} className={`block w-full text-left py-2 text-sm ${!kat ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>Tüm Ürünler</button>
            {data.categories?.map((c: any) => (
              <button key={c.id} onClick={() => { setKat(c.id); setMenuOpen(false); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className={`block w-full text-left py-2 text-sm ${kat === c.id ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>{c.ad}</button>
            ))}
            <div className="border-t border-slate-100 mt-4 pt-4 space-y-2">
              <a href="/hakkimizda" className="block text-sm text-slate-600">Hakkımızda</a>
              <a href="/iletisim" className="block text-sm text-slate-600">İletişim</a>
              <a href="/mesafeli-satis" className="block text-sm text-slate-600">Mesafeli Satış</a>
              <a href="/iade-iptal" className="block text-sm text-slate-600">İptal & İade</a>
            </div>
          </div>
        </div>
      )}

      {/* PayTR odeme iframe */}
      {paytrUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/60">
          <div className="w-full max-w-2xl bg-white rounded-2xl overflow-hidden flex flex-col h-[92vh]">
            <div className="flex items-center justify-between p-3 border-b border-slate-100">
              <span className="font-semibold text-slate-800">Güvenli Ödeme (PayTR)</span>
              <button onClick={() => { setPaytrUrl(''); setCart({}); setDone({ toplam: araToplam }); }}><X size={20} className="text-slate-400" /></button>
            </div>
            <iframe src={paytrUrl} className="flex-1 w-full" frameBorder={0} title="PayTR" />
          </div>
        </div>
      )}
    </div>
  );
}
