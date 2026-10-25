import React from "react";
import Link from "next/link";

/** Shell of the public legal pages (privacy, terms): readable without signing in. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-5 py-10 space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">AI Video Factory</p>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-xs text-slate-500">Cập nhật / Last updated: {updated}</p>
        </div>
        <article className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 text-sm leading-relaxed text-slate-700 space-y-4 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:pt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </article>
        <p className="text-xs text-slate-500 flex gap-4">
          <Link href="/privacy" className="hover:underline">Chính sách quyền riêng tư</Link>
          <Link href="/terms" className="hover:underline">Điều khoản sử dụng</Link>
        </p>
      </div>
    </div>
  );
}

export function contactLine(): React.ReactNode {
  const email = process.env.LEGAL_CONTACT_EMAIL?.trim();
  return email ? <a href={`mailto:${email}`} className="text-emerald-700 underline">{email}</a> : "quản trị viên của ứng dụng";
}
