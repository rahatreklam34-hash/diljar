import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Filter, Download, Search, ChevronDown, ChevronUp,
  CheckSquare, Square, X, Send, Plus, Trash2, Tag,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
  MessageSquare, Calendar, AlertTriangle, Bookmark, Play, Eye
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import * as XLSX from 'xlsx';

/* ─── UTILS ─── */
const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const daysBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 86400000;
const VALID = (o: any) => o.durum !== 'iptal' && o.durum !== 'sepet';

/* ─── ETİKET (TAG) SİSTEMİ ─── */
const TAG_LS_KEY = 'wtech_customer_tags';
export interface CustomerTag {
  key: string; label: string; color: string;
  customerIds: string[]; createdAt: string;
}
export function loadCustomerTags(): CustomerTag[] {
  try { return JSON.parse(localStorage.getItem(TAG_LS_KEY) || '[]'); } catch { return []; }
}
export function saveCustomerTags(tags: CustomerTag[]) {
  localStorage.setItem(TAG_LS_KEY, JSON.stringify(tags));
}

/* ─── KAMPANYA SİSTEMİ ─── */
const CAMP_LS_KEY = 'wtech_campaigns';
interface FilterState {
  period: string; bedenler: string[]; kategoriler: string[]; cinsiyetler: string[];
  markalar: string[]; sehirler: string[]; musteriTipler: string[];
  minCiro: string; maxCiro: string; kayipTarih: string; tagKey: string;
}
export interface Campaign {
  key: string; label: string; color: string; filters: FilterState;
  createdAt: string; description: string;
}
function loadCampaigns(): Campaign[] {
  try { return JSON.parse(localStorage.getItem(CAMP_LS_KEY) || '[]'); } catch { return []; }
}
function saveCampaigns(c: Campaign[]) { localStorage.setItem(CAMP_LS_KEY, JSON.stringify(c)); }

// Eski segment uyumluluğu
const SEG_LS = 'wtech_custom_segments';
export interface SegmentRule { field: string; op: string; value: string; }
export interface CustomSegment { key: string; label: string; color: string; rules: SegmentRule[]; createdAt: string; }
export function loadCustomSegments(): CustomSegment[] { try { return JSON.parse(localStorage.getItem(SEG_LS) || '[]'); } catch { return []; } }
export function saveCustomSegments(s: CustomSegment[]) { localStorage.setItem(SEG_LS, JSON.stringify(s)); }
export function evalRule(r: SegmentRule, c: Record<string, any>): boolean {
  const v = c[r.field]; const num = Number(r.value) || 0;
  if (r.op === 'gte') return Number(v) >= num; if (r.op === 'lte') return Number(v) <= num;
  if (r.op === 'gt') return Number(v) > num; if (r.op === 'lt') return Number(v) < num;
  if (r.op === 'eq') return String(v).toLowerCase() === String(r.value).toLowerCase();
  if (r.op === 'contains') return String(v).toLowerCase().includes(String(r.value).toLowerCase());
  return true;
}
export function evalSegment(seg: CustomSegment, c: Record<string, any>): boolean { return seg.rules.every(r => evalRule(r, c)); }

const TAG_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];
const GENDER_LABEL: Record<string, string> = { kadin: 'Kadın', erkek: 'Erkek', cocuk: 'Çocuk', unisex: 'Unisex' };

/* ─── TYPES ─── */
interface CustRow {
  id: string; ad: string; username: string; telefon: string; segment: string;
  sehir: string; sipSayisi: number; ciro: number; ortSip: number;
  sonSip: string; ilkSip: string; ltv: number; sonSipGun: number; ilkSipGun: number;
  iadeSayisi: number; topMarka: string; topKategori: string;
  bedenler: string[]; cinsiyetler: string[]; tags: string[];
}

type SortKey = keyof CustRow;
const COLUMNS: { key: SortKey; label: string; right?: boolean; w?: string }[] = [
  { key: 'ad', label: 'Müşteri', w: 'min-w-[160px]' },
  { key: 'telefon', label: 'Telefon', w: 'min-w-[120px]' },
  { key: 'segment', label: 'Segment', w: 'min-w-[90px]' },
  { key: 'sehir', label: 'Şehir', w: 'min-w-[100px]' },
  { key: 'sipSayisi', label: 'Sipariş', right: true },
  { key: 'ciro', label: 'Harcama', right: true },
  { key: 'ortSip', label: 'Ort. Sipariş', right: true },
  { key: 'ltv', label: 'LTV', right: true },
  { key: 'iadeSayisi', label: 'İade', right: true },
  { key: 'sonSip', label: 'Son Sipariş', w: 'min-w-[95px]' },
  { key: 'ilkSip', label: 'İlk Sipariş', w: 'min-w-[95px]' },
  { key: 'topMarka', label: 'Marka', w: 'min-w-[100px]' },
  { key: 'topKategori', label: 'Kategori', w: 'min-w-[100px]' },
];

const EMPTY_FILTERS: FilterState = {
  period: 'all', bedenler: [], kategoriler: [], cinsiyetler: [],
  markalar: [], sehirler: [], musteriTipler: [],
  minCiro: '', maxCiro: '', kayipTarih: '', tagKey: 'all',
};

/* ─── MAIN ─── */
export default function MusteriDavranislari() {
  const { orders, products, categories, customers, brands } = useStore();
  const navigate = useNavigate();

  /* ── Filters ── */
  const [filters, setFilters] = useState<FilterState>({ ...EMPTY_FILTERS });
  const setF = <K extends keyof FilterState>(key: K, val: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: val }));
    setPage(0);
  };
  const toggleArr = (key: 'bedenler' | 'kategoriler' | 'cinsiyetler' | 'markalar' | 'sehirler' | 'musteriTipler', val: string) => {
    setFilters(prev => {
      const arr = prev[key] as string[];
      return { ...prev, [key]: arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val] };
    });
    setPage(0);
  };

  /* Table */
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ciro');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [perPage, setPerPage] = useState(50);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(COLUMNS.map(c => c.key)));
  const [colPickerOpen, setColPickerOpen] = useState(false);

  /* Tags */
  const [customerTags, setCustomerTags] = useState<CustomerTag[]>(loadCustomerTags);
  const [tagModal, setTagModal] = useState(false);
  const [tagLabel, setTagLabel] = useState('');
  const [tagColor, setTagColor] = useState(TAG_COLORS[0]);

  /* Campaigns */
  const [campaigns, setCampaigns] = useState<Campaign[]>(loadCampaigns);
  const [campModal, setCampModal] = useState(false);
  const [campLabel, setCampLabel] = useState('');
  const [campDesc, setCampDesc] = useState('');
  const [campColor, setCampColor] = useState(TAG_COLORS[0]);
  const [showCampaigns, setShowCampaigns] = useState(false);

  /* Beden picker */
  const [bedenOpen, setBedenOpen] = useState(false);
  const [katOpen, setKatOpen] = useState(false);
  const [cinsOpen, setCinsOpen] = useState(false);
  const [markaOpen, setMarkaOpen] = useState(false);

  const prodMap = useMemo(() => new Map(products.map((p: any) => [p.id, p])), [products]);
  const catMap = useMemo(() => new Map(categories.map((c: any) => [c.id, c.ad])), [categories]);
  const brandNames = useMemo(() => brands.map((b: any) => b.ad || b.name || b.id).sort(), [brands]);
  const catList = useMemo(() => categories.map((c: any) => ({ id: c.id, ad: c.ad })).sort((a: any, b: any) => (a.ad || '').localeCompare(b.ad || '', 'tr')), [categories]);
  const cityList = useMemo(() => {
    const s = new Set<string>(); customers.forEach((c: any) => { if (c.sehir) s.add(c.sehir); }); return [...s].sort();
  }, [customers]);

  /* ── Beden listesi: sipariş kalemlerinden + ürün varyasyonlarından ── */
  const bedenList = useMemo(() => {
    const s = new Set<string>();
    // Sipariş kalemlerinden
    orders.forEach((o: any) => {
      if (!VALID(o)) return;
      // Order seviyesinde beden (canlı yayın siparişleri)
      if (o.beden) s.add(String(o.beden).trim());
      if (o.variation) s.add(String(o.variation).trim());
      // Item seviyesinde varyasyon
      (o.items || []).forEach((it: any) => {
        if (it.varyasyon) s.add(String(it.varyasyon).trim());
        if (it.beden) s.add(String(it.beden).trim());
        if (it.variation) s.add(String(it.variation).trim());
      });
    });
    // Ürün varyasyonlarından
    products.forEach((p: any) => {
      (p.variations || []).forEach((v: any) => {
        if (v.deger) s.add(String(v.deger).trim());
      });
    });
    // Parantezli bedenleri temizle: "XL (beden)" -> "XL"
    const clean = new Set<string>();
    s.forEach(b => {
      const m = b.match(/^(.+?)\s*\(.*?\)\s*$/);
      clean.add(m ? m[1].trim() : b);
    });
    return [...clean].filter(Boolean).sort((a, b) => {
      const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL'];
      const ia = order.indexOf(a.toUpperCase()), ib = order.indexOf(b.toUpperCase());
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1; if (ib >= 0) return 1;
      return a.localeCompare(b, 'tr', { numeric: true });
    });
  }, [orders, products]);

  /* Cinsiyet listesi */
  const cinsiyetList = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p: any) => { if (p.cinsiyet) s.add(String(p.cinsiyet).trim()); });
    return [...s].sort();
  }, [products]);

  /* Tag map */
  const tagMap = useMemo(() => {
    const m = new Map<string, string[]>();
    customerTags.forEach(t => t.customerIds.forEach(id => {
      const arr = m.get(id) || []; arr.push(t.key); m.set(id, arr);
    }));
    return m;
  }, [customerTags]);

  /* ── Period to date range ── */
  const periodDateFrom = useMemo(() => {
    if (filters.period === 'all') return null;
    const d = new Date();
    if (filters.period === '1w') d.setDate(d.getDate() - 7);
    else if (filters.period === '1m') d.setMonth(d.getMonth() - 1);
    else if (filters.period === '3m') d.setMonth(d.getMonth() - 3);
    else if (filters.period === '6m') d.setMonth(d.getMonth() - 6);
    else if (filters.period === '1y') d.setFullYear(d.getFullYear() - 1);
    return d;
  }, [filters.period]);

  /* ── BUILD ROWS (filtresiz) ── */
  const rawRows = useMemo(() => {
    const custMap = new Map(customers.map((c: any) => [c.id, c]));
    const validOrders = orders.filter((o: any) => {
      if (!VALID(o)) return false;
      if (periodDateFrom && new Date(o.createdAt) < periodDateFrom) return false;
      return true;
    });
    const pc = new Map<string, {
      sipDates: Date[]; ciro: number; iadeSayisi: number;
      markalar: Map<string, number>; kategoriler: Map<string, number>;
      bedenler: Set<string>; cinsiyetler: Set<string>;
    }>();
    for (const o of validOrders) {
      const cid = o.customerId || '__misafir';
      const dt = new Date(o.createdAt);
      const cd = pc.get(cid) || { sipDates: [] as Date[], ciro: 0, iadeSayisi: 0, markalar: new Map<string, number>(), kategoriler: new Map<string, number>(), bedenler: new Set<string>(), cinsiyetler: new Set<string>() };
      cd.sipDates.push(dt);
      if (o.durum === 'iade') cd.iadeSayisi++;
      // Order level beden (canlı yayın)
      if (o.beden) cd.bedenler.add(String(o.beden).trim());
      if (o.variation) cd.bedenler.add(String(o.variation).trim());
      for (const it of (o.items || [])) {
        const adet = Number(it.adet) || 1;
        const fiyat = Number(it.fiyat) || 0;
        cd.ciro += fiyat * adet;
        const p: any = prodMap.get(it.productId);
        const marka = p?.marka || '';
        const katId = p?.kategoriId || '';
        const katAd = katId ? (catMap.get(katId) || '') : '';
        if (marka) cd.markalar.set(marka, (cd.markalar.get(marka) || 0) + adet);
        if (katAd) cd.kategoriler.set(katAd, (cd.kategoriler.get(katAd) || 0) + adet);
        // Item level beden: varyasyon alanı (backend varyasyon olarak kaydediyor)
        const beden = it.varyasyon || it.beden || it.variation;
        if (beden) {
          const clean = String(beden).trim();
          const m = clean.match(/^(.+?)\s*\(.*?\)\s*$/);
          cd.bedenler.add(m ? m[1].trim() : clean);
        }
        if (p?.cinsiyet) cd.cinsiyetler.add(String(p.cinsiyet).trim());
      }
      pc.set(cid, cd);
    }
    const rows: CustRow[] = [];
    for (const [cid, cd] of pc) {
      if (cid === '__misafir') continue;
      const c = custMap.get(cid); if (!c) continue;
      const dates = cd.sipDates.sort((a, b) => a.getTime() - b.getTime());
      const ilk = dates[0]; const son = dates[dates.length - 1];
      const sipSayisi = dates.length;
      const sonGun = daysBetween(new Date(), son);
      const topMarka = [...cd.markalar.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      const topKat = [...cd.kategoriler.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      let segment = 'Normal';
      if (cd.ciro >= 10000) segment = 'VIP';
      else if (sipSayisi >= 5) segment = 'Sadık';
      else if (sonGun > 90) segment = 'Kaybedilen';
      else if (sonGun > 60) segment = 'Riskli';
      else if (sipSayisi === 1 && daysBetween(new Date(), ilk) <= 30) segment = 'Yeni';
      rows.push({
        id: cid, ad: c.ad || c.instagram || 'Misafir', username: c.instagram || c.telefon || '-',
        telefon: c.telefon || '', segment, sehir: c.sehir || '-', sipSayisi, ciro: cd.ciro,
        ortSip: sipSayisi ? cd.ciro / sipSayisi : 0,
        sonSip: son.toLocaleDateString('tr-TR'), ilkSip: ilk.toLocaleDateString('tr-TR'),
        ltv: cd.ciro, sonSipGun: sonGun, ilkSipGun: daysBetween(new Date(), ilk),
        iadeSayisi: cd.iadeSayisi, topMarka, topKategori: topKat,
        bedenler: [...cd.bedenler], cinsiyetler: [...cd.cinsiyetler],
        tags: tagMap.get(cid) || [],
      });
    }
    return rows;
  }, [orders, products, categories, customers, brands, prodMap, catMap, periodDateFrom, tagMap]);

  /* ── Dinamik filtre sayaçları (rawRows üzerinden) ── */
  const filterCounts = useMemo(() => {
    const beden = new Map<string, number>();
    const kategori = new Map<string, number>();
    const cinsiyet = new Map<string, number>();
    const marka = new Map<string, number>();
    const sehir = new Map<string, number>();
    const tip = new Map<string, number>();
    rawRows.forEach(r => {
      r.bedenler.forEach(b => beden.set(b, (beden.get(b) || 0) + 1));
      if (r.topKategori !== '-') kategori.set(r.topKategori, (kategori.get(r.topKategori) || 0) + 1);
      r.cinsiyetler.forEach(c => cinsiyet.set(c, (cinsiyet.get(c) || 0) + 1));
      if (r.topMarka !== '-') marka.set(r.topMarka, (marka.get(r.topMarka) || 0) + 1);
      if (r.sehir !== '-') sehir.set(r.sehir, (sehir.get(r.sehir) || 0) + 1);
      tip.set(r.segment.toLowerCase(), (tip.get(r.segment.toLowerCase()) || 0) + 1);
    });
    return { beden, kategori, cinsiyet, marka, sehir, tip };
  }, [rawRows]);

  /* ── APPLY FILTERS ── */
  const allRows = useMemo(() => {
    return rawRows.filter(r => {
      if (filters.bedenler.length > 0 && !filters.bedenler.some(b => r.bedenler.includes(b))) return false;
      if (filters.kategoriler.length > 0 && !filters.kategoriler.includes(r.topKategori)) return false;
      if (filters.cinsiyetler.length > 0 && !filters.cinsiyetler.some(c => r.cinsiyetler.includes(c))) return false;
      if (filters.markalar.length > 0 && !filters.markalar.includes(r.topMarka)) return false;
      if (filters.sehirler.length > 0 && !filters.sehirler.includes(r.sehir)) return false;
      if (filters.musteriTipler.length > 0 && !filters.musteriTipler.includes(r.segment.toLowerCase())) return false;
      if (filters.minCiro && r.ciro < Number(filters.minCiro)) return false;
      if (filters.maxCiro && r.ciro > Number(filters.maxCiro)) return false;
      if (filters.kayipTarih) {
        const kayipDate = new Date(filters.kayipTarih);
        const sonDate = r.sonSip.split('.').reverse().join('-');
        if (new Date(sonDate) >= kayipDate) return false;
      }
      if (filters.tagKey !== 'all' && !r.tags.includes(filters.tagKey)) return false;
      return true;
    });
  }, [rawRows, filters]);

  /* ── SEARCH + SORT ── */
  const tableRows = useMemo(() => {
    let rows = allRows;
    if (search) { const q = search.toLowerCase(); rows = rows.filter(r => r.ad.toLowerCase().includes(q) || r.username.toLowerCase().includes(q) || r.telefon.includes(q) || r.sehir.toLowerCase().includes(q) || r.bedenler.some(b => b.toLowerCase().includes(q))); }
    return [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [allRows, search, sortKey, sortDir]);

  const totalPages = Math.ceil(tableRows.length / perPage);
  const pageRows = tableRows.slice(page * perPage, (page + 1) * perPage);

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('desc'); } setPage(0); };
  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => { if (selected.size === pageRows.length && pageRows.length > 0) setSelected(new Set()); else setSelected(new Set(pageRows.map(r => r.id))); };
  const selectFiltered = () => setSelected(new Set(tableRows.map(r => r.id)));

  const hasFilter = filters.period !== 'all' || filters.bedenler.length > 0 || filters.kategoriler.length > 0 || filters.cinsiyetler.length > 0 || filters.markalar.length > 0 || filters.sehirler.length > 0 || filters.musteriTipler.length > 0 || filters.minCiro || filters.maxCiro || filters.kayipTarih || filters.tagKey !== 'all';
  const clearFilters = () => { setFilters({ ...EMPTY_FILTERS }); setPage(0); };
  const activeFilterCount = [
    filters.period !== 'all', filters.bedenler.length > 0, filters.kategoriler.length > 0,
    filters.cinsiyetler.length > 0, filters.markalar.length > 0, filters.sehirler.length > 0,
    filters.musteriTipler.length > 0, !!filters.minCiro || !!filters.maxCiro, !!filters.kayipTarih,
    filters.tagKey !== 'all',
  ].filter(Boolean).length;

  /* ── EXCEL ── */
  const exportExcel = useCallback(() => {
    const source = selected.size > 0 ? tableRows.filter(r => selected.has(r.id)) : tableRows;
    const data = source.map(r => ({
      'Müşteri': r.ad, 'Telefon': r.telefon, 'Segment': r.segment, 'Şehir': r.sehir,
      'Sipariş': r.sipSayisi, 'Harcama': r.ciro, 'Ort. Sipariş': Math.round(r.ortSip),
      'LTV': Math.round(r.ltv), 'İade': r.iadeSayisi, 'Son Sipariş': r.sonSip,
      'İlk Sipariş': r.ilkSip, 'Marka': r.topMarka, 'Kategori': r.topKategori,
      'Bedenler': r.bedenler.join(', '),
      'Etiketler': r.tags.map(tk => customerTags.find(t => t.key === tk)?.label || '').filter(Boolean).join(', ')
    }));
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Müşteriler'); XLSX.writeFile(wb, 'musteri-listesi.xlsx');
  }, [tableRows, selected, customerTags]);

  /* ── TAG CRUD ── */
  function openTagModal() { setTagLabel(''); setTagColor(TAG_COLORS[customerTags.length % TAG_COLORS.length]); setTagModal(true); }
  function saveTag() {
    if (!tagLabel.trim()) return;
    const ids = selected.size > 0 ? [...selected] : tableRows.map(r => r.id);
    const key = 'tag_' + Date.now();
    const tag: CustomerTag = { key, label: tagLabel.trim(), color: tagColor, customerIds: ids, createdAt: new Date().toISOString() };
    const next = [...customerTags, tag];
    setCustomerTags(next); saveCustomerTags(next); setTagModal(false); setSelected(new Set());
  }
  function deleteTag(key: string) {
    const next = customerTags.filter(t => t.key !== key);
    setCustomerTags(next); saveCustomerTags(next);
    if (filters.tagKey === key) setF('tagKey', 'all');
  }
  function addToTag(tagKey: string) {
    const ids = selected.size > 0 ? [...selected] : tableRows.map(r => r.id);
    const next = customerTags.map(t => t.key === tagKey ? { ...t, customerIds: [...new Set([...t.customerIds, ...ids])] } : t);
    setCustomerTags(next); saveCustomerTags(next); setSelected(new Set());
  }

  /* ── CAMPAIGN CRUD ── */
  function openCampModal() { setCampLabel(''); setCampDesc(''); setCampColor(TAG_COLORS[campaigns.length % TAG_COLORS.length]); setCampModal(true); }
  function saveCampaign() {
    if (!campLabel.trim()) return;
    const key = 'camp_' + Date.now();
    const camp: Campaign = { key, label: campLabel.trim(), color: campColor, filters: { ...filters }, createdAt: new Date().toISOString(), description: campDesc };
    const next = [...campaigns, camp];
    setCampaigns(next); saveCampaigns(next); setCampModal(false);
  }
  function loadCampaign(camp: Campaign) { setFilters({ ...camp.filters }); setPage(0); }
  function deleteCampaign(key: string) {
    const next = campaigns.filter(c => c.key !== key);
    setCampaigns(next); saveCampaigns(next);
  }

  /* ── SEND ── */
  function sendPhones(channel: 'whatsapp' | 'sms') {
    const source = selected.size > 0 ? tableRows.filter(r => selected.has(r.id)) : tableRows;
    const phones = source.map(r => r.telefon).filter(Boolean);
    if (!phones.length) return;
    navigate(`/whatsapp/toplu-mesaj?phones=${phones.join(',')}&channel=${channel}`);
  }
  function sendTagPhones(tagKey: string, channel: 'whatsapp' | 'sms') {
    navigate(`/whatsapp/toplu-mesaj?tag=${tagKey}&channel=${channel}`);
  }

  /* ── SUMMARY ── */
  const totalCiro = tableRows.reduce((s, r) => s + r.ciro, 0);
  const avgSip = tableRows.length > 0 ? totalCiro / tableRows.reduce((s, r) => s + r.sipSayisi, 0) : 0;

  const periodBtns = [
    { key: 'all', label: 'Tümü' }, { key: '1w', label: '1 Hafta' }, { key: '1m', label: '1 Ay' },
    { key: '3m', label: '3 Ay' }, { key: '6m', label: '6 Ay' }, { key: '1y', label: '1 Yıl' },
  ];

  const chipCls = (active: boolean) => `px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer select-none ${active ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-600' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`;

  return (
    <div className="space-y-3 p-4">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20"><Users className="text-white" size={20} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Müşteri Listesi & Etiketleme</h1>
            <p className="text-xs text-slate-400">Filtrele, listele, etiketle, kampanya yönet</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-medium">{rawRows.length} toplam</span>
          {hasFilter && <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold">{tableRows.length} eşleşen</span>}
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-medium">{fmt(totalCiro)} ciro</span>
          {tableRows.length > 0 && <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 font-medium">Ort: {fmt(avgSip)}</span>}
        </div>
      </div>

      {/* ═══ KAMPANYALAR ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Bookmark size={14} className="text-amber-500" />
          <span className="text-xs font-semibold text-slate-600">Kampanyalar</span>
          <button onClick={openCampModal} disabled={!hasFilter} className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"><Plus size={10} /> Filtreden Kampanya Kaydet</button>
          {campaigns.length > 0 && <button onClick={() => setShowCampaigns(!showCampaigns)} className="ml-auto text-[10px] text-slate-400 hover:text-slate-600">{showCampaigns ? 'Gizle' : `${campaigns.length} kampanya`}</button>}
        </div>
        {(showCampaigns || campaigns.length <= 4) && campaigns.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {campaigns.map(camp => (
              <div key={camp.key} className="flex items-center gap-0 group">
                <button onClick={() => loadCampaign(camp)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 hover:shadow-sm transition" title={camp.description || ''}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: camp.color }} />
                  {camp.label}
                </button>
                <button onClick={() => { loadCampaign(camp); }} className="px-2 py-1.5 text-xs bg-slate-50 border-y border-slate-200 text-slate-400 hover:text-indigo-600 transition" title="Yükle"><Play size={11} /></button>
                <button onClick={() => deleteCampaign(camp.key)} className="px-1.5 py-1.5 text-xs rounded-r-lg bg-slate-50 border border-l-0 border-slate-200 text-slate-300 hover:text-red-500 transition opacity-0 group-hover:opacity-100" title="Sil"><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        )}
        {campaigns.length === 0 && <p className="text-[11px] text-slate-400">Filtre uygulayıp "Kampanya Kaydet" ile filtrelerinizi kaydedebilirsiniz.</p>}
      </div>

      {/* ═══ ETİKETLER ═══ */}
      {customerTags.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Tag size={14} className="text-indigo-500" />
            <span className="text-xs font-semibold text-slate-600">Etiketler</span>
          </div>
          <div className="flex gap-2 items-center overflow-x-auto pb-1 flex-wrap">
            {customerTags.map(tag => {
              const active = filters.tagKey === tag.key;
              return (
                <div key={tag.key} className="shrink-0 flex items-center gap-0 group">
                  <button onClick={() => { setF('tagKey', active ? 'all' : tag.key); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-xs font-medium transition-all ${active ? 'text-white shadow-sm' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:shadow-sm'}`}
                    style={active ? { backgroundColor: tag.color } : {}}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    {tag.label}
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white/25' : 'bg-slate-100'}`}>{tag.customerIds.length}</span>
                  </button>
                  <button onClick={() => sendTagPhones(tag.key, 'whatsapp')}
                    className={`px-2 py-1.5 text-xs transition-all border-y ${active ? 'text-white/70 hover:text-white border-transparent' : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-emerald-600'}`}
                    style={active ? { backgroundColor: tag.color } : {}} title="WhatsApp Gönder"><Send size={11} /></button>
                  <button onClick={() => deleteTag(tag.key)}
                    className={`px-1.5 py-1.5 text-xs rounded-r-lg transition-all ${active ? 'text-white/50 hover:text-white' : 'bg-slate-50 border border-l-0 border-slate-200 text-slate-300 hover:text-red-500'}`}
                    style={active ? { backgroundColor: tag.color } : {}} title="Sil"><Trash2 size={11} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ FİLTRE PANELİ ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Filtreler</span>
          {activeFilterCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold">{activeFilterCount}</span>}
          {hasFilter && <button onClick={clearFilters} className="text-[10px] text-red-500 hover:underline flex items-center gap-0.5"><X size={10} /> Tümünü Temizle</button>}
        </div>

        {/* Aktif filtre chip'leri */}
        {hasFilter && (
          <div className="flex flex-wrap gap-1.5">
            {filters.period !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-medium">
                <Calendar size={10} /> {periodBtns.find(p => p.key === filters.period)?.label}
                <button onClick={() => setF('period', 'all')} className="hover:text-red-600"><X size={10} /></button>
              </span>
            )}
            {filters.bedenler.map(b => (
              <span key={b} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium">
                Beden: {b}
                <button onClick={() => toggleArr('bedenler', b)} className="hover:text-red-600"><X size={10} /></button>
              </span>
            ))}
            {filters.kategoriler.map(k => (
              <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-medium">
                {k}
                <button onClick={() => toggleArr('kategoriler', k)} className="hover:text-red-600"><X size={10} /></button>
              </span>
            ))}
            {filters.cinsiyetler.map(c => (
              <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-[10px] font-medium">
                {GENDER_LABEL[c] || c}
                <button onClick={() => toggleArr('cinsiyetler', c)} className="hover:text-red-600"><X size={10} /></button>
              </span>
            ))}
            {filters.markalar.map(m => (
              <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
                {m}
                <button onClick={() => toggleArr('markalar', m)} className="hover:text-red-600"><X size={10} /></button>
              </span>
            ))}
            {(filters.minCiro || filters.maxCiro) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-medium">
                Harcama: {filters.minCiro || '0'} — {filters.maxCiro || '∞'}
                <button onClick={() => { setF('minCiro', ''); setF('maxCiro', ''); }} className="hover:text-red-600"><X size={10} /></button>
              </span>
            )}
            {filters.kayipTarih && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-medium">
                <AlertTriangle size={10} /> Kayıp: {new Date(filters.kayipTarih).toLocaleDateString('tr-TR')}
                <button onClick={() => setF('kayipTarih', '')} className="hover:text-red-600"><X size={10} /></button>
              </span>
            )}
          </div>
        )}

        {/* Son Alışveriş Dönemi */}
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Calendar size={11} /> Son Alışveriş Dönemi</label>
          <div className="flex gap-1.5 flex-wrap">
            {periodBtns.map(pb => (
              <button key={pb.key} onClick={() => setF('period', pb.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filters.period === pb.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
                {pb.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── BEDEN FİLTRESİ (Multi-select chips) ── */}
        <div>
          <button onClick={() => setBedenOpen(!bedenOpen)} className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5 flex items-center gap-1 hover:text-slate-600 transition w-full text-left">
            Satın Alınan Beden {filters.bedenler.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-violet-600 text-white text-[9px]">{filters.bedenler.length}</span>}
            {bedenOpen ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
          </button>
          {(bedenOpen || filters.bedenler.length > 0) && (
            <div className="flex gap-1.5 flex-wrap">
              {bedenList.map(b => {
                const count = filterCounts.beden.get(b) || 0;
                const active = filters.bedenler.includes(b);
                return (
                  <button key={b} onClick={() => toggleArr('bedenler', b)} className={chipCls(active)}>
                    {b} <span className={`text-[9px] ${active ? 'text-white/70' : 'text-slate-400'}`}>({count})</span>
                  </button>
                );
              })}
              {bedenList.length === 0 && <span className="text-[11px] text-slate-400">Beden verisi bulunamadı</span>}
            </div>
          )}
        </div>

        {/* ── KATEGORİ FİLTRESİ ── */}
        <div>
          <button onClick={() => setKatOpen(!katOpen)} className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5 flex items-center gap-1 hover:text-slate-600 transition w-full text-left">
            Satın Alınan Kategori {filters.kategoriler.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-cyan-600 text-white text-[9px]">{filters.kategoriler.length}</span>}
            {katOpen ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
          </button>
          {(katOpen || filters.kategoriler.length > 0) && (
            <div className="flex gap-1.5 flex-wrap">
              {catList.filter(c => filterCounts.kategori.has(c.ad)).map(c => {
                const count = filterCounts.kategori.get(c.ad) || 0;
                const active = filters.kategoriler.includes(c.ad);
                return (
                  <button key={c.id} onClick={() => toggleArr('kategoriler', c.ad)} className={chipCls(active)}>
                    {c.ad} <span className={`text-[9px] ${active ? 'text-white/70' : 'text-slate-400'}`}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── CİNSİYET FİLTRESİ ── */}
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5 block">Cinsiyet</label>
          <div className="flex gap-1.5 flex-wrap">
            {cinsiyetList.map(c => {
              const count = filterCounts.cinsiyet.get(c) || 0;
              const active = filters.cinsiyetler.includes(c);
              return (
                <button key={c} onClick={() => toggleArr('cinsiyetler', c)} className={chipCls(active)}>
                  {GENDER_LABEL[c] || c} <span className={`text-[9px] ${active ? 'text-white/70' : 'text-slate-400'}`}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── HARCAMA + KAYIP ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1 block">Harcama Min (₺)</label>
            <input type="number" value={filters.minCiro} onChange={e => setF('minCiro', e.target.value)} placeholder="0" className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1 block">Harcama Max (₺)</label>
            <input type="number" value={filters.maxCiro} onChange={e => setF('maxCiro', e.target.value)} placeholder="∞" className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1 flex items-center gap-1"><AlertTriangle size={10} className="text-amber-500" /> Kayıp Müşteriler</label>
            <input type="date" value={filters.kayipTarih} onChange={e => setF('kayipTarih', e.target.value)} className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" title="Bu tarihten sonra alışveriş yapmamış olanlar" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase mb-1 block">Müşteri Tipi</label>
            <div className="flex gap-1 flex-wrap">
              {['vip', 'sadık', 'yeni', 'riskli', 'kaybedilen', 'normal'].map(t => {
                const count = filterCounts.tip.get(t) || 0;
                const active = filters.musteriTipler.includes(t);
                return count > 0 ? (
                  <button key={t} onClick={() => toggleArr('musteriTipler', t)} className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all cursor-pointer ${active ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'}`}>
                    {t.charAt(0).toUpperCase() + t.slice(1)} ({count})
                  </button>
                ) : null;
              })}
            </div>
          </div>
        </div>

        {/* ── MARKA FİLTRESİ ── */}
        <div>
          <button onClick={() => setMarkaOpen(!markaOpen)} className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5 flex items-center gap-1 hover:text-slate-600 transition w-full text-left">
            Marka {filters.markalar.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-600 text-white text-[9px]">{filters.markalar.length}</span>}
            {markaOpen ? <ChevronUp size={11} className="ml-auto" /> : <ChevronDown size={11} className="ml-auto" />}
          </button>
          {(markaOpen || filters.markalar.length > 0) && (
            <div className="flex gap-1.5 flex-wrap">
              {brandNames.filter((b: string) => filterCounts.marka.has(b)).map((b: string) => {
                const count = filterCounts.marka.get(b) || 0;
                const active = filters.markalar.includes(b);
                return (
                  <button key={b} onClick={() => toggleArr('markalar', b)} className={chipCls(active)}>
                    {b} <span className={`text-[9px] ${active ? 'text-white/70' : 'text-slate-400'}`}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Kayıp müşteri bilgi */}
        {filters.kayipTarih && (
          <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
            <AlertTriangle size={14} />
            <span><b>{new Date(filters.kayipTarih).toLocaleDateString('tr-TR')}</b> tarihinden sonra alışveriş yapmamış müşteriler</span>
            <span className="font-bold ml-auto">{tableRows.length} kayıp müşteri</span>
          </div>
        )}
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="İsim, telefon, şehir, beden ara..." className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200 transition" />
        </div>
        <button onClick={openTagModal} className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition shadow-sm"><Tag size={12} /> Etiket Ekle</button>
        {customerTags.length > 0 && (
          <div className="relative group">
            <button className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition"><Plus size={12} /> Mevcut Etikete Ekle</button>
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px] hidden group-hover:block">
              {customerTags.map(t => (
                <button key={t.key} onClick={() => addToTag(t.key)} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} /> {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <button onClick={exportExcel} className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-sm"><Download size={12} /> Excel</button>
        <button onClick={() => setColPickerOpen(!colPickerOpen)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition"><Eye size={12} /> Kolonlar</button>
        <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(0); }} className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg bg-white">
          {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} satır</option>)}
        </select>
      </div>

      {colPickerOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-2">
          {COLUMNS.map(col => (
            <label key={col.key} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-slate-50 rounded px-2 py-1" onClick={() => setVisibleCols(s => { const n = new Set(s); n.has(col.key) ? n.delete(col.key) : n.add(col.key); return n; })}>
              {visibleCols.has(col.key) ? <CheckSquare size={13} className="text-indigo-600" /> : <Square size={13} className="text-slate-300" />}
              {col.label}
            </label>
          ))}
        </div>
      )}

      {/* ═══ TABLO ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] text-slate-400 uppercase bg-slate-50 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-2 py-2.5 w-8">
                  <button onClick={selectAll}>{selected.size === pageRows.length && pageRows.length > 0 ? <CheckSquare size={13} className="text-indigo-600" /> : <Square size={13} className="text-slate-300" />}</button>
                </th>
                {COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                  <th key={col.key} className={`px-2 py-2.5 cursor-pointer select-none hover:text-slate-600 transition whitespace-nowrap ${col.right ? 'text-right' : 'text-left'} ${col.w || ''}`} onClick={() => toggleSort(col.key)}>
                    <span className="inline-flex items-center gap-0.5">{col.label}{sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}</span>
                  </th>
                ))}
                <th className="px-2 py-2.5 text-left">Bedenler</th>
                <th className="px-2 py-2.5 text-left">Etiketler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map(r => (
                <tr key={r.id} className={`hover:bg-indigo-50/30 transition-colors ${selected.has(r.id) ? 'bg-indigo-50/40' : ''}`}>
                  <td className="px-2 py-1.5"><button onClick={() => toggleSelect(r.id)}>{selected.has(r.id) ? <CheckSquare size={13} className="text-indigo-600" /> : <Square size={13} className="text-slate-300" />}</button></td>
                  {visibleCols.has('ad') && <td className="px-2 py-1.5"><p className="font-medium text-slate-700 truncate max-w-[180px]">{r.ad}</p><p className="text-[10px] text-slate-400 truncate">{r.username}</p></td>}
                  {visibleCols.has('telefon') && <td className="px-2 py-1.5 text-slate-600 font-mono text-[11px]">{r.telefon || '-'}</td>}
                  {visibleCols.has('segment') && <td className="px-2 py-1.5"><SegBadge seg={r.segment} /></td>}
                  {visibleCols.has('sehir') && <td className="px-2 py-1.5 text-slate-600">{r.sehir}</td>}
                  {visibleCols.has('sipSayisi') && <td className="px-2 py-1.5 text-right text-slate-700 font-medium">{r.sipSayisi}</td>}
                  {visibleCols.has('ciro') && <td className="px-2 py-1.5 text-right font-semibold text-slate-800">{fmt(r.ciro)}</td>}
                  {visibleCols.has('ortSip') && <td className="px-2 py-1.5 text-right text-slate-600">{fmt(r.ortSip)}</td>}
                  {visibleCols.has('ltv') && <td className="px-2 py-1.5 text-right font-semibold text-emerald-700">{fmt(r.ltv)}</td>}
                  {visibleCols.has('iadeSayisi') && <td className="px-2 py-1.5 text-right text-slate-600">{r.iadeSayisi}</td>}
                  {visibleCols.has('sonSip') && <td className="px-2 py-1.5 text-slate-500 text-[11px]">{r.sonSip}</td>}
                  {visibleCols.has('ilkSip') && <td className="px-2 py-1.5 text-slate-500 text-[11px]">{r.ilkSip}</td>}
                  {visibleCols.has('topMarka') && <td className="px-2 py-1.5 text-slate-600 truncate max-w-[100px]">{r.topMarka}</td>}
                  {visibleCols.has('topKategori') && <td className="px-2 py-1.5 text-slate-600 truncate max-w-[100px]">{r.topKategori}</td>}
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1 flex-wrap">
                      {r.bedenler.slice(0, 4).map(b => <span key={b} className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-medium">{b}</span>)}
                      {r.bedenler.length > 4 && <span className="text-[9px] text-slate-400">+{r.bedenler.length - 4}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1 flex-wrap">
                      {r.tags.map(tk => {
                        const t = customerTags.find(ct => ct.key === tk);
                        return t ? <span key={tk} className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: t.color }}>{t.label}</span> : null;
                      })}
                    </div>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && <tr><td colSpan={COLUMNS.length + 3} className="text-center py-12 text-slate-400">Sonuç bulunamadı</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span>{selected.size > 0 ? `${selected.size} seçili / ` : ''}{tableRows.length} müşteri</span>
            {tableRows.length > 0 && selected.size === 0 && <button onClick={selectFiltered} className="text-indigo-600 hover:underline">Tümünü seç ({tableRows.length})</button>}
          </div>
          <div className="flex items-center gap-1">
            <button disabled={page === 0} onClick={() => setPage(0)} className="p-1 disabled:opacity-30"><ChevronsLeft size={14} /></button>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="p-1 disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span className="text-xs text-slate-600 px-2">{page + 1} / {totalPages || 1}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="p-1 disabled:opacity-30"><ChevronRight size={14} /></button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)} className="p-1 disabled:opacity-30"><ChevronsRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* ═══ BULK ACTIONS BAR ═══ */}
      {selected.size > 0 && (
        <div className="sticky bottom-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl p-3 flex items-center gap-3 shadow-2xl shadow-indigo-600/30 z-50">
          <span className="text-xs font-bold bg-white/20 px-2.5 py-0.5 rounded-full">{selected.size} müşteri seçili</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button onClick={openTagModal} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition"><Tag size={12} /> Etiket Ekle</button>
            {customerTags.length > 0 && (
              <div className="relative group">
                <button className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition"><Plus size={12} /> Etikete Ekle</button>
                <div className="absolute bottom-full left-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px] hidden group-hover:block">
                  {customerTags.map(t => (
                    <button key={t.key} onClick={() => addToTag(t.key)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => sendPhones('whatsapp')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition"><MessageSquare size={12} /> WhatsApp</button>
            <button onClick={() => sendPhones('sms')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition"><Send size={12} /> SMS</button>
            <button onClick={exportExcel} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition"><Download size={12} /> Excel</button>
            <button onClick={() => setSelected(new Set())} className="text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30 transition"><X size={12} /></button>
          </div>
        </div>
      )}

      {/* ═══ ETİKET MODAL ═══ */}
      {tagModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setTagModal(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div><h3 className="font-bold text-slate-800">Yeni Etiket Oluştur</h3><p className="text-xs text-slate-400">{selected.size > 0 ? `${selected.size} seçili müşteriye` : `${tableRows.length} filtrelenmiş müşteriye`} uygulanacak</p></div>
              <button onClick={() => setTagModal(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Etiket Adı</label>
                <input value={tagLabel} onChange={e => setTagLabel(e.target.value)} placeholder="Örn: XL Beden Kadın Müşteriler" className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-200" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Renk</label>
                <div className="flex gap-2">{TAG_COLORS.map(c => <button key={c} onClick={() => setTagColor(c)} className={`w-7 h-7 rounded-full transition-all ${tagColor === c ? 'ring-2 ring-offset-2 ring-indigo-600 scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }} />)}</div>
              </div>
              <div className="bg-indigo-50 rounded-xl p-3 flex items-center gap-2">
                <Users size={16} className="text-indigo-600" />
                <span className="text-xs text-indigo-700"><b>{selected.size > 0 ? selected.size : tableRows.length}</b> müşteri bu etikete eklenecek</span>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setTagModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition">İptal</button>
              <button onClick={saveTag} disabled={!tagLabel.trim()} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition flex items-center gap-1.5"><Tag size={14} /> Etiket Oluştur</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ KAMPANYA MODAL ═══ */}
      {campModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={() => setCampModal(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div><h3 className="font-bold text-slate-800">Kampanya Kaydet</h3><p className="text-xs text-slate-400">Mevcut filtreleri kampanya olarak kaydet</p></div>
              <button onClick={() => setCampModal(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Kampanya Adı</label>
                <input value={campLabel} onChange={e => setCampLabel(e.target.value)} placeholder="Örn: XL Beden Yaz Kampanyası" className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-200" autoFocus />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Açıklama (opsiyonel)</label>
                <input value={campDesc} onChange={e => setCampDesc(e.target.value)} placeholder="Kampanya hakkında kısa not..." className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-200" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Renk</label>
                <div className="flex gap-2">{TAG_COLORS.map(c => <button key={c} onClick={() => setCampColor(c)} className={`w-7 h-7 rounded-full transition-all ${campColor === c ? 'ring-2 ring-offset-2 ring-amber-600 scale-110' : 'hover:scale-105'}`} style={{ backgroundColor: c }} />)}</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                <p className="font-semibold">Kaydedilecek filtreler:</p>
                <p>{activeFilterCount} aktif filtre, <b>{tableRows.length}</b> müşteri eşleşiyor</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setCampModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition">İptal</button>
              <button onClick={saveCampaign} disabled={!campLabel.trim()} className="px-4 py-2 text-sm bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:opacity-50 transition flex items-center gap-1.5"><Bookmark size={14} /> Kampanya Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── SUB ─── */
function SegBadge({ seg }: { seg: string }) {
  const c: Record<string, string> = { VIP: 'bg-amber-50 text-amber-700 border-amber-200', Sadık: 'bg-rose-50 text-rose-700 border-rose-200', Yeni: 'bg-sky-50 text-sky-700 border-sky-200', Riskli: 'bg-orange-50 text-orange-700 border-orange-200', Kaybedilen: 'bg-red-50 text-red-700 border-red-200', Normal: 'bg-slate-50 text-slate-600 border-slate-200' };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border whitespace-nowrap ${c[seg] || c.Normal}`}>{seg}</span>;
}
