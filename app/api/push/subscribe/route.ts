import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Internal Server Error";
}

export async function POST(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server database key missing" }, { status: 503 });
    }

    const { userId, subscription, userAgent } = await req.json();
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!userId || !endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "userId and a valid PushSubscription are required" },
        { status: 400 }
      );
    }

    // Prefer upsert; fall back to insert/update for older PostgREST shapes.
    let data = null;
    let error = null;

    const upsertAttempt = await insforgeAdmin.database
      .from("push_subscriptions")
      .upsert(
        [
          {
            user_id: userId,
            endpoint,
            p256dh,
            auth,
            user_agent: userAgent || null,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "user_id,endpoint" }
      )
      .select()
      .maybeSingle();

    data = upsertAttempt.data;
    error = upsertAttempt.error;

    if (error) {
      const existing = await insforgeAdmin.database
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("endpoint", endpoint)
        .maybeSingle();

      if (existing.data?.id) {
        const updated = await insforgeAdmin.database
          .from("push_subscriptions")
          .update({
            p256dh,
            auth,
            user_agent: userAgent || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.data.id)
          .select()
          .maybeSingle();
        data = updated.data;
        error = updated.error;
      } else {
        const inserted = await insforgeAdmin.database
          .from("push_subscriptions")
          .insert([
            {
              user_id: userId,
              endpoint,
              p256dh,
              auth,
              user_agent: userAgent || null,
            },
          ])
          .select()
          .maybeSingle();
        data = inserted.data;
        error = inserted.error;
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, subscription: data });
  } catch (err: unknown) {
    console.error("POST /api/push/subscribe:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!hasInsforgeAdminKey) {
      return NextResponse.json({ error: "Server database key missing" }, { status: 503 });
    }

    const { userId, endpoint } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    let query = insforgeAdmin.database.from("push_subscriptions").delete().eq("user_id", userId);
    if (endpoint) query = query.eq("endpoint", endpoint);

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("DELETE /api/push/subscribe:", err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
