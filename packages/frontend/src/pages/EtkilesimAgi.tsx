import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Network, Plus, Trash2, Pencil, Search, LayoutGrid, List, X, Users2,
  Wifi, WifiOff, Send, CheckSquare, Square, Copy, RefreshCw, MonitorSmartphone,
  PlayCircle, ClipboardList, Clock, CheckCircle2, XCircle, Loader2,
  MousePointerClick, Type as TypeIcon, Globe, FolderPlus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import useUrlState from '../lib/useUrlState';
import Modal from '../components/Modal';

// ── Tipler ──
interface Cihaz {
  id: string; ad: string; aktivasyonKodu: string; baglandi: boolean;
  grupId: string | null; etiketler: string | null; platform: string;
  tarayiciBilgi: string | null; cevrimici: boolean; sonGoruldu: string | null;
  aktifSekmeUrl: string | null; durum: string; notlar: string | null; createdAt: string;
}
interface Grup { id: string; ad: string; aciklama: string | null; }
interface Adim { tip: 'ac' | 'yaz' | 'tikla'; url?: string; selector?: string; deger?: string; }
interface GorevSonuc { id: string; cihazId: string; cihazAd: string; durum: string; mesaj: string | null; tamamlandiAt: string | null; }
interface Gorev { id: string; baslik: string | null; hedefTip: string; durum: string; adimlar: Adim[]; olusturan: string | null; createdAt: string; sonuclar: GorevSonuc[]; }

const parseTags = (s: any): string[] => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function sonGorulduLabel(s: string | null): string {
  if (!s) return 'Hiç';
  const diff = Date.now() - new Date(s).getTime();
  if (diff < 25000) return 'şimdi';
  const dk = Math.floor(diff / 60000);
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa} sa önce`;
  return `${Math.floor(sa / 24)} gün önce`;
}

function durumRozet(durum: string) {
  const map: Record<string, { c: string; l: string; I: any }> = {
    beklemede: { c: 'bg-slate-100 text-slate-500', l: 'Beklemede', I: Clock },
    calisiyor: { c: 'bg-amber-50 text-amber-600', l: 'Çalışıyor', I: Loader2 },
    basarili: { c: 'bg-emerald-50 text-emerald-600', l: 'Başarılı', I: CheckCircle2 },
    basarisiz: { c: 'bg-red-50 text-red-600', l: 'Başarısız', I: XCircle },
    kismi: { c: 'bg-orange-50 text-orange-600', l: 'Kısmi', I: XCircle },
    iptal: { c: 'bg-slate-100 text-slate-400', l: 'İptal', I: XCircle },
  };
  const k = map[durum] || map.beklemede;
  const I = k.I;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${k.c}`}><I size={11} className={durum === 'calisiyor' ? 'animate-spin' : ''} /> {k.l}</span>;
}

const EMPTY_CIHAZ = { ad: '', grupId: '', etiketler: '', notlar: '' };

export default function EtkilesimAgi() {
  const [cihazlar, setCihazlar] = useState<Cihaz[]>([]);
  const [gruplar, setGruplar] = useState<Grup[]>([]);
  const [ozet, setOzet] = useState<any>({ toplam: 0, cevrimici: 0, cevrimdisi: 0, aktifGrup: 0, bekleyenGorev: 0, basarisizGorev: 0 });
  const [gorevler, setGorevler] = useState<Gorev[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useUrlState('tab', 'cihazlar'); // cihazlar | gorevler
  const [search, setSearch] = useUrlState('q', '');
  const [fGrup, setFGrup] = useUrlState('grup', '');
  const [fDurum, setFDurum] = useUrlState('durum', ''); // '' | online | offline
  const [fEtiket, setFEtiket] = useUrlState('etiket', '');
  const [gorunum, setGorunum] = useUrlState('gorunum', 'grid');

  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [cihazModal, setCihazModal] = useState(false);
  const [cihazForm, setCihazForm] = useState<any>(EMPTY_CIHAZ);
  const [duzenle, setDuzenle] = useState<Cihaz | null>(null);
  const [yeniKod, setYeniKod] = useState<{ ad: string; kod: string } | null>(null);
  const [grupModal, setGrupModal] = useState(false);
  const [gorevModal, setGorevModal] = useState(false);
  const [bulkIslem, setBulkIslem] = useState('');

  // ── Veri çekme (canlı polling) ──
  const loadRef = useRef(false);
  const loadCihazlar = useCallback(async (silent = false) => {
    if (loadRef.current) return;
    loadRef.current = true;
    try {
      const { data } = await api.get('/cihaz');
      setCihazlar(data.cihazlar || []);
      setGruplar(data.gruplar || []);
      setOzet(data.ozet || {});
    } catch (e) { if (!silent) toast.error(apiErrorMessage(e)); }
    finally { loadRef.current = false; setLoading(false); }
  }, []);

  const loadGorevler = useCallback(async () => {
    try { const { data } = await api.get('/cihaz/gorevler'); setGorevler(data.gorevler || []); } catch { /* sessiz */ }
  }, []);

  useEffect(() => {
    loadCihazlar();
    loadGorevler();
    const t = setInterval(() => { loadCihazlar(true); loadGorevler(); }, 4000);
    return () => clearInterval(t);
  }, [loadCihazlar, loadGorevler]);

  // ── Filtre ──
  const tumEtiketler = useMemo(() => {
    const set = new Set<string>();
    cihazlar.forEach((c) => parseTags(c.etiketler).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [cihazlar]);

  const filtreli = useMemo(() => {
    return cihazlar.filter((c) => {
      if (search && !c.ad.toLowerCase().includes(search.toLowerCase()) && !(c.aktivasyonKodu || '').toLowerCase().includes(search.toLowerCase())) return false;
      if (fGrup && c.grupId !== fGrup) return false;
      if (fDurum === 'online' && !c.cevrimici) return false;
      if (fDurum === 'offline' && c.cevrimici) return false;
      if (fEtiket && !parseTags(c.etiketler).includes(fEtiket)) return false;
      return true;
    });
  }, [cihazlar, search, fGrup, fDurum, fEtiket]);

  const grupAd = (id: string | null) => gruplar.find((g) => g.id === id)?.ad || '';

  // ── Seçim ──
  const toggleSec = (id: string) => setSecili((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const tumSec = () => setSecili((s) => s.size === filtreli.length ? new Set() : new Set(filtreli.map((c) => c.id)));

  // ── Cihaz kaydet ──
  const cihazKaydet = async () => {
    if (!cihazForm.ad.trim()) return toast.error('Cihaz adı gerekli');
    try {
      if (duzenle) {
        await api.patch(`/cihaz/${duzenle.id}`, { ad: cihazForm.ad, grupId: cihazForm.grupId || null, etiketler: cihazForm.etiketler || null, notlar: cihazForm.notlar || null });
        toast.success('Cihaz güncellendi');
        setCihazModal(false); setDuzenle(null);
      } else {
        const { data } = await api.post('/cihaz', { ad: cihazForm.ad, grupId: cihazForm.grupId || null, etiketler: cihazForm.etiketler || null, notlar: cihazForm.notlar || null });
        setCihazModal(false);
        setYeniKod({ ad: data.ad, kod: data.aktivasyonKodu });
      }
      setCihazForm(EMPTY_CIHAZ);
      loadCihazlar(true);
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const cihazSil = async (c: Cihaz) => {
    if (!confirm(`"${c.ad}" cihazı silinsin mi?`)) return;
    try { await api.delete(`/cihaz/${c.id}`); toast.success('Silindi'); loadCihazlar(true); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const kodYenile = async (c: Cihaz) => {
    if (!confirm('Aktivasyon kodu yenilenecek; mevcut bağlantı kesilir. Devam?')) return;
    try { const { data } = await api.post(`/cihaz/${c.id}/aktivasyon-yenile`); setYeniKod({ ad: data.ad, kod: data.aktivasyonKodu }); loadCihazlar(true); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const kopyala = (t: string) => { navigator.clipboard?.writeText(t); toast.success('Kopyalandı'); };

  // ── Toplu işlem ──
  const bulkUygula = async (islem: string, deger?: any) => {
    if (secili.size === 0) return toast.error('Cihaz seçin');
    if (islem === 'sil' && !confirm(`${secili.size} cihaz silinecek. Onaylıyor musunuz?`)) return;
    try {
      await api.post('/cihaz/bulk', { ids: Array.from(secili), islem, deger });
      toast.success('İşlem uygulandı');
      if (islem === 'sil') setSecili(new Set());
      loadCihazlar(true);
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center"><Network className="text-emerald-600" size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Tarayıcı Ağı</h1>
            <p className="text-sm text-slate-400">Chrome eklentisi kurulu tarayıcıları merkezi yönet, görev gönder, canlı izle.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setGrupModal(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border bg-white border-slate-200 text-slate-600 hover:bg-slate-50"><Users2 size={15} /> Gruplar</button>
          <button onClick={() => { setDuzenle(null); setCihazForm(EMPTY_CIHAZ); setCihazModal(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"><Plus size={16} /> Cihaz Ekle</button>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {[['cihazlar', 'Cihazlar', MonitorSmartphone], ['gorevler', 'Görev Geçmişi & Canlı Takip', ClipboardList]].map(([k, l, I]: any) => (
          <button key={k} onClick={() => setTab(k)} className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><I size={15} /> {l}</button>
        ))}
      </div>

      {/* İstatistik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { l: 'Toplam Cihaz', v: ozet.toplam, I: MonitorSmartphone, c: 'text-slate-600 bg-slate-100' },
          { l: 'Çevrim İçi', v: ozet.cevrimici, I: Wifi, c: 'text-emerald-600 bg-emerald-100' },
          { l: 'Çevrim Dışı', v: ozet.cevrimdisi, I: WifiOff, c: 'text-slate-400 bg-slate-100' },
          { l: 'Aktif Gruplar', v: ozet.aktifGrup, I: Users2, c: 'text-indigo-600 bg-indigo-100' },
          { l: 'Bekleyen Görev', v: ozet.bekleyenGorev, I: Clock, c: 'text-amber-600 bg-amber-100' },
          { l: 'Başarısız', v: ozet.basarisizGorev, I: XCircle, c: 'text-red-600 bg-red-100' },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.c}`}><s.I size={18} /></div>
            <div><div className="text-xl font-bold text-slate-800">{s.v ?? 0}</div><div className="text-[11px] text-slate-400">{s.l}</div></div>
          </div>
        ))}
      </div>

      {tab === 'cihazlar' && (
        <>
          {/* Filtre barı */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cihaz adı veya kod ara..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl" />
            </div>
            <select value={fGrup} onChange={(e) => setFGrup(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"><option value="">Grup (tümü)</option>{gruplar.map((g) => <option key={g.id} value={g.id}>{g.ad}</option>)}</select>
            <select value={fDurum} onChange={(e) => setFDurum(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"><option value="">Durum (tümü)</option><option value="online">Çevrim İçi</option><option value="offline">Çevrim Dışı</option></select>
            <select value={fEtiket} onChange={(e) => setFEtiket(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"><option value="">Etiket (tümü)</option>{tumEtiketler.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <div className="flex items-center gap-1 border border-slate-200 rounded-xl p-0.5">
              <button onClick={() => setGorunum('grid')} className={`p-1.5 rounded-lg ${gorunum === 'grid' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}><LayoutGrid size={15} /></button>
              <button onClick={() => setGorunum('list')} className={`p-1.5 rounded-lg ${gorunum === 'list' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}><List size={15} /></button>
            </div>
          </div>

          {/* Toplu işlem barı */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <button onClick={tumSec} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">
              {secili.size === filtreli.length && filtreli.length > 0 ? <CheckSquare size={15} /> : <Square size={15} />} Tümünü Seç
            </button>
            <span className="text-slate-400">{secili.size} seçili / {filtreli.length} cihaz</span>
            {secili.size > 0 && (
              <>
                <button onClick={() => setGorevModal(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium"><Send size={14} /> Görev Gönder</button>
                <select value={bulkIslem} onChange={(e) => { const v = e.target.value; setBulkIslem(''); if (!v) return;
                  if (v === 'sil') bulkUygula('sil');
                  else if (v === 'durum-aktif') bulkUygula('durum', { durum: 'aktif' });
                  else if (v === 'durum-pasif') bulkUygula('durum', { durum: 'pasif' });
                  else if (v.startsWith('grup:')) bulkUygula('grup', { grupId: v.slice(5) || null });
                  else if (v === 'etiket-ekle') { const et = prompt('Eklenecek etiket'); if (et) bulkUygula('etiket-ekle', { etiket: et }); }
                  else if (v === 'etiket-cikar') { const et = prompt('Kaldırılacak etiket'); if (et) bulkUygula('etiket-cikar', { etiket: et }); }
                }} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600">
                  <option value="">Toplu işlem...</option>
                  <optgroup label="Gruba taşı">
                    <option value="grup:">Grupsuz</option>
                    {gruplar.map((g) => <option key={g.id} value={`grup:${g.id}`}>{g.ad}</option>)}
                  </optgroup>
                  <option value="etiket-ekle">Etiket ekle</option>
                  <option value="etiket-cikar">Etiket kaldır</option>
                  <option value="durum-aktif">Durum: Aktif</option>
                  <option value="durum-pasif">Durum: Pasif</option>
                  <option value="sil">Sil</option>
                </select>
              </>
            )}
          </div>

          {/* Cihaz listesi */}
          {loading ? (
            <div className="text-center py-12 text-slate-400">Yükleniyor...</div>
          ) : filtreli.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              {cihazlar.length === 0 ? 'Henüz cihaz yok. "Cihaz Ekle" ile başlayın ve eklentiyi kurun.' : 'Bu filtreye uygun cihaz yok.'}
            </div>
          ) : gorunum === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtreli.map((c) => (
                <div key={c.id} className={`bg-white rounded-2xl border p-4 relative ${secili.has(c.id) ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between">
                    <button onClick={() => toggleSec(c.id)} className="text-slate-400 hover:text-emerald-600">{secili.has(c.id) ? <CheckSquare size={18} className="text-emerald-600" /> : <Square size={18} />}</button>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.cevrimici ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${c.cevrimici ? 'bg-emerald-500' : 'bg-slate-300'}`} /> {c.cevrimici ? 'Çevrim İçi' : 'Çevrim Dışı'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center"><MonitorSmartphone size={18} className="text-slate-500" /></div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{c.ad}</div>
                      <div className="text-[11px] text-slate-400">{grupAd(c.grupId) || 'Grupsuz'} · {sonGorulduLabel(c.sonGoruldu)}</div>
                    </div>
                  </div>
                  {parseTags(c.etiketler).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">{parseTags(c.etiketler).map((t) => <span key={t} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">{t}</span>)}</div>
                  )}
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className={`px-2 py-0.5 rounded font-mono ${c.baglandi ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{c.aktivasyonKodu}</span>
                    <button onClick={() => kopyala(c.aktivasyonKodu)} title="Kodu kopyala" className="text-slate-400 hover:text-slate-600"><Copy size={13} /></button>
                  </div>
                  {c.aktifSekmeUrl && <div className="mt-1 text-[10px] text-slate-400 truncate" title={c.aktifSekmeUrl}>Sekme: {c.aktifSekmeUrl}</div>}
                  <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2">
                    <button onClick={() => { setDuzenle(c); setCihazForm({ ad: c.ad, grupId: c.grupId || '', etiketler: c.etiketler || '', notlar: c.notlar || '' }); setCihazModal(true); }} className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-xs text-slate-500 hover:bg-slate-50 rounded-lg"><Pencil size={13} /> Düzenle</button>
                    <button onClick={() => kodYenile(c)} className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-xs text-slate-500 hover:bg-slate-50 rounded-lg"><RefreshCw size={13} /> Kod</button>
                    <button onClick={() => cihazSil(c)} className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={13} /> Sil</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr><th className="p-3 text-left w-8"></th><th className="p-3 text-left">Cihaz</th><th className="p-3 text-left">Grup</th><th className="p-3 text-left">Durum</th><th className="p-3 text-left">Kod</th><th className="p-3 text-left">Son Görülme</th><th className="p-3 text-right">İşlem</th></tr>
                </thead>
                <tbody>
                  {filtreli.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-3"><button onClick={() => toggleSec(c.id)}>{secili.has(c.id) ? <CheckSquare size={16} className="text-emerald-600" /> : <Square size={16} className="text-slate-300" />}</button></td>
                      <td className="p-3"><div className="font-medium text-slate-800">{c.ad}</div>{parseTags(c.etiketler).length > 0 && <div className="text-[10px] text-slate-400">{parseTags(c.etiketler).join(', ')}</div>}</td>
                      <td className="p-3 text-slate-500">{grupAd(c.grupId) || '-'}</td>
                      <td className="p-3"><span className={`inline-flex items-center gap-1 text-[11px] ${c.cevrimici ? 'text-emerald-600' : 'text-slate-400'}`}><span className={`w-1.5 h-1.5 rounded-full ${c.cevrimici ? 'bg-emerald-500' : 'bg-slate-300'}`} />{c.cevrimici ? 'Çevrim İçi' : 'Çevrim Dışı'}</span></td>
                      <td className="p-3"><span className="font-mono text-[11px] text-slate-500">{c.aktivasyonKodu}</span> <button onClick={() => kopyala(c.aktivasyonKodu)} className="text-slate-300 hover:text-slate-500"><Copy size={12} /></button></td>
                      <td className="p-3 text-slate-400 text-xs">{sonGorulduLabel(c.sonGoruldu)}</td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <button onClick={() => { setDuzenle(c); setCihazForm({ ad: c.ad, grupId: c.grupId || '', etiketler: c.etiketler || '', notlar: c.notlar || '' }); setCihazModal(true); }} className="text-slate-400 hover:text-slate-600 p-1"><Pencil size={14} /></button>
                        <button onClick={() => kodYenile(c)} className="text-slate-400 hover:text-slate-600 p-1"><RefreshCw size={14} /></button>
                        <button onClick={() => cihazSil(c)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'gorevler' && (
        <div className="space-y-3">
          {gorevler.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">Henüz görev yok.</div>
          ) : gorevler.map((g) => (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <PlayCircle size={16} className="text-emerald-500" />
                  <span className="font-semibold text-slate-800">{g.baslik || 'Görev'}</span>
                  {durumRozet(g.durum)}
                  <span className="text-[11px] text-slate-400">{new Date(g.createdAt).toLocaleString('tr-TR')}</span>
                </div>
                <span className="text-[11px] text-slate-400">{g.olusturan || ''}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(g.adimlar || []).map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-100 text-[11px] text-slate-500">
                    {a.tip === 'ac' && <><Globe size={11} /> Aç: {a.url}</>}
                    {a.tip === 'yaz' && <><TypeIcon size={11} /> Yaz: {a.selector} = "{a.deger}"</>}
                    {a.tip === 'tikla' && <><MousePointerClick size={11} /> Tıkla: {a.selector}</>}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {g.sonuclar.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-xs text-slate-600 truncate">{s.cihazAd}</span>
                    <span className="flex items-center gap-1">{durumRozet(s.durum)}</span>
                  </div>
                ))}
              </div>
              {g.sonuclar.some((s) => s.mesaj && s.durum === 'basarisiz') && (
                <div className="mt-2 text-[11px] text-red-500">
                  {g.sonuclar.filter((s) => s.durum === 'basarisiz' && s.mesaj).map((s) => <div key={s.id}>• {s.cihazAd}: {s.mesaj}</div>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Cihaz Ekle/Düzenle Modal ── */}
      <Modal isOpen={cihazModal} onClose={() => { setCihazModal(false); setDuzenle(null); }} title={duzenle ? 'Cihazı Düzenle' : 'Yeni Cihaz'}>
        <div className="space-y-3">
          <div><label className="text-xs text-slate-500">Cihaz adı *</label><input value={cihazForm.ad} onChange={(e) => setCihazForm({ ...cihazForm, ad: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Örn. Ofis PC 1 / Kadınlar-01" /></div>
          <div><label className="text-xs text-slate-500">Grup</label><select value={cihazForm.grupId} onChange={(e) => setCihazForm({ ...cihazForm, grupId: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"><option value="">Grupsuz</option>{gruplar.map((g) => <option key={g.id} value={g.id}>{g.ad}</option>)}</select></div>
          <div><label className="text-xs text-slate-500">Etiketler (virgülle)</label><input value={cihazForm.etiketler} onChange={(e) => setCihazForm({ ...cihazForm, etiketler: e.target.value })} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="istanbul, departman-a" /></div>
          <div><label className="text-xs text-slate-500">Not</label><textarea value={cihazForm.notlar} onChange={(e) => setCihazForm({ ...cihazForm, notlar: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <button onClick={cihazKaydet} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700">{duzenle ? 'Kaydet' : 'Oluştur ve Aktivasyon Kodu Al'}</button>
        </div>
      </Modal>

      {/* ── Yeni aktivasyon kodu göster ── */}
      <Modal isOpen={!!yeniKod} onClose={() => setYeniKod(null)} title="Aktivasyon Kodu" size="sm">
        {yeniKod && (
          <div className="text-center space-y-3">
            <p className="text-sm text-slate-500"><b>{yeniKod.ad}</b> cihazının aktivasyon kodu:</p>
            <div className="text-2xl font-mono font-bold tracking-wider bg-slate-900 text-white rounded-xl py-4">{yeniKod.kod}</div>
            <button onClick={() => kopyala(yeniKod.kod)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm"><Copy size={14} /> Kodu Kopyala</button>
            <p className="text-[11px] text-slate-400">Bu kodu ilgili tarayıcıdaki eklenti penceresine girin. Eklenti kurulu değilse KURULUM.txt'yi izleyin.</p>
          </div>
        )}
      </Modal>

      {/* ── Grup Yönetimi ── */}
      <GrupModal isOpen={grupModal} onClose={() => setGrupModal(false)} gruplar={gruplar} reload={() => loadCihazlar(true)} />

      {/* ── Görev Oluştur ── */}
      <GorevModal isOpen={gorevModal} onClose={() => setGorevModal(false)} secili={Array.from(secili)} gruplar={gruplar} onDone={() => { setGorevModal(false); loadGorevler(); loadCihazlar(true); setTab('gorevler'); }} />
    </div>
  );
}

// ═══════════ Grup Yönetimi Modal ═══════════
function GrupModal({ isOpen, onClose, gruplar, reload }: { isOpen: boolean; onClose: () => void; gruplar: Grup[]; reload: () => void; }) {
  const [ad, setAd] = useState('');
  const ekle = async () => {
    if (!ad.trim()) return;
    try { await api.post('/cihaz/gruplar', { ad: ad.trim() }); setAd(''); reload(); toast.success('Grup eklendi'); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const sil = async (id: string) => { if (!confirm('Grup silinsin mi? (Cihazlar grupsuz kalır)')) return; try { await api.delete(`/cihaz/gruplar/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const yenidenAdlandir = async (g: Grup) => { const yeni = prompt('Grup adı', g.ad); if (yeni == null || !yeni.trim()) return; try { await api.patch(`/cihaz/gruplar/${g.id}`, { ad: yeni.trim() }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Grup Yönetimi">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input value={ad} onChange={(e) => setAd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ekle()} placeholder="Yeni grup adı (ör. Kadınlar, Grup 1)" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <button onClick={ekle} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm"><FolderPlus size={15} /> Ekle</button>
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {gruplar.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Henüz grup yok.</p> : gruplar.map((g) => (
            <div key={g.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-100 bg-slate-50">
              <span className="text-sm text-slate-700">{g.ad}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => yenidenAdlandir(g)} className="text-slate-400 hover:text-slate-600 p-1"><Pencil size={13} /></button>
                <button onClick={() => sil(g.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ═══════════ Görev Oluştur Modal ═══════════
function GorevModal({ isOpen, onClose, secili, gruplar, onDone }: { isOpen: boolean; onClose: () => void; secili: string[]; gruplar: Grup[]; onDone: () => void; }) {
  const [baslik, setBaslik] = useState('');
  const [hedefTip, setHedefTip] = useState<'cihaz' | 'grup' | 'tumu'>('cihaz');
  const [hedefId, setHedefId] = useState('');
  const [adimlar, setAdimlar] = useState<Adim[]>([{ tip: 'ac', url: '' }]);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHedefTip(secili.length > 0 ? 'cihaz' : 'tumu');
      setAdimlar([{ tip: 'ac', url: '' }]);
      setBaslik('');
    }
  }, [isOpen, secili.length]);

  const adimEkle = (tip: Adim['tip']) => setAdimlar((a) => [...a, tip === 'ac' ? { tip: 'ac', url: '' } : tip === 'yaz' ? { tip: 'yaz', selector: '', deger: '' } : { tip: 'tikla', selector: '' }]);
  const adimGuncelle = (i: number, patch: Partial<Adim>) => setAdimlar((a) => a.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const adimSil = (i: number) => setAdimlar((a) => a.filter((_, idx) => idx !== i));

  const gonder = async () => {
    if (hedefTip === 'cihaz' && secili.length === 0) return toast.error('Cihaz seçilmedi');
    if (hedefTip === 'grup' && !hedefId) return toast.error('Grup seçin');
    if (!adimlar.length) return toast.error('En az bir adım ekleyin');
    for (const a of adimlar) {
      if (a.tip === 'ac' && !a.url) return toast.error('Sayfa Aç adımında URL gerekli');
      if (a.tip === 'yaz' && (!a.selector || a.deger == null)) return toast.error('Metin Yaz adımında selector ve değer gerekli');
      if (a.tip === 'tikla' && !a.selector) return toast.error('Tıkla adımında selector gerekli');
    }
    setGonderiliyor(true);
    try {
      await api.post('/cihaz/gorev', { baslik: baslik || null, hedefTip, hedefId: hedefTip === 'grup' ? hedefId : null, cihazIds: hedefTip === 'cihaz' ? secili : [], adimlar });
      toast.success('Görev gönderildi');
      onDone();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setGonderiliyor(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Görev Gönder" size="lg">
      <div className="space-y-4">
        <div><label className="text-xs text-slate-500">Görev başlığı (opsiyonel)</label><input value={baslik} onChange={(e) => setBaslik(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Örn. Müşteri bilgisi gir" /></div>

        <div>
          <label className="text-xs text-slate-500">Hedef</label>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <button onClick={() => setHedefTip('cihaz')} className={`px-3 py-1.5 rounded-lg text-sm border ${hedefTip === 'cihaz' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200 text-slate-600'}`}>Seçili cihazlar ({secili.length})</button>
            <button onClick={() => setHedefTip('grup')} className={`px-3 py-1.5 rounded-lg text-sm border ${hedefTip === 'grup' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200 text-slate-600'}`}>Grup</button>
            <button onClick={() => setHedefTip('tumu')} className={`px-3 py-1.5 rounded-lg text-sm border ${hedefTip === 'tumu' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200 text-slate-600'}`}>Tüm cihazlar</button>
            {hedefTip === 'grup' && <select value={hedefId} onChange={(e) => setHedefId(e.target.value)} className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white"><option value="">Grup seç...</option>{gruplar.map((g) => <option key={g.id} value={g.id}>{g.ad}</option>)}</select>}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">Adımlar (sırayla çalışır; ilk "Sayfa Aç" sonrası aynı sekmede devam eder)</label>
          </div>
          <div className="mt-2 space-y-2">
            {adimlar.map((a, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                <span className="mt-2 text-[11px] text-slate-400 w-5">{i + 1}.</span>
                <select value={a.tip} onChange={(e) => { const tip = e.target.value as Adim['tip']; adimGuncelle(i, tip === 'ac' ? { tip, url: '', selector: undefined, deger: undefined } : tip === 'yaz' ? { tip, selector: '', deger: '', url: undefined } : { tip, selector: '', url: undefined, deger: undefined }); }} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-sm">
                  <option value="ac">Sayfa Aç</option>
                  <option value="yaz">Metin Yaz</option>
                  <option value="tikla">Tıkla</option>
                </select>
                <div className="flex-1 flex gap-2">
                  {a.tip === 'ac' && <input value={a.url || ''} onChange={(e) => adimGuncelle(i, { url: e.target.value })} placeholder="https://ornek.com/sayfa" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />}
                  {a.tip === 'yaz' && <><input value={a.selector || ''} onChange={(e) => adimGuncelle(i, { selector: e.target.value })} placeholder="CSS selector (ör. #ad)" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-sm" /><input value={a.deger || ''} onChange={(e) => adimGuncelle(i, { deger: e.target.value })} placeholder="Yazılacak metin" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-sm" /></>}
                  {a.tip === 'tikla' && <input value={a.selector || ''} onChange={(e) => adimGuncelle(i, { selector: e.target.value })} placeholder="CSS selector (ör. button.gonder)" className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />}
                </div>
                <button onClick={() => adimSil(i)} className="mt-1 text-red-400 hover:text-red-600 p-1"><X size={15} /></button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => adimEkle('ac')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"><Globe size={13} /> Sayfa Aç</button>
            <button onClick={() => adimEkle('yaz')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"><TypeIcon size={13} /> Metin Yaz</button>
            <button onClick={() => adimEkle('tikla')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"><MousePointerClick size={13} /> Tıkla</button>
          </div>
        </div>

        <button onClick={gonder} disabled={gonderiliyor} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"><Send size={16} /> {gonderiliyor ? 'Gönderiliyor...' : 'Görevi Gönder'}</button>
      </div>
    </Modal>
  );
}
