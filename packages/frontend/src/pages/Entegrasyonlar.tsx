import { useEffect, useState } from 'react';
import { Plug, CreditCard, Truck, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { apiErrorMessage } from '../lib/api';

interface Field { key: string; label: string; type?: string; optional?: boolean }
interface ProviderDef { provider: string; label: string; category: string; description?: string; fields: Field[] }
interface Setting { provider: string; enabled: boolean; mode: string; config: Record<string, string> | null }

function ProviderCard({ def, setting, onSaved }: { def: ProviderDef; setting?: Setting; onSaved: () => void }) {
  const [enabled, setEnabled] = useState(setting?.enabled || false);
  const [mode, setMode] = useState(setting?.mode || 'TEST');
  const [config, setConfig] = useState<Record<string, string>>(() => ({ ...(setting?.config || {}) }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(setting?.enabled || false);
    setMode(setting?.mode || 'TEST');
    setConfig({ ...(setting?.config || {}) });
  }, [setting]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/integrations/${def.provider}`, { enabled, mode, config });
      toast.success(`${def.label} kaydedildi`);
      onSaved();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className={`bg-white rounded-2xl border p-5 ${enabled ? 'border-indigo-300' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800">{def.label}</h3>
        <label className="inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <div className="w-10 h-5 bg-slate-200 peer-checked:bg-indigo-500 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-5" />
        </label>
      </div>
      {def.description && <p className="text-xs text-slate-400 mb-3">{def.description}</p>}
      <div className="space-y-3">
        {def.fields.map((f) => (
          <div key={f.key}>
            <label className="block text-xs text-slate-500 mb-1">{f.label}{f.optional && ' (opsiyonel)'}</label>
            <input
              type={f.type === 'password' ? 'password' : 'text'}
              value={config[f.key] || ''}
              onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        ))}
        <div className="flex items-center justify-between pt-1">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg">
            <option value="TEST">Test Modu</option>
            <option value="LIVE">Canlı Mod</option>
          </select>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
            <Save size={15} /> Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Entegrasyonlar() {
  const [catalog, setCatalog] = useState<{ payment: ProviderDef[]; cargo: ProviderDef[]; ai: ProviderDef[]; banking: ProviderDef[] }>({ payment: [], cargo: [], ai: [], banking: [] });
  const [settings, setSettings] = useState<Setting[]>([]);

  const loadSettings = () => api.get('/integrations').then((r) => setSettings(r.data)).catch(() => {});
  useEffect(() => {
    api.get('/integrations/catalog').then((r) => setCatalog(r.data)).catch(() => {});
    loadSettings();
  }, []);

  const getSetting = (p: string) => settings.find((s) => s.provider === p);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center"><Plug className="text-indigo-600" size={22} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Entegrasyonlar</h1>
          <p className="text-sm text-slate-400">Ödeme (sanal POS) ve kargo sağlayıcılarınızı buradan bağlayın</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3 mb-6">
        Buradaki bilgiler, müşterilerinizden ödeme almak ve kargo göndermek için kullanılır. Bilgiler güvenli şekilde saklanır; gizli anahtarlar maskelenir.
      </div>

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><CreditCard size={18} className="text-indigo-600" /> Ödeme / Sanal POS</h2>
      <div className="grid md:grid-cols-2 gap-5 mb-8">
        {catalog.payment.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><Truck size={18} className="text-indigo-600" /> Kargo</h2>
      <div className="grid md:grid-cols-2 gap-5 mb-8">
        {catalog.cargo.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><Plug size={18} className="text-indigo-600" /> Yapay Zeka (Asistan)</h2>
      <p className="text-xs text-slate-400 mb-3">OpenAI API anahtarınızı girerseniz yapay zeka asistanınız akıllı/serbest yanıtlar verir. Boş bırakırsanız platform anahtarı (varsa) kullanılır.</p>
      <div className="grid md:grid-cols-2 gap-5">
        {catalog.ai.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3 mt-8"><Plug size={18} className="text-indigo-600" /> Banka (Hesap Hareketleri)</h2>
      <p className="text-xs text-slate-400 mb-3">İş Bankası Account Info API ile hesap ve hesap hareketlerini çekin. mTLS için İş Bankası'ndan temin edilen istemci sertifikası (.p12) gereklidir.</p>
      <div className="grid md:grid-cols-2 gap-5">
        {catalog.banking.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>
      {catalog.banking.some((d) => getSetting(d.provider)?.enabled) && <IsbankViewer />}
    </div>
  );
}

function IsbankViewer() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [tx, setTx] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const ago = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [begin, setBegin] = useState(ago);
  const [end, setEnd] = useState(today);

  const loadAcc = async () => { setBusy(true); setErr(''); try { const r = await api.get('/isbank/accounts'); setAccounts(r.data.accounts || []); } catch (e: any) { setErr(e?.response?.data?.message || 'Hesaplar alınamadı'); } finally { setBusy(false); } };
  const loadTx = async (acc: any) => { setSel(acc); setBusy(true); setErr(''); try { const r = await api.get(`/isbank/accounts/${acc.account_id}/transactions`, { params: { beginDate: begin + 'T00:00:00.000', endDate: end + 'T23:59:59.000', pageSize: '50' } }); setTx(r.data.hareketler || []); } catch (e: any) { setErr(e?.response?.data?.message || 'Hareketler alınamadı'); } finally { setBusy(false); } };

  return (
    <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">İş Bankası — Hesap Hareketleri</h3><button onClick={loadAcc} disabled={busy} className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-50">Hesapları Getir</button></div>
      {err && <p className="text-sm text-red-500 mb-2">{err}</p>}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {accounts.map((a) => <button key={a.account_id} onClick={() => loadTx(a)} className={`text-left px-3 py-2 rounded-xl border text-sm ${sel?.account_id === a.account_id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}><p className="font-medium text-slate-800">{a.iban}</p><p className="text-xs text-slate-400">{a.branch_name} · Bakiye: {a.account_balance} {a.currency_code}</p></button>)}
        </div>
      )}
      {sel && (
        <>
          <div className="flex items-center gap-2 mb-3 text-sm">
            <input type="date" value={begin} onChange={(e) => setBegin(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg" />
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg" />
            <button onClick={() => loadTx(sel)} disabled={busy} className="px-3 py-1.5 bg-slate-800 text-white rounded-lg disabled:opacity-50">Hareketleri Getir</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]"><thead className="text-slate-400 text-left text-xs"><tr><th className="py-2">Tarih</th><th className="py-2">Açıklama</th><th className="py-2">Tip</th><th className="py-2 text-right">Tutar</th><th className="py-2 text-right">Bakiye</th></tr></thead>
              <tbody>
                {tx.map((m: any, i: number) => (
                  <tr key={i} className="border-t border-slate-100"><td className="py-2 text-slate-500">{(m.valueDate || m.timestamp || '').toString().slice(0, 10)}</td><td className="py-2 text-slate-700">{m.description}</td><td className="py-2">{m.transactionType === 'CREDIT' ? <span className="text-green-600 text-xs">Alacak</span> : <span className="text-red-500 text-xs">Borç</span>}</td><td className={`py-2 text-right font-medium ${m.transactionType === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}>{m.transactionAmount} {m.currencyCode}</td><td className="py-2 text-right text-slate-500">{m.resultingBalance}</td></tr>
                ))}
                {tx.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-slate-400">Hareket yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
