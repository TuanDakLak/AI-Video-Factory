"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

interface CopyPromptButtonProps {
  prompt: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function CopyPromptButton({ prompt, className = "", size = "md" }: CopyPromptButtonProps) {
  const [copied, setCopied] = useState(false);
  const { success } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      success("Prompt copied.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      success("Prompt copied.");
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1.5",
    md: "px-3.5 py-2 text-sm gap-2",
    lg: "px-4 py-2.5 text-base gap-2.5 font-medium",
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center justify-center rounded-xl font-medium transition-all shadow-sm ${
        copied
          ? "bg-emerald-600 text-white border border-emerald-600"
          : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 active:scale-95"
      } ${sizeClasses[size]} ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-white" />
          <span>Đã sao chép!</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 text-slate-500" />
          <span>Copy Prompt</span>
        </>
      )}
    </button>
  );
}
