"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileVideo, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";
import { useRouter } from "next/navigation";

interface VideoImporterProps {
  generationId: string;
  projectId: string;
  currentVideo?: {
    id: string;
    filename: string;
    duration?: number | null;
    width?: number | null;
    height?: number | null;
    fileSize: number;
    createdAt: Date | string;
  } | null;
}

export function VideoImporter({ generationId, projectId, currentVideo }: VideoImporterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [probedMeta, setProbedMeta] = useState<{ duration?: number; width?: number; height?: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success, error } = useToast();
  const router = useRouter();

  const handleFileSelection = (selectedFile: File) => {
    setErrorMsg(null);

    // Validate type
    if (!selectedFile.type.startsWith("video/") && !selectedFile.name.match(/\.(mp4|mov|webm|mkv)$/i)) {
      setErrorMsg("Vui lòng chọn file video hợp lệ (.mp4, .mov, .webm).");
      return;
    }

    // Validate size (limit 500MB for MVP)
    const maxBytes = 500 * 1024 * 1024;
    if (selectedFile.size > maxBytes) {
      setErrorMsg("Dung lượng file vượt quá giới hạn 500MB.");
      return;
    }

    setFile(selectedFile);

    // Probe video duration/resolution via Object URL
    const objectUrl = URL.createObjectURL(selectedFile);
    setVideoPreview(objectUrl);

    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = objectUrl;
    tempVideo.onloadedmetadata = () => {
      setProbedMeta({
        duration: Math.round(tempVideo.duration * 10) / 10,
        width: tempVideo.videoWidth,
        height: tempVideo.videoHeight,
      });
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      formData.append("generationId", generationId);
      if (probedMeta?.duration) formData.append("duration", probedMeta.duration.toString());
      if (probedMeta?.width) formData.append("width", probedMeta.width.toString());
      if (probedMeta?.height) formData.append("height", probedMeta.height.toString());

      const res = await fetch(`/api/generations/${generationId}/import`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Không thể tải video lên máy chủ.");
      }

      success("Đã import video thành công vào Thư viện!");
      setFile(null);
      setVideoPreview(null);
      router.refresh();
    } catch (err: any) {
      const msg = err?.message || "Đã xảy ra lỗi khi import video.";
      setErrorMsg(msg);
      error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Current imported video alert if exists */}
      {currentVideo && !file && (
        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-emerald-950">Video đã được Import</h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                {currentVideo.filename} • {formatFileSize(currentVideo.fileSize)}
                {currentVideo.duration ? ` • ${currentVideo.duration}s` : ""}
                {currentVideo.width ? ` • ${currentVideo.width}x${currentVideo.height}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium text-emerald-800 bg-white border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
          >
            Thay thế file khác
          </button>
        </div>
      )}

      {/* Upload Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
          isDragging
            ? "border-emerald-500 bg-emerald-50/50"
            : file
            ? "border-slate-300 bg-slate-50/70 cursor-default"
            : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileSelection(e.target.files[0]);
            }
          }}
        />

        {!file ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-700">
              Kéo thả file MP4 từ Google Flow vào đây
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              hoặc <span className="text-emerald-600 font-medium underline">bấm vào đây để chọn file</span> từ máy tính (tối đa 500MB)
            </p>
          </>
        ) : (
          <div className="w-full max-w-md space-y-4 text-left">
            <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                <FileVideo className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatFileSize(file.size)}
                  {probedMeta?.duration ? ` • ${probedMeta.duration}s` : ""}
                  {probedMeta?.width ? ` • ${probedMeta.width}x${probedMeta.height}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setVideoPreview(null);
                }}
                disabled={isUploading}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
              >
                Hủy
              </button>
            </div>

            {videoPreview && (
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-black max-h-48 flex items-center justify-center">
                <video src={videoPreview} controls className="max-h-48 w-auto mx-auto" />
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleUpload();
              }}
              disabled={isUploading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-xl text-sm font-medium shadow-sm transition-all disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang tải lên & xử lý metadata...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác nhận Import Video này</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
