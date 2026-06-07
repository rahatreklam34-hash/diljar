import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Menu, X, Plus, LogOut, ChevronRight, ChevronUp, Pencil, Check, Search, Sparkles, Sun, Moon,
  LayoutDashboard, Wallet, Package, ShoppingCart, ClipboardList, Users, Megaphone, UsersRound, Headphones,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navGroups, allMenuItems, MenuItem, IconType } from '../lib/menu';

const DEFAULT_SHORTCUTS = ['/canli-yayin', '/kasa-satis', '/siparisler', '/depo/urunlerim', '/musterilerim'];

// Her grup icin temsili ikon (kapali grup kartinda gosterilir) ve renk
const GROUP_ICONS: IconType[] = [LayoutDashboard, Wallet, Package, ShoppingCart, ClipboardList, Users, Megaphone, UsersRound, Headphones];
const GROUP_COLORS = ['text-violet-400', 'text-violet-400', 'text-sky-400', 'text-fuchsia-400', 'text-blue-400', 'text-emerald-400', 'text-orange-400', 'text-pink-400', 'text-cyan-400'];
const GROUP_GLOW = ['bg-violet-500/15', 'bg-violet-500/15', 'bg-sky-500/15', 'bg-fuchsia-500/15', 'bg-blue-500/15', 'bg-emerald-500/15', 'bg-orange-500/15', 'bg-pink-500/15', 'bg-cyan-500/15'];

type Theme = 'dark' | 'light';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, canAccess, updatePrefs } = useAuth();
  const initial = (user?.fullName || 'K').charAt(0).toUpperCase();

  // Tema (gece/gunduz) — localStorage anlik, prefs.theme hesaba kayitli
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('wtech_theme') as Theme) || 'dark');
  useEffect(() => {
    const t = user?.prefs?.theme;
    if ((t === 'light' || t === 'dark') && t !== theme) { setTheme(t); localStorage.setItem('wtech_theme', t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.prefs?.theme]);
  const toggleTheme = async () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next); localStorage.setItem('wtech_theme', next);
    try { await updatePrefs({ ...(user?.prefs || {}), theme: next }); } catch { /* */ }
  };
  const dark = theme === 'dark';

  // Sayfa degisince yalnizca aktif grup acik
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

  // Tema sinif setleri
  const t = dark ? {
    aside: 'bg-gradient-to-b from-[#0a0e1a] via-[#0b1020] to-[#0d1326] border-white/10',
    headerBg: 'bg-white/[0.03] border-white/10',
    brand: 'text-white',
    iconBtn: 'text-slate-400 hover:text-white hover:bg-white/10',
    card: 'bg-white/[0.04] border-white/10 hover:bg-white/[0.07]',
    cardText: 'text-slate-200',
    groupTitle: 'text-violet-300',
    rozet: 'bg-white/[0.06]',
    itemText: 'text-slate-300',
    itemHover: 'hover:bg-white/[0.06]',
    chevron: 'text-slate-500',
    section: 'bg-white/[0.02] border-white/[0.06]',
    userCard: 'bg-gradient-to-r from-[#6d28d9] to-[#4338ca] text-white',
    accentGrad: 'from-[#7c3aed] to-[#4f46e5]',
    accentShadow: 'shadow-violet-900/50',
  } : {
    aside: 'bg-gradient-to-b from-orange-50 via-amber-50/60 to-white border-orange-100',
    headerBg: 'bg-white border-orange-100',
    brand: 'text-slate-800',
    iconBtn: 'text-slate-400 hover:text-orange-600 hover:bg-orange-50',
    card: 'bg-white border-orange-100 hover:bg-orange-50/70 shadow-sm',
    cardText: 'text-slate-700',
    groupTitle: 'text-orange-600',
    rozet: 'bg-orange-50',
    itemText: 'text-slate-600',
    itemHover: 'hover:bg-orange-50',
    chevron: 'text-slate-400',
    section: 'bg-orange-50/40 border-orange-100',
    userCard: 'bg-gradient-to-r from-orange-500 to-amber-500 text-white',
    accentGrad: 'from-orange-500 to-amber-500',
    accentShadow: 'shadow-orange-300/50',
  };

  const renderItem = (item: MenuItem, gi: number) => (
    <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `group flex items-center gap-3 px-2.5 py-2.5 my-0.5 rounded-xl text-sm transition-all duration-200 ${isActive ? `bg-gradient-to-r ${t.accentGrad} text-white font-semibold shadow-lg ${t.accentShadow}` : `${t.itemText} ${t.itemHover}`}`}>
      {({ isActive }) => (
        <>
          <span className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${isActive ? 'bg-white/20' : GROUP_GLOW[gi]}`}>
            <item.icon size={16} className={isActive ? 'text-white' : GROUP_COLORS[gi]} />
          </span>
          {!isIconOnly && <span className="truncate flex-1">{item.label}</span>}
          {!isIconOnly && <ChevronRight size={15} className={isActive ? 'text-white/70' : t.chevron} />}
        </>
      )}
    </NavLink>
  );

  return (
    <>
      <button onClick={() => setMobileOpen(true)} className="lg:hidden fixed top-3 left-3 z-[60] p-2 bg-white text-slate-700 rounded-xl shadow-lg border border-slate-200" aria-label="Menuyu ac"><Menu size={20} /></button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[55]" onClick={() => setMobileOpen(false)} />}

      <aside className={`fixed inset-y-0 left-0 z-[58] flex flex-col ${t.aside} border-r transition-all duration-300 h-screen overflow-y-auto ${collapsed ? 'w-64 lg:w-20' : 'w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-3.5 m-2 rounded-2xl border ${t.headerBg} sticky top-2 z-10 backdrop-blur`}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-[#7c3aed] to-[#6366f1] rounded-xl flex items-center justify-center font-extrabold text-white shrink-0 shadow-lg shadow-violet-600/40">W</div>
            {(!collapsed || mobileOpen) && <span className={`text-lg font-extrabold ${t.brand}`}>WTech</span>}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} title={dark ? 'Gunduz modu' : 'Gece modu'} className={`p-2 rounded-lg transition-colors ${t.iconBtn}`}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button onClick={() => setCollapsed(!collapsed)} className={`hidden lg:block p-2 rounded-lg transition-colors ${t.iconBtn}`}>{collapsed ? <Menu size={17} /> : <X size={17} />}</button>
            <button onClick={() => setMobileOpen(false)} className={`lg:hidden p-2 rounded-lg ${t.iconBtn}`}><X size={17} /></button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 pb-2 overflow-y-auto space-y-1.5" onClick={() => mobileOpen && setMobileOpen(false)}>
          {navGroups.map((group, gi) => {
            const key = group.title || '_';
            const visibleItems = group.items.filter((it) => canAccess(it.to));
            if (visibleItems.length === 0) return null;

            // Dashboard (basliksiz tek oge)
            if (!group.title) return <div key={gi}>{renderItem(visibleItems[0], gi)}</div>;

            const open = isIconOnly ? true : openGroup === key;
            const GroupIcon = GROUP_ICONS[gi] || Wallet;

            // Kapali grup -> kart (ikon + baslik + ok)
            if (!open && !isIconOnly) {
              return (
                <button key={gi} onClick={() => toggleGroup(key)} className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-2xl border transition-all ${t.card}`}>
                  <span className={`flex items-center justify-center w-9 h-9 rounded-xl shrink-0 ${GROUP_GLOW[gi]}`}><GroupIcon size={18} className={GROUP_COLORS[gi]} /></span>
                  <span className={`flex-1 text-left text-[12px] font-bold uppercase tracking-wide ${t.cardText}`}>{group.title}</span>
                  <ChevronRight size={16} className={t.chevron} />
                </button>
              );
            }

            // Acik grup -> baslik + oge listesi
            return (
              <div key={gi}>
                {!isIconOnly && (
                  <button onClick={() => toggleGroup(key)} className="w-full flex items-center justify-between px-3 pt-2 pb-1.5">
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${t.groupTitle}`}>{group.title}</span>
                    <ChevronUp size={15} className={t.chevron} />
                  </button>
                )}
                <div className={`rounded-2xl border ${t.section} p-1`}>
                  {visibleItems.map((item) => renderItem(item, gi))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Kisayollarim */}
        {!isIconOnly && (
          <div className="px-3 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}><Sparkles size={11} className={dark ? 'text-violet-400' : 'text-orange-500'} /> Kisayollarim</span>
              <button onClick={() => setEditOpen(true)} className={`text-[11px] font-semibold hover:underline flex items-center gap-0.5 ${dark ? 'text-violet-400' : 'text-orange-600'}`}><Pencil size={11} /> Duzenle</button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {shortcutItems.slice(0, 7).map((it) => (
                <button key={it.to} onClick={() => { navigate(it.to); setMobileOpen(false); }} title={it.label} className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${t.card} ${t.cardText}`}>
                  <it.icon size={18} className={dark ? 'text-violet-300' : 'text-orange-500'} />
                  <span className="text-[8px] leading-none text-center w-full truncate">{it.label.split(' ')[0]}</span>
                </button>
              ))}
              <button onClick={() => setEditOpen(true)} title="Kisayol ekle" className={`flex items-center justify-center p-2 rounded-xl border border-dashed ${dark ? 'border-white/20 text-slate-400 hover:text-violet-300 hover:border-violet-400/50' : 'border-orange-200 text-slate-400 hover:text-orange-600 hover:border-orange-400'} transition-colors`}><Plus size={18} /></button>
            </div>
          </div>
        )}

        {/* User kart */}
        <div className="px-2 pb-2">
          <div className={`relative overflow-hidden flex items-center gap-3 p-3 rounded-2xl ${t.userCard} shadow-lg`}>
            <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: 'radial-gradient(120px 60px at 80% 120%, rgba(255,255,255,0.5), transparent)' }} />
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 backdrop-blur">{initial}</div>
            {(!collapsed || mobileOpen) && (
              <div className="min-w-0 flex-1 relative">
                <p className="text-sm font-bold text-white truncate">{user?.fullName || 'Kullanici'}</p>
                <p className="text-[11px] text-white/70 truncate">{user?.role === 'TENANT_OWNER' ? 'Yonetici' : 'Personel'}</p>
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <button onClick={() => logout()} title="Cikis Yap" className="relative p-2 text-white/80 hover:text-white hover:bg-white/15 rounded-lg shrink-0 transition-colors"><LogOut size={18} /></button>
            )}
          </div>
        </div>
      </aside>

      {editOpen && (
        <ShortcutEditor dark={dark} allItems={allMenuItems.filter((it) => canAccess(it.to))} current={rawShortcuts} onToggle={toggleShortcut} onClose={() => setEditOpen(false)} />
      )}
    </>
  );
}

function ShortcutEditor({ dark, allItems, current, onToggle, onClose }: { dark: boolean; allItems: MenuItem[]; current: string[]; onToggle: (to: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g');
  const list = q.trim() ? allItems.filter((it) => norm(it.label).includes(norm(q))) : allItems;
  const accent = dark ? 'from-[#7c3aed] to-[#4f46e5]' : 'from-orange-500 to-amber-500';
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r ${accent} bg-opacity-5`}>
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-1.5"><Sparkles size={15} className={dark ? 'text-violet-500' : 'text-orange-500'} /> Kisayollari Duzenle</h3>
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
              <button key={it.to} onClick={() => onToggle(it.to)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${on ? (dark ? 'bg-violet-50 text-violet-700' : 'bg-orange-50 text-orange-700') : 'hover:bg-slate-50 text-slate-700'}`}>
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${on ? `bg-gradient-to-r ${accent} text-white` : 'bg-slate-100 text-slate-500'}`}><Icon size={16} /></span>
                <span className="flex-1 font-medium">{it.label}</span>
                {on && <Check size={16} className={dark ? 'text-violet-600' : 'text-orange-600'} />}
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 text-right">
          <button onClick={onClose} className={`px-5 py-2 bg-gradient-to-r ${accent} text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-shadow`}>Tamam</button>
        </div>
      </div>
    </div>
  );
}
