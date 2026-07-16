import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

type LinkedInIntegration = {
  connected?: boolean;
  accessToken?: string;
  personId?: string | null;
  isSimulated?: boolean;
};

function mcpText(payload: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export async function POST(req: NextRequest) {
  try {
    const { method, params, userId, id = 1 } = await req.json();
    if (!method || !userId) {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32600, message: "method and userId required" }, id }, { status: 400 });
    }
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32003, message: "INSFORGE_API_KEY missing" }, id }, { status: 500 });
    }

    const { data: dbUser } = await insforgeAdmin.database.from("users").select("integrations").eq("id", userId).maybeSingle();
    const linkedin = (dbUser?.integrations?.linkedin || null) as LinkedInIntegration | null;
    if (!linkedin?.connected || !linkedin.accessToken || linkedin.isSimulated) {
      return NextResponse.json({ jsonrpc: "2.0", error: { code: -32001, message: "LinkedIn not connected" }, id }, { status: 400 });
    }

    if (method === "linkedin_get_profile") {
      const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${linkedin.accessToken}` },
      });
      const me = await meRes.json();
      if (!meRes.ok) {
        return NextResponse.json({ jsonrpc: "2.0", error: { code: -32002, message: me.message || "profile failed" }, id }, { status: 400 });
      }
      void trackFeatureUsage({ userId, feature: "linkedin", action: method });
      return NextResponse.json({
        jsonrpc: "2.0",
        result: mcpText({
          id: me.sub,
          name: me.name || null,
          email: me.email || null,
          picture: me.picture || null,
        }),
        id,
      });
    }

    if (method === "linkedin_create_post") {
      const text = String(params?.text || "").trim();
      const personId = linkedin.personId || params?.personId;
      const visibility = params?.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC";
      if (!text || !personId) {
        return NextResponse.json({ jsonrpc: "2.0", error: { code: -32602, message: "text and personId required" }, id }, { status: 400 });
      }
      const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${linkedin.accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: `urn:li:person:${personId}`,
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text },
              shareMediaCategory: "NONE",
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": visibility },
        }),
      });
      const postData = await postRes.json().catch(() => ({}));
      if (!postRes.ok) {
        return NextResponse.json({
          jsonrpc: "2.0",
          error: { code: -32002, message: postData.message || `post failed (${postRes.status})` },
          id,
        }, { status: 400 });
      }
      void trackFeatureUsage({ userId, feature: "linkedin", action: method });
      return NextResponse.json({ jsonrpc: "2.0", result: mcpText({ ok: true, id: postData.id || null, visibility }), id });
    }

    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32601, message: `Unknown method: ${method}` }, id }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: { code: -32000, message: err instanceof Error ? err.message : "Internal Server Error" },
      id: 1,
    }, { status: 500 });
  }
}
