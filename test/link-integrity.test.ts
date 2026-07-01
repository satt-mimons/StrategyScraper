import { test } from "node:test";
import assert from "node:assert/strict";
import { stripDisallowedLinks } from "../src/lib/utils.ts";

const allowed = new Set([
  "https://good.com/a",
  "https://good.com/b/", // stored with trailing slash
]);

test("keeps links whose URL is allowed", () => {
  const md = "See [source](https://good.com/a) for detail.";
  assert.equal(stripDisallowedLinks(md, allowed), md);
});

test("unwraps a disallowed link, keeping the visible text", () => {
  const md = "A [fabricated claim](https://evil.com/x) here.";
  assert.equal(stripDisallowedLinks(md, allowed), "A fabricated claim here.");
});

test("normalizes trailing slash — allowed url matches link without slash", () => {
  const md = "[b](https://good.com/b)";
  assert.equal(stripDisallowedLinks(md, allowed), md);
});

test("strips every occurrence of a disallowed url", () => {
  const md =
    "[one](https://evil.com/x) and [two](https://evil.com/x) and [ok](https://good.com/a)";
  assert.equal(
    stripDisallowedLinks(md, allowed),
    "one and two and [ok](https://good.com/a)"
  );
});

test("leaves text with no links unchanged", () => {
  const md = "Just prose, no links at all.";
  assert.equal(stripDisallowedLinks(md, allowed), md);
});

test("handles a mix of allowed and disallowed links in one line", () => {
  const md = "[keep](https://good.com/a), [drop](https://nope.com/y), plain text";
  assert.equal(
    stripDisallowedLinks(md, allowed),
    "[keep](https://good.com/a), drop, plain text"
  );
});
