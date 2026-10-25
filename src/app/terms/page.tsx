import React from "react";
import type { Metadata } from "next";
import { LegalPage, contactLine } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Điều khoản sử dụng — AI Video Factory" };

export default function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng (Terms of Service)" updated="25/10/2026">
      <ul>
        <li>AI Video Factory là công cụ nội bộ để tạo video ngắn bằng AI và đăng lên Trang / tài khoản mà chính người dùng sở hữu hoặc quản lý.</li>
        <li>Người dùng chịu trách nhiệm về nội dung đăng tải và phải tuân thủ Tiêu chuẩn cộng đồng của Facebook và TikTok.</li>
        <li>Video do AI tạo được gắn nhãn &quot;Nội dung do AI tạo&quot; khi nền tảng hỗ trợ.</li>
        <li>Không dùng công cụ để mạo danh người thật, phát tán thông tin sai lệch, nội dung bạo lực, thù ghét hoặc vi phạm bản quyền.</li>
        <li>Ứng dụng được cung cấp &quot;nguyên trạng&quot;; chúng tôi có thể thay đổi hoặc ngừng tính năng bất cứ lúc nào.</li>
        <li>Liên hệ: {contactLine()}.</li>
      </ul>
      <hr className="border-slate-200" />
      <p className="text-xs text-slate-500">
        <b>English summary.</b> AI Video Factory is an internal tool for creating AI short videos and publishing them to Pages / accounts the
        user owns or manages. Users are responsible for what they publish and must follow Facebook and TikTok community standards. AI-generated
        videos are labelled as such where supported. The service is provided as is.
      </p>
    </LegalPage>
  );
}
