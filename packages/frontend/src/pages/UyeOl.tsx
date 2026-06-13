import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { UserPlus, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

export default function UyeOl() {
  const { slug } = useParams();
  const [form, setForm] = useState({ ad: '', instagram: '', telefon: '', cinsiyet: '', kod: '' });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [errField, setErrField] = useState<'ad' | 'instagram' | 'telefon' | 'cinsiyet' | 'kod' | ''>('');
  const [step, setStep] = useState<'form' | 'kod'>('form');
  const [info, setInfo] = useState('');
  const [bekle, setBekle] = useState(0); // tekrar gönderme sayacı (sn)

  useEffect(() => {
    if (bekle <= 0) return;
    const t = setInterval(() => setBekle((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [bekle]);

  const set = (k: string, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errField === k) { setErr(''); setErrField(''); }
  };

  // Kayıt sonrası açılacak WhatsApp linki (kaydolan IG kullanıcı adı + telefon ile)
  const WA_NUMARA = '905334413472';
  const waUrl = () => `https://wa.me/${WA_NUMARA}?text=${encodeURIComponent(`Kayıt oldum ✅\nInstagram: @${form.instagram}\nTelefon: ${form.telefon}`)}`;

  // Instagram kullanıcı adı: küçük harf, Türkçe karakter yok, @ yok, sadece a-z 0-9 . _
  const cleanIg = (v: string) => v
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/İ/g, 'i')
    .replace(/[^a-z0-9._]/g, '');

  // 1. adım: bilgileri doğrula + telefona kod gönder
  const kodGonder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErr(''); setErrField(''); setInfo('');
    if (!form.ad.trim()) { setErr('Ad soyad zorunludur.'); setErrField('ad'); return; }
    if (!form.instagram.trim()) { setErr('Instagram kullanıcı adı zorunludur.'); setErrField('instagram'); return; }
    if (!form.telefon.trim()) { setErr('Telefon zorunludur.'); setErrField('telefon'); return; }
    if (!form.cinsiyet) { setErr('Cinsiyet seçimi zorunludur.'); setErrField('cinsiyet'); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/public/uye/${slug}/kod-gonder`, { telefon: form.telefon, instagram: form.instagram });
      setStep('kod');
      setInfo(data?.message || 'Doğrulama kodu telefonunuza gönderildi.');
      setBekle(60);
    } catch (e) {
      const msg = apiErrorMessage(e);
      setErr(msg);
      if (/telefon|numara/i.test(msg)) setErrField('telefon');
    } finally { setBusy(false); }
  };

  // 2. adım: kod ile üyeliği tamamla
  const uyeOl = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setErrField('');
    if (!form.kod.trim()) { setErr('Doğrulama kodunu girin.'); setErrField('kod'); return; }
    setBusy(true);
    // Popup engelini aşmak için WhatsApp sekmesini gesture anında aç, başarıda yönlendir
    const waWin = window.open('', '_blank');
    try {
      await api.post(`/public/uye/${slug}`, form);
      setDone(true);
      // Kayıt başarılı → WhatsApp'ı kayıt bilgisiyle otomatik aç
      const url = waUrl();
      if (waWin) { waWin.location.href = url; } else { window.location.href = url; }
    } catch (e) {
      if (waWin) { try { waWin.close(); } catch { /* */ } }
      const msg = apiErrorMessage(e);
      setErr(msg);
      if (/kod|doğrulama|dogrulama/i.test(msg)) setErrField('kod');
      else if (/instagram|kullanıc|kullanic/i.test(msg)) { setErrField('instagram'); setStep('form'); }
      else if (/telefon/i.test(msg)) { setErrField('telefon'); setStep('form'); }
    } finally { setBusy(false); }
  };

  if (done) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4"><CheckCircle2 className="text-green-600" size={30} /></div>
        <h1 className="text-xl font-bold text-slate-800">Üyeliğiniz oluşturuldu!</h1>
        <p className="text-slate-500 mt-2 text-sm">Artık canlı yayında verdiğiniz siparişler otomatik onaylanacaktır. Teşekkürler 🙏</p>
        <a
          href={waUrl()}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center justify-center gap-2 w-full bg-green-500 text-white py-2.5 rounded-lg font-medium hover:bg-green-600"
        >
          WhatsApp ile bildir
        </a>
        <p className="text-[11px] text-slate-400 mt-2">WhatsApp otomatik açılmadıysa bu butona dokunun.</p>
      </div>
    </div>
  );

  const inputCls = (field: string) =>
    `w-full px-4 py-2.5 border rounded-lg outline-none transition-colors ${errField === field ? 'border-red-400 ring-2 ring-red-100 bg-red-50/40' : 'border-slate-200 focus:border-indigo-400'}`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 p-4">
      <form onSubmit={step === 'form' ? kodGonder : uyeOl} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-4">
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
        {info && step === 'kod' && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-[13px]">
            <ShieldCheck size={16} className="shrink-0 mt-0.5" /><span>{info}</span>
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600 mb-1">Ad Soyad *</label>
          <input value={form.ad} onChange={(e) => set('ad', e.target.value)} disabled={step === 'kod'} className={inputCls('ad')} />
          {errField === 'ad' && <p className="flex items-center gap-1 text-[12px] text-red-600 mt-1"><AlertCircle size={13} /> {err}</p>}
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Instagram Kullanıcı Adı *</label>
          <input
            value={form.instagram}
            onChange={(e) => set('instagram', cleanIg(e.target.value))}
            disabled={step === 'kod'}
            placeholder="kullaniciadi"
            autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
            className={`${inputCls('instagram')} lowercase`}
          />
          {errField === 'instagram'
            ? <p className="flex items-center gap-1 text-[12px] text-red-600 mt-1"><AlertCircle size={13} /> {err}</p>
            : <p className="text-[11px] text-slate-400 mt-1">Sadece küçük harf, rakam, nokta ve alt çizgi. Başına @ koymayın.</p>}
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Telefon *</label>
          <input type="tel" value={form.telefon} onChange={(e) => set('telefon', e.target.value)} disabled={step === 'kod'} placeholder="05XX XXX XX XX" className={inputCls('telefon')} />
          {errField === 'telefon' && <p className="flex items-center gap-1 text-[12px] text-red-600 mt-1"><AlertCircle size={13} /> {err}</p>}
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">Cinsiyet *</label>
          <div className="grid grid-cols-2 gap-2">
            {(['Kadın', 'Erkek'] as const).map((c) => (
              <button
                key={c}
                type="button"
                disabled={step === 'kod'}
                onClick={() => set('cinsiyet', c)}
                className={`py-2.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60 ${form.cinsiyet === c ? 'bg-indigo-600 text-white border-indigo-600' : (errField === 'cinsiyet' ? 'border-red-400 bg-red-50/40 text-slate-600' : 'border-slate-200 text-slate-600 hover:border-indigo-400')}`}
              >
                {c}
              </button>
            ))}
          </div>
          {errField === 'cinsiyet' && <p className="flex items-center gap-1 text-[12px] text-red-600 mt-1"><AlertCircle size={13} /> {err}</p>}
        </div>

        {step === 'kod' && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">SMS Doğrulama Kodu *</label>
            <input
              inputMode="numeric" maxLength={4} autoFocus
              value={form.kod}
              onChange={(e) => set('kod', e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4 haneli kod"
              className={`${inputCls('kod')} tracking-[0.5em] text-center text-lg font-semibold`}
            />
            {errField === 'kod' && <p className="flex items-center gap-1 text-[12px] text-red-600 mt-1"><AlertCircle size={13} /> {err}</p>}
            <div className="flex items-center justify-between mt-2">
              <button type="button" onClick={() => { setStep('form'); setForm((f) => ({ ...f, kod: '' })); setErr(''); setErrField(''); setInfo(''); }} className="text-[12px] text-slate-500 hover:text-slate-700">Bilgileri düzenle</button>
              <button type="button" disabled={busy || bekle > 0} onClick={() => kodGonder()} className="text-[12px] text-indigo-600 font-medium disabled:text-slate-400">
                {bekle > 0 ? `Tekrar gönder (${bekle})` : 'Kodu tekrar gönder'}
              </button>
            </div>
          </div>
        )}

        <button type="submit" disabled={busy} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60">
          {busy ? (step === 'form' ? 'Kod gönderiliyor...' : 'Doğrulanıyor...') : (step === 'form' ? 'Doğrulama Kodu Gönder' : 'Üye Ol')}
        </button>
      </form>
    </div>
  );
}
