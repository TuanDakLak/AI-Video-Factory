# 🎬 AI Video Factory

Tự động làm video dài (30 / 60 / 90 giây) từ các clip ~10 giây của **Google Flow (Veo 3.1)**, rồi đăng lên **TikTok** và **Facebook Reels**.

- **Thủ công:** nhập ý tưởng → Flow Agent chia thành các clip trong **một** project Flow → hệ thống tải về, ghép thành một video dài. Chỉ giữ video dài.
- **Tự động:** mỗi kênh tự tìm chủ đề (nguồn miễn phí) → bạn chỉ duyệt / xoá chủ đề → hệ thống viết kịch bản theo thể loại, render, ghép và đăng.

Chủ đề bị xoá được giữ lại để không bao giờ được đề xuất hay sản xuất lại.

Chi tiết kiến trúc: [docs/architecture.md](docs/architecture.md). Phân tích pipeline, chi phí và các quyết định: [docs/automation-pipeline.md](docs/automation-pipeline.md).

---

## Luồng chính

```
Kênh (phong cách, ngôn ngữ, thể loại, độ dài, lịch, ngân sách, nơi đăng)
  │
  ├─ Tìm chủ đề: Google News RSS + Google Trends RSS + Wikipedia pageviews ─► 1 lệnh Gemini chọn & viết góc khai thác
  ▼
Hộp chủ đề  SUGGESTED ──(hết thời gian duyệt / bấm duyệt)──► APPROVED      (xoá = REJECTED, không bao giờ làm lại)
  │
  ├─ Lịch sản xuất (worker, mỗi phút): video/ngày, ngân sách credit, 1 video/kênh một lúc, Flow còn khoẻ
  ▼
Kịch bản (Gemini, theo khung thể loại) ─► Video (Sequence) ─► Flow Agent: 1 brief ─► duyệt "N video / X tín dụng"
  ─► N clip trong 1 project ─► tải từng clip (đọc "Scene k") ─► ffmpeg ghép, cân âm -14 LUFS ─► xoá clip 10s
  ▼
Đăng bài: TikTok Direct Post / Facebook Page Reels (token mã hoá AES-256-GCM)
```

Tự phục hồi: job mất trước khi gửi → chạy lại; sau khi đã tốn credit → khôi phục clip từ project Flow (0 credit), không bao giờ render lại mù quáng.

---

## Chạy dự án

Yêu cầu: Node.js 20+, Docker Desktop, ffmpeg/ffprobe trong PATH (hoặc `FFMPEG_PATH` / `FFPROBE_PATH`).

```bash
npm install
```

```bash
npx playwright install chromium
```

Tạo `.env` từ `.env.example`. Bắt buộc: `AUTH_SECRET` (`openssl rand -base64 48`). Nên có: `GEMINI_API_KEY` (key Google AI Studio miễn phí).

```bash
npm run db:setup
```

Hai tiến trình chạy song song:

```bash
npm run dev
```

```bash
npm run worker
```

Mở http://localhost:3000, đăng ký tài khoản (người đầu tiên là ADMIN), vào **Cài đặt** → thêm và kết nối tài khoản Google có Flow.

### Kiểm tra

```bash
npm test
```

Test cần Postgres và Redis đang chạy. Test không bao giờ gọi Flow hay LLM trả phí.

```bash
npm run flow:health
```

Kiểm tra giao diện Flow (đăng nhập, số dư, ô nhập, nút "+", cài đặt Agent…). Không tốn credit.

---

## Trang

| Trang | Dùng để |
|---|---|
| Bảng điều khiển | Chủ đề chờ duyệt, đang sản xuất, video xong, đã đăng, credit hôm nay, việc cần xử lý |
| Chủ đề | Hộp chủ đề của từng kênh: duyệt, xoá, thêm tay, tìm chủ đề ngay |
| Kênh | Phong cách, ảnh tham chiếu, tự động hoá, đăng bài |
| Tạo video | Video thủ công; chi tiết từng video (chạy thử 0 credit, khôi phục clip, ghép lại) |
| Thư viện | Video dài đã xong; xem, tải, đăng |
| Cài đặt | Bảo mật đăng nhập, tài khoản Google (Flow), TikTok / Facebook |

---

## Script

| Lệnh | Việc |
|---|---|
| `npm run user:create` | Tạo người dùng từ dòng lệnh |
| `npm run flow:health` | Kiểm tra giao diện Flow (0 credit) |
| `npx tsx src/scripts/inspect-sequences.ts` | Xem nhanh trạng thái các video gần đây |
| `npx tsx src/scripts/recover-sequence.ts <id>` | Khôi phục clip của một video từ project Flow |
| `npx tsx src/scripts/probe-editor.ts` | Dò DOM trình chỉnh sửa Flow khi Google đổi giao diện |

---

## API tự động hoá

`POST /api/automation/topics` thêm chủ đề vào hộp chủ đề của một kênh. Có thể gọi khi đã đăng nhập, hoặc từ bộ lập lịch ngoài với header `x-api-key: AUTOMATION_API_KEY`; khi đó lệnh chạy với quyền của `AUTOMATION_OWNER_EMAIL`.

```json
{ "channelId": "…", "topics": [{ "title": "Sự tích cây vú sữa", "durationSec": 60 }], "approved": false }
```

Chủ đề trùng với chủ đề cũ (kể cả chủ đề đã xoá) bị bỏ qua. `GET /api/automation/topics?channelId=…` trả trạng thái chủ đề và video.

---

## Bảo mật

- Access JWT 10 phút + refresh token xoay vòng theo họ (phát hiện token bị đánh cắp), argon2id, CSRF theo Origin, giới hạn tần suất.
- Mỗi người dùng chỉ thấy dữ liệu của mình (kênh, chủ đề, video, tài khoản Google / mạng xã hội).
- Hồ sơ trình duyệt Google, `.env`, `storage/`, `data/` không bao giờ được commit.
