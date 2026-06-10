import { useEffect, useState } from 'react';
import { Activity, Users, Eye, Tag, Package, ShoppingCart, CreditCard, Smartphone, Monitor, TrendingUp, ShoppingBag, PartyPopper } from 'lucide-react';
import api from '../lib/api';

const EKRANLAR = [
  { k: 'browse', t: 'Geziniyor', Ic: Eye, cls: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400' },
  { k: 'category', t: 'Kategori İnceliyor', Ic: Tag, cls: 'bg-sky-100 text-sky-600', bar: 'bg-sky-500' },
  { k: 'product', t: 'Ürün İnceliyor', Ic: Package, cls: 'bg-violet-100 text-violet-600', bar: 'bg-violet-500' },
  { k: 'cart', t: 'Sepette', Ic: ShoppingCart, cls: 'bg-amber-100 text-amber-600', bar: 'bg-amber-500' },
  { k: 'checkout', t: 'Ödeme Ekranında', Ic: CreditCard, cls: 'bg-emerald-100 text-emerald-600', bar: 'bg-emerald-500' },
];

const HUNI = [
  { k: 'view', t: 'Siteye Giriş', Ic: Eye },
  { k: 'category', t: 'Kategori', Ic: Tag },
  { k: 'product', t: 'Ürün', Ic: Package },
  { k: 'cart_add', t: 'Sepete Ekledi', Ic: ShoppingBag },
  { k: 'checkout', t: 'Ödeme', Ic: CreditCard },
  { k: 'order', t: 'Sipariş', Ic: PartyPopper },
];

const relTime = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sn önce`;
  const m = Math.floor(s / 60); if (m < 60) return `${m} dk önce`;
  return `${Math.floor(m / 60)} sa önce`;
};

function feedText(e: any) {
  const l = e.label ? `"${e.label}"` : '';
  switch (e.type) {
    case 'view': return { msg: 'siteye girdi', Ic: Eye, c: 'text-slate-500' };
    case 'category': return { msg: `${l} kategorisine baktı`, Ic: Tag, c: 'text-sky-600' };
    case 'product': return { msg: `${l} ürününü inceledi`, Ic: Package, c: 'text-violet-600' };
    case 'cart_add': return { msg: `${l} ürününü sepete ekledi`, Ic: ShoppingBag, c: 'text-amber-600' };
    case 'cart_view': return { msg: 'sepetini açtı', Ic: ShoppingCart, c: 'text-amber-600' };
    case 'checkout': return { msg: 'ödeme ekranına geçti', Ic: CreditCard, c: 'text-emerald-600' };
    case 'order': return { msg: 'sipariş verdi 🎉', Ic: PartyPopper, c: 'text-green-600' };
    default: return { msg: e.type, Ic: Activity, c: 'text-slate-500' };
  }
}

export default function CanliAkis() {
  const [d, setD] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => api.get('/store/live/activity').then((r) => { if (alive) { setD(r.data); setLoaded(true); } }).catch(() => { if (alive) setLoaded(true); });
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const ekran = d?.ekran || {};
  const huni = d?.huni || {};
  const cihaz = d?.cihaz || { mobil: 0, web: 0 };
  const online = d?.online || 0;
  const maxEkran = Math.max(1, ...EKRANLAR.map((e) => ekran[e.k] || 0));
  const huniMax = Math.max(1, ...HUNI.map((h) => huni[h.k] || 0));

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center"><Activity className="text-rose-600" size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">Canlı Akışı İzle <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> CANLI</span></h1>
            <p className="text-sm text-slate-400">Mağazanızdaki ziyaretçileri gerçek zamanlı izleyin — kim nerede, ne yapıyor.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-2.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center"><Users size={18} /></div>
            <div><p className="text-[11px] text-slate-400 leading-none">Şu an online</p><p className="text-2xl font-bold text-slate-800 leading-tight">{online}</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-2.5">
            <p className="text-[11px] text-slate-400 mb-1">Cihaz</p>
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 text-slate-600"><Smartphone size={14} className="text-indigo-500" /> {cihaz.mobil || 0}</span>
              <span className="inline-flex items-center gap-1 text-slate-600"><Monitor size={14} className="text-sky-500" /> {cihaz.web || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {!loaded ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex justify-center"><span className="w-7 h-7 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* Ekran dağılımı */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {EKRANLAR.map((e) => { const v = ekran[e.k] || 0; const Ic = e.Ic; return (
              <div key={e.k} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${e.cls}`}><Ic size={18} /></div><p className="text-[12px] text-slate-500 leading-tight">{e.t}</p></div>
                <p className="text-3xl font-bold text-slate-800">{v}</p>
                <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className={`h-full rounded-full ${e.bar}`} style={{ width: `${(v / maxEkran) * 100}%` }} /></div>
              </div>
            ); })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-5 items-start">
            {/* Sol: huni + kategori/ürün */}
            <div className="space-y-5 min-w-0">
              {/* Dönüşüm hunisi (son 30 dk) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2"><TrendingUp size={16} className="text-indigo-600" /> Dönüşüm Hunisi <span className="text-xs text-slate-400 font-normal">(son 30 dk)</span></h3>
                <p className="text-xs text-slate-400 mb-3">Ziyaretçilerin alışveriş akışında hangi adımda kaç hareket oldu.</p>
                <div className="space-y-2">
                  {HUNI.map((h) => { const v = huni[h.k] || 0; const Ic = h.Ic; return (
                    <div key={h.k} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 inline-flex items-center gap-2 text-sm text-slate-600"><Ic size={15} className="text-slate-400" /> {h.t}</span>
                      <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden relative">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg flex items-center justify-end px-2" style={{ width: `${Math.max(6, (v / huniMax) * 100)}%` }}><span className="text-[11px] font-bold text-white">{v}</span></div>
                      </div>
                    </div>
                  ); })}
                </div>
              </div>

              {/* Kategori + ürün izleyenler */}
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Tag size={15} className="text-sky-600" /> Kategori İnceleyenler</h3>
                  <div className="space-y-2">
                    {(d?.kategoriler || []).map((c: any) => (
                      <div key={c.ad} className="flex items-center justify-between text-sm"><span className="text-slate-600 truncate pr-2">{c.ad}</span><span className="font-bold text-sky-600 shrink-0">{c.sayi} kişi</span></div>
                    ))}
                    {(!d?.kategoriler || d.kategoriler.length === 0) && <p className="text-sm text-slate-400">Şu an kategori inceleyen yok.</p>}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Package size={15} className="text-violet-600" /> Ürün İnceleyenler</h3>
                  <div className="space-y-2">
                    {(d?.urunler || []).map((c: any) => (
                      <div key={c.ad} className="flex items-center justify-between text-sm"><span className="text-slate-600 truncate pr-2">{c.ad}</span><span className="font-bold text-violet-600 shrink-0">{c.sayi} kişi</span></div>
                    ))}
                    {(!d?.urunler || d.urunler.length === 0) && <p className="text-sm text-slate-400">Şu an ürün inceleyen yok.</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Sağ: canlı akış feed */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Activity size={16} className="text-rose-600" /> Canlı Akış</h3>
              <div className="space-y-2.5 max-h-[70vh] overflow-y-auto">
                {(d?.feed || []).map((e: any) => { const f = feedText(e); const Ic = f.Ic; return (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <span className={`w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 ${f.c}`}><Ic size={14} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-slate-700 leading-snug"><span className="font-medium">Bir ziyaretçi</span> {f.msg}</p>
                      <p className="text-[10px] text-slate-400">{relTime(e.at)}</p>
                    </div>
                  </div>
                ); })}
                {(!d?.feed || d.feed.length === 0) && <p className="text-sm text-slate-400 py-6 text-center">Henüz hareket yok. Ziyaretçiler geldikçe burada görünecek.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
