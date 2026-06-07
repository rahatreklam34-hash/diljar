# Diljar — Çalışma ve Kurulum Rehberi

Bu dosya, **hangi bilgisayarda olursan ol kaldığın yerden devam edebilmen** için hazırlandı.
Aklında tek bir cümle kalsın: **Her şeyin tek merkezi GitHub'dır.**

- **GitHub deposu:** https://github.com/rahatreklam34-hash/diljar
- **Sunucu klasörü:** `/var/www/finanstakip`
- **Servis adı (pm2):** `finanstakip-api`
- **Veritabanı:** PostgreSQL — `finanstakip`

---

## 1) Çalışma mantığı (en önemli kısım)

```
   [Bilgisayar A]  ─push→   ┌──────────┐   ←pull─  [Bilgisayar B]
                            │  GitHub  │
   [Sunucu]       ←pull──   └──────────┘
```

- Kod nerede değiştirilirse değiştirilsin, **GitHub'a `push`** edilir.
- Başka bir bilgisayara/sunucuya geçince **GitHub'dan `pull`** edilir.
- Böylece kod asla kaybolmaz, "ne nerede" sorunu yaşanmaz.

> Kural: İşin bitince **mutlaka push et**. Yeni makinede başlarken **mutlaka pull et**.

---

## 2) Yeni bir bilgisayarda sıfırdan başlama

### a) Gerekli programlar (bir kez kurulur)
- **Git:** https://git-scm.com/download/win
- **Node.js (LTS):** https://nodejs.org
- **Verdent** (kullandığın editör/eklenti)

### b) Projeyi GitHub'dan al
Bir klasör aç ve:
```bash
git clone https://github.com/rahatreklam34-hash/diljar.git
cd diljar
npm install
```
Artık proje bu bilgisayarda hazır. Verdent'i bu `diljar` klasöründe aç.

### c) Çalışmaya başlamadan önce (her seferinde)
```bash
git pull
```
Bu, diğer bilgisayarda/sunucuda yaptığın en son değişiklikleri getirir.

### d) İşin bitince (her seferinde)
Verdent zaten senin için commit + push yapıyor. Emin olmak istersen:
```bash
git status      # değişiklik var mı
git push        # GitHub'a gönder
```

---

## 2.5) Yeni bilgisayardan SUNUCUYA SSH erişimi (önemli)

Verdent'in canlı sunucuda (`diljar.com`) işlem yapabilmesi için, o bilgisayarın
sunucu tarafından **tanınması** gerekir. Her yeni bilgisayarda **bir kez** kurulur,
sonra o bilgisayar sürekli erişir.

### En kolay yol (Verdent yapar)
1. Yeni bilgisayarda Verdent'i `diljar` klasöründe aç.
2. Verdent'e şunu yaz: **"diğer bilgisayardayım, sunucuya bağlan"**
3. Verdent yeni bir SSH anahtarı üretir ve sana **tek satırlık bir komut** verir.
4. O komutu, hosting/VPS panelinin **Console / Web Terminal** bölümüne yapıştır, Enter'a bas.
5. `EKLENDI_TAMAM` görünce Verdent'e "eklendi" de. Bağlanır, devam eder.

### Alternatif (anahtarı taşı — console'a hiç girmeden)
İlk kurduğun bilgisayardaki `C:\Users\<kullanıcı>\.ssh\` klasöründeki
`id_ed25519` ve `id_ed25519.pub` dosyalarını, yeni bilgisayarda aynı yere kopyala.
Sunucu bu anahtarı zaten tanıdığı için tekrar console'a girmen gerekmez.
> `id_ed25519` (uzantısız) **gizli anahtardır** — kimseyle paylaşma, sadece kendi bilgisayarlarına koy.

---

## 3) Sunucuyu güncelleme (canlı siteyi yenileme)

Verdent kodu GitHub'a gönderdikten sonra, **canlı sitede görünmesi için** sunucuda
tek komut çalıştırman yeterli:

```bash
cd /var/www/finanstakip && bash deploy/update.sh
```

Bu script otomatik olarak: kodu çeker → bağımlılıkları kurar → veritabanını eşitler →
derler → servisi yeniden başlatır. Sonunda "GUNCELLEME TAMAM" yazar.

> Güncelleme sonrası tarayıcıda **Ctrl + F5** yapmayı unutma.

---

## 4) Tek seferlik: SaaS → Bireysel mod geçişi

Kiralama/abonelik (SaaS) katmanını kaldırdık. Veritabanını da buna uyarlamak için
**sadece bir kez** şu komutu çalıştır (önce otomatik yedek alır):

```bash
cd /var/www/finanstakip && bash deploy/bireysel-gecis.sh
```

Bu bittikten sonra, bundan böyle hep `deploy/update.sh` kullanılır.

---

## 5) Sık karşılaşılan durumlar

- **"git pull şifre/token istiyor":** Depo herkese açık (public) olduğu sürece istemez.
  Özelse, GitHub Personal Access Token gerekir.
- **"Değişiklik yaptım ama canlıda yok":** Sunucuda `deploy/update.sh` çalıştırmayı veya
  tarayıcıda Ctrl+F5 yapmayı unutmuş olabilirsin.
- **"Hangi commit'teyim?":** `git log -1 --oneline` son sürümü gösterir.
- **Yedekler:** Sunucuda `/root/diljar-yedek/` (geçiş yedeği) ve `backup.sh` (günlük yedek).

---

## 6) Hızlı komut özeti

| Amaç | Komut |
|------|-------|
| Yeni makinede projeyi al | `git clone https://github.com/rahatreklam34-hash/diljar.git` |
| Son değişiklikleri çek | `git pull` |
| Değişiklikleri gönder | `git push` |
| Sunucuyu güncelle | `cd /var/www/finanstakip && bash deploy/update.sh` |
| Bireysel moda geçiş (tek sefer) | `cd /var/www/finanstakip && bash deploy/bireysel-gecis.sh` |
| Son sürümü gör | `git log -1 --oneline` |
