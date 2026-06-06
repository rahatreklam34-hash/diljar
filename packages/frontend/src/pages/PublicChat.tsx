import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Bot, Send, ImagePlus, X } from 'lucide-react';
import api, { apiErrorMessage } from '../lib/api';

export default function PublicChat() {
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  const [started, setStarted] = useState(false);
  const [ad, setAd] = useState('');
  const [musteriTipi, setMusteriTipi] = useState('');
  const [instagram, setInstagram] = useState('');
  const [telefon, setTelefon] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const typingRef = useRef(false);
  const autoRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api.get(`/public/chat/${slug}`).then((r) => setInfo(r.data)).catch((e) => setErr(apiErrorMessage(e))); }, [slug]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);

  // Sepetten gelen otomatik başlatma (kimlik biliniyor, form sorma)
  useEffect(() => {
    if (!info?.active || autoRef.current) return;
    if (sp.get('auto') !== '1') return;
    const a = sp.get('ad') || ''; const tel = sp.get('tel') || ''; const ig = sp.get('ig') || '';
    if (!a && !tel && !ig) return;
    autoRef.current = true;
    (async () => {
      try {
        const r = await api.post(`/public/chat/${slug}/start`, { musteriAd: a, musteriTipi: 'mevcut', instagram: ig, telefon: tel });
        setSessionId(r.data.sessionId); setMessages(r.data.messages || []); setStarted(true);
      } catch (e) { setErr(apiErrorMessage(e)); }
    })();
  }, [info, sp, slug]);

  // Yetkili yanitlari icin periyodik yenileme (yaziyor sirasinda dokunma)
  useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(async () => {
      if (typingRef.current) return;
      try { const r = await api.get(`/public/chat/${slug}/messages`, { params: { sessionId } }); setMessages(r.data.messages || []); } catch { /* */ }
    }, 5000);
    return () => clearInterval(t);
  }, [sessionId, slug]);

  const start = async () => {
    if (!ad.trim() || !telefon.trim()) { alert('Lütfen ad soyad ve telefon girin.'); return; }
    try { const r = await api.post(`/public/chat/${slug}/start`, { musteriAd: ad, musteriTipi, instagram, telefon }); setSessionId(r.data.sessionId); setMessages(r.data.messages || []); setStarted(true); } catch (e) { setErr(apiErrorMessage(e)); }
  };
  const sendContent = async (val: string) => {
    setBusy(true);
    setMessages((m) => [...m, { id: 'tmp' + Date.now(), role: 'user', content: val }]);
    try {
      const r = await api.post(`/public/chat/${slug}/message`, { sessionId, content: val, cartToken: sp.get('cart') || undefined });
      const msgs = r.data.messages || [];
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'bot') {
        setMessages(msgs.slice(0, -1));
        setTyping(true); typingRef.current = true;
        const delay = Math.min(3500, 600 + String(last.content).length * 22);
        setTimeout(() => { setMessages(msgs); setTyping(false); typingRef.current = false; }, delay);
      } else { setMessages(msgs); }
    } catch (e) { /* */ } finally { setBusy(false); }
  };
  const send = async () => { const q = text.trim(); if (!q || busy) return; setText(''); await sendContent(q); };
  const sendImage = async (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img; const max = 1000;
        if (width > max || height > max) { if (width > height) { height = Math.round(height * max / width); width = max; } else { width = Math.round(width * max / height); height = max; } }
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        c.getContext('2d')!.drawImage(img, 0, 0, width, height);
        sendContent(c.toDataURL('image/jpeg', 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (err) return <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 text-center">{err}</div>;
  if (!info) return <div className="min-h-screen flex items-center justify-center text-slate-400">Yükleniyor...</div>;
  if (!info.active) return <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 text-center">Asistan şu anda kapalı. Lütfen daha sonra tekrar deneyin.</div>;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[80vh]">
        <div className="bg-indigo-600 text-white p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"><Bot size={22} /></div>
          <div className="flex-1"><p className="font-semibold">{info.name}</p><p className="text-xs text-indigo-200">Çevrimiçi · genellikle hemen yanıtlar</p></div>
          <button onClick={() => { if (window.opener) window.close(); else window.history.length > 1 ? window.history.back() : (window.location.href = '/'); }} title="Kapat" className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center"><X size={18} /></button>
        </div>

        {!started ? (
          <div className="flex-1 overflow-y-auto p-6 text-center flex flex-col gap-3">
            <Bot size={36} className="text-indigo-500 mx-auto" />
            <p className="text-slate-600 text-sm">{info.greeting}</p>
            <div className="text-left space-y-2 mt-2">
              <p className="text-xs font-medium text-slate-500">Daha önce alışveriş yaptınız mı?</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMusteriTipi('yeni')} className={`py-2 rounded-lg text-sm border ${musteriTipi === 'yeni' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600'}`}>Yeni Müşteriyim</button>
                <button type="button" onClick={() => setMusteriTipi('mevcut')} className={`py-2 rounded-lg text-sm border ${musteriTipi === 'mevcut' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600'}`}>Mevcut Alışveriş</button>
              </div>
              <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ad Soyad *" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="Instagram kullanıcı adı" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Telefon *" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </div>
            <button onClick={start} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 mt-1">Sohbeti Başlat</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div key={m.id || i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-line ${m.role === 'user' ? 'bg-indigo-600 text-white' : m.role === 'agent' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'}`}>
                    {String(m.content).startsWith('data:image')
                      ? <img src={m.content} className="rounded-lg max-h-48" />
                      : m.content}
                    {m.role === 'agent' && <p className="text-[9px] opacity-60 mt-0.5">Yetkili</p>}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 text-slate-500 rounded-2xl px-4 py-3 text-sm">
                    <span className="inline-flex gap-1 items-center">
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      <span className="ml-1 text-xs">yazıyor...</span>
                    </span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="p-3 border-t border-slate-100 flex gap-2 items-center">
              <label className="cursor-pointer text-slate-400 hover:text-indigo-600 shrink-0" title="Fotoğraf ekle">
                <ImagePlus size={20} />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.currentTarget.value = ''; }} />
              </label>
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Mesajınızı yazın..." className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg" />
              <button onClick={send} disabled={busy} className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700 disabled:opacity-50"><Send size={18} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
