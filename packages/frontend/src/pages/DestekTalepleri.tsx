import { useEffect, useState } from 'react';
import { Headphones, Plus, Trash2, X, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

const DURUM: Record<string, { t: string; c: string }> = {
  acik: { t: 'Açık', c: 'bg-blue-100 text-blue-700' },
  islemde: { t: 'İşlemde', c: 'bg-amber-100 text-amber-700' },
  cozuldu: { t: 'Çözüldü', c: 'bg-green-100 text-green-700' },
};

export default function DestekTalepleri() {
  const [list, setList] = useState<any[]>([]);
  const [filter, setFilter] = useState<'hepsi' | 'acik' | 'islemde' | 'cozuldu'>('hepsi');
  const [detail, setDetail] = useState<any | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ musteriAd: '', baslik: '', konu: '', detay: '' });

  const load = () => api.get('/assistant/destek-talepleri').then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const setDurum = async (id: string, durum: string) => { try { await api.patch(`/assistant/destek-talepleri/${id}`, { durum }); load(); if (detail?.id === id) setDetail({ ...detail, durum }); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const saveYanit = async () => { if (!detail) return; try { await api.patch(`/assistant/destek-talepleri/${detail.id}`, { yanit: detail.yanit || '' }); toast.success('Not kaydedildi (müşteri numarayla sorunca görür)'); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const del = async (id: string) => { if (!confirm('Talep silinsin mi?')) return; try { await api.delete(`/assistant/destek-talepleri/${id}`); load(); setDetail(null); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const create = async (e: React.FormEvent) => { e.preventDefault(); if (!form.baslik) { toast.error('Başlık gerekli'); return; } try { await api.post('/assistant/destek-talepleri', form); toast.success('Oluşturuldu'); setModal(false); setForm({ musteriAd: '', baslik: '', konu: '', detay: '' }); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  const filtered = filter === 'hepsi' ? list : list.filter((t) => t.durum === filter);
  const cnt = (d: string) => list.filter((t) => t.durum === d).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Headphones className="text-indigo-600" size={22} /></div>
        <div className="flex-1"><h1 className="text-xl font-bold text-slate-800">Destek Talepleri</h1><p className="text-sm text-slate-400">Müşterilerinizden gelen destek/şikayet talepleri</p></div>
        <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700"><Plus size={18} /> Talep Ekle</button>
      </div>

      <div className="flex gap-2 mb-4">
        {([['hepsi', `Tümü ${list.length}`], ['acik', `Açık ${cnt('acik')}`], ['islemde', `İşlemde ${cnt('islemde')}`], ['cozuldu', `Çözüldü ${cnt('cozuldu')}`]] as const).map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{l}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left"><tr><th className="px-4 py-3">Kayıt No</th><th className="px-4 py-3">Başlık</th><th className="px-4 py-3">Konu</th><th className="px-4 py-3">Müşteri</th><th className="px-4 py-3">Kaynak</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3">Tarih</th><th className="px-4 py-3">İşlem</th></tr></thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs text-indigo-600">{t.no || '-'}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{t.baslik}</td>
                <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{t.konu || '-'}</td>
                <td className="px-4 py-3 text-slate-600">{t.musteriAd || '-'}</td>
                <td className="px-4 py-3"><span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{t.kaynak === 'chatbot' ? 'Chatbot' : 'Manuel'}</span></td>
                <td className="px-4 py-3">
                  <select value={t.durum} onChange={(e) => setDurum(t.id, e.target.value)} className={`text-xs px-2 py-1 rounded-full border-0 ${DURUM[t.durum]?.c || ''}`}>
                    <option value="acik">Açık</option><option value="islemde">İşlemde</option><option value="cozuldu">Çözüldü</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-slate-400">{new Date(t.createdAt).toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => setDetail(t)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"><Eye size={15} /></button><button onClick={() => del(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button></div></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Talep yok</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setDetail(null)}>
          <div className="w-full max-w-lg bg-white rounded-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2"><h3 className="text-lg font-bold text-slate-800">{detail.baslik}</h3><button onClick={() => setDetail(null)}><X size={20} className="text-slate-400" /></button></div>
            {detail.no && <p className="text-xs font-mono text-indigo-600 mb-1">Kayıt No: {detail.no}</p>}
            <p className="text-xs text-slate-400 mb-3">{detail.musteriAd || 'Müşteri'} · {detail.kaynak === 'chatbot' ? 'Chatbot' : 'Manuel'} · {new Date(detail.createdAt).toLocaleString('tr-TR')}</p>
            {detail.konu && <p className="text-sm text-slate-600 mb-2"><strong>Konu:</strong> {detail.konu}</p>}
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-line">{detail.detay || '-'}</div>
            <div className="flex gap-2 mt-4">
              {['acik', 'islemde', 'cozuldu'].map((d) => (
                <button key={d} onClick={() => setDurum(detail.id, d)} className={`px-3 py-1.5 rounded-lg text-sm ${detail.durum === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{DURUM[d].t}</button>
              ))}
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Müşteriye Not / Yanıt</label>
              <p className="text-[10px] text-slate-400 mb-1">Müşteri sohbette kayıt numarasını yazınca bu notu ve güncel durumu görür.</p>
              <textarea rows={3} value={detail.yanit || ''} onChange={(e) => setDetail({ ...detail, yanit: e.target.value })} placeholder="Örn: Talebiniz incelendi, kargonuz yeniden gönderildi." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <button onClick={saveYanit} className="mt-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">Notu Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="w-full max-w-md bg-white rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Yeni Destek Talebi</h3><button type="button" onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <input value={form.musteriAd} onChange={(e) => setForm({ ...form, musteriAd: e.target.value })} placeholder="Müşteri adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <input required value={form.baslik} onChange={(e) => setForm({ ...form, baslik: e.target.value })} placeholder="Başlık *" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <input value={form.konu} onChange={(e) => setForm({ ...form, konu: e.target.value })} placeholder="Konu" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <textarea rows={3} value={form.detay} onChange={(e) => setForm({ ...form, detay: e.target.value })} placeholder="Detay" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Oluştur</button>
          </form>
        </div>
      )}
    </div>
  );
}
