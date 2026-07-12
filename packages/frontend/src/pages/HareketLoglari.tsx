import { useState, useEffect, useCallback, Fragment } from 'react';
import { ClipboardList, Search, Filter, ChevronLeft, ChevronRight, Download, LogIn, RefreshCw, ChevronDown, ChevronUp, MapPin, User, HelpCircle, Globe, X } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';
import { useUrlState } from '../lib/useUrlState';
import toast from 'react-hot-toast';

type AuditRow = {
  id: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: string | null;
  hedef?: string | null;
  kime?: string | null;
  neden?: string | null;
  ip?: string | null;
  meta?: Record<string, any> | null;
  createdAt: string;
};
type StaffUser = { id: string; fullName: string; unvan?: string | null; role?: string | null };
type Facet = { value: string; count: number };

const actionBadge: Record<string, string> = {
  giris: 'bg-sky-100 text-sky-700',
  ekle: 'bg-green-100 text-green-700',
  sil: 'bg-red-100 text-red-700',
  guncelle: 'bg-blue-100 text-blue-700',
  iptal: 'bg-amber-100 text-amber-700',
  kargola: 'bg-violet-100 text-violet-700',
};
const actionLabel: Record<string, string> = {
  giris: 'Giriş', ekle: 'Ekleme', sil: 'Silme', guncelle: 'Güncelleme', iptal: 'İptal', kargola: 'Kargolama',
};
const entityBadge: Record<string, string> = {
  oturum: 'bg-slate-100 text-slate-600',
  urun: 'bg-emerald-100 text-emerald-700',
  musteri: 'bg-orange-100 text-orange-700',
  siparis: 'bg-indigo-100 text-indigo-700',
};
const entityLabel: Record<string, string> = {
  oturum: 'Oturum', urun: 'Ürün', musteri: 'Müşteri', siparis: 'Sipariş',
};
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const PAGE_SIZE = 50;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return { tarih: d.toLocaleDateString('tr-TR'), saat: d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
}

function metaText(meta?: Record<string, any> | null): string {
  if (!meta || typeof meta !== 'object') return '';
  return Object.entries(meta).map(([k, v]) => {
    if (v && typeof v === 'object') {
      if ('onceki' in v || 'yeni' in v) return `${k}: ${v.onceki ?? '—'} → ${v.yeni ?? '—'}`;
      return `${k}: ${JSON.stringify(v)}`;
    }
    return `${k}: ${v}`;
  }).join(' · ');
}

export default function HareketLoglari() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [facets, setFacets] = useState<{ actions: Facet[]; entities: Facet[] }>({ actions: [], entities: [] });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [filterStart, setFilterStart] = useUrlState('from', '');
  const [filterEnd, setFilterEnd] = useUrlState('to', '');
  const [filterEntity, setFilterEntity] = useUrlState('entity', '');
  const [filterAction, setFilterAction] = useUrlState('action', '');
  const [filterUser, setFilterUser] = useUrlState('user', '');
  const [filterKime, setFilterKime] = useUrlState('kime', '');
  const [filterSearch, setFilterSearch] = useUrlState('q', '');
  const [page, setPage] = useUrlState('page', 1);
  const [canli, setCanli] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const params = useCallback(() => ({
    q: filterSearch || undefined,
    entity: filterEntity || undefined,
    action: filterAction || undefined,
    userId: filterUser || undefined,
    kime: filterKime || undefined,
    from: filterStart || undefined,
    to: filterEnd || undefined,
  }), [filterSearch, filterEntity, filterAction, filterUser, filterKime, filterStart, filterEnd]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/store/audit', { params: { page, pageSize: PAGE_SIZE, ...params() } });
      setRows(r.data.rows || []);
      setTotal(r.data.total || 0);
      if (r.data.users) setUsers(r.data.users);
      if (r.data.facets) setFacets(r.data.facets);
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setLoading(false); }
  }, [page, params]);

  useEffect(() => { load(); }, [load]);

  // Canlı izleme: açıkken 5 sn'de bir 1. sayfayı sessizce yeniler
  useEffect(() => {
    if (!canli) return;
    if (page !== 1) setPage(1);
    const t = setInterval(() => { load(); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canli, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Dinamik filtre seçenekleri: kayıtlı facet değerleri + bilinen etiketler
  const actionOptions = facets.actions.length ? facets.actions.map((a) => a.value) : Object.keys(actionLabel);
  const entityOptions = facets.entities.length ? facets.entities.map((e) => e.value) : Object.keys(entityLabel);

  async function handleExport() {
    try {
      const r = await api.get('/store/audit', { params: { page: 1, pageSize: 5000, ...params() } });
      const all: AuditRow[] = r.data.rows || [];
      const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      const csv = ['Tarih,Saat,Kullanici,Islem,Modul,Nereye,Kime,Neden,IP,Detay,Ek', ...all.map((l) => {
        const { tarih, saat } = fmtDate(l.createdAt);
        return [tarih, saat, esc(l.userName || ''), actionLabel[l.action] || l.action, entityLabel[l.entity] || l.entity, esc(l.hedef || ''), esc(l.kime || ''), esc(l.neden || ''), esc(l.ip || ''), esc(l.detail || ''), esc(metaText(l.meta))].join(',');
      })].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personel-loglari-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiErrorMessage(e)); }
  }

  const resetPage = () => setPage(1);
  const clearFilters = () => { setFilterStart(''); setFilterEnd(''); setFilterEntity(''); setFilterAction(''); setFilterUser(''); setFilterKime(''); setFilterSearch(''); resetPage(); };
  const filtreAktif = !!(filterStart || filterEnd || filterEntity || filterAction || filterUser || filterKime || filterSearch);
  const toggleRow = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Personel Hareket Logları</h1>
          <p className="text-gray-500 text-sm">Kim, ne zaman, neyi, nereye, kime ve neden yaptı — tüm işlemleri anlık izleyin</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCanli((v) => !v)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${canli ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
            <span className={`w-2 h-2 rounded-full ${canli ? 'bg-white animate-pulse' : 'bg-red-500'}`} />{canli ? 'Canlı İzleme Açık' : 'Canlı İzle'}
          </button>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium transition-colors"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Yenile</button>
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-xl hover:bg-gray-700 text-sm font-medium transition-colors"><Download size={16} />CSV Dışa Aktar</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 text-gray-500"><Filter size={16} /><span className="text-sm font-medium">Filtrele:</span></div>
          <input type="date" value={filterStart} onChange={(e) => { setFilterStart(e.target.value); resetPage(); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <input type="date" value={filterEnd} onChange={(e) => { setFilterEnd(e.target.value); resetPage(); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
          <select value={filterUser} onChange={(e) => { setFilterUser(e.target.value); resetPage(); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Tüm Personel</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}{u.unvan ? ` (${u.unvan})` : ''}</option>)}
          </select>
          <select value={filterEntity} onChange={(e) => { setFilterEntity(e.target.value); resetPage(); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Tüm Modüller</option>
            {entityOptions.map((e) => <option key={e} value={e}>{entityLabel[e] || cap(e)}</option>)}
          </select>
          <select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); resetPage(); }} className="border border-gray-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Tüm İşlemler</option>
            {actionOptions.map((a) => <option key={a} value={a}>{actionLabel[a] || cap(a)}</option>)}
          </select>
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
            <User size={15} className="text-gray-400" />
            <input value={filterKime} onChange={(e) => { setFilterKime(e.target.value); resetPage(); }} placeholder="Kime (müşteri/hedef)..." className="outline-none text-sm w-40" />
          </div>
          <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 flex-1 min-w-48">
            <Search size={15} className="text-gray-400" />
            <input value={filterSearch} onChange={(e) => { setFilterSearch(e.target.value); resetPage(); }} placeholder="Personel, detay, neden, hedef ara..." className="flex-1 outline-none text-sm" />
          </div>
          {filtreAktif && <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-rose-500 hover:text-rose-600 px-2 py-2"><X size={14} /> Temizle</button>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-gray-500" />
            <span className="font-semibold text-gray-700">Log Kayıtları ({total})</span>
          </div>
          <span className="text-sm text-gray-400">Sayfa {page} / {totalPages}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 font-medium text-gray-500 text-left w-8"></th>
                <th className="px-4 py-3 font-medium text-gray-500 text-left">Tarih/Saat</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-left">Personel</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-left">İşlem</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-left">Modül</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-left">Nereye</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-left">Kime</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-left">Neden</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">Log kaydı bulunamadı</td></tr>
              )}
              {rows.map((l) => {
                const { tarih, saat } = fmtDate(l.createdAt);
                const isOpen = !!expanded[l.id];
                const hasDetail = !!(l.detail || l.ip || (l.meta && Object.keys(l.meta).length));
                return (
                  <Fragment key={l.id}>
                    <tr onClick={() => hasDetail && toggleRow(l.id)} className={`hover:bg-gray-50 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}>
                      <td className="px-4 py-3 text-gray-400">{hasDetail ? (isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />) : null}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-gray-700 font-medium">{tarih}</div>
                        <div className="text-xs text-gray-400">{saat}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {l.action === 'giris' && <LogIn size={14} className="text-sky-500" />}
                          <span className="text-gray-700 font-medium">{l.userName || 'Sistem'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${actionBadge[l.action] || 'bg-gray-100 text-gray-600'}`}>{actionLabel[l.action] || cap(l.action)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-medium ${entityBadge[l.entity] || 'bg-gray-100 text-gray-600'}`}>{entityLabel[l.entity] || cap(l.entity)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">{l.hedef || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{l.kime || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[220px] truncate">{l.neden || <span className="text-gray-300">—</span>}</td>
                    </tr>
                    {isOpen && hasDetail && (
                      <tr className="bg-gray-50/70">
                        <td></td>
                        <td colSpan={7} className="px-4 py-3">
                          <div className="grid sm:grid-cols-2 gap-2 text-xs text-gray-600">
                            {l.detail && <div className="flex items-start gap-1.5"><ClipboardList size={13} className="text-gray-400 mt-0.5 shrink-0" /><span><b>Açıklama:</b> {l.detail}</span></div>}
                            {l.hedef && <div className="flex items-start gap-1.5"><MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" /><span><b>Nereye:</b> {l.hedef}</span></div>}
                            {l.kime && <div className="flex items-start gap-1.5"><User size={13} className="text-gray-400 mt-0.5 shrink-0" /><span><b>Kime:</b> {l.kime}</span></div>}
                            {l.neden && <div className="flex items-start gap-1.5"><HelpCircle size={13} className="text-gray-400 mt-0.5 shrink-0" /><span><b>Neden:</b> {l.neden}</span></div>}
                            {l.ip && <div className="flex items-start gap-1.5"><Globe size={13} className="text-gray-400 mt-0.5 shrink-0" /><span><b>IP:</b> {l.ip}</span></div>}
                            {l.meta && Object.keys(l.meta).length > 0 && <div className="flex items-start gap-1.5 sm:col-span-2"><ClipboardList size={13} className="text-gray-400 mt-0.5 shrink-0" /><span><b>Detaylar:</b> {metaText(l.meta)}</span></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm text-gray-500">{total} kayıt, {PAGE_SIZE} / sayfa</span>
          <div className="flex gap-2 items-center">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pg = page <= 3 ? i + 1 : page - 2 + i;
                if (pg > totalPages) return null;
                return (
                  <button key={pg} onClick={() => setPage(pg)} className={`w-8 h-8 rounded-xl text-sm transition-colors ${pg === page ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{pg}</button>
                );
              })}
            </div>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
