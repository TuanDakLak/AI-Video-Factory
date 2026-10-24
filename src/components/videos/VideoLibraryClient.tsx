"use client";

import React, { useState } from "react";
import { VideoCard, VideoItem } from "@/components/videos/VideoCard";
import { VideoPlayerModal } from "@/components/videos/VideoPlayerModal";
import { DeleteVideoModal } from "@/components/videos/DeleteVideoModal";
import { Film, Search, Filter, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import Link from "next/link";

interface VideoLibraryClientProps {
  initialVideos: VideoItem[];
}

export default function VideoLibraryClient({ initialVideos }: VideoLibraryClientProps) {
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("ALL");
  const [selectedRatio, setSelectedRatio] = useState<string>("ALL");
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "OLDEST">("NEWEST");

  // Extract distinct projects
  const uniqueProjects = Array.from(
    new Set(videos.map((v) => v.project?.name).filter(Boolean))
  );

  const filteredVideos = videos
    .filter((v) => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const match =
          v.filename.toLowerCase().includes(query) ||
          v.project?.name.toLowerCase().includes(query) ||
          v.generation?.prompt.toLowerCase().includes(query);
        if (!match) return false;
      }

      // Project filter
      if (selectedProject !== "ALL" && v.project?.name !== selectedProject) {
        return false;
      }

      // Ratio filter
      if (selectedRatio !== "ALL") {
        if (!v.width || !v.height) return false;
        const isLandscape = v.width > v.height;
        if (selectedRatio === "16:9" && !isLandscape) return false;
        if (selectedRatio === "9:16" && isLandscape) return false;
      }

      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === "NEWEST" ? timeB - timeA : timeA - timeB;
    });

  const handleVideoDeleted = () => {
    if (deletingVideoId) {
      setVideos((prev) => prev.filter((v) => v.id !== deletingVideoId));
    }
  };

  if (videos.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
          <Film className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800">Thư viện trống</h3>
          <p className="text-xs text-slate-500 mt-1">
            Video dài sẽ xuất hiện ở đây sau khi Flow tạo xong các clip và hệ thống ghép lại.
          </p>
        </div>
        <Link
          href="/sequences/new"
          className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded-xl transition-all shadow-sm"
        >
          <span>Tạo video</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên file, kênh, prompt..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/40"
            />
          </div>

          {/* Sort order */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSortOrder(sortOrder === "NEWEST" ? "OLDEST" : "NEWEST")}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors bg-white"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span>{sortOrder === "NEWEST" ? "Mới nhất trước" : "Cũ nhất trước"}</span>
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <div className="flex items-center gap-1 text-slate-400 font-medium">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Lọc:</span>
          </div>

          {/* Project dropdown */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50"
          >
            <option value="ALL">Tất cả kênh</option>
            {uniqueProjects.map((pName) => (
              <option key={pName as string} value={pName as string}>
                {pName}
              </option>
            ))}
          </select>

          {/* Ratio dropdown */}
          <select
            value={selectedRatio}
            onChange={(e) => setSelectedRatio(e.target.value)}
            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 bg-slate-50"
          >
            <option value="ALL">Tất cả tỉ lệ</option>
            <option value="9:16">9:16 (Dọc - Shorts/TikTok)</option>
            <option value="16:9">16:9 (Ngang - Chuẩn)</option>
          </select>

          {(selectedProject !== "ALL" || selectedRatio !== "ALL" || searchQuery) && (
            <button
              onClick={() => {
                setSelectedProject("ALL");
                setSelectedRatio("ALL");
                setSearchQuery("");
              }}
              className="text-[11px] text-rose-600 hover:underline ml-auto"
            >
              Xóa bộ lọc
            </button>
          )}

          <span className="text-[11px] text-slate-400 ml-auto">
            {filteredVideos.length} / {videos.length} video
          </span>
        </div>
      </div>

      {/* Grid */}
      {filteredVideos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500">
          Không tìm thấy video nào phù hợp với bộ lọc hiện tại.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredVideos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onPreview={(v) => setSelectedVideo(v)}
              onDelete={(id) => setDeletingVideoId(id)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <VideoPlayerModal
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onDelete={(id) => {
          setSelectedVideo(null);
          setDeletingVideoId(id);
        }}
      />

      <DeleteVideoModal
        videoId={deletingVideoId}
        onClose={() => setDeletingVideoId(null)}
        onSuccess={handleVideoDeleted}
      />
    </div>
  );
}
