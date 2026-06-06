import PublicPage from '../components/PublicPage';

export default function KVKK() {
  return (
    <PublicPage title="KVKK Aydınlatma Metni" subtitle="6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında">
      <h2>1. Veri Sorumlusu</h2>
      <p>İşbu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, veri sorumlusu sıfatıyla <strong>WTech Yazılım A.Ş.</strong> ("Şirket") tarafından hazırlanmıştır.</p>

      <h2>2. İşlenen Kişisel Veriler</h2>
      <ul>
        <li>Kimlik bilgileri (ad, soyad)</li>
        <li>İletişim bilgileri (e-posta, telefon, firma adı)</li>
        <li>Müşteri işlem bilgileri (abonelik, ödeme kayıtları)</li>
        <li>İşletmenize ait, platforma girdiğiniz finansal veriler</li>
        <li>İşlem güvenliği bilgileri (IP, oturum kayıtları, log kayıtları)</li>
      </ul>

      <h2>3. Kişisel Verilerin İşlenme Amaçları</h2>
      <ul>
        <li>Üyelik ve abonelik süreçlerinin yürütülmesi</li>
        <li>Hizmetin sunulması, geliştirilmesi ve teknik destek sağlanması</li>
        <li>Sözleşme ve yasal yükümlülüklerin yerine getirilmesi</li>
        <li>Ödeme ve faturalandırma işlemlerinin gerçekleştirilmesi</li>
        <li>Bilgi güvenliğinin sağlanması ve suistimallerin önlenmesi</li>
      </ul>

      <h2>4. Verilerin Aktarılması</h2>
      <p>Kişisel verileriniz, yalnızca yukarıdaki amaçlarla sınırlı olmak üzere; ödeme kuruluşları, barındırma (hosting) hizmet sağlayıcıları ve yasal olarak yetkili kamu kurumları ile KVKK'nın 8. ve 9. maddelerine uygun şekilde paylaşılabilir.</p>

      <h2>5. Veri Toplama Yöntemi ve Hukuki Sebep</h2>
      <p>Verileriniz; web sitesi, kayıt formu ve uygulama kullanımınız aracılığıyla elektronik ortamda, KVKK md. 5/2'de yer alan sözleşmenin kurulması/ifası ve meşru menfaat hukuki sebeplerine dayanılarak toplanır.</p>

      <h2>6. İlgili Kişinin Hakları (KVKK md. 11)</h2>
      <ul>
        <li>Kişisel verilerinizin işlenip işlenmediğini öğrenme</li>
        <li>İşlenmişse buna ilişkin bilgi talep etme</li>
        <li>Eksik/yanlış işlenmişse düzeltilmesini isteme</li>
        <li>Silinmesini veya yok edilmesini talep etme</li>
        <li>İşlemeye itiraz etme ve zararın giderilmesini talep etme</li>
      </ul>
      <p>Taleplerinizi <a href="mailto:destek@diljar.com">destek@diljar.com</a> adresine iletebilirsiniz. Başvurularınız en geç 30 gün içinde sonuçlandırılır.</p>

      <p className="text-sm text-slate-400">Not: Bu metin genel bir şablondur; resmi kullanımdan önce bir hukuk danışmanı tarafından şirketinize özel olarak gözden geçirilmesi önerilir.</p>
    </PublicPage>
  );
}
