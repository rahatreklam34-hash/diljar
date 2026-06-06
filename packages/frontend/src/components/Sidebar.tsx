import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, TrendingUp,
  Landmark, BarChart3, Calendar, Bell, Settings,
  Menu, X, Plus, UserCheck, ArrowUpRight, ArrowDownRight,
  Building2, CreditCard, ClipboardList, FolderOpen, RefreshCw, Target, LogOut, LifeBuoy, MessageSquare,
  ChevronDown, Plug, Package, PackagePlus, Layers, Tag, Hash, Store, ShoppingBag, Radio, Bot, ScanLine, Award, UserCog, Megaphone,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navGroups = [
  {
    title: null,
    items: [{ to: '/anasayfa', icon: LayoutDashboard, label: 'Dashboard' }],
  },
  {
    title: 'Gunluk Islemler',
    items: [
      { to: '/cari-hesaplar', icon: Users, label: 'Cari Hesaplar' },
      { to: '/cekler', icon: FileText, label: 'Cekler' },
      { to: '/gelir-gider', icon: TrendingUp, label: 'Gelir / Gider' },
      { to: '/kasa-banka', icon: Landmark, label: 'Kasa & Banka' },
      { to: '/duzenli-odemeler', icon: RefreshCw, label: 'Duzenli Odemelerim' },
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
      { to: '/depo/satis-kodu', icon: Hash, label: 'Satis Kodu Havuzu' },
    ],
  },
  {
    title: 'Magaza & Siparis',
    items: [
      { to: '/canli-yayin', icon: Radio, label: 'Canli Yayin Satis' },
      { to: '/kasa-satis', icon: ScanLine, label: 'Kasa Satisi' },
      { to: '/satici-performans', icon: Award, label: 'Satici Performansi' },
      { to: '/sicil', icon: UserCheck, label: 'Personel Sicili' },
      { to: '/pazarlama', icon: Megaphone, label: 'Pazarlama & SMS' },
      { to: '/online-magaza', icon: Store, label: 'Online Magazam' },
      { to: '/asistan', icon: Bot, label: 'Yapay Zeka Asistani' },
      { to: '/asistan-satislari', icon: Bot, label: 'Asistan Satislari' },
      { to: '/destek-talepleri', icon: LifeBuoy, label: 'Destek Talepleri' },
      { to: '/musterilerim', icon: Users, label: 'Musterilerim' },
      { to: '/siparisler', icon: ShoppingBag, label: 'Tum Siparisler' },
      { to: '/siparisler/canli', icon: Radio, label: 'Canli Yayin Satislari' },
      { to: '/siparisler/online', icon: Store, label: 'Online Magaza Satislari' },
    ],
  },
  {
    title: 'Personel & Ajanda',
    items: [
      { to: '/personel', icon: UserCheck, label: 'Personel' },
      { to: '/ajanda', icon: Calendar, label: 'Ajanda' },
    ],
  },
  {
    title: 'Finans Yonetimi',
    items: [
      { to: '/finansal-durum', icon: BarChart3, label: 'Finansal Durumum' },
      { to: '/hedeflerim', icon: Target, label: 'Hedeflerim' },
      { to: '/hareket-loglari', icon: ClipboardList, label: 'Hareket Loglari' },
    ],
  },
  {
    title: 'Belgeler & Bildirim',
    items: [
      { to: '/belgelerim', icon: FolderOpen, label: 'Belgelerim' },
      { to: '/bildirimler', icon: Bell, label: 'Bildirimler' },
    ],
  },
  {
    title: 'Hesap & Destek',
    items: [
      { to: '/entegrasyonlar', icon: Plug, label: 'Entegrasyonlar' },
      { to: '/personeller', icon: UserCog, label: 'Personel & Yetki' },
      { to: '/ekip', icon: MessageSquare, label: 'Ekip Sohbeti' },
      { to: '/destek', icon: LifeBuoy, label: 'Destek Merkezi' },
      { to: '/ayarlar', icon: Settings, label: 'Ayarlar' },
    ],
  },
];

const quickActions = [
  { label: 'Gelir Ekle', icon: ArrowUpRight, path: '/gelir-gider', color: 'text-green-400 hover:bg-green-500/10' },
  { label: 'Gider Ekle', icon: ArrowDownRight, path: '/gelir-gider', color: 'text-red-400 hover:bg-red-500/10' },
  { label: 'Cari Ekle', icon: Building2, path: '/cari-hesaplar', color: 'text-blue-400 hover:bg-blue-500/10' },
  { label: 'Cek Ekle', icon: CreditCard, path: '/cekler', color: 'text-orange-400 hover:bg-orange-500/10' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false); // masaüstü dar mod
  const [mobileOpen, setMobileOpen] = useState(false); // mobil drawer
  const [quickOpen, setQuickOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(navGroups.map((g) => [g.title || '_', g.title === 'Gunluk Islemler']))
  );
  const navigate = useNavigate();
  const location = useLocation();
  const quickRef = useRef<HTMLDivElement>(null);
  const { user, logout, canAccess } = useAuth();
  const initial = (user?.fullName || 'K').charAt(0).toUpperCase();

  // Sayfa degisince: aktif sayfanin grubu acik, digerleri kapali (yoksa Finans acik)
  useEffect(() => {
    let activeTitle: string | null = null;
    for (const g of navGroups) {
      if (g.title && g.items.some((it) => it.to === location.pathname)) { activeTitle = g.title; break; }
    }
    const target = activeTitle || 'Gunluk Islemler';
    setOpenGroups(Object.fromEntries(navGroups.map((g) => [g.title || '_', g.title === target])));
  }, [location.pathname]);

  // Ana içerik kenar boşluğunu sidebar genişliğiyle eşitle (sadece masaüstü)
  useEffect(() => {
    const apply = () => {
      const main = document.getElementById('main-content');
      if (!main) return;
      if (window.innerWidth >= 1024) main.style.marginLeft = collapsed ? '80px' : '256px';
      else main.style.marginLeft = '0px';
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [collapsed]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setQuickOpen(false);
    }
    if (quickOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [quickOpen]);

  const handleQuickAction = (path: string) => { setQuickOpen(false); setMobileOpen(false); navigate(path); };
  const toggleGroup = (key: string) => setOpenGroups((p) => ({ ...p, [key]: !p[key] }));

  return (
    <>
      {/* Mobil hamburger (sadece küçük ekran) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-[60] p-2 bg-[#1a1a2e] text-white rounded-lg shadow-lg"
        aria-label="Menüyü aç"
      >
        <Menu size={20} />
      </button>

      {/* Mobil arka plan örtüsü */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-[55]" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-[58] flex flex-col bg-[#1a1a2e] text-white transition-all duration-300 h-screen overflow-y-auto
        ${collapsed ? 'w-64 lg:w-20' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#6c63ff] rounded-lg flex items-center justify-center font-bold text-lg shrink-0">W</div>
            {(!collapsed || mobileOpen) && <span className="text-lg font-bold lg:inline">WTech</span>}
          </div>
          {/* masaüstü daralt */}
          <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:block p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
          {/* mobil kapat */}
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto" onClick={() => mobileOpen && setMobileOpen(false)}>
          {navGroups.map((group, gi) => {
            const key = group.title || '_';
            const isIconOnly = collapsed && !mobileOpen;
            const open = !group.title ? true : (isIconOnly ? true : openGroups[key]);
            const visibleItems = group.items.filter((it: any) => canAccess(it.to));
            if (visibleItems.length === 0) return null;
            return (
              <div key={gi} className={gi > 0 ? 'mt-1' : ''}>
                {group.title && !isIconOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleGroup(key); }}
                    className="w-full flex items-center justify-between px-5 pt-2 pb-1 text-[10px] font-semibold text-gray-500 hover:text-gray-300 uppercase tracking-wider"
                  >
                    <span>{group.title}</span>
                    <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                  </button>
                )}
                {group.title && isIconOnly && gi > 0 && <div className="mx-4 my-2 border-t border-white/10" />}
                {open && visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-5 py-2.5 mx-2 rounded-xl text-sm transition-all ${isActive ? 'bg-[#6c63ff] text-white shadow-lg shadow-[#6c63ff]/30' : 'text-gray-300 hover:bg-white/10 hover:text-white'}`
                    }
                  >
                    <item.icon size={20} className="shrink-0" />
                    {!isIconOnly && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Quick Action */}
        <div className="px-4 py-4 border-t border-white/10 relative" ref={quickRef}>
          <button
            onClick={() => setQuickOpen((prev) => !prev)}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm transition-all ${quickOpen ? 'bg-[#6c63ff] text-white shadow-lg shadow-[#6c63ff]/30' : 'bg-[#6c63ff]/20 hover:bg-[#6c63ff]/30 text-white'}`}
          >
            <Plus size={18} className={`shrink-0 transition-transform duration-200 ${quickOpen ? 'rotate-45' : ''}`} />
            {(!collapsed || mobileOpen) && <span>Hizli Islem</span>}
          </button>
          {quickOpen && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#252540] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-white/10">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Hizli Islem</p>
              </div>
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.path)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition-colors ${action.color}`}
                >
                  <action.icon size={16} className="shrink-0" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-sm font-bold shrink-0">{initial}</div>
            {(!collapsed || mobileOpen) && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{user?.fullName || 'Kullanici'}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email || ''}</p>
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <button onClick={() => logout()} title="Cikis Yap" className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors shrink-0">
                <LogOut size={18} />
              </button>
            )}
          </div>
          {(!collapsed || mobileOpen) && (
            <p className="text-[10px] text-gray-500 text-center mt-3 leading-tight">
              © {new Date().getFullYear()} WTech Yazilim A.S.<br />Tum haklari saklidir.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
