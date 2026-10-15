import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../lib/db";

async function hardReset() {
  console.log("Connecting to Redis...");
  const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379");
  
  const generationQueue = new Queue("flow-automation", { connection });
  
  console.log("Draining and wiping queue completely...");
  await generationQueue.drain(true);
  await generationQueue.clean(0, 1000, "active");
  await generationQueue.clean(0, 1000, "wait");
  await generationQueue.clean(0, 1000, "prioritized");
  await generationQueue.clean(0, 1000, "delayed");
  await generationQueue.clean(0, 1000, "failed");
  await generationQueue.obliterate({ force: true });
  
  console.log("Wiping logs (GenerationEvents)...");
  await prisma.generationEvent.deleteMany({});

  console.log("Wiping all Generations (including red errors)...");
  await prisma.generation.deleteMany({});

  console.log("Resetting all Google Accounts to AVAILABLE...");
  await prisma.googleAccount.updateMany({
    data: {
      lockStatus: "AVAILABLE"
    }
  });

  console.log("Dọn dẹp hoàn tất 100%! Giao diện bây giờ sẽ sạch bóng.");
  
  await connection.quit();
  await prisma.$disconnect();
}

hardReset().catch(console.error);
