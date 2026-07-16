/**
 * Always-on WhatsApp Baileys worker.
 * Deploy on Railway / Render / Fly with a persistent volume mounted at WHATSAPP_SESSION_DIR.
 *
 * Auth: every request must include header X-Worker-Secret matching WHATSAPP_WORKER_SECRET.
 */
import http from "http";
import {
  disconnectWhatsApp,
  extractWhatsAppText,
  getWhatsAppSession,
  hasWhatsAppAuth,
  initWhatsAppConnection,
  normalizeWhatsAppTimestamp,
  waitForWhatsAppReady,
} from "../../lib/whatsapp";
import { hasInsforgeAdminKey, insforgeAdmin } from "../../lib/insforge-admin";

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.WHATSAPP_WORKER_SECRET || "";

type Json = Record<string, unknown>;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: Json | unknown
) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function unauthorized(res: http.ServerResponse) {
  sendJson(res, 401, { error: "Unauthorized" });
}

async function handleConnect(body: Json) {
  const action = String(body.action || "");
  const userId = String(body.userId || "");
  const phoneNumber = body.phoneNumber ? String(body.phoneNumber) : undefined;

  if (!userId) {
    return { status: 400, data: { error: "User ID is required." } };
  }

  if (action === "connect") {
    if (!phoneNumber) {
      return { status: 400, data: { error: "Phone number is required for connection." } };
    }

    await disconnectWhatsApp(userId);
    let session = await initWhatsAppConnection(userId, phoneNumber, { forceNew: true });

    if (session.status === "connecting" && !session.pairingCode) {
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        session = getWhatsAppSession(userId) ?? session;
        if (session.status === "connected" || session.pairingCode) break;
      }
    }

    if (session.status !== "connected" && !session.pairingCode) {
      return {
        status: 504,
        data: {
          error:
            "Could not generate a WhatsApp pairing code. Check the phone number (with country code) and try again.",
          status: session.status,
        },
      };
    }

    return {
      status: 200,
      data: {
        success: true,
        status: session.status,
        pairingCode: session.pairingCode,
      },
    };
  }

  if (action === "status") {
    const session = getWhatsAppSession(userId);

    if (!session) {
      const { data: dbUser } = await insforgeAdmin.database
        .from("users")
        .select("integrations")
        .eq("id", userId)
        .maybeSingle();

      const integrations = dbUser?.integrations || {};
      if (integrations.whatsapp?.connected) {
        if (integrations.whatsapp.isSimulated) {
          return {
            status: 200,
            data: { success: true, status: "connected", isSimulated: true },
          };
        }

        if (!hasWhatsAppAuth(userId)) {
          await disconnectWhatsApp(userId);
          return { status: 200, data: { success: true, status: "disconnected" } };
        }

        initWhatsAppConnection(userId, integrations.whatsapp.phoneNumber).catch(console.error);
        return { status: 200, data: { success: true, status: "connecting" } };
      }

      return { status: 200, data: { success: true, status: "disconnected" } };
    }

    return {
      status: 200,
      data: {
        success: true,
        status: session.status,
        pairingCode: session.pairingCode,
      },
    };
  }

  if (action === "disconnect") {
    await disconnectWhatsApp(userId);
    return { status: 200, data: { success: true, status: "disconnected" } };
  }

  return { status: 400, data: { error: "Invalid action." } };
}

async function handleNotify(body: Json) {
  const userId = String(body.userId || "");
  const title = String(body.title || "Loopin Alert");
  const textBody = String(body.body || "");
  const url = body.url ? String(body.url) : undefined;
  const phoneNumber = body.phoneNumber ? String(body.phoneNumber) : undefined;

  if (!userId || !textBody) {
    return { status: 400, data: { ok: false, error: "userId and body are required" } };
  }

  let phone = String(phoneNumber || "").replace(/[^\d]/g, "");
  if (!phone) {
    const { data: dbUser } = await insforgeAdmin.database
      .from("users")
      .select("integrations")
      .eq("id", userId)
      .maybeSingle();
    phone = String(dbUser?.integrations?.whatsapp?.phoneNumber || "").replace(/[^\d]/g, "");
  }

  if (phone.length < 8) {
    return {
      status: 400,
      data: { ok: false, error: "No WhatsApp phone number on file." },
    };
  }

  if (!hasWhatsAppAuth(userId)) {
    return {
      status: 503,
      data: { ok: false, error: "WhatsApp session expired. Reconnect from Integrations." },
    };
  }

  let session = getWhatsAppSession(userId);
  if (!session || session.status === "disconnected") {
    session = await initWhatsAppConnection(userId, phone);
  }
  await waitForWhatsAppReady(session, { connectTimeoutMs: 20000, historyTimeoutMs: 0 });

  if (session.status !== "connected") {
    return {
      status: 503,
      data: { ok: false, error: `WhatsApp is ${session.status}` },
    };
  }

  const jid = `${phone}@s.whatsapp.net`;
  const text = [`*Loopin Alert*`, title, "", textBody, url ? `\nOpen: ${url}` : ""]
    .filter(Boolean)
    .join("\n");

  await session.sock.sendMessage(jid, { text });
  return { status: 200, data: { ok: true, to: jid } };
}

async function handleMcp(body: Json) {
  const method = String(body.method || "");
  const params = (body.params || {}) as Record<string, any>;
  const userId = String(body.userId || "");
  const id = body.id ?? 1;

  if (!method || !userId) {
    return {
      status: 400,
      data: {
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request: method and userId are required" },
        id,
      },
    };
  }

  if (!hasInsforgeAdminKey) {
    return {
      status: 500,
      data: {
        jsonrpc: "2.0",
        error: { code: -32003, message: "Server database key is not configured." },
        id,
      },
    };
  }

  const { data: dbUser } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  const whatsapp = dbUser?.integrations?.whatsapp;
  if (!whatsapp?.connected || whatsapp.isSimulated) {
    return {
      status: 400,
      data: {
        jsonrpc: "2.0",
        error: { code: -32001, message: "WhatsApp integration is not connected." },
        id,
      },
    };
  }

  if (!hasWhatsAppAuth(userId)) {
    try {
      await disconnectWhatsApp(userId);
    } catch (err) {
      console.error("Failed to clear stale WhatsApp session:", err);
    }
    return {
      status: 503,
      data: {
        jsonrpc: "2.0",
        error: {
          code: -32002,
          message:
            "WhatsApp session expired (local auth files missing). Open Integrations and reconnect WhatsApp.",
        },
        id,
      },
    };
  }

  let session = getWhatsAppSession(userId);
  if (!session || session.status === "disconnected") {
    session = await initWhatsAppConnection(userId, whatsapp.phoneNumber);
  }
  await waitForWhatsAppReady(session);

  if (session.status !== "connected") {
    return {
      status: 503,
      data: {
        jsonrpc: "2.0",
        error: {
          code: -32002,
          message: `WhatsApp connection is currently ${session.status}. Reconnect from Integrations if this persists.`,
        },
        id,
      },
    };
  }

  const { sock, store } = session;
  let result: any = null;
  let error: any = null;

  switch (method) {
    case "whatsapp_get_recent_messages": {
      const chatIds = new Set<string>();
      store.chats.forEach((c: any) => {
        if (c?.id) chatIds.add(c.id);
      });
      Object.keys(store.messages).forEach((chatId) => chatIds.add(chatId));

      const messages = Array.from(chatIds)
        .filter((chatId) => chatId !== "status@broadcast")
        .map((chatId) => {
          const chat = store.chats.find((c: any) => c.id === chatId);
          const contact = store.contacts[chatId];
          const chatMsgs = store.messages[chatId] || [];
          const lastMsg = chatMsgs[chatMsgs.length - 1];
          const ts = normalizeWhatsAppTimestamp(lastMsg?.messageTimestamp);
          return {
            chatId,
            chatName:
              chat?.name ||
              contact?.name ||
              contact?.notify ||
              contact?.verifiedName ||
              lastMsg?.pushName ||
              chatId,
            from: lastMsg?.pushName || (lastMsg?.key?.fromMe ? "Me" : "Contact"),
            body: extractWhatsAppText(lastMsg),
            timestamp: new Date(ts * 1000).toISOString(),
            fromMe: !!lastMsg?.key?.fromMe,
          };
        })
        .filter((m) => m.body || (store.messages[m.chatId] || []).length > 0)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 30);

      result = {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                messages,
                meta: {
                  connected: true,
                  chatCount: store.chats.length,
                  threadCount: Object.keys(store.messages).length,
                  note:
                    messages.length === 0
                      ? "Connected, but no synced messages yet. Keep WhatsApp open on your phone, send/receive a message, then retry."
                      : undefined,
                },
              },
              null,
              2
            ),
          },
        ],
      };
      break;
    }

    case "whatsapp_get_chat_history": {
      const chatId = params?.chatId;
      const limit = params?.limit || 20;
      if (!chatId) {
        error = { code: -32602, message: "Argument 'chatId' is required" };
        break;
      }
      const rawMsgs = store.messages[chatId] || [];
      const history = rawMsgs.slice(-limit).map((m: any) => {
        const ts = normalizeWhatsAppTimestamp(m.messageTimestamp);
        return {
          messageId: m.key?.id,
          from: m.pushName || (m.key?.fromMe ? "Me" : "Unknown"),
          body: extractWhatsAppText(m),
          timestamp: new Date(ts * 1000).toISOString(),
          fromMe: !!m.key?.fromMe,
        };
      });
      result = { content: [{ type: "text", text: JSON.stringify({ messages: history }, null, 2) }] };
      break;
    }

    case "whatsapp_send_message": {
      const { to, body: msgBody } = params || {};
      if (!to || !msgBody) {
        error = { code: -32602, message: "Arguments 'to' and 'body' are required" };
        break;
      }
      let jid = String(to).trim();
      if (!jid.includes("@")) {
        const digits = jid.replace(/[^\d]/g, "");
        if (digits.length >= 8) {
          jid = `${digits}@s.whatsapp.net`;
        } else {
          const needle = jid.toLowerCase();
          const contactHit = Object.values(store.contacts || {}).find((c: any) => {
            const name = String(c?.name || c?.notify || c?.verifiedName || "").toLowerCase();
            return name && (name === needle || name.includes(needle));
          }) as { id?: string } | undefined;
          const chatHit = store.chats.find((c: any) => {
            const name = String(c?.name || "").toLowerCase();
            return name && (name === needle || name.includes(needle));
          });
          const resolved = contactHit?.id || chatHit?.id;
          if (!resolved) {
            error = {
              code: -32602,
              message: `Could not resolve "${to}" to a WhatsApp number/JID.`,
            };
            break;
          }
          jid = resolved;
        }
      }
      const sent = await sock.sendMessage(jid, { text: msgBody });
      result = {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                messageId: sent.key.id,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
      break;
    }

    case "whatsapp_search_chats": {
      const query = params?.query || "";
      const lowerQuery = query.toLowerCase();
      const chats = store.chats
        .filter(
          (c: any) =>
            (c.name || "").toLowerCase().includes(lowerQuery) ||
            c.id.toLowerCase().includes(lowerQuery)
        )
        .map((c: any) => ({
          chatId: c.id,
          name: c.name || c.id,
          isGroup: c.id.endsWith("@g.us"),
        }));
      result = { content: [{ type: "text", text: JSON.stringify({ chats }, null, 2) }] };
      break;
    }

    case "whatsapp_summarize_conversations": {
      const chatId = params?.chatId;
      let msgs: any[] = [];
      if (chatId) {
        msgs = store.messages[chatId] || [];
      } else {
        store.chats.slice(0, 10).forEach((c: any) => {
          msgs.push(...(store.messages[c.id] || []).slice(-3));
        });
      }
      const contentSummaries = msgs.map((m: any) => {
        const sender = m.pushName || (m.key?.fromMe ? "Me" : "Contact");
        return `${sender}: "${extractWhatsAppText(m)}"`;
      });
      const summary =
        contentSummaries.length > 0
          ? `Summary of recent logs:\n${contentSummaries.join("\n")}`
          : "No active message logs found to summarize.";
      result = { content: [{ type: "text", text: JSON.stringify({ summary }, null, 2) }] };
      break;
    }

    case "whatsapp_get_contact_details": {
      const jidOrPhone = params?.jidOrPhone;
      if (!jidOrPhone) {
        error = { code: -32602, message: "Argument 'jidOrPhone' is required" };
        break;
      }
      let jid = jidOrPhone;
      if (!jidOrPhone.includes("@")) {
        jid = `${jidOrPhone.replace(/[^\d]/g, "")}@s.whatsapp.net`;
      }
      const contact = store.contacts[jid] || { id: jid };
      result = { content: [{ type: "text", text: JSON.stringify(contact, null, 2) }] };
      break;
    }

    case "whatsapp_list_groups": {
      const groups = store.chats
        .filter((c: any) => c.id.endsWith("@g.us"))
        .map((c: any) => ({ id: c.id, name: c.name || c.id }));
      result = { content: [{ type: "text", text: JSON.stringify({ groups }, null, 2) }] };
      break;
    }

    case "whatsapp_get_group_messages": {
      const groupId = params?.groupId;
      const limit = params?.limit || 20;
      if (!groupId || !groupId.endsWith("@g.us")) {
        error = { code: -32602, message: "Argument 'groupId' must end with @g.us" };
        break;
      }
      const rawMsgs = store.messages[groupId] || [];
      const messages = rawMsgs.slice(-limit).map((m: any) => ({
        messageId: m.key?.id,
        from: m.pushName || "Group Contact",
        body: m.message?.conversation || m.message?.extendedTextMessage?.text || "",
        timestamp: m.messageTimestamp
          ? new Date(m.messageTimestamp * 1000).toISOString()
          : new Date().toISOString(),
      }));
      result = { content: [{ type: "text", text: JSON.stringify({ messages }, null, 2) }] };
      break;
    }

    case "whatsapp_send_group_messages":
    case "whatsapp_send_group_message": {
      const { groupId, body: msgBody } = params || {};
      if (!groupId || !msgBody) {
        error = { code: -32602, message: "Arguments 'groupId' and 'body' are required" };
        break;
      }
      const sent = await sock.sendMessage(groupId, { text: msgBody });
      result = {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                messageId: sent.key.id,
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
      break;
    }

    default:
      error = { code: -32601, message: `Method not found: ${method}` };
  }

  const responseFrame = error
    ? { jsonrpc: "2.0", error, id }
    : { jsonrpc: "2.0", result, id };

  return {
    status: error ? 400 : 200,
    data: { result, error, responseFrame },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    sendJson(res, 200, { ok: true, service: "whatsapp-worker" });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!SECRET || req.headers["x-worker-secret"] !== SECRET) {
    unauthorized(res);
    return;
  }

  try {
    const raw = await readBody(req);
    const body = (raw ? JSON.parse(raw) : {}) as Json;
    const path = (req.url || "/").split("?")[0];

    if (path === "/connect" || path === "/status" || path === "/disconnect") {
      // /status and /disconnect map via action field; /connect also accepts action
      if (path === "/status" && !body.action) body.action = "status";
      if (path === "/disconnect" && !body.action) body.action = "disconnect";
      if (path === "/connect" && !body.action) body.action = "connect";
      const out = await handleConnect(body);
      sendJson(res, out.status, out.data);
      return;
    }

    if (path === "/mcp") {
      const out = await handleMcp(body);
      sendJson(res, out.status, out.data);
      return;
    }

    if (path === "/notify") {
      const out = await handleNotify(body);
      sendJson(res, out.status, out.data);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[whatsapp-worker]", err);
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : "Internal Server Error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`[whatsapp-worker] listening on :${PORT}`);
  if (!SECRET) {
    console.warn("[whatsapp-worker] WHATSAPP_WORKER_SECRET is not set");
  }
});
