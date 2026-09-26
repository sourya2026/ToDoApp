// =============================================================================
// Small shared UI pieces: badges, modal, confirm, toasts, spinner.
// =============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// ---------------------------------------------------------------- badges ----
/** Colour comes from the stored list config, never from a hard-coded map. */
export function Badge({ label, color, muted }) {
  if (!label) return <span className="muted">-</span>;
  return (
    <span className={'badge' + (muted ? ' badge-muted' : '')}
      style={muted ? undefined : { '--badge-color': color }}>
      {label}
    </span>
  );
}

export function Chip({ label, count, active, color, onClick, title }) {
  return (
    <button
      type="button"
      className={'chip' + (active ? ' chip-active' : '') + (count === 0 ? ' chip-zero' : '')}
      style={{ '--chip-color': color || '#64748b' }}
      onClick={onClick}
      title={title || label}
      aria-pressed={active}
    >
      <span className="chip-label">{label}</span>
      <span className="chip-count">{count}</span>
    </button>
  );
}

export function Spinner({ small }) {
  return <span className={'spinner' + (small ? ' spinner-sm' : '')} aria-hidden="true" />;
}

// ----------------------------------------------------------------- modal ----
export function Modal({ open, title, onClose, children, footer, wide }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Move focus into the dialog so keyboard users are not left behind it.
    const timer = setTimeout(() => ref.current?.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(timer); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true"
        aria-label={title} tabIndex={-1} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">&#10005;</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** Confirm before anything destructive - nothing is deleted on a single click. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel, busy }) {
  return (
    <Modal open={open} title={title} onClose={busy ? () => {} : onCancel}
      footer={(
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Spinner small />} {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="confirm-text">{message}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- toasts ----
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, kind = 'info', ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    if (ms) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
    return id;
  }, []);

  const value = useMemo(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error', 8000),
    info: (m) => push(m, 'info'),
    dismiss: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast toast-' + t.kind}>
            <span>{t.message}</span>
            <button type="button" className="icon-btn" onClick={() => value.dismiss(t.id)} aria-label="Dismiss">&#10005;</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

// ----------------------------------------------------------- form fields ----
export function Field({ label, hint, error, children, required }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}{required && <span className="req" aria-hidden="true"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

/** A checkbox list for assigning several people at once. */
export function MultiSelect({ options, selected, onChange, emptyText = 'No options' }) {
  const set = new Set(selected);
  if (!options.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="multiselect">
      {options.map((o) => (
        <label key={o.id} className="multiselect-row">
          <input
            type="checkbox"
            checked={set.has(o.id)}
            onChange={(e) => {
              const next = new Set(set);
              if (e.target.checked) next.add(o.id); else next.delete(o.id);
              onChange([...next]);
            }}
          />
          <span>{o.label ?? o.name}</span>
          {o.active === false && <span className="tag tag-muted">inactive</span>}
        </label>
      ))}
    </div>
  );
}

/** Copy-to-clipboard for a business id (NAV-13). */
export function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="icon-btn copy-btn"
      title={'Copy ' + value}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(String(value));
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch { /* clipboard blocked - the value is on screen anyway */ }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}
