import { Queue } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../lib/db";

async function clearQueue() {
  console.log("Connecting to Redis...");
  const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379");
  
  const generationQueue = new Queue("flow-automation", { connection });
  
  console.log("Draining queue...");
  await generationQueue.drain(true); // Removes delayed, wait, prioritized jobs
  await generationQueue.clean(0, 1000, "active");
  await generationQueue.clean(0, 1000, "wait");
  await generationQueue.clean(0, 1000, "prioritized");
  await generationQueue.clean(0, 1000, "delayed");
  await generationQueue.clean(0, 1000, "failed");
  
  console.log("Updating database statuses...");
  // Mark all processing/queued as CANCELLED
  await prisma.generation.updateMany({
    where: {
      status: {
        in: ["QUEUED", "STARTING_BROWSER", "CHECKING_ACCOUNT", "OPENING_FLOW", "SUBMITTING"]
      }
    },
    data: {
      status: "CANCELLED",
      errorMessage: "Người dùng yêu cầu xóa hàng đợi."
    }
  });

  // Also unlock all accounts
  await prisma.googleAccount.updateMany({
    data: {
      lockStatus: "AVAILABLE"
    }
  });

  console.log("Xóa hàng đợi và reset trạng thái thành công!");
  
  await connection.quit();
  await prisma.$disconnect();
}

clearQueue().catch(console.error);
