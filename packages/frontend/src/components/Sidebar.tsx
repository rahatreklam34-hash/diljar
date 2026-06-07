import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Plus, LogOut, ChevronDown, Pencil, Check, Search, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { navGroups, allMenuItems, MenuItem } from '../lib/menu';

const DEFAULT_SHORTCUTS = ['/canli-yayin', '/kasa-satis', '/siparisler', '/depo/urunlerim', '/musterilerim'];

// Grup bazli renk temasi (modern, renkli ikonlar)
const GROUP_THEMES: { icon: string; dot: string; soft: string }[] = [
  { icon: 'text-violet-500', dot: 'bg-violet-500', soft: 'group-hover:bg-violet-50' },   // Dashboard
  { icon: 'text-emerald-500', dot: 'bg-emerald-500', soft: 'group-hover:bg-emerald-50' }, // Finans
  { icon: 'text-sky-500', dot: 'bg-sky-500', soft: 'group-hover:bg-sky-50' },             // Urunler & Stok
  { icon: 'text-fuchsia-500', dot: 'bg-fuchsia-500', soft: 'group-hover:bg-fuchsia-50' }, // Satislar
  { icon: 'text-orange-500', dot: 'bg-orange-500', soft: 'group-hover:bg-orange-50' },    // Siparisler
  { icon: 'text-pink-500', dot: 'bg-pink-500', soft: 'group-hover:bg-pink-50' },          // Musteriler
  { icon: 'text-cyan-500', dot: 'bg-cyan-500', soft: 'group-hover:bg-cyan-50' },          // Pazarlama & Asistan
  { icon: 'text-indigo-500', dot: 'bg-indigo-500', soft: 'group-hover:bg-indigo-50' },    // Ekip Yonetimi
  { icon: 'text-slate-500', dot: 'bg-slate-400', soft: 'group-hover:bg-slate-100' },      // Hesap & Destek
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Akordeon: en fazla 1 grup acik. Varsayilan: hepsi kapali.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, canAccess, updatePrefs } = useAuth();
  const initial = (user?.fullName || 'K').charAt(0).toUpperCase();

  // Sayfa degisince: yalnizca aktif sayfanin grubu acik, digerleri kapali
  useEffect(() => {
    for (const g of navGroups) {
      if (g.title && g.items.some((it) => it.to === location.pathname)) {
        setOpenGroup(g.title);
        return;
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

  const toggleGroup = (key: string) => setOpenGroup((cur) => (cur === key ? null : key));
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
      <button onClick={() => setMobileOpen(true)} className="lg:hidden fixed top-3 left-3 z-[60] p-2 bg-white text-slate-700 rounded-xl shadow-lg shadow-slate-200 border border-slate-200" aria-label="Menuyu ac">
        <Menu size={20} />
      </button>
      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[55]" onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-[58] flex flex-col bg-gradient-to-b from-white to-slate-50/80 border-r border-slate-200/80 text-slate-700 transition-all duration-300 h-screen overflow-y-auto ${collapsed ? 'w-64 lg:w-20' : 'w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 sticky top-0 bg-white/80 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-[#6c63ff] to-[#a855f7] rounded-xl flex items-center justify-center font-bold text-lg text-white shrink-0 shadow-lg shadow-[#6c63ff]/30">W</div>
            {(!collapsed || mobileOpen) && <span className="text-lg font-extrabold bg-gradient-to-r from-[#6c63ff] to-[#a855f7] bg-clip-text text-transparent">WTech</span>}
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="hidden lg:block p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors">
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><X size={18} /></button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto" onClick={() => mobileOpen && setMobileOpen(false)}>
          {navGroups.map((group, gi) => {
            const key = group.title || '_';
            const theme = GROUP_THEMES[gi] || GROUP_THEMES[GROUP_THEMES.length - 1];
            const open = !group.title ? true : (isIconOnly ? true : openGroup === key);
            const visibleItems = group.items.filter((it) => canAccess(it.to));
            if (visibleItems.length === 0) return null;
            return (
              <div key={gi} className={gi > 0 ? 'mt-0.5' : ''}>
                {group.title && !isIconOnly && (
                  <button onClick={(e) => { e.stopPropagation(); toggleGroup(key); }} className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wide transition-colors ${open ? 'text-slate-700 bg-slate-100/70' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                    <span className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />{group.title}</span>
                    <ChevronDown size={14} className={`transition-transform duration-300 ${open ? '' : '-rotate-90'}`} />
                  </button>
                )}
                {group.title && isIconOnly && gi > 0 && <div className="mx-3 my-2 border-t border-slate-100" />}
                <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[640px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  {visibleItems.map((item) => (
                    <NavLink key={item.to} to={item.to} className={({ isActive }) => `group flex items-center gap-3 pl-3 pr-3 py-2.5 my-0.5 mx-1 rounded-xl text-sm transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-[#6c63ff] to-[#8b7bff] text-white font-semibold shadow-lg shadow-[#6c63ff]/30' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}>
                      {({ isActive }) => (
                        <>
                          <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 transition-colors ${isActive ? 'bg-white/20' : `bg-slate-100 ${theme.soft}`}`}>
                            <item.icon size={16} className={isActive ? 'text-white' : theme.icon} />
                          </span>
                          {!isIconOnly && <span className="truncate">{item.label}</span>}
                          {!isIconOnly && isActive && <Sparkles size={13} className="ml-auto text-white/80" />}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Kisayollarim (kisisel, duzenlenebilir) */}
        {!isIconOnly && (
          <div className="px-4 py-3 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><Sparkles size={11} className="text-[#6c63ff]" /> Kisayollarim</span>
              <button onClick={() => setEditOpen(true)} className="text-[11px] text-[#6c63ff] font-semibold hover:underline flex items-center gap-0.5"><Pencil size={11} /> Duzenle</button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {shortcutItems.slice(0, 7).map((it) => (
                <button key={it.to} onClick={() => { navigate(it.to); setMobileOpen(false); }} title={it.label} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white border border-slate-100 hover:border-[#6c63ff]/40 hover:shadow-md hover:shadow-[#6c63ff]/10 text-slate-500 hover:text-[#6c63ff] transition-all">
                  <it.icon size={18} />
                  <span className="text-[8px] leading-none text-center w-full truncate">{it.label.split(' ')[0]}</span>
                </button>
              ))}
              <button onClick={() => setEditOpen(true)} title="Kisayol ekle" className="flex items-center justify-center p-2 rounded-xl border border-dashed border-slate-300 text-slate-400 hover:text-[#6c63ff] hover:border-[#6c63ff] transition-colors"><Plus size={18} /></button>
            </div>
          </div>
        )}

        {/* User */}
        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2 rounded-2xl bg-white border border-slate-100">
            <div className="w-9 h-9 bg-gradient-to-br from-[#6c63ff] to-[#a855f7] rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-md shadow-[#6c63ff]/30">{initial}</div>
            {(!collapsed || mobileOpen) && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{user?.fullName || 'Kullanici'}</p>
                <p className="text-[11px] text-slate-400 truncate">{user?.email || ''}</p>
              </div>
            )}
            {(!collapsed || mobileOpen) && (
              <button onClick={() => logout()} title="Cikis Yap" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0 transition-colors"><LogOut size={18} /></button>
            )}
          </div>
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-[#6c63ff]/5 to-[#a855f7]/5">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-1.5"><Sparkles size={15} className="text-[#6c63ff]" /> Kisayollari Duzenle</h3>
            <p className="text-xs text-slate-400">Hizli erisim icin sayfa sec. ({current.length} secili)</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sayfa ara..." className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#6c63ff]/20 focus:border-[#6c63ff]/40" />
          </div>
        </div>
        <div className="overflow-y-auto p-2 flex-1">
          {list.map((it) => {
            const on = current.includes(it.to);
            const Icon = it.icon;
            return (
              <button key={it.to} onClick={() => onToggle(it.to)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-colors ${on ? 'bg-gradient-to-r from-[#6c63ff]/10 to-[#a855f7]/10 text-[#6c63ff]' : 'hover:bg-slate-50 text-slate-700'}`}>
                <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${on ? 'bg-[#6c63ff] text-white' : 'bg-slate-100 text-slate-500'}`}><Icon size={16} /></span>
                <span className="flex-1 font-medium">{it.label}</span>
                {on && <Check size={16} className="text-[#6c63ff]" />}
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 text-right">
          <button onClick={onClose} className="px-5 py-2 bg-gradient-to-r from-[#6c63ff] to-[#8b7bff] text-white rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-[#6c63ff]/30 transition-shadow">Tamam</button>
        </div>
      </div>
    </div>
  );
}
