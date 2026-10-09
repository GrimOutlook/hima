export interface ChartDateRange {
  startDate?: string;
  endDate?: string;
}

export interface ChartIndexRange {
  startIndex: number;
  endIndex: number;
}

export function chartRangeIndices(history: { date: string }[], range: ChartDateRange): ChartIndexRange {
  const lastIndex = Math.max(0, history.length - 1);
  const start = range.startDate === undefined ? 0 : history.findIndex((point) => point.date >= range.startDate!);
  const afterEnd = range.endDate === undefined ? -1 : history.findIndex((point) => point.date > range.endDate!);
  const startIndex = start < 0 ? lastIndex : start;
  const endIndex = afterEnd < 0 ? lastIndex : Math.max(0, afterEnd - 1);
  return { startIndex, endIndex: Math.max(startIndex, endIndex) };
}

export function chartRangeDates(history: { date: string }[], range: ChartIndexRange): ChartDateRange {
  return { startDate: history[range.startIndex]?.date, endDate: history[range.endIndex]?.date };
}
