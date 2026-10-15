import React from "react";
import PresetsClient from "@/components/presets/PresetsClient";

export const dynamic = "force-dynamic";

export default function PresetsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Preset kênh</h1>
        <p className="text-xs text-slate-500 mt-1">
          Cố định phong cách, ngôn ngữ, hashtag và tối đa 3 ảnh tham chiếu cho từng kênh. Video tự động (hot-trend) dùng preset để luôn nhất quán.
        </p>
      </div>
      <PresetsClient />
    </div>
  );
}
