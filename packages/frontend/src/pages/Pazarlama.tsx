import { useEffect, useState } from 'react';
import { Megaphone, Eye, TrendingUp, UserX, Send, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

const fmt0 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });

export default function Pazarlama() {
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState('ilgi');
  const [sms, setSms] = useState<{ open: boolean; nums: string[]; baslik: string }>({ open: false, nums: [], baslik: '' });
  const [mesaj, setMesaj] = useState('');

  useEffect(() => { api.get('/store/pazarlama').then((r) => setD(r.data)).catch(() => {}); }, []);

  const smsAc = (baslik: string, nums: (string | null | undefined)[]) => { const list = [...new Set(nums.filter(Boolean) as string[])]; if (!list.length) { toast.error('Telefonu olan kişi yok'); return; } setSms({ open: true, nums: list, baslik }); setMesaj(''); };
  const kopyala = () => { navigator.clipboard.writeText(sms.nums.join(', ')); toast.success(sms.nums.length + ' numara kopyalandı'); };

  if (!d) return <div className="p-6 text-slate-400">Yükleniyor...</div>;

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

      {sms.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setSms({ ...sms, open: false })}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-slate-800">SMS Pazarlama — {sms.baslik}</h3>
            <div className="bg-slate-50 rounded-xl p-3 text-sm flex items-center justify-between"><span className="text-slate-500">{sms.nums.length} alıcı</span><button onClick={kopyala} className="text-indigo-600 inline-flex items-center gap-1 text-xs"><Copy size={13} /> Numaraları Kopyala</button></div>
            <textarea value={mesaj} onChange={(e) => setMesaj(e.target.value)} rows={4} placeholder="SMS metnini yazın... (ör. Size özel %20 indirim! Mağazamızı ziyaret edin.)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
            <button onClick={() => { toast.success('SMS gönderimi için entegrasyon (Netgsm/İletimerkezi) eklenince aktif olacak. Numaralar kopyalandı.'); kopyala(); }} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl font-medium inline-flex items-center justify-center gap-2"><Send size={16} /> Gönder</button>
            <p className="text-[11px] text-slate-400 text-center">Not: Toplu SMS için Netgsm/İletimerkezi gibi bir sağlayıcı entegrasyonu gerekir; ekleyince buradan otomatik gönderilir.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Ic, cls, label, value }: any) { return <div className="bg-white rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 mb-2"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}><Ic size={18} /></div><p className="text-xs text-slate-400">{label}</p></div><p className="text-xl font-bold text-slate-800">{value}</p></div>; }
function Segment({ title, onSms, children }: any) { return <div className="bg-white rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between mb-3"><h3 className="font-semibold text-slate-800 text-sm">{title}</h3><button onClick={onSms} className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-2 rounded-lg text-xs font-medium"><Send size={14} /> SMS Gönder</button></div><div className="divide-y divide-slate-50">{children}</div></div>; }
function Row({ ad, tel, extra }: any) { return <div className="flex items-center justify-between py-2.5 text-sm"><div><p className="font-medium text-slate-800">{ad}</p>{tel && <p className="text-[11px] text-slate-400">{tel}</p>}</div><span className="text-slate-500 text-xs">{extra}</span></div>; }
function Empty() { return <p className="text-sm text-slate-400 py-6 text-center">Bu segmentte kayıt yok.</p>; }
