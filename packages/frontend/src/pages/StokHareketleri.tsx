import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ArrowDownCircle, ArrowUpCircle, Search, RefreshCw, TrendingUp, TrendingDown, Layers } from 'lucide-react';
import api from '../lib/api';
import { useUrlState } from '../lib/useUrlState';

const dtime = (d: string) => d ? new Date(d).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
const KANAL: Record<string, string> = { online: 'Online Mağaza', canli: 'Canlı Yayın', kasa: 'Kasa', manuel: 'Manuel', asistan: 'Asistan' };
const TIP_META: Record<string, { label: string; cls: string }> = {
  satis: { label: 'Satış', cls: 'bg-green-50 text-green-700 border-green-200' },
  iptal_iade: { label: 'İptal/İade', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  sepet_cikar: { label: 'Sepetten Çıkar', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  manuel: { label: 'Manuel', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  olusturma: { label: 'Oluşturma', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  ice_aktarma: { label: 'İçe Aktarma', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};
const tipMeta = (t: string) => TIP_META[t] || { label: t || '-', cls: 'bg-slate-100 text-slate-600 border-slate-200' };

const TIP_OPTS = [['', 'Tüm Tipler'], ['satis', 'Satış'], ['iptal_iade', 'İptal/İade'], ['sepet_cikar', 'Sepetten Çıkar'], ['manuel', 'Manuel'], ['olusturma', 'Oluşturma'], ['ice_aktarma', 'İçe Aktarma']];
const KANAL_OPTS = [['', 'Tüm Kanallar'], ['online', 'Online Mağaza'], ['canli', 'Canlı Yayın'], ['kasa', 'Kasa'], ['manuel', 'Manuel'], ['asistan', 'Asistan']];

export default function StokHareketleri() {
  const [q, setQ] = useUrlState('q', '');
  const [qInput, setQInput] = useState(q);
  const [tip, setTip] = useUrlState('tip', '');
  const [kanal, setKanal] = useUrlState('kanal', '');
  const [from, setFrom] = useUrlState('from', '');
  const [to, setTo] = useUrlState('to', '');
  const [page, setPage] = useUrlState('page', 1);
  const pageSize = 50;

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [ozet, setOzet] = useState<{ toplamGiris: number; toplamCikis: number; net: number }>({ toplamGiris: 0, toplamCikis: 0, net: 0 });
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/store/stock-movements', { params: { q: q || undefined, tip: tip || undefined, kanal: kanal || undefined, from: from || undefined, to: to || undefined, page, pageSize } })
      .then((r) => { setRows(r.data?.rows || []); setTotal(r.data?.total || 0); setOzet(r.data?.ozet || { toplamGiris: 0, toplamCikis: 0, net: 0 }); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [q, tip, kanal, from, to, page]);

  // Otomatik arama: qInput degisince 400ms debounce ile setQ + setPage(1)
  const searchMounted = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) { searchMounted.current = true; return; }
    const t = setTimeout(() => { setPage(1); setQ(qInput.trim()); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);

  const sayfaSayisi = Math.max(1, Math.ceil(total / pageSize));
  const filtreAktif = useMemo(() => !!(q || tip || kanal || from || to), [q, tip, kanal, from, to]);

  const [backfilling, setBackfilling] = useState(false);
  const backfill = async () => {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const r = await api.post('/store/stock-movements/backfill', {});
      const c = r.data?.count ?? 0;
      if (r.data?.skipped) alert('Geçmiş kayıtlar zaten doldurulmuş (' + (r.data?.count || 0) + ' kayıt).');
      else alert(c + ' geçmiş hareket kaydı oluşturuldu.');
      setPage(1); load();
    } catch {
      alert('Geçmiş doldurma sırasında bir hata oluştu.');
    } finally { setBackfilling(false); }
  };

  const uygulaArama = () => { setPage(1); setQ(qInput.trim()); };
  const temizle = () => { setQInput(''); setQ(''); setTip(''); setKanal(''); setFrom(''); setTo(''); setPage(1); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><ClipboardList size={20} /></div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Stok Hareketleri</h1>
            <p className="text-xs text-slate-400">Tüm satış, iptal/iade, manuel düzenleme ve stok değişim kayıtları</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Yenile</button>
          <button onClick={backfill} disabled={backfilling} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-emerald-200 text-emerald-700 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"><RefreshCw size={15} className={backfilling ? 'animate-spin' : ''} /> Geçmişi Doldur</button>
        </div>
      </div>

      {/* Özet kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center"><TrendingDown size={18} /></div>
          <div><p className="text-[11px] text-slate-400">Toplam Çıkış (satış vb.)</p><p className="text-xl font-bold text-green-600">{ozet.toplamCikis.toLocaleString('tr-TR')}</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center"><TrendingUp size={18} /></div>
          <div><p className="text-[11px] text-slate-400">Toplam Giriş (iade/manuel)</p><p className="text-xl font-bold text-amber-600">{ozet.toplamGiris.toLocaleString('tr-TR')}</p></div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center"><Layers size={18} /></div>
          <div><p className="text-[11px] text-slate-400">Net (giriş − çıkış)</p><p className={`text-xl font-bold ${ozet.net >= 0 ? 'text-slate-700' : 'text-red-500'}`}>{ozet.net.toLocaleString('tr-TR')}</p></div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-slate-400">Ara (ürün / sipariş / müşteri)</label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input value={qInput} onChange={(e) => setQInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && uygulaArama()} placeholder="Ürün adı, sipariş no, müşteri…" className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <button onClick={uygulaArama} className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Ara</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400">Tip</label>
            <select value={tip} onChange={(e) => { setPage(1); setTip(e.target.value); }} className="block mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg">
              {TIP_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Kanal</label>
            <select value={kanal} onChange={(e) => { setPage(1); setKanal(e.target.value); }} className="block mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg">
              {KANAL_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Başlangıç</label>
            <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} className="block mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <div>
            <label className="text-xs text-slate-400">Bitiş</label>
            <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} className="block mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          {filtreAktif && <button onClick={temizle} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Temizle</button>}
        </div>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="text-slate-400 text-left text-xs uppercase bg-slate-50"><tr>
              <th className="px-4 py-3">Tarih</th><th className="px-4 py-3">Ürün</th><th className="px-4 py-3">Varyasyon</th><th className="px-4 py-3">Tip</th><th className="px-4 py-3">Kanal</th><th className="px-4 py-3 text-right">Miktar</th><th className="px-4 py-3">Müşteri / Kullanıcı</th><th className="px-4 py-3">Sipariş</th>
            </tr></thead>
            <tbody>
              {rows.map((m, i) => {
                const meta = tipMeta(m.tip);
                const isGiris = m.yon === 'giris';
                return (
                  <tr key={m.id || i} className="border-t border-slate-100 hover:bg-slate-50/60 align-top">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{dtime(m.createdAt)}</td>
                    <td className="px-4 py-3">
                      {m.productId ? <Link to={`/depo/urun/${m.productId}`} className="text-slate-700 hover:text-emerald-600 font-medium">{m.productAd}</Link> : <span className="text-slate-700">{m.productAd}</span>}
                      {m.productKod && <p className="text-[11px] text-slate-400 font-mono">{m.productKod}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.varyasyon || '-'}</td>
                    <td className="px-4 py-3"><span className={`inline-block text-xs px-2 py-0.5 rounded border ${meta.cls}`}>{meta.label}</span></td>
                    <td className="px-4 py-3">{m.kanal ? <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">{KANAL[m.kanal] || m.kanal}</span> : <span className="text-slate-300">-</span>}</td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${isGiris ? 'text-amber-600' : 'text-green-600'}`}><span className="inline-flex items-center gap-1 justify-end">{isGiris ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />}{isGiris ? '+' : '−'}{m.miktar}</span></td>
                    <td className="px-4 py-3 text-slate-700">{m.customerAd || m.kullanici || '-'}{m.aciklama && <p className="text-[11px] text-slate-400">{m.aciklama}</p>}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.sipNo || '-'}</td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-slate-400">Kayıt bulunamadı.</td></tr>}
              {loading && <tr><td colSpan={8} className="py-12 text-center text-slate-400">Yükleniyor…</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Sayfalama */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>Toplam {total.toLocaleString('tr-TR')} kayıt</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage((x) => Math.max(1, x - 1))} className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Önceki</button>
              <span>{page} / {sayfaSayisi}</span>
              <button disabled={page >= sayfaSayisi} onClick={() => setPage((x) => Math.min(sayfaSayisi, x + 1))} className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Sonraki</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
