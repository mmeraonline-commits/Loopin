/**
 * Windows OpenNext workaround: fall back to copying when symlink is EPERM.
 * Load with: node --require ./scripts/fs-symlink-fallback.cjs ...
 */
const fs = require("fs");
const path = require("path");

function copyInstead(target, dest) {
  const resolved = path.isAbsolute(target)
    ? target
    : path.resolve(path.dirname(dest), target);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(resolved, dest, { recursive: true, dereference: true });
}

const origSync = fs.symlinkSync.bind(fs);
fs.symlinkSync = function symlinkSyncFallback(target, dest, type) {
  try {
    return origSync(target, dest, type);
  } catch (err) {
    if (err && (err.code === "EPERM" || err.code === "EEXIST")) {
      copyInstead(target, dest);
      return;
    }
    throw err;
  }
};

const origPromise = fs.promises.symlink.bind(fs.promises);
fs.promises.symlink = async function symlinkPromiseFallback(target, dest, type) {
  try {
    return await origPromise(target, dest, type);
  } catch (err) {
    if (err && (err.code === "EPERM" || err.code === "EEXIST")) {
      copyInstead(target, dest);
      return;
    }
    throw err;
  }
};
