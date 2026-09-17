import { useState } from 'react';

interface Props {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  placeholder?: string;
  className?: string;
}

/** Numeric field that commits on blur / Enter so typing doesn't thrash the store. */
export function NumberInput({ value, onChange, step = 0.01, min = 0, placeholder, className = '' }: Props) {
  const display = value == null ? '' : String(value);
  const [text, setText] = useState(display);
  const [lastDisplay, setLastDisplay] = useState(display);
  if (display !== lastDisplay) {
    setLastDisplay(display);
    setText(display);
  }

  const commit = () => {
    if (text.trim() === '') {
      if (value != null) onChange(undefined);
      return;
    }
    const n = parseFloat(text);
    if (!Number.isFinite(n)) {
      setText(display);
      return;
    }
    if (n !== value) onChange(n);
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      className={className}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
