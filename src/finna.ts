// HelMet (Helsinki-region libraries) catalog, via the National Library's open
// Finna REST API — https://api.finna.fi/. No API key. HelMet records are scoped
// with the `building:0/Helmet/` filter. This is a metadata API: it does NOT
// expose real-time on-shelf status, only which branches hold a copy at all.

export type Author = { name: string; role?: string };

export type Record = {
  id: string;
  title: string;
  authors: Author[];
  year?: string;
  formats: string[]; // translated, e.g. "Kirja", "E-kirja", "CD"
  languages: string[];
  /** Branch names that hold a copy (level-2 buildings), e.g. "Pasila", "Sello". */
  branches: string[];
  isbn?: string;
  summary?: string;
  subjects: string[];
  /** Links to e-book / e-audio / streaming versions, when the record has them. */
  onlineUrls: { url: string; text?: string }[];
  image?: string;
  url: string; // human record page on helmet.finna.fi
};

export type Facet = { value: string; label: string; count: number };

export type SearchResult = {
  records: Record[];
  total: number;
  page: number;
  lastPage: number;
  /** Keyed by facet name; only the names passed in `opts.facets` appear. */
  facets: { [name: string]: Facet[] };
};

const API = "https://api.finna.fi/api/v1";
const HELMET = 'building:0/Helmet/';
const RECORD_PAGE = "https://helmet.finna.fi/Record";

const FIELDS = [
  "id", "title", "nonPresenterAuthors", "year", "formats", "languages",
  "buildings", "cleanIsbn", "summary", "subjects", "onlineUrls", "images",
];

const HEADERS = {
  accept: "application/json",
  "accept-language": "fi-FI,fi;q=0.9,en;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

// ponytail: one request in flight + 500ms gap. It's an official API shared by
// every Finna consortium — don't hammer it. Token bucket if throughput matters.
let chain: Promise<unknown> = Promise.resolve();
function polite<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn);
  chain = next.then(() => Bun.sleep(500), () => Bun.sleep(500));
  return next as Promise<T>;
}

async function getJson(path: string): Promise<any> {
  return polite(async () => {
    const res = await fetch(`${API}${path}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`Finna returned HTTP ${res.status} for ${path}`);
    const json = (await res.json()) as any;
    if (json.status === "ERROR") throw new Error(`Finna: ${json.statusMessage}`);
    return json;
  });
}

const SORTS = {
  relevance: "relevance,id asc",
  newest: "main_date_str desc",
  oldest: "main_date_str asc",
  title: "title",
  author: "author",
} as const;
export type Sort = keyof typeof SORTS;

export type SearchOpts = {
  page?: number;
  limit?: number;
  sort?: Sort;
  /**
   * Extra Finna filter params as Lucene fragments, e.g.
   * { format: '1/Book/Book/', language: 'fin', search_daterange_mv: '[2015 TO 2020]' }.
   * `free_online_boolean: '1'` restricts to titles with a free e-version.
   */
  filters?: { [k: string]: string | string[] };
  /** Facet names to tally, e.g. ["format", "language", "building", "author_facet"]. */
  facets?: string[];
};

function qs(params: [string, string][]): string {
  const u = new URLSearchParams();
  for (const [k, v] of params) u.append(k, v);
  return u.toString();
}

function mapRecord(r: any): Record {
  const branches = (r.buildings ?? [])
    .filter((b: any) => String(b.value).startsWith("2/Helmet/"))
    .map((b: any) => b.translated as string);
  return {
    id: r.id,
    title: r.title ?? "(untitled)",
    authors: (r.nonPresenterAuthors ?? []).map((a: any) => ({ name: a.name, role: a.role })),
    year: r.year,
    formats: uniq((r.formats ?? []).map((f: any) => f.translated)),
    languages: r.languages ?? [],
    branches: uniq(branches),
    isbn: r.cleanIsbn,
    summary: Array.isArray(r.summary) ? r.summary.join(" ") : r.summary,
    subjects: uniq((r.subjects ?? []).flat().map(String)),
    onlineUrls: (r.onlineUrls ?? []).map((o: any) => ({ url: o.url, text: o.text })),
    image: r.images?.[0] ? `https://api.finna.fi${r.images[0]}` : undefined,
    url: `${RECORD_PAGE}/${encodeURIComponent(r.id)}`,
  };
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs.filter((x) => x != null && x !== ""))];
}

export async function search(query: string, opts: SearchOpts = {}): Promise<SearchResult> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const params: [string, string][] = [
    ["lookfor", query],
    ["type", "AllFields"],
    ["filter[]", HELMET],
    ["sort", SORTS[opts.sort ?? "relevance"]],
    ["page", String(opts.page ?? 1)],
    ["limit", String(limit)],
  ];
  for (const f of FIELDS) params.push(["field[]", f]);
  for (const [k, v] of Object.entries(opts.filters ?? {})) {
    for (const one of Array.isArray(v) ? v : [v]) params.push(["filter[]", `${k}:"${one}"`]);
  }
  for (const f of opts.facets ?? []) params.push(["facet[]", f]);

  const json = await getJson(`/search?${qs(params)}`);
  const total: number = json.resultCount ?? 0;

  const facets: { [name: string]: Facet[] } = {};
  for (const [name, list] of Object.entries<any>(json.facets ?? {})) {
    facets[name] = (list as any[]).map((f) => ({
      value: f.value,
      label: f.translated ?? f.value,
      count: f.count,
    }));
  }

  return {
    records: (json.records ?? []).map(mapRecord),
    total,
    page: opts.page ?? 1,
    lastPage: Math.max(1, Math.ceil(total / limit)),
    facets,
  };
}

export async function getRecord(id: string): Promise<Record | null> {
  const params: [string, string][] = [["id", id]];
  for (const f of FIELDS) params.push(["field[]", f]);
  // Finna answers an unknown id with HTTP 400 "Error loading record".
  const json = await getJson(`/record?${qs(params)}`).catch((e) => {
    if (String(e).includes("HTTP 400") || /Error loading record/.test(String(e))) return null;
    throw e;
  });
  const rec = json?.records?.[0];
  return rec ? mapRecord(rec) : null;
}

export type Availability = {
  record: Record;
  /** Branches that hold a copy (collection-level, not live shelf status). */
  branches: string[];
  formats: string[];
  /** True if the record links a free online version. */
  online: boolean;
  /** Other close matches from the same search, so you can pick a different edition. */
  alternatives: { id: string; title: string; year?: string; formats: string[] }[];
};

/**
 * "Where can I borrow <title>": run the search, take the top hit, report its
 * branches + formats + whether an e-version exists. Alternatives are the next
 * few hits (other editions / translations).
 */
export async function whereToBorrow(query: string): Promise<Availability | null> {
  const { records } = await search(query, { limit: 6, sort: "relevance" });
  const top = records[0];
  if (!top) return null;
  return {
    record: top,
    branches: top.branches,
    formats: top.formats,
    online: top.onlineUrls.length > 0,
    alternatives: records.slice(1).map((r) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      formats: r.formats,
    })),
  };
}
