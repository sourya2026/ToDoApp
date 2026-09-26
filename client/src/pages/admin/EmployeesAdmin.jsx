// =============================================================================
// Admin > Employees  -  add, edit, deactivate. Never hard-delete, so every
// comment and audit row keeps a real author.
// =============================================================================
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useSession } from '../../lib/auth.jsx';
import { useAppData } from '../../lib/appData.jsx';
import { usePanel } from '../../lib/usePanel.js';
import { Panel } from '../../components/PanelStates.jsx';
import { Modal, Field, Spinner, ConfirmDialog, useToast } from '../../components/ui.jsx';
import { formatDate, initials } from '../../lib/format.js';

const blank = { name: '', pin: '', role: 'EMPLOYEE' };

export default function EmployeesAdmin() {
  const { user } = useSession();
  const { projects, reload: reloadAppData } = useAppData();
  const toast = useToast();
  const [params] = useSearchParams();
  const focusId = params.get('focus');

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState(null);

  const panel = usePanel((signal) => api.users(true, { signal }).then((r) => r.data), []);

  const projectsFor = (id) => projects.filter((p) => p.assignedUserIds.includes(id));

  const open = (employee) => {
    setEditing(employee || 'new');
    setForm(employee ? { name: employee.name, pin: '', role: employee.role } : blank);
    setError('');
  };

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing === 'new') {
        await api.createUser(form);
      } else {
        const payload = { name: form.name, role: form.role };
        if (form.pin) payload.pin = form.pin; // blank means "leave the PIN alone"
        await api.updateUser(editing.id, payload);
      }
      setEditing(null);
      panel.reload();
      reloadAppData();
      toast.success('Employee saved');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      await api.updateUser(toggling.id, { active: !toggling.active });
      setToggling(null);
      panel.reload();
      reloadAppData();
      toast.success('Employee updated');
    } catch (err) {
      toast.error(err.message);
      setToggling(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="board-head">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-sub">Deactivating keeps every comment and audit entry they authored.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => open(null)}>New employee</button>
      </div>

      <Panel state={panel} skeletonRows={4}>
        {(employees) => (
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Projects</th><th>Added</th><th>Status</th><th className="cell-actions">Actions</th></tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}
                    className={'grid-row' + (e.active ? '' : ' row-done') + (e.id === focusId ? ' row-selected' : '')}>
                    <td>
                      <span className="who">
                        <span className="avatar avatar-sm">{initials(e.name)}</span>
                        <span>{e.name}{e.id === user.id ? ' (you)' : ''}</span>
                      </span>
                    </td>
                    <td><span className={'role-badge role-' + e.role.toLowerCase()}>{e.role}</span></td>
                    <td>
                      {projectsFor(e.id).length
                        ? projectsFor(e.id).map((p) => p.name).join(', ')
                        : <span className="muted">None</span>}
                    </td>
                    <td>{formatDate(e.createdAt)}</td>
                    <td>{e.active ? <span className="tag tag-ok">active</span> : <span className="tag tag-muted">inactive</span>}</td>
                    <td className="cell-actions">
                      <button type="button" className="btn btn-quiet btn-xs" onClick={() => open(e)}>Edit</button>
                      <button type="button" className="btn btn-quiet btn-xs" onClick={() => setToggling(e)}>
                        {e.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={Boolean(editing)} title={editing === 'new' ? 'New employee' : 'Edit employee'}
        onClose={() => setEditing(null)}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button type="submit" form="employee-form" className="btn btn-primary" disabled={busy}>
              {busy && <Spinner small />} Save
            </button>
          </>
        )}>
        <form id="employee-form" onSubmit={save} className="form-stack">
          <Field label="Name" required>
            <input className="input" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Role">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="EMPLOYEE">Employee</option>
              <option value="ADMIN">Admin</option>
            </select>
          </Field>
          <Field label="PIN" required={editing === 'new'}
            hint={editing === 'new' ? '4 to 8 digits' : 'Leave blank to keep the current PIN'}>
            <input className="input" inputMode="numeric" value={form.pin}
              required={editing === 'new'}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 8) })} />
          </Field>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggling)}
        title={toggling && toggling.active ? 'Deactivate this employee?' : 'Reactivate this employee?'}
        message={toggling && toggling.active
          ? toggling.name + ' will not be able to sign in. Their comments and history stay exactly as they are.'
          : toggling ? toggling.name + ' will be able to sign in again.' : ''}
        confirmLabel={toggling && toggling.active ? 'Deactivate' : 'Reactivate'}
        busy={busy}
        onCancel={() => setToggling(null)}
        onConfirm={toggleActive}
      />
    </div>
  );
}
