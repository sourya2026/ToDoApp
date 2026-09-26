// =============================================================================
// BoardPage  -  the main screen: summary chips, filters, and the grid.
//
// Every filter, the sort and the selected project live in the URL, so Back
// restores the exact view and a filtered list can be shared or bookmarked.
// =============================================================================
import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/auth.jsx';
import { useAppData } from '../lib/appData.jsx';
import { usePanel } from '../lib/usePanel.js';
import { Panel, EmptyState } from '../components/PanelStates.jsx';
import { ItemsGrid } from '../components/ItemsGrid.jsx';
import { Chip, Spinner, useToast } from '../components/ui.jsx';
import NewItemDialog from '../components/NewItemDialog.jsx';
import ImportDialog from '../components/ImportDialog.jsx';
import ItemDetailPanel from '../components/ItemDetailPanel.jsx';
import { exportItems, exportWithFullHistory } from '../lib/excel.js';

/** Read and write the view state that lives in the query string. */
function useViewState() {
  const [params, setParams] = useSearchParams();

  const state = {
    project: params.get('project') || 'all',
    status: params.get('status') || '',
    priority: params.get('priority') || '',
    owner: params.get('owner') || '',
    mine: params.get('mine') === 'true',
    q: params.get('q') || '',
    hideDone: params.get('hideDone') === 'true',
    sort: params.get('sort') || 'updatedAt',
    dir: params.get('dir') || 'desc',
  };

  const set = useCallback((patch, { replace = true } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === '' || v === false || v === null || v === undefined) next.delete(k);
        else next.set(k, String(v));
      });
      return next;
    }, { replace });
  }, [setParams]);

  /** Toggle one value inside a comma-separated filter (the chips). */
  const toggleIn = useCallback((key, value) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      const current = (next.get(key) || '').split(',').filter(Boolean);
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length) next.set(key, updated.join(','));
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);

  const clearAll = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams();
      // Keep the project; clearing filters should not throw away the context.
      if (prev.get('project')) next.set('project', prev.get('project'));
      return next;
    }, { replace: true });
  }, [setParams]);

  const activeCount = ['status', 'priority', 'owner', 'q']
    .filter((k) => params.get(k)).length + (state.mine ? 1 : 0) + (state.hideDone ? 1 : 0);

  return { ...state, set, toggleIn, clearAll, activeCount };
}

// --------------------------------------------------------------- chips -----
function SummaryChips({ summary, view }) {
  const { lists, statusColor, priorityColor } = useAppData();
  const selectedStatus = view.status.split(',').filter(Boolean);
  const selectedPriority = view.priority.split(',').filter(Boolean);

  // Only offer values that exist in the config; counts come from the server.
  const statuses = lists.statuses.filter((s) => (summary.byStatus[s.label] || 0) > 0 || selectedStatus.includes(s.label));
  const priorities = lists.priorities.filter((p) => (summary.byPriority[p.label] || 0) > 0 || selectedPriority.includes(p.label));

  if (!statuses.length && !priorities.length) return null;

  return (
    <div className="chips">
      <div className="chip-group">
        <span className="chip-group-label">Priority</span>
        {priorities.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            count={summary.byPriority[p.label] || 0}
            color={priorityColor(p.label)}
            active={selectedPriority.includes(p.label)}
            onClick={() => view.toggleIn('priority', p.label)}
          />
        ))}
      </div>
      <div className="chip-group">
        <span className="chip-group-label">Status</span>
        {statuses.map((s) => (
          <Chip
            key={s.id}
            label={s.label}
            count={summary.byStatus[s.label] || 0}
            color={statusColor(s.label)}
            active={selectedStatus.includes(s.label)}
            onClick={() => view.toggleIn('status', s.label)}
          />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- filters -----
function FiltersBar({ view, total }) {
  const { activeUsers } = useAppData();

  return (
    <div className="filters">
      <input
        type="search"
        className="input search-input"
        placeholder="Search ticket number, title or comments"
        value={view.q}
        onChange={(e) => view.set({ q: e.target.value })}
        aria-label="Search"
      />

      <select className="input" value={view.owner} onChange={(e) => view.set({ owner: e.target.value })} aria-label="Owner">
        <option value="">All owners</option>
        {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>

      <label className="switch">
        <input type="checkbox" checked={view.mine} onChange={(e) => view.set({ mine: e.target.checked })} />
        <span>Assigned to me</span>
      </label>

      <label className="switch">
        <input type="checkbox" checked={view.hideDone} onChange={(e) => view.set({ hideDone: e.target.checked })} />
        <span>Hide done</span>
      </label>

      <span className="filters-spacer" />
      <span className="result-count">{total} {total === 1 ? 'item' : 'items'}</span>
      {view.activeCount > 0 && (
        <button type="button" className="btn btn-quiet" onClick={view.clearAll}>
          Clear filters ({view.activeCount})
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the page -----
export default function BoardPage() {
  const view = useViewState();
  const { user, can, isAdmin } = useSession();
  const { projectsById, projects, reload: reloadAppData } = useAppData();
  const toast = useToast();
  const { itemId } = useParams();

  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => ({
    projectId: view.project,
    status: view.status,
    priority: view.priority,
    ownerId: view.owner,
    mine: view.mine,
    q: view.q,
    hideDone: view.hideDone,
    sort: view.sort,
    dir: view.dir,
  }), [view.project, view.status, view.priority, view.owner, view.mine, view.q, view.hideDone, view.sort, view.dir]);

  const panel = usePanel(
    (signal) => api.items(query, { signal }).then((r) => r.data),
    [JSON.stringify(query)],
    { allowEmpty: true }, // an empty result is a legitimate answer, not "no data"
  );

  const project = view.project === 'all' ? null : projectsById.get(view.project);

  // The dialog carries its own project picker, so the button is offered
  // whenever there is at least one active project this user may add to.
  const canCreate = projects.some((p) => can('item.create', {
    project: { id: p.id, active: p.active, assignedUserIds: p.assignedUserIds },
  }));

  const onSort = (key) => {
    // Same column toggles direction; a new column starts descending.
    if (view.sort === key) view.set({ dir: view.dir === 'asc' ? 'desc' : 'asc' });
    else view.set({ sort: key, dir: 'desc' });
  };

  async function handleExport(withHistory) {
    const items = panel.data?.items || [];
    if (!items.length) { toast.info('There is nothing in this view to export'); return; }
    setExporting(true);
    try {
      if (!withHistory) {
        await exportItems(items);
        toast.success('Exported ' + items.length + ' items');
      } else {
        // Pull every item's full history, then write the two-sheet workbook.
        const byItem = {};
        for (const item of items) {
          const { data } = await api.comments(item.id);
          byItem[item.id] = data;
        }
        await exportWithFullHistory(items, byItem);
        toast.success('Exported ' + items.length + ' items with full comment history');
      }
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="board">
      <div className="board-head">
        <div>
          <h1 className="page-title">{project ? project.name : 'All my projects'}</h1>
          {project && <p className="page-sub">{project.client}{project.active ? '' : ' - archived'}</p>}
        </div>
        <div className="board-actions">
          <button type="button" className="btn" disabled={exporting} onClick={() => handleExport(false)}>
            {exporting ? <Spinner small /> : null} Export
          </button>
          <button type="button" className="btn" disabled={exporting} onClick={() => handleExport(true)}>
            Export + history
          </button>
          {isAdmin && <button type="button" className="btn" onClick={() => setShowImport(true)}>Import</button>}
          <button type="button" className="btn btn-primary" disabled={!canCreate}
            title={canCreate ? 'Add a new item' : 'You are not assigned to an active project yet'}
            onClick={() => setShowNew(true)}>
            New item
          </button>
        </div>
      </div>

      {panel.status === 'ready' && <SummaryChips summary={panel.data.summary} view={view} />}
      <FiltersBar view={view} total={panel.data?.total ?? 0} />

      <Panel state={panel} skeletonRows={8}>
        {(data) => (data.items.length === 0 ? (
          <EmptyState
            title="No items match this view"
            text={view.activeCount ? 'Try clearing the filters.' : 'Create the first item for this project.'}
            action={view.activeCount
              ? <button type="button" className="btn" onClick={view.clearAll}>Clear filters</button>
              : (canCreate ? <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>New item</button> : null)}
          />
        ) : (
          <ItemsGrid
            items={data.items}
            sort={view.sort}
            dir={view.dir}
            onSort={onSort}
            grouped={view.project === 'all'}
            selectedId={itemId}
          />
        ))}
      </Panel>

      {/* /items/:id renders this same page with the panel open, so the detail
          URL loads directly, survives a refresh and can be shared. */}
      {itemId && <ItemDetailPanel itemId={itemId} onChanged={panel.reload} />}

      <NewItemDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        projectId={view.project}
        onCreated={() => { setShowNew(false); panel.reload(); toast.success('Item created'); }}
      />

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => { panel.reload(); reloadAppData(); }}
      />
    </div>
  );
}
