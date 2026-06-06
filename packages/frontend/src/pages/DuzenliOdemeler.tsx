import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { DuzenliOdeme } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import MoneyInput from '../components/MoneyInput';
import { Calendar, Clock, Plus, Pencil, Trash2, Bell, CheckCircle, AlertTriangle, DollarSign, RefreshCw, Zap, X } from 'lucide-react';

const KATEGORILER = ['Kira', 'Elektrik', 'Su', 'Dogalgaz', 'Internet', 'Telefon', 'Sigorta', 'Kredi', 'Abonelik', 'Diger'];
const PERIYOT_LABEL: Record<string, string> = { aylik: 'Aylik', haftalik: 'Haftalik', yillik: 'Yillik' };
const KAT_COLORS: Record<string, string> = {
  Kira: 'bg-blue-50 text-blue-600', Elektrik: 'bg-yellow-50 text-yellow-600', Su: 'bg-cyan-50 text-cyan-600',
  Dogalgaz: 'bg-orange-50 text-orange-600', Internet: 'bg-purple-50 text-purple-600', Telefon: 'bg-pink-50 text-pink-600',
  Sigorta: 'bg-green-50 text-green-600', Kredi: 'bg-red-50 text-red-600', Abonelik: 'bg-indigo-50 text-indigo-600', Diger: 'bg-gray-100 text-gray-600',
};

function nextPaymentDate(item: DuzenliOdeme): Date {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const base = item.sonOdemeTarihi ? new Date(item.sonOdemeTarihi) : new Date(item.createdAt);
  let next = new Date(base);
  if (item.periyot === 'aylik') {
    next = new Date(today.getFullYear(), today.getMonth(), item.odemeGunu);
    if (next <= base || next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, item.odemeGunu);
  } else if (item.periyot === 'haftalik') {
    next = new Date(base); next.setDate(next.getDate() + 7);
    while (next < today) next.setDate(next.getDate() + 7);
  } else {
    next = new Date(base); next.setFullYear(next.getFullYear() + 1);
    while (next < today) next.setFullYear(next.getFullYear() + 1);
  }
  return next;
}

function daysDiff(d: Date): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

const fmt = (v: number) => v.toLocaleString('tr-TR');
const fmtDate = (d: Date) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const emptyForm = {
  ad: '', kategori: 'Kira', tutar: '', sabitTutar: true,
  periyot: 'aylik' as DuzenliOdeme['periyot'], odemeGunu: 1,
  hatirlatmaGun: 3, aciklama: '', durum: 'aktif' as DuzenliOdeme['durum'],
};

export default function DuzenliOdemeler() {
  const { duzenliOdemeler, addDuzenliOdeme, updateDuzenliOdeme, deleteDuzenliOdeme, kasaBanka, addHareket, updateKasaBanka } = useApp();

  const [tab, setTab] = useState<'tumu' | 'aktif' | 'pasif'>('tumu');
  const [filterKat, setFilterKat] = useState('tumu');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<DuzenliOdeme | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Ode modal
  const [odeItem, setOdeItem] = useState<DuzenliOdeme | null>(null);
  const [odeTutar, setOdeTutar] = useState('');
  const [odeKaynakId, setOdeKaynakId] = useState('');

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const aktifOdemeler = duzenliOdemeler.filter(d => d.durum === 'aktif');
  const aylikToplam = aktifOdemeler.filter(d => d.periyot === 'aylik' && d.sabitTutar).reduce((s, d) => s + d.tutar, 0);

  const thisMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const buAyOdenen = duzenliOdemeler.filter(d => d.sonOdemeTarihi && d.sonOdemeTarihi.startsWith(thisMonthStr)).length;
  const buAyBekleyen = aktifOdemeler.filter(d => {
    const np = nextPaymentDate(d);
    return np.getFullYear() === today.getFullYear() && np.getMonth() === today.getMonth();
  }).length - buAyOdenen;

  const filtered = useMemo(() => duzenliOdemeler
    .filter(d => tab === 'tumu' || d.durum === tab)
    .filter(d => filterKat === 'tumu' || d.kategori === filterKat)
    .filter(d => d.ad.toLowerCase().includes(search.toLowerCase()) || d.kategori.toLowerCase().includes(search.toLowerCase())),
    [duzenliOdemeler, tab, filterKat, search]);

  // Yaklasan (next 7 days)
  const yaklasan = aktifOdemeler.filter(d => { const diff = daysDiff(nextPaymentDate(d)); return diff >= 0 && diff <= 7; })
    .sort((a, b) => nextPaymentDate(a).getTime() - nextPaymentDate(b).getTime());

  // Hatirlatmalar
  const hatirlatmalar = aktifOdemeler.filter(d => { const diff = daysDiff(nextPaymentDate(d)); return diff >= 0 && diff <= d.hatirlatmaGun; });

  const openCreate = () => { setForm({ ...emptyForm }); setEditItem(null); setModalOpen(true); };
  const openEdit = (item: DuzenliOdeme) => {
    setEditItem(item);
    setForm({ ad: item.ad, kategori: item.kategori, tutar: item.tutar.toString(), sabitTutar: item.sabitTutar, periyot: item.periyot, odemeGunu: item.odemeGunu, hatirlatmaGun: item.hatirlatmaGun, aciklama: item.aciklama || '', durum: item.durum });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ad: form.ad, kategori: form.kategori, tutar: form.sabitTutar ? Number(form.tutar) : 0, sabitTutar: form.sabitTutar, periyot: form.periyot, odemeGunu: form.odemeGunu, hatirlatmaGun: form.hatirlatmaGun, aciklama: form.aciklama || undefined, durum: form.durum };
    if (editItem) updateDuzenliOdeme(editItem.id, payload); else addDuzenliOdeme(payload);
    setModalOpen(false);
  };

  const openOde = (item: DuzenliOdeme) => {
    setOdeItem(item);
    setOdeTutar(item.sabitTutar ? item.tutar.toString() : '');
    setOdeKaynakId(kasaBanka[0]?.id || '');
  };

  const handleOde = () => {
    if (!odeItem || !odeTutar || !odeKaynakId) return;
    const tutar = Number(odeTutar);
    const kaynak = kasaBanka.find(k => k.id === odeKaynakId);
    if (!kaynak) return;
    const tarih = today.toISOString().split('T')[0];
    addHareket({ tarih, saat: new Date().toTimeString().slice(0, 5), aciklama: `${odeItem.ad} odemesi`, tutar, tip: 'gider', kategori: odeItem.kategori, kasaBankaId: odeKaynakId });
    updateKasaBanka(odeKaynakId, { bakiye: kaynak.bakiye - tutar });
    updateDuzenliOdeme(odeItem.id, { sonOdemeTarihi: tarih });
    setOdeItem(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Duzenli Odemelerim</h1>
          <p className="text-[11px] text-gray-400">Tekrar eden odemelerinizi takip edin ve yonetin.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6c63ff] text-white rounded-lg text-xs font-medium hover:bg-[#5b54e6]">
          <Plus size={14} /> Yeni Odeme
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <RefreshCw size={18} className="text-blue-500" />, bg: 'bg-blue-50', label: 'Aktif Odeme', value: aktifOdemeler.length, sub: 'toplam aktif' },
          { icon: <DollarSign size={18} className="text-purple-500" />, bg: 'bg-purple-50', label: 'Aylik Maliyet', value: `${fmt(aylikToplam)} ₺`, sub: 'sabit tutarlar' },
          { icon: <CheckCircle size={18} className="text-green-500" />, bg: 'bg-green-50', label: 'Bu Ay Odenen', value: buAyOdenen, sub: 'odeme yapildi' },
          { icon: <Clock size={18} className="text-orange-500" />, bg: 'bg-orange-50', label: 'Bu Ay Bekleyen', value: Math.max(0, buAyBekleyen), sub: 'odeme bekliyor' },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center`}>{c.icon}</div>
              <div><p className="text-[9px] text-gray-400">{c.label}</p><p className="text-lg font-bold text-gray-800">{c.value}</p></div>
            </div>
            <p className="text-[9px] text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Hatirlatmalar */}
      {hatirlatmalar.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1"><Bell size={13} /> Hatirlatmalar</p>
          <div className="flex flex-wrap gap-2">
            {hatirlatmalar.map(d => {
              const diff = daysDiff(nextPaymentDate(d));
              return (
                <span key={d.id} className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-amber-200 rounded-lg text-[10px] text-amber-700">
                  <AlertTriangle size={11} />
                  <strong>{d.ad}</strong> — {diff === 0 ? 'Bugün' : `${diff} gun sonra`}
                  {d.sabitTutar && <span className="font-bold ml-1">{fmt(d.tutar)} ₺</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Yaklasan Odemeler */}
      {yaklasan.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-[12px] font-semibold text-gray-700 mb-2 flex items-center gap-1"><Zap size={13} className="text-[#6c63ff]" /> Yaklasan Odemeler (7 Gun)</h3>
          <div className="flex gap-2 flex-wrap">
            {yaklasan.map(d => {
              const diff = daysDiff(nextPaymentDate(d));
              return (
                <div key={d.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] ${diff === 0 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-100'}`}>
                  <Calendar size={11} className={diff === 0 ? 'text-red-500' : 'text-blue-500'} />
                  <span className="font-medium text-gray-700">{d.ad}</span>
                  <span className={diff === 0 ? 'text-red-600 font-bold' : 'text-blue-600'}>{diff === 0 ? 'Bugün' : `${diff}g`}</span>
                  {d.sabitTutar && <span className="font-bold text-gray-800">{fmt(d.tutar)} ₺</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-4 px-4 border-b border-gray-100">
          {(['tumu', 'aktif', 'pasif'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`py-3 text-[11px] font-medium border-b-2 capitalize ${tab === t ? 'border-[#6c63ff] text-[#6c63ff]' : 'border-transparent text-gray-400'}`}>
              {t === 'tumu' ? 'Tumu' : t === 'aktif' ? 'Aktif' : 'Pasif'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50">
          <select value={filterKat} onChange={e => setFilterKat(e.target.value)} className="px-2 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none">
            <option value="tumu">Tum Kategoriler</option>
            {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara..." className="flex-1 px-3 py-1.5 text-[10px] border border-gray-200 rounded-lg outline-none" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Ad', 'Kategori', 'Tutar', 'Periyot', 'Odeme Gunu', 'Son Odeme', 'Sonraki Odeme', 'Durum', 'Islemler'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const np = nextPaymentDate(d);
                const diff = daysDiff(np);
                const isUrgent = diff >= 0 && diff <= 3 && d.durum === 'aktif';
                return (
                  <tr key={d.id} className={`border-b border-gray-50 hover:bg-gray-50/50 ${isUrgent ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-3 py-2 font-medium text-gray-700">{d.ad}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${KAT_COLORS[d.kategori] || KAT_COLORS['Diger']}`}>{d.kategori}</span>
                    </td>
                    <td className="px-3 py-2 font-bold text-gray-800">
                      {d.sabitTutar ? `${fmt(d.tutar)} ₺` : <span className="text-gray-400 italic font-normal">Degisken</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{PERIYOT_LABEL[d.periyot]}</td>
                    <td className="px-3 py-2 text-gray-600">{d.odemeGunu}. gun</td>
                    <td className="px-3 py-2 text-gray-500">{d.sonOdemeTarihi ? d.sonOdemeTarihi : '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${diff === 0 ? 'text-red-600' : diff <= 3 ? 'text-amber-600' : 'text-gray-600'}`}>
                        {fmtDate(np)}
                        {d.durum === 'aktif' && diff >= 0 && diff <= 7 && <span className="ml-1 text-[9px]">({diff === 0 ? 'Bugün' : `${diff}g`})</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${d.durum === 'aktif' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {d.durum === 'aktif' ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {d.durum === 'aktif' && (
                          <button onClick={() => openOde(d)} title="Ode" className="p-1 text-green-500 hover:bg-green-50 rounded">
                            <CheckCircle size={12} />
                          </button>
                        )}
                        <button onClick={() => openEdit(d)} className="p-1 text-gray-400 hover:text-amber-500 rounded"><Pencil size={11} /></button>
                        <button onClick={() => setDeleteId(d.id)} className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 size={11} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Kayit bulunamadi</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-100">
          <span className="text-[10px] text-gray-400">{filtered.length} kayit</span>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Odeme Duzenle' : 'Yeni Duzenli Odeme'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Ad</label>
              <input required value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="Odeme adi" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Kategori</label>
              <select value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Periyot</label>
              <select value={form.periyot} onChange={e => setForm({ ...form, periyot: e.target.value as DuzenliOdeme['periyot'] })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                <option value="aylik">Aylik</option>
                <option value="haftalik">Haftalik</option>
                <option value="yillik">Yillik</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Odeme Gunu (1-28)</label>
              <input type="number" min={1} max={28} required value={form.odemeGunu} onChange={e => setForm({ ...form, odemeGunu: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.sabitTutar} onChange={e => setForm({ ...form, sabitTutar: e.target.checked })} className="rounded" />
              Sabit Tutar
            </label>
            {form.sabitTutar && (
              <div className="flex-1">
                <MoneyInput value={form.tutar} onChange={v => setForm({ ...form, tutar: v })} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="Tutar" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Hatirlatma (gun once)</label>
              <select value={form.hatirlatmaGun} onChange={e => setForm({ ...form, hatirlatmaGun: Number(e.target.value) })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                {[1, 2, 3, 5, 7].map(n => <option key={n} value={n}>{n} gun once</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Durum</label>
              <select value={form.durum} onChange={e => setForm({ ...form, durum: e.target.value as DuzenliOdeme['durum'] })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                <option value="aktif">Aktif</option>
                <option value="pasif">Pasif</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-1">Aciklama (opsiyonel)</label>
            <input value={form.aciklama} onChange={e => setForm({ ...form, aciklama: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" placeholder="Notlar..." />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button>
            <button type="submit" className="px-5 py-2 text-sm bg-[#6c63ff] text-white rounded-lg hover:bg-[#5b54e6]">{editItem ? 'Guncelle' : 'Kaydet'}</button>
          </div>
        </form>
      </Modal>

      {/* Ode Modal */}
      {odeItem && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800">{odeItem.ad} — Odeme Yap</h3>
              <button onClick={() => setOdeItem(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Tutar</label>
                <MoneyInput value={odeTutar} onChange={setOdeTutar} required className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Kaynak Hesap</label>
                <select value={odeKaynakId} onChange={e => setOdeKaynakId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none">
                  <option value="">Hesap secin...</option>
                  {kasaBanka.map(k => <option key={k.id} value={k.id}>{k.ad} ({k.tip}) — {fmt(k.bakiye)} ₺</option>)}
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setOdeItem(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Iptal</button>
                <button onClick={handleOde} disabled={!odeTutar || !odeKaynakId} className="px-5 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">Onayla</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteDuzenliOdeme(deleteId); setDeleteId(null); }}
        title="Odeme Sil"
        message="Bu duzenli odemeyi silmek istediginizden emin misiniz?"
      />
    </div>
  );
}
