// =============================================================================
// NewItemDialog  -  create a ticket.
// Every dropdown is filled from the stored config, never from a literal.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../lib/auth.jsx';
import { useAppData } from '../lib/appData.jsx';
import { Modal, Field, Spinner, useToast } from './ui.jsx';
import { SECONDARY_KIND } from '@todo/shared';

export default function NewItemDialog({ open, onClose, projectId, onCreated }) {
  const { user, can } = useSession();
  const { lists, activeUsers, projects } = useAppData();
  const toast = useToast();

  // Only active projects this user may add to.
  const targets = useMemo(() => projects.filter((p) => p.active && can('item.create', {
    project: { id: p.id, active: p.active, assignedUserIds: p.assignedUserIds },
  })), [projects, can]);

  const blank = () => ({
    projectId: targets.some((p) => p.id === projectId) ? projectId : (targets[0]?.id || ''),
    ticketNumber: '',
    title: '',
    priority: lists.priorities.find((p) => p.label === 'Medium')?.label || lists.priorities[0]?.label || '',
    status: lists.statuses[0]?.label || '',
    ownerId: user.id,
    secondaryKind: SECONDARY_KIND.TEAM,
    secondaryUserId: '',
    dueDate: '',
  });

  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reset each time the dialog opens, so a cancelled draft is not resurrected.
  useEffect(() => { if (open) { setForm(blank()); setError(''); } }, [open]);

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.createItem({
        ...form,
        secondaryUserId: form.secondaryKind === SECONDARY_KIND.USER ? form.secondaryUserId : null,
        dueDate: form.dueDate || null,
      });
      onCreated(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!targets.length && open) {
    return (
      <Modal open={open} title="New item" onClose={onClose}>
        <p className="state-text">
          You are not assigned to an active project yet, so there is nowhere to add an item.
          Ask an admin to assign you to a project.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="New item"
      onClose={busy ? () => {} : onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="new-item-form" className="btn btn-primary" disabled={busy}>
            {busy && <Spinner small />} Create item
          </button>
        </>
      )}
    >
      <form id="new-item-form" onSubmit={submit} className="form-grid">
        <Field label="Project" required>
          <select className="input" value={form.projectId} required
            onChange={(e) => update({ projectId: e.target.value })}>
            {targets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field label="Ticket No" required hint="Must be unique within the project">
          <input className="input" value={form.ticketNumber} required
            onChange={(e) => update({ ticketNumber: e.target.value })} placeholder="8000001046" />
        </Field>

        <Field label="Title" required className="span-2">
          <input className="input" value={form.title} required
            onChange={(e) => update({ title: e.target.value })} placeholder="Short description of the ticket" />
        </Field>

        <Field label="Priority" required>
          <select className="input" value={form.priority} onChange={(e) => update({ priority: e.target.value })}>
            {lists.priorities.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
          </select>
        </Field>

        <Field label="Status" required>
          <select className="input" value={form.status} onChange={(e) => update({ status: e.target.value })}>
            {lists.statuses.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
          </select>
        </Field>

        <Field label="Owner" required>
          <select className="input" value={form.ownerId} onChange={(e) => update({ ownerId: e.target.value })}>
            {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>

        <Field label="Secondary">
          <div className="inline-pair">
            <select className="input" value={form.secondaryKind}
              onChange={(e) => update({ secondaryKind: e.target.value })}>
              <option value={SECONDARY_KIND.TEAM}>Team</option>
              <option value={SECONDARY_KIND.USER}>Person</option>
              <option value={SECONDARY_KIND.NONE}>None</option>
            </select>
            {form.secondaryKind === SECONDARY_KIND.USER && (
              <select className="input" value={form.secondaryUserId} required
                onChange={(e) => update({ secondaryUserId: e.target.value })}>
                <option value="">Choose...</option>
                {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </div>
        </Field>

        <Field label="Due date" hint="Optional">
          <input type="date" className="input" value={form.dueDate}
            onChange={(e) => update({ dueDate: e.target.value })} />
        </Field>

        {error && <p className="form-error span-2" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
