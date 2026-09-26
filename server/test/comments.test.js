// =============================================================================
// Unit tests for the dated-comment splitter used by the Excel importer.
// =============================================================================
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { splitDatedComments } from '../src/lib/comments.js';

const NOW = new Date('2026-09-26T12:00:00Z');
const day = (d) => (d ? d.toISOString().slice(0, 10) : null);

describe('splitDatedComments', () => {
  test('splits a cell on dated lines and keeps continuation lines together', () => {
    const out = splitDatedComments(
      '25/08: Raised with the SA team.\nSecond line of the same entry.\n02/09: Vendor replied.',
      { baseYear: 2025, now: NOW },
    );
    assert.equal(out.length, 2);
    assert.equal(day(out[0].at), '2025-08-25');
    assert.equal(out[0].text, 'Raised with the SA team.\nSecond line of the same entry.');
    assert.equal(day(out[1].at), '2025-09-02');
  });

  test('an explicit year in the cell sets the year for the bare dates too', () => {
    const out = splitDatedComments(
      '25/08: First.\n02/09: Second.\n09/09/2025 - Third.',
      { now: NOW },
    );
    assert.deepEqual(out.map((e) => day(e.at)), ['2025-08-25', '2025-09-02', '2025-09-09']);
  });

  test('entries come out in chronological order after the year is resolved', () => {
    const out = splitDatedComments('25/08: First.\n09/09/2025 - Later.', { now: NOW });
    assert.ok(out[0].at < out[1].at, 'the bare date must not land a year in the future');
  });

  test('a bare date later in the year than today rolls back to last year', () => {
    // "12/11" read on 26 Sep 2026 means November 2025, not two months from now.
    const out = splitDatedComments('12/11: Work already done.', { now: NOW });
    assert.equal(day(out[0].at), '2025-11-12');
  });

  test('a bare date earlier in the year stays in the current year', () => {
    const out = splitDatedComments('12/03: Done in March.', { now: NOW });
    assert.equal(day(out[0].at), '2026-03-12');
  });

  test('an explicit future date is respected - it was typed deliberately', () => {
    const out = splitDatedComments('01/12/2027: Planned cutover.', { now: NOW });
    assert.equal(day(out[0].at), '2027-12-01');
  });

  test('accepts dot and dash separators, and two-digit years', () => {
    const out = splitDatedComments('3.9.25 - Dotted.\n04-09-25: Dashed.', { now: NOW });
    assert.deepEqual(out.map((e) => day(e.at)), ['2025-09-03', '2025-09-04']);
  });

  test('text before the first date is kept as an undated entry', () => {
    const out = splitDatedComments('No date here.\n25/08/2025: Dated.', { now: NOW });
    assert.equal(out.length, 2);
    assert.equal(out[0].at, null);
    assert.equal(out[0].text, 'No date here.');
  });

  test('an undated cell becomes one entry', () => {
    const out = splitDatedComments('Just a plain comment\nover two lines', { now: NOW });
    assert.equal(out.length, 1);
    assert.equal(out[0].at, null);
  });

  test('an empty or blank cell yields nothing', () => {
    assert.deepEqual(splitDatedComments('   '), []);
    assert.deepEqual(splitDatedComments(null), []);
    assert.deepEqual(splitDatedComments(undefined), []);
  });

  test('an impossible date is kept as text rather than becoming a wrong date', () => {
    const out = splitDatedComments('45/99: Not a real date.', { now: NOW });
    assert.equal(out.length, 1);
    assert.equal(out[0].at, null);
  });
});
