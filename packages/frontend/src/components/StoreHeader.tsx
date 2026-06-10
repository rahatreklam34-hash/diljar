import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, User, ShoppingBag, ChevronDown, Zap } from 'lucide-react';

const katKey = (it: any) => (it.type === 'kategori' ? `kat:${it.value}` : it.type === 'cinsiyet' ? `cins:${it.value}` : it.value);
const katToPath = (v: string) => {
  if (!v) return '/';
  if (v.startsWith('kat:')) return `/kategori/${v.slice(4)}`;
  if (v.startsWith('cins:')) return `/cinsiyet/${v.slice(5)}`;
  return (({ indirim: '/fiyati-dusenler', coksatan: '/one-cikanlar', yeni: '/yeni-gelenler', sonsans: '/son-sans', tumu: '/' } as Record<string, string>)[v]) ?? '/';
};

interface Props {
  logoText?: string;
  topMenu?: any[];
  cartCount?: number;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onAccount?: () => void;
  onCart?: () => void;
  accountLabel?: string;
}

// Mağaza + ürün detay sayfalarının ORTAK üst menüsü (tek kaynak)
export default function StoreHeader({ logoText, topMenu = [], cartCount = 0, searchValue, onSearchChange, onAccount, onCart, accountLabel = 'Üye Ol / Giriş' }: Props) {
  const nav = useNavigate();
  const loc = useLocation();
  const controlled = typeof onSearchChange === 'function';
  const rest = loc.pathname.replace(/^\/+|\/+$/g, '');
  const curKat = !rest || rest === 'tum-urunler' ? 'tumu'
    : rest.startsWith('kategori/') ? 'kat:' + rest.slice(9)
    : rest.startsWith('cinsiyet/') ? 'cins:' + rest.slice(9)
    : (({ 'fiyati-dusenler': 'indirim', 'one-cikanlar': 'coksatan', 'yeni-gelenler': 'yeni', 'son-sans': 'sonsans' } as Record<string, string>)[rest]) || 'tumu';
  const go = (key: string) => nav(katToPath(key));
  const menu = topMenu.length
    ? topMenu.map((m: any) => ({ key: katKey(m), label: m.label, children: m.children || [] }))
    : [{ key: 'tumu', label: 'Tüm Ürünler', children: [] }, { key: 'yeni', label: 'Yeni Gelenler', children: [] }, { key: 'indirim', label: 'Fiyatı Düşenler', children: [] }, { key: 'coksatan', label: 'Öne Çıkanlar', children: [] }];

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-1.5 shrink-0"><span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center"><Zap size={16} /></span><span className="font-extrabold text-slate-900 hidden sm:block">{logoText}</span></Link>
        <form
          onSubmit={(e) => { e.preventDefault(); if (controlled) return; const v = (e.currentTarget.elements.namedItem('q') as HTMLInputElement)?.value || ''; nav(v ? `/?ara=${encodeURIComponent(v)}` : '/'); }}
          className="relative flex-1 max-w-xl mx-auto"
        >
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            {...(controlled ? { value: searchValue ?? '', onChange: (e: any) => onSearchChange!(e.target.value) } : { name: 'q', defaultValue: '' })}
            placeholder="Ürün, kod veya marka ara..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </form>
        <button onClick={() => (onAccount ? onAccount() : nav('/?acc=1'))} className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 shrink-0"><User size={18} /> {accountLabel}</button>
        <button onClick={() => (onCart ? onCart() : nav('/?cart=1'))} className="relative shrink-0" title="Sepetim"><ShoppingBag size={22} className="text-slate-700" />{cartCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center">{cartCount}</span>}</button>
      </div>
      <nav className="hidden sm:block border-t border-slate-100 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-2 py-2">
          {menu.map((m: any) => {
            const active = curKat === m.key || (m.children || []).some((c: any) => curKat === katKey(c));
            return (
              <div key={m.key} className="relative group">
                <button onClick={() => go(m.key)} className={`px-4 py-2 text-sm font-semibold rounded-full inline-flex items-center gap-1 transition-colors ${active ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-slate-600 hover:bg-slate-100'}`}>{m.label}{(m.children || []).length > 0 && <ChevronDown size={13} />}</button>
                {(m.children || []).length > 0 && (
                  <div className="absolute left-0 top-full pt-1 hidden group-hover:block z-40">
                    <div className="bg-white border border-slate-100 rounded-2xl shadow-xl py-1.5 min-w-[190px]">
                      {m.children.map((c: any, ci: number) => { const ck = katKey(c); return (
                        <button key={ci} onClick={() => go(ck)} className={`w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-600 rounded-lg ${curKat === ck ? 'text-indigo-600 font-medium' : 'text-slate-600'}`}>{c.label}</button>
                      ); })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
