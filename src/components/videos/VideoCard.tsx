"use client";

import React from "react";
import { Play, Download, Trash2, Clock, Maximize2, Film, UserCheck, FileText } from "lucide-react";
import Link from "next/link";

export interface VideoItem {
  id: string;
  filename: string;
  storageKey: string;
  thumbnailKey?: string | null;
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
    duration?: string;
    content?: { id: string; title: string } | null;
    googleAccount?: { id: string; name: string; label: string } | null;
  } | null;
}

interface VideoCardProps {
  video: VideoItem;
  onPreview: (video: VideoItem) => void;
  onDelete: (id: string) => void;
}

export function VideoCard({ video, onPreview, onDelete }: VideoCardProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("vi-VN", {
      month: "numeric",
      day: "numeric",
    });
  };

  return (
    <div className="group bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden">
      {/* Video Thumbnail / Preview Trigger */}
      <div
        onClick={() => onPreview(video)}
        className="relative aspect-video bg-slate-900 flex items-center justify-center cursor-pointer overflow-hidden group-hover:opacity-95 transition-opacity"
      >
        <video
          src={`/api/videos/${video.id}/file`}
          className="w-full h-full object-cover"
          muted
          preload="metadata"
        />

        {/* Overlay Play Icon */}
        <div className="absolute inset-0 bg-slate-900/30 group-hover:bg-slate-900/10 transition-colors flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/90 group-hover:bg-white text-slate-800 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
            <Play className="w-5 h-5 ml-0.5 fill-slate-800 text-slate-800" />
          </div>
        </div>

        {/* Duration badge */}
        {video.duration && (
          <div className="absolute bottom-2.5 right-2.5 bg-black/70 backdrop-blur-sm text-white text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{video.duration}s</span>
          </div>
        )}

        {/* Aspect Ratio Badge */}
        {video.width && video.height && (
          <div className="absolute top-2.5 left-2.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
            {video.width > video.height ? "16:9" : "9:16"}
          </div>
        )}
      </div>

      {/* Info Body */}
      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h4
            onClick={() => onPreview(video)}
            className="text-sm font-bold text-slate-800 truncate cursor-pointer hover:text-emerald-700 transition-colors"
            title={video.filename}
          >
            {video.filename}
          </h4>

          {video.project && (
            <Link
              href={`/projects/${video.project.id}`}
              className="inline-block text-xs text-slate-400 hover:text-slate-600 truncate mt-0.5 max-w-full"
            >
              📁 {video.project.name}
            </Link>
          )}

          {video.generation?.googleAccount && (
            <div className="mt-1 flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md w-fit">
              <UserCheck className="w-3 h-3" />
              <span>{video.generation.googleAccount.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
          <span>{formatFileSize(video.fileSize)}</span>
          <span>{formatDate(video.createdAt)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onPreview(video)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium py-2 px-3 rounded-xl border border-slate-200 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Xem</span>
          </button>

          <a
            href={`/api/videos/${video.id}/file?download=true`}
            title="Tải về file MP4"
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors flex items-center justify-center"
          >
            <Download className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={() => onDelete(video.id)}
            title="Xóa video"
            className="p-2 rounded-xl text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 transition-colors flex items-center justify-center"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
