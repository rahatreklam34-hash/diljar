import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { UserPlus, CheckCircle2, AlertCircle } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

export default function UyeOl() {
  const { slug } = useParams();
  const [form, setForm] = useState({ ad: '', instagram: '', telefon: '' });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [errField, setErrField] = useState<'ad' | 'instagram' | 'telefon' | ''>('');
  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errField === k) { setErr(''); setErrField(''); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setErrField('');
    if (!form.ad.trim()) { setErr('Ad soyad zorunludur.'); setErrField('ad'); return; }
    if (!form.instagram.trim()) { setErr('Instagram kullanıcı adı zorunludur.'); setErrField('instagram'); return; }
    if (!form.telefon.trim()) { setErr('Telefon zorunludur.'); setErrField('telefon'); return; }
    setBusy(true);
    try {
      await api.post(`/public/uye/${slug}`, form);
      setDone(true);
    } catch (e) {
      const msg = apiErrorMessage(e);
      setErr(msg);
      if (/instagram|kullanıc|kullanic/i.test(msg)) setErrField('instagram');
      else if (/telefon/i.test(msg)) setErrField('telefon');
    } finally { setBusy(false); }
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

  const inputCls = (field: string) =>
    `w-full px-4 py-2.5 border rounded-lg outline-none transition-colors ${errField === field ? 'border-red-400 ring-2 ring-red-100 bg-red-50/40' : 'border-slate-200 focus:border-indigo-400'}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-3"><UserPlus className="text-indigo-600" size={26} /></div>
          <h1 className="text-xl font-bold text-slate-800">Üyelik Formu</h1>
          <p className="text-sm text-slate-400 mt-1">Bilgilerinizi bırakın, canlı yayın siparişleriniz hızlıca onaylansın.</p>
        </div>

        {err && !errField && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-[13px]">
            <AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{err}</span>
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600 mb-1">Ad Soyad *</label>
          <input value={form.ad} onChange={(e) => set('ad', e.target.value)} className={inputCls('ad')} />
          {errField === 'ad' && <p className="flex items-center gap-1 text-[12px] text-red-600 mt-1"><AlertCircle size={13} /> {err}</p>}
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Instagram Kullanıcı Adı *</label>
          <input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@kullaniciadi" className={inputCls('instagram')} />
          {errField === 'instagram'
            ? <p className="flex items-center gap-1 text-[12px] text-red-600 mt-1"><AlertCircle size={13} /> {err}</p>
            : <p className="text-[11px] text-slate-400 mt-1">Kullanıcı adınız Instagram'da doğrulanır; doğru yazdığınızdan emin olun.</p>}
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Telefon *</label>
          <input type="tel" value={form.telefon} onChange={(e) => set('telefon', e.target.value)} placeholder="05XX XXX XX XX" className={inputCls('telefon')} />
          {errField === 'telefon' && <p className="flex items-center gap-1 text-[12px] text-red-600 mt-1"><AlertCircle size={13} /> {err}</p>}
        </div>
        <button type="submit" disabled={busy} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60">{busy ? 'Kontrol ediliyor...' : 'Üye Ol'}</button>
      </form>
    </div>
  );
}
