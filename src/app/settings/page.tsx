import React, { Suspense } from "react";
import { prisma } from "@/lib/db";
import SettingsClient from "@/components/settings/SettingsClient";
import { AccountSecurity } from "@/components/settings/AccountSecurity";
import { requirePageUser } from "@/lib/auth/session";
import { googleAccountsOf } from "@/lib/auth/ownership";
import { googleEnabled } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageUser();
  let googleAccounts: any[] = [];
  let me: { passwordHash: string | null; oauthAccounts: { email: string | null }[] } | null = null;
  try {
    [googleAccounts, me] = await Promise.all([
      prisma.googleAccount.findMany({
        where: googleAccountsOf(user.id),
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { generations: true } } },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true, oauthAccounts: { where: { provider: "google" }, select: { email: true } } },
      }),
    ]);
  } catch (error) {
    console.error("Fetch settings error:", error);
  }

  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Cài đặt</h2>
        <p className="text-sm text-slate-500 mt-0.5">Tài khoản đăng nhập và các tài khoản Google dùng để tạo video trên Flow.</p>
      </div>

      <Suspense>
        <AccountSecurity
          email={user.email}
          hasPassword={!!me?.passwordHash}
          googleEnabled={googleEnabled()}
          googleEmails={(me?.oauthAccounts ?? []).map((o) => o.email || "").filter(Boolean)}
        />
      </Suspense>

      <SettingsClient initialAccounts={JSON.parse(JSON.stringify(googleAccounts))} />
    </div>
  );
}
