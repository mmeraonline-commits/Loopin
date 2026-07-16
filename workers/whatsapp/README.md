# Example Railway / Docker Compose volume for Baileys sessions.
# Railway: attach a volume mounted at /data/whatsapp-sessions
# Env required:
#   WHATSAPP_WORKER_SECRET
#   INSFORGE_API_KEY (or whatever lib/insforge-admin reads)
#   NEXT_PUBLIC_INSFORGE_URL
#   NEXT_PUBLIC_INSFORGE_ANON_KEY (if needed by admin client)
# Optional:
#   WHATSAPP_SESSION_DIR=/data/whatsapp-sessions
#   PORT=8787
