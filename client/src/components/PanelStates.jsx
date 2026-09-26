// =============================================================================
// The four endings every panel is allowed to have: loading, empty, error,
// forbidden. A panel that renders none of these is a bug.
// =============================================================================

export function Skeleton({ rows = 4, label = 'Loading' }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-bar" style={{ width: (95 - i * 9) + '%' }} />
      ))}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', text, action }) {
  return (
    <div className="state-box">
      <div className="state-icon" aria-hidden="true">&#9675;</div>
      <p className="state-title">{title}</p>
      {text && <p className="state-text">{text}</p>}
      {action}
    </div>
  );
}

export function PanelError({ message, requestId, onRetry }) {
  return (
    <div className="state-box state-error" role="alert">
      <div className="state-icon" aria-hidden="true">!</div>
      <p className="state-title">Could not load this</p>
      <p className="state-text">{message}</p>
      {requestId && <p className="state-meta">Reference: {requestId}</p>}
      {onRetry && <button type="button" className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Forbidden({ message = 'You do not have access to this.' }) {
  return (
    <div className="state-box">
      <div className="state-icon" aria-hidden="true">&#128274;</div>
      <p className="state-title">Not available to you</p>
      <p className="state-text">{message}</p>
    </div>
  );
}

/**
 * Renders a usePanel() result, so no screen has to re-implement the four
 * endings. `children` receives the data once it is ready.
 */
export function Panel({ state, skeletonRows = 4, empty, children }) {
  if (state.status === 'loading') return <Skeleton rows={skeletonRows} />;
  if (state.status === 'error') return <PanelError message={state.message} requestId={state.requestId} onRetry={state.retry} />;
  if (state.status === 'forbidden') return <Forbidden message={state.message} />;
  if (state.status === 'empty') return empty || <EmptyState />;
  return children(state.data);
}
