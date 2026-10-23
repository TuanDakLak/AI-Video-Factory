import { createHash, randomBytes } from "crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { authSecret } from "./config";

/**
 * "Sign in with Google" = OpenID Connect authorization-code flow, hardened per OAuth 2.0 Security BCP (RFC 9700):
 *  - PKCE (S256) + `state` (CSRF on the callback) + `nonce` (id_token replay), all kept in a short-lived signed cookie;
 *  - the id_token is verified locally against Google's JWKS (signature, issuer, audience, expiry, nonce);
 *  - only Google-verified emails are accepted.
 * Configure GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and APP_URL (the redirect URI is built from APP_URL, never from
 * the request's Host header, which a client controls).
 */
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export const OAUTH_COOKIE = "acf_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth/google";
export const OAUTH_TTL_SEC = 600;

export function googleEnabled(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function googleRedirectUri(): string {
  return `${appUrl()}/api/auth/google/callback`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export interface OAuthTransaction {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
  /** set when a signed-in user links Google to their account; the callback re-checks it against the live session */
  linkUserId?: string;
}

/** Builds the Google consent URL and the signed transaction to keep in the OAuth cookie until the callback. */
export async function startGoogleSignIn(next: string, linkUserId?: string): Promise<{ url: string; cookie: string }> {
  const tx: OAuthTransaction = {
    state: b64url(randomBytes(32)),
    nonce: b64url(randomBytes(32)),
    verifier: b64url(randomBytes(48)),
    next,
    ...(linkUserId ? { linkUserId } : {}),
  };
  const challenge = b64url(createHash("sha256").update(tx.verifier).digest());
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  const cookie = await new SignJWT({ ...tx })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("oauth-google")
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_TTL_SEC}s`)
    .sign(authSecret());
  return { url: `${AUTH_ENDPOINT}?${params}`, cookie };
}

export async function readTransaction(cookie: string | undefined): Promise<OAuthTransaction | null> {
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, authSecret(), { algorithms: ["HS256"], audience: "oauth-google" });
    const { state, nonce, verifier, next, linkUserId } = payload as Record<string, unknown>;
    if (typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string" || typeof next !== "string") return null;
    return { state, nonce, verifier, next, ...(typeof linkUserId === "string" ? { linkUserId } : {}) };
  } catch {
    return null;
  }
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

/** Exchanges the authorization code (with the PKCE verifier) and returns the verified identity from the id_token. */
export async function finishGoogleSignIn(code: string, tx: OAuthTransaction): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: tx.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("no id_token in token response");

  const { payload } = await jwtVerify(body.id_token, JWKS, {
    issuer: ISSUERS,
    audience: process.env.GOOGLE_CLIENT_ID!,
    algorithms: ["RS256"],
    clockTolerance: 30,
  });
  if (payload.nonce !== tx.nonce) throw new Error("nonce mismatch");
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  // an unverified email could belong to someone else: never use it to find or create an account
  if (!email || payload.email_verified !== true) throw new Error("email not verified by Google");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("missing subject");
  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim().slice(0, 80) : email.split("@")[0];
  return { sub: payload.sub, email, name };
}
