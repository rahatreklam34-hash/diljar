import { useState, useEffect } from 'react';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export default function MoneyInput({ value, onChange, placeholder = '0,00', required, className = '', autoFocus }: MoneyInputProps) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    if (value) {
      const num = Number(value);
      if (!isNaN(num) && num > 0) {
        setDisplay(formatDisplay(value));
      }
    } else {
      setDisplay('');
    }
  }, [value]);

  const formatDisplay = (val: string) => {
    const num = Number(val);
    if (isNaN(num)) return val;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;
    // Remove dots (thousand separator), replace comma with dot for internal value
    raw = raw.replace(/\./g, '').replace(',', '.');
    // Only allow numbers and one decimal point
    if (raw === '' || raw === '.') {
      onChange('');
      setDisplay('');
      return;
    }
    const match = raw.match(/^(\d+)(\.(\d{0,2})?)?$/);
    if (match) {
      onChange(raw);
      // Format with thousand separator for display
      const parts = raw.split('.');
      const intPart = parseInt(parts[0] || '0').toLocaleString('tr-TR');
      const decPart = parts[1] !== undefined ? ',' + parts[1] : '';
      setDisplay(intPart + decPart);
    }
  };

  const handleBlur = () => {
    if (value) {
      const num = Number(value);
      if (!isNaN(num)) {
        setDisplay(num.toLocaleString('tr-TR', { minimumFractionDigits: num % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 }));
      }
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      required={required}
      autoFocus={autoFocus}
      className={className || 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none'}
    />
  );
}
