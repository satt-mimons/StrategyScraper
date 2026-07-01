import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEditPatches } from "../src/lib/patch.ts";

test("applies a single edit correctly", () => {
  const draft = "The quick brown fox.";
  const out = applyEditPatches(draft, [
    { find: "quick brown", replace: "slow red" },
  ]);
  assert.equal(out, "The slow red fox.");
});

test("applies multiple edits in order", () => {
  const draft = "## TLDR\n- alpha point\n- beta point";
  const out = applyEditPatches(draft, [
    { find: "alpha point", replace: "**Alpha:** sharp take" },
    { find: "beta point", replace: "**Beta:** sharp take" },
  ]);
  assert.equal(out, "## TLDR\n- **Alpha:** sharp take\n- **Beta:** sharp take");
});

test("returns draft unchanged for empty op list", () => {
  const draft = "nothing to do here";
  assert.equal(applyEditPatches(draft, []), draft);
});

test("treats $ sequences in replacement literally", () => {
  const draft = "price is X here";
  const out = applyEditPatches(draft, [{ find: "X", replace: "$1,000 ($&)" }]);
  assert.equal(out, "price is $1,000 ($&) here");
});

test("throws when find is not present", () => {
  assert.throws(
    () => applyEditPatches("hello world", [{ find: "missing", replace: "x" }]),
    /not found in draft/
  );
});

test("throws when find is ambiguous", () => {
  assert.throws(
    () => applyEditPatches("the the the", [{ find: "the", replace: "a" }]),
    /ambiguous \(3 matches\)/
  );
});

test("throws on empty find", () => {
  assert.throws(
    () => applyEditPatches("abc", [{ find: "", replace: "x" }]),
    /empty `find`/
  );
});

test("throws on malformed op", () => {
  assert.throws(
    () =>
      applyEditPatches("abc", [
        { find: "a" } as unknown as { find: string; replace: string },
      ]),
    /malformed/
  );
});

test("throws when a non-array is passed", () => {
  assert.throws(
    () =>
      applyEditPatches("abc", null as unknown as { find: string; replace: string }[]),
    /array of edit operations/
  );
});

test("edit that becomes ambiguous after a prior edit throws", () => {
  // First edit introduces a second "foo"; second op's find is then ambiguous.
  assert.throws(
    () =>
      applyEditPatches("foo bar", [
        { find: "bar", replace: "foo" },
        { find: "foo", replace: "baz" },
      ]),
    /ambiguous/
  );
});
