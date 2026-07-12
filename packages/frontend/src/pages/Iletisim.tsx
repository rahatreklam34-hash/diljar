import { useState } from 'react';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import PublicPage from '../components/PublicPage';

export default function Iletisim() {
  const [form, setForm] = useState({ ad: '', email: '', mesaj: '' });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Ziyaretçi mesajı: mailto ile iletilir (giriş gerektirmez)
    const body = encodeURIComponent(`Ad: ${form.ad}\nE-posta: ${form.email}\n\n${form.mesaj}`);
    window.location.href = `mailto:destek@diljar.com?subject=İletişim Formu&body=${body}`;
    toast.success('E-posta uygulamanız açılıyor...');
  };
  return (
    <PublicPage title="İletişim" subtitle="Sorularınız için bize ulaşın">
      <div className="grid md:grid-cols-2 gap-8 not-prose">
        <div className="space-y-4">
          <h2>Bize Ulaşın</h2>
          <p>Ürün, abonelik veya teknik konularda her zaman yanınızdayız. Aşağıdaki kanallardan bize ulaşabilir veya formu doldurabilirsiniz.</p>
          <div className="space-y-3 text-slate-700">
            <div className="flex items-center gap-3"><Mail size={18} className="text-emerald-600" /> destek@diljar.com</div>
            <div className="flex items-center gap-3"><Phone size={18} className="text-emerald-600" /> 0850 000 00 00</div>
            <div className="flex items-start gap-3"><MapPin size={18} className="text-emerald-600 mt-0.5" /> WTech Yazılım A.Ş. — [Şirket adresi]</div>
          </div>
          <p className="text-sm text-slate-400">Mevcut müşteriyseniz, panel içindeki <strong>Destek Merkezi</strong>'nden talep oluşturmanız daha hızlı yanıt almanızı sağlar.</p>
        </div>
        <form onSubmit={submit} className="bg-slate-50 rounded-2xl p-6 space-y-4 border border-slate-100">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Ad Soyad</label>
            <input required value={form.ad} onChange={(e) => setForm({ ...form, ad: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">E-posta</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Mesajınız</label>
            <textarea required rows={4} value={form.mesaj} onChange={(e) => setForm({ ...form, mesaj: e.target.value })} className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
          </div>
          <button type="submit" className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-emerald-700"><Send size={16} /> Gönder</button>
        </form>
      </div>
    </PublicPage>
  );
}
