process.env.OPENNEXT_CLOUDFLARE = "1";
process.env.DEPLOY_TARGET = "cloudflare";
const { spawnSync } = require("child_process");
const r1 = spawnSync(
  process.execPath,
  [
    "--require",
    "./scripts/fs-symlink-fallback.cjs",
    "./node_modules/@opennextjs/cloudflare/dist/cli/index.js",
    "build",
  ],
  { stdio: "inherit", env: process.env }
);
if (r1.status) process.exit(r1.status || 1);
const r2 = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["opennextjs-cloudflare", "deploy"],
  { stdio: "inherit", env: process.env, shell: true }
);
process.exit(r2.status || 0);
