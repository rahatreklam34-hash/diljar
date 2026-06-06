import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { paraCinsleri, ParaCinsi } from '../types';
import {
  User, Mail, Globe, Palette, Database,
  Download, Trash2, AlertTriangle, Check, Save
} from 'lucide-react';

interface AyarlarState {
  ad: string;
  email: string;
  firma: string;
  defaultParaCinsi: ParaCinsi;
  tema: 'light' | 'dark';
}

function loadAyarlar(): AyarlarState {
  try {
    const s = localStorage.getItem('ayarlar');
    if (s) return JSON.parse(s);
  } catch { /* empty */ }
  return { ad: 'Ahmet Yilmaz', email: 'admin@firmam.com', firma: 'Firmam A.S.', defaultParaCinsi: 'TRY', tema: 'light' };
}

export default function Ayarlar() {
  const { cariHesaplar, hareketler, kasaBanka, cekler, personeller } = useApp();
  const [activeTab, setActiveTab] = useState<'profil' | 'genel' | 'veri' | 'tema'>('profil');
  const [ayarlar, setAyarlar] = useState<AyarlarState>(loadAyarlar);
  const [saved, setSaved] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const saveAyarlar = () => {
    localStorage.setItem('ayarlar', JSON.stringify(ayarlar));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const exportData = () => {
    const data = {
      exportDate: new Date().toISOString(),
      cariHesaplar,
      hareketler,
      kasaBanka,
      cekler,
      personeller,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanstakip_yedek_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportDone(true);
    setTimeout(() => setExportDone(false), 2500);
  };

  const clearAllData = () => {
    // Tum localStorage anahtarlarini sil
    localStorage.clear();
    // Default ornek veriler yuklenmemesi icin bayrak
    localStorage.setItem('skip_defaults', '1');
    setClearConfirm(false);
    // HashRouter uyumlu yeniden yukleme
    window.location.hash = '#/';
    setTimeout(() => window.location.reload(), 100);
  };

  const totalDataCount = cariHesaplar.length + hareketler.length + kasaBanka.length + cekler.length + personeller.length;

  const TABS = [
    { id: 'profil' as const, label: 'Profil', icon: User },
    { id: 'genel' as const, label: 'Genel', icon: Globe },
    { id: 'veri' as const, label: 'Veri Yonetimi', icon: Database },
    { id: 'tema' as const, label: 'Tema', icon: Palette },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Ayarlar</h1>
        <p className="text-sm text-gray-500">Uygulama tercihlerinizi yapilandirin.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar Nav */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <nav className="p-2 space-y-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${activeTab === tab.id ? 'bg-[#6c63ff] text-white shadow-md shadow-[#6c63ff]/20' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}`}
                >
                  <tab.icon size={17} className="shrink-0" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Profil */}
          {activeTab === 'profil' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-800">Kullanici Profili</h2>
                <p className="text-sm text-gray-500 mt-0.5">Kisisel bilgilerinizi duzenleyin.</p>
              </div>
              <div className="p-6 space-y-5">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-[#6c63ff] to-purple-500 rounded-2xl flex items-center justify-center text-2xl font-bold text-white">
                    {(ayarlar.ad[0] || 'A').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{ayarlar.ad || 'Kullanici'}</p>
                    <p className="text-xs text-gray-400">{ayarlar.email || '-'}</p>
                    <p className="text-xs text-[#6c63ff] mt-0.5">Yonetici</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                      <User size={14} className="text-gray-400" /> Ad Soyad
                    </label>
                    <input
                      type="text"
                      value={ayarlar.ad}
                      onChange={e => setAyarlar({ ...ayarlar, ad: e.target.value })}
                      placeholder="Adinizi girin"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6c63ff]/20 focus:border-[#6c63ff] outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                      <Mail size={14} className="text-gray-400" /> E-posta
                    </label>
                    <input
                      type="email"
                      value={ayarlar.email}
                      onChange={e => setAyarlar({ ...ayarlar, email: e.target.value })}
                      placeholder="e-posta@firma.com"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6c63ff]/20 focus:border-[#6c63ff] outline-none transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                      <Globe size={14} className="text-gray-400" /> Firma Adi
                    </label>
                    <input
                      type="text"
                      value={ayarlar.firma}
                      onChange={e => setAyarlar({ ...ayarlar, firma: e.target.value })}
                      placeholder="Firma adinizi girin"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6c63ff]/20 focus:border-[#6c63ff] outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={saveAyarlar}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg ${saved ? 'bg-green-500 shadow-green-500/25 text-white' : 'bg-[#6c63ff] shadow-[#6c63ff]/25 text-white hover:bg-[#5b54e6]'}`}
                  >
                    {saved ? <><Check size={16} /> Kaydedildi</> : <><Save size={16} /> Degisiklikleri Kaydet</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Genel */}
          {activeTab === 'genel' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-800">Genel Ayarlar</h2>
                <p className="text-sm text-gray-500 mt-0.5">Uygulama genel tercihlerini yapilandirin.</p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Varsayilan Para Cinsi</label>
                  <p className="text-xs text-gray-400 mb-3">Yeni islemlerde varsayilan olarak kullanilacak para cinsi.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {paraCinsleri.map(pc => (
                      <button
                        key={pc.value}
                        onClick={() => setAyarlar({ ...ayarlar, defaultParaCinsi: pc.value })}
                        className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${ayarlar.defaultParaCinsi === pc.value ? 'border-[#6c63ff] bg-[#6c63ff]/5 text-[#6c63ff]' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                      >
                        <span className="text-xl font-bold">{pc.symbol}</span>
                        <span className="text-xs font-medium">{pc.value}</span>
                        <span className="text-[10px] text-gray-400">{pc.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tarih Formati</label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { value: 'tr-TR', label: 'TR: 31.12.2024' },
                      { value: 'iso', label: 'ISO: 2024-12-31' },
                    ].map(fmt => (
                      <button
                        key={fmt.value}
                        className="px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-gray-600 hover:border-gray-300 transition-all"
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Bu ozellik yakin zamanda aktif edilecektir.</p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={saveAyarlar}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg ${saved ? 'bg-green-500 shadow-green-500/25 text-white' : 'bg-[#6c63ff] shadow-[#6c63ff]/25 text-white hover:bg-[#5b54e6]'}`}
                  >
                    {saved ? <><Check size={16} /> Kaydedildi</> : <><Save size={16} /> Kaydet</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Veri Yonetimi */}
          {activeTab === 'veri' && (
            <div className="space-y-4">
              {/* Data Stats */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                  <h2 className="text-base font-semibold text-gray-800">Veri Ozeti</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Uygulamada kayitli verilerin ozeti.</p>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'Cari Hesap', count: cariHesaplar.length, color: 'text-blue-600', bg: 'bg-blue-50' },
                      { label: 'Gelir / Gider', count: hareketler.length, color: 'text-green-600', bg: 'bg-green-50' },
                      { label: 'Kasa & Banka', count: kasaBanka.length, color: 'text-purple-600', bg: 'bg-purple-50' },
                      { label: 'Cek', count: cekler.length, color: 'text-orange-600', bg: 'bg-orange-50' },
                      { label: 'Personel', count: personeller.length, color: 'text-pink-600', bg: 'bg-pink-50' },
                      { label: 'Toplam Kayit', count: totalDataCount, color: 'text-gray-800', bg: 'bg-gray-100' },
                    ].map(item => (
                      <div key={item.label} className={`${item.bg} rounded-xl p-4`}>
                        <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                        <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Export */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100">
                  <h2 className="text-base font-semibold text-gray-800">Veri Disa Aktarimi</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Tum verilerinizi JSON formatinda indirin.</p>
                </div>
                <div className="p-6">
                  <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-xl border border-blue-100 mb-4">
                    <Download size={20} className="text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-800">JSON Yedek Dosyasi</p>
                      <p className="text-xs text-blue-600 mt-0.5">Tum cari hesaplar, hareketler, cekler ve personel bilgilerini icerir. Yedek olarak saklamaniz onerilir.</p>
                    </div>
                  </div>
                  <button
                    onClick={exportData}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg ${exportDone ? 'bg-green-500 shadow-green-500/25 text-white' : 'bg-[#6c63ff] shadow-[#6c63ff]/25 text-white hover:bg-[#5b54e6]'}`}
                  >
                    {exportDone ? <><Check size={16} /> Indirildi!</> : <><Download size={16} /> Veriyi Indir (JSON)</>}
                  </button>
                </div>
              </div>

              {/* Clear Data */}
              <div className="bg-white rounded-2xl shadow-sm border border-red-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-red-100">
                  <h2 className="text-base font-semibold text-red-700">Tehlikeli Islemler</h2>
                  <p className="text-sm text-red-400 mt-0.5">Bu islemler geri alinamaz. Dikkatli olun.</p>
                </div>
                <div className="p-6">
                  <div className="flex items-start gap-4 p-4 bg-red-50 rounded-xl border border-red-100 mb-4">
                    <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Tum Verileri Sil</p>
                      <p className="text-xs text-red-600 mt-0.5">Bu islem tum cari hesaplar, hareketler, cekler ve personel kayitlarini kalici olarak siler. Bu islem geri alinamaz.</p>
                    </div>
                  </div>

                  {!clearConfirm ? (
                    <button
                      onClick={() => setClearConfirm(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors shadow-lg shadow-red-500/25"
                    >
                      <Trash2 size={16} /> Tum Verileri Sil
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-red-700 font-medium">Emin misiniz? Bu islem geri alinamaz!</p>
                      <button
                        onClick={clearAllData}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
                      >
                        Evet, Sil
                      </button>
                      <button
                        onClick={() => setClearConfirm(false)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                      >
                        Iptal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tema */}
          {activeTab === 'tema' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-800">Tema Ayarlari</h2>
                <p className="text-sm text-gray-500 mt-0.5">Uygulama gorunumunu kisiselestirin.</p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Renk Modu</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {[
                      {
                        value: 'light' as const,
                        label: 'Acik Tema',
                        preview: (
                          <div className="w-full h-12 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-center gap-1">
                            <div className="w-3 h-3 bg-white rounded-full border border-gray-300" />
                            <div className="w-6 h-1.5 bg-gray-300 rounded-full" />
                          </div>
                        ),
                      },
                      {
                        value: 'dark' as const,
                        label: 'Koyu Tema',
                        preview: (
                          <div className="w-full h-12 bg-gray-800 rounded-lg flex items-center justify-center gap-1">
                            <div className="w-3 h-3 bg-gray-600 rounded-full" />
                            <div className="w-6 h-1.5 bg-gray-500 rounded-full" />
                          </div>
                        ),
                      },
                    ].map(theme => (
                      <button
                        key={theme.value}
                        onClick={() => setAyarlar({ ...ayarlar, tema: theme.value })}
                        className={`p-3 rounded-xl border-2 transition-all text-left ${ayarlar.tema === theme.value ? 'border-[#6c63ff] bg-[#6c63ff]/5' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        {theme.preview}
                        <p className="text-xs font-medium text-gray-700 mt-2 text-center">{theme.label}</p>
                        {theme.value === 'dark' && <p className="text-[10px] text-gray-400 text-center">(Yakin zamanda)</p>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-5">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Vurgu Rengi</label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { color: '#6c63ff', label: 'Mor (Varsayilan)' },
                      { color: '#3b82f6', label: 'Mavi' },
                      { color: '#10b981', label: 'Yesil' },
                      { color: '#f59e0b', label: 'Turuncu' },
                      { color: '#ec4899', label: 'Pembe' },
                    ].map(item => (
                      <button
                        key={item.color}
                        title={item.label}
                        className="w-8 h-8 rounded-full ring-2 ring-offset-2 ring-transparent hover:ring-gray-300 transition-all"
                        style={{ backgroundColor: item.color }}
                        onClick={() => {/* placeholder */}}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">Vurgu rengi ozellestirmesi yakin zamanda eklenecektir.</p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={saveAyarlar}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg ${saved ? 'bg-green-500 shadow-green-500/25 text-white' : 'bg-[#6c63ff] shadow-[#6c63ff]/25 text-white hover:bg-[#5b54e6]'}`}
                  >
                    {saved ? <><Check size={16} /> Kaydedildi</> : <><Save size={16} /> Kaydet</>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
