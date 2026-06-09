import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Tag, Clock, Package, X, Store } from 'lucide-react';
import api from '../lib/api';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const GENDER_LBL: Record<string, string> = { kadin: 'Kadın', erkek: 'Erkek', cocuk: 'Çocuk', unisex: 'Unisex' };

function geriSayim(ms: number) {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const sa = Math.floor(s / 3600), dk = Math.floor((s % 3600) / 60), sn = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return sa > 0 ? `${sa}:${pad(dk)}:${pad(sn)}` : `${pad(dk)}:${pad(sn)}`;
}

export default function KatalogPublic() {
  const { slug } = useParams();
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [zoom, setZoom] = useState('');

  useEffect(() => { api.get(`/public/katalog/${slug}`).then((r) => { setData(r.data); setLoaded(true); }).catch(() => setLoaded(true)); }, [slug]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // 30 sn'de bir veri tazele (yeni okutulan ürünler görünsün)
  useEffect(() => { const t = setInterval(() => api.get(`/public/katalog/${slug}`).then((r) => setData(r.data)).catch(() => {}), 30000); return () => clearInterval(t); }, [slug]);

  const items: any[] = useMemo(() => data?.items || [], [data]);

  if (loaded && !data) return <div className="min-h-screen flex items-center justify-center text-slate-400">Katalog bulunamadı.</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {data?.logo ? <img src={data.logo} className="w-10 h-10 rounded-lg object-cover" /> : <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center"><Store size={18} className="text-indigo-600" /></div>}
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">{data?.ad || 'Ürün Kataloğu'}</h1>
            <p className="text-[11px] text-slate-400">{items.length} ürün · canlı katalog</p>
          </div>
          {data?.slug && <a href={`/m/${data.slug}`} className="ml-auto text-xs font-medium text-indigo-600 hover:underline">Mağazaya git →</a>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {!loaded ? (
          <p className="text-center text-slate-400 py-16">Yükleniyor...</p>
        ) : items.length === 0 ? (
          <div className="text-center text-slate-400 py-16"><Package size={32} className="mx-auto mb-3 text-slate-300" /><p>Katalogda henüz ürün yok.</p></div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((p) => {
              const flashAktif = p.flashFiyat && p.flashBitis && new Date(p.flashBitis).getTime() > now;
              const fiyat = flashAktif ? p.flashFiyat : p.satisFiyat;
              const eski = flashAktif ? p.satisFiyat : (p.eskiFiyat && p.eskiFiyat > p.satisFiyat ? p.eskiFiyat : 0);
              const ind = eski > 0 ? Math.round(((eski - fiyat) / eski) * 100) : 0;
              const kalan = flashAktif ? geriSayim(new Date(p.flashBitis).getTime() - now) : null;
              const bedenler = (p.variations || []).filter((v: any) => (v.stok || 0) > 0);
              const img = (p.images || [])[0] || '';
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
                  <div className="relative aspect-square bg-slate-100">
                    <button onClick={() => img && setZoom(img)} className="w-full h-full cursor-zoom-in">{img ? <img src={img} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={26} /></span>}</button>
                    {ind > 0 && <span className="absolute top-2 left-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">%{ind}</span>}
                    {kalan && <span className="absolute bottom-0 inset-x-0 bg-rose-600/95 text-white text-[11px] font-bold py-1 flex items-center justify-center gap-1"><Clock size={12} /> {kalan}</span>}
                  </div>
                  <div className="p-2.5 flex flex-col flex-1">
                    <p className="text-[13px] font-medium text-slate-800 leading-tight line-clamp-2">{p.ad}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{p.salesCode || '-'}{p.marka ? ` · ${p.marka}` : ''}{p.cinsiyet ? ` · ${GENDER_LBL[p.cinsiyet] || p.cinsiyet}` : ''}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {eski > 0 && <span className="text-[11px] text-slate-300 line-through">{fmt(eski)}</span>}
                      <span className={`text-base font-bold ${ind > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{fmt(fiyat)}</span>
                    </div>
                    {bedenler.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">{bedenler.slice(0, 6).map((v: any) => <span key={v.deger} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-600">{v.deger}</span>)}</div>
                    ) : <p className="text-[10px] text-slate-400 mt-1.5">{(p.stokAdeti || 0) > 0 ? `${p.stokAdeti} adet stokta` : 'Tükendi'}</p>}
                    {flashAktif && <p className="mt-auto pt-2 text-[10px] text-rose-500 font-medium flex items-center gap-1"><Tag size={11} /> Süreli indirim</p>}
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
