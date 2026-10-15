"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  ExternalLink,
  Film,
  CheckCircle2,
  Play,
  UserCheck,
  Loader2,
  Bot,
  Hand,
  AlertCircle,
  Coins,
  History,
  Check,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { CopyPromptButton } from "@/components/generations/CopyPromptButton";
import { VideoImporter } from "@/components/generations/VideoImporter";
import { VideoPlayerModal } from "@/components/videos/VideoPlayerModal";
import { DeleteVideoModal } from "@/components/videos/DeleteVideoModal";
import { VideoItem } from "@/components/videos/VideoCard";
import { useToast } from "@/components/ui/ToastContext";

interface GenerationEventItem {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

interface GenerationDetailClientProps {
  generation: {
    id: string;
    projectId: string;
    contentId?: string | null;
    googleAccountId?: string | null;
    prompt: string;
    model: string;
    aspectRatio: string;
    duration: string;
    status: string;
    generationMethod?: string;
    errorMessage?: string | null;
    provider: string;
    createdAt: Date | string;
    project: {
      id: string;
      name: string;
      topic: string;
    };
    content?: {
      id: string;
      title: string;
      concept: string;
    } | null;
    googleAccount?: {
      id: string;
      name: string;
      label: string;
      status: string;
      lastKnownFlowCredits?: number | null;
    } | null;
    videoAsset?: VideoItem | null;
    events?: GenerationEventItem[];
  };
}

const STEP_ORDER = [
  { key: "STARTING_BROWSER", label: "Khởi động Browser" },
  { key: "CHECKING_ACCOUNT", label: "Kiểm tra Google Session" },
  { key: "OPENING_FLOW", label: "Mở Google Flow" },
  { key: "SUBMITTING", label: "Gửi Prompt" },
  { key: "GENERATING", label: "Veo đang Render" },
  { key: "DOWNLOADING", label: "Tải MP4" },
  { key: "PROCESSING", label: "Xử lý Video" },
  { key: "COMPLETED", label: "Hoàn tất" },
];

export default function GenerationDetailClient({ generation: initialGen }: GenerationDetailClientProps) {
  const [generation, setGeneration] = useState(initialGen);
  const [events, setEvents] = useState<GenerationEventItem[]>(initialGen.events || []);
  const [isStartingAuto, setIsStartingAuto] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  const { success, error, info } = useToast();
  const googleFlowUrl = process.env.NEXT_PUBLIC_FLOW_URL || "https://labs.google/fx/tools/flow";

  const isProcessing = [
    "QUEUED",
    "STARTING_BROWSER",
    "CHECKING_ACCOUNT",
    "OPENING_FLOW",
    "SUBMITTING",
    "GENERATING",
    "DOWNLOADING",
    "PROCESSING",
  ].includes(generation.status);

  // Poll generation status and events when active
  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generations/${generation.id}/events`);
        if (res.ok) {
          const data = await res.json();
          if (data.generation) {
            setGeneration((prev) => ({
              ...prev,
              status: data.generation.status,
              errorMessage: data.generation.errorMessage,
              videoAsset: data.generation.videoAsset ? (data.generation.videoAsset as any) : prev.videoAsset,
            }));
          }
          if (data.events) {
            setEvents(data.events);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [generation.id, isProcessing]);

  const handleStartAuto = async () => {
    setIsStartingAuto(true);
    info("Đang khởi động tiến trình Flow Automation...");
    try {
      const res = await fetch(`/api/generations/${generation.id}/start-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleAccountId: generation.googleAccountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Không thể khởi động automation.");
      }
      setGeneration((prev) => ({ ...prev, status: "QUEUED" }));
      success(data.message || "Tác vụ đã được đưa vào hàng đợi!");
    } catch (err: any) {
      error(err?.message || "Lỗi khởi động.");
    } finally {
      setIsStartingAuto(false);
    }
  };

  // Helper to determine step status
  const currentStepIndex = STEP_ORDER.findIndex((s) => s.key === generation.status);

  return (
    <div className="space-y-6">
      {/* 1. Header & Status Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <StatusBadge status={generation.status} />
              {generation.googleAccount && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200 px-3 py-1 rounded-full">
                  <UserCheck className="w-3.5 h-3.5 text-sky-600" />
                  <span>{generation.googleAccount.name}</span>
                  {generation.googleAccount.lastKnownFlowCredits && (
                    <span className="text-sky-600 font-mono">({generation.googleAccount.lastKnownFlowCredits} credits*)</span>
                  )}
                </span>
              )}
              <span className="text-xs text-slate-400">
                Tạo lúc {new Date(generation.createdAt).toLocaleDateString("vi-VN")}
              </span>
            </div>

            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Chi Tiết Lệnh Tạo Video (Generation Job)
            </h1>

            <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <span>
                Dự án:{" "}
                <Link
                  href={`/projects/${generation.projectId}`}
                  className="text-emerald-700 font-medium hover:underline"
                >
                  {generation.project.name}
                </Link>
              </span>

              {generation.content && (
                <>
                  <span>•</span>
                  <span>
                    Kịch bản liên kết:{" "}
                    <Link
                      href={`/contents/${generation.content.id}`}
                      className="text-indigo-700 font-medium hover:underline"
                    >
                      {generation.content.title}
                    </Link>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {generation.videoAsset && (
              <button
                type="button"
                onClick={() =>
                  setSelectedVideo({
                    ...generation.videoAsset!,
                    project: generation.project,
                    generation,
                  })
                }
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Xem Video Trong Thư Viện</span>
              </button>
            )}

            {!isProcessing && generation.status !== "COMPLETED" && (
              <button
                type="button"
                disabled={isStartingAuto}
                onClick={handleStartAuto}
                className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {isStartingAuto ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Bot className="w-3.5 h-3.5" />
                )}
                <span>Chạy Tự Động Flow Worker</span>
              </button>
            )}
          </div>
        </div>

        {/* Video Prompt Viewer */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Nội dung Video Prompt
            </h3>
            <CopyPromptButton prompt={generation.prompt} size="sm" />
          </div>

          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-mono text-slate-800 leading-relaxed break-words shadow-inner">
            {generation.prompt}
          </div>
        </div>

        {/* Generation Metadata Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
            <p className="text-[10px] uppercase font-semibold text-slate-400">Mô hình</p>
            <p className="text-xs font-semibold text-slate-800 mt-0.5">{generation.model}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
            <p className="text-[10px] uppercase font-semibold text-slate-400">Tỉ lệ</p>
            <p className="text-xs font-semibold text-slate-800 mt-0.5">{generation.aspectRatio}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
            <p className="text-[10px] uppercase font-semibold text-slate-400">Thời lượng</p>
            <p className="text-xs font-semibold text-slate-800 mt-0.5">{generation.duration}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
            <p className="text-[10px] uppercase font-semibold text-slate-400">Google Account</p>
            <p className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
              {generation.googleAccount ? generation.googleAccount.name : "Tự chọn"}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Automation Progress Stepper & Event Log */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Tiến Trình Flow Automation (Playwright Worker)
              </h3>
              <p className="text-xs text-slate-400">
                Theo dõi từng bước thực thi trên session Google Flow thật.
              </p>
            </div>
          </div>

          <div>
            {isProcessing ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xử lý tự động...</span>
              </span>
            ) : generation.status === "COMPLETED" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Hoàn tất thành công</span>
              </span>
            ) : generation.status === "FAILED" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Thất bại (Cần kiểm tra)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                <span>Chưa kích hoạt</span>
              </span>
            )}
          </div>
        </div>

        {/* Stepper Timeline */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {STEP_ORDER.map((step, idx) => {
            const isDone =
              generation.status === "COMPLETED" ||
              (currentStepIndex >= 0 && idx < currentStepIndex);
            const isCurrent = currentStepIndex === idx;

            return (
              <div
                key={step.key}
                className={`p-3 rounded-2xl border text-center space-y-1 transition-all ${
                  isCurrent
                    ? "bg-sky-50 border-sky-500 ring-2 ring-sky-500/20"
                    : isDone
                    ? "bg-emerald-50/60 border-emerald-200 text-emerald-800"
                    : "bg-slate-50/50 border-slate-200/60 text-slate-400"
                }`}
              >
                <div className="flex items-center justify-center">
                  {isDone ? (
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  ) : isCurrent ? (
                    <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] animate-spin">
                      <Loader2 className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-semibold leading-tight">{step.label}</p>
              </div>
            );
          })}
        </div>

        {/* Error Message Alert */}
        {generation.errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Lỗi từ Google Flow hoặc Worker:</p>
              <p className="mt-0.5 leading-relaxed">{generation.errorMessage}</p>
              <p className="mt-2 text-rose-600 font-medium">
                Gợi ý: Bạn luôn có thể sử dụng giải pháp Thủ Công (Manual Fallback) bên dưới để tiếp tục.
              </p>
            </div>
          </div>
        )}

        {/* Real-time Event Log */}
        {events.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Nhật ký sự kiện (Generation Events):</span>
            </div>
            <div className="bg-slate-900 rounded-2xl p-4 font-mono text-[11px] text-slate-300 space-y-1.5 max-h-48 overflow-y-auto">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3">
                  <span className="text-slate-500 shrink-0">
                    {new Date(ev.createdAt).toLocaleTimeString("vi-VN")}
                  </span>
                  <span className="text-emerald-400 font-bold shrink-0">[{ev.type}]</span>
                  <span className="text-slate-200">{ev.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Manual Fallback Workflow Card */}
      <div className="bg-gradient-to-br from-emerald-50/60 to-slate-50 border border-emerald-200/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Hand className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Giải Pháp Thủ Công (Manual Fallback - Không Bao Giờ Gián Đoạn)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Nếu Google Flow thay đổi giao diện hoặc có captcha phức tạp, bạn có thể tự mở Flow để sinh và kéo file MP4 về.
            </p>
          </div>
        </div>

        {/* Step-by-step checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
          <div className="bg-white border border-emerald-100 rounded-2xl p-3 space-y-1 shadow-sm">
            <span className="font-bold text-emerald-800 text-[11px]">BƯỚC 1</span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Bấm <strong>Copy Prompt</strong>.
            </p>
          </div>
          <div className="bg-white border border-emerald-100 rounded-2xl p-3 space-y-1 shadow-sm">
            <span className="font-bold text-emerald-800 text-[11px]">BƯỚC 2</span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Bấm <strong>Mở Google Flow</strong> trên tab mới.
            </p>
          </div>
          <div className="bg-white border border-emerald-100 rounded-2xl p-3 space-y-1 shadow-sm">
            <span className="font-bold text-emerald-800 text-[11px]">BƯỚC 3</span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Dán prompt &amp; bấm <strong>Generate</strong>.
            </p>
          </div>
          <div className="bg-white border border-emerald-100 rounded-2xl p-3 space-y-1 shadow-sm">
            <span className="font-bold text-emerald-800 text-[11px]">BƯỚC 4</span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Tải file <strong>.mp4</strong> sau khi render.
            </p>
          </div>
          <div className="bg-white border border-emerald-100 rounded-2xl p-3 space-y-1 shadow-sm">
            <span className="font-bold text-emerald-800 text-[11px]">BƯỚC 5</span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Kéo thả vào khung <strong>Import Video</strong> bên dưới.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <CopyPromptButton prompt={generation.prompt} size="md" />

          <a
            href={googleFlowUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <span>Mở Google Flow</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </div>

      {/* 4. Video Import Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Nhập File Video MP4 (Import Video)
            </h3>
            <p className="text-xs text-slate-500">
              Lưu trữ video đã xuất từ Google Flow vào dự án và Thư viện Video.
            </p>
          </div>
        </div>

        <VideoImporter
          generationId={generation.id}
          projectId={generation.projectId}
          currentVideo={generation.videoAsset}
        />
      </div>

      {/* Video Player Modal */}
      <VideoPlayerModal
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onDelete={(id) => {
          setSelectedVideo(null);
          setDeletingVideoId(id);
        }}
      />

      {/* Delete Video Modal */}
      <DeleteVideoModal
        videoId={deletingVideoId}
        onClose={() => setDeletingVideoId(null)}
      />
    </div>
  );
}
