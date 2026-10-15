import { prisma } from "../lib/db";

/** Print the latest sequences with every scene's status and event log. Usage: tsx src/scripts/inspect-sequences.ts [limit] */
async function run() {
  const limit = parseInt(process.argv[2] || "3", 10) || 3;
  const seqs = await prisma.sequence.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      finalVideo: { select: { id: true, duration: true } },
      scenes: { orderBy: { sceneIndex: "asc" }, include: { videoAsset: { select: { id: true } }, events: { orderBy: { createdAt: "asc" } } } },
    },
  });
  for (const s of seqs.reverse()) {
    console.log(`\n=== ${s.id} | ${s.status} | ${s.continuity} | ${s.totalDuration}s/${s.clipSeconds}s | ${s.createdAt.toISOString()}`);
    console.log(`title: ${s.title}`);
    if (s.errorMessage) console.log(`error: ${s.errorMessage}`);
    for (const g of s.scenes) {
      console.log(`  -- scene ${(g.sceneIndex ?? 0) + 1}: ${g.status}${g.videoAsset ? " [clip]" : ""}${g.errorMessage ? " | " + g.errorMessage : ""}`);
      for (const e of g.events) console.log(`     ${e.createdAt.toISOString().slice(11, 19)} [${e.type}] ${e.message}`);
    }
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
