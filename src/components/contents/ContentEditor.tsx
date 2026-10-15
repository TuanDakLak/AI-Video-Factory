"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Loader2,
  Save,
  ArrowRight,
  Bot,
  Layers,
  Film,
  Edit3,
  Tags,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

interface ProjectOption {
  id: string;
  name: string;
  topic?: string;
  contentType?: string;
}

interface ContentEditorProps {
  projects: ProjectOption[];
  initialProjectId?: string;
  initialData?: {
    id?: string;
    projectId: string;
    title: string;
    concept: string;
    script: string;
    videoPrompt: string;
    description?: string | null;
    language: string;
    style: string;
    duration: string;
    aspectRatio: string;
    tags: string[] | string;
  };
}

export default function ContentEditor({
  projects,
  initialProjectId,
  initialData,
}: ContentEditorProps) {
  const router = useRouter();
  const { success, error, info } = useToast();

  const [projectId, setProjectId] = useState(
    initialData?.projectId || initialProjectId || (projects[0]?.id ?? "")
  );

  // AI Prompt generation inputs
  const [topicInput, setTopicInput] = useState(
    projects.find((p) => p.id === projectId)?.topic || ""
  );
  const [language, setLanguage] = useState(initialData?.language || "vi");
  const [style, setStyle] = useState(initialData?.style || "Cinematic");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(
    (initialData?.aspectRatio as any) || "9:16"
  );
  const [duration, setDuration] = useState(initialData?.duration || "8s");

  // Editable structured content output
  const [title, setTitle] = useState(initialData?.title || "");
  const [concept, setConcept] = useState(initialData?.concept || "");
  const [script, setScript] = useState(initialData?.script || "");
  const [videoPrompt, setVideoPrompt] = useState(initialData?.videoPrompt || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [tagsInput, setTagsInput] = useState(
    initialData?.tags
      ? Array.isArray(initialData.tags)
        ? initialData.tags.join(", ")
        : typeof initialData.tags === "string" && initialData.tags.startsWith("[")
        ? JSON.parse(initialData.tags).join(", ")
        : initialData.tags
      : ""
  );

  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiGeneratedSuccess, setAiGeneratedSuccess] = useState(false);

  // Trigger Gemini AI generation
  const handleGenerateWithAI = async () => {
    if (!topicInput.trim()) {
      error("Vui lòng nhập chủ đề / ý tưởng để AI tạo nội dung.");
      return;
    }

    setIsGeneratingAI(true);
    setAiGeneratedSuccess(false);

    try {
      const selectedProj = projects.find((p) => p.id === projectId);
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicInput.trim(),
          contentType: selectedProj?.contentType || "SHORT_VIDEO",
          language,
          style,
          targetDuration: duration,
          aspectRatio,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.notConfigured) {
          info(data.error);
          return;
        }
        throw new Error(data.error || "Không thể sinh nội dung từ Gemini.");
      }

      const generated = data.data;
      setTitle(generated.title || "");
      setConcept(generated.concept || "");
      setScript(generated.script || "");
      setVideoPrompt(generated.videoPrompt || "");
      setDescription(generated.description || "");
      setTagsInput(Array.isArray(generated.tags) ? generated.tags.join(", ") : "");

      setAiGeneratedSuccess(true);
      success("✨ Gemini đã tạo xong kịch bản & Video Prompt! Bạn có thể chỉnh sửa tự do bên dưới.");
    } catch (err: any) {
      error(err?.message || "Đã xảy ra lỗi khi tạo nội dung với AI.");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Save Content to Database
  const handleSave = async (createGenerationAfterSave: boolean = false) => {
    if (!projectId) {
      error("Vui lòng chọn Dự án.");
      return;
    }
    if (!title.trim() || !videoPrompt.trim()) {
      error("Vui lòng nhập Tiêu đề và Video Prompt.");
      return;
    }

    setIsSaving(true);
    try {
      const parsedTags = tagsInput
        .split(",")
        .map((t: string) => t.trim())
        .filter(Boolean);

      const payload = {
        projectId,
        title: title.trim(),
        concept: concept.trim() || title.trim(),
        script: script.trim() || concept.trim() || title.trim(),
        videoPrompt: videoPrompt.trim(),
        description: description.trim() || undefined,
        language,
        style,
        duration,
        aspectRatio,
        tags: parsedTags,
      };

      let contentId = initialData?.id;

      if (contentId) {
        // Update existing
        const res = await fetch(`/api/contents/${contentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Không thể cập nhật Content.");
      } else {
        // Create new
        const res = await fetch("/api/contents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Không thể lưu Content.");
        const created = await res.json();
        contentId = created.id;
      }

      success("Đã lưu nội dung kịch bản thành công!");

      if (createGenerationAfterSave && contentId) {
        router.push(
          `/generations/new?projectId=${projectId}&contentId=${contentId}&aspectRatio=${aspectRatio}&duration=${duration}`
        );
      } else {
        router.push(`/projects/${projectId}`);
      }
    } catch (err: any) {
      error(err?.message || "Lỗi khi lưu nội dung.");
    } finally {
      setIsSaving(false);
    }
  };

  if (projects.length === 0) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 text-center space-y-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-800">Chưa có dự án nào</h3>
        <p className="text-xs text-slate-500">
          Bạn cần tạo một Dự án trước khi soạn thảo kịch bản hoặc gọi AI.
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
    <div className="space-y-6">
      {/* 1. AI Generation Setup Card */}
      <div className="bg-gradient-to-br from-emerald-50/70 via-sky-50/40 to-slate-50 border border-emerald-200/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Trợ Lý Gemini AI Content Generator</span>
                <span className="text-[11px] font-normal text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                  Tùy chọn
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Nhập ý tưởng và để Gemini tự động phác thảo tiêu đề, kịch bản phân cảnh và Video Prompt chuẩn cho Veo 3.1.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Project select */}
          <div className="md:col-span-4 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Dự án áp dụng</label>
            <select
              value={projectId}
              onChange={(e) => {
                const newId = e.target.value;
                setProjectId(newId);
                const proj = projects.find((p) => p.id === newId);
                if (proj?.topic && !topicInput) setTopicInput(proj.topic);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-white"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Topic Input */}
          <div className="md:col-span-8 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Chủ đề / Ý tưởng nội dung
            </label>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder="VD: 5 loài sinh vật kỳ lạ dưới đáy rãnh Mariana, Chiến binh Viking trên đỉnh núi băng tuyết..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-white"
            />
          </div>
        </div>

        {/* Options Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500">Phong cách hình ảnh</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
            >
              <option value="Cinematic">Cinematic (Điện ảnh)</option>
              <option value="Photorealistic Documentary">Tài liệu thực tế</option>
              <option value="Sci-Fi Futuristic">Khoa học viễn tưởng</option>
              <option value="Anime / 3D Stylized">Hoạt hình / 3D</option>
              <option value="Dark Moody Horror">U ám / Huyền bí</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500">Tỉ lệ khung hình</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
            >
              <option value="9:16">9:16 (Dọc - Shorts/TikTok)</option>
              <option value="16:9">16:9 (Ngang - Chuẩn)</option>
              <option value="1:1">1:1 (Vuông)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500">Thời lượng clip</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
            >
              <option value="8s">8 giây (Veo 3.1)</option>
              <option value="15s">15 giây</option>
              <option value="30s">30 giây</option>
              <option value="60s">60 giây</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500">Ngôn ngữ kịch bản</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        {/* Generate Button */}
        <div className="pt-2 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            * Nhấn nút để Gemini tự động sinh prompt. Nếu không cấu hình Gemini API, bạn vẫn có thể tự gõ prompt thủ công ở form bên dưới.
          </p>

          <button
            type="button"
            onClick={handleGenerateWithAI}
            disabled={isGeneratingAI}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {isGeneratingAI ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gemini đang phân tích &amp; tạo kịch bản...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Tạo Nội Dung với Gemini AI</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Structured Content Editor Form */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Chi Tiết Kịch Bản &amp; Video Prompt
              </h3>
              <p className="text-xs text-slate-400">
                Bạn có toàn quyền chỉnh sửa lại tiêu đề, concept, kịch bản và câu prompt video.
              </p>
            </div>
          </div>

          {aiGeneratedSuccess && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Đã nạp dữ liệu từ AI</span>
            </span>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">
            Tiêu đề nội dung <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: 5 Sinh Vật Độc Lạ Rừng Amazon"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40"
          />
        </div>

        {/* Concept & Script */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Ý tưởng cốt lõi (Concept)</label>
            <textarea
              rows={3}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Tóm tắt ý đồ nghệ thuật và điểm nhấn thị giác..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40 leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Kịch bản phân cảnh / Lời dẫn</label>
            <textarea
              rows={3}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Cảnh 1: ... Cảnh 2: ..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-slate-50/40 leading-relaxed"
            />
          </div>
        </div>

        {/* PROMINENT VIDEO PROMPT (Crucial for Google Flow / Veo) */}
        <div className="space-y-2 bg-amber-50/40 border border-amber-200/70 p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Video Prompt (Dùng trực tiếp để render trên Google Flow / Veo 3.1)</span>
              <span className="text-rose-500">*</span>
            </label>
            <span className="text-[11px] text-amber-700 font-medium">Khuyên dùng tiếng Anh</span>
          </div>

          <textarea
            required
            rows={4}
            value={videoPrompt}
            onChange={(e) => setVideoPrompt(e.target.value)}
            placeholder="Cinematic close-up of a neon-lit cyberpunk city at night, rain pouring down with reflective puddle splashes, highly detailed 8k, moody lighting, 9:16..."
            className="w-full p-4 rounded-xl border border-amber-200 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all bg-white leading-relaxed shadow-inner"
          />
          <p className="text-[11px] text-slate-400">
            Prompt này sẽ được đưa vào lệnh tạo và bạn có thể Copy 1-click để dán vào Google Flow.
          </p>
        </div>

        {/* Description & Tags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Mô tả / Caption mạng xã hội</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Cùng khám phá bí ẩn đại dương..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 bg-slate-50/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
              <Tags className="w-3.5 h-3.5 text-slate-400" />
              <span>Thẻ Hashtags (ngăn cách bằng dấu phẩy)</span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="VD: aivideo, googleflow, veo3, amazon, shorts"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 bg-slate-50/40"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
          <Link
            href={`/projects/${projectId}`}
            className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            Quay lại Dự án
          </Link>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave(false)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium px-4 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Lưu Kịch Bản</span>
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave(true)}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <span>Lưu &amp; Tạo Video Prompt Ngay</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
