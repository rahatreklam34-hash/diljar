import MoneyInput from '../components/MoneyInput';
import { useState, useMemo, useEffect } from 'react';
import { FolderOpen, Search, Filter, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, FileText, Receipt, FileCheck, FileStack, File } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useUrlState } from '../lib/useUrlState';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

type BelgeGrup = 'Dekont' | 'Slip' | 'Evrak' | 'Fatura' | 'Diger';

interface Belge {
  id: string;
  ad: string;
  grup: BelgeGrup;
  tarih: string;
  aciklama: string;
  tutar?: number;
  iliskiliCari?: string;
  createdAt: string;
}

type TabGrup = 'Tumu' | BelgeGrup;

const grupIcon: Record<BelgeGrup, React.FC<{ size?: number | string; className?: string }>> = {
  Dekont: Receipt,
  Slip: FileCheck,
  Evrak: FileStack,
  Fatura: FileText,
  Diger: File,
};

const grupBadge: Record<BelgeGrup, string> = {
  Dekont: 'bg-blue-100 text-blue-700',
  Slip: 'bg-green-100 text-green-700',
  Evrak: 'bg-purple-100 text-purple-700',
  Fatura: 'bg-orange-100 text-orange-700',
  Diger: 'bg-gray-100 text-gray-600',
};

const grupList: BelgeGrup[] = ['Dekont', 'Slip', 'Evrak', 'Fatura', 'Diger'];

function fmt(n: number) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

function loadLS<T>(key: string, def: T): T {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : def; } catch { return def; }
}
function saveLS(key: string, val: unknown) { localStorage.setItem(key, JSON.stringify(val)); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

type BelgeForm = {
  ad: string;
  grup: BelgeGrup;
  tarih: string;
  aciklama: string;
  tutar: string;
  iliskiliCari: string;
};

const emptyForm = (): BelgeForm => ({
  ad: '',
  grup: 'Dekont',
  tarih: new Date().toISOString().split('T')[0],
  aciklama: '',
  tutar: '',
  iliskiliCari: '',
});

const PAGE_SIZE = 20;

export default function Belgelerim() {
  const { cariHesaplar } = useApp();

  const [belgeler, setBelgeler] = useState<Belge[]>(() => loadLS('belgelerim', []));
  useEffect(() => { saveLS('belgelerim', belgeler); }, [belgeler]);

  const [activeTab, setActiveTab] = useUrlState<TabGrup>('tab', 'Tumu');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Belge | null>(null);
  const [form, setForm] = useState<BelgeForm>(emptyForm());
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [filterStart, setFilterStart] = useUrlState('from', '');
  const [filterEnd, setFilterEnd] = useUrlState('to', '');
  const [filterGrup, setFilterGrup] = useUrlState<TabGrup>('grup', 'Tumu');
  const [filterCari, setFilterCari] = useUrlState('cari', '');
  const [filterSearch, setFilterSearch] = useUrlState('q', '');
  const [page, setPage] = useUrlState('page', 1);

  const filtered = useMemo(() => {
    return belgeler.filter(b => {
      const tab = activeTab !== 'Tumu' ? b.grup === activeTab : true;
      const grup = filterGrup !== 'Tumu' ? b.grup === filterGrup : true;
      const cari = filterCari ? b.iliskiliCari === filterCari : true;
      const start = filterStart ? b.tarih >= filterStart : true;
      const end = filterEnd ? b.tarih <= filterEnd : true;
      const search = filterSearch ? b.ad.toLowerCase().includes(filterSearch.toLowerCase()) || b.aciklama.toLowerCase().includes(filterSearch.toLowerCase()) : true;
      return tab && grup && cari && start && end && search;
    }).sort((a, b) => b.tarih.localeCompare(a.tarih));
  }, [belgeler, activeTab, filterGrup, filterCari, filterStart, filterEnd, filterSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => {
    const c: Record<TabGrup, number> = { Tumu: belgeler.length, Dekont: 0, Slip: 0, Evrak: 0, Fatura: 0, Diger: 0 };
    belgeler.forEach(b => { c[b.grup] = (c[b.grup] || 0) + 1; });
    return c;
  }, [belgeler]);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(b: Belge) {
    setEditTarget(b);
    setForm({ ad: b.ad, grup: b.grup, tarih: b.tarih, aciklama: b.aciklama, tutar: b.tutar !== undefined ? String(b.tutar) : '', iliskiliCari: b.iliskiliCari || '' });
    setModalOpen(true);
  }

  function save() {
    if (!form.ad) return;
    const data: Omit<Belge, 'id' | 'createdAt'> = {
      ad: form.ad,
      grup: form.grup,
      tarih: form.tarih,
      aciklama: form.aciklama,
      tutar: form.tutar ? Number(form.tutar) : undefined,
      iliskiliCari: form.iliskiliCari || undefined,
    };
    if (editTarget) {
      setBelgeler(prev => prev.map(b => b.id === editTarget.id ? { ...b, ...data } : b));
    } else {
      setBelgeler(prev => [...prev, { ...data, id: genId(), createdAt: new Date().toISOString() }]);
    }
    setModalOpen(false);
    setPage(1);
  }

  function deleteBelge(id: string) {
    setBelgeler(prev => prev.filter(b => b.id !== id));
  }

  const tabs: { key: TabGrup; label: string }[] = [
    { key: 'Tumu', label: 'Tumu' },
    { key: 'Dekont', label: 'Dekontlar' },
    { key: 'Slip', label: 'Slipler' },
    { key: 'Evrak', label: 'Evraklar' },
    { key: 'Fatura', label: 'Faturalar' },
    { key: 'Diger', label: 'Diger' },
  ];

  const summaryColors = ['from-emerald-500 to-emerald-600', 'from-blue-500 to-blue-600', 'from-green-500 to-green-600', 'from-purple-500 to-purple-600', 'from-orange-500 to-orange-600', 'from-gray-600 to-gray-700'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Belgelerim</h1>
          <p className="text-gray-500 text-sm">Dekont, slip, evrak ve belgelerinizi saklayip yonetin</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 text-sm font-medium transition-colors">
          <Plus size={16} />Belge Ekle
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {(['Tumu', ...grupList] as TabGrup[]).map((g, i) => {
          const Icon = g !== 'Tumu' ? grupIcon[g as BelgeGrup] : FolderOpen;
          return (
            <div key={g} className={`bg-gradient-to-br ${summaryColors[i]} text-white rounded-2xl p-4 cursor-pointer transition-all hover:scale-[1.02]`} onClick={() => { setActiveTab(g); setPage(1); }}>
              <div className="flex items-center gap-2 mb-1"><Icon size={14} className="opacity-80" /></div>
              <div className="text-2xl font-bold">{counts[g]}</div>
              <div className="text-xs opacity-80 mt-0.5">{g === 'Tumu' ? 'Toplam' : g}</div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-gray-100 p-2 shadow-sm flex flex-wrap gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors ${activeTab === t.key ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${activeTab === t.key ? 'bg-white/30' : 'bg-gray-200 text-gray-600'}`}>{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-gray-500"><Filter size={16} /><span className="text-sm font-medium">Filtrele:</span></div>
          <input type="date" value={filterStart} onChange={e => { setFilterStart(e.target.value); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input type="date" value={filterEnd} onChange={e => { setFilterEnd(e.target.value); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <select value={filterGrup} onChange={e => { setFilterGrup(e.target.value as TabGrup); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="Tumu">Tum Gruplar</option>
            {grupList.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterCari} onChange={e => { setFilterCari(e.target.value); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Tum Cariler</option>
            {cariHesaplar.map(c => <option key={c.id} value={c.id}>{c.ad}</option>)}
          </select>
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-48">
            <Search size={15} className="text-gray-400" />
            <input value={filterSearch} onChange={e => { setFilterSearch(e.target.value); setPage(1); }} placeholder="Belge ara..." className="flex-1 outline-none text-sm" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen size={18} className="text-gray-500" />
            <span className="font-semibold text-gray-700">Belgeler ({filtered.length})</span>
          </div>
          <span className="text-sm text-gray-400">Sayfa {page} / {totalPages}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Tarih</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Belge Adi</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Grup</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Aciklama</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-right">Tutar</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Iliskili Cari</th>
                <th className="px-5 py-3 font-medium text-gray-500">Islemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <FolderOpen size={40} className="opacity-30" />
                      <span>Belge bulunamadi</span>
                      <button onClick={openAdd} className="text-blue-500 hover:text-blue-700 text-sm underline">Ilk belgeyi ekle</button>
                    </div>
                  </td>
                </tr>
              )}
              {paginated.map(b => {
                const Icon = grupIcon[b.grup];
                const cari = cariHesaplar.find(c => c.id === b.iliskiliCari);
                return (
                  <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{b.tarih}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${grupBadge[b.grup]}`}><Icon size={13} /></div>
                        <span className="font-medium text-gray-800">{b.ad}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${grupBadge[b.grup]}`}>{b.grup}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{b.aciklama || '-'}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-800">
                      {b.tutar !== undefined ? `${fmt(b.tutar)} ₺` : '-'}
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{cari ? cari.ad : '-'}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => openEdit(b)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={14} /></button>
                        <button onClick={() => setConfirmId(b.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">{filtered.length} belge, {PAGE_SIZE} per sayfa</span>
          <div className="flex gap-2 items-center">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pg = page <= 3 ? i + 1 : page - 2 + i;
                if (pg > totalPages) return null;
                return (
                  <button key={pg} onClick={() => setPage(pg)} className={`w-8 h-8 rounded-xl text-sm transition-colors ${pg === page ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{pg}</button>
                );
              })}
            </div>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Belgeyi Duzenle' : 'Yeni Belge Ekle'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Belge Adi</label>
            <input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" placeholder="Belge adi..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grup</label>
              <select value={form.grup} onChange={e => setForm(f => ({ ...f, grup: e.target.value as BelgeGrup }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                {grupList.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
              <input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aciklama</label>
            <input value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" placeholder="Belge aciklamasi..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (opsiyonel)</label>
              <input type="text" inputMode="decimal" value={form.tutar} onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Iliskili Cari</label>
              <select value={form.iliskiliCari} onChange={e => setForm(f => ({ ...f, iliskiliCari: e.target.value }))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200">
                <option value="">Cari secin...</option>
                {cariHesaplar.map(c => <option key={c.id} value={c.id}>{c.ad}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm transition-colors">Iptal</button>
            <button onClick={save} className="flex-1 py-2 text-white bg-blue-500 hover:bg-blue-600 rounded-xl text-sm transition-colors font-medium">Kaydet</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!confirmId} onClose={() => setConfirmId(null)} onConfirm={() => { if (confirmId) deleteBelge(confirmId); }} title="Belgeyi Sil" message="Bu belgeyi silmek istediginizden emin misiniz?" />
    </div>
  );
}
