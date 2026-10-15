"use client";

import React, { useState } from "react";
import { VideoCard, VideoItem } from "@/components/videos/VideoCard";
import { VideoPlayerModal } from "@/components/videos/VideoPlayerModal";
import { DeleteVideoModal } from "@/components/videos/DeleteVideoModal";

export default function DashboardVideoList({ initialVideos }: { initialVideos: VideoItem[] }) {
  const [videos, setVideos] = useState<VideoItem[]>(initialVideos);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleVideoDeleted = () => {
    if (deletingId) {
      setVideos((prev) => prev.filter((v) => v.id !== deletingId));
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {videos.map((video) => (
          <VideoCard
            key={video.id}
            video={video}
            onPreview={(v) => setSelectedVideo(v)}
            onDelete={(id) => setDeletingId(id)}
          />
        ))}
      </div>

      <VideoPlayerModal
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onDelete={(id) => {
          setSelectedVideo(null);
          setDeletingId(id);
        }}
      />

      <DeleteVideoModal
        videoId={deletingId}
        onClose={() => setDeletingId(null)}
        onSuccess={handleVideoDeleted}
      />
    </>
  );
}
