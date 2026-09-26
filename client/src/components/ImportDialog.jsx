// =============================================================================
// ImportDialog  -  bring an Excel/CSV sheet in.
//
// The file is parsed in the browser and previewed before anything is written,
// so an import is never a blind operation.
// =============================================================================
import { useState } from 'react';
import { api } from '../lib/api.js';
import { parseImportFile, downloadImportTemplate } from '../lib/excel.js';
import { Modal, Spinner, useToast } from './ui.jsx';

export default function ImportDialog({ open, onClose, onImported }) {
  const toast = useToast();
  const [parsed, setParsed] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [createMissingProjects, setCreateMissingProjects] = useState(false);

  function reset() {
    setParsed(null); setReport(null); setError(''); setBusy(false);
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setReport(null);
    try {
      setParsed(await parseImportFile(file));
    } catch (err) {
      setParsed(null);
      setError(err.message);
    }
  }

  async function runImport() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.import(parsed.rows, { createMissingProjects });
      setReport(data);
      onImported();
      toast.success('Imported: ' + data.itemsCreated + ' new, ' + data.itemsUpdated + ' updated, ' + data.commentsAdded + ' comments');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      wide
      title="Import from Excel or CSV"
      onClose={busy ? () => {} : () => { reset(); onClose(); }}
      footer={(
        <>
          <button type="button" className="btn btn-quiet"
            onClick={() => downloadImportTemplate().catch((err) => toast.error(err.message))}>
            Download template
          </button>
          <span className="filters-spacer" />
          <button type="button" className="btn" onClick={() => { reset(); onClose(); }} disabled={busy}>
            {report ? 'Close' : 'Cancel'}
          </button>
          {!report && (
            <button type="button" className="btn btn-primary" disabled={!parsed || busy} onClick={runImport}>
              {busy && <Spinner small />} Import {parsed ? parsed.rows.length + ' rows' : ''}
            </button>
          )}
        </>
      )}
    >
      <p className="state-text">
        Columns recognised: <strong>Project, Ticket No, Title, Priority, Status, Person, Secondary, Comments</strong>.
        A comment cell whose lines start with a date - for example <code>25/08:</code> - is split into
        separate history entries.
      </p>

      <input type="file" accept=".xlsx,.xls,.csv" className="input" onChange={pickFile} disabled={busy} />

      <label className="switch">
        <input type="checkbox" checked={createMissingProjects} disabled={busy}
          onChange={(e) => setCreateMissingProjects(e.target.checked)} />
        <span>Create projects that do not exist yet</span>
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      {parsed && !report && (
        <div className="import-preview">
          <p className="state-meta">
            Sheet <strong>{parsed.sheetName}</strong> - {parsed.rows.length} rows,
            columns matched: {parsed.columns.join(', ')}
          </p>
          <div className="grid-scroll">
            <table className="grid grid-compact">
              <thead>
                <tr><th>Project</th><th>Ticket No</th><th>Title</th><th>Priority</th><th>Status</th><th>Person</th><th>Secondary</th><th>Comments</th></tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 8).map((r, i) => (
                  <tr key={i}>
                    <td>{r.project}</td><td>{r.ticketNumber}</td><td>{r.title}</td>{/* nav-ok: preview of a sheet not imported yet - no record exists to link to */}
                    <td>{r.priority}</td><td>{r.status}</td><td>{r.owner}</td><td>{r.secondary}</td>
                    <td className="cell-comment"><span className="comment-text">{r.comments.slice(0, 80)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 8 && <p className="state-meta">...and {parsed.rows.length - 8} more rows</p>}
        </div>
      )}

      {report && (
        <div className="import-report">
          <ul className="report-list">
            <li><strong>{report.itemsCreated}</strong> items created</li>
            <li><strong>{report.itemsUpdated}</strong> items updated</li>
            <li><strong>{report.commentsAdded}</strong> comment entries added</li>
            <li><strong>{report.projectsCreated}</strong> projects created</li>
            <li><strong>{report.skipped}</strong> rows skipped</li>
          </ul>
          {report.warnings.length > 0 && (
            <details open>
              <summary>{report.warnings.length} warning(s)</summary>
              <ul className="report-list">
                {report.warnings.slice(0, 50).map((w, i) => <li key={i}>Row {w.row}: {w.message}</li>)}
              </ul>
            </details>
          )}
          {report.errors.length > 0 && (
            <details open>
              <summary>{report.errors.length} error(s)</summary>
              <ul className="report-list report-errors">
                {report.errors.slice(0, 50).map((w, i) => <li key={i}>Row {w.row}: {w.message}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
