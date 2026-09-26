// =============================================================================
// Admin > Lists  -  the statuses and priorities every dropdown is built from.
// Also holds "Reset demo data", which is admin-only.
// =============================================================================
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useSession } from '../../lib/auth.jsx';
import { useAppData } from '../../lib/appData.jsx';
import { Badge, Field, Modal, Spinner, ConfirmDialog, useToast } from '../../components/ui.jsx';
import { Skeleton, PanelError } from '../../components/PanelStates.jsx';
import { LIST_KIND } from '@todo/shared';

function ListEditor({ kind, title, values, onChanged }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#64748b');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(null);

  async function run(action, successMessage) {
    setBusy(true);
    try {
      const result = await action();
      await onChanged();
      if (result && result.warning) toast.info(result.warning);
      else toast.success(successMessage);
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      setBusy(true);
      await api.createListValue({ kind, label, color });
      await onChanged();
      setAdding(false);
      setLabel('');
      toast.success('Added');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /** Move one value up or down and persist the whole order in one call. */
  async function move(index, delta) {
    const next = [...values];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await run(() => api.reorderList(kind, next.map((v) => v.id)), 'Order saved');
  }

  return (
    <section className="list-editor">
      <div className="board-head">
        <h2 className="section-title">{title}</h2>
        <button type="button" className="btn" onClick={() => { setAdding(true); setError(''); }}>Add value</button>
      </div>

      <ul className="value-list">
        {values.map((v, i) => (
          <li key={v.id} className={'value-row' + (v.active ? '' : ' value-inactive')}>
            <span className="value-order">{i + 1}</span>
            <Badge label={v.label} color={v.color} muted={!v.active} />
            <input type="color" className="color-input" value={v.color} disabled={busy}
              onChange={(e) => run(() => api.updateListValue(v.id, { color: e.target.value }), 'Colour saved')}
              aria-label={'Colour for ' + v.label} />
            <span className="filters-spacer" />
            <button type="button" className="btn btn-quiet btn-xs" disabled={busy || i === 0} onClick={() => move(i, -1)}>Up</button>
            <button type="button" className="btn btn-quiet btn-xs" disabled={busy || i === values.length - 1} onClick={() => move(i, 1)}>Down</button>
            <button type="button" className="btn btn-quiet btn-xs" disabled={busy}
              onClick={() => setRenaming(v)}>Rename</button>
            <button type="button" className="btn btn-quiet btn-xs" disabled={busy}
              onClick={() => run(() => api.updateListValue(v.id, { active: !v.active }),
                v.active ? 'Hidden from dropdowns' : 'Back in dropdowns')}>
              {v.active ? 'Deactivate' : 'Activate'}
            </button>
          </li>
        ))}
      </ul>

      <Modal open={adding} title={'Add a ' + title.toLowerCase().replace(/e?s$/, '')} onClose={() => setAdding(false)}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => setAdding(false)} disabled={busy}>Cancel</button>
            <button type="submit" form={'add-' + kind} className="btn btn-primary" disabled={busy || !label.trim()}>
              {busy && <Spinner small />} Add
            </button>
          </>
        )}>
        <form id={'add-' + kind} onSubmit={add} className="form-stack">
          <Field label="Label" required>
            <input className="input" required value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Colour">
            <input type="color" className="color-input" value={color} onChange={(e) => setColor(e.target.value)} />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </Modal>

      <Modal open={Boolean(renaming)} title="Rename value" onClose={() => setRenaming(null)}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => setRenaming(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy}
              onClick={async () => {
                const ok = await run(() => api.updateListValue(renaming.id, { label: renaming.label }), 'Renamed');
                if (ok) setRenaming(null);
              }}>
              {busy && <Spinner small />} Rename
            </button>
          </>
        )}>
        <p className="state-text">Existing items carrying this value are updated to the new name, so nothing is orphaned.</p>
        <Field label="Label" required>
          <input className="input" value={renaming ? renaming.label : ''}
            onChange={(e) => setRenaming({ ...renaming, label: e.target.value })} />
        </Field>
      </Modal>
    </section>
  );
}

export default function ListsAdmin() {
  const { adoptSession } = useSession();
  const appData = useAppData();
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [all, setAll] = useState(null);

  // Admins need to see deactivated values too, so they can bring one back.
  const load = useCallback(async () => {
    const { data } = await api.lists(true);
    setAll(data);
    await appData.reload();
    // appData.reload is stable; leaving it out keeps this from re-running forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load().catch(() => setAll('error')); }, [load]);

  async function resetDemo() {
    setResetting(true);
    try {
      const { data } = await api.resetDemo();
      // The reset rebuilt every account, so take the fresh token it returned
      // rather than dropping the admin on an "expired session" screen.
      if (data.token) adoptSession(data.token, data.user);
      await load();
      toast.success('Demo data rebuilt: ' + data.counts.items + ' items, ' + data.counts.comments + ' comments');
      setConfirmReset(false);
    } catch (err) {
      toast.error('Reset failed: ' + err.message);
    } finally {
      setResetting(false);
    }
  }

  if (all === 'error') return <PanelError message="Could not load the lists." onRetry={load} />;
  if (!all) return <Skeleton rows={6} />;

  return (
    <div className="admin-page">
      <div className="board-head">
        <div>
          <h1 className="page-title">Dropdown lists</h1>
          <p className="page-sub">
            Every status and priority dropdown in the app is built from these values.
            Deactivating one hides it from new entries; items already using it keep it.
          </p>
        </div>
      </div>

      <div className="two-col">
        <ListEditor kind={LIST_KIND.PRIORITY} title="Priorities" values={all.priorities} onChanged={load} />
        <ListEditor kind={LIST_KIND.STATUS} title="Statuses" values={all.statuses} onChanged={load} />
      </div>

      <section className="danger-zone">
        <h2 className="section-title">Reset demo data</h2>
        <p className="state-text">
          Deletes every project, item, comment and audit entry, then rebuilds the sample data
          and the four demo accounts. There is no undo.
        </p>
        <button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}>
          Reset demo data
        </button>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all data?"
        message="Every project, item, comment and audit entry is deleted and replaced with the sample data. This cannot be undone."
        confirmLabel="Delete everything and reseed"
        busy={resetting}
        onCancel={() => setConfirmReset(false)}
        onConfirm={resetDemo}
      />
    </div>
  );
}
