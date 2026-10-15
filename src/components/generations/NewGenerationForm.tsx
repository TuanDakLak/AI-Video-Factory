"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Loader2, UserCheck, FileText, Bot, Hand, Info } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

interface ProjectOption {
  id: string;
  name: string;
}

interface ContentOption {
  id: string;
  projectId: string;
  title: string;
  videoPrompt: string;
  aspectRatio: string;
  duration: string;
}

interface GoogleAccountOption {
  id: string;
  name: string;
  label: string;
  status: string;
  lockStatus?: string;
  lastKnownFlowCredits?: number | null;
}

interface NewGenerationFormProps {
  projects: ProjectOption[];
  contents?: ContentOption[];
  googleAccounts?: GoogleAccountOption[];
  initialProjectId?: string;
  initialContentId?: string;
  initialAspectRatio?: string;
  initialDuration?: string;
}

export default function NewGenerationForm({
  projects,
  contents = [],
  googleAccounts = [],
  initialProjectId,
  initialContentId,
  initialAspectRatio,
  initialDuration,
}: NewGenerationFormProps) {
  const router = useRouter();
  const { success, error } = useToast();

  const [projectId, setProjectId] = useState(initialProjectId || (projects[0]?.id ?? ""));
  const [contentId, setContentId] = useState(initialContentId || "");
  const [googleAccountId, setGoogleAccountId] = useState(
    googleAccounts.find((a) => a.status === "CONNECTED")?.id || (googleAccounts[0]?.id ?? "")
  );

  const [generationMethod, setGenerationMethod] = useState<"AUTO" | "MANUAL">(
    googleAccounts.some((a) => a.status === "CONNECTED") ? "AUTO" : "MANUAL"
  );

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("Veo 3.1 Fast");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(
    (initialAspectRatio as any) || "9:16"
  );
  const [duration, setDuration] = useState<"8s" | "15s" | "30s" | "60s">(
    (initialDuration as any) || "8s"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-fill prompt if initialContentId supplied
  useEffect(() => {
    if (initialContentId && contents.length > 0) {
      const match = contents.find((c) => c.id === initialContentId);
      if (match) {
        setPrompt(match.videoPrompt);
        if (match.aspectRatio) setAspectRatio(match.aspectRatio as any);
        if (match.duration) setDuration(match.duration as any);
      }
    }
  }, [initialContentId, contents]);

  const handleSelectContent = (selectedContentId: string) => {
    setContentId(selectedContentId);
    if (!selectedContentId) return;

    const match = contents.find((c) => c.id === selectedContentId);
    if (match) {
      setPrompt(match.videoPrompt);
      if (match.aspectRatio) setAspectRatio(match.aspectRatio as any);
      if (match.duration) setDuration(match.duration as any);
    }
  };

  const projectContents = contents.filter((c) => c.projectId === projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) {
      error("Vui lòng chọn một dự án.");
      return;
    }
    if (!prompt.trim()) {
      error("Vui lòng nhập Video Prompt.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          contentId: contentId || undefined,
          googleAccountId: googleAccountId || undefined,
          prompt: prompt.trim(),
          model,
          aspectRatio,
          duration,
          generationMethod,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Không thể tạo generation.");
      }

      const generation = await res.json();

      // If AUTO mode chosen and account is connected, also trigger start-auto
      if (generationMethod === "AUTO" && googleAccountId) {
        try {
          await fetch(`/api/generations/${generation.id}/start-auto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ googleAccountId }),
          });
          success("Đã gửi tác vụ vào hàng đợi Google Flow tự động!");
        } catch {}
      } else {
        success("Đã tạo lệnh Prompt thành công!");
      }

      router.push(`/generations/${generation.id}`);
    } catch (err: any) {
      error(err?.message || "Đã xảy ra lỗi khi tạo prompt.");
      setIsSubmitting(false);
    }
  };

  if (projects.length === 0) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 text-center space-y-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-800">Chưa có dự án nào</h3>
        <p className="text-xs text-slate-500">
          Bạn cần tạo một Dự án trước khi tạo các Video Prompt.
        </p>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 rounded-xl transition-all shadow-sm"
        >
          <span>Tạo dự án mới</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-3.5 pb-6 border-b border-slate-100">
        <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Tạo Lệnh Render Video (Generation Job)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Chọn tài khoản Google AI Pro, cấu hình phương thức tự động hoặc thủ công trên Google Flow.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Method Toggle: AUTO vs MANUAL */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700">Phương Thức Thực Hiện</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setGenerationMethod("AUTO")}
              className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                generationMethod === "AUTO"
                  ? "bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:border-slate-300"
              }`}
            >
              <Bot className={`w-5 h-5 shrink-0 mt-0.5 ${generationMethod === "AUTO" ? "text-emerald-600" : "text-slate-400"}`} />
              <div>
                <span className="font-bold text-xs text-slate-900 block">Tự Động (Flow Automation)</span>
                <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                  Playwright worker tự mở session tài khoản, submit prompt, tải video và nhập vào thư viện.
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setGenerationMethod("MANUAL")}
              className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                generationMethod === "MANUAL"
                  ? "bg-amber-50/70 border-amber-500 ring-2 ring-amber-500/20"
                  : "bg-slate-50/50 border-slate-200 hover:border-slate-300"
              }`}
            >
              <Hand className={`w-5 h-5 shrink-0 mt-0.5 ${generationMethod === "MANUAL" ? "text-amber-600" : "text-slate-400"}`} />
              <div>
                <span className="font-bold text-xs text-slate-900 block">Thủ Công (Manual Fallback)</span>
                <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                  Sao chép prompt sang Google Flow trên trình duyệt của bạn, sau đó import file MP4 về.
                </span>
              </div>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Project Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Thuộc Dự Án <span className="text-rose-500">*</span>
            </label>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setContentId("");
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Google Account Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-slate-400" />
              <span>Tài khoản Google Pro chỉ định</span>
            </label>
            <select
              value={googleAccountId}
              onChange={(e) => setGoogleAccountId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40"
            >
              {googleAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} [{a.status}] {a.lastKnownFlowCredits ? `(${a.lastKnownFlowCredits} credits)` : ""}
                </option>
              ))}
              {googleAccounts.length === 0 && (
                <option value="">(Chưa có tài khoản nào)</option>
              )}
            </select>
          </div>
        </div>

        {/* Content Link Selector (Optional) */}
        {projectContents.length > 0 && (
          <div className="space-y-1.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chọn Kịch Bản đã soạn sẵn (Tự động nạp Video Prompt)</span>
              </label>
              <Link
                href={`/contents/new?projectId=${projectId}`}
                className="text-[11px] text-emerald-700 hover:underline font-medium"
              >
                + Soạn Kịch bản mới với AI
              </Link>
            </div>
            <select
              value={contentId}
              onChange={(e) => handleSelectContent(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
            >
              <option value="">-- Tự gõ Video Prompt thủ công --</option>
              {projectContents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.aspectRatio})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Video Prompt Textarea */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Video Prompt (Mô tả cảnh quay chi tiết) <span className="text-rose-500">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="VD: A cinematic close-up of a red fox walking through a snowy forest at sunrise, realistic natural lighting, slow camera movement..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40 leading-relaxed"
          />
        </div>

        {/* Model, Aspect Ratio, Duration */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Mô hình Flow/Veo</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40"
            >
              <option value="Veo 3.1 Fast">Veo 3.1 Fast</option>
              <option value="Veo 3.1 Quality">Veo 3.1 Quality</option>
              <option value="Veo 3.1 Lite">Veo 3.1 Lite</option>
              <option value="Other">Khác (Custom)</option>
            </select>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Tỉ lệ khung hình</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40"
            >
              <option value="9:16">9:16 (Shorts / TikTok / Reels)</option>
              <option value="16:9">16:9 (Ngang / YouTube standard)</option>
              <option value="1:1">1:1 (Vuông)</option>
            </select>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Thời lượng ước tính</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40"
            >
              <option value="8s">8 giây (Tiêu chuẩn Veo)</option>
              <option value="15s">15 giây</option>
              <option value="30s">30 giây</option>
              <option value="60s">60 giây</option>
            </select>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
          <Link
            href={initialProjectId ? `/projects/${initialProjectId}` : "/generations"}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            Hủy
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xử lý...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>{generationMethod === "AUTO" ? "Khởi Động Flow Automation" : "Tạo Prompt Thủ Công"}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
