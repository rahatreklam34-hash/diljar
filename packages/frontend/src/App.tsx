import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, lazy as reactLazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend, TimeScale } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend, TimeScale);

// Yeni sürüm deploy edildiğinde eski sayfa, artık var olmayan chunk dosyasını
// yüklemeye çalışınca "Failed to fetch dynamically imported module" hatası verir.
// Bu sarmalayıcı, ilk hatada (oturumda bir kez) sayfayı otomatik yeniler → güncel index.html + yeni chunk adları gelir.
function lazy(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return reactLazy(async () => {
    try {
      return await factory();
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isChunkErr = /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|error loading dynamically/i.test(msg);
      const key = 'chunk_reload_at';
      const last = Number(sessionStorage.getItem(key) || '0');
      // Sonsuz döngüyü engelle: son 10 sn içinde zaten yenilediyse hatayı göster.
      if (isChunkErr && Date.now() - last > 10000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
        // reload tetiklendi; bileşen render edilmeden önce sayfa gidecek
        return await new Promise<{ default: React.ComponentType<any> }>(() => {});
      }
      throw err;
    }
  });
}
import api from './lib/api';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import CommandPalette from './components/CommandPalette';
import MessengerDock from './components/MessengerDock';
import { StoreProvider, useStore } from './context/StoreContext';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CariHesaplar = lazy(() => import('./pages/CariHesaplar'));
const GelirGider = lazy(() => import('./pages/GelirGider'));
const KasaBankaPage = lazy(() => import('./pages/KasaBanka'));
const BankaHareketleri = lazy(() => import('./pages/BankaHareketleri'));
const Cekler = lazy(() => import('./pages/Cekler'));
const PersonelPage = lazy(() => import('./pages/Personel'));
const FinansalDurum = lazy(() => import('./pages/FinansalDurum'));
const Ajanda = lazy(() => import('./pages/Ajanda'));
const Bildirimler = lazy(() => import('./pages/Bildirimler'));
const Ayarlar = lazy(() => import('./pages/Ayarlar'));
const HareketLoglari = lazy(() => import('./pages/HareketLoglari'));
const Belgelerim = lazy(() => import('./pages/Belgelerim'));
const DuzenliOdemeler = lazy(() => import('./pages/DuzenliOdemeler'));
const Hedeflerim = lazy(() => import('./pages/Hedeflerim'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const DestekMerkezi = lazy(() => import('./pages/DestekMerkezi'));
const Hakkimizda = lazy(() => import('./pages/Hakkimizda'));
const Iletisim = lazy(() => import('./pages/Iletisim'));
const KVKK = lazy(() => import('./pages/KVKK'));
const Gizlilik = lazy(() => import('./pages/Gizlilik'));
const MesafeliSatis = lazy(() => import('./pages/MesafeliSatis'));
const IadeIptal = lazy(() => import('./pages/IadeIptal'));
const Entegrasyonlar = lazy(() => import('./pages/Entegrasyonlar'));
const Urunlerim = lazy(() => import('./pages/Urunlerim'));
const UrunDetay = lazy(() => import('./pages/UrunDetay'));
const TopluUrunEkle = lazy(() => import('./pages/TopluUrunEkle'));
const Varyasyonlar = lazy(() => import('./pages/Varyasyonlar'));
const Kategoriler = lazy(() => import('./pages/Kategoriler'));
const Markalar = lazy(() => import('./pages/Markalar'));
const SatisKodu = lazy(() => import('./pages/SatisKodu'));
const UrunIceAktar = lazy(() => import('./pages/UrunIceAktar'));
const StokHareketleri = lazy(() => import('./pages/StokHareketleri'));
const KargoIslemleri = lazy(() => import('./pages/KargoIslemleri'));
const OnlineMagaza = lazy(() => import('./pages/OnlineMagaza'));
const Siparislerim = lazy(() => import('./pages/Siparislerim'));
const IadeDegisim = lazy(() => import('./pages/IadeDegisim'));
const UrunEkle = lazy(() => import('./pages/UrunEkle'));
const Musterilerim = lazy(() => import('./pages/Musterilerim'));
const MusteriDetay = lazy(() => import('./pages/MusteriDetay'));
const CanliYayinSatis = lazy(() => import('./pages/CanliYayinSatis'));
const CanliAkis = lazy(() => import('./pages/CanliAkis'));
const ReklamYonetimi = lazy(() => import('./pages/ReklamYonetimi'));
const KasaSatis = lazy(() => import('./pages/KasaSatis'));
const SaticiPerformans = lazy(() => import('./pages/SaticiPerformans'));
const Personeller = lazy(() => import('./pages/Personeller'));
const EkipSohbet = lazy(() => import('./pages/EkipSohbet'));
const Pazarlama = lazy(() => import('./pages/Pazarlama'));
const MusteriDavranislari = lazy(() => import('./pages/MusteriDavranislari'));
const Sicil = lazy(() => import('./pages/Sicil'));
const Asistan = lazy(() => import('./pages/Asistan'));
const AsistanSatislari = lazy(() => import('./pages/AsistanSatislari'));
const EtkilesimAgi = lazy(() => import('./pages/EtkilesimAgi'));
const IgOtoYanit = lazy(() => import('./pages/IgOtoYanit'));
const WhatsappPaneli = lazy(() => import('./pages/WhatsappPaneli'));
const TopluMesaj = lazy(() => import('./pages/TopluMesaj'));
const DestekTalepleri = lazy(() => import('./pages/DestekTalepleri'));
const PublicStore = lazy(() => import('./pages/PublicStore'));
const VideoMagaza = lazy(() => import('./pages/VideoMagaza'));
const UrunDetayPublic = lazy(() => import('./pages/UrunDetayPublic'));
const KatalogPublic = lazy(() => import('./pages/KatalogPublic'));
const KatalogYayin = lazy(() => import('./pages/KatalogYayin'));
const KatalogTedarikci = lazy(() => import('./pages/KatalogTedarikci'));
const KatalogYonetimi = lazy(() => import('./pages/KatalogYonetimi'));
const ZamanlayiciBildirim = lazy(() => import('./pages/ZamanlayiciBildirim'));
const Fatura = lazy(() => import('./pages/Fatura'));
const KatalogCustomPublic = lazy(() => import('./pages/KatalogCustomPublic'));
const PublicChat = lazy(() => import('./pages/PublicChat'));
const UyeOl = lazy(() => import('./pages/UyeOl'));
const Sepet = lazy(() => import('./pages/Sepet'));
const BekleyenSiparisler = lazy(() => import('./pages/BekleyenSiparisler'));
const SerbestTedarikciler = lazy(() => import('./pages/SerbestTedarikciler'));
const TedarikciPortal = lazy(() => import('./pages/TedarikciPortal'));
const LandingPageAdmin = lazy(() => import('./pages/LandingPage'));
const LandingPublic = lazy(() => import('./pages/LandingPublic'));
const PublicGiris = lazy(() => import('./pages/PublicGiris'));
const Hesabim = lazy(() => import('./pages/Hesabim'));

// Sayfa yüklenirken yazısız ince spinner
function PageLoader() {
  return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="w-8 h-8 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" /></div>;
}

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

function RouteDataRefresher() {
  const { reload } = useStore();
  const location = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; } // ilk yukleme StoreProvider'da yapiliyor
    reload();
  }, [location.pathname]);
  return null;
}

function TenantApp() {
  return (
    <AppProvider>
      <StoreProvider>
      <CommandPalette />
      <AccessGuard />
      <RouteDataRefresher />
      <MessengerDock />
      <div className="min-h-screen flex">
        <Sidebar />
        <main className="flex-1 min-w-0 ml-0 lg:ml-64 overflow-x-hidden transition-all duration-300" id="main-content">
          <div className="p-4 pt-16 lg:p-5 lg:pt-5">
            <Suspense fallback={<div className="flex items-center justify-center py-24"><span className="w-7 h-7 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" /></div>}>
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
              <Route path="/depo/urun-ekle" element={<UrunEkle />} />
              <Route path="/depo/toplu-urun" element={<TopluUrunEkle />} />
              <Route path="/depo/varyasyonlar" element={<Varyasyonlar />} />
              <Route path="/depo/kategoriler" element={<Kategoriler />} />
              <Route path="/depo/markalar" element={<Markalar />} />
              <Route path="/depo/satis-kodu" element={<SatisKodu />} />
              <Route path="/depo/urun-ice-aktar" element={<UrunIceAktar />} />
              <Route path="/depo/stok-hareketleri" element={<StokHareketleri />} />
              <Route path="/online-magaza" element={<OnlineMagaza />} />
              <Route path="/landing-page" element={<LandingPageAdmin />} />
              <Route path="/siparisler" element={<Siparislerim />} />
              <Route path="/siparis-talepleri" element={<Siparislerim talepMode />} />
              <Route path="/siparisler/canli" element={<Siparislerim kanalFilter="canli" />} />
              <Route path="/siparisler/online" element={<Siparislerim kanalFilter="online" />} />
              <Route path="/satislar/iade-degisim" element={<IadeDegisim />} />
              <Route path="/raporlar/kargo-islemleri" element={<KargoIslemleri />} />
              <Route path="/musterilerim" element={<Musterilerim />} />
              <Route path="/musterilerim/:id" element={<MusteriDetay />} />
              <Route path="/canli-yayin" element={<CanliYayinSatis />} />
              <Route path="/bekleyen-siparisler" element={<BekleyenSiparisler />} />
              <Route path="/serbest-tedarikciler" element={<SerbestTedarikciler />} />
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
              <Route path="/etkilesim-agi" element={<EtkilesimAgi />} />
              <Route path="/ig-oto-yanit" element={<IgOtoYanit />} />
              <Route path="/katalog-yonetimi" element={<KatalogYonetimi />} />
              <Route path="/zamanlayici-bildirim" element={<ZamanlayiciBildirim />} />
              <Route path="/fatura" element={<Fatura />} />
              <Route path="/fatura/ayarlar" element={<Fatura tab="ayarlar" />} />
              <Route path="/whatsapp" element={<WhatsappPaneli />} />
              <Route path="/whatsapp/toplu-mesaj" element={<TopluMesaj />} />
              <Route path="/whatsapp/ayarlar" element={<WhatsappPaneli />} />
              <Route path="/destek-talepleri" element={<DestekTalepleri />} />
              <Route path="*" element={<Navigate to="/anasayfa" replace />} />
            </Routes>
            </Suspense>
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

// Kök dizin: e-ticaret mağazası (ziyaretçi & sahibi). Giriş yapan sahibi /anasayfa'ya login akışında yönlenir.
function StoreView() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => { api.get('/public/primary-store').then((r) => setSlug(r.data?.slug || null)).catch(() => setSlug(null)); }, []);
  if (slug === undefined) return null;
  if (!slug) return <Navigate to="/login" replace />;
  return <PublicStore slug={slug} />;
}
// Eski /m/:slug ve /magaza/:slug linklerini kök dizine yönlendir
function LegacyStoreRedirect() {
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<StoreView />} />
          <Route path="/kategori/:id" element={<StoreView />} />
          <Route path="/cinsiyet/:g" element={<StoreView />} />
          <Route path="/fiyati-dusenler" element={<StoreView />} />
          <Route path="/one-cikanlar" element={<StoreView />} />
          <Route path="/yeni-gelenler" element={<StoreView />} />
          <Route path="/son-sans" element={<StoreView />} />
          <Route path="/tum-urunler" element={<StoreView />} />
          <Route path="/talep/:talepNo" element={<StoreView />} />
          <Route path="/urun/:id" element={<UrunDetayPublic />} />
          <Route path="/katalog/stream/:token" element={<KatalogYayin />} />
          <Route path="/katalog/t/:token" element={<KatalogTedarikci />} />
          <Route path="/katalog/:slug" element={<KatalogPublic />} />
          <Route path="/ozel-katalog/:slug" element={<KatalogCustomPublic />} />
          <Route path="/lp/:slug" element={<LandingPublic />} />
          <Route path="/m/:slug/*" element={<LegacyStoreRedirect />} />
          <Route path="/m/:slug" element={<LegacyStoreRedirect />} />
          <Route path="/magaza/:slug" element={<LegacyStoreRedirect />} />
          <Route path="/sohbet/:slug" element={<PublicChat />} />
          <Route path="/uye/:slug" element={<UyeOl />} />
          <Route path="/giris" element={<PublicGiris />} />
          <Route path="/hesabim" element={<Hesabim />} />
          <Route path="/sepet/:token" element={<Sepet />} />
          <Route path="/hakkimizda" element={<Hakkimizda />} />
          <Route path="/iletisim" element={<Iletisim />} />
          <Route path="/kvkk" element={<KVKK />} />
          <Route path="/gizlilik" element={<Gizlilik />} />
          <Route path="/mesafeli-satis" element={<MesafeliSatis />} />
          <Route path="/iade-iptal" element={<IadeIptal />} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/tedarikci" element={<TedarikciPortal />} />
          <Route path="/*" element={<ProtectedRoute><TenantApp /></ProtectedRoute>} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
