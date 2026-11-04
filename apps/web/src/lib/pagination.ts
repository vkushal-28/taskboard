/** The path for one page of a feed: the first page has no cursor (ADR 014). */
export function pagePath(path: string, cursor: string | undefined): string {
  return cursor === undefined ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
}
