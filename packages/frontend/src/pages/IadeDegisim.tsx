import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, Plus, X, AlertTriangle, PackageCheck, Save, Settings, FileText, Package,
  Clock, CheckCircle, XCircle, Filter, FileDown, Download, ArrowLeftRight, Layers, ChevronRight, Truck, ClipboardCheck, MoreVertical, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useUrlState } from '../lib/useUrlState';

const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
const dt = (d: string) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const DURUMLAR: Record<string, { t: string; c: string; bar: string }> = {
  onay_bekliyor: { t: 'Onay Bekliyor', c: 'bg-amber-100 text-amber-700', bar: 'bg-amber-400' },
  islemde: { t: 'İşlemde', c: 'bg-indigo-100 text-indigo-700', bar: 'bg-indigo-400' },
  tamamlandi: { t: 'Tamamlandı', c: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
  reddedildi: { t: 'Reddedildi', c: 'bg-rose-100 text-rose-700', bar: 'bg-rose-400' },
};

type Row = { id: string; talepNo: number; sipNo: string; customerAd: string; customerTel: string; tip: string; durum: string; iadeTutar: number; items: any[]; genelSebep: string; degisimUrunler: any; createdAt: string; islendi: boolean; redNedeni?: string };
type Stats = { toplam: number; iade: number; degisim: number; onay_bekliyor: number; islemde: number; tamamlandi: number; reddedildi: number; toplamTutar: number };
type Neden = { sebep: string; count: number };

export default function IadeDegisim() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [nedenDagilimi, setNedenDagilimi] = useState<Neden[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useUrlState<'tumu' | 'iade' | 'degisim' | 'onay_bekliyor' | 'tamamlandi' | 'reddedildi'>('tab', 'tumu');

  // Filtreler
  const [q, setQ] = useUrlState('q', '');
  const [fTur, setFTur] = useUrlState('tur', '');
  const [fDurum, setFDurum] = useUrlState('durum', '');
  const [fSebep, setFSebep] = useUrlState('sebep', '');
  const [fFrom, setFFrom] = useUrlState('from', '');
  const [fTo, setFTo] = useUrlState('to', '');
  const [applied, setApplied] = useState(0);

  const [sebepler, setSebepler] = useState<string[]>([]);
  const [showForm, setShowForm] = useState<null | 'iade' | 'degisim'>(null);
  const [showAyar, setShowAyar] = useState(false);
  const [detay, setDetay] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (q.trim()) params.q = q.trim();
      if (fTur) params.tur = fTur;
      if (fDurum) params.durum = fDurum;
      if (fSebep) params.sebep = fSebep;
      if (fFrom) params.from = fFrom;
      if (fTo) params.to = fTo;
      const r = await api.get('/store/iade', { params });
      setRows(r.data?.rows || []); setStats(r.data?.stats || null); setNedenDagilimi(r.data?.nedenDagilimi || []);
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/store/iade/settings').then((r) => setSebepler(r.data?.sebepler || [])).catch(() => {}); }, []);

  // Otomatik arama: q degisince 400ms debounce ile setApplied -> load([applied]) refetch eder.
  // Ilk render'da mount load'i zaten calisir; didMount ref ile cift-fetch onlenir.
  const searchMounted = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) { searchMounted.current = true; return; }
    const t = setTimeout(() => setApplied((x) => x + 1), 400);
    return () => clearTimeout(t);
  }, [q]);

  const temizle = () => { setQ(''); setFTur(''); setFDurum(''); setFSebep(''); setFFrom(''); setFTo(''); setApplied((x) => x + 1); };

  const tabRows = useMemo(() => {
    if (tab === 'tumu') return rows;
    if (tab === 'iade' || tab === 'degisim') return rows.filter((r) => r.tip === tab);
    return rows.filter((r) => r.durum === tab);
  }, [rows, tab]);

  const setDurum = async (r: Row, durum: string) => {
    let redNedeni = '';
    if (durum === 'reddedildi') { redNedeni = window.prompt('Red nedeni:') || ''; }
    try { await api.patch(`/store/iade/${r.id}/durum`, { durum, redNedeni }); toast.success('Durum güncellendi'); load(); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const sil = async (r: Row) => {
    if (!window.confirm('Bu talebi silmek istediğinize emin misiniz?')) return;
    try { await api.delete(`/store/iade/${r.id}`); toast.success('Talep silindi'); load(); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const exportExcel = () => {
    const head = ['Talep No', 'Sipariş No', 'Müşteri', 'Telefon', 'Tür', 'Durum', 'Tutar', 'Sebep', 'Tarih'];
    const lines = tabRows.map((r) => [
      '#ID-' + (r.talepNo || ''), r.sipNo || '', r.customerAd || '', r.customerTel || '',
      r.tip === 'iade' ? 'İade' : 'Değişim', DURUMLAR[r.durum]?.t || r.durum, String(r.iadeTutar || 0),
      (r.items || []).map((it: any) => it.sebep).filter(Boolean).join(' | ') || r.genelSebep || '', dt(r.createdAt),
    ]);
    const csv = [head, ...lines].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `iade-degisim-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const s = stats || { toplam: 0, iade: 0, degisim: 0, onay_bekliyor: 0, islemde: 0, tamamlandi: 0, reddedildi: 0, toplamTutar: 0 };
  const pct = (n: number) => s.toplam ? Math.round((n / s.toplam) * 1000) / 10 : 0;

  return (
    <div className="p-4 md:p-6">
      {/* Başlık */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">İade ve Değişim İşlemleri</h1>
          <p className="text-sm text-slate-500">Tüm iade ve değişim taleplerini yönetin, durumları takip edin ve süreçleri kontrol edin.</p>
        </div>
        <button onClick={() => setShowForm('iade')} className="px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1.5"><Plus size={16} /> Yeni Talep Oluştur</button>
      </div>

      {/* KPI kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <Kpi icon={FileText} color="slate" label="Toplam Talepler" value={s.toplam} sub="Tüm zamanlar" />
        <Kpi icon={Package} color="rose" label="İade Talepleri" value={s.iade} sub={`%${pct(s.iade)}`} />
        <Kpi icon={ArrowLeftRight} color="indigo" label="Değişim Talepleri" value={s.degisim} sub={`%${pct(s.degisim)}`} />
        <Kpi icon={Clock} color="amber" label="Bekleyen Talepler" value={s.onay_bekliyor} sub={`%${pct(s.onay_bekliyor)}`} />
        <Kpi icon={CheckCircle} color="emerald" label="Tamamlanan Talepler" value={s.tamamlandi} sub={`%${pct(s.tamamlandi)}`} />
        <Kpi icon={XCircle} color="rose" label="Reddedilen Talepler" value={s.reddedildi} sub={`%${pct(s.reddedildi)}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Sol kolon */}
        <div className="xl:col-span-2 space-y-5">
          {/* Filtreler */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Talepleri Filtrele</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Talep No / Sipariş No / Müşteri</label>
                <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setApplied((x) => x + 1)} placeholder="Ara..." className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm" /></div>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Tür</label>
                <select value={fTur} onChange={(e) => setFTur(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"><option value="">Tümü</option><option value="iade">İade</option><option value="degisim">Değişim</option></select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Durum</label>
                <select value={fDurum} onChange={(e) => setFDurum(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"><option value="">Tümü</option>{Object.entries(DURUMLAR).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">İade Nedeni</label>
                <select value={fSebep} onChange={(e) => setFSebep(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm"><option value="">Tümü</option>{sebepler.map((x) => <option key={x} value={x}>{x}</option>)}</select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Tarih Aralığı</label>
                <div className="flex gap-1"><input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="w-full border border-slate-200 rounded-lg px-1.5 py-2 text-xs" /><input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-1.5 py-2 text-xs" /></div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setApplied((x) => x + 1)} className="px-4 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-900 inline-flex items-center gap-1.5"><Filter size={14} /> Filtrele</button>
              <button onClick={temizle} className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">Temizle</button>
            </div>
          </div>

          {/* Tablo */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-wrap gap-2">
              <p className="font-semibold text-slate-800">İade & Değişim Talepleri</p>
              <button onClick={exportExcel} className="text-sm text-emerald-700 inline-flex items-center gap-1.5 hover:underline"><FileDown size={15} /> Excel'e Aktar</button>
            </div>
            <div className="flex gap-1 px-4 border-b border-slate-100 overflow-x-auto">
              {([['tumu', 'Tümü'], ['iade', 'İade'], ['degisim', 'Değişim'], ['onay_bekliyor', 'Bekleyen'], ['tamamlandi', 'Tamamlanan'], ['reddedildi', 'Reddedilen']] as const).map(([k, t]) => (
                <button key={k} onClick={() => setTab(k as any)} className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`}>{t}</button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-slate-400 uppercase border-b border-slate-100"><th className="px-4 py-2.5">Talep No</th><th className="px-3 py-2.5">Sipariş No</th><th className="px-3 py-2.5">Müşteri</th><th className="px-3 py-2.5">Tür</th><th className="px-3 py-2.5">Durum</th><th className="px-3 py-2.5">Tutar</th><th className="px-3 py-2.5">Talep Tarihi</th><th className="px-3 py-2.5 text-right">İşlem</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Yükleniyor...</td></tr>
                   : tabRows.length === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Kayıt bulunamadı</td></tr>
                   : tabRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-emerald-700 cursor-pointer" onClick={() => setDetay(r)}>#ID-{r.talepNo}</td>
                      <td className="px-3 py-3 font-mono text-xs">{r.sipNo || '-'}</td>
                      <td className="px-3 py-3"><p className="text-slate-800">{r.customerAd || 'Misafir'}</p><p className="text-[11px] text-slate-400">{r.customerTel || ''}</p></td>
                      <td className="px-3 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${r.tip === 'iade' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'}`}>{r.tip === 'iade' ? 'İade' : 'Değişim'}</span></td>
                      <td className="px-3 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${DURUMLAR[r.durum]?.c}`}>{DURUMLAR[r.durum]?.t || r.durum}</span></td>
                      <td className="px-3 py-3 font-medium text-slate-700">{fmt(r.iadeTutar)}</td>
                      <td className="px-3 py-3 text-slate-500 text-xs">{dt(r.createdAt)}</td>
                      <td className="px-3 py-3 text-right"><RowMenu r={r} onDetay={() => setDetay(r)} onDurum={setDurum} onSil={() => sil(r)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Süreç */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="font-semibold text-slate-800 mb-4">İade & Değişim Süreci</p>
            <div className="flex items-start justify-between gap-2 overflow-x-auto">
              {[
                { ic: FileText, t: 'Talep Oluştur', d: 'Müşteri iade/değişim talebi oluşturulur.' },
                { ic: Clock, t: 'İnceleme', d: 'Talep incelenir ve değerlendirilir.' },
                { ic: Package, t: 'Onay & İşlem', d: 'Talep onaylanır ve işlem başlatılır.' },
                { ic: Truck, t: 'Ürün Gönderimi', d: 'Ürün müşteriden alınır veya yenisi gönderilir.' },
                { ic: ClipboardCheck, t: 'Tamamlandı', d: 'İade/değişim işlemi tamamlanır.' },
              ].map((st, i, arr) => (
                <div key={i} className="flex items-start flex-1 min-w-[140px]">
                  <div className="flex flex-col items-center text-center flex-1">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-2"><st.ic size={20} /></div>
                    <p className="text-sm font-medium text-slate-700">{st.t}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{st.d}</p>
                  </div>
                  {i < arr.length - 1 && <ChevronRight size={18} className="text-slate-300 mt-3 shrink-0" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sağ kolon — raporlar */}
        <div className="space-y-5">
          {/* Talep Dağılımı */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="font-semibold text-slate-800 mb-4">Talep Dağılımı</p>
            <div className="flex items-center gap-5">
              <Donut total={s.toplam} parts={[{ v: s.iade, c: '#f43f5e' }, { v: s.degisim, c: '#6366f1' }]} />
              <div className="flex-1 space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> İade</span><span className="text-slate-500">{s.iade} · %{pct(s.iade)}</span></div>
                <div className="flex items-center justify-between"><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Değişim</span><span className="text-slate-500">{s.degisim} · %{pct(s.degisim)}</span></div>
              </div>
            </div>
          </div>

          {/* Durum Dağılımı */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="font-semibold text-slate-800 mb-4">Durum Dağılımı</p>
            <div className="space-y-3">
              {(['onay_bekliyor', 'islemde', 'tamamlandi', 'reddedildi'] as const).map((k) => (
                <div key={k}>
                  <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-600">{DURUMLAR[k].t}</span><span className="text-slate-400">{(s as any)[k]} · %{pct((s as any)[k])}</span></div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${DURUMLAR[k].bar}`} style={{ width: `${pct((s as any)[k])}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* İade Nedeni Raporu */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="font-semibold text-slate-800 mb-4">İade Nedeni Dağılımı</p>
            <div className="space-y-2.5">
              {nedenDagilimi.length === 0 && <p className="text-sm text-slate-400">Henüz veri yok</p>}
              {nedenDagilimi.map((n) => {
                const max = nedenDagilimi[0]?.count || 1;
                return (
                  <button key={n.sebep} onClick={() => { setFSebep(n.sebep); setApplied((x) => x + 1); }} className="w-full text-left group">
                    <div className="flex items-center justify-between text-sm mb-1"><span className="text-slate-600 group-hover:text-emerald-700">{n.sebep}</span><span className="text-slate-400">{n.count}</span></div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-400" style={{ width: `${Math.round((n.count / max) * 100)}%` }} /></div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hızlı İşlemler */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="font-semibold text-slate-800 mb-4">Hızlı İşlemler</p>
            <div className="grid grid-cols-2 gap-3">
              <Quick icon={Download} color="emerald" label="Yeni İade Talebi" onClick={() => setShowForm('iade')} />
              <Quick icon={ArrowLeftRight} color="indigo" label="Yeni Değişim Talebi" onClick={() => setShowForm('degisim')} />
              <Quick icon={Layers} color="amber" label="Excel'e Aktar" onClick={exportExcel} />
              <Quick icon={Settings} color="slate" label="İade/Değişim Ayarları" onClick={() => setShowAyar(true)} />
            </div>
          </div>
        </div>
      </div>

      {showForm && <TalepForm tip={showForm} sebepler={sebepler} onClose={() => setShowForm(null)} onDone={() => { setShowForm(null); load(); }} />}
      {showAyar && <AyarModal onClose={() => setShowAyar(false)} onSaved={() => { setShowAyar(false); api.get('/store/iade/settings').then((r) => setSebepler(r.data?.sebepler || [])).catch(() => {}); }} />}
      {detay && <DetayModal r={detay} onClose={() => setDetay(null)} onDurum={setDurum} />}
    </div>
  );
}

function Kpi({ icon: Ic, color, label, value, sub }: any) {
  const cmap: Record<string, string> = { slate: 'bg-slate-100 text-slate-600', rose: 'bg-rose-100 text-rose-600', indigo: 'bg-indigo-100 text-indigo-600', amber: 'bg-amber-100 text-amber-600', emerald: 'bg-emerald-100 text-emerald-600' };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${cmap[color]}`}><Ic size={18} /></div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}

function Quick({ icon: Ic, color, label, onClick }: any) {
  const cmap: Record<string, string> = { emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100', indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100', amber: 'bg-amber-50 text-amber-600 border-amber-100', slate: 'bg-slate-50 text-slate-600 border-slate-100' };
  return (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border ${cmap[color]} hover:shadow-sm transition-shadow text-center`}>
      <Ic size={20} /><span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function Donut({ total, parts }: { total: number; parts: { v: number; c: string }[] }) {
  const r = 38, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2f7" strokeWidth="12" />
        {total > 0 && parts.map((p, i) => {
          const len = (p.v / total) * c; const off = acc; acc += len;
          return <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={p.c} strokeWidth="12" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-slate-800">{total}</span>
        <span className="text-[10px] text-slate-400">Toplam</span>
      </div>
    </div>
  );
}

function RowMenu({ r, onDetay, onDurum, onSil }: { r: Row; onDetay: () => void; onDurum: (r: Row, d: string) => void; onSil: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((o) => !o)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><MoreVertical size={16} /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1 text-sm">
            <button onClick={() => { setOpen(false); onDetay(); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50">Detay</button>
            {r.durum === 'onay_bekliyor' && <button onClick={() => { setOpen(false); onDurum(r, 'islemde'); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50">İşleme Al</button>}
            {r.durum !== 'tamamlandi' && r.durum !== 'reddedildi' && <button onClick={() => { setOpen(false); onDurum(r, 'tamamlandi'); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-emerald-700">Tamamla</button>}
            {r.durum !== 'tamamlandi' && r.durum !== 'reddedildi' && <button onClick={() => { setOpen(false); onDurum(r, 'reddedildi'); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-rose-600">Reddet</button>}
            {!r.islendi && <button onClick={() => { setOpen(false); onSil(); }} className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-rose-600 inline-flex items-center gap-1.5"><Trash2 size={13} /> Sil</button>}
          </div>
        </>
      )}
    </div>
  );
}

// ───────── Yeni Talep Formu (modal) ─────────
type LookupItem = { idx: number; productId: string | null; ad: string; varyasyon: string | null; adet: number; fiyat: number };
type SelState = Record<number, { sec: boolean; adet: number; sebep: string; defo: boolean }>;

function TalepForm({ tip: initTip, sebepler, onClose, onDone }: { tip: 'iade' | 'degisim'; sebepler: string[]; onClose: () => void; onDone: () => void }) {
  const [sip, setSip] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any | null>(null);
  const [tip, setTip] = useState<'iade' | 'degisim'>(initTip);
  const [sel, setSel] = useState<SelState>({});
  const [genelSebep, setGenelSebep] = useState('');
  const [degisimNot, setDegisimNot] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = async () => {
    if (!sip.trim()) return;
    setLoading(true); setOrder(null); setSel({});
    try {
      const r = await api.get('/store/iade/order-lookup', { params: { sip: sip.trim() } });
      setOrder(r.data);
      const sObj: SelState = {};
      (r.data.items || []).forEach((it: LookupItem) => { sObj[it.idx] = { sec: false, adet: it.adet, sebep: '', defo: false }; });
      setSel(sObj);
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
    finally { setLoading(false); }
  };
  const upd = (idx: number, patch: Partial<SelState[number]>) => setSel((p) => ({ ...p, [idx]: { ...p[idx], ...patch } }));

  const submit = async () => {
    if (!order) return;
    const items = (order.items || []).filter((it: LookupItem) => sel[it.idx]?.sec).map((it: LookupItem) => ({
      idx: it.idx, productId: it.productId, varyasyon: it.varyasyon, adet: sel[it.idx].adet, sebep: sel[it.idx].sebep || genelSebep, defo: sel[it.idx].defo,
    }));
    if (items.length === 0) { toast.error('En az bir ürün seçin.'); return; }
    setBusy(true);
    try {
      await api.post('/store/iade', { orderId: order.id, tip, items, genelSebep, degisimUrunler: tip === 'degisim' && degisimNot ? [{ not: degisimNot }] : undefined });
      toast.success('Talep oluşturuldu');
      onDone();
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <p className="font-bold text-slate-800">Yeni İade / Değişim Talebi</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Sipariş / Sepet Numarası</label>
            <div className="flex gap-2">
              <input value={sip} onChange={(e) => setSip(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()} placeholder="Örn: L7K2M" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <button onClick={lookup} disabled={loading} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"><Search size={15} /> {loading ? '...' : 'Sorgula'}</button>
            </div>
          </div>

          {order && (<>
            <div className="flex items-center justify-between flex-wrap gap-2 bg-slate-50 rounded-lg p-3">
              <div><p className="font-bold text-slate-800">{order.sipNo || order.id.slice(-5)}</p><p className="text-xs text-slate-500">{order.customer?.ad || order.musteriHandle || 'Misafir'} · Toplam {fmt(order.toplam)}{order.customer ? ` · Bakiye ${fmt(order.customer.bakiye)}` : ''}</p></div>
              <div className="flex gap-1.5">
                <button onClick={() => setTip('iade')} className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${tip === 'iade' ? 'bg-rose-600 text-white border-rose-600' : 'border-slate-200 text-slate-600'}`}>İade</button>
                <button onClick={() => setTip('degisim')} className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${tip === 'degisim' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600'}`}>Değişim</button>
              </div>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {order.items.map((it: LookupItem) => {
                const st = sel[it.idx] || { sec: false, adet: it.adet, sebep: '', defo: false };
                return (
                  <div key={it.idx} className={`border rounded-lg p-3 ${st.sec ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={st.sec} onChange={(e) => upd(it.idx, { sec: e.target.checked })} className="mt-1 w-4 h-4" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">{it.ad}{it.varyasyon ? <span className="text-slate-400"> · {it.varyasyon}</span> : null}</p>
                        <p className="text-xs text-slate-500">{it.adet} adet · {fmt(it.fiyat)}</p>
                        {st.sec && (
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div><label className="block text-[10px] text-slate-400 mb-0.5">Adet</label><input type="number" min={1} max={it.adet} value={st.adet} onChange={(e) => upd(it.idx, { adet: Math.min(it.adet, Math.max(1, Number(e.target.value) || 1)) })} className="w-full border border-slate-200 rounded px-2 py-1 text-sm" /></div>
                            <div className="sm:col-span-2"><label className="block text-[10px] text-slate-400 mb-0.5">Sebep</label><select value={st.sebep} onChange={(e) => upd(it.idx, { sebep: e.target.value })} className="w-full border border-slate-200 rounded px-2 py-1 text-sm"><option value="">Sebep seçin...</option>{sebepler.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
                            <label className="sm:col-span-3 inline-flex items-center gap-2 text-sm text-rose-600 cursor-pointer"><input type="checkbox" checked={st.defo} onChange={(e) => upd(it.idx, { defo: e.target.checked })} className="w-4 h-4" /><AlertTriangle size={14} /> Ürün defolu / kullanılamaz (Defo deposuna ayrılır — stoğa eklenmez)</label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Genel Açıklama / Sebep</label>
              <input value={genelSebep} onChange={(e) => setGenelSebep(e.target.value)} placeholder="İade/değişim sebebini açıkça belirtin" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            {tip === 'degisim' && (
              <div><label className="block text-[11px] text-slate-400 mb-1">Verilecek Yeni Ürün(ler) — Not (sadece kayıt)</label><input value={degisimNot} onChange={(e) => setDegisimNot(e.target.value)} placeholder="Örn: M beden → L beden" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
            )}
          </>)}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">İptal</button>
          <button onClick={submit} disabled={busy || !order} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"><PackageCheck size={16} /> {busy ? 'Kaydediliyor...' : 'Talebi Oluştur'}</button>
        </div>
      </div>
    </div>
  );
}

// ───────── Detay (modal) ─────────
function DetayModal({ r, onClose, onDurum }: { r: Row; onClose: () => void; onDurum: (r: Row, d: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div><p className="font-bold text-slate-800">Talep #ID-{r.talepNo}</p><p className="text-xs text-slate-500">{r.sipNo} · {r.customerAd} · {r.customerTel}</p></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${r.tip === 'iade' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'}`}>{r.tip === 'iade' ? 'İade' : 'Değişim'}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${DURUMLAR[r.durum]?.c}`}>{DURUMLAR[r.durum]?.t}</span>
            <span className="text-sm text-slate-500 ml-auto">{dt(r.createdAt)}</span>
          </div>
          <div className="border border-slate-100 rounded-lg divide-y divide-slate-50">
            {(r.items || []).map((it: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <div><p className="text-slate-800">{it.ad}{it.varyasyon ? ` · ${it.varyasyon}` : ''} {it.defo && <span className="text-rose-600 text-xs">(Defo)</span>}</p><p className="text-[11px] text-slate-400">{it.sebep || '-'} · {it.adet} adet</p></div>
                <span className="text-slate-600">{fmt((it.fiyat || 0) * (it.adet || 1))}</span>
              </div>
            ))}
          </div>
          {r.genelSebep && <p className="text-sm text-slate-600"><span className="text-slate-400">Açıklama:</span> {r.genelSebep}</p>}
          {Array.isArray(r.degisimUrunler) && r.degisimUrunler[0]?.not && <p className="text-sm text-slate-600"><span className="text-slate-400">Değişim notu:</span> {r.degisimUrunler[0].not}</p>}
          {r.redNedeni && <p className="text-sm text-rose-600"><span className="text-slate-400">Red nedeni:</span> {r.redNedeni}</p>}
          <div className="flex items-center justify-between pt-2"><span className="text-sm text-slate-500">Toplam Tutar</span><span className="font-bold text-slate-800">{fmt(r.iadeTutar)}</span></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t border-slate-100">
          {r.durum === 'onay_bekliyor' && <button onClick={() => { onDurum(r, 'islemde'); onClose(); }} className="px-3 py-2 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50">İşleme Al</button>}
          {r.durum !== 'tamamlandi' && r.durum !== 'reddedildi' && <button onClick={() => { onDurum(r, 'reddedildi'); onClose(); }} className="px-3 py-2 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">Reddet</button>}
          {r.durum !== 'tamamlandi' && r.durum !== 'reddedildi' && <button onClick={() => { onDurum(r, 'tamamlandi'); onClose(); }} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Tamamla</button>}
        </div>
      </div>
    </div>
  );
}

// ───────── Ayarlar (modal) ─────────
function AyarModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [sebepler, setSebepler] = useState<string[]>([]);
  const [yeni, setYeni] = useState('');
  const [defoKategoriAd, setDefoKategoriAd] = useState('Defo');
  const [varsayilanYontem, setVarsayilanYontem] = useState('bakiye');
  const [waBildirimAktif, setWaBildirimAktif] = useState(false);
  const [waSablon, setWaSablon] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/store/iade/settings').then((r) => {
      const d = r.data || {};
      setSebepler(d.sebepler || []); setDefoKategoriAd(d.defoKategoriAd || 'Defo');
      setVarsayilanYontem(d.varsayilanYontem || 'bakiye'); setWaBildirimAktif(!!d.waBildirimAktif); setWaSablon(d.waSablon || '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try { await api.put('/store/iade/settings', { sebepler, defoKategoriAd, varsayilanYontem, waBildirimAktif, waSablon }); toast.success('Ayarlar kaydedildi'); onSaved(); }
    catch (e: any) { toast.error(apiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100"><p className="font-bold text-slate-800">İade / Değişim Ayarları</p><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">İade / Değişim Sebepleri</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {sebepler.map((sb, i) => <span key={i} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 text-sm px-2.5 py-1 rounded-lg">{sb}<button onClick={() => setSebepler(sebepler.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500"><X size={13} /></button></span>)}
              {sebepler.length === 0 && <span className="text-sm text-slate-400">Henüz sebep yok</span>}
            </div>
            <div className="flex gap-2"><input value={yeni} onChange={(e) => setYeni(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && yeni.trim()) { setSebepler([...sebepler, yeni.trim()]); setYeni(''); } }} placeholder="Yeni sebep" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" /><button onClick={() => { if (yeni.trim()) { setSebepler([...sebepler, yeni.trim()]); setYeni(''); } }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"><Plus size={14} /> Ekle</button></div>
          </div>
          <div><label className="block text-xs text-slate-400 mb-1">Defo Kategorisi / Deposu Adı</label><input value={defoKategoriAd} onChange={(e) => setDefoKategoriAd(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /><p className="text-[11px] text-slate-400 mt-1">Defolu iade edilen ürünler bu kategori altında toplanır (satılabilir stoğa eklenmez).</p></div>
          <div><label className="block text-xs text-slate-400 mb-1">İade İçin Varsayılan Yöntem</label><select value={varsayilanYontem} onChange={(e) => setVarsayilanYontem(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"><option value="bakiye">Müşteri Bakiyesine Kredi</option><option value="nakit">Nakit İade</option></select></div>
          <div className="border-t border-slate-100 pt-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer mb-2"><input type="checkbox" checked={waBildirimAktif} onChange={(e) => setWaBildirimAktif(e.target.checked)} className="w-4 h-4" /> Müşteriye otomatik WhatsApp bilgilendirme gönder</label>
            <textarea value={waSablon} onChange={(e) => setWaSablon(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Merhaba {ad}, {sipNo} numaralı siparişinizdeki iade tutarı {tutar} hesabınıza tanımlanmıştır." />
            <p className="text-[11px] text-slate-400 mt-1">Değişkenler: {'{ad}'}, {'{sipNo}'}, {'{tutar}'}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-100"><button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">İptal</button><button onClick={save} disabled={busy} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"><Save size={16} /> {busy ? '...' : 'Kaydet'}</button></div>
      </div>
    </div>
  );
}
