"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, ImagePlus, Inbox, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";
import { GENRES, GENRE_KEYS, GenreKey } from "@/lib/content/genres";

interface Channel {
  id: string;
  name: string;
  styleBible: string;
  language: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  hashtags: string[];
  referenceImageKeys: string[];
  automationEnabled: boolean;
  niche: string;
  genres: GenreKey[];
  durations: number[];
  videosPerDay: number;
  reviewHours: number;
  dailyCreditBudget: number;
  googleAccountId: string | null;
  autoPublish: boolean;
  publishTargets: string[];
  tiktokPrivacy: string;
}

interface Social {
  id: string;
  platform: string;
  displayName: string;
  status: string;
}

interface Account {
  id: string;
  name: string;
  status: string;
}

type Form = Omit<Channel, "id" | "referenceImageKeys" | "hashtags"> & { hashtags: string };

const EMPTY: Form = {
  name: "",
  styleBible: "",
  language: "vi",
  aspectRatio: "9:16",
  hashtags: "",
  automationEnabled: false,
  niche: "",
  genres: ["short_film"],
  durations: [30],
  videosPerDay: 1,
  reviewHours: 12,
  dailyCreditBudget: 200,
  googleAccountId: null,
  autoPublish: false,
  publishTargets: [],
  tiktokPrivacy: "SELF_ONLY",
};

const LANGS = [
  ["vi", "Tiếng Việt"],
  ["en", "English"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["zh", "中文"],
  ["th", "ไทย"],
];

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white";
const chip = (on: boolean) =>
  `px-2.5 py-1.5 rounded-lg border text-[11px] font-medium ${on ? "bg-emerald-50 border-emerald-400 text-emerald-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`;

function toForm(c: Channel): Form {
  const { id: _id, referenceImageKeys: _r, ...rest } = c;
  return { ...rest, hashtags: c.hashtags.join(" ") };
}

function ChannelForm(props: { initial: Form; accounts: Account[]; socials: Social[]; submitLabel: string; onSubmit: (f: Form) => Promise<void>; onCancel?: () => void }) {
  const [f, setF] = useState<Form>(props.initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await props.onSubmit(f);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Bản sắc kênh</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className={inputCls} placeholder="Tên kênh *" value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} />
          <input className={inputCls} placeholder="Hashtag cố định (cách nhau bằng dấu cách)" value={f.hashtags} onChange={(e) => set("hashtags", e.target.value)} />
        </div>
        <textarea rows={3} className={inputCls} placeholder="Phong cách cố định: nhân vật, trang phục, bối cảnh, ánh sáng, tông màu, kiểu quay…" value={f.styleBible} onChange={(e) => set("styleBible", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <select className={inputCls} value={f.aspectRatio} onChange={(e) => set("aspectRatio", e.target.value as Form["aspectRatio"])}>
            <option value="9:16">Dọc 9:16 (TikTok, Reels, Shorts)</option>
            <option value="16:9">Ngang 16:9 (YouTube)</option>
            <option value="1:1">Vuông 1:1</option>
          </select>
          <select className={inputCls} value={f.language} onChange={(e) => set("language", e.target.value)}>
            {LANGS.map(([v, l]) => (
              <option key={v} value={v}>Lời thoại: {l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tự động sản xuất</span>
            <span className="block text-[11px] text-slate-500">Chủ đề đã duyệt sẽ tự được viết kịch bản và render theo lịch dưới đây.</span>
          </span>
          <input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={f.automationEnabled} onChange={(e) => set("automationEnabled", e.target.checked)} />
        </label>
        <textarea rows={2} className={inputCls} placeholder="Ngách / nội dung kênh (vd: chuyện cổ tích Việt Nam cho thiếu nhi; động vật hoang dã kỳ lạ…). Dùng để tìm chủ đề và viết kịch bản." value={f.niche} onChange={(e) => set("niche", e.target.value)} maxLength={2000} />
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-700">Thể loại (luân phiên giữa các chủ đề)</p>
          <div className="flex flex-wrap gap-1.5">
            {GENRE_KEYS.map((g) => (
              <button type="button" key={g} title={GENRES[g].description} onClick={() => set("genres", toggle(f.genres, g))} className={chip(f.genres.includes(g))}>
                {GENRES[g].label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-700">Độ dài video</p>
            <div className="flex gap-1.5">
              {[30, 60, 90].map((d) => (
                <button type="button" key={d} onClick={() => set("durations", toggle(f.durations, d).length ? toggle(f.durations, d) : f.durations)} className={chip(f.durations.includes(d))}>
                  {d}s
                </button>
              ))}
            </div>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-700">Tài khoản Google (Flow)</span>
            <select className={inputCls} value={f.googleAccountId ?? ""} onChange={(e) => set("googleAccountId", e.target.value || null)}>
              <option value="">Tự chọn tài khoản đã kết nối</option>
              {props.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.status !== "CONNECTED" ? " (chưa kết nối)" : ""}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-700">Video / ngày</span>
            <input type="number" min={0} max={20} className={inputCls} value={f.videosPerDay} onChange={(e) => set("videosPerDay", Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-700">Thời gian duyệt (giờ)</span>
            <input type="number" min={0} max={168} className={inputCls} value={f.reviewHours} onChange={(e) => set("reviewHours", Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-700">Credit / ngày</span>
            <input type="number" min={0} max={5000} className={inputCls} value={f.dailyCreditBudget} onChange={(e) => set("dailyCreditBudget", Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </label>
        </div>
        <p className="text-[11px] text-slate-500">
          Chủ đề mới chờ {f.reviewHours > 0 ? `${f.reviewHours} giờ` : "bạn bấm Duyệt"} trước khi được sản xuất; xoá trong lúc chờ thì không làm.
          Mỗi video {f.durations.map((d) => `${d}s ≈ ${Math.round(d / 10) * 15}`).join(", ")} credit. Credit/ngày = 0 là không giới hạn.
        </p>
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tự đăng bài</span>
            <span className="block text-[11px] text-slate-500">Video làm xong được đăng lên các tài khoản chọn bên dưới (kèm caption, hashtag, nhãn nội dung AI).</span>
          </span>
          <input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={f.autoPublish} onChange={(e) => set("autoPublish", e.target.checked)} />
        </label>
        {props.socials.length === 0 ? (
          <p className="text-[11px] text-slate-500">Chưa kết nối tài khoản TikTok / Facebook nào (Cài đặt → Mạng xã hội).</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {props.socials.map((s) => (
              <button type="button" key={s.id} onClick={() => set("publishTargets", toggle(f.publishTargets, s.id))} className={chip(f.publishTargets.includes(s.id))}>
                {s.platform === "TIKTOK" ? "TikTok" : "Facebook"}: {s.displayName}{s.status !== "CONNECTED" ? " (cần kết nối lại)" : ""}
              </button>
            ))}
          </div>
        )}
        {props.socials.some((s) => s.platform === "TIKTOK" && f.publishTargets.includes(s.id)) && (
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-slate-700">Chế độ hiển thị trên TikTok</span>
            <select className={inputCls} value={f.tiktokPrivacy} onChange={(e) => set("tiktokPrivacy", e.target.value)}>
              <option value="SELF_ONLY">Chỉ mình tôi (ứng dụng chưa được TikTok duyệt chỉ đăng được chế độ này)</option>
              <option value="PUBLIC_TO_EVERYONE">Công khai</option>
              <option value="FOLLOWER_OF_CREATOR">Người theo dõi</option>
              <option value="MUTUAL_FOLLOW_FRIENDS">Bạn bè</option>
            </select>
          </label>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button disabled={busy || !f.name.trim() || f.genres.length === 0} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl disabled:opacity-50">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{props.submitLabel}</span>
        </button>
        {props.onCancel && (
          <button type="button" onClick={props.onCancel} className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Huỷ</button>
        )}
      </div>
    </form>
  );
}

export default function PresetsClient() {
  const { success, error } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [socials, setSocials] = useState<Social[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, a, s] = await Promise.all([
      fetch("/api/presets", { cache: "no-store" }),
      fetch("/api/google-accounts", { cache: "no-store" }),
      fetch("/api/social", { cache: "no-store" }),
    ]);
    if (c.ok) setChannels(await c.json());
    if (a.ok) setAccounts(await a.json());
    if (s.ok) setSocials((await s.json()).accounts);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const payload = (f: Form) => ({ ...f, hashtags: f.hashtags.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)) });

  const create = async (f: Form) => {
    const res = await fetch("/api/presets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(f)) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return error(data.error || "Không tạo được kênh.");
    success(`Đã tạo kênh "${data.name}".`);
    setCreating(false);
    await load();
  };
  const save = async (id: string, f: Form) => {
    const res = await fetch(`/api/presets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload(f)) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return error(data.error || "Không lưu được kênh.");
    success("Đã lưu kênh.");
    setEditing(null);
    await load();
  };
  const upload = async (id: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    Array.from(files).forEach((file) => fd.append("files", file));
    const res = await fetch(`/api/presets/${id}/references`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) error(data.error || "Không tải được ảnh.");
    await load();
  };
  const removeRef = async (id: string, index: number) => {
    await fetch(`/api/presets/${id}/references?index=${index}`, { method: "DELETE" });
    await load();
  };
  const remove = async (c: Channel) => {
    if (!window.confirm(`Xoá kênh "${c.name}" cùng toàn bộ chủ đề của kênh? Video đã làm vẫn được giữ.`)) return;
    await fetch(`/api/presets/${c.id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-5">
      {creating ? (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-4">Kênh mới</h2>
          <ChannelForm initial={EMPTY} accounts={accounts} socials={socials} submitLabel="Tạo kênh" onSubmit={create} onCancel={() => setCreating(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
          <Plus className="w-3.5 h-3.5" /> Tạo kênh
        </button>
      )}

      {channels.length === 0 && !creating && (
        <p className="text-xs text-slate-500 bg-white border border-dashed border-slate-200 rounded-2xl p-6 text-center">
          Chưa có kênh nào. Tạo kênh để cố định phong cách video và bật sản xuất tự động.
        </p>
      )}

      {channels.map((c) => (
        <div key={c.id} className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm space-y-3">
          {editing === c.id ? (
            <ChannelForm initial={toForm(c)} accounts={accounts} socials={socials} submitLabel="Lưu" onSubmit={(f) => save(c.id, f)} onCancel={() => setEditing(null)} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-900 break-words">{c.name}</h3>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.automationEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                      <Bot className="w-3 h-3" /> {c.automationEnabled ? `Tự động: ${c.videosPerDay} video/ngày` : "Tự động: tắt"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {c.aspectRatio} • {c.durations.map((d) => `${d}s`).join("/")} • {c.genres.map((g) => GENRES[g]?.label ?? g).join(", ") || "chưa chọn thể loại"} • lời thoại {c.language}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link href={`/topics?channel=${c.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
                    <Inbox className="w-3.5 h-3.5" /> Chủ đề
                  </Link>
                  <button type="button" onClick={() => setEditing(c.id)} className="p-2 rounded-xl text-slate-600 hover:bg-slate-50 border border-slate-200" title="Sửa">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(c)} className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200" title="Xoá">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {c.niche && <p className="text-xs text-slate-600"><span className="text-slate-400">Ngách:</span> {c.niche}</p>}
              {c.styleBible && <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{c.styleBible}</p>}
              {c.hashtags.length > 0 && <p className="text-[11px] text-emerald-700">{c.hashtags.join(" ")}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                {c.referenceImageKeys.map((k, i) => (
                  <span key={k} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 rounded-lg px-2 py-1">
                    Ảnh {i + 1}
                    <button type="button" onClick={() => removeRef(c.id, i)} className="text-slate-400 hover:text-rose-600"><X className="w-3 h-3" /></button>
                  </span>
                ))}
                {c.referenceImageKeys.length < 3 && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-emerald-50">
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>Thêm ảnh tham chiếu (nhân vật / sản phẩm)</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => upload(c.id, e.target.files)} />
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
