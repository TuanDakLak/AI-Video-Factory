import { prisma } from '../lib/db';
async function run() {
  const g = await prisma.generation.findFirst({
    orderBy: { createdAt: 'desc' },
    include: { googleAccount: true }
  });
  console.log('Latest generation used account:', g?.googleAccount?.name);
  console.log('Account Status:', g?.googleAccount?.status);
  console.log('Profile Dir:', g?.googleAccount?.profileDir);
}
run().catch(console.error).finally(() => prisma.$disconnect());
