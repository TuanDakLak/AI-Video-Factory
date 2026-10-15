"use client";

import React, { useState } from "react";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";
import { useRouter } from "next/navigation";

interface DeleteVideoModalProps {
  videoId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DeleteVideoModal({ videoId, onClose, onSuccess }: DeleteVideoModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { success, error } = useToast();
  const router = useRouter();

  if (!videoId) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Không thể xóa video.");
      }

      success("Đã xóa video thành công.");
      onClose();
      if (onSuccess) onSuccess();
      router.refresh();
    } catch (err: any) {
      error(err?.message || "Lỗi khi xóa video.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Xóa Video này?</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hành động này sẽ xóa vĩnh viễn file MP4 trong storage và bản ghi trong thư viện.
            </p>
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleDelete}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xóa...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xác nhận xóa</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
