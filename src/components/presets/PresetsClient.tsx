"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

interface Preset {
  id: string;
  name: string;
  styleBible: string;
  language: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  model: string;
  clipSeconds: number;
  continuity: "FLOW_AGENT" | "INDEPENDENT" | "LAST_FRAME";
  transition: "CUT" | "CROSSFADE";
  hashtags: string[];
  referenceImageKeys: string[];
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/40";

export default function PresetsClient() {
  const { success, error } = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", styleBible: "", language: "vi", aspectRatio: "9:16", clipSeconds: 10, continuity: "FLOW_AGENT", hashtags: "" });

  const load = useCallback(async () => {
    const r = await fetch("/api/presets", { cache: "no-store" });
    if (r.ok) setPresets(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, hashtags: form.hashtags.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không tạo được preset.");
      success("Đã tạo preset.");
      setForm({ ...form, name: "", styleBible: "", hashtags: "" });
      await load();
    } catch (err: any) {
      error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (id: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/presets/${id}/references`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) error(data.error || "Không tải được ảnh.");
    await load();
  };
  const removeRef = async (id: string, index: number) => {
    await fetch(`/api/presets/${id}/references?index=${index}`, { method: "DELETE" });
    await load();
  };
  const remove = async (id: string) => {
    if (!window.confirm("Xoá preset này (cả ảnh tham chiếu)?")) return;
    await fetch(`/api/presets/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-800">Tạo preset mới</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Tên kênh / preset *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={inputCls} placeholder="Hashtag cố định (cách nhau bằng dấu cách)" value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} />
        </div>
        <textarea rows={4} className={inputCls} placeholder="Phong cách cố định: nhân vật, trang phục, bối cảnh, ánh sáng, tông màu, kiểu quay…" value={form.styleBible} onChange={(e) => setForm({ ...form, styleBible: e.target.value })} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className={inputCls} value={form.aspectRatio} onChange={(e) => setForm({ ...form, aspectRatio: e.target.value })}>
            <option value="9:16">Dọc 9:16</option>
            <option value="16:9">Ngang 16:9</option>
            <option value="1:1">Vuông 1:1</option>
          </select>
          <input type="number" min={4} max={15} className={inputCls} value={form.clipSeconds} onChange={(e) => setForm({ ...form, clipSeconds: parseInt(e.target.value, 10) || 10 })} />
          <select className={inputCls} value={form.continuity} onChange={(e) => setForm({ ...form, continuity: e.target.value })}>
            <option value="FLOW_AGENT">Flow tự chia cảnh</option>
            <option value="INDEPENDENT">Tool chia cảnh (clip riêng)</option>
            <option value="LAST_FRAME">Tool chia cảnh + nối frame cuối</option>
          </select>
          <input className={inputCls} placeholder="Ngôn ngữ (vi, en…)" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
        </div>
        <button disabled={busy || !form.name.trim()} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>Tạo preset</span>
        </button>
      </form>

      {presets.map((p) => (
        <div key={p.id} className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 break-words">{p.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {p.aspectRatio} • {p.clipSeconds}s/clip • {p.continuity === "FLOW_AGENT" ? "Flow tự chia cảnh" : p.continuity === "LAST_FRAME" ? "Nối frame cuối" : "Clip riêng"} • {p.language}
              </p>
            </div>
            <button type="button" onClick={() => remove(p.id)} className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200" title="Xoá">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {p.styleBible && <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{p.styleBible}</p>}
          {p.hashtags.length > 0 && <p className="text-[11px] text-emerald-700">{p.hashtags.join(" ")}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            {p.referenceImageKeys.map((k, i) => (
              <span key={k} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 rounded-lg px-2 py-1">
                Ảnh {i + 1}
                <button type="button" onClick={() => removeRef(p.id, i)} className="text-slate-400 hover:text-rose-600"><X className="w-3 h-3" /></button>
              </span>
            ))}
            {p.referenceImageKeys.length < 3 && (
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-emerald-50">
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Thêm ảnh tham chiếu</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => upload(p.id, e.target.files)} />
              </label>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
