// =============================================================================
// ItemDetailPanel  -  the record page, opened by clicking a row.
//
// It lives at its own URL (/items/:id), so it survives a refresh, can be
// bookmarked and shared, and Back returns to the list with its filters intact.
// Two tabs: the item with its comment history, and the change history.
// =============================================================================
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../lib/auth.jsx';
import { useAppData } from '../lib/appData.jsx';
import { usePanel } from '../lib/usePanel.js';
import { Panel, Skeleton, EmptyState, PanelError } from './PanelStates.jsx';
import { Badge, Field, Spinner, ConfirmDialog, CopyButton, useToast } from './ui.jsx';
import { RecordLink, Ref } from './RecordLink.jsx';
import { formatDateTime, relativeTime, toDateInput, initials, mmss } from '../lib/format.js';
import { SECONDARY_KIND } from '@todo/shared';

// --------------------------------------------------------- comment list ----
function CommentHistory({ itemId, canComment, onPosted }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');

  const panel = usePanel(
    (signal) => api.comments(itemId, { signal }).then((r) => r.data),
    [itemId],
    { allowEmpty: true },
  );

  async function post(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    try {
      await api.addComment(itemId, text);
      setText('');
      panel.reload();
      onPosted();
      toast.success('Comment added');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit(id) {
    try {
      await api.updateComment(id, editText);
      setEditing(null);
      panel.reload();
      onPosted();
      toast.success('Comment updated - the previous version is kept');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <section className="comments">
      {canComment ? (
        <form onSubmit={post} className="comment-form">
          <Field label="Add a comment">
            <textarea
              className="input textarea"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What happened? This is added as a new entry - nothing is overwritten."
            />
          </Field>
          <div className="comment-form-foot">
            <span className="field-hint">You can correct your own comment for 15 minutes.</span>
            <button type="submit" className="btn btn-primary" disabled={!text.trim() || posting}>
              {posting && <Spinner small />} Add comment
            </button>
          </div>
        </form>
      ) : (
        <p className="state-meta">You cannot comment on items outside your projects.</p>
      )}

      <h3 className="section-title">
        Comment history
        {panel.status === 'ready' && <span className="count-pill">{panel.data.length}</span>}
      </h3>

      <Panel state={panel} skeletonRows={3}>
        {(comments) => (comments.length === 0
          ? <EmptyState title="No comments yet" text="The first update will appear here." />
          : (
            <ol className="comment-list">
              {comments.map((c) => (
                <li key={c.id} className="comment">
                  <div className="comment-head">
                    <span className="avatar avatar-sm">{initials(c.author ? c.author.label : '?')}</span>
                    <span className="comment-author">{c.author ? c.author.label : 'Unknown'}</span>
                    <time className="comment-date" dateTime={c.createdAt}>{formatDateTime(c.createdAt)}</time>
                    {c.editedAt && <span className="tag tag-muted" title={'Edited ' + formatDateTime(c.editedAt)}>edited</span>}
                    {c.canEdit && editing !== c.id && (
                      <button type="button" className="btn btn-quiet btn-xs"
                        onClick={() => { setEditing(c.id); setEditText(c.text); }}>
                        Edit ({mmss(c.editMsLeft)} left)
                      </button>
                    )}
                  </div>

                  {editing === c.id ? (
                    <div className="comment-edit">
                      <textarea className="input textarea" rows={4} value={editText}
                        onChange={(e) => setEditText(e.target.value)} />
                      <div className="comment-form-foot">
                        <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={() => saveEdit(c.id)}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <p className="comment-body">{c.text}</p>
                  )}

                  {c.versions.length > 0 && (
                    <details className="comment-versions">
                      <summary>{c.versions.length} earlier version(s)</summary>
                      {c.versions.map((v, i) => (
                        <p key={i} className="comment-body comment-old">
                          <span className="state-meta">replaced {formatDateTime(v.replacedAt)}</span>
                          {v.text}
                        </p>
                      ))}
                    </details>
                  )}
                </li>
              ))}
            </ol>
          ))}
      </Panel>
    </section>
  );
}

// ---------------------------------------------------------- change log -----
function ChangeHistory({ itemId }) {
  const panel = usePanel(
    (signal) => api.itemAudit(itemId, { signal }).then((r) => r.data),
    [itemId],
    { allowEmpty: true },
  );

  return (
    <Panel state={panel} skeletonRows={4}>
      {(rows) => (rows.length === 0
        ? <EmptyState title="No changes recorded" text="Field changes will be listed here automatically." />
        : (
          <ol className="audit-list">
            {rows.map((r) => (
              <li key={r.id} className="audit-row">
                <div className="audit-main">
                  <span className="audit-field">{r.fieldLabel}</span>
                  {r.field === 'created' ? (
                    <span className="audit-value">{r.newValue}</span>
                  ) : (
                    <>
                      <span className="audit-old">{r.oldValue}</span>
                      <span className="audit-arrow" aria-hidden="true">&rarr;</span>
                      <span className="audit-new">{r.newValue}</span>
                    </>
                  )}
                </div>
                <div className="audit-meta">
                  {r.changedBy ? r.changedBy.label : 'Unknown'} - {formatDateTime(r.at)}
                </div>
              </li>
            ))}
          </ol>
        ))}
    </Panel>
  );
}

// ------------------------------------------------------------- the form ----
function ItemForm({ item, onSaved }) {
  const { lists, activeUsers } = useAppData();
  const toast = useToast();
  const [form, setForm] = useState({
    ticketNumber: item.ticketNumber,
    title: item.title,
    priority: item.priority,
    status: item.status,
    ownerId: item.owner ? item.owner.id : '',
    secondaryKind: item.secondaryKind,
    secondaryUserId: item.secondary ? item.secondary.id : '',
    dueDate: toDateInput(item.dueDate),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allowed = item.permissions.editableFields;
  const editable = (field) => allowed.includes(field);
  const readOnly = allowed.length === 0;

  const update = (patch) => setForm((f) => ({ ...f, ...patch }));

  /** Send only the fields this user may write AND that actually changed. */
  async function save(e) {
    e.preventDefault();
    const original = {
      ticketNumber: item.ticketNumber,
      title: item.title,
      priority: item.priority,
      status: item.status,
      ownerId: item.owner ? item.owner.id : '',
      secondaryKind: item.secondaryKind,
      secondaryUserId: item.secondary ? item.secondary.id : '',
      dueDate: toDateInput(item.dueDate),
    };
    const payload = {};
    for (const field of allowed) {
      if (form[field] !== original[field]) payload[field] = form[field];
    }
    if ('dueDate' in payload) payload.dueDate = payload.dueDate || null;
    if ('secondaryUserId' in payload && form.secondaryKind !== SECONDARY_KIND.USER) delete payload.secondaryUserId;

    if (!Object.keys(payload).length) { toast.info('Nothing has changed'); return; }

    setSaving(true);
    setError('');
    try {
      const { data, meta } = await api.updateItem(item.id, payload);
      onSaved(data);
      toast.success(meta.changesRecorded + ' change(s) saved and logged');
    } catch (err) {
      setError(err.message);
      toast.error('Could not save: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="form-grid item-form">
      <Field label="Ticket No" required>
        <input className="input" value={form.ticketNumber} disabled={!editable('ticketNumber')}
          onChange={(e) => update({ ticketNumber: e.target.value })} />
      </Field>

      <Field label="Due date">
        <input type="date" className="input" value={form.dueDate} disabled={!editable('dueDate')}
          onChange={(e) => update({ dueDate: e.target.value })} />
      </Field>

      <Field label="Title" required>
        <input className="input span-2" value={form.title} disabled={!editable('title')}
          onChange={(e) => update({ title: e.target.value })} />
      </Field>

      <Field label="Priority">
        <select className="input" value={form.priority} disabled={!editable('priority')}
          onChange={(e) => update({ priority: e.target.value })}>
          {lists.priorities.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
          {/* Keep a value the admin has since retired, so it is not silently lost. */}
          {!lists.priorities.some((p) => p.label === form.priority) && <option value={form.priority}>{form.priority}</option>}
        </select>
      </Field>

      <Field label="Status">
        <select className="input" value={form.status} disabled={!editable('status')}
          onChange={(e) => update({ status: e.target.value })}>
          {lists.statuses.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
          {!lists.statuses.some((s) => s.label === form.status) && <option value={form.status}>{form.status}</option>}
        </select>
      </Field>

      <Field label="Owner">
        <select className="input" value={form.ownerId} disabled={!editable('ownerId')}
          onChange={(e) => update({ ownerId: e.target.value })}>
          {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          {item.owner && !activeUsers.some((u) => u.id === item.owner.id) && (
            <option value={item.owner.id}>{item.owner.label} (inactive)</option>
          )}
        </select>
      </Field>

      <Field label="Secondary">
        <div className="inline-pair">
          <select className="input" value={form.secondaryKind} disabled={!editable('secondaryKind')}
            onChange={(e) => update({ secondaryKind: e.target.value })}>
            <option value={SECONDARY_KIND.TEAM}>Team</option>
            <option value={SECONDARY_KIND.USER}>Person</option>
            <option value={SECONDARY_KIND.NONE}>None</option>
          </select>
          {form.secondaryKind === SECONDARY_KIND.USER && (
            <select className="input" value={form.secondaryUserId} disabled={!editable('secondaryUserId')}
              onChange={(e) => update({ secondaryUserId: e.target.value })}>
              <option value="">Choose...</option>
              {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
      </Field>

      {error && <p className="form-error span-2" role="alert">{error}</p>}

      {readOnly ? (
        <p className="state-meta span-2">
          You can read this item, but only its owner, its secondary or an admin can change it.
        </p>
      ) : (
        <div className="form-foot span-2">
          <span className="field-hint">
            {item.permissions.editFull
              ? 'You can edit every field.'
              : 'You can change Status, Priority and Secondary.'}
          </span>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <Spinner small />} Save changes
          </button>
        </div>
      )}
    </form>
  );
}

// ------------------------------------------------------------ the panel ----
export default function ItemDetailPanel({ itemId, onChanged }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { statusColor, priorityColor } = useAppData();
  const [tab, setTab] = useState('item');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const panel = usePanel(
    (signal) => api.item(itemId, { signal }).then((r) => r.data),
    [itemId],
  );

  // Closing returns to the board WITH the filters that are in the URL already.
  const close = () => navigate({ pathname: '/board', search: location.search });

  async function remove() {
    setDeleting(true);
    try {
      await api.deleteItem(itemId);
      toast.success('Item deleted');
      onChanged();
      close();
    } catch (err) {
      toast.error('Could not delete: ' + err.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <aside className="detail-panel" aria-label="Item detail">
      <div className="detail-inner">
        <Panel state={panel} skeletonRows={6}>
          {(item) => (
            <>
              {/* ---- header: breadcrumbs, identity, actions ---- */}
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <RecordLink type="project" id={item.project.id}>{item.project.label}</RecordLink>
                <span aria-hidden="true"> / </span>
                <span className="crumb-current">{item.ticketNumber}</span>{/* nav-ok: this record's own id, on its own page */}
              </nav>

              <header className="detail-head" data-testid="detail-header">
                <div className="detail-identity">
                  <div className="detail-id-row">
                    <span className="detail-ticket">{item.ticketNumber}</span>{/* nav-ok: this record's own id, on its own page */}
                    <CopyButton value={item.ticketNumber} />
                    <Badge label={item.status} color={statusColor(item.status)} />
                    <Badge label={item.priority} color={priorityColor(item.priority)} />
                    {item.isStale && <span className="tag tag-stale">stale</span>}
                  </div>
                  <h2 className="detail-title">{item.title}</h2>
                  <dl className="detail-facts">
                    <div><dt>Owner</dt><dd><Ref reference={item.owner} fallback="-" /></dd></div>
                    <div><dt>Secondary</dt><dd>
                      {item.secondary ? <Ref reference={item.secondary} /> : (item.secondaryLabel || '-')}
                    </dd></div>
                    <div><dt>Project</dt><dd><Ref reference={item.project} /></dd></div>
                    <div><dt>Updated</dt><dd title={formatDateTime(item.updatedAt)}>
                      {relativeTime(item.updatedAt)}{item.updatedBy ? ' by ' + item.updatedBy.label : ''}
                    </dd></div>
                  </dl>
                </div>

                <div className="detail-actions">
                  {item.permissions.delete && (
                    <button type="button" className="btn btn-danger-quiet" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </button>
                  )}
                  <button type="button" className="icon-btn" onClick={close} aria-label="Close panel">&#10005;</button>
                </div>
              </header>

              {/* ---- tabs ---- */}
              <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'item'}
                  className={'tab' + (tab === 'item' ? ' tab-active' : '')}
                  onClick={() => setTab('item')}>
                  Item &amp; comments
                  {item.commentCount > 0 && <span className="count-pill">{item.commentCount}</span>}
                </button>
                <button type="button" role="tab" aria-selected={tab === 'history'}
                  className={'tab' + (tab === 'history' ? ' tab-active' : '')}
                  onClick={() => setTab('history')}>
                  Change history
                </button>
              </div>

              <div role="tabpanel" className="tabpanel">
                {tab === 'item' ? (
                  <>
                    <ItemForm
                      item={item}
                      onSaved={(updated) => { panel.patch(() => ({ ...updated, permissions: item.permissions })); onChanged(); }}
                    />
                    <CommentHistory
                      itemId={item.id}
                      canComment={item.permissions.comment}
                      onPosted={() => { panel.reload(); onChanged(); }}
                    />
                  </>
                ) : (
                  <ChangeHistory itemId={item.id} />
                )}
              </div>

              <ConfirmDialog
                open={confirmDelete}
                title="Delete this item?"
                message={'This removes ' + item.ticketNumber + ' with its ' + item.commentCount + ' comment(s) and its change history. This cannot be undone.'} // nav-ok: dialog prose, not a record reference
                confirmLabel="Delete item"
                busy={deleting}
                onCancel={() => setConfirmDelete(false)}
                onConfirm={remove}
              />
            </>
          )}
        </Panel>
      </div>
    </aside>
  );
}
