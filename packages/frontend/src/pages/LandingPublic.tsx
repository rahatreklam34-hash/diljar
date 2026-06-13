import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import api from '../lib/api';
import { landingIcon } from '../lib/landingIcons';

interface LBtn { id: string; label: string; url?: string; icon?: string; renk?: string }
interface LData {
  baslik: string;
  tagline: string;
  panelBaslik: string;
  logo: string;
  bgStart: string;
  bgEnd: string;
  butonlar: LBtn[];
}

export default function LandingPublic() {
  const { slug } = useParams();
  const [data, setData] = useState<LData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    api.get(`/public/landing/${slug}`)
      .then((r) => { if (!alive) return; setData(r.data); setState('ok'); if (r.data?.baslik) document.title = r.data.baslik; })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [slug]);

  if (state === 'loading') {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900"><span className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>;
  }
  if (state === 'error' || !data) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white/70 text-sm px-6 text-center">Sayfa bulunamadı.</div>;
  }

  const bgStart = data.bgStart || '#0b1736';
  const bgEnd = data.bgEnd || '#1e3a8a';
  const butonlar = Array.isArray(data.butonlar) ? data.butonlar : [];

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: `linear-gradient(160deg, ${bgStart} 0%, ${bgEnd} 100%)` }}>
      <div className="w-full max-w-md px-5 py-8 flex flex-col">
        {/* Marka */}
        <div className="flex items-center gap-3.5 mb-7">
          {data.logo
            ? <img src={data.logo} alt={data.baslik} className="w-16 h-16 rounded-full object-cover ring-2 ring-white/20 shrink-0" />
            : <div className="w-16 h-16 rounded-full bg-white/10 ring-2 ring-white/20 shrink-0" />}
          <div className="min-w-0">
            <h1 className="text-white font-extrabold text-2xl leading-tight tracking-tight uppercase break-words">{data.baslik || 'Mağaza'}</h1>
            {data.tagline && <p className="text-white/70 text-sm mt-0.5">{data.tagline}</p>}
          </div>
        </div>

        {/* Panel başlığı */}
        {data.panelBaslik && (
          <h2 className="text-white text-center font-semibold text-lg mb-5">{data.panelBaslik}</h2>
        )}

        {/* Butonlar */}
        <div className="space-y-3.5">
          {butonlar.map((b) => {
            const Ic = landingIcon(b.icon);
            const inner = (
              <>
                <span className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: b.renk || '#0f172a' }}>
                  <Ic size={22} strokeWidth={2.2} />
                </span>
                <span className="flex-1 font-extrabold text-slate-900 uppercase leading-tight text-lg tracking-tight">{b.label || 'Buton'}</span>
                <span className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0"><ChevronRight size={18} /></span>
              </>
            );
            const cls = 'w-full bg-white rounded-2xl px-3.5 py-3 flex items-center gap-3.5 shadow-lg transition active:scale-[0.98]';
            return b.url
              ? <a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer" className={cls + ' hover:shadow-xl'}>{inner}</a>
              : <div key={b.id} className={cls + ' opacity-90'}>{inner}</div>;
          })}
          {butonlar.length === 0 && <p className="text-white/50 text-center text-sm py-8">Henüz buton eklenmemiş.</p>}
        </div>

        <div className="flex-1" />
      </div>
    </div>
  );
}
