// =============================================================================
// COMMENTS  -  the only writer of Comment documents and of the denormalised
// Item.latestComment / commentCount fields, so the grid can never disagree
// with the comment history.
//
// Comments are append-only. An edit inside the 15-minute window pushes the
// previous text into versions[] - nothing is ever overwritten.
// =============================================================================
import { Comment, Item } from '../models/index.js';

/**
 * Append a comment to an item and refresh the item's grid columns.
 * Adding a comment counts as touching the item, so it also clears staleness.
 */
export async function addComment({ itemId, text, authorId, at = new Date() }) {
  const comment = await Comment.create({
    itemId, text: String(text), authorId, createdAt: at, updatedAt: at,
  });

  // Point the item at its newest comment - by date, not by insertion order,
  // because imported history arrives out of order.
  const newest = await Comment.findOne({ itemId }).sort({ createdAt: -1 }).lean();
  const count = await Comment.countDocuments({ itemId });

  await Item.updateOne({ _id: itemId }, {
    $set: {
      commentCount: count,
      latestComment: newest
        ? { text: newest.text, authorId: newest.authorId, at: newest.createdAt }
        : { text: '', authorId: null, at: null },
      updatedBy: authorId,
      updatedAt: at,
    },
  });

  return comment;
}

/** Rebuild an item's denormalised comment fields (used after an edit or import). */
export async function refreshLatestComment(itemId) {
  const newest = await Comment.findOne({ itemId }).sort({ createdAt: -1 }).lean();
  const count = await Comment.countDocuments({ itemId });
  await Item.updateOne({ _id: itemId }, {
    $set: {
      commentCount: count,
      latestComment: newest
        ? { text: newest.text, authorId: newest.authorId, at: newest.createdAt }
        : { text: '', authorId: null, at: null },
    },
  });
}

/**
 * Split an Excel comment cell into separate dated entries.
 *
 * A line that starts with a date - "25/08:", "25/08/2025 -", "3.9:" - begins a
 * new entry; everything after it (including blank lines) belongs to that entry
 * until the next dated line. Text before the first date becomes one undated
 * entry, so nothing from the sheet is lost.
 *
 * Returns [{ at: Date|null, text: string }] in the order found.
 */
const DATE_LINE = /^[\s*\-•]*(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\s*[:\-–—)]\s*/;

export function splitDatedComments(raw, { baseYear, now = new Date() } = {}) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  // ---- pass 1: split the cell into entries, keeping day/month/year as found
  const entries = [];
  let current = null;

  for (const line of text.split('\n')) {
    const m = line.match(DATE_LINE);
    if (m) {
      if (current) entries.push(current);
      const day = Number(m[1]);
      const month = Number(m[2]);
      let year = m[3] ? Number(m[3]) : null;
      if (year !== null && year < 100) year += 2000;
      const valid = day >= 1 && day <= 31 && month >= 1 && month <= 12;
      current = {
        day: valid ? day : null,
        month: valid ? month : null,
        year: valid ? year : null,
        text: line.slice(m[0].length).trim(),
      };
    } else if (current) {
      current.text += (current.text ? '\n' : '') + line;
    } else if (line.trim()) {
      current = { day: null, month: null, year: null, text: line.trim() };
    }
  }
  if (current) entries.push(current);

  // ---- pass 2: work out the year for the bare "25/08:" entries.
  //
  // A cell usually mixes "25/08:" with the occasional "09/09/2025". Those bare
  // dates belong to the same period as the explicit ones, so an explicit year
  // in the same cell wins over "this year" - otherwise a migrated sheet ends up
  // with half its history a year adrift and sorted wrongly.
  const explicitYear = entries.find((e) => e.year !== null)?.year;
  const fallbackYear = baseYear ?? explicitYear ?? now.getFullYear();

  // A day of grace for time zones; a comment about work already done cannot
  // be in the future, so roll such a date back a year.
  const tomorrow = now.getTime() + 24 * 60 * 60 * 1000;

  const resolve = (entry) => {
    if (entry.day === null) return null;
    let year = entry.year ?? fallbackYear;
    let at = new Date(Date.UTC(year, entry.month - 1, entry.day, 9, 0, 0));
    if (entry.year === null && at.getTime() > tomorrow) {
      year -= 1;
      at = new Date(Date.UTC(year, entry.month - 1, entry.day, 9, 0, 0));
    }
    return at;
  };

  return entries
    .map((e) => ({ at: resolve(e), text: e.text.trim() }))
    .filter((e) => e.text.length > 0);
}
