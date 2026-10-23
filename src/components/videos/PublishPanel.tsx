"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Send } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

interface Social {
  id: string;
  platform: "TIKTOK" | "FACEBOOK_PAGE";
  displayName: string;
  status: string;
}
interface Pub {
  id: string;
  platform: string;
  status: string;
  remoteUrl: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  privacy: string | null;
  socialAccount: { displayName: string };
}

const STATUS: Record<string, [string, string]> = {
  QUEUED: ["Chờ đăng", "bg-slate-100 text-slate-600"],
  UPLOADING: ["Đang tải lên", "bg-amber-50 text-amber-700"],
  PROCESSING: ["Nền tảng đang xử lý", "bg-amber-50 text-amber-700"],
  PUBLISHED: ["Đã đăng", "bg-emerald-50 text-emerald-700"],
  FAILED: ["Lỗi", "bg-rose-50 text-rose-700"],
};
const LABEL: Record<string, string> = { TIKTOK: "TikTok", FACEBOOK_PAGE: "Facebook" };

/** Post this video to connected social accounts (the worker uploads it) and follow each post's status. */
export function PublishPanel({ videoId }: { videoId: string }) {
  const { success, error } = useToast();
  const [socials, setSocials] = useState<Social[]>([]);
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState("SELF_ONLY");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([fetch("/api/social", { cache: "no-store" }), fetch(`/api/videos/${videoId}/publish`, { cache: "no-store" })]);
    if (s.ok) setSocials((await s.json()).accounts.filter((a: Social) => a.status === "CONNECTED"));
    if (p.ok) setPubs(await p.json());
  }, [videoId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const publish = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialAccountIds: selected, tiktokPrivacy: privacy }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || (d.skipped?.length ? `Đã đăng/đang chờ đăng lên: ${d.skipped.join(", ")}` : "Không đăng được."));
      success(`Đã xếp hàng đăng lên: ${d.created.join(", ")}. Worker sẽ tải lên trong ít phút.`);
      setSelected([]);
      await load();
    } catch (e: any) {
      error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const done = new Set(pubs.map((p) => p.socialAccount.displayName + p.platform));
  const choices = socials.filter((s) => !done.has(s.displayName + s.platform));

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Send className="w-4 h-4 text-violet-600" /> Đăng lên mạng xã hội</h3>

      {pubs.length > 0 && (
        <ul className="space-y-1.5">
          {pubs.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-slate-700">{LABEL[p.platform] ?? p.platform}: {p.socialAccount.displayName}{p.privacy && p.privacy !== "PUBLIC_TO_EVERYONE" ? ` (${p.privacy === "SELF_ONLY" ? "riêng tư" : p.privacy})` : ""}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS[p.status]?.[1] ?? ""}`} title={p.errorMessage || ""}>{STATUS[p.status]?.[0] ?? p.status}</span>
                {p.remoteUrl && <a href={p.remoteUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700"><ExternalLink className="w-3.5 h-3.5" /></a>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {pubs.some((p) => p.status === "FAILED" && p.errorMessage) && (
        <p className="text-[11px] text-rose-600">{pubs.filter((p) => p.status === "FAILED").map((p) => `${LABEL[p.platform]}: ${p.errorMessage}`).join(" • ")}</p>
      )}

      {socials.length === 0 ? (
        <p className="text-xs text-slate-500">Chưa kết nối tài khoản nào. <Link href="/settings" className="text-emerald-700 font-semibold hover:underline">Kết nối TikTok / Facebook →</Link></p>
      ) : choices.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {choices.map((s) => (
              <button key={s.id} type="button" onClick={() => setSelected((x) => (x.includes(s.id) ? x.filter((i) => i !== s.id) : [...x, s.id]))}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium ${selected.includes(s.id) ? "bg-violet-50 border-violet-400 text-violet-800" : "border-slate-200 text-slate-600"}`}>
                {LABEL[s.platform]}: {s.displayName}
              </button>
            ))}
          </div>
          {choices.some((s) => s.platform === "TIKTOK" && selected.includes(s.id)) && (
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs">
              <option value="SELF_ONLY">TikTok: chỉ mình tôi</option>
              <option value="PUBLIC_TO_EVERYONE">TikTok: công khai (cần ứng dụng đã được TikTok duyệt)</option>
              <option value="FOLLOWER_OF_CREATOR">TikTok: người theo dõi</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">TikTok: bạn bè</option>
            </select>
          )}
          <button type="button" onClick={publish} disabled={busy || selected.length === 0} className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Đăng
          </button>
        </div>
      ) : null}
    </div>
  );
}
