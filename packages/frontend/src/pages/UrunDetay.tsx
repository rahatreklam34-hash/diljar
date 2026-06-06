import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, TrendingUp, Wallet, Clock, Users, Gauge, AlertTriangle, Pencil } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const dshort = (d: string) => d ? new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';
const dtime = (d: string) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const orderLabel = (o: any) => o?.orderNo ? `${o.orderYil || new Date(o.createdAt).getFullYear()}-${String(o.orderNo).padStart(3, '0')}` : '#' + o.id.slice(-5).toUpperCase();
const KANAL: Record<string, string> = { online: 'Online Mağaza', canli: 'Canlı Yayın', manuel: 'Manuel', asistan: 'Asistan' };

export default function UrunDetay() {
  const { id } = useParams();
  const nav = useNavigate();
  const { products, orders, customers, categories } = useStore();
  const p = products.find((x) => x.id === id);
  const cust = (cid?: string) => customers.find((c) => c.id === cid);

  const a = useMemo(() => {
    if (!p) return null;
    // bu ürünün geçtiği sipariş kalemleri (iptal/sepet hariç)
    const moves: any[] = [];
    for (const o of orders) {
      if (o.durum === 'iptal') continue;
      for (const it of (o.items || [])) {
        if (it.productId !== p.id) continue;
        // 'sepet' durumundaki kayıtları yalnızca stoktan düşülmüşse (canlı satış) say
        if (o.durum === 'sepet' && !it.stokDusuldu) continue;
        moves.push({ orderId: o.id, o, tarih: o.createdAt, adet: it.adet || 1, fiyat: it.fiyat || 0, beden: it.varyasyon || it.beden || '', kanal: o.kanal, customerId: o.customerId, durum: o.durum });
      }
    }
    moves.sort((x, y) => new Date(y.tarih).getTime() - new Date(x.tarih).getTime());
    const satilanAdet = moves.reduce((s, m) => s + m.adet, 0);
    const ciro = moves.reduce((s, m) => s + m.fiyat * m.adet, 0);
    const maliyetSatilan = (p.alisFiyat || 0) * satilanAdet;
    const realizedKar = ciro - maliyetSatilan;
    const margin = ciro ? (realizedKar / ciro) * 100 : 0;
    const stok = p.stokAdeti || 0;
    const stokMaliyet = (p.alisFiyat || 0) * stok;
    const potansiyelKar = ((p.satisFiyat || 0) - (p.alisFiyat || 0)) * stok;

    // depo yaşı / satış hızı
    const eklenme = p.createdAt ? new Date(p.createdAt).getTime() : (moves.length ? new Date(moves[moves.length - 1].tarih).getTime() : Date.now());
    const gunDepo = Math.max(1, Math.round((Date.now() - eklenme) / 86400000));
    const sonSatis = moves.length ? new Date(moves[0].tarih).getTime() : null;
    const gunSonSatis = sonSatis ? Math.round((Date.now() - sonSatis) / 86400000) : null;
    const haftalikHiz = (satilanAdet / gunDepo) * 7; // adet/hafta
    const gundeBir = satilanAdet > 0 ? gunDepo / satilanAdet : null; // kaç günde 1 satış
    // tükenme tahmini
    const gunlukHiz = satilanAdet / gunDepo;
    const tukenmeGun = gunlukHiz > 0 ? Math.round(stok / gunlukHiz) : null;

    // kim aldı
    const byCust = new Map<string, { ad: string; adet: number; tutar: number; son: string }>();
    for (const m of moves) {
      const c = cust(m.customerId); const key = m.customerId || 'anon';
      const cur = byCust.get(key) || { ad: c?.ad || 'Misafir', adet: 0, tutar: 0, son: m.tarih };
      cur.adet += m.adet; cur.tutar += m.fiyat * m.adet; if (m.tarih > cur.son) cur.son = m.tarih;
      byCust.set(key, cur);
    }
    const alanlar = [...byCust.values()].sort((x, y) => y.adet - x.adet);

    // aylık satış (son 6 ay)
    const aylar: { ay: string; adet: number }[] = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); aylar.push({ ay: d.toLocaleDateString('tr-TR', { month: 'short' }), adet: 0 }); }
    const now = new Date();
    for (const m of moves) { const md = new Date(m.tarih); const diff = (now.getFullYear() - md.getFullYear()) * 12 + (now.getMonth() - md.getMonth()); if (diff >= 0 && diff <= 5) aylar[5 - diff].adet += m.adet; }
    const maxAy = Math.max(1, ...aylar.map((x) => x.adet));

    // durağanlık
    const duragan = gunSonSatis !== null && gunSonSatis > 60;
    const hizliSatan = haftalikHiz >= 3;

    return { moves, satilanAdet, ciro, maliyetSatilan, realizedKar, margin, stok, stokMaliyet, potansiyelKar, gunDepo, gunSonSatis, haftalikHiz, gundeBir, tukenmeGun, alanlar, aylar, maxAy, duragan, hizliSatan, eklenme };
  }, [p, orders, customers]);

  if (!p) return <div className="p-6"><button onClick={() => nav('/depo/urunlerim')} className="text-indigo-600 inline-flex items-center gap-1"><ArrowLeft size={16} /> Ürünlerim</button><p className="mt-6 text-slate-400">Ürün bulunamadı.</p></div>;
  const kategoriAd = categories.find((c: any) => c.id === p.kategoriId)?.ad || '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <button onClick={() => nav('/depo/urunlerim')} className="hover:text-slate-600">Ürünlerim</button><span>›</span><span className="text-slate-700 font-medium">Stok Kartı</span>
        </div>
        <button onClick={() => nav('/depo/urunlerim')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50"><Pencil size={15} /> Ürünü Düzenle</button>
      </div>

      {/* Üst kart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex gap-4 flex-wrap">
          <div className="w-28 h-28 rounded-2xl bg-slate-100 overflow-hidden shrink-0">{(p.images || [])[0] ? <img src={p.images[0]} className="w-full h-full object-cover" /> : <Package className="m-auto mt-9 text-slate-300" size={40} />}</div>
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-xl font-bold text-slate-800">{p.ad}</h1>
            <p className="text-sm text-slate-400 mt-0.5">{[kategoriAd, p.marka, p.cinsiyet].filter(Boolean).join(' · ')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-3 text-sm">
              <div><span className="text-slate-400 text-xs">Barkod</span><p className="font-mono text-slate-700">{p.barkod || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">SKU</span><p className="font-mono text-slate-700">{p.sku || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">Satış Kodu</span><p className="font-mono text-slate-700">{p.salesCode || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">Lokasyon</span><p className="text-slate-700">{p.lokasyon || '-'}</p></div>
              <div><span className="text-slate-400 text-xs">Alış</span><p className="text-slate-700">{fmt(p.alisFiyat)}</p></div>
              <div><span className="text-slate-400 text-xs">Satış</span><p className="text-slate-700">{fmt(p.satisFiyat)}</p></div>
              <div><span className="text-slate-400 text-xs">Mevcut Stok</span><p className={`font-bold ${(p.stokAdeti || 0) === 0 ? 'text-red-500' : (p.stokAdeti || 0) <= 5 ? 'text-amber-600' : 'text-green-600'}`}>{p.stokAdeti || 0}</p></div>
              <div><span className="text-slate-400 text-xs">Eklenme</span><p className="text-slate-700">{p.createdAt ? dshort(p.createdAt) : '-'}</p></div>
            </div>
            {(p.variations || []).length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{p.variations.map((v: any) => <span key={v.id} className={`text-xs px-2 py-1 rounded-lg border ${v.stok === 0 ? 'border-red-200 text-red-500 bg-red-50' : v.stok <= 3 ? 'border-amber-200 text-amber-700 bg-amber-50' : 'border-slate-200 text-slate-600'}`}>{v.deger}: {v.stok}</span>)}</div>}
          </div>
        </div>
        {a && (a.duragan || a.hizliSatan || (p.stokAdeti || 0) === 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {a.hizliSatan && <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium"><TrendingUp size={12} /> Hızlı satan ürün</span>}
            {a.duragan && <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-medium"><AlertTriangle size={12} /> {a.gunSonSatis} gündür satılmadı (durağan)</span>}
            {(p.stokAdeti || 0) === 0 && <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-600 px-2.5 py-1 rounded-full font-medium"><AlertTriangle size={12} /> Stok tükendi</span>}
          </div>
        )}
      </div>

      {a && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={Package} cls="bg-indigo-100 text-indigo-600" label="Satılan Adet" value={String(a.satilanAdet)} sub={`${a.moves.length} işlem`} />
            <Kpi icon={Wallet} cls="bg-violet-100 text-violet-600" label="Toplam Ciro" value={fmt0(a.ciro)} />
            <Kpi icon={TrendingUp} cls="bg-emerald-100 text-emerald-600" label="Gerçekleşen Kâr" value={fmt0(a.realizedKar)} sub={`%${a.margin.toFixed(1)} marj`} valueCls={a.realizedKar >= 0 ? 'text-green-600' : 'text-red-500'} />
            <Kpi icon={Gauge} cls="bg-sky-100 text-sky-600" label="Satış Hızı" value={`${a.haftalikHiz.toFixed(1)}/hafta`} sub={a.gundeBir ? `~${a.gundeBir.toFixed(0)} günde 1` : 'satış yok'} />
            <Kpi icon={Clock} cls="bg-amber-100 text-amber-600" label="Depoda Yatma" value={`${a.gunDepo} gün`} sub={a.gunSonSatis !== null ? `son satış ${a.gunSonSatis} gün önce` : 'hiç satılmadı'} />
            <Kpi icon={Wallet} cls="bg-slate-200 text-slate-600" label="Stok / Potansiyel" value={fmt0(a.stokMaliyet)} sub={`pot. kâr ${fmt0(a.potansiyelKar)}`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            {/* Sol: satış hareketleri */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-3">Satış Hareketleri</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-slate-400 text-left text-xs uppercase"><tr><th className="py-2">Tarih</th><th className="py-2">Sipariş</th><th className="py-2">Müşteri</th><th className="py-2">Kanal</th><th className="py-2">Beden</th><th className="py-2">Adet</th><th className="py-2 text-right">Tutar</th></tr></thead>
                  <tbody>
                    {a.moves.map((m, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-2.5 text-slate-500">{dtime(m.tarih)}</td>
                        <td className="py-2.5 font-mono text-xs text-slate-600">{orderLabel(m.o)}</td>
                        <td className="py-2.5 text-slate-700">{cust(m.customerId)?.ad || 'Misafir'}</td>
                        <td className="py-2.5"><span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">{KANAL[m.kanal] || m.kanal}</span></td>
                        <td className="py-2.5 text-slate-500">{m.beden || '-'}</td>
                        <td className="py-2.5 text-slate-700">{m.adet}</td>
                        <td className="py-2.5 text-right font-medium text-slate-800">{fmt(m.fiyat * m.adet)}</td>
                      </tr>
                    ))}
                    {a.moves.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">Bu ürün için satış kaydı yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sağ: aylık trend + kim aldı */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 text-sm mb-3">Aylık Satış (6 ay)</h3>
                <div className="flex items-end justify-between gap-1.5 h-28">
                  {a.aylar.map((x, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-slate-500">{x.adet || ''}</span>
                      <div className="w-full bg-indigo-500 rounded-t" style={{ height: `${(x.adet / a.maxAy) * 90}px`, minHeight: x.adet ? 4 : 0 }} />
                      <span className="text-[10px] text-slate-400">{x.ay}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-1.5"><Users size={15} className="text-indigo-600" /> Bu Ürünü Alanlar ({a.alanlar.length})</h3>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {a.alanlar.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2">
                      <div><p className="font-medium text-slate-700">{c.ad}</p><p className="text-[11px] text-slate-400">son: {dshort(c.son)}</p></div>
                      <div className="text-right"><p className="font-semibold text-slate-800">{c.adet} adet</p><p className="text-[11px] text-slate-400">{fmt0(c.tutar)}</p></div>
                    </div>
                  ))}
                  {a.alanlar.length === 0 && <p className="text-sm text-slate-400">Henüz alıcı yok.</p>}
                </div>
              </div>
              {a.tukenmeGun !== null && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 text-sm text-slate-700"><b>Tahmini tükenme:</b> mevcut hızla ~{a.tukenmeGun} gün içinde stok biter.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Ic, cls, label, value, sub, valueCls }: any) {
  return <div className="bg-white rounded-2xl border border-slate-200 p-3.5"><div className="flex items-center gap-2 mb-1.5"><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}><Ic size={18} /></div><p className="text-[11px] text-slate-400 leading-tight">{label}</p></div><p className={`text-lg font-bold ${valueCls || 'text-slate-800'}`}>{value}</p>{sub && <p className="text-[11px] text-slate-400">{sub}</p>}</div>;
}
