import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Package, X, Store, Copy, SlidersHorizontal } from 'lucide-react';

import api from '../lib/api';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const GENDER_LBL: Record<string, string> = { erkek: 'Erkek', kadin: 'Kadın', unisex: 'Unisex', cocuk: 'Çocuk' };
// İstenen sabit sıralama: Erkek, Kadın, Unisex, Çocuk
const GENDER_ORDER = ['erkek', 'kadin', 'unisex', 'cocuk'];
// Cinsiyet değerini kanonik anahtara indir (büyük/küçük + Türkçe i/ı farklarını birleştirir)
const normCins = (raw: string) => {
  const s = (raw || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, '').replace(/[ıİi]/g, 'i');
  if (s.startsWith('erkek') || s.startsWith('bay') && !s.startsWith('bayan')) return 'erkek';
  if (s.startsWith('kad') || s.startsWith('bayan')) return 'kadin';
  if (s.startsWith('coc') || s.startsWith('çoc') || s.startsWith('kid')) return 'cocuk';
  if (s.startsWith('uni')) return 'unisex';
  return s;
};
const cinsLabel = (raw: string) => GENDER_LBL[normCins(raw)] || (raw || '').trim();

const PAGE = 24;

// WhatsApp ikonu (lucide'de marka logosu yok)
function WaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.477-.957zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
    </svg>
  );
}

export default function KatalogTedarikci() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState('');
  const [sel, setSel] = useState<Record<string, string>>({});
  const [copiedKod, setCopiedKod] = useState('');
  const [fCinsiyet, setFCinsiyet] = useState('');
  const [fMarka, setFMarka] = useState('');
  const [fNumara, setFNumara] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const copyKod = (kod: string) => {
    if (!kod) return;
    try { navigator.clipboard?.writeText(kod); } catch { /* */ }
    setCopiedKod(kod);
    setTimeout(() => setCopiedKod((c) => (c === kod ? '' : c)), 1200);
  };

  useEffect(() => { api.get(`/public/katalog/tedarikci/${token}`).then((r) => { setData(r.data); setLoaded(true); }).catch(() => setLoaded(true)); }, [token]);

  const items: any[] = useMemo(() => data?.items || [], [data]);

  const markalar = useMemo(() => Array.from(new Set(items.map((p) => (p.marka || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr')), [items]);
  // Cinsiyet: normalize edilmiş anahtara göre tekilleştir (mükerrer girişleri engeller)
  const cinsiyetler = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => { const key = normCins(p.cinsiyet || ''); if (key) set.add(key); });
    const keys = Array.from(set);
    return keys.sort((a, b) => {
      const ia = GENDER_ORDER.indexOf(a), ib = GENDER_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return cinsLabel(a).localeCompare(cinsLabel(b), 'tr');
    });
  }, [items]);
  const numaralar = useMemo(() => {
    const s = new Set<string>();
    items.forEach((p) => (p.variations || []).forEach((v: any) => { if ((v.stok || 0) > 0 && v.deger) s.add(String(v.deger)); }));
    return Array.from(s).sort((a, b) => { const na = parseFloat(a), nb = parseFloat(b); return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b, 'tr'); });
  }, [items]);

  const filtered = useMemo(() => items.filter((p) => {
    if (fCinsiyet && normCins(p.cinsiyet || '') !== fCinsiyet) return false;
    if (fMarka && (p.marka || '') !== fMarka) return false;
    if (fNumara && !(p.variations || []).some((v: any) => (v.stok || 0) > 0 && String(v.deger) === fNumara)) return false;
    return true;
  }), [items, fCinsiyet, fMarka, fNumara]);

  const aktifFiltre = !!(fCinsiyet || fMarka || fNumara);
  const filtreTemizle = () => { setFCinsiyet(''); setFMarka(''); setFNumara(''); };

  // Filtre/veri değişince görünür sayacı sıfırla
  useEffect(() => { setVisible(PAGE); }, [fCinsiyet, fMarka, fNumara, items]);

  // Aşağı kaydırınca tedrici yükle (infinite scroll)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver((ents) => { if (ents[0]?.isIntersecting) setVisible((v) => (v < filtered.length ? Math.min(v + PAGE, filtered.length) : v)); }, { rootMargin: '700px' });
    ob.observe(el);
    return () => ob.disconnect();
  }, [filtered.length, loaded]);

  const shown = filtered.slice(0, visible);

  const buildMsg = (p: any, beden: string) => {
    const lines = ['DİLJAR.COM SİPARİŞ TALEBİ', '', p.ad];
    if (p.salesCode) lines.push(`Satış Kodu: ${p.salesCode}`);
    if (beden) lines.push(`Beden: ${beden}`);
    lines.push(`Fiyat: ${fmt(p.satisFiyat)}`);
    return lines.join('\n');
  };

  const waOpen = (p: any, hasBeden: boolean) => {
    const beden = sel[p.id] || '';
    if (hasBeden && !beden) { alert('Lütfen önce bir beden seçin.'); return; }
    const num = String(data?.whatsapp || '05334413472').replace(/[^0-9]/g, '');
    const url = `https://wa.me/${num}?text=${encodeURIComponent(buildMsg(p, beden))}`;
    window.open(url, '_blank');
  };

  if (loaded && !data) return <div className="min-h-screen flex items-center justify-center text-slate-400">Katalog bulunamadı.</div>;

  const hasFiltre = markalar.length > 0 || cinsiyetler.length > 0 || numaralar.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center shrink-0"><Store size={18} className="text-teal-600" /></div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-800 leading-tight truncate">{data?.ad || 'Ürün Kataloğu'}</h1>
            <p className="text-[11px] text-slate-400">{items.length} ürün · DİLJAR.COM</p>
          </div>
        </div>
      </header>

      {/* Filtre çubuğu: sayfa kaydıkça üstte sabit kalır */}
      {loaded && items.length > 0 && hasFiltre && (
        <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur border-b border-slate-200/70">
          <div className="max-w-5xl mx-auto px-4 py-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><SlidersHorizontal size={14} className="text-teal-600" /> Filtrele</span>
              <span className="text-xs text-slate-400 ml-auto">{filtered.length} ürün</span>
              {aktifFiltre && (
                <button onClick={filtreTemizle} className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700"><X size={13} /> Temizle</button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select value={fCinsiyet} onChange={(e) => setFCinsiyet(e.target.value)} className="w-full min-w-0 truncate text-xs sm:text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
                <option value="">Cinsiyet</option>
                {cinsiyetler.map((c) => <option key={c} value={c}>{cinsLabel(c)}</option>)}
              </select>
              <select value={fMarka} onChange={(e) => setFMarka(e.target.value)} className="w-full min-w-0 truncate text-xs sm:text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
                <option value="">Marka</option>
                {markalar.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={fNumara} onChange={(e) => setFNumara(e.target.value)} className="w-full min-w-0 truncate text-xs sm:text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white">
                <option value="">Numara/Beden</option>
                {numaralar.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-5">
        {!loaded ? (
          <div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-slate-200 border-t-teal-500 rounded-full animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="text-center text-slate-400 py-16"><Package size={32} className="mx-auto mb-3 text-slate-300" /><p>Katalogda henüz ürün yok.</p></div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-slate-400 py-16"><Package size={32} className="mx-auto mb-3 text-slate-300" /><p>Bu filtreye uygun ürün bulunamadı.</p></div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-stretch">
              {shown.map((p) => {
                const bedenler = (p.variations || []).filter((v: any) => (v.stok || 0) > 0);
                const hasBeden = bedenler.length > 0;
                const img = (p.images || [])[0] || '';
                const secili = sel[p.id] || '';
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
                    <div className="relative aspect-square bg-slate-100 shrink-0">
                      <button onClick={() => img && setZoom(img)} className="block w-full h-full cursor-zoom-in">
                        {img ? <img src={img} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-slate-300"><Package size={26} /></span>}
                      </button>
                    </div>
                    <div className="p-2.5 flex flex-col flex-1">
                      <p className="text-[13px] font-medium text-slate-800 leading-tight line-clamp-2 min-h-[34px]">{p.ad}</p>
                      {p.salesCode && (
                        <button type="button" onClick={() => copyKod(p.salesCode)} title="Kodu kopyala"
                          className="mt-1 self-start inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-md px-2 py-0.5 text-[13px] font-bold tracking-wide hover:bg-teal-100 active:scale-95 transition">
                          <span className="text-[9px] font-semibold text-teal-400 uppercase">Kod</span>
                          <span>{p.salesCode}</span>
                          {copiedKod === p.salesCode ? <span className="text-[9px] text-emerald-600 font-semibold">✓</span> : <Copy size={10} className="text-teal-400" />}
                        </button>
                      )}
                      {(p.marka || p.cinsiyet) && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{[p.marka, p.cinsiyet ? cinsLabel(p.cinsiyet) : ''].filter(Boolean).join(' · ')}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-base font-bold text-slate-800">{fmt(p.satisFiyat)}</span>
                      </div>
                      {hasBeden ? (
                        <div className="mt-1.5">
                          <span className="text-[10px] font-semibold text-slate-500">Beden:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {bedenler.map((v: any) => (
                              <button key={v.deger} onClick={() => setSel((s) => ({ ...s, [p.id]: v.deger }))}
                                className={`text-[12px] px-2 py-0.5 rounded-md border font-semibold transition ${secili === v.deger ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-teal-400'}`}>{v.deger}</button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <button onClick={() => waOpen(p, hasBeden)}
                        className="mt-auto pt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold">
                        <span className="w-full inline-flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#1faa51] text-white py-2 rounded-lg transition"><WaIcon size={15} /> WhatsApp ile Bildir</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {visible < filtered.length && (
              <div ref={sentinelRef} className="flex justify-center py-6">
                <span className="w-6 h-6 border-2 border-slate-200 border-t-teal-500 rounded-full animate-spin" />
              </div>
            )}
          </>
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
