import PublicPage from '../components/PublicPage';

export default function Gizlilik() {
  return (
    <PublicPage title="Gizlilik ve Güvenlik Politikası">
      <p>WTech Yazılım A.Ş. olarak kullanıcılarımızın gizliliğine ve verilerinin güvenliğine büyük önem veriyoruz. Bu politika, FinansTakip hizmetini kullanırken bilgilerinizin nasıl korunduğunu açıklar.</p>

      <h2>Toplanan Bilgiler</h2>
      <p>Hesap oluştururken ad-soyad, firma adı, e-posta ve telefon bilgilerinizi; hizmeti kullanırken işletmenize ait finansal kayıtları toplarız.</p>

      <h2>Bilgilerin Kullanımı</h2>
      <p>Bilgileriniz yalnızca hizmetin sunulması, hesabınızın yönetilmesi, ödeme süreçleri ve yasal yükümlülükler için kullanılır. Verileriniz üçüncü taraflara pazarlama amacıyla satılmaz.</p>

      <h2>Ödeme Güvenliği</h2>
      <p>Tüm ödeme işlemleri, 3D Secure destekli sanal POS altyapısı üzerinden gerçekleştirilir. Kart bilgileriniz sunucularımızda saklanmaz; ödeme kuruluşunun güvenli altyapısında işlenir. Site genelinde 256-bit SSL şifrelemesi kullanılır.</p>

      <h2>Çerezler (Cookies)</h2>
      <p>Oturum yönetimi ve deneyiminizi iyileştirmek için zorunlu çerezler kullanılır. Tarayıcı ayarlarınızdan çerez tercihlerinizi yönetebilirsiniz.</p>

      <h2>Veri Saklama ve Güvenlik</h2>
      <ul>
        <li>Veriler güvenli sunucularda, erişim kontrolleriyle saklanır.</li>
        <li>Düzenli yedekleme yapılır.</li>
        <li>Şifreler geri döndürülemez şekilde (hash) saklanır.</li>
      </ul>

      <h2>İletişim</h2>
      <p>Gizlilikle ilgili sorularınız için: <a href="mailto:destek@diljar.com">destek@diljar.com</a></p>
    </PublicPage>
  );
}
