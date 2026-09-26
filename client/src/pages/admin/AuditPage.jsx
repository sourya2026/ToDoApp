// =============================================================================
// Admin > Audit  -  the global change log, filtered by project, person and date.
// Every row links to the item it changed, so the log is a way in, not a dead end.
// =============================================================================
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAppData } from '../../lib/appData.jsx';
import { usePanel } from '../../lib/usePanel.js';
import { Panel, EmptyState } from '../../components/PanelStates.jsx';
import { Ref, RecordLink } from '../../components/RecordLink.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function AuditPage() {
  const [params, setParams] = useSearchParams();
  const { projects, users } = useAppData();

  const filters = {
    projectId: params.get('projectId') || 'all',
    changedBy: params.get('changedBy') || 'all',
    from: params.get('from') || '',
    to: params.get('to') || '',
  };

  const set = (patch) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    Object.entries(patch).forEach(([k, v]) => {
      if (!v || v === 'all') next.delete(k); else next.set(k, v);
    });
    return next;
  }, { replace: true });

  const query = useMemo(() => filters, [params.toString()]);

  const panel = usePanel(
    (signal) => api.audit(query, { signal }).then((r) => r.data),
    [params.toString()],
    { allowEmpty: true },
  );

  const hasFilters = ['projectId', 'changedBy', 'from', 'to'].some((k) => params.get(k));

  return (
    <div className="admin-page">
      <div className="board-head">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="page-sub">Every field change on every item, oldest value to newest.</p>
        </div>
      </div>

      <div className="filters">
        <select className="input" value={filters.projectId} aria-label="Project"
          onChange={(e) => set({ projectId: e.target.value })}>
          <option value="all">All projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <select className="input" value={filters.changedBy} aria-label="Changed by"
          onChange={(e) => set({ changedBy: e.target.value })}>
          <option value="all">Anyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        <label className="inline-label">
          From <input type="date" className="input" value={filters.from}
            onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="inline-label">
          To <input type="date" className="input" value={filters.to}
            onChange={(e) => set({ to: e.target.value })} />
        </label>

        <span className="filters-spacer" />
        {hasFilters && (
          <button type="button" className="btn btn-quiet" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Clear filters
          </button>
        )}
      </div>

      <Panel state={panel} skeletonRows={8}>
        {(rows) => (rows.length === 0
          ? <EmptyState title="No changes match this filter"
              text={hasFilters ? 'Try widening the date range.' : 'Changes will appear here as people update items.'} />
          : (
            <div className="grid-scroll">
              <table className="grid">
                <thead>
                  <tr><th style={{ width: '150px' }}>When</th><th style={{ width: '110px' }}>Who</th>
                    <th style={{ width: '140px' }}>Project</th><th style={{ width: '220px' }}>Item</th>
                    <th style={{ width: '130px' }}>Field</th><th>Change</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="grid-row">
                      <td>{formatDateTime(r.at)}</td>
                      <td>{r.changedBy ? r.changedBy.label : <span className="muted">Unknown</span>}</td>
                      <td><Ref reference={r.project} fallback="-" /></td>
                      <td>
                        {r.item
                          ? <RecordLink type="item" id={r.item.id}>{r.item.label}</RecordLink>
                          : <span className="muted">(deleted)</span>}
                      </td>
                      <td>{r.fieldLabel}</td>
                      <td className="cell-change">
                        {r.field === 'created' ? (
                          <span className="audit-new">{r.newValue}</span>
                        ) : (
                          <>
                            <span className="audit-old">{r.oldValue}</span>
                            <span className="audit-arrow" aria-hidden="true"> &rarr; </span>
                            <span className="audit-new">{r.newValue}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </Panel>
    </div>
  );
}
