# helmet

HelMet library catalogue (Helsinki, Espoo, Vantaa, Kauniainen), exposed over MCP.
Same shape as `tori`: no cache, no DB, no scheduler.

Not a scraper — HelMet's catalogue (`helmet.finna.fi`) is part of **Finna**, run
by the National Library of Finland, which has an open REST API at
`https://api.finna.fi/`. No API key. HelMet records are scoped with the
`building:0/Helmet/` filter. `src/finna.ts` is a thin client over
`/search` and `/record`.

## Tools

| tool | what |
|:--|:--|
| `search` | terms, page, sort, filters, facets → records with owning branches |
| `get_record` | Finna ID → full metadata (authors, subjects, summary, e-links, branches) |
| `where_to_borrow` | a title → branches that own it, formats, free-online flag, other editions |

`filters` are Lucene fragments taken from a previous result's facets, e.g.
`{ format: "1/Book/Book/", language: "fin", search_daterange_mv: "[2015 TO 2020]",
free_online_boolean: "1" }`.

## Availability caveat

The open API returns **collection holdings** — which branches own a copy — not
real-time shelf status. There is no "3 available at Pasila right now" in
`api.finna.fi`; that lives behind the Finna web UI's authenticated ILS calls.
For live status, check `helmet.finna.fi` or the library.

## Legality

Finna's API is meant for programmatic use. Metadata is mostly CC0/CC-BY (a few
source-specific restrictions). This client only reads public catalogue data —
no accounts, no personal data. House rules still apply: one request in flight,
500 ms gap, real User-Agent.

## Run

```sh
bun install
bun test          # hits the live API; set OFFLINE=1 to skip
bun run mcp       # stdio MCP server (src/mcp/server.ts)
bun run mcp:http  # streamable-HTTP MCP server on $MCP_PORT (default 3001), for hosting
claude mcp add helmet -- bun "$(pwd)/src/mcp/server.ts"   # run from the repo root
```

For a remote (hosted) server: `claude mcp add --transport http helmet https://<host>/mcp`.

## Not here

- **Real-time availability** — needs the authenticated Finna online interface /
  ILS. Would be `helmet.finna.fi/AJAX/JSON?method=getItemStatuses` scraping;
  skipped on purpose.
- **Personal account** (loans, holds, fees, renew) — needs per-user credentials.
  Different tool, different legal posture. Not wired up.
- No cache / scheduler / DB — stateless by design; add if a request ever needs it.
