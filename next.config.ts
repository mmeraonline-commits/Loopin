import type { NextConfig } from "next";
import path from "path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const cloudflareDeploy =
  process.env.OPENNEXT_CLOUDFLARE === "1" ||
  process.env.DEPLOY_TARGET === "cloudflare";

const nextConfig: NextConfig = {
  // Keep Baileys out of the Cloudflare Worker — it runs on the dedicated WhatsApp worker.
  serverExternalPackages: cloudflareDeploy
    ? []
    : ["@whiskeysockets/baileys", "pino"],
  webpack: (config) => {
    if (cloudflareDeploy) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "@/lib/whatsapp": path.resolve(__dirname, "lib/whatsapp.cloudflare-stub.ts"),
        "@whiskeysockets/baileys": false,
        pino: false,
      };
    }
    return config;
  },
};

export default nextConfig;

// Only needed for `next dev` + Cloudflare bindings — skip during OpenNext production builds.
if (process.env.NODE_ENV !== "production") {
  initOpenNextCloudflareForDev();
}
