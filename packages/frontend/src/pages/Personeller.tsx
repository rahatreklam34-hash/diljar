import { useEffect, useState } from 'react';
import { UserCog, Plus, Pencil, Trash2, X, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export const AREAS: { key: string; label: string }[] = [
  { key: '/anasayfa', label: 'Genel Bakış (Dashboard)' },
  { key: '/canli-yayin', label: 'Canlı Yayın Satış' },
  { key: '/kasa-satis', label: 'Kasa Satışı (POS)' },
  { key: '/satici-performans', label: 'Satıcı Performansı' },
  { key: '/sicil', label: 'Personel Sicili' },
  { key: '/pazarlama', label: 'Pazarlama & SMS' },
  { key: '/depo', label: 'Depo Yönetimi (Ürünler)' },
  { key: '/online-magaza', label: 'Online Mağaza Ayarları' },
  { key: '/siparisler', label: 'Siparişler' },
  { key: '/musterilerim', label: 'Müşteriler' },
  { key: '/asistan', label: 'Yapay Zeka Asistanı' },
  { key: '/destek-talepleri', label: 'Destek Talepleri' },
  { key: '/cari-hesaplar', label: 'Cari Hesaplar' },
  { key: '/gelir-gider', label: 'Gelir / Gider' },
  { key: '/kasa-banka', label: 'Kasa & Banka' },
  { key: '/cekler', label: 'Çekler' },
  { key: '/personel', label: 'Personel (Maaş/HR)' },
  { key: '/finansal-durum', label: 'Finansal Durum / Raporlar' },
  { key: '/duzenli-odemeler', label: 'Düzenli Ödemeler' },
  { key: '/hedeflerim', label: 'Hedefler' },
  { key: '/hareket-loglari', label: 'Hareket Logları' },
  { key: '/belgelerim', label: 'Belgelerim' },
  { key: '/ajanda', label: 'Ajanda' },
  { key: '/bildirimler', label: 'Bildirimler' },
  { key: '/entegrasyonlar', label: 'Entegrasyonlar' },
  { key: '/ayarlar', label: 'Ayarlar' },
];
const PRESET_SATICI = ['/canli-yayin', '/kasa-satis', '/satici-performans', '/siparisler', '/musterilerim'];
const PRESET_MUDUR = AREAS.map((a) => a.key).filter((k) => !['/ayarlar', '/entegrasyonlar'].includes(k));

export default function Personeller() {
  const { isOwner } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const empty = { fullName: '', email: '', password: '', unvan: '', permissions: [] as string[] };
  const [form, setForm] = useState<any>(empty);

  const load = () => api.get('/staff').then((r) => setList(r.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!isOwner) return <div className="p-6 text-slate-500">Bu sayfaya yalnızca firma sahibi (patron) erişebilir.</div>;

  const open = (u?: any) => { setEdit(u || null); setForm(u ? { fullName: u.fullName, email: u.email, password: '', unvan: u.unvan || '', permissions: Array.isArray(u.permissions) ? u.permissions : [] } : { ...empty }); setModal(true); };
  const toggle = (k: string) => setForm((f: any) => ({ ...f, permissions: f.permissions.includes(k) ? f.permissions.filter((x: string) => x !== k) : [...f.permissions, k] }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (edit) await api.patch(`/staff/${edit.id}`, { fullName: form.fullName, unvan: form.unvan, permissions: form.permissions, ...(form.password ? { password: form.password } : {}) });
      else { if (!form.email || !form.password) { toast.error('E-posta ve şifre zorunlu'); return; } await api.post('/staff', form); }
      toast.success('Kaydedildi'); setModal(false); load();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const aktifToggle = async (u: any) => { try { await api.patch(`/staff/${u.id}`, { aktif: !u.aktif }); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  const del = async (id: string) => { if (!confirm('Personel hesabı silinsin mi?')) return; try { await api.delete(`/staff/${id}`); load(); } catch (e) { toast.error(apiErrorMessage(e)); } };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><UserCog className="text-indigo-600" size={22} /></div><div><h1 className="text-2xl font-bold text-slate-800">Personel & Yetki</h1><p className="text-sm text-slate-400">Çalışanlarına giriş hesabı aç, erişebilecekleri alanları belirle.</p></div></div>
        <button onClick={() => open()} className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-indigo-700"><Plus size={16} /> Personel Ekle</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="text-slate-400 text-left text-xs uppercase border-b border-slate-100"><tr><th className="px-4 py-3">Ad</th><th className="px-4 py-3">E-posta</th><th className="px-4 py-3">Ünvan</th><th className="px-4 py-3">Erişim</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">İşlem</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{u.fullName}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3 text-slate-500">{u.unvan || '-'}</td>
                <td className="px-4 py-3 text-slate-500">{(u.permissions || []).length} alan</td>
                <td className="px-4 py-3"><button onClick={() => aktifToggle(u)} className={`text-xs px-2 py-1 rounded-full font-medium ${u.aktif ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>{u.aktif ? 'Aktif' : 'Pasif'}</button></td>
                <td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button onClick={() => open(u)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil size={14} /></button><button onClick={() => del(u.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button></div></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">Henüz personel hesabı yok.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setModal(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={save} className="w-full max-w-lg bg-white rounded-2xl p-6 max-h-[90vh] overflow-y-auto space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-slate-800">{edit ? 'Personeli Düzenle' : 'Yeni Personel'}</h3><button type="button" onClick={() => setModal(false)}><X size={20} className="text-slate-400" /></button></div>
            <div className="grid sm:grid-cols-2 gap-2">
              <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Ad Soyad *" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input value={form.unvan} onChange={(e) => setForm({ ...form, unvan: e.target.value })} placeholder="Ünvan (Müdür, Kasiyer...)" className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input value={form.email} disabled={!!edit} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-posta *" className="px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50" />
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={edit ? 'Şifre (değiştirmek için)' : 'Şifre *'} className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Hazır şablon:</span>
              <button type="button" onClick={() => setForm({ ...form, permissions: PRESET_SATICI })} className="px-2 py-1 bg-slate-100 rounded">Satıcı/Kasiyer</button>
              <button type="button" onClick={() => setForm({ ...form, permissions: PRESET_MUDUR })} className="px-2 py-1 bg-slate-100 rounded">Müdür</button>
              <button type="button" onClick={() => setForm({ ...form, permissions: [] })} className="px-2 py-1 bg-slate-100 rounded">Temizle</button>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700 mb-1 flex items-center gap-1.5"><ShieldCheck size={15} /> Erişebileceği Alanlar</p>
              <div className="grid sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto border border-slate-100 rounded-xl p-2">
                {AREAS.map((a) => (
                  <label key={a.key} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer"><input type="checkbox" checked={form.permissions.includes(a.key)} onChange={() => toggle(a.key)} /> {a.label}</label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Patron (sen) tüm alanları görür. Personel yalnızca seçilenleri görür/erişir.</p>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700">Kaydet</button>
          </form>
        </div>
      )}
    </div>
  );
}
