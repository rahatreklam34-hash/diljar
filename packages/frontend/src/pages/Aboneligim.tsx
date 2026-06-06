import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, CheckCircle2, Coins, CalendarClock, LifeBuoy } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface Plan { id: string; name: string; priceMonthly: number; priceYearly: number; features: string[] | null; }
interface SubInfo {
  status: string;
  trialEndsAt: string | null;
  creditBalance: number;
  subscription: { billingCycle: string; currentPeriodEnd: string | null; plan: Plan | null } | null;
}

const fmt = (k: number) => (k / 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('tr-TR') : '-');
const STATUS: Record<string, { t: string; c: string }> = {
  TRIAL: { t: 'Deneme Sürümü', c: 'bg-blue-100 text-blue-700' },
  ACTIVE: { t: 'Aktif Abonelik', c: 'bg-green-100 text-green-700' },
  TRIAL_EXPIRED: { t: 'Deneme Süresi Doldu', c: 'bg-amber-100 text-amber-700' },
  PAST_DUE: { t: 'Ödeme Bekleniyor', c: 'bg-orange-100 text-orange-700' },
  FROZEN: { t: 'Donduruldu', c: 'bg-slate-200 text-slate-600' },
  CANCELLED: { t: 'İptal Edildi', c: 'bg-red-100 text-red-700' },
};

export default function Aboneligim() {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    api.get('/subscription').then((r) => setSub(r.data)).catch(() => {});
    api.get('/plans').then((r) => setPlans(r.data)).catch(() => {});
  }, []);

  const st = sub ? (STATUS[sub.status] || STATUS.TRIAL) : null;
  const trialDaysLeft = sub?.trialEndsAt ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><CreditCard className="text-indigo-600" size={22} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Aboneliğim</h1>
          <p className="text-sm text-slate-400">Abonelik durumunuz, kredi bakiyeniz ve plan bilgileri</p>
        </div>
      </div>

      {/* Durum kartları */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-400 mb-2">Durum</p>
          {st && <span className={`text-sm px-3 py-1 rounded-full font-medium ${st.c}`}>{st.t}</span>}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-400">Mevcut Plan</p>
          <p className="text-lg font-bold text-slate-800 mt-1">{sub?.subscription?.plan?.name || (sub?.status === 'TRIAL' ? 'Deneme' : 'Plan Yok')}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-400 flex items-center gap-1"><Coins size={14} /> Kredi Bakiyesi</p>
          <p className="text-lg font-bold text-indigo-600 mt-1">{sub?.creditBalance ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-400 flex items-center gap-1"><CalendarClock size={14} /> {sub?.status === 'TRIAL' ? 'Deneme Bitişi' : 'Dönem Bitişi'}</p>
          <p className="text-lg font-bold text-slate-800 mt-1">
            {sub?.status === 'TRIAL' ? `${dt(sub?.trialEndsAt)} (${trialDaysLeft} gün)` : dt(sub?.subscription?.currentPeriodEnd || null)}
          </p>
        </div>
      </div>

      {/* Planlar */}
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Abonelik Planları</h2>
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        {plans.map((p, i) => (
          <div key={p.id} className={`bg-white rounded-2xl p-6 border-2 flex flex-col ${i === 1 ? 'border-indigo-500' : 'border-slate-100'}`}>
            <h3 className="font-semibold text-slate-800">{p.name}</h3>
            <div className="mt-2"><span className="text-3xl font-bold text-indigo-600">₺{fmt(p.priceMonthly)}</span><span className="text-slate-400 text-sm">/ay</span></div>
            <p className="text-xs text-slate-400 mt-1">Yıllık ₺{fmt(p.priceYearly)}</p>
            <ul className="mt-4 space-y-2 flex-1">
              {(p.features || []).map((f, j) => (
                <li key={j} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" /> {f}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Satın alma talimatı */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-semibold text-slate-800 mb-2">Abonelik nasıl satın alınır?</h3>
        <p className="text-sm text-slate-600">
          Aşağıdaki banka hesabına ödeme yaptıktan sonra dekontu destek talebi olarak iletin.
          Ödemeniz onaylandığında aboneliğiniz anında aktifleştirilir ve varsa plan krediniz hesabınıza tanımlanır.
        </p>
        <div className="bg-slate-50 rounded-lg p-4 mt-3 text-sm text-slate-700 space-y-1">
          <div><span className="text-slate-400">Banka:</span> Ziraat Bankası</div>
          <div><span className="text-slate-400">IBAN:</span> TR00 0000 0000 0000 0000 0000 00</div>
          <div><span className="text-slate-400">Açıklama:</span> {user?.tenant?.name} - {user?.email}</div>
        </div>
        <Link to="/destek" className="inline-flex items-center gap-2 mt-5 bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700">
          <LifeBuoy size={18} /> Dekont Gönder / Destek Talebi
        </Link>
      </div>
    </div>
  );
}
