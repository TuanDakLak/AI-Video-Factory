"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles, FolderPlus } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

export default function NewProjectPage() {
  const router = useRouter();
  const { success, error } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState("SHORT_VIDEO");
  const [topic, setTopic] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !topic.trim()) {
      error("Vui lòng điền tên dự án và chủ đề.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          contentType,
          topic: topic.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Không thể tạo dự án.");
      }

      const project = await res.json();
      success(`Đã tạo dự án "${project.name}" thành công!`);
      router.push(`/projects/${project.id}`);
    } catch (err: any) {
      error(err?.message || "Đã xảy ra lỗi khi tạo dự án.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto w-full space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Quay lại danh sách dự án</span>
      </Link>

      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3.5 pb-6 border-b border-slate-100">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <FolderPlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Tạo Dự Án Mới</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khởi tạo không gian làm việc cho chuỗi video hoặc phim ngắn.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Project Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Tên dự án <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Bí Ẩn Rừng Amazon, Thám Hiểm Sao Hỏa..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40"
            />
          </div>

          {/* Content Type Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Loại nội dung</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { value: "SHORT_VIDEO", label: "Short Video (9:16)" },
                { value: "SHORT_FILM", label: "Phim Ngắn" },
                { value: "MOVIE", label: "Phim Dài" },
                { value: "DOCUMENTARY", label: "Tài Liệu" },
                { value: "OTHER", label: "Khác" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setContentType(item.value)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-center transition-all ${
                    contentType === item.value
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Topic / Idea */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Chủ đề / Ý tưởng nội dung <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: 5 loài động vật kỳ lạ và nguy hiểm nhất rừng rậm Amazon..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40 leading-relaxed"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Mô tả thêm (Tùy chọn)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Chuỗi video đăng TikTok phục vụ kênh khám phá thế giới."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40"
            />
          </div>

          {/* Submit */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <Link
              href="/projects"
              className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            >
              Hủy
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-5 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tạo dự án...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tạo Dự Án & Tiếp Tục</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
