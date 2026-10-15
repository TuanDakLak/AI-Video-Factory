import type { Prisma } from "@prisma/client";

/**
 * Videos shown to the user (library, dashboard): finished long videos, single generations and manual imports.
 * Scene clips of a multi-scene video are intermediates and are never listed, also while the sequence is still rendering.
 */
export const LIBRARY_VIDEO_WHERE: Prisma.VideoAssetWhereInput = {
  NOT: { generation: { is: { sequenceId: { not: null } } } },
};
