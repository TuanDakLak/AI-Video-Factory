import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/ToastContext";
import { AuthFetchGuard } from "@/components/auth/AuthFetchGuard";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "AI Content Factory",
  description: "Internal AI Video Production & Content Management Studio",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  return (
    <html lang="vi">
      <body className="bg-slate-50 text-slate-800 antialiased min-h-screen">
        <ToastProvider>
          {user ? (
            <div className="flex min-h-screen">
              <AuthFetchGuard />
              <Sidebar user={{ name: user.name, email: user.email, role: user.role }} />
              <main className="flex-1 min-w-0 flex flex-col min-h-screen overflow-y-auto">
                {children}
              </main>
            </div>
          ) : (
            children
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
