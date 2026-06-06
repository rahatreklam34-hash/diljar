import PublicPage from '../components/PublicPage';

export default function IadeIptal() {
  return (
    <PublicPage title="İptal & İade Koşulları">
      <h2>Genel</h2>
      <p>FinansTakip dijital bir abonelik hizmetidir. Aşağıdaki koşullar, abonelik iptali ve iade taleplerini düzenler.</p>

      <h2>Ücretsiz Deneme</h2>
      <p>Yeni üyelere 7 gün ücretsiz deneme sunulur. Deneme süresi boyunca herhangi bir ücret alınmaz; bu süre, hizmeti satın almadan önce değerlendirme imkânı sağlar.</p>

      <h2>Abonelik İptali</h2>
      <ul>
        <li>Aboneliğinizi dilediğiniz zaman iptal edebilirsiniz.</li>
        <li>İptal talebinizi <a href="mailto:destek@diljar.com">destek@diljar.com</a> adresinden veya panel içi Destek Merkezi'nden iletebilirsiniz.</li>
        <li>İptal sonrası mevcut ödenmiş dönem sonuna kadar hizmet devam eder; dönem sonunda yenileme yapılmaz.</li>
      </ul>

      <h2>İade Koşulları</h2>
      <ul>
        <li>Dijital hizmetin ifasına başlandıktan (abonelik aktifleştirildikten) sonra, kullanılan dönem için iade yapılmaz.</li>
        <li>Yanlışlıkla yapılan mükerrer ödemeler veya hizmetin hiç sunulamadığı durumlarda, talebiniz incelenerek uygun bulunması hâlinde iade gerçekleştirilir.</li>
        <li>Onaylanan iadeler, ödemenin yapıldığı yönteme (kart/havale) <strong>genellikle 7-14 iş günü</strong> içinde yapılır. Kart iadelerinde bankanıza yansıma süresi değişebilir.</li>
      </ul>

      <h2>İade Talebi Nasıl Yapılır?</h2>
      <p>İade talebinizde firma adınızı, kayıtlı e-postanızı ve ödeme tarihini belirterek <a href="mailto:destek@diljar.com">destek@diljar.com</a> adresine yazınız. Talepler en geç 14 gün içinde sonuçlandırılır.</p>

      <p className="text-sm text-slate-400">Not: Bu koşullar genel bir şablondur; resmi kullanımdan önce hukuk danışmanınızca düzenlenmelidir.</p>
    </PublicPage>
  );
}
