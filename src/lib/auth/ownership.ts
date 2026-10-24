import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Tenant isolation. Every row belongs to exactly one user through `Project.ownerId` (generations, sequences and video assets
 * hang off a project, an internal folder per channel), `GoogleAccount.ownerId`, `Channel.ownerId` or `SocialAccount.ownerId`. Handlers must filter with these clauses or check with the
 * owns* helpers; a resource of another user is reported as "not found".
 */
export const generationsOf = (userId: string): Prisma.GenerationWhereInput => ({ project: { ownerId: userId } });
export const sequencesOf = (userId: string): Prisma.SequenceWhereInput => ({ project: { ownerId: userId } });
export const videoAssetsOf = (userId: string): Prisma.VideoAssetWhereInput => ({ project: { ownerId: userId } });
export const googleAccountsOf = (userId: string): Prisma.GoogleAccountWhereInput => ({ ownerId: userId });

export async function ownsProject(userId: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return !!(await prisma.project.findFirst({ where: { id, ownerId: userId }, select: { id: true } }));
}
export async function ownsGeneration(userId: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return !!(await prisma.generation.findFirst({ where: { id, ...generationsOf(userId) }, select: { id: true } }));
}
export async function ownsSequence(userId: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return !!(await prisma.sequence.findFirst({ where: { id, ...sequencesOf(userId) }, select: { id: true } }));
}
export async function ownsVideoAsset(userId: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return !!(await prisma.videoAsset.findFirst({ where: { id, ...videoAssetsOf(userId) }, select: { id: true } }));
}
export async function ownsGoogleAccount(userId: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return !!(await prisma.googleAccount.findFirst({ where: { id, ownerId: userId }, select: { id: true } }));
}
