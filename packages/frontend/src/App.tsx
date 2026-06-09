import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import api from './lib/api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import CommandPalette from './components/CommandPalette';
import Dashboard from './pages/Dashboard';
import CariHesaplar from './pages/CariHesaplar';
import GelirGider from './pages/GelirGider';
import KasaBankaPage from './pages/KasaBanka';
import BankaHareketleri from './pages/BankaHareketleri';
import Cekler from './pages/Cekler';
import PersonelPage from './pages/Personel';
import FinansalDurum from './pages/FinansalDurum';
import Ajanda from './pages/Ajanda';
import Bildirimler from './pages/Bildirimler';
import Ayarlar from './pages/Ayarlar';
import HareketLoglari from './pages/HareketLoglari';
import Belgelerim from './pages/Belgelerim';
import DuzenliOdemeler from './pages/DuzenliOdemeler';
import Hedeflerim from './pages/Hedeflerim';
import Login from './pages/Login';
import Register from './pages/Register';
import DestekMerkezi from './pages/DestekMerkezi';
import Hakkimizda from './pages/Hakkimizda';
import Iletisim from './pages/Iletisim';
import KVKK from './pages/KVKK';
import Gizlilik from './pages/Gizlilik';
import MesafeliSatis from './pages/MesafeliSatis';
import IadeIptal from './pages/IadeIptal';
import Entegrasyonlar from './pages/Entegrasyonlar';
import { StoreProvider } from './context/StoreContext';
import Urunlerim from './pages/Urunlerim';
import UrunDetay from './pages/UrunDetay';
import TopluUrunEkle from './pages/TopluUrunEkle';
import Varyasyonlar from './pages/Varyasyonlar';
import Kategoriler from './pages/Kategoriler';
import SatisKodu from './pages/SatisKodu';
import OnlineMagaza from './pages/OnlineMagaza';
import Siparislerim from './pages/Siparislerim';
import Musterilerim from './pages/Musterilerim';
import MusteriDetay from './pages/MusteriDetay';
import CanliYayinSatis from './pages/CanliYayinSatis';
import CanliAkis from './pages/CanliAkis';
import ReklamYonetimi from './pages/ReklamYonetimi';
import KasaSatis from './pages/KasaSatis';
import SaticiPerformans from './pages/SaticiPerformans';
import Personeller from './pages/Personeller';
import EkipSohbet from './pages/EkipSohbet';
import Pazarlama from './pages/Pazarlama';
import MusteriDavranislari from './pages/MusteriDavranislari';
import Sicil from './pages/Sicil';
import Asistan from './pages/Asistan';
import AsistanSatislari from './pages/AsistanSatislari';
import DestekTalepleri from './pages/DestekTalepleri';
import PublicStore from './pages/PublicStore';
import VideoMagaza from './pages/VideoMagaza';
import UrunDetayPublic from './pages/UrunDetayPublic';
import KatalogPublic from './pages/KatalogPublic';
import PublicChat from './pages/PublicChat';
import UyeOl from './pages/UyeOl';
import Sepet from './pages/Sepet';

function AccessGuard() {
  const { canAccess, user } = useAuth();
  const location = useLocation();
  const nav2 = useNavigate();
  useEffect(() => {
    if (!user || user.role !== 'TENANT_USER') return;
    const path = location.pathname;
    if (path === '/' || path === '') return;
    if (!canAccess(path)) {
      const first = (user.permissions || [])[0] || '/destek';
      nav2(first, { replace: true });
    }
  }, [location.pathname, user, canAccess, nav2]);
  return null;
}

function TenantApp() {
  return (
    <AppProvider>
      <StoreProvider>
      <CommandPalette />
      <AccessGuard />
      <div className="min-h-screen flex">
        <Sidebar />
        <main className="flex-1 min-w-0 ml-0 lg:ml-64 overflow-x-hidden transition-all duration-300" id="main-content">
          <div className="p-4 pt-16 lg:p-5 lg:pt-5">
            <Routes>
              <Route path="/anasayfa" element={<Dashboard />} />
              <Route path="/cari-hesaplar" element={<CariHesaplar />} />
              <Route path="/gelir-gider" element={<GelirGider />} />
              <Route path="/kasa-banka" element={<KasaBankaPage />} />
              <Route path="/banka-hareketleri" element={<BankaHareketleri />} />
              <Route path="/cekler" element={<Cekler />} />
              <Route path="/personel" element={<PersonelPage />} />
              <Route path="/raporlar" element={<FinansalDurum />} />
              <Route path="/finansal-durum" element={<FinansalDurum />} />
              <Route path="/ajanda" element={<Ajanda />} />
              <Route path="/bildirimler" element={<Bildirimler />} />
              <Route path="/ayarlar" element={<Ayarlar />} />
              <Route path="/hareket-loglari" element={<HareketLoglari />} />
              <Route path="/belgelerim" element={<Belgelerim />} />
              <Route path="/duzenli-odemeler" element={<DuzenliOdemeler />} />
              <Route path="/hedeflerim" element={<Hedeflerim />} />
              <Route path="/destek" element={<DestekMerkezi />} />
              <Route path="/entegrasyonlar" element={<Entegrasyonlar />} />
              <Route path="/depo/urunlerim" element={<Urunlerim />} />
              <Route path="/depo/urun/:id" element={<UrunDetay />} />
              <Route path="/depo/urun-ekle" element={<Urunlerim autoAdd />} />
              <Route path="/depo/toplu-urun" element={<TopluUrunEkle />} />
              <Route path="/depo/varyasyonlar" element={<Varyasyonlar />} />
              <Route path="/depo/kategoriler" element={<Kategoriler />} />
              <Route path="/depo/satis-kodu" element={<SatisKodu />} />
              <Route path="/online-magaza" element={<OnlineMagaza />} />
              <Route path="/siparisler" element={<Siparislerim />} />
              <Route path="/siparisler/canli" element={<Siparislerim kanalFilter="canli" />} />
              <Route path="/siparisler/online" element={<Siparislerim kanalFilter="online" />} />
              <Route path="/musterilerim" element={<Musterilerim />} />
              <Route path="/musterilerim/:id" element={<MusteriDetay />} />
              <Route path="/canli-yayin" element={<CanliYayinSatis />} />
              <Route path="/canli-akis" element={<CanliAkis />} />
              <Route path="/reklam" element={<ReklamYonetimi />} />
              <Route path="/kasa-satis" element={<KasaSatis />} />
              <Route path="/satici-performans" element={<SaticiPerformans />} />
              <Route path="/personeller" element={<Personeller />} />
              <Route path="/ekip" element={<EkipSohbet />} />
              <Route path="/pazarlama" element={<Pazarlama />} />
              <Route path="/musteri-davranislari" element={<MusteriDavranislari />} />
              <Route path="/sicil" element={<Sicil />} />
              <Route path="/asistan" element={<Asistan />} />
              <Route path="/asistan-satislari" element={<AsistanSatislari />} />
              <Route path="/destek-talepleri" element={<DestekTalepleri />} />
              <Route path="*" element={<Navigate to="/anasayfa" replace />} />
            </Routes>
          </div>
        </main>
      </div>
      </StoreProvider>
    </AppProvider>
  );
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/anasayfa" replace />;
  return <>{children}</>;
}

// Kök: ziyaretçi -> videolu mağaza, giriş yapan -> uygulama
function RootGate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/anasayfa" replace />;
  return <PrimaryStoreRedirect />;
}
function PrimaryStoreRedirect() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => { api.get('/public/primary-store').then((r) => setSlug(r.data?.slug || null)).catch(() => setSlug(null)); }, []);
  if (slug === undefined) return null;
  if (!slug) return <Navigate to="/login" replace />;
  return <VideoMagaza slug={slug} />;
}
// Eski /magaza/:slug linklerini yeni mağaza yapısına (/m/:slug) yönlendir
function MagazaRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/m/${slug || ''}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/" element={<RootGate />} />
          <Route path="/m/:slug" element={<VideoMagaza />} />
          <Route path="/m/:slug/urun/:id" element={<UrunDetayPublic />} />
          <Route path="/urun/:id" element={<UrunDetayPublic />} />
          <Route path="/katalog/:slug" element={<KatalogPublic />} />
          <Route path="/magaza/:slug" element={<MagazaRedirect />} />
          <Route path="/sohbet/:slug" element={<PublicChat />} />
          <Route path="/uye/:slug" element={<UyeOl />} />
          <Route path="/sepet/:token" element={<Sepet />} />
          <Route path="/hakkimizda" element={<Hakkimizda />} />
          <Route path="/iletisim" element={<Iletisim />} />
          <Route path="/kvkk" element={<KVKK />} />
          <Route path="/gizlilik" element={<Gizlilik />} />
          <Route path="/mesafeli-satis" element={<MesafeliSatis />} />
          <Route path="/iade-iptal" element={<IadeIptal />} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/*" element={<ProtectedRoute><TenantApp /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
