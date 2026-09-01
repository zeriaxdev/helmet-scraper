import { test, expect } from "bun:test";
import { search, getRecord, whereToBorrow } from "./finna";

// Hits the live Finna API. Skip the file (`bun test --test-name-pattern nope`)
// or set OFFLINE=1 to bypass when there's no network.
const online = !process.env.OFFLINE;
const maybe = online ? test : test.skip;

maybe("search returns HelMet records with branches", async () => {
  const r = await search("murakami", { limit: 5 });
  expect(r.total).toBeGreaterThan(0);
  expect(r.records.length).toBeGreaterThan(0);
  expect(r.records[0]!.id).toStartWith("helmet.");
  expect(r.lastPage).toBeGreaterThanOrEqual(1);
});

maybe("filters and facets are applied", async () => {
  const r = await search("sapiens", {
    limit: 2,
    filters: { format: "1/Book/Book/", language: "fin" },
    facets: ["format"],
  });
  expect(r.records.every((x) => x.formats.includes("Kirja"))).toBe(true);
  expect(r.facets.format?.length).toBeGreaterThan(0);
});

maybe("getRecord round-trips an id from search", async () => {
  const { records } = await search("kalevala", { limit: 1 });
  const id = records[0]!.id;
  const rec = await getRecord(id);
  expect(rec?.id).toBe(id);
});

maybe("getRecord returns null for a bogus id", async () => {
  expect(await getRecord("helmet.0000000000")).toBeNull();
});

maybe("whereToBorrow names branches for a well-stocked title", async () => {
  const a = await whereToBorrow("harry potter viisasten kivi");
  expect(a).not.toBeNull();
  expect(a!.branches.length).toBeGreaterThan(0);
  expect(a!.formats.length).toBeGreaterThan(0);
});
