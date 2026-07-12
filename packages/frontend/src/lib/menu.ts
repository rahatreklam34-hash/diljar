import {
  LayoutDashboard, Users, FileText, TrendingUp, Landmark, RefreshCw,
  Package, PackagePlus, Layers, Tag, Hash, Radio, ScanLine, Award, Bookmark,
  UserCheck, Megaphone, Store, Bot, LifeBuoy, ShoppingBag, Calendar,
  BarChart3, Target, ClipboardList, FolderOpen, Bell, Plug, UserCog,
  MessageSquare, Settings, Banknote, Activity, LayoutTemplate, MessageCircle, DownloadCloud, Truck, Send, Clock, Network,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type IconType = LucideIcon;

export interface MenuItem {
  to: string;
  label: string;
  icon: IconType;
}

export interface MenuGroup {
  title: string | null;
  items: MenuItem[];
}

// Uygulamanin TEK menu kaynagi. Hem Sidebar hem CommandPalette (Ctrl+Space) bunu kullanir.
// Buraya eklenen her sayfa otomatik olarak menude ve aramada gorunur.
export const navGroups: MenuGroup[] = [
  {
    title: null,
    items: [{ to: '/anasayfa', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    title: 'Finans',
    items: [
      { to: '/cari-hesaplar', icon: Users, label: 'Cari Hesaplar' },
      { to: '/kasa-banka', icon: Landmark, label: 'Kasa & Banka' },
      { to: '/banka-hareketleri', icon: Banknote, label: 'Banka Hareketleri' },
      { to: '/gelir-gider', icon: TrendingUp, label: 'Gelir / Gider' },
      { to: '/cekler', icon: FileText, label: 'Cekler' },
      { to: '/duzenli-odemeler', icon: RefreshCw, label: 'Duzenli Odemelerim' },
      { to: '/finansal-durum', icon: BarChart3, label: 'Finansal Durumum' },
      { to: '/hedeflerim', icon: Target, label: 'Hedeflerim' },
      { to: '/hareket-loglari', icon: ClipboardList, label: 'Hareket Loglari' },
    ],
  },
  {
    title: 'Satislar',
    items: [
      { to: '/canli-yayin', icon: Radio, label: 'Canli Yayin Satis' },
      { to: '/kasa-satis', icon: ScanLine, label: 'Kasa Satisi' },
      { to: '/online-magaza', icon: Store, label: 'Online Magazam' },
      { to: '/landing-page', icon: LayoutTemplate, label: 'Landing Page' },
      { to: '/canli-akis', icon: Activity, label: 'Canli Akisi Izle' },
      { to: '/satici-performans', icon: Award, label: 'Satici Performansi' },
      { to: '/satislar/iade-degisim', icon: RefreshCw, label: 'Iade ve Degisim' },
      { to: '/siparis-talepleri', icon: FileText, label: 'Siparis Talepleri' },
    ],
  },
  {
    title: 'DROPSHOPING',
    items: [
      { to: '/bekleyen-siparisler', icon: ClipboardList, label: 'Bekleyen Siparisler' },
      { to: '/serbest-tedarikciler', icon: UserCog, label: 'Tedarikciler' },
    ],
  },
  {
    title: 'Siparisler',
    items: [
      { to: '/siparisler', icon: ShoppingBag, label: 'Tum Siparisler' },
      { to: '/siparisler/canli', icon: Radio, label: 'Canli Yayin Satislari' },
      { to: '/siparisler/online', icon: Store, label: 'Online Magaza Satislari' },
    ],
  },
  {
    title: 'Raporlamalar',
    items: [
      { to: '/raporlar/kargo-islemleri', icon: Truck, label: 'Kargo Islemleri' },
    ],
  },
  {
    title: 'Musteriler',
    items: [
      { to: '/musterilerim', icon: Users, label: 'Musterilerim' },
      { to: '/destek-talepleri', icon: LifeBuoy, label: 'Destek Talepleri' },
    ],
  },
  {
    title: 'Depo Yonetimi',
    items: [
      { to: '/depo/urunlerim', icon: Package, label: 'Urunlerim' },
      { to: '/depo/urun-ekle', icon: PackagePlus, label: 'Urun Ekle' },
      { to: '/depo/toplu-urun', icon: Layers, label: 'Toplu Urun Ekle' },
      { to: '/depo/varyasyonlar', icon: Layers, label: 'Varyasyonlarim' },
      { to: '/depo/kategoriler', icon: Tag, label: 'Urun Kategorileri' },
      { to: '/depo/markalar', icon: Bookmark, label: 'Markalar' },
      { to: '/depo/satis-kodu', icon: Hash, label: 'Satis Kodu Havuzu' },
      { to: '/depo/urun-ice-aktar', icon: DownloadCloud, label: 'Urun Ice Aktar' },
      { to: '/depo/stok-hareketleri', icon: ClipboardList, label: 'Stok Hareketleri' },
    ],
  },
  {
    title: 'WhatsApp',
    items: [
      { to: '/whatsapp', icon: MessageCircle, label: 'WhatsApp Paneli' },
      { to: '/whatsapp/toplu-mesaj', icon: Send, label: 'Toplu Mesaj' },
      { to: '/whatsapp/ayarlar', icon: Settings, label: 'Panel Ayarlari' },
    ],
  },
  {
    title: 'Pazarlama & Asistan',
    items: [
      { to: '/pazarlama', icon: Megaphone, label: 'Pazarlama & SMS' },
      { to: '/musteri-davranislari', icon: UserCheck, label: 'Musteri Davranislari' },
      { to: '/asistan', icon: Bot, label: 'Yapay Zeka Asistani' },
      { to: '/asistan-satislari', icon: Bot, label: 'Asistan Satislari' },
      { to: '/etkilesim-agi', icon: Network, label: 'Etkilesim Agi' },
      { to: '/ig-oto-yanit', icon: MessageCircle, label: 'Instagram Oto-Yanit' },
    ],
  },
  {
    title: 'KATALOG YÖNETİMİ',
    items: [
      { to: '/katalog-yonetimi', icon: FolderOpen, label: 'Kataloglarim' },
      { to: '/zamanlayici-bildirim', icon: Clock, label: 'Zamanlayici & Bildirim' },
    ],
  },
  {
    title: 'Fatura',
    items: [
      { to: '/fatura', icon: FileText, label: 'Faturalarim' },
      { to: '/fatura/ayarlar', icon: Settings, label: 'Fatura Ayarlari' },
    ],
  },
  {
    title: 'Reklam Yonetimi',
    items: [
      { to: '/reklam', icon: Megaphone, label: 'Meta Ads Paneli' },
    ],
  },
  {
    title: 'Ekip Yonetimi',
    items: [
      { to: '/personel', icon: UserCheck, label: 'Personel' },
      { to: '/sicil', icon: UserCheck, label: 'Personel Sicili' },
      { to: '/personeller', icon: UserCog, label: 'Personel & Yetki' },
      { to: '/ekip', icon: MessageSquare, label: 'Ekip Sohbeti' },
      { to: '/ajanda', icon: Calendar, label: 'Ajanda' },
    ],
  },
  {
    title: 'Hesap & Destek',
    items: [
      { to: '/entegrasyonlar', icon: Plug, label: 'Entegrasyonlar' },
      { to: '/belgelerim', icon: FolderOpen, label: 'Belgelerim' },
      { to: '/bildirimler', icon: Bell, label: 'Bildirimler' },
      { to: '/destek', icon: LifeBuoy, label: 'Destek Merkezi' },
      { to: '/ayarlar', icon: Settings, label: 'Ayarlar' },
    ],
  },
];

// Tum menu ogeleri tek duz liste (komut paleti + kisayol havuzu icin)
export const allMenuItems: MenuItem[] = navGroups.flatMap((g) => g.items);

// Grup basligini bir sayfa yoluna gore bul (komut paletinde etiket olarak gosterilir)
export function groupTitleOf(to: string): string {
  for (const g of navGroups) {
    if (g.items.some((it) => it.to === to)) return g.title || 'Genel';
  }
  return 'Genel';
}
