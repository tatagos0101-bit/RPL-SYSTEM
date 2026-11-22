import test from 'node:test';
import assert from 'node:assert/strict';
import { chartLabelLines, chartTickIndices, reportChartLayout } from './reportChartLayout.js';

test('narrow charts retain a readable plot height and axis text size', () => {
  for (const width of [240, 254, 300, 390, 660, 1000]) {
    const layout = reportChartLayout(width, 4, ['2026-11-01', '2026-11-22']);
    assert.ok(layout.plotBottom - layout.plotTop >= 148);
    assert.ok(layout.fontSize >= 12);
    assert.ok(layout.plotRight < layout.canvasWidth);
    assert.ok(layout.plotBottom < layout.canvasHeight);
  }
});

test('ticks retain both period boundaries without duplicates for sparse and dense reports', () => {
  assert.deepEqual(chartTickIndices(0, 3), []);
  assert.deepEqual(chartTickIndices(1, 3), [0]);
  for (const count of [2, 22, 31, 366]) {
    for (const limit of [2, 3, 5]) {
      const ticks = chartTickIndices(count, limit);
      assert.equal(ticks[0], 0);
      assert.equal(ticks.at(-1), count - 1);
      assert.equal(new Set(ticks).size, ticks.length);
      assert.ok(ticks.length <= limit);
    }
  }
});

test('compact dates retain the year without shifting calendar days', () => {
  assert.deepEqual(chartLabelLines('2026-12-31', true), ['Dec 31', '2026']);
  assert.deepEqual(chartLabelLines('2027-01-01', true), ['Jan 1', '2027']);
  assert.deepEqual(chartLabelLines('2024-02-29', true), ['Feb 29', '2024']);
  assert.deepEqual(chartLabelLines('2026-11-01', false), ['2026-11-01']);
  assert.deepEqual(chartLabelLines('Fiction', true), ['Fiction']);
});

test('wide count labels receive a larger left gutter and dates fit the available width', () => {
  const dates = Array.from({ length: 22 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
  const small = reportChartLayout(254, 4, dates);
  const large = reportChartLayout(254, 99999, dates);
  assert.ok(large.plotLeft > small.plotLeft);
  assert.equal(small.labelLines.length, dates.length);
  assert.ok(small.ticks.length <= 3);
  assert.equal(small.ticks.at(-1), 21);
  assert.deepEqual(dates[0], '2026-11-01');
});
