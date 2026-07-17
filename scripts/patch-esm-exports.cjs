/**
 * Patch ESM-only packages that omit "main"/"require" so tsx/CJS loaders can resolve them.
 * Used by the WhatsApp worker Docker image.
 */
const fs = require("fs");
const path = require("path");

function resolveImportEntry(imp) {
  if (typeof imp === "string") return imp;
  if (!imp || typeof imp !== "object") return null;
  if (typeof imp.default === "string") return imp.default;
  for (const v of Object.values(imp)) {
    if (typeof v === "string") return v;
  }
  return null;
}

function patchPkg(dir) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return;
  let j;
  try {
    j = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return;
  }
  const exp = j.exports && j.exports["."];
  if (!exp || typeof exp !== "object" || Array.isArray(exp)) return;
  if (exp.require) return;
  const entry = resolveImportEntry(exp.import) || j.main || j.module;
  if (!entry || typeof entry !== "string") return;
  j.main = j.main || entry;
  exp.require = entry;
  exp.default = exp.default || entry;
  j.exports["."] = exp;
  fs.writeFileSync(pkgPath, JSON.stringify(j, null, 2));
  console.log("patched", path.relative(process.cwd(), dir));
}

function walk(dir, depth = 0) {
  if (depth > 5) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === ".bin") continue;
    const full = path.join(dir, e.name);
    if (e.name.startsWith("@")) {
      walk(full, depth);
      continue;
    }
    patchPkg(full);
    const nested = path.join(full, "node_modules");
    if (fs.existsSync(nested)) walk(nested, depth + 1);
  }
}

walk(path.join(process.cwd(), "node_modules"));
