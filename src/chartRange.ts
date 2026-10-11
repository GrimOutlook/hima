export interface ChartDateRange {
  startDate?: string;
  endDate?: string;
}

export interface ChartIndexRange {
  startIndex: number;
  endIndex: number;
}

// Sorted ISO dates allow logarithmic lookup, including omitted weekend dates.
export function dateBoundary(history: { date: string }[], date: string, after = false): number {
  let low = 0;
  let high = history.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const middleDate = history[middle]!.date;
    if (middleDate < date || (after && middleDate === date)) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function chartRangeIndices(history: { date: string }[], range: ChartDateRange): ChartIndexRange {
  const lastIndex = Math.max(0, history.length - 1);
  const start = range.startDate === undefined ? 0 : dateBoundary(history, range.startDate);
  const afterEnd = range.endDate === undefined ? history.length : dateBoundary(history, range.endDate, true);
  const startIndex = Math.min(start, lastIndex);
  const endIndex = Math.max(0, afterEnd - 1);
  return { startIndex, endIndex: Math.max(startIndex, endIndex) };
}

export function chartRangeDates(history: { date: string }[], range: ChartIndexRange): ChartDateRange {
  return { startDate: history[range.startIndex]?.date, endDate: history[range.endIndex]?.date };
}
