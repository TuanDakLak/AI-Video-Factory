"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layers, Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

type Ratio = "9:16" | "16:9" | "1:1";
interface ChannelOption {
  id: string;
  name: string;
  aspectRatio: Ratio;
  model: string;
  clipSeconds: number;
  transition: "CUT" | "CROSSFADE";
  refCount: number;
  googleAccountId: string | null;
}
interface AccountOption { id: string; name: string; status: string; lastKnownFlowCredits?: number | null }

interface Props {
  channels: ChannelOption[];
  googleAccounts: AccountOption[];
  initialChannelId?: string;
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40";

/** Manual video: one brief, Flow's Agent splits it into ~10 s clips in one project, the clips are joined into one long video. */
export default function NewSequenceForm({ channels, googleAccounts, initialChannelId }: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const initial = channels.find((c) => c.id === initialChannelId);

  const [channelId, setChannelId] = useState(initial?.id || "");
  const [brief, setBrief] = useState("");
  const [title, setTitle] = useState("");
  const [totalDuration, setTotalDuration] = useState(30);
  const [clipSeconds, setClipSeconds] = useState(initial?.clipSeconds ?? 10);
  const [aspectRatio, setAspectRatio] = useState<Ratio>(initial?.aspectRatio ?? "9:16");
  const [model, setModel] = useState(initial?.model ?? "Veo 3.1 Fast");
  const [transition, setTransition] = useState<"CUT" | "CROSSFADE">(initial?.transition ?? "CUT");
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const connected = googleAccounts.find((a) => a.status === "CONNECTED")?.id || googleAccounts[0]?.id || "";
  const [googleAccountId, setGoogleAccountId] = useState(initial?.googleAccountId || connected);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const channel = channels.find((c) => c.id === channelId);
  const applyChannel = (id: string) => {
    setChannelId(id);
    const c = channels.find((x) => x.id === id);
    if (!c) return;
    setAspectRatio(c.aspectRatio);
    setModel(c.model);
    setClipSeconds(c.clipSeconds);
    setTransition(c.transition);
    if (c.googleAccountId) setGoogleAccountId(c.googleAccountId);
  };

  const clips = Math.max(1, Math.round((totalDuration || 0) / Math.max(1, clipSeconds)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brief.trim()) return error("Nhập ý tưởng hoặc kịch bản cho video.");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: channelId || undefined,
          brief: brief.trim(),
          title: title.trim() || undefined,
          totalDuration,
          clipSeconds,
          aspectRatio,
          model,
          transition,
          googleAccountId: googleAccountId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không thể tạo video.");
      if (refFiles.length > 0) {
        const fd = new FormData();
        refFiles.forEach((f) => fd.append("files", f));
        const up = await fetch(`/api/sequences/${data.sequence.id}/references`, { method: "POST", body: fd });
        if (!up.ok) {
          const e = await up.json().catch(() => ({}));
          error(e.error || "Không tải được ảnh tham chiếu, bạn có thể thêm lại ở trang chi tiết.");
        }
      }
      success(`Đã tạo video ${data.sceneCount} clip. Kiểm tra lại rồi bấm Bắt đầu render (hoặc Chạy thử miễn phí).`);
      router.push(`/sequences/${data.sequence.id}`);
    } catch (err: any) {
      error(err?.message || "Đã xảy ra lỗi.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-3.5 pb-6 border-b border-slate-100">
        <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Tạo video thủ công</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Flow Agent chia ý tưởng thành các clip ~10 giây trong cùng một project; hệ thống tải về và ghép thành một video dài.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Kênh (không bắt buộc)</label>
            <select value={channelId} onChange={(e) => applyChannel(e.target.value)} className={inputCls}>
              <option value="">-- Không thuộc kênh nào --</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.aspectRatio}{c.refCount ? `, ${c.refCount} ảnh` : ""})</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              {channel
                ? "Dùng phong cách, ngôn ngữ, hashtag và ảnh tham chiếu của kênh; video được xếp vào kênh này."
                : <>Quản lý kênh tại <Link href="/channels" className="text-emerald-700 hover:underline">trang Kênh</Link>.</>}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Tiêu đề (không bắt buộc)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Để trống: lấy dòng đầu của ý tưởng" className={inputCls} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">Ý tưởng / Kịch bản <span className="text-rose-500">*</span></label>
          <textarea
            rows={6}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Mô tả câu chuyện từ đầu đến cuối. Có thể viết sẵn từng cảnh: Scene 1..., Scene 2... (Flow sẽ làm theo đúng thứ tự)."
            className={inputCls + " leading-relaxed"}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <label className="text-xs font-semibold text-slate-700">Độ dài video</label>
            <div className="flex gap-1.5">
              {[30, 60, 90].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTotalDuration(v)}
                  className={`flex-1 text-xs px-2 py-2 rounded-xl border ${totalDuration === v ? "bg-emerald-50 border-emerald-400 text-emerald-700 font-semibold" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}
                >
                  {v}s
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Mỗi clip</label>
            <select value={clipSeconds} onChange={(e) => setClipSeconds(parseInt(e.target.value, 10))} className={inputCls}>
              {[8, 10].map((v) => <option key={v} value={v}>{v} giây</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Tỉ lệ khung hình</label>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as Ratio)} className={inputCls}>
              <option value="9:16">9:16 (TikTok/Reels)</option>
              <option value="16:9">16:9 (YouTube)</option>
              <option value="1:1">1:1 (Vuông)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Chuyển cảnh</label>
            <select value={transition} onChange={(e) => setTransition(e.target.value as "CUT" | "CROSSFADE")} className={inputCls}>
              <option value="CUT">Cắt thẳng</option>
              <option value="CROSSFADE">Mờ chồng 0.5s</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Mô hình Veo</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
              <option value="Veo 3.1 Fast">Veo 3.1 Fast</option>
              <option value="Veo 3.1 Quality">Veo 3.1 Quality</option>
              <option value="Veo 3.1 Lite">Veo 3.1 Lite</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Tài khoản Google (Flow)</label>
            <select value={googleAccountId} onChange={(e) => setGoogleAccountId(e.target.value)} className={inputCls}>
              {googleAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} [{a.status}] {a.lastKnownFlowCredits ? `(${a.lastKnownFlowCredits} credits)` : ""}</option>
              ))}
              {googleAccounts.length === 0 && <option value="">(Chưa có tài khoản: kết nối tại Cài đặt)</option>}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Ảnh sản phẩm / nhân vật (tối đa 3, không bắt buộc{channel?.refCount ? `; kênh đã có ${channel.refCount} ảnh` : ""})
          </label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => setRefFiles(Array.from(e.target.files || []).slice(0, 3))}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          />
        </div>

        <div className="rounded-2xl bg-emerald-50/60 border border-emerald-200 px-4 py-3 text-xs text-emerald-900">
          Flow sẽ tạo <b>{clips} clip</b> × {clipSeconds}s ≈ <b>{clips * clipSeconds}s</b>, ước tính ~{clips * 15} tín dụng (≈12–15/clip). Chưa render cho tới khi bạn bấm Bắt đầu.
        </div>

        <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
          <Link href="/sequences" className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100">Hủy</Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Đang tạo...</span></>) : (<><Wand2 className="w-3.5 h-3.5" /><span>Tạo video</span></>)}
          </button>
        </div>
      </form>
    </div>
  );
}
