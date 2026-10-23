"use client";

import React, { useState } from "react";
import {
  UserCheck,
  AlertCircle,
  Plus,
  Trash2,
  Loader2,
  ExternalLink,
  RefreshCw,
  PowerOff,
  Coins,
  Lock,
  Globe,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastContext";

interface GoogleAccountItem {
  id: string;
  name: string;
  label: string;
  profileDir: string;
  email?: string | null;
  status: "NOT_CONNECTED" | "CONNECTING" | "CONNECTED" | "EXPIRED" | "ERROR" | "DISABLED";
  lockStatus: "AVAILABLE" | "IN_USE" | "DISABLED";
  lastKnownFlowCredits?: number | null;
  lastCreditCheckAt?: string | null;
  lastConnectedAt?: string | null;
  notes?: string | null;
  _count?: { generations: number };
}

interface SettingsClientProps {
  initialAccounts: GoogleAccountItem[];
}

export default function SettingsClient({
  initialAccounts,
}: SettingsClientProps) {
  const [accounts, setAccounts] = useState<GoogleAccountItem[]>(initialAccounts);
  const [showAddForm, setShowAddForm] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Connect Modal state
  const [activeConnectAccount, setActiveConnectAccount] = useState<GoogleAccountItem | null>(null);

  const { success, error, info } = useToast();

  const handleLaunchConnect = async (account: GoogleAccountItem) => {
    setActiveConnectAccount(null);
    setConnectingId(account.id);
    info(`Đang mở trình duyệt đăng nhập Google cho "${account.name}". Hãy đăng nhập trên cửa sổ bật lên...`);

    try {
      const res = await fetch(`/api/google-accounts/${account.id}/connect`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Không thể hoàn tất kết nối tài khoản Google.");
      }

      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === account.id
            ? {
                ...acc,
                status: "CONNECTED",
                lastKnownFlowCredits: data.credits ?? acc.lastKnownFlowCredits,
                lastConnectedAt: new Date().toISOString(),
                lastCreditCheckAt: new Date().toISOString(),
              }
            : acc
        )
      );
      success(data.message || `Đã kết nối thành công tài khoản "${account.name}"!`);
    } catch (err: any) {
      error(err?.message || "Lỗi khi kết nối Google Flow.");
      // Refresh status
      setAccounts((prev) =>
        prev.map((acc) => (acc.id === account.id ? { ...acc, status: "ERROR" } : acc))
      );
    } finally {
      setConnectingId(null);
    }
  };

  const handleTestConnection = async (account: GoogleAccountItem) => {
    setTestingId(account.id);
    try {
      const res = await fetch(`/api/google-accounts/${account.id}/test`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Kiểm tra kết nối thất bại.");
      }

      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === account.id
            ? {
                ...acc,
                status: data.status,
                lastKnownFlowCredits: data.credits ?? acc.lastKnownFlowCredits,
                lastCreditCheckAt: new Date().toISOString(),
              }
            : acc
        )
      );

      if (data.status === "CONNECTED") {
        success(`Tài khoản "${account.name}" kết nối tốt! ${data.credits ? `(Flow credits: ${data.credits})` : ""}`);
      } else {
        error(`Tài khoản "${account.name}": ${data.message}`);
      }
    } catch (err: any) {
      error(err?.message || "Lỗi kiểm tra kết nối.");
    } finally {
      setTestingId(null);
    }
  };

  const handleDisconnect = async (account: GoogleAccountItem) => {
    if (!confirm(`Bạn có chắc muốn ngắt kết nối session cho "${account.name}"?`)) return;

    setDisconnectingId(account.id);
    try {
      const res = await fetch(`/api/google-accounts/${account.id}/disconnect`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Lỗi ngắt kết nối.");

      setAccounts((prev) =>
        prev.map((acc) =>
          acc.id === account.id
            ? { ...acc, status: "NOT_CONNECTED", lastKnownFlowCredits: null }
            : acc
        )
      );
      success(`Đã ngắt kết nối "${account.name}".`);
    } catch (err: any) {
      error(err?.message || "Lỗi ngắt kết nối.");
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !label.trim()) {
      error("Vui lòng nhập Tên và Nhãn tài khoản.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/google-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          label: label.trim(),
          email: gEmail.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Không thể thêm tài khoản.");
      const created = await res.json();
      setAccounts((prev) => [...prev, created]);
      setName("");
      setLabel("");
      setGEmail("");
      setNotes("");
      setShowAddForm(false);
      success(`Đã thêm "${created.name}". Hãy nhấn "Kết Nối" để đăng nhập.`);
    } catch (err: any) {
      error(err?.message || "Lỗi khi thêm tài khoản.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAccount = async (id: string, accName: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa "${accName}" khỏi danh sách theo dõi?`)) return;

    try {
      const res = await fetch(`/api/google-accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Không thể xóa tài khoản.");
      setAccounts((prev) => prev.filter((acc) => acc.id !== id));
      success(`Đã xóa tài khoản "${accName}".`);
    } catch (err: any) {
      error(err?.message || "Lỗi khi xóa.");
    }
  };

  const getStatusBadge = (status: GoogleAccountItem["status"], lock: GoogleAccountItem["lockStatus"]) => {
    if (lock === "IN_USE") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
          <Lock className="w-3 h-3" />
          <span>ĐANG BẬN RENDER</span>
        </span>
      );
    }

    switch (status) {
      case "CONNECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>CONNECTED</span>
          </span>
        );
      case "CONNECTING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>CONNECTING...</span>
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="w-3 h-3" />
            <span>EXPIRED (HẾT HẠN)</span>
          </span>
        );
      case "ERROR":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle className="w-3 h-3" />
            <span>ERROR</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <span>NOT_CONNECTED</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Connect Modal */}
      {activeConnectAccount && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Kết Nối Google Flow: {activeConnectAccount.name}
                </h3>
                <p className="text-xs text-slate-400">Profile: {activeConnectAccount.profileDir}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-3 leading-relaxed">
              <p className="font-semibold text-slate-800">Quy trình đăng nhập bảo mật:</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-slate-600">
                <li>Khi nhấn <strong>&quot;Khởi Chạy Trình Duyệt&quot;</strong>, một cửa sổ Chromium sẽ mở ra trang Google Flow.</li>
                <li>Bạn tự đăng nhập tài khoản Google của mình và hoàn thành các bước xác thực 2FA/CAPTCHA thông thường.</li>
                <li>Sau khi vào được giao diện Flow, hệ thống sẽ tự động phát hiện phiên đăng nhập và lưu profile cục bộ an toàn.</li>
                <li><strong>Hệ thống tuyệt đối KHÔNG lưu mật khẩu</strong> vào database hay gửi lên cloud.</li>
              </ol>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveConnectAccount(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleLaunchConnect(activeConnectAccount)}
                className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl shadow-sm transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Khởi Chạy Trình Duyệt Đăng Nhập</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Google Accounts Persistent Session Section */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Tài khoản Google Flow ({accounts.length})
              </h3>
              <p className="text-xs text-slate-400">
                Đăng nhập Google Flow và theo dõi số dư credit.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddForm ? "Đóng Form" : "Thêm Tài Khoản Mới"}</span>
          </button>
        </div>

        {/* Add Account Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddAccount}
            className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 animate-in fade-in duration-150"
          >
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Thêm tài khoản Google AI Pro mới
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Tên hiển thị *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Google Pro C"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Nhãn mô tả *</label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="VD: Tài khoản 3 (1000 credits/tháng)"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Email Google</label>
                <input
                  type="email"
                  value={gEmail}
                  onChange={(e) => setGEmail(e.target.value)}
                  placeholder="VD: ten@gmail.com (điền sẵn khi kết nối)"
                  maxLength={254}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700">Ghi chú thêm</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: Dùng riêng cho kênh Short Film viễn tưởng..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-1.5 rounded-xl shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>Thêm</span>
              </button>
            </div>
          </form>
        )}

        {/* Accounts List Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="bg-slate-50/70 border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-4 hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <span>{acc.name}</span>
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">{acc.label}</p>
                    {acc.email && acc.email !== acc.name && <p className="text-[11px] text-slate-400 mt-0.5">{acc.email}</p>}
                  </div>
                  {getStatusBadge(acc.status, acc.lockStatus)}
                </div>

                {/* Credits and Profile Info Card */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Coins className="w-3.5 h-3.5 text-amber-500" />
                      <span>Số dư Flow credits:</span>
                    </span>
                    <span className="font-bold text-slate-900">
                      {acc.lastKnownFlowCredits !== null && acc.lastKnownFlowCredits !== undefined ? (
                        <span className="text-emerald-600 font-mono">{acc.lastKnownFlowCredits} credits</span>
                      ) : (
                        <span className="text-slate-400 italic">Chưa đọc từ UI</span>
                      )}
                    </span>
                  </div>

                  {acc.lastCreditCheckAt && (
                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                      <span>Cập nhật lúc:</span>
                      <span>{new Date(acc.lastCreditCheckAt).toLocaleTimeString("vi-VN")}</span>
                    </div>
                  )}
                </div>

                {acc.notes && <p className="text-[11px] text-slate-400 italic">{acc.notes}</p>}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {acc.status === "CONNECTED" ? (
                    <>
                      <button
                        type="button"
                        disabled={testingId === acc.id}
                        onClick={() => handleTestConnection(acc)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm transition-all disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${testingId === acc.id ? "animate-spin" : ""}`} />
                        <span>Kiểm Tra</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveConnectAccount(acc)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-sm transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Mở Lại</span>
                      </button>

                      <button
                        type="button"
                        disabled={disconnectingId === acc.id}
                        onClick={() => handleDisconnect(acc)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Ngắt kết nối"
                      >
                        <PowerOff className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={connectingId === acc.id}
                      onClick={() => setActiveConnectAccount(acc)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                    >
                      {connectingId === acc.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                      <span>{acc.status === "EXPIRED" ? "Kết Nối Lại (Reconnect)" : "Kết Nối Google Flow"}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteAccount(acc.id, acc.name)}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                  title="Xóa tài khoản"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
