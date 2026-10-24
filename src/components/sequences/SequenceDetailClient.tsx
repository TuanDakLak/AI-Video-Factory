"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Download, ImagePlus, X, ExternalLink, Film, Loader2, Play, RefreshCw, Save, Scissors, Send, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/ToastContext";

interface PlatformCheck { platform: string; name: string; level: "ok" | "warn" | "fail"; issues: string[] }
interface SceneVideo { id: string; duration?: number | null }
interface Scene {
  id: string;
  sceneIndex: number | null;
  prompt: string;
  status: string;
  errorMessage?: string | null;
  videoAsset?: SceneVideo | null;
}
interface SequenceData {
  id: string;
  title: string;
  status: string;
  errorMessage?: string | null;
  styleBible: string;
  aspectRatio: string;
  clipSeconds: number;
  totalDuration: number;
  transition: string;
  continuity: string;
  referenceImageKeys: string;
  caption?: string | null;
  tags: string;
  model: string;
  project: { id: string; name: string };
  finalVideo?: { id: string; duration?: number | null } | null;
  scenes: Scene[];
}

const IN_FLIGHT = ["QUEUED", "STARTING_BROWSER", "CHECKING_ACCOUNT", "OPENING_FLOW", "SUBMITTING", "GENERATING", "DOWNLOADING", "PROCESSING"];

export default function SequenceDetailClient({ initial }: { initial: SequenceData }) {
  const router = useRouter();
  const { success, error, info } = useToast();
  const [seq, setSeq] = useState<SequenceData>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState<string | null>(null);
  const [checks, setChecks] = useState<PlatformCheck[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = seq.status === "RUNNING" || seq.status === "ASSEMBLING" || seq.scenes.some((s) => IN_FLIGHT.includes(s.status));

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/sequences/${seq.id}`, { cache: "no-store" });
      if (res.ok) setSeq(await res.json());
    } catch {}
  }, [seq.id]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const finalId = seq.finalVideo?.id;
  useEffect(() => {
    if (!finalId) { setChecks([]); return; }
    fetch(`/api/videos/${finalId}/publish-package`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setChecks(d?.checks || []))
      .catch(() => setChecks([]));
  }, [finalId, seq.status]);

  // after assembly the 10s clips are deleted (only the long video is kept): a COMPLETED scene of a finished video counts as done
  const sceneDone = (s: (typeof seq.scenes)[number]) => !!s.videoAsset || (!!finalId && s.status === "COMPLETED");
  const doneCount = seq.scenes.filter((s) => s.status === "COMPLETED" && sceneDone(s)).length;
  const total = seq.scenes.length;
  const allClips = total > 0 && seq.scenes.every(sceneDone);
  const clipsPurged = !!finalId && seq.scenes.some((s) => !s.videoAsset);
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const call = async (key: string, url: string, init: RequestInit, okMsg?: string) => {
    setBusy(key);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Thao tác thất bại.");
      if (okMsg || data.message) success(okMsg || data.message);
      await refresh();
      return data;
    } catch (err: any) {
      error(err?.message || "Thao tác thất bại.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleStart = async () => {
    info("Đang xếp hàng Flow Agent...");
    await call("start", `/api/sequences/${seq.id}/start`, { method: "POST", body: JSON.stringify({}) });
  };

  const handleDryRun = async () => {
    info("Đang xếp hàng chạy thử (không tốn credit)...");
    await call("dryrun", `/api/sequences/${seq.id}/start`, { method: "POST", body: JSON.stringify({ mode: "DRYRUN" }) });
  };

  const handleRecover = async () => {
    const url = window.prompt("Khôi phục clip đã có trong dự án Flow (không tốn credit).\nDán URL dự án Flow (…/project/…) hoặc để trống để dùng URL đã lưu:", "");
    if (url === null) return;
    const trimmed = url.trim();
    info("Đang xếp hàng khôi phục clip từ Flow...");
    await call("recover", `/api/sequences/${seq.id}/start`, { method: "POST", body: JSON.stringify({ mode: "RECOVER", ...(trimmed ? { flowProjectUrl: trimmed } : {}) }) });
  };

  const handleAssemble = async (transition?: string) => {
    await call("assemble", `/api/sequences/${seq.id}/assemble`, { method: "POST", body: JSON.stringify(transition ? { transition } : {}) });
  };

  const handleDelete = async () => {
    if (!window.confirm("Xoá video này cùng các clip và video đã ghép? Không thể hoàn tác.")) return;
    const data = await call("delete", `/api/sequences/${seq.id}`, { method: "DELETE" }, "Đã xoá.");
    if (data) router.push("/sequences");
  };

  const refKeys: string[] = useMemo(() => {
    try { const v = JSON.parse(seq.referenceImageKeys || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  }, [seq.referenceImageKeys]);
  const tagList: string[] = useMemo(() => {
    try { const v = JSON.parse(seq.tags || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  }, [seq.tags]);

  const patchSeq = async (body: Record<string, unknown>, okMsg?: string) =>
    call("patch", `/api/sequences/${seq.id}`, { method: "PATCH", body: JSON.stringify(body) }, okMsg);

  const uploadRefs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    setBusy("refs");
    try {
      const res = await fetch(`/api/sequences/${seq.id}/references`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không tải được ảnh.");
      success("Đã thêm ảnh tham chiếu.");
      await refresh();
    } catch (err: any) {
      error(err?.message || "Không tải được ảnh.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeRef = async (index: number) => {
    await call("refs", `/api/sequences/${seq.id}/references/${index}`, { method: "DELETE" }, "Đã xoá ảnh.");
  };

  const saveCaption = async () => {
    const body: Record<string, unknown> = {};
    if (caption !== null) body.caption = caption;
    if (tagsText !== null) body.tags = tagsText.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`));
    if (Object.keys(body).length === 0) return;
    const data = await patchSeq(body, "Đã lưu nội dung đăng bài.");
    if (data) { setCaption(null); setTagsText(null); }
  };

  // older videos rendered scene by scene can only be completed by manual import
  const legacy = seq.continuity !== "FLOW_AGENT";
  const startLabel = seq.status === "PLANNED" ? "Bắt đầu render" : "Chạy lại";
  const canStart = !legacy && !active && doneCount === 0 && (seq.status === "PLANNED" || seq.status === "NEEDS_USER_ACTION");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <StatusBadge status={seq.status} />
              <span className="text-xs text-slate-400">{seq.aspectRatio} • {seq.model} • {total} clip × {seq.clipSeconds}s • {seq.transition === "CROSSFADE" ? "Crossfade" : "Cắt thẳng"}{legacy ? " • chế độ cũ (Import thủ công)" : ""}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight break-words">{seq.title}</h1>
            <div className="text-xs text-slate-500">📁 {seq.project.name}</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canStart && (
              <button type="button" onClick={handleStart} disabled={busy !== null}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm disabled:opacity-50">
                {busy === "start" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-white" />}
                <span>{startLabel}</span>
              </button>
            )}
            {!legacy && !active && doneCount === 0 && seq.status === "PLANNED" && (
              <button type="button" onClick={handleDryRun} disabled={busy !== null}
                title="Flow Agent lập kế hoạch, tool đọc số video + giá rồi từ chối. Không tốn credit."
                className="inline-flex items-center gap-2 border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                {busy === "dryrun" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>Chạy thử (0 credit)</span>
              </button>
            )}
            {!legacy && !active && !allClips && seq.status === "NEEDS_USER_ACTION" && (
              <button type="button" onClick={handleRecover} disabled={busy !== null}
                title="Lấy lại các clip Flow đã tạo trong dự án Flow, không tốn credit."
                className="inline-flex items-center gap-2 border border-orange-300 text-orange-800 hover:bg-orange-50 text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
                {busy === "recover" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Khôi phục clip từ Flow</span>
              </button>
            )}
            {allClips && !active && !clipsPurged && (
              <button type="button" onClick={() => handleAssemble()} disabled={busy !== null}
                className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm disabled:opacity-50">
                <Scissors className="w-3.5 h-3.5" /><span>Ghép lại video</span>
              </button>
            )}
            <button type="button" onClick={handleDelete} disabled={busy !== null || active}
              className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 disabled:opacity-40" title="Xoá">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>{doneCount}/{total} cảnh đã có clip</span>
            <span>{seq.status === "ASSEMBLING" ? "Đang ghép thành video hoàn chỉnh..." : active ? "Đang xử lý..." : ""}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {seq.errorMessage && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-900">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{seq.errorMessage}</span>
          </div>
        )}
      </div>

      {/* Reference images */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Ảnh tham chiếu</h2>
          <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
            Một lần chạy duy nhất: Flow Agent tự chia {seq.totalDuration}s thành {total} clip {seq.clipSeconds}s trong cùng một project và dùng chung các ảnh nhân vật/sản phẩm này cho mọi clip.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {refKeys.map((_, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/sequences/${seq.id}/references/${i}`} alt={`Tham chiếu ${i + 1}`} className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
              <button type="button" onClick={() => removeRef(i)} disabled={busy !== null || active}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center disabled:opacity-40" title="Xoá ảnh">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {refKeys.length < 3 && (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy !== null || active}
                className="w-16 h-16 rounded-xl border border-dashed border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 flex items-center justify-center disabled:opacity-40" title="Thêm ảnh tham chiếu">
                <ImagePlus className="w-5 h-5" />
              </button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => uploadRefs(e.target.files)} />
            </>
          )}
          <span className="text-[11px] text-slate-500">{refKeys.length}/3 ảnh sản phẩm / nhân vật</span>
        </div>
      </div>

      {/* Caption & tags: input for the publish step */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900">Nội dung đăng bài (caption & hashtag)</h2>
          {(caption !== null || tagsText !== null) && (
            <button type="button" onClick={saveCaption} disabled={busy !== null}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />Lưu
            </button>
          )}
        </div>
        <textarea rows={3} value={caption ?? seq.caption ?? ""} onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption sẽ được dùng khi đăng lên mạng xã hội"
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/40 leading-relaxed" />
        <input value={tagsText ?? tagList.join(" ")} onChange={(e) => setTagsText(e.target.value)} placeholder="#hashtag1 #hashtag2"
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/40" />
      </div>

      {/* Final video */}
      {seq.finalVideo && (
        <div className="bg-white border border-emerald-200 rounded-3xl p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Film className="w-4 h-4 text-emerald-600" />Video hoàn chỉnh{seq.finalVideo.duration ? ` (${seq.finalVideo.duration.toFixed(1)}s)` : ""}</h2>
            <div className="flex items-center gap-2">
              <Link href={`/videos/${seq.finalVideo.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"><Send className="w-3.5 h-3.5" />Đăng bài</Link>
              <a href={`/api/videos/${seq.finalVideo.id}/file?download=true`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg"><Download className="w-3.5 h-3.5" />Tải về</a>
            </div>
          </div>
          <video key={seq.finalVideo.id} src={`/api/videos/${seq.finalVideo.id}/file`} controls preload="metadata"
            className="w-full max-h-[70vh] rounded-2xl bg-black" />
          {checks.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="text-slate-500">Sẵn sàng đăng:</span>
              {checks.map((c) => (
                <span key={c.platform} title={c.issues.join("\n") || "Phù hợp"}
                  className={`px-2.5 py-1 rounded-full border font-medium ${c.level === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : c.level === "warn" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                  {c.name}: {c.level === "ok" ? "OK" : c.level === "warn" ? "Cảnh báo" : "Chưa phù hợp"}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Chuyển cảnh:</span>
            {(["CUT", "CROSSFADE"] as const).map((t) => (
              <button key={t} type="button" disabled={busy !== null || active || seq.transition === t || clipsPurged} onClick={() => handleAssemble(t)}
                title={clipsPurged ? "Clip 10s đã được xoá sau khi ghép (chỉ giữ video dài)" : undefined}
                className={`px-2.5 py-1 rounded-lg border ${seq.transition === t ? "bg-emerald-50 border-emerald-400 text-emerald-700" : "border-slate-200 hover:border-slate-300 disabled:opacity-50"}`}>
                {t === "CUT" ? "Cắt thẳng" : "Crossfade"}
              </button>
            ))}
            {clipsPurged && <span className="text-slate-400">(clip 10s đã xoá sau khi ghép, chỉ giữ video dài)</span>}
          </div>
        </div>
      )}

      {/* Scenes */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Các clip</h2>
          <p className="text-[11px] text-slate-500 mt-1">Prompt từng clip do Flow Agent viết, hiện sau khi chạy. Clip lỗi: bấm "Khôi phục clip từ Flow" hoặc Import thủ công vào đúng cảnh.</p>
        </div>

        {seq.scenes.map((scene, i) => (
          <div key={scene.id} className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center justify-center">{(scene.sceneIndex ?? i) + 1}</span>
                <StatusBadge status={scene.status} />
              </div>
              <Link href={`/generations/${scene.id}`} className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" />Nhật ký / Import thủ công</Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
              <p className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50/60 rounded-xl border border-slate-100 px-3.5 py-2.5 max-h-40 overflow-auto">{scene.prompt}</p>
              {scene.videoAsset && (
                <video src={`/api/videos/${scene.videoAsset.id}/file`} controls preload="metadata" className="h-40 sm:h-44 rounded-xl bg-black justify-self-start sm:justify-self-end" />
              )}
            </div>

            {scene.errorMessage && (scene.status === "FAILED" || scene.status === "NEEDS_USER_ACTION") && (
              <p className="mt-2 text-[11px] text-rose-600 leading-relaxed">{scene.errorMessage}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
