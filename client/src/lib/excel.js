// =============================================================================
// Excel import and export (SheetJS).
//
// The SheetJS library is ~500 kB, and most sessions never export anything, so
// it is loaded on demand the first time it is actually needed rather than
// being bundled into the initial page load.
// =============================================================================
import { IMPORT_COLUMNS } from '@todo/shared';
import { formatDateTime, formatDate } from './format.js';

let xlsxPromise = null;
const loadXLSX = () => {
  if (!xlsxPromise) xlsxPromise = import('xlsx');
  return xlsxPromise;
};

const stamp = () => new Date().toISOString().slice(0, 10);

/** Column widths, so the downloaded sheet is readable without resizing. */
const widths = (...w) => w.map((wch) => ({ wch }));

/** One row per item, for the "Export" button. */
const itemRow = (i) => ({
  Project: i.project ? i.project.label : '',
  'Ticket No': i.ticketNumber,
  Title: i.title,
  Priority: i.priority,
  Status: i.status,
  Person: i.owner ? i.owner.label : '',
  Secondary: i.secondaryLabel || '',
  'Due Date': i.dueDate ? formatDate(i.dueDate) : '',
  'Latest Comment': i.latestComment ? i.latestComment.text : '',
  'Comment Date': i.latestComment ? formatDateTime(i.latestComment.at) : '',
  'Comment By': i.latestComment && i.latestComment.author ? i.latestComment.author.label : '',
  'Comments (count)': i.commentCount,
  'Last Updated': formatDateTime(i.updatedAt),
  'Updated By': i.updatedBy ? i.updatedBy.label : '',
});

const ITEM_WIDTHS = widths(16, 14, 46, 11, 18, 12, 12, 12, 60, 17, 12, 9, 17, 12);

/** The current grid, one row per item, with its latest comment. */
export async function exportItems(items, { filename } = {}) {
  const XLSX = await loadXLSX();
  const sheet = XLSX.utils.json_to_sheet(items.map(itemRow));
  sheet['!cols'] = ITEM_WIDTHS;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Items');
  XLSX.writeFile(book, filename || 'todo-tracker-' + stamp() + '.xlsx', { compression: true });
}

/**
 * Two sheets: the items, plus every comment as its own row, so nothing in the
 * history is flattened away.
 */
export async function exportWithFullHistory(items, commentsByItem, { filename } = {}) {
  const XLSX = await loadXLSX();

  const commentRows = [];
  for (const item of items) {
    for (const c of (commentsByItem[item.id] || [])) {
      commentRows.push({
        Project: item.project ? item.project.label : '',
        'Ticket No': item.ticketNumber,
        Title: item.title,
        'Comment Date': formatDateTime(c.createdAt),
        Author: c.author ? c.author.label : '',
        Comment: c.text,
        Edited: c.editedAt ? formatDateTime(c.editedAt) : '',
      });
    }
  }

  const book = XLSX.utils.book_new();

  const itemSheet = XLSX.utils.json_to_sheet(items.map(itemRow));
  itemSheet['!cols'] = ITEM_WIDTHS;
  XLSX.utils.book_append_sheet(book, itemSheet, 'Items');

  const commentSheet = XLSX.utils.json_to_sheet(
    commentRows.length ? commentRows : [{ Note: 'No comments in this view' }],
  );
  commentSheet['!cols'] = widths(16, 14, 40, 17, 12, 90, 17);
  XLSX.utils.book_append_sheet(book, commentSheet, 'Comment history');

  XLSX.writeFile(book, filename || 'todo-tracker-full-' + stamp() + '.xlsx', { compression: true });
}

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------

/** Map a sheet's header cells onto our known fields. */
function headerMap(headers) {
  const map = {};
  headers.forEach((raw, index) => {
    const key = String(raw || '').trim().toLowerCase();
    for (const [field, aliases] of Object.entries(IMPORT_COLUMNS)) {
      if (aliases.includes(key)) { map[field] = index; return; }
    }
  });
  return map;
}

/**
 * Read an .xlsx or .csv File into rows the /api/import endpoint understands.
 * Multi-line comment cells are kept intact here - the server splits them into
 * dated entries, so one rule governs every import path.
 */
export async function parseImportFile(file) {
  const XLSX = await loadXLSX();
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheetName = book.SheetNames[0];
  if (!sheetName) throw new Error('That file has no sheets in it');

  const grid = XLSX.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
  if (!grid.length) throw new Error('That sheet is empty');

  const map = headerMap(grid[0]);
  const missing = ['project', 'ticketNumber'].filter((f) => map[f] === undefined);
  if (missing.length) {
    throw new Error('The sheet needs a "Project" and a "Ticket No" column. Found: ' + grid[0].join(', '));
  }

  const cell = (row, field) => (map[field] === undefined ? '' : String(row[map[field]] ?? '').trim());

  const rows = grid.slice(1)
    .map((row) => ({
      project: cell(row, 'project'),
      ticketNumber: cell(row, 'ticketNumber'),
      title: cell(row, 'title'),
      priority: cell(row, 'priority'),
      status: cell(row, 'status'),
      owner: cell(row, 'owner'),
      secondary: cell(row, 'secondary'),
      // Not trimmed: the line breaks are what the dated-comment splitter needs.
      comments: map.comments === undefined ? '' : String(row[map.comments] ?? ''),
    }))
    .filter((r) => r.project || r.ticketNumber);

  return { rows, sheetName, columns: Object.keys(map), headers: grid[0] };
}

/** A template file, so the expected columns are never a guess. */
export async function downloadImportTemplate() {
  const XLSX = await loadXLSX();
  const sheet = XLSX.utils.json_to_sheet([{
    Project: 'NTT SOHAR',
    'Ticket No': '8000001046',
    Title: 'Sohar PR and PO Validation for Ariba users',
    Priority: 'Critical',
    Status: 'In Progress',
    Person: 'Radha',
    Secondary: 'Team',
    Comments: '25/08: First update on this ticket.\n02/09: Second update, kept as its own entry.',
  }]);
  sheet['!cols'] = widths(16, 14, 46, 11, 18, 12, 12, 70);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Import template');
  XLSX.writeFile(book, 'todo-tracker-import-template.xlsx', { compression: true });
}
