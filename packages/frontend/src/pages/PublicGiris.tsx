import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Phone, Lock, UserPlus, LogIn, AtSign, ChevronLeft, ShieldCheck } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

const GOLD = '#C9A227';

// Musteri (magaza) girisi / kaydi — mevcut backend /public/store/:slug/uye-giris & uye-kayit uclarina baglanir.
// Token 'shopToken_<slug>' anahtariyla localStorage'a yazilir (mevcut desen).
export default function PublicGiris() {
  const nav = useNavigate();
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  const [storeName, setStoreName] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ ad: '', telefon: '', sifre: '', instagram: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/public/primary-store')
      .then((r) => { setSlug(r.data?.slug || null); setStoreName(r.data?.magaza || ''); })
      .catch(() => setSlug(null));
  }, []);

  // Zaten girisliyse dogrudan hesabima yonlendir
  useEffect(() => {
    if (!slug) return;
    const tk = localStorage.getItem('shopToken_' + slug);
    if (!tk) return;
    api.get(`/public/store/${slug}/hesabim`, { headers: { Authorization: 'Bearer ' + tk } })
      .then(() => nav('/hesabim', { replace: true }))
      .catch(() => localStorage.removeItem('shopToken_' + slug));
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setBusy(true); setErr('');
    try {
      const url = mode === 'register'
        ? `/public/store/${slug}/uye-kayit`
        : `/public/store/${slug}/uye-giris`;
      const r = await api.post(url, f);
      localStorage.setItem('shopToken_' + slug, r.data.token);
      nav('/hesabim', { replace: true });
    } catch (e2) { setErr(apiErrorMessage(e2)); } finally { setBusy(false); }
  };

  if (slug === undefined) return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]"><span className="w-8 h-8 border-2 border-white/20 border-t-[#C9A227] rounded-full animate-spin" /></div>;

  const inputCls = 'w-full pl-11 pr-3 py-3 border border-slate-300 rounded-xl text-sm outline-none focus:border-[#0a0a0a] transition-colors';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* (A) Üst duyuru barı — PublicStore ile ayni */}
      <div className="bg-[#0a0a0a] text-white text-[11px] sm:text-xs border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-9 sm:h-10 flex items-center gap-4 overflow-x-auto scrollbar-hide whitespace-nowrap">
          <span className="flex items-center gap-1.5 shrink-0">🚚 7.500 TL ve üzeri alışverişlerde ücretsiz kargo!</span>
          <span className="hidden md:inline text-white/25">|</span>
          <span className="hidden md:flex items-center gap-2 shrink-0 mx-auto">
            <span className="flex items-center gap-1.5">🏅 İLK SİPARİŞE ÖZEL %20 İNDİRİM</span>
          </span>
          <span className="hidden lg:inline shrink-0 ml-auto">Vade farksız 3 taksit fırsatı!</span>
        </div>
      </div>

      {/* (B) Header — logo (serif) + geri/anasayfa */}
      <header className="bg-[#111] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }} className="font-bold text-2xl sm:text-4xl tracking-tight text-white whitespace-nowrap">{storeName || 'DiLjar'}</Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-white/60 hover:text-[#C9A227] transition-colors">
            <ChevronLeft size={16} /> Mağazaya Dön
          </Link>
        </div>
      </header>

      {/* İçerik */}
      <div className="flex-1 flex items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span style={{ fontFamily: 'Georgia, "Times New Roman", serif' }} className="font-bold text-4xl sm:text-5xl tracking-tight text-white">{storeName || 'DiLjar'}</span>
            <div className="mx-auto mt-3 h-0.5 w-16 rounded-full" style={{ backgroundColor: GOLD }} />
            <p className="text-white/50 text-sm mt-3">Hesabınıza giriş yapın veya yeni üyelik oluşturun</p>
          </div>

          <div className="bg-white text-[#111] rounded-2xl shadow-2xl p-6 sm:p-8">
            {/* Sekme */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-6">
              <button type="button" onClick={() => { setMode('login'); setErr(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${mode === 'login' ? 'bg-[#0a0a0a] text-white' : 'text-slate-500 hover:text-[#111]'}`}><LogIn size={15} /> Giriş Yap</button>
              <button type="button" onClick={() => { setMode('register'); setErr(''); }} className={`flex-1 py-2.5 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${mode === 'register' ? 'bg-[#0a0a0a] text-white' : 'text-slate-500 hover:text-[#111]'}`}><UserPlus size={15} /> Üye Ol</button>
            </div>

            {slug === null ? (
              <p className="text-center text-sm text-slate-500 py-6">Aktif mağaza bulunamadı. Lütfen daha sonra tekrar deneyin.</p>
            ) : (
              <form onSubmit={submit} className="space-y-3.5">
                {mode === 'register' && (
                  <div className="relative">
                    <User size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} placeholder="Ad Soyad" required className={inputCls} />
                  </div>
                )}
                <div className="relative">
                  <Phone size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={f.telefon} onChange={(e) => setF({ ...f, telefon: e.target.value })} placeholder="Telefon (05xxxxxxxxx)" required inputMode="tel" className={inputCls} />
                </div>
                {mode === 'register' && (
                  <div className="relative">
                    <AtSign size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="Instagram kullanıcı adı (opsiyonel)" className={inputCls} />
                  </div>
                )}
                <div className="relative">
                  <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="password" value={f.sifre} onChange={(e) => setF({ ...f, sifre: e.target.value })} placeholder="Şifre" required className={inputCls} />
                </div>

                {err && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

                <button type="submit" disabled={busy} className="w-full bg-[#0a0a0a] hover:bg-[#C9A227] text-white py-3.5 rounded-xl font-bold tracking-wide disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2">
                  {busy ? 'İşleniyor...' : (mode === 'login' ? 'Giriş Yap' : 'Üye Ol')}
                </button>

                <p className="text-center text-xs text-slate-400 pt-1">
                  {mode === 'login'
                    ? <>Hesabınız yok mu? <button type="button" onClick={() => { setMode('register'); setErr(''); }} className="font-bold" style={{ color: GOLD }}>Üye olun</button></>
                    : <>Zaten üye misiniz? <button type="button" onClick={() => { setMode('login'); setErr(''); }} className="font-bold" style={{ color: GOLD }}>Giriş yapın</button></>}
                </p>
              </form>
            )}
          </div>

          <p className="text-center text-white/40 text-xs mt-5 inline-flex items-center justify-center gap-1.5 w-full">
            <ShieldCheck size={14} style={{ color: GOLD }} /> Bilgileriniz güvenle saklanır
          </p>
        </div>
      </div>
    </div>
  );
}
