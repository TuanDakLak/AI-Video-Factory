import { SignJWT, jwtVerify } from "jose";
import { ACCESS_TTL_SEC, AUTH_AUDIENCE, AUTH_ISSUER, authSecret } from "./config";

/** Edge-safe (used by the middleware). */
export interface AccessClaims {
  sub: string; // user id
  role: "USER" | "ADMIN";
  sid: string; // refresh-token family = session id, lets handlers reject access tokens of a revoked session
}

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  return new SignJWT({ role: claims.role, sid: claims.sid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(AUTH_ISSUER)
    .setAudience(AUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(authSecret());
}

/** Returns the claims of a valid token, or null (bad signature, expired, wrong alg/issuer/audience, malformed). */
export async function verifyAccessToken(token: string | undefined | null): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), {
      algorithms: ["HS256"], // pinned: never accept "none" or an asymmetric alg confusion
      issuer: AUTH_ISSUER,
      audience: AUTH_AUDIENCE,
      clockTolerance: 5,
    });
    const role = payload.role === "ADMIN" ? "ADMIN" : payload.role === "USER" ? "USER" : null;
    if (typeof payload.sub !== "string" || !payload.sub || !role || typeof payload.sid !== "string" || !payload.sid) return null;
    return { sub: payload.sub, role, sid: payload.sid };
  } catch {
    return null;
  }
}
