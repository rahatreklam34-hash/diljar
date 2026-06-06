import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, MessageCircle, ChevronDown, Plus, Star, Wallet, TrendingUp, ShoppingBag, X, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const initials = (ad: string) => (ad || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const dt = (d: string) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const dshort = (d: string) => d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
const orderLabel = (o: any) => o?.orderNo ? `${o.orderYil || new Date(o.createdAt).getFullYear()}-${String(o.orderNo).padStart(3, '0')}` : '#SIP' + o.id.slice(-5).toUpperCase();
const waLink = (tel: string) => { let d = (tel || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '90' + d.slice(1); else if (d.length === 10) d = '90' + d; return 'https://wa.me/' + d; };

const STMAP: Record<string, { t: string; c: string }> = {
  sepet: { t: 'Açık Sepet', c: 'bg-rose-100 text-rose-600' },
  hazirlaniyor: { t: 'Hazırlanıyor', c: 'bg-blue-100 text-blue-700' },
  yeni: { t: 'Yeni', c: 'bg-amber-100 text-amber-700' },
  kargoda: { t: 'Kargoda', c: 'bg-sky-100 text-sky-700' },
  teslim: { t: 'Tamamlandı', c: 'bg-green-100 text-green-700' },
  tamamlandi: { t: 'Tamamlandı', c: 'bg-green-100 text-green-700' },
  iptal: { t: 'İptal Edildi', c: 'bg-red-100 text-red-700' },
  kapali: { t: 'Kapalı', c: 'bg-slate-100 text-slate-500' },
};

function Donut({ pct, color = '#6366f1', label, sub }: { pct: number; color?: string; label: string; sub?: string }) {
  const r = 42, c = 2 * Math.PI * r, off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eef2f7" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-slate-800">{label}</span>
        {sub && <span className="text-[10px] text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

export default function MusteriDetay() {
  const { id } = useParams();
  const nav = useNavigate();
  const { customers, orders, products, discountCodes, reload } = useStore();
  const [tab, setTab] = useState('gecmis');
  const [ledger, setLedger] = useState<any[]>([]);
  const [balModal, setBalModal] = useState(false);
  const [balForm, setBalForm] = useState({ tip: 'yukleme', tutar: '', aciklama: '' });
  const [menu, setMenu] = useState(false);

  const customer = customers.find((c) => c.id === id);
  const prodCost = useMemo(() => new Map(products.map((p) => [p.id, p.alisFiyat || 0])), [products]);

  const loadLedger = async () => { if (!id) return; try { const r = await api.get(`/store/customers/${id}/ledger`); setLedger(r.data || []); } catch { /* */ } };
  useEffect(() => { loadLedger(); /* eslint-disable-next-line */ }, [id]);

  const myOrders = useMemo(() => orders.filter((o) => o.customerId === id), [orders, id]);

  const k = useMemo(() => {
    const valid = myOrders.filter((o) => o.durum !== 'iptal' && o.durum !== 'sepet');
    const ciro = valid.reduce((s, o) => s + (o.toplam || 0), 0);
    const iptaller = myOrders.filter((o) => o.durum === 'iptal');
    const iptalTutar = iptaller.reduce((s, o) => s + (o.toplam || 0), 0);
    const iadeLedger = ledger.filter((l) => l.tip === 'iade');
    const iadeTutar = iadeLedger.reduce((s, l) => s + (l.tutar || 0), 0);
    let kar = 0;
    for (const o of valid) {
      const cost = (o.items || []).reduce((x: number, it: any) => x + (prodCost.get(it.productId) || 0) * (it.adet || 1), 0);
      kar += (o.toplam || 0) - cost;
    }
    const odenmis = valid.filter((o) => (o.tahsilat || 0) >= (o.toplam || 0) && (o.toplam || 0) > 0).length;
    const odemeOrani = valid.length ? Math.round((odenmis / valid.length) * 100) : 0;
    const ort = valid.length ? ciro / valid.length : 0;
    const iptalOrani = myOrders.length ? iptaller.length / myOrders.length : 0;
    const risk = iptalOrani > 0.3 ? { t: 'Yüksek Risk', c: 'text-red-600' } : iptalOrani > 0.12 ? { t: 'Orta Risk', c: 'text-amber-600' } : { t: 'Düşük Risk', c: 'text-green-600' };
    const yukleme = ledger.filter((l) => l.tip === 'yukleme').reduce((s, l) => s + (l.tutar || 0), 0);
    const harcama = ledger.filter((l) => l.tip === 'harcama').reduce((s, l) => s + (l.tutar || 0), 0);
    return { ciro, count: valid.length, iptalAdet: iptaller.length, iptalTutar, iadeAdet: iadeLedger.length, iadeTutar, kar, karOran: ciro ? (kar / ciro) * 100 : 0, odemeOrani, ort, risk, yukleme, harcama };
  }, [myOrders, ledger, prodCost]);

  if (!customer) {
    return <div className="p-6"><button onClick={() => nav('/musterilerim')} className="text-indigo-600 inline-flex items-center gap-1"><ArrowLeft size={16} /> Müşterilerim</button><p className="mt-6 text-slate-400">Müşteri bulunamadı.</p></div>;
  }

  const ig = customer.instagram ? String(customer.instagram).replace(/^@/, '') : '';
  const sohbet = () => { if (customer.telefon) window.open(waLink(customer.telefon), '_blank'); else toast.error('Telefon yok'); };
  const notEkle = async () => { const not = prompt('Müşteri notu:', customer.not || ''); if (not === null) return; try { await api.patch(`/store/customers/${id}`, { not }); toast.success('Not kaydedildi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const saveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(balForm.tutar) || 0;
    if (amt <= 0) { toast.error('Tutar girin'); return; }
    try { await api.post(`/store/customers/${id}/balance`, { tip: balForm.tip, tutar: amt, aciklama: balForm.aciklama }); toast.success('İşlem kaydedildi'); setBalModal(false); setBalForm({ tip: 'yukleme', tutar: '', aciklama: '' }); reload(); loadLedger(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const setDiscount = async () => { const v = prompt('Varsayılan indirim (%):', String(customer.indirimYuzde || 0)); if (v === null) return; try { await api.patch(`/store/customers/${id}`, { indirimYuzde: Number(v) || 0 }); toast.success('İndirim güncellendi'); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const TABS = [
    { k: 'gecmis', t: 'Alışveriş Geçmişi' },
    { k: 'iptal', t: 'İptal Edilen Sepetler' },
    { k: 'odeme', t: 'Ödeme Hareketleri' },
    { k: 'iade', t: 'İade & Değişim' },
    { k: 'kupon', t: 'Kuponlar' },
    { k: 'davranis', t: 'Davranış Analizi' },
  ];

  const odendi = (o: any) => (o.tahsilat || 0) >= (o.toplam || 0) && (o.toplam || 0) > 0;

  return (
    <div className="space-y-4">
      {/* Üst bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <button onClick={() => nav('/musterilerim')} className="hover:text-slate-600">Müşterilerim</button>
          <span>›</span><span className="text-slate-700 font-medium">Müşteri Hesap Dökümü</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={notEkle} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50"><FileText size={15} /> Not Ekle</button>
          <button onClick={sohbet} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50"><MessageCircle size={15} /> Mesaj Gönder</button>
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={15} /> İşlem Yap <ChevronDown size={14} /></button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-11 z-50 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1">
                  <button onClick={() => { setMenu(false); setBalForm({ tip: 'yukleme', tutar: '', aciklama: '' }); setBalModal(true); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">Bakiye Yükle</button>
                  <button onClick={() => { setMenu(false); setBalForm({ tip: 'iade', tutar: '', aciklama: '' }); setBalModal(true); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">İade İşle</button>
                  <button onClick={() => { setMenu(false); setDiscount(); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">Varsayılan İndirim</button>
                  <button onClick={() => { setMenu(false); nav('/siparisler'); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">Siparişlere Git</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Profil + KPI */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-5">
          {/* Profil */}
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold">{initials(customer.ad)}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-slate-800">{customer.ad}</h1>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Kayıtlı Müşteri</span>
                <Star size={15} className="text-amber-400 fill-amber-400" />
              </div>
              {ig && <p className="text-sm text-slate-500 mt-0.5">Kullanıcı Adı: <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer" className="text-pink-600">@{ig}</a></p>}
              <div className="text-sm text-slate-500 mt-1 space-y-0.5">
                {customer.telefon && <p>{customer.telefon}</p>}
                {customer.email && <p>{customer.email}</p>}
                {customer.adres && <p className="truncate">{customer.adres}</p>}
                <p className="text-slate-400">Müşteri No: #M{customer.musteriNo || customer.id.slice(-4).toUpperCase()} · Kayıt: {dt(customer.createdAt)}</p>
              </div>
            </div>
          </div>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <Kpi label="Toplam Alışveriş" value={fmt0(k.ciro)} sub={`${k.count} sipariş`} />
            <Kpi label="İptal Edilen Sepet" value={String(k.iptalAdet)} sub={fmt0(k.iptalTutar)} />
            <Kpi label="İade Edilen Tutar" value={fmt0(k.iadeTutar)} sub={`${k.iadeAdet} işlem`} />
            <Kpi label="Net Harcama" value={fmt0(k.ciro - k.iadeTutar)} sub="Toplam - İade" />
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex flex-col justify-center">
              <p className="text-[11px] text-slate-400">Risk Grubu</p>
              <p className={`text-base font-bold ${k.risk.c}`}>{k.risk.t}</p>
              <p className="text-[10px] text-slate-400 mt-1">Güncelleme: {dshort(new Date().toISOString())}</p>
            </div>
          </div>
        </div>
      </div>

      {/* İkinci sıra: Bakiye / Ödeme / Karlılık / Ortalama */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Bakiye Durumu</p>
          <p className="text-2xl font-bold text-indigo-600">{fmt(customer.bakiye || 0)}</p>
          <p className="text-xs text-slate-400 mb-3">Mevcut Bakiye</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Toplam Yükleme</span><span className="text-slate-700">{fmt(k.yukleme)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Toplam Harcama</span><span className="text-slate-700">{fmt(k.harcama)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Varsayılan İndirim</span><span className="text-slate-700">%{customer.indirimYuzde || 0}</span></div>
          </div>
          <button onClick={() => { setBalForm({ tip: 'yukleme', tutar: '', aciklama: '' }); setBalModal(true); }} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50"><Plus size={14} /> Bakiye Yükle</button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Ödeme Alışkanlığı</p>
          <div className="flex items-center gap-3">
            <Donut pct={k.odemeOrani} label={`%${k.odemeOrani}`} />
            <div><p className="font-semibold text-slate-700">{k.odemeOrani >= 80 ? 'İyi' : k.odemeOrani >= 50 ? 'Orta' : 'Zayıf'}</p><p className="text-xs text-slate-400">Zamanında ödeme oranı</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Alışveriş Karlılığı</p>
          <div className="flex items-end justify-between">
            <div><p className="text-xl font-bold text-slate-800">{fmt0(k.kar)}</p><p className="text-xs text-slate-400">Toplam Kâr</p></div>
            <div className="text-right"><p className="text-xl font-bold text-green-600">%{k.karOran.toFixed(1)}</p><p className="text-xs text-slate-400">Karlılık Oranı</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Ortalama Sipariş Tutarı</p>
          <p className="text-2xl font-bold text-slate-800">{fmt(k.ort)}</p>
          <p className="text-xs text-slate-400 mt-1">{k.count} sipariş ortalaması</p>
        </div>
      </div>

      {/* Tablar + içerik */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-1 border-b border-slate-200 px-2 overflow-x-auto">
              {TABS.map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)} className={`px-3 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${tab === t.k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{t.t}</button>
              ))}
            </div>
            <div className="p-4">
              {tab === 'gecmis' && (
                <Table head={['Sipariş No', 'Tarih', 'Tutar', 'Durum', 'Ödeme', 'Kâr', '']}>
                  {myOrders.filter((o) => o.durum !== 'iptal').map((o) => {
                    const cost = (o.items || []).reduce((x: number, it: any) => x + (prodCost.get(it.productId) || 0) * (it.adet || 1), 0);
                    const kar = (o.toplam || 0) - cost;
                    const st = STMAP[o.durum] || { t: o.durum, c: 'bg-slate-100 text-slate-500' };
                    return (
                      <tr key={o.id} className="border-t border-slate-100">
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{orderLabel(o)}</td>
                        <td className="px-3 py-2.5 text-slate-500">{dshort(o.createdAt)}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-800">{fmt(o.toplam)}</td>
                        <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.c}`}>{st.t}</span></td>
                        <td className="px-3 py-2.5 text-slate-500">{o.odemeYontemi || (odendi(o) ? 'Ödendi' : '-')}</td>
                        <td className={`px-3 py-2.5 font-medium ${kar >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(kar)}</td>
                        <td className="px-3 py-2.5"><button onClick={() => nav('/siparisler')} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><Eye size={14} /></button></td>
                      </tr>
                    );
                  })}
                  {myOrders.filter((o) => o.durum !== 'iptal').length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">Sipariş yok</td></tr>}
                </Table>
              )}
              {tab === 'iptal' && (
                <Table head={['Sipariş No', 'Tarih', 'Tutar', 'Durum', '']}>
                  {myOrders.filter((o) => o.durum === 'iptal').map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{orderLabel(o)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{dshort(o.createdAt)}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{fmt(o.toplam)}</td>
                      <td className="px-3 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">İptal Edildi</span></td>
                      <td className="px-3 py-2.5"><button onClick={() => nav('/siparisler')} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><Eye size={14} /></button></td>
                    </tr>
                  ))}
                  {myOrders.filter((o) => o.durum === 'iptal').length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-slate-400">İptal edilen sepet yok</td></tr>}
                </Table>
              )}
              {tab === 'odeme' && (
                <Table head={['Tarih', 'İşlem', 'Açıklama', 'Tutar']}>
                  {ledger.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 text-slate-500">{dt(l.createdAt)}</td>
                      <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.tip === 'yukleme' ? 'bg-green-100 text-green-700' : l.tip === 'iade' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{l.tip === 'yukleme' ? 'Bakiye Yükleme' : l.tip === 'iade' ? 'İade' : 'Harcama'}</span></td>
                      <td className="px-3 py-2.5 text-slate-500">{l.aciklama || '-'}</td>
                      <td className={`px-3 py-2.5 font-medium ${l.tip === 'harcama' ? 'text-red-500' : 'text-green-600'}`}>{l.tip === 'harcama' ? '-' : '+'}{fmt(l.tutar)}</td>
                    </tr>
                  ))}
                  {ledger.length === 0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-slate-400">Hareket yok</td></tr>}
                </Table>
              )}
              {tab === 'iade' && (
                <Table head={['Tarih', 'Açıklama', 'Tutar']}>
                  {ledger.filter((l) => l.tip === 'iade').map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 text-slate-500">{dt(l.createdAt)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{l.aciklama || '-'}</td>
                      <td className="px-3 py-2.5 font-medium text-blue-600">+{fmt(l.tutar)}</td>
                    </tr>
                  ))}
                  {ledger.filter((l) => l.tip === 'iade').length === 0 && <tr><td colSpan={3} className="px-3 py-10 text-center text-slate-400">İade kaydı yok</td></tr>}
                </Table>
              )}
              {tab === 'kupon' && (
                <Table head={['Kod', 'İndirim', 'Tip', 'Durum']}>
                  {discountCodes.map((d: any) => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-indigo-600">{d.code}</td>
                      <td className="px-3 py-2.5 text-slate-700">{d.tip === 'yuzde' ? '%' + d.deger : fmt(d.deger)}</td>
                      <td className="px-3 py-2.5 text-slate-500">{d.tip === 'yuzde' ? 'Yüzde' : 'Tutar'}</td>
                      <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${d.aktif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{d.aktif ? 'Aktif' : 'Pasif'}</span></td>
                    </tr>
                  ))}
                  {discountCodes.length === 0 && <tr><td colSpan={4} className="px-3 py-10 text-center text-slate-400">Kupon yok</td></tr>}
                </Table>
              )}
              {tab === 'davranis' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Behav icon={ShoppingBag} label="Toplam Sipariş" value={String(myOrders.length)} />
                  <Behav icon={TrendingUp} label="Tamamlanan" value={String(myOrders.filter((o) => o.durum === 'teslim' || o.durum === 'tamamlandi').length)} />
                  <Behav icon={X} label="İptal Oranı" value={`%${myOrders.length ? Math.round((k.iptalAdet / myOrders.length) * 100) : 0}`} />
                  <Behav icon={Wallet} label="Zamanında Ödeme" value={`%${k.odemeOrani}`} />
                </div>
              )}
            </div>
          </div>

          {/* Bakiye & Ödeme Hareketleri */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Bakiye & Ödeme Hareketleri</p>
            <div className="space-y-2">
              {ledger.slice(0, 6).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
                  <div><p className="text-slate-700 font-medium">{l.tip === 'yukleme' ? 'Bakiye Yükleme' : l.tip === 'iade' ? 'İade' : 'Harcama'}</p><p className="text-[11px] text-slate-400">{dt(l.createdAt)}{l.aciklama ? ' · ' + l.aciklama : ''}</p></div>
                  <span className={`font-semibold ${l.tip === 'harcama' ? 'text-red-500' : 'text-green-600'}`}>{l.tip === 'harcama' ? '-' : '+'}{fmt(l.tutar)}</span>
                </div>
              ))}
              {ledger.length === 0 && <p className="text-sm text-slate-400">Henüz hareket yok.</p>}
            </div>
          </div>
        </div>

        {/* Sağ panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase mb-3">İade & Değişim Özeti</p>
            <div className="flex items-center gap-3 mb-3">
              <Donut pct={k.count ? (k.iadeAdet / Math.max(1, k.count)) * 100 : 0} color="#a78bfa" label={`%${k.count ? ((k.iadeAdet / Math.max(1, k.count)) * 100).toFixed(1) : '0'}`} sub="İade Oranı" />
              <div className="flex-1 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">İade İşlemi</span><span className="font-medium">{k.iadeAdet}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">İade Tutarı</span><span className="font-medium">{fmt0(k.iadeTutar)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">İptal Sayısı</span><span className="font-medium">{k.iptalAdet}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3"><p className="text-xs font-semibold text-slate-500 uppercase">Kuponlar & Özel İndirimler</p></div>
            <div className="space-y-2">
              {discountCodes.filter((d: any) => d.aktif).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                  <span className="font-mono text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{d.code}</span>
                  <span className="text-sm text-slate-600">{d.tip === 'yuzde' ? '%' + d.deger + ' İndirim' : fmt(d.deger) + ' İndirim'}</span>
                </div>
              ))}
              {discountCodes.filter((d: any) => d.aktif).length === 0 && <p className="text-sm text-slate-400">Aktif kupon yok.</p>}
              {(customer.indirimYuzde || 0) > 0 && (
                <div className="flex items-center justify-between border border-indigo-100 bg-indigo-50 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-indigo-700">Müşteriye Özel</span>
                  <span className="text-sm text-indigo-700">%{customer.indirimYuzde} sabit indirim</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bakiye modal */}
      {balModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setBalModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={saveBalance} className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Bakiye İşlemi</h3><button type="button" onClick={() => setBalModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <div className="grid grid-cols-3 gap-2">
              {[{ k: 'yukleme', t: 'Yükleme' }, { k: 'harcama', t: 'Harcama' }, { k: 'iade', t: 'İade' }].map((x) => (
                <button type="button" key={x.k} onClick={() => setBalForm((f) => ({ ...f, tip: x.k }))} className={`py-2 text-sm rounded-lg border ${balForm.tip === x.k ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 text-slate-500'}`}>{x.t}</button>
              ))}
            </div>
            <input autoFocus type="number" value={balForm.tutar} onChange={(e) => setBalForm((f) => ({ ...f, tutar: e.target.value }))} placeholder="Tutar" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <input value={balForm.aciklama} onChange={(e) => setBalForm((f) => ({ ...f, aciklama: e.target.value }))} placeholder="Açıklama (ops.)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Kaydet</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: any) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] text-slate-400">{label}</p><p className="text-base font-bold text-slate-800">{value}</p>{sub && <p className="text-[10px] text-slate-400">{sub}</p>}</div>;
}
function Table({ head, children }: any) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-slate-400 text-left text-xs uppercase"><tr>{head.map((h: string, i: number) => <th key={i} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Behav({ icon: Ic, label, value }: any) {
  return <div className="flex items-center gap-3 border border-slate-100 rounded-lg p-3"><div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><Ic size={18} /></div><div><p className="text-xs text-slate-400">{label}</p><p className="text-lg font-bold text-slate-800">{value}</p></div></div>;
}
