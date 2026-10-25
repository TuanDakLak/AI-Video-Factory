import React from "react";
import type { Metadata } from "next";
import { LegalPage, contactLine } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Chính sách quyền riêng tư — AI Video Factory" };

/** Public privacy policy + data deletion instructions (the URLs Meta / TikTok ask for before an app can go live). */
export default function PrivacyPage() {
  return (
    <LegalPage title="Chính sách quyền riêng tư (Privacy Policy)" updated="25/10/2026">
      <p>
        AI Video Factory là công cụ nội bộ giúp chủ kênh tạo video ngắn bằng AI và đăng lên <b>chính các trang / tài khoản của họ</b> trên
        Facebook và TikTok. Ứng dụng không bán, không chia sẻ dữ liệu cho bên thứ ba và không dùng dữ liệu để quảng cáo.
      </p>

      <h2>1. Dữ liệu chúng tôi lưu</h2>
      <ul>
        <li>Tài khoản đăng nhập: email, tên hiển thị, mật khẩu đã băm (argon2id) hoặc liên kết đăng nhập Google.</li>
        <li>Facebook: ID và tên các Trang bạn chọn, mã truy cập Trang (được mã hoá AES-256-GCM khi lưu).</li>
        <li>TikTok: open_id, tên hiển thị, mã truy cập / làm mới (được mã hoá khi lưu).</li>
        <li>Nội dung bạn tạo: chủ đề, kịch bản, video, caption, hashtag và trạng thái các bài đăng.</li>
      </ul>

      <h2>2. Chúng tôi dùng dữ liệu để làm gì</h2>
      <ul>
        <li>Đăng video bạn tạo lên Trang Facebook / tài khoản TikTok mà chính bạn đã kết nối và chọn.</li>
        <li>Hiển thị trạng thái và đường dẫn bài đăng trong ứng dụng.</li>
      </ul>
      <p>
        Quyền Facebook được dùng: <code>pages_show_list</code> (liệt kê Trang bạn quản lý), <code>pages_read_engagement</code> và{" "}
        <code>pages_manage_posts</code> (đăng Reels lên Trang). Quyền TikTok: <code>user.info.basic</code>, <code>video.publish</code>.
      </p>

      <h2>3. Lưu trữ và bảo mật</h2>
      <p>
        Dữ liệu nằm trên máy chủ do chủ kênh tự vận hành. Mã truy cập luôn được mã hoá; phiên đăng nhập dùng cookie HttpOnly. Chỉ chủ tài khoản
        mới xem được dữ liệu của mình.
      </p>

      <h2 id="data-deletion">4. Xoá dữ liệu (Data deletion instructions)</h2>
      <ul>
        <li>Vào <b>Cài đặt → Mạng xã hội</b>, bấm biểu tượng thùng rác cạnh tài khoản: mã truy cập của tài khoản đó bị xoá ngay.</li>
        <li>
          Facebook: vào <b>Cài đặt &amp; quyền riêng tư → Cài đặt → Tiện ích tích hợp cho doanh nghiệp</b> (Business integrations), gỡ
          &quot;AI Video Factory&quot;.
        </li>
        <li>Xoá toàn bộ tài khoản và dữ liệu: liên hệ {contactLine()}. Yêu cầu được xử lý trong vòng 30 ngày.</li>
      </ul>

      <h2>5. Liên hệ</h2>
      <p>Mọi câu hỏi về quyền riêng tư: {contactLine()}.</p>

      <hr className="border-slate-200" />
      <p className="text-xs text-slate-500">
        <b>English summary.</b> AI Video Factory is an internal tool that lets channel owners publish AI-generated short videos to their own
        Facebook Pages and TikTok accounts. We store login details, the Pages / accounts you connect and their access tokens (encrypted at
        rest), and the content you create, only to publish it where you choose. We never sell or share data and use no advertising tracking.
        To delete your data: disconnect the account under Settings → Social accounts (tokens are deleted immediately), remove the app in
        Facebook&apos;s Business integrations settings, or contact us to delete your whole account within 30 days.
      </p>
    </LegalPage>
  );
}
