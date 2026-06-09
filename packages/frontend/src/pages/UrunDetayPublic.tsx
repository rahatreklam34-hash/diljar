import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, Star, X, ImagePlus, Send, Truck, ShieldCheck, RotateCcw, Search, User, Zap } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const disc = (eski?: number, satis?: number) => (eski && satis && eski > satis) ? Math.round(((eski - satis) / eski) * 100) : 0;

function Stars({ value, size = 14, onPick }: { value: number; size?: number; onPick?: (n: number) => void }) {
  return <span className="inline-flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} onClick={onPick ? () => onPick(n) : undefined} className={`${n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} ${onPick ? 'cursor-pointer' : ''}`} />)}</span>;
}

export default function UrunDetayPublic() {
  const params = useParams();
  const { id } = params;
  const nav = useNavigate();
  const [slug, setSlug] = useState<string | undefined>(params.slug);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [imgIdx, setImgIdx] = useState(0);
  const [varSel, setVarSel] = useState('');
  const [adet, setAdet] = useState(1);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // yorum formu
  const [yad, setYad] = useState('');
  const [ypuan, setYpuan] = useState(5);
  const [yyorum, setYyorum] = useState('');
  const [ygorsel, setYgorsel] = useState('');
  const [ygonder, setYgonder] = useState(false);

  // slug yoksa (/urun/:id) birincil mağaza slug'ını çöz
  useEffect(() => { if (!slug) api.get('/public/primary-store').then((r) => setSlug(r.data?.slug || '')).catch(() => setSlug('')); }, [slug]);
  const load = () => { if (!slug) return; api.get(`/public/store/${slug}/urun/${id}`).then((r) => { setD(r.data); }).catch((e) => setErr(apiErrorMessage(e))); api.post(`/public/store/${slug}/urun/${id}/view`, {}, { headers: { ...(localStorage.getItem('shopToken_' + slug) ? { Authorization: 'Bearer ' + localStorage.getItem('shopToken_' + slug) } : {}) } }).catch(() => {}); };
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

  const sepeteEkle = () => {
    if (!p) return;
    if ((p.variations || []).length > 0 && !varSel) { alert('Lütfen beden/varyasyon seçin'); return; }
    try {
      const cart = JSON.parse(localStorage.getItem('wt_cart') || '{}');
      const key = `${p.id}:${varSel || ''}`;
      cart[key] = { productId: p.id, varyasyon: varSel || null, ad: p.ad, fiyat, img: (p.images || [])[0] || '', adet: (cart[key]?.adet || 0) + adet };
      localStorage.setItem('wt_cart', JSON.stringify(cart));
    } catch { /* */ }
    nav(slug ? `/m/${slug}?cart=1` : `/?cart=1`);
  };

  const pickImg = (file: File) => { const reader = new FileReader(); reader.onload = () => { const im = new Image(); im.onload = () => { let { width, height } = im; const max = 900; if (width > max || height > max) { if (width > height) { height = Math.round(height * max / width); width = max; } else { width = Math.round(width * max / height); height = max; } } const c = document.createElement('canvas'); c.width = width; c.height = height; c.getContext('2d')!.drawImage(im, 0, 0, width, height); setYgorsel(c.toDataURL('image/jpeg', 0.7)); }; im.src = reader.result as string; }; reader.readAsDataURL(file); };
  const yorumGonder = async () => {
    if (!yad.trim()) { alert('Adınızı girin'); return; }
    setYgonder(true);
    try { await api.post(`/public/store/${slug}/urun/${id}/yorum`, { ad: yad, puan: ypuan, yorum: yyorum, gorsel: ygorsel || undefined }); setYad(''); setYyorum(''); setYgorsel(''); setYpuan(5); load(); }
    catch (e) { alert(apiErrorMessage(e)); } finally { setYgonder(false); }
  };

  if (err) return <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 bg-slate-100">{err}</div>;
  if (!d) return <div className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-100">Yükleniyor...</div>;
  const dd = disc(p.eskiFiyat, p.satisFiyat); const imgs: string[] = p.images || [];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => nav('/')} className="p-1.5 rounded-lg hover:bg-slate-100"><ArrowLeft size={20} /></button>
          <Link to="/" className="flex items-center gap-1.5"><span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center"><Zap size={16} /></span></Link>
          <form onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value || ''; nav(`/?q=${encodeURIComponent(v)}`); }} className="relative flex-1 max-w-xl"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input name="q" placeholder="Ürün, kod veya marka ara..." className="w-full pl-9 pr-3 py-2 text-base bg-slate-100 rounded-xl outline-none" /></form>
          <Link to={slug ? `/uye/${slug}` : '/'} className="hidden sm:inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600"><User size={18} /> Hesabım</Link>
          <button onClick={() => nav('/')} className="text-slate-700"><ShoppingBag size={22} /></button>
        </div>
        {/* Üst menü (web) */}
        <nav className="hidden sm:block border-t border-slate-100">
          <div className="max-w-5xl mx-auto px-4 flex items-center gap-1">
            {[['tumu', 'Tümü'], ['indirim', 'İndirimdekiler'], ['coksatan', 'Çok Satanlar'], ['yeni', 'Yeni Fırsatlar'], ['sonsans', 'Son Şans']].map(([k, t]) => (
              <Link key={k} to={`/?kat=${k}`} className="px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-indigo-600">{t}</Link>
            ))}
          </div>
        </nav>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4 grid md:grid-cols-2 gap-6">
        {/* Görseller */}
        <div>
          <div className="relative rounded-2xl overflow-hidden bg-white border border-slate-100 aspect-square cursor-zoom-in" onClick={() => imgs[imgIdx] && setLightbox(imgs[imgIdx])}>
            {imgs[imgIdx] ? <img src={imgs[imgIdx]} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300">Görsel yok</div>}
            {dd > 0 && <span className="absolute top-3 left-3 text-xs font-bold bg-red-500 text-white px-2 py-1 rounded">%{dd} İNDİRİM</span>}
          </div>
          {imgs.length > 1 && <div className="flex gap-2 mt-2 overflow-x-auto">{imgs.map((im, i) => <button key={i} onClick={() => setImgIdx(i)} className={`w-16 h-16 rounded-lg overflow-hidden border-2 shrink-0 ${i === imgIdx ? 'border-indigo-500' : 'border-transparent'}`}><img src={im} className="w-full h-full object-cover" /></button>)}</div>}
        </div>

        {/* Bilgi */}
        <div>
          {p.marka && <p className="text-xs text-slate-400 uppercase">{p.marka}</p>}
          <h1 className="text-xl font-bold text-slate-900">{p.ad}</h1>
          <div className="flex items-center gap-2 mt-1"><Stars value={d.puanOrt} /><span className="text-sm text-slate-500">{d.puanOrt || 0} ({d.yorumSayi} değerlendirme)</span></div>
          <div className="flex items-center gap-2 mt-3">{dd > 0 && <span className="text-slate-400 line-through">{fmt(p.eskiFiyat)}</span>}<span className="text-2xl font-extrabold text-red-600">{fmt(fiyat)}</span></div>
          <p className={`text-sm mt-1 flex items-center gap-1 ${(p.stokAdeti || 0) > 0 ? 'text-green-600' : 'text-red-500'}`}><span className={`w-2 h-2 rounded-full ${(p.stokAdeti || 0) > 0 ? 'bg-green-500' : 'bg-red-500'}`} /> {(p.stokAdeti || 0) > 0 ? 'Stokta var' : 'Stok yok'}</p>

          {(p.variations || []).length > 0 && (
            <div className="mt-4"><p className="text-sm font-medium text-slate-700 mb-2">Beden / Varyasyon</p><div className="flex flex-wrap gap-2">{p.variations.map((v: any) => <button key={v.deger} disabled={v.stok <= 0} onClick={() => setVarSel(v.deger)} className={`px-3.5 py-2 rounded-xl border text-sm ${varSel === v.deger ? 'bg-indigo-600 text-white border-indigo-600' : v.stok <= 0 ? 'border-slate-200 text-slate-300 line-through' : 'border-slate-200 text-slate-700'}`}>{v.deger}</button>)}</div></div>
          )}

          <div className="flex items-center gap-3 mt-4">
            <div className="flex items-center border border-slate-200 rounded-xl"><button onClick={() => setAdet(Math.max(1, adet - 1))} className="px-3 py-2">−</button><span className="px-3 text-sm">{adet}</span><button onClick={() => setAdet(adet + 1)} className="px-3 py-2">+</button></div>
            <button onClick={sepeteEkle} disabled={busy || (p.stokAdeti || 0) <= 0} className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"><ShoppingBag size={18} /> {busy ? 'Hazırlanıyor...' : 'Sepete Ekle'}</button>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4">
            {[[Truck, 'Ücretsiz Kargo'], [RotateCcw, '14 Gün İade'], [ShieldCheck, 'Güvenli Ödeme']].map(([Ic, t]: any, i) => <div key={i} className="bg-white rounded-xl border border-slate-100 p-2 text-center"><Ic size={18} className="mx-auto text-indigo-600" /><p className="text-[10px] text-slate-500 mt-1">{t}</p></div>)}
          </div>

          {p.aciklama && <div className="mt-5"><p className="font-semibold text-slate-800 mb-1">Ürün Açıklaması</p><p className="text-sm text-slate-600 whitespace-pre-line">{p.aciklama}</p></div>}
        </div>
      </div>

      {/* Değerlendirmeler */}
      <div className="max-w-5xl mx-auto px-4 pb-10">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4"><h2 className="font-bold text-slate-800">Değerlendirmeler & Yorumlar</h2><div className="flex items-center gap-2"><Stars value={d.puanOrt} size={16} /><span className="text-sm text-slate-500">{d.puanOrt || 0} / 5 · {d.yorumSayi} yorum</span></div></div>

          {/* Yorum yaz */}
          <div className="bg-slate-50 rounded-xl p-4 mb-5">
            <p className="text-sm font-semibold text-slate-700 mb-2">Bu ürünü değerlendir</p>
            <div className="flex items-center gap-3 mb-2"><Stars value={ypuan} size={22} onPick={setYpuan} /><span className="text-xs text-slate-400">Puanınız: {ypuan}/5</span></div>
            <div className="grid sm:grid-cols-2 gap-2 mb-2"><input value={yad} onChange={(e) => setYad(e.target.value)} placeholder="Adınız" className="px-3 py-2 text-base border border-slate-200 rounded-lg" /></div>
            <textarea value={yyorum} onChange={(e) => setYyorum(e.target.value)} rows={3} placeholder="Ürün hakkında düşüncelerinizi paylaşın..." className="w-full px-3 py-2 text-base border border-slate-200 rounded-lg" />
            <div className="flex items-center gap-3 mt-2">
              <label className="inline-flex items-center gap-1.5 text-sm text-indigo-600 cursor-pointer"><ImagePlus size={18} /> Fotoğraf Ekle<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickImg(f); }} /></label>
              {ygorsel && <div className="relative"><img src={ygorsel} className="w-12 h-12 rounded object-cover" /><button onClick={() => setYgorsel('')} className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-slate-700 text-white rounded-full text-[10px]">×</button></div>}
              <button onClick={yorumGonder} disabled={ygonder} className="ml-auto bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><Send size={15} /> Gönder</button>
            </div>
          </div>

          {/* Yorum listesi */}
          <div className="space-y-4">
            {(d.yorumlar || []).length === 0 && <p className="text-sm text-slate-400 text-center py-6">Henüz değerlendirme yok. İlk yorumu siz yazın!</p>}
            {(d.yorumlar || []).map((y: any) => (
              <div key={y.id} className="border-b border-slate-100 pb-4 last:border-0">
                <div className="flex items-center gap-2"><div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">{(y.ad || '?')[0].toUpperCase()}</div><div><p className="text-sm font-semibold text-slate-800">{y.ad}</p><div className="flex items-center gap-2"><Stars value={y.puan} size={12} /><span className="text-[11px] text-slate-400">{new Date(y.createdAt).toLocaleDateString('tr-TR')}</span></div></div></div>
                {y.yorum && <p className="text-sm text-slate-600 mt-2">{y.yorum}</p>}
                {y.gorsel && <img src={y.gorsel} onClick={() => setLightbox(y.gorsel)} className="w-20 h-20 rounded-lg object-cover mt-2 cursor-zoom-in" />}
              </div>
            ))}
          </div>
        </div>

        {/* Benzer ürünler */}
        {(d.benzer || []).length > 0 && (
          <div className="mt-6"><h2 className="font-bold text-slate-800 mb-3">Benzer Ürünler</h2><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{d.benzer.map((b: any) => (
            <Link key={b.id} to={`/urun/${b.id}`} className="bg-white rounded-2xl border border-slate-100 overflow-hidden"><div className="aspect-square bg-slate-50">{(b.images || [])[0] && <img src={b.images[0]} className="w-full h-full object-cover" />}</div><div className="p-2.5"><p className="text-xs font-medium text-slate-800 truncate">{b.ad}</p><p className="text-sm font-bold text-red-600 mt-0.5">{fmt(b.satisFiyat)}</p></div></Link>
          ))}</div></div>
        )}
      </div>

      {lightbox && <div className="fixed inset-0 z-[120] bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(null)}><img src={lightbox} className="max-w-full max-h-full rounded-xl" /><button className="absolute top-5 right-5 text-white/80"><X size={28} /></button></div>}
    </div>
  );
}
