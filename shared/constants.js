// =============================================================================
// CONFIG / CONSTANTS  -  shared by client and server (single source of truth)
// =============================================================================

export const ROLES = { ADMIN: 'ADMIN', EMPLOYEE: 'EMPLOYEE' };

/** Entity kinds used by the audit log and the client route registry. */
export const ENTITY = { ITEM: 'item', PROJECT: 'project', EMPLOYEE: 'employee' };

/** Secondary can be a named person, the whole team, or nobody. */
export const SECONDARY_KIND = { NONE: 'NONE', TEAM: 'TEAM', USER: 'USER' };

/** Dropdown list kinds that admins can manage (values live in the database). */
export const LIST_KIND = { STATUS: 'status', PRIORITY: 'priority' };

/**
 * Fields an EMPLOYEE may change on an item they own or are secondary on.
 * Everything else is admin-only. The server enforces this; the UI mirrors it.
 */
export const EMPLOYEE_EDITABLE_FIELDS = ['status', 'priority', 'secondaryKind', 'secondaryUserId'];

/** Every field of an item that is tracked in the audit log, with a display label. */
export const AUDITED_FIELDS = {
  ticketNumber: 'Ticket No',
  title: 'Title',
  projectId: 'Project',
  priority: 'Priority',
  status: 'Status',
  ownerId: 'Owner',
  secondaryKind: 'Secondary type',
  secondaryUserId: 'Secondary',
  dueDate: 'Due date',
};

/** An item untouched for this long is flagged "stale" in the grid. */
export const STALE_AFTER_DAYS = 7;

/** A comment author may correct their own comment for this long, then it locks. */
export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Panels must resolve (data / empty / error) within this budget - NAV-10. */
export const PANEL_TIMEOUT_MS = 12000;

/** Statuses that mean "finished" - these rows are greyed and hidden by the toggle. */
export const DONE_STATUSES = ['Done', 'Moved to Quality'];

/** Seed values for the admin-editable dropdown lists. */
export const DEFAULT_PRIORITIES = [
  { label: 'Critical', order: 1, color: '#dc2626' },
  { label: 'High', order: 2, color: '#ea580c' },
  { label: 'Medium', order: 3, color: '#ca8a04' },
  { label: 'Low', order: 4, color: '#2563eb' },
];

export const DEFAULT_STATUSES = [
  { label: 'New', order: 1, color: '#64748b' },
  { label: 'In Progress', order: 2, color: '#2563eb' },
  { label: 'Pending SA Review', order: 3, color: '#7c3aed' },
  { label: 'Pending SA for TR', order: 4, color: '#7c3aed' },
  { label: 'Pending SA for CR', order: 5, color: '#7c3aed' },
  { label: 'Pending Vendor', order: 6, color: '#c026d3' },
  { label: 'Testing', order: 7, color: '#0891b2' },
  { label: 'Moved to Quality', order: 8, color: '#059669' },
  { label: 'Done', order: 9, color: '#16a34a' },
  { label: 'On Hold', order: 10, color: '#78716c' },
];

/** Column headers accepted by the Excel/CSV importer (lower-cased, trimmed). */
export const IMPORT_COLUMNS = {
  project: ['project', 'project name'],
  ticketNumber: ['ticket no', 'ticket number', 'ticket', 'ticket_no'],
  title: ['title', 'description', 'subject'],
  priority: ['priority'],
  status: ['status'],
  owner: ['person', 'owner', 'primary'],
  secondary: ['secondary', 'secondary person'],
  comments: ['comments', 'comment', 'remarks'],
};
