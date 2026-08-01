/** Public app origin for server/Trigger → Worker HTTP calls. Never localhost. */

const PRODUCTION_APP_URL = "https://omnisync.mamutech-online.workers.dev";

function isLocalUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

export function resolveAppUrl(): string {
  const candidates = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    PRODUCTION_APP_URL,
  ];
  for (const raw of candidates) {
    const url = String(raw || "")
      .trim()
      .replace(/\/$/, "");
    if (url && /^https?:\/\//i.test(url) && !isLocalUrl(url)) return url;
  }
  return PRODUCTION_APP_URL;
}
