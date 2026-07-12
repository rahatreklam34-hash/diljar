import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Search, ShoppingCart, Plus, Minus, X, Tag, Send, Filter, Package } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '₺';

interface CartItem { productId: string; ad: string; varyasyon: string | null; adet: number; fiyat: number; img: string }

export default function KatalogCustomPublic() {
  const { slug } = useParams();
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [fMarka, setFMarka] = useState('');
  const [fKategori, setFKategori] = useState('');
  const [fCinsiyet, setFCinsiyet] = useState('');
  const [fBeden, setFBeden] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [kupon, setKupon] = useState('');
  const [kuponResult, setKuponResult] = useState<any>(null); // { valid, tip, deger, message }
  const [kuponChecking, setKuponChecking] = useState(false);
  const [musteri, setMusteri] = useState('');
  const [telefon, setTelefon] = useState('');
  const [sending, setSending] = useState(false);
  const [talepResult, setTalepResult] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selVar, setSelVar] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const perPage = 24;
  const [sonGorulen, setSonGorulen] = useState<{ ad: string; img: string } | null>(null);

  // Anonim ziyaretçi ID
  const visitorId = useMemo(() => {
    let id = localStorage.getItem('_cv_id');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('_cv_id', id); }
    return id;
  }, []);

  useEffect(() => { api.get(`/public/custom-katalog/${slug}`).then((r) => { setData(r.data); setLoaded(true); }).catch(() => setLoaded(true)); }, [slug]);

  // Canlı izleme heartbeat — her 10 saniyede bir
  useEffect(() => {
    if (!data?.catalog?.id) return;
    const catalogId = data.catalog.id;
    const send = () => {
      const durum = cartOpen ? 'sepette' : sending ? 'siparis_veriyor' : sonGorulen ? 'urun_inceliyor' : 'geziyor';
      fetch('/api/v1/public/catalog-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId, catalogId, sayfaNo: page,
          sonGorulen: sonGorulen?.ad || null,
          sonGorulenImg: sonGorulen?.img || null,
          sepetUrunSayisi: cart.length,
          sepetToplam: cart.reduce((s, c) => s + c.fiyat * c.adet, 0),
          sepetUrunler: cart.map(c => c.ad).slice(0, 10),
          durum,
        }),
      }).catch(() => {});
    };
    send();
    const interval = setInterval(send, 10000);
    return () => clearInterval(interval);
  }, [data?.catalog?.id, visitorId, page, cart, cartOpen, sending, sonGorulen]);

  const products: any[] = useMemo(() => {
    if (!data?.products) return [];
    let list = data.products;
    if (q) { const ql = q.toLowerCase(); list = list.filter((p: any) => p.ad.toLowerCase().includes(ql) || (p.salesCode || '').toLowerCase().includes(ql) || (p.barkod || '').toLowerCase().includes(ql)); }
    if (fMarka) list = list.filter((p: any) => p.marka === fMarka);
    if (fKategori) list = list.filter((p: any) => p.kategori === fKategori);
    if (fCinsiyet) list = list.filter((p: any) => p.cinsiyet === fCinsiyet);
    if (fBeden) list = list.filter((p: any) => (p.variations || []).some((v: any) => v.deger === fBeden));
    return list;
  }, [data, q, fMarka, fKategori, fCinsiyet, fBeden]);

  const totalPages = Math.max(1, Math.ceil(products.length / perPage));
  const pageProducts = products.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { setPage(1); }, [q, fMarka, fKategori, fCinsiyet, fBeden]);

  const getStok = (productId: string, varyasyon?: string | null): number => {
    const p = (data?.products || []).find((u: any) => u.id === productId);
    if (!p) return 0;
    if (varyasyon) {
      const v = (p.variations || []).find((v: any) => v.deger === varyasyon);
      return v ? (v.stok || 0) : 0;
    }
    return p.stokAdeti || 0;
  };
  const getCartAdet = (productId: string, varyasyon?: string | null): number => {
    const c = cart.find((c) => c.productId === productId && c.varyasyon === (varyasyon || null));
    return c ? c.adet : 0;
  };

  const addToCart = (p: any, varyasyon?: string) => {
    const stok = getStok(p.id, varyasyon);
    const mevcutAdet = getCartAdet(p.id, varyasyon || null);
    if (stok <= 0) { toast.error('Bu ürünün stoğu tükenmiştir'); return; }
    if (mevcutAdet >= stok) { toast.error(`Bu üründen en fazla ${stok} adet ekleyebilirsiniz`); return; }
    const existing = cart.find((c) => c.productId === p.id && c.varyasyon === (varyasyon || null));
    if (existing) { setCart(cart.map((c) => c === existing ? { ...c, adet: c.adet + 1 } : c)); }
    else { setCart([...cart, { productId: p.id, ad: p.ad + (varyasyon ? ` (${varyasyon})` : ''), varyasyon: varyasyon || null, adet: 1, fiyat: p.satisFiyat + ((p.variations || []).find((v: any) => v.deger === varyasyon)?.ekFiyat || 0), img: (p.images || [])[0] || '' }]); }
    toast.success('Sepete eklendi');
  };
  const updateAdet = (i: number, d: number) => {
    const item = cart[i];
    if (!item) return;
    const yeniAdet = item.adet + d;
    if (yeniAdet < 1) return;
    const stok = getStok(item.productId, item.varyasyon);
    if (yeniAdet > stok) { toast.error(`Bu üründen en fazla ${stok} adet ekleyebilirsiniz`); return; }
    setCart(cart.map((c, idx) => idx === i ? { ...c, adet: yeniAdet } : c));
  };
  const removeFromCart = (i: number) => { setCart(cart.filter((_, idx) => idx !== i)); };
  const cartTotal = cart.reduce((s, c) => s + c.fiyat * c.adet, 0);
  const cartAdet = cart.reduce((s, c) => s + c.adet, 0);

  // Kampanya indirimi hesapla
  const kampanyaIndirim = useMemo(() => {
    if (!data?.kampanyalar) return 0;
    let ind = 0;
    for (const k of data.kampanyalar) {
      let uygulanir = false;
      if (k.tip === 'adetIndirim' && cartAdet >= (Number(k.kosul) || 0)) uygulanir = true;
      if (k.tip === 'tutarIndirim' && cartTotal >= (Number(k.kosul) || 0)) uygulanir = true;
      if (uygulanir) {
        if (k.indirimTip === 'yuzde') ind += cartTotal * (Number(k.indirimDeger) || 0) / 100;
        else ind += Number(k.indirimDeger) || 0;
      }
    }
    return Math.min(cartTotal, ind);
  }, [data, cartTotal, cartAdet]);

  const sendTalep = async () => {
    if (cart.length === 0) { toast.error('Sepetiniz boş'); return; }
    if (!musteri.trim()) { toast.error('Adınızı girin'); return; }
    setSending(true);
    try {
      const r = await api.post(`/public/custom-katalog/${slug}/talep`, { items: cart, musteri, telefon, kuponKodu: kupon || null });
      setTalepResult(r.data);
      setCart([]);
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setSending(false); }
  };

  const validateCoupon = async () => {
    if (!kupon.trim()) return;
    setKuponChecking(true);
    try {
      const r = await api.post(`/public/custom-katalog/${slug}/validate-coupon`, { code: kupon.trim() });
      setKuponResult(r.data);
    } catch { setKuponResult({ valid: false, message: 'Bir hata oluştu' }); }
    finally { setKuponChecking(false); }
  };
  const clearCoupon = () => { setKupon(''); setKuponResult(null); };

  const kuponIndirim = useMemo(() => {
    if (!kuponResult?.valid) return 0;
    return kuponResult.tip === 'yuzde' ? cartTotal * kuponResult.deger / 100 : kuponResult.deger;
  }, [kuponResult, cartTotal]);

  if (loaded && !data) return <div className="min-h-screen flex items-center justify-center text-slate-400">Katalog bulunamadı veya aktif değil.</div>;
  if (!loaded) return <div className="min-h-screen flex items-center justify-center"><span className="w-8 h-8 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" /></div>;

  // Talep gönderildi
  if (talepResult) {
    const waLink = data.whatsapp ? `https://wa.me/${data.whatsapp.replace(/\D/g, '').replace(/^0/, '90')}?text=${encodeURIComponent(talepResult.whatsappMsg)}` : null;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Toaster position="top-center" />
        <div className="bg-white rounded-2xl shadow-lg p-6 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4"><Send size={28} className="text-amber-600" /></div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Talebiniz Hazırlandı!</h2>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-sm font-semibold text-amber-800 mb-1">Siparişiniz henüz oluşmadı!</p>
            <p className="text-xs text-amber-700">Siparişinizin geçerli olabilmesi için aşağıdaki butona tıklayarak WhatsApp üzerinden sipariş detaylarınızı iletmeniz gerekmektedir. WhatsApp üzerinden iletilmeyen siparişler işleme alınmaz.</p>
          </div>
          <p className="text-sm text-slate-500 mb-1">Talep numaranız:</p>
          <p className="text-3xl font-mono font-bold text-violet-700 mb-2">{talepResult.talepNo}</p>
          <p className="text-sm text-slate-500 mb-1">Toplam: <strong>{fmt(talepResult.toplam)}</strong>{talepResult.indirim > 0 && <span className="text-green-600 ml-2">(-{fmt(talepResult.indirim)} indirim)</span>}</p>
          {talepResult.rezervDk && <p className="text-xs text-slate-400 mb-3">Ürünleriniz <strong>{talepResult.rezervDk} dakika</strong> boyunca sizin için rezerve edilmiştir.</p>}
          {waLink && <a href={waLink} target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 text-lg shadow-lg"><Send size={20} /> WhatsApp ile Siparişi İlet</a>}
          <p className="text-xs text-rose-500 font-medium mt-3">WhatsApp üzerinden iletilmeyen siparişler geçersiz sayılır!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-center" />
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1"><h1 className="text-lg font-bold text-slate-800">{data.ad}</h1><p className="text-[11px] text-slate-400">{products.length} ürün</p></div>
          <button onClick={() => setCartOpen(true)} className="relative w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center hover:bg-violet-200">
            <ShoppingCart size={20} />
            {cart.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{cartAdet}</span>}
          </button>
        </div>
        {/* Kampanya banner — katalog adının hemen altında */}
        {(data.kampanyalar || []).length > 0 && (
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5">
            <div className="max-w-6xl mx-auto flex items-center gap-2 flex-wrap">
              <Tag size={16} className="shrink-0" />
              <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1">
                {data.kampanyalar.map((k: any, i: number) => (
                  <span key={i} className="text-sm font-medium">{k.tip === 'adetIndirim' ? `${k.kosul} adet al` : `${k.kosul}₺ üzeri al`} → <strong>{k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : `${k.indirimDeger}₺`} indirim</strong>{k.aciklama ? ` (${k.aciklama})` : ''}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        {/* Arama + Filtreler */}
        <div className="mb-4 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün ara (isim, kod, barkod)..." className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white" /></div>
            <button onClick={() => setShowFilters(!showFilters)} className={`px-3 py-2.5 rounded-xl border text-sm font-medium ${showFilters ? 'bg-violet-50 border-violet-200 text-violet-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><Filter size={16} /></button>
          </div>
          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {data.filters?.markalar?.length > 0 && <select value={fMarka} onChange={(e) => setFMarka(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Tüm Markalar</option>{data.filters.markalar.map((m: string) => <option key={m} value={m}>{m}</option>)}</select>}
              {data.filters?.kategoriler?.length > 0 && <select value={fKategori} onChange={(e) => setFKategori(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Tüm Kategoriler</option>{data.filters.kategoriler.map((k: string) => <option key={k} value={k}>{k}</option>)}</select>}
              {data.filters?.cinsiyetler?.length > 0 && <select value={fCinsiyet} onChange={(e) => setFCinsiyet(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Cinsiyet</option>{data.filters.cinsiyetler.map((c: string) => <option key={c} value={c}>{c === 'kadin' ? 'Kadın' : c === 'erkek' ? 'Erkek' : c === 'cocuk' ? 'Çocuk' : 'Unisex'}</option>)}</select>}
              {data.filters?.bedenler?.length > 0 && <select value={fBeden} onChange={(e) => setFBeden(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"><option value="">Beden</option>{data.filters.bedenler.map((b: string) => <option key={b} value={b}>{b}</option>)}</select>}
              {(fMarka || fKategori || fCinsiyet || fBeden) && <button onClick={() => { setFMarka(''); setFKategori(''); setFCinsiyet(''); setFBeden(''); }} className="text-xs text-rose-500 hover:underline">Temizle</button>}
            </div>
          )}
        </div>

        {/* Kampanya uyarı - sepet oluşturulmuşsa hatırlat */}
        {cart.length > 0 && (data.kampanyalar || []).length > 0 && (() => {
          const uyarılar: string[] = [];
          for (const k of data.kampanyalar) {
            if (k.tip === 'adetIndirim' && cartAdet < Number(k.kosul)) uyarılar.push(`${Number(k.kosul) - cartAdet} ürün daha ekleyin → ${k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : `${k.indirimDeger}₺`} indirim kazanın!`);
            if (k.tip === 'tutarIndirim' && cartTotal < Number(k.kosul)) uyarılar.push(`${fmt(Number(k.kosul) - cartTotal)} daha ekleyin → ${k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : `${k.indirimDeger}₺`} indirim kazanın!`);
          }
          return uyarılar.length > 0 ? (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-2">
              <Tag size={15} className="text-amber-500 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800 space-y-0.5">{uyarılar.map((u, i) => <p key={i} className="font-medium">{u}</p>)}</div>
            </div>
          ) : null;
        })()}

        {/* Ürün Grid */}
        {products.length === 0 ? (
          <div className="text-center py-16"><Package size={36} className="mx-auto mb-3 text-slate-300" /><p className="text-slate-400">Ürün bulunamadı.</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {pageProducts.map((p: any) => (
              <div key={p.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden hover:shadow-sm">
                <div className="aspect-square bg-slate-100 relative cursor-zoom-in" onClick={() => { const img = (p.images || [])[0]; if (img) { setLightbox(img); setSonGorulen({ ad: p.ad, img }); } }}>
                  {(p.images || [])[0] ? <img loading="lazy" src={p.images[0]} className="w-full h-full object-cover" /> : <Package size={32} className="absolute inset-0 m-auto text-slate-300" />}
                  {p.eskiFiyat && p.eskiFiyat > p.satisFiyat && <span className="absolute top-2 left-2 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-md font-bold">-%{Math.round((1 - p.satisFiyat / p.eskiFiyat) * 100)}</span>}
                </div>
                <div className="p-2.5">
                  <p className="text-xs text-slate-800 font-medium truncate mb-0.5">{p.ad}</p>
                  <p className="text-[10px] text-slate-400 truncate mb-1">{p.marka || ''}{p.kategori ? ` · ${p.kategori}` : ''}{p.salesCode ? ` · ${p.salesCode}` : ''}</p>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-sm font-bold text-slate-800">{fmt(p.satisFiyat)}</span>
                    {p.eskiFiyat && p.eskiFiyat > p.satisFiyat && <span className="text-[11px] text-slate-400 line-through">{fmt(p.eskiFiyat)}</span>}
                  </div>
                  {(p.variations || []).length > 0 ? (
                    <div>
                      <p className="text-[10px] text-slate-400 mb-1">Mevcut Bedenler:</p>
                      <div className="flex flex-wrap gap-1 mb-1.5">{p.variations.map((v: any) => <button key={v.id} onClick={() => { (window as any).__selVar = { ...((window as any).__selVar || {}), [p.id]: v.deger }; setSelVar(prev => ({ ...prev, [p.id]: v.deger })); }} className={`px-2 py-1 text-[10px] border rounded-lg transition-colors ${selVar[p.id] === v.deger ? 'bg-violet-600 text-white border-violet-600' : 'border-slate-200 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700'}`}>{v.deger}</button>)}</div>
                      <button onClick={() => { const v = selVar[p.id] || (p.variations[0]?.deger); if (v) addToCart(p, v); else toast.error('Beden seçin'); }} className="w-full py-1.5 text-xs bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700">Sepete Ekle</button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(p)} className="w-full py-1.5 text-xs bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700">Sepete Ekle</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Sayfalandırma */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6 pb-4">
            <button disabled={page <= 1} onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50">&laquo; Önceki</button>
            <span className="text-sm text-slate-600 px-2">{page} / {totalPages} <span className="text-slate-400">({products.length} ürün)</span></span>
            <button disabled={page >= totalPages} onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50">Sonraki &raquo;</button>
          </div>
        )}
      </main>
      {/* Sepet bar yüksekliği kadar boşluk */}
      {cart.length > 0 && <div className="h-24" />}

      {/* Sepet Slide */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="w-full max-w-md bg-white h-full overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ShoppingCart size={20} /> Sepetim ({cartAdet})</h2><button onClick={() => setCartOpen(false)}><X size={22} className="text-slate-400" /></button></div>
            {cart.length === 0 ? <p className="text-center text-slate-400 py-8">Sepetiniz boş</p> : (
              <>
                <div className="space-y-3 mb-4">{cart.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                    {item.img && <img loading="lazy" src={item.img} className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                    <div className="flex-1 min-w-0"><p className="text-sm text-slate-800 font-medium truncate">{item.ad}</p><p className="text-xs text-slate-400">{fmt(item.fiyat)} x {item.adet}</p></div>
                    <div className="flex items-center gap-1"><button onClick={() => updateAdet(i, -1)} className="w-6 h-6 rounded bg-slate-200 flex items-center justify-center"><Minus size={12} /></button><span className="text-sm w-6 text-center">{item.adet}</span><button onClick={() => updateAdet(i, 1)} className="w-6 h-6 rounded bg-slate-200 flex items-center justify-center"><Plus size={12} /></button></div>
                    <button onClick={() => removeFromCart(i)} className="text-slate-300 hover:text-rose-500"><X size={16} /></button>
                  </div>
                ))}</div>

                {/* Kupon */}
                <div className="mb-4">
                  <label className="text-xs text-slate-400 mb-1 block">Kupon Kodu</label>
                  {kuponResult?.valid ? (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span className="text-xs text-green-700 font-medium flex-1">{kuponResult.message} uygulandı ({fmt(kuponIndirim)} indirim)</span>
                      <button onClick={clearCoupon} className="text-green-400 hover:text-rose-500"><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input value={kupon} onChange={(e) => { setKupon(e.target.value.toUpperCase()); setKuponResult(null); }} placeholder="Kupon kodunuzu girin" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2" />
                      <button onClick={validateCoupon} disabled={kuponChecking || !kupon.trim()} className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 shrink-0">{kuponChecking ? '...' : 'Uygula'}</button>
                    </div>
                  )}
                  {kuponResult && !kuponResult.valid && <p className="text-xs text-rose-500 mt-1">{kuponResult.message}</p>}
                </div>

                {/* Sepet içi kampanya uyarısı */}
                {(data.kampanyalar || []).length > 0 && (() => {
                  const hints: string[] = [];
                  for (const k of data.kampanyalar) {
                    if (k.tip === 'adetIndirim') { if (cartAdet >= Number(k.kosul)) hints.push(`✅ ${k.kosul} adet koşulu sağlandı! ${k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : `${k.indirimDeger}₺`} indiriminiz uygulandı.`); else hints.push(`🏷️ ${Number(k.kosul) - cartAdet} ürün daha ekleyin → ${k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : `${k.indirimDeger}₺`} indirim kazanın!`); }
                    if (k.tip === 'tutarIndirim') { if (cartTotal >= Number(k.kosul)) hints.push(`✅ ${k.kosul}₺ koşulu sağlandı! ${k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : `${k.indirimDeger}₺`} indiriminiz uygulandı.`); else hints.push(`🏷️ ${fmt(Number(k.kosul) - cartTotal)} daha ekleyin → ${k.indirimTip === 'yuzde' ? `%${k.indirimDeger}` : `${k.indirimDeger}₺`} indirim kazanın!`); }
                  }
                  return <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 space-y-1">{hints.map((h, i) => <p key={i} className="text-xs text-amber-800">{h}</p>)}</div>;
                })()}

                {/* Özet */}
                <div className="border-t border-slate-100 pt-3 space-y-1.5 mb-4">
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Ara Toplam</span><span className="text-slate-700">{fmt(cartTotal)}</span></div>
                  {kampanyaIndirim > 0 && <div className="flex justify-between text-sm text-green-600"><span>Kampanya İndirimi</span><span>-{fmt(kampanyaIndirim)}</span></div>}
                  {kuponIndirim > 0 && <div className="flex justify-between text-sm text-violet-600"><span>Kupon İndirimi</span><span>-{fmt(kuponIndirim)}</span></div>}
                  <div className="flex justify-between text-base font-bold pt-1 border-t border-slate-100"><span>Toplam</span><span>{fmt(Math.max(0, cartTotal - kampanyaIndirim - kuponIndirim))}</span></div>
                </div>

                {/* Müşteri bilgileri */}
                <div className="space-y-2 mb-4">
                  <input value={musteri} onChange={(e) => setMusteri(e.target.value)} placeholder="Adınız Soyadınız *" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                  <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefon numaranız" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2" />
                </div>

                <button onClick={sendTalep} disabled={sending} className="w-full py-3 bg-green-500 text-white rounded-xl font-semibold text-sm hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"><Send size={18} /> {sending ? 'Gönderiliyor...' : 'WhatsApp ile Talep Gönder'}</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
        </div>
      )}

      {/* Alt sepet bar */}
      {cart.length > 0 && !cartOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 p-3 flex items-center justify-between">
          <div><p className="text-sm font-bold text-slate-800">{fmt(cartTotal - kampanyaIndirim)}</p><p className="text-[10px] text-slate-400">{cartAdet} ürün</p></div>
          <button onClick={() => setCartOpen(true)} className="px-5 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700">Sepeti Görüntüle</button>
        </div>
      )}
    </div>
  );
}
