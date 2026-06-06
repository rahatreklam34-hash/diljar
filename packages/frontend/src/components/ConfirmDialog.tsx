import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Sil butonu varsayilan fokus
    const t = window.setTimeout(() => confirmRef.current?.focus(), 30);

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter') {
        // Enter her zaman onaylar (Sil)
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
        onClose();
      } else if (e.key === 'Tab') {
        // Sadece iki buton arasinda don
        e.preventDefault();
        const active = document.activeElement;
        if (active === confirmRef.current) {
          (confirmRef.current?.previousElementSibling as HTMLElement)?.focus();
        } else {
          confirmRef.current?.focus();
        }
      }
      // Space: fokuslu butonu tetikler (taraycinin varsayilan davranisi),
      // Sil varsayilan fokuslu oldugu icin Space ile Sil onaylanir.
    };
    window.addEventListener('keydown', handler, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', handler, true);
    };
  }, [isOpen, onClose, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Iptal
          </button>
          <button
            ref={confirmRef}
            onClick={() => { onConfirm(); onClose(); }}
            className="px-4 py-2 bg-red-500 text-white hover:bg-red-600 rounded-lg transition-colors ring-offset-2 focus:ring-2 focus:ring-red-400 focus:outline-none"
          >
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}
