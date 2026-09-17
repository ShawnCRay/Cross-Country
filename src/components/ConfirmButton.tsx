import { useState, type ReactNode } from 'react';

interface Props {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
}

/** Two-tap destructive button: first tap asks, second tap confirms. */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirm?', className = 'btn danger' }: Props) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="confirm-group">
        <button type="button" className="btn danger" onClick={() => { setArmed(false); onConfirm(); }}>
          {confirmLabel}
        </button>
        <button type="button" className="btn" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={className} onClick={() => setArmed(true)}>
      {children}
    </button>
  );
}
