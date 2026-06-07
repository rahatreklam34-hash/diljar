import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Plus, LogOut, ChevronDown, Pencil, Check, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navGroups, allMenuItems, MenuItem } from '../lib/menu';

const DEFAULT_SHORTCUTS = ['/canli-yayin', '/kasa-satis', '/siparisler', '/depo/urunlerim', '/musterilerim'];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => Object.fromEntries(navGroups.map((g) => [g.title || '_', true]))
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, canAccess, updatePrefs } = useAuth();
  const initial = (user?.fullName || 'K').charAt(0).toUpperCase();

  // Aktif sayfanin grubunu acik tut
  useEffect(() => {
    for (const g of navGroups) {
      if (g.title && g.items.some((it) => it.to === location.pathname)) {
        setOpenGroups((p) => ({ ...p, [g.title!]: true }));
        break;
      }
    }
  }, [location.pathname]);

  // Ana icerik kenar boslugunu sidebar genisligiyle esitle (masaustu)
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

  const toggleGroup = (key: string) => setOpenGroups((p) => ({ ...p, [key]: !p[key] }));
  const isIconOnly = collapsed && !mobileOpen;

  // Dashboard'daki "Hizli Islemler > Duzenle" butonu da bu modali acabilsin
  useEffect(() => {
    const h = () => setEditOpen(true);
    window.addEventListener('open-shortcut-editor', h);
    return () => window.removeEventListener('open-shortcut-editor', h);
  }, []);

  // Kullanicinin kisisel kisayollari (hesaba kayitli; prefs.shortcuts)
  const rawShortcuts: string[] = Array.isArray(user?.prefs?.shortcuts) ? user!.prefs!.shortcuts : DEFAULT_SHORTCUTS;
  const shortcutItems: MenuItem[] = rawShortcuts
    .map((to) => allMenuItems.find((m) => m.to === to))
    .filter((m): m is MenuItem => !!m && canAccess(m.to));

  const toggleShortcut = async (to: string) => {
    const cur: string[] = Array.isArray(user?.prefs?.shortcuts) ? user!.prefs!.shortcuts : DEFAULT_SHORTCUTS;
    const next = cur.includes(to) ? cur.filter((x) => x !== to) : [...cur, to];
    try { await updatePrefs({ ...(user?.prefs || {}), shortcuts: next }); } catch { /* */ }
  };

  return (
    <>
      {/* Mobil hamburger */}
      <button onClick={() => setMobileOpen(true)} className="lg:hidden fixed top-3 left-3 z-[60] p-2 bg-white text-slate-700 rounded-lg shadow border border-slate-200" aria-label="Menuyu ac">
        <Menu size={20} />
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-black/40 z-[55]" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-[58] flex flex-col bg-white border-r border-slate-200 text-slate-700 transition-all duration-300 h-screen overflow-y-auto ${collapsed ? 'w-64 lg:w-20' : 'w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#6c63ff] rounded-lg flex items-center justify-center font-bold text-lg text-white shrink-0">W</div>
            {(!collapsed || mobileOpen) && <span className="text-lg font-bold text-slate-800">WTech</span>}
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:block p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><X size={18} /></button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto" onClick={() => mobileOpen && setMobileOpen(false)}>
          {navGroups.map((group, gi) => {
            const key = group.title || '_';
            const open = !group.title ? true : (isIconOnly ? true : openGroups[key]);
            const visibleItems = group.items.filter((it) => canAccess(it.to));
            if (visibleItems.length === 0) return null;
            return (
              <div key={gi} className={gi > 0 ? 'mt-1' : ''}>
                {group.title && !isIconOnly && (
                  <button onClick={(e) => { e.stopPropagation(); toggleGroup(key); }} className="w-full flex items-center justify-between px-5 pt-2 pb-1 text-[10px] font-semibold text-slate-400 hover:text-slate-600 uppercase tracking-wider">
                    <span>{group.title}</span>
                    <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                  </button>
                )}
                {group.title && isIconOnly && gi > 0 && <div className="mx-4 my-2 border-t border-slate-100" />}
                {open && visibleItems.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex items-center gap-3 px-5 py-2.5 mx-2 rounded-xl text-sm transition-all ${isActive ? 'bg-[#6c63ff]/10 text-[#6c63ff] font-medium' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'}`}>
                    <item.icon size={20} className="shrink-0" />
                    {!isIconOnly && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Kisayollarim (kisisel, duzenlenebilir) */}
        {!isIconOnly && (
          <div className="px-4 py-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kisayollarim</span>
              <button onClick={() => setEditOpen(true)} className="text-[11px] text-[#6c63ff] font-medium hover:underline flex items-center gap-0.5"><Pencil size={11} /> Duzenle</button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {shortcutItems.slice(0, 7).map((it) => (
                <button key={it.to} onClick={() => { navigate(it.to); setMobileOpen(false); }} title={it.label} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-slate-50 hover:bg-[#6c63ff]/10 text-slate-600 hover:text-[#6c63ff] transition-colors">
                  <it.icon size={18} />
                  <span className="text-[8px] leading-none text-center w-full truncate">{it.label.split(' ')[0]}</span>
                </button>
              ))}
              <button onClick={() => setEditOpen(true)} title="Kisayol ekle" className="flex items-center justify-center p-2 rounded-xl border border-dashed border-slate-300 text-slate-400 hover:text-[#6c63ff] hover:border-[#6c63ff]"><Plus size={18} /></button>
            </div>
          </div>
        )}

        {/* User */}
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0">{initial}</div>
            {(!collapsed || mobileOpen) && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{user?.fullName || 'Kullanici'}</p>
                <p className="text-xs text-slate-400 truncate">{user?.email || ''}</p>
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <button onClick={() => logout()} title="Cikis Yap" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg shrink-0"><LogOut size={18} /></button>
            )}
          </div>
          {(!collapsed || mobileOpen) && (
            <p className="text-[10px] text-slate-400 text-center mt-3 leading-tight">© {new Date().getFullYear()} WTech Yazilim A.S.</p>
          )}
        </div>
      </aside>

      {/* Kisayol Duzenle Modal */}
      {editOpen && (
        <ShortcutEditor
          allItems={allMenuItems.filter((it) => canAccess(it.to))}
          current={rawShortcuts}
          onToggle={toggleShortcut}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

function ShortcutEditor({ allItems, current, onToggle, onClose }: { allItems: MenuItem[]; current: string[]; onToggle: (to: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g');
  const list = q.trim() ? allItems.filter((it) => norm(it.label).includes(norm(q))) : allItems;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800">Kisayollari Duzenle</h3>
            <p className="text-xs text-slate-400">Hizli erisim icin sayfa sec. ({current.length} secili)</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sayfa ara..." className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100" />
          </div>
        </div>
        <div className="overflow-y-auto p-2 flex-1">
          {list.map((it) => {
            const on = current.includes(it.to);
            const Icon = it.icon;
            return (
              <button key={it.to} onClick={() => onToggle(it.to)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${on ? 'bg-[#6c63ff]/10 text-[#6c63ff]' : 'hover:bg-slate-50 text-slate-700'}`}>
                <Icon size={18} className="shrink-0" />
                <span className="flex-1">{it.label}</span>
                {on && <Check size={16} className="text-[#6c63ff]" />}
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 text-right">
          <button onClick={onClose} className="px-5 py-2 bg-[#6c63ff] text-white rounded-xl text-sm font-medium hover:bg-[#5a52e0]">Tamam</button>
        </div>
      </div>
    </div>
  );
}
