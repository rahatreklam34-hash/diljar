import { useEffect, useState } from 'react';
import { Plug, CreditCard, Truck, Save, MessageSquare, Video } from 'lucide-react';
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
    <div className={`bg-white rounded-2xl border p-5 ${enabled ? 'border-emerald-300' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800">{def.label}</h3>
        <label className="inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <div className="w-10 h-5 bg-slate-200 peer-checked:bg-emerald-500 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-5" />
        </label>
      </div>
      {def.description && <p className="text-xs text-slate-400 mb-3">{def.description}</p>}
      <div className="space-y-3">
        {def.fields.map((f) => (
          (f as any).type === 'bool' ? (
            <label key={f.key} className="flex items-center justify-between gap-2 py-1 cursor-pointer">
              <span className="text-xs text-slate-600">{f.label}{f.optional && ' (opsiyonel)'}</span>
              <span className="inline-flex items-center">
                <input type="checkbox" className="sr-only peer"
                  checked={config[f.key] === 'true' || (config[f.key] as any) === true}
                  onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.checked ? 'true' : 'false' }))} />
                <span className="w-10 h-5 bg-slate-200 peer-checked:bg-emerald-500 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-5" />
              </span>
            </label>
          ) : (
          <div key={f.key}>
            <label className="block text-xs text-slate-500 mb-1">{f.label}{f.optional && ' (opsiyonel)'}</label>
            <input
              type={f.type === 'password' ? 'password' : 'text'}
              value={config[f.key] || ''}
              onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
          )
        ))}
        <div className="flex items-center justify-between pt-1">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg">
            <option value="TEST">Test Modu</option>
            <option value="LIVE">Canlı Mod</option>
          </select>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
            <Save size={15} /> Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Entegrasyonlar() {
  const [catalog, setCatalog] = useState<{ payment: ProviderDef[]; cargo: ProviderDef[]; ai: ProviderDef[]; banking: ProviderDef[]; sms: ProviderDef[] }>({ payment: [], cargo: [], ai: [], banking: [], sms: [] });
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
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Plug className="text-emerald-600" size={22} /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Entegrasyonlar</h1>
          <p className="text-sm text-slate-400">Ödeme (sanal POS) ve kargo sağlayıcılarınızı buradan bağlayın</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-xl px-4 py-3 mb-6">
        Buradaki bilgiler, müşterilerinizden ödeme almak ve kargo göndermek için kullanılır. Bilgiler güvenli şekilde saklanır; gizli anahtarlar maskelenir.
      </div>

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><CreditCard size={18} className="text-emerald-600" /> Ödeme / Sanal POS</h2>
      <div className="grid md:grid-cols-2 gap-5 mb-8">
        {catalog.payment.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><Truck size={18} className="text-emerald-600" /> Kargo</h2>
      <div className="grid md:grid-cols-2 gap-5 mb-8">
        {catalog.cargo.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3"><Plug size={18} className="text-emerald-600" /> Yapay Zeka (Asistan)</h2>
      <p className="text-xs text-slate-400 mb-3">OpenAI API anahtarınızı girerseniz yapay zeka asistanınız akıllı/serbest yanıtlar verir. Boş bırakırsanız platform anahtarı (varsa) kullanılır.</p>
      <div className="grid md:grid-cols-2 gap-5">
        {catalog.ai.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3 mt-8"><Plug size={18} className="text-emerald-600" /> Banka (Hesap Hareketleri)</h2>
      <p className="text-xs text-slate-400 mb-3">İş Bankası Account Info API ile hesap ve hesap hareketlerini çekin. mTLS için İş Bankası'ndan temin edilen istemci sertifikası (.p12) gereklidir.</p>
      <div className="grid md:grid-cols-2 gap-5">
        {catalog.banking.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>
      {catalog.banking.some((d) => getSetting(d.provider)?.enabled) && <IsbankViewer />}

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3 mt-8"><MessageSquare size={18} className="text-emerald-600" /> SMS (Toplu SMS & Sipariş Bildirimi)</h2>
      <p className="text-xs text-slate-400 mb-3">NetGSM ile kampanyalarda toplu SMS gönderin ve sipariş durum değişimlerinde müşterilere otomatik bilgilendirme yapın. Kullanıcı kodu, şifre ve onaylı gönderici başlığı (msgheader) gereklidir.</p>
      <div className="grid md:grid-cols-2 gap-5">
        {catalog.sms.map((d) => <ProviderCard key={d.provider} def={d} setting={getSetting(d.provider)} onSaved={loadSettings} />)}
      </div>
      {catalog.sms.some((d) => getSetting(d.provider)?.enabled) && <SmsTester />}

      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3 mt-8"><Video size={18} className="text-emerald-600" /> Canlı Yayın Sosyal Bağlantıları (Facebook / Instagram)</h2>
      <p className="text-xs text-slate-400 mb-3">Facebook ve Instagram canlı yayın yorumlarını siparişe çevirmek için erişim token'larınızı buradan <b>bir kez</b> kaydedin. Her yayında otomatik bağlanır — canlı yayın ekranında tekrar token girmenize gerek kalmaz.</p>
      <div className="grid md:grid-cols-2 gap-5">
        <FacebookCanli />
        <InstagramCanli />
      </div>
    </div>
  );
}

function FacebookCanli() {
  const [token, setToken] = useState('');
  const [pageId, setPageId] = useState('');
  const [status, setStatus] = useState<{ saved: boolean; connected: boolean; pageId: string | null }>({ saved: false, connected: false, pageId: null });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const r = await api.get('/store/live/fb/status'); setStatus({ saved: !!r.data?.saved, connected: !!r.data?.connected, pageId: r.data?.pageId || null }); }
    catch { /* yayın yokken sessiz geç */ }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!token.trim() || !pageId.trim()) { toast.error('Sayfa erişim token ve Sayfa ID gerekli'); return; }
    setBusy(true);
    try {
      const r = await api.post('/store/live/fb/save', { token: token.trim(), pageId: pageId.trim() });
      toast.success(r.data?.bound ? 'Facebook kaydedildi ve aktif yayına bağlandı' : 'Facebook token kaydedildi — yayında otomatik bağlanacak');
      setToken('');
      load();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm('Kayıtlı Facebook token kaldırılsın mı?')) return;
    setBusy(true);
    try { await api.post('/store/live/fb/disconnect'); toast.success('Facebook bağlantısı kaldırıldı'); setPageId(''); load(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className={`bg-white rounded-2xl border p-5 ${status.saved ? 'border-blue-300' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Video size={18} className="text-blue-600" /> Facebook Canlı Yayın</h3>
        {status.saved ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">{status.connected ? 'Yayına bağlı' : 'Kayıtlı'}</span> : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Bağlı değil</span>}
      </div>
      <p className="text-xs text-slate-400 mb-3">Sayfa Erişim Token'ı ve Sayfa ID'sini kaydedin. Yayın başladığında aktif canlı video otomatik bulunup yorumlar çekilir.</p>
      {status.saved ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">Kayıtlı — Sayfa ID: <b className="font-mono">{status.pageId}</b></div>
          <button onClick={remove} disabled={busy} className="w-full bg-rose-500 text-white py-2.5 rounded-lg font-medium hover:bg-rose-600 disabled:opacity-50">{busy ? 'İşleniyor…' : 'Kayıtlı Token\u2019ı Kaldır'}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Sayfa ID</label>
            <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="örn. 1234567890" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Sayfa Erişim Token (Page Access Token)</label>
            <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="EAAB... ile başlayan uzun token" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 font-mono" />
          </div>
          <button onClick={save} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"><Save size={16} /> {busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <p className="text-[10px] text-slate-400">Token'ı Facebook Developer panelinden alın. Gerekli izinler: <span className="font-mono">pages_read_engagement</span>, <span className="font-mono">pages_manage_metadata</span>.</p>
        </div>
      )}
    </div>
  );
}

function InstagramCanli() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<{ saved: boolean; connected: boolean; igUserId: string | null }>({ saved: false, connected: false, igUserId: null });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const r = await api.get('/store/live/ig/status'); setStatus({ saved: !!r.data?.saved, connected: !!r.data?.connected, igUserId: r.data?.igUserId || null }); }
    catch { /* yayın yokken sessiz geç */ }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!token.trim()) { toast.error('Instagram erişim token gerekli'); return; }
    setBusy(true);
    try {
      await api.post('/store/live/ig/connect', { token: token.trim() });
      toast.success('Instagram token kaydedildi — yayında otomatik bağlanacak');
      setToken('');
      load();
    } catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm('Kayıtlı Instagram token kaldırılsın mı?')) return;
    setBusy(true);
    try { await api.post('/store/live/ig/disconnect'); toast.success('Instagram bağlantısı kaldırıldı'); load(); }
    catch (e) { toast.error(apiErrorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className={`bg-white rounded-2xl border p-5 ${status.saved ? 'border-pink-300' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Video size={18} className="text-pink-600" /> Instagram Canlı Yayın</h3>
        {status.saved ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">{status.connected ? 'Yayına bağlı' : 'Kayıtlı'}</span> : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">Bağlı değil</span>}
      </div>
      <p className="text-xs text-slate-400 mb-3">Erişim token'ınızı kaydedin. Hesap token'dan otomatik çözülür; yayın başladığında yorumlar otomatik çekilir.</p>
      {status.saved ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">Kayıtlı — Hesap ID: <b className="font-mono">{status.igUserId || '—'}</b></div>
          <button onClick={remove} disabled={busy} className="w-full bg-rose-500 text-white py-2.5 rounded-lg font-medium hover:bg-rose-600 disabled:opacity-50">{busy ? 'İşleniyor…' : 'Kayıtlı Token\u2019ı Kaldır'}</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Instagram Erişim Token</label>
            <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={3} placeholder="IGAA... ile başlayan token" className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-pink-300 font-mono" />
          </div>
          <button onClick={save} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 bg-pink-600 text-white py-2.5 rounded-lg font-medium hover:bg-pink-700 disabled:opacity-50"><Save size={16} /> {busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <p className="text-[10px] text-slate-400">Token'ı Meta Developer panelinden (Instagram API ile giriş) alın. Gerekli izin: canlı medya ve yorum okuma.</p>
        </div>
      )}
    </div>
  );
}

function SmsTester() {
  const [res, setRes] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true); setRes('');
    try { const r = await api.get('/sms/test'); setRes((r.data?.ok ? '✓ ' : '✗ ') + (r.data?.message || '') + (r.data?.balance ? ' | Bakiye: ' + r.data.balance : '')); }
    catch (e) { setRes('✗ ' + apiErrorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
      <button onClick={test} disabled={busy} className="px-3.5 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{busy ? 'Kontrol ediliyor...' : 'Bağlantıyı / Bakiyeyi Test Et'}</button>
      {res && <span className={`text-sm ${res.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{res}</span>}
      <span className="text-xs text-slate-400 ml-auto">Sipariş bildirim metinleri ve toplu gönderim için: <b>Pazarlama & SMS</b> sayfası.</span>
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
      <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">İş Bankası — Hesap Hareketleri</h3><button onClick={loadAcc} disabled={busy} className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50">Hesapları Getir</button></div>
      {err && <p className="text-sm text-red-500 mb-2">{err}</p>}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {accounts.map((a) => <button key={a.account_id} onClick={() => loadTx(a)} className={`text-left px-3 py-2 rounded-xl border text-sm ${sel?.account_id === a.account_id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}><p className="font-medium text-slate-800">{a.iban}</p><p className="text-xs text-slate-400">{a.branch_name} · Bakiye: {a.account_balance} {a.currency_code}</p></button>)}
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
