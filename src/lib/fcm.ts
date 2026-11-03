import { createSign } from "crypto";

/**
 * Minimal Firebase Cloud Messaging (HTTP v1) sender — no extra npm packages.
 *
 * Needs ONE env var: FIREBASE_SERVICE_ACCOUNT = the full contents of the
 * service-account JSON downloaded from Firebase Console
 * (Project settings -> Service accounts -> Generate new private key).
 * Pasting the raw JSON works; so does the base64 of that JSON.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedAccount: ServiceAccount | null | undefined;
let cachedToken: { value: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (cachedAccount !== undefined) return cachedAccount;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return (cachedAccount = null);
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return (cachedAccount = null);
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    return (cachedAccount = parsed as ServiceAccount);
  } catch {
    console.error("[fcm] FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON/base64 JSON");
    return (cachedAccount = null);
  }
}

export function fcmConfigured(): boolean {
  return loadServiceAccount() !== null;
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(sa.private_key));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Extra values delivered to the app when the notification is tapped. Strings only. */
  data?: Record<string, string>;
  /** Same tag = newer notification replaces older one (we use the thread id). */
  tag?: string;
}

/**
 * Sends one message to many device tokens.
 * Returns the tokens FCM says are dead (app uninstalled / token rotated)
 * so the caller can delete them.
 */
export async function sendFcm(tokens: string[], msg: PushMessage): Promise<{ sent: number; invalidTokens: string[] }> {
  const sa = loadServiceAccount();
  if (!sa || tokens.length === 0) return { sent: 0, invalidTokens: [] };

  const accessToken = await getAccessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const invalidTokens: string[] = [];
  let sent = 0;

  await Promise.all(
    tokens.map(async (token) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: msg.title, body: msg.body },
            data: msg.data ?? {},
            android: {
              priority: "HIGH",
              notification: {
                channel_id: "mail", // channel is created in MainActivity.java
                icon: "ic_stat_notify",
                color: "#2563EB",
                ...(msg.tag ? { tag: msg.tag } : {}),
              },
            },
          },
        }),
      });
      if (res.ok) {
        sent++;
        return;
      }
      const text = await res.text();
      // 404 UNREGISTERED / 400 INVALID_ARGUMENT (bad token) => token is dead.
      if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text)) invalidTokens.push(token);
      else console.error("[fcm] send failed", res.status, text.slice(0, 300));
    })
  );

  return { sent, invalidTokens };
}
