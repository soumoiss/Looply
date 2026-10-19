export function createPagedLoader({ pageSize = 30, fetchPage } = {}) {
  if (typeof fetchPage !== "function") throw new TypeError("fetchPage is required");
  let offset = 0;
  let cursor = null;
  let more = true;
  let loading = false;
  let rows = [];
  return {
    get hasMore() { return more && !loading; },
    get loading() { return loading; },
    get items() { return rows.slice(); },
    async loadNext() {
      if (!more || loading) return [];
      loading = true;
      try {
        const result = await fetchPage({ from: offset, to: offset + pageSize - 1, cursor });
        const nextRows = Array.isArray(result?.rows) ? result.rows : [];
        const seen = new Set(rows.map((row) => row?.id).filter(Boolean));
        const unique = nextRows.filter((row) => !row?.id || !seen.has(row.id));
        rows = rows.concat(unique);
        offset += nextRows.length;
        cursor = result?.nextCursor ?? cursor;
        more = result?.hasMore === undefined ? nextRows.length >= pageSize : Boolean(result.hasMore);
        if (!nextRows.length) more = false;
        return unique;
      } finally { loading = false; }
    },
    reset() { offset = 0; cursor = null; more = true; rows = []; }
  };
}
