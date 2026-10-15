import React from "react";
import { prisma } from "@/lib/db";
import SettingsClient from "@/components/settings/SettingsClient";
import { requirePageUser } from "@/lib/auth/session";
import { googleAccountsOf } from "@/lib/auth/ownership";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageUser();
  let googleAccounts: any[] = [];
  try {
    googleAccounts = await prisma.googleAccount.findMany({
      where: googleAccountsOf(user.id),
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { generations: true } },
      },
    });
  } catch (error) {
    console.error("Fetch google accounts error:", error);
  }



  return (
    <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Cài đặt</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Tài khoản Google dùng để tạo video trên Flow.
        </p>
      </div>

      <SettingsClient
        initialAccounts={JSON.parse(JSON.stringify(googleAccounts))}
      />
    </div>
  );
}
