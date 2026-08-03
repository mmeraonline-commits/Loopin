import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { GoogleGenAI } from "@google/genai";
import {
  type AgentAction,
  executeAgentAction,
  isConfirmPrompt,
} from "@/lib/agent-actions";
import { trackFeatureUsage } from "@/lib/track-feature-usage";
import {
  assertAiActionQuota,
  assertSendQuota,
  isNextResponse,
} from "@/lib/plan-usage";
import { loadUserPreferences } from "@/lib/briefing-delivery";
import { detailLevelGuide } from "@/lib/assistant-preferences";

async function fetchMcpText(origin: string, path: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      userId,
      prompt,
      history = [],
      confirmedAction = null,
      recentActionResults = [],
    } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server database key is not configured" }, { status: 500 });
    }

    const aiGate = await assertAiActionQuota(userId);
    if (isNextResponse(aiGate)) return aiGate;

    const { data: dbUser, error: dbError } = await insforgeAdmin.database
      .from("users")
      .select("integrations, dashboard_brief, plan, seats")
      .eq("id", userId)
      .maybeSingle();

    if (dbError || !dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const integrations = dbUser?.integrations || {};
    const isGmailConnected = !!integrations.gmail?.connected;
    const isWhatsAppConnected = !!integrations.whatsapp?.connected;
    const isSlackConnected = !!integrations.slack?.connected && !integrations.slack?.isSimulated;
    const isOutlookConnected = !!integrations.outlook?.connected && !integrations.outlook?.isSimulated;
    const isDiscordConnected = !!integrations.discord?.connected && !integrations.discord?.isSimulated;
    const isLinkedInConnected = !!integrations.linkedin?.connected && !integrations.linkedin?.isSimulated;
    const isCalendlyConnected = !!integrations.calendly?.connected && !integrations.calendly?.isSimulated;
    const isTelegramConnected = !!integrations.telegram?.connected;
    const isTeamsConnected = !!integrations.teams?.connected;
    const isNotionConnected = !!integrations.notion?.connected;
    const isGoogleCalendarConnected =
      !!integrations.google_calendar?.connected && !integrations.google_calendar?.isSimulated;

    const origin = req.nextUrl.origin;

    let gmailSummary = "No Gmail messages synced.";
    let whatsappSummary = "No WhatsApp messages synced.";
    let telegramSummary = "No Telegram messages synced.";
    let teamsSummary = "No Teams messages synced.";
    let slackSummary = "No Slack messages synced.";
    let outlookSummary = "No Outlook messages synced.";
    let outlookCalendarSummary = "No Outlook calendar events synced.";
    let googleCalendarSummary = "No Google Calendar events synced.";
    let discordSummary = "No Discord messages synced.";
    let linkedinSummary = "No LinkedIn profile synced.";
    let calendlySummary = "No Calendly events synced.";
    let notionSummary = "No Notion pages synced.";

    if (isGmailConnected) {
      const parsed = await fetchMcpText(origin, "/api/gmail-mcp", {
        method: "gmail_list_messages",
        params: { q: "label:inbox", maxResults: 5 },
        userId,
      });
      if (parsed?.messages?.length) {
        gmailSummary = parsed.messages
          .map(
            (m: any) =>
              `From: ${m.from}\nSubject: ${m.subject}\nSnippet: ${m.snippet}\nDate: ${m.date}\nID: ${m.id}`
          )
          .join("\n---\n");
      }
    }

    if (isWhatsAppConnected) {
      const parsed = await fetchMcpText(origin, "/api/whatsapp-mcp", {
        method: "whatsapp_get_recent_messages",
        userId,
      });
      if (parsed?.messages?.length) {
        whatsappSummary = parsed.messages
          .map(
            (m: any) =>
              `Chat: ${m.chatName}\nchatId: ${m.chatId || m.id || m.from}\nSender: ${m.from}\nBody: ${m.body}\nTimestamp: ${m.timestamp}`
          )
          .join("\n---\n");
      }
    }

    if (isTelegramConnected) {
      const parsed = await fetchMcpText(origin, "/api/telegram-mcp", {
        method: "telegram_get_recent_messages",
        userId,
      });
      if (parsed?.messages?.length) {
        telegramSummary = parsed.messages
          .map(
            (m: any) =>
              `Chat: ${m.chatName}\nchatId: ${m.chatId}\nmessageId: ${m.id}\nSender: ${m.from}\nBody: ${m.body}\nTimestamp: ${m.timestamp}`
          )
          .join("\n---\n");
      }
    }

    if (isTeamsConnected) {
      const parsed = await fetchMcpText(origin, "/api/teams-mcp", {
        method: "teams_get_recent_messages",
        userId,
      });
      if (parsed?.messages?.length) {
        teamsSummary = parsed.messages
          .map(
            (m: any) =>
              `Chat: ${m.chatName}\nchatId: ${m.chatId}\nmessageId: ${m.id}\nSender: ${m.from}\nBody: ${m.body || m.text}\nTimestamp: ${m.timestamp}`
          )
          .join("\n---\n");
      }
    }

    if (isSlackConnected) {
      const parsed = await fetchMcpText(origin, "/api/slack-mcp", {
        method: "slack_get_recent_messages",
        userId,
      });
      if (parsed?.messages?.length) {
        slackSummary = parsed.messages
          .map(
            (m: any) =>
              `Channel: #${m.channelName}\nchannelId: ${m.channelId}\nts: ${m.ts || ""}\nUser: ${m.user}\nText: ${m.text}\nTime: ${m.timestamp}`
          )
          .join("\n---\n");
      }
    }

    if (isOutlookConnected) {
      const parsed = await fetchMcpText(origin, "/api/outlook-mcp", {
        method: "outlook_list_messages",
        params: { maxResults: 5 },
        userId,
      });
      if (parsed?.messages?.length) {
        outlookSummary = parsed.messages
          .map(
            (m: any) =>
              `From: ${m.from}\nSubject: ${m.subject}\nSnippet: ${m.snippet}\nDate: ${m.date}\nID: ${m.id}`
          )
          .join("\n---\n");
      }

      const calendar = await fetchMcpText(origin, "/api/outlook-mcp", {
        method: "outlook_list_events",
        params: {
          timeMin: new Date().toISOString(),
          timeMax: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
        userId,
      });
      if (calendar?.events?.length) {
        outlookCalendarSummary = calendar.events
          .map(
            (e: any) =>
              `Title: ${e.title}\nStart: ${e.start}\nEnd: ${e.end}\nLocation: ${e.location || "n/a"}\nOnline: ${e.isOnlineMeeting ? "yes" : "no"}\nLink: ${e.htmlLink || e.webLink || "n/a"}\nID: ${e.id}`
          )
          .join("\n---\n");
      } else {
        outlookCalendarSummary = "Outlook connected — no upcoming events in the next 14 days.";
      }
    }

    if (isGoogleCalendarConnected) {
      const calendar = await fetchMcpText(origin, "/api/google-calendar-mcp", {
        method: "google_calendar_list_events",
        params: {
          timeMin: new Date().toISOString(),
          timeMax: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
        userId,
      });
      if (calendar?.events?.length) {
        googleCalendarSummary = calendar.events
          .map(
            (e: any) =>
              `Title: ${e.title}\nStart: ${e.start}\nEnd: ${e.end}\nLocation: ${e.location || "n/a"}\nLink: ${e.htmlLink || e.webLink || "n/a"}\nID: ${e.id}`
          )
          .join("\n---\n");
      } else {
        googleCalendarSummary =
          "Google Calendar connected — no upcoming events in the next 14 days.";
      }
    }

    if (isDiscordConnected) {
      const parsed = await fetchMcpText(origin, "/api/discord-mcp", {
        method: "discord_get_recent_messages",
        userId,
      });
      if (parsed?.messages?.length) {
        discordSummary = parsed.messages
          .map(
            (m: any) =>
              `Channel: #${m.channelName}\nchannelId: ${m.channelId}\nmessageId: ${m.id || m.messageId}\nAuthor: ${m.author}\nText: ${m.content}\nTime: ${m.timestamp}`
          )
          .join("\n---\n");
      }
    }

    if (isLinkedInConnected) {
      const profile = await fetchMcpText(origin, "/api/linkedin-mcp", {
        method: "linkedin_get_profile",
        userId,
      });
      if (profile) {
        linkedinSummary = `Name: ${profile.name}\nEmail: ${profile.email}\nID: ${profile.id}`;
      }
    }

    if (isCalendlyConnected) {
      const parsed = await fetchMcpText(origin, "/api/calendly-mcp", {
        method: "calendly_list_scheduled_events",
        params: { limit: 8 },
        userId,
      });
      if (parsed?.events?.length) {
        calendlySummary = parsed.events
          .map(
            (e: any) =>
              `Meeting: ${e.name}\nStart: ${e.start}\nEnd: ${e.end}\nLocation: ${e.location || "n/a"}\nStatus: ${e.status}`
          )
          .join("\n---\n");
      }
    }

    if (isNotionConnected) {
      const notionMeta = integrations.notion || {};
      const defaultHint =
        notionMeta.defaultParentPageId || notionMeta.defaultDatabaseId
          ? `\nDefault parent page: ${notionMeta.defaultParentPageTitle || "page"} (${notionMeta.defaultParentPageId || "n/a"})\nDefault database: ${notionMeta.defaultDatabaseTitle || "n/a"} (${notionMeta.defaultDatabaseId || "n/a"})\nWhen creating pages without an explicit parent, omit parentPageId/parentDatabaseId so the server uses these defaults. Never invent page IDs.`
          : `\nNo default parent set. Tell the user to open Integrations → Notion → Settings, search a shared page, and select it before creating pages. Never invent page IDs.`;

      const parsed = await fetchMcpText(origin, "/api/notion-mcp", {
        method: "notion_search",
        params: { limit: 8 },
        userId,
      });
      if (parsed?.results?.length) {
        notionSummary =
          parsed.results
            .map(
              (r: any) =>
                `Title: ${r.title}\nType: ${r.object}\nID: ${r.id}\nURL: ${r.url || "n/a"}`
            )
            .join("\n---\n") + defaultHint;
      } else {
        notionSummary =
          "Notion connected — no shared pages found yet. Ask the user to share pages/databases with the Loopin integration in Notion, then pick a default in Integrations → Notion → Settings." +
          defaultHint;
      }
    }

    // If the user confirmed a pending action, execute it for real before chatting.
    let actionReceipt: { ok: boolean; error?: string; result?: unknown; tool?: string } | null =
      null;
    const actionToRun: AgentAction | null =
      confirmedAction && typeof confirmedAction === "object" && confirmedAction.tool
        ? confirmedAction
        : null;

    if (actionToRun && isConfirmPrompt(prompt)) {
      const sendGate = await assertSendQuota(userId);
      if (isNextResponse(sendGate)) return sendGate;
      const exec = await executeAgentAction(actionToRun, userId, origin);
      actionReceipt = { ...exec, tool: actionToRun.tool };
    } else if (!actionToRun) {
      // Count non-confirm chat turns against AI action quota (already checked above).
      void trackFeatureUsage({ userId, feature: "ai_agent", action: "action" });
    }

    // Don't let the model rephrase action failures (it was doubling words like "WhatsAppWhatsApp").
    if (actionReceipt && !actionReceipt.ok) {
      return NextResponse.json({
        response: `Could not run **${actionReceipt.tool}**: ${actionReceipt.error}`,
        suggestions: ["Reconnect Outlook", "Show connected apps", "Try again"],
        pendingAction: null,
        actionResult: actionReceipt,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      if (actionReceipt?.ok) {
        return NextResponse.json({
          response: `Action completed via **${actionReceipt.tool}**.`,
          suggestions: ["Check my Discord", "Draft another reply", "Summarize unread messages"],
          pendingAction: null,
          actionResult: actionReceipt,
        });
      }
      return NextResponse.json({
        response:
          "Hello! I am in simulated mode since no `GEMINI_API_KEY` was configured.",
        suggestions: ["How do I connect Gmail?", "Check my updates", "Draft a template response"],
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const formatActionResultLine = (ar: {
      ok?: boolean;
      tool?: string;
      result?: unknown;
      error?: string;
    }) => {
      if (!ar?.tool) return "";
      if (!ar.ok) return `Last action: ${ar.tool} → FAILED: ${ar.error || "unknown"}`;
      const result = (ar.result && typeof ar.result === "object" ? ar.result : {}) as Record<
        string,
        unknown
      >;
      const link =
        (typeof result.htmlLink === "string" && result.htmlLink) ||
        (typeof result.webLink === "string" && result.webLink) ||
        "";
      const title =
        (typeof result.title === "string" && result.title) ||
        (typeof result.summary === "string" && result.summary) ||
        "";
      const extras = [
        title ? `title: ${title}` : "",
        link ? (result.htmlLink ? `htmlLink: ${link}` : `webLink: ${link}`) : "",
      ]
        .filter(Boolean)
        .join(", ");
      return extras
        ? `Last action: ${ar.tool} → ${extras}`
        : `Last action: ${ar.tool} → ${JSON.stringify(ar.result)}`;
    };

    const formattedHistory = history.map((h: any) => {
      let text = String(h.text || "");
      if (h.actionResult && typeof h.actionResult === "object") {
        const line = formatActionResultLine(h.actionResult);
        if (line) text = `${text}\n[${line}]`;
      }
      return {
        role: h.sender === "user" ? "user" : "model",
        parts: [{ text }],
      };
    });
    formattedHistory.push({ role: "user", parts: [{ text: prompt }] });

    const priorResults = [
      ...(Array.isArray(recentActionResults) ? recentActionResults : []),
      ...history
        .filter((h: any) => h?.actionResult && typeof h.actionResult === "object")
        .map((h: any) => h.actionResult),
    ]
      .filter((ar: any) => ar?.ok && ar?.tool)
      .slice(-5);
    const priorActionContext =
      priorResults.length > 0
        ? `\n\nRECENT ACTION RESULTS (from this chat session — reuse calendar links when the user asks to share/send "the event/reminder/link"):\n${priorResults
            .map((ar: any) => formatActionResultLine(ar))
            .filter(Boolean)
            .join("\n")}`
        : "";

    const actionNote = actionReceipt
      ? actionReceipt.ok
        ? `\n\nSYSTEM ACTION RESULT (authoritative): Successfully executed ${actionReceipt.tool}. Result: ${JSON.stringify(actionReceipt.result)}. You MUST tell the user it succeeded and include key details from the result (message sent, or calendar event title/time, and always echo Google htmlLink or Outlook webLink when present). Do NOT invent success details.`
        : `\n\nSYSTEM ACTION RESULT (authoritative): Failed to execute ${actionReceipt.tool}: ${actionReceipt.error}. You MUST tell the user it failed and show this error. Do NOT claim success.`
      : `\n\nSYSTEM ACTION RESULT: none yet.`;

    const prefs = await loadUserPreferences(userId);

    const systemPrompt = `You are Loopin, an advanced AI Personal Assistant.
You help the user stay productive across connected platforms.
User: ${prefs.displayName || "User"}
Context: ${prefs.roleContext}
Timezone: ${prefs.timezone}
${detailLevelGuide(prefs.detailLevel)}
${prefs.proactiveSuggestions ? "You may suggest proactive next actions." : "Do not push unsolicited suggestions; only answer what is asked."}

Synced data:
=== Gmail ===
${gmailSummary}

=== WhatsApp ===
${whatsappSummary}

=== Telegram ===
${telegramSummary}

=== Microsoft Teams ===
${teamsSummary}

=== Slack ===
${slackSummary}

=== Outlook mail ===
${outlookSummary}

=== Outlook calendar ===
${outlookCalendarSummary}

=== Google Calendar ===
${googleCalendarSummary}

=== Discord ===
${discordSummary}

=== LinkedIn ===
${linkedinSummary}

=== Calendly ===
${calendlySummary}

=== Notion ===
${notionSummary}
${actionNote}${priorActionContext}

CRITICAL ACTION RULES:
1. You CANNOT send messages or create calendar events by yourself. Draft first; a real tool runs only after user confirm.
2. When the user asks to reply/send on Discord/Slack/Gmail/WhatsApp/Telegram/Teams/LinkedIn, book/cancel/update Calendly, add/remind via Outlook or Google Calendar, or create/append Notion pages:
   - First return a draft and set pendingAction with the exact tool + params.
   - Ask them to confirm (they can click Confirm or type "yes"/"confirm"/"add it"/"schedule it").
3. NEVER say a message was sent / event created / booking created unless SYSTEM ACTION RESULT says Successfully executed.
4. For Discord replies use tool "discord_reply_message" with params:
   { "channelId": "...", "replyToMessageId": "...", "content": "..." }
   Use channelId and messageId from the Discord context above.
5. For Discord channel posts (not reply) use "discord_post_message" with channelId + content.
6. For Slack use "slack_post_message" with channelId + text (+ thread_ts optional).
7. For WhatsApp use "whatsapp_send_message" with to + body.
8. For Telegram use "telegram_send_message" with chatId + text, or "telegram_reply_message" with chatId + replyToMessageId + text.
9. For Microsoft Teams use "teams_send_message" with chatId + text, or "teams_reply_message" with chatId + replyToMessageId + text.
10. For Gmail use "gmail_send_message" with to + subject + body.
11. For LinkedIn share use "linkedin_post_share" with text.
12. For Calendly booking use "calendly_create_booking" with eventTypeUri + startTime (UTC ISO) + email (+ name/timezone).
13. For Calendly cancel use "calendly_cancel_event" with eventUuid (+ reason).
14. For Calendly event type edits use "calendly_update_event_type" with eventTypeUri + fields to change.
15. For Outlook calendar reminders/meetings use "outlook_create_event" with:
   { "summary": "event title", "start": "YYYY-MM-DDTHH:mm:ss", "end": "YYYY-MM-DDTHH:mm:ss", "timeZone": "${prefs.timezone}", "description": "optional notes", "reminderMinutesBeforeStart": 30 }
   Use the user's timezone (${prefs.timezone}). Prefer a short timed block (e.g. 15–30 minutes) near the deadline they mentioned. Do NOT invent that Outlook calendar is unavailable — the tool exists when Outlook is connected.
16. To refresh/list Outlook calendar beyond the synced window, use "outlook_list_events" with optional timeMin/timeMax (ISO). Still require confirm before running.
17. For Google Calendar use "google_calendar_create_event" with the same shape as Outlook create (summary/start/end/timeZone/description). List with "google_calendar_list_events".
18. If the user asks to share/send "the event", "the reminder", "the link", or similar after a calendar create in this chat, reuse the last known Google htmlLink or Outlook webLink from SYSTEM ACTION RESULT / RECENT ACTION RESULTS when drafting gmail/whatsapp/telegram/teams (or other) sends. Still draft + confirm before sending. Do not invent links.
19. For Notion: use "notion_search" with query; "notion_get_page" with pageId; "notion_query_database" with databaseId; create with "notion_create_page" (title + content; omit parent to use Integrations default parent — NEVER invent page IDs); append with "notion_append_blocks" (pageId optional if default set + text). Create/append require confirm. If create fails with "not shared", tell the user to share the page in Notion and set a default under Integrations → Notion → Settings.

Return EXACT JSON:
{
  "response": "markdown response...",
  "suggestions": ["Short 1?", "Short 2?", "Short 3?"],
  "pendingAction": null
}

When drafting an action that needs confirmation, set pendingAction like:
{
  "tool": "outlook_create_event",
  "params": { "summary": "StackSocial offer ends", "start": "2026-08-02T09:00:00", "end": "2026-08-02T09:30:00", "timeZone": "${prefs.timezone}", "description": "..." }
}

If SYSTEM ACTION RESULT already ran, set pendingAction to null.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }, ...formattedHistory],
      config: { responseMimeType: "application/json" },
    });

    const textResponse = response.text;
    if (!textResponse) {
      return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
    }

    try {
      const parsed = JSON.parse(textResponse);
      // Hard guard: never keep a pendingAction after a successful send claim without receipt
      if (actionReceipt) {
        parsed.pendingAction = null;
        parsed.actionResult = actionReceipt;
        if (actionReceipt.ok && /not sent|failed|could not|do not have access/i.test(String(parsed.response || ""))) {
          parsed.response = `Completed **${actionReceipt.tool}** successfully.\n\n${JSON.stringify(actionReceipt.result, null, 2)}`;
        }
        if (!actionReceipt.ok) {
          parsed.response = `Could not run **${actionReceipt.tool}**: ${actionReceipt.error}\n\n${parsed.response || ""}`;
        }
      }
      if (!parsed.suggestions) {
        parsed.suggestions = ["Confirm and send", "Edit the draft", "Show recent Discord messages"];
      }
      void trackFeatureUsage({ userId, feature: "ai_chat", action: "generate" });
      // ai_agent action already tracked above for non-confirm turns
      return NextResponse.json(parsed);
    } catch {
      void trackFeatureUsage({ userId, feature: "ai_chat", action: "generate" });
      return NextResponse.json({
        response: textResponse,
        suggestions: ["Can you summarize that?", "What should I do next?", "Draft a reply"],
        pendingAction: null,
        actionResult: actionReceipt,
      });
    }
  } catch (err: any) {
    console.error("Error in AI Chat API route:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
