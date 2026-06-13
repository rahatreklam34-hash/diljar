import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, ArrowUp, ArrowDown, ExternalLink, Copy, Check, ChevronRight, LayoutTemplate, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import ImageDropzone from '../components/ImageDropzone';
import { LANDING_ICON_LIST, landingIcon } from '../lib/landingIcons';

const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const PALETTE = ['#0f172a', '#db2777', '#f97316', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#ef4444', '#7c3aed', '#14b8a6'];

const DEFAULT_BUTTONS = [
  { id: 'b1', label: 'WHATSAPP KAYIT', url: '', icon: 'phone', renk: '#db2777' },
  { id: 'b2', label: 'YAYIN ÖZETİ', url: '', icon: 'megaphone', renk: '#f97316' },
  { id: 'b3', label: 'İNDİRİMLİ ÜRÜNLER', url: '', icon: 'tag', renk: '#f59e0b' },
  { id: 'b4', label: 'GÖZLÜK KATALOĞU', url: '', icon: 'glasses', renk: '#0f172a' },
];
const DEFAULTS = { tagline: 'Trend Burada Başlar !!', panelBaslik: 'Müşteri Destek Paneli', bgStart: '#0b1736', bgEnd: '#1e3a8a' };

export default function LandingPage() {
  const { storeSetting, reload } = useStore();
  const ss: any = storeSetting || {};
  const slug = ss.slug || '';
  const [lp, setLp] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!storeSetting) return;
    const cur = (ss.config && ss.config.landingPage) || {};
    setLp({
      baslik: cur.baslik ?? (ss.logoText || ''),
      tagline: cur.tagline ?? DEFAULTS.tagline,
      panelBaslik: cur.panelBaslik ?? DEFAULTS.panelBaslik,
      logo: cur.logo ?? (ss.config?.logo || ''),
      bgStart: cur.bgStart ?? DEFAULTS.bgStart,
      bgEnd: cur.bgEnd ?? DEFAULTS.bgEnd,
      butonlar: Array.isArray(cur.butonlar) && cur.butonlar.length ? cur.butonlar : DEFAULT_BUTTONS,
    });
  }, [storeSetting]);

  if (!lp) return <div className="p-6 text-slate-400 text-sm">Yükleniyor…</div>;

  const set = (k: string, v: any) => setLp((x: any) => ({ ...x, [k]: v }));
  const setBtn = (id: string, patch: any) => setLp((x: any) => ({ ...x, butonlar: x.butonlar.map((b: any) => b.id === id ? { ...b, ...patch } : b) }));
  const addBtn = () => setLp((x: any) => ({ ...x, butonlar: [...x.butonlar, { id: uid(), label: 'YENİ BUTON', url: '', icon: 'link', renk: '#0f172a' }] }));
  const delBtn = (id: string) => setLp((x: any) => ({ ...x, butonlar: x.butonlar.filter((b: any) => b.id !== id) }));
  const moveBtn = (id: string, dir: -1 | 1) => setLp((x: any) => { const a = [...x.butonlar]; const i = a.findIndex((b: any) => b.id === id); const j = i + dir; if (j < 0 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, butonlar: a }; });

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/store/settings', { config: { ...(ss.config || {}), landingPage: lp } });
      toast.success('Landing Page kaydedildi');
      await reload();
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setSaving(false); }
  };

  const publicUrl = `${window.location.origin}/lp/${slug}`;
  const copyLink = () => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><LayoutTemplate size={20} /></span>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Landing Page</h1>
            <p className="text-xs text-slate-400">Dışarıya açık destek/bağlantı sayfanızı düzenleyin</p>
          </div>
        </div>
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg"><Save size={16} />{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>

      {/* Genel link çubuğu */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 mb-5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400 shrink-0">Genel Link</span>
        {slug ? (
          <>
            <code className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 flex-1 min-w-0 truncate">{publicUrl}</code>
            <button onClick={copyLink} className="inline-flex items-center gap-1 text-xs border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg text-slate-600">{copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}{copied ? 'Kopyalandı' : 'Kopyala'}</button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1.5 rounded-lg"><ExternalLink size={14} />Aç</a>
          </>
        ) : (
          <span className="text-xs text-amber-600">Önce Online Mağazam ayarlarından mağaza kısa adını (slug) belirleyin.</span>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        {/* ── Editör ── */}
        <div className="space-y-5">
          {/* Marka & Görünüm */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700">Marka & Görünüm</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="block text-xs text-slate-500 mb-1">Başlık (Marka Adı)</label><input value={lp.baslik} onChange={(e) => set('baslik', e.target.value)} placeholder="LACOS KENAN" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div><label className="block text-xs text-slate-500 mb-1">Slogan (Tagline)</label><input value={lp.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Trend Burada Başlar !!" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              <div className="sm:col-span-2"><label className="block text-xs text-slate-500 mb-1">Panel Başlığı</label><input value={lp.panelBaslik} onChange={(e) => set('panelBaslik', e.target.value)} placeholder="Müşteri Destek Paneli" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            </div>
            <div><label className="block text-xs text-slate-500 mb-1">Logo</label><ImageDropzone images={lp.logo ? [lp.logo] : []} onChange={(imgs) => set('logo', imgs[0] || '')} max={1} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Arka Plan (Üst)</label>
                <div className="flex items-center gap-2"><input type="color" value={lp.bgStart} onChange={(e) => set('bgStart', e.target.value)} className="w-9 h-9 rounded border border-slate-200 p-0.5" /><input value={lp.bgStart} onChange={(e) => set('bgStart', e.target.value)} className="flex-1 px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Arka Plan (Alt)</label>
                <div className="flex items-center gap-2"><input type="color" value={lp.bgEnd} onChange={(e) => set('bgEnd', e.target.value)} className="w-9 h-9 rounded border border-slate-200 p-0.5" /><input value={lp.bgEnd} onChange={(e) => set('bgEnd', e.target.value)} className="flex-1 px-2 py-2 text-sm border border-slate-200 rounded-lg" /></div>
              </div>
            </div>
          </div>

          {/* Butonlar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">Butonlar</h2>
              <button onClick={addBtn} className="inline-flex items-center gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-lg"><Plus size={14} />Buton Ekle</button>
            </div>
            <div className="space-y-3">
              {lp.butonlar.map((b: any, i: number) => {
                const Ic = landingIcon(b.icon);
                return (
                  <div key={b.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: b.renk || '#0f172a' }}><Ic size={18} /></span>
                      <input value={b.label} onChange={(e) => setBtn(b.id, { label: e.target.value })} placeholder="Buton adı" className="flex-1 min-w-0 px-2.5 py-2 text-sm font-medium border border-slate-200 rounded-lg" />
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => moveBtn(b.id, -1)} disabled={i === 0} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ArrowUp size={14} /></button>
                        <button onClick={() => moveBtn(b.id, 1)} disabled={i === lp.butonlar.length - 1} className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 disabled:opacity-30"><ArrowDown size={14} /></button>
                        <button onClick={() => delBtn(b.id)} className="p-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <Link2 size={15} className="text-slate-400 shrink-0" />
                      <input value={b.url} onChange={(e) => setBtn(b.id, { url: e.target.value })} placeholder="https://… (bağlantı)" className="flex-1 min-w-0 px-2.5 py-2 text-sm border border-slate-200 rounded-lg" />
                    </div>
                    <div className="flex items-start gap-3 flex-wrap">
                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1">İkon</span>
                        <div className="flex flex-wrap gap-1 max-w-[260px]">
                          {LANDING_ICON_LIST.map((name) => { const IcO = landingIcon(name); return (
                            <button key={name} onClick={() => setBtn(b.id, { icon: name })} title={name} className={`w-7 h-7 rounded-lg flex items-center justify-center border ${b.icon === name ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}><IcO size={15} /></button>
                          ); })}
                        </div>
                      </div>
                      <div>
                        <span className="block text-[11px] text-slate-400 mb-1">İkon Rengi</span>
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {PALETTE.map((c) => <button key={c} onClick={() => setBtn(b.id, { renk: c })} className={`w-7 h-7 rounded-lg border-2 ${b.renk === c ? 'border-slate-800' : 'border-transparent'}`} style={{ background: c }} />)}
                          <input type="color" value={b.renk || '#0f172a'} onChange={(e) => setBtn(b.id, { renk: e.target.value })} className="w-7 h-7 rounded-lg border border-slate-200 p-0.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {lp.butonlar.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Henüz buton yok. "Buton Ekle" ile başlayın.</p>}
            </div>
          </div>
        </div>

        {/* ── Önizleme ── */}
        <div className="lg:sticky lg:top-4">
          <p className="text-xs text-slate-400 mb-2 text-center">Önizleme</p>
          <div className="mx-auto rounded-[2rem] border-8 border-slate-900 overflow-hidden shadow-xl max-w-[320px]">
            <div className="px-4 py-6 min-h-[560px] flex flex-col" style={{ background: `linear-gradient(160deg, ${lp.bgStart} 0%, ${lp.bgEnd} 100%)` }}>
              <div className="flex items-center gap-3 mb-6">
                {lp.logo ? <img src={lp.logo} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-white/20 shrink-0" /> : <div className="w-14 h-14 rounded-full bg-white/10 ring-2 ring-white/20 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-white font-extrabold text-xl leading-tight uppercase break-words">{lp.baslik || 'Mağaza'}</div>
                  {lp.tagline && <div className="text-white/70 text-xs mt-0.5">{lp.tagline}</div>}
                </div>
              </div>
              {lp.panelBaslik && <div className="text-white text-center font-semibold text-base mb-4">{lp.panelBaslik}</div>}
              <div className="space-y-3">
                {lp.butonlar.map((b: any) => { const Ic = landingIcon(b.icon); return (
                  <div key={b.id} className="w-full bg-white rounded-2xl px-3 py-2.5 flex items-center gap-3 shadow-lg">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: b.renk || '#0f172a' }}><Ic size={19} strokeWidth={2.2} /></span>
                    <span className="flex-1 font-extrabold text-slate-900 uppercase leading-tight text-base">{b.label || 'Buton'}</span>
                    <span className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center shrink-0"><ChevronRight size={16} /></span>
                  </div>
                ); })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
