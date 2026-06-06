import { useEffect, useState } from 'react';
import { Users, TrendingUp, Wallet, Award, XCircle } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

const fmt0 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function SaticiPerformans() {
  const [list, setList] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get('/store/seller-performance').then((r) => setList(r.data || [])).catch((e) => setErr(apiErrorMessage(e))).finally(() => setLoading(false)); }, []);

  const top = list.reduce((s, x) => ({ ciro: s.ciro + x.ciro, kar: s.kar + x.kar, adet: s.adet + x.adet, prim: s.prim + x.prim }), { ciro: 0, kar: 0, adet: 0, prim: 0 });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Users className="text-indigo-600" size={22} /></div>
        <div><h1 className="text-2xl font-bold text-slate-800">Satıcı Performansı</h1><p className="text-sm text-slate-400">Canlı yayın satıcılarının ciro, kârlılık ve prim analizi.</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Wallet} cls="bg-indigo-100 text-indigo-600" label="Toplam Ciro" value={fmt0(top.ciro)} />
        <Kpi icon={TrendingUp} cls="bg-green-100 text-green-600" label="Toplam Kâr" value={fmt0(top.kar)} />
        <Kpi icon={Award} cls="bg-amber-100 text-amber-600" label="Toplam Prim (%5)" value={fmt0(top.prim)} />
        <Kpi icon={Users} cls="bg-sky-100 text-sky-600" label="Satış Adedi" value={String(top.adet)} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-slate-400 text-left text-xs uppercase border-b border-slate-100"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Satıcı</th><th className="px-4 py-3">Satış Adedi</th><th className="px-4 py-3">Ciro</th><th className="px-4 py-3">Kâr</th><th className="px-4 py-3">İptal / Oran</th><th className="px-4 py-3">Prim (%5)</th></tr></thead>
          <tbody>
            {list.map((s, i) => (
              <tr key={s.satici} className="border-b border-slate-50 hover:bg-slate-50/60">
                <td className="px-4 py-3"><span className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span></td>
                <td className="px-4 py-3 font-semibold text-slate-800">{s.satici}</td>
                <td className="px-4 py-3 text-slate-600">{s.adet}</td>
                <td className="px-4 py-3 font-semibold text-slate-800">{fmt0(s.ciro)}</td>
                <td className="px-4 py-3 font-medium text-green-600">{fmt0(s.kar)}</td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-red-500"><XCircle size={13} /> {s.iptal}</span> <span className={`text-xs ml-1 ${s.iptalOrani > 20 ? 'text-red-500' : 'text-slate-400'}`}>%{s.iptalOrani}</span></td>
                <td className="px-4 py-3 font-bold text-amber-600">{fmt0(s.prim)}</td>
              </tr>
            ))}
            {!loading && list.length === 0 && <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-400">{err || 'Henüz satıcı performans verisi yok. Canlı yayında satıcı seçerek satış yapıldığında burada görünür.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">Prim varsayılan kârın %5'i olarak hesaplanır. İade/değişim gerçekleştiğinde ilgili satıcının cirosundan düşülür (canlı yayın iptalleri).</p>
    </div>
  );
}

function Kpi({ icon: Ic, cls, label, value }: any) {
  return <div className="bg-white rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 mb-2"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}><Ic size={18} /></div><p className="text-xs text-slate-400">{label}</p></div><p className="text-xl font-bold text-slate-800">{value}</p></div>;
}
