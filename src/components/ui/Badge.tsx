import React from "react";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    DRAFT: { label: "Bản nháp", bg: "bg-slate-50 border-slate-200", text: "text-slate-600", dot: "bg-slate-400" },
    QUEUED: { label: "Đang chờ hàng đợi", bg: "bg-blue-50 border-blue-200", text: "text-blue-700", dot: "bg-blue-500 animate-pulse" },
    STARTING_BROWSER: { label: "Khởi động Browser", bg: "bg-sky-50 border-sky-200", text: "text-sky-700", dot: "bg-sky-500 animate-pulse" },
    CHECKING_ACCOUNT: { label: "Kiểm tra Google Session", bg: "bg-indigo-50 border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-500 animate-pulse" },
    OPENING_FLOW: { label: "Mở Google Flow", bg: "bg-violet-50 border-violet-200", text: "text-violet-700", dot: "bg-violet-500 animate-pulse" },
    SUBMITTING: { label: "Đang gửi Prompt", bg: "bg-amber-50 border-amber-200", text: "text-amber-700", dot: "bg-amber-500 animate-pulse" },
    GENERATING: { label: "Flow Veo đang Render", bg: "bg-amber-50 border-amber-200", text: "text-amber-700", dot: "bg-amber-500 animate-ping" },
    DOWNLOADING: { label: "Đang tải video MP4", bg: "bg-teal-50 border-teal-200", text: "text-teal-700", dot: "bg-teal-500 animate-pulse" },
    PROCESSING: { label: "Xử lý metadata & thumbnail", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500 animate-pulse" },
    COMPLETED: { label: "Hoàn tất (Đã có Video)", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
    FAILED: { label: "Thất bại", bg: "bg-rose-50 border-rose-200", text: "text-rose-700", dot: "bg-rose-500" },
    NEEDS_USER_ACTION: { label: "Cần thao tác thủ công", bg: "bg-orange-50 border-orange-200", text: "text-orange-700", dot: "bg-orange-500" },
    PLANNED: { label: "Chưa render", bg: "bg-slate-50 border-slate-200", text: "text-slate-600", dot: "bg-slate-400" },
    RUNNING: { label: "Đang render các cảnh", bg: "bg-amber-50 border-amber-200", text: "text-amber-700", dot: "bg-amber-500 animate-pulse" },
    ASSEMBLING: { label: "Đang ghép video", bg: "bg-violet-50 border-violet-200", text: "text-violet-700", dot: "bg-violet-500 animate-pulse" },
    CANCELLED: { label: "Đã hủy", bg: "bg-slate-100 border-slate-200", text: "text-slate-500", dot: "bg-slate-400" },
  };

  const item = map[status] || { label: status, bg: "bg-slate-50 border-slate-200", text: "text-slate-600", dot: "bg-slate-400" };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${item.bg} ${item.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${item.dot}`}></span>
      {item.label}
    </span>
  );
}
