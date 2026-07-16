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
    const { userId, prompt, history = [], confirmedAction = null } = await req.json();

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

    const origin = req.nextUrl.origin;

    let gmailSummary = "No Gmail messages synced.";
    let whatsappSummary = "No WhatsApp messages synced.";
    let slackSummary = "No Slack messages synced.";
    let outlookSummary = "No Outlook messages synced.";
    let discordSummary = "No Discord messages synced.";
    let linkedinSummary = "No LinkedIn profile synced.";
    let calendlySummary = "No Calendly events synced.";

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
        response: `Could not send via **${actionReceipt.tool}**: ${actionReceipt.error}`,
        suggestions: ["Reconnect WhatsApp", "Try Discord instead", "Show connected apps"],
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
    const formattedHistory = history.map((h: any) => ({
      role: h.sender === "user" ? "user" : "model",
      parts: [{ text: h.text }],
    }));
    formattedHistory.push({ role: "user", parts: [{ text: prompt }] });

    const actionNote = actionReceipt
      ? actionReceipt.ok
        ? `\n\nSYSTEM ACTION RESULT (authoritative): Successfully executed ${actionReceipt.tool}. Result: ${JSON.stringify(actionReceipt.result)}. You MUST tell the user it was sent successfully and include channel/message details from the result. Do NOT invent a send.`
        : `\n\nSYSTEM ACTION RESULT (authoritative): Failed to execute ${actionReceipt.tool}: ${actionReceipt.error}. You MUST tell the user it was NOT sent and show this error. Do NOT claim success.`
      : `\n\nSYSTEM ACTION RESULT: none yet.`;

    const systemPrompt = `You are Loopin, an advanced AI Personal Assistant.
You help the user stay productive across connected platforms.

Synced data:
=== Gmail ===
${gmailSummary}

=== WhatsApp ===
${whatsappSummary}

=== Slack ===
${slackSummary}

=== Outlook ===
${outlookSummary}

=== Discord ===
${discordSummary}

=== LinkedIn ===
${linkedinSummary}

=== Calendly ===
${calendlySummary}
${actionNote}

CRITICAL SEND RULES:
1. You CANNOT send messages by yourself. Drafting is text-only until a real tool runs.
2. When the user asks to reply/send on Discord/Slack/Gmail/WhatsApp/LinkedIn, or book/cancel/update Calendly:
   - First return a draft and set pendingAction with the exact tool + params.
   - Ask them to confirm (they can click Confirm or type "yes"/"confirm"/"send it").
3. NEVER say a message was sent / booking created unless SYSTEM ACTION RESULT says Successfully executed.
4. For Discord replies use tool "discord_reply_message" with params:
   { "channelId": "...", "replyToMessageId": "...", "content": "..." }
   Use channelId and messageId from the Discord context above.
5. For Discord channel posts (not reply) use "discord_post_message" with channelId + content.
6. For Slack use "slack_post_message" with channelId + text (+ thread_ts optional).
7. For WhatsApp use "whatsapp_send_message" with to + body.
8. For Gmail use "gmail_send_message" with to + subject + body.
9. For LinkedIn share use "linkedin_post_share" with text.
10. For Calendly booking use "calendly_create_booking" with eventTypeUri + startTime (UTC ISO) + email (+ name/timezone).
11. For Calendly cancel use "calendly_cancel_event" with eventUuid (+ reason).
12. For Calendly event type edits use "calendly_update_event_type" with eventTypeUri + fields to change.

Return EXACT JSON:
{
  "response": "markdown response...",
  "suggestions": ["Short 1?", "Short 2?", "Short 3?"],
  "pendingAction": null
}

When drafting a send that needs confirmation, set pendingAction like:
{
  "tool": "discord_reply_message",
  "params": { "channelId": "...", "replyToMessageId": "...", "content": "draft text" }
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
        if (actionReceipt.ok && /not sent|failed|could not/i.test(String(parsed.response || ""))) {
          parsed.response = `Sent via **${actionReceipt.tool}** successfully.\n\n${JSON.stringify(actionReceipt.result, null, 2)}`;
        }
        if (!actionReceipt.ok) {
          parsed.response = `Could not send via **${actionReceipt.tool}**: ${actionReceipt.error}\n\n${parsed.response || ""}`;
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
