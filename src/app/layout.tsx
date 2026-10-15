import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/ToastContext";

export const metadata: Metadata = {
  title: "AI Content Factory",
  description: "Internal AI Video Production & Content Management Studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="bg-slate-50 text-slate-800 antialiased min-h-screen">
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-y-auto">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
