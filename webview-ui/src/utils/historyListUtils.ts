export function filterHistoryRuns(history: any[], query: string): any[] {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return history;
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return history.filter((run: any) => {
    const name = String(run?.name || '').toLowerCase();
    const status = String(run?.status || '').toLowerCase();
    const time = new Date(run?.timestamp || 0).toLocaleTimeString().toLowerCase();
    const prs = Array.isArray(run?.pullRequests) ? run.pullRequests : [];
    const prHaystack = prs.map((entry: any) => {
      const title = String(entry?.title || '');
      const url = String(entry?.url || '');
      const head = String(entry?.head || '');
      const base = String(entry?.base || '');
      const state = String(entry?.state || '');
      const number = String(entry?.number || '');
      const draft = entry?.isDraft ? 'draft' : '';
      return `${title} ${url} ${head} ${base} ${state} ${number} ${draft}`;
    }).join(' ').toLowerCase();
    const haystack = `${name} ${status} ${time} ${prHaystack}`;
    return terms.every((term) => haystack.includes(term));
  });
}

type ComputeHistoryWindowOptions = {
  total: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  overscan: number;
};

export function computeHistoryWindow(options: ComputeHistoryWindowOptions): {
  startIndex: number;
  visibleCount: number;
  endIndex: number;
} {
  const {
    total,
    scrollTop,
    viewportHeight,
    rowHeight,
    overscan
  } = options;
  const safeRowHeight = Math.max(1, rowHeight);
  const safeOverscan = Math.max(0, overscan);
  const startIndex = Math.max(0, Math.floor(scrollTop / safeRowHeight) - safeOverscan);
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / safeRowHeight) + safeOverscan * 2);
  const endIndex = Math.min(total, startIndex + visibleCount);
  return { startIndex, visibleCount, endIndex };
}
