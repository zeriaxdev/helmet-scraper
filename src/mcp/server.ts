import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { search, getRecord, whereToBorrow } from "../finna";

const SEARCH_FORMAT = `Search the HelMet library catalogue (Helsinki, Espoo, Vantaa, Kauniainen) via the open Finna API.

DISPLAY: one card row per result:

![](image)
**Title** (year) — Author
Kirja · E-kirja · CD  ·  branches: Pasila, Sello, Vuosaari
\`ID: helmet.2491253\`

ID small/muted so it can be passed to get_record. No tables. Show total match count at the bottom.
"branches" is which libraries own a copy — NOT whether it's on the shelf right now (the API doesn't expose live status).`;

const RECORD_FORMAT = `Get one catalogue record by its Finna ID.

DISPLAY:

![](image)

### Title (year)
Author · Kirja, E-kirja · language

Summary text, if any.

**Owned by:** comma-separated branch names
**Subjects:** comma-separated
**Online:** link(s) to any e-book / e-audio version
[View on HelMet →](url)`;

const BORROW_FORMAT = `Answer "where can I borrow X". Runs a search, takes the best match, lists the branches that own it, the formats, and whether a free online version exists.

DISPLAY: lead with the answer.

**<Title> (year)** — available as Kirja, E-kirja
Owned by: Pasila, Sello, Herttoniemi, ...  (N branches)
Free online version: yes/no  [link]

Then "Other editions" as a short list of title (year) — formats — ID, for picking a different translation or format.
Remind the reader these are collection holdings, not live availability — check helmet.finna.fi or the library for on-shelf status.`;

const FilterSchema = z
  .record(z.string(), z.union([z.string(), z.array(z.string())]))
  .optional()
  .describe(
    'Finna filter fragments, e.g. { format: "1/Book/Book/", language: "fin", search_daterange_mv: "[2015 TO 2020]", free_online_boolean: "1" }. Take values from a previous result\'s facets.',
  );

/** Register the three catalogue tools on a server. Shared by the stdio and HTTP entrypoints. */
export function registerTools(server: McpServer) {
  server.tool(
    "search",
    SEARCH_FORMAT,
    {
      query: z.string().describe("Search terms, e.g. 'murakami kafka rannalla'"),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      sort: z.enum(["relevance", "newest", "oldest", "title", "author"]).default("relevance"),
      filters: FilterSchema,
      facets: z
        .array(z.string())
        .optional()
        .describe('Facet fields to tally, e.g. ["format", "language", "building", "author_facet"]'),
    },
    async ({ query, page, limit, sort, filters, facets }) => {
      const result = await search(query, { page, limit, sort, filters, facets });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "get_record",
    RECORD_FORMAT,
    { id: z.string().describe("Finna record ID, e.g. 'helmet.2491253'") },
    async ({ id }) => {
      const rec = await getRecord(id);
      if (!rec) {
        return { content: [{ type: "text" as const, text: `Record ${id} not found.` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(rec, null, 2) }] };
    },
  );

  server.tool(
    "where_to_borrow",
    BORROW_FORMAT,
    { title: z.string().describe("A book/film/album title, optionally with author") },
    async ({ title }) => {
      const result = await whereToBorrow(title);
      if (!result) {
        return {
          content: [{ type: "text" as const, text: `Nothing in HelMet matched "${title}".` }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}

// stdio entrypoint — only runs when executed directly, not when imported by http.ts
if (import.meta.main) {
  const server = new McpServer({ name: "helmet", version: "0.1.0" });
  registerTools(server);
  await server.connect(new StdioServerTransport());
}
