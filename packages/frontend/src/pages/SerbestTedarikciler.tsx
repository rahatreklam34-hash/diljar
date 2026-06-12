import { useState, useEffect } from 'react';
import { UserCog, Plus, X, Eye, EyeOff, Trash2, Package, BarChart3, Copy, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

const fmt = (n: number) => '₺' + (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SerbestTedarikciler() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ad: '', pin: '' });
  const [addBusy, setAddBusy] = useState(false);
  const [newCred, setNewCred] = useState<{ loginCode: string; pin: string; ad: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailProds, setDetailProds] = useState<any[]>([]);
  const [detailSales, setDetailSales] = useState<any[]>([]);
  const [detailTab, setDetailTab] = useState<'urunler' | 'satislar'>('urunler');
  const [showPin, setShowPin] = useState(false);

  const load = async () => { setLoading(true); try { const r = await api.get('/store/free/suppliers'); setList(r.data || []); } catch (e) { toast.error(apiErrorMessage(e)); } setLoading(false); };
  useEffect(() => { load(); }, []);

  const addSupplier = async () => {
    if (!addForm.ad.trim()) { toast.error('Ad zorunludur'); return; }
    setAddBusy(true);
    try {
      const r = await api.post('/store/free/suppliers', { ad: addForm.ad, pin: addForm.pin || undefined });
      setNewCred({ loginCode: r.data.loginCode, pin: r.data.pin, ad: r.data.ad });
      setAddForm({ ad: '', pin: '' });
      setAddOpen(false);
      await load();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    setAddBusy(false);
  };

  const toggleAktif = async (s: any) => {
    try { await api.patch(`/store/free/suppliers/${s.id}`, { aktif: !s.aktif }); await load(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    try {
      const [pr, sa] = await Promise.all([api.get(`/store/free/suppliers/${id}/products`), api.get(`/store/free/suppliers/${id}/sales`)]);
      setDetailProds(pr.data || []);
      setDetailSales(sa.data || []);
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const copy = (text: string) => { navigator.clipboard?.writeText(text); toast.success('Kopyalandı'); };

  const detailSupplier = list.find((s) => s.id === detailId);

  // Satış özeti (ürün bazlı)
  const salesSummary = detailSales.reduce((acc: Record<string, { ad: string; toplam: number; bedenler: Record<string, number> }>, o: any) => {
    const key = o.freeProductId || o.urun;
    if (!acc[key]) acc[key] = { ad: o.urun, toplam: 0, bedenler: {} };
    acc[key].toplam++;
    if (o.beden) acc[key].bedenler[o.beden] = (acc[key].bedenler[o.beden] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center"><UserCog size={20} className="text-violet-600" /></div>
          <div><h1 className="text-lg font-bold text-slate-800">Tedarikçiler</h1><p className="text-xs text-slate-400">Serbest satış için toptancı giriş hesapları</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg text-sm"><RefreshCw size={14} /> Yenile</button>
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700"><Plus size={16} /> Tedarikçi Ekle</button>
        </div>
      </div>

      {/* Tedarikçi listesi */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center p-10"><span className="w-7 h-7 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" /></div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <UserCog size={32} className="mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">Henüz tedarikçi yok</p>
            <p className="text-sm mt-1">Tedarikçi ekleyerek ürün yüklemelerine izin verin.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left"><tr><th className="px-4 py-3">Ad</th><th className="px-4 py-3">Giriş Kodu</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Kayıt</th><th className="px-4 py-3">İşlem</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{s.ad}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><code className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono">{s.loginCode}</code><button onClick={() => copy(s.loginCode)} className="text-slate-400 hover:text-slate-600"><Copy size={13} /></button></div></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.aktif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{s.aktif ? 'Aktif' : 'Pasif'}</span></td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(s.createdAt).toLocaleDateString('tr-TR')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openDetail(s.id)} className="inline-flex items-center gap-1 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg text-xs"><Package size={13} /> Detay</button>
                      <button onClick={() => toggleAktif(s)} className={`px-2 py-1 rounded-lg text-xs ${s.aktif ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}>{s.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Tedarikçi Ekle Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Tedarikçi Ekle</h3><button onClick={() => setAddOpen(false)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs text-slate-400">Giriş kodu otomatik oluşturulur. PIN boş bırakılırsa da otomatik atanır.</p>
            <div><label className="block text-xs text-slate-500 mb-1">Tedarikçi Adı *</label><input value={addForm.ad} onChange={(e) => setAddForm({ ...addForm, ad: e.target.value })} placeholder="Firma / kişi adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" /></div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">PIN (boş = otomatik)</label>
              <div className="relative"><input type={showPin ? 'text' : 'password'} value={addForm.pin} onChange={(e) => setAddForm({ ...addForm, pin: e.target.value })} placeholder="Boş bırakın veya belirleyin" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg pr-9" /><button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-2.5 top-2.5 text-slate-400">{showPin ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
            </div>
            <button onClick={addSupplier} disabled={addBusy} className="w-full bg-violet-600 text-white py-2.5 rounded-lg font-medium hover:bg-violet-700 disabled:opacity-50">{addBusy ? 'Ekleniyor...' : 'Ekle'}</button>
          </div>
        </div>
      )}

      {/* Yeni Tedarikçi Kimlik Bilgileri */}
      {newCred && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50" onClick={() => setNewCred(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">Giriş Bilgileri</h3><button onClick={() => setNewCred(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="bg-violet-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-violet-800">{newCred.ad}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-xs text-slate-500">Giriş Kodu</span><div className="flex items-center gap-2"><code className="text-sm font-mono font-bold text-slate-800">{newCred.loginCode}</code><button onClick={() => copy(newCred.loginCode)} className="text-violet-600"><Copy size={14} /></button></div></div>
                <div className="flex items-center justify-between"><span className="text-xs text-slate-500">PIN</span><div className="flex items-center gap-2"><code className="text-sm font-mono font-bold text-slate-800">{newCred.pin}</code><button onClick={() => copy(newCred.pin)} className="text-violet-600"><Copy size={14} /></button></div></div>
              </div>
              <p className="text-[11px] text-slate-400">Portal adresi: <strong>{window.location.origin}/tedarikci</strong></p>
              <button onClick={() => copy(`Giriş Kodu: ${newCred.loginCode}\nPIN: ${newCred.pin}\nPortal: ${window.location.origin}/tedarikci`)} className="w-full text-xs bg-violet-600 text-white py-2 rounded-lg hover:bg-violet-700 inline-flex items-center justify-center gap-1.5"><Copy size={13} /> Tümünü Kopyala</button>
            </div>
            <p className="text-[11px] text-red-500">Bu bilgileri şimdi kaydedin — PIN bir daha gösterilmeyecek.</p>
          </div>
        </div>
      )}

      {/* Tedarikçi Detay Modal */}
      {detailId && detailSupplier && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" onClick={() => setDetailId(null)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl p-6 max-h-[88vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">{detailSupplier.ad}</h3><button onClick={() => setDetailId(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setDetailTab('urunler')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${detailTab === 'urunler' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Ürünler ({detailProds.length})</button>
              <button onClick={() => setDetailTab('satislar')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${detailTab === 'satislar' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Satışlar ({detailSales.length})</button>
            </div>
            {detailTab === 'urunler' ? (
              <div className="space-y-2">
                {detailProds.length === 0 ? <p className="text-slate-400 text-sm text-center py-8">Henüz ürün yüklenmemiş.</p> : detailProds.map((p) => {
                  const vars: any[] = Array.isArray(p.variations) ? p.variations : [];
                  const topStok = vars.reduce((s: number, v: any) => s + (v.stok || 0), 0);
                  const img = Array.isArray(p.images) ? p.images[0] : null;
                  return (
                    <div key={p.id} className="flex items-center gap-3 border border-slate-200 rounded-xl p-3">
                      {img ? <img src={img} className="w-12 h-12 rounded-lg object-cover shrink-0" /> : <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Package size={16} className="text-slate-300" /></div>}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 text-sm truncate">{p.ad}</p>
                        <p className="text-[11px] text-slate-400">Kod: {p.salesCode || '-'} · Alış: {fmt(p.alisFiyat)} · Stok: {topStok}</p>
                        {vars.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{vars.map((v: any, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${v.stok > 0 ? 'border-slate-200 text-slate-500' : 'border-red-200 text-red-400 line-through'}`}>{v.deger}:{v.stok}</span>)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.keys(salesSummary).length === 0 ? <p className="text-slate-400 text-sm text-center py-8">Henüz satış yok.</p> : Object.values(salesSummary).map((e: any, i: number) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center justify-between"><p className="font-medium text-slate-800 text-sm">{e.ad}</p><span className="text-sm font-bold text-indigo-600">{e.toplam} adet</span></div>
                    {Object.keys(e.bedenler).length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{Object.entries(e.bedenler).map(([b, n]: any) => <span key={b} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{b}: {n}</span>)}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
