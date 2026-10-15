import { prisma } from "../lib/db";
import { signAccessToken, verifyAccessToken } from "../lib/auth/jwt";
import { safeNextPath, REUSE_GRACE_SEC } from "../lib/auth/config";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { createSession, hashToken, isSessionActive, revokeAllSessions, revokeFamily, rotateRefreshToken } from "../lib/auth/tokens";
import { ownsGoogleAccount, ownsProject, ownsSequence } from "../lib/auth/ownership";
import { SignJWT } from "jose";

/** Auth tests. Needs Postgres (DATABASE_URL) and AUTH_SECRET; creates and removes its own users. */
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`❌ ${msg}`);
  console.log(`✅ ${msg}`);
}

async function run() {
  process.env.AUTH_SECRET ||= "test-secret-for-auth-tests-only-0123456789abcdef";
  const tag = `t${Date.now()}`;
  const created: string[] = [];

  try {
    console.log("--- 1. Access JWT ---");
    const tok = await signAccessToken({ sub: "u1", role: "USER", sid: "fam1" });
    const claims = await verifyAccessToken(tok);
    assert(claims?.sub === "u1" && claims.sid === "fam1" && claims.role === "USER", "valid token verifies");
    const [h, p, sig] = tok.split(".");
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "ADMIN" })).toString("base64url")}.${sig}`;
    assert((await verifyAccessToken(tampered)) === null, "tampered payload (role escalation) rejected");
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${p}.`;
    assert((await verifyAccessToken(none)) === null, 'alg "none" rejected');
    const foreign = await new SignJWT({ role: "USER", sid: "x" }).setProtectedHeader({ alg: "HS256" }).setSubject("u1").setIssuer("someone-else").setAudience("ai-content-factory-web").setExpirationTime("5m").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    assert((await verifyAccessToken(foreign)) === null, "wrong issuer rejected");
    const expired = await new SignJWT({ role: "USER", sid: "x" }).setProtectedHeader({ alg: "HS256" }).setSubject("u1").setIssuer("ai-content-factory").setAudience("ai-content-factory-web").setIssuedAt(Math.floor(Date.now() / 1000) - 3600).setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    assert((await verifyAccessToken(expired)) === null, "expired token rejected");

    console.log("\n--- 2. Redirect target ---");
    assert(safeNextPath("/videos?x=1") === "/videos?x=1", "relative path kept");
    assert(safeNextPath("//evil.com") === "/dashboard" && safeNextPath("https://evil.com") === "/dashboard" && safeNextPath("/\\evil.com") === "/dashboard", "open redirects refused");

    console.log("\n--- 3. Passwords (argon2id) ---");
    const ph = await hashPassword("correct horse battery");
    assert(ph.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"), "argon2id with OWASP parameters");
    assert(await verifyPassword(ph, "correct horse battery"), "right password accepted");
    assert(!(await verifyPassword(ph, "wrong password")), "wrong password refused");
    assert(!(await verifyPassword(null, "anything")), "unknown user refused (dummy verify)");

    console.log("\n--- 4. Refresh-token rotation & theft detection ---");
    // created directly, NOT via registerUser: on an empty database that would make the test user the bootstrap admin
    // and hand it every existing project, which the cleanup below would then cascade-delete
    const a = await prisma.user.create({ data: { email: `a-${tag}@test.local`, name: "A", passwordHash: ph } });
    created.push(a.id);
    const b = await prisma.user.create({ data: { email: `b-${tag}@test.local`, name: "B", passwordHash: ph } });
    created.push(b.id);

    const s = await createSession(a.id);
    const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(s.refreshToken) } });
    assert(row && row.tokenHash !== s.refreshToken, "only the hash is stored");
    const r1 = await rotateRefreshToken(s.refreshToken);
    assert(r1.ok && !!r1.refreshToken && r1.refreshToken !== s.refreshToken && r1.familyId === s.familyId, "rotation issues a new token in the same family");
    const race = await rotateRefreshToken(s.refreshToken);
    assert(race.ok && !race.refreshToken, `reuse inside the ${REUSE_GRACE_SEC}s grace window = parallel request: access only, no new refresh token`);
    await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(s.refreshToken) }, data: { rotatedAt: new Date(Date.now() - (REUSE_GRACE_SEC + 5) * 1000) } });
    const stolen = await rotateRefreshToken(s.refreshToken);
    assert(!stolen.ok && stolen.reason === "reuse_detected", "replaying a rotated token after the grace window = theft detected");
    const victim = await rotateRefreshToken(r1.ok ? r1.refreshToken : "");
    assert(!victim.ok && victim.reason === "revoked", "the whole family is revoked: the newest token dies too");
    assert(!(await isSessionActive(s.familyId)), "session (sid) is no longer active, so its access tokens are refused by handlers");
    assert(!(await rotateRefreshToken("not-a-token")).ok, "unknown token refused");

    const s2 = await createSession(a.id);
    await revokeFamily(s2.familyId, "logout");
    assert(!(await rotateRefreshToken(s2.refreshToken)).ok, "logout revokes the session");
    const s3 = await createSession(a.id);
    const s4 = await createSession(a.id);
    await revokeAllSessions(a.id, "logout_all");
    assert(!(await isSessionActive(s3.familyId)) && !(await isSessionActive(s4.familyId)), "log out everywhere revokes every session");
    await prisma.user.update({ where: { id: a.id }, data: { disabled: true } });
    const s5 = await createSession(a.id);
    const dis = await rotateRefreshToken(s5.refreshToken);
    assert(!dis.ok && dis.reason === "disabled", "a disabled user cannot refresh");
    await prisma.user.update({ where: { id: a.id }, data: { disabled: false } });

    console.log("\n--- 5. Tenant isolation ---");
    const pa = await prisma.project.create({ data: { ownerId: a.id, name: "A project", topic: "t" } });
    const ga = await prisma.googleAccount.create({ data: { ownerId: a.id, name: "A google", label: "l", profileDir: `u-${tag}-a` } });
    const seq = await prisma.sequence.create({ data: { projectId: pa.id, title: "s", brief: "b", styleBible: "" } });
    assert(await ownsProject(a.id, pa.id), "owner sees own project");
    assert(!(await ownsProject(b.id, pa.id)), "another user cannot access the project");
    assert(!(await ownsGoogleAccount(b.id, ga.id)), "another user cannot use the Google account (session + credits)");
    assert(!(await ownsSequence(b.id, seq.id)) && (await ownsSequence(a.id, seq.id)), "sequences follow their project's owner");
  } finally {
    if (created.length) await prisma.user.deleteMany({ where: { id: { in: created } } }); // cascades projects, accounts, tokens
  }
  console.log("\n🎉 ALL AUTH TESTS PASSED");
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
