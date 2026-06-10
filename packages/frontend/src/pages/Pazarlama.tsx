import { useEffect, useState } from 'react';
import { Megaphone, Eye, TrendingUp, UserX, Send, Copy, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

const fmt0 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function Pazarlama() {
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState('ilgi');
  const [sms, setSms] = useState<{ open: boolean; nums: string[]; baslik: string }>({ open: false, nums: [], baslik: '' });
  const [mesaj, setMesaj] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { api.get('/store/pazarlama').then((r) => setD(r.data)).catch(() => {}); }, []);

  const smsAc = (baslik: string, nums: (string | null | undefined)[]) => { const list = [...new Set(nums.filter(Boolean) as string[])]; if (!list.length) { toast.error('Telefonu olan kişi yok'); return; } setSms({ open: true, nums: list, baslik }); setMesaj(''); };
  const kopyala = () => { navigator.clipboard.writeText(sms.nums.join(', ')); toast.success(sms.nums.length + ' numara kopyalandı'); };

  const gonder = async () => {
    if (!mesaj.trim()) { toast.error('Lütfen SMS metnini yazın'); return; }
    setSending(true);
    try {
      const r = await api.post('/sms/send', { numbers: sms.nums, message: mesaj });
      const res = r.data;
      if (res?.ok) { toast.success(res.message || `${res.sent} numaraya gönderildi`); setSms({ ...sms, open: false }); }
      else toast.error(res?.message || 'SMS gönderilemedi');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || apiErrorMessage(e));
    } finally { setSending(false); }
  };

  if (!d) return <div className="p-6 flex justify-center"><span className="w-7 h-7 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Megaphone className="text-indigo-600" size={22} /></div>
        <div><h1 className="text-2xl font-bold text-slate-800">Pazarlama & Kampanyalar</h1><p className="text-sm text-slate-400">Müşteri davranışlarını analiz et, hedefli SMS pazarlaması yap.</p></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Eye} cls="bg-sky-100 text-sky-600" label="Toplam Görüntülenme" value={String(d.ozet.toplamGoruntulenme)} />
        <Kpi icon={Eye} cls="bg-indigo-100 text-indigo-600" label="Görüntülenen Ürün" value={String(d.ozet.tekilUrun)} />
        <Kpi icon={TrendingUp} cls="bg-amber-100 text-amber-600" label="İlgilenip Almayan" value={String(d.ozet.ilgiAmaAlmadi)} />
        <Kpi icon={UserX} cls="bg-red-100 text-red-600" label="Pasif Müşteri" value={String(d.ozet.pasif)} />
      </div>

      {/* En çok görüntülenen */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3">En Çok İlgi Gören Ürünler</h3>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {d.enCokGoruntulenen.map((p: any) => (
            <div key={p.id} className="w-36 shrink-0 border border-slate-100 rounded-xl p-2.5"><div className="w-full aspect-square rounded-lg bg-slate-100 overflow-hidden mb-2">{p.img && <img src={p.img} className="w-full h-full object-cover" />}</div><p className="text-xs font-medium text-slate-800 truncate">{p.ad}</p><p className="text-[11px] text-indigo-600 flex items-center gap-1"><Eye size={11} /> {p.goruntulenme} görüntüleme</p></div>
          ))}
          {d.enCokGoruntulenen.length === 0 && <p className="text-sm text-slate-400 py-4">Henüz görüntüleme verisi yok.</p>}
        </div>
      </div>

      {/* Segmentler */}
      <div className="flex gap-1 border-b border-slate-200">
        {[['ilgi', 'İlgilenip Almayanlar'], ['harcayan', 'En Çok Harcayanlar'], ['pasif', 'Pasif Müşteriler']].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>{t}</button>
        ))}
      </div>

      {tab === 'ilgi' && (
        <Segment title="Ürünü inceleyip almayan müşteriler" onSms={() => smsAc('İlgilenip almayanlar', d.ilgiAmaAlmadi.map((x: any) => x.telefon))}>
          {d.ilgiAmaAlmadi.map((x: any, i: number) => <Row key={i} ad={x.ad} tel={x.telefon} extra={'İncelediği: ' + x.urun} />)}
          {d.ilgiAmaAlmadi.length === 0 && <Empty />}
        </Segment>
      )}
      {tab === 'harcayan' && (
        <Segment title="En çok harcayan müşteriler (VIP teklif gönder)" onSms={() => smsAc('En çok harcayanlar', d.enCokHarcayan.map((x: any) => x.telefon))}>
          {d.enCokHarcayan.map((x: any, i: number) => <Row key={i} ad={x.ad} tel={x.telefon} extra={fmt0(x.tutar)} />)}
          {d.enCokHarcayan.length === 0 && <Empty />}
        </Segment>
      )}
      {tab === 'pasif' && (
        <Segment title="30+ gündür alışveriş yapmayanlar (geri kazan)" onSms={() => smsAc('Pasif müşteriler', d.pasifMusteriler.map((x: any) => x.telefon))}>
          {d.pasifMusteriler.map((x: any, i: number) => <Row key={i} ad={x.ad} tel={x.telefon} extra={x.sonAlisveris ? 'Son: ' + new Date(x.sonAlisveris).toLocaleDateString('tr-TR') : ''} />)}
          {d.pasifMusteriler.length === 0 && <Empty />}
        </Segment>
      )}

      {/* Sipariş bildirim ayarları */}
      <SmsBildirimAyar />

      {sms.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setSms({ ...sms, open: false })}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-slate-800">SMS Pazarlama — {sms.baslik}</h3>
            <div className="bg-slate-50 rounded-xl p-3 text-sm flex items-center justify-between"><span className="text-slate-500">{sms.nums.length} alıcı</span><button onClick={kopyala} className="text-indigo-600 inline-flex items-center gap-1 text-xs"><Copy size={13} /> Numaraları Kopyala</button></div>
            <textarea value={mesaj} onChange={(e) => setMesaj(e.target.value)} rows={4} maxLength={600} placeholder="SMS metnini yazın... (ör. Size özel %20 indirim! Mağazamızı ziyaret edin.)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
            <div className="flex items-center justify-between text-[11px] text-slate-400"><span>{mesaj.length} karakter (~{Math.max(1, Math.ceil(mesaj.length / 160))} SMS)</span></div>
            <button onClick={gonder} disabled={sending} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-medium inline-flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-60"><Send size={16} /> {sending ? 'Gönderiliyor...' : 'NetGSM ile Gönder'}</button>
            <p className="text-[11px] text-slate-400 text-center">NetGSM bağlı değilse Entegrasyonlar &gt; SMS bölümünden bilgilerinizi girin. Numaraları kopyalayıp manuel de gönderebilirsiniz.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SmsBildirimAyar() {
  const [s, setS] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/sms/settings').then((r) => setS(r.data)).catch(() => setS({ configured: false, notify_new: false, notify_approved: false, notify_shipped: false, tpl_new: '', tpl_approved: '', tpl_shipped: '' })); }, []);
  if (!s) return null;
  const set = (k: string, v: any) => setS((x: any) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try { const r = await api.put('/sms/settings', s); setS(r.data); toast.success('Bildirim ayarları kaydedildi'); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setBusy(false); }
  };
  const rows = [
    { k: 'notify_new', tk: 'tpl_new', label: 'Sipariş Alındı', desc: 'Yeni sipariş oluşturulduğunda' },
    { k: 'notify_approved', tk: 'tpl_approved', label: 'Onaylandı / Hazırlanıyor', desc: 'Sipariş durumu hazırlanıyor olunca' },
    { k: 'notify_shipped', tk: 'tpl_shipped', label: 'Kargoya Verildi', desc: 'Kargoda durumuna geçince veya takip no girilince' },
  ];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center"><Bell size={18} className="text-indigo-600" /></div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Sipariş Bildirimleri (SMS)</h3>
            <p className="text-[11px] text-slate-400">Sipariş durumu değişince müşteriye otomatik SMS gönderilir. Değişkenler: <code className="text-indigo-500">{'{ad} {no} {tutar} {kargo} {takip} {firma}'}</code></p>
          </div>
        </div>
        <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${s.configured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{s.configured ? 'NetGSM bağlı' : 'NetGSM bilgileri eksik'}</span>
      </div>
      {!s.configured && <p className="text-[12px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Bildirimlerin gönderilmesi için <b>Entegrasyonlar &gt; SMS</b> bölümünden NetGSM bilgilerini girip etkinleştirin.</p>}
      {rows.map((row) => (
        <div key={row.k} className="border border-slate-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div><span className="text-sm font-medium text-slate-700">{row.label}</span><span className="block text-[11px] text-slate-400">{row.desc}</span></div>
            <label className="inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={!!s[row.k]} onChange={(e) => set(row.k, e.target.checked)} />
              <div className="w-10 h-5 bg-slate-200 peer-checked:bg-indigo-500 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-5" />
            </label>
          </div>
          <textarea value={s[row.tk] || ''} onChange={(e) => set(row.tk, e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
      ))}
      <button onClick={save} disabled={busy} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">{busy ? 'Kaydediliyor...' : 'Bildirim Ayarlarını Kaydet'}</button>
    </div>
  );
}

function Kpi({ icon: Ic, cls, label, value }: any) { return <div className="bg-white rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 mb-2"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}><Ic size={18} /></div><p className="text-xs text-slate-400">{label}</p></div><p className="text-xl font-bold text-slate-800">{value}</p></div>; }
function Segment({ title, onSms, children }: any) { return <div className="bg-white rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-slate-800 text-sm">{title}</h3><button onClick={onSms} className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-2 rounded-lg text-xs font-medium"><Send size={14} /> SMS Gönder</button></div><div className="divide-y divide-slate-50">{children}</div></div>; }
function Row({ ad, tel, extra }: any) { return <div className="flex items-center justify-between py-2.5 text-sm"><div><p className="font-medium text-slate-800">{ad}</p>{tel && <p className="text-[11px] text-slate-400">{tel}</p>}</div><span className="text-slate-500 text-xs">{extra}</span></div>; }
function Empty() { return <p className="text-sm text-slate-400 py-6 text-center">Bu segmentte kayıt yok.</p>; }
