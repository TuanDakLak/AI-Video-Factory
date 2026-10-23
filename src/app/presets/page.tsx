import React from "react";
import PresetsClient from "@/components/presets/PresetsClient";

export const dynamic = "force-dynamic";

export default function PresetsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Kênh</h1>
        <p className="text-xs text-slate-500 mt-1">
          Mỗi kênh có phong cách, ngôn ngữ, hashtag, ảnh tham chiếu riêng và lịch sản xuất tự động.
        </p>
      </div>
      <PresetsClient />
    </div>
  );
}
