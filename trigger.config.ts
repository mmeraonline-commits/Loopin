import { defineConfig } from "@trigger.dev/sdk/v3";

// Replace with YOUR project ref from https://cloud.trigger.dev
// Project → Settings → Project ref (starts with proj_)
export default defineConfig({
  project: "proj_orsybofdqfzievasbghf",
  runtime: "node",
  logLevel: "log",
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["trigger"],
});
