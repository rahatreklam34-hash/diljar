import { useEffect, useState } from 'react';
import { Plus, Trash2, X, Award } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

const TIPLER: Record<string, { t: string; c: string }> = {
  iade: { t: 'İade', c: 'bg-red-100 text-red-700' },
  yanlis_beden: { t: 'Yanlış Beden', c: 'bg-amber-100 text-amber-700' },
  sikayet: { t: 'Şikayet', c: 'bg-rose-100 text-rose-700' },
  gecikme: { t: 'Gecikme', c: 'bg-orange-100 text-orange-700' },
  olumlu: { t: 'Olumlu', c: 'bg-green-100 text-green-700' },
  not: { t: 'Not', c: 'bg-slate-100 text-slate-600' },
};
const scoreColor = (p: number) => p >= 80 ? 'text-green-600' : p >= 60 ? 'text-amber-600' : 'text-red-600';

export default function Sicil() {
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ satici: '', tip: 'iade', aciklama: '' });

  const load = () => api.get('/store/sicil').then((r) => setList(r.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const ekle = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form.satici) { toast.error('Satıcı seç'); return; }
    try { await api.post('/store/sicil', form); toast.success('Sicil kaydı eklendi'); setModal(false); setForm({ satici: '', tip: 'iade', aciklama: '' }); load(); if (sel) { const r = await api.get('/store/sicil'); setSel((r.data || []).find((x: any) => x.satici === sel.satici)); } } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => { try { await api.delete(`/store/sicil/${id}`); load(); if (sel) { const r = await api.get('/store/sicil'); setSel((r.data || []).find((x: any) => x.satici === sel.satici)); } } catch (e) { toast.error(apiErrorMessage(e)); } };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Award className="text-emerald-600" size={22} /></div><div><h1 className="text-2xl font-bold text-slate-800">Personel Sicili & Kalite</h1><p className="text-sm text-slate-400">İade, yanlış beden ve şikayetlere göre kalite puanı. Kim ne hak ediyor görün.</p></div></div>
        <button onClick={() => { setForm({ satici: sel?.satici || '', tip: 'iade', aciklama: '' }); setModal(true); }} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-emerald-700"><Plus size={16} /> Sicil Kaydı Ekle</button>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-4 items-start">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-slate-400 text-left text-xs uppercase border-b border-slate-100"><tr><th className="px-4 py-3">Personel/Satıcı</th><th className="px-4 py-3">Satış</th><th className="px-4 py-3">İptal/İade</th><th className="px-4 py-3">Yanlış Beden</th><th className="px-4 py-3">Şikayet</th><th className="px-4 py-3">Kalite Puanı</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.satici} onClick={() => setSel(s)} className={`border-b border-slate-50 cursor-pointer hover:bg-slate-50 ${sel?.satici === s.satici ? 'bg-emerald-50/50' : ''}`}>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800">{s.satici}</p><p className="text-[11px] text-slate-400">{s.unvan || 'Satıcı'}</p></td>
                  <td className="px-4 py-3 text-slate-600">{s.satis}</td>
                  <td className="px-4 py-3 text-red-500">{s.iptal + s.iade}</td>
                  <td className="px-4 py-3 text-amber-600">{s.yanlisBeden}</td>
                  <td className="px-4 py-3 text-rose-600">{s.sikayet}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><span className={`text-lg font-bold ${scoreColor(s.puan)}`}>{s.puan}</span><div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${s.puan >= 80 ? 'bg-green-500' : s.puan >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: s.puan + '%' }} /></div></div></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Henüz personel/satıcı verisi yok.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Detay */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          {!sel ? <p className="text-sm text-slate-400 text-center py-10">Detay için bir personel seçin.</p> : (
            <>
              <div className="flex items-center justify-between mb-3"><div><h3 className="font-bold text-slate-800">{sel.satici}</h3><p className="text-xs text-slate-400">{sel.unvan || 'Satıcı'}</p></div><div className="text-center"><p className={`text-3xl font-extrabold ${scoreColor(sel.puan)}`}>{sel.puan}</p><p className="text-[10px] text-slate-400">Kalite Puanı</p></div></div>
              <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                <div className="bg-slate-50 rounded-lg p-2"><p className="font-bold text-slate-800">{sel.satis}</p><p className="text-[10px] text-slate-400">Satış</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="font-bold text-red-500">%{sel.iptalOrani}</p><p className="text-[10px] text-slate-400">İptal Oranı</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="font-bold text-green-600">{sel.olumlu}</p><p className="text-[10px] text-slate-400">Olumlu</p></div>
              </div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Sicil Kayıtları</h4>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(sel.kayitlar || []).length === 0 && <p className="text-sm text-slate-400">Kayıt yok.</p>}
                {(sel.kayitlar || []).map((k: any) => { const tp = TIPLER[k.tip] || { t: k.tip, c: 'bg-slate-100' }; return (
                  <div key={k.id} className="flex items-start gap-2 border border-slate-100 rounded-xl p-2.5">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${tp.c} shrink-0`}>{tp.t}</span>
                    <div className="flex-1 min-w-0"><p className="text-sm text-slate-700">{k.aciklama || '-'}</p><p className="text-[10px] text-slate-400">{new Date(k.createdAt).toLocaleString('tr-TR')}</p></div>
                    <button onClick={() => del(k.id)} className="text-red-400"><Trash2 size={14} /></button>
                  </div>
                ); })}
              </div>
            </>
          )}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={ekle} className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-800">Sicil Kaydı</h3><button type="button" onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <div><label className="text-xs text-slate-500">Personel/Satıcı</label>{list.length > 0 ? <select value={form.satici} onChange={(e) => setForm({ ...form, satici: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mt-1"><option value="">Seçiniz</option>{list.map((s) => <option key={s.satici} value={s.satici}>{s.satici}</option>)}</select> : <input value={form.satici} onChange={(e) => setForm({ ...form, satici: e.target.value })} placeholder="Satıcı adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mt-1" />}</div>
            <div><label className="text-xs text-slate-500">Tip</label><select value={form.tip} onChange={(e) => setForm({ ...form, tip: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mt-1">{Object.entries(TIPLER).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select></div>
            <textarea value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} rows={2} placeholder="Açıklama (ör. yanlış beden gönderdi, müşteri şikayet etti)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium">Kaydet</button>
          </form>
        </div>
      )}
    </div>
  );
}
