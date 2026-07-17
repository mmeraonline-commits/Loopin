import { NextRequest, NextResponse } from "next/server";
import { hasInsforgeAdminKey, insforgeAdmin } from "@/lib/insforge-admin";
import { trackFeatureUsage } from "@/lib/track-feature-usage";

// Fallback high-fidelity mock database for simulator
const MOCK_EMAILS = [
  {
    id: "msg_12345",
    threadId: "thread_12345",
    from: "John Doe <john.doe@acme.com>",
    to: "Rahul <rahul@loopin.ai>",
    subject: "Q2 Slides & Marketing Budget Proposal",
    date: new Date().toISOString(),
    snippet: "Hey, could you send me the final Q2 presentation slides by 4:45 PM today? Also, I need your input...",
    body: "Hey Rahul,\n\nCould you send me the final Q2 presentation slides by 4:45 PM today? Also, I need your input on whether we should increase the marketing budget by 10% next quarter to accommodate the new product roadmap timeline.\n\nThanks,\nJohn",
    labels: ["INBOX", "UNREAD", "URGENT"]
  },
  {
    id: "msg_67890",
    threadId: "thread_67890",
    from: "Sarah Jenkins <sarah.j@finance.corp>",
    to: "Rahul <rahul@loopin.ai>",
    subject: "NDA for Client Review",
    date: new Date(Date.now() - 3600000).toISOString(),
    snippet: "Hi Rahul, please review the final NDA terms from the client. Let me know if everything is good to go...",
    body: "Hi Rahul,\n\nPlease review the final NDA terms from the client. Let me know if everything is good to go so we can sign off and finalize the partnership in 2 days.\n\nBest regards,\nSarah Jenkins\nDirector of Finance",
    labels: ["INBOX", "UNREAD"]
  },
  {
    id: "msg_11223",
    threadId: "thread_11223",
    from: "Alex Rivera <alex@startup.co>",
    to: "Rahul <rahul@loopin.ai>",
    subject: "Coffee tomorrow at 4:30 PM?",
    date: new Date(Date.now() - 7200000).toISOString(),
    snippet: "Hey! Are you free tomorrow at 4:30 PM for coffee near the downtown office? I'd love to sync...",
    body: "Hey Rahul,\n\nAre you free tomorrow at 4:30 PM for coffee near the downtown office? I'd love to sync on the technical roadmap and next deployment milestones.\n\nLet me know if that works for you!\n\nCheers,\nAlex",
    labels: ["INBOX"]
  },
  {
    id: "msg_44556",
    threadId: "thread_44556",
    from: "OpenAI Billing <billing@openai.com>",
    to: "Rahul <rahul@loopin.ai>",
    subject: "Your monthly invoice is ready",
    date: new Date(Date.now() - 86400000).toISOString(),
    snippet: "Your OpenAI API usage invoice for May is ready. The amount of $14.20 has been charged...",
    body: "Dear Customer,\n\nYour OpenAI API usage invoice for May is ready. The amount of $14.20 has been charged to your card ending in 4242.\n\nYou can access your billing dashboard to download the PDF receipt.\n\nThank you for using OpenAI services,\nThe OpenAI Team",
    labels: ["INBOX"]
  }
];

let simulatedSent: any[] = [];
let simulatedDrafts: any[] = [];
const simulatedLoopinLabelIds: Record<string, string> = {
  "Loopin/Promotional": "Label_promo",
  "Loopin/Notifications": "Label_notif",
  "Loopin/NeedsReply": "Label_needs",
  "Loopin/Urgent": "Label_urgent",
  "Loopin/Processed": "Label_processed",
};

// Helper to base64url-decode email body parts
function base64UrlDecode(str: string): string {
  // Replace base64url characters to standard base64
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if missing
  while (base64.length % 4) {
    base64 += "=";
  }
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch (e) {
    return "";
  }
}

// Recursively extract email body text
function extractBody(payload: any): string {

  if (payload.body?.data) {
    return base64UrlDecode(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return base64UrlDecode(part.body.data);
      }
      if (part.mimeType === "text/html" && part.body?.data) {
        // Fallback to HTML if plain text isn't directly available in standard part
        return base64UrlDecode(part.body.data).replace(/<[^>]*>/g, ""); // simple tag strip
      }
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

function headerValue(headers: any[], name: string): string {
  return headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function encodeRawEmail(lines: string[]): string {
  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildDraftRawMessage(input: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
  ];
  if (input.inReplyTo) {
    lines.push(`In-Reply-To: ${input.inReplyTo}`);
    lines.push(`References: ${input.references || input.inReplyTo}`);
  }
  lines.push("", input.body);
  return encodeRawEmail(lines);
}

// Authenticated fetch wrapper for Google API
async function fetchGoogleAPI(endpoint: string, token: string, method = "GET", body?: any) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Gmail API Error (${res.status}): ${errText}`);
  }

  return res.json();
}

// Refresh Google OAuth token helper
async function getActiveAccessToken(userId: string) {
  const { data: dbUser, error: dbError } = await insforgeAdmin.database
    .from("users")
    .select("integrations")
    .eq("id", userId)
    .maybeSingle();

  if (dbError || !dbUser) {
    throw new Error("Could not retrieve user integrations from database");
  }

  const gmail = dbUser.integrations?.gmail;
  if (!gmail || gmail.isSimulated || !gmail.refreshToken) {
    // Falls back to simulated/mock data
    return null;
  }

  // Check if token is still valid (60 seconds buffer)
  if (gmail.accessToken && gmail.expiresAt && gmail.expiresAt > Date.now() + 60000) {
    return gmail.accessToken;
  }

  // Token is expired. Refresh it!
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === "your_google_client_id_here") {
    console.warn("GOOGLE_CLIENT_ID/SECRET not configured in .env. Falling back to simulation.");
    return null;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: gmail.refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh Google OAuth token: ${errText}`);
  }

  const data = await res.json();
  const newAccessToken = data.access_token;
  const newExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;

  // Persist updated token to db
  const updatedIntegrations = {
    ...dbUser.integrations,
    gmail: {
      ...gmail,
      accessToken: newAccessToken,
      expiresAt: newExpiresAt
    }
  };

  await insforgeAdmin.database
    .from("users")
    .update({ integrations: updatedIntegrations })
    .eq("id", userId);

  return newAccessToken;
}

export async function POST(req: NextRequest) {
  try {
    const requestBody = await req.json();
    const { method, params, userId, id = 1 } = requestBody;

    if (!method || !userId) {
      return NextResponse.json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Invalid Request: method and userId are required" },
        id
      }, { status: 400 });
    }

    const requestFrame = {
      jsonrpc: "2.0",
      method,
      params,
      id
    };

    let result: any = null;
    let error: any = null;

    // Retrieve active access token (will return null if simulated/mock connection is active)
    const token = await getActiveAccessToken(userId).catch(err => {
      console.error("Token fetch/refresh exception:", err);
      return null;
    });

    if (token) {
      // -------------------------------------------------------------
      // REAL GMAIL CONNECTION PATH (Google API Calls)
      // -------------------------------------------------------------
      try {
        switch (method) {
          case "gmail_list_messages": {
            const q = params?.q || "label:inbox";
            const maxResults = params?.maxResults || 10;
            const includeBody = params?.includeBody === true;

            const listData = await fetchGoogleAPI(
              `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`,
              token
            );
            const messages = listData.messages || [];

            const detailedMessages = await Promise.all(
              messages.map(async (msg: any) => {
                try {
                  const detail = await fetchGoogleAPI(
                    includeBody
                      ? `messages/${msg.id}?format=full`
                      : `messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID`,
                    token
                  );
                  const headers = detail.payload?.headers || [];
                  const from = headerValue(headers, "From") || "Unknown Sender";
                  const subject = headerValue(headers, "Subject") || "No Subject";
                  const date = headerValue(headers, "Date") || detail.internalDate;
                  const rfcMessageId = headerValue(headers, "Message-ID");

                  return {
                    id: detail.id,
                    threadId: detail.threadId,
                    from,
                    subject,
                    date: new Date(isNaN(Number(date)) ? date : Number(date)).toISOString(),
                    snippet: detail.snippet,
                    body: includeBody ? extractBody(detail.payload) || detail.snippet : undefined,
                    labels: detail.labelIds || [],
                    rfcMessageId: rfcMessageId || undefined,
                  };
                } catch (e) {
                  return null;
                }
              })
            );

            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    messages: detailedMessages.filter(Boolean)
                  }, null, 2)
                }
              ]
            };
            break;
          }

          case "gmail_ensure_labels": {
            const defs = (params?.labels || []) as Array<{
              name: string;
              bg?: string;
              text?: string;
            }>;
            const existing = await fetchGoogleAPI("labels", token);
            const labelIds: Record<string, string> = {};

            for (const def of defs) {
              const found = (existing.labels || []).find((l: any) => l.name === def.name);
              if (found) {
                labelIds[def.name] = found.id;
                continue;
              }
              const created = await fetchGoogleAPI("labels", token, "POST", {
                name: def.name,
                labelListVisibility: def.name.includes("Processed") ? "labelHide" : "labelShow",
                messageListVisibility: "show",
                color: def.bg
                  ? { backgroundColor: def.bg, textColor: def.text || "#ffffff" }
                  : undefined,
              });
              labelIds[def.name] = created.id;
            }

            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ labelIds }, null, 2),
                },
              ],
            };
            break;
          }

          case "gmail_modify_labels": {
            const { messageId, addLabelIds = [], removeLabelIds = [] } = params || {};
            const modified = await fetchGoogleAPI(
              `messages/${messageId}/modify`,
              token,
              "POST",
              { addLabelIds, removeLabelIds }
            );
            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, message: modified }, null, 2),
                },
              ],
            };
            break;
          }

          case "gmail_get_message": {
            const messageId = params?.id;
            const detail = await fetchGoogleAPI(`messages/${messageId}?format=full`, token);
            
            const headers = detail.payload?.headers || [];
            const from = headerValue(headers, "From") || "Unknown Sender";
            const toHeader = headerValue(headers, "To");
            const subject = headerValue(headers, "Subject") || "No Subject";
            const date = headerValue(headers, "Date") || detail.internalDate;
            const rfcMessageId = headerValue(headers, "Message-ID");

            const parsedEmail = {
              id: detail.id,
              threadId: detail.threadId,
              from,
              to: toHeader,
              subject,
              date: new Date(isNaN(Number(date)) ? date : Number(date)).toISOString(),
              snippet: detail.snippet,
              body: extractBody(detail.payload) || detail.snippet,
              labels: detail.labelIds || [],
              rfcMessageId: rfcMessageId || undefined,
            };

            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(parsedEmail, null, 2)
                }
              ]
            };
            break;
          }

          case "gmail_search_messages": {
            const q = params?.q || "";
            const maxResults = params?.maxResults || 10;

            const listData = await fetchGoogleAPI(
              `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`,
              token
            );
            const messages = listData.messages || [];

            const detailedMessages = await Promise.all(
              messages.map(async (msg: any) => {
                try {
                  const detail = await fetchGoogleAPI(
                    `messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
                    token
                  );
                  const headers = detail.payload?.headers || [];
                  const from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "Unknown Sender";
                  const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "No Subject";
                  const date = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || detail.internalDate;

                  return {
                    id: detail.id,
                    threadId: detail.threadId,
                    from,
                    subject,
                    date: new Date(isNaN(Number(date)) ? date : Number(date)).toISOString(),
                    snippet: detail.snippet,
                    labels: detail.labelIds || []
                  };
                } catch (e) {
                  return null;
                }
              })
            );

            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    messages: detailedMessages.filter(Boolean)
                  }, null, 2)
                }
              ]
            };
            break;
          }

          case "gmail_send_message": {
            const { to, subject, body } = params || {};
            
            // Construct standard RFC 2822 email payload
            const rawMessage = [
              `To: ${to}`,
              `Subject: ${subject}`,
              `Content-Type: text/plain; charset=utf-8`,
              `MIME-Version: 1.0`,
              ``,
              body
            ].join("\r\n");

            // Base64url encode raw email message
            const encoded = Buffer.from(rawMessage).toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            const sendData = await fetchGoogleAPI("messages/send", token, "POST", {
              raw: encoded
            });

            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    message: "Email sent successfully via Gmail API",
                    messageId: sendData.id,
                    threadId: sendData.threadId
                  }, null, 2)
                }
              ]
            };
            break;
          }

          case "gmail_create_draft": {
            const { to, subject, body, threadId, inReplyTo, references } = params || {};
            const encoded = buildDraftRawMessage({
              to,
              subject: subject || "Re:",
              body: body || "",
              inReplyTo,
              references,
            });

            const draftPayload: { message: { raw: string; threadId?: string } } = {
              message: { raw: encoded },
            };
            if (threadId) draftPayload.message.threadId = threadId;

            const draftData = await fetchGoogleAPI("drafts", token, "POST", draftPayload);

            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    message: "Draft created successfully via Gmail API",
                    draft: draftData
                  }, null, 2)
                }
              ]
            };
            break;
          }

          case "gmail_list_drafts": {
            const maxResults = params?.maxResults || 10;
            const listData = await fetchGoogleAPI(`drafts?maxResults=${maxResults}`, token);
            const drafts = listData.drafts || [];

            const detailed = await Promise.all(
              drafts.map(async (d: { id: string; message?: { id?: string } }) => {
                try {
                  const draft = await fetchGoogleAPI(`drafts/${d.id}?format=full`, token);
                  const msg = draft.message || {};
                  const headers = msg.payload?.headers || [];
                  const to = headerValue(headers, "To");
                  const subject = headerValue(headers, "Subject") || "No Subject";
                  const date = headerValue(headers, "Date") || msg.internalDate;
                  return {
                    id: draft.id || d.id,
                    messageId: msg.id,
                    threadId: msg.threadId,
                    to,
                    subject,
                    snippet: msg.snippet || "",
                    body: extractBody(msg.payload) || msg.snippet || "",
                    date: date
                      ? new Date(isNaN(Number(date)) ? date : Number(date)).toISOString()
                      : undefined,
                    gmailUrl: msg.threadId
                      ? `https://mail.google.com/mail/u/0/#drafts/${msg.threadId}`
                      : "https://mail.google.com/mail/u/0/#drafts",
                  };
                } catch {
                  return null;
                }
              })
            );

            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ drafts: detailed.filter(Boolean) }, null, 2),
                },
              ],
            };
            break;
          }

          case "gmail_get_thread": {
            const threadId = params?.id;
            const threadData = await fetchGoogleAPI(`threads/${threadId}`, token);
            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(threadData, null, 2)
                }
              ]
            };
            break;
          }

          default:
            error = { code: -32601, message: `Method not found: ${method}` };
        }
      } catch (apiErr: any) {
        console.error("Live Gmail API call failed:", apiErr);
        error = { code: -32603, message: apiErr.message || "Google API request failed." };
      }

    } else {
      // -------------------------------------------------------------
      // SIMULATED MOCK CONNECTION PATH
      // -------------------------------------------------------------
      switch (method) {
        case "gmail_list_messages": {
          const query = params?.q || "label:inbox";
          const maxResults = params?.maxResults || 10;
          
          let filtered = [...MOCK_EMAILS, ...simulatedSent];
          if (query.includes("label:inbox")) {
            filtered = filtered.filter(e => e.labels.includes("INBOX"));
          }
          if (query.includes("is:unread")) {
            filtered = filtered.filter(e => e.labels.includes("UNREAD"));
          }
          if (query.includes("-label:Loopin/Processed")) {
            filtered = filtered.filter(e => !e.labels.includes("Loopin/Processed") && !e.labels.includes("Label_processed"));
          }

          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  messages: filtered.slice(0, maxResults).map(e => ({
                    id: e.id,
                    threadId: e.threadId,
                    from: e.from,
                    subject: e.subject,
                    date: e.date,
                    snippet: e.snippet,
                    body: params?.includeBody ? e.body : undefined,
                    labels: e.labels,
                    rfcMessageId: e.rfcMessageId || `<${e.id}@mock.local>`,
                  }))
                }, null, 2)
              }
            ]
          };
          break;
        }

        case "gmail_ensure_labels": {
          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify({ labelIds: simulatedLoopinLabelIds }, null, 2),
              },
            ],
          };
          break;
        }

        case "gmail_modify_labels": {
          const { messageId, addLabelIds = [] } = params || {};
          const email = [...MOCK_EMAILS, ...simulatedSent].find(e => e.id === messageId);
          if (email) {
            for (const labelId of addLabelIds) {
              const name = Object.entries(simulatedLoopinLabelIds).find(([, id]) => id === labelId)?.[0];
              if (name && !email.labels.includes(name)) email.labels.push(name);
            }
          }
          result = {
            content: [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }],
          };
          break;
        }

        case "gmail_get_message": {
          const messageId = params?.id;
          const email = [...MOCK_EMAILS, ...simulatedDrafts, ...simulatedSent].find(e => e.id === messageId);

          if (!email) {
            error = { code: -32602, message: `Message with ID ${messageId} not found` };
          } else {
            result = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(email, null, 2)
                }
              ]
            };
          }
          break;
        }

        case "gmail_search_messages": {
          const query = params?.q || "";
          const lowerQuery = query.toLowerCase();

          const filtered = [...MOCK_EMAILS, ...simulatedSent].filter(e => 
            e.subject.toLowerCase().includes(lowerQuery) || 
            e.from.toLowerCase().includes(lowerQuery) || 
            e.body.toLowerCase().includes(lowerQuery)
          );

          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  messages: filtered.map(e => ({
                    id: e.id,
                    threadId: e.threadId,
                    from: e.from,
                    subject: e.subject,
                    date: e.date,
                    snippet: e.snippet,
                    labels: e.labels
                  }))
                }, null, 2)
              }
            ]
          };
          break;
        }

        case "gmail_send_message": {
          const { to, subject, body } = params || {};
          const sentId = `msg_${Math.random().toString(36).substring(2, 9)}`;
          const newSent = {
            id: sentId,
            threadId: `thread_${Math.random().toString(36).substring(2, 9)}`,
            from: "Rahul <rahul@loopin.ai>",
            to,
            subject,
            date: new Date().toISOString(),
            snippet: body.substring(0, 100) + "...",
            body: body,
            labels: ["SENT", "INBOX"]
          };

          simulatedSent.push(newSent);

          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  message: "Email sent successfully (Simulated)",
                  messageId: sentId,
                  threadId: newSent.threadId
                }, null, 2)
              }
            ]
          };
          break;
        }

        case "gmail_create_draft": {
          const { to, subject, body, threadId, inReplyTo } = params || {};
          const draftId = `draft_${Math.random().toString(36).substring(2, 9)}`;
          const newDraft = {
            id: draftId,
            threadId: threadId || `thread_${Math.random().toString(36).substring(2, 9)}`,
            from: "Rahul <rahul@loopin.ai>",
            to,
            subject,
            date: new Date().toISOString(),
            snippet: (body || "").substring(0, 100) + "...",
            body: body,
            labels: ["DRAFT"],
            inReplyTo,
          };

          simulatedDrafts.push(newDraft);

          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  message: "Draft created successfully (Simulated)",
                  draft: {
                    id: draftId,
                    message: {
                      id: draftId,
                      threadId: newDraft.threadId
                    }
                  }
                }, null, 2)
              }
            ]
          };
          break;
        }

        case "gmail_list_drafts": {
          const maxResults = params?.maxResults || 10;
          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  drafts: simulatedDrafts.slice(0, maxResults).map((d) => ({
                    id: d.id,
                    messageId: d.id,
                    threadId: d.threadId,
                    to: d.to,
                    subject: d.subject,
                    snippet: d.snippet,
                    body: d.body,
                    date: d.date,
                    gmailUrl: `https://mail.google.com/mail/u/0/#drafts/${d.threadId}`,
                  })),
                }, null, 2),
              },
            ],
          };
          break;
        }

        case "gmail_get_thread": {
          const threadId = params?.id;
          const threadEmails = [...MOCK_EMAILS, ...simulatedSent, ...simulatedDrafts].filter(e => e.threadId === threadId);

          result = {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  id: threadId,
                  messages: threadEmails
                }, null, 2)
              }
            ]
          };
          break;
        }

        default:
          error = { code: -32601, message: `Method not found: ${method}` };
      }
    }

    const responseFrame = error 
      ? { jsonrpc: "2.0", error, id } 
      : { jsonrpc: "2.0", result, id };

    if (!error) {
      void trackFeatureUsage({
        userId,
        feature: "gmail",
        action: method || "use",
      });
    }

    return NextResponse.json({
      requestFrame,
      responseFrame,
      result,
      error
    });

  } catch (err: any) {
    console.error("Error in gmail-mcp API route:", err);
    return NextResponse.json({
      jsonrpc: "2.0",
      error: { code: -32603, message: err.message || "Internal Server Error" },
      id: 1
    }, { status: 500 });
  }
}
