import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Search, X, Phone, Mail, Eye, ChevronRight, Download, SlidersHorizontal, Users, ShieldCheck, TrendingUp, Star } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const initials = (ad: string) => (ad || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const VIP_ESIK = 15000;

export default function Musterilerim() {
  const { customers, orders, reload, storeSetting } = useStore();
  const nav = useNavigate();
  // Sayfa açıldığında en güncel müşteri listesini çek (yeni üyelikler hemen görünsün)
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const [search, setSearch] = useState('');
  const [fDurum, setFDurum] = useState('all');
  const [fRisk, setFRisk] = useState('all');
  const [fAralik, setFAralik] = useState('all');
  const [sort, setSort] = useState('yeni');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const [form, setForm] = useState({ ad: '', telefon: '', email: '', instagram: '', cinsiyet: '', adres: '', not: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Müşteri başına istatistik
  const stats = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of customers) m.set(c.id, { ciro: 0, siparis: 0, iptal: 0, toplamSiparis: 0, sonTarih: '' });
    for (const o of orders) {
      const s = m.get(o.customerId); if (!s) continue;
      s.toplamSiparis += 1;
      if (o.durum === 'iptal') s.iptal += 1;
      else if (o.durum !== 'sepet') { s.ciro += o.toplam || 0; s.siparis += 1; }
      if (!s.sonTarih || o.createdAt > s.sonTarih) s.sonTarih = o.createdAt;
    }
    for (const [, s] of m) {
      s.iadeOrani = s.toplamSiparis ? (s.iptal / s.toplamSiparis) * 100 : 0;
      s.risk = s.iadeOrani > 30 ? 'yuksek' : s.iadeOrani > 12 ? 'orta' : 'dusuk';
      s.aktif = s.siparis > 0;
      s.vip = s.ciro >= VIP_ESIK;
    }
    return m;
  }, [customers, orders]);

  const now = Date.now();
  const isYeni = (c: any) => (now - new Date(c.createdAt).getTime()) < 30 * 86400000;

  const kpi = useMemo(() => {
    const toplam = customers.length;
    let aktif = 0, vip = 0, yeni = 0;
    for (const c of customers) {
      const s = stats.get(c.id);
      if (s?.aktif) aktif += 1;
      if (s?.vip) vip += 1;
      if (isYeni(c)) yeni += 1;
    }
    return { toplam, aktif, vip, yeni, aktifPct: toplam ? (aktif / toplam) * 100 : 0, yeniPct: toplam ? (yeni / toplam) * 100 : 0 };
  }, [customers, stats]);

  const RISK = { dusuk: { t: 'Düşük Risk', c: 'bg-green-100 text-green-700' }, orta: { t: 'Orta Risk', c: 'bg-amber-100 text-amber-700' }, yuksek: { t: 'Yüksek Risk', c: 'bg-red-100 text-red-700' } } as any;

  const filtered = useMemo(() => {
    let list = customers.map((c) => ({ c, s: stats.get(c.id) || {} }));
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(({ c }) => [c.ad, c.telefon, c.email, c.instagram].some((f) => (f || '').toLowerCase().includes(q))); }
    if (fDurum !== 'all') list = list.filter(({ s }) => fDurum === 'aktif' ? s.aktif : !s.aktif);
    if (fRisk !== 'all') list = list.filter(({ s }) => s.risk === fRisk);
    if (fAralik !== 'all') list = list.filter(({ s }) => { const v = s.ciro || 0; if (fAralik === 'a') return v < 1000; if (fAralik === 'b') return v >= 1000 && v < 5000; if (fAralik === 'c') return v >= 5000 && v < 15000; return v >= 15000; });
    list.sort((a, b) => {
      if (sort === 'yeni') return new Date(b.c.createdAt).getTime() - new Date(a.c.createdAt).getTime();
      if (sort === 'eski') return new Date(a.c.createdAt).getTime() - new Date(b.c.createdAt).getTime();
      if (sort === 'harcama') return (b.s.ciro || 0) - (a.s.ciro || 0);
      return (a.c.ad || '').localeCompare(b.c.ad || '', 'tr');
    });
    return list;
  }, [customers, stats, search, fDurum, fRisk, fAralik, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);
  const from = filtered.length ? (page - 1) * perPage + 1 : 0;
  const to = Math.min(page * perPage, filtered.length);

  const open = (c?: any) => { setEdit(c || null); setForm(c ? { ad: c.ad, telefon: c.telefon || '', email: c.email || '', instagram: c.instagram || '', cinsiyet: c.cinsiyet || '', adres: c.adres || '', not: c.not || '' } : { ad: '', telefon: '', email: '', instagram: '', cinsiyet: '', adres: '', not: '' }); setModal(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ad.trim()) { toast.error('Ad zorunlu'); return; }
    try { if (edit) await api.patch(`/store/customers/${edit.id}`, form); else await api.post('/store/customers', form); toast.success('Kaydedildi'); setModal(false); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => { if (!confirm('Müşteri silinsin mi?')) return; try { await api.delete(`/store/customers/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const raporIndir = () => {
    const rows = filtered.map(({ c, s }) => ({
      'Müşteri': c.ad, 'Kullanıcı Adı': c.instagram || '', 'Cinsiyet': c.cinsiyet || '', 'Telefon': c.telefon || '', 'E-posta': c.email || '',
      'Toplam Alışveriş': s.ciro || 0, 'Sipariş': s.siparis || 0, 'İade Oranı %': Number((s.iadeOrani || 0).toFixed(1)),
      'Bakiye': c.bakiye || 0, 'Risk Grubu': RISK[s.risk || 'dusuk']?.t || '', 'Son Alışveriş': s.sonTarih ? new Date(s.sonTarih).toLocaleString('tr-TR') : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Müşteriler'); XLSX.writeFile(wb, 'musteriler.xlsx');
  };

  const pages = useMemo(() => {
    const arr: (number | string)[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) arr.push(i); return arr; }
    arr.push(1, 2, 3, 4, 5, '...', totalPages);
    return arr;
  }, [totalPages]);

  return (
    <div className="space-y-5">
      {/* Başlık + KPI */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Müşterilerim</h1>
          <p className="text-sm text-slate-400">Tüm müşterilerinizi görüntüleyin ve detaylarını inceleyin.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <KpiCard icon={Users} iconCls="bg-indigo-100 text-indigo-600" label="Toplam Müşteri" value={kpi.toplam.toLocaleString('tr-TR')} />
          <KpiCard icon={ShieldCheck} iconCls="bg-green-100 text-green-600" label="Aktif Müşteri" value={kpi.aktif.toLocaleString('tr-TR')} extra={`%${kpi.aktifPct.toFixed(1)}`} />
          <KpiCard icon={TrendingUp} iconCls="bg-sky-100 text-sky-600" label="Yeni Müşteri (30 Gün)" value={kpi.yeni.toLocaleString('tr-TR')} extra={`%${kpi.yeniPct.toFixed(1)}`} />
          <KpiCard icon={Star} iconCls="bg-amber-100 text-amber-600" label="VIP Müşteri" value={kpi.vip.toLocaleString('tr-TR')} />
          <button onClick={raporIndir} className="inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50"><Download size={16} /> Raporu İndir</button>
          <button onClick={() => open()} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700"><Plus size={16} /> Yeni Müşteri</button>
        </div>
      </div>

      {/* Filtre barı */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-3 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Müşteri adı, kullanıcı adı veya telefon ara..." className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
        </div>
        <Sel label="Durum" value={fDurum} onChange={(v) => { setFDurum(v); setPage(1); }} options={[['all', 'Tümü'], ['aktif', 'Aktif'], ['pasif', 'Pasif']]} />
        <Sel label="Risk Grubu" value={fRisk} onChange={(v) => { setFRisk(v); setPage(1); }} options={[['all', 'Tümü'], ['dusuk', 'Düşük Risk'], ['orta', 'Orta Risk'], ['yuksek', 'Yüksek Risk']]} />
        <Sel label="Alışveriş Aralığı" value={fAralik} onChange={(v) => { setFAralik(v); setPage(1); }} options={[['all', 'Tümü'], ['a', '0 - 1.000₺'], ['b', '1.000 - 5.000₺'], ['c', '5.000 - 15.000₺'], ['d', '15.000₺ +']]} />
        <Sel label="Sırala" value={sort} onChange={setSort} options={[['yeni', 'En Yeni'], ['eski', 'En Eski'], ['harcama', 'En Çok Harcayan'], ['ad', 'Ada Göre']]} />
        <button onClick={() => { setSearch(''); setFDurum('all'); setFRisk('all'); setFAralik('all'); setSort('yeni'); setPage(1); }} className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white hover:bg-slate-50 self-end"><SlidersHorizontal size={15} /> Sıfırla</button>
      </div>

      {storeSetting?.slug && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap text-sm">
          <span className="text-slate-600">Üyelik formu linki:</span>
          <a href={`/uye/${storeSetting.slug}`} target="_blank" className="text-indigo-700 underline break-all">{window.location.origin}/uye/{storeSetting.slug}</a>
          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/uye/${storeSetting.slug}`); toast.success('Kopyalandı'); }} className="ml-auto text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg">Kopyala</button>
        </div>
      )}

      {/* Tablo */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead className="text-slate-400 text-left text-xs uppercase border-b border-slate-100">
            <tr>
              <th className="px-5 py-4">Müşteri</th><th className="px-5 py-4">İletişim</th><th className="px-5 py-4">Alışveriş Özeti</th>
              <th className="px-5 py-4">Bakiye</th><th className="px-5 py-4">Risk Grubu</th><th className="px-5 py-4">Son Alışveriş</th><th className="px-5 py-4 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(({ c, s }) => {
              const bakiye = c.bakiye || 0;
              const bakLabel = bakiye > 0 ? 'Alacak' : bakiye < 0 ? 'Borç' : 'Borç yok';
              const bakCls = bakiye > 0 ? 'text-green-600' : bakiye < 0 ? 'text-red-500' : 'text-slate-400';
              const risk = RISK[s.risk || 'dusuk'];
              return (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-bold shrink-0">{initials(c.ad)}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-slate-800 truncate">{c.ad}</p>
                          {s.vip && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">VIP</span>}
                          {isYeni(c) && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-bold">Yeni</span>}
                          {c.cinsiyet && <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${c.cinsiyet === 'Kadın' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{c.cinsiyet}</span>}
                        </div>
                        {c.instagram && <p className="text-xs text-slate-400 truncate">{String(c.instagram).replace(/^@/, '')}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {c.telefon && <div className="flex items-center gap-1.5 text-xs"><Phone size={12} className="text-slate-400" /> {c.telefon}</div>}
                    {c.email && <div className="flex items-center gap-1.5 text-xs mt-0.5"><Mail size={12} className="text-slate-400" /> {c.email}</div>}
                    {!c.telefon && !c.email && <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-6">
                      <div><p className="text-[10px] text-slate-400">Toplam</p><p className="font-semibold text-slate-800">{fmt(s.ciro || 0)}</p></div>
                      <div><p className="text-[10px] text-slate-400">Sipariş</p><p className="font-medium text-slate-700">{s.siparis || 0}</p></div>
                      <div><p className="text-[10px] text-slate-400">İade Oranı</p><p className="font-medium text-slate-700">%{(s.iadeOrani || 0).toFixed(1)}</p></div>
                    </div>
                  </td>
                  <td className="px-5 py-4"><p className={`font-semibold ${bakCls}`}>{fmt(bakiye)}</p><p className="text-[10px] text-slate-400">{bakLabel}</p></td>
                  <td className="px-5 py-4"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${risk.c}`}>{risk.t}</span></td>
                  <td className="px-5 py-4 text-slate-500 text-xs">{s.sonTarih ? <>{new Date(s.sonTarih).toLocaleDateString('tr-TR')}<br /><span className="text-slate-400">{new Date(s.sonTarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></> : '—'}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => open(c)} title="Düzenle" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-100"><Pencil size={14} /></button>
                      <button onClick={() => nav(`/musterilerim/${c.id}`)} title="Hesap Dökümü" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100"><Eye size={15} /></button>
                      <button onClick={() => nav(`/musterilerim/${c.id}`)} className="w-8 h-8 rounded-lg border border-indigo-200 flex items-center justify-center text-indigo-600 hover:bg-indigo-50"><ChevronRight size={16} /></button>
                      <button onClick={() => del(c.id)} title="Sil" className="w-8 h-8 rounded-lg border border-red-100 flex items-center justify-center text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && <tr><td colSpan={7} className="px-5 py-16 text-center text-slate-400">Müşteri bulunamadı.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Sayfalama */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">{filtered.length.toLocaleString('tr-TR')} kayıttan {from} - {to} arası gösteriliyor</p>
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50">‹</button>
          {pages.map((p, i) => p === '...' ? <span key={i} className="px-2 text-slate-400">…</span> : (
            <button key={i} onClick={() => setPage(p as number)} className={`w-8 h-8 rounded-lg text-sm ${page === p ? 'bg-indigo-600 text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{p}</button>
          ))}
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50">›</button>
        </div>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="px-3 py-2 text-sm border border-slate-200 rounded-xl">
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / sayfa</option>)}
        </select>
      </div>

      {/* Ekle/Düzenle modal */}
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-md bg-white rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{edit ? 'Müşteri Düzenle' : 'Yeni Müşteri'}</h3><button type="button" onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <input required value={form.ad} onChange={(e) => set('ad', e.target.value)} placeholder="Ad Soyad *" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.telefon} onChange={(e) => set('telefon', e.target.value)} placeholder="Telefon" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="Instagram / Kullanıcı adı" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="E-posta" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Cinsiyet:</span>
              {(['Kadın', 'Erkek'] as const).map((c) => (
                <button key={c} type="button" onClick={() => set('cinsiyet', form.cinsiyet === c ? '' : c)} className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${form.cinsiyet === c ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 hover:border-indigo-400'}`}>{c}</button>
              ))}
            </div>
            <input value={form.adres} onChange={(e) => set('adres', e.target.value)} placeholder="Adres" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <textarea rows={2} value={form.not} onChange={(e) => set('not', e.target.value)} placeholder="Not" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Kaydet</button>
          </form>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon: Ic, iconCls, label, value, extra }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 min-w-[170px]">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconCls}`}><Ic size={18} /></div>
      <div>
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800 leading-tight">{value} {extra && <span className="text-xs font-medium text-green-600">{extra}</span>}</p>
      </div>
    </div>
  );
}
function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-col">
      <label className="text-[10px] text-slate-400 mb-0.5 ml-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl min-w-[150px] bg-white">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
}
