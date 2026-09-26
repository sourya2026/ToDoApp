// =============================================================================
// ItemsGrid  -  the Excel-like table.
//
// Every row is clickable AND its ticket number is a real anchor, so the record
// opens by click, by keyboard, and by middle-click into a new tab.
// =============================================================================
import { useNavigate } from 'react-router-dom';
import { RecordLink, Ref } from './RecordLink.jsx';
import { Badge } from './ui.jsx';
import { useAppData } from '../lib/appData.jsx';
import { linkTo } from '../lib/entityRoutes.js';
import { formatDateTime, relativeTime, firstLine } from '../lib/format.js';
import { STALE_AFTER_DAYS } from '@todo/shared';

const COLUMNS = [
  { key: 'ticketNumber', label: 'Ticket No', width: '116px' }, // nav-ok: sort key, not a rendered value - the cell itself uses RecordLink
  { key: 'title', label: 'Title' },
  { key: 'priority', label: 'Priority', width: '104px' },
  { key: 'status', label: 'Status', width: '150px' },
  { key: 'owner', label: 'Owner', width: '110px' },
  { key: 'secondary', label: 'Secondary', width: '110px' },
  { key: 'latestComment', label: 'Latest Comment', width: '300px' },
  { key: 'updatedAt', label: 'Last Updated', width: '150px' },
];

function SortHeader({ column, sort, dir, onSort }) {
  const active = sort === column.key;
  return (
    <th style={column.width ? { width: column.width } : undefined} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={'sort-btn' + (active ? ' sort-active' : '')} onClick={() => onSort(column.key)}>
        {column.label}
        <span className="sort-caret" aria-hidden="true">{active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  );
}

function ItemRow({ item, selectedId }) {
  const navigate = useNavigate();
  const { statusColor, priorityColor } = useAppData();

  const classes = ['grid-row'];
  if (item.priority === 'Critical' && !item.isDone) classes.push('row-critical');
  if (item.isDone) classes.push('row-done');
  if (item.isStale) classes.push('row-stale');
  if (item.id === selectedId) classes.push('row-selected');

  return (
    <tr
      className={classes.join(' ')}
      onClick={() => navigate(linkTo('item', item.id))}
      title={item.isStale ? 'Not updated for ' + item.daysSinceUpdate + ' days' : undefined}
    >
      <td className="cell-ticket">
        {/* The anchor is what gives keyboard, screen-reader and new-tab support. */}
        <RecordLink type="item" id={item.id}>{item.ticketNumber}</RecordLink>
      </td>
      <td className="cell-title">
        <span className="title-text">{item.title}</span>
        {item.isStale && (
          <span className="tag tag-stale" title={'No update in over ' + STALE_AFTER_DAYS + ' days'}>stale</span>
        )}
      </td>
      <td><Badge label={item.priority} color={priorityColor(item.priority)} muted={item.isDone} /></td>
      <td><Badge label={item.status} color={statusColor(item.status)} muted={item.isDone} /></td>
      <td className="cell-person"><Ref reference={item.owner} fallback="-" /></td>
      <td className="cell-person">
        {item.secondary
          ? <Ref reference={item.secondary} />
          : <span className="record-plain">{item.secondaryLabel || '-'}</span>}
      </td>
      <td className="cell-comment">
        {item.latestComment ? (
          <>
            <span className="comment-text">{firstLine(item.latestComment.text)}</span>
            <span className="comment-meta">
              {formatDateTime(item.latestComment.at)}
              {item.latestComment.author ? ' - ' + item.latestComment.author.label : ''}
              {item.commentCount > 1 ? ' (' + item.commentCount + ')' : ''}
            </span>
          </>
        ) : <span className="muted">No comments yet</span>}
      </td>
      <td className="cell-updated">
        <span>{formatDateTime(item.updatedAt)}</span>
        <span className="comment-meta">
          {relativeTime(item.updatedAt)}{item.updatedBy ? ' - ' + item.updatedBy.label : ''}
        </span>
      </td>
    </tr>
  );
}

/**
 * @param grouped  true when "All my projects" is selected: rows sit under a
 *                 project header row carrying that project's item count.
 */
export function ItemsGrid({ items, sort, dir, onSort, grouped, selectedId }) {
  // Group in render order so the sort the user chose is preserved inside
  // each project block.
  const groups = [];
  if (grouped) {
    const index = new Map();
    for (const item of items) {
      const key = item.project ? item.project.id : 'none';
      if (!index.has(key)) {
        index.set(key, { project: item.project, items: [] });
        groups.push(index.get(key));
      }
      index.get(key).items.push(item);
    }
  }

  return (
    // Wide content scrolls inside its own container, so nothing is clipped
    // at 1366px with the sidebar open.
    <div className="grid-scroll">
      <table className="grid">
        <thead>
          <tr>
            {COLUMNS.map((c) => <SortHeader key={c.key} column={c} sort={sort} dir={dir} onSort={onSort} />)}
          </tr>
        </thead>

        {grouped ? groups.map((group) => (
          <tbody key={group.project ? group.project.id : 'none'} className="grid-group">
            <tr className="group-row">
              <th colSpan={COLUMNS.length} scope="colgroup">
                <span className="group-name">
                  {group.project
                    ? <RecordLink type="project" id={group.project.id}>{group.project.label}</RecordLink>
                    : 'Unassigned'}
                </span>
                <span className="group-count">
                  {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                </span>
              </th>
            </tr>
            {group.items.map((item) => <ItemRow key={item.id} item={item} selectedId={selectedId} />)}
          </tbody>
        )) : (
          <tbody>
            {items.map((item) => <ItemRow key={item.id} item={item} selectedId={selectedId} />)}
          </tbody>
        )}
      </table>
    </div>
  );
}

export { COLUMNS };
