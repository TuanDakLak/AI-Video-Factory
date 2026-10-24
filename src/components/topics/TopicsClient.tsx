"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Clock, ExternalLink, Film, Loader2, Pencil, Play, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";
import { GENRES, GENRE_KEYS, GenreKey } from "@/lib/content/genres";

type Status = "SUGGESTED" | "APPROVED" | "PRODUCING" | "READY" | "FAILED" | "REJECTED";

interface Topic {
  id: string;
  title: string;
  angle: string | null;
  genre: GenreKey;
  durationSec: number;
  source: string;
  sourceUrls: string;
  score: number | null;
  status: Status;
  autoApproveAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  channel: { id: string; name: string };
  sequence: { id: string; status: string; finalVideo: { id: string; duration: number | null } | null } | null;
}

interface ChannelLite {
  id: string;
  name: string;
  automationEnabled: boolean;
  reviewHours: number;
  videosPerDay: number;
  niche: string;
  lastResearchAt: Date | string | null;
  lastResearchNote: string | null;
}

const TABS: { status: Status; label: string }[] = [
  { status: "SUGGESTED", label: "Chờ duyệt" },
  { status: "APPROVED", label: "Đã duyệt" },
  { status: "PRODUCING", label: "Đang làm" },
  { status: "READY", label: "Đã xong" },
  { status: "FAILED", label: "Lỗi" },
  { status: "REJECTED", label: "Đã xoá" },
];

const SOURCE: Record<string, string> = { MANUAL: "Thêm tay", AI_RESEARCH: "AI gợi ý", API: "API" };
const inputCls = "w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500";

function timeLeft(iso: string | null): string {
  if (!iso) return "chờ bạn duyệt";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "sắp tự duyệt";
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `tự duyệt sau ${h > 0 ? `${h} giờ ` : ""}${m} phút`;
}

export default function TopicsClient({ channels }: { channels: ChannelLite[] }) {
  const { success, error } = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [channelId, setChannelId] = useState<string>(params.get("channel") || "");
  const [tab, setTab] = useState<Status>("SUGGESTED");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; angle: string; genre: GenreKey; durationSec: number }>({ title: "", angle: "", genre: "short_film", durationSec: 30 });
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState({ channelId: params.get("channel") || channels[0]?.id || "", title: "", angle: "", genre: "" as GenreKey | "", durationSec: 0 });

  const load = useCallback(async () => {
    const q = channelId ? `?channelId=${channelId}` : "";
    const r = await fetch(`/api/topics${q}`, { cache: "no-store" });
    if (r.ok) setTopics(await r.json());
    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const [researching, setResearching] = useState(false);
  const [researchNote, setResearchNote] = useState<Record<string, string | null>>(() => Object.fromEntries(channels.map((c) => [c.id, c.lastResearchNote])));
  const current = channels.find((c) => c.id === channelId);

  const research = async () => {
    if (!current) return;
    setResearching(true);
    try {
      const res = await fetch(`/api/channels/${current.id}/research`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count: 5 }) });
      const data = await res.json().catch(() => ({}));
      if (data.note) setResearchNote((n) => ({ ...n, [current.id]: data.note }));
      if (res.ok) success(data.note);
      else error(data.note || data.error || "Không tìm được chủ đề.");
      setTab("SUGGESTED");
      await load();
    } finally {
      setResearching(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of topics) c[t.status] = (c[t.status] || 0) + 1;
    return c;
  }, [topics]);
  const visible = topics.filter((t) => t.status === tab);

  const act = async (t: Topic, action: "approve" | "reject" | "restore" | "produce") => {
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/topics/${t.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 422) throw new Error(data.error || "Không thực hiện được.");
      if (action === "produce") {
        if (data.status === "FAILED") error(`Không bắt đầu được: ${data.errorMessage}`);
        else success("Đã viết kịch bản và đưa video vào hàng đợi.");
      } else {
        success({ approve: "Đã duyệt.", reject: "Đã xoá chủ đề. Hệ thống sẽ không làm và không gợi ý lại.", restore: "Đã đưa về hộp chờ duyệt." }[action]);
      }
      await load();
    } catch (e: any) {
      error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (t: Topic) => {
    setEditing(t.id);
    setDraft({ title: t.title, angle: t.angle || "", genre: t.genre, durationSec: t.durationSec });
  };
  const saveEdit = async (t: Topic) => {
    setBusyId(t.id);
    const res = await fetch(`/api/topics/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, angle: draft.angle || null }) });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) return error(data.error || "Không lưu được.");
    setEditing(null);
    await load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyId("new");
    const body = {
      channelId: newTopic.channelId,
      title: newTopic.title,
      ...(newTopic.angle ? { angle: newTopic.angle } : {}),
      ...(newTopic.genre ? { genre: newTopic.genre } : {}),
      ...(newTopic.durationSec ? { durationSec: newTopic.durationSec } : {}),
    };
    const res = await fetch("/api/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) return error(data.error || "Không thêm được chủ đề.");
    success("Đã thêm chủ đề (đã duyệt): sẽ được làm theo lịch của kênh.");
    setNewTopic({ ...newTopic, title: "", angle: "" });
    setAdding(false);
    setTab("APPROVED");
    await load();
  };

  if (channels.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center text-xs text-slate-500 space-y-2">
        <p>Chưa có kênh nào. Chủ đề luôn thuộc về một kênh (phong cách, ngôn ngữ, lịch sản xuất).</p>
        <Link href="/channels" className="inline-block text-emerald-700 font-semibold hover:underline">Tạo kênh đầu tiên →</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          value={channelId}
          onChange={(e) => {
            setChannelId(e.target.value);
            router.replace(e.target.value ? `/topics?channel=${e.target.value}` : "/topics");
          }}
        >
          <option value="">Tất cả kênh</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.automationEnabled ? "" : " (tự động: tắt)"}</option>
          ))}
        </select>
        <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl">
          <Plus className="w-3.5 h-3.5" /> Thêm chủ đề
        </button>
        {current && (
          <button type="button" onClick={research} disabled={researching} title="Lấy xu hướng Google Trends, Wikipedia, tin tức rồi để AI đề xuất chủ đề hợp với ngách của kênh"
            className="inline-flex items-center gap-1.5 border border-violet-200 text-violet-700 hover:bg-violet-50 text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
            {researching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI tìm chủ đề
          </button>
        )}
      </div>
      {current && (researchNote[current.id] || !current.niche) && (
        <p className="text-[11px] text-slate-500">
          {!current.niche ? "Kênh chưa có mô tả ngách: AI chưa biết tìm chủ đề gì (sửa ở trang Kênh). " : ""}
          {researchNote[current.id] ? `Lần tìm gần nhất: ${researchNote[current.id]}` : ""}
        </p>
      )}

      {adding && (
        <form onSubmit={add} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-2">
            <select className={inputCls} value={newTopic.channelId} onChange={(e) => setNewTopic({ ...newTopic, channelId: e.target.value })}>
              {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className={inputCls} placeholder="Chủ đề * (vd: Cô bé bán diêm phiên bản Sài Gòn 2026)" value={newTopic.title} onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })} maxLength={200} />
          </div>
          <input className={inputCls} placeholder="Góc khai thác / điểm hấp dẫn (không bắt buộc)" value={newTopic.angle} onChange={(e) => setNewTopic({ ...newTopic, angle: e.target.value })} maxLength={1000} />
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={newTopic.genre} onChange={(e) => setNewTopic({ ...newTopic, genre: e.target.value as GenreKey | "" })}>
              <option value="">Thể loại: theo kênh</option>
              {GENRE_KEYS.map((g) => <option key={g} value={g}>{GENRES[g].label}</option>)}
            </select>
            <select className={inputCls} value={newTopic.durationSec} onChange={(e) => setNewTopic({ ...newTopic, durationSec: parseInt(e.target.value, 10) })}>
              <option value={0}>Độ dài: theo kênh</option>
              {[30, 60, 90].map((d) => <option key={d} value={d}>{d} giây</option>)}
            </select>
          </div>
          <button disabled={busyId === "new" || newTopic.title.trim().length < 3} className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
            {busyId === "new" && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Thêm
          </button>
        </form>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            onClick={() => setTab(t.status)}
            className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t.status ? "border-emerald-600 text-emerald-800" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
            {counts[t.status] ? <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5">{counts[t.status]}</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : visible.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-10">Không có chủ đề nào ở mục này.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => (
            <li key={t.id} className="bg-white border border-slate-200 rounded-2xl p-4">
              {editing === t.id ? (
                <div className="space-y-2">
                  <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={200} />
                  <input className={inputCls} placeholder="Góc khai thác" value={draft.angle} onChange={(e) => setDraft({ ...draft, angle: e.target.value })} maxLength={1000} />
                  <div className="grid grid-cols-2 gap-2">
                    <select className={inputCls} value={draft.genre} onChange={(e) => setDraft({ ...draft, genre: e.target.value as GenreKey })}>
                      {GENRE_KEYS.map((g) => <option key={g} value={g}>{GENRES[g].label}</option>)}
                    </select>
                    <select className={inputCls} value={draft.durationSec} onChange={(e) => setDraft({ ...draft, durationSec: parseInt(e.target.value, 10) })}>
                      {[30, 60, 90].map((d) => <option key={d} value={d}>{d} giây</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => saveEdit(t)} disabled={busyId === t.id} className="inline-flex items-center gap-1 bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"><Check className="w-3.5 h-3.5" /> Lưu</button>
                    <button type="button" onClick={() => setEditing(null)} className="inline-flex items-center gap-1 text-xs text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100"><X className="w-3.5 h-3.5" /> Huỷ</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-900 break-words">{t.title}</p>
                    {t.angle && <p className="text-xs text-slate-600">{t.angle}</p>}
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                      <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-semibold">{GENRES[t.genre]?.label ?? t.genre}</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t.durationSec}s</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{SOURCE[t.source] ?? t.source}</span>
                      {t.score != null && t.source === "AI_RESEARCH" && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">điểm {Math.round(t.score * 100)}</span>}
                      {(JSON.parse(t.sourceUrls || "[]") as string[]).slice(0, 2).map((u) => (
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-sky-700 hover:underline">
                          <ExternalLink className="w-3 h-3" /> nguồn
                        </a>
                      ))}
                      {!channelId && <span className="text-slate-400">{t.channel.name}</span>}
                      {t.status === "SUGGESTED" && <span className="inline-flex items-center gap-1 text-amber-700"><Clock className="w-3 h-3" />{timeLeft(t.autoApproveAt)}</span>}
                    </div>
                    {t.errorMessage && (
                      <p className={`text-[11px] break-words ${t.status === "FAILED" ? "text-rose-600" : "text-amber-700"}`}>{t.errorMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {busyId === t.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    {t.status === "SUGGESTED" && (
                      <button type="button" disabled={busyId === t.id} onClick={() => act(t, "approve")} className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1.5 hover:bg-emerald-50">
                        <Check className="w-3.5 h-3.5" /> Duyệt
                      </button>
                    )}
                    {["SUGGESTED", "APPROVED", "FAILED"].includes(t.status) && (
                      <button type="button" disabled={busyId === t.id} onClick={() => act(t, "produce")} title="Viết kịch bản và render ngay (bỏ qua lịch, vẫn tính ngân sách)"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
                        <Play className="w-3.5 h-3.5" /> {t.status === "FAILED" ? "Thử lại" : "Làm ngay"}
                      </button>
                    )}
                    {["SUGGESTED", "APPROVED", "FAILED", "REJECTED"].includes(t.status) && t.status !== "REJECTED" && (
                      <button type="button" onClick={() => startEdit(t)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Sửa"><Pencil className="w-3.5 h-3.5" /></button>
                    )}
                    {["SUGGESTED", "APPROVED", "FAILED"].includes(t.status) && (
                      <button type="button" disabled={busyId === t.id} onClick={() => act(t, "reject")} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Xoá (không làm, không gợi ý lại)"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                    {t.status === "REJECTED" && (
                      <button type="button" disabled={busyId === t.id} onClick={() => act(t, "restore")} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
                        <RotateCcw className="w-3.5 h-3.5" /> Khôi phục
                      </button>
                    )}
                    {t.sequence && ["PRODUCING", "FAILED"].includes(t.status) && (
                      <Link href={`/sequences/${t.sequence.id}`} className="text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">Xem tiến trình</Link>
                    )}
                    {t.status === "READY" && t.sequence?.finalVideo && (
                      <Link href={`/videos/${t.sequence.finalVideo.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-emerald-600 rounded-lg px-2.5 py-1.5 hover:bg-emerald-700">
                        <Film className="w-3.5 h-3.5" /> Xem video
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
