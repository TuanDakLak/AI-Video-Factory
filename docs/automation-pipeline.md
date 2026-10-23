# Pipeline tự động: từ chủ đề đến video (phân tích & lộ trình)

Mục tiêu: hệ thống tự tìm chủ đề → tự viết kịch bản theo thể loại → tự render trên Flow → tự ghép → (sau này) tự đăng.
Người dùng chỉ vào **Hộp chủ đề**, xoá chủ đề dở; chủ đề còn lại tự được sản xuất khi tới giờ.

## 1. Luồng hiện tại (10/2026)

```
Người dùng nhập brief ─► Sequence (FLOW_AGENT, N = tổng / 10s) ─► worker mở Flow ─► gửi 1 brief cho Flow Agent
   ─► Agent đề xuất "N video / X tín dụng" ─► tool tự Phê duyệt (trong trần) ─► N clip trong 1 project
   ─► tải từng clip (đọc "Scene k" ở nhật ký clip) ─► ffmpeg nối ─► 1 video dài, xoá clip 10s
Automation: POST /api/automation/videos {topics[]} ─► mỗi topic 1 video, chạy ngay
```

## 2. Vấn đề (đánh số để xử lý lần lượt)

### A. Chất lượng nội dung theo thể loại
| # | Vấn đề | Hậu quả |
|---|---|---|
| A1 | Thể loại (`Project.contentType`) không được dùng ở bất kỳ prompt nào | Phim ngắn, video giải trí, tài liệu… đều ra cùng một kiểu |
| A2 | Gửi nguyên câu chủ đề thô cho Flow Agent, không có kịch bản | Agent tự bịa, cốt truyện ngẫu nhiên, hay hỏi lại |
| A3 | Ngôn ngữ lời thoại/thuyết minh không được truyền (video báo đốm ra tiếng Anh) | Không hợp khán giả Việt |
| A4 | Chế độ FLOW_AGENT không sinh tiêu đề/caption/hashtag | Gói đăng bài rỗng → không tự đăng được |
| A5 | Âm thanh: mỗi clip có lời riêng, nối cứng bị cắt giữa câu, to nhỏ không đều | Video nghe "đứt đoạn" |

### B. Tự động hoá
| # | Vấn đề |
|---|---|
| B1 | Không có kho chủ đề, không có bước duyệt: topic gửi vào là chạy ngay |
| B2 | Không tự tìm chủ đề (xu hướng, tin nóng) và không chống trùng |
| B3 | Không có lịch/hạn mức: số video/ngày, khung giờ; `FLOW_DAILY_CREDIT_BUDGET=0` (không giới hạn) là nguy hiểm khi chạy tự động |
| B4 | "Preset kênh" lưu trong file JSON: worker và web cùng ghi → dễ hỏng khi chạy nền |

### C. Độ ổn định
| # | Vấn đề |
|---|---|
| C1 | Job "ma": generation QUEUED từ 07/10 vẫn treo; worker chết giữa chừng có thể để tài khoản kẹt IN_USE |
| C2 | Lỗi → video dừng ở NEEDS_USER_ACTION, automation đứng chờ người |
| C3 | Kiểm tra giao diện Flow định kỳ đang tắt; Flow đổi UI là hỏng hàng loạt |
| C4 | Chọn tài khoản Google "cái đầu tiên rảnh", không theo số credit còn lại |

### D. Giao diện
| # | Vấn đề |
|---|---|
| D1 | Nút độ dài nhanh 16/32/48s không khớp clip 10s |

### E. Đăng bài (giai đoạn sau)
TikTok, Facebook Reels: OAuth từng kênh, gói đăng bài, nhãn nội dung AI.

## 3. Thiết kế mục tiêu

```
          ┌──────────── Nghiên cứu (hằng ngày / kênh) ─────────────┐
          │ Google Trends VN + LLM brainstorm theo ngách của kênh   │
          │ chống trùng (kể cả topic đã bị xoá)                     │
          └───────────────┬─────────────────────────────────────────┘
                          ▼
  Hộp chủ đề (Topic)  SUGGESTED ──(hết thời gian duyệt / bấm Duyệt)──► APPROVED
        ▲ người dùng xoá ─► REJECTED (giữ lại để không gợi ý lại)
                          ▼ Lịch kênh: N video/ngày, khung giờ, ngân sách credit
                       PRODUCING: LLM viết kịch bản theo thể loại (beat từng clip, lời thoại tiếng Việt,
                                  tiêu đề, caption, hashtag) ─► Sequence ─► Flow ─► ghép
                          ▼
                       READY (video xong) ─► (sau) PUBLISHED
                       FAILED (đã thử khôi phục 0 credit) ─► báo webhook
```

- **Kênh** (DB): bản sắc (style, ngôn ngữ, hashtag, ảnh tham chiếu) + cấu hình tự động (ngách/chủ đề, thể loại, độ dài, số video/ngày, thời gian duyệt, khung giờ).
- **Mẫu thể loại**: phim ngắn, giải trí/hài, tài liệu/kiến thức, top-list, quảng cáo sản phẩm, kể chuyện, ASMR/thư giãn. Mỗi mẫu quy định cấu trúc beat, nhịp, cách mở đầu (hook 2 giây đầu), kết, thuyết minh.

## 4. Lộ trình

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| P1 | Kênh trong DB (B4), mẫu thể loại + LLM viết kịch bản/metadata (A1–A4), Hộp chủ đề + duyệt (B1), lịch & hạn mức (B3), độ dài 30/60/90 (D1) | xong (chờ chạy thử end-to-end với LLM có credit) |
| P2 | Tự nghiên cứu chủ đề + chống trùng (B2) | xong |
| P3 | Dọn job ma, tự khôi phục, health-check định kỳ, chọn tài khoản theo credit (C1–C4) | xong |
| P4 | Âm thanh: chuẩn hoá loudness, nối mượt (A5) | xong |
| P5 | Đăng TikTok / Facebook Reels (E) | |

## 5. Ghi chú khi làm P1

- 7 mẫu thể loại ở `src/lib/content/genres.ts`; kịch bản ở `src/lib/content/script-writer.ts`; hộp chủ đề + lịch ở `src/lib/automation/topics.ts` (worker gọi mỗi `AUTOMATION_TICK_SEC`, mặc định 60s).
- LLM lỗi (hết tiền, timeout) không làm dừng automation: Flow Agent tự lên kịch bản từ chủ đề + cấu trúc thể loại, chủ đề ghi "Lưu ý: …".
- Phát hiện: worker chỉ có biến môi trường nhờ Prisma nạp `.env` khi kết nối DB → nay nạp tường minh (`src/lib/load-env.ts`).
- Phát hiện: Flow Agent trước đây không bao giờ nhận ngôn ngữ lời thoại (tham số có nhưng không được truyền).

## 6. P2: tự tìm chủ đề (nguồn miễn phí)

| Nguồn | Dùng để | Ghi chú |
|---|---|---|
| Google News RSS search | Tin 7 ngày qua theo các cụm từ trong "ngách" của kênh | nhanh (<1s), tiếng Việt tốt |
| Google Trends RSS (`/trending/rss?geo=VN`) | Từ khoá đang được tìm nhiều hôm nay | ~10–20 mục |
| Wikipedia Pageviews (`vi`) | Bài được đọc nhiều hôm qua (lịch sử, khoa học, nhân vật…) | lọc trang chính/nhạy cảm |
| ~~GDELT DOC 2.0~~ | đã thử, bỏ | không tìm được từ khoá tiếng Việt có dấu, hay 429 |

Gemini (free tier) chọn chủ đề hợp ngách, viết tiêu đề + góc khai thác, gán thể loại/độ dài, chấm điểm, chỉ được trích URL có trong tín hiệu.
Chống trùng 2 lớp: gửi danh sách chủ đề cũ (kể cả đã xoá) cho LLM + so khớp tiêu đề. Chạy khi hộp chủ đề < 3 ngày sản xuất, tối đa 6 giờ/lần/kênh, 1 kênh mỗi lượt.
Gemini quá tải (503/429): thử lại sau 2s, 6s rồi chuyển `gemini-2.5-flash-lite`.

## 7. Chi phí API (đo thực tế, 10/2026)

| Lệnh gọi | Token vào / ra (gồm "thinking") | Giá nếu trả phí (gemini-2.5-flash: $0.30 / $2.50 mỗi 1M) |
|---|---|---|
| Kịch bản 30s | ~530 / ~1.000 | ~$0.003 |
| Kịch bản 90s | ~690 / ~2.000 | ~$0.0053 |
| 1 lượt tìm chủ đề (5 chủ đề) | ~8.000–9.000 / ~1.000–1.300 | ~$0.006 |

5 video 90s/ngày ≈ 5 kịch bản + 1–2 lượt tìm chủ đề ≈ 7 lệnh gọi ≈ **$0.04–0.05/ngày (~1.000–1.300đ), ~$1.5/tháng** nếu trả phí;
**$0 trên free tier** (7 lệnh/ngày, xa dưới hạn mức hằng ngày). Rủi ro tiền thật duy nhất là Veo API dự phòng (`VIDEO_FALLBACK_TO_API`, ~$0.10/giây video) — đang tắt.

## 8. P3: tự phục hồi

| Tình huống | Hệ thống tự làm |
|---|---|
| Worker chết / khởi động lại khi có job | Job chưa gửi prompt → FAILED (chạy lại được, chưa tốn credit). Job đã gửi → NEEDS_USER_ACTION (khôi phục clip) |
| Tài khoản Google kẹt IN_USE | Mở khoá khi worker khởi động, hoặc khi kẹt > 15 phút mà không có job nào chạy |
| Video dừng, **chưa tốn credit** | Tự chạy lại 1 lần |
| Video dừng, **đã tốn credit** (chế độ Flow Agent) | Tự "khôi phục clip từ Flow" 1 lần (0 credit), không render lại |
| Vẫn hỏng | Chủ đề → Lỗi + webhook `topic.failed` |
| Giao diện Flow đổi | Kiểm tra UI mỗi 24h cho tài khoản kênh tự động dùng (0 credit); nếu mọi tài khoản lỗi → tạm dừng sản xuất tới khi lần kiểm tra sau ổn |
| Nhiều tài khoản | Ưu tiên tài khoản còn nhiều credit nhất |

## 9. P4: âm thanh

- Mỗi clip được đưa về **-14 LUFS, true peak -1.5 dBTP** (EBU R128 `loudnorm`), mức TikTok / Reels / Shorts phát.
  Đo thử: 2 clip chênh 29 LU → sau ghép lệch 0.0 LU. Video báo đốm cũ: các đoạn -16.0 đến -17.7 LUFS, cả video -16.6 (nhỏ hơn chuẩn 2.6 dB).
- Âm thanh mỗi clip được cắt/đệm đúng bằng độ dài hình: clip AI có tiếng ngắn hơn hình không còn làm lệch tiếng các clip sau.
- Fade 30 ms / 80 ms ở mỗi chỗ cắt thẳng: hết tiếng "bụp" khi nối.
- Tắt bằng `AUDIO_NORMALIZE=false`.
- Chưa làm: nhạc nền (cần thư viện nhạc có bản quyền), phụ đề.
