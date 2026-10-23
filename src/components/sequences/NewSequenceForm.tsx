"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Layers, Loader2, Wand2, FileText } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

interface ProjectOption { id: string; name: string }
interface ContentOption { id: string; projectId: string; title: string; aspectRatio: string; duration: string }
interface AccountOption { id: string; name: string; status: string; lastKnownFlowCredits?: number | null }

interface Props {
  projects: ProjectOption[];
  contents: ContentOption[];
  googleAccounts: AccountOption[];
  initialProjectId?: string;
  initialContentId?: string;
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40";

export default function NewSequenceForm({ projects, contents, googleAccounts, initialProjectId, initialContentId }: Props) {
  const router = useRouter();
  const { success, error, info } = useToast();

  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || "");
  const [contentId, setContentId] = useState(initialContentId || "");
  const [brief, setBrief] = useState("");
  const [title, setTitle] = useState("");
  const [totalDuration, setTotalDuration] = useState(30);
  const [clipSeconds, setClipSeconds] = useState(10);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [model, setModel] = useState("Veo 3.1 Fast");
  const [transition, setTransition] = useState<"CUT" | "CROSSFADE">("CUT");
  const [continuity, setContinuity] = useState<"FLOW_AGENT" | "INDEPENDENT" | "LAST_FRAME">("FLOW_AGENT");
  const [refFiles, setRefFiles] = useState<File[]>([]);
  const [googleAccountId, setGoogleAccountId] = useState(
    googleAccounts.find((a) => a.status === "CONNECTED")?.id || googleAccounts[0]?.id || ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; aspectRatio: "9:16" | "16:9" | "1:1"; model: string; clipSeconds: number; continuity: "FLOW_AGENT" | "INDEPENDENT" | "LAST_FRAME"; transition: "CUT" | "CROSSFADE"; referenceImageKeys: string[] }>>([]);
  const [presetId, setPresetId] = useState("");

  useEffect(() => {
    fetch("/api/presets", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => Array.isArray(list) && setPresets(list))
      .catch(() => {});
  }, []);

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setAspectRatio(p.aspectRatio);
    setModel(p.model);
    setClipSeconds(p.clipSeconds);
    setContinuity(p.continuity);
    setTransition(p.transition);
  };

  const projectContents = useMemo(() => contents.filter((c) => c.projectId === projectId), [contents, projectId]);
  const sceneCount = Math.max(1, Math.ceil((totalDuration || 0) / Math.max(1, clipSeconds)));
  const needsBrief = !contentId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return error("Vui lòng chọn một dự án.");
    if (needsBrief && !brief.trim()) return error("Chọn kịch bản có sẵn hoặc nhập ý tưởng cho video.");

    setIsSubmitting(true);
    info("Đang chia kịch bản thành các cảnh...");
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          contentId: contentId || undefined,
          brief: brief.trim() || undefined,
          title: title.trim() || undefined,
          totalDuration,
          clipSeconds,
          aspectRatio,
          model,
          transition,
          continuity,
          googleAccountId: googleAccountId || undefined,
          presetId: presetId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không thể tạo video nhiều cảnh.");
      if (refFiles.length > 0) {
        const fd = new FormData();
        refFiles.forEach((f) => fd.append("files", f));
        const up = await fetch(`/api/sequences/${data.sequence.id}/references`, { method: "POST", body: fd });
        if (!up.ok) {
          const e = await up.json().catch(() => ({}));
          error(e.error || "Không tải được ảnh tham chiếu, bạn có thể thêm lại ở trang chi tiết.");
        }
      }
      if (data.warning) info(data.warning);
      success(`Đã chia thành ${data.sceneCount} cảnh. Hãy xem lại prompt rồi bấm Bắt đầu render.`);
      router.push(`/sequences/${data.sequence.id}`);
    } catch (err: any) {
      error(err?.message || "Đã xảy ra lỗi.");
      setIsSubmitting(false);
    }
  };

  if (projects.length === 0) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 text-center space-y-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-800">Chưa có dự án nào</h3>
        <Link href="/projects/new" className="inline-flex text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 rounded-xl">
          Tạo dự án mới
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-3.5 pb-6 border-b border-slate-100">
        <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Tạo Video Nhiều Cảnh</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            AI chia kịch bản thành nhiều cảnh, mỗi cảnh là 1 clip Flow; hệ thống tự ghép thành video hoàn chỉnh.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Thuộc Dự Án *</label>
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setContentId(""); }} className={inputCls}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Tiêu đề (không bắt buộc)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AI sẽ tự đặt nếu để trống" className={inputCls} />
          </div>
        </div>

        {presets.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Preset kênh (phong cách + ảnh tham chiếu cố định)</label>
            <select value={presetId} onChange={(e) => applyPreset(e.target.value)} className={inputCls}>
              <option value="">-- Không dùng preset --</option>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.aspectRatio}, {p.clipSeconds}s/clip, {p.referenceImageKeys.length} ảnh)</option>)}
            </select>
            <p className="text-[11px] text-slate-400">Quản lý preset tại <Link href="/presets" className="text-emerald-700 hover:underline">trang Preset kênh</Link>.</p>
          </div>
        )}

        <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            <span>Dựa trên Kịch bản có sẵn</span>
          </label>
          <select value={contentId} onChange={(e) => setContentId(e.target.value)} className={inputCls}>
            <option value="">-- Không chọn, tôi sẽ nhập ý tưởng bên dưới --</option>
            {projectContents.map((c) => <option key={c.id} value={c.id}>{c.title} ({c.aspectRatio})</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Ý tưởng / Kịch bản {needsBrief ? <span className="text-rose-500">*</span> : <span className="text-slate-400 font-normal">(bổ sung, không bắt buộc)</span>}
          </label>
          <textarea
            rows={5}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Mô tả câu chuyện từ đầu đến cuối. Có thể viết theo từng dòng: Cảnh 1..., Cảnh 2..."
            className={inputCls + " leading-relaxed"}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <label className="text-xs font-semibold text-slate-700">Tổng thời lượng (giây)</label>
            <input type="number" min={8} max={300} value={totalDuration} onChange={(e) => setTotalDuration(parseInt(e.target.value, 10) || 0)} className={inputCls} />
            <div className="flex gap-1.5 flex-wrap pt-1">
              {[30, 60, 90].map((v) => (
                <button key={v} type="button" onClick={() => setTotalDuration(v)}
                  className={`text-[11px] px-2 py-0.5 rounded-lg border ${totalDuration === v ? "bg-emerald-50 border-emerald-400 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {v}s
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Độ dài mỗi clip Flow</label>
            <select value={clipSeconds} onChange={(e) => setClipSeconds(parseInt(e.target.value, 10))} className={inputCls}>
              {[4, 6, 8, 10, 12, 15].map((v) => <option key={v} value={v}>{v} giây</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Tỉ lệ khung hình</label>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as any)} className={inputCls}>
              <option value="9:16">9:16 (Shorts/Reels)</option>
              <option value="16:9">16:9 (YouTube)</option>
              <option value="1:1">1:1 (Vuông)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Chuyển cảnh</label>
            <select value={transition} onChange={(e) => setTransition(e.target.value as any)} className={inputCls}>
              <option value="CUT">Cắt thẳng (Cut)</option>
              <option value="CROSSFADE">Mờ chồng 0.5s (Crossfade)</option>
            </select>
          </div>
        </div>

        <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Độ liền mạch giữa các cảnh</label>
            <select value={continuity} onChange={(e) => setContinuity(e.target.value as any)} className={inputCls}>
              <option value="FLOW_AGENT">Flow tự chia cảnh trong 1 project (khuyên dùng, không cần API ngoài)</option>
              <option value="INDEPENDENT">Cảnh độc lập (ổn định, chỉ giống nhau theo mô tả)</option>
              <option value="LAST_FRAME">Nối bằng frame cuối (liền mạch hơn, cần thử trên Flow thật)</option>
            </select>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {continuity === "FLOW_AGENT"
                ? "Gửi MỘT brief cho Flow Agent: Agent tự chia cảnh, tạo ảnh tham chiếu nhân vật/sản phẩm một lần rồi dùng lại cho mọi clip, toàn bộ nằm trong cùng một project Flow. Tool duyệt kế hoạch (đúng số clip, trong ngân sách), tải từng clip rồi ghép."
                : continuity === "LAST_FRAME"
                ? "Cảnh 2 trở đi bắt đầu từ frame cuối của cảnh trước (Frames to Video của Flow). Nếu không đính kèm được ảnh, cảnh sẽ dừng TRƯỚC khi gửi nên không mất credit."
                : "Mỗi cảnh chạy riêng, nhân vật/sản phẩm chỉ nhất quán nhờ mô tả và ảnh tham chiếu."}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Ảnh sản phẩm / nhân vật tham chiếu (tối đa 3, không bắt buộc)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => setRefFiles(Array.from(e.target.files || []).slice(0, 3))}
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
            />
            <p className="text-[11px] text-slate-500">Đính kèm vào cảnh 1 (và mọi cảnh nếu chọn "Cảnh độc lập") dưới dạng Ingredients to Video để giữ đúng sản phẩm.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Mô hình Flow/Veo</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
              <option value="Veo 3.1 Fast">Veo 3.1 Fast</option>
              <option value="Veo 3.1 Quality">Veo 3.1 Quality</option>
              <option value="Veo 3.1 Lite">Veo 3.1 Lite</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Tài khoản Google Pro</label>
            <select value={googleAccountId} onChange={(e) => setGoogleAccountId(e.target.value)} className={inputCls}>
              {googleAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} [{a.status}] {a.lastKnownFlowCredits ? `(${a.lastKnownFlowCredits} credits)` : ""}</option>
              ))}
              {googleAccounts.length === 0 && <option value="">(Chưa có tài khoản)</option>}
            </select>
          </div>
        </div>

        <div className="rounded-2xl bg-emerald-50/60 border border-emerald-200 px-4 py-3 text-xs text-emerald-900">
          Sẽ tạo <b>{sceneCount} cảnh</b> × {clipSeconds}s ≈ <b>{sceneCount * clipSeconds}s</b>. {continuity === "FLOW_AGENT"
            ? <>Ước tính khoảng {sceneCount * 15} tín dụng Flow (≈12–15/clip). Prompt từng cảnh do Flow viết và hiện sau khi chạy.</>
            : <>Mỗi cảnh tốn credits Flow riêng, nhưng bạn được xem và sửa prompt từng cảnh trước khi bắt đầu render.</>}
        </div>

        <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
          <Link href={initialProjectId ? `/projects/${initialProjectId}` : "/sequences"} className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100">Hủy</Link>
          <button type="submit" disabled={isSubmitting}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-sm disabled:opacity-50">
            {isSubmitting ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Đang chia cảnh...</span></>) : (<><Wand2 className="w-3.5 h-3.5" /><span>Chia cảnh bằng AI</span></>)}
          </button>
        </div>
      </form>
    </div>
  );
}
