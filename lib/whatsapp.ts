/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/rules-of-hooks */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  ConnectionState,
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "path";
import fs from "fs";
import { insforgeAdmin } from "@/lib/insforge-admin";

export interface Chat {
  id: string;
  name?: string;
  unreadCount?: number;
}

export interface Message {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
    imageMessage?: {
      caption?: string;
    };
    videoMessage?: {
      caption?: string;
    };
    documentMessage?: {
      caption?: string;
      fileName?: string;
    };
  };
  messageTimestamp: number;
}

export interface Contact {
  id: string;
  name?: string;
  notify?: string;
  verifiedName?: string;
  phone?: string;
}

export function normalizeWhatsAppTimestamp(ts: unknown): number {
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  if (ts && typeof ts === "object") {
    const maybeLong = ts as { toNumber?: () => number; low?: number };
    if (typeof maybeLong.toNumber === "function") {
      return maybeLong.toNumber();
    }
    if (typeof maybeLong.low === "number") {
      return maybeLong.low;
    }
  }
  if (typeof ts === "string" && ts.trim() !== "") {
    const n = Number(ts);
    if (Number.isFinite(n)) return n;
  }
  return Math.floor(Date.now() / 1000);
}

export function extractWhatsAppText(msg: any): string {
  const m = msg?.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.documentMessage?.fileName ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    ""
  );
}

export class WhatsAppStore {
  private userId: string;
  private storePath: string;

  public chats: Chat[] = [];
  public messages: Record<string, Message[]> = {};
  public contacts: Record<string, Contact> = {};

  constructor(userId: string, sessionDir: string) {
    this.userId = userId;
    this.storePath = path.join(sessionDir, "store.json");
    this.load();
  }

  private load() {
    if (fs.existsSync(this.storePath)) {
      try {
        const raw = fs.readFileSync(this.storePath, "utf-8");
        const data = JSON.parse(raw);
        this.chats = data.chats || [];
        this.messages = data.messages || {};
        this.contacts = data.contacts || {};
      } catch (e) {
        console.error("Failed to load WhatsApp store from file:", e);
      }
    }
  }

  public save() {
    try {
      const data = {
        chats: this.chats,
        messages: this.messages,
        contacts: this.contacts
      };
      fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      console.error("Failed to save WhatsApp store to file:", e);
    }
  }

  public hasSyncedData() {
    return this.chats.length > 0 || Object.keys(this.messages).length > 0;
  }

  private upsertChat(chat: any) {
    if (!chat?.id) return;
    const index = this.chats.findIndex(c => c.id === chat.id);
    if (index !== -1) {
      this.chats[index] = { ...this.chats[index], ...chat };
    } else {
      this.chats.push({
        id: chat.id,
        name: chat.name || chat.subject || chat.id,
        unreadCount: chat.unreadCount
      });
    }
  }

  private upsertMessage(msg: any) {
    const chatId = msg?.key?.remoteJid;
    if (!chatId || chatId === "status@broadcast") return;

    if (!this.messages[chatId]) {
      this.messages[chatId] = [];
    }

    const normalized = {
      ...msg,
      messageTimestamp: normalizeWhatsAppTimestamp(msg.messageTimestamp)
    };

    const index = this.messages[chatId].findIndex(m => m.key?.id === msg.key?.id);
    if (index !== -1) {
      this.messages[chatId][index] = { ...this.messages[chatId][index], ...normalized };
    } else {
      this.messages[chatId].push(normalized);
    }

    if (this.messages[chatId].length > 100) {
      this.messages[chatId] = this.messages[chatId].slice(-100);
    }

    const chatIndex = this.chats.findIndex(c => c.id === chatId);
    if (chatIndex === -1) {
      this.chats.push({
        id: chatId,
        name: msg.pushName || this.contacts[chatId]?.name || this.contacts[chatId]?.notify || chatId
      });
    }
  }

  public bind(ev: any) {
    ev.on("messaging-history.set", ({ chats, messages, contacts }: any) => {
      if (Array.isArray(chats)) {
        chats.forEach((chat: any) => this.upsertChat(chat));
      }

      if (Array.isArray(messages)) {
        messages.forEach((msg: any) => this.upsertMessage(msg));
      }

      if (Array.isArray(contacts)) {
        contacts.forEach((contact: any) => {
          if (contact?.id) {
            this.contacts[contact.id] = { ...this.contacts[contact.id], ...contact };
          }
        });
      }
      this.save();
      console.log(
        `[WhatsAppStore] History sync for ${this.userId}: ${this.chats.length} chats, ${Object.keys(this.messages).length} threads`
      );
    });

    ev.on("chats.upsert", (newChats: any[]) => {
      if (!Array.isArray(newChats)) return;
      newChats.forEach((chat: any) => this.upsertChat(chat));
      this.save();
    });

    ev.on("chats.update", (updates: any[]) => {
      if (!Array.isArray(updates)) return;
      updates.forEach((update: any) => this.upsertChat(update));
      this.save();
    });

    ev.on("messages.upsert", ({ messages: newMsgs }: any) => {
      if (!Array.isArray(newMsgs)) return;
      newMsgs.forEach((msg: any) => this.upsertMessage(msg));
      this.save();
    });

    ev.on("contacts.upsert", (newContacts: any[]) => {
      if (!Array.isArray(newContacts)) return;
      newContacts.forEach((contact: any) => {
        if (contact?.id) {
          this.contacts[contact.id] = { ...this.contacts[contact.id], ...contact };
        }
      });
      this.save();
    });

    ev.on("contacts.update", (updates: any[]) => {
      if (!Array.isArray(updates)) return;
      updates.forEach((update: any) => {
        if (update?.id) {
          this.contacts[update.id] = { ...this.contacts[update.id], ...update };
        }
      });
      this.save();
    });
  }
}

export interface WhatsAppSession {
  sock: any;
  store: WhatsAppStore;
  status: "disconnected" | "connecting" | "connected";
  pairingCode?: string;
  phoneNumber?: string;
  reconnectAttempts?: number;
}

// Global mapping to survive Next.js hot-reloads
const globalForWhatsApp = global as unknown as {
  whatsappSessions?: Record<string, WhatsAppSession>;
  whatsappReconnectTimers?: Record<string, ReturnType<typeof setTimeout>>;
  whatsappReconnectAttempts?: Record<string, number>;
};

if (!globalForWhatsApp.whatsappSessions) {
  globalForWhatsApp.whatsappSessions = {};
}
if (!globalForWhatsApp.whatsappReconnectTimers) {
  globalForWhatsApp.whatsappReconnectTimers = {};
}
if (!globalForWhatsApp.whatsappReconnectAttempts) {
  globalForWhatsApp.whatsappReconnectAttempts = {};
}

export const whatsappSessions = globalForWhatsApp.whatsappSessions;
const whatsappReconnectTimers = globalForWhatsApp.whatsappReconnectTimers;
const whatsappReconnectAttempts = globalForWhatsApp.whatsappReconnectAttempts;

const SESSION_DIR_BASE =
  process.env.WHATSAPP_SESSION_DIR?.trim() ||
  path.join(/*turbopackIgnore: true*/ process.cwd(), ".whatsapp-sessions");
const MAX_RECONNECT_ATTEMPTS = 5;

function clearReconnectTimer(userId: string) {
  const timer = whatsappReconnectTimers[userId];
  if (timer) {
    clearTimeout(timer);
    delete whatsappReconnectTimers[userId];
  }
}

function clearSessionDir(userId: string) {
  const sessionDir = path.join(SESSION_DIR_BASE, userId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (err) {
      console.error("Failed to delete WhatsApp session directory:", err);
    }
  }
}

async function markWhatsAppDisconnected(userId: string) {
  try {
    const { data: dbUser } = await insforgeAdmin.database
      .from("users")
      .select("integrations")
      .eq("id", userId)
      .maybeSingle();

    if (!dbUser) return;

    const currentIntegrations = dbUser.integrations || {};
    if (!currentIntegrations.whatsapp) return;

    await insforgeAdmin.database
      .from("users")
      .update({
        integrations: {
          ...currentIntegrations,
          whatsapp: null
        }
      })
      .eq("id", userId);
  } catch (err) {
    console.error("Failed to clear WhatsApp integration in database:", err);
  }
}

export function getSessionDir(userId: string) {
  const dir = path.join(SESSION_DIR_BASE, userId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getWhatsAppSession(userId: string): WhatsAppSession | undefined {
  return whatsappSessions[userId];
}

export function hasWhatsAppAuth(userId: string) {
  return fs.existsSync(path.join(getSessionDir(userId), "creds.json"));
}

export async function waitForWhatsAppReady(
  session: WhatsAppSession,
  {
    connectTimeoutMs = 15000,
    historyTimeoutMs = 20000
  }: { connectTimeoutMs?: number; historyTimeoutMs?: number } = {}
) {
  const connectDeadline = Date.now() + connectTimeoutMs;
  while (session.status !== "connected" && session.status !== "disconnected" && Date.now() < connectDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (session.status !== "connected") {
    return session;
  }

  if (session.store.hasSyncedData()) {
    return session;
  }

  const historyDeadline = Date.now() + historyTimeoutMs;
  while (!session.store.hasSyncedData() && session.status === "connected" && Date.now() < historyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return session;
}

async function waitForSocketReadyForPairing(session: WhatsAppSession, timeoutMs = 8000) {
  if (session.status === "connected" || session.pairingCode) return;

  await new Promise<void>((resolve) => {
    const sock = session.sock;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      sock.ev.off("connection.update", onUpdate);
      resolve();
    };

    const onUpdate = (update: Partial<ConnectionState>) => {
      // Baileys docs: wait for QR/connecting before requesting pairing code.
      if (update.qr || update.connection === "open" || update.connection === "connecting") {
        finish();
      }
    };

    sock.ev.on("connection.update", onUpdate);
    setTimeout(finish, timeoutMs);
  });

  // Extra settle time — requesting too early causes Connection Closed (428).
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

async function requestPairingCodeWithRetry(
  userId: string,
  session: WhatsAppSession,
  phoneNumber: string,
) {
  const cleanNumber = phoneNumber.replace(/[^\d]/g, "");
  await waitForSocketReadyForPairing(session);

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      if (whatsappSessions[userId] !== session || session.status === "connected") {
        return;
      }

      const code = await session.sock.requestPairingCode(cleanNumber);

      if (whatsappSessions[userId] === session) {
        session.pairingCode = code;
        console.log(`Generated pairing code for ${cleanNumber}: ${code}`);
      }
      return;
    } catch (err) {
      console.error(`Failed to generate pairing code (attempt ${attempt}/4):`, err);

      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}

export async function initWhatsAppConnection(
  userId: string,
  phoneNumber?: string,
  options?: { forceNew?: boolean }
): Promise<WhatsAppSession> {
  clearReconnectTimer(userId);

  // Fresh pairing must wipe stale auth files.
  if (options?.forceNew) {
    if (whatsappSessions[userId]) {
      const existing = whatsappSessions[userId];
      try {
        existing.sock?.end?.(undefined);
      } catch {
        // ignore
      }
      delete whatsappSessions[userId];
    }
    clearSessionDir(userId);
    delete whatsappReconnectAttempts[userId];
  }

  // If already connected/connecting, return it
  if (!options?.forceNew && whatsappSessions[userId]) {
    const session = whatsappSessions[userId];
    if (
      session.status === "connected" ||
      (session.status === "connecting" && (session.pairingCode || !phoneNumber || session.phoneNumber === phoneNumber))
    ) {
      return session;
    }

    try {
      session.sock?.end?.(undefined);
    } catch {
      // ignore
    }
    delete whatsappSessions[userId];
  }

  const sessionDir = getSessionDir(userId);
  const logger = pino({ level: "silent" });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const isRegistered = Boolean(state.creds?.registered);
  const store = new WhatsAppStore(userId, sessionDir);

  // Keep socket config simple (matches working symphony daemon).
  // History sync can be enabled later once the session is stable.
  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    getMessage: async (key) => {
      const chatId = key.remoteJid;
      if (!chatId) return undefined;
      const existing = store.messages[chatId]?.find((m) => m.key?.id === key.id);
      return existing?.message;
    }
  });

  store.bind(sock.ev);

  const previousAttempts = whatsappReconnectAttempts[userId] || 0;
  const session: WhatsAppSession = {
    sock,
    store,
    status: "connecting",
    phoneNumber,
    reconnectAttempts: options?.forceNew ? 0 : previousAttempts,
  };

  whatsappSessions[userId] = session;

  // Persist creds immediately — critical before 515 restart reconnect.
  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
    } catch (err) {
      console.error("Failed to save WhatsApp creds:", err);
    }
  });

  sock.ev.on("connection.update", async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      session.status = "connecting";
    }

    if (connection === "open") {
      session.status = "connected";
      session.pairingCode = undefined;
      session.reconnectAttempts = 0;
      delete whatsappReconnectAttempts[userId];
      clearReconnectTimer(userId);
      console.log(`WhatsApp connected for user ${userId}`);

      try {
        const { data: dbUser } = await insforgeAdmin.database
          .from("users")
          .select("integrations")
          .eq("id", userId)
          .maybeSingle();

        const currentIntegrations = dbUser?.integrations || {};
        await insforgeAdmin.database
          .from("users")
          .update({
            integrations: {
              ...currentIntegrations,
              whatsapp: {
                connected: true,
                phoneNumber: phoneNumber || session.phoneNumber || "",
                isSimulated: false,
                connectedAt: new Date().toISOString()
              }
            }
          })
          .eq("id", userId);
      } catch (err) {
        console.error("Failed to update database on WhatsApp connected:", err);
      }
    }

    if (connection === "close") {
      const statusCode =
        (lastDisconnect?.error as any)?.output?.statusCode ||
        (lastDisconnect?.error as any)?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      const badSession = statusCode === DisconnectReason.badSession;
      const restartRequired = statusCode === DisconnectReason.restartRequired;
      const attempts = (session.reconnectAttempts || 0) + 1;
      const stillCurrent = whatsappSessions[userId] === session;

      // 515 after pairing is expected — reconnect with saved creds.
      // Transient closes (428/408) should also reconnect for linked sessions.
      const shouldReconnect =
        stillCurrent &&
        !loggedOut &&
        !badSession &&
        attempts <= MAX_RECONNECT_ATTEMPTS;

      console.log(
        `WhatsApp connection closed for user ${userId}. Status: ${statusCode}. Reconnecting: ${shouldReconnect} (attempt ${attempts})`
      );

      clearReconnectTimer(userId);

      if (whatsappSessions[userId] === session) {
        delete whatsappSessions[userId];
      }

      if (shouldReconnect) {
        whatsappReconnectAttempts[userId] = attempts;
        // Give creds.update time to flush before opening a new socket (especially for 515).
        const delayMs = restartRequired ? 2000 : 3500;
        whatsappReconnectTimers[userId] = setTimeout(() => {
          delete whatsappReconnectTimers[userId];
          initWhatsAppConnection(userId, phoneNumber || session.phoneNumber).catch(console.error);
        }, delayMs);
      } else if (loggedOut || badSession || attempts > MAX_RECONNECT_ATTEMPTS) {
        delete whatsappReconnectAttempts[userId];
        clearSessionDir(userId);
        await markWhatsAppDisconnected(userId);
      }
    }
  });

  if (!isRegistered && phoneNumber) {
    // Don't await — connect API polls session.pairingCode.
    requestPairingCodeWithRetry(userId, session, phoneNumber).catch((err) => {
      console.error("Failed to generate pairing code:", err);
    });
  }

  return session;
}

export async function disconnectWhatsApp(userId: string) {
  clearReconnectTimer(userId);
  delete whatsappReconnectAttempts[userId];

  const session = whatsappSessions[userId];
  if (session) {
    try {
      session.sock?.end?.(undefined);
    } catch {
      // Safe fallback
    }
    delete whatsappSessions[userId];
  }

  clearSessionDir(userId);
  await markWhatsAppDisconnected(userId);
}
