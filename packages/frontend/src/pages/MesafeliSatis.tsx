import PublicPage from '../components/PublicPage';

export default function MesafeliSatis() {
  return (
    <PublicPage title="Mesafeli Satış Sözleşmesi">
      <h2>1. Taraflar</h2>
      <p><strong>SATICI:</strong> WTech Yazılım A.Ş. ("Şirket") — E-posta: destek@diljar.com — Adres: [Şirket adresi] — MERSİS: [MERSİS No]</p>
      <p><strong>ALICI:</strong> FinansTakip hizmetine üye olan ve abonelik satın alan gerçek/tüzel kişi ("Müşteri").</p>

      <h2>2. Sözleşmenin Konusu</h2>
      <p>İşbu sözleşmenin konusu, Müşteri'nin FinansTakip platformu üzerinden elektronik ortamda satın aldığı abonelik / dijital hizmetin satışı ve ifası ile tarafların 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca hak ve yükümlülüklerinin belirlenmesidir.</p>

      <h2>3. Hizmet ve Bedel</h2>
      <ul>
        <li>Hizmet: FinansTakip yazılımı abonelik planı (aylık/yıllık) ve/veya ek kredi/kontör.</li>
        <li>Plan ve güncel ücretler, satın alma sırasında platformda gösterilir.</li>
        <li>Ödeme; banka havalesi/EFT veya sanal POS (kredi/banka kartı) ile yapılır.</li>
        <li>Belirtilen fiyatlara KDV dahildir.</li>
      </ul>

      <h2>4. İfa Şekli ve Süresi</h2>
      <p>Dijital hizmet, ödemenin onaylanmasının ardından Müşteri'nin hesabına anında tanımlanır ve abonelik süresi boyunca kesintisiz sunulur.</p>

      <h2>5. Cayma Hakkı</h2>
      <p>Mesafeli Sözleşmeler Yönetmeliği md. 15/1-ğ uyarınca, elektronik ortamda anında ifa edilen ve gayri maddi mallara (dijital içerik/yazılım hizmeti) ilişkin sözleşmelerde, hizmetin ifasına başlanması ile cayma hakkı kullanılamaz. Müşteri, satın alma esnasında bu hususu onaylar. 7 günlük ücretsiz deneme süresi, satın alma öncesi değerlendirme imkânı sunar.</p>

      <h2>6. İptal ve İade</h2>
      <p>İptal ve iade koşulları için <a href="/iade-iptal">İptal & İade Koşulları</a> sayfasına bakınız.</p>

      <h2>7. Yetkili Mahkeme</h2>
      <p>İşbu sözleşmeden doğabilecek uyuşmazlıklarda, Gümrük ve Ticaret Bakanlığı'nca belirlenen parasal sınırlar dâhilinde Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.</p>

      <p className="text-sm text-slate-400">Not: Bu metin genel bir şablondur; resmi kullanımdan önce hukuk danışmanınızca şirketinize özel düzenlenmelidir.</p>
    </PublicPage>
  );
}
