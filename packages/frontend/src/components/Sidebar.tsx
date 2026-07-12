import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Menu, X, Plus, LogOut, ChevronRight, ChevronUp, Pencil, Check, Search, Sparkles, Sun, Moon, UserCircle,
  LayoutDashboard, Wallet, Package, ShoppingCart, ClipboardList, Users, Megaphone, UsersRound, Headphones,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navGroups, allMenuItems, MenuItem, IconType } from '../lib/menu';
import api from '../lib/api';
import ProfileModal from './ProfileModal';

const DEFAULT_SHORTCUTS = ['/canli-yayin', '/kasa-satis', '/siparisler', '/depo/urunlerim', '/musterilerim'];

// Her grup icin temsili ikon (kapali grup kartinda) ve renk
const GROUP_ICONS: IconType[] = [LayoutDashboard, Wallet, Package, ShoppingCart, ClipboardList, Users, Megaphone, UsersRound, Headphones];
const GROUP_COLORS = ['text-emerald-600', 'text-emerald-600', 'text-teal-600', 'text-green-600', 'text-amber-600', 'text-emerald-500', 'text-lime-600', 'text-sky-600', 'text-teal-600'];
const GROUP_GLOW = ['bg-emerald-500/10', 'bg-emerald-500/10', 'bg-teal-500/10', 'bg-green-500/10', 'bg-amber-500/10', 'bg-emerald-500/10', 'bg-lime-500/10', 'bg-sky-500/10', 'bg-teal-500/10'];

type Theme = 'dark' | 'light';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, canAccess, updatePrefs } = useAuth();
  const initial = (user?.fullName || 'K').charAt(0).toUpperCase();

  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('wtech_theme') as Theme) || 'light');

  // WhatsApp okunmamış mesaj sayısı (sidebar canlı badge) — 15 sn'de bir güncellenir
  const [waUnread, setWaUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => { api.get('/whatsapp/unread-count').then((r) => { if (alive) setWaUnread(Number(r.data?.conversations) || 0); }).catch(() => {}); };
    load();
    const iv = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, []);
  const waBadge = (val: number, cls = '') => (val > 0 ? (
    <span className={`min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 ${cls}`}>{val > 99 ? '99+' : val}</span>
  ) : null);
  useEffect(() => {
    const tp = user?.prefs?.theme;
    if ((tp === 'light' || tp === 'dark') && tp !== theme) { setTheme(tp); localStorage.setItem('wtech_theme', tp); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.prefs?.theme]);
  const toggleTheme = async () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next); localStorage.setItem('wtech_theme', next);
    try { await updatePrefs({ ...(user?.prefs || {}), theme: next }); } catch { /* */ }
  };
  const dark = theme === 'dark';

  useEffect(() => {
    const main = document.getElementById('main-content');
    document.body.classList.toggle('theme-dark', dark);
    document.body.classList.toggle('theme-light', !dark);
    if (main) main.classList.toggle('app-dark', dark);
    return () => {
      document.body.classList.remove('theme-dark', 'theme-light');
      const m = document.getElementById('main-content');
      if (m) m.classList.remove('app-dark');
    };
  }, [dark]);

  useEffect(() => {
    for (const g of navGroups) {
      if (g.title && g.items.some((it) => it.to === location.pathname)) { setOpenGroup(g.title); return; }
    }
  }, [location.pathname]);

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
    const h = () => setEditOpen(true);
    window.addEventListener('open-shortcut-editor', h);
    return () => window.removeEventListener('open-shortcut-editor', h);
  }, []);

  const toggleGroup = (key: string) => setOpenGroup((cur) => (cur === key ? null : key));
  const isIconOnly = collapsed && !mobileOpen;

  const rawShortcuts: string[] = Array.isArray(user?.prefs?.shortcuts) ? user!.prefs!.shortcuts : DEFAULT_SHORTCUTS;
  const shortcutItems: MenuItem[] = rawShortcuts.map((to) => allMenuItems.find((m) => m.to === to)).filter((m): m is MenuItem => !!m && canAccess(m.to));
  const toggleShortcut = async (to: string) => {
    const cur: string[] = Array.isArray(user?.prefs?.shortcuts) ? user!.prefs!.shortcuts : DEFAULT_SHORTCUTS;
    const next = cur.includes(to) ? cur.filter((x) => x !== to) : [...cur, to];
    try { await updatePrefs({ ...(user?.prefs || {}), shortcuts: next }); } catch { /* */ }
  };

  // Tema sinif setleri. SECILI oge NOTR (renksiz) — kullanici istegi.
  const t = dark ? {
    aside: 'bg-gradient-to-b from-[#0a0e1a] via-[#0b1020] to-[#0d1326] border-white/10',
    headerBg: 'bg-white/[0.03] border-white/10',
    brand: 'text-white',
    iconBtn: 'text-slate-400 hover:text-white hover:bg-white/10',
    card: 'bg-white/[0.04] border-white/10 hover:bg-white/[0.07]',
    cardText: 'text-slate-200',
    groupTitle: 'text-white',
    groupBar: 'bg-gradient-to-b from-emerald-400 to-green-600',
    rozet: 'bg-white/[0.06]',
    itemText: 'text-slate-300',
    itemHover: 'hover:bg-white/[0.06]',
    chevron: 'text-slate-500',
    section: 'bg-white/[0.02] border-white/[0.06]',
    userCard: 'bg-gradient-to-r from-[#0E7C45] to-[#0B5E35] text-white',
    // SECILI (yesil vurgulu)
    activeItem: 'bg-emerald-500/15 text-emerald-100 font-semibold border-l-[3px] border-emerald-400',
    activeRozet: 'bg-emerald-500/25',
    activeIcon: 'text-emerald-300',
    activeChevron: 'text-emerald-300/70',
    accent: 'text-emerald-300',
  } : {
    // Acik temada da sol menu gorseldeki gibi koyu lacivert kalir
    aside: 'bg-[#0b1120] border-[#1b2236]',
    headerBg: 'bg-white/[0.03] border-[#1b2236]',
    brand: 'text-white',
    iconBtn: 'text-slate-400 hover:text-white hover:bg-white/10',
    card: 'bg-white/[0.04] border-white/10 hover:bg-white/[0.08]',
    cardText: 'text-slate-200',
    groupTitle: 'text-slate-100',
    groupBar: 'bg-gradient-to-b from-emerald-400 to-green-600',
    rozet: 'bg-white/[0.06]',
    itemText: 'text-slate-300',
    itemHover: 'hover:bg-white/[0.06]',
    chevron: 'text-slate-500',
    section: 'bg-white/[0.02] border-white/[0.06]',
    userCard: 'bg-gradient-to-r from-[#0E7C45] to-[#0B5E35] text-white',
    // SECILI (yesil vurgulu)
    activeItem: 'bg-emerald-500/15 text-emerald-100 font-semibold border-l-[3px] border-emerald-400',
    activeRozet: 'bg-emerald-500/25',
    activeIcon: 'text-emerald-300',
    activeChevron: 'text-emerald-300/70',
    accent: 'text-emerald-300',
  };

  const renderItem = (item: MenuItem, gi: number) => (
    <NavLink key={item.to} to={item.to} end={item.to === '/whatsapp'} onClick={() => setMobileOpen(false)} title={isIconOnly ? item.label : undefined} className={({ isActive }) => `group flex items-center gap-2.5 ${isIconOnly ? 'justify-center px-0' : 'pl-3 pr-2'} py-[7px] rounded-md text-[13px] transition-colors ${isActive ? t.activeItem : `${t.itemText} ${t.itemHover}`}`}>
      {({ isActive }) => (
        <>
          <span className="relative shrink-0">
            <item.icon size={16} className={isActive ? t.activeIcon : GROUP_COLORS[gi]} strokeWidth={2} />
            {isIconOnly && item.to === '/whatsapp' && waUnread > 0 && <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
          </span>
          {!isIconOnly && <span className="truncate flex-1">{item.label}</span>}
          {!isIconOnly && item.to === '/whatsapp' && waBadge(waUnread)}
        </>
      )}
    </NavLink>
  );

  return (
    <>
      <button onClick={() => setMobileOpen(true)} className="lg:hidden fixed top-3 left-3 z-[60] p-2 bg-white text-slate-700 rounded-xl shadow-lg border border-slate-200" aria-label="Menuyu ac"><Menu size={20} /></button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[55]" onClick={() => setMobileOpen(false)} />}

      <aside className={`wt-scroll fixed inset-y-0 left-0 z-[58] flex flex-col ${t.aside} border-r transition-all duration-300 h-screen overflow-y-auto ${collapsed ? 'w-64 lg:w-20' : 'w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Header */}
        <div className={`m-2 rounded-2xl border ${t.headerBg} sticky top-2 z-10 backdrop-blur ${isIconOnly ? 'flex flex-col items-center gap-1.5 px-2 py-2.5' : 'flex items-center justify-between px-3 py-3'}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-[#22A95C] to-[#0F7C45] rounded-xl flex items-center justify-center font-extrabold text-white shrink-0 shadow-lg shadow-emerald-600/40">W</div>
            {(!collapsed || mobileOpen) && <span className={`text-lg font-extrabold ${t.brand}`}>WTech</span>}
          </div>
          <div className={`flex items-center gap-1 ${isIconOnly ? 'flex-col' : ''}`}>
            <button onClick={toggleTheme} title={dark ? 'Gunduz modu' : 'Gece modu'} className={`p-2 rounded-lg transition-colors ${t.iconBtn}`}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Menuyu ac' : 'Menuyu kapat'} className={`hidden lg:block p-2 rounded-lg transition-colors ${t.iconBtn}`}>{collapsed ? <Menu size={17} /> : <X size={17} />}</button>
            <button onClick={() => setMobileOpen(false)} className={`lg:hidden p-2 rounded-lg ${t.iconBtn}`}><X size={17} /></button>
          </div>
        </div>

        {/* Navigation — klasik kompakt liste */}
        <nav className="wt-scroll flex-1 px-2 pb-2 overflow-y-auto" onClick={() => mobileOpen && setMobileOpen(false)}>
          {navGroups.map((group, gi) => {
            const key = group.title || '_';
            const visibleItems = group.items.filter((it) => canAccess(it.to));
            if (visibleItems.length === 0) return null;

            // Başlıksız grup (Dashboard gibi) → doğrudan öğe
            if (!group.title) return <div key={gi} className="mb-0.5">{visibleItems.map((it) => renderItem(it, gi))}</div>;

            // İkon-only modda başlık gizli, sadece ikonlar
            if (isIconOnly) return <div key={gi} className="mb-1 space-y-0.5">{visibleItems.map((it) => renderItem(it, gi))}</div>;

            const open = openGroup === key;
            const groupUnread = group.title === 'WhatsApp' ? waUnread : 0;
            return (
              <div key={gi} className="mb-0.5">
                <button onClick={() => toggleGroup(key)} className={`w-full flex items-center gap-2 px-3 pt-3 pb-1 text-left transition-colors ${dark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>
                  <span className="flex-1 text-[10px] font-bold uppercase tracking-wider truncate">{group.title}</span>
                  {waBadge(groupUnread)}
                  <ChevronRight size={13} className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''} ${t.chevron}`} />
                </button>
                {open && <div className="space-y-0.5">{visibleItems.map((item) => renderItem(item, gi))}</div>}
              </div>
            );
          })}
        </nav>

        {/* Kisayollarim */}
        {!isIconOnly && (
          <div className="px-3 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}><Sparkles size={11} className={t.accent} /> Kisayollarim</span>
              <button onClick={() => setEditOpen(true)} className={`text-[11px] font-semibold hover:underline flex items-center gap-0.5 ${t.accent}`}><Pencil size={11} /> Duzenle</button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {shortcutItems.slice(0, 7).map((it) => (
                <button key={it.to} onClick={() => { navigate(it.to); setMobileOpen(false); }} title={it.label} className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${t.card} ${t.cardText}`}>
                  <it.icon size={18} className={t.accent} />
                  <span className="text-[8px] leading-none text-center w-full truncate">{it.label.split(' ')[0]}</span>
                </button>
              ))}
              <button onClick={() => setEditOpen(true)} title="Kisayol ekle" className={`flex items-center justify-center p-2 rounded-xl border border-dashed ${dark ? 'border-white/20 text-slate-400 hover:text-white hover:border-white/40' : 'border-slate-300 text-slate-400 hover:text-emerald-600 hover:border-emerald-400'} transition-colors`}><Plus size={18} /></button>
            </div>
          </div>
        )}

        {/* User kart */}
        <div className="px-2 pb-2">
          <div className={`relative overflow-hidden flex items-center gap-3 p-3 rounded-2xl ${t.userCard} shadow-lg`}>
            <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: 'radial-gradient(140px 70px at 85% 130%, rgba(255,255,255,0.55), transparent)' }} />
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 backdrop-blur">{initial}</div>
            {(!collapsed || mobileOpen) && (
              <div className="min-w-0 flex-1 relative">
                <p className="text-sm font-bold text-white truncate">{user?.fullName || 'Kullanici'}</p>
                <p className="text-[11px] text-white/70 truncate">{user?.role === 'TENANT_OWNER' ? 'Yonetici' : 'Personel'}</p>
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setProfileOpen(true)} title="Profilim" className="relative p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-colors"><UserCircle size={18} /></button>
                <button onClick={() => logout()} title="Cikis Yap" className="relative p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg transition-colors"><LogOut size={18} /></button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {editOpen && (
        <ShortcutEditor dark={dark} allItems={allMenuItems.filter((it) => canAccess(it.to))} current={rawShortcuts} onToggle={toggleShortcut} onClose={() => setEditOpen(false)} />
      )}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}

function ShortcutEditor({ dark, allItems, current, onToggle, onClose }: { dark: boolean; allItems: MenuItem[]; current: string[]; onToggle: (to: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g');
  const list = q.trim() ? allItems.filter((it) => norm(it.label).includes(norm(q))) : allItems;
  const accent = dark ? 'text-emerald-400' : 'text-emerald-600';
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-1.5"><Sparkles size={15} className={accent} /> Kisayollari Duzenle</h3>
            <p className="text-xs text-slate-400">Hizli erisim icin sayfa sec. ({current.length} secili)</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sayfa ara..." className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-200" />
          </div>
        </div>
        <div className="overflow-y-auto p-2 flex-1">
          {list.map((it) => {
            const on = current.includes(it.to);
            const Icon = it.icon;
            return (
              <button key={it.to} onClick={() => onToggle(it.to)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${on ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-50 text-slate-700'}`}>
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${on ? 'bg-white shadow-sm text-slate-700' : 'bg-slate-100 text-slate-500'}`}><Icon size={16} /></span>
                <span className="flex-1 font-medium">{it.label}</span>
                {on && <Check size={16} className="text-slate-700" />}
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 text-right">
          <button onClick={onClose} className="px-5 py-2 bg-slate-800 text-white rounded-xl text-sm font-semibold hover:bg-slate-900 transition-colors">Tamam</button>
        </div>
      </div>
    </div>
  );
}
