import { useState, useMemo, useEffect } from 'react';
import {
  Network, Plus, Trash2, Pencil, Search, LayoutGrid, List, X, Users2, Sparkles,
  Wifi, WifiOff, ShieldCheck, ShieldAlert, Shield, CircleDot, Circle, Terminal,
  CheckSquare, Square, Filter, UserCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';
import { useStore } from '../context/StoreContext';
import useUrlState from '../lib/useUrlState';
import Modal from '../components/Modal';

// NOT: Bu modul YALNIZCA veri/yonetim panelidir. Gercek otomasyon
// (canli yayinda otomatik yorum, proxy uzerinden oturum acma/konsol) UYGULANMAZ.
// Proxy/persona/durum alanlari sadece kayit/yonetim amaclidir.

const PLATFORMLAR = ['instagram', 'facebook', 'tiktok', 'twitter', 'youtube', 'diger'];
const DURUMLAR = [
  { v: 'aktif', l: 'Aktif' },
  { v: 'pasif', l: 'Pasif' },
  { v: 'kullanilamaz', l: 'Kullanilamaz' },
];
const PROXY_DURUMLAR = [
  { v: 'yok', l: 'Yok' },
  { v: 'aktif', l: 'Aktif' },
  { v: 'pasif', l: 'Pasif' },
  { v: 'hatali', l: 'Hatali' },
  { v: 'test', l: 'Test' },
];

const parseTags = (s: any): string[] => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function durumRozet(durum: string) {
  const map: Record<string, string> = {
    aktif: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    pasif: 'bg-slate-100 text-slate-500 border-slate-200',
    kullanilamaz: 'bg-red-50 text-red-600 border-red-200',
  };
  const label = DURUMLAR.find((d) => d.v === durum)?.l || durum;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${map[durum] || map.pasif}`}>{label}</span>;
}

function proxyRozet(pd: string | null | undefined) {
  const v = pd || 'yok';
  const cfg: Record<string, { c: string; icon: any; l: string }> = {
    yok: { c: 'bg-slate-100 text-slate-400', icon: Shield, l: 'Proxy Yok' },
    aktif: { c: 'bg-emerald-50 text-emerald-600', icon: ShieldCheck, l: 'Proxy Aktif' },
    pasif: { c: 'bg-slate-100 text-slate-500', icon: Shield, l: 'Proxy Pasif' },
    hatali: { c: 'bg-red-50 text-red-600', icon: ShieldAlert, l: 'Proxy Hatali' },
    test: { c: 'bg-amber-50 text-amber-600', icon: Shield, l: 'Proxy Test' },
  };
  const k = cfg[v] || cfg.yok;
  const Icon = k.icon;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${k.c}`}><Icon size={11} /> {k.l}</span>;
}

interface FormState {
  id?: string;
  platform: string;
  kullaniciAd: string;
  profilFoto: string;
  durum: string;
  proxy: string;
  proxyDurum: string;
  grupId: string;
  persona: string;
  etiketler: string;
  notlar: string;
}
const EMPTY_FORM: FormState = {
  platform: 'instagram', kullaniciAd: '', profilFoto: '', durum: 'aktif',
  proxy: '', proxyDurum: 'yok', grupId: '', persona: '', etiketler: '', notlar: '',
};

export default function EtkilesimAgi() {
  const { socialAccounts, socialGroups, socialPersonas, reload } = useStore();

  // Filtre + arama (URL state)
  const [search, setSearch] = useUrlState('q', '');
  const [fGrup, setFGrup] = useUrlState('grup', '');
  const [fDurum, setFDurum] = useUrlState('durum', '');
  const [fProxy, setFProxy] = useUrlState('proxy', ''); // atanmis | bekleyen
  const [fEtiket, setFEtiket] = useUrlState('etiket', '');
  const [fPersona, setFPersona] = useUrlState('persona', '');
  const [fPlatform, setFPlatform] = useUrlState('platform', '');
  const [view, setView] = useUrlState<'kart' | 'liste'>('view', 'kart');

  // Arama debounce
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => { const t = setTimeout(() => setSearch(searchInput), 300); return () => clearTimeout(t); }, [searchInput]);

  // Coklu secim
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Modallar
  const [form, setForm] = useState<FormState | null>(null);
  const [showGroups, setShowGroups] = useState(false);
  const [bulkOp, setBulkOp] = useState<string>(''); // '' | proxy | grup | durum | persona | etiket-ekle | etiket-kaldir
  const [bulkVal, setBulkVal] = useState<any>({});

  const groupName = (id: string | null | undefined) => socialGroups.find((g: any) => g.id === id)?.ad || '';

  // Filtrelenmis liste
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return socialAccounts.filter((a: any) => {
      if (q && !String(a.kullaniciAd || '').toLowerCase().includes(q)) return false;
      if (fGrup && a.grupId !== fGrup) return false;
      if (fDurum && a.durum !== fDurum) return false;
      if (fPlatform && a.platform !== fPlatform) return false;
      if (fPersona && a.persona !== fPersona) return false;
      if (fEtiket && !parseTags(a.etiketler).includes(fEtiket)) return false;
      if (fProxy === 'atanmis' && !a.proxy) return false;
      if (fProxy === 'bekleyen' && a.proxy) return false;
      return true;
    });
  }, [socialAccounts, search, fGrup, fDurum, fProxy, fEtiket, fPersona, fPlatform]);

  // Istatistikler (tum hesaplardan hesapla)
  const stats = useMemo(() => {
    const all = socialAccounts as any[];
    return {
      toplam: all.length,
      aktif: all.filter((a) => a.durum === 'aktif').length,
      cevrimici: all.filter((a) => a.cevrimici).length,
      proxyAtanmis: all.filter((a) => a.proxy).length,
      proxyBekleyen: all.filter((a) => !a.proxy).length,
      kullanilamaz: all.filter((a) => a.durum === 'kullanilamaz').length,
      grupSayisi: socialGroups.length,
      personaSayisi: socialPersonas.length,
    };
  }, [socialAccounts, socialGroups, socialPersonas]);

  // Tum benzersiz etiketler (filtre acilir liste)
  const allTags = useMemo(() => {
    const set = new Set<string>();
    socialAccounts.forEach((a: any) => parseTags(a.etiketler).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [socialAccounts]);

  // ── CRUD ──
  const saveAccount = async () => {
    if (!form) return;
    if (!form.kullaniciAd.trim()) { toast.error('Kullanici adi gerekli'); return; }
    const payload = { ...form, grupId: form.grupId || null, persona: form.persona || null };
    try {
      if (form.id) await api.patch(`/store/social-accounts/${form.id}`, payload);
      else await api.post('/store/social-accounts', payload);
      setForm(null); reload(); toast.success('Kaydedildi');
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const delAccount = async (id: string) => {
    if (!confirm('Hesap silinsin mi?')) return;
    try { await api.delete(`/store/social-accounts/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  // ── Toplu islem ──
  const runBulk = async () => {
    if (!selected.size) return;
    let deger: any = {};
    if (bulkOp === 'proxy') deger = { proxy: bulkVal.proxy || null, proxyDurum: bulkVal.proxyDurum || 'yok' };
    else if (bulkOp === 'grup') deger = { grupId: bulkVal.grupId || null };
    else if (bulkOp === 'durum') deger = { durum: bulkVal.durum || 'aktif' };
    else if (bulkOp === 'persona') deger = { persona: bulkVal.persona || null };
    else if (bulkOp === 'etiket-ekle' || bulkOp === 'etiket-kaldir') {
      if (!bulkVal.etiket?.trim()) { toast.error('Etiket gerekli'); return; }
      deger = { etiket: bulkVal.etiket.trim() };
    }
    try {
      const r = await api.post('/store/social-accounts/bulk', { ids: Array.from(selected), islem: bulkOp, deger });
      toast.success(`${r.data?.count ?? 0} hesap guncellendi`);
      setBulkOp(''); setBulkVal({}); setSelected(new Set()); reload();
    } catch (e) { toast.error(apiErrorMessage(e)); }
  };

  const statCard = (icon: any, label: string, val: number, color: string) => {
    const Icon = icon;
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}><Icon size={18} /></div>
        <div><p className="text-lg font-bold text-slate-800 leading-none">{val}</p><p className="text-[11px] text-slate-400 mt-0.5">{label}</p></div>
      </div>
    );
  };

  const allSelectedInView = filtered.length > 0 && filtered.every((a: any) => selected.has(a.id));
  const toggleSelectAll = () => {
    if (allSelectedInView) setSelected(new Set());
    else setSelected(new Set(filtered.map((a: any) => a.id)));
  };

  return (
    <div>
      {/* Baslik */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Network className="text-emerald-600" size={22} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Etkilesim Agi</h1>
            <p className="text-sm text-slate-400">Sosyal medya hesap yonetim paneli ({stats.toplam} hesap)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGroups(true)} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm hover:bg-slate-50"><Users2 size={16} /> Grup & Persona</button>
          <button onClick={() => setForm({ ...EMPTY_FORM })} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"><Plus size={16} /> Hesap Ekle</button>
        </div>
      </div>

      {/* Kapsam notu */}
      <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Bu panel yalnizca veri/yonetim amaclidir. Gercek otomasyon (canli yayinda otomatik yorum, proxy uzerinden oturum acma/konsol) uygulanmaz.
      </div>

      {/* Istatistik kartlari */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-5">
        {statCard(Network, 'Toplam Hesap', stats.toplam, 'bg-emerald-50 text-emerald-600')}
        {statCard(CircleDot, 'Aktif Hesap', stats.aktif, 'bg-emerald-50 text-emerald-600')}
        {statCard(Wifi, 'Cevrim Ici', stats.cevrimici, 'bg-sky-50 text-sky-600')}
        {statCard(ShieldCheck, 'Proxy Atanmis', stats.proxyAtanmis, 'bg-indigo-50 text-indigo-600')}
        {statCard(Shield, 'Proxy Bekleyen', stats.proxyBekleyen, 'bg-amber-50 text-amber-600')}
        {statCard(ShieldAlert, 'Kullanilamayan', stats.kullanilamaz, 'bg-red-50 text-red-600')}
        {statCard(Users2, 'Aktif Gruplar', stats.grupSayisi, 'bg-violet-50 text-violet-600')}
        {statCard(Sparkles, 'Persona Sayisi', stats.personaSayisi, 'bg-pink-50 text-pink-600')}
      </div>

      {/* Filtre satiri */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Kullanici adi ara..." className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <select value={fPlatform} onChange={(e) => setFPlatform(e.target.value)} className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg">
            <option value="">Platform (tumu)</option>
            {PLATFORMLAR.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={fGrup} onChange={(e) => setFGrup(e.target.value)} className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg">
            <option value="">Grup (tumu)</option>
            {socialGroups.map((g: any) => <option key={g.id} value={g.id}>{g.ad}</option>)}
          </select>
          <select value={fDurum} onChange={(e) => setFDurum(e.target.value)} className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg">
            <option value="">Durum (tumu)</option>
            {DURUMLAR.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
          </select>
          <select value={fProxy} onChange={(e) => setFProxy(e.target.value)} className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg">
            <option value="">Proxy (tumu)</option>
            <option value="atanmis">Atanmis</option>
            <option value="bekleyen">Bekleyen</option>
          </select>
          <select value={fPersona} onChange={(e) => setFPersona(e.target.value)} className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg">
            <option value="">Persona (tumu)</option>
            {socialPersonas.map((p: any) => <option key={p.id} value={p.ad}>{p.ad}</option>)}
          </select>
          <select value={fEtiket} onChange={(e) => setFEtiket(e.target.value)} className="px-2.5 py-2 text-sm border border-slate-200 rounded-lg">
            <option value="">Etiket (tumu)</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {(fGrup || fDurum || fProxy || fEtiket || fPersona || fPlatform || search) && (
            <button onClick={() => { setSearchInput(''); setSearch(''); setFGrup(''); setFDurum(''); setFProxy(''); setFEtiket(''); setFPersona(''); setFPlatform(''); }} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 px-2 py-2"><X size={13} /> Temizle</button>
          )}
          <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView('kart')} className={`p-1.5 rounded-md ${view === 'kart' ? 'bg-white shadow text-emerald-600' : 'text-slate-400'}`} title="Kart gorunumu"><LayoutGrid size={16} /></button>
            <button onClick={() => setView('liste')} className={`p-1.5 rounded-md ${view === 'liste' ? 'bg-white shadow text-emerald-600' : 'text-slate-400'}`} title="Liste gorunumu"><List size={16} /></button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
          <Filter size={12} /> {filtered.length} / {stats.toplam} hesap gosteriliyor
          <button onClick={toggleSelectAll} className="ml-2 inline-flex items-center gap-1 text-slate-500 hover:text-emerald-600">
            {allSelectedInView ? <CheckSquare size={13} /> : <Square size={13} />} Tumunu sec
          </button>
        </div>
      </div>

      {/* Toplu islem cubugu */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 bg-slate-800 text-white rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2 flex-wrap shadow-lg">
          <span className="text-sm font-medium">{selected.size} secili</span>
          <div className="h-4 w-px bg-white/20 mx-1" />
          <button onClick={() => { setBulkOp('proxy'); setBulkVal({}); }} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20">Proxy Degistir</button>
          <button onClick={() => { setBulkOp('grup'); setBulkVal({}); }} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20">Grup Tasi</button>
          <button onClick={() => { setBulkOp('etiket-ekle'); setBulkVal({}); }} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20">Etiket Ekle</button>
          <button onClick={() => { setBulkOp('etiket-kaldir'); setBulkVal({}); }} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20">Etiket Kaldir</button>
          <button onClick={() => { setBulkOp('durum'); setBulkVal({}); }} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20">Durum</button>
          <button onClick={() => { setBulkOp('persona'); setBulkVal({}); }} className="text-xs px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20">Persona</button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-white/60 hover:text-white inline-flex items-center gap-1"><X size={13} /> Secimi birak</button>
        </div>
      )}

      {/* Liste / Kart */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">Hesap bulunamadi.</div>
      ) : view === 'kart' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((a: any) => (
            <div key={a.id} className={`bg-white rounded-xl border p-3 relative ${selected.has(a.id) ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-200'}`}>
              <button onClick={() => toggleSel(a.id)} className="absolute top-2 right-2 text-slate-300 hover:text-emerald-600">
                {selected.has(a.id) ? <CheckSquare size={17} className="text-emerald-600" /> : <Square size={17} />}
              </button>
              <div className="flex items-center gap-2.5 mb-2">
                {a.profilFoto ? (
                  <img src={a.profilFoto} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><UserCircle2 size={26} /></div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    {a.cevrimici ? <CircleDot size={11} className="text-emerald-500" /> : <Circle size={11} className="text-slate-300" />}
                    <p className="font-semibold text-slate-800 text-sm truncate">{a.kullaniciAd}</p>
                  </div>
                  <p className="text-[11px] text-slate-400">{a.platform}{a.grupId ? ` · ${groupName(a.grupId)}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-2">
                {durumRozet(a.durum)}
                {proxyRozet(a.proxyDurum)}
                {a.persona && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-pink-50 text-pink-600"><Sparkles size={10} /> {a.persona}</span>}
              </div>
              {parseTags(a.etiketler).length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mb-2">
                  {parseTags(a.etiketler).map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">#{t}</span>)}
                </div>
              )}
              <p className="text-[11px] text-slate-400 mb-2">
                {a.sonBaglanti ? `Son baglanti: ${new Date(a.sonBaglanti).toLocaleDateString('tr-TR')}` : 'Baglanti yok'}
                {a.sonIslem ? ` · ${a.sonIslem}` : ''}
              </p>
              <div className="flex items-center gap-1 border-t border-slate-100 pt-2">
                <button onClick={() => setForm({ id: a.id, platform: a.platform, kullaniciAd: a.kullaniciAd, profilFoto: a.profilFoto || '', durum: a.durum, proxy: a.proxy || '', proxyDurum: a.proxyDurum || 'yok', grupId: a.grupId || '', persona: a.persona || '', etiketler: a.etiketler || '', notlar: a.notlar || '' })} className="flex-1 inline-flex items-center justify-center gap-1 text-xs text-slate-600 hover:bg-slate-50 rounded-lg py-1.5"><Pencil size={12} /> Duzenle</button>
                <button disabled title="Yakinda" className="inline-flex items-center gap-1 text-xs text-slate-300 cursor-not-allowed rounded-lg py-1.5 px-2"><Terminal size={12} /> Konsol <span className="text-[9px] bg-slate-100 rounded px-1">yakinda</span></button>
                <button onClick={() => delAccount(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="p-2.5 w-8"><button onClick={toggleSelectAll}>{allSelectedInView ? <CheckSquare size={15} className="text-emerald-600" /> : <Square size={15} />}</button></th>
                <th className="p-2.5">Hesap</th>
                <th className="p-2.5">Platform</th>
                <th className="p-2.5">Grup</th>
                <th className="p-2.5">Durum</th>
                <th className="p-2.5">Proxy</th>
                <th className="p-2.5">Persona</th>
                <th className="p-2.5">Cevrimici</th>
                <th className="p-2.5">Son Islem</th>
                <th className="p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a: any) => (
                <tr key={a.id} className={`border-b border-slate-50 hover:bg-slate-50/50 ${selected.has(a.id) ? 'bg-emerald-50/40' : ''}`}>
                  <td className="p-2.5"><button onClick={() => toggleSel(a.id)}>{selected.has(a.id) ? <CheckSquare size={15} className="text-emerald-600" /> : <Square size={15} className="text-slate-300" />}</button></td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-2">
                      {a.profilFoto ? <img src={a.profilFoto} alt="" className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><UserCircle2 size={16} /></div>}
                      <span className="font-medium text-slate-700">{a.kullaniciAd}</span>
                    </div>
                  </td>
                  <td className="p-2.5 text-slate-500">{a.platform}</td>
                  <td className="p-2.5 text-slate-500">{groupName(a.grupId) || '-'}</td>
                  <td className="p-2.5">{durumRozet(a.durum)}</td>
                  <td className="p-2.5">{proxyRozet(a.proxyDurum)}</td>
                  <td className="p-2.5 text-slate-500">{a.persona || '-'}</td>
                  <td className="p-2.5">{a.cevrimici ? <Wifi size={15} className="text-emerald-500" /> : <WifiOff size={15} className="text-slate-300" />}</td>
                  <td className="p-2.5 text-xs text-slate-400">{a.sonIslem || (a.sonBaglanti ? new Date(a.sonBaglanti).toLocaleDateString('tr-TR') : '-')}</td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button disabled title="Yakinda" className="p-1.5 rounded-lg text-slate-300 cursor-not-allowed"><Terminal size={13} /></button>
                      <button onClick={() => setForm({ id: a.id, platform: a.platform, kullaniciAd: a.kullaniciAd, profilFoto: a.profilFoto || '', durum: a.durum, proxy: a.proxy || '', proxyDurum: a.proxyDurum || 'yok', grupId: a.grupId || '', persona: a.persona || '', etiketler: a.etiketler || '', notlar: a.notlar || '' })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><Pencil size={13} /></button>
                      <button onClick={() => delAccount(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hesap ekle/duzenle modali */}
      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Hesap Duzenle' : 'Hesap Ekle'} size="lg">
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Platform</label>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                  {PLATFORMLAR.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Kullanici Adi *</label>
                <input value={form.kullaniciAd} onChange={(e) => setForm({ ...form, kullaniciAd: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Profil Foto URL</label>
              <input value={form.profilFoto} onChange={(e) => setForm({ ...form, profilFoto: e.target.value })} placeholder="https://..." className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Durum</label>
                <select value={form.durum} onChange={(e) => setForm({ ...form, durum: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                  {DURUMLAR.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Grup</label>
                <select value={form.grupId} onChange={(e) => setForm({ ...form, grupId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                  <option value="">- Grup yok -</option>
                  {socialGroups.map((g: any) => <option key={g.id} value={g.id}>{g.ad}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Proxy</label>
                <input value={form.proxy} onChange={(e) => setForm({ ...form, proxy: e.target.value })} placeholder="host:port veya etiket" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Proxy Durumu</label>
                <select value={form.proxyDurum} onChange={(e) => setForm({ ...form, proxyDurum: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                  {PROXY_DURUMLAR.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Persona</label>
                <select value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                  <option value="">- Persona yok -</option>
                  {socialPersonas.map((p: any) => <option key={p.id} value={p.ad}>{p.ad}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Etiketler (virgulle)</label>
                <input value={form.etiketler} onChange={(e) => setForm({ ...form, etiketler: e.target.value })} placeholder="ornek: satis, deneme" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notlar</label>
              <textarea value={form.notlar} onChange={(e) => setForm({ ...form, notlar: e.target.value })} rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <div className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Terminal size={13} /> Oturum ac / Konsol ac islemleri kapsam disidir (yakinda-pasif).
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setForm(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Iptal</button>
              <button onClick={saveAccount} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Kaydet</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Grup & Persona yonetimi modali */}
      <Modal isOpen={showGroups} onClose={() => setShowGroups(false)} title="Grup & Persona Yonetimi" size="lg">
        <div className="grid sm:grid-cols-2 gap-5">
          <GrupPersonaBolum tip="grup" baslik="Gruplar" items={socialGroups} seg="social-groups" reload={reload} icon={Users2} />
          <GrupPersonaBolum tip="persona" baslik="Personalar" items={socialPersonas} seg="social-personas" reload={reload} icon={Sparkles} />
        </div>
      </Modal>

      {/* Toplu islem modali */}
      <Modal isOpen={!!bulkOp} onClose={() => { setBulkOp(''); setBulkVal({}); }} title="Toplu Islem" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{selected.size} hesap uzerinde islem yapilacak.</p>
          {bulkOp === 'proxy' && (
            <>
              <input placeholder="Proxy (host:port)" value={bulkVal.proxy || ''} onChange={(e) => setBulkVal({ ...bulkVal, proxy: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <select value={bulkVal.proxyDurum || 'yok'} onChange={(e) => setBulkVal({ ...bulkVal, proxyDurum: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
                {PROXY_DURUMLAR.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
            </>
          )}
          {bulkOp === 'grup' && (
            <select value={bulkVal.grupId || ''} onChange={(e) => setBulkVal({ ...bulkVal, grupId: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              <option value="">- Grup yok -</option>
              {socialGroups.map((g: any) => <option key={g.id} value={g.id}>{g.ad}</option>)}
            </select>
          )}
          {bulkOp === 'durum' && (
            <select value={bulkVal.durum || 'aktif'} onChange={(e) => setBulkVal({ ...bulkVal, durum: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              {DURUMLAR.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
            </select>
          )}
          {bulkOp === 'persona' && (
            <select value={bulkVal.persona || ''} onChange={(e) => setBulkVal({ ...bulkVal, persona: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              <option value="">- Persona yok -</option>
              {socialPersonas.map((p: any) => <option key={p.id} value={p.ad}>{p.ad}</option>)}
            </select>
          )}
          {(bulkOp === 'etiket-ekle' || bulkOp === 'etiket-kaldir') && (
            <input placeholder="Etiket" value={bulkVal.etiket || ''} onChange={(e) => setBulkVal({ ...bulkVal, etiket: e.target.value })} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setBulkOp(''); setBulkVal({}); }} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">Iptal</button>
            <button onClick={runBulk} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Uygula</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Grup / Persona ekle-sil bolumu
function GrupPersonaBolum({ baslik, items, seg, reload, icon }: { tip: string; baslik: string; items: any[]; seg: string; reload: () => void; icon: any }) {
  const [ad, setAd] = useState('');
  const [aciklama, setAciklama] = useState('');
  const Icon = icon;
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ad.trim()) return;
    try { await api.post(`/store/${seg}`, { ad: ad.trim(), aciklama: aciklama.trim() || null }); setAd(''); setAciklama(''); reload(); } catch (e) { toast.error(apiErrorMessage(e)); }
  };
  const del = async (id: string) => { if (!confirm('Silinsin mi?')) return; try { await api.delete(`/store/${seg}/${id}`); reload(); } catch (e) { toast.error(apiErrorMessage(e)); } };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-slate-700 font-medium text-sm"><Icon size={16} className="text-emerald-600" /> {baslik} ({items.length})</div>
      <form onSubmit={add} className="space-y-1.5 mb-3">
        <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ad" className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
        <div className="flex gap-1.5">
          <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Aciklama (ops.)" className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
          <button className="inline-flex items-center gap-1 bg-emerald-600 text-white px-3 rounded-lg text-sm hover:bg-emerald-700"><Plus size={14} /></button>
        </div>
      </form>
      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
            <div className="min-w-0"><p className="text-sm text-slate-700 truncate">{it.ad}</p>{it.aciklama && <p className="text-[11px] text-slate-400 truncate">{it.aciklama}</p>}</div>
            <button onClick={() => del(it.id)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-slate-400">Henuz kayit yok.</p>}
      </div>
    </div>
  );
}
