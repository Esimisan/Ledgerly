// Fetches every page of a list, 1,000 rows at a time, for a CSV export.
// fetchPage(page, pageSize) -> Promise<{ rows, total, error }> (the data/*.js list shape).
export const EXPORT_PAGE_SIZE = 1000; // PostgREST returns at most 1,000 rows per request
export const EXPORT_MAX_ROWS = 50000;

export async function collectRows(fetchPage, { onProgress, isCancelled } = {}) {
  const cancelled = { rows: [], cancelled: true, error: "" };
  const rows = [];
  let total = null;

  for (let page = 1; ; page += 1) {
    if (isCancelled?.()) return cancelled;
    const res = await fetchPage(page, EXPORT_PAGE_SIZE);
    if (res.error) return { rows: [], cancelled: false, error: res.error };

    if (total === null) {
      total = res.total;
      if (total > EXPORT_MAX_ROWS) {
        return {
          rows: [],
          cancelled: false,
          error: `This export has ${total.toLocaleString("en")} rows, which is more than the ${EXPORT_MAX_ROWS.toLocaleString("en")}-row limit. Narrow the filters or the dates and try again.`,
        };
      }
    }
    rows.push(...res.rows);
    onProgress?.(rows.length, total);
    if (res.rows.length < EXPORT_PAGE_SIZE || rows.length >= total) break;
  }

  if (isCancelled?.()) return cancelled;
  return { rows, cancelled: false, error: "" };
}
