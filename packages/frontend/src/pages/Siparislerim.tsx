import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUrlState } from '../lib/useUrlState';
import { Plus, Trash2, X, Link2, MessageCircle, Wallet, Users, Receipt, Search, MoreVertical, FileText, Pencil, Truck, Ticket, Check, CreditCard, Banknote, Building2, Clock, Tag, MapPin, RefreshCw, FileSpreadsheet, Upload, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, CheckCircle, AlertCircle, Ban, ShoppingBag, Package, TrendingUp, TrendingDown, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { openChat } from '../components/ChatDock';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KANAL: Record<string, string> = { online: 'Online Mağaza', canli: 'Canlı Yayın', manuel: 'Manuel' };

// Sepet linki + mağaza IBAN bilgileri + ödeme dekontu notu birleştirilmiş kopyalama metni
export function buildSepetCopyText(link: string, ss: any): string {
  let txt = link;
  const banka = (ss?.bankaAd || '').trim();
  const iban = (ss?.iban || '').trim();
  const sahip = (ss?.hesapSahibi || '').trim();
  if (banka || iban || sahip) {
    txt += '\n\nÖdeme Bilgileri';
    if (banka) txt += `\nBanka: ${banka}`;
    if (iban) txt += `\nIBAN: ${iban}`;
    if (sahip) txt += `\nHesap Sahibi: ${sahip}`;
    txt += '\n\nÖdeme dekontu iletir misiniz lütfen.';
  }
  return txt;
}

const STATUSES = [
  { key: 'sepet', t: 'Açık Sepetler', short: 'Açık Sepet', c: 'bg-rose-100 text-rose-600' },
  { key: 'hazirlaniyor', t: 'Hazırlanıyor', short: 'Hazırlanıyor', c: 'bg-blue-100 text-blue-700' },
  { key: 'yeni', t: 'Kargo Beklemede', short: 'Kargo Beklemede', c: 'bg-amber-100 text-amber-700' },
  { key: 'kargoda', t: 'Kargoda', short: 'Kargoda', c: 'bg-sky-100 text-sky-700' },
  { key: 'teslim', t: 'Teslim Edildi', short: 'Teslim Edildi', c: 'bg-green-100 text-green-700' },
  { key: 'iptal', t: 'İptal Edilen', short: 'İptal', c: 'bg-red-100 text-red-700' },
  { key: 'kapali', t: 'Kapalı Sepetler', short: 'Kapalı Sepet', c: 'bg-slate-100 text-slate-500' },
];
const STMAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));

const KARGO_BRAND: Record<string, { bg: string; kisa: string }> = {
  'Yurtiçi Kargo': { bg: 'bg-orange-500', kisa: 'YK' },
  'Aras Kargo': { bg: 'bg-blue-600', kisa: 'AR' },
  'Sürat Kargo': { bg: 'bg-red-600', kisa: 'SK' },
  'MNG Kargo': { bg: 'bg-amber-500', kisa: 'MNG' },
  'PTT Kargo': { bg: 'bg-yellow-500', kisa: 'PTT' },
  'DHL': { bg: 'bg-yellow-400', kisa: 'DHL' },
};
const KARGO_FIRMALAR = Object.keys(KARGO_BRAND);
function KargoLogo({ firma }: { firma: string }) {
  const b = KARGO_BRAND[firma] || { bg: 'bg-slate-400', kisa: '?' };
  return <div className={`w-12 h-12 rounded-xl ${b.bg} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm`}>{b.kisa}</div>;
}
const siparisNo = (id: string) => '#SIP' + id.slice(-5).toUpperCase();
// PDF yazdırılmış siparişleri yerel olarak işaretle (liste yanında minimal rozet için)
const PDF_PRINTED_KEY = 'pdfPrintedOrders';
function getPdfPrinted(): string[] { try { return JSON.parse(localStorage.getItem(PDF_PRINTED_KEY) || '[]'); } catch { return []; } }
function markPdfPrinted(id: string) { try { const s = getPdfPrinted(); if (!s.includes(id)) { s.push(id); localStorage.setItem(PDF_PRINTED_KEY, JSON.stringify(s)); } } catch {} }
const orderLabel = (o: any) => o?.sipNo || (o?.orderNo ? `${o.orderYil || new Date(o.createdAt).getFullYear()}-${String(o.orderNo).padStart(3, '0')}` : siparisNo(o.id));
const initials = (ad: string) => (ad || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const waLink = (tel: string) => { let d = (tel || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '90' + d.slice(1); else if (d.length === 10) d = '90' + d; return 'https://wa.me/' + d; };
// Adres bilgisi eksik: teslimat adresi/il/ilçe tamamen boş ve sipariş iptal/kapalı değil
const adresEksik = (o: any) => {
  if (['iptal', 'kapali', 'kapandi'].includes(o?.durum)) return false;
  const a = (o?.adres || '').trim(), il = (o?.il || '').trim(), ilce = (o?.ilce || '').trim();
  return !a && !il && !ilce;
};

// Code128B SVG barkod üreteci (modül seviyesinde — hem etiket hem PDF kullanır)
export function code128Svg(text: string, height = 80): string {
  const START = 104;
  const chars = text.split('').map(c => c.charCodeAt(0) - 32);
  let checksum = START;
  chars.forEach((v, i) => { checksum += v * (i + 1); });
  const all = [START, ...chars, checksum % 103, 106];
  const TABLE = '11011001100,11001101100,11001100110,10010011000,10010001100,10001001100,10011001000,10011000100,10001100100,11001001000,11001000100,11000100100,10110011100,10011011100,10011001110,10111001100,10011101100,10011100110,11001110010,11001011100,11001001110,11011100100,11001110100,11100101100,11100100110,11101100100,11100110100,11100110010,11011011000,11011000110,11000110110,10100011000,10001011000,10001000110,10110001000,10001101000,10001100010,11010001000,11000101000,11000100010,10110111000,10110001110,10001101110,10111011000,10111000110,10001110110,11101110110,11010001110,11000101110,11011101000,11011100010,11000111010,11101011000,11101000110,11100010110,11101101000,11101100010,11100011010,11101111010,11001000010,11110001010,10100110000,10100001100,10010110000,10010000110,10000101100,10000100110,10110010000,10110000100,10011010000,10011000010,10000110100,10000110010,11000010010,11001010000,11110111010,11000010100,10001111010,10100111100,10010111100,10010011110,10111100100,10011110100,10011110010,11110100100,11110010100,11110010010,11011011110,11011110110,11110110110,10101111000,10100011110,10001011110,10111101000,10111100010,11110101000,11110100010,10111011110,10111101110,11101011110,11110101110,11010000100,11010010000,11010011100,1100011101011'.split(',');
  const bars = all.map(v => TABLE[v]).join('');
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bars.length * 2}" height="${height}">`;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] === '1') svg += `<rect x="${i * 2}" y="0" width="2" height="${height}" fill="black"/>`;
  }
  svg += '</svg>';
  return svg;
}

// Kargo barkod etiketi yazdırma — Code128 font yerine SVG barkod
export function printCargoBarcode(cargoKey: string, aliciAd: string, adresBilgi: string) {
  const barcodeSvg = code128Svg(cargoKey);
  const w = window.open('', '_blank', 'width=400,height=350');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Kargo Barkod — ${cargoKey}</title><style>
    @page { size: 100mm 60mm; margin: 3mm; }
    body { font-family: Arial, sans-serif; text-align: center; padding: 10px; margin: 0; }
    .key { font-size: 22px; font-weight: bold; letter-spacing: 3px; margin: 6px 0; }
    .info { font-size: 11px; color: #555; margin: 4px 0; }
    .barcode { margin: 8px auto; }
    @media print { button { display: none !important; } }
  </style></head><body>
    <div class="key">${cargoKey}</div>
    <div class="barcode">${barcodeSvg}</div>
    <div class="info">${aliciAd}</div>
    <div class="info">${adresBilgi}</div>
    <br/>
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;">Yazdır</button>
  </body></html>`);
  w.document.close();
}

export default function Siparislerim({ kanalFilter, talepMode }: { kanalFilter?: 'online' | 'canli'; talepMode?: boolean }) {
  const { orders, customers, products, categories, discountCodes, campaigns, storeSetting, reload } = useStore();
  const { isOwner, user } = useAuth();
  // Sipariş durumunu değiştirme yetkisi: yalnız PATRON ve ünvanı YÖNETİCİ olanlar
  const canChgDurum = isOwner || user?.unvan === 'YONETICI';
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) => setSelIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkSetDurum = async (durum: string) => {
    if (!durum || selIds.size === 0) return;
    let ids = Array.from(selIds);
    let atlanan = 0;
    // Adres bilgisi eksik siparişler HAZIRLANIYOR'a alınmaz
    if (durum === 'hazirlaniyor') {
      const before = ids.length;
      ids = ids.filter((id) => { const o = orders.find((x: any) => x.id === id); return o && !adresEksik(o); });
      atlanan = before - ids.length;
    }
    if (ids.length === 0) { toast.error('Seçili siparişlerin adres bilgisi eksik; hazırlanıyora alınamadı.'); return; }
    if (!confirm(`${ids.length} siparişin durumu "${STATUSES.find((s) => s.key === durum)?.t || durum}" olarak değiştirilecek${atlanan ? ` (${atlanan} adres eksik sipariş atlandı)` : ''}. Onaylıyor musunuz?`)) return;
    let ok = 0;
    for (const id of ids) { try { await api.patch(`/store/orders/${id}`, { durum }); ok++; } catch { /* */ } }
    toast.success(`${ok}/${ids.length} sipariş güncellendi${atlanan ? ` · ${atlanan} adres eksik atlandı` : ''}`); setSelIds(new Set()); reload();
  };
  const [adresModal, setAdresModal] = useState(false);
  const [tab, setTab] = useUrlState<string>('tab', talepMode ? 'odeme_bekliyor' : 'tumu');
  const [page, setPage] = useUrlState('page', 1);
  const [search, setSearch] = useUrlState('q', '');
  // Arama debounce: input anlik (qInput), agir filtreleme + URL yazimi 300ms sonra (setSearch).
  // Boylece her tus vurusunda URL guncellenip tum sayfa re-render + O(orders*customers) filtre calismaz.
  const [qInput, setQInput] = useState(search);
  const qDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // URL'den gelen degisim (temizle/deep-link) input'a yansitilsin
  useEffect(() => { setQInput(search); }, [search]);
  const onSearchChange = (v: string) => {
    setQInput(v);
    if (qDebounceRef.current) clearTimeout(qDebounceRef.current);
    qDebounceRef.current = setTimeout(() => { setSearch(v); setPage(1); }, 300);
  };
  const clearSearch = () => { if (qDebounceRef.current) clearTimeout(qDebounceRef.current); setQInput(''); setSearch(''); setPage(1); };
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [modal, setModal] = useState(false);
  const [bankPanel, setBankPanel] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateRange, setDateRange] = useState<string>('all');
  const [odemeFilter, setOdemeFilter] = useUrlState<string>('odeme', 'all');
  const [custFilterId, setCustFilterId] = useState<string>('');
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [custSearch, setCustSearch] = useState('');

  // Müşteri O(1) lookup — her satır/filtre icin customers.find() lineer taramasini onler (arama kasmasinin kok nedeni)
  const custById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const cust = (id?: string) => (id ? custById.get(id) : undefined);
  const custName = (o: any) => cust(o.customerId)?.ad || o.musteriHandle || 'Misafir';
  const custPhone = (o: any) => cust(o.customerId)?.telefon || '';
  const custInsta = (o: any) => { const c = cust(o.customerId); const ig = c?.instagram || (o.musteriHandle && !c ? o.musteriHandle : ''); return ig ? String(ig).replace(/^@/, '') : ''; };
  const prodCost = useMemo(() => new Map(products.map((p) => [p.id, p.alisFiyat || 0])), [products]);

  const channelOrders = useMemo(() => orders.filter((o) => !kanalFilter || o.kanal === kanalFilter), [orders, kanalFilter]);

  // İptal hariç sipariş listesi (tümü tabı ve KPI'lar için)
  const activeOrders = useMemo(() => channelOrders.filter((o) => o.durum !== 'iptal'), [channelOrders]);

  // Kanonik ciro kapsamı: iptal hariç; canlı kanalda yalnızca KAYITLI (customerId var) sepetler dahil
  // (misafir canlı sepetler "Kayıt Gerekli" sayılır, ciroya girmez); canlı olmayan açık sepetler hariç.
  const inCiro = (o: any) => {
    if (o.durum === 'iptal') return false;
    if (o.kanal === 'canli') return !!o.customerId;
    return o.durum !== 'sepet';
  };
  const isKayitGerekli = (o: any) => o.kanal === 'canli' && !o.customerId && o.durum !== 'iptal';
  const kpi = useMemo(() => {
    const valid = channelOrders.filter(inCiro);
    const ciro = valid.reduce((s, o) => s + (o.toplam || 0), 0);
    const tahsilEdilen = valid.reduce((s, o) => s + (o.tahsilat || 0), 0);
    const odenmeyen = valid.reduce((s, o) => s + Math.max(0, (o.toplam || 0) - (o.tahsilat || 0)), 0);
    let kar = 0;
    for (const o of valid) {
      const cost = (o.items || []).reduce((x: number, it: any) => x + (prodCost.get(it.productId) || 0) * (it.adet || 1), 0);
      kar += (o.toplam || 0) - cost;
    }
    const aktifMusteri = new Set(channelOrders.map((o) => o.customerId).filter(Boolean)).size;
    return { ciro, tahsilEdilen, odenmeyen, kar, toplam: channelOrders.length, aktifMusteri };
  }, [channelOrders, prodCost]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { tumu: activeOrders.length };
    STATUSES.forEach((s) => { m[s.key] = channelOrders.filter((o) => o.durum === s.key).length; });
    // Tam Ödenmişler: hâlâ açık sepet durumunda olup borcu kalmayanlar (başka duruma geçmemiş)
    m['kapali'] = activeOrders.filter((o) => o.durum === 'sepet' && ((o.toplam || 0) - (o.tahsilat || 0)) <= 0.5).length;
    m['odeme_bekliyor'] = activeOrders.filter((o) => o.durum === 'sepet' && ((o.toplam || 0) - (o.tahsilat || 0)) > 0.5).length;
    m['odeme_bildirim'] = activeOrders.filter((o) => (o as any).odemeBildirim).length;
    m['kayit_gerekli'] = activeOrders.filter(isKayitGerekli).length;
    m['adres_eksik'] = activeOrders.filter(adresEksik).length;
    return m;
  }, [channelOrders, activeOrders]);

  const filtered = useMemo(() => {
    let list = tab === 'tumu' ? activeOrders
      : tab === 'odeme_bekliyor' ? activeOrders.filter((o) => o.durum === 'sepet' && ((o.toplam || 0) - (o.tahsilat || 0)) > 0.5)
      : tab === 'odeme_bildirim' ? activeOrders.filter((o) => (o as any).odemeBildirim)
      : tab === 'adres_eksik' ? activeOrders.filter(adresEksik)
      : tab === 'kayit_gerekli' ? activeOrders.filter(isKayitGerekli)
      : tab === 'kapali' ? activeOrders.filter((o) => o.durum === 'sepet' && ((o.toplam || 0) - (o.tahsilat || 0)) <= 0.5)
      : channelOrders.filter((o) => o.durum === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) => orderLabel(o).toLowerCase().includes(q) || siparisNo(o.id).toLowerCase().includes(q) || custName(o).toLowerCase().includes(q) || custPhone(o).includes(q) || custInsta(o).toLowerCase().includes(q));
    }
    if (custFilterId) list = list.filter((o) => o.customerId === custFilterId);
    if (dateRange !== 'all') {
      const now = Date.now();
      const span = dateRange === 'today' ? 1 : dateRange === '7' ? 7 : dateRange === '30' ? 30 : 365;
      const from = now - span * 24 * 60 * 60 * 1000;
      list = list.filter((o) => new Date(o.createdAt).getTime() >= from);
    }
    if (odemeFilter !== 'all') {
      list = list.filter((o) => {
        const kalan = (o.toplam || 0) - (o.tahsilat || 0);
        if (odemeFilter === 'odenen') return kalan <= 0.5;
        if (odemeFilter === 'kismi') return (o.tahsilat || 0) > 0.5 && kalan > 0.5;
        if (odemeFilter === 'odenmeyen') return (o.tahsilat || 0) <= 0.5;
        return true;
      });
    }
    return list;
  }, [channelOrders, activeOrders, tab, search, customers, custFilterId, dateRange, odemeFilter]);

  // Sıralama
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const toggleSort = (field: string) => { if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortField(field); setSortDir('desc'); } };
  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    return [...filtered].sort((a, b) => {
      let va: number, vb: number;
      if (sortField === 'toplam') { va = Number(a.toplam) || 0; vb = Number(b.toplam) || 0; }
      else if (sortField === 'tahsilat') { va = Number(a.tahsilat) || 0; vb = Number(b.tahsilat) || 0; }
      else if (sortField === 'kalan') { va = (Number(a.toplam) || 0) - (Number(a.tahsilat) || 0); vb = (Number(b.toplam) || 0) - (Number(b.tahsilat) || 0); }
      else if (sortField === 'tarih') { va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime(); }
      else if (sortField === 'adet') { va = (a.items || []).reduce((s: number, it: any) => s + (it.adet || 1), 0); vb = (b.items || []).reduce((s: number, it: any) => s + (it.adet || 1), 0); }
      else return 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const pageItems = sorted.slice((page - 1) * perPage, page * perPage);

  const setDurum = async (o: any, durum: string) => {
    setMenuId(null);
    const body: any = { durum };
    if (durum === 'iptal') body.iptalNedeni = confirm('Sipariş yetersiz stok nedeniyle mi iptal ediliyor?\n\nTamam = Yetersiz stok (stok SMS\'i gönderilir)\nİptal = Normal iptal') ? 'yetersiz_stok' : 'diger';
    try { await api.patch(`/store/orders/${o.id}`, body); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => { setMenuId(null); if (!confirm('Sipariş silinsin mi?')) return; try { await api.delete(`/store/orders/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const clearOdemeBildirim = async (o: any) => { try { await api.patch(`/store/orders/${o.id}`, { odemeBildirim: null, _log: 'Ödeme bildirimi etiketi kaldırıldı' }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const copyLink = (o: any) => { if (isKayitGerekli(o)) { toast.error('Kayıt gerekli — müşteri kaydı olmadan link paylaşılamaz'); return; } if (!o.token) { toast.error('Bu siparişin paylaşım linki yok'); return; } navigator.clipboard.writeText(buildSepetCopyText(`${window.location.origin}/sepet/${o.token}`, storeSetting)); toast.success('Sepet linki + ödeme bilgileri kopyalandı'); };
  const odemeTalep = (o: any) => {
    if (isKayitGerekli(o)) { toast.error('Kayıt gerekli — müşteri kaydı olmadan ödeme talebi gönderilemez'); return; }
    const link = o.token ? `${window.location.origin}/sepet/${o.token}` : '';
    const kalan = (o.toplam || 0) - (o.tahsilat || 0);
    const msg = `Merhaba, ${fmt(kalan)} tutarındaki siparişiniz için ödeme bağlantınız: ${link}`;
    const tel = custPhone(o);
    if (tel) window.open(waLink(tel) + '?text=' + encodeURIComponent(msg), '_blank');
    else { navigator.clipboard.writeText(msg); toast.success('Ödeme talebi kopyalandı'); }
  };
  const sohbet = (o: any) => { const tel = custPhone(o); if (tel) openChat(tel, custName(o)); else toast.error('Müşteri telefonu yok'); };

  // ── Yeni Siparis modali ──
  const [form, setForm] = useState<any>({ customerId: '', kanal: kanalFilter || 'manuel', items: [], indirimKodu: '', not: '' });
  const addItem = () => setForm((f: any) => ({ ...f, items: [...f.items, { productId: products[0]?.id || '', ad: products[0]?.ad || '', adet: 1, fiyat: products[0]?.satisFiyat || 0 }] }));
  const setItem = (i: number, patch: any) => setForm((f: any) => ({ ...f, items: f.items.map((it: any, idx: number) => idx === i ? { ...it, ...patch } : it) }));
  const delItem = (i: number) => setForm((f: any) => ({ ...f, items: f.items.filter((_: any, idx: number) => idx !== i) }));
  const onProduct = (i: number, pid: string) => { const p = products.find((x) => x.id === pid); setItem(i, { productId: pid, ad: p?.ad || '', fiyat: p?.satisFiyat || 0 }); };
  const araToplam = form.items.reduce((s: number, it: any) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 0), 0);
  const disc = discountCodes.find((d) => d.aktif && d.code === form.indirimKodu);
  const indirim = disc ? (disc.tip === 'yuzde' ? araToplam * disc.deger / 100 : disc.deger) : 0;
  const toplam = Math.max(0, araToplam - indirim);
  const saveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.items.length === 0) { toast.error('En az 1 ürün ekleyin'); return; }
    try { await api.post('/store/orders', { customerId: form.customerId || null, kanal: form.kanal, items: form.items, araToplam, indirim, toplam, durum: 'yeni', not: form.not || null }); toast.success('Sipariş oluşturuldu'); setModal(false); setForm({ customerId: '', kanal: kanalFilter || 'manuel', items: [], indirimKodu: '', not: '' }); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const title = talepMode ? 'Sipariş Talepleri' : kanalFilter === 'online' ? 'Online Mağaza Satışları' : kanalFilter === 'canli' ? 'Canlı Yayın Satışları' : 'Siparişlerim';

  return (
    <div>
      {/* Başlık */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          <p className="text-xs text-slate-400">Tüm siparişlerinizi listeleyin, filtreleyin ve yönetin.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setBankPanel(!bankPanel)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium border text-sm ${bankPanel ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}><FileSpreadsheet size={16} /> <span className="hidden sm:inline">Excel ile Ödeme İşle</span><span className="sm:hidden">Excel</span></button>
          <button onClick={() => { setModal(true); if (form.items.length === 0) addItem(); }} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-emerald-700 text-sm"><Plus size={16} /> <span className="hidden sm:inline">Yeni Sipariş</span><span className="sm:hidden">Yeni</span></button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-3">
        <KpiCard icon={Wallet} label="Toplam Ciro" value={fmt(kpi.ciro)} iconBg="bg-emerald-100 text-emerald-600" trend={kpi.ciro > 0 ? `%${(kpi.tahsilEdilen / kpi.ciro * 100).toFixed(1)}` : undefined} trendUp spark="#10b981" />
        <KpiCard icon={Check} label="Tahsil Edilen" value={fmt(kpi.tahsilEdilen)} valueColor="text-green-600" iconBg="bg-green-100 text-green-600" trend={kpi.ciro > 0 ? `%${(kpi.tahsilEdilen / kpi.ciro * 100).toFixed(1)}` : undefined} trendUp spark="#22c55e" />
        <KpiCard icon={Banknote} label="Ödenmeyen" value={fmt(kpi.odenmeyen)} valueColor="text-rose-600" iconBg="bg-rose-100 text-rose-600" trend={kpi.ciro > 0 ? `%${(kpi.odenmeyen / kpi.ciro * 100).toFixed(1)}` : undefined} spark="#f43f5e" />
        <KpiCard icon={Receipt} label="Toplam Sipariş" value={kpi.toplam} iconBg="bg-amber-100 text-amber-600" trend="%8,1" trendUp spark="#f59e0b" />
        <KpiCard icon={Users} label="Aktif Müşteri" value={kpi.aktifMusteri} iconBg="bg-sky-100 text-sky-600" trend="%6,4" trendUp spark="#0ea5e9" />
      </div>

      {bankPanel ? (
        <BankImportPanel orders={orders} orderLabel={orderLabel} onOpenDetail={setDetail} onBack={() => setBankPanel(false)} />
      ) : (<>
      {/* Sipariş Durumu başlık */}
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-semibold text-slate-700">Sipariş Durumu</h2>
        <button onClick={() => { setTab('tumu'); setPage(1); }} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"><SlidersHorizontal size={13} /> Durumları Yönet</button>
      </div>

      {/* Durum sekmeleri — kart şeridi */}
      <div className="flex items-stretch gap-2 mb-3 overflow-x-auto pb-1">
        <TabCard active={tab === 'tumu'} onClick={() => { setTab('tumu'); setPage(1); }} icon={Receipt} label="Tüm Siparişler" count={counts.tumu} color="slate" />
        <TabCard active={tab === 'sepet'} onClick={() => { setTab('sepet'); setPage(1); }} icon={ShoppingBag} label="Açık Sepetler" count={counts['sepet']} color="rose" />
        <TabCard active={tab === 'odeme_bekliyor'} onClick={() => { setTab('odeme_bekliyor'); setPage(1); }} icon={Clock} label="Ödeme Bekleyenler" count={counts['odeme_bekliyor']} color="amber" />
        <TabCard active={tab === 'kapali'} onClick={() => { setTab('kapali'); setPage(1); }} icon={CheckCircle} label="Tam Ödenmişler" count={counts['kapali']} color="green" />
        <TabCard active={tab === 'yeni'} onClick={() => { setTab('yeni'); setPage(1); }} icon={ShoppingBag} label="Kargo Beklemede" count={counts['yeni']} color="amber" />
        <TabCard active={tab === 'hazirlaniyor'} onClick={() => { setTab('hazirlaniyor'); setPage(1); }} icon={Package} label="Hazırlanıyor" count={counts['hazirlaniyor']} color="blue" />
        <TabCard active={tab === 'kargoda'} onClick={() => { setTab('kargoda'); setPage(1); }} icon={Truck} label="Kargolandı" count={counts['kargoda']} color="violet" />
        <TabCard active={tab === 'teslim'} onClick={() => { setTab('teslim'); setPage(1); }} icon={Check} label="Sipariş Kapandı" count={counts['teslim']} color="green" />
        <TabCard active={tab === 'adres_eksik'} onClick={() => { setTab('adres_eksik'); setPage(1); }} icon={MapPin} label="Adres Bilgisi Eksik" count={counts['adres_eksik']} color="rose" />
        {(!kanalFilter || kanalFilter === 'canli') && <TabCard active={tab === 'kayit_gerekli'} onClick={() => { setTab('kayit_gerekli'); setPage(1); }} icon={AlertCircle} label="Kayıt Gerekli" count={counts['kayit_gerekli']} color="amber" />}
        <TabCard active={tab === 'iptal'} onClick={() => { setTab('iptal'); setPage(1); }} icon={Ban} label="İptal Edilen" count={counts['iptal']} color="red" />
      </div>

      {/* Arama + Filtre çubuğu */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs group">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          <input value={qInput} onChange={(e) => onSearchChange(e.target.value)} placeholder="Sipariş No, Müşteri Ara..." className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all" />
          {qInput && <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={14} /></button>}
        </div>

        {/* Tarih Aralığı */}
        <div className="relative">
          <button onClick={() => setOpenFilter((v) => v === 'date' ? null : 'date')} className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${dateRange !== 'all' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Clock size={14} /> {({ all: 'Tarih Aralığı', today: 'Bugün', '7': 'Son 7 Gün', '30': 'Son 30 Gün' } as any)[dateRange]} <ChevronDown size={13} /></button>
          {openFilter === 'date' && (<>
            <div className="fixed inset-0 z-[90]" onClick={() => setOpenFilter(null)} />
            <div className="absolute left-0 mt-1.5 z-[95] w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 animate-[fadeIn_.12s_ease]">
              {([['all', 'Tüm Zamanlar'], ['today', 'Bugün'], ['7', 'Son 7 Gün'], ['30', 'Son 30 Gün']] as [string, string][]).map(([k, l]) => (
                <button key={k} onClick={() => { setDateRange(k); setPage(1); setOpenFilter(null); }} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${dateRange === k ? 'text-emerald-600 font-medium' : 'text-slate-600'}`}>{l}</button>
              ))}
            </div>
          </>)}
        </div>

        {/* Müşteri */}
        <div className="relative">
          <button onClick={() => setOpenFilter((v) => v === 'cust' ? null : 'cust')} className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${custFilterId ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Users size={14} /> {custFilterId ? (cust(custFilterId)?.ad || 'Müşteri') : 'Müşteri'} <ChevronDown size={13} /></button>
          {openFilter === 'cust' && (<>
            <div className="fixed inset-0 z-[90]" onClick={() => setOpenFilter(null)} />
            <div className="absolute left-0 mt-1.5 z-[95] w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 animate-[fadeIn_.12s_ease]">
              <input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Müşteri ara..." className="w-full px-2.5 py-1.5 mb-1 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-100" />
              <div className="max-h-56 overflow-y-auto">
                <button onClick={() => { setCustFilterId(''); setPage(1); setOpenFilter(null); }} className={`w-full text-left px-2.5 py-1.5 text-sm rounded-lg hover:bg-slate-50 ${!custFilterId ? 'text-emerald-600 font-medium' : 'text-slate-600'}`}>Tüm Müşteriler</button>
                {customers.filter((c) => !custSearch || (c.ad || '').toLowerCase().includes(custSearch.toLowerCase())).slice(0, 50).map((c) => (
                  <button key={c.id} onClick={() => { setCustFilterId(c.id); setPage(1); setOpenFilter(null); }} className={`w-full text-left px-2.5 py-1.5 text-sm rounded-lg hover:bg-slate-50 truncate ${custFilterId === c.id ? 'text-emerald-600 font-medium' : 'text-slate-600'}`}>{c.ad}</button>
                ))}
              </div>
            </div>
          </>)}
        </div>

        {/* Ödeme Yöntemi */}
        <div className="relative">
          <button onClick={() => setOpenFilter((v) => v === 'odeme' ? null : 'odeme')} className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors ${odemeFilter !== 'all' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Banknote size={14} /> {({ all: 'Ödeme Durumu', odenen: 'Ödenenler', kismi: 'Kısmi Ödenenler', odenmeyen: 'Ödenmeyenler' } as any)[odemeFilter]} <ChevronDown size={13} /></button>
          {openFilter === 'odeme' && (<>
            <div className="fixed inset-0 z-[90]" onClick={() => setOpenFilter(null)} />
            <div className="absolute left-0 mt-1.5 z-[95] w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 animate-[fadeIn_.12s_ease]">
              {([['all', 'Tümü'], ['odenen', 'Ödenenler'], ['kismi', 'Kısmi Ödenenler'], ['odenmeyen', 'Ödenmeyenler']] as [string, string][]).map(([k, l]) => (
                <button key={k} onClick={() => { setOdemeFilter(k); setPage(1); setOpenFilter(null); }} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${odemeFilter === k ? 'text-emerald-600 font-medium' : 'text-slate-600'}`}>{l}</button>
              ))}
            </div>
          </>)}
        </div>

        {/* Filtreleri Temizle */}
        {(tab !== 'tumu' || dateRange !== 'all' || custFilterId || odemeFilter !== 'all' || qInput) && (
          <button onClick={() => { setTab('tumu'); setDateRange('all'); setCustFilterId(''); setOdemeFilter('all'); clearSearch(); setPage(1); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"><RefreshCw size={14} /> Filtreleri Temizle</button>
        )}

        {/* Sırala */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-slate-400 hidden sm:inline">Sırala:</span>
          <select value={`${sortField || 'tarih'}_${sortDir}`} onChange={(e) => { const [f, d] = e.target.value.split('_'); setSortField(f); setSortDir(d as 'asc' | 'desc'); }} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 outline-none focus:ring-2 focus:ring-emerald-100 cursor-pointer">
            <option value="tarih_desc">Tarihe (Yeniden - Eskiye)</option>
            <option value="tarih_asc">Tarihe (Eskiden - Yeniye)</option>
            <option value="toplam_desc">Tutara (Yüksekten - Düşüğe)</option>
            <option value="toplam_asc">Tutara (Düşükten - Yükseğe)</option>
            <option value="kalan_desc">Kalan Bakiyeye (Çok - Az)</option>
            <option value="adet_desc">Ürün Adedine (Çok - Az)</option>
          </select>
        </div>
      </div>

      {/* Tablo */}
      {tab === 'adres_eksik' && (
        <div className="mb-2 flex items-center gap-2">
          <button onClick={() => setAdresModal(true)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700"><MapPin size={15} /> Adres Bilgisi Talebi Gönder</button>
          <span className="text-xs text-slate-400">Adresi eksik ve telefonu olan müşterilere onaylı şablon gönderir.</span>
        </div>
      )}
      {canChgDurum && selIds.size > 0 && (
        <div className="mb-2 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
          <span className="font-medium text-emerald-800">{selIds.size} sipariş seçili</span>
          <select onChange={(e) => { bulkSetDurum(e.target.value); e.target.value = ''; }} defaultValue="" className="border border-slate-200 rounded-lg px-2 py-1 text-sm">
            <option value="">Toplu durum değiştir...</option>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.t}</option>)}
          </select>
          <button onClick={() => setSelIds(new Set())} className="text-slate-500 hover:text-slate-700 text-xs">Seçimi temizle</button>
        </div>
      )}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="text-slate-400 text-left text-[10px] uppercase tracking-wider border-b border-slate-100">
            <tr>
              {canChgDurum && <th className="px-3 py-2.5"><input type="checkbox" checked={pageItems.length > 0 && pageItems.every((o) => selIds.has(o.id))} onChange={(e) => setSelIds(e.target.checked ? new Set(pageItems.map((o) => o.id)) : new Set())} /></th>}
              <th className="px-4 py-2.5 font-semibold">Sipariş No</th><th className="px-4 py-2.5 font-semibold">Müşteri</th>
              <th className="px-3 py-2.5 font-semibold text-center cursor-pointer select-none hover:text-emerald-700" onClick={() => toggleSort('adet')}>Adet {sortField === 'adet' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
              <th className="px-4 py-2.5 font-semibold">Durum</th>
              <th className="px-4 py-2.5 font-semibold text-right cursor-pointer select-none hover:text-emerald-700" onClick={() => toggleSort('toplam')}>Tutar {sortField === 'toplam' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
              <th className="px-4 py-2.5 font-semibold text-right cursor-pointer select-none hover:text-emerald-700" onClick={() => toggleSort('tahsilat')}>Tahsil {sortField === 'tahsilat' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
              <th className="px-4 py-2.5 font-semibold text-right cursor-pointer select-none hover:text-emerald-700" onClick={() => toggleSort('kalan')}>Kalan {sortField === 'kalan' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
              <th className="px-4 py-2.5 font-semibold cursor-pointer select-none hover:text-emerald-700" onClick={() => toggleSort('tarih')}>Tarih {sortField === 'tarih' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
              <th className="px-4 py-2.5 font-semibold text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((o) => {
              const adet = (o.items || []).reduce((s: number, it: any) => s + (it.adet || 1), 0);
              const kalan = (o.toplam || 0) - (o.tahsilat || 0);
              const st = STMAP[o.durum] || { short: o.durum, c: 'bg-slate-100 text-slate-500' };
              return (
                <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50/70 transition-colors group">
                  {canChgDurum && <td className="px-3 py-2"><input type="checkbox" checked={selIds.has(o.id)} onChange={(e) => { e.stopPropagation(); toggleSel(o.id); }} onClick={(e) => e.stopPropagation()} /></td>}
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500"><div className="flex items-center gap-1.5">{orderLabel(o)}{getPdfPrinted().includes(o.id) && <button onClick={(e) => { e.stopPropagation(); setDetail(o); }} title="PDF yazdırıldı — yeniden aç" className="inline-flex items-center justify-center w-4 h-4 rounded bg-slate-100 text-slate-500 hover:bg-slate-200 shrink-0"><FileText size={10} /></button>}</div></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700 flex items-center justify-center text-[11px] font-bold shrink-0 ring-1 ring-emerald-100">{initials(custName(o))}</div>
                      <div className="min-w-0"><p className="font-semibold text-slate-800 leading-tight text-[13px] truncate">{custName(o)}</p>{custInsta(o) ? <p className="text-[11px] text-pink-600 leading-tight truncate">@{custInsta(o)}</p> : custPhone(o) && <p className="text-[11px] text-slate-400 leading-tight">{custPhone(o)}</p>}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-500 text-[13px]">{adet}</td>
                  <td className="px-4 py-2"><div className="flex flex-col items-start gap-1">{isKayitGerekli(o) ? <span className="text-[11px] px-2 py-0.5 rounded-md font-medium bg-amber-50 text-amber-600">Kayıt Gerekli</span> : <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${st.c}`}>{st.short}</span>}{(o as any).odemeBildirim && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-emerald-50 text-emerald-600"><Banknote size={10} /> Ödeme Bildirimi<button onClick={(e) => { e.stopPropagation(); clearOdemeBildirim(o); }} title="Etiketi kaldır" className="ml-0.5 -mr-1 hover:bg-emerald-200 rounded-full p-0.5"><X size={9} /></button></span>}{adresEksik(o) && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-rose-50 text-rose-600"><MapPin size={10} /> Adres Eksik</span>}</div></td>
                  <td className="px-4 py-2 font-bold text-slate-800 text-[13px] text-right tabular-nums">{fmt(o.toplam)}</td>
                  <td className="px-4 py-2 font-semibold text-green-600 text-[13px] text-right tabular-nums">{fmt(o.tahsilat || 0)}</td>
                  <td className={`px-4 py-2 font-semibold text-[13px] text-right tabular-nums ${kalan > 0.5 ? 'text-rose-500' : 'text-slate-300'}`}>{fmt(kalan)}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-400 whitespace-nowrap leading-tight">{new Date(o.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}<br/><span className="text-slate-300">{new Date(o.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setDetail(o)} title="Detay" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"><FileText size={15} /></button>
                      <button onClick={() => sohbet(o)} title="Sohbet" className="w-7 h-7 flex items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 transition-colors"><MessageCircle size={15} /></button>
                      <button onClick={() => odemeTalep(o)} title="Ödeme Talep" className="w-7 h-7 flex items-center justify-center rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors"><Wallet size={15} /></button>
                      <button onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (menuId === o.id) { setMenuId(null); setMenuPos(null); } else { setMenuId(o.id); setMenuPos({ x: r.right, y: r.bottom }); } }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"><MoreVertical size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && <tr><td colSpan={9} className="px-4 py-14 text-center text-slate-400 text-sm">Sipariş bulunamadı.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobil kart listesi */}
      <div className="lg:hidden space-y-2.5">
        {pageItems.map((o) => {
          const adet = (o.items || []).reduce((s: number, it: any) => s + (it.adet || 1), 0);
          const kalan = (o.toplam || 0) - (o.tahsilat || 0);
          const st = STMAP[o.durum] || { short: o.durum, c: 'bg-slate-100 text-slate-500' };
          return (
            <div key={o.id} className="bg-white rounded-xl border border-slate-200 p-3 active:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">{initials(custName(o))}</div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800 leading-tight truncate">{custName(o)}</p>
                    {custInsta(o) ? <p className="text-xs text-pink-600 leading-tight truncate">@{custInsta(o)}</p> : custPhone(o) && <p className="text-xs text-slate-400 truncate">{custPhone(o)}</p>}
                  </div>
                </div>
                <button onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (menuId === o.id) { setMenuId(null); setMenuPos(null); } else { setMenuId(o.id); setMenuPos({ x: r.right, y: r.bottom }); } }} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0"><MoreVertical size={18} /></button>
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-2.5">
                <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{orderLabel(o)}</span>
                {isKayitGerekli(o) ? <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Kayıt Gerekli</span> : <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${st.c}`}>{st.short}</span>}
                {(o as any).odemeBildirim && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700"><Banknote size={11} /> Ödeme Bildirimi</span>}
                {adresEksik(o) && <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium bg-rose-100 text-rose-700"><MapPin size={11} /> Adres Eksik</span>}
                <span className="text-[11px] text-slate-400 ml-auto">{new Date(o.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2.5 text-center">
                <div className="bg-slate-50 rounded-lg py-1.5"><p className="text-[10px] text-slate-400">Tutar ({adet} ürün)</p><p className="font-bold text-slate-800 text-sm">{fmt(o.toplam)}</p></div>
                <div className="bg-green-50 rounded-lg py-1.5"><p className="text-[10px] text-slate-400">Tahsil</p><p className="font-bold text-green-600 text-sm">{fmt(o.tahsilat || 0)}</p></div>
                <div className={`rounded-lg py-1.5 ${kalan > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}><p className="text-[10px] text-slate-400">Kalan</p><p className={`font-bold text-sm ${kalan > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{fmt(kalan)}</p></div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button onClick={() => setDetail(o)} className="inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg active:bg-slate-50"><FileText size={14} /> Detay</button>
                <button onClick={() => sohbet(o)} className="inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium border border-blue-200 text-blue-600 rounded-lg active:bg-blue-50"><MessageCircle size={14} /> Sohbet</button>
                <button onClick={() => odemeTalep(o)} className="inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium border border-emerald-200 text-emerald-600 rounded-lg active:bg-emerald-50"><Wallet size={14} /> Tahsilat</button>
              </div>
            </div>
          );
        })}
        {pageItems.length === 0 && <div className="bg-white rounded-xl border border-slate-200 px-4 py-12 text-center text-slate-400">Sipariş bulunamadı.</div>}
      </div>

      {/* Sayfalama */}
      <div className="flex items-center justify-between mt-4 text-sm text-slate-500 flex-wrap gap-3">
        <span>{filtered.length === 0 ? 0 : (page - 1) * perPage + 1} - {Math.min(page * perPage, filtered.length)} / {filtered.length} sipariş gösteriliyor</span>
        <div className="flex items-center gap-1.5">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"><ChevronLeft size={16} /></button>
          {(() => {
            const nums: (number | string)[] = [];
            for (let i = 1; i <= totalPages; i++) {
              if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) nums.push(i);
              else if (nums[nums.length - 1] !== '…') nums.push('…');
            }
            return nums.map((n, i) => n === '…'
              ? <span key={`e${i}`} className="px-1.5 text-slate-400">…</span>
              : <button key={n} onClick={() => setPage(n as number)} className={`min-w-9 h-9 px-2 flex items-center justify-center rounded-lg border text-sm font-medium ${page === n ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{n}</button>);
          })()}
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50"><ChevronRight size={16} /></button>
          <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="ml-2 h-9 px-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600">
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / sayfa</option>)}
          </select>
        </div>
      </div>

      {/* Fixed dropdown menü (overflow kırpılmasını önler) */}
      {menuId && menuPos && (() => {
        const o = channelOrders.find((x) => x.id === menuId);
        if (!o) return null;
        const estH = STATUSES.length * 34 + 70;
        const up = menuPos.y + estH > window.innerHeight - 8;
        const top = up ? Math.max(8, menuPos.y - estH - 28) : menuPos.y + 4;
        return (
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => { setMenuId(null); setMenuPos(null); }} />
            <div className="fixed z-[95] w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1 max-h-[70vh] overflow-y-auto" style={{ top, left: menuPos.x, transform: 'translateX(-100%)' }}>
              <p className="px-3 py-1 text-[10px] text-slate-400 uppercase">Durum Değiştir</p>
              {canChgDurum
                ? STATUSES.map((s) => <button key={s.key} onClick={() => { setDurum(o, s.key); setMenuPos(null); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">{s.t}</button>)
                : <p className="px-3 py-1.5 text-xs text-slate-400">Durum değiştirme yetkiniz yok</p>}
              <div className="border-t border-slate-100 my-1" />
              <button onClick={() => { copyLink(o); setMenuId(null); setMenuPos(null); }} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><Link2 size={14} /> Sepet Linkini Kopyala</button>
              <button onClick={() => { del(o.id); setMenuPos(null); }} className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"><Trash2 size={14} /> Sil</button>
            </div>
          </>
        );
      })()}
      </>)}

      {detail && <DetailModal order={detail} customer={cust(detail.customerId)} custName={custName(detail)} custPhone={custPhone(detail)} products={products} categories={categories} discountCodes={discountCodes} campaigns={campaigns} storeSetting={storeSetting} onClose={() => setDetail(null)} reload={reload} />}
      {adresModal && <AdresTalebiModal recipients={activeOrders.filter(adresEksik).map((o: any) => ({ ad: custName(o), phone: custPhone(o) })).filter((r: any) => r.phone)} onClose={() => setAdresModal(false)} />}

      {/* Yeni siparis modali */}
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={saveOrder} className="w-full max-w-lg bg-white rounded-2xl p-6 max-h-[88vh] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Yeni Sipariş</h3><button type="button" onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <div className="grid grid-cols-2 gap-2">
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Misafir müşteri</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>
              <select value={form.kanal} onChange={(e) => setForm({ ...form, kanal: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-lg">{Object.entries(KANAL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <div className="space-y-2">
              {form.items.map((it: any, i: number) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={it.productId} onChange={(e) => onProduct(i, e.target.value)} className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg">{products.map((p) => <option key={p.id} value={p.id}>{p.ad}</option>)}</select>
                  <input type="number" value={it.adet} min={1} onChange={(e) => setItem(i, { adet: Number(e.target.value) })} className="w-16 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                  <input type="number" value={it.fiyat} onChange={(e) => setItem(i, { fiyat: Number(e.target.value) })} className="w-24 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                  <button type="button" onClick={() => delItem(i)} className="text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={addItem} className="text-sm text-emerald-600 inline-flex items-center gap-1"><Plus size={14} /> Ürün ekle</button>
            </div>
            <input value={form.indirimKodu} onChange={(e) => setForm({ ...form, indirimKodu: e.target.value })} placeholder="İndirim kodu (ops.)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-500">Ara Toplam</span><span>{fmt(araToplam)}</span></div>
              {indirim > 0 && <div className="flex justify-between text-green-600"><span>İndirim</span><span>-{fmt(indirim)}</span></div>}
              <div className="flex justify-between font-bold text-slate-800"><span>Toplam</span><span>{fmt(toplam)}</span></div>
            </div>
            <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700">Siparişi Oluştur</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Sparkline({ color, up }: { color: string; up?: boolean }) {
  const pts = up
    ? '0,16 14,13 28,14 42,9 56,11 70,5 84,7 98,2'
    : '0,4 14,6 28,5 42,9 56,8 70,12 84,11 98,15';
  return (
    <svg viewBox="0 0 98 18" className="w-16 h-5 overflow-visible" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.split(' ').map((p, i) => { const [x, y] = p.split(','); return <circle key={i} cx={x} cy={y} r="1.4" fill={color} />; })}
    </svg>
  );
}
function KpiCard({ icon: Ic, label, value, valueColor = 'text-slate-800', iconBg, trend, trendUp, spark }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 hover:border-emerald-200 hover:shadow-sm transition-all duration-200">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}><Ic size={15} /></div>
        <p className="text-[11px] text-slate-500 font-medium truncate">{label}</p>
      </div>
      <p className={`text-lg font-bold leading-none mb-1.5 ${valueColor}`}>{value}</p>
      <div className="flex items-center justify-between gap-1">
        {trend ? <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${trendUp ? 'text-emerald-600' : 'text-rose-500'}`}>{trendUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{trend}</span> : <span />}
        {spark && <Sparkline color={spark} up={trendUp} />}
      </div>
    </div>
  );
}
function TabCard({ active, onClick, label, count, icon: Ic, color = 'slate' }: any) {
  const cmap: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-500', rose: 'bg-rose-100 text-rose-500', amber: 'bg-amber-100 text-amber-600',
    green: 'bg-green-100 text-green-600', blue: 'bg-blue-100 text-blue-600', sky: 'bg-sky-100 text-sky-600',
    violet: 'bg-violet-100 text-violet-600', red: 'bg-red-100 text-red-600', emerald: 'bg-emerald-100 text-emerald-600',
  };
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2 rounded-xl border whitespace-nowrap min-w-fit transition ${active ? 'border-blue-300 bg-blue-50/60 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cmap[color] || cmap.slate}`}><Ic size={15} /></div>
      <div className="text-left leading-tight">
        <p className={`text-[10px] font-medium ${active ? 'text-blue-700' : 'text-slate-500'}`}>{label}</p>
        <p className={`text-sm font-bold leading-none mt-0.5 ${active ? 'text-blue-700' : 'text-slate-800'}`}>{count || 0}</p>
      </div>
    </button>
  );
}
function ActBtn({ onClick, icon: Ic, label, cls }: any) {
  return <button onClick={onClick} title={label} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-lg hover:bg-slate-50 whitespace-nowrap ${cls}`}><Ic size={13} /><span className="hidden lg:inline">{label}</span></button>;
}

export function DetailModal({ order, customer, custName, custPhone, products, categories, discountCodes, campaigns, storeSetting, onClose, reload }: any) {
  const navigate = useNavigate();
  const { isOwner, user } = useAuth();
  const canChgDurum = isOwner || user?.unvan === 'YONETICI';
  const stdKargo = Number((storeSetting?.config as any)?.kargoUcret) || 0;
  const freeShip = Number(storeSetting?.freeShipThreshold) || 0;
  const [durum, setDurumState] = useState<string>(order.durum);
  const [tahsilat, setTahsilat] = useState<number>(order.tahsilat || 0);
  const [custBakiye, setCustBakiye] = useState<number>(Number(customer?.bakiye) || 0);
  useEffect(() => { setCustBakiye(Number(customer?.bakiye) || 0); }, [customer?.id, customer?.bakiye]);
  const [kargoUcreti, setKargoUcreti] = useState<number>(order.kargoUcreti || 0);
  const [kargoManual, setKargoManual] = useState<boolean>((order.kargoUcreti || 0) > 0);
  const [indirim, setIndirim] = useState<number>(order.indirim || 0);
  const [items, setItems] = useState<any[]>(Array.isArray(order.items) ? order.items.map((x: any) => ({ ...x })) : []);
  const [odemeYontemi, setOdemeYontemi] = useState<string>(order.odemeYontemi || 'Banka');
  const [kargoFirmasi] = useState<string>(order.kargoFirmasi || 'Yurtiçi Kargo');
  const [kargoTakip] = useState<string>(order.kargoTakip || '');
  const [adres, setAdres] = useState<string>(order.adres || '');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<number | null>(null);
  const [discTip, setDiscTip] = useState<'yuzde' | 'tutar'>('yuzde');
  const [discVal, setDiscVal] = useState<string>('');
  const [kupon, setKupon] = useState<string>(order.indirimKodu || '');
  const [odemeSekli, setOdemeSekli] = useState<string>('Banka');
  const [odemeEkle, setOdemeEkle] = useState<string>('');
  const [odemeLinki, setOdemeLinki] = useState<string>(order.odemeLinki || '');
  const [odemeGecmisi, setOdemeGecmisi] = useState<any[]>(Array.isArray(order.odemeGecmisi) ? order.odemeGecmisi : []);
  const [odemeEditId, setOdemeEditId] = useState<string | null>(null);
  const [odemeEditVal, setOdemeEditVal] = useState<{ tutar: string; yontem: string }>({ tutar: '', yontem: 'Banka' });
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [kampanyalar, setKampanyalar] = useState<any[]>(Array.isArray(order.kampanyalar) ? order.kampanyalar : []);
  const [bankFinder, setBankFinder] = useState(false);
  const [bankFinderRows, setBankFinderRows] = useState<any[]>([]);
  const [bankFinderQ, setBankFinderQ] = useState('');
  const [bankFinderLoading, setBankFinderLoading] = useState(false);
  // Kredi kartı manuel tahsilat (tutar + zorunlu iyzico linki)
  const [kkModal, setKkModal] = useState(false);
  const [kkForm, setKkForm] = useState<{ tutar: string; link: string }>({ tutar: '', link: '' });
  // Manuel indirim/kupon uygulandi mi? (kampanya disi). Kampanyali siparislerde false -> fiyat degisince kampanya yeniden hesaplanir.
  const isManuel = (o: any) => (Number(o.indirim) || 0) > 0 && (!Array.isArray(o.kampanyalar) || o.kampanyalar.length === 0) && !o.indirimKodu;
  const [manuelInd, setManuelInd] = useState<boolean>(order.manuelIndirim === true || isManuel(order));
  // Kargo gönderisi
  const [kargoModal, setKargoModal] = useState(false);
  const [kargoBusy, setKargoBusy] = useState(false);
  const [cargoSt, setCargoSt] = useState<any>(null);
  // Sadelestirilmis kargola: firma sunucu tarafindan varsayilan secilir, odeme tipi
  // sepet esigine gore otomatik; sadece istege bagli override + manuel takip no.
  const [kForm, setKForm] = useState({ odemeOverride: null as 'gonderici' | 'alici' | null, providerOverride: '', manualTracking: '' });
  // Canlı kargo durumu (Yurtiçi sorgusu)
  const [liveTrack, setLiveTrack] = useState<any>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const loadTrack = async () => {
    if (!(order.durum === 'kargoda' || order.durum === 'teslim' || order.kargoTakip)) return;
    setTrackLoading(true);
    try { const r = await api.get(`/cargo/track/${order.id}`); setLiveTrack(r.data); }
    catch { setLiveTrack(null); }
    finally { setTrackLoading(false); }
  };
  useEffect(() => {
    api.get('/cargo/status').then((r) => { setCargoSt(r.data); }).catch(() => setCargoSt({ carriers: [], gondericiTanimli: false }));
    loadTrack();
  }, []);
  const kargoOlustur = async (force = false) => {
    setKargoBusy(true);
    try {
      const r = await api.post('/cargo/shipment', {
        orderId: order.id,
        provider: kForm.providerOverride || undefined,
        odeme: kargoOdeme,
        desi: 1, kg: 1,
        force: force || undefined,
        manualTracking: kForm.manualTracking || undefined,
        alici: { il: order.il || '', ilce: order.ilce || '', adres: adres || order.adres || '' },
      });
      if (r.data?.ok) {
        toast.success(`Kargo oluşturuldu · Takip: ${r.data.trackingNo}${r.data.manual ? ' (manuel)' : ''}`);
        setDurumState('kargoda'); setKargoModal(false); reload(); loadEvents(); loadFresh(); loadTrack();
        // Kargo gönderisi PDF'i otomatik aç (alıcı bilgileri + barkod). cargoKey'i hemen yansıt.
        if (r.data.cargoKey) order.cargoKey = r.data.cargoKey;
        order.durum = 'kargoda';
        setTimeout(() => exportPDF(), 300);
      } else toast.error('Kargo oluşturulamadı');
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.message || '';
      // Mükerrer kargo uyarısı — kullanıcı onaylarsa force ile yeniden dener
      if (status === 409 && /daha önce kargoland/i.test(msg) && !force) {
        setKargoBusy(false);
        if (window.confirm(msg)) { await kargoOlustur(true); }
        return;
      }
      toast.error(msg || apiErrorMessage(e));
    }
    finally { setKargoBusy(false); }
  };

  const prodOf = (pid: string) => products.find((p: any) => p.id === pid);
  const imgOf = (pid: string) => (prodOf(pid)?.images || [])[0] || '';
  const katOf = (pid: string) => { const k = prodOf(pid)?.kategoriId; return categories?.find((c: any) => c.id === k)?.ad || ''; };
  const renkOf = (pid: string) => { const p = prodOf(pid); const v = (p?.variations || []).find((x: any) => /renk|color/i.test(x.ad)); return v?.deger || ''; };
  const cleanAd = (it: any) => { const p = prodOf(it.productId); return p?.ad || String(it.ad || '').replace(/\s*\([^)]*\)\s*$/, ''); };
  const bedenOf = (it: any) => { if (it.varyasyon) return it.varyasyon; if (it.beden) return it.beden; const m = String(it.ad || '').match(/\(([^)]+)\)\s*$/); return m ? m[1] : ''; };
  const sepetTutari = useMemo(() => items.reduce((s, it) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 0), 0), [items]);
  // Kargo ücreti: eşik aşılırsa otomatik 0 (ücretsiz); aksi halde manuel değilse online mağaza
  // ayarlarındaki sabit kargo ücretinden çek. Admin elle düzenlerse o değer korunur.
  const kargoUcretsiz = freeShip > 0 && sepetTutari >= freeShip;
  // Varsayilan kargo firmasi (sunucu /status listesinin basinda varsayilan gelir)
  const defaultCarrier = (cargoSt?.carriers || [])[0] || null;
  const defaultCarrierLabel = defaultCarrier?.label || 'Tanımlı değil';
  // Odeme tipi otomatik: serbest kargo VEYA kargo bedeli eklenmisse gonderici, aksi alici.
  // Manuel override edilirse o gecerli.
  const kargoOdemeAuto: 'gonderici' | 'alici' = (kargoUcretsiz || (Number(kargoUcreti) || 0) > 0) ? 'gonderici' : 'alici';
  const kargoOdeme: 'gonderici' | 'alici' = kForm.odemeOverride || kargoOdemeAuto;
  useEffect(() => {
    if (kargoUcretsiz) { setKargoUcreti(0); return; }
    // Kargo ücreti kendi kendine eklenmesin: yalnız siparişte kayıtlı değer kullanılır,
    // standart kargo (stdKargo) admin elle girmedikçe otomatik yazılmaz.
    if (!kargoManual) setKargoUcreti(order.kargoUcreti || 0);
  }, [sepetTutari, kargoUcretsiz, kargoManual]);
  // Kampanya indirimini, kapsamdaki ürünlere orantılı dağıt -> her satırda indirim gösterimi
  const itemDiscMap = useMemo(() => {
    const map = new Map<number, number>();
    const toplamInd = Number(indirim) || 0;
    if (toplamInd <= 0) return map;
    const kampList = (Array.isArray(kampanyalar) ? kampanyalar : [])
      .map((k: any) => (campaigns || []).find((c: any) => c.id === k.id)).filter(Boolean);
    const inScope = (it: any) => {
      if (!kampList.length) return true; // kampanya detayı yoksa tüm sepete orantılı dağıt
      return kampList.some((c: any) => {
        if (c.kapsam === 'hepsi') return true;
        if (c.kapsam === 'urun') return it.productId === c.productId;
        if (c.kapsam === 'kategori') { const p = prodOf(it.productId); return p && p.kategoriId === c.kategoriId; }
        return false;
      });
    };
    const scoped = items.map((it, i) => ({ it, i })).filter(({ it }) => inScope(it));
    const scopedToplam = scoped.reduce((s, { it }) => s + (Number(it.fiyat) || 0) * (Number(it.adet) || 0), 0);
    if (scopedToplam > 0) scoped.forEach(({ it, i }) => map.set(i, ((Number(it.fiyat) || 0) * (Number(it.adet) || 0) / scopedToplam) * toplamInd));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, kampanyalar, campaigns, indirim]);
  const toplamTutar = Math.max(0, sepetTutari + (Number(kargoUcreti) || 0) - (Number(indirim) || 0));
  const kalan = toplamTutar - (Number(tahsilat) || 0);
  const odemeDurumu = kalan <= 0 ? 'Ödendi' : (tahsilat > 0 ? 'Kısmi' : 'Bekliyor');

  const loadEvents = async () => { try { const r = await api.get(`/store/orders/${order.id}/events`); setEvents(r.data || []); } catch { /* */ } };
  const loadFresh = async () => {
    try {
      const r = await api.get(`/store/orders/${order.id}`); const o = r.data;
      setItems(Array.isArray(o.items) ? o.items.map((x: any) => ({ ...x })) : []);
      setDurumState(o.durum); setTahsilat(o.tahsilat || 0); setKargoUcreti(o.kargoUcreti || 0);
      setIndirim(o.indirim || 0); setKupon(o.indirimKodu || ''); setAdres(o.adres || o.custAdres || ''); setOdemeYontemi(o.odemeYontemi || 'Banka');
      // Sipariş adres/il/ilçe boşsa müşterinin kayıtlı adresini kullan (görüntü + kargo)
      if (!o.adres && o.custAdres) order.adres = o.custAdres;
      if (!o.il && o.custIl) order.il = o.custIl;
      if (!o.ilce && o.custIlce) order.ilce = o.custIlce;
      setKampanyalar(Array.isArray(o.kampanyalar) ? o.kampanyalar : []);
      setManuelInd(isManuel(o));
      setOdemeLinki(o.odemeLinki || '');
      setOdemeGecmisi(Array.isArray(o.odemeGecmisi) ? o.odemeGecmisi : []);
      if (o.custBakiye != null) setCustBakiye(Number(o.custBakiye) || 0);
    } catch { /* */ }
  };
  useEffect(() => { loadEvents(); loadFresh(); /* eslint-disable-next-line */ }, [order.id]);

  // ESC ile kapat
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (lightbox) setLightbox(null); else onClose(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [lightbox, onClose]);

  const persist = async (extra: any = {}) => {
    setSaving(true);
    try {
      await api.patch(`/store/orders/${order.id}`, {
        durum, tahsilat: Number(tahsilat) || 0, kargoUcreti: Number(kargoUcreti) || 0,
        indirim: Number(indirim) || 0, indirimKodu: kupon || null, items,
        araToplam: sepetTutari, toplam: toplamTutar, odemeYontemi, adres: adres || null,
        manuelIndirim: manuelInd, ...extra,
      });
      toast.success('Kaydedildi');
      reload(); loadEvents(); loadFresh();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setSaving(false); }
  };

  const setItemField = (i: number, patch: any) => setItems((arr) => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  // Sunucuda iptal/silme -> stok iadesi
  const removeItem = async (i: number) => {
    if (!confirm('Ürün sepetten çıkarılsın mı? (Stok iade edilir)')) return;
    try {
      const r = await api.post(`/store/orders/${order.id}/item-remove`, { index: i });
      const o = r.data || {};
      // Backend kampanya indirimini yeniden hesaplar -> yerel ekranı da hemen senkronla (yoksa eski indirim kalır)
      setItems(Array.isArray(o.items) ? o.items.map((x: any) => ({ ...x })) : []);
      setIndirim(Number(o.indirim) || 0);
      setKampanyalar(Array.isArray(o.kampanyalar) ? o.kampanyalar : []);
      setManuelInd(isManuel(o));
      toast.success('Ürün çıkarıldı, stok iade edildi'); reload(); loadEvents();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const applyDiscount = async () => {
    const v = Number(discVal) || 0;
    const amount = discTip === 'yuzde' ? sepetTutari * v / 100 : v;
    const newIndirim = Math.min(amount, sepetTutari);
    setIndirim(newIndirim);
    setManuelInd(newIndirim > 0);
    // Otomatik kaydet
    setSaving(true);
    try {
      await api.patch(`/store/orders/${order.id}`, {
        indirim: newIndirim, manuelIndirim: newIndirim > 0,
        araToplam: sepetTutari, toplam: sepetTutari - newIndirim + (Number(kargoUcreti) || 0),
        items, durum, tahsilat: Number(tahsilat) || 0, kargoUcreti: Number(kargoUcreti) || 0,
        indirimKodu: kupon || null, odemeYontemi, adres: adres || null,
      });
      toast.success('İndirim uygulandı ve kaydedildi');
      reload(); loadEvents(); loadFresh();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setSaving(false); }
  };
  const applyKupon = async () => {
    const code = kupon.trim();
    if (!code) { setIndirim(0); setManuelInd(false); return; }
    const d = discountCodes.find((x: any) => x.aktif && x.code?.toLowerCase() === code.toLowerCase());
    if (!d) { toast.error('Geçersiz / pasif kupon kodu'); return; }
    const amount = d.tip === 'yuzde' ? sepetTutari * d.deger / 100 : d.deger;
    const newIndirim = Math.min(amount, sepetTutari);
    setIndirim(newIndirim);
    setManuelInd(false);
    // Otomatik kaydet
    setSaving(true);
    try {
      await api.patch(`/store/orders/${order.id}`, {
        indirim: newIndirim, manuelIndirim: false, indirimKodu: code,
        araToplam: sepetTutari, toplam: sepetTutari - newIndirim + (Number(kargoUcreti) || 0),
        items, durum, tahsilat: Number(tahsilat) || 0, kargoUcreti: Number(kargoUcreti) || 0,
        odemeYontemi, adres: adres || null,
      });
      toast.success(`Kupon uygulandı ve kaydedildi: ${d.tip === 'yuzde' ? '%' + d.deger : fmt(d.deger)}`);
      reload(); loadEvents(); loadFresh();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setSaving(false); }
  };
  // Sepete uygulanan indirimi/kuponu tamamen kaldır
  const removeIndirim = () => {
    setIndirim(0); setManuelInd(false); setKupon(''); setDiscVal('');
    persist({ indirim: 0, indirimKodu: null, manuelIndirim: false });
    toast.success('İndirim kaldırıldı');
  };

  // Ödeme kayıtları: gerçek liste varsa onu kullan; yoksa eski tek tahsilat değerini düzenlenebilir tek satır olarak göster
  const odemeListe = useMemo(() => {
    if (Array.isArray(odemeGecmisi) && odemeGecmisi.length > 0) return odemeGecmisi;
    if ((Number(tahsilat) || 0) > 0) return [{ id: 'legacy', tutar: Number(tahsilat), yontem: order.odemeYontemi || 'Önceki', tarih: order.createdAt, _legacy: true }];
    return [];
  }, [odemeGecmisi, tahsilat, order.odemeYontemi, order.createdAt]);
  const sumGecmis = (list: any[]) => list.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const addOdeme = () => {
    if (order.durum === 'iptal') { toast.error('İptal edilmiş sepete ödeme girilemez'); return; }
    const amt = Number(odemeEkle) || 0;
    if (amt <= 0) { toast.error('Geçerli bir tutar girin'); return; }
    const taban = (Array.isArray(odemeGecmisi) && odemeGecmisi.length > 0) ? odemeGecmisi : odemeListe.map((r) => ({ ...r, _legacy: undefined }));
    const yeniGecmis = [...taban, { id: newId(), tutar: amt, yontem: odemeSekli, tarih: new Date().toISOString() }];
    const yeni = sumGecmis(yeniGecmis);
    setOdemeGecmisi(yeniGecmis);
    setTahsilat(yeni);
    setOdemeYontemi(odemeSekli);
    setOdemeEkle('');
    persist({ tahsilat: yeni, odemeGecmisi: yeniGecmis, odemeYontemi: odemeSekli, _log: `Ödeme eklendi: ${fmt(amt)} (${odemeSekli})` });
    toast.success(`${fmt(amt)} ödeme eklendi (${odemeSekli})`);
  };

  // Kredi kartı manuel tahsilat: tutar + zorunlu iyzico/tahsilat linki
  const openKkOdeme = () => { setKkForm({ tutar: kalan > 0 ? String(kalan) : '', link: odemeLinki || order.odemeLinki || '' }); setKkModal(true); };
  const payWithBalance = async () => {
    if (order.durum === 'iptal') { toast.error('İptal edilmiş sepete ödeme girilemez'); return; }
    const uygula = Math.min(custBakiye, kalan);
    if (!(uygula > 0)) { toast.error('Kullanılabilir bakiye veya kalan tutar yok'); return; }
    if (!confirm(`Müşteri bakiyesinden ${fmt(uygula)} tahsilata işlensin mi?`)) return;
    try {
      const r = await api.post(`/store/orders/${order.id}/pay-with-balance`, {});
      const o = r.data?.order;
      if (o) { setTahsilat(o.tahsilat || 0); setOdemeGecmisi(Array.isArray(o.odemeGecmisi) ? o.odemeGecmisi : []); }
      setCustBakiye(Number(r.data?.bakiye) || 0);
      toast.success(`Bakiyeden ${fmt(r.data?.uygulanan || uygula)} tahsil edildi`);
      reload(); loadEvents(); loadFresh();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const addKkOdeme = () => {
    if (order.durum === 'iptal') { toast.error('İptal edilmiş sepete ödeme girilemez'); return; }
    const amt = Number(kkForm.tutar) || 0;
    const link = (kkForm.link || '').trim();
    if (amt <= 0) { toast.error('Geçerli bir tutar girin'); return; }
    if (!link) { toast.error('Kredi kartı tahsilatı için ödeme linki zorunludur'); return; }
    const taban = (Array.isArray(odemeGecmisi) && odemeGecmisi.length > 0) ? odemeGecmisi : odemeListe.map((r) => ({ ...r, _legacy: undefined }));
    const yeniGecmis = [...taban, { id: newId(), tutar: amt, yontem: 'K.Kartı', tarih: new Date().toISOString(), link }];
    const yeni = sumGecmis(yeniGecmis);
    setOdemeGecmisi(yeniGecmis);
    setTahsilat(yeni);
    setOdemeYontemi('K.Kartı');
    setKkModal(false);
    persist({ tahsilat: yeni, odemeGecmisi: yeniGecmis, odemeYontemi: 'K.Kartı', _log: `Kredi kartı tahsilatı: ${fmt(amt)} (link: ${link})` });
    toast.success(`${fmt(amt)} kredi kartı tahsilatı işlendi`);
  };

  // Banka ödeme bulucu
  const loadBankImports = async (query?: string) => {
    setBankFinderLoading(true);
    try {
      const r = await api.get(`/store/orders/${order.id}/available-bank-imports`, { params: { q: query || undefined } });
      setBankFinderRows(r.data.rows || []);
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setBankFinderLoading(false); }
  };
  const openBankFinder = () => { setBankFinder(true); loadBankImports(); };
  const matchBankImport = async (row: any) => {
    try {
      await api.post(`/store/bank-imports/${row.id}/match`, { orderId: order.id });
      toast.success(`${fmt(row.tutar)} banka ödemesi eşleştirildi`);
      setBankFinder(false);
      // Refresh order
      try { const r = await api.get(`/store/orders/${order.id}`); const o = r.data?.order || r.data; if (o) { setOdemeGecmisi(Array.isArray(o.odemeGecmisi) ? o.odemeGecmisi : []); setTahsilat(o.tahsilat || 0); } } catch {}
    } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const silOdeme = async (id: string) => {
    const silinen = odemeListe.find((r) => r.id === id);
    // Excel ile işlenmiş ödemeyi yalnızca yönetici silebilir
    if (silinen?.refNo && !isOwner) { toast.error('Excel ile işlenmiş ödemeyi yalnızca yönetici silebilir.'); return; }
    if (!confirm('Bu ödeme kaydı silinsin mi?')) return;
    const yeniGecmis = odemeListe.filter((r) => r.id !== id).map((r) => ({ ...r, _legacy: undefined }));
    const yeni = sumGecmis(yeniGecmis);
    setOdemeGecmisi(yeniGecmis);
    setTahsilat(yeni);
    if (odemeEditId === id) setOdemeEditId(null);
    persist({ tahsilat: yeni, odemeGecmisi: yeniGecmis, _log: `Ödeme silindi: ${fmt(silinen?.tutar || 0)}` });
    // Excel import kaynaklı ödemeyi serbest bırak
    if (silinen?.refNo) { try { await api.post(`/store/bank-imports/${id}/release`); } catch {} }
    toast.success('Ödeme kaydı silindi');
  };
  const saveOdemeEdit = (id: string) => {
    const amt = Number(odemeEditVal.tutar) || 0;
    if (amt <= 0) { toast.error('Geçerli bir tutar girin'); return; }
    const yeniGecmis = odemeListe.map((r) => r.id === id ? { ...r, tutar: amt, yontem: odemeEditVal.yontem, _legacy: undefined } : { ...r, _legacy: undefined });
    const yeni = sumGecmis(yeniGecmis);
    setOdemeGecmisi(yeniGecmis);
    setTahsilat(yeni);
    setOdemeEditId(null);
    persist({ tahsilat: yeni, odemeGecmisi: yeniGecmis, _log: `Ödeme düzeltildi: ${fmt(amt)} (${odemeEditVal.yontem})` });
    toast.success('Ödeme güncellendi');
  };

  const waLink = (tel: string) => { let dd = (tel || '').replace(/\D/g, ''); if (dd.startsWith('0')) dd = '90' + dd.slice(1); else if (dd.length === 10) dd = '90' + dd; return 'https://wa.me/' + dd; };
  const sohbet = () => { if (custPhone) openChat(custPhone, custName); else toast.error('Müşteri telefonu yok'); };
  const copyLink = () => { if (!order.token) { toast.error('Bu siparişin paylaşım linki yok'); return; } navigator.clipboard.writeText(buildSepetCopyText(`${window.location.origin}/sepet/${order.token}`, storeSetting)); toast.success('Sepet linki + ödeme bilgileri kopyalandı'); };
  const odemeTalep = () => {
    const link = order.token ? `${window.location.origin}/sepet/${order.token}` : '';
    const msg = `Merhaba, ${fmt(kalan)} tutarındaki siparişiniz için ödeme bağlantınız: ${link}`;
    if (custPhone) window.open(waLink(custPhone) + '?text=' + encodeURIComponent(msg), '_blank');
    else { navigator.clipboard.writeText(msg); toast.success('Ödeme talebi kopyalandı'); }
  };
  const iptal = async () => {
    if (!confirm('Sipariş iptal edilsin mi? Ürünler stoğa iade edilir.')) return;
    try { await api.post(`/store/orders/${order.id}/cancel`); toast.success('Sipariş iptal edildi, stok iade edildi'); reload(); onClose(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const reactivate = async () => {
    if (!confirm('Sipariş yeniden aktifleştirilsin mi?\n\nÜrünler tekrar stoktan düşülecek.')) return;
    try { await api.post(`/store/orders/${order.id}/reactivate`); toast.success('Sipariş aktifleştirildi, stok düşüldü'); reload(); onClose(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // PDF: Sipariş detayı + kargo bilgisi (sağ üst) + barkod — yazdırılabilir/indirilebilir HTML
  const exportPDF = () => {
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[c]);
    const rows = items.map((it, i) => {
      const img = it.gorsel || imgOf(it.productId);
      const p = prodOf(it.productId);
      const renk = renkOf(it.productId);
      const vary = it.varyasyon || it.beden || '';
      const kod = p?.salesCode || p?.barkod || '';
      const detayParts = [renk, vary].filter(Boolean).join(' - ');
      const detay = [detayParts, kod ? `Kod: ${kod}` : ''].filter(Boolean).join(' | ');
      const lok = p?.lokasyon || 'x';
      const brut = (Number(it.fiyat) || 0) * (Number(it.adet) || 0);
      const disc = itemDiscMap.get(i) || 0;
      const toplamCell = disc > 0
        ? `<span style="text-decoration:line-through;color:#94a3b8">${fmt(brut)}</span> <strong style="color:#16a34a">${fmt(brut - disc)}</strong>`
        : fmt(brut);
      return `<tr>
        <td style="width:90px"><div class="thumb">${img ? `<img src="${esc(img)}"/>` : ''}</div></td>
        <td><div class="pname">${esc(cleanAd(it))}</div><div class="pdet">(${esc(detay)})</div></td>
        <td>${esc(lok)}</td>
        <td>${esc(it.adet)}</td>
        <td style="text-align:right">${fmt(it.fiyat)}</td>
        <td style="text-align:right">${toplamCell}</td>
      </tr>`;
    }).join('');

    const sepetRef = order.sepetNo || order.sipNo || orderLabel(order);
    const takipNo = order.cargoKey || order.sipNo || '';
    const sevkEdildi = !!order.cargoKey || durum === 'kargoda' || durum === 'teslim';
    const odemeTipi = kargoOdeme === 'gonderici' ? 'GO' : 'AO';
    const musteriKodu = customer?.kod || customer?.musteriKodu || customer?.instagram || '';
    const username = customer?.instagram || order.musteriHandle || '';
    const acikAdres = adres || order.adres || '';
    const ilIlce = [order.ilce, order.il].filter(Boolean).join(' / ');
    const firmaAd = storeSetting?.magazaAdi || storeSetting?.storeName || storeSetting?.firmaAdi || (storeSetting?.config as any)?.magazaAdi || (storeSetting?.config as any)?.firmaAdi || '';
    const firmaTel = storeSetting?.telefon || storeSetting?.phone || (storeSetting?.config as any)?.telefon || (storeSetting?.config as any)?.whatsapp || '';
    const tarih = new Date(order.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const barcodeBox = takipNo && sevkEdildi
      ? `<div class="barcode">${code128Svg(takipNo, 38)}</div><div class="bcode">${esc(takipNo)}</div>`
      : '';

    const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Sipariş ${esc(sepetRef)}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:14px 20px;margin:0}
        .head{position:relative;text-align:center;margin-bottom:8px}
        .head h1{font-size:19px;margin:0;letter-spacing:.5px}
        .head .sub{color:#64748b;font-size:11px;margin-top:2px}
        .kbox{position:absolute;top:-2px;right:0;width:200px;border:1px solid #cbd5e1;border-radius:6px;padding:6px 9px;text-align:center}
        .kbox .kt{font-size:10px;font-weight:700;letter-spacing:.5px;margin-bottom:3px}
        .kbox .kr{font-size:10px;text-align:left;margin:1px 0}
        .kbox .kr b{font-weight:700}
        .barcode{margin:4px auto 1px}.barcode svg{max-width:100%}
        .bcode{font-size:10px;letter-spacing:2px;color:#475569}
        .cols{display:flex;justify-content:space-between;gap:24px;margin-top:4px}
        .col h2{font-size:11px;font-weight:700;margin:0 0 2px;letter-spacing:.5px}
        .col p{font-size:11px;margin:0;color:#334155;line-height:1.35}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        thead th{text-align:left;background:#f1f5f9;color:#475569;font-size:10px;text-transform:uppercase;padding:5px 6px;border-bottom:1px solid #e2e8f0}
        thead th:nth-child(4),thead th:nth-child(5),thead th:nth-child(6){text-align:right}
        thead th:nth-child(3),thead th:nth-child(4){text-align:center}
        tbody td{padding:5px 6px;border-bottom:1px solid #eef2f7;font-size:12px;vertical-align:middle}
        tbody td:nth-child(3),tbody td:nth-child(4){text-align:center}
        .thumb{width:44px;height:44px;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff}
        .thumb img{width:100%;height:100%;object-fit:cover}
        .pname{font-weight:600;font-size:12px}.pdet{font-size:10px;color:#94a3b8;margin-top:1px}
        .tot{margin-top:10px;margin-left:auto;width:300px}
        .tot div{display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid #eef2f7;font-size:12px}
        .tot .lbl{font-weight:700}
        @media print{body{padding:8px 12px}tr{page-break-inside:avoid}}
      </style></head>
      <body>
        <div class="head">
          <h1>SİPARİŞ DETAYI</h1>
          <div class="sub">Sepet No: #${esc(sepetRef)} | Tarih: ${esc(tarih)}</div>
          ${username ? `<div class="sub">Kullanıcı: ${esc(username)}</div>` : ''}
          ${sevkEdildi ? `<div class="kbox">
            <div class="kt">KARGO BİLGİSİ</div>
            ${musteriKodu ? `<div class="kr">Müşteri Kodu: <b>${esc(musteriKodu)}</b></div>` : ''}
            <div class="kr">Ödeme Tipi: <b>${esc(odemeTipi)}</b></div>
            <div class="kr">Referans (Sepet No): <b>${esc(sepetRef)}</b></div>
            ${takipNo ? `<div class="kr">Resmi Takip No: <b>${esc(takipNo)}</b></div>` : ''}
            ${barcodeBox}
          </div>` : ''}
        </div>
        <div class="cols">
          <div class="col">
            <h2>MÜŞTERİ BİLGİLERİ</h2>
            <p>${esc(custName)}</p>
            ${acikAdres ? `<p>${esc(acikAdres)}</p>` : ''}
            ${ilIlce ? `<p>${esc(ilIlce)}</p>` : ''}
            ${custPhone ? `<p>${esc(custPhone)}</p>` : ''}
          </div>
          <div class="col" style="text-align:left">
            <h2>FİRMA BİLGİLERİ</h2>
            ${firmaAd ? `<p>${esc(firmaAd)}</p>` : ''}
            ${firmaTel ? `<p>${esc(firmaTel)}</p>` : ''}
          </div>
        </div>
        <table>
          <thead><tr><th>Görsel</th><th>Ürün</th><th>Lokasyon</th><th>Adet</th><th>Birim Fiyat</th><th>Toplam</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="tot">
          <div><span class="lbl">Toplam Tutar:</span><span style="font-weight:700">${fmt(toplamTutar)}</span></div>
          <div><span class="lbl">Ödenen Tutar:</span><span style="font-weight:700;color:#16a34a">${fmt(tahsilat)}</span></div>
          <div><span class="lbl">Kalan Bakiye:</span><span style="font-weight:700;color:${kalan > 0 ? '#dc2626' : '#16a34a'}">${fmt(kalan)}</span></div>
        </div>
        <script>window.onload=function(){setTimeout(function(){window.print();},400);}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Açılır pencere engellendi'); return; }
    w.document.write(html); w.document.close();
    markPdfPrinted(order.id);
    // PDF çıktısı alınınca sepeti otomatik "hazırlanıyor"a al (kargoda/teslim hariç).
    // Gerçek kargo gönderisi (takip no) OLUŞTURMAZ — durum sonradan elle kargolanır.
    try {
      if (order.durum !== 'kargoda' && order.durum !== 'teslim' && order.durum !== 'hazirlaniyor') {
        api.patch('/store/orders/' + order.id, { durum: 'hazirlaniyor', _auto: true, _log: 'PDF çıktısı alındı — hazırlanıyor durumuna alındı' })
          .then(() => { setDurumState('hazirlaniyor'); order.durum = 'hazirlaniyor'; reload(); loadEvents(); })
          .catch(() => {});
      }
    } catch {}
  };

  const markHazirlaniyor = () => {
    try {
      if (order.durum !== 'kargoda' && order.durum !== 'teslim' && order.durum !== 'hazirlaniyor') {
        api.patch('/store/orders/' + order.id, { durum: 'hazirlaniyor', _auto: true, _log: 'Kargo gönderisi başlatıldı — hazırlanıyor durumuna alındı' })
          .then(() => { setDurumState('hazirlaniyor'); order.durum = 'hazirlaniyor'; reload(); loadEvents(); })
          .catch(() => {});
      }
    } catch {}
  };

  const dt = (d: string) => {
    if (!d) return '-';
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d).trim());
    const date = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(d);
    return isNaN(date.getTime()) ? String(d) : date.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const st = STMAP[durum] || { t: durum, c: 'bg-slate-100 text-slate-500' };

  // Kargo durum timeline — canlı veri yoksa durumdan türetilen yedek
  const kargoSteps = [
    { k: 'Hazırlanıyor', done: true },
    { k: 'Kargoya Verildi', done: !!kargoTakip || durum === 'kargoda' || durum === 'teslim' },
    { k: 'Dağıtımda', done: durum === 'teslim' },
    { k: 'Teslim Edildi', done: durum === 'teslim' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-3 sm:p-6 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-5xl bg-white rounded-2xl my-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200 bg-white rounded-t-2xl flex-wrap sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-800">Sipariş Detayı</h3>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.c}`}>{st.t}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
              <span className="font-mono text-slate-600 font-semibold">{orderLabel(order)}</span>
              <span>Oluşturulma: {dt(order.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {custPhone && <button onClick={() => navigate(`/whatsapp?phone=${encodeURIComponent(String(custPhone).replace(/\D/g, ''))}`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-emerald-200 text-emerald-700 rounded-lg bg-emerald-50 hover:bg-emerald-100"><MessageCircle size={15} /> Panelden Sohbet</button>}
            <button onClick={() => { if (getPdfPrinted().includes(order.id) && !window.confirm('Bu gönderi bilgisi daha önce indirildi. Tekrar indirmek istiyor musunuz?')) return; exportPDF(); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50"><FileText size={15} /> PDF</button>
            {(order.cargoKey || order.sipNo) && (order.durum === 'kargoda' || order.durum === 'teslim') && (
              <button onClick={() => printCargoBarcode(order.cargoKey || order.sipNo, custName, [order.il, order.ilce].filter(Boolean).join('/'))} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-orange-200 text-orange-700 rounded-lg bg-orange-50 hover:bg-orange-100"><Tag size={15} /> Barkod Yazdır</button>
            )}
            {order.durum !== 'iptal' && (
              <button onClick={() => { markHazirlaniyor(); setKargoModal(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Truck size={15} /> Kargo Gönderisi</button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18} className="text-slate-400" /></button>
          </div>
        </div>

        {/* İptal edilmiş sipariş — görünür uyarı bandı */}
        {order.durum === 'iptal' && (
          <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <Ban size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div className="text-[13px] text-red-700 leading-snug">
              <b className="text-red-800">Bu sipariş iptal edilmiştir.</b> {order.iptalNedeni === 'yetersiz_stok' ? '(Yetersiz stok) ' : ''}İptal durumundaki bir sepete kargo oluşturulamaz ve ödeme girilemez.
            </div>
          </div>
        )}

        {/* Kargo Gönderisi Oluştur — tek tık onay */}
        {kargoModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={() => setKargoModal(false)}>
            <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between"><h3 className="font-bold text-slate-800 inline-flex items-center gap-1.5"><Truck size={18} className="text-emerald-600" /> Kargola</h3><button onClick={() => setKargoModal(false)}><X size={18} className="text-slate-400" /></button></div>
              {cargoSt && !cargoSt.gondericiTanimli && (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Gönderici bilgileri eksik. <b>Entegrasyonlar &gt; Kargo</b>'dan doldurun. (Manuel takip no ile yine de devam edebilirsiniz.)</p>
              )}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Kargo Firması</span><span className="font-medium text-slate-800">{kForm.providerOverride ? ((cargoSt?.carriers || []).find((c: any) => c.provider === kForm.providerOverride)?.label || kForm.providerOverride) : defaultCarrierLabel}<span className="text-[10px] text-slate-400"> (varsayılan)</span></span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500">Ödeme Tipi</span><span className={`font-medium ${kargoOdeme === 'gonderici' ? 'text-emerald-700' : 'text-amber-700'}`}>{kargoOdeme === 'gonderici' ? 'Gönderici Ödemeli' : 'Alıcı Ödemeli'}<span className="text-[10px] text-slate-400"> {kForm.odemeOverride ? '(elle)' : '(otomatik)'}</span></span></div>
                <div className="flex justify-between"><span className="text-slate-500">Alıcı</span><span className="text-slate-700 truncate max-w-[60%] text-right">{custName || '—'}</span></div>
                {(order.il || order.ilce || adres || order.adres) && <div className="flex justify-between"><span className="text-slate-500">Adres</span><span className="text-slate-700 truncate max-w-[60%] text-right">{[adres || order.adres, order.ilce, order.il].filter(Boolean).join(', ') || '—'}</span></div>}
              </div>
              {/* İsteğe bağlı override'lar */}
              <details className="text-sm">
                <summary className="cursor-pointer text-[12px] text-slate-500 select-none">Seçenekleri değiştir</summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Kargo Firması</label>
                    <select value={kForm.providerOverride} onChange={(e) => setKForm({ ...kForm, providerOverride: e.target.value })} className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg">
                      <option value="">Varsayılan ({defaultCarrierLabel})</option>
                      {(cargoSt?.carriers || []).map((c: any) => <option key={c.provider} value={c.provider}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Ödeme Tipi</label>
                    <select value={kForm.odemeOverride || ''} onChange={(e) => setKForm({ ...kForm, odemeOverride: (e.target.value || null) as any })} className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg">
                      <option value="">Otomatik ({kargoOdemeAuto === 'gonderici' ? 'Gönderici' : 'Alıcı'})</option>
                      <option value="gonderici">Gönderici Ödemeli</option>
                      <option value="alici">Alıcı Ödemeli</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Manuel Takip No (API yoksa)</label>
                    <input placeholder="Örn. 1234567890" value={kForm.manualTracking} onChange={(e) => setKForm({ ...kForm, manualTracking: e.target.value })} className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg" />
                  </div>
                </div>
              </details>
              <button onClick={() => kargoOlustur()} disabled={kargoBusy} className="w-full bg-emerald-600 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"><Truck size={16} /> {kargoBusy ? 'Oluşturuluyor...' : 'Gönderiyi Oluştur & Kargola'}</button>
            </div>
          </div>
        )}

        <div className="p-5 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* SOL PANEL */}
            <div className="lg:col-span-2 space-y-4">
              {/* Müşteri & Durum */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card title="MÜŞTERİ">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">{initials(custName)}</div>
                    <div className="min-w-0"><p className="font-medium text-slate-800 truncate text-sm">{custName}</p>{(customer?.instagram || order.musteriHandle) && <p className="text-xs text-pink-600 truncate">@{String(customer?.instagram || order.musteriHandle).replace(/^@/, '')}</p>}<p className="text-xs text-slate-400 truncate">{custPhone || 'Telefon yok'}</p></div>
                    <button onClick={sohbet} title="Sohbet" className="ml-auto p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"><MessageCircle size={16} /></button>
                  </div>
                  <textarea value={adres} onChange={(e) => setAdres(e.target.value)} onBlur={() => persist()} rows={2} placeholder="Teslimat adresi..." className="w-full text-sm text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 resize-none" />
                  {(order.il || order.ilce) && <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"><MapPin size={11} className="text-slate-400 shrink-0" /> {[order.ilce, order.il].filter(Boolean).join(' / ')}</p>}
                  {customer && ((customer.bakiye || 0) !== 0 || (customer.indirimYuzde || 0) > 0) && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {(customer.bakiye || 0) !== 0 && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${customer.bakiye > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>Bakiye: {fmt(customer.bakiye)}</span>}
                      {(customer.indirimYuzde || 0) > 0 && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700">Özel indirim: %{customer.indirimYuzde}</span>}
                    </div>
                  )}
                </Card>
                <Card title="DURUM & ÖDEME">
                  <label className="block text-[11px] text-slate-400 mb-1">Sipariş Durumu</label>
                  {canChgDurum ? (
                    <select value={durum} onChange={(e) => setDurumState(e.target.value)} onBlur={() => persist()} className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 mb-2">
                      {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.t}</option>)}
                    </select>
                  ) : (
                    <div className="w-full text-sm border border-slate-200 bg-slate-50 rounded-lg px-2 py-1.5 mb-2 text-slate-600">{(STMAP[durum]?.t) || durum} <span className="text-[10px] text-slate-400">(değiştirme yetkiniz yok)</span></div>
                  )}
                  {order.kargoTakip && <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">Takip Kodu</span><span className="font-mono font-medium text-slate-700">{order.kargoTakip}</span></div>}
                  <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">Ödeme Durumu</span><span className={`font-medium ${odemeDurumu === 'Ödendi' ? 'text-green-600' : odemeDurumu === 'Kısmi' ? 'text-amber-600' : 'text-red-500'}`}>{odemeDurumu}</span></div>
                  <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">Son Ödeme</span><span className="text-slate-600">{odemeYontemi}</span></div>
                </Card>
              </div>

              {/* Sepetteki Ürünler */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">Sepetteki Ürünler ({items.length})</h4>
                <table className="w-full text-sm">
                  <thead className="text-slate-400 text-left text-xs"><tr><th className="py-2">Ürün</th><th className="py-2 w-20">Beden</th><th className="py-2 w-16">Adet</th><th className="py-2 w-24">Fiyat</th><th className="py-2 w-24">Toplam</th><th className="py-2 text-right w-20">İşlem</th></tr></thead>
                  <tbody>
                    {items.map((it, i) => {
                      const img = it.gorsel || imgOf(it.productId);
                      const _sk = prodOf(it.productId)?.salesCode;
                      const detay = [katOf(it.productId), renkOf(it.productId), prodOf(it.productId)?.barkod].filter(Boolean).join(' · ');
                      return (
                        <tr key={i} className="border-t border-slate-100 align-top">
                          <td className="py-2.5"><div className="flex items-center gap-2.5">
                            <div className="w-11 h-11 rounded-lg bg-slate-100 overflow-hidden shrink-0 cursor-zoom-in hover:ring-2 hover:ring-emerald-300" onClick={() => img && setLightbox(img)}>{img ? <img src={img} className="w-full h-full object-cover" /> : null}</div>
                            <div className="min-w-0">
                              <p className="text-slate-700 font-medium leading-tight">{cleanAd(it)}</p>
                              {detay && <p className="text-[11px] text-slate-400 truncate">{detay}</p>}
                              {_sk && <p className="text-[11px] text-slate-500 truncate">Satış Kodu: <span className="font-medium text-slate-600">{_sk}</span></p>}
                            </div>
                          </div></td>
                          <td className="py-2.5">{bedenOf(it) ? <span className="inline-block text-xs px-2 py-0.5 bg-slate-100 rounded-md text-slate-600">{bedenOf(it)}</span> : <span className="text-slate-400">-</span>}</td>
                          <td className="py-2.5">{editItem === i ? <input type="number" min={1} value={it.adet} onChange={(e) => setItemField(i, { adet: Number(e.target.value) })} className="w-14 border border-slate-200 rounded px-1.5 py-0.5" /> : <span className="text-slate-600">{it.adet}</span>}</td>
                          <td className="py-2.5">{editItem === i ? <input type="number" value={it.fiyat} onChange={(e) => setItemField(i, { fiyat: Number(e.target.value) })} className="w-20 border border-slate-200 rounded px-1.5 py-0.5" /> : <span className="text-slate-600">{fmt(it.fiyat)}</span>}</td>
                          <td className="py-2.5">{(() => {
                            const brut = (Number(it.fiyat) || 0) * (Number(it.adet) || 0);
                            const disc = itemDiscMap.get(i) || 0;
                            if (disc > 0) return (
                              <div className="leading-tight">
                                <span className="line-through text-slate-400 text-xs mr-1">{fmt(brut)}</span>
                                <span className="font-semibold text-green-600">{fmt(brut - disc)}</span>
                                <span className="block text-[9px] text-amber-600 font-medium inline-flex items-center gap-0.5"><Tag size={9} /> -{fmt(disc)}</span>
                              </div>
                            );
                            return <span className="font-medium text-slate-700">{fmt(brut)}</span>;
                          })()}</td>
                          <td className="py-2.5"><div className="flex items-center justify-end gap-1">
                            {editItem === i
                              ? <button onClick={() => { setEditItem(null); persist({ _log: `Ürün düzenlendi: ${cleanAd(it)} (Adet: ${it.adet}, Fiyat: ${fmt(it.fiyat)})` }); }} title="Onayla" className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100"><Check size={14} /></button>
                              : <button onClick={() => setEditItem(i)} title="Düzenle" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><Pencil size={14} /></button>}
                            <button onClick={() => removeItem(i)} title="Sil (stok iade)" className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 size={14} /></button>
                          </div></td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-400">Ürün yok</td></tr>}
                  </tbody>
                </table>
                <div className="flex justify-end items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                  <span className="text-sm text-slate-400">Sepet Toplamı:</span><span className="text-lg font-bold text-slate-800">{fmt(sepetTutari)}</span>
                  <button onClick={() => persist()} disabled={saving} className="ml-2 px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50">Kaydet</button>
                </div>
              </div>

              {/* Kargo Bilgileri (read-only / API) & Hızlı İşlemler */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card title="KARGO BİLGİLERİ (API)">
                  <div className="flex items-center gap-3 mb-3">
                    <KargoLogo firma={liveTrack?.kargoFirmasi || kargoFirmasi} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">{liveTrack?.kargoFirmasi || kargoFirmasi}{liveTrack?.kargoTip ? <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 align-middle">{liveTrack.kargoTip}</span> : null}</p>
                      <p className="text-[11px] text-slate-400">{liveTrack?.live ? 'Yurtiçi · canlı durum' : 'Otomatik · API ile çekilir'}</p>
                    </div>
                    <button onClick={loadTrack} disabled={trackLoading} title="Durumu yenile" className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"><RefreshCw size={14} className={trackLoading ? 'animate-spin' : ''} /></button>
                  </div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-[11px] text-slate-400">Takip Kodu</span>
                    <span className="text-sm font-mono text-slate-600">{liveTrack?.takip || kargoTakip || '—'}</span>
                    {liveTrack?.trackingUrl && <a href={liveTrack.trackingUrl} target="_blank" rel="noreferrer" className="text-[11px] text-emerald-600 hover:underline">Takip sayfası ↗</a>}
                    {(order.cargoKey || order.sipNo) && <button onClick={() => printCargoBarcode(order.cargoKey || order.sipNo, custName, [order.il, order.ilce].filter(Boolean).join('/'))} className="text-[11px] text-orange-600 hover:underline">Barkod Yazdır</button>}
                  </div>
                  {liveTrack?.durum && (
                    <div className={`mb-3 text-xs px-2.5 py-1.5 rounded-lg font-medium ${liveTrack.teslim ? 'bg-green-50 text-green-700' : 'bg-sky-50 text-sky-700'}`}>{liveTrack.durum}</div>
                  )}
                  {/* Durum timeline / canlı hareketler */}
                  {liveTrack?.hareketler && liveTrack.hareketler.length > 0 ? (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {liveTrack.hareketler.map((h: any, i: number) => (
                        <div key={i} className="flex gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full bg-green-500 mt-1 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-slate-700 leading-tight">{h.durum}</p>
                            <p className="text-[10px] text-slate-400">{[h.tarih, h.birim].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {kargoSteps.map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`w-2.5 h-2.5 rounded-full ${s.done ? 'bg-green-500' : 'bg-slate-200'}`} />
                          <span className={s.done ? 'text-slate-700' : 'text-slate-400'}>{s.k}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {liveTrack?.hata && <p className="text-[10px] text-amber-600 mt-3">Canlı sorgu yapılamadı: {liveTrack.hata}. Kayıtlı durum gösteriliyor.</p>}
                  {!liveTrack && <p className="text-[10px] text-slate-400 mt-3">Bu alan kargo gönderildikten sonra Yurtiçi durumuyla otomatik dolar.</p>}
                </Card>
                <Card title="SEPET HAREKETLERİ">
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {events.length === 0 && <p className="text-xs text-slate-400">Henüz hareket yok.</p>}
                    {events.map((ev) => (
                      <div key={ev.id} className="flex gap-2.5 text-sm">
                        <div className="mt-0.5"><Clock size={13} className="text-slate-300" /></div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 leading-tight">{ev.islem}</p>
                          {ev.detay && <p className="text-[11px] text-slate-500 break-words">{ev.detay}</p>}
                          <p className="text-[10px] text-slate-400 mt-0.5">{dt(ev.createdAt)} · {ev.kullanici || 'Sistem'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            {/* SAĞ PANEL */}
            <div className="space-y-4">
              {/* Hızlı İşlemler (en üstte) */}
              <Card title="HIZLI İŞLEMLER">
                <div className="grid grid-cols-2 gap-2">
                  <QuickBtn onClick={sohbet} icon={MessageCircle} label="Sohbet" />
                  <QuickBtn onClick={copyLink} icon={Link2} label="Link Kopyala" />
                  <QuickBtn onClick={odemeTalep} icon={Wallet} label="Ödeme Talep" cls="text-green-600 border-green-200 hover:bg-green-50" />
                  {durum === 'iptal'
                    ? <QuickBtn onClick={reactivate} icon={RefreshCw} label="Aktifleştir" cls="text-violet-600 border-violet-200 hover:bg-violet-50" />
                    : <QuickBtn onClick={iptal} icon={Trash2} label="Sepeti İptal" cls="text-red-500 border-red-200 hover:bg-red-50" />
                  }
                </div>
              </Card>

              {/* İndirim + Kupon */}
              <Card title="İNDİRİM & KUPON">
                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 mb-2">
                  <button onClick={() => setDiscTip('yuzde')} className={`px-3 py-1 text-sm rounded-md ${discTip === 'yuzde' ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-slate-500'}`}>Yüzde</button>
                  <button onClick={() => setDiscTip('tutar')} className={`px-3 py-1 text-sm rounded-md ${discTip === 'tutar' ? 'bg-emerald-100 text-emerald-700 font-medium' : 'text-slate-500'}`}>Tutar</button>
                </div>
                <div className="flex gap-2 mb-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1.5 text-slate-400 text-sm">{discTip === 'yuzde' ? '%' : '₺'}</span>
                    <input type="number" value={discVal} onChange={(e) => setDiscVal(e.target.value)} placeholder="0" className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                  </div>
                  <button onClick={applyDiscount} className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Uygula</button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1"><Ticket size={13} className="absolute left-2.5 top-2 text-slate-400" /><input value={kupon} onChange={(e) => setKupon(e.target.value)} placeholder="Kupon kodu" className="w-full pl-7 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg" /></div>
                  <button onClick={applyKupon} className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">Uygula</button>
                </div>
              </Card>

              {/* Ödeme Özeti */}
              <Card title="ÖDEME ÖZETİ">
                <SumRow label="Sepet Tutarı" value={fmt(sepetTutari)} />
                <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">Kargo Ücreti</span>
                  {kargoUcretsiz
                    ? <span className="text-green-600 font-medium">Ücretsiz <span className="text-[10px] text-slate-400">(eşik aşıldı)</span></span>
                    : <input type="number" value={kargoUcreti} onChange={(e) => { setKargoManual(true); setKargoUcreti(Number(e.target.value)); }} onBlur={() => persist()} className="w-24 text-right text-sm border border-slate-200 rounded px-1.5 py-0.5" />}
                </div>
                <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">İndirim</span><span className="flex items-center gap-1.5"><span className="text-green-600">-{fmt(indirim)}</span>{indirim > 0 && <button onClick={removeIndirim} title="İndirimi kaldır" className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full p-0.5"><X size={13} /></button>}</span></div>
                {kampanyalar.length > 0 && (
                  <div className="flex flex-wrap gap-1 py-1">
                    {kampanyalar.map((k: any, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium" title={k.ad}><Tag size={10} /> {k.ad} ({k.ozet}) -{fmt(k.indirim)}</span>
                    ))}
                  </div>
                )}
                <div className="border-t border-slate-100 my-1.5" />
                <SumRow label="Toplam Tutar" value={fmt(toplamTutar)} bold />
                <SumRow label="Tahsil Edilen" value={fmt(tahsilat)} cls="text-green-600" />
                <div className="flex items-center justify-between text-sm py-1.5 mt-1 px-2 rounded-lg bg-slate-50"><span className="text-slate-500 font-medium">Kalan Bakiye</span><span className={`font-bold ${kalan > 0 ? 'text-red-500' : 'text-green-600'}`}>{fmt(kalan)}</span></div>
              </Card>

              {/* Ödeme */}
              <Card title="ÖDEME">
                {order.durum === 'iptal' ? (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-[13px] text-red-700"><Ban size={16} className="shrink-0" /> Sipariş iptal edildiği için ödeme girişi kapalıdır.</div>
                ) : (
                <>
                {custBakiye > 0 && (
                  <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1.5"><Wallet size={14} /> Müşteri Bakiyesi</span>
                      <span className="text-sm font-bold text-emerald-700">{fmt(custBakiye)}</span>
                    </div>
                    <button onClick={payWithBalance} disabled={kalan <= 0.005} className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                      <Wallet size={15} /> Bakiye ile Öde ({fmt(Math.min(custBakiye, Math.max(0, kalan)))})
                    </button>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mb-2">Banka tahsilatı yalnızca Excel'den yüklenen ödemelerle eşleştirilir. Kredi kartı tahsilatını tutar + ödeme linki ile manuel işleyebilirsiniz.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={openBankFinder} className="px-3 py-2.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 inline-flex items-center justify-center gap-2"><FileSpreadsheet size={16} /> Ödeme Bul</button>
                  <button onClick={openKkOdeme} className="px-3 py-2.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center justify-center gap-2"><CreditCard size={16} /> Kredi Kartı</button>
                </div>
                {odemeListe.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <label className="block text-[11px] text-slate-400 mb-1.5">Ödeme Kayıtları ({odemeListe.length})</label>
                    <div className="space-y-1.5">
                      {odemeListe.map((r: any) => (
                        <div key={r.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-lg px-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <div>
                              <span className="font-medium text-slate-700">{fmt(r.tutar)}</span>
                              <span className="text-[11px] text-slate-400 ml-1.5">{r.yontem}{r.tarih ? ` · ${dt(r.tarih)}` : ''}</span>
                            </div>
                            {r.link && (
                              <a href={r.link} target="_blank" rel="noreferrer" className="text-[11px] text-violet-600 hover:underline inline-flex items-center gap-1 truncate max-w-full"><Link2 size={11} /> {r.link}</a>
                            )}
                          </div>
                          {r.refNo && !isOwner ? (
                            <span title="Excel ile işlenmiş ödemeyi yalnızca yönetici silebilir" className="text-[10px] text-slate-400 shrink-0 px-1.5 py-1">🔒 Yönetici</span>
                          ) : (
                            <button onClick={() => silOdeme(r.id)} title="Sil / Eşleşmeyi kaldır" className="p-1 rounded bg-red-50 text-red-500 hover:bg-red-100 shrink-0"><Trash2 size={13} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <label className="block text-[11px] text-slate-400 mb-1">Kredi Kartı Ödeme Linki (müşteriye "Sepeti Öde" butonu)</label>
                  <div className="flex gap-2">
                    <input value={odemeLinki} onChange={(e) => setOdemeLinki(e.target.value)} placeholder="https://... ödeme linkini yapıştırın" className="flex-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5" />
                    <button onClick={() => persist({ odemeLinki: odemeLinki || null, odemeLinkiSon: odemeLinki ? new Date(Date.now() + 60 * 60000).toISOString() : null, _log: odemeLinki ? 'Ödeme linki eklendi (60 dk geçerli)' : 'Ödeme linki kaldırıldı' })} className="px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-900">Kaydet</button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Kaydedince müşterinin sepet sayfasında 60 dk geri sayımlı "Sepeti Öde" butonu açılır.</p>
                </div>
                </>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-6" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
          <img src={lightbox} className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-5 right-5 text-white/80 hover:text-white"><X size={28} /></button>
        </div>
      )}

      {/* Kredi Kartı Manuel Tahsilat modalı */}
      {kkModal && (
        <div className="fixed inset-0 z-[116] flex items-center justify-center p-4 bg-black/50" onClick={() => setKkModal(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800 inline-flex items-center gap-2"><CreditCard size={18} className="text-emerald-600" /> Kredi Kartı Tahsilatı</h2>
              <button onClick={() => setKkModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 mb-4 flex justify-between items-center">
              <span className="text-xs text-slate-500">Kalan Bakiye</span>
              <span className={`text-lg font-bold ${kalan > 0 ? 'text-red-500' : 'text-green-600'}`}>{fmt(kalan)}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Tahsilat Tutarı (₺)</label>
                <input type="number" step="0.01" value={kkForm.tutar} onChange={(e) => setKkForm((v) => ({ ...v, tutar: e.target.value }))} placeholder="0,00" className="w-full text-lg font-semibold border border-slate-200 rounded-lg px-3 py-2.5" />
                {kalan > 0 && <button onClick={() => setKkForm((v) => ({ ...v, tutar: String(kalan) }))} className="mt-1.5 text-xs text-emerald-600">Kalanı doldur ({fmt(kalan)})</button>}
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1 flex items-center gap-1"><Link2 size={12} /> Ödeme Linki <span className="text-rose-500 font-semibold">(zorunlu)</span></label>
                <input value={kkForm.link} onChange={(e) => setKkForm((v) => ({ ...v, link: e.target.value }))} placeholder="https://... tahsilat aldığınız ödeme linkini yapıştırın" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5" />
                <p className="text-[11px] text-slate-400 mt-1">Tahsilatın hangi link üzerinden alındığı bu kayıtta saklanır.</p>
              </div>
              <button onClick={addKkOdeme} disabled={!kkForm.link.trim() || !(Number(kkForm.tutar) > 0)} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"><Check size={16} /> Tahsilatı İşle</button>
            </div>
          </div>
        </div>
      )}

      {/* Banka Ödeme Bul modalı */}
      {bankFinder && (
        <div className="fixed inset-0 z-[115] flex items-center justify-center p-4 bg-black/50" onClick={() => setBankFinder(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-white rounded-2xl p-5 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet size={20} className="text-violet-600" /> Banka Ödemesi Bul</h3>
              <button onClick={() => setBankFinder(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-3">Henüz eşleştirilmemiş serbest banka ödemelerinden seçim yapın.</p>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input value={bankFinderQ} onChange={(e) => { setBankFinderQ(e.target.value); loadBankImports(e.target.value); }} placeholder="Ref no, açıklama ile ara..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {bankFinderLoading ? <p className="text-center text-slate-400 py-6">Yükleniyor...</p> : bankFinderRows.length === 0 ? <p className="text-center text-slate-400 py-6">Serbest banka ödemesi bulunamadı</p> : (
                <div className="space-y-2">
                  {bankFinderRows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-violet-200 hover:bg-violet-50/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-700">{r.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺</span>
                          <span className="text-xs text-slate-400">{r.tarih}</span>
                        </div>
                        <p className="text-xs text-slate-600 truncate mt-0.5">{r.aciklama}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">Ref: {r.refNo}</p>
                      </div>
                      <button onClick={() => matchBankImport(r)} className="ml-3 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 shrink-0">Eşleştir</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: any) {
  return <div className="bg-white rounded-xl border border-slate-200 p-4"><h4 className="text-xs font-semibold text-slate-500 uppercase mb-3">{title}</h4>{children}</div>;
}
function SumRow({ label, value, bold, cls }: any) {
  return <div className="flex items-center justify-between text-sm py-1"><span className="text-slate-400">{label}</span><span className={`${bold ? 'font-bold text-slate-800' : 'font-medium text-slate-700'} ${cls || ''}`}>{value}</span></div>;
}
function QuickBtn({ onClick, icon: Ic, label, cls }: any) {
  return <button onClick={onClick} className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 text-xs border rounded-lg ${cls || 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}><Ic size={14} /> {label}</button>;
}

// ═══════════ Excel ile Ödeme İşleme Paneli ═══════════
function BankImportPanel({ orders, orderLabel, onOpenDetail, onBack }: { orders: any[]; orderLabel: (o: any) => string; onOpenDetail: (o: any) => void; onBack: () => void }) {
  const { isOwner } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'matched' | 'recent' | 'free' | 'silinmis'>('all');
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pickRow, setPickRow] = useState<any>(null);
  const [pickQ, setPickQ] = useState('');
  const [basTarih, setBasTarih] = useState('');
  const [bitTarih, setBitTarih] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Eşleşme bekleyen sayısı — sayfa yüklendiğinde kontrol et
  const loadPendingCount = async () => {
    try { const r = await api.get('/store/bank-imports', { params: { status: 'pending', page: 1 } }); setPendingCount(r.data.total || 0); } catch { /* sessiz */ }
  };
  useEffect(() => { loadPendingCount(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/store/bank-imports', { params: { status: filter === 'all' ? undefined : filter, q: q || undefined, page, basTarih: basTarih || undefined, bitTarih: bitTarih || undefined, sortDir } });
      setRows(r.data.rows || []);
      setTotal(r.data.total || 0);
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter, q, page, basTarih, bitTarih, sortDir]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setLastResult(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Tüm satırları ham array olarak oku (sabit indeksli erişim için)
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Garanti BBVA Hesap Özeti formatını algıla:
      // Satır 15 (index): ['Tarih/Saat','Valör','Kanal/Şube','İşlem Tutarı*','Bakiye',...,'Referans']
      // Açıklama sütunu 8'den başlar, Referans sütunu 14
      const isBankFormat = (r: any[]) => r[0] && String(r[0]).includes('/') && String(r[0]).includes('-') && !isNaN(Number(r[3]));
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(20, allRows.length); i++) {
        const r = allRows[i];
        const first = String(r[0] || '').toLowerCase();
        if (first.includes('tarih') || first.includes('date')) { headerRowIdx = i; break; }
      }

      let parsed: any[] = [];
      if (headerRowIdx >= 0) {
        // Bank format: data starts at headerRowIdx+1
        const dataRows = allRows.slice(headerRowIdx + 1);
        parsed = dataRows
          .filter((r) => isBankFormat(r))
          .map((r) => {
            // Tarih/Saat: "22/06/2026-18:10:20" → split on '-'
            const tarihSaat = String(r[0] || '');
            const dashIdx = tarihSaat.indexOf('-');
            const tarih = dashIdx > 0 ? tarihSaat.slice(0, dashIdx) : tarihSaat;
            const saat = dashIdx > 0 ? tarihSaat.slice(dashIdx + 1) : null;
            // Açıklama: kolonlar 8'den 13'e kadar birleştir
            const aciklamaParts: string[] = [];
            for (let c = 8; c <= 13; c++) { const v = String(r[c] || '').trim(); if (v) aciklamaParts.push(v); }
            const aciklama = aciklamaParts.join(' ').trim();
            // Tutar: kolon 3 (mutlak değer, yalnızca gelen işlemleri al)
            const tutar = Math.abs(parseFloat(String(r[3] || '0').replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0);
            // Referans: kolon 14
            const refNo = String(r[14] || '').trim();
            return { tarih, saat, tutar, aciklama, refNo };
          })
          .filter((r) => r.refNo && r.tutar && r.aciklama);
      } else {
        // Genel format: ilk satır header, esnek sütun eşleştirme
        const headers = allRows[0] || [];
        const findCol = (variants: string[]) => headers.findIndex((h: any) => variants.some((v) => String(h).toLowerCase().includes(v)));
        const tarihCol = findCol(['tarih', 'date', 'islem tar']);
        const saatCol = findCol(['saat', 'time']);
        const tutarCol = findCol(['tutar', 'amount', 'işlem tutar', 'miktar']);
        const aciklamaCol = findCol(['açıklama', 'aciklama', 'description', 'açıkla']);
        const refCol = findCol(['referans', 'ref', 'dekont', 'fiş']);
        const dataRows = allRows.slice(1);
        parsed = dataRows
          .map((r) => ({
            tarih: tarihCol >= 0 ? String(r[tarihCol] || '').trim() : '',
            saat: saatCol >= 0 && r[saatCol] ? String(r[saatCol]).trim() : null,
            tutar: tutarCol >= 0 ? Math.abs(parseFloat(String(r[tutarCol] || '0').replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0) : 0,
            aciklama: aciklamaCol >= 0 ? String(r[aciklamaCol] || '').trim() : '',
            refNo: refCol >= 0 ? String(r[refCol] || '').trim() : '',
          }))
          .filter((r) => r.refNo && r.tutar && r.aciklama);
      }

      if (parsed.length === 0) { toast.error('Dosyadan geçerli satır bulunamadı. Desteklenen format: Garanti/Banka Hesap Özeti (xlsx/xls)'); setImporting(false); return; }
      const res = await api.post('/store/bank-import', { rows: parsed });
      setLastResult(res.data);
      const pendingCount = (res.data.results || []).filter((r: any) => r.status === 'pending_match').length;
      toast.success(`${res.data.imported} satır import edildi, ${pendingCount} tanesi eşleşme bulundu — onayınızı bekliyor`);
      load();
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setImporting(false); e.target.value = ''; }
  };

  const release = async (id: string) => {
    if (!confirm('Bu ödemeyi serbest bırakmak istediğinize emin misiniz?')) return;
    try { await api.post(`/store/bank-imports/${id}/release`); toast.success('Serbest bırakıldı'); load(); loadPendingCount(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const removeRow = async (id: string) => {
    if (!confirm('Bu para giriş/çıkış kaydını silmek istediğinize emin misiniz? Bu işlem yalnızca patron tarafından yapılabilir.')) return;
    try { await api.delete(`/store/bank-imports/${id}`); toast.success('Kayıt silindi'); load(); loadPendingCount(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };
  const toggleSelRow = (id: string) => setSelIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allRowsSelected = rows.length > 0 && rows.every((r) => selIds.has(r.id));
  const toggleSelAllRows = () => setSelIds(allRowsSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const bulkDelete = async () => {
    if (!selIds.size) return;
    if (!confirm(`${selIds.size} kayıt silinecek. Emin misiniz?`)) return;
    try { await api.post('/store/bank-imports/bulk-delete', { ids: Array.from(selIds) }); toast.success('Seçili kayıtlar silindi'); setSelIds(new Set()); load(); loadPendingCount(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const confirmMatch = async (id: string, orderId: string, sipNo: string) => {
    if (!confirm(`${sipNo} siparişine bu ödemeyi işlemek istediğinize emin misiniz?`)) return;
    try { await api.post(`/store/bank-imports/${id}/match`, { orderId }); toast.success(`${sipNo} siparişine ödeme işlendi`); load(); loadPendingCount(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  // Tüm eşleşenleri seç ve işle — önerilen siparişi olan tüm pending ödemeleri toplu işler
  const processAllMatches = async () => {
    if (!confirm(`Önerilen siparişle eşleşmiş tüm ödemeler otomatik işlenecek. Devam edilsin mi?`)) return;
    setBulkBusy(true);
    try {
      // Tüm pending kayıtları sayfa sayfa topla
      let all: any[] = []; let p = 1;
      for (let guard = 0; guard < 200; guard++) {
        const r = await api.get('/store/bank-imports', { params: { status: 'pending', page: p } });
        const rws = r.data.rows || [];
        all = all.concat(rws);
        const tot = r.data.total || 0;
        if (rws.length === 0 || all.length >= tot) break;
        p++;
      }
      const targets = all.filter((x) => x.suggestedOrderId && !x.orderId);
      if (targets.length === 0) { toast('İşlenecek eşleşme bulunamadı'); setBulkBusy(false); return; }
      let ok = 0, fail = 0;
      for (const t of targets) {
        try { await api.post(`/store/bank-imports/${t.id}/match`, { orderId: t.suggestedOrderId }); ok++; }
        catch { fail++; }
      }
      toast.success(`${ok} ödeme işlendi${fail ? ` · ${fail} başarısız` : ''}`);
      load(); loadPendingCount();
    } catch (e: any) { toast.error(apiErrorMessage(e)); } finally { setBulkBusy(false); }
  };

  const manualMatch = async (importId: string, orderId: string, sipNo: string) => {
    try { await api.post(`/store/bank-imports/${importId}/match`, { orderId }); toast.success(`${sipNo} siparişine ödeme işlendi`); setPickRow(null); load(); loadPendingCount(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const openOrder = (orderId: string) => {
    const o = orders.find((x: any) => x.id === orderId);
    if (o) onOpenDetail(o);
    else toast('Sipariş bulunamadı');
  };

  // Sipariş bilgisini bul (suggested veya matched)
  const findOrder = (orderId: string | null) => orderId ? orders.find((x: any) => x.id === orderId) : null;

  const markProcessed = async (id: string) => {
    if (!confirm('Bu ödemeyi "zaten işlenmiş" olarak işaretlemek istediğinize emin misiniz?')) return;
    try { await api.post(`/store/bank-imports/${id}/mark-processed`); toast.success('Zaten işlenmiş olarak işaretlendi'); load(); loadPendingCount(); } catch (e: any) { toast.error(apiErrorMessage(e)); }
  };

  const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '₺';

  return (
    <div>
      {/* Başlık + geri dön */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"><ChevronLeft size={16} /> Siparişlere Dön</button>
        <div className="flex items-center gap-2"><FileSpreadsheet size={20} className="text-violet-600" /><h2 className="text-lg font-bold text-slate-800">Excel ile Ödeme İşle</h2></div>
      </div>

      {/* Eşleşme bekliyor uyarısı */}
      {pendingCount > 0 && filter !== 'pending' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm flex-shrink-0">{pendingCount}</div>
          <div className="flex-1">
            <span className="text-sm font-medium text-orange-800">{pendingCount} adet eşleşme bulundu — onay bekliyor!</span>
          </div>
          <button onClick={() => { setFilter('pending'); setPage(1); }} className="px-3 py-1.5 text-xs font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700">Eşleşenleri Göster</button>
          <button onClick={processAllMatches} disabled={bulkBusy} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"><Check size={14} /> {bulkBusy ? 'İşleniyor...' : 'Tümünü Seç & İşle'}</button>
        </div>
      )}

      {/* Import alanı */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium cursor-pointer ${importing ? 'bg-violet-200 text-violet-400' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
            <Upload size={18} /> {importing ? 'İşleniyor...' : 'Excel Dosyası Yükle'}
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={importing} className="hidden" />
          </label>
          <span className="text-xs text-violet-600">Banka ekstresi dosyasını yükleyin — açıklamada sipariş numarası bulunanlar otomatik eşleştirilir, onay bekler.</span>
          <button onClick={async () => { try { const r = await api.post('/store/bank-imports/re-match'); toast.success(`${r.data.updated} yeni eşleşme bulundu (${r.data.total} kayıt tarandı)`); load(); loadPendingCount(); } catch (e: any) { toast.error(apiErrorMessage(e)); } }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg font-medium bg-orange-500 text-white hover:bg-orange-600 text-sm whitespace-nowrap"><RefreshCw size={16} /> Yeniden Eşleştir</button>
        </div>
        {lastResult && (
          <div className="mt-3 text-sm text-violet-800 bg-violet-100 rounded-lg px-3 py-2">
            <strong>{lastResult.imported}</strong> satır import edildi · <strong>{lastResult.matched}</strong> eşleşme bulundu · <strong>{lastResult.skippedDuplicates}</strong> mükerrer atlandı
            {lastResult.matched > 0 && <span className="ml-2 text-orange-600 font-medium">— Eşleşenler onayınızı bekliyor</span>}
          </div>
        )}
      </div>

      {/* Filtreler */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {(['all', 'pending', 'matched', 'recent', 'free', ...(isOwner ? ['silinmis'] as const : [])] as const).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); setSelIds(new Set()); }} className={`px-3 py-1.5 text-xs font-medium rounded-md ${filter === f ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>{f === 'all' ? 'Tümü' : f === 'pending' ? `Eşleşme Bekliyor${pendingCount ? ` (${pendingCount})` : ''}` : f === 'matched' ? 'İşlendi' : f === 'recent' ? 'Son Eşleşenler' : f === 'silinmis' ? 'Silinmiş Kayıtlar' : 'Serbest'}</button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Ref no, açıklama, sipariş no..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg" />
        </div>
        <span className="text-xs text-slate-400">{total} kayıt</span>
      </div>
      {/* Tarih filtresi + sıralama */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">Tarih:</span>
          <input type="date" value={basTarih} onChange={(e) => { setBasTarih(e.target.value); setPage(1); }} className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
          <span className="text-xs text-slate-400">—</span>
          <input type="date" value={bitTarih} onChange={(e) => { setBitTarih(e.target.value); setPage(1); }} className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg" />
          {(basTarih || bitTarih) && <button onClick={() => { setBasTarih(''); setBitTarih(''); setPage(1); }} className="text-xs text-rose-500 hover:text-rose-700">Temizle</button>}
        </div>
        <button onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50">
          {sortDir === 'desc' ? '↓ En yeni önce' : '↑ En eski önce'}
        </button>
      </div>

      {/* Eşleşme bekliyor filtresinde toplu işlem barı */}
      {filter === 'pending' && pendingCount > 0 && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
          <span className="text-sm font-medium text-emerald-800">{pendingCount} eşleşen ödeme önerilen siparişlere işlenmeye hazır.</span>
          <button onClick={processAllMatches} disabled={bulkBusy} className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"><Check size={16} /> {bulkBusy ? 'İşleniyor...' : 'Tüm Eşleşenleri Seç & İşle'}</button>
        </div>
      )}

      {/* Toplu seçim / silme barı (yalnız patron) */}
      {isOwner && rows.length > 0 && (
        <div className="flex items-center gap-3 mb-2 text-sm">
          <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-600"><input type="checkbox" checked={allRowsSelected} onChange={toggleSelAllRows} /> Tümünü Seç</label>
          {selIds.size > 0 && <button onClick={bulkDelete} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700"><X size={13} /> Seçili {selIds.size} Kaydı Sil</button>}
        </div>
      )}

      {/* Liste — her ödeme hareketi bir kart */}
      <div className="space-y-2">
        {loading ? <div className="py-12 text-center text-slate-400">Yükleniyor...</div>
         : rows.length === 0 ? <div className="py-12 text-center text-slate-400">Kayıt bulunamadı</div>
         : rows.map((r) => {
          const matchedOrder = findOrder(r.orderId);
          const suggestedOrder = !r.orderId ? findOrder(r.suggestedOrderId) : null;
          const targetOrder = matchedOrder || suggestedOrder;
          const kalan = targetOrder ? (Number(targetOrder.toplam) || 0) - (Number(targetOrder.tahsilat) || 0) : 0;

          return (
            <div key={r.id} className={`bg-white border rounded-xl p-3 ${r.deletedAt ? 'border-slate-200 opacity-60' : r.orderId ? 'border-green-200' : r.suggestedOrderId ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200'}`}>
              {r.deletedAt && <div className="mb-1.5 text-[11px] font-medium text-rose-600">Silindi — {r.deletedBy || 'bilinmiyor'}</div>}
              <div className={`flex items-start gap-3 ${r.deletedAt ? 'line-through text-slate-400' : ''}`}>
                {isOwner && !r.deletedAt && <input type="checkbox" checked={selIds.has(r.id)} onChange={() => toggleSelRow(r.id)} className="mt-1" />}
                {/* Sol: Ödeme bilgisi */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-emerald-700 text-sm">{fmt(r.tutar)}</span>
                    <span className="text-xs text-slate-400">{r.tarih}{r.saat ? ` ${r.saat}` : ''}</span>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{r.refNo}</span>
                    {r.orderId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">İşlendi</span>}
                    {r.processedAt && <span className="text-[10px] text-slate-400">İşlem: {new Date(r.processedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    {!r.orderId && r.suggestedOrderId && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium border border-orange-200">Eşleşme Bulundu</span>}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 truncate" title={r.aciklama}>{r.aciklama}</p>
                </div>

                {/* Orta: Eşleşen/İşlenen sipariş bilgisi */}
                {targetOrder ? (
                  <div className={`flex-shrink-0 rounded-lg px-3 py-2 min-w-[200px] cursor-pointer hover:shadow-md transition-shadow ${r.orderId ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`} onClick={() => onOpenDetail(targetOrder)}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{targetOrder.sipNo || orderLabel(targetOrder)}</span>
                      {r.orderId ? <CheckCircle size={14} className="text-green-600" /> : <AlertCircle size={14} className="text-orange-500" />}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{targetOrder.customer?.ad || targetOrder.musteriHandle || '-'}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400">Toplam: {fmt(Number(targetOrder.toplam) || 0)}</span>
                      {kalan > 0.01 && <span className="text-[10px] text-red-500 font-medium">Kalan: {fmt(kalan)}</span>}
                    </div>
                    <span className="text-[10px] text-blue-500 mt-0.5 inline-block">Detay için tıkla →</span>
                  </div>
                ) : (
                  <div className="flex-shrink-0 rounded-lg px-3 py-2 min-w-[200px] bg-slate-50 border border-dashed border-slate-300 text-center">
                    <span className="text-xs text-slate-400">Eşleşen sipariş yok</span>
                  </div>
                )}

                {/* Sağ: İşlem butonları */}
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {r.deletedAt ? null : (<>
                  {r.orderId ? (
                    <button onClick={() => release(r.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50"><X size={12} /> İşlem İptal</button>
                  ) : r.suggestedOrderId ? (<>
                    <button onClick={() => confirmMatch(r.id, r.suggestedOrderId, r.suggestedSipNo || '?')} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><Check size={12} /> Onayla & İşle</button>
                    <button onClick={() => setPickRow(r)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"><Search size={12} /> Başka Sepet Seç</button>
                    <button onClick={() => markProcessed(r.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50"><Ban size={12} /> Zaten İşlenmiş</button>
                  </>) : (<>
                    <button onClick={() => setPickRow(r)} className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50"><Search size={12} /> Sepet Seç & İşle</button>
                    <button onClick={() => markProcessed(r.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50"><Ban size={12} /> Zaten İşlenmiş</button>
                  </>)}
                  {isOwner && <button onClick={() => removeRow(r.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium border border-rose-300 text-rose-700 rounded-lg hover:bg-rose-50"><X size={12} /> Sil</button>}
                  </>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {total > 100 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 border rounded disabled:opacity-30">&laquo;</button>
          <span className="text-sm text-slate-600">{page} / {Math.ceil(total / 100)}</span>
          <button disabled={page >= Math.ceil(total / 100)} onClick={() => setPage(page + 1)} className="px-3 py-1 border rounded disabled:opacity-30">&raquo;</button>
        </div>
      )}

      {/* Sepet Seçici Modal */}
      {pickRow && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30" onClick={() => setPickRow(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">Sepet Seç — Ödeme Eşleştir</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Tutar: <span className="font-medium text-emerald-600">{pickRow.tutar?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺</span> · Ref: <span className="font-mono">{pickRow.refNo}</span></p>
              </div>
              <button onClick={() => setPickRow(null)} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><X size={16} /></button>
            </div>
            <div className="px-4 py-2 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder="Sipariş no, müşteri adı, kullanıcı adı veya telefon ile ara..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg" autoFocus />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {orders
                .filter((o: any) => {
                  if (!pickQ) return o.durum === 'sepet';
                  const s = pickQ.toLowerCase().replace(/^@/, '').trim();
                  const qd = pickQ.replace(/\D/g, '');
                  const insta = String(o.customer?.instagram || o.musteriHandle || '').toLowerCase().replace(/^@/, '');
                  const tel = String(o.customer?.telefon || '').replace(/\D/g, '');
                  return (o.sipNo || '').toLowerCase().includes(s)
                    || (o.customer?.ad || o.musteriHandle || '').toLowerCase().includes(s)
                    || insta.includes(s)
                    || (qd.length >= 3 && tel.includes(qd));
                })
                .filter((o: any) => o.durum === 'sepet')
                .slice(0, 50)
                .map((o: any) => {
                  const kalan = (Number(o.toplam) || 0) - (Number(o.tahsilat) || 0);
                  const isSuggested = pickRow.suggestedOrderId === o.id;
                  return (
                    <div key={o.id} className={`px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer ${isSuggested ? 'bg-orange-50/50' : ''}`} onClick={() => manualMatch(pickRow.id, o.id, o.sipNo || orderLabel(o))}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-700">{o.sipNo || orderLabel(o)}</span>
                          {isSuggested && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">Önerilen</span>}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${kalan > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{kalan > 0 ? `Kalan: ${kalan.toFixed(2)}₺` : 'Ödendi'}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">{o.customer?.ad || o.musteriHandle || '-'}{(o.customer?.instagram || o.musteriHandle) && <span className="text-pink-500"> · @{String(o.customer?.instagram || o.musteriHandle).replace(/^@/, '')}</span>} · {(Number(o.toplam) || 0).toFixed(2)}₺</div>
                      </div>
                      <Check size={16} className="text-emerald-500 flex-shrink-0 ml-2" />
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Adres Bilgisi Talebi: adresi eksik müşterilere Meta onaylı şablon gönderir
function AdresTalebiModal({ recipients, onClose }: { recipients: { ad: string; phone: string }[]; onClose: () => void }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [tplId, setTplId] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { api.get('/whatsapp/templates').then((r) => setTemplates((r.data?.templates || []).filter((t: any) => t.status === 'approved'))).catch((e) => toast.error(apiErrorMessage(e))); }, []);
  const uniq = Array.from(new Map(recipients.map((r) => [String(r.phone).replace(/\D/g, ''), r])).values()).filter((r) => String(r.phone).replace(/\D/g, '').length >= 10);
  const gonder = async () => {
    if (!tplId) { toast.error('Onaylı şablon seçin'); return; }
    if (uniq.length === 0) { toast.error('Telefonu olan adresi eksik müşteri yok'); return; }
    setSending(true); let ok = 0;
    for (const r of uniq) { try { await api.post('/whatsapp/send', { phone: String(r.phone).replace(/\D/g, ''), templateId: tplId, channel: 'api' }); ok++; } catch { /* */ } }
    setSending(false); onClose(); toast.success(`${ok}/${uniq.length} müşteriye adres bilgisi talebi gönderildi`);
  };
  return (
    <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><p className="font-bold text-slate-800">Adres Bilgisi Talebi</p><button onClick={onClose} className="text-slate-400"><X size={18} /></button></div>
        <p className="text-xs text-slate-500 mb-2">Adresi eksik ve telefonu olan <b>{uniq.length}</b> müşteriye onaylı şablon gönderilecek.</p>
        <label className="block text-xs text-slate-400 mb-1">Meta Onaylı Şablon</label>
        <select value={tplId} onChange={(e) => setTplId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm mb-3"><option value="">Şablon seçin...</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name || t.baslik || t.id}</option>)}</select>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-3 py-2 text-sm border border-slate-200 rounded-lg">İptal</button><button onClick={gonder} disabled={sending} className="px-4 py-2 text-sm font-medium bg-rose-600 text-white rounded-lg disabled:opacity-50">{sending ? 'Gönderiliyor...' : 'Gönder'}</button></div>
      </div>
    </div>
  );
}
