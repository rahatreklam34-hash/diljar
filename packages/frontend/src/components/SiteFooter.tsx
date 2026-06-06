import { Link } from 'react-router-dom';
import { Wallet, Mail, Phone, MapPin } from 'lucide-react';

// Basit kart marka rozetleri (harici görsel yok)
function VisaBadge() {
  return (
    <div className="h-7 px-2 bg-white rounded border border-slate-200 flex items-center">
      <span className="font-bold italic text-[#1a1f71] text-sm tracking-wide">VISA</span>
    </div>
  );
}
function MastercardBadge() {
  return (
    <div className="h-7 px-2 bg-white rounded border border-slate-200 flex items-center gap-1">
      <span className="w-4 h-4 rounded-full bg-[#eb001b] inline-block" />
      <span className="w-4 h-4 rounded-full bg-[#f79e1b] inline-block -ml-2 opacity-90" />
      <span className="text-[10px] font-semibold text-slate-700 ml-0.5">mastercard</span>
    </div>
  );
}
function TroyBadge() {
  return (
    <div className="h-7 px-2 bg-white rounded border border-slate-200 flex items-center">
      <span className="font-bold text-[#00a4a6] text-sm">troy</span>
    </div>
  );
}

export default function SiteFooter() {
  const y = new Date().getFullYear();
  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="max-w-6xl mx-auto px-5 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 font-bold text-white text-lg mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center"><Wallet size={18} /></div>
            WTech
          </div>
          <p className="text-sm text-slate-400">İşletmenizin cari, çek, kasa ve personel süreçlerini tek panelden yöneten modern finans takip platformu.</p>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Kurumsal</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/hakkimizda" className="hover:text-white">Hakkımızda</Link></li>
            <li><Link to="/iletisim" className="hover:text-white">İletişim</Link></li>
            <li><Link to="/register" className="hover:text-white">Ücretsiz Dene</Link></li>
            <li><Link to="/login" className="hover:text-white">Giriş Yap</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">Yasal</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/kvkk" className="hover:text-white">KVKK Aydınlatma Metni</Link></li>
            <li><Link to="/gizlilik" className="hover:text-white">Gizlilik & Güvenlik Politikası</Link></li>
            <li><Link to="/mesafeli-satis" className="hover:text-white">Mesafeli Satış Sözleşmesi</Link></li>
            <li><Link to="/iade-iptal" className="hover:text-white">İptal & İade Koşulları</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-3">İletişim</h4>
          <ul className="space-y-2 text-sm text-slate-400">
            <li className="flex items-center gap-2"><Mail size={15} /> destek@diljar.com</li>
            <li className="flex items-center gap-2"><Phone size={15} /> 0850 000 00 00</li>
            <li className="flex items-start gap-2"><MapPin size={15} className="mt-0.5" /> WTech Yazılım A.Ş.</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-500 text-center sm:text-left">© {y} WTech Yazılım A.Ş. — Tüm hakları saklıdır.</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 mr-1">Güvenli ödeme:</span>
            <VisaBadge /><MastercardBadge /><TroyBadge />
          </div>
        </div>
      </div>
    </footer>
  );
}
