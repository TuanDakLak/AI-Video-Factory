"use client";

import React from "react";
import {
  X,
  Download,
  Trash2,
  Calendar,
  HardDrive,
  Maximize2,
  Film,
  UserCheck,
  FileText,
  Copy,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { CopyPromptButton } from "@/components/generations/CopyPromptButton";

interface VideoPlayerModalProps {
  video: {
    id: string;
    filename: string;
    storageKey: string;
    fileSize: number;
    duration?: number | null;
    width?: number | null;
    height?: number | null;
    createdAt: Date | string;
    project?: { id: string; name: string; topic: string } | null;
    generation?: {
      id: string;
      prompt: string;
      model: string;
      aspectRatio: string;
      googleAccount?: { id: string; name: string; label: string } | null;
    } | null;
  } | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export function VideoPlayerModal({ video, onClose, onDelete }: VideoPlayerModalProps) {
  if (!video) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Film className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 truncate">{video.filename}</h3>
              <p className="text-xs text-slate-400 truncate">
                📁 {video.project?.name || "Chưa phân loại"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Video Player */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center bg-black/95 rounded-2xl overflow-hidden min-h-[340px] shadow-inner">
            <video
              src={`/api/videos/${video.id}/file`}
              controls
              autoPlay
              playsInline
              className="max-h-[460px] w-auto max-w-full rounded-lg"
            />
          </div>

          {/* Metadata & Actions */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Thông Số Video
                </h4>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Film className="w-3.5 h-3.5" /> Thời lượng:
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
                      <Calendar className="w-3.5 h-3.5" /> Ngày lưu:
                    </span>
                    <span className="font-medium text-slate-700">{formatDate(video.createdAt)}</span>
                  </div>
                </div>
              </div>

              {/* Prompt Card if generation exists */}
              {video.generation?.prompt && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Video Prompt Đã Dùng
                    </h4>
                    <CopyPromptButton prompt={video.generation.prompt} size="sm" />
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 text-xs font-mono text-slate-700 leading-relaxed max-h-32 overflow-y-auto">
                    {video.generation.prompt}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
              <a
                href={`/api/videos/${video.id}/file?download=true`}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-sm transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải về MP4</span>
              </a>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(video.id)}
                  className="inline-flex items-center justify-center gap-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 text-xs font-medium py-2.5 px-3.5 rounded-xl transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
