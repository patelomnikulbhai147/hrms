/**
 * pagination.js — one place that turns raw `?page=&pageSize=` query values into a
 * safe Prisma window, and one place that shapes the metadata every paginated
 * endpoint returns.
 *
 * Why it is shared: a paginated list is only correct if the window the database
 * reads and the numbers the UI prints agree. Deriving `totalPages` in one file
 * and `skip` in another is how "Page 18 of 18" ends up empty.
 *
 * Client input is never trusted:
 *   • page     — floored at 1; garbage ("abc", "-3", "") reads as 1.
 *   • pageSize — clamped to [1, MAX_PAGE_SIZE]; garbage reads as the caller's
 *     default. The ceiling is what stops `?pageSize=999999` from being a way to
 *     ask for the whole table anyway.
 */

/** Hard ceiling on rows per request, whatever the caller asks for. */
const MAX_PAGE_SIZE = 200;

/** Coerce to a positive integer, or return `fallback`. */
const posInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Resolve a request's page window.
 * @returns {{page:number, take:number, skip:number}} — feed `take`/`skip`
 *   straight to Prisma, and pass `page` to `pageMeta` so both agree.
 */
function pageWindow(page, pageSize, defaultSize = 20) {
  const safeDefault = Math.min(MAX_PAGE_SIZE, posInt(defaultSize, 20));
  const take = Math.min(MAX_PAGE_SIZE, posInt(pageSize, safeDefault));
  const pageNo = posInt(page, 1);
  return { page: pageNo, take, skip: (pageNo - 1) * take };
}

/**
 * The metadata contract shared by every paginated response.
 *
 * `total` / `limit` / `totalPages` are kept alongside the newer
 * `totalRecords` / `pageSize` names so existing readers of either spelling keep
 * working — the pair always carries the same number.
 */
function pageMeta(total, page, take) {
  const totalRecords = Number(total) || 0;
  const pageSize = take > 0 ? take : 1;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  // A page beyond the end still reports honestly rather than claiming a "next".
  const current = Math.max(1, page);
  return {
    page: current,
    pageSize,
    limit: pageSize,
    total: totalRecords,
    totalRecords,
    totalPages,
    hasNext: current < totalPages && totalRecords > 0,
    hasPrevious: current > 1,
  };
}

module.exports = { pageWindow, pageMeta, MAX_PAGE_SIZE };
