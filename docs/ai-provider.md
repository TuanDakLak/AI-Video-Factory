# 🤖 AI Provider Guide & Cost Control (Phase 2)

## 1. Tổng Quan về Gemini AI Provider

* **Mô hình sử dụng**: `gemini-2.0-flash` qua SDK `@google/generative-ai`.
* **Mục đích**: Chuyển đổi một chủ đề ngắn gọn (Topic) thành gói nội dung có cấu trúc chuẩn JSON gồm:
  * `title`: Tiêu đề video hấp dẫn.
  * `concept`: Ý tưởng hình ảnh cốt lõi.
  * `script`: Kịch bản phân cảnh / Lời bình ngắn.
  * `videoPrompt`: Prompt hình ảnh chi tiết bằng tiếng Anh tối ưu riêng cho mô hình Google Flow / Veo 3.1.
  * `description`: Đoạn mô tả / caption mạng xã hội.
  * `tags`: Danh sách thẻ hashtag.

---

## 2. Kiểm Soát Chi Phí & Bảo Mật (Cost Control & Security)

1. **Không gọi API tự động**: Không gọi Gemini khi tải trang hoặc khi người dùng đang gõ phím. Chỉ kích hoạt khi người dùng chủ động bấm nút **"Tạo Nội Dung với Gemini AI"**.
2. **Giới hạn số lần thử (Retry)**: Tối đa 1 lần retry nếu phản hồi JSON bị lỗi.
3. **Bảo mật Server-side**: Biến `GEMINI_API_KEY` chỉ tồn tại ở phía backend Node.js, không bao giờ gửi về phía trình duyệt người dùng.
4. **Phân biệt gói đăng ký**: Gói **Google AI Pro** trả phí hàng tháng để lấy Flow Credits **không tự động bao gồm quota Gemini API**. Bạn cần tạo Gemini API key riêng trên [Google AI Studio](https://aistudio.google.com/).

---

## 3. Chế Độ Không Dùng AI (Manual Mode)

Nếu không cài đặt `GEMINI_API_KEY`:
* Ứng dụng hiển thị thông báo trạng thái *"Chế độ thủ công"*.
* Bạn hoàn toàn có thể tự viết ý tưởng, kịch bản và prompt để tạo video trên Google Flow như bình thường.
