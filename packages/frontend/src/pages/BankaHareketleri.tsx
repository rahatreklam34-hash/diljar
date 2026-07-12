import { useMemo, useState } from 'react';
import { Landmark, Plus, RefreshCw, ArrowDownLeft, ArrowUpRight, Info, Database, Cloud } from 'lucide-react';
import api from '../lib/api';

type Tx = {
  valueDate: string;
  description: string;
  transactionType: 'CREDIT' | 'DEBIT';
  transactionAmount: number;
  currencyCode: string;
  resultingBalance: number;
};
type Acc = {
  account_id: string;
  iban: string;
  branch_name: string;
  account_balance: number;
  currency_code: string;
  _tx: Tx[];
};

const fmt = (v: number) => Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dStr = (d: Date) => d.toISOString().slice(0, 10);

// Örnek hareketleri (running balance ile) üret
function buildTx(seed: { desc: string; type: 'CREDIT' | 'DEBIT'; amount: number; daysAgo: number }[], openingBalance: number): { tx: Tx[]; balance: number } {
  // En eskiden yeniye doğru bakiye işle, sonra yeniden eskiye sırala
  const ordered = [...seed].sort((a, b) => b.daysAgo - a.daysAgo);
  let bal = openingBalance;
  const out: Tx[] = [];
  for (const s of ordered) {
    bal += s.type === 'CREDIT' ? s.amount : -s.amount;
    const d = new Date(Date.now() - s.daysAgo * 86400000);
    out.push({ valueDate: dStr(d), description: s.desc, transactionType: s.type, transactionAmount: s.amount, currencyCode: 'TL', resultingBalance: Math.round(bal * 100) / 100 });
  }
  return { tx: out.reverse(), balance: Math.round(bal * 100) / 100 };
}

function demoAccounts(): Acc[] {
  const a1 = buildTx([
    { desc: 'Gelen Havale - Ahmet Yilmaz', type: 'CREDIT', amount: 12500, daysAgo: 27 },
    { desc: 'POS Tahsilat - Gunluk', type: 'CREDIT', amount: 8430.5, daysAgo: 24 },
    { desc: 'Kira Odemesi', type: 'DEBIT', amount: 15000, daysAgo: 21 },
    { desc: 'Tedarikci Odemesi - Tekstil A.S.', type: 'DEBIT', amount: 22300, daysAgo: 18 },
    { desc: 'Gelen EFT - Online Magaza', type: 'CREDIT', amount: 34210, daysAgo: 14 },
    { desc: 'Elektrik Faturasi', type: 'DEBIT', amount: 1820.75, daysAgo: 11 },
    { desc: 'POS Tahsilat - Gunluk', type: 'CREDIT', amount: 15640, daysAgo: 7 },
    { desc: 'Personel Maas Odemesi', type: 'DEBIT', amount: 28000, daysAgo: 5 },
    { desc: 'Gelen Havale - Canli Yayin', type: 'CREDIT', amount: 9870, daysAgo: 2 },
    { desc: 'FAST - Mehmet Demir', type: 'CREDIT', amount: 2450, daysAgo: 0 },
  ], 120000);
  const a2 = buildTx([
    { desc: 'Acilis Bakiyesi Transferi', type: 'CREDIT', amount: 30000, daysAgo: 26 },
    { desc: 'Kargo Odemesi - Yurtici', type: 'DEBIT', amount: 3120, daysAgo: 19 },
    { desc: 'Gelen Havale - Toptan Musteri', type: 'CREDIT', amount: 18750, daysAgo: 12 },
    { desc: 'Vergi Odemesi', type: 'DEBIT', amount: 6540.3, daysAgo: 6 },
    { desc: 'POS Tahsilat', type: 'CREDIT', amount: 4280, daysAgo: 1 },
  ], 5000);
  return [
    { account_id: 'demo-1', iban: 'TR12 0006 4000 0011 2345 6789 01', branch_name: 'Merkez Sube', account_balance: a1.balance, currency_code: 'TL', _tx: a1.tx },
    { account_id: 'demo-2', iban: 'TR98 0006 4000 0019 8765 4321 09', branch_name: 'Ticaret Sube', account_balance: a2.balance, currency_code: 'TL', _tx: a2.tx },
  ];
}

const SAMPLE_DESCS = ['Gelen Havale', 'POS Tahsilat', 'FAST Transfer', 'Tedarikci Odemesi', 'Fatura Odemesi', 'Iade', 'Online Magaza Tahsilat'];

export default function BankaHareketleri() {
  const [mode, setMode] = useState<'demo' | 'gercek'>('demo');
  const [accounts, setAccounts] = useState<Acc[]>(() => demoAccounts());
  const [selId, setSelId] = useState<string>('demo-1');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const today = dStr(new Date());
  const ago = dStr(new Date(Date.now() - 30 * 86400000));
  const [begin, setBegin] = useState(ago);
  const [end, setEnd] = useState(today);

  const sel = accounts.find((a) => a.account_id === selId) || accounts[0];
  const filteredTx = useMemo(() => (sel?._tx || []).filter((t) => t.valueDate >= begin && t.valueDate <= end), [sel, begin, end]);
  const ozet = useMemo(() => {
    const giren = filteredTx.filter((t) => t.transactionType === 'CREDIT').reduce((s, t) => s + t.transactionAmount, 0);
    const cikan = filteredTx.filter((t) => t.transactionType === 'DEBIT').reduce((s, t) => s + t.transactionAmount, 0);
    return { giren, cikan, net: giren - cikan };
  }, [filteredTx]);

  // Demo: örnek hareket ekle
  const ornekHareketEkle = () => {
    setAccounts((accs) => accs.map((a) => {
      if (a.account_id !== selId) return a;
      const type: 'CREDIT' | 'DEBIT' = Math.random() > 0.45 ? 'CREDIT' : 'DEBIT';
      const amount = Math.round((Math.random() * 9000 + 500) * 100) / 100;
      const bal = Math.round((a.account_balance + (type === 'CREDIT' ? amount : -amount)) * 100) / 100;
      const tx: Tx = { valueDate: today, description: SAMPLE_DESCS[Math.floor(Math.random() * SAMPLE_DESCS.length)] + ' (ornek)', transactionType: type, transactionAmount: amount, currencyCode: 'TL', resultingBalance: bal };
      return { ...a, account_balance: bal, _tx: [tx, ...a._tx] };
    }));
  };

  // Demo verisini sıfırla
  const sifirla = () => { setAccounts(demoAccounts()); setSelId('demo-1'); };

  // Gerçek İş Bankası: hesapları getir
  const gercekGetir = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/isbank/accounts');
      const list = (r.data?.accounts || []).map((a: any) => ({ ...a, _tx: [] as Tx[] }));
      if (!list.length) { setErr('Hesap bulunamadi. Is Bankasi entegrasyonu yapilandirilmis mi?'); }
      else { setAccounts(list); setSelId(list[0].account_id); }
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Gercek hesaplar alinamadi. Entegrasyonlar > Banka bolumunden Is Bankasi bilgilerini girin.');
    } finally { setBusy(false); }
  };
  const gercekHareket = async (acc: Acc) => {
    setBusy(true); setErr('');
    try {
      const r = await api.get(`/isbank/accounts/${acc.account_id}/transactions`, { params: { beginDate: begin + 'T00:00:00.000', endDate: end + 'T23:59:59.000', pageSize: '50' } });
      const list: Tx[] = (r.data?.hareketler || []).map((m: any) => ({
        valueDate: (m.valueDate || m.timestamp || '').toString().slice(0, 10),
        description: m.description, transactionType: m.transactionType, transactionAmount: Number(m.transactionAmount) || 0,
        currencyCode: m.currencyCode || 'TL', resultingBalance: Number(m.resultingBalance) || 0,
      }));
      setAccounts((accs) => accs.map((a) => a.account_id === acc.account_id ? { ...a, _tx: list } : a));
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Hareketler alinamadi.');
    } finally { setBusy(false); }
  };

  const switchMode = (m: 'demo' | 'gercek') => {
    setErr('');
    setMode(m);
    if (m === 'demo') { setAccounts(demoAccounts()); setSelId('demo-1'); }
    else { setAccounts([]); setSelId(''); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Landmark className="text-emerald-600" size={22} /></div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Banka Hareketleri</h1>
            <p className="text-[11px] text-gray-400">Banka hesap hareketlerinizi goruntuleyin. Ornek veri ile deneyebilirsiniz.</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          <button onClick={() => switchMode('demo')} className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md ${mode === 'demo' ? 'bg-[#1F9D57] text-white' : 'text-gray-500 hover:bg-gray-100'}`}><Database size={13} /> Ornek Veri</button>
          <button onClick={() => switchMode('gercek')} className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md ${mode === 'gercek' ? 'bg-[#1F9D57] text-white' : 'text-gray-500 hover:bg-gray-100'}`}><Cloud size={13} /> Gercek (Is Bankasi)</button>
        </div>
      </div>

      {mode === 'demo' && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2.5 text-[12px]">
          <Info size={15} className="shrink-0 mt-0.5" />
          <span>Bu ekran <b>ornek (demo) verilerle</b> calisiyor. Gercek banka baglantisi icin sag ustten "Gercek (Is Bankasi)" secip Entegrasyonlar'dan bilgilerinizi girin. "Ornek Hareket Ekle" ile deneme yapabilirsiniz.</span>
        </div>
      )}

      {err && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2.5 text-[13px]">{err}</div>}

      {/* Hesap secimi */}
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'gercek' && accounts.length === 0 && (
          <button onClick={gercekGetir} disabled={busy} className="px-3.5 py-2 text-xs font-medium bg-[#1F9D57] text-white rounded-lg hover:bg-[#178A49] disabled:opacity-50">{busy ? 'Getiriliyor...' : 'Hesaplari Getir'}</button>
        )}
        {accounts.map((a) => (
          <button key={a.account_id} onClick={() => { setSelId(a.account_id); if (mode === 'gercek') gercekHareket(a); }} className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors ${selId === a.account_id ? 'border-[#1F9D57] bg-[#1F9D57]/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
            <p className="text-[12px] font-semibold text-gray-800">{a.iban}</p>
            <p className="text-[10px] text-gray-400">{a.branch_name} · Bakiye: <span className="font-medium text-gray-700">{fmt(a.account_balance)} {a.currency_code}</span></p>
          </button>
        ))}
      </div>

      {sel && (
        <>
          {/* Ozet kartlari */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1"><Landmark size={14} className="text-emerald-500" /><span className="text-[9px] text-gray-400 font-medium">Guncel Bakiye</span></div>
              <p className="text-lg font-bold text-gray-800">{fmt(sel.account_balance)} TL</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1"><ArrowDownLeft size={14} className="text-green-500" /><span className="text-[9px] text-gray-400 font-medium">Donem Giren</span></div>
              <p className="text-lg font-bold text-green-600">{fmt(ozet.giren)} TL</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1"><ArrowUpRight size={14} className="text-red-500" /><span className="text-[9px] text-gray-400 font-medium">Donem Cikan</span></div>
              <p className="text-lg font-bold text-red-500">{fmt(ozet.cikan)} TL</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-1"><span className="text-sm">📊</span><span className="text-[9px] text-gray-400 font-medium">Net Akis</span></div>
              <p className={`text-lg font-bold ${ozet.net >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{fmt(ozet.net)} TL</p>
            </div>
          </div>

          {/* Filtre + aksiyon */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1.5 bg-white border border-gray-200 rounded-lg">
              <input type="date" value={begin} onChange={(e) => setBegin(e.target.value)} className="text-[11px] outline-none bg-transparent w-[110px]" />
              <span className="text-[9px] text-gray-400">-</span>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="text-[11px] outline-none bg-transparent w-[110px]" />
            </div>
            {mode === 'gercek'
              ? <button onClick={() => gercekHareket(sel)} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50"><RefreshCw size={13} /> Hareketleri Getir</button>
              : <>
                  <button onClick={ornekHareketEkle} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#1F9D57] text-white rounded-lg hover:bg-[#178A49]"><Plus size={14} /> Ornek Hareket Ekle</button>
                  <button onClick={sifirla} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"><RefreshCw size={13} /> Sifirla</button>
                </>}
          </div>

          {/* Hareket tablosu */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[640px]">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50 text-gray-400 text-left text-[10px]">
                  <th className="px-4 py-2.5 font-medium">Tarih</th>
                  <th className="px-4 py-2.5 font-medium">Aciklama</th>
                  <th className="px-4 py-2.5 font-medium">Tip</th>
                  <th className="px-4 py-2.5 font-medium text-right">Tutar</th>
                  <th className="px-4 py-2.5 font-medium text-right">Bakiye</th>
                </tr></thead>
                <tbody>
                  {filteredTx.map((t, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-500">{t.valueDate}</td>
                      <td className="px-4 py-2.5 text-gray-700 font-medium">{t.description}</td>
                      <td className="px-4 py-2.5">{t.transactionType === 'CREDIT'
                        ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-50 text-green-600 text-[10px] font-medium"><ArrowDownLeft size={11} /> Alacak</span>
                        : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 text-red-600 text-[10px] font-medium"><ArrowUpRight size={11} /> Borc</span>}</td>
                      <td className={`px-4 py-2.5 text-right font-bold ${t.transactionType === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}>{t.transactionType === 'CREDIT' ? '+' : '-'}{fmt(t.transactionAmount)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{fmt(t.resultingBalance)}</td>
                    </tr>
                  ))}
                  {filteredTx.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-[13px]">Bu tarih araliginda hareket yok.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-[10px] text-gray-400">
              <span>{filteredTx.length} hareket</span>
              <span>{begin} - {end}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
