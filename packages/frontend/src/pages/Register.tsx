import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../lib/api';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', companyName: '', phone: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white">WTech</h1>
          <p className="text-indigo-200 mt-1">7 gün ücretsiz deneme — kredi kartı gerekmez</p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl p-8 space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">Ücretsiz Hesap Oluştur</h2>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Ad Soyad</label>
            <input required value={form.fullName} onChange={(e) => set('fullName', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Firma Adı</label>
            <input required value={form.companyName} onChange={(e) => set('companyName', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Telefon</label>
            <input type="tel" required value={form.phone} onChange={(e) => set('phone', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" placeholder="05XX XXX XX XX" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">E-posta</label>
            <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Şifre</label>
            <input type="password" required minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none" placeholder="En az 6 karakter" />
          </div>
          <label className="flex items-start gap-2 text-xs text-gray-500">
            <input type="checkbox" required className="mt-0.5" />
            <span>
              <a href="/kvkk" target="_blank" className="text-indigo-600 hover:underline">KVKK Aydınlatma Metni</a>,{' '}
              <a href="/mesafeli-satis" target="_blank" className="text-indigo-600 hover:underline">Mesafeli Satış Sözleşmesi</a> ve{' '}
              <a href="/gizlilik" target="_blank" className="text-indigo-600 hover:underline">Gizlilik Politikası</a>'nı okudum, onaylıyorum.
            </span>
          </label>
          <button type="submit" disabled={busy}
            className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-60">
            {busy ? 'Oluşturuluyor...' : 'Hesabı Oluştur'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Zaten hesabınız var mı? <Link to="/login" className="text-indigo-600 font-medium hover:underline">Giriş yapın</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
