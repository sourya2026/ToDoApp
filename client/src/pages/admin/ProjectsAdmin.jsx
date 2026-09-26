// =============================================================================
// Admin > Projects  -  add, edit, archive, assign employees.
// =============================================================================
import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useAppData } from '../../lib/appData.jsx';
import { usePanel } from '../../lib/usePanel.js';
import { Panel, EmptyState } from '../../components/PanelStates.jsx';
import { Modal, Field, MultiSelect, Spinner, ConfirmDialog, useToast } from '../../components/ui.jsx';
import { RecordLink } from '../../components/RecordLink.jsx';
import { formatDate } from '../../lib/format.js';

const blank = { name: '', client: '', description: '', assignedUserIds: [], active: true };

export default function ProjectsAdmin() {
  const { users, reload: reloadAppData } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [archiving, setArchiving] = useState(null);

  const panel = usePanel((signal) => api.projects({ signal }).then((r) => r.data), [], { allowEmpty: true });

  const open = (project) => {
    setEditing(project || 'new');
    setForm(project ? {
      name: project.name, client: project.client, description: project.description,
      assignedUserIds: project.assignedUserIds, active: project.active,
    } : blank);
    setError('');
  };

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') await api.createProject(form);
      else await api.updateProject(editing.id, form);
      setEditing(null);
      panel.reload();
      reloadAppData();
      toast.success('Project saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    setBusy(true);
    try {
      await api.updateProject(archiving.id, { active: !archiving.active });
      setArchiving(null);
      panel.reload();
      reloadAppData();
      toast.success(archiving.active ? 'Project archived' : 'Project restored');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="board-head">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-sub">Archived projects keep their items and history; they just leave the working set.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => open(null)}>New project</button>
      </div>

      <Panel state={panel} skeletonRows={4}
        empty={<EmptyState title="No projects yet" action={<button type="button" className="btn btn-primary" onClick={() => open(null)}>Create the first project</button>} />}>
        {(projects) => (
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr><th>Project</th><th>Client</th><th>Assigned</th><th>Items</th><th>Created</th><th>Status</th><th className="cell-actions">Actions</th></tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className={'grid-row' + (p.active ? '' : ' row-done')}>
                    <td><RecordLink type="project" id={p.id}>{p.name}</RecordLink></td>
                    <td>{p.client || <span className="muted">-</span>}</td>
                    <td>{p.assigned.length ? p.assigned.map((a) => a.label).join(', ') : <span className="muted">Nobody</span>}</td>
                    <td>{p.itemCount}</td>
                    <td>{formatDate(p.createdAt)}</td>
                    <td>{p.active ? <span className="tag tag-ok">active</span> : <span className="tag tag-muted">archived</span>}</td>
                    <td className="cell-actions">
                      <button type="button" className="btn btn-quiet btn-xs" onClick={() => open(p)}>Edit</button>
                      <button type="button" className="btn btn-quiet btn-xs" onClick={() => setArchiving(p)}>
                        {p.active ? 'Archive' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={Boolean(editing)} title={editing === 'new' ? 'New project' : 'Edit project'}
        onClose={() => setEditing(null)}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button type="submit" form="project-form" className="btn btn-primary" disabled={busy}>
              {busy && <Spinner small />} Save project
            </button>
          </>
        )}>
        <form id="project-form" onSubmit={save} className="form-stack">
          <Field label="Name" required>
            <input className="input" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="NTT SOHAR" />
          </Field>
          <Field label="Client / company">
            <input className="input" value={form.client}
              onChange={(e) => setForm({ ...form, client: e.target.value })} />
          </Field>
          <Field label="Description">
            <textarea className="input textarea" rows={3} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Assigned employees" hint="Employees only see projects they are assigned to">
            <MultiSelect
              options={users.map((u) => ({ id: u.id, label: u.name, active: u.active }))}
              selected={form.assignedUserIds}
              onChange={(ids) => setForm({ ...form, assignedUserIds: ids })}
            />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiving)}
        title={archiving && archiving.active ? 'Archive this project?' : 'Restore this project?'}
        message={archiving && archiving.active
          ? 'Its ' + archiving.itemCount + ' item(s) stay in the database and remain readable, but no new items can be added.'
          : 'The project becomes active again and items can be added.'}
        confirmLabel={archiving && archiving.active ? 'Archive' : 'Restore'}
        busy={busy}
        onCancel={() => setArchiving(null)}
        onConfirm={toggleArchive}
      />
    </div>
  );
}
