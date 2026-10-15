import { prisma } from '../lib/db'; 
async function run() { 
  const g = await prisma.generation.findFirst({ 
    orderBy: { createdAt: 'desc' }, 
    include: { events: { orderBy: { createdAt: 'asc' } } } 
  }); 
  console.log('Status:', g?.status); 
  console.log('Error Message:', g?.errorMessage);
  console.log('Events:'); 
  g?.events.forEach(e => console.log(`[${e.type}] ${e.message}`)); 
} 
run().catch(console.error).finally(() => prisma.$disconnect());
