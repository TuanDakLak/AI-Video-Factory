"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Download,
  Trash2,
  HardDrive,
  Maximize2,
  Calendar,
  Film,
  Sparkles,
  Clock,
  UserCheck,
  FileText,
} from "lucide-react";
import { DeleteVideoModal } from "@/components/videos/DeleteVideoModal";
import { CopyPromptButton } from "@/components/generations/CopyPromptButton";
import { useRouter } from "next/navigation";

interface VideoDetailViewClientProps {
  video: {
    id: string;
    filename: string;
    fileSize: number;
    duration?: number | null;
    width?: number | null;
    height?: number | null;
    createdAt: Date | string;
    sequenceId?: string | null;
    project: { id: string; name: string; topic: string };
    generation?: {
      id: string;
      prompt: string;
      model: string;
      aspectRatio: string;
      duration: string;
      googleAccount?: { id: string; name: string; label: string } | null;
    } | null;
  };
}

export default function VideoDetailViewClient({ video }: VideoDetailViewClientProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const router = useRouter();

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">📁 {video.project.name}</span>
            {video.sequenceId && (
              <>
                <span className="text-xs text-slate-300">•</span>
                <Link href={`/sequences/${video.sequenceId}`} className="text-xs font-medium text-emerald-700 hover:underline">
                  Các clip &amp; nhật ký
                </Link>
              </>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{video.filename}</h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <a
            href={`/api/videos/${video.id}/file?download=true`}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải về file MP4</span>
          </a>

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
            title="Xóa video"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Video Player Box */}
        <div className="lg:col-span-7 bg-black rounded-2xl overflow-hidden flex items-center justify-center min-h-[360px] shadow-inner">
          <video
            src={`/api/videos/${video.id}/file`}
            controls
            autoPlay
            playsInline
            className="max-h-[480px] w-auto max-w-full rounded-lg"
          />
        </div>

        {/* Metadata Details */}
        <div className="lg:col-span-5 space-y-5">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Thông Số Kỹ Thuật
            </h3>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Clock className="w-3.5 h-3.5" /> Thời lượng:
                </span>
                <span className="font-semibold text-slate-800">
                  {video.duration ? `${video.duration} giây` : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Maximize2 className="w-3.5 h-3.5" /> Độ phân giải:
                </span>
                <span className="font-semibold text-slate-800">
                  {video.width && video.height ? `${video.width} x ${video.height}` : "N/A"}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <HardDrive className="w-3.5 h-3.5" /> Dung lượng:
                </span>
                <span className="font-semibold text-slate-800">
                  {formatFileSize(video.fileSize)}
                </span>
              </div>

              {video.generation?.googleAccount && (
                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <UserCheck className="w-3.5 h-3.5" /> Tài khoản Google:
                  </span>
                  <span className="font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded">
                    {video.generation.googleAccount.name}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-600">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Calendar className="w-3.5 h-3.5" /> Thời gian lưu:
                </span>
                <span className="font-medium text-slate-700">{formatDate(video.createdAt)}</span>
              </div>
            </div>
          </div>

          {video.generation?.prompt && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Video Prompt Đã Dùng
                </h3>
                <CopyPromptButton prompt={video.generation.prompt} size="sm" />
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-mono text-slate-700 leading-relaxed max-h-40 overflow-y-auto">
                {video.generation.prompt}
              </div>
            </div>
          )}
        </div>
      </div>

      <DeleteVideoModal
        videoId={showDeleteModal ? video.id : null}
        onClose={() => setShowDeleteModal(false)}
        onSuccess={() => router.push("/videos")}
      />
    </div>
  );
}
