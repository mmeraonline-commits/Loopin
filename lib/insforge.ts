import { createClient } from "@insforge/sdk";

// Browser-safe InsForge client. Only public project values belong here because
// this module is imported by Client Components and API routes.
const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL || "https://3ewxfrr2.us-east.insforge.app";
const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2ODcyMTV9.P1S_tU083Bp2wZreDffcM8UTbHqrzh5YIJRGov35c8g";

export const insforge = createClient({
  baseUrl,
  anonKey,
});
