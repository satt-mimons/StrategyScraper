// Registers the @/ alias resolve hook for the test runner (see alias-hooks.mjs).
// Wired via `node --import ./test/register-aliases.mjs` in the test script.
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
