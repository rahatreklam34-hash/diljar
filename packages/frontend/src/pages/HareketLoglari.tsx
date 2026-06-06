import { useState, useMemo } from 'react';
import { ClipboardList, Search, Filter, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';

type LogTip = 'Cari' | 'GelirGider' | 'Personel' | 'KasaBanka' | 'Cek' | 'Tumu';
type LogIslem = 'Ekleme' | 'Silme' | 'Guncelleme' | 'Odeme' | 'Tumu';

interface LogEntry {
  id: string;
  tarih: string;
  saat: string;
  islemTipi: LogTip;
  islem: LogIslem;
  aciklama: string;
  tutar?: number;
  alan?: string;
  kullanici: string;
}

const islemBadge: Record<LogIslem, string> = {
  Ekleme: 'bg-green-100 text-green-700',
  Silme: 'bg-red-100 text-red-700',
  Guncelleme: 'bg-blue-100 text-blue-700',
  Odeme: 'bg-purple-100 text-purple-700',
  Tumu: 'bg-gray-100 text-gray-600',
};

const tipBadge: Record<LogTip, string> = {
  Cari: 'bg-orange-100 text-orange-700',
  GelirGider: 'bg-green-100 text-green-700',
  Personel: 'bg-blue-100 text-blue-700',
  KasaBanka: 'bg-indigo-100 text-indigo-700',
  Cek: 'bg-red-100 text-red-700',
  Tumu: 'bg-gray-100 text-gray-600',
};

function fmt(n: number) { return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n); }

const PAGE_SIZE = 20;

export default function HareketLoglari() {
  const { hareketler, cariHareketler, personelHareketler, cariHesaplar, personeller } = useApp();

  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterTip, setFilterTip] = useState<LogTip>('Tumu');
  const [filterIslem, setFilterIslem] = useState<LogIslem>('Tumu');
  const [filterSearch, setFilterSearch] = useState('');
  const [page, setPage] = useState(1);

  const logs = useMemo((): LogEntry[] => {
    const list: LogEntry[] = [];

    hareketler.forEach(h => {
      list.push({
        id: `h-${h.id}`,
        tarih: h.tarih,
        saat: h.saat,
        islemTipi: 'GelirGider',
        islem: 'Ekleme',
        aciklama: `${h.tip === 'gelir' ? 'Gelir' : 'Gider'} kaydedildi: ${h.aciklama}`,
        tutar: h.tutar,
        alan: h.kategori,
        kullanici: 'Kullanici',
      });
    });

    cariHareketler.forEach(h => {
      const cari = cariHesaplar.find(c => c.id === h.cariHesapId);
      const tipMap: Record<string, string> = { borc_artis: 'Borc artti', borc_azalis: 'Borc azaldi', alacak_artis: 'Alacak artti', alacak_azalis: 'Alacak azaldi' };
      list.push({
        id: `ch-${h.id}`,
        tarih: h.tarih,
        saat: h.saat,
        islemTipi: 'Cari',
        islem: h.tip.includes('azalis') ? 'Odeme' : 'Ekleme',
        aciklama: `${cari?.ad || 'Bilinmeyen'} - ${tipMap[h.tip] || h.tip}: ${h.aciklama}`,
        tutar: h.tutar,
        alan: 'Cari Hesap',
        kullanici: 'Kullanici',
      });
    });

    personelHareketler.forEach(h => {
      const personel = personeller.find(p => p.id === h.personelId);
      const tipMap: Record<string, string> = { maas: 'Maas odemesi', avans: 'Avans odemesi', urun: 'Urun girisi' };
      list.push({
        id: `ph-${h.id}`,
        tarih: h.tarih,
        saat: h.saat,
        islemTipi: 'Personel',
        islem: 'Odeme',
        aciklama: `${personel?.ad || 'Bilinmeyen'} - ${tipMap[h.tip] || h.tip}: ${h.aciklama}`,
        tutar: h.tutar,
        alan: h.tip,
        kullanici: 'Kullanici',
      });
    });

    return list.sort((a, b) => {
      const da = a.tarih + 'T' + a.saat;
      const db = b.tarih + 'T' + b.saat;
      return db.localeCompare(da);
    });
  }, [hareketler, cariHareketler, personelHareketler, cariHesaplar, personeller]);

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterTip !== 'Tumu' && l.islemTipi !== filterTip) return false;
      if (filterIslem !== 'Tumu' && l.islem !== filterIslem) return false;
      if (filterStart && l.tarih < filterStart) return false;
      if (filterEnd && l.tarih > filterEnd) return false;
      if (filterSearch && !l.aciklama.toLowerCase().includes(filterSearch.toLowerCase())) return false;
      return true;
    });
  }, [logs, filterTip, filterIslem, filterStart, filterEnd, filterSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleExport() {
    const csv = ['Tarih,Saat,Islem Tipi,Islem,Aciklama,Tutar,Alan,Kullanici', ...filtered.map(l => `${l.tarih},${l.saat},${l.islemTipi},${l.islem},"${l.aciklama}",${l.tutar ?? ''},${l.alan ?? ''},${l.kullanici}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hareket-loglari-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const logTipler: LogTip[] = ['Tumu', 'Cari', 'GelirGider', 'Personel', 'KasaBanka', 'Cek'];
  const logIslemler: LogIslem[] = ['Tumu', 'Ekleme', 'Silme', 'Guncelleme', 'Odeme'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Hareket Loglari</h1>
          <p className="text-gray-500 text-sm">Tum islemlerin detayli kaydi</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-xl hover:bg-gray-700 text-sm font-medium transition-colors">
          <Download size={16} />CSV Disa Aktar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Toplam Log', val: logs.length, color: 'from-indigo-500 to-indigo-600' },
          { label: 'Gelir/Gider', val: logs.filter(l => l.islemTipi === 'GelirGider').length, color: 'from-green-500 to-green-600' },
          { label: 'Cari', val: logs.filter(l => l.islemTipi === 'Cari').length, color: 'from-orange-500 to-orange-600' },
          { label: 'Personel', val: logs.filter(l => l.islemTipi === 'Personel').length, color: 'from-blue-500 to-blue-600' },
        ].map(c => (
          <div key={c.label} className={`bg-gradient-to-br ${c.color} text-white rounded-2xl p-4`}>
            <div className="text-3xl font-bold">{c.val}</div>
            <div className="text-sm opacity-80 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-gray-500"><Filter size={16} /><span className="text-sm font-medium">Filtrele:</span></div>
          <input type="date" value={filterStart} onChange={e => { setFilterStart(e.target.value); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input type="date" value={filterEnd} onChange={e => { setFilterEnd(e.target.value); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <select value={filterTip} onChange={e => { setFilterTip(e.target.value as LogTip); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            {logTipler.map(t => <option key={t} value={t}>{t === 'Tumu' ? 'Tum Tipler' : t}</option>)}
          </select>
          <select value={filterIslem} onChange={e => { setFilterIslem(e.target.value as LogIslem); setPage(1); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            {logIslemler.map(i => <option key={i} value={i}>{i === 'Tumu' ? 'Tum Islemler' : i}</option>)}
          </select>
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-48">
            <Search size={15} className="text-gray-400" />
            <input value={filterSearch} onChange={e => { setFilterSearch(e.target.value); setPage(1); }} placeholder="Aciklama ara..." className="flex-1 outline-none text-sm" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-gray-500" />
            <span className="font-semibold text-gray-700">Log Kayitlari ({filtered.length})</span>
          </div>
          <span className="text-sm text-gray-400">Sayfa {page} / {totalPages}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Tarih/Saat</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Islem Tipi</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Islem</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Aciklama</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-right">Tutar</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Degisen Alan</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-left">Kullanici</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">Log kaydı bulunamadi</td></tr>
              )}
              {paginated.map(l => (
                <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="text-gray-700 font-medium">{l.tarih}</div>
                    <div className="text-xs text-gray-400">{l.saat}</div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${tipBadge[l.islemTipi]}`}>{l.islemTipi}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${islemBadge[l.islem]}`}>{l.islem}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-700 max-w-xs truncate">{l.aciklama}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800">
                    {l.tutar !== undefined ? `${fmt(l.tutar)} ₺` : '-'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{l.alan || '-'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{l.kullanici}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">{filtered.length} kayit, {PAGE_SIZE} per sayfa</span>
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
    </div>
  );
}
