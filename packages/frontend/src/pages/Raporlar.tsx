import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { giderKategorileri } from '../types';
import { BarChart3, Download, ArrowUpRight, ArrowDownRight, Users, TrendingUp } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const kategoriler = ['Satis', 'Tahsilat', ...giderKategorileri];

export default function Raporlar() {
  const { hareketler, cariHesaplar, cariHareketler } = useApp();
  const [activeTab, setActiveTab] = useState<'gelir-gider' | 'cari'>('gelir-gider');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterTip, setFilterTip] = useState<'all' | 'gelir' | 'gider'>('all');
  const [filterKategori, setFilterKategori] = useState('all');

  const fmt = (v: number) => v.toLocaleString('tr-TR');

  const filteredHareketler = useMemo(() => {
    return hareketler
      .filter(h => filterTip === 'all' || h.tip === filterTip)
      .filter(h => filterKategori === 'all' || h.kategori === filterKategori)
      .filter(h => !dateFrom || h.tarih >= dateFrom)
      .filter(h => !dateTo || h.tarih <= dateTo)
      .sort((a, b) => b.tarih.localeCompare(a.tarih));
  }, [hareketler, filterTip, filterKategori, dateFrom, dateTo]);

  const toplamGelir = useMemo(() =>
    filteredHareketler.filter(h => h.tip === 'gelir').reduce((s, h) => s + h.tutar, 0),
    [filteredHareketler]);

  const toplamGider = useMemo(() =>
    filteredHareketler.filter(h => h.tip === 'gider').reduce((s, h) => s + h.tutar, 0),
    [filteredHareketler]);

  const kategoriOzet = useMemo(() => {
    const map: Record<string, { gelir: number; gider: number }> = {};
    filteredHareketler.forEach(h => {
      if (!map[h.kategori]) map[h.kategori] = { gelir: 0, gider: 0 };
      if (h.tip === 'gelir') map[h.kategori].gelir += h.tutar;
      else map[h.kategori].gider += h.tutar;
    });
    return Object.entries(map).sort((a, b) => (b[1].gelir + b[1].gider) - (a[1].gelir + a[1].gider));
  }, [filteredHareketler]);

  const cariOzet = useMemo(() => {
    return cariHesaplar.map(c => {
      const hareketleri = cariHareketler.filter(h => h.cariHesapId === c.id);
      const topBorc = hareketleri.filter(h => h.tip === 'alis_fatura').reduce((s, h) => s + h.tutar, 0);
      const topAlacak = hareketleri.filter(h => h.tip === 'satis_fatura').reduce((s, h) => s + h.tutar, 0);
      const odenen = hareketleri.filter(h => h.tip === 'odeme').reduce((s, h) => s + h.tutar, 0);
      const tahsil = hareketleri.filter(h => h.tip === 'tahsilat').reduce((s, h) => s + h.tutar, 0);
      const tip: 'borc' | 'alacak' = c.bakiye > 0 ? 'borc' : 'alacak';
      return { ...c, tip, topBorc, topAlacak, odenen, tahsil, hareketSayisi: hareketleri.length };
    }).sort((a, b) => b.bakiye - a.bakiye);
  }, [cariHesaplar, cariHareketler]);

  const exportGelirGiderPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Gelir / Gider Raporu', 14, 20);
    doc.setFontSize(10);
    doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 28);
    if (dateFrom || dateTo) {
      doc.text(`Donem: ${dateFrom || 'Baslangic'} - ${dateTo || 'Bitis'}`, 14, 34);
    }
    doc.text(`Toplam Gelir: ${fmt(toplamGelir)} TL  |  Toplam Gider: ${fmt(toplamGider)} TL  |  Net: ${fmt(toplamGelir - toplamGider)} TL`, 14, 40);

    autoTable(doc, {
      startY: 46,
      head: [['Tarih', 'Aciklama', 'Kategori', 'Tip', 'Tutar']],
      body: filteredHareketler.map(h => [
        h.tarih,
        h.aciklama,
        h.kategori,
        h.tip === 'gelir' ? 'Gelir' : 'Gider',
        `${h.tip === 'gelir' ? '+' : '-'}${fmt(h.tutar)} TL`
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [108, 99, 255] },
      columnStyles: { 4: { halign: 'right' } },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 150;
    doc.setFontSize(10);
    doc.text(`Toplam Gelir: ${fmt(toplamGelir)} TL`, 14, finalY + 10);
    doc.text(`Toplam Gider: ${fmt(toplamGider)} TL`, 14, finalY + 17);
    doc.text(`Net Kar/Zarar: ${fmt(toplamGelir - toplamGider)} TL`, 14, finalY + 24);

    doc.save(`gelir_gider_raporu_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportCariPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Cari Hesap Raporu', 14, 20);
    doc.setFontSize(10);
    doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [['Cari Adi', 'Tip', 'Toplam Borc', 'Toplam Alacak', 'Odenen', 'Tahsil', 'Bakiye']],
      body: cariOzet.map(c => [
        c.ad,
        c.tip === 'borc' ? 'Borclu' : 'Alacakli',
        `${fmt(c.topBorc)} TL`,
        `${fmt(c.topAlacak)} TL`,
        `${fmt(c.odenen)} TL`,
        `${fmt(c.tahsil)} TL`,
        `${fmt(c.bakiye)} TL`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [108, 99, 255] },
    });

    doc.save(`cari_hesap_raporu_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Raporlar</h1>
          <p className="text-sm text-gray-500">Finansal raporlarinizi goruntuleyin ve disari aktarin.</p>
        </div>
        <button
          onClick={activeTab === 'gelir-gider' ? exportGelirGiderPDF : exportCariPDF}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#6c63ff] text-white rounded-xl hover:bg-[#5b54e6] transition-colors shadow-lg shadow-[#6c63ff]/25"
        >
          <Download size={16} /> PDF Indir
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('gelir-gider')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'gelir-gider' ? 'bg-white text-[#6c63ff] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <TrendingUp size={15} /> Gelir / Gider
        </button>
        <button
          onClick={() => setActiveTab('cari')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'cari' ? 'bg-white text-[#6c63ff] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Users size={15} /> Cari Hesaplar
        </button>
      </div>

      {/* Gelir Gider Tab */}
      {activeTab === 'gelir-gider' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Baslangic:</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6c63ff]/20 outline-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Bitis:</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6c63ff]/20 outline-none"
                />
              </div>
              <select
                value={filterTip}
                onChange={e => setFilterTip(e.target.value as any)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/20"
              >
                <option value="all">Tum Tipler</option>
                <option value="gelir">Gelir</option>
                <option value="gider">Gider</option>
              </select>
              <select
                value={filterKategori}
                onChange={e => setFilterKategori(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#6c63ff]/20"
              >
                <option value="all">Tum Kategoriler</option>
                {kategoriler.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              {(dateFrom || dateTo || filterTip !== 'all' || filterKategori !== 'all') && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); setFilterTip('all'); setFilterKategori('all'); }}
                  className="px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg border border-red-100"
                >
                  Filtreleri Temizle
                </button>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <ArrowUpRight size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Toplam Gelir</p>
                  <p className="text-xl font-bold text-green-500">₺{fmt(toplamGelir)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <ArrowDownRight size={20} className="text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Toplam Gider</p>
                  <p className="text-xl font-bold text-red-500">₺{fmt(toplamGider)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toplamGelir - toplamGider >= 0 ? 'bg-blue-100' : 'bg-orange-100'}`}>
                  <BarChart3 size={20} className={toplamGelir - toplamGider >= 0 ? 'text-blue-600' : 'text-orange-600'} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net Kar / Zarar</p>
                  <p className={`text-xl font-bold ${toplamGelir - toplamGider >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    {toplamGelir - toplamGider >= 0 ? '+' : ''}₺{fmt(toplamGelir - toplamGider)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Kategori Ozet */}
          {kategoriOzet.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Kategori Ozeti</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Kategori</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Gelir</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Gider</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kategoriOzet.map(([kat, vals]) => (
                      <tr key={kat} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-6 py-3">
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">{kat}</span>
                        </td>
                        <td className="px-6 py-3 text-right text-sm font-medium text-green-500">{vals.gelir > 0 ? `+₺${fmt(vals.gelir)}` : '-'}</td>
                        <td className="px-6 py-3 text-right text-sm font-medium text-red-500">{vals.gider > 0 ? `-₺${fmt(vals.gider)}` : '-'}</td>
                        <td className="px-6 py-3 text-right">
                          <span className={`text-sm font-semibold ${vals.gelir - vals.gider >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {vals.gelir - vals.gider >= 0 ? '+' : ''}₺{fmt(vals.gelir - vals.gider)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Main Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Islem Detaylari</h2>
              <span className="text-xs text-gray-400">{filteredHareketler.length} kayit</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Tarih</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Aciklama</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Kategori</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Tip</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHareketler.map(h => (
                    <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-600">{h.tarih}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${h.tip === 'gelir' ? 'bg-green-100' : 'bg-red-100'}`}>
                            {h.tip === 'gelir'
                              ? <ArrowUpRight size={13} className="text-green-600" />
                              : <ArrowDownRight size={13} className="text-red-600" />}
                          </div>
                          <span className="text-sm text-gray-800">{h.aciklama}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">{h.kategori}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${h.tip === 'gelir' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {h.tip === 'gelir' ? 'Gelir' : 'Gider'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`font-semibold text-sm ${h.tip === 'gelir' ? 'text-green-500' : 'text-red-500'}`}>
                          {h.tip === 'gelir' ? '+' : '-'}₺{fmt(h.tutar)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredHareketler.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">Filtre kriterlerine uygun kayit bulunamadi.</td>
                    </tr>
                  )}
                </tbody>
                {filteredHareketler.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-50 border-t border-gray-200">
                      <td colSpan={3} className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">TOPLAM</td>
                      <td className="px-6 py-3">
                        <span className="text-xs text-gray-500">{filteredHareketler.length} islem</span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`font-bold text-sm ${toplamGelir - toplamGider >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {toplamGelir - toplamGider >= 0 ? '+' : ''}₺{fmt(toplamGelir - toplamGider)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cari Tab */}
      {activeTab === 'cari' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Toplam Alacak</p>
              <p className="text-xl font-bold text-green-500">₺{fmt(cariHesaplar.filter(c => c.bakiye < 0).reduce((s, c) => s + Math.abs(c.bakiye), 0))}</p>
              <p className="text-xs text-gray-400 mt-1">{cariHesaplar.filter(c => c.bakiye < 0).length} alacakli cari</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Toplam Borc</p>
              <p className="text-xl font-bold text-red-500">₺{fmt(cariHesaplar.filter(c => c.bakiye > 0).reduce((s, c) => s + c.bakiye, 0))}</p>
              <p className="text-xs text-gray-400 mt-1">{cariHesaplar.filter(c => c.bakiye > 0).length} borclu cari</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Toplam Cari</p>
              <p className="text-xl font-bold text-gray-800">{cariHesaplar.length}</p>
              <p className="text-xs text-gray-400 mt-1">Aktif cari sayisi</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Cari Hesap Ozeti</h2>
              <span className="text-xs text-gray-400">{cariOzet.length} cari</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Cari Adi</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Tip</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Toplam Borc</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Toplam Alacak</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Odenen</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Tahsil Edilen</th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Kalan Bakiye</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Islemler</th>
                  </tr>
                </thead>
                <tbody>
                  {cariOzet.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${c.tip === 'borc' ? 'bg-red-400' : 'bg-green-400'}`}>
                            {c.ad.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{c.ad}</p>
                            <p className="text-xs text-gray-400">{c.hareketSayisi} hareket</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${c.tip === 'borc' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {c.tip === 'borc' ? 'Borclu' : 'Alacakli'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-medium text-red-500">₺{fmt(c.topBorc)}</td>
                      <td className="px-6 py-3 text-right text-sm font-medium text-blue-500">₺{fmt(c.topAlacak)}</td>
                      <td className="px-6 py-3 text-right text-sm text-gray-600">₺{fmt(c.odenen)}</td>
                      <td className="px-6 py-3 text-right text-sm text-gray-600">₺{fmt(c.tahsil)}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={`text-sm font-bold ${c.tip === 'borc' ? 'text-red-500' : 'text-green-500'}`}>
                          ₺{fmt(Math.abs(c.bakiye))}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-1 text-xs rounded-lg ${c.bakiye === 0 ? 'bg-gray-100 text-gray-500' : c.tip === 'alacak' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                          {c.bakiye === 0 ? 'Kapali' : c.tip === 'alacak' ? 'Alacakli' : 'Borclu'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {cariOzet.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">Cari hesap bulunamadi.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
