export interface CariHesap {
  id: string;
  ad: string;
  bakiye: number;
  paraCinsi: string;
  telefon?: string;
  email?: string;
  adres?: string;
  createdAt: string;
  sonHareketTarihi?: string;
}

export interface CariHareket {
  id: string;
  cariHesapId: string;
  tarih: string;
  saat: string;
  aciklama: string;
  tutar: number;
  tip: 'alis_fatura' | 'satis_fatura' | 'odeme' | 'tahsilat' | 'iade_al' | 'iade_ver';
  createdAt: string;
  cekId?: string;
}

export interface Hareket {
  id: string;
  tarih: string;
  saat: string;
  aciklama: string;
  tutar: number;
  tip: 'gelir' | 'gider';
  kategori: string;
  cariHesapId?: string;
  kasaBankaId?: string;
  createdAt: string;
}

export interface KasaBanka {
  id: string;
  ad: string;
  tip: 'kasa' | 'banka';
  bakiye: number;
  paraCinsi: string;
  iban?: string;
}

export interface KrediKarti {
  id: string;
  ad: string;
  limit: number;
  borc: number;
  kartNo?: string;
  sonOdemeTarihi?: string;
  createdAt: string;
}

export interface BirikimHesabi {
  id: string;
  ad: string;
  bakiye: number;
  paraCinsi: string;
  iban?: string;
  createdAt: string;
}

export interface Cek {
  id: string;
  kisiAd: string;
  kesideci?: string;
  tutar: number;
  vadeTarihi: string;
  durum: 'bekleyen' | 'tahsil_edilen' | 'geciken';
  tip: 'alacak' | 'borc';
  aciklama?: string;
  createdAt: string;
  cariHesapId?: string;
}

export interface Personel {
  id: string;
  ad: string;
  email?: string;
  pozisyon: string;
  departman: string;
  cinsiyet: 'erkek' | 'kadin';
  maas: number;
  telefon?: string;
  baslangicTarihi: string;
  odemeTarihi: number; // gun (1-28)
  sskPrim: number;
  yemekUcreti: number;
  yolUcreti: number;
  durum: 'aktif' | 'izinli' | 'pasif';
  createdAt: string;
}

export interface PersonelHareket {
  id: string;
  personelId: string;
  tarih: string;
  saat: string;
  tip: 'maas' | 'avans' | 'urun' | 'ssk' | 'yemek' | 'yol' | 'prim' | 'ikramiye' | 'izin' | 'mesai' | 'ek_odeme';
  aciklama: string;
  tutar: number;
  createdAt: string;
}

export interface Odeme {
  id: string;
  kisiAd: string;
  tutar: number;
  vadeTarihi: string;
  tip: string;
}

export interface DuzenliOdeme {
  id: string;
  ad: string;
  kategori: string;
  tutar: number;
  sabitTutar: boolean; // true: her ay ayni, false: her seferinde girilir
  periyot: 'aylik' | 'haftalik' | 'yillik';
  odemeGunu: number; // 1-28
  sonOdemeTarihi?: string;
  durum: 'aktif' | 'pasif';
  hatirlatmaGun: number; // kac gun once hatirlatilsin
  aciklama?: string;
  createdAt: string;
}

export interface EmanetPara {
  id: string;
  kisiAd: string;
  tutar: number;
  alisTarihi: string;
  odemeTarihi?: string;
  durum: 'aktif' | 'odendi';
  aciklama?: string;
  createdAt: string;
}

export interface Hedef {
  id: string;
  ad: string;
  hedefTutar: number;
  mevcutTutar: number;
  bitisTarihi: string;
  kategori: string;
  durum: 'aktif' | 'tamamlandi';
  createdAt: string;
}

export interface SistemLog {
  id: string;
  tarih: string;
  saat: string;
  modul: string;
  islem: string;
  detay: string;
  createdAt: string;
}

export type ParaCinsi = 'TRY' | 'USD' | 'EUR' | 'GBP';

export const paraCinsleri: { value: ParaCinsi; label: string; symbol: string }[] = [
  { value: 'TRY', label: 'Turk Lirasi', symbol: '₺' },
  { value: 'USD', label: 'ABD Dolari', symbol: '$' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
  { value: 'GBP', label: 'Ingiliz Sterlini', symbol: '£' },
];

export const giderKategorileri = [
  'Kira', 'Maas', 'Fatura', 'Malzeme', 'Ulasim', 'Yemek', 'Bakim', 'Reklam', 'Vergi', 'Sigorta', 'Diger'
];
