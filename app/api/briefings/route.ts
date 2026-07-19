import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { GoogleGenAI } from "@google/genai";
import { format } from "date-fns";
import { trackFeatureUsage } from "@/lib/track-feature-usage";
import { loadUserPreferences, deliverBriefingToChannels } from "@/lib/briefing-delivery";
import { detailLevelGuide } from "@/lib/assistant-preferences";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const id = searchParams.get("id");

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    if (id) {
      const { data, error } = await insforgeAdmin.database
        .from("generated_briefings")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: "Briefing not found" }, { status: 404 });
      return NextResponse.json(data);
    } else {
      const { data, error } = await insforgeAdmin.database
        .from("generated_briefings")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data || []);
    }
  } catch (err: any) {
    console.error("Error in GET /api/briefings:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, scheduleId } = await req.json();
    const origin = req.nextUrl.origin;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const prefs = await loadUserPreferences(userId);
    const nowLabel = (() => {
      try {
        return new Intl.DateTimeFormat("en-US", {
          timeZone: prefs.timezone || "UTC",
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date());
      } catch {
        return `${format(new Date(), "EEEE, MMMM d, yyyy")} ${format(new Date(), "h:mm a")}`;
      }
    })();
    const profileBlock = [
      prefs.displayName ? `User name: ${prefs.displayName}` : "",
      prefs.roleContext ? `User context: ${prefs.roleContext}` : "",
      `Timezone: ${prefs.timezone}`,
      detailLevelGuide(prefs.detailLevel),
    ]
      .filter(Boolean)
      .join("\n");

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        { error: "Server database key is not configured" },
        { status: 500 }
      );
    }

    let scheduleName = `Daily Briefing — ${format(new Date(), "MMM d, yyyy")}`;
    let scheduleDesc = "Your daily communication digest and action items summary.";
    let categories = ["email", "messages", "mentions", "tasks", "follow_ups"];
    let apps = ["gmail", "whatsapp", "slack", "outlook"];

    // 1. Load custom schedule config if provided
    if (scheduleId) {
      const { data: schedule } = await insforgeAdmin.database
        .from("briefing_schedules")
        .select("*")
        .eq("id", scheduleId)
        .maybeSingle();

      if (schedule) {
        scheduleName = schedule.name;
        scheduleDesc = schedule.description || scheduleDesc;
        categories = schedule.categories?.length ? schedule.categories : categories;
        apps = schedule.apps?.length ? schedule.apps : apps;
      }
    }

    // 2. Fetch user's connected integrations
    const { data: userRow } = await insforgeAdmin.database
      .from("users")
      .select("integrations")
      .eq("id", userId)
      .maybeSingle();

    const integrations = userRow?.integrations || {};
    const hasGmail = !!integrations.gmail?.connected;
    const hasWhatsApp = !!integrations.whatsapp?.connected;
    const hasSlack = !!integrations.slack?.connected && !integrations.slack?.isSimulated;
    const hasOutlook = !!integrations.outlook?.connected && !integrations.outlook?.isSimulated;

    let gmailMessages: any[] = [];
    let whatsappMessages: any[] = [];
    let slackMessages: any[] = [];
    let outlookMessages: any[] = [];
    let connectedAppsUsed: string[] = [];

    // 3. Fetch real Gmail data
    if (apps.includes("gmail") && hasGmail) {
      try {
        const gmailRes = await fetch(`${origin}/api/gmail-mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "gmail_list_messages",
            params: { q: "label:inbox is:unread", maxResults: 15 },
            userId
          })
        });
        if (gmailRes.ok) {
          const resJson = await gmailRes.json();
          const text = resJson.result?.content?.[0]?.text;
          if (text) {
            gmailMessages = JSON.parse(text).messages || [];
            if (gmailMessages.length > 0) connectedAppsUsed.push("Gmail");
          }
        }
        console.log(`[Briefings] Fetched ${gmailMessages.length} Gmail messages`);
      } catch (e) {
        console.error("[Briefings] Gmail fetch failed:", e);
      }
    }

    // 4. Fetch real WhatsApp data
    if (apps.includes("whatsapp") && hasWhatsApp) {
      try {
        const waRes = await fetch(`${origin}/api/whatsapp-mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "whatsapp_get_recent_messages",
            userId
          })
        });
        if (waRes.ok) {
          const resJson = await waRes.json();
          const text = resJson.result?.content?.[0]?.text;
          if (text) {
            whatsappMessages = JSON.parse(text).messages || [];
            if (whatsappMessages.length > 0) connectedAppsUsed.push("WhatsApp");
          }
        }
        console.log(`[Briefings] Fetched ${whatsappMessages.length} WhatsApp messages`);
      } catch (e) {
        console.error("[Briefings] WhatsApp fetch failed:", e);
      }
    }

    if (apps.includes("slack") && hasSlack) {
      try {
        const slackRes = await fetch(`${origin}/api/slack-mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "slack_get_recent_messages",
            userId
          })
        });
        if (slackRes.ok) {
          const resJson = await slackRes.json();
          const text = resJson.result?.content?.[0]?.text;
          if (text) {
            slackMessages = JSON.parse(text).messages || [];
            if (slackMessages.length > 0) connectedAppsUsed.push("Slack");
          }
        }
        console.log(`[Briefings] Fetched ${slackMessages.length} Slack messages`);
      } catch (e) {
        console.error("[Briefings] Slack fetch failed:", e);
      }
    }

    if (apps.includes("outlook") && hasOutlook) {
      try {
        const outlookRes = await fetch(`${origin}/api/outlook-mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "outlook_list_messages",
            params: { maxResults: 15 },
            userId
          })
        });
        if (outlookRes.ok) {
          const resJson = await outlookRes.json();
          const text = resJson.result?.content?.[0]?.text;
          if (text) {
            outlookMessages = JSON.parse(text).messages || [];
            if (outlookMessages.length > 0) connectedAppsUsed.push("Outlook");
          }
        }
        console.log(`[Briefings] Fetched ${outlookMessages.length} Outlook messages`);
      } catch (e) {
        console.error("[Briefings] Outlook fetch failed:", e);
      }
    }

    const hasAnyData =
      gmailMessages.length > 0 ||
      whatsappMessages.length > 0 ||
      slackMessages.length > 0 ||
      outlookMessages.length > 0;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    // 5. Generate with Gemini using real data
    if (geminiApiKey && hasAnyData) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        const prompt = `You are Loopin, an AI personal assistant. Analyze the following real communications fetched from the user's connected apps and produce a structured intelligence briefing.

${profileBlock}

Briefing: "${scheduleName}"
Goal: ${scheduleDesc}
Date/Time (${prefs.timezone}): ${nowLabel}
Connected apps with data: ${connectedAppsUsed.join(", ")}
Categories to include: ${categories.join(", ")}

--- REAL GMAIL INBOX (${gmailMessages.length} messages) ---
${JSON.stringify(gmailMessages, null, 2)}

--- REAL WHATSAPP MESSAGES (${whatsappMessages.length} messages) ---
${JSON.stringify(whatsappMessages, null, 2)}

--- REAL SLACK MESSAGES (${slackMessages.length} messages) ---
${JSON.stringify(slackMessages, null, 2)}

--- REAL OUTLOOK INBOX (${outlookMessages.length} messages) ---
${JSON.stringify(outlookMessages, null, 2)}

Analyze the REAL data above carefully. Produce a valid JSON briefing:
{
  "title": "Short, descriptive title based on today's actual messages (e.g. 'Q2 Review & Budget Follow-ups — Jun 8')",
  "summary": "2-3 sentence executive summary of the most important updates from the real data above",
  "stats": {
    "email": <count of actual email items>,
    "messages": <count of actual message items>,
    "mentions": <count of actual mention items>,
    "tasks": <count of extracted tasks>,
    "follow_ups": <count of follow-up items>
  },
  "data": {
    "email": [{ "id": "string", "app": "gmail" | "outlook", "from": "string", "subject": "string", "snippet": "string", "time": "string", "body": "string" }],
    "messages": [{ "id": "string", "app": "whatsapp" | "slack", "from": "string", "snippet": "string", "time": "string", "body": "string" }],
    "mentions": [{ "id": "string", "app": "string", "from": "string", "snippet": "string", "time": "string", "body": "string" }],
    "tasks": [{ "id": "string", "app": "string", "title": "string", "description": "string", "time": "string", "priority": "High" | "Medium" | "Low" }],
    "follow_ups": [{ "id": "string", "app": "string", "title": "string", "description": "string", "time": "string" }]
  }
}

RULES:
- Base ALL content ONLY on the real data provided above — do NOT invent anything
- Extract tasks from any message containing action items, deadlines or requests
- Extract follow-ups from conversations that need a response or follow-through
- Only populate categories that were requested: ${categories.join(", ")}
- ${detailLevelGuide(prefs.detailLevel)}
- Return valid JSON only`;

        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });

        const textResponse = response.text;
        if (textResponse) {
          const parsed = JSON.parse(textResponse);
          const { data, error } = await insforgeAdmin.database
            .from("generated_briefings")
            .insert({
              user_id: userId,
              schedule_id: scheduleId || null,
              title: parsed.title || scheduleName,
              summary: parsed.summary || "",
              stats: parsed.stats || {},
              data: parsed.data || {}
            })
            .select()
            .single();

          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          console.log(`[Briefings] AI briefing generated and saved: ${parsed.title}`);
          void trackFeatureUsage({ userId, feature: "briefing", action: "generate" });
          if (data?.id) {
            void deliverBriefingToChannels({
              userId,
              briefingId: data.id,
              title: data.title || parsed.title,
              summary: data.summary || parsed.summary,
              channels: prefs.briefingChannels,
            }).catch((err) => console.error("[Briefings] channel delivery failed:", err));
          }
          return NextResponse.json(data);
        }
      } catch (aiError: any) {
        console.error("[Briefings] Gemini generation failed:", aiError.message);
        // Fall through to raw data save below
      }
    }

    // 6. If Gemini fails or no key — save the raw fetched data with a basic summary
    // Still only save REAL data, not fabricated mock content
    const emailItems = [
      ...gmailMessages.map((msg: any, i: number) => ({
        id: msg.id || `email_${i}`,
        app: "gmail",
        from: msg.from || "Unknown",
        subject: msg.subject || "No Subject",
        snippet: msg.snippet || "",
        time: msg.date ? format(new Date(msg.date), "h:mm a") : "",
        body: msg.body || msg.snippet || ""
      })),
      ...outlookMessages.map((msg: any, i: number) => ({
        id: msg.id || `outlook_${i}`,
        app: "outlook",
        from: msg.from || "Unknown",
        subject: msg.subject || "No Subject",
        snippet: msg.snippet || "",
        time: msg.date ? format(new Date(msg.date), "h:mm a") : "",
        body: msg.snippet || ""
      })),
    ];

    const messageItems = [
      ...whatsappMessages.map((msg: any, i: number) => ({
        id: `wa_${i}`,
        app: msg.app || "whatsapp",
        from: msg.from || msg.chatName || "Unknown",
        snippet: msg.body || "",
        time: msg.timestamp ? format(new Date(msg.timestamp), "h:mm a") : "",
        body: msg.body || ""
      })),
      ...slackMessages.map((msg: any, i: number) => ({
        id: `slack_${i}`,
        app: "slack",
        from: msg.channelName ? `#${msg.channelName}` : msg.user || "Unknown",
        snippet: msg.text || "",
        time: msg.timestamp ? format(new Date(msg.timestamp), "h:mm a") : "",
        body: msg.text || ""
      })),
    ];

    const noGeminiTitle = hasAnyData
      ? `${scheduleName}`
      : `${scheduleName} — No new activity`;

    const noGeminiSummary = hasAnyData
      ? `${emailItems.length} email${emailItems.length !== 1 ? "s" : ""} and ${messageItems.length} message${messageItems.length !== 1 ? "s" : ""} from your connected apps. Review the categories below for details.`
      : "No new messages or emails found in your connected apps at this time.";

    if (!hasGmail && !hasWhatsApp && !hasSlack && !hasOutlook) {
      return NextResponse.json(
        { error: "No connected apps. Please connect Gmail, WhatsApp, Slack, or Outlook from Integrations." },
        { status: 400 }
      );
    }

    const { data: dbData, error: dbError } = await insforgeAdmin.database
      .from("generated_briefings")
      .insert({
        user_id: userId,
        schedule_id: scheduleId || null,
        title: noGeminiTitle,
        summary: noGeminiSummary,
        stats: {
          email: emailItems.length,
          messages: messageItems.length,
          mentions: 0,
          tasks: 0,
          follow_ups: 0
        },
        data: {
          email: emailItems,
          messages: messageItems,
          mentions: [],
          tasks: [],
          follow_ups: []
        }
      })
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    void trackFeatureUsage({ userId, feature: "briefing", action: "generate" });
    if (dbData?.id) {
      void deliverBriefingToChannels({
        userId,
        briefingId: dbData.id,
        title: dbData.title,
        summary: dbData.summary,
        channels: prefs.briefingChannels,
      }).catch((err) => console.error("[Briefings] channel delivery failed:", err));
    }
    return NextResponse.json(dbData);

  } catch (err: any) {
    console.error("Error in POST /api/briefings:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
