import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Users, FileText, Landmark, ShieldCheck, BarChart3,
  CheckCircle2, ArrowRight, Wallet, Bell, Calendar, Zap,
} from 'lucide-react';
import api from '../lib/api';
import SiteFooter from '../components/SiteFooter';

interface Plan { id: string; name: string; priceMonthly: number; priceYearly: number; features: string[] | null; }

const fmt = (kurus: number) => (kurus / 100).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

const features = [
  { icon: Users, title: 'Cari Hesap Yönetimi', desc: 'Müşteri ve tedarikçilerinizi, alış-satış ve ödeme-tahsilat hareketleriyle tek ekrandan yönetin.' },
  { icon: TrendingUp, title: 'Gelir / Gider Takibi', desc: 'Tüm gelir ve giderlerinizi kategorilere ayırın, kaynak (kasa/banka/kredi kartı) bazlı izleyin.' },
  { icon: FileText, title: 'Çek Yönetimi', desc: 'Alınan ve verilen çekleri vade takibiyle yönetin, cari ve kasaya otomatik yansısın.' },
  { icon: Landmark, title: 'Kasa & Banka', desc: 'Nakit, banka ve kredi kartı bakiyelerinizi anlık görün; transfer ve ödemeleri kaydedin.' },
  { icon: Users, title: 'Personel & Bordro', desc: 'Maaş, avans, prim, SSK, yemek-yol gibi kalemleri günlük bazda hesaplayın.' },
  { icon: BarChart3, title: 'Finansal Raporlar', desc: 'Nakit akışı, kar/zarar ve gider dağılımını grafiklerle analiz edin.' },
  { icon: Calendar, title: 'Ajanda & Düzenli Ödemeler', desc: 'Yaklaşan ödemeleri ve düzenli faturalarınızı takvimde takip edin.' },
  { icon: Bell, title: 'Bildirimler', desc: 'Yaklaşan ödemeler ve önemli olaylar için anlık hatırlatmalar alın.' },
];

const stats = [
  { value: '7 Gün', label: 'Ücretsiz Deneme' },
  { value: '%100', label: 'Web Tabanlı' },
  { value: '7/24', label: 'Her Yerden Erişim' },
  { value: 'KVKK', label: 'Uyumlu Altyapı' },
];

export default function Landing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => { api.get('/public/plans').then((r) => setPlans(r.data)).catch(() => {}); }, []);

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white"><Wallet size={18} /></div>
            WTech
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600">
            <a href="#ozellikler" className="hover:text-indigo-600">Özellikler</a>
            <a href="#fiyatlar" className="hover:text-indigo-600">Fiyatlar</a>
            <Link to="/hakkimizda" className="hover:text-indigo-600">Hakkımızda</Link>
            <Link to="/iletisim" className="hover:text-indigo-600">İletişim</Link>
            <Link to="/login" className="hover:text-indigo-600">Giriş Yap</Link>
            <Link to="/register" className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Ücretsiz Başla</Link>
          </nav>
          <Link to="/register" className="md:hidden bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm">Başla</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white">
        <div className="max-w-6xl mx-auto px-5 py-20 text-center">
          <span className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-4 py-1.5 rounded-full text-sm mb-6">
            <Zap size={14} /> İşletmenizin finansal kontrol merkezi
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight max-w-3xl mx-auto">
            Cari, çek, kasa ve personeli tek panelden yönetin
          </h1>
          <p className="text-indigo-100 text-lg mt-5 max-w-2xl mx-auto">
            FinansTakip ile alacak-borç, gelir-gider, çek ve nakit akışınızı gerçek zamanlı izleyin.
            Karmaşık muhasebe programlarına gerek kalmadan, modern ve basit.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
            <Link to="/register" className="inline-flex items-center gap-2 bg-white text-indigo-700 font-semibold px-6 py-3 rounded-xl hover:bg-indigo-50">
              7 Gün Ücretsiz Dene <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 border border-white/30 px-6 py-3 rounded-xl hover:bg-white/10">
              Giriş Yap
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 max-w-3xl mx-auto">
            {stats.map((s) => (
              <div key={s.label} className="bg-white/10 border border-white/15 rounded-xl py-4">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-indigo-200 text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Özellikler */}
      <section id="ozellikler" className="max-w-6xl mx-auto px-5 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">İşinizi büyütecek özellikler</h2>
          <p className="text-slate-500 mt-3">Tüm finansal süreçleriniz için ihtiyacınız olan her şey tek yerde.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => (
            <div key={f.title} className="border border-slate-100 rounded-2xl p-6 hover:shadow-lg hover:border-indigo-100 transition-all">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4"><f.icon size={22} /></div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Fiyatlar */}
      <section id="fiyatlar" className="bg-slate-50 py-20">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">Size uygun bir plan var</h2>
            <p className="text-slate-500 mt-3">7 gün ücretsiz deneyin, sonra ihtiyacınıza göre seçin. İstediğiniz zaman iptal.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {plans.length === 0 && (
              <div className="md:col-span-3 text-center text-slate-400">Planlar yükleniyor...</div>
            )}
            {plans.map((p, i) => (
              <div key={p.id} className={`bg-white rounded-2xl p-7 border-2 flex flex-col ${i === 1 ? 'border-indigo-500 shadow-xl relative' : 'border-slate-100'}`}>
                {i === 1 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs px-3 py-1 rounded-full">En Popüler</span>}
                <h3 className="font-semibold text-lg">{p.name}</h3>
                <div className="mt-4">
                  <span className="text-4xl font-extrabold">₺{fmt(p.priceMonthly)}</span>
                  <span className="text-slate-400">/ay</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Yıllık ₺{fmt(p.priceYearly)}</p>
                <ul className="mt-5 space-y-2 flex-1">
                  {(p.features || []).map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Link to="/register" className={`mt-6 text-center py-2.5 rounded-xl font-medium ${i === 1 ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  Ücretsiz Başla
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-5 py-20 text-center">
        <ShieldCheck className="mx-auto text-indigo-600 mb-4" size={40} />
        <h2 className="text-3xl font-bold">Bugün başlayın, finansınızı kontrol altına alın</h2>
        <p className="text-slate-500 mt-3">Kredi kartı gerekmez. 7 gün boyunca tüm özellikleri ücretsiz deneyin.</p>
        <Link to="/register" className="inline-flex items-center gap-2 mt-6 bg-indigo-600 text-white font-semibold px-8 py-3.5 rounded-xl hover:bg-indigo-700">
          Hesabımı Oluştur <ArrowRight size={18} />
        </Link>
      </section>

      <SiteFooter />
    </div>
  );
}
