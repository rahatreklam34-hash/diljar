import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, CheckCircle2, LifeBuoy, LogOut } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface Plan { id: string; name: string; priceMonthly: number; priceYearly: number; features: string[] | null; }

const STATUS_TEXT: Record<string, { title: string; desc: string }> = {
  TRIAL_EXPIRED: { title: 'Deneme süreniz doldu', desc: '7 günlük ücretsiz deneme süreniz sona erdi. Kullanmaya devam etmek için bir abonelik planı seçin.' },
  FROZEN: { title: 'Hesabınız donduruldu', desc: 'Hesabınız geçici olarak donduruldu. Verilerinizi görüntüleyebilir ancak değişiklik yapamazsınız. Lütfen destek ile iletişime geçin.' },
  PAST_DUE: { title: 'Ödeme bekleniyor', desc: 'Abonelik döneminiz sona erdi. Hizmete devam etmek için ödemenizi yapın.' },
  CANCELLED: { title: 'Aboneliğiniz iptal edildi', desc: 'Aboneliğiniz iptal edilmiş. Yeniden başlamak için bir plan seçin.' },
};

const fmt = (kurus: number) => (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 0 }) + ' ₺';

export default function TrialExpired() {
  const { user, logout } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    api.get('/plans').then((r) => setPlans(r.data)).catch(() => {});
  }, []);

  const status = user?.tenant?.status || 'TRIAL_EXPIRED';
  const info = STATUS_TEXT[status] || STATUS_TEXT.TRIAL_EXPIRED;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Lock className="text-amber-600" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{info.title}</h1>
          <p className="text-slate-500 mt-2 max-w-xl mx-auto">{info.desc}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col">
              <h3 className="text-lg font-semibold text-slate-800">{p.name}</h3>
              <div className="mt-3">
                <span className="text-3xl font-bold text-indigo-600">{fmt(p.priceMonthly)}</span>
                <span className="text-slate-400 text-sm">/ay</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Yıllık: {fmt(p.priceYearly)}</p>
              <ul className="mt-4 space-y-2 flex-1">
                {(p.features || []).map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-8">
          <h3 className="font-semibold text-slate-800 mb-2">Nasıl abone olurum?</h3>
          <p className="text-sm text-slate-600">
            Aboneliğinizi başlatmak için aşağıdaki banka hesabına ödeme yapıp dekontu destek talebi olarak iletin.
            Ödemeniz onaylandığında hesabınız anında aktifleştirilir.
          </p>
          <div className="bg-slate-50 rounded-lg p-4 mt-3 text-sm text-slate-700">
            <div><span className="text-slate-400">Banka:</span> Ziraat Bankası</div>
            <div><span className="text-slate-400">IBAN:</span> TR00 0000 0000 0000 0000 0000 00</div>
            <div><span className="text-slate-400">Açıklama:</span> {user?.tenant?.name} - {user?.email}</div>
          </div>
          <div className="flex flex-wrap gap-3 mt-5">
            <Link to="/destek" className="inline-flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700">
              <LifeBuoy size={18} /> Destek Talebi Oluştur
            </Link>
            {status === 'FROZEN' && (
              <Link to="/" className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-5 py-2.5 rounded-lg font-medium hover:bg-slate-200">
                Verilerimi Görüntüle
              </Link>
            )}
            <button onClick={() => logout()} className="inline-flex items-center gap-2 text-slate-500 px-5 py-2.5 rounded-lg font-medium hover:bg-slate-100">
              <LogOut size={18} /> Çıkış Yap
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
