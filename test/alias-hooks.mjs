// Test-only module resolve hook: maps the project's "@/..." tsconfig alias to ./src and
// probes extensions/index files so the bare `node --test` runner can import real source
// modules (which use extensionless @/ imports). Not used by the app build (Next handles
// aliases there) — this exists purely so unit tests can import from src.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function probe(base) {
  const cands = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + ".mjs",
    base + ".json",
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js"),
  ];
  for (const c of cands) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let baseFs = null;
  if (specifier.startsWith("@/")) {
    baseFs = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (context.parentURL && context.parentURL.startsWith("file:")) {
      baseFs = fileURLToPath(new URL(specifier, context.parentURL));
    }
  }
  if (baseFs) {
    const hit = probe(baseFs);
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return next(specifier, context);
}
