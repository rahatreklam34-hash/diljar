import { useEffect, useState } from 'react';
import { UserCog, Plus, Pencil, Trash2, X, ShieldCheck, ChevronRight, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { navGroups, allMenuItems, MenuGroup } from '../lib/menu';

const MENU_PATHS = new Set(allMenuItems.map((m) => m.to));

// Yetki ağacı: her grup bir "ana menü", içindeki her öğe ayrı seçilebilir bir "alt menü".
// İzinler, seçilen menü öğelerinin `to` yolları olarak saklanır.
const groupTitle = (g: MenuGroup) => g.title || 'Genel Bakış';

// Eski/kaba izinleri (ör. '/depo') yeni menü-öğesi yollarına genişlet (geriye dönük uyum)
function normalizePerms(perms: string[]): string[] {
  if (!Array.isArray(perms)) return [];
  const out = new Set<string>();
  for (const it of allMenuItems) {
    const to = it.to;
    if (perms.includes(to)) { out.add(to); continue; }
    if (perms.some((p) => to.startsWith(p + '/') && !MENU_PATHS.has(p))) out.add(to);
  }
  return [...out];
}

// Hazır şablonlar (menü-öğesi yolları)
const PRESET_SATICI = ['/canli-yayin', '/kasa-satis', '/satici-performans', '/siparisler', '/siparisler/canli', '/siparisler/online', '/musterilerim'];
const PRESET_MUDUR = allMenuItems.map((a) => a.to).filter((k) => !['/ayarlar', '/entegrasyonlar'].includes(k));

// Ünvanlar (sıralı) + her ünvana karşılık gelen varsayılan menü yetkileri.
// PATRON = firma sahibi (TENANT_OWNER), personele atanmaz; sınırsız yetkilidir.
const UNVANLAR: { value: string; label: string; aciklama: string; preset: string[] | 'TUMU' }[] = [
  { value: 'YONETICI', label: 'Yönetici', aciklama: 'Sınırlı yetki — yetkileri patron seçer', preset: PRESET_MUDUR },
  { value: 'DEPO_SORUMLUSU', label: 'Depo Sorumlusu', aciklama: 'Ürün, stok ve depo işlemleri', preset: ['/depo/urunlerim', '/depo/urun-ekle', '/depo/toplu-urun', '/depo/varyasyonlar', '/depo/kategoriler', '/depo/satis-kodu', '/depo/urun-ice-aktar', '/depo/stok-hareketleri', '/bekleyen-siparisler'] },
  { value: 'KARGO_BIRIMI', label: 'Kargo Birimi', aciklama: 'Kargo gönderileri ve sipariş sevkiyatı', preset: ['/raporlar/kargo-islemleri', '/siparisler', '/siparisler/canli', '/siparisler/online', '/bekleyen-siparisler'] },
  { value: 'MUSTERI_HIZMETLERI', label: 'Müşteri Hizmetleri', aciklama: 'WhatsApp, müşteri ve destek işlemleri', preset: ['/whatsapp', '/whatsapp/toplu-mesaj', '/musterilerim', '/destek-talepleri', '/siparisler', '/siparisler/online'] },
];

// Özel yetkiler — yalnızca patronun açtığı kişiler yapabilir (permissions içinde 'ozel:' önekiyle saklanır).
const OZEL_YETKILER: { key: string; label: string }[] = [
  { key: 'ozel:fiyat-degistir', label: 'Ürün fiyatı / eski fiyat değiştirme' },
  { key: 'ozel:indirim-uygula', label: 'Sepette indirim / iskonto uygulama' },
  { key: 'ozel:siparis-iptal', label: 'Sipariş iptal / iade' },
  { key: 'ozel:kargo-gonder', label: 'Kargo gönderisi oluşturma' },
  { key: 'ozel:kasa-tahsilat', label: 'Kasa / banka tahsilat işlemleri' },
  { key: 'ozel:veri-sil', label: 'Müşteri / kayıt silme' },
];

export default function Personeller() {
  const { isOwner } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<any | null>(null);
  const empty = { fullName: '', email: '', password: '', unvan: '', permissions: [] as string[] };
  const [form, setForm] = useState<any>(empty);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const load = () => api.get('/staff').then((r) => setList(r.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!isOwner) return <div className="p-6 text-slate-500">Bu sayfaya yalnızca firma sahibi (patron) erişebilir.</div>;

  const open = (u?: any) => {
    setEdit(u || null);
    const rawPerms: string[] = Array.isArray(u?.permissions) ? u.permissions : [];
    const ozel = rawPerms.filter((p) => p.startsWith('ozel:'));
    setForm(u ? { fullName: u.fullName, email: u.email, password: '', unvan: u.unvan || '', permissions: [...normalizePerms(rawPerms), ...ozel] } : { ...empty });
    setOpenGroups({});
    setModal(true);
  };
  // Ünvan seçilince menü yetkilerini ön-ayara getir (özel yetkileri koru)
  const applyUnvan = (value: string) => {
    const u = UNVANLAR.find((x) => x.value === value);
    setForm((f: any) => {
      const ozel = (f.permissions || []).filter((p: string) => p.startsWith('ozel:'));
      if (!u) return { ...f, unvan: value };
      const preset = u.preset === 'TUMU' ? allMenuItems.map((a) => a.to) : u.preset;
      return { ...f, unvan: value, permissions: [...preset, ...ozel] };
    });
  };
  const has = (k: string) => form.permissions.includes(k);
  const toggle = (k: string) => setForm((f: any) => ({ ...f, permissions: f.permissions.includes(k) ? f.permissions.filter((x: string) => x !== k) : [...f.permissions, k] }));
  const toggleGroup = (g: MenuGroup) => {
    const keys = g.items.map((i) => i.to);
    const allOn = keys.every((k) => form.permissions.includes(k));
    setForm((f: any) => {
      const base = f.permissions.filter((x: string) => !keys.includes(x));
      return { ...f, permissions: allOn ? base : [...base, ...keys] };
    });
  };

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
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><UserCog className="text-emerald-600" size={22} /></div><div><h1 className="text-2xl font-bold text-slate-800">Personel & Yetki</h1><p className="text-sm text-slate-400">Çalışanlarına giriş hesabı aç, ana menü ve alt menü bazında erişim ver.</p></div></div>
        <button onClick={() => open()} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-medium hover:bg-emerald-700"><Plus size={16} /> Personel Ekle</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead className="text-slate-400 text-left text-xs uppercase border-b border-slate-100"><tr><th className="px-4 py-3">Ad</th><th className="px-4 py-3">E-posta</th><th className="px-4 py-3">Ünvan</th><th className="px-4 py-3">Erişim</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">İşlem</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{u.fullName}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3 text-slate-500">{UNVANLAR.find((x) => x.value === u.unvan)?.label || u.unvan || '-'}</td>
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
              <select value={form.unvan} onChange={(e) => applyUnvan(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">Ünvan seçin...</option>
                {UNVANLAR.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
              <input value={form.email} disabled={!!edit} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-posta *" className="px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50" />
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={edit ? 'Şifre (değiştirmek için)' : 'Şifre *'} className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-slate-400">Hazır şablon:</span>
              <button type="button" onClick={() => setForm({ ...form, permissions: PRESET_SATICI })} className="px-2 py-1 bg-slate-100 rounded">Satıcı/Kasiyer</button>
              <button type="button" onClick={() => setForm({ ...form, permissions: PRESET_MUDUR })} className="px-2 py-1 bg-slate-100 rounded">Müdür</button>
              <button type="button" onClick={() => setForm({ ...form, permissions: allMenuItems.map((a) => a.to) })} className="px-2 py-1 bg-slate-100 rounded">Tümü</button>
              <button type="button" onClick={() => setForm({ ...form, permissions: [] })} className="px-2 py-1 bg-slate-100 rounded">Temizle</button>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><ShieldCheck size={15} /> Erişebileceği Menüler</p>
                <span className="text-[11px] text-slate-400">{form.permissions.length} alan seçili</span>
              </div>
              <div className="space-y-1.5 max-h-[22rem] overflow-y-auto border border-slate-100 rounded-xl p-2">
                {navGroups.map((g, gi) => {
                  const title = groupTitle(g);
                  const keys = g.items.map((i) => i.to);
                  const selCount = keys.filter((k) => has(k)).length;
                  const allOn = selCount === keys.length;
                  const someOn = selCount > 0 && !allOn;
                  const isOpen = openGroups[title] ?? false;
                  return (
                    <div key={gi} className="rounded-lg border border-slate-100 overflow-hidden">
                      <div className={`flex items-center gap-2 px-2 py-2 ${allOn ? 'bg-emerald-50' : someOn ? 'bg-amber-50' : 'bg-slate-50'}`}>
                        <button type="button" onClick={() => toggleGroup(g)} title={allOn ? 'Tümünü kaldır' : 'Tümünü seç'} className={`w-5 h-5 rounded-md flex items-center justify-center border ${allOn ? 'bg-emerald-600 border-emerald-600 text-white' : someOn ? 'bg-amber-400 border-amber-400 text-white' : 'bg-white border-slate-300 text-transparent'}`}>
                          {allOn ? <Check size={13} /> : someOn ? <span className="w-2 h-0.5 bg-white rounded" /> : null}
                        </button>
                        <button type="button" onClick={() => setOpenGroups((s) => ({ ...s, [title]: !isOpen }))} className="flex-1 flex items-center gap-2 text-left">
                          <span className="text-sm font-semibold text-slate-700 flex-1">{title}</span>
                          <span className="text-[11px] text-slate-400">{selCount}/{keys.length}</span>
                          <ChevronRight size={15} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                        </button>
                      </div>
                      {isOpen && (
                        <div className="grid sm:grid-cols-2 gap-1 p-2 bg-white">
                          {g.items.map((it) => (
                            <label key={it.to} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                              <input type="checkbox" checked={has(it.to)} onChange={() => toggle(it.to)} />
                              <it.icon size={14} className="text-slate-400 shrink-0" />
                              <span className="truncate">{it.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Ana menüyü seçerek tüm alt menüleri verebilir, ya da açıp alt menüleri tek tek seçebilirsin. Patron (sen) tüm alanları görür.</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-2"><ShieldCheck size={15} className="text-amber-600" /> Özel Yetkiler <span className="text-[11px] font-normal text-slate-400">(yalnızca seçilen kişiler yapabilir)</span></p>
              <div className="grid sm:grid-cols-2 gap-1">
                {OZEL_YETKILER.map((o) => (
                  <label key={o.key} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-white cursor-pointer">
                    <input type="checkbox" checked={has(o.key)} onChange={() => toggle(o.key)} />
                    <span className="truncate">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700">Kaydet</button>
          </form>
        </div>
      )}
    </div>
  );
}
