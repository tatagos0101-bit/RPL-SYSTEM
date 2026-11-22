const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function chartLabelLines(label, compact) {
  const value = String(label);
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  // Report buckets are calendar dates, not instants to convert between time zones.
  if (compact && date && months[Number(date[2]) - 1]) {
    return [`${months[Number(date[2]) - 1]} ${Number(date[3])}`, date[1]];
  }
  return [value.slice(0, 10)];
}

export function chartTickIndices(count, limit) {
  if (!count) return [];
  if (count === 1) return [0];
  const ticks = Math.min(count, Math.max(2, Math.floor(limit)));
  return Array.from({ length: ticks }, (_, i) => Math.round(i * (count - 1) / (ticks - 1)));
}

export function reportChartLayout(width, max, labels) {
  const canvasWidth = Math.max(200, Math.round(width));
  const compact = canvasWidth < 450;
  const fontSize = compact ? 12 : 14;
  const canvasHeight = Math.min(300, Math.max(220, Math.round(canvasWidth / 3)));
  const plotLeft = Math.max(32, String(max).length * fontSize * .65 + 12);
  const plotRight = canvasWidth - 16;
  const plotTop = 20;
  const plotBottom = canvasHeight - (compact ? 52 : 40);
  const labelLines = labels.map(label => chartLabelLines(label, compact));
  const labelWidth = Math.max(1, ...labelLines.flat().map(line => line.length)) * fontSize * .65;
  const ticks = chartTickIndices(labels.length, Math.floor((plotRight - plotLeft) / (labelWidth + 24)));
  return { canvasWidth, canvasHeight, fontSize, plotLeft, plotRight, plotTop, plotBottom, labelLines, ticks };
}
