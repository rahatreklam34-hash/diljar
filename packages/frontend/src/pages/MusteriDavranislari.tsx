import { useMemo, useState } from 'react';
import { Users, BarChart3, Tag, Layers, Ruler, ShoppingBag, TrendingUp, Wallet } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
const fmt2 = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const GENDER_LBL: Record<string, string> = { kadin: 'Kadın', erkek: 'Erkek', cocuk: 'Çocuk', unisex: 'Unisex' };
const VALID = (o: any) => o.durum !== 'iptal' && o.durum !== 'sepet';

type Agg = { adet: number; ciro: number };
const emptyAgg = (): Agg => ({ adet: 0, ciro: 0 });

export default function MusteriDavranislari() {
  const { orders, products, categories, customers } = useStore();
  const [period, setPeriod] = useState(0);
  const [kanal, setKanal] = useState('all');

  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.ad])), [categories]);
  const custName = (id?: string) => { const c = customers.find((x) => x.id === id); return c?.ad || c?.instagram || 'Misafir'; };

  const data = useMemo(() => {
    const cins = new Map<string, Agg>(), marka = new Map<string, Agg>(), kat = new Map<string, Agg>(), beden = new Map<string, Agg>();
    const perCust = new Map<string, { adet: number; ciro: number; cins: Map<string, number>; marka: Map<string, number>; kat: Map<string, number> }>();
    let toplamAdet = 0, toplamCiro = 0;
    const add = (m: Map<string, Agg>, k: string, adet: number, tutar: number) => { if (!k) return; const a = m.get(k) || emptyAgg(); a.adet += adet; a.ciro += tutar; m.set(k, a); };

    for (const o of orders) {
      if (!VALID(o)) continue;
      if (period && (Date.now() - new Date(o.createdAt).getTime()) > period * 86400000) continue;
      if (kanal !== 'all' && (o.kanal || 'manuel') !== kanal) continue;
      const cid = o.customerId || '__misafir';
      for (const it of (o.items || [])) {
        const adet = Number(it.adet) || 1;
        const tutar = (Number(it.fiyat) || 0) * adet;
        const p: any = prodMap.get(it.productId);
        const g = p?.cinsiyet || '';
        const b = p?.marka || '';
        const ka = p?.kategoriId ? (catMap.get(p.kategoriId) || '') : '';
        const bd = it.varyasyon || (p?.cinsiyet ? '' : '');
        toplamAdet += adet; toplamCiro += tutar;
        if (g) add(cins, g, adet, tutar);
        if (b) add(marka, b, adet, tutar);
        if (ka) add(kat, ka, adet, tutar);
        if (bd) add(beden, String(bd), adet, tutar);
        // müşteri bazlı
        const pc = perCust.get(cid) || { adet: 0, ciro: 0, cins: new Map(), marka: new Map(), kat: new Map() };
        pc.adet += adet; pc.ciro += tutar;
        if (g) pc.cins.set(g, (pc.cins.get(g) || 0) + adet);
        if (b) pc.marka.set(b, (pc.marka.get(b) || 0) + adet);
        if (ka) pc.kat.set(ka, (pc.kat.get(ka) || 0) + adet);
        perCust.set(cid, pc);
      }
    }
    const toList = (m: Map<string, Agg>, lbl?: (k: string) => string) => [...m.entries()].map(([k, v]) => ({ k: lbl ? lbl(k) : k, adet: v.adet, ciro: v.ciro, ort: v.adet ? v.ciro / v.adet : 0 })).sort((a, b) => b.adet - a.adet);
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    const musteriler = [...perCust.entries()].filter(([id]) => id !== '__misafir').map(([id, v]) => ({ id, ad: custName(id), adet: v.adet, ciro: v.ciro, ort: v.adet ? v.ciro / v.adet : 0, cins: GENDER_LBL[top(v.cins)] || top(v.cins), marka: top(v.marka), kat: top(v.kat) })).sort((a, b) => b.ciro - a.ciro);
    return {
      cins: toList(cins, (k) => GENDER_LBL[k] || k), marka: toList(marka), kat: toList(kat), beden: toList(beden),
      toplamAdet, toplamCiro, ortFiyat: toplamAdet ? toplamCiro / toplamAdet : 0,
      benzersizMusteri: [...perCust.keys()].filter((k) => k !== '__misafir').length,
      musteriler,
    };
  }, [orders, period, kanal, prodMap, catMap, customers]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-fuchsia-100 flex items-center justify-center"><Users className="text-fuchsia-600" size={22} /></div>
          <div><h1 className="text-2xl font-bold text-slate-800">Müşteri Davranışları</h1><p className="text-sm text-slate-400">Müşterilerin satın aldığı cinsiyet, marka, kategori, beden tercihleri ve ortalama fiyatlar.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <select value={kanal} onChange={(e) => setKanal(e.target.value)} className="text-sm px-3 py-2 border border-slate-200 rounded-xl bg-white">
            {[['all', 'Tüm Kanallar'], ['online', 'Online Mağaza'], ['canli', 'Canlı Yayın'], ['kasa', 'Kasa'], ['asistan', 'Asistan']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="text-sm px-3 py-2 border border-slate-200 rounded-xl bg-white">
            {[[0, 'Tüm Zamanlar'], [30, 'Son 30 Gün'], [90, 'Son 90 Gün'], [180, 'Son 6 Ay']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={ShoppingBag} cls="bg-indigo-100 text-indigo-600" label="Satılan Ürün" value={String(data.toplamAdet)} sub="adet" />
        <Kpi icon={Wallet} cls="bg-emerald-100 text-emerald-600" label="Toplam Ciro" value={fmt(data.toplamCiro)} sub="satışlardan" />
        <Kpi icon={TrendingUp} cls="bg-amber-100 text-amber-600" label="Ort. Ürün Fiyatı" value={fmt2(data.ortFiyat)} sub="ürün başına" />
        <Kpi icon={Users} cls="bg-fuchsia-100 text-fuchsia-600" label="Alışveriş Yapan" value={String(data.benzersizMusteri)} sub="benzersiz müşteri" />
      </div>

      {data.toplamAdet === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">Bu filtrede satış verisi yok. Ürünlerde cinsiyet/marka/kategori bilgisi girili olmalı.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DistCard title="Cinsiyete Göre" Ic={Users} color="bg-sky-500" items={data.cins} />
            <DistCard title="Bedene Göre" Ic={Ruler} color="bg-violet-500" items={data.beden} note="Sipariş satırındaki seçilen varyasyon (beden) baz alınır." />
            <DistCard title="Markaya Göre" Ic={Tag} color="bg-emerald-500" items={data.marka} />
            <DistCard title="Kategoriye Göre" Ic={Layers} color="bg-amber-500" items={data.kat} />
          </div>

          {/* Müşteri bazlı tercih tablosu */}
          {data.musteriler.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2"><BarChart3 size={16} className="text-fuchsia-600" /><h3 className="font-semibold text-slate-800">Müşteri Bazlı Tercihler</h3><span className="text-xs text-slate-400">en çok harcayan {Math.min(data.musteriler.length, 50)} müşteri</span></div>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[680px]">
                <thead className="text-[11px] text-slate-400 uppercase text-left border-b border-slate-100"><tr><th className="px-4 py-3">Müşteri</th><th className="px-4 py-3">Cinsiyet</th><th className="px-4 py-3">Marka</th><th className="px-4 py-3">Kategori</th><th className="px-4 py-3 text-right">Adet</th><th className="px-4 py-3 text-right">Toplam</th><th className="px-4 py-3 text-right">Ort. Ürün</th></tr></thead>
                <tbody>{data.musteriler.slice(0, 50).map((m) => (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{m.ad}</td>
                    <td className="px-4 py-2.5"><span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-600">{m.cins}</span></td>
                    <td className="px-4 py-2.5 text-slate-600">{m.marka}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.kat}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{m.adet}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmt(m.ciro)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600">{fmt2(m.ort)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Ic, cls, label, value, sub }: any) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-2"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cls}`}><Ic size={16} /></div><p className="text-[11px] text-slate-400">{label}</p></div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-400">{sub}</p>
    </div>
  );
}

function DistCard({ title, Ic, color, items, note }: { title: string; Ic: any; color: string; items: { k: string; adet: number; ciro: number; ort: number }[]; note?: string }) {
  const max = items[0]?.adet || 1;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 text-sm mb-1 flex items-center gap-2"><Ic size={15} className="text-slate-500" /> {title}</h3>
      {note && <p className="text-[11px] text-slate-400 mb-2">{note}</p>}
      {items.length === 0 ? <p className="text-sm text-slate-400 mt-2">Veri yok.</p> : (
        <div className="space-y-2.5 mt-3">
          {items.slice(0, 10).map((it) => (
            <div key={it.k} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1"><span className="text-sm font-medium text-slate-700 truncate pr-2">{it.k}</span><span className="text-xs text-slate-400 shrink-0">{it.adet} adet</span></div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${(it.adet / max) * 100}%` }} /></div>
              </div>
              <div className="text-right shrink-0 w-24">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{fmt2(it.ort)}</p>
                <p className="text-[10px] text-slate-400">ort. fiyat</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
