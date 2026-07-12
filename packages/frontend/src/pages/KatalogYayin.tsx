import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Package, X, Store, Radio } from 'lucide-react';
import api from '../lib/api';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function KatalogYayin() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState('');
  const [copiedKod, setCopiedKod] = useState('');
  const copyKod = (kod: string) => {
    if (!kod) return;
    try { navigator.clipboard?.writeText(kod); } catch { /* */ }
    setCopiedKod(kod);
    setTimeout(() => setCopiedKod((c) => (c === kod ? '' : c)), 1200);
  };

  useEffect(() => { api.get(`/public/katalog/stream/${token}`).then((r) => { setData(r.data); setLoaded(true); }).catch(() => setLoaded(true)); }, [token]);
  // 20 sn'de bir veri tazele (yayında yeni okutulan ürünler görünsün)
  useEffect(() => { const t = setInterval(() => api.get(`/public/katalog/stream/${token}`).then((r) => setData(r.data)).catch(() => {}), 20000); return () => clearInterval(t); }, [token]);

  const items: any[] = useMemo(() => data?.items || [], [data]);

  if (loaded && !data) return <div className="min-h-screen flex items-center justify-center text-slate-400">Katalog bulunamadı.</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center"><Radio size={18} className="text-rose-600" /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">{data?.ad || 'Canlı Yayın Kataloğu'}</h1>
            <p className="text-[11px] text-slate-400">{items.length} ürün · {data?.aktif ? 'yayın devam ediyor' : 'yayın bitti'}</p>
          </div>
          <a href="/" className="ml-auto text-xs font-medium text-indigo-600 hover:underline">Mağazaya git →</a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {!loaded ? (
          <div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="text-center text-slate-400 py-16"><Package size={32} className="mx-auto mb-3 text-slate-300" /><p>Bu yayında henüz ürün sunulmadı.</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((p) => {
              const eski = p.eskiFiyat && p.eskiFiyat > p.satisFiyat ? p.eskiFiyat : 0;
              const ind = eski > 0 ? Math.round(((eski - p.satisFiyat) / eski) * 100) : 0;
              const bedenler = (p.variations || []).filter((v: any) => (v.stok || 0) > 0);
              const img = (p.images || [])[0] || '';
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
                  <div className="relative aspect-square bg-slate-100">
                    <button onClick={() => img && setZoom(img)} className="w-full h-full cursor-zoom-in">{img ? <img src={img} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={26} /></span>}</button>
                    {ind > 0 && <span className="absolute top-2 left-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">%{ind}</span>}
                  </div>
                  <div className="p-2.5 flex flex-col flex-1">
                    <p className="text-[13px] font-medium text-slate-800 leading-tight line-clamp-2">{p.ad}</p>
                    {p.salesCode && (
                      <button type="button" onClick={() => copyKod(p.salesCode)} title="Kodu kopyala"
                        className="mt-1 self-start inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md px-2 py-0.5 text-[13px] font-bold tracking-wide hover:bg-indigo-100 active:scale-95 transition">
                        <span className="text-[9px] font-semibold text-indigo-400 uppercase">Kod</span>
                        <span>{p.salesCode}</span>
                        {copiedKod === p.salesCode && <span className="text-[9px] text-emerald-600 font-semibold">✓ kopyalandı</span>}
                      </button>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      {eski > 0 && <span className="text-[11px] text-slate-300 line-through">{fmt(eski)}</span>}
                      <span className={`text-base font-bold ${ind > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmt(p.satisFiyat)}</span>
                    </div>
                    {bedenler.length > 0 ? (
                      <div className="mt-1.5">
                        <span className="text-[10px] font-semibold text-slate-500">Beden:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {bedenler.map((v: any) => (
                            <span key={v.deger} className="text-[12px] px-2 py-0.5 rounded-md border border-slate-300 bg-slate-50 text-slate-700 font-semibold">{v.deger}</span>
                          ))}
                        </div>
                      </div>
                    ) : (p.stokAdeti != null && <p className="text-[10px] text-slate-400 mt-1.5">{(p.stokAdeti || 0) > 0 ? `${p.stokAdeti} adet stokta` : 'Tükendi'}</p>)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80" onClick={() => setZoom('')}>
          <img src={zoom} className="max-w-full max-h-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setZoom('')} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
        </div>
      )}
    </div>
  );
}
