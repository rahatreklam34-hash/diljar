import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Package, MapPin, LogOut, Phone, AtSign, Mail, Wallet, ShoppingBag, ChevronRight, ChevronDown, Truck, Copy, Check, ExternalLink, PackageCheck, Clock } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

const GOLD = '#C9A227';
const fmt = (n: number) => (n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';

// Siparis durum rozetleri
const DURUM_LBL: Record<string, string> = { yeni: 'Yeni', onaylandi: 'Onaylandı', hazirlaniyor: 'Hazırlanıyor', kargoda: 'Kargoda', teslim: 'Teslim Edildi', tamamlandi: 'Teslim Edildi', iptal: 'İptal', odendi: 'Ödendi' };
const durumRenk = (d: string) => {
  const s = (d || '').toLowerCase();
  if (s.includes('iptal')) return 'bg-red-50 text-red-600';
  if (s.includes('teslim') || s.includes('tamamlan')) return 'bg-emerald-50 text-emerald-700';
  if (s.includes('kargo')) return 'bg-blue-50 text-blue-700';
  if (s.includes('onay') || s.includes('odendi') || s.includes('öden')) return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

// Kargo firmasi bazli takip URL'i (bilinen firmalar) — takip no ile yeni sekmede acar
const kargoTakipUrl = (firma: string, no: string): string => {
  const f = (firma || '').toLowerCase();
  const n = encodeURIComponent((no || '').trim());
  if (!n) return '';
  if (f.includes('yurtiç') || f.includes('yurtic')) return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${n}`;
  if (f.includes('aras')) return `https://kargotakip.araskargo.com.tr/?gonderitakipno=${n}`;
  if (f.includes('sürat') || f.includes('surat')) return `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${n}`;
  if (f.includes('mng')) return `https://service.mngkargo.com.tr/ionline/MNGTakip.aspx?takipNo=${n}`;
  if (f.includes('ptt')) return `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${n}`;
  return '';
};

// Siparis durumundan gorsel stepper asamasi (0..2). iptal => -1
const asamaIndex = (durum: string, kargoAsama?: string): number => {
  const s = (durum || '').toLowerCase();
  const k = (kargoAsama || '').toLowerCase();
  if (s.includes('iptal')) return -1;
  if (s.includes('teslim') || s.includes('tamamlan') || k === 'teslim') return 2;
  if (s.includes('kargo') || k === 'kabul' || k === 'dagitim') return 1;
  return 0; // yeni / onaylandi / hazirlaniyor
};
const STEPS = [
  { lbl: 'Hazırlanıyor', Ic: Clock },
  { lbl: 'Kargoda', Ic: Truck },
  { lbl: 'Teslim Edildi', Ic: PackageCheck },
];

export default function Hesabim() {
  const nav = useNavigate();
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  const [storeName, setStoreName] = useState('');
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'siparisler' | 'profil' | 'adres'>('siparisler');
  const [acik, setAcik] = useState<Record<string, boolean>>({});
  const [kopyalanan, setKopyalanan] = useState<string>('');

  const kopyala = (no: string) => {
    try { navigator.clipboard?.writeText(no); } catch { /* */ }
    setKopyalanan(no);
    setTimeout(() => setKopyalanan((k) => (k === no ? '' : k)), 1600);
  };

  useEffect(() => {
    api.get('/public/primary-store')
      .then((r) => { setSlug(r.data?.slug || null); setStoreName(r.data?.magaza || ''); })
      .catch(() => setSlug(null));
  }, []);

  useEffect(() => {
    if (slug === undefined) return;
    if (!slug) { nav('/giris', { replace: true }); return; }
    const tk = localStorage.getItem('shopToken_' + slug);
    if (!tk) { nav('/giris', { replace: true }); return; }
    api.get(`/public/store/${slug}/hesabim`, { headers: { Authorization: 'Bearer ' + tk } })
      .then((r) => setData(r.data))
      .catch((e) => {
        // Token gecersizse temizle ve girise gonder
        if (e?.response?.status === 401) { localStorage.removeItem('shopToken_' + slug); nav('/giris', { replace: true }); return; }
        setErr(apiErrorMessage(e));
      });
  }, [slug]);

  const cikis = () => { if (slug) localStorage.removeItem('shopToken_' + slug); nav('/', { replace: true }); };

  if (slug === undefined || (slug && !data && !err)) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]"><span className="w-8 h-8 border-2 border-white/20 border-t-[#C9A227] rounded-full animate-spin" /></div>;
  }

  const m = data?.musteri || {};
  const siparisler: any[] = data?.siparisler || [];

  const TABS = [['siparisler', 'Siparişlerim', Package], ['profil', 'Profil', User], ['adres', 'Adres', MapPin]] as const;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* (A) Üst duyuru barı — PublicStore ile ayni */}
      <div className="bg-[#0a0a0a] text-white text-[11px] sm:text-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-9 sm:h-10 flex items-center gap-4 overflow-x-auto scrollbar-hide whitespace-nowrap">
          <span className="flex items-center gap-1.5 shrink-0">🚚 7.500 TL ve üzeri alışverişlerde ücretsiz kargo!</span>
          <span className="hidden md:inline text-white/25">|</span>
          <span className="hidden md:flex items-center gap-2 shrink-0 mx-auto">
            <span className="flex items-center gap-1.5">🏅 İLK SİPARİŞE ÖZEL %20 İNDİRİM</span>
          </span>
          <span className="hidden lg:inline shrink-0 ml-auto">Vade farksız 3 taksit fırsatı!</span>
        </div>
      </div>

      {/* (B) Header — PublicStore stili: serif logo + saga aksiyonlar */}
      <header className="sticky top-0 z-30 bg-[#0a0a0a] text-white border-b border-white/10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }} className="font-bold text-2xl sm:text-4xl tracking-tight text-white whitespace-nowrap">{storeName || 'DiLjar'}</Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link to="/" className="text-xs sm:text-sm font-medium text-white/60 hover:text-[#C9A227] transition-colors">Mağazaya Dön</Link>
            <button onClick={cikis} className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white hover:text-[#C9A227] transition-colors"><LogOut size={16} /> Çıkış</button>
          </div>
        </div>
      </header>

      {/* (C) Sekme nav barı — PublicStore kategori nav stili */}
      <div className="bg-white border-b border-slate-200 sticky top-16 z-20">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
          {TABS.map(([k, lbl, Ic]) => (
            <button key={k} onClick={() => setTab(k)} className={`shrink-0 my-2.5 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-[13px] sm:text-sm font-bold tracking-wide transition-colors ${tab === k ? 'bg-[#0a0a0a] text-white' : 'text-[#111] hover:text-[#C9A227]'}`}>
              <Ic size={16} /> {lbl}
            </button>
          ))}
          <button onClick={cikis} className="shrink-0 ml-auto inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold whitespace-nowrap hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
            <LogOut size={16} /> Çıkış
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {err ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">{err}</div>
        ) : (
          <>
            {/* Profil ozeti */}
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 sm:p-6 flex items-center gap-4 mb-5">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#0a0a0a] text-white flex items-center justify-center shrink-0 ring-2 ring-[#C9A227]/40">
                <span className="text-xl font-bold">{(m.ad || '?').trim().charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-[#111] truncate">{m.ad || 'Müşteri'}</h1>
                <p className="text-sm text-slate-400">{m.telefon || ''} {m.musteriNo ? `· No: ${m.musteriNo}` : ''}</p>
              </div>
              {typeof m.bakiye === 'number' && m.bakiye !== 0 && (
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide">Bakiye</p>
                  <p className="text-lg font-black" style={{ color: GOLD }}>{fmt(m.bakiye)}</p>
                </div>
              )}
            </div>

            {/* Siparislerim */}
            {tab === 'siparisler' && (
              <div className="space-y-3">
                {siparisler.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200/70 p-10 text-center">
                    <ShoppingBag size={40} className="mx-auto text-slate-300" />
                    <p className="text-slate-500 mt-3 text-sm">Henüz siparişiniz yok.</p>
                    <Link to="/" className="inline-block mt-4 bg-[#0a0a0a] hover:bg-[#C9A227] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-colors">Alışverişe Başla</Link>
                  </div>
                ) : siparisler.map((o) => {
                  const items: any[] = Array.isArray(o.items) ? o.items : [];
                  const no = o.sipNo || (o.orderNo ? `${o.orderYil || ''}${o.orderYil ? '-' : ''}${o.orderNo}` : (o.id || '').slice(-6));
                  const isOpen = !!acik[o.id];
                  const step = asamaIndex(o.durum, o.kargoAsama);
                  const iptal = step === -1;
                  const takipNo: string = o.kargoTakip || '';
                  const takipUrl = takipNo ? kargoTakipUrl(o.kargoFirmasi || '', takipNo) : '';
                  const adet = items.reduce((s, it) => s + (it.adet || 1), 0);
                  return (
                    <div key={o.id} className="bg-white rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                      {/* Kart basligi */}
                      <div className="p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-sm font-bold text-[#111]">Sipariş #{no}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{o.createdAt ? new Date(o.createdAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}{adet ? ` · ${adet} ürün` : ''}</p>
                          </div>
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${durumRenk(o.durum)}`}>{DURUM_LBL[(o.durum || '').toLowerCase()] || o.durum}</span>
                        </div>

                        {/* Kompakt kalem ozeti */}
                        {items.length > 0 && !isOpen && (
                          <div className="mt-3 border-t border-slate-100 pt-3 space-y-1.5">
                            {items.slice(0, 3).map((it, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600 truncate mr-2">{it.ad || it.urun || 'Ürün'}{it.varyasyon ? ` (${it.varyasyon})` : ''} × {it.adet || 1}</span>
                                {typeof it.fiyat === 'number' && <span className="text-slate-500 shrink-0">{fmt(it.fiyat * (it.adet || 1))}</span>}
                              </div>
                            ))}
                            {items.length > 3 && <p className="text-xs text-slate-400">+{items.length - 3} ürün daha</p>}
                          </div>
                        )}

                        {/* Kargo ozet + toplam + Detay ac/kapa */}
                        <div className="mt-3 border-t border-slate-100 pt-3 flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-xs text-slate-400">
                            {o.kargoFirmasi && <span>Kargo: <span className="text-slate-600 font-medium">{o.kargoFirmasi}</span></span>}
                            {takipNo && <span className="ml-2">Takip: <span className="text-slate-600 font-medium">{takipNo}</span></span>}
                          </div>
                          <div className="ml-auto flex items-center gap-3">
                            <span className="text-base font-black text-[#0a0a0a]">{fmt(o.toplam)}</span>
                            <button onClick={() => setAcik((a) => ({ ...a, [o.id]: !a[o.id] }))} className="inline-flex items-center gap-1 text-sm font-bold hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
                              Detay {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={15} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Genisleyen detay */}
                      {isOpen && (
                        <div className="bg-slate-50/70 border-t border-slate-100 p-4 sm:p-5 space-y-5">
                          {/* Kargo takip stepper */}
                          {!iptal && (
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-3 flex items-center gap-1.5"><Truck size={13} /> Kargo Takibi</p>
                              <div className="flex items-center">
                                {STEPS.map((st, i) => {
                                  const done = i <= step;
                                  const St = st.Ic;
                                  return (
                                    <div key={i} className="flex-1 flex flex-col items-center relative">
                                      {i > 0 && <span className={`absolute top-4 right-1/2 w-full h-0.5 ${i <= step ? 'bg-[#C9A227]' : 'bg-slate-200'}`} />}
                                      <span className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${done ? 'bg-[#0a0a0a] text-white ring-2 ring-[#C9A227]' : 'bg-slate-200 text-slate-400'}`}><St size={15} /></span>
                                      <span className={`mt-1.5 text-[10px] sm:text-[11px] font-medium text-center ${done ? 'text-[#111]' : 'text-slate-400'}`}>{st.lbl}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {o.kargoDurum && <p className="text-xs text-slate-500 text-center mt-3">{o.kargoDurum}{o.kargoZamani ? ` · ${new Date(o.kargoZamani).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}` : ''}</p>}
                              {/* Takip no + firma URL / kopyala */}
                              {takipNo && (
                                <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                                  {takipUrl ? (
                                    <a href={takipUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-[#0a0a0a] hover:bg-[#C9A227] text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors">
                                      Takip Et <ExternalLink size={13} />
                                    </a>
                                  ) : null}
                                  <button onClick={() => kopyala(takipNo)} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-lg hover:border-[#C9A227] transition-colors">
                                    {kopyalanan === takipNo ? <><Check size={13} className="text-emerald-600" /> Kopyalandı</> : <><Copy size={13} /> {takipNo}</>}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Urun kalemleri (gorsel) */}
                          {items.length > 0 && (
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5"><Package size={13} /> Ürünler</p>
                              <div className="space-y-2">
                                {items.map((it, i) => (
                                  <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-2.5">
                                    {it.img ? (
                                      <img src={it.img} alt="" className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0" loading="lazy" />
                                    ) : (
                                      <span className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-300"><Package size={20} /></span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-[#111] truncate">{it.ad || it.urun || 'Ürün'}</p>
                                      <p className="text-xs text-slate-400">{it.varyasyon ? `${it.varyasyon} · ` : ''}Adet: {it.adet || 1}</p>
                                    </div>
                                    {typeof it.fiyat === 'number' && <span className="text-sm font-bold text-slate-700 shrink-0">{fmt(it.fiyat * (it.adet || 1))}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Teslimat adresi */}
                          {(o.adres || o.il || o.ilce) && (
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5"><MapPin size={13} /> Teslimat Adresi</p>
                              <div className="bg-white rounded-xl border border-slate-100 p-3">
                                {o.adres && <p className="text-sm text-[#111] whitespace-pre-line leading-relaxed">{o.adres}</p>}
                                {(o.il || o.ilce) && <p className="text-xs text-slate-400 mt-0.5">{[o.ilce, o.il].filter(Boolean).join(' / ')}</p>}
                              </div>
                            </div>
                          )}

                          {/* Odeme / kargo ozeti */}
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5"><Wallet size={13} /> Ödeme Özeti</p>
                            <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-1.5 text-sm">
                              {typeof o.araToplam === 'number' && o.araToplam > 0 && (
                                <div className="flex justify-between text-slate-500"><span>Ara Toplam</span><span>{fmt(o.araToplam)}</span></div>
                              )}
                              {typeof o.indirim === 'number' && o.indirim > 0 && (
                                <div className="flex justify-between text-emerald-600"><span>İndirim</span><span>-{fmt(o.indirim)}</span></div>
                              )}
                              {typeof o.kargoUcreti === 'number' && o.kargoUcreti > 0 && (
                                <div className="flex justify-between text-slate-500"><span>Kargo</span><span>{fmt(o.kargoUcreti)}</span></div>
                              )}
                              <div className="flex justify-between font-black text-[#0a0a0a] border-t border-slate-100 pt-1.5"><span>Toplam</span><span>{fmt(o.toplam)}</span></div>
                              {typeof o.tahsilat === 'number' && o.tahsilat > 0 && o.tahsilat < o.toplam && (
                                <div className="flex justify-between text-amber-600"><span>Kalan</span><span>{fmt(o.toplam - o.tahsilat)}</span></div>
                              )}
                              {o.odemeYontemi && <p className="text-xs text-slate-400 pt-1">Ödeme: {o.odemeYontemi}</p>}
                            </div>
                          </div>

                          {o.token && (
                            <Link to={`/sepet/${o.token}`} className="inline-flex items-center gap-1 text-sm font-bold hover:opacity-80 transition-opacity" style={{ color: GOLD }}>
                              Sipariş sayfasını aç <ChevronRight size={15} />
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Profil */}
            {tab === 'profil' && (
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 sm:p-6 space-y-3">
                {[[User, 'Ad Soyad', m.ad], [Phone, 'Telefon', m.telefon], [AtSign, 'Instagram', m.instagram], [Mail, 'E-posta', m.email], [Wallet, 'Bakiye', typeof m.bakiye === 'number' ? fmt(m.bakiye) : null]].map(([Ic, lbl, val]: any, i) => (
                  (val ? (
                    <div key={i} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                      <span className="w-9 h-9 rounded-lg bg-slate-100 text-[#0a0a0a] flex items-center justify-center shrink-0"><Ic size={17} /></span>
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">{lbl}</p>
                        <p className="text-sm font-medium text-[#111] truncate">{val}</p>
                      </div>
                    </div>
                  ) : null)
                ))}
                <p className="text-xs text-slate-400 pt-2">Profil bilgilerinizi güncellemek için mağaza ile iletişime geçebilirsiniz.</p>
              </div>
            )}

            {/* Adres */}
            {tab === 'adres' && (
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 sm:p-6">
                {m.adres ? (
                  <div className="flex items-start gap-3">
                    <span className="w-9 h-9 rounded-lg bg-slate-100 text-[#0a0a0a] flex items-center justify-center shrink-0"><MapPin size={17} /></span>
                    <div>
                      <p className="text-[11px] text-slate-400 uppercase tracking-wide">Teslimat Adresi</p>
                      <p className="text-sm text-[#111] mt-0.5 whitespace-pre-line leading-relaxed">{m.adres}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <MapPin size={36} className="mx-auto text-slate-300" />
                    <p className="text-sm text-slate-500 mt-3">Kayıtlı adres yok. Sipariş sırasında adres girebilirsiniz.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
