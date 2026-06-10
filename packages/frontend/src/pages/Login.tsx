import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      const to = location.state?.from?.pathname || '/anasayfa';
      navigate(to, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">WTech</h1>
          <p className="text-indigo-200 mt-1">İşletmenizin finansal kontrol merkezi</p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-5">
          <h2 className="text-xl font-semibold text-gray-800">Giriş Yap</h2>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">E-posta</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" placeholder="ornek@firma.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Şifre</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" placeholder="••••••••" />
          </div>
          <button type="submit" disabled={busy}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60">
            {busy ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Hesabınız yok mu? <Link to="/register" className="text-indigo-600 font-medium hover:underline">7 gün ücretsiz deneyin</Link>
          </p>
        </form>
        <div className="mt-6 text-center text-xs text-indigo-200 space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <Link to="/kvkk" className="hover:text-white">KVKK</Link>
            <span>·</span>
            <Link to="/gizlilik" className="hover:text-white">Gizlilik</Link>
            <span>·</span>
            <Link to="/mesafeli-satis" className="hover:text-white">Mesafeli Satış</Link>
            <span>·</span>
            <Link to="/iletisim" className="hover:text-white">İletişim</Link>
          </div>
          <p>© {new Date().getFullYear()} WTech Yazılım A.Ş. — Tüm hakları saklıdır.</p>
        </div>
      </div>
    </div>
  );
}
