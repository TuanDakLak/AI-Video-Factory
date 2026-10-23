import { prisma } from "../lib/db";
import { createPreset, deletePreset, getPreset, listPresets, presetInputSchema, updatePreset } from "../lib/presets";
import { addTopic, findDuplicate, normalizeTitle, schedulerTick, similarity } from "../lib/automation/topics";
import { GENRES, GENRE_KEYS, beats } from "../lib/content/genres";
import { clipCount, scriptToBrief, writeScript } from "../lib/content/script-writer";
import { buildAgentBatchPrompt } from "../lib/sequence/agent-prompt";
import { nichePhrases, parseGoogleNews, parseTrendsRss, parseWikipediaTop } from "../lib/research/sources";
import { channelsNeedingResearch, inboxSize, inboxTarget, researchChannel } from "../lib/research/researcher";

/**
 * Topic inbox / channels / genre scripts. Needs Postgres. Never reaches Flow: the test users own no Google account, so
 * the scheduler can't start a video, and scripts are written with the LLM disabled.
 */
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`❌ ${msg}`);
  console.log(`✅ ${msg}`);
}

async function run() {
  // deterministic fallback scripts, no paid calls. An empty string (not delete): Prisma loads .env on connect and
  // would put the key back, but it never overrides a variable that is already set.
  process.env.GEMINI_API_KEY = "";
  const tag = `t${Date.now()}`;
  const users: string[] = [];
  try {
    const a = await prisma.user.create({ data: { email: `auto-a-${tag}@test.local`, name: "A", passwordHash: null } });
    users.push(a.id);
    const b = await prisma.user.create({ data: { email: `auto-b-${tag}@test.local`, name: "B", passwordHash: null } });
    users.push(b.id);

    console.log("--- 1. Channels in the database ---");
    const ch = await createPreset(presetInputSchema.parse({ name: "Kênh cổ tích", niche: "truyện cổ tích Việt Nam", genres: ["storytelling", "short_film"], durations: [30, 60], hashtags: ["#cotich"] }), a.id);
    assert(ch.genres.join() === "storytelling,short_film" && ch.durations.join() === "30,60" && ch.hashtags[0] === "#cotich", "channel stored with genres, durations and hashtags");
    assert((await getPreset(ch.id, b.id)) === null && (await listPresets(b.id)).length === 0, "another user cannot see the channel");
    assert((await updatePreset(ch.id, b.id, { videosPerDay: 9 })) === null && (await deletePreset(ch.id, b.id)) === null, "another user cannot change or delete it");
    const up = await updatePreset(ch.id, a.id, { videosPerDay: 2, automationEnabled: true, reviewHours: 0 });
    assert(up?.videosPerDay === 2 && up.automationEnabled && up.reviewHours === 0, "owner can update automation settings");
    let foreignAccount = false;
    try {
      const gb = await prisma.googleAccount.create({ data: { ownerId: b.id, name: "B google", label: "x", profileDir: `u-${tag}-b` } });
      await updatePreset(ch.id, a.id, { googleAccountId: gb.id });
    } catch {
      foreignAccount = true;
    }
    assert(foreignAccount, "a channel cannot use another user's Google account");

    console.log("\n--- 2. Duplicate detection ---");
    assert(normalizeTitle("  Sự Tích Cây Vú Sữa!! ") === "su tich cay vu sua", "titles normalized (accents, case, punctuation)");
    assert(similarity(normalizeTitle("Sự tích cây vú sữa"), normalizeTitle("Sự tích về cây vú sữa")) >= 0.7, "near-identical titles are similar");
    assert(similarity(normalizeTitle("Sự tích cây vú sữa"), normalizeTitle("Top 5 loài cá mập")) < 0.3, "different topics are not");
    const channel = await prisma.channel.findUniqueOrThrow({ where: { id: ch.id } });
    const t1 = await addTopic(channel, { title: "Sự tích cây vú sữa", source: "AI_RESEARCH" });
    assert(t1.status === "created" && t1.topic.status === "APPROVED" === false, "AI topic lands in the inbox");
    const t2 = await addTopic(channel, { title: "Sự tích cây vú sữa", source: "AI_RESEARCH" });
    assert(t2.status === "duplicate", "exact duplicate refused");
    if (t1.status === "created") await prisma.topic.update({ where: { id: t1.topic.id }, data: { status: "REJECTED" } });
    assert((await findDuplicate(channel.id, "SỰ TÍCH CÂY VÚ SỮA")) !== null, "a deleted topic is never suggested again");
    const t3 = await addTopic(channel, { title: "Thánh Gióng đánh giặc Ân", source: "AI_RESEARCH" });
    const t4 = await addTopic(channel, { title: "Sơn Tinh Thủy Tinh", source: "AI_RESEARCH" });
    assert(t3.status === "created" && t4.status === "created" && (t3.topic.genre !== t4.topic.genre || t3.topic.durationSec !== t4.topic.durationSec), "genres/durations rotate across topics");

    console.log("\n--- 3. Scheduler ---");
    await prisma.channel.update({ where: { id: ch.id }, data: { reviewHours: 12 } });
    const pending = await addTopic(await prisma.channel.findUniqueOrThrow({ where: { id: ch.id } }), { title: "Con Rồng cháu Tiên", source: "AI_RESEARCH" });
    assert(pending.status === "created" && pending.topic.status === "SUGGESTED" && !!pending.topic.autoApproveAt, "topic waits for the review delay");
    await prisma.topic.update({ where: { id: (pending as any).topic.id }, data: { autoApproveAt: new Date(Date.now() - 1000) } });
    const r = await schedulerTick();
    const after = await prisma.topic.findUniqueOrThrow({ where: { id: (pending as any).topic.id } });
    assert(after.status === "APPROVED" && r.autoApproved >= 1, "after the review delay the topic is approved automatically");
    assert(r.skipped.some((s) => s.includes("Kênh cổ tích") && s.includes("tài khoản Google")) && r.started.length === 0, "nothing starts without a connected Google account (no credits spent)");
    const rejectedStays = await prisma.topic.count({ where: { channelId: ch.id, status: "REJECTED" } });
    assert(rejectedStays === 1, "a deleted topic is never approved by the scheduler");

    console.log("\n--- 4. Genre scripts ---");
    for (const g of GENRE_KEYS) assert(beats(GENRES[g], 3).length === 3 && beats(GENRES[g], 9).length === 9, `${GENRES[g].label}: 3 and 9 beats (30s / 90s)`);
    assert(beats(GENRES.short_film, 3)[0].startsWith("hook") && beats(GENRES.short_film, 3)[2].startsWith("final image"), "beats keep the hook first and the ending last");
    assert(clipCount(30, 10) === 3 && clipCount(60, 10) === 6 && clipCount(90, 10) === 9, "30/60/90 s = 3/6/9 clips");
    const script = await writeScript({ topic: "Sự tích Hồ Gươm", genre: "storytelling", durationSec: 30, clipSeconds: 10, language: "vi" });
    assert(!script.usedAI && script.mode === "agent" && script.scenes.length === 3 && !!script.warning, "without an LLM: no invented scenes, the Flow Agent plans (with a note why)");
    const agentBrief = scriptToBrief(script, "storytelling", "vi");
    assert(!/^Scene 1/m.test(agentBrief) && agentBrief.includes("A narrator speaks in Vietnamese") && /^1\. hook/m.test(agentBrief), "fallback brief gives the topic, genre guidance, structure and language");
    const written = {
      ...script,
      mode: "script" as const,
      scenes: script.scenes.map((s, i) => ({ beat: s.beat, visual: "An old turtle rises from a misty lake at dawn.", camera: "slow push-in", speech: i === 0 ? "Ngày xửa ngày xưa…" : "" })),
    };
    const brief = scriptToBrief(written, "storytelling", "vi");
    assert(/^Scene 1 — /m.test(brief) && /^Scene 3 — /m.test(brief) && brief.includes('Spoken in Vietnamese: "Ngày xửa ngày xưa…"'), "brief numbers scenes like Flow and carries the exact Vietnamese line");
    const prompt = buildAgentBatchPrompt({ brief, totalDuration: 30, clipSeconds: 10, count: 3, aspectRatio: "9:16", language: "vi" });
    assert(prompt.includes("finished script: follow it scene by scene") && prompt.includes("must be in Vietnamese"), "Flow Agent is told to follow the script and speak Vietnamese");

    console.log("\n--- 5. Research: free signals (offline fixtures) ---");
    const rss = `<rss><channel><item><title>đội tuyển việt nam</title><ht:approx_traffic>20000+</ht:approx_traffic>
      <ht:news_item><ht:news_item_title><![CDATA[Việt Nam thắng &amp; vào chung kết]]></ht:news_item_title><ht:news_item_url>https://vnexpress.net/a</ht:news_item_url></ht:news_item></item>
      <item><title>trung thu</title><ht:approx_traffic>5000+</ht:approx_traffic></item></channel></rss>`;
    const trends = parseTrendsRss(rss);
    assert(trends.length === 2 && trends[0].title === "đội tuyển việt nam" && trends[0].detail!.includes("Việt Nam thắng & vào chung kết") && trends[0].url === "https://vnexpress.net/a", "Google Trends RSS parsed (traffic, headline, URL, entities)");
    const wiki = parseWikipediaTop({ items: [{ articles: [{ article: "Trang_Chính", views: 9e5 }, { article: "Hồ_Hoàn_Kiếm", views: 6214 }, { article: "Tình_dục_với_động_vật", views: 8272 }] }] }, "vi");
    assert(wiki.length === 1 && wiki[0].title === "Hồ Hoàn Kiếm" && wiki[0].url!.startsWith("https://vi.wikipedia.org/wiki/"), "Wikipedia top: main page and sexual pages filtered out");
    const newsXml = `<rss><channel>
      <item><title>Mã giới thiệu Binance BTC9149 hoàn phí 20% - Spam Blog</title><link>https://spam.example/x</link><source url="https://spam.example">Spam Blog</source></item>
      <item><title>Truyện cổ tích Rumani: “Lụa thần” - VOV.VN</title><link>https://news.google.com/a</link><source url="https://vov.vn">VOV.VN</source></item>
      <item><title>Một bài khác của cùng báo VOV để kiểm tra - VOV.VN</title><link>https://news.google.com/b</link><source url="https://vov.vn">VOV.VN</source></item>
    </channel></rss>`;
    const news = parseGoogleNews(newsXml);
    assert(news.length === 1 && news[0].title === "Truyện cổ tích Rumani: “Lụa thần”" && news[0].detail === "VOV.VN", "Google News: publisher stripped from the headline, spam dropped, one headline per publisher");
    assert(JSON.stringify(nichePhrases("truyện cổ tích, truyền thuyết Việt Nam")) === JSON.stringify(["truyện cổ tích", "truyền thuyết Việt Nam"]), "search phrases taken from the niche");
    assert(nichePhrases("").length === 0, "no niche -> no news search");

    console.log("\n--- 6. Research scheduling ---");
    assert(inboxTarget(1) === 3 && inboxTarget(2) === 6, "inbox target = 3 days of production (min 3)");
    const needing = await channelsNeedingResearch();
    const inbox = await inboxSize(ch.id);
    assert(needing.some((c) => c.id === ch.id) === inbox < inboxTarget(2), "a channel is researched only when its inbox is below target");
    await prisma.channel.update({ where: { id: ch.id }, data: { lastResearchAt: new Date() } });
    assert(!(await channelsNeedingResearch()).some((c) => c.id === ch.id), "and not again within 6 hours");
    const noLlm = await researchChannel(await prisma.channel.findUniqueOrThrow({ where: { id: ch.id } }), { count: 2 });
    assert(noLlm.created === 0 && noLlm.note.includes("GEMINI_API_KEY"), "without an LLM research is skipped with a clear note (no paid calls)");
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users } } }); // cascades channels, topics, accounts
  }
  console.log("\n🎉 ALL AUTOMATION TESTS PASSED");
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
