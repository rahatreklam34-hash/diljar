import { useState } from 'react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';
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

export default function Ayarlar() {
  const { cariHesaplar, hareketler, kasaBanka, cekler, personeller } = useApp();
  const { user, updateProfile, updatePrefs } = useAuth();
  const [activeTab, setActiveTab] = useState<'profil' | 'genel' | 'veri' | 'tema'>('profil');
  // Profil: backend'deki User (ad/e-posta), firma: tenant adi (salt-okunur gosterim)
  // Tercihler (para birimi/tema): User.prefs.ayarlar altinda saklanir.
  const initialAyarlar: AyarlarState = {
    ad: user?.fullName || '',
    email: user?.email || '',
    firma: user?.tenant?.name || '',
    defaultParaCinsi: (user?.prefs?.ayarlar?.defaultParaCinsi as ParaCinsi) || 'TRY',
    tema: (user?.prefs?.ayarlar?.tema as 'light' | 'dark') || 'light',
  };
  const [ayarlar, setAyarlar] = useState<AyarlarState>(initialAyarlar);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  // Profil bilgilerini backend'e kaydeder (ProfileModal ile ayni PATCH /auth/me/profile).
  // Not: e-posta/sifre degisikligi guvenlik icin ProfileModal uzerinden yapilir.
  const saveProfil = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const body: { fullName?: string } = {};
      if (ayarlar.ad.trim() && ayarlar.ad.trim() !== user?.fullName) body.fullName = ayarlar.ad.trim();
      if (!Object.keys(body).length) { toast('Degisiklik yok'); setSaving(false); return; }
      await updateProfile(body);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Profil guncellendi');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally { setSaving(false); }
  };

  // Tercihleri (para birimi / tema) backend'e kaydeder (PATCH /auth/me/prefs).
  const savePrefs = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const nextPrefs = {
        ...(user?.prefs || {}),
        ayarlar: { defaultParaCinsi: ayarlar.defaultParaCinsi, tema: ayarlar.tema },
      };
      await updatePrefs(nextPrefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Ayarlar kaydedildi');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally { setSaving(false); }
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left ${activeTab === tab.id ? 'bg-[#1F9D57] text-white shadow-md shadow-[#1F9D57]/20' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}`}
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
                  <div className="w-16 h-16 bg-gradient-to-br from-[#22A95C] to-[#0F7C45] rounded-2xl flex items-center justify-center text-2xl font-bold text-white">
                    {(ayarlar.ad[0] || 'A').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{ayarlar.ad || 'Kullanici'}</p>
                    <p className="text-xs text-gray-400">{ayarlar.email || '-'}</p>
                    <p className="text-xs text-[#1F9D57] mt-0.5">Yonetici</p>
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
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#1F9D57]/20 focus:border-[#1F9D57] outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                      <Mail size={14} className="text-gray-400" /> E-posta
                    </label>
                    <input
                      type="email"
                      value={ayarlar.email}
                      readOnly
                      placeholder="e-posta@firma.com"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500 outline-none"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">E-posta ve sifre degisikligi ust menudeki "Profilim" penceresinden yapilir.</p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
                      <Globe size={14} className="text-gray-400" /> Firma Adi
                    </label>
                    <input
                      type="text"
                      value={ayarlar.firma}
                      readOnly
                      placeholder="Firma adiniz"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={saveProfil}
                    disabled={saving}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg disabled:opacity-60 ${saved ? 'bg-green-500 shadow-green-500/25 text-white' : 'bg-[#1F9D57] shadow-[#1F9D57]/25 text-white hover:bg-[#178A49]'}`}
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
                        className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${ayarlar.defaultParaCinsi === pc.value ? 'border-[#1F9D57] bg-[#1F9D57]/5 text-[#1F9D57]' : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
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
                    onClick={savePrefs}
                    disabled={saving}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg disabled:opacity-60 ${saved ? 'bg-green-500 shadow-green-500/25 text-white' : 'bg-[#1F9D57] shadow-[#1F9D57]/25 text-white hover:bg-[#178A49]'}`}
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
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg ${exportDone ? 'bg-green-500 shadow-green-500/25 text-white' : 'bg-[#1F9D57] shadow-[#1F9D57]/25 text-white hover:bg-[#178A49]'}`}
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
                        className={`p-3 rounded-xl border-2 transition-all text-left ${ayarlar.tema === theme.value ? 'border-[#1F9D57] bg-[#1F9D57]/5' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        {theme.preview}
                        <p className="text-xs font-medium text-gray-700 mt-2 text-center">{theme.label}</p>
                        {theme.value === 'dark' && <p className="text-[10px] text-gray-400 text-center">(Yakin zamanda)</p>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={savePrefs}
                    disabled={saving}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg disabled:opacity-60 ${saved ? 'bg-green-500 shadow-green-500/25 text-white' : 'bg-[#1F9D57] shadow-[#1F9D57]/25 text-white hover:bg-[#178A49]'}`}
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
