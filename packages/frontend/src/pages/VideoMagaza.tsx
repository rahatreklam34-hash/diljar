import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Search, Heart, ShoppingBag, Zap, Home, LayoutGrid, Radio, User, Plus, Minus, X, Star, ChevronDown, Grid2x2, List, Truck, RotateCcw, ShieldCheck, Headphones, Lock } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const disc = (eski?: number, satis?: number) => (eski && satis && eski > satis) ? Math.round(((eski - satis) / eski) * 100) : 0;
const vipRate = (p: number) => p >= 1500 ? 5 : p >= 800 ? 4 : 3;
const discColor = (d: number) => d >= 30 ? 'bg-red-500' : d >= 20 ? 'bg-orange-500' : 'bg-green-500';

const KATLAR = [
  { k: 'tumu', t: 'Tümü', icon: Zap },
  { k: 'indirim', t: 'İndirimdekiler', icon: () => <span className="font-bold">%</span> },
  { k: 'coksatan', t: 'Çok Satanlar', icon: Star },
  { k: 'yeni', t: 'Yeni Fırsatlar', icon: Zap },
  { k: 'sonsans', t: 'Son Şans', icon: RotateCcw },
];

export default function VideoMagaza({ slug: slugProp }: { slug?: string }) {
  const params = useParams();
  const slug = slugProp || params.slug;
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [kat, setKat] = useState('tumu');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('yeni');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [cart, setCart] = useState<Record<string, any>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [varModal, setVarModal] = useState<any>(null);
  const [varSel, setVarSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [checkout, setCheckout] = useState(false);
  const [cust, setCust] = useState({ ad: '', telefon: '', email: '', adres: '' });
  const [paytrUrl, setPaytrUrl] = useState('');
  const [done, setDone] = useState<any>(null);
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
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { const uq = sp.get('q'); const uk = sp.get('kat'); if (uq) setQ(uq); if (uk) setKat(uk); /* eslint-disable-next-line */ }, []);

  const products: any[] = data?.products || [];
  const topMenu: any[] = Array.isArray(data?.topMenu) ? data.topMenu : [];
  // Menü öğesini filtre anahtarına çevir
  const katKey = (it: any) => it.type === 'kategori' ? `kat:${it.value}` : it.type === 'cinsiyet' ? `cins:${it.value}` : it.value;
  const filtered = useMemo(() => {
    let l = products.filter((p) => !q || p.ad.toLowerCase().includes(q.toLowerCase()) || (p.marka || '').toLowerCase().includes(q.toLowerCase()));
    if (kat.startsWith('kat:')) l = l.filter((p) => p.kategoriId === kat.slice(4));
    else if (kat.startsWith('cins:')) l = l.filter((p) => (p.cinsiyet || '') === kat.slice(5));
    else if (kat === 'indirim') l = l.filter((p) => disc(p.eskiFiyat, p.satisFiyat) > 0);
    else if (kat === 'coksatan') l = l.filter((p) => p.oneCikan);
    else if (kat === 'yeni') l = [...l].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    else if (kat === 'sonsans') l = l.filter((p) => (p.stokAdeti || 0) > 0 && (p.stokAdeti || 0) <= 5);
    if (sort === 'fiyat_artan') l = [...l].sort((a, b) => a.satisFiyat - b.satisFiyat);
    else if (sort === 'fiyat_azalan') l = [...l].sort((a, b) => b.satisFiyat - a.satisFiyat);
    else if (sort === 'indirim') l = [...l].sort((a, b) => disc(b.eskiFiyat, b.satisFiyat) - disc(a.eskiFiyat, a.satisFiyat));
    else if (sort === 'yeni') l = [...l].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return l;
  }, [products, q, kat, sort]);

  const cartItems = Object.values(cart);
  const count = cartItems.reduce((s: number, x: any) => s + x.adet, 0);
  const araToplam = cartItems.reduce((s: number, x: any) => s + x.fiyat * x.adet, 0);

  const geri = useMemo(() => { const k = 3 * 3600 - (Math.floor(now / 1000) % (3 * 3600)); return { s: Math.floor(k / 3600), dk: Math.floor((k % 3600) / 60), sn: k % 60 }; }, [now]);

  const addToCart = (p: any, varyasyon?: string) => {
    const key = p.id + '|' + (varyasyon || '');
    let fiyat = p.satisFiyat;
    if (varyasyon) { const v = (p.variations || []).find((x: any) => x.deger === varyasyon); if (v) fiyat += v.ekFiyat || 0; }
    setCart((c) => ({ ...c, [key]: { productId: p.id, varyasyon: varyasyon || null, ad: p.ad, fiyat, img: (p.images || [])[0] || '', adet: (c[key]?.adet || 0) + 1 } }));
    setCartOpen(true);
  };
  const sepeteEkle = (p: any) => { if ((p.variations || []).length > 0) { setVarModal(p); setVarSel(''); } else addToCart(p); };
  const sub = (key: string) => setCart((c) => { const n = (c[key]?.adet || 0) - 1; const copy = { ...c }; if (n <= 0) delete copy[key]; else copy[key] = { ...copy[key], adet: n }; return copy; });
  const inc = (key: string) => setCart((c) => ({ ...c, [key]: { ...c[key], adet: c[key].adet + 1 } }));
  const tamamla = () => { if (cartItems.length === 0) return; setCartOpen(false); setCheckout(true); };
  const odemeYap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cust.ad || !cust.telefon) { alert('Ad ve telefon zorunludur'); return; }
    setBusy(true);
    try {
      const items = cartItems.map((x: any) => ({ productId: x.productId, adet: x.adet, varyasyon: x.varyasyon || undefined }));
      const r = await api.post(`/public/store/${slug}/order`, { customer: cust, items });
      if (r.data.iframeUrl) { setPaytrUrl(r.data.iframeUrl); setCheckout(false); return; }
      if (r.data.paytrError) alert('Ödeme başlatılamadı: ' + r.data.paytrError + '\nSiparişiniz kaydedildi, sizinle iletişime geçilecek.');
      setDone(r.data); setCart({}); setCheckout(false);
    } catch (e) { alert(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 text-center bg-slate-100">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-100">Yükleniyor...</div>;
  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-3"><ShieldCheck size={32} /></div>
        <h1 className="text-xl font-bold text-slate-800">Siparişiniz Alındı!</h1>
        <p className="text-sm text-slate-500 mt-2">Sipariş No: <b>{done.orderNo ? `${done.orderYil}-${String(done.orderNo).padStart(3, '0')}` : done.id?.slice(-5)}</b><br />En kısa sürede sizinle iletişime geçilecektir.</p>
        <button onClick={() => { setDone(null); nav('/'); }} className="mt-4 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold">Alışverişe Devam Et</button>
      </div>
    </div>
  );

  const Card = ({ p }: any) => {
    const d = disc(p.eskiFiyat, p.satisFiyat); const vp = (Number(data?.puanOrani) || 0) > 0 ? Number(data.puanOrani) : vipRate(p.satisFiyat); const varOzet = (p.variations || []).slice(0, 2).map((v: any) => v.deger).join(' • ');
    return (
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col">
        <div className="relative">
          <div onClick={() => nav(`/urun/${p.id}`)} className="aspect-square bg-slate-50 cursor-pointer">{(p.images || [])[0] && <img src={p.images[0]} className="w-full h-full object-cover" />}</div>
          {d > 0 && <span className={`absolute top-2 left-2 text-[10px] font-bold text-white px-2 py-0.5 rounded ${discColor(d)}`}>%{d} İNDİRİM</span>}
          <button className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-slate-400 hover:text-red-500"><Heart size={15} /></button>
        </div>
        <div className="p-3 flex flex-col flex-1">
          <p onClick={() => nav(`/urun/${p.id}`)} className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2 cursor-pointer hover:text-indigo-600">{p.ad}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{varOzet || p.marka || '\u00A0'}</p>
          <div className="flex items-center gap-1.5 mt-1">{d > 0 && <span className="text-[11px] text-slate-400 line-through">{fmt(p.eskiFiyat)}</span>}<span className="text-base font-bold text-red-600">{fmt(p.satisFiyat)}</span></div>
          <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-1.5 w-fit"><Star size={9} className="fill-indigo-600" /> %{vp} VIP Puan</span>
          <span className={`text-[11px] mt-1 flex items-center gap-1 ${(p.stokAdeti || 0) > 0 ? 'text-green-600' : 'text-red-500'}`}><span className={`w-1.5 h-1.5 rounded-full ${(p.stokAdeti || 0) > 0 ? 'bg-green-500' : 'bg-red-500'}`} /> {(p.stokAdeti || 0) > 0 ? 'Stokta var' : 'Stok yok'}</span>
          <button onClick={() => sepeteEkle(p)} disabled={(p.stokAdeti || 0) <= 0} className="w-full mt-2.5 bg-indigo-600 text-white rounded-lg py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-indigo-700 disabled:opacity-40"><ShoppingBag size={14} /> Sepete Ekle</button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to={slugProp ? '/' : `/m/${slug}`} className="flex items-center gap-1.5"><span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center"><Zap size={16} /></span><span className="font-extrabold text-slate-900 hidden sm:block">{data.logoText || data.name}</span></Link>
          <div className="relative flex-1 max-w-xl mx-auto"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün, kod veya marka ara..." className="w-full pl-9 pr-3 py-2 text-base bg-slate-100 rounded-xl outline-none" /></div>
          <button onClick={() => setAcc(true)} className="hidden sm:inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600"><User size={18} /> {shopUser ? shopUser.ad.split(' ')[0] : 'Üye Ol / Giriş'}</button>
          <button onClick={() => setCartOpen(true)} className="relative"><ShoppingBag size={22} className="text-slate-700" />{count > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center">{count}</span>}</button>
        </div>
        {/* Üst menü (web) */}
        <nav className="hidden sm:block border-t border-slate-100 bg-white">
          <div className="max-w-6xl mx-auto px-4 flex items-center gap-1">
            {topMenu.length > 0 ? topMenu.map((m: any) => {
              const key = katKey(m);
              const hasChildren = Array.isArray(m.children) && m.children.length > 0;
              return (
                <div key={m.id} className="relative group">
                  <button onClick={() => { setKat(key); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className={`px-3 py-2.5 text-sm font-medium border-b-2 inline-flex items-center gap-1 ${kat === key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600 hover:text-indigo-600'}`}>{m.label}{hasChildren && <ChevronDown size={13} />}</button>
                  {hasChildren && (
                    <div className="absolute left-0 top-full hidden group-hover:block bg-white border border-slate-100 rounded-xl shadow-lg py-1 min-w-[180px] z-40">
                      {m.children.map((c: any, ci: number) => { const ck = katKey(c); return (
                        <button key={ci} onClick={() => { setKat(ck); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${kat === ck ? 'text-indigo-600 font-medium' : 'text-slate-600'}`}>{c.label}</button>
                      ); })}
                    </div>
                  )}
                </div>
              );
            }) : KATLAR.map((c) => (
              <button key={c.k} onClick={() => { setKat(c.k); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className={`px-3 py-2.5 text-sm font-medium border-b-2 ${kat === c.k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-600 hover:text-indigo-600'}`}>{c.t}</button>
            ))}
            <span className="ml-auto flex items-center gap-4">
              <button onClick={() => setAcc(true)} className="text-sm text-slate-600 hover:text-indigo-600">Hesabım</button>
              <button onClick={() => setCartOpen(true)} className="text-sm text-slate-600 hover:text-indigo-600">Sepetim</button>
            </span>
          </div>
        </nav>
      </header>

      <div className="max-w-6xl mx-auto px-4 pb-28 sm:pb-10">
        {/* Geri sayım bandı */}
        <div className="mt-4 rounded-2xl bg-slate-900 text-white p-4 flex items-center gap-3 flex-wrap">
          <span className="w-10 h-10 rounded-xl bg-indigo-500/30 flex items-center justify-center"><Zap size={20} className="text-indigo-300" /></span>
          <div className="flex-1 min-w-[140px]"><p className="font-bold">Sınırlı Süreli Fırsatlar</p><p className="text-xs text-white/60">Acele et, fırsatlar bitmeden yakala!</p></div>
          <div className="flex items-center gap-2">{[['SAAT', geri.s], ['DAKİKA', geri.dk], ['SANİYE', geri.sn]].map(([l, v]: any) => <div key={l} className="bg-white/10 rounded-lg px-2.5 py-1 text-center"><p className="text-lg font-bold tabular-nums leading-none">{String(v).padStart(2, '0')}</p><p className="text-[8px] text-white/50 mt-0.5">{l}</p></div>)}</div>
        </div>

        {/* Hero — mor gradyan banner */}
        <div className="mt-3 rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-800 text-white overflow-hidden relative">
          <div className="relative p-6 sm:p-10 flex items-center">
            <div className="flex-1 z-10">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/15 px-2.5 py-1 rounded-full mb-3"><Zap size={12} className="text-amber-300" /> KAÇIRILMAYACAK FIRSATLAR</span>
              <h1 className="text-3xl sm:text-5xl font-extrabold leading-none tracking-tight">FIRSATLAR</h1>
              <p className="text-lg sm:text-2xl font-bold text-white/90 mt-2">Büyük İndirim Fırsatları Başladı!</p>
              <p className="inline-flex items-center gap-1.5 text-amber-300 font-semibold mt-2"><span className="text-xl">👟</span> Spor Ayakkabı Fırsatı — Sezonun en iyi indirimleri!</p>
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => { setQ('ayakkab'); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className="bg-amber-400 text-slate-900 font-bold px-5 py-2.5 rounded-full text-sm hover:bg-amber-300 inline-flex items-center gap-1.5">👟 Spor Ayakkabıları Gör</button>
                <button onClick={() => { setQ(''); setKat('indirim'); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className="bg-white text-indigo-700 font-semibold px-5 py-2.5 rounded-full text-sm hover:bg-indigo-50">Tüm Fırsatlar</button>
              </div>
            </div>
            {/* Dekoratif grafikler */}
            <div className="hidden sm:flex relative w-48 h-40 shrink-0 items-center justify-center">
              <div className="absolute top-2 left-2 w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl font-extrabold rotate-12">%</div>
              <div className="absolute bottom-3 right-3 w-11 h-11 rounded-full bg-amber-400/90 flex items-center justify-center"><Zap size={20} className="text-white" /></div>
              <Star size={24} className="absolute top-6 right-8 text-white/70 fill-white/70" />
              <Star size={14} className="absolute bottom-10 left-6 text-white/50 fill-white/50" />
              <span className="text-[110px] leading-none drop-shadow-2xl -rotate-12">👟</span>
            </div>
          </div>
        </div>

        {/* Kategori/filtre çipleri */}
        <div className="flex gap-4 overflow-x-auto py-4">
          {(topMenu.length > 0
            ? topMenu.flatMap((m: any) => [{ k: katKey(m), t: m.label, icon: Zap }, ...((m.children || []).map((c: any) => ({ k: katKey(c), t: c.label, icon: Zap })))])
            : KATLAR.map((c) => ({ k: c.k, t: c.t, icon: c.icon }))
          ).map((c: any, idx: number) => { const Ic: any = c.icon; return (
            <button key={c.k + idx} onClick={() => setKat(c.k)} className="flex flex-col items-center gap-1.5 shrink-0">
              <span className={`w-14 h-14 rounded-full flex items-center justify-center ${kat === c.k ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-100'}`}><Ic size={20} /></span>
              <span className={`text-[11px] ${kat === c.k ? 'text-indigo-600 font-semibold' : 'text-slate-500'}`}>{c.t}</span>
            </button>
          ); })}
        </div>

        {/* Sırala + görünüm */}
        <div id="urunler" className="flex items-center gap-2 mb-3">
          <div className="relative"><select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none bg-white border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-sm"><option value="yeni">Sırala: En Yeni</option><option value="indirim">En Yüksek İndirim</option><option value="fiyat_artan">Fiyat (artan)</option><option value="fiyat_azalan">Fiyat (azalan)</option></select><ChevronDown size={14} className="absolute right-2.5 top-3 text-slate-400 pointer-events-none" /></div>
          <span className="text-xs text-slate-400 ml-1">{filtered.length} ürün</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setView('grid')} className={`w-9 h-9 rounded-lg flex items-center justify-center ${view === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}><Grid2x2 size={16} /></button>
            <button onClick={() => setView('list')} className={`w-9 h-9 rounded-lg flex items-center justify-center ${view === 'list' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}><List size={16} /></button>
          </div>
        </div>

        {/* Ürünler */}
        {filtered.length === 0 ? <div className="text-center text-slate-400 py-16 bg-white rounded-2xl">Ürün bulunamadı.</div> : (
          <div className={view === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>{filtered.map((p) => <Card key={p.id} p={p} />)}</div>
        )}

        {/* VIP bandı */}
        <div className="mt-5 rounded-2xl bg-amber-50 border border-amber-100 p-4 flex items-center gap-3 flex-wrap">
          <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><Star size={20} className="fill-amber-400 text-amber-400" /></span>
          <div className="flex-1 min-w-[160px]"><p className="font-bold text-slate-800">VIP Üyelere Özel</p><p className="text-xs text-slate-500">Fırsat ürünlerinden ekstra VIP puan kazan.</p></div>
          <Link to={`/uye/${slug}`} className="bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5">VIP Üyeliğini İncele</Link>
        </div>
      </div>

      {/* Footer + Sanal POS bilgileri */}
      <footer className="bg-slate-900 text-slate-300 mt-6">
        <div className="max-w-6xl mx-auto px-4 py-8 grid sm:grid-cols-4 gap-6 text-sm">
          <div className="sm:col-span-1"><p className="font-extrabold text-white text-lg mb-2">{data.logoText || data.name}</p><p className="text-slate-400 text-xs leading-relaxed">Güvenli alışverişin adresi. Tüm ödemeler 256-bit SSL ile şifrelenir.</p></div>
          <div><p className="font-semibold text-white mb-2">Kurumsal</p><ul className="space-y-1.5 text-slate-400 text-xs"><li><a href="/hakkimizda">Hakkımızda</a></li><li><a href="/iletisim">İletişim</a></li></ul></div>
          <div><p className="font-semibold text-white mb-2">Yasal</p><ul className="space-y-1.5 text-slate-400 text-xs"><li><a href="/mesafeli-satis">Mesafeli Satış Sözleşmesi</a></li><li><a href="/iade-iptal">İade ve İptal Koşulları</a></li><li><a href="/gizlilik">Gizlilik Politikası</a></li><li><a href="/kvkk">KVKK Aydınlatma Metni</a></li></ul></div>
          <div><p className="font-semibold text-white mb-2">Güvenli Ödeme</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-white text-slate-900 text-[11px] font-bold px-2 py-1 rounded">VISA</span>
              <span className="bg-white text-red-600 text-[11px] font-bold px-2 py-1 rounded">Mastercard</span>
              <span className="bg-white text-blue-700 text-[11px] font-bold px-2 py-1 rounded">TROY</span>
            </div>
            <div className="flex items-center gap-2 mt-3 text-[11px] text-slate-400"><Lock size={13} /> 256-bit SSL Güvenli Ödeme</div>
          </div>
        </div>
        <div className="border-t border-white/10"><div className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[[Truck, 'Ücretsiz Kargo', (Number(data?.freeShipThreshold) || 0) > 0 ? `${Number(data.freeShipThreshold).toLocaleString('tr-TR')} TL üzeri` : 'Hızlı teslimat'], [RotateCcw, 'Kolay İade', '14 gün içinde'], [ShieldCheck, 'Güvenli Ödeme', '256 bit SSL'], [Headphones, 'Canlı Destek', '7/24 ulaşılır']].map(([Ic, t, s]: any, i) => (
            <div key={i} className="flex items-center gap-2"><Ic size={20} className="text-indigo-400 shrink-0" /><div><p className="text-xs font-semibold text-white">{t}</p><p className="text-[10px] text-slate-400">{s}</p></div></div>
          ))}
        </div></div>
        <div className="border-t border-white/10 text-center py-4 text-[11px] text-slate-500">© {new Date().getFullYear()} {data.logoText || data.name} · Tüm hakları saklıdır · Yazılım: WTech Yazılım A.Ş.</div>
      </footer>

      {/* Alt nav (mobil) */}
      <nav className="fixed bottom-0 left-0 right-0 sm:hidden bg-white border-t border-slate-100 px-2 py-1.5 flex items-center justify-between z-30">
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex flex-col items-center gap-0.5 text-indigo-600 flex-1"><Home size={20} /><span className="text-[10px]">Ana Sayfa</span></button>
        <button onClick={() => document.getElementById('urunler')?.scrollIntoView()} className="flex flex-col items-center gap-0.5 text-slate-400 flex-1"><LayoutGrid size={20} /><span className="text-[10px]">Kataloglar</span></button>
        <button onClick={() => { setKat('indirim'); document.getElementById('urunler')?.scrollIntoView({ behavior: 'smooth' }); }} className="w-12 h-12 rounded-full bg-indigo-600 text-white flex flex-col items-center justify-center -mt-5 shadow-lg flex-1 max-w-12 mx-auto"><Radio size={18} /><span className="text-[8px]">FIRSAT</span></button>
        <button onClick={() => setCartOpen(true)} className="flex flex-col items-center gap-0.5 text-slate-400 flex-1 relative"><ShoppingBag size={20} />{count > 0 && <span className="absolute top-0 right-5 w-3.5 h-3.5 rounded-full bg-indigo-600 text-white text-[8px] flex items-center justify-center">{count}</span>}<span className="text-[10px]">Sepetim</span></button>
        <button onClick={() => setAcc(true)} className="flex flex-col items-center gap-0.5 text-slate-400 flex-1"><User size={20} /><span className="text-[10px]">Hesabım</span></button>
      </nav>

      {/* Varyasyon modal */}
      {varModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setVarModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">{varModal.ad}</h3><button onClick={() => setVarModal(null)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-500 mb-2">Beden / varyasyon seçin:</p>
            <div className="flex flex-wrap gap-2 mb-4">{(varModal.variations || []).map((v: any) => <button key={v.deger} disabled={v.stok <= 0} onClick={() => setVarSel(v.deger)} className={`px-3 py-2 rounded-xl border text-sm ${varSel === v.deger ? 'bg-indigo-600 text-white border-indigo-600' : v.stok <= 0 ? 'border-slate-200 text-slate-300 line-through' : 'border-slate-200 text-slate-600'}`}>{v.deger}</button>)}</div>
            <button disabled={!varSel} onClick={() => { addToCart(varModal, varSel); setVarModal(null); }} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold disabled:opacity-50">Sepete Ekle</button>
          </div>
        </div>
      )}

      {/* Sepet drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/50" onClick={() => setCartOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100"><h2 className="font-bold text-slate-800">Sepetim ({count})</h2><button onClick={() => setCartOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cartItems.length === 0 && <p className="text-slate-400 text-center py-10">Sepetiniz boş.</p>}
              {Object.entries(cart).map(([key, x]: any) => (
                <div key={key} className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0">{x.img && <img src={x.img} className="w-full h-full object-cover" />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{x.ad}</p>{x.varyasyon && <p className="text-xs text-slate-400">{x.varyasyon}</p>}<p className="text-sm font-bold text-slate-900">{fmt(x.fiyat * x.adet)}</p></div>
                  <div className="flex items-center gap-1.5"><button onClick={() => sub(key)} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center"><Minus size={13} /></button><span className="w-5 text-center text-sm">{x.adet}</span><button onClick={() => inc(key)} className="w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center"><Plus size={13} /></button></div>
                </div>
              ))}
            </div>
            {cartItems.length > 0 && (
              <div className="p-4 border-t border-slate-100"><div className="flex justify-between font-bold text-slate-800 mb-3"><span>Toplam</span><span>{fmt(araToplam)}</span></div><button onClick={tamamla} disabled={busy} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50">Siparişi Tamamla</button><p className="text-[11px] text-slate-400 text-center mt-2 inline-flex items-center justify-center gap-1 w-full"><Lock size={11} /> Güvenli ödeme · 256-bit SSL</p></div>
            )}
          </div>
        </div>
      )}

      {/* Checkout (teslimat + ödeme) */}
      {checkout && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setCheckout(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={odemeYap} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">Teslimat & Ödeme</h3><button type="button" onClick={() => setCheckout(false)}><X size={20} className="text-slate-400" /></button></div>
            <div className="bg-slate-50 rounded-xl p-3 text-sm flex justify-between"><span className="text-slate-500">Ödenecek Tutar</span><span className="font-bold text-slate-900">{fmt(araToplam)}</span></div>
            <input required value={cust.ad} onChange={(e) => setCust({ ...cust, ad: e.target.value })} placeholder="Ad Soyad *" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />
            <input required value={cust.telefon} onChange={(e) => setCust({ ...cust, telefon: e.target.value })} placeholder="Telefon *" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />
            <input value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="E-posta" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />
            <textarea required rows={2} value={cust.adres} onChange={(e) => setCust({ ...cust, adres: e.target.value })} placeholder="Teslimat Adresi *" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />
            <button type="submit" disabled={busy} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"><Lock size={16} /> {busy ? 'Yönlendiriliyor...' : 'Ödemeye Geç'}</button>
            <p className="text-[11px] text-slate-400 text-center">Kredi/banka kartı ile güvenli ödeme (PayTR). Bilgileriniz 256-bit SSL ile şifrelenir.</p>
          </form>
        </div>
      )}

      {/* PayTR iframe */}
      {paytrUrl && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex items-center justify-center p-3" onClick={() => setPaytrUrl('')}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl overflow-hidden h-[88vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-100"><span className="font-semibold text-slate-800 inline-flex items-center gap-1.5"><Lock size={15} /> Güvenli Ödeme</span><button onClick={() => setPaytrUrl('')}><X size={20} className="text-slate-400" /></button></div>
            <iframe src={paytrUrl} className="flex-1 w-full" title="Ödeme" />
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
                    <div key={o.id} className="border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                      <div><p className="text-sm font-medium text-slate-800">{o.orderNo ? `${o.orderYil}-${String(o.orderNo).padStart(3, '0')}` : '#' + o.id.slice(-5)}</p><p className="text-[11px] text-slate-400">{new Date(o.createdAt).toLocaleDateString('tr-TR')} · {(o.items || []).length} ürün · {o.durum}</p>{o.kargoTakip && <p className="text-[11px] text-indigo-600">Kargo: {o.kargoFirmasi} · {o.kargoTakip}</p>}</div>
                      <div className="text-right"><p className="font-bold text-slate-900">{fmt(o.toplam)}</p>{o.token && <a href={`/sepet/${o.token}`} className="text-[11px] text-indigo-600">Detay</a>}</div>
                    </div>
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
