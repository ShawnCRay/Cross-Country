import { useState } from 'react';
import { formatMs, parseTime } from '../lib/time';

interface Props {
  valueMs: number | undefined;
  onChange: (ms: number | undefined) => void;
  placeholder?: string;
  className?: string;
  hundredths?: boolean;
}

/** Text field that accepts m:ss, m:ss.t, or h:mm:ss and commits on blur / Enter. */
export function TimeInput({ valueMs, onChange, placeholder = 'm:ss', className = '', hundredths }: Props) {
  const display = valueMs == null ? '' : formatMs(valueMs, hundredths ? { hundredths: true } : { tenths: valueMs % 1000 !== 0 });
  const [text, setText] = useState(display);
  const [invalid, setInvalid] = useState(false);
  const [lastDisplay, setLastDisplay] = useState(display);
  if (display !== lastDisplay) {
    setLastDisplay(display);
    setText(display);
    setInvalid(false);
  }

  const commit = () => {
    if (text.trim() === '') {
      setInvalid(false);
      if (valueMs != null) onChange(undefined);
      return;
    }
    const ms = parseTime(text);
    if (ms == null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (ms !== valueMs) onChange(ms);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      className={`time-input ${invalid ? 'invalid' : ''} ${className}`}
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
