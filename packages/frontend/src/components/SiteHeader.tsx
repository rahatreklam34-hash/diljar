import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg text-slate-800">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white"><Wallet size={18} /></div>
          WTech
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6 text-sm text-slate-600">
          <Link to="/hakkimizda" className="hidden sm:inline hover:text-indigo-600">Hakkımızda</Link>
          <Link to="/iletisim" className="hidden sm:inline hover:text-indigo-600">İletişim</Link>
          <Link to="/login" className="hover:text-indigo-600">Giriş</Link>
          <Link to="/register" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Ücretsiz Başla</Link>
        </nav>
      </div>
    </header>
  );
}
