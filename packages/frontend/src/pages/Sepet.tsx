import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Menu, ShoppingBag, Search, Clock, Trash2, Plus, Minus, MapPin, Phone, User, Flame, Truck, CreditCard, CheckCircle2, Pencil, X, MessageCircle, Barcode, Send, Zap, ImagePlus, Home, Sparkles, Gift, HelpCircle, Radio, LogOut, Crown, Star, ChevronRight, Package, Timer, Filter } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });



export default function Sepet() {
  const { token } = useParams();
  const [sp] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(false);
  const [teslimat, setTeslimat] = useState(false);
  const [tForm, setTForm] = useState({ musteri: '', telefon: '', adres: '' });
  const [now, setNow] = useState(Date.now());
  const [bildirildi, setBildirildi] = useState(false);
  const [paytrUrl, setPaytrUrl] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [oneriBeden, setOneriBeden] = useState<Record<string, string>>({});
  // arama
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  // yayın özeti
  const [yayinOpen, setYayinOpen] = useState(false);
  const [yayin, setYayin] = useState<any>({ urunler: [], markalar: [], kategoriler: [], cinsiyetler: [] });
  const [yPeriod, setYPeriod] = useState('tum');
  const [yQ, setYQ] = useState('');
  const [yFilter, setYFilter] = useState({ cinsiyet: '', kategoriId: '', marka: '', stok: 'all' });
  const [ySort, setYSort] = useState('yeni');
  const [yView, setYView] = useState<'grid' | 'list'>('grid');
  const [yFilterOpen, setYFilterOpen] = useState(false);

  const loadYayin = useCallback(async (period: string) => {
    try { const r = await api.get(`/public/sepet/${token}/yayin`, { params: { period } }); setYayin(r.data || { urunler: [] }); } catch { /* */ }
  }, [token]);
  const openYayin = () => { setYayinOpen(true); loadYayin(yPeriod); };
  useEffect(() => { if (yayinOpen) loadYayin(yPeriod); }, [yPeriod, yayinOpen, loadYayin]);

  const yUrunler = useMemo(() => {
    let list = (yayin.urunler || []) as any[];
    if (yQ.trim()) { const s = yQ.toLowerCase(); list = list.filter((u) => [u.ad, u.marka, u.salesCode, u.barkod, u.kategoriAd].some((f) => (f || '').toLowerCase().includes(s))); }
    if (yFilter.cinsiyet) list = list.filter((u) => u.cinsiyet === yFilter.cinsiyet);
    if (yFilter.kategoriId) list = list.filter((u) => u.kategoriId === yFilter.kategoriId);
    if (yFilter.marka) list = list.filter((u) => u.marka === yFilter.marka);
    if (yFilter.stok === 'var') list = list.filter((u) => u.stok > 0);
    if (yFilter.stok === 'yok') list = list.filter((u) => u.stok <= 0);
    list = [...list];
    if (ySort === 'fiyat_artan') list.sort((a, b) => a.fiyat - b.fiyat);
    else if (ySort === 'fiyat_azalan') list.sort((a, b) => b.fiyat - a.fiyat);
    else list.sort((a, b) => new Date(b.saat || 0).getTime() - new Date(a.saat || 0).getTime());
    return list;
  }, [yayin, yQ, yFilter, ySort]);
  const hhmm = (iso: string) => { try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  // ── Katalog / Yeni / Siparişlerim / Destek / Kargo ──
  const [katalogOpen, setKatalogOpen] = useState(false);
  const [katalog, setKatalog] = useState<any>(null);
  const [yeniOpen, setYeniOpen] = useState(false);
  const [yeni, setYeni] = useState<any>({ urunler: [], kategoriler: [] });
  const [yeniKat, setYeniKat] = useState('');
  const [bildirimOpen, setBildirimOpen] = useState(false);
  const [bildirimForm, setBildirimForm] = useState({ beden: '', kategori: '', ilgi: '' });
  const [sipOpen, setSipOpen] = useState(false);
  const [sipData, setSipData] = useState<any>({ siparisler: [], ozet: {} });
  const [sipTab, setSipTab] = useState('tumu');
  const [kargoOrder, setKargoOrder] = useState<any>(null);
  const [destekOpen, setDestekOpen] = useState(false);
  const [destekList, setDestekList] = useState<any[]>([]);
  const [destekForm, setDestekForm] = useState({ kategori: '', konu: '', detay: '' });

  const openKatalog = async () => { setKatalogOpen(true); try { const r = await api.get(`/public/sepet/${token}/katalog`); setKatalog(r.data); } catch { /* */ } };
  const openYeni = async () => { setYeniOpen(true); try { const r = await api.get(`/public/sepet/${token}/yeni`); setYeni(r.data || { urunler: [] }); } catch { /* */ } };
  const openSip = async () => { setSipOpen(true); try { const r = await api.get(`/public/sepet/${token}/siparislerim`); setSipData(r.data || { siparisler: [] }); } catch { /* */ } };
  const openDestek = async () => { setDestekOpen(true); try { const r = await api.get(`/public/sepet/${token}/destek`); setDestekList(r.data || []); } catch { /* */ } };
  const sendBildirim = async () => { try { await api.post(`/public/sepet/${token}/bildirim`, bildirimForm); toast.success('Bildirim talebiniz alındı! Yeni ürünlerde haberdar edileceksiniz.'); setBildirimOpen(false); setBildirimForm({ beden: '', kategori: '', ilgi: '' }); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const sendDestek = async () => {
    if (!destekForm.kategori && !destekForm.konu) { toast.error('Kategori veya konu seçin'); return; }
    try { await api.post(`/public/sepet/${token}/destek`, destekForm); toast.success('Destek talebiniz oluşturuldu'); setDestekForm({ kategori: '', konu: '', detay: '' }); const r = await api.get(`/public/sepet/${token}/destek`); setDestekList(r.data || []); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const DESTEK_DURUM: Record<string, { t: string; c: string }> = { acik: { t: 'Beklemede', c: 'bg-amber-100 text-amber-700' }, islemde: { t: 'İşlemde', c: 'bg-blue-100 text-blue-700' }, yanitlandi: { t: 'Yanıtlandı', c: 'bg-green-100 text-green-700' }, cozuldu: { t: 'Çözüldü', c: 'bg-green-100 text-green-700' }, kapatildi: { t: 'Kapatıldı', c: 'bg-slate-100 text-slate-500' } };

  const load = useCallback(async () => {
    try { const r = await api.get(`/public/sepet/${token}`); setData(r.data); setTForm({ musteri: r.data.musteri || '', telefon: r.data.telefon || '', adres: r.data.adres || '' }); }
    catch (e) { setErr(apiErrorMessage(e)); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // arama debounce
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const id = setTimeout(async () => { try { const r = await api.get(`/public/sepet/${token}/search`, { params: { q } }); setResults(r.data || []); } catch { /* */ } }, 300);
    return () => clearTimeout(id);
  }, [q, token]);

  const items: any[] = data?.items || [];
  const adet = items.reduce((s, it) => s + (it.adet || 1), 0);
  const puanOrani = Number(data?.puanOrani) || 0;
  const freeShip = Number(data?.freeShipThreshold) || 0;
  const puan = Math.round((data?.toplam || 0) * puanOrani / 100);
  const ucretsizKargo = freeShip > 0 && (data?.toplam || 0) >= freeShip;
  const kalanKargo = Math.max(0, freeShip - (data?.toplam || 0));

  const kalan = useMemo(() => {
    if (!data?.createdAt) return null;
    const hedef = new Date(data.createdAt).getTime() + 6 * 3600 * 1000;
    let d = Math.max(0, Math.floor((hedef - now) / 1000));
    const s = Math.floor(d / 3600); d -= s * 3600; const dk = Math.floor(d / 60); const sn = d - dk * 60;
    return { s, dk, sn, bitti: hedef - now <= 0 };
  }, [data, now]);

  // Kredi kartı ödeme linki (admin yapıştırınca aktifleşir) + geri sayım
  const odemeSonMs = data?.odemeLinkiSon ? new Date(data.odemeLinkiSon).getTime() : 0;
  const odemeAktif = !!data?.odemeLinki && (!odemeSonMs || odemeSonMs > now);
  const odemeKalan = useMemo(() => {
    if (!odemeAktif || !odemeSonMs) return '';
    let d = Math.max(0, Math.floor((odemeSonMs - now) / 1000));
    const m = Math.floor(d / 60); const s = d - m * 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [odemeAktif, odemeSonMs, now]);

  const itemAction = async (index: number, body: any) => { try { const r = await api.post(`/public/sepet/${token}/item`, { index, ...body }); if (r.data?.deleted) { setErr('Sepetiniz boşaldığı için kapatıldı.'); return; } load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const addProduct = async (p: any, beden?: string) => {
    if ((p.bedenler || []).length > 0 && !beden) { toast.error('Lütfen beden seçin'); return; }
    try { await api.post(`/public/sepet/${token}/add`, { productId: p.id, beden: beden || undefined }); toast.success('Sepete eklendi'); setQ(''); setResults([]); load(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const pCard = (u: any) => (
    <div key={u.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="relative aspect-square bg-slate-100 cursor-zoom-in" onClick={() => u.img && setLightbox(u.img)}>{u.img ? <img src={u.img} className="w-full h-full object-cover" /> : null}{u.eskiFiyat > u.fiyat && <span className="absolute top-2 left-2 text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">%{Math.round((1 - u.fiyat / u.eskiFiyat) * 100)} İNDİRİM</span>}</div>
      <div className="p-2.5">
        <p className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2">{u.ad}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{[u.kategoriAd, u.marka].filter(Boolean).join(' · ') || '-'}</p>
        <div className="flex items-center gap-1.5 mt-1"><p className="text-sm font-bold text-slate-900">{fmt(u.fiyat)}</p>{u.eskiFiyat > u.fiyat && <p className="text-[10px] text-slate-400 line-through">{fmt(u.eskiFiyat)}</p>}</div>
        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-1"><Star size={9} className="fill-indigo-600" /> %{u.vipPuan} VIP</span>
        {(u.bedenler || []).length > 0 && u.stok > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{u.bedenler.map((b: string) => <button key={b} onClick={() => setOneriBeden((s) => ({ ...s, [u.id]: b }))} className={`text-[10px] px-1.5 py-0.5 rounded border ${oneriBeden[u.id] === b ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500'}`}>{b}</button>)}</div>}
        {u.stok > 0 ? <button onClick={() => addProduct(u, oneriBeden[u.id])} className="w-full mt-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg py-2 hover:bg-indigo-700 flex items-center justify-center gap-1"><Plus size={13} /> Sepete Ekle</button>
          : <button onClick={() => toast('Stok gelince haber verilecek 🔔')} className="w-full mt-2 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg py-2">Stok Gelince Haber Ver</button>}
      </div>
    </div>
  );
  const saveTeslimat = async () => { try { await api.patch(`/public/sepet/${token}`, tForm); toast.success('Bilgiler kaydedildi'); setTeslimat(false); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const odemeBildir = async () => { try { await api.post(`/public/sepet/${token}/odeme-bildir`); setBildirildi(true); toast.success('Ödeme bildiriminiz alındı!'); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  // Kredi kartı ile öde (PayTR iframe)
  const kartlaOde = async () => {
    if (items.length === 0) { toast.error('Sepetiniz boş'); return; }
    setPayBusy(true);
    try {
      const r = await api.post(`/public/sepet/${token}/paytr`);
      if (r.data?.ok && r.data?.iframeUrl) { setPaytrUrl(r.data.iframeUrl); return; }
      if (r.data?.configured === false) { toast('Kredi kartı ödemesi henüz aktif değil. Ödemenizi bildirerek devam edebilirsiniz.', { icon: 'ℹ️' }); return; }
      toast.error(r.data?.error || 'Ödeme başlatılamadı. Lütfen tekrar deneyin.');
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setPayBusy(false); }
  };
  // PayTR dönüşü (okUrl/failUrl)
  useEffect(() => {
    const p = sp.get('payment');
    if (p === 'success') toast.success('Ödemeniz alındı! Teşekkür ederiz. 🎉');
    else if (p === 'fail') toast.error('Ödeme tamamlanamadı. Tekrar deneyebilirsiniz.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Gömülü asistan sohbeti ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInfo, setChatInfo] = useState<any>(null);
  const [chatSession, setChatSession] = useState('');
  const [chatMsgs, setChatMsgs] = useState<any[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatTyping, setChatTyping] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs, chatTyping, chatOpen]);

  const openChat = async () => {
    setChatOpen(true);
    if (chatSession) return;
    if (!data?.slug) { setChatMsgs([{ role: 'bot', content: 'Asistan bu mağaza için aktif değil.' }]); return; }
    try {
      const info = await api.get(`/public/chat/${data.slug}`); setChatInfo(info.data);
      if (!info.data.active) { setChatMsgs([{ role: 'bot', content: 'Asistan şu anda kapalı. Lütfen daha sonra tekrar deneyin.' }]); return; }
      const r = await api.post(`/public/chat/${data.slug}/start`, { musteriAd: data.musteri || '', musteriTipi: 'mevcut', instagram: data.instagram || '', telefon: data.telefon || '' });
      setChatSession(r.data.sessionId); setChatMsgs(r.data.messages || []);
    } catch (e) { setChatMsgs([{ role: 'bot', content: apiErrorMessage(e) }]); }
  };
  // ?chat=1 ile gelince asistanı otomatik aç (siparişi tamamla akışı)
  const chatAutoRef = useRef(false);
  useEffect(() => { if (data && !chatAutoRef.current && sp.get('chat') === '1') { chatAutoRef.current = true; openChat(); } /* eslint-disable-next-line */ }, [data]);
  const sendChatContent = async (val: string) => {
    if (!val || chatBusy || !chatSession) return;
    setChatBusy(true);
    setChatMsgs((m) => [...m, { id: 't' + Date.now(), role: 'user', content: val }]);
    try {
      const r = await api.post(`/public/chat/${data.slug}/message`, { sessionId: chatSession, content: val, cartToken: token });
      const msgs = r.data.messages || []; const last = msgs[msgs.length - 1];
      if (last && last.role === 'bot') {
        setChatMsgs(msgs.slice(0, -1)); setChatTyping(true);
        const delay = Math.min(2600, 500 + String(last.content).length * 18);
        setTimeout(() => { setChatMsgs(msgs); setChatTyping(false); load(); }, delay);
      } else { setChatMsgs(msgs); load(); }
    } catch (e) { toast.error(apiErrorMessage(e)); } finally { setChatBusy(false); }
  };
  const sendChat = async () => { const val = chatText.trim(); if (!val) return; setChatText(''); await sendChatContent(val); };
  const sendChatImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img; const max = 1000;
        if (width > max || height > max) { if (width > height) { height = Math.round(height * max / width); width = max; } else { width = Math.round(width * max / height); height = max; } }
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        c.getContext('2d')!.drawImage(img, 0, 0, width, height);
        sendChatContent(c.toDataURL('image/jpeg', 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (err) return <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 text-center bg-slate-100">{err}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-100">Yükleniyor...</div>;

  const STEPS = [{ t: 'Sepetim', i: ShoppingBag }, { t: 'Teslimat', i: Truck }, { t: 'Ödeme', i: CreditCard }, { t: 'Onay', i: CheckCircle2 }, { t: 'Kargo', i: Truck }];
  const curStep = data.durum === 'sepet' ? 0 : bildirildi || data.durum !== 'yeni' ? 2 : 1;

  return (
    <div className="min-h-screen bg-slate-100 sm:bg-gradient-to-br sm:from-indigo-100 sm:via-slate-100 sm:to-violet-100">
      <Toaster position="top-center" />
      <div className="mx-auto w-full max-w-md lg:max-w-6xl bg-slate-50 min-h-screen shadow-sm sm:shadow-2xl sm:ring-1 sm:ring-slate-200/70 relative">
        {/* Header (sticky) */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMenu(true)} className="p-1.5 rounded-lg hover:bg-slate-100"><Menu size={20} className="text-slate-700" /></button>
          <p className="text-lg font-extrabold tracking-widest text-slate-900">{data.magaza?.toUpperCase()}</p>
          <button onClick={() => document.getElementById('sepetim')?.scrollIntoView({ behavior: 'smooth' })} className="relative p-1.5 rounded-lg hover:bg-slate-100"><ShoppingBag size={20} className="text-slate-700" />{adet > 0 && <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center">{adet}</span>}</button>
        </header>

        <div className="p-4 space-y-3">
          {/* Hızlı ödeme avantajı — ince, üstte, dikkat çekici */}
          <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-3.5 py-2.5 flex items-center gap-3">
            <Zap size={18} className="text-amber-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold leading-tight">Hızlı Ödeme Avantajı</p>
              {puanOrani > 0
                ? <p className="text-[10px] text-white/75 leading-tight">Hemen öde, <b className="text-amber-300">%{puanOrani} VIP puan</b> kazan • {puan} puan</p>
                : <p className="text-[10px] text-white/75 leading-tight">Hemen ödeyerek siparişini hızlıca tamamla</p>}
            </div>
            {kalan && !kalan.bitti ? (
              <div className="flex items-center gap-1 font-bold text-sm tabular-nums bg-black/20 rounded-lg px-2 py-1 shrink-0">
                <Clock size={13} className="text-amber-300" />{String(kalan.s).padStart(2, '0')}:{String(kalan.dk).padStart(2, '0')}:{String(kalan.sn).padStart(2, '0')}
              </div>
            ) : <span className="text-[10px] text-amber-300 shrink-0">Süre doldu</span>}
          </div>

          {/* Ücretsiz kargo — yalnızca eşik tanımlıysa */}
          {freeShip > 0 && (
          <div className={`rounded-xl px-3 py-2 flex items-center gap-2 text-[12px] ${ucretsizKargo ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
            <Truck size={15} className="shrink-0" />
            <span className="flex-1 truncate">{ucretsizKargo ? 'Tebrikler, ücretsiz kargo kazandınız! 🎉' : <>Ücretsiz kargo için <b>{fmt(kalanKargo)}</b> daha ekleyin.</>}</span>
            {!ucretsizKargo && <span className="w-16 h-1.5 bg-white rounded-full overflow-hidden shrink-0"><span className="block h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, ((data.toplam || 0) / freeShip) * 100)}%` }} /></span>}
          </div>
          )}

          {/* WEB: iki kolonlu duzen (mobilde tek kolon, sira korunur) */}
          <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:items-start">
          <div className="space-y-3 lg:col-span-2">
          {/* Arama + canlı sonuç */}
          <div className="relative" id="arama">
            <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün adı, satış kodu veya kategori ile ara..." className="w-full pl-10 pr-3 py-2.5 text-base bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-200" />
            {results.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto">
                {results.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 p-2.5 border-b border-slate-50 last:border-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0">{p.img ? <img src={p.img} className="w-full h-full object-cover" /> : null}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{p.ad}</p>
                      <p className="text-[10px] text-slate-400">{p.salesCode ? 'Kod: ' + p.salesCode + ' · ' : ''}{fmt(p.fiyat)} · {p.stok > 0 ? p.stok + ' adet' : 'Stok yok'}</p>
                      {(p.bedenler || []).length > 0 && <div className="flex flex-wrap gap-1 mt-1">{p.bedenler.map((b: string) => <button key={b} onClick={() => setOneriBeden((s) => ({ ...s, [p.id]: b }))} className={`text-[9px] px-1.5 py-0.5 rounded border ${oneriBeden[p.id] === b ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500'}`}>{b}</button>)}</div>}
                    </div>
                    <button disabled={p.stok <= 0} onClick={() => addProduct(p, oneriBeden[p.id])} className="shrink-0 w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40"><Plus size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-between pt-1">
            {STEPS.map((s, i) => (
              <div key={s.t} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${i <= curStep ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}><s.i size={14} /></div>
                  <span className={`text-[9px] ${i === curStep ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>{s.t}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < curStep ? 'bg-indigo-600' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>

          {/* Sepetim */}
          <div id="sepetim">
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-slate-800">Sepetim ({items.length})</h3><button onClick={() => setEdit(!edit)} className="text-sm text-indigo-600 font-medium flex items-center gap-1"><Pencil size={13} /> {edit ? 'Bitti' : 'Düzenle'}</button></div>
            <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100">
              {items.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">Sepetiniz boş.</p>}
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 cursor-zoom-in" onClick={() => it.img && setLightbox(it.img)}>{it.img ? <img src={it.img} className="w-full h-full object-cover" /> : null}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm leading-tight">{String(it.ad).replace(/\s*\([^)]*\)\s*$/, '')}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                      {(it.varyasyon || it.beden) && <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{it.varyasyon || it.beden}</span>}
                      {it.salesCode && <span className="text-[10px] text-slate-400">Kod: {it.salesCode}</span>}
                      {it.barkod && <span className="text-[10px] text-slate-400 inline-flex items-center gap-0.5"><Barcode size={10} /> {it.barkod}</span>}
                    </div>
                    {edit ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <button onClick={() => itemAction(i, { delta: -1 })} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500"><Minus size={12} /></button>
                        <span className="text-sm font-medium w-5 text-center">{it.adet}</span>
                        <button onClick={() => itemAction(i, { delta: 1 })} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500"><Plus size={12} /></button>
                      </div>
                    ) : <p className="text-xs text-indigo-600 mt-1">{it.adet} Adet × {fmt(it.fiyat)}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-slate-800">{fmt((it.fiyat || 0) * (it.adet || 1))}</p>
                    {edit && <button onClick={() => itemAction(i, { remove: true })} className="mt-1 text-red-400 hover:text-red-600"><Trash2 size={16} /></button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Canlı yayına özel fırsatlar */}
          {(data.oneriler || []).length > 0 && (
            <div id="firsatlar">
              <div className="flex items-center gap-1.5 mb-2"><Flame size={15} className="text-orange-500" /><h3 className="font-bold text-slate-800 text-sm">Canlı Yayına Özel Fırsatlar</h3></div>
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
                {(data.oneriler || []).map((p: any) => (
                  <div key={p.id} className="w-40 shrink-0 bg-white border border-slate-100 rounded-2xl p-2.5">
                    <div className="relative"><span className="absolute top-1 left-1 text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold z-10">Yayına Özel</span><div className="w-full aspect-square rounded-xl bg-slate-100 overflow-hidden cursor-zoom-in" onClick={() => p.img && setLightbox(p.img)}>{p.img ? <img src={p.img} className="w-full h-full object-cover" /> : null}</div></div>
                    <p className="text-xs font-medium text-slate-700 truncate mt-2">{p.ad}</p>
                    <div className="flex items-center gap-1.5"><p className="text-sm font-bold text-slate-900">{fmt(p.fiyat)}</p>{p.eskiFiyat > p.fiyat && <p className="text-[10px] text-slate-400 line-through">{fmt(p.eskiFiyat)}</p>}</div>
                    {(p.bedenler || []).length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{p.bedenler.map((b: string) => <button key={b} onClick={() => setOneriBeden((s) => ({ ...s, [p.id]: b }))} className={`text-[10px] px-1.5 py-0.5 rounded border ${oneriBeden[p.id] === b ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500'}`}>{b}</button>)}</div>}
                    <button onClick={() => addProduct(p, oneriBeden[p.id])} className="w-full mt-2 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 flex items-center justify-center gap-1"><Plus size={12} /> Sepete Ekle</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          </div>
          {/* SAG KOLON (web sticky ozet) */}
          <div className="space-y-3 lg:sticky lg:top-4">
          {/* Teslimat Bilgileri */}
          <div>
            <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-slate-800 text-sm">Teslimat Bilgileri</h3><button onClick={() => setTeslimat(true)} className="text-sm text-indigo-600 font-medium flex items-center gap-1"><Pencil size={13} /> Düzenle</button></div>
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-2 text-sm">
              <div className="flex items-center gap-2 text-slate-700"><User size={15} className="text-slate-400" /> {data.musteri || 'İsim belirtilmedi'}</div>
              <div className="flex items-center gap-2 text-slate-700"><Phone size={15} className="text-slate-400" /> {data.telefon || 'Telefon belirtilmedi'}</div>
              <div className="flex items-start gap-2 text-slate-700"><MapPin size={15} className="text-slate-400 mt-0.5 shrink-0" /> <span>{data.adres || 'Teslimat adresi belirtilmedi'}</span></div>
            </div>
          </div>

          {/* Sipariş Özeti */}
          <div id="ozet">
            <h3 className="font-bold text-slate-800 text-sm mb-2">Sipariş Özeti</h3>
            <div className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-500"><span>Ara Toplam</span><span className="text-slate-700">{fmt(data.araToplam)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Kargo</span><span className={data.kargoUcreti > 0 ? 'text-slate-700' : 'text-green-600 font-medium'}>{data.kargoUcreti > 0 ? fmt(data.kargoUcreti) : 'Ücretsiz'}</span></div>
              {data.indirim > 0 && <div className="flex justify-between text-green-600"><span>İndirim{data.indirimKodu ? ` (${data.indirimKodu})` : ''}</span><span>-{fmt(data.indirim)}</span></div>}
              <div className="flex justify-between font-extrabold text-slate-900 text-base pt-2 border-t border-slate-100 mt-1"><span>TOPLAM</span><span>{fmt(data.toplam)}</span></div>
            </div>
          </div>
          </div>
          </div>
        </div>

        {/* Alt sabit bar (sticky) */}
        <div className="sticky bottom-0 z-30 bg-white border-t border-slate-100 px-4 py-3 flex items-center gap-2.5">
          <div className="shrink-0"><p className="text-[10px] text-slate-400">Toplam</p><p className="text-base font-extrabold text-slate-900">{fmt(data.toplam)}</p></div>
          {odemeAktif ? (
            <>
              <button onClick={() => window.open(data.odemeLinki, 'odeme', 'width=480,height=720')} className="flex-1 bg-green-600 text-white rounded-2xl py-2.5 font-bold hover:bg-green-700 flex flex-col items-center leading-tight">
                <span className="text-sm inline-flex items-center gap-1.5"><CreditCard size={16} /> SEPETİ ÖDE</span>
                <span className="text-[10px] font-medium text-white/80">{odemeKalan ? `Ödeme için kalan süre: ${odemeKalan}` : 'Güvenli ödeme'}</span>
              </button>
              <button onClick={odemeBildir} disabled={items.length === 0} className="shrink-0 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl px-3 py-2.5 font-semibold hover:bg-indigo-100 disabled:opacity-50 flex flex-col items-center leading-tight">
                <span className="text-[12px]">{bildirildi ? 'Bildirildi ✓' : 'Havale/EFT'}</span>
                <span className="text-[9px] font-medium text-indigo-400">Ödemeni Bildir</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={kartlaOde} disabled={items.length === 0 || payBusy} className="flex-1 bg-green-600 text-white rounded-2xl py-2.5 font-bold hover:bg-green-700 disabled:opacity-50 flex flex-col items-center leading-tight">
                <span className="text-sm inline-flex items-center gap-1.5"><CreditCard size={16} /> {payBusy ? 'Yönlendiriliyor...' : 'Kredi Kartı ile Öde'}</span>
                <span className="text-[10px] font-medium text-white/80">256-bit SSL · Güvenli Ödeme</span>
              </button>
              <button onClick={odemeBildir} disabled={items.length === 0} className="shrink-0 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-2xl px-3 py-2.5 font-semibold hover:bg-indigo-100 disabled:opacity-50 flex flex-col items-center leading-tight">
                <span className="text-[12px]">{bildirildi ? 'Bildirildi ✓' : 'Havale/EFT'}</span>
                <span className="text-[9px] font-medium text-indigo-400">Ödemeni Bildir</span>
              </button>
            </>
          )}
        </div>

        {/* PayTR güvenli ödeme (kredi kartı) iframe */}
        {paytrUrl && (
          <div className="fixed inset-0 z-[200] bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4">
            <div className="w-full h-full sm:max-w-md sm:h-[92vh] bg-white sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5"><CreditCard size={16} /> Güvenli Ödeme</span>
                <button onClick={() => { setPaytrUrl(''); load(); }} className="p-1 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-400" /></button>
              </div>
              <iframe src={paytrUrl} className="flex-1 w-full" title="Kredi Kartı ile Ödeme" />
            </div>
          </div>
        )}
        {!chatOpen && (
          <button onClick={openChat} className="fixed z-40 bottom-24 right-4 sm:right-[calc(50%-13rem+0.5rem)] flex items-center gap-2 pl-3 pr-4 py-3 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-2xl hover:scale-105 transition-transform">
            <span className="absolute inset-0 rounded-full bg-indigo-500/50 animate-ping -z-10" />
            <span className="relative"><MessageCircle size={22} /><span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" /></span>
            <span className="text-sm font-semibold">Asistan</span>
          </button>
        )}
      </div>

      {/* Teslimat düzenle modal */}
      {teslimat && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setTeslimat(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">Teslimat Bilgileri</h3><button onClick={() => setTeslimat(false)}><X size={20} className="text-slate-400" /></button></div>
            <div><label className="text-xs text-slate-500">Ad Soyad</label><input value={tForm.musteri} onChange={(e) => setTForm({ ...tForm, musteri: e.target.value })} className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl mt-1" /></div>
            <div><label className="text-xs text-slate-500">Telefon</label><input value={tForm.telefon} onChange={(e) => setTForm({ ...tForm, telefon: e.target.value })} className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl mt-1" /></div>
            <div><label className="text-xs text-slate-500">Teslimat Adresi</label><textarea rows={3} value={tForm.adres} onChange={(e) => setTForm({ ...tForm, adres: e.target.value })} className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl mt-1" /></div>
            <button onClick={saveTeslimat} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700">Kaydet</button>
          </div>
        </div>
      )}

      {/* Menü drawer */}
      {menu && (() => {
        const goStore = () => { setMenu(false); if (data.slug) window.open(`/m/${data.slug}`, '_blank'); else toast.error('Mağaza linki yok'); };
        const goTo = (id: string) => { setMenu(false); setTimeout(() => id === 'top' ? window.scrollTo({ top: 0, behavior: 'smooth' }) : document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 60); };
        const MItem = ({ icon: Ic, label, onClick, badge }: any) => (
          <button onClick={onClick} className="w-full flex items-center gap-3 px-2 py-3 hover:bg-slate-50 rounded-xl text-left">
            <Ic size={20} className="text-indigo-600 shrink-0" />
            <span className="flex-1 text-[15px] font-semibold text-slate-700 tracking-wide">{label}</span>
            {badge && <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{badge}</span>}
            <ChevronRight size={18} className="text-slate-300" />
          </button>
        );
        return (
          <div className="fixed inset-0 z-[110] bg-black/40 flex" onClick={() => setMenu(false)}>
            <div onClick={(e) => e.stopPropagation()} className="w-[86%] max-w-sm bg-white h-full flex flex-col overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white p-5 pt-7 relative">
                <button onClick={() => setMenu(false)} className="absolute top-4 right-4 text-white/70 hover:text-white"><X size={22} /></button>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center"><User size={32} /></div>
                  <div>
                    <p className="text-sm text-white/70">Merhaba,</p>
                    <p className="text-xl font-bold leading-tight">{data.musteri || 'Değerli Müşterimiz'}</p>
                    <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold bg-white/15 px-2 py-0.5 rounded-md"><Crown size={12} className="text-amber-300" /> VIP ÜYE</span>
                  </div>
                </div>
                <div className="bg-black/20 rounded-2xl p-3 flex items-center divide-x divide-white/10">
                  <div className="flex items-center gap-2 pr-3 flex-1">
                    <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center"><Star size={18} className="text-white fill-white" /></div>
                    <div><p className="text-[10px] text-white/60 leading-none">VIP Puanınız</p><p className="text-lg font-extrabold leading-tight">{puan} <span className="text-xs font-medium">Puan</span></p></div>
                  </div>
                  <button onClick={goStore} className="flex items-center gap-2 pl-3 flex-1 text-left">
                    <div><p className="text-[11px] font-bold flex items-center gap-1 leading-none"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> CANLI YAYINDA</p><p className="text-[10px] text-white/60 mt-1">Yayına göz at</p></div>
                    <ChevronRight size={16} className="ml-auto text-white/60" />
                  </button>
                </div>
              </div>

              {/* İçerik */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="relative mb-2">
                  <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => { setMenu(false); document.getElementById('arama')?.scrollIntoView(); }} placeholder="Ürün, kod veya marka ara..." className="w-full pl-10 pr-3 py-2.5 text-base bg-slate-100 rounded-2xl outline-none" />
                </div>
                <MItem icon={Home} label="ANA SAYFA" onClick={goStore} />
                <MItem icon={Sparkles} label="YENİ EKLENENLER" onClick={() => { setMenu(false); openYeni(); }} />
                <MItem icon={Clock} label="YAYIN ÖZETİ" onClick={() => { setMenu(false); openYayin(); }} />
                <MItem icon={Zap} label="FIRSATLAR" badge="Yeni" onClick={() => goTo('firsatlar')} />
                <MItem icon={ShoppingBag} label="KATALOGLAR" onClick={() => { setMenu(false); openKatalog(); }} />
                <MItem icon={Package} label="SİPARİŞLERİM" onClick={() => { setMenu(false); openSip(); }} />
                <MItem icon={Gift} label="VIP PUANLARIM" onClick={() => goTo('top')} />
                <MItem icon={MessageCircle} label="DESTEK" onClick={() => { setMenu(false); openDestek(); }} />
                <p className="text-[11px] font-bold text-slate-400 tracking-widest mt-3 mb-1 px-2">DİĞER</p>
                <MItem icon={Truck} label="Kargo Takibi" onClick={() => { setMenu(false); openSip(); }} />
                <MItem icon={MapPin} label="Adreslerim" onClick={() => { setMenu(false); setTeslimat(true); }} />
                <MItem icon={Timer} label="Yedek Listem" onClick={() => goTo('firsatlar')} />
                <MItem icon={HelpCircle} label="Çok Sorulanlar" onClick={() => { setMenu(false); openChat(); }} />
                <button onClick={goStore} className="w-full mt-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center"><Radio size={22} /></div>
                  <div className="flex-1 text-left"><p className="font-bold text-sm">CANLI YAYINA DÖN</p><p className="text-[11px] text-white/70">Yayına geri dönerek fırsatları kaçırmayın!</p></div>
                  <ChevronRight size={18} className="text-white/70" />
                </button>
                <button onClick={() => setMenu(false)} className="w-full flex items-center gap-3 px-2 py-4 mt-2 text-slate-500 hover:bg-slate-50 rounded-xl"><LogOut size={18} /> <span className="text-sm font-medium">Kapat</span></button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Yayın Özeti */}
      {yayinOpen && (
        <div className="fixed inset-0 z-[115] bg-slate-50 overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
            <button onClick={() => setYayinOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={20} className="rotate-180 text-slate-700" /></button>
            <div className="flex-1 text-center"><p className="font-bold text-slate-800 flex items-center justify-center gap-1.5"><Clock size={16} className="text-indigo-600" /> Yayın Özeti</p><p className="text-[11px] text-slate-400">Canlı yayında çıkan ürünleri inceleyin</p></div>
            <button onClick={() => { setYayinOpen(false); document.getElementById('sepetim')?.scrollIntoView(); }} className="relative p-1.5 rounded-lg hover:bg-slate-100"><ShoppingBag size={20} className="text-slate-700" />{adet > 0 && <span className="absolute top-0 right-0 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center">{adet}</span>}</button>
          </div>

          <div className="max-w-md lg:max-w-4xl mx-auto p-4 space-y-3">
            {/* Banner */}
            <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Radio size={20} /></div>
              <div className="flex-1"><p className="text-sm font-semibold text-slate-800">Canlı yayınları kaçırdıysanız</p><p className="text-[11px] text-slate-500">Yayında çıkan tüm ürünlere buradan ulaşabilirsiniz.</p></div>
              <button onClick={() => data.slug && window.open(`/m/${data.slug}`, '_blank')} className="text-xs font-medium text-white bg-indigo-600 px-3 py-2 rounded-lg shrink-0">Canlı Yayına Dön</button>
            </div>

            {/* Dönem sekmeleri */}
            <div className="grid grid-cols-4 gap-2">
              {[['bugun', 'Bugünkü'], ['dun', 'Dünkü'], ['hafta', 'Bu Hafta'], ['tum', 'Tümü']].map(([k, t]) => (
                <button key={k} onClick={() => setYPeriod(k)} className={`py-2 rounded-xl text-xs font-medium ${yPeriod === k ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{t}</button>
              ))}
            </div>

            {/* Arama + Filtrele */}
            <div className="flex gap-2">
              <div className="relative flex-1"><Search size={16} className="absolute left-3.5 top-3 text-slate-400" /><input value={yQ} onChange={(e) => setYQ(e.target.value)} placeholder="Ürün, kod veya marka ara..." className="w-full pl-10 pr-3 py-2.5 text-base bg-white border border-slate-200 rounded-2xl outline-none" /></div>
              <button onClick={() => setYFilterOpen(!yFilterOpen)} className={`px-3 rounded-2xl border text-sm font-medium flex items-center gap-1.5 ${yFilterOpen || yFilter.cinsiyet || yFilter.kategoriId || yFilter.marka || yFilter.stok !== 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}><Filter size={15} /> Filtrele</button>
            </div>

            {/* Filtre paneli */}
            {yFilterOpen && (
              <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select value={yFilter.cinsiyet} onChange={(e) => setYFilter({ ...yFilter, cinsiyet: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Cinsiyet (Tümü)</option>{(yayin.cinsiyetler || []).map((c: string) => <option key={c} value={c}>{c}</option>)}</select>
                  <select value={yFilter.kategoriId} onChange={(e) => setYFilter({ ...yFilter, kategoriId: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Kategori (Tümü)</option>{(yayin.kategoriler || []).map((c: any) => <option key={c.id} value={c.id}>{c.ad}</option>)}</select>
                  <select value={yFilter.marka} onChange={(e) => setYFilter({ ...yFilter, marka: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="">Marka (Tümü)</option>{(yayin.markalar || []).map((m: string) => <option key={m} value={m}>{m}</option>)}</select>
                  <select value={yFilter.stok} onChange={(e) => setYFilter({ ...yFilter, stok: e.target.value })} className="px-2 py-2 text-sm border border-slate-200 rounded-lg"><option value="all">Stok (Tümü)</option><option value="var">Stokta var</option><option value="yok">Stok yok</option></select>
                </div>
                <button onClick={() => setYFilter({ cinsiyet: '', kategoriId: '', marka: '', stok: 'all' })} className="text-xs text-indigo-600">Filtreleri temizle</button>
              </div>
            )}

            {/* Sırala + görünüm */}
            <div className="flex items-center gap-2">
              <select value={ySort} onChange={(e) => setYSort(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"><option value="yeni">En Yeni</option><option value="fiyat_artan">Fiyat (artan)</option><option value="fiyat_azalan">Fiyat (azalan)</option></select>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setYView('grid')} className={`w-9 h-9 rounded-lg flex items-center justify-center ${yView === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>▦</button>
                <button onClick={() => setYView('list')} className={`w-9 h-9 rounded-lg flex items-center justify-center ${yView === 'list' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>≡</button>
              </div>
            </div>

            {/* Ürünler */}
            {yUrunler.length === 0 ? (
              <div className="text-center text-slate-400 py-16 text-sm bg-white rounded-2xl border border-slate-100">Bu dönemde yayında ürün çıkmadı.</div>
            ) : (
              <div className={yView === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                {yUrunler.map((u) => (
                  <div key={u.id} className={`bg-white rounded-2xl border border-slate-100 overflow-hidden ${yView === 'list' ? 'flex' : ''}`}>
                    <div className={`relative ${yView === 'list' ? 'w-28 shrink-0' : ''}`}>
                      <span className="absolute top-2 left-2 z-10 text-[9px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">CANLIDA ÇIKTI</span>
                      {u.saat && <span className="absolute top-2 right-2 z-10 text-[9px] font-medium bg-white/90 text-slate-600 px-1.5 py-0.5 rounded">{hhmm(u.saat)}</span>}
                      <div className={`bg-slate-100 overflow-hidden cursor-zoom-in ${yView === 'list' ? 'h-full' : 'aspect-square'}`} onClick={() => u.img && setLightbox(u.img)}>{u.img ? <img src={u.img} className="w-full h-full object-cover" /> : null}</div>
                    </div>
                    <div className="p-3 flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2">{u.ad}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{[u.beden, u.kategoriAd, u.marka].filter(Boolean).join(' · ') || '-'}</p>
                      <div className="flex items-center gap-1.5 mt-1"><p className="text-sm font-bold text-slate-900">{fmt(u.fiyat)}</p>{u.eskiFiyat > u.fiyat && <p className="text-[10px] text-slate-400 line-through">{fmt(u.eskiFiyat)}</p>}</div>
                      <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mt-1"><Star size={9} className="fill-indigo-600" /> %{u.vipPuan} VIP Puan</span>
                      <p className={`text-[10px] mt-1 flex items-center gap-1 ${u.stok > 0 ? 'text-green-600' : 'text-red-500'}`}><span className={`w-1.5 h-1.5 rounded-full ${u.stok > 0 ? 'bg-green-500' : 'bg-red-500'}`} /> {u.stok > 0 ? 'Stokta var' : 'Stok yok'}</p>
                      {(u.bedenler || []).length > 0 && u.stok > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{u.bedenler.map((b: string) => <button key={b} onClick={() => setOneriBeden((s) => ({ ...s, [u.id]: b }))} className={`text-[10px] px-1.5 py-0.5 rounded border ${oneriBeden[u.id] === b ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500'}`}>{b}</button>)}</div>}
                      {u.stok > 0 ? (
                        <button onClick={() => addProduct(u, oneriBeden[u.id])} className="w-full mt-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg py-2 hover:bg-indigo-700 flex items-center justify-center gap-1"><Plus size={13} /> Sepete Ekle</button>
                      ) : (
                        <button onClick={() => toast('Stok gelince haber verilecek 🔔')} className="w-full mt-2 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg py-2 hover:bg-indigo-50">Yedek Listeye Katıl</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* KATALOGLAR */}
      {katalogOpen && (
        <div className="fixed inset-0 z-[116] bg-slate-50 overflow-y-auto">
          <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
            <button onClick={() => setKatalogOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={20} className="rotate-180 text-slate-700" /></button>
            <div className="flex-1 text-center"><p className="font-bold text-slate-800 flex items-center justify-center gap-1.5"><ShoppingBag size={16} className="text-indigo-600" /> Kataloglar</p><p className="text-[11px] text-slate-400">Tüm ürün koleksiyonlarını keşfet</p></div>
            <div className="w-8" />
          </div>
          <div className="max-w-md lg:max-w-4xl mx-auto p-4 space-y-5">
            {!katalog ? <p className="text-center text-slate-400 py-10">Yükleniyor...</p> : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {(katalog.kategoriler || []).map((k: any) => (
                    <button key={k.id} onClick={() => { setYeniKat(k.id); setKatalogOpen(false); openYeni(); }} className="bg-white rounded-2xl border border-slate-100 p-3 flex items-center gap-3 text-left">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">{k.img ? <img src={k.img} className="w-full h-full object-cover" /> : null}</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{k.ad}</p><p className="text-[11px] text-slate-400">{k.adet} ürün</p></div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </button>
                  ))}
                </div>
                {(katalog.trend || []).length > 0 && (<div><div className="flex items-center gap-1.5 mb-2"><Flame size={15} className="text-orange-500" /><h3 className="font-bold text-slate-800 text-sm">Canlı Yayında Trend Olanlar</h3></div><div className="grid grid-cols-2 gap-3">{katalog.trend.map((u: any) => pCard(u))}</div></div>)}
                {(katalog.markalar || []).length > 0 && (<div><h3 className="font-bold text-slate-800 text-sm mb-2">Premium Markalar</h3><div className="flex gap-2 flex-wrap">{katalog.markalar.map((m: any) => <span key={m.marka} className="px-3 py-2 bg-white border border-slate-100 rounded-xl text-xs font-semibold text-slate-700">{m.marka} <span className="text-slate-400 font-normal">({m.adet})</span></span>)}</div></div>)}
                {(katalog.fiyatiDusenler || []).length > 0 && (<div><h3 className="font-bold text-slate-800 text-sm mb-2">Fiyatı Düşenler</h3><div className="grid grid-cols-2 gap-3">{katalog.fiyatiDusenler.map((u: any) => pCard(u))}</div></div>)}
                {(katalog.sonEklenenler || []).length > 0 && (<div><h3 className="font-bold text-slate-800 text-sm mb-2">Son Eklenenler</h3><div className="grid grid-cols-2 gap-3">{katalog.sonEklenenler.map((u: any) => pCard(u))}</div></div>)}
              </>
            )}
          </div>
        </div>
      )}

      {/* YENİ EKLENENLER */}
      {yeniOpen && (
        <div className="fixed inset-0 z-[116] bg-slate-50 overflow-y-auto">
          <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
            <button onClick={() => { setYeniOpen(false); setYeniKat(''); }} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={20} className="rotate-180 text-slate-700" /></button>
            <div className="flex-1 text-center"><p className="font-bold text-slate-800 flex items-center justify-center gap-1.5"><Sparkles size={16} className="text-indigo-600" /> Yeni Eklenenler</p></div>
            <div className="w-8" />
          </div>
          <div className="max-w-md lg:max-w-4xl mx-auto p-4 space-y-3">
            <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-700 text-white p-3 flex items-center gap-3">
              <Zap size={22} className="text-amber-300" />
              <div className="flex-1"><p className="text-sm font-semibold">Her gün yeni ürünler ekleniyor!</p><p className="text-[11px] text-white/70">Kaçırmadan keşfedin.</p></div>
              <button onClick={() => setBildirimOpen(true)} className="text-xs font-semibold bg-white/20 px-3 py-2 rounded-lg shrink-0">Bildirim Al 🔔</button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => setYeniKat('')} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${!yeniKat ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>Tümü</button>
              {(yeni.kategoriler || []).map((k: any) => <button key={k.id} onClick={() => setYeniKat(k.id)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${yeniKat === k.id ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{k.ad}</button>)}
            </div>
            <p className="text-xs text-slate-400">{(yeni.urunler || []).filter((u: any) => !yeniKat || u.kategoriId === yeniKat).length} yeni ürün</p>
            <div className="grid grid-cols-2 gap-3">{(yeni.urunler || []).filter((u: any) => !yeniKat || u.kategoriId === yeniKat).map((u: any) => pCard(u))}</div>
            <button onClick={() => setBildirimOpen(true)} className="w-full rounded-2xl bg-indigo-50 border border-indigo-100 p-3 flex items-center gap-3 mt-2"><div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Zap size={20} /></div><div className="flex-1 text-left"><p className="text-sm font-semibold text-slate-800">Yeni ürünlerden ilk sen haberdar ol!</p><p className="text-[11px] text-slate-500">Bildirimleri aç, kaçırma.</p></div><ChevronRight size={16} className="text-indigo-400" /></button>
          </div>
        </div>
      )}

      {/* Bildirim Al modal */}
      {bildirimOpen && (
        <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setBildirimOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">Yeni Ürün Bildirimi</h3><button onClick={() => setBildirimOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-500">İlgi alanlarınızı belirtin; yeni ürünler geldiğinde size haber verelim.</p>
            <div><label className="text-xs text-slate-500">İlgilendiğiniz Kategori</label><select value={bildirimForm.kategori} onChange={(e) => setBildirimForm({ ...bildirimForm, kategori: e.target.value })} className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl mt-1"><option value="">Farketmez</option>{(yeni.kategoriler || []).map((k: any) => <option key={k.id} value={k.ad}>{k.ad}</option>)}</select></div>
            <div><label className="text-xs text-slate-500">Beden</label><input value={bildirimForm.beden} onChange={(e) => setBildirimForm({ ...bildirimForm, beden: e.target.value })} placeholder="ör. M, L, 42" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl mt-1" /></div>
            <div><label className="text-xs text-slate-500">İlgi Alanları / Notlar</label><input value={bildirimForm.ilgi} onChange={(e) => setBildirimForm({ ...bildirimForm, ilgi: e.target.value })} placeholder="ör. spor giyim, ayakkabı" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl mt-1" /></div>
            <button onClick={sendBildirim} className="w-full bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700">Bildirimleri Aç</button>
          </div>
        </div>
      )}

      {/* SİPARİŞLERİM */}
      {sipOpen && (() => {
        const SD: Record<string, { t: string; c: string }> = { sepet: { t: 'Açık Sepet', c: 'text-rose-600' }, yeni: { t: 'Ödeme Bekliyor', c: 'text-amber-600' }, hazirlaniyor: { t: 'Hazırlanıyor', c: 'text-blue-600' }, kargoda: { t: 'Kargoda', c: 'text-sky-600' }, teslim: { t: 'Teslim Edildi', c: 'text-green-600' }, tamamlandi: { t: 'Teslim Edildi', c: 'text-green-600' }, iptal: { t: 'İptal/İade', c: 'text-red-500' } };
        const list = (sipData.siparisler || []).filter((o: any) => sipTab === 'tumu' || (sipTab === 'iade' ? o.durum === 'iptal' : o.durum === sipTab));
        return (
          <div className="fixed inset-0 z-[116] bg-slate-50 overflow-y-auto">
            <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
              <button onClick={() => setSipOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={20} className="rotate-180 text-slate-700" /></button>
              <div className="flex-1 text-center"><p className="font-bold text-slate-800 flex items-center justify-center gap-1.5"><Package size={16} className="text-indigo-600" /> Siparişlerim</p></div>
              <div className="w-8" />
            </div>
            <div className="max-w-md lg:max-w-4xl mx-auto p-4 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white rounded-xl border border-slate-100 p-2 text-center"><p className="text-lg font-bold text-slate-800">{sipData.ozet?.toplam || 0}</p><p className="text-[10px] text-slate-400">Sipariş</p></div>
                <div className="bg-white rounded-xl border border-slate-100 p-2 text-center"><p className="text-lg font-bold text-green-600">{sipData.ozet?.teslim || 0}</p><p className="text-[10px] text-slate-400">Teslim</p></div>
                <div className="bg-white rounded-xl border border-slate-100 p-2 text-center"><p className="text-lg font-bold text-sky-600">{sipData.ozet?.kargoda || 0}</p><p className="text-[10px] text-slate-400">Kargoda</p></div>
                <div className="bg-white rounded-xl border border-slate-100 p-2 text-center"><p className="text-lg font-bold text-red-500">{sipData.ozet?.iade || 0}</p><p className="text-[10px] text-slate-400">İade/İptal</p></div>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {[['tumu', 'Tümü'], ['hazirlaniyor', 'Hazırlanıyor'], ['kargoda', 'Kargoda'], ['teslim', 'Teslim'], ['iade', 'İade/İptal']].map(([k, t]) => (
                  <button key={k} onClick={() => setSipTab(k)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${sipTab === k ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{t}</button>
                ))}
              </div>
              {list.length === 0 && <p className="text-center text-slate-400 py-12 text-sm">Bu durumda sipariş yok.</p>}
              {list.map((o: any) => {
                const sd = SD[o.durum] || { t: o.durum, c: 'text-slate-500' };
                const it0 = (o.items || [])[0];
                return (
                  <div key={o.id} className="bg-white rounded-2xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between mb-2"><div><p className="text-xs font-mono text-slate-600">{o.orderNo ? `${o.orderYil}-${String(o.orderNo).padStart(3, '0')}` : '#' + o.id.slice(-5)}</p><p className="text-[10px] text-slate-400">{new Date(o.createdAt).toLocaleDateString('tr-TR')} · {hhmm(o.createdAt)}</p></div><span className={`text-xs font-semibold ${sd.c}`}>{sd.t}</span></div>
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 cursor-zoom-in" onClick={() => it0?.img && setLightbox(it0.img)}>{it0?.img ? <img src={it0.img} className="w-full h-full object-cover" /> : null}</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800 truncate">{it0 ? String(it0.ad).replace(/\s*\([^)]*\)\s*$/, '') : 'Ürün'}{(o.items || []).length > 1 ? ` +${(o.items || []).length - 1}` : ''}</p><p className="text-xs text-slate-400">{(o.items || []).reduce((s: number, x: any) => s + (x.adet || 1), 0)} ürün</p><p className="text-sm font-bold text-slate-900 mt-0.5">{fmt(o.toplam)}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {o.duzenlenebilir ? (
                        <button onClick={() => { setSipOpen(false); if (o.token === token) document.getElementById('sepetim')?.scrollIntoView(); else window.location.href = `/sepet/${o.token}`; }} className="text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg py-2">Sepeti Aç</button>
                      ) : (o.kargoTakip || o.durum === 'kargoda' || o.durum === 'teslim') ? (
                        <button onClick={() => setKargoOrder(o)} className="text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg py-2 flex items-center justify-center gap-1"><Truck size={13} /> Kargo Takibi</button>
                      ) : <span className="text-xs text-slate-400 flex items-center justify-center">İşleniyor</span>}
                      <button onClick={() => { setSipOpen(false); openChat(); }} className="text-xs font-medium text-white bg-slate-900 rounded-lg py-2 flex items-center justify-center gap-1"><MessageCircle size={13} /> Asistana Bağlan</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* KARGO TAKİBİ */}
      {kargoOrder && (() => {
        const o = kargoOrder;
        const steps = [
          { t: 'Sipariş Alındı', done: true },
          { t: 'Hazırlanıyor', done: ['hazirlaniyor', 'kargoda', 'teslim', 'tamamlandi'].includes(o.durum) },
          { t: 'Kargoya Verildi', done: !!o.kargoTakip || ['kargoda', 'teslim', 'tamamlandi'].includes(o.durum) },
          { t: 'Dağıtımda', done: o.durum === 'teslim' || o.durum === 'tamamlandi' },
          { t: 'Teslim Edildi', done: o.durum === 'teslim' || o.durum === 'tamamlandi' },
        ];
        const cur = steps.filter((s) => s.done).length - 1;
        return (
          <div className="fixed inset-0 z-[118] bg-slate-50 overflow-y-auto">
            <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
              <button onClick={() => setKargoOrder(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={20} className="rotate-180 text-slate-700" /></button>
              <div className="flex-1 text-center"><p className="font-bold text-slate-800 flex items-center justify-center gap-1.5"><Truck size={16} className="text-indigo-600" /> Kargo Takibi</p></div>
              <div className="w-8" />
            </div>
            <div className="max-w-md lg:max-w-4xl mx-auto p-4 space-y-3">
              <div className="bg-white rounded-2xl border border-slate-100 p-4 grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[11px] text-slate-400">Sipariş No</p><p className="font-bold text-slate-800">{o.orderNo ? `${o.orderYil}-${String(o.orderNo).padStart(3, '0')}` : '#' + o.id.slice(-5)}</p></div>
                <div><p className="text-[11px] text-slate-400">Kargo Takip No</p><p className="font-bold text-slate-800 font-mono">{o.kargoTakip || '—'}</p></div>
                <div><p className="text-[11px] text-slate-400">Kargo Firması</p><p className="font-semibold text-slate-700">{o.kargoFirmasi || 'Yurtiçi Kargo'}</p></div>
                <div><p className="text-[11px] text-slate-400">Durum</p><p className="font-semibold text-indigo-600">{steps[cur]?.t}</p></div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <h3 className="font-bold text-slate-800 text-sm mb-3">Kargo Durumu</h3>
                <div className="space-y-0">
                  {steps.map((s, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${s.done ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'}`}>{s.done ? <CheckCircle2 size={15} /> : <span className="w-2 h-2 rounded-full bg-current" />}</div>
                        {i < steps.length - 1 && <div className={`w-0.5 flex-1 min-h-[28px] ${i < cur ? 'bg-indigo-600' : 'bg-slate-200'}`} />}
                      </div>
                      <div className={`pb-4 ${i === cur ? '' : ''}`}><p className={`text-sm font-semibold ${s.done ? 'text-slate-800' : 'text-slate-400'}`}>{s.t}</p>{i === cur && <span className="text-[10px] text-indigo-600 font-medium">Güncel durum</span>}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-3 flex items-center gap-3"><Truck size={20} className="text-indigo-600" /><div><p className="text-sm font-semibold text-slate-800">{cur >= 3 ? 'Kargonuz teslim edildi 🎉' : cur >= 2 ? 'Kargonuz yola çıktı!' : 'Kargonuz hazırlanıyor'}</p><p className="text-[11px] text-slate-500">Durum değiştiğinde bilgilendirileceksiniz.</p></div></div>
              <button onClick={() => { setKargoOrder(null); openChat(); }} className="w-full bg-slate-900 text-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2"><MessageCircle size={18} /> Bu Sipariş Hakkında Asistana Bağlan</button>
            </div>
          </div>
        );
      })()}

      {/* DESTEK MERKEZİ */}
      {destekOpen && (
        <div className="fixed inset-0 z-[116] bg-slate-50 overflow-y-auto">
          <div className="sticky top-0 z-20 bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3">
            <button onClick={() => setDestekOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={20} className="rotate-180 text-slate-700" /></button>
            <div className="flex-1 text-center"><p className="font-bold text-slate-800 flex items-center justify-center gap-1.5"><MessageCircle size={16} className="text-indigo-600" /> Destek Merkezi</p><p className="text-[11px] text-slate-400">Size nasıl yardımcı olabiliriz?</p></div>
            <div className="w-8" />
          </div>
          <div className="max-w-md lg:max-w-4xl mx-auto p-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <h3 className="font-bold text-slate-800 mb-1">Yeni Destek Talebi Oluştur</h3>
              <p className="text-xs text-slate-400 mb-3">Talebinizle ilgili kategori seçerek bizimle paylaşın.</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[['Sipariş Sorunu', Package], ['Ödeme Sorunu', CreditCard], ['İade Talebi', Truck], ['Değişim Talebi', Truck], ['Ürün Şikayeti', Flame], ['Diğer', HelpCircle]].map(([t, Ic]: any) => (
                  <button key={t} onClick={() => setDestekForm({ ...destekForm, kategori: t })} className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-[11px] font-medium ${destekForm.kategori === t ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}><Ic size={18} />{t}</button>
                ))}
              </div>
              <input value={destekForm.konu} onChange={(e) => setDestekForm({ ...destekForm, konu: e.target.value })} placeholder="Talep konusu (kısa başlık)" className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl mb-2" />
              <textarea rows={3} value={destekForm.detay} onChange={(e) => setDestekForm({ ...destekForm, detay: e.target.value })} placeholder="Yaşadığınız sorunu kısaca yazın..." className="w-full px-3 py-2.5 text-base border border-slate-200 rounded-xl" />
              <button onClick={sendDestek} className="w-full mt-2 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"><Send size={16} /> Talep Oluştur</button>
            </div>
            <div>
              <h3 className="font-bold text-slate-800 mb-2">Açık Taleplerim</h3>
              {destekList.length === 0 && <p className="text-sm text-slate-400 bg-white rounded-2xl border border-slate-100 p-4 text-center">Henüz talebiniz yok.</p>}
              <div className="space-y-2">
                {destekList.map((d: any) => { const du = DESTEK_DURUM[d.durum] || { t: d.durum, c: 'bg-slate-100 text-slate-500' }; return (
                  <div key={d.id} className="bg-white rounded-2xl border border-slate-100 p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0"><p className="text-xs font-mono text-slate-500">#{d.no}</p><p className="text-sm font-medium text-slate-800 truncate">{d.baslik}</p><p className="text-[10px] text-slate-400">{new Date(d.createdAt).toLocaleDateString('tr-TR')} · {hhmm(d.createdAt)}</p>{d.yanit && <p className="text-[11px] text-green-700 bg-green-50 rounded p-1.5 mt-1">Yanıt: {d.yanit}</p>}</div>
                    <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${du.c}`}>{du.t}</span>
                  </div>
                ); })}
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-100 p-3 flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><MessageCircle size={20} /></div><div className="flex-1"><p className="text-sm font-semibold text-slate-800">Canlı Destek</p><p className="text-[11px] text-slate-500">7/24 bize ulaşabilirsiniz.</p></div><button onClick={openChat} className="text-xs font-semibold text-white bg-green-600 px-3 py-2 rounded-lg">Asistana Yaz</button></div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[130] bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(null)}>
          <img src={lightbox} className="max-w-full max-h-full rounded-xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} className="absolute top-5 right-5 text-white/80 hover:text-white"><X size={28} /></button>
        </div>
      )}

      {/* Gömülü asistan sohbeti */}
      {chatOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50" onClick={() => setChatOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl h-[85vh] sm:h-[80vh] flex flex-col overflow-hidden">
            <div className="bg-indigo-600 text-white px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"><MessageCircle size={18} /></div>
              <div className="flex-1"><p className="font-semibold text-sm">{chatInfo?.name || 'Asistan'}</p><p className="text-[11px] text-indigo-200">Çevrimiçi · genellikle hemen yanıtlar</p></div>
              <button onClick={() => setChatOpen(false)} className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {chatMsgs.map((m, i) => (
                <div key={m.id || i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line ${m.role === 'user' ? 'bg-indigo-600 text-white' : m.role === 'agent' ? 'bg-green-100 text-green-800' : 'bg-white border border-slate-100 text-slate-700'}`}>
                    {String(m.content).startsWith('data:image')
                      ? <img src={m.content} className="rounded-lg max-h-48 cursor-zoom-in" onClick={() => setLightbox(m.content)} />
                      : m.content}
                  </div>
                </div>
              ))}
              {chatTyping && <div className="flex justify-start"><div className="bg-white border border-slate-100 rounded-2xl px-4 py-3"><span className="inline-flex gap-1"><span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" /><span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></span></div></div>}
              <div ref={chatEnd} />
            </div>
            <div className="p-3 border-t border-slate-100 flex gap-2 items-center">
              <label className="cursor-pointer text-slate-400 hover:text-indigo-600 shrink-0" title="Fotoğraf ekle">
                <ImagePlus size={20} />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendChatImage(f); e.currentTarget.value = ''; }} />
              </label>
              <input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendChat()} placeholder="Mesajınızı yazın..." className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-base" />
              <button onClick={sendChat} disabled={chatBusy} className="bg-indigo-600 text-white px-4 rounded-xl hover:bg-indigo-700 disabled:opacity-50"><Send size={18} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
