import PublicPage from '../components/PublicPage';

export default function Hakkimizda() {
  return (
    <PublicPage title="Hakkımızda" subtitle="FinansTakip & WTech Yazılım A.Ş.">
      <p>FinansTakip, küçük ve orta ölçekli işletmelerin finansal süreçlerini sadeleştirmek için WTech Yazılım A.Ş. tarafından geliştirilen bulut tabanlı bir finans takip platformudur.</p>
      <h2>Misyonumuz</h2>
      <p>Karmaşık muhasebe yazılımlarına ihtiyaç duymadan; cari hesap, çek, kasa-banka, personel ve nakit akışı yönetimini tek bir modern panelde toplayarak işletmelerin finansal kontrolünü güçlendirmek.</p>
      <h2>Neler Sunuyoruz?</h2>
      <ul>
        <li>Cari hesap ve alış-satış / ödeme-tahsilat takibi</li>
        <li>Gelir-gider ve nakit akışı analizi</li>
        <li>Çek ve senet vade yönetimi</li>
        <li>Kasa, banka ve kredi kartı bakiye takibi</li>
        <li>Personel maaş, avans ve yan hak hesaplamaları</li>
        <li>Grafik destekli finansal raporlar</li>
      </ul>
      <h2>Neden FinansTakip?</h2>
      <p>Web tabanlı yapısı sayesinde dilediğiniz cihazdan, her yerden erişebilir; verileriniz güvenli sunucularda saklanır. 7 gün boyunca tüm özellikleri ücretsiz deneyebilirsiniz.</p>
      <h2>Kurumsal Bilgiler</h2>
      <ul>
        <li><strong>Ünvan:</strong> WTech Yazılım Anonim Şirketi</li>
        <li><strong>E-posta:</strong> destek@diljar.com</li>
        <li><strong>Adres:</strong> [Şirket adresi]</li>
        <li><strong>MERSİS No:</strong> [MERSİS numarası]</li>
      </ul>
      <p className="text-sm text-slate-400">Not: Köşeli parantez içindeki kurumsal bilgiler, resmi belgelerinize göre güncellenmelidir.</p>
    </PublicPage>
  );
}
