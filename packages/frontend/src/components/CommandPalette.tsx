import { useState, useEffect, useRef, useCallback, ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fireQuickAction } from '../lib/quickAction';
import {
  Zap, TrendingUp, TrendingDown, FileText, Users, ArrowLeftRight,
  DollarSign, CreditCard, Briefcase, BarChart3, FolderOpen, Calendar,
  Bell, Settings, X, ChevronRight
} from 'lucide-react';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: ReactNode;
  hint?: string;
  action: (navigate: ReturnType<typeof useNavigate>) => void;
}

const COMMANDS: Command[] = [
  {
    id: 'gelir-ekle',
    label: 'Gelir Ekle',
    description: 'Yeni gelir kalemi olustur',
    icon: <TrendingUp size={16} className="text-green-600" />,
    hint: 'Gelir & Gider',
    action: (nav) => { fireQuickAction('pending_gelirgider_action', { tip: 'gelir' }); nav('/gelir-gider'); },
  },
  {
    id: 'gider-ekle',
    label: 'Gider Ekle',
    description: 'Yeni gider kalemi olustur',
    icon: <TrendingDown size={16} className="text-red-600" />,
    hint: 'Gelir & Gider',
    action: (nav) => { fireQuickAction('pending_gelirgider_action', { tip: 'gider' }); nav('/gelir-gider'); },
  },
  {
    id: 'cek-ekle',
    label: 'Cek Ekle',
    description: 'Yeni cek kaydi olustur',
    icon: <FileText size={16} className="text-blue-600" />,
    hint: 'Cekler',
    action: (nav) => { fireQuickAction('pending_cek_action', { tip: 'alacak' }); nav('/cekler'); },
  },
  {
    id: 'cari-ekle',
    label: 'Cari Ekle',
    description: 'Yeni cari hesap olustur',
    icon: <Users size={16} className="text-purple-600" />,
    hint: 'Cari Hesaplar',
    action: (nav) => { fireQuickAction('pending_cari_action', { tip: 'yeni_cari', label: 'Yeni Cari' }); nav('/cari-hesaplar'); },
  },
  {
    id: 'alis-fatura-ekle',
    label: 'Alis Faturasi Ekle',
    description: 'Hizli alis faturasi girisi',
    icon: <TrendingDown size={16} className="text-red-600" />,
    hint: 'Cari Hesaplar',
    action: (nav) => {
      fireQuickAction('pending_cari_action', { tip: 'alis_fatura', label: 'Alis Faturasi Ekle' });
      nav('/cari-hesaplar');
    },
  },
  {
    id: 'satis-fatura-ekle',
    label: 'Satis Faturasi Ekle',
    description: 'Hizli satis faturasi girisi',
    icon: <TrendingUp size={16} className="text-green-600" />,
    hint: 'Cari Hesaplar',
    action: (nav) => {
      fireQuickAction('pending_cari_action', { tip: 'satis_fatura', label: 'Satis Faturasi Ekle' });
      nav('/cari-hesaplar');
    },
  },
  {
    id: 'odeme-yap',
    label: 'Odeme Yap',
    description: 'Cari hesaba odeme yap',
    icon: <DollarSign size={16} className="text-orange-600" />,
    hint: 'Cari Hesaplar',
    action: (nav) => {
      fireQuickAction('pending_cari_action', { tip: 'odeme', label: 'Odeme Yap' });
      nav('/cari-hesaplar');
    },
  },
  {
    id: 'tahsilat-al',
    label: 'Tahsilat Al',
    description: 'Cari hesaptan tahsilat al',
    icon: <DollarSign size={16} className="text-green-600" />,
    hint: 'Cari Hesaplar',
    action: (nav) => {
      fireQuickAction('pending_cari_action', { tip: 'tahsilat', label: 'Tahsilat Al' });
      nav('/cari-hesaplar');
    },
  },
  {
    id: 'iade-al',
    label: 'Iade Al',
    description: 'Cari hesaptan iade al',
    icon: <ArrowLeftRight size={16} className="text-indigo-600" />,
    hint: 'Cari Hesaplar',
    action: (nav) => {
      fireQuickAction('pending_cari_action', { tip: 'iade_al', label: 'Iade Al' });
      nav('/cari-hesaplar');
    },
  },
  {
    id: 'iade-ver',
    label: 'Iade Ver',
    description: 'Cari hesaba iade ver',
    icon: <ArrowLeftRight size={16} className="text-pink-600" />,
    hint: 'Cari Hesaplar',
    action: (nav) => {
      fireQuickAction('pending_cari_action', { tip: 'iade_ver', label: 'Iade Ver' });
      nav('/cari-hesaplar');
    },
  },
  {
    id: 'transfer-yap',
    label: 'Transfer Yap',
    description: 'Hesaplar arasi para transferi',
    icon: <ArrowLeftRight size={16} className="text-blue-600" />,
    hint: 'Kasa & Banka',
    action: (nav) => { fireQuickAction('pending_kasabanka_action', { tip: 'transfer' }); nav('/kasa-banka'); },
  },
  {
    id: 'fatura-ode',
    label: 'Fatura Ode',
    description: 'Fatura odemesi gerceklestir',
    icon: <CreditCard size={16} className="text-red-600" />,
    hint: 'Kasa & Banka',
    action: (nav) => { fireQuickAction('pending_kasabanka_action', { tip: 'fatura' }); nav('/kasa-banka'); },
  },
  {
    id: 'personel-maas',
    label: 'Personel Maas',
    description: 'Personel maas islemleri',
    icon: <Briefcase size={16} className="text-indigo-600" />,
    hint: 'Personel',
    action: (nav) => { fireQuickAction('pending_personel_action', { tip: 'maas' }); nav('/personel'); },
  },
  {
    id: 'rapor-gor',
    label: 'Rapor Gor',
    description: 'Finansal durum raporlari',
    icon: <BarChart3 size={16} className="text-teal-600" />,
    hint: 'Finansal Durum',
    action: (nav) => { nav('/finansal-durum'); },
  },
  {
    id: 'belgelerim',
    label: 'Belgelerim',
    description: 'Belge ve dosyalariniz',
    icon: <FolderOpen size={16} className="text-yellow-600" />,
    hint: 'Belgelerim',
    action: (nav) => { nav('/belgelerim'); },
  },
  {
    id: 'ajanda',
    label: 'Ajanda',
    description: 'Takvim ve gorevler',
    icon: <Calendar size={16} className="text-pink-600" />,
    hint: 'Ajanda',
    action: (nav) => { nav('/ajanda'); },
  },
  {
    id: 'bildirimler',
    label: 'Bildirimler',
    description: 'Tum bildirimleriniz',
    icon: <Bell size={16} className="text-orange-600" />,
    hint: 'Bildirimler',
    action: (nav) => { nav('/bildirimler'); },
  },
  {
    id: 'hareket-loglari',
    label: 'Hareket Loglari',
    description: 'Tum sistem hareketleri',
    icon: <FileText size={16} className="text-gray-600" />,
    hint: 'Hareket Loglari',
    action: (nav) => { nav('/hareket-loglari'); },
  },
  {
    id: 'ayarlar',
    label: 'Ayarlar',
    description: 'Uygulama ayarlari',
    icon: <Settings size={16} className="text-gray-600" />,
    hint: 'Ayarlar',
    action: (nav) => { nav('/ayarlar'); },
  },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ctrl+Space listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Autofocus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query.trim() === ''
    ? COMMANDS
    : COMMANDS.filter(c => {
        const normalize = (s: string) => s.toLowerCase().replace(/ı/g,'i').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/İ/g,'i').replace(/Ö/g,'o').replace(/Ü/g,'u').replace(/Ş/g,'s').replace(/Ç/g,'c').replace(/Ğ/g,'g');
        const q = normalize(query);
        return normalize(c.label).includes(q) || (c.description && normalize(c.description).includes(q)) || (c.hint && normalize(c.hint).includes(q));
      });

  const visible = filtered.slice(0, 8);

  const execute = useCallback((cmd: Command) => {
    setOpen(false);
    cmd.action(navigate);
  }, [navigate]);

  // Keyboard navigation inside palette
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      setActive(a => (a + 1) % visible.length);
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      setActive(a => (a - 1 + visible.length) % visible.length);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible[active]) execute(visible[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Reset active when filtered list changes
  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-start justify-center pt-[15vh] px-4 bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          <Zap size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ne yapmak istiyorsunuz?"
            className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors">
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-400 text-xs rounded font-mono border border-gray-200">
            Esc
          </kbd>
        </div>

        {/* Command List */}
        <div
          ref={listRef}
          className="overflow-y-auto max-h-80 py-1"
        >
          {visible.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Sonuc bulunamadi
            </div>
          ) : (
            visible.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => execute(cmd)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active === i ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${active === i ? 'bg-white shadow-sm' : 'bg-gray-100'}`}>
                  {cmd.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{cmd.label}</div>
                  {cmd.description && <div className="text-xs text-gray-400 truncate">{cmd.description}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {cmd.hint && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{cmd.hint}</span>
                  )}
                  {active === i && <ChevronRight size={14} className="text-blue-500" />}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">Tab</kbd>
            Gezin
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">Enter</kbd>
            Sec
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">Esc</kbd>
            Kapat
          </span>
          <span className="ml-auto">{visible.length} sonuc</span>
        </div>
      </div>
    </div>
  );
}
