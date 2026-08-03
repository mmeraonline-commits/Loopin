import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { updateUserIntegration } from "@/lib/integrations";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

const NOTION_VERSION = "2022-06-28";

type NotionIntegration = {
  connected?: boolean;
  accessToken?: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
  botId?: string | null;
  isSimulated?: boolean;
  defaultParentPageId?: string | null;
  defaultParentPageTitle?: string | null;
  defaultDatabaseId?: string | null;
  defaultDatabaseTitle?: string | null;
};

const SIM_PAGES = [
  {
    id: "sim-page-1",
    title: "Q3 Product Spec",
    url: "https://www.notion.so/sim-page-1",
    object: "page",
  },
  {
    id: "sim-page-2",
    title: "Meeting Notes — Loopin",
    url: "https://www.notion.so/sim-page-2",
    object: "page",
  },
  {
    id: "sim-db-1",
    title: "Tasks",
    url: "https://www.notion.so/sim-db-1",
    object: "database",
  },
];

const SIM_CONTENT: Record<string, string> = {
  "sim-page-1":
    "Q3 Product Spec\n\nGoals: ship Telegram, Google Calendar, and Teams.\nNext: Notion integration for work context.",
  "sim-page-2":
    "Meeting Notes — Loopin\n\n- Confirmed Business plan includes Notion\n- Share pages with the integration after OAuth",
};

function mcpText(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

/** Notion IDs work with or without dashes; normalize to UUID form when possible. */
function normalizeNotionId(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const cleaned = raw.trim().replace(/-/g, "");
  if (!/^[a-f0-9]{32}$/i.test(cleaned)) return raw.trim();
  return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
}

function shareHint() {
  return " Share the page/database with the Loopin integration in Notion, then pick a default parent under Integrations → Notion → Settings.";
}

function richTextToPlain(
  rich: Array<{ plain_text?: string }> | undefined
): string {
  if (!Array.isArray(rich)) return "";
  return rich.map((t) => t.plain_text || "").join("");
}

function titleFromProps(properties: Record<string, unknown> | undefined): string {
  if (!properties) return "Untitled";
  for (const value of Object.values(properties)) {
    const prop = value as { type?: string; title?: Array<{ plain_text?: string }> };
    if (prop?.type === "title") {
      const t = richTextToPlain(prop.title);
      if (t) return t;
    }
  }
  return "Untitled";
}

async function getNotion(userId: string): Promise<NotionIntegration | null> {
  const { data: dbUser, error } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();
  if (error || !dbUser) return null;
  return (dbUser.integrations?.notion as NotionIntegration) || null;
}

async function notionFetch(
  token: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

async function blocksToPlainText(token: string, blockId: string, depth = 0): Promise<string> {
  if (depth > 3) return "";
  const lines: string[] = [];
  let cursor: string | undefined;
  do {
    const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
    const { ok, json } = await notionFetch(token, `/blocks/${blockId}/children${qs}`);
    if (!ok) break;
    const results = (json.results as Array<Record<string, unknown>>) || [];
    for (const block of results) {
      const type = String(block.type || "");
      const body = block[type] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
      const text = richTextToPlain(body?.rich_text);
      if (text) lines.push(text);
      if (block.has_children) {
        const child = await blocksToPlainText(token, String(block.id), depth + 1);
        if (child) lines.push(child);
      }
    }
    cursor = json.has_more ? String(json.next_cursor || "") : undefined;
  } while (cursor);
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const { method, params, userId, id = 1 } = await req.json();

    if (!method || !userId) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid Request: method and userId are required" },
          id,
        },
        { status: 400 }
      );
    }

    if (!hasInsforgeAdminKey) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32003, message: "Server database key is not configured." },
          id,
        },
        { status: 500 }
      );
    }

    const notion = await getNotion(userId);
    if (!notion?.connected) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Notion is not connected." },
          id,
        },
        { status: 400 }
      );
    }

    let result = null;
    let error: { code: number; message: string } | null = null;

    if (notion.isSimulated) {
      switch (method) {
        case "notion_search": {
          const q = String(params?.query || "").toLowerCase();
          const results = SIM_PAGES.filter(
            (p) => !q || p.title.toLowerCase().includes(q)
          );
          result = mcpText({ results });
          break;
        }
        case "notion_get_page": {
          const pageId = params?.pageId as string | undefined;
          if (!pageId) {
            error = { code: -32602, message: "Argument 'pageId' is required" };
            break;
          }
          const page = SIM_PAGES.find((p) => p.id === pageId);
          result = mcpText({
            id: pageId,
            title: page?.title || "Untitled",
            url: page?.url || null,
            content: SIM_CONTENT[pageId] || "",
          });
          break;
        }
        case "notion_query_database": {
          const databaseId = params?.databaseId as string | undefined;
          if (!databaseId) {
            error = { code: -32602, message: "Argument 'databaseId' is required" };
            break;
          }
          result = mcpText({
            databaseId,
            results: [
              {
                id: "sim-row-1",
                title: "Ship Notion v1",
                status: "In progress",
                url: "https://www.notion.so/sim-row-1",
              },
              {
                id: "sim-row-2",
                title: "Write release notes",
                status: "Todo",
                url: "https://www.notion.so/sim-row-2",
              },
            ],
          });
          break;
        }
        case "notion_create_page": {
          const title = String(params?.title || "Untitled");
          const body = String(params?.content || params?.body || "");
          const parentPageId =
            (params?.parentPageId as string | undefined) ||
            notion.defaultParentPageId ||
            "sim-page-1";
          const idNew = `sim-page-${Date.now()}`;
          result = mcpText({
            success: true,
            id: idNew,
            title,
            url: `https://www.notion.so/${idNew}`,
            content: body,
            parentPageId,
          });
          break;
        }
        case "notion_append_blocks": {
          const pageId =
            (params?.pageId as string | undefined) || notion.defaultParentPageId || "sim-page-1";
          const text = String(params?.text || params?.content || "");
          if (!text) {
            error = { code: -32602, message: "Argument 'text' is required" };
            break;
          }
          SIM_CONTENT[pageId] = `${SIM_CONTENT[pageId] || ""}\n${text}`.trim();
          result = mcpText({ success: true, pageId, appended: text });
          break;
        }
        default:
          error = { code: -32601, message: `Method not found: ${method}` };
      }

      if (error) {
        return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
      }
      void trackFeatureUsage({ userId, feature: "notion", action: method || "use" });
      return NextResponse.json({ jsonrpc: "2.0", result, id });
    }

    if (!notion.accessToken) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Notion is not connected with a real OAuth token." },
          id,
        },
        { status: 400 }
      );
    }

    const token = notion.accessToken;

    switch (method) {
      case "notion_search": {
        const query = String(params?.query || "");
        const { ok, json } = await notionFetch(token, "/search", {
          method: "POST",
          body: JSON.stringify({
            query: query || undefined,
            page_size: Math.min(20, Number(params?.limit || 10)),
          }),
        });
        if (!ok) {
          error = {
            code: -32002,
            message: String((json as { message?: string }).message || "Notion search failed"),
          };
          break;
        }
        const results = ((json.results as Array<Record<string, unknown>>) || []).map((item) => {
          const object = String(item.object || "");
          if (object === "page") {
            return {
              id: item.id,
              object,
              title: titleFromProps(item.properties as Record<string, unknown>),
              url: item.url || null,
            };
          }
          if (object === "database") {
            const title = richTextToPlain(
              (item.title as Array<{ plain_text?: string }>) || undefined
            );
            return {
              id: item.id,
              object,
              title: title || "Untitled database",
              url: item.url || null,
            };
          }
          return { id: item.id, object, title: "Untitled", url: item.url || null };
        });
        result = mcpText({ results });
        break;
      }

      case "notion_get_page": {
        const pageId = params?.pageId as string | undefined;
        if (!pageId) {
          error = { code: -32602, message: "Argument 'pageId' is required" };
          break;
        }
        const pageRes = await notionFetch(token, `/pages/${encodeURIComponent(pageId)}`);
        if (!pageRes.ok) {
          error = {
            code: -32002,
            message: String(
              (pageRes.json as { message?: string }).message || "Failed to get Notion page"
            ),
          };
          break;
        }
        const title = titleFromProps(pageRes.json.properties as Record<string, unknown>);
        const content = await blocksToPlainText(token, pageId);
        result = mcpText({
          id: pageId,
          title,
          url: pageRes.json.url || null,
          content: content.slice(0, 8000),
        });
        break;
      }

      case "notion_query_database": {
        const databaseId = params?.databaseId as string | undefined;
        if (!databaseId) {
          error = { code: -32602, message: "Argument 'databaseId' is required" };
          break;
        }
        const { ok, json } = await notionFetch(
          token,
          `/databases/${encodeURIComponent(databaseId)}/query`,
          {
            method: "POST",
            body: JSON.stringify({
              page_size: Math.min(25, Number(params?.limit || 10)),
            }),
          }
        );
        if (!ok) {
          error = {
            code: -32002,
            message: String((json as { message?: string }).message || "Database query failed"),
          };
          break;
        }
        const rows = ((json.results as Array<Record<string, unknown>>) || []).map((row) => ({
          id: row.id,
          title: titleFromProps(row.properties as Record<string, unknown>),
          url: row.url || null,
        }));
        result = mcpText({ databaseId, results: rows });
        break;
      }

      case "notion_create_page": {
        const title = String(params?.title || "Untitled");
        const content = String(params?.content || params?.body || "");
        let parentPageId = normalizeNotionId(params?.parentPageId as string | undefined);
        let parentDatabaseId = normalizeNotionId(
          params?.parentDatabaseId as string | undefined
        );

        // Fall back to user-selected defaults from Integrations settings
        if (!parentPageId && !parentDatabaseId) {
          parentPageId = normalizeNotionId(notion.defaultParentPageId);
          parentDatabaseId = normalizeNotionId(notion.defaultDatabaseId);
        }

        if (!parentPageId && !parentDatabaseId) {
          error = {
            code: -32602,
            message:
              "No parent page/database. Open Integrations → Notion → Settings, select a default page (or database), share it with Loopin in Notion, then try again.",
          };
          break;
        }

        const children = content
          ? content
              .split(/\n+/)
              .filter(Boolean)
              .slice(0, 20)
              .map((line) => ({
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ type: "text", text: { content: line.slice(0, 1900) } }],
                },
              }))
          : [];

        const createBody = parentDatabaseId
          ? {
              parent: { database_id: parentDatabaseId },
              properties: {
                Name: {
                  title: [{ type: "text", text: { content: title.slice(0, 200) } }],
                },
              },
              children,
            }
          : {
              parent: { page_id: parentPageId },
              properties: {
                title: {
                  title: [{ type: "text", text: { content: title.slice(0, 200) } }],
                },
              },
              children,
            };

        let { ok, json } = await notionFetch(token, "/pages", {
          method: "POST",
          body: JSON.stringify(createBody),
        });

        if (!ok && parentDatabaseId) {
          error = {
            code: -32002,
            message:
              String(
                (json as { message?: string }).message ||
                  "Failed to create Notion page in that database."
              ) + shareHint(),
          };
          break;
        }

        if (!ok) {
          const msg = String(
            (json as { message?: string }).message || "Failed to create Notion page"
          );
          error = {
            code: -32002,
            message: /could not find page|not found|shared with your integration/i.test(msg)
              ? `${msg}${shareHint()}`
              : msg,
          };
          break;
        }

        result = mcpText({
          success: true,
          id: json.id,
          title,
          url: json.url || null,
          parentPageId: parentPageId || null,
          parentDatabaseId: parentDatabaseId || null,
        });
        break;
      }

      case "notion_append_blocks": {
        let pageId = normalizeNotionId(params?.pageId as string | undefined);
        if (!pageId) pageId = normalizeNotionId(notion.defaultParentPageId);
        const text = String(params?.text || params?.content || "");
        if (!pageId || !text) {
          error = {
            code: -32602,
            message: !pageId
              ? "No pageId. Select a default page in Integrations → Notion → Settings, or pass pageId."
              : "Arguments 'pageId' and 'text' are required",
          };
          break;
        }
        const children = text
          .split(/\n+/)
          .filter(Boolean)
          .slice(0, 20)
          .map((line) => ({
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ type: "text", text: { content: line.slice(0, 1900) } }],
            },
          }));
        const { ok, json } = await notionFetch(
          token,
          `/blocks/${encodeURIComponent(pageId)}/children`,
          {
            method: "PATCH",
            body: JSON.stringify({ children }),
          }
        );
        if (!ok) {
          const msg = String(
            (json as { message?: string }).message || "Failed to append blocks"
          );
          error = {
            code: -32002,
            message: /could not find|shared with your integration/i.test(msg)
              ? `${msg}${shareHint()}`
              : msg,
          };
          break;
        }
        result = mcpText({ success: true, pageId, appended: text });
        break;
      }

      default:
        error = { code: -32601, message: `Method not found: ${method}` };
    }

    if (error) {
      return NextResponse.json({ jsonrpc: "2.0", error, id }, { status: 400 });
    }

    void trackFeatureUsage({ userId, feature: "notion", action: method || "use" });
    return NextResponse.json({ jsonrpc: "2.0", result, id });
  } catch (err: unknown) {
    console.error("Notion MCP exception:", err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message }, id: 1 },
      { status: 500 }
    );
  }
}
