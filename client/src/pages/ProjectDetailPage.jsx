// =============================================================================
// ProjectDetailPage  -  where a project link lands.
// Header, the people on it, and its items (each row opening its own record).
// =============================================================================
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePanel } from '../lib/usePanel.js';
import { Panel, EmptyState } from '../components/PanelStates.jsx';
import { ItemsGrid } from '../components/ItemsGrid.jsx';
import { Ref } from '../components/RecordLink.jsx';
import { formatDate } from '../lib/format.js';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const project = usePanel((signal) => api.project(projectId, { signal }).then((r) => r.data), [projectId]);
  const items = usePanel(
    (signal) => api.items({ projectId, sort: 'updatedAt', dir: 'desc' }, { signal }).then((r) => r.data),
    [projectId],
    { allowEmpty: true },
  );

  return (
    <div className="board">
      <Panel state={project} skeletonRows={4}>
        {(p) => (
          <>
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <button type="button" className="crumb-link" onClick={() => navigate('/board')}>Board</button>
              <span aria-hidden="true"> / </span>
              <span className="crumb-current">{p.name}</span>
            </nav>

            <div className="board-head">
              <div>
                <h1 className="page-title">
                  {p.name}
                  {!p.active && <span className="tag tag-muted">archived</span>}
                </h1>
                <p className="page-sub">{p.client}{p.description ? ' - ' + p.description : ''}</p>
              </div>
              <div className="board-actions">
                <button type="button" className="btn"
                  onClick={() => navigate('/board?project=' + p.id)}>
                  Open in board
                </button>
              </div>
            </div>

            <dl className="detail-facts detail-facts-wide">
              <div><dt>Items</dt><dd>{p.itemCount}</dd></div>
              <div><dt>Created</dt><dd>{formatDate(p.createdAt)}</dd></div>
              <div>
                <dt>Assigned</dt>
                <dd className="assigned-list">
                  {p.assigned.length
                    ? p.assigned.map((a) => <Ref key={a.id} reference={a} />)
                    : <span className="muted">Nobody yet</span>}
                </dd>
              </div>
            </dl>
          </>
        )}
      </Panel>

      <h2 className="section-title">Items</h2>
      <Panel state={items} skeletonRows={5}>
        {(data) => (data.items.length === 0
          ? <EmptyState title="This project has no items yet" text="Add one from the board." />
          : <ItemsGrid items={data.items} sort="updatedAt" dir="desc" onSort={() => {}} />)}
      </Panel>
    </div>
  );
}
