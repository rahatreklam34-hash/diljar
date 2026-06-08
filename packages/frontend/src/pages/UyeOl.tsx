import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { UserPlus, CheckCircle2 } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

export default function UyeOl() {
  const { slug } = useParams();
  const [form, setForm] = useState({ ad: '', instagram: '', telefon: '' });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ad.trim() || !form.instagram.trim() || !form.telefon.trim()) { alert('Ad soyad, Instagram ve telefon zorunludur.'); return; }
    setBusy(true);
    try { await api.post(`/public/uye/${slug}`, form); setDone(true); } catch (e) { alert(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="text-green-600" size={30} /></div>
        <h1 className="text-xl font-bold text-slate-800">Üyeliğiniz oluşturuldu!</h1>
        <p className="text-slate-500 mt-2 text-sm">Artık canlı yayında verdiğiniz siparişler otomatik onaylanacaktır. Teşekkürler 🙏</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-3"><UserPlus className="text-indigo-600" size={26} /></div>
          <h1 className="text-xl font-bold text-slate-800">Üyelik Formu</h1>
          <p className="text-sm text-slate-400 mt-1">Bilgilerinizi bırakın, canlı yayın siparişleriniz hızlıca onaylansın.</p>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Ad Soyad *</label>
          <input required value={form.ad} onChange={(e) => set('ad', e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Instagram Kullanıcı Adı *</label>
          <input required value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@kullaniciadi" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
          <p className="text-[11px] text-slate-400 mt-1">Kullanıcı adınız Instagram'da doğrulanır; doğru yazdığınızdan emin olun.</p>
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Telefon *</label>
          <input required type="tel" value={form.telefon} onChange={(e) => set('telefon', e.target.value)} placeholder="05XX XXX XX XX" className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
        </div>
        <button type="submit" disabled={busy} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60">{busy ? 'Kontrol ediliyor...' : 'Üye Ol'}</button>
      </form>
    </div>
  );
}
