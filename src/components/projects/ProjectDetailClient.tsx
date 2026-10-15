"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Sparkles,
  Film,
  Trash2,
  Edit3,
  ExternalLink,
  ArrowRight,
  Play,
  Download,
  FileText,
  Layers,
  UserCheck,
} from "lucide-react";
import { ContentTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { DeleteProjectModal } from "@/components/projects/DeleteProjectModal";
import { VideoPlayerModal } from "@/components/videos/VideoPlayerModal";
import { DeleteVideoModal } from "@/components/videos/DeleteVideoModal";
import { CopyPromptButton } from "@/components/generations/CopyPromptButton";
import { VideoItem } from "@/components/videos/VideoCard";

interface ContentItem {
  id: string;
  projectId: string;
  title: string;
  concept: string;
  script: string;
  videoPrompt: string;
  style: string;
  aspectRatio: string;
  duration: string;
  createdAt: Date | string;
  generations?: any[];
}

interface ProjectDetailProps {
  project: {
    id: string;
    name: string;
    description?: string | null;
    contentType: string;
    topic: string;
    createdAt: Date | string;
    contents: ContentItem[];
    generations: Array<{
      id: string;
      prompt: string;
      model: string;
      aspectRatio: string;
      duration: string;
      status: string;
      createdAt: Date | string;
      googleAccount?: { id: string; name: string } | null;
      content?: { id: string; title: string } | null;
      videoAsset?: VideoItem | null;
    }>;
    videoAssets: VideoItem[];
  };
}

export default function ProjectDetailClient({ project }: ProjectDetailProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "contents" | "generations" | "videos">(
    "overview"
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Project Meta Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <ContentTypeBadge type={project.contentType} />
              <span className="text-xs text-slate-400">
                Tạo ngày {new Date(project.createdAt).toLocaleDateString("vi-VN")}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{project.name}</h1>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Link
              href={`/contents/new?projectId=${project.id}`}
              className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2.5 rounded-xl shadow-sm transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ Soạn Kịch Bản (Gemini / Tự viết)</span>
            </Link>

            <Link
              href={`/generations/new?projectId=${project.id}`}
              className="inline-flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium px-3.5 py-2.5 rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tạo Video Prompt</span>
            </Link>

            <Link
              href={`/sequences/new?projectId=${project.id}`}
              className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2.5 rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Video nhiều cảnh</span>
            </Link>

            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
              title="Xóa dự án"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Topic & Description */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Chủ đề &amp; Ý tưởng
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              {project.topic}
            </p>
          </div>

          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Mô tả dự án
            </h4>
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs text-slate-600 min-h-[58px]">
              {project.description || "Không có mô tả bổ sung."}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-4 overflow-x-auto">
          {[
            { id: "overview", label: "Tổng quan", count: null },
            { id: "contents", label: "Kịch bản (Contents)", count: project.contents.length },
            { id: "generations", label: "Lệnh tạo (Generations)", count: project.generations.length },
            { id: "videos", label: "Videos Đã Import", count: project.videoAssets.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white font-semibold"
                  : "bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label} {tab.count !== null ? `(${tab.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Hierarchy explanation banner */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>
                <strong>Cấu trúc dữ liệu:</strong> Dự án &rarr; {project.contents.length} Kịch bản &rarr; {project.generations.length} Lệnh tạo &rarr; {project.videoAssets.length} Video hoàn thành
              </span>
            </div>
            <Link href={`/contents/new?projectId=${project.id}`} className="text-emerald-700 font-semibold hover:underline">
              + Soạn thêm kịch bản
            </Link>
          </div>

          {/* Recent Contents snippet */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Kịch bản &amp; Ý tưởng ({project.contents.length})</span>
              </h3>
              <button
                onClick={() => setActiveTab("contents")}
                className="text-xs text-emerald-700 font-medium hover:underline"
              >
                Xem tất cả &rarr;
              </button>
            </div>

            {project.contents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-500">
                Chưa có kịch bản nào. Hãy bấm <strong>+ Soạn Kịch Bản</strong> để Gemini gợi ý prompt.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {project.contents.slice(0, 2).map((c) => (
                  <div key={c.id} className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 truncate">{c.title}</span>
                      <span className="text-[10px] text-slate-400">{c.aspectRatio}</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{c.concept}</p>
                    <div className="pt-2 flex justify-between items-center border-t border-slate-100">
                      <CopyPromptButton prompt={c.videoPrompt} size="sm" />
                      <Link
                        href={`/generations/new?projectId=${project.id}&contentId=${c.id}`}
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        Tạo Video Job &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Contents */}
      {activeTab === "contents" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">
              Danh sách Kịch bản &amp; Prompt ({project.contents.length})
            </h3>
            <Link
              href={`/contents/new?projectId=${project.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-xl shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ Soạn kịch bản mới</span>
            </Link>
          </div>

          {project.contents.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
              Chưa có kịch bản nào được tạo cho dự án này.
            </div>
          ) : (
            <div className="space-y-4">
              {project.contents.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        {item.style} • {item.aspectRatio} • {item.duration}
                      </span>
                      <h4 className="text-base font-bold text-slate-900 mt-1.5">{item.title}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">{item.concept}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/contents/${item.id}`}
                        className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center gap-1"
                        title="Chỉnh sửa kịch bản"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Sửa</span>
                      </Link>
                      <Link
                        href={`/generations/new?projectId=${project.id}&contentId=${item.id}&aspectRatio=${item.aspectRatio}&duration=${item.duration}`}
                        className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm"
                      >
                        <span>Tạo Video Job</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600">Video Prompt:</span>
                      <CopyPromptButton prompt={item.videoPrompt} size="sm" />
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-mono text-slate-800 leading-relaxed break-words">
                      {item.videoPrompt}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Generations */}
      {activeTab === "generations" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">
              Danh sách Lệnh Render Video ({project.generations.length})
            </h3>
            <Link
              href={`/generations/new?projectId=${project.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 px-3.5 py-2 rounded-xl shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tạo lệnh render mới</span>
            </Link>
          </div>

          {project.generations.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
              Chưa có lệnh render nào.
            </div>
          ) : (
            <div className="space-y-3">
              {project.generations.map((gen) => (
                <div
                  key={gen.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <StatusBadge status={gen.status} />
                      {gen.googleAccount && (
                        <span className="text-xs font-medium text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-sky-600" />
                          {gen.googleAccount.name}
                        </span>
                      )}
                      <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-100 rounded-md">
                        {gen.model}
                      </span>
                      <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-100 rounded-md">
                        {gen.aspectRatio}
                      </span>
                      <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-100 rounded-md">
                        {gen.duration}
                      </span>
                    </div>

                    <p className="text-xs text-slate-800 font-mono line-clamp-2 leading-relaxed">
                      {gen.prompt}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {gen.videoAsset && (
                      <button
                        type="button"
                        onClick={() => setSelectedVideo({ ...gen.videoAsset!, project })}
                        className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium px-3 py-2 rounded-xl border border-emerald-200 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Xem Video</span>
                      </button>
                    )}

                    <Link
                      href={`/generations/${gen.id}`}
                      className="inline-flex items-center gap-1.5 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm"
                    >
                      <span>Mở Workflow Flow</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Videos */}
      {activeTab === "videos" && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-800">
            Thư viện Videos Trong Dự Án ({project.videoAssets.length})
          </h3>

          {project.videoAssets.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
              Chưa có video MP4 nào được import vào dự án này.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {project.videoAssets.map((v) => (
                <div
                  key={v.id}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between"
                >
                  <div
                    onClick={() => setSelectedVideo({ ...v, project })}
                    className="aspect-video bg-black flex items-center justify-center cursor-pointer relative group"
                  >
                    <video src={`/api/videos/${v.id}/file`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 ml-0.5 fill-slate-900" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-bold text-slate-800 truncate">{v.filename}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{v.duration ? `${v.duration}s` : ""}</span>
                      <span>{v.width ? `${v.width}x${v.height}` : ""}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Project Modal */}
      <DeleteProjectModal
        projectId={showDeleteModal ? project.id : null}
        projectName={project.name}
        onClose={() => setShowDeleteModal(false)}
      />

      {/* Video Player Modal */}
      <VideoPlayerModal
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onDelete={(id) => {
          setSelectedVideo(null);
          setDeletingVideoId(id);
        }}
      />

      <DeleteVideoModal videoId={deletingVideoId} onClose={() => setDeletingVideoId(null)} />
    </div>
  );
}
