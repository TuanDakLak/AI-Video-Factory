"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  Sparkles,
  Film,
  Video,
  Settings,
  Layers,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    {
      name: "Bảng điều khiển",
      href: "/dashboard",
      icon: LayoutDashboard,
      active: pathname === "/dashboard" || pathname === "/",
    },
    {
      name: "Dự án",
      href: "/projects",
      icon: FolderKanban,
      active: pathname.startsWith("/projects"),
    },
    {
      name: "Ý tưởng & Kịch bản",
      href: "/contents",
      icon: FileText,
      active: pathname.startsWith("/contents"),
    },
    {
      name: "Lệnh tạo video",
      href: "/generations",
      icon: Sparkles,
      active: pathname.startsWith("/generations"),
    },
    {
      name: "Video nhiều cảnh",
      href: "/sequences",
      icon: Layers,
      active: pathname.startsWith("/sequences"),
    },
    {
      name: "Preset kênh",
      href: "/presets",
      icon: Settings,
      active: pathname.startsWith("/presets"),
    },
    {
      name: "Thư viện Video",
      href: "/videos",
      icon: Film,
      active: pathname.startsWith("/videos"),
    },
    {
      name: "Cài đặt & Tài khoản",
      href: "/settings",
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-screen">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-slate-100 gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
          <Video className="w-4 h-4" />
        </div>
        <div>
          <h1 className="font-semibold text-slate-800 text-sm tracking-tight">AI Content Factory</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 space-y-1.5 flex-1">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
          Menu chính
        </div>
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                link.active
                  ? "bg-emerald-50 text-emerald-800 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  link.active ? "text-emerald-600" : "text-slate-400"
                }`}
              />
              <span>{link.name}</span>
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
