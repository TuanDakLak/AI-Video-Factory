# Hướng Dẫn Tích Hợp Google Flow Automation (Phase 3)

## 1. Tổng Quan Kiến Trúc (Architecture)

Hệ thống **AI Content Factory (Phase 3)** nâng cấp quy trình làm việc từ thủ công sang tự động hóa có kiểm soát bằng **Playwright Persistent Context** kết hợp hàng đợi **BullMQ + Redis**.

```
Next.js Web App
   │  (Tạo Generation Job)
   ▼
PostgreSQL Database
   │
   ▼
BullMQ Queue (Redis Port 6389)
   │
   ▼
Automation Worker (Playwright)
   │
   ├── Persistent Browser Profile (data/browser-profiles/account-a)
   │      └── Google AI Pro Session (1.000 Monthly + 50 Daily Credits)
   │
   ├── Google Flow (Labs / VideoFX)
   │      └── Submit Prompt ➔ Veo 3.1 Render (Trừ credits thật từ Google)
   │
   ├── Download Result (.mp4) ➔ tmp/generations/{id}/
   │
   ├── VideoProcessor (FFprobe + Metadata + Thumbnail)
   │
   ▼
VideoAsset ➔ Storage (./storage/projects/) ➔ Video Library UI
```

---

## 2. Nguyên Tắc Bảo Mật & Chi Phí (Security & Credits Policy)

1. **Credits Thật của Google Flow**:
   - Hệ thống **tuyệt đối không tạo balance giả** trong database.
   - Flow credits được trừ trực tiếp bởi Google khi chạy trên session hợp lệ của tài khoản.
   - Số dư hiển thị trên giao diện là giá trị đọc trực tiếp từ UI Google Flow (`lastKnownFlowCredits`).

2. **Phân Định Rõ Ràng API Key & Flow Credits**:
   - `GEMINI_API_KEY`: Dùng riêng cho Gemini 2.0 Flash để sinh kịch bản / video prompt (Google AI Studio).
   - **Google AI Pro Subscription**: Cung cấp credits trên Google Flow/Veo web interface, độc lập hoàn toàn với Gemini API.

3. **Bảo Mật Persistent Browser Profile**:
   - Thư mục `data/browser-profiles/` được đưa vào `.gitignore`.
   - Hệ thống **không bao giờ lưu mật khẩu, session token hay authorization headers** vào database hay gửi lên cloud.
   - Người dùng tự đăng nhập Google lần đầu trên cửa sổ trình duyệt Chromium tương tác thật.

---

## 3. Hướng Dẫn Kết Nối Tài Khoản Google Pro A & Pro B

1. Mở trang **Cài Đặt** (`/settings`).
2. Tại thẻ **Tài Khoản Google AI Pro & Flow Automation**:
   - Nhấn **Kết Nối Google Flow** bên dưới **Google Pro A** hoặc **Google Pro B**.
   - Đọc thông báo bảo mật và nhấn **Khởi Chạy Trình Duyệt Đăng Nhập**.
   - Cửa sổ Chromium sẽ mở ra trang Google Flow.
   - Bạn tiến hành đăng nhập Google và hoàn tất mã 2FA / CAPTCHA (nếu có).
   - Khi vào được giao diện Flow, hệ thống tự động phát hiện trạng thái `CONNECTED` và lưu session vào thư mục profile cục bộ.
3. Nhấn nút **Kiểm Tra (Test Connection)** để xác nhận session và đọc số dư credits còn lại.

---

## 4. Cách Khởi Động Hệ Thống

### Bước 1: Khởi động cơ sở dữ liệu & Redis
```bash
docker compose up -d
```
- PostgreSQL: Port `5438`
- Redis: Port `6389`

### Bước 2: Chạy Next.js Web App
```bash
npm run dev
```
Truy cập giao diện tại: `http://localhost:3000`

### Bước 3: Chạy Automation Worker (Xử lý hàng đợi sinh video)
Mở một terminal mới và chạy:
```bash
npm run worker
```
Worker sẽ lắng nghe hàng đợi `google-flow-generation-queue`, nhận job, mở session Google Pro tương ứng, thực hiện submit prompt lên Flow, tải file MP4 và import vào Thư viện Video.

---

## 5. Quy Trình Tạo Video (First Test Loop)

1. Vào **Dự án** $\rightarrow$ Chọn một dự án $\rightarrow$ Nhấn **Tạo Lệnh Render (Generation)**.
2. Chọn Phương thức: **Tự Động (Flow Automation)**.
3. Chọn tài khoản Google (ví dụ: `Google Pro A`).
4. Nhập prompt kiểm thử tiêu chuẩn:
   ```
   A cinematic close-up of a red fox walking through a snowy forest at sunrise, realistic natural lighting, slow camera movement.
   ```
5. Nhấn **Khởi Động Flow Automation**.
6. Theo dõi tiến trình thời gian thực:
   - 🟢 `Khởi động Browser`
   - 🟢 `Kiểm tra Google Session`
   - 🟢 `Mở Google Flow`
   - 🟢 `Gửi Prompt`
   - 🟡 `Flow Veo đang Render`
   - 🟢 `Tải MP4`
   - 🟢 `Xử lý Video`
   - 🟢 `Hoàn tất (Đã có Video)`
7. Xem video vừa tạo trong **Thư Viện Video** hoặc trang chi tiết generation.

---

## 6. Giải Pháp Thủ Công Dự Phòng (Manual Fallback)

Nếu Google Flow thay đổi cấu trúc UI hoặc xuất hiện thử thách captcha đặc biệt:
- Generation job sẽ chuyển sang trạng thái cảnh báo hoặc dừng lại an toàn.
- Trên giao diện chi tiết generation luôn có sẵn 3 nút dự phòng:
  1. **Copy Prompt**: Sao chép prompt chỉ với 1 click.
  2. **Mở Google Flow**: Mở tab Google Flow trực tiếp.
  3. **Import Video**: Kéo thả file MP4 vừa render xong vào app để xử lý metadata và lưu vào thư viện.

---

## 7. Xử lý sự cố selector (Google Flow đổi UI)

- Ô prompt và nút Generate được định vị theo **vị trí + ngữ cảnh** trong `src/lib/automation/flow-dom.ts` (ô chat "Bạn muốn tạo gì?" ở panel phải; nút gửi là nút phải nhất trong khung chat), không còn phụ thuộc class CSS.
- Khi job lỗi, worker lưu `screenshot.png`, `page.html`, `elements.json` vào `data/flow-debug/<generationId>-<time>/`. Gửi thư mục này để chỉnh heuristic nếu Flow đổi giao diện.
- Mặc định chạy trình duyệt **có giao diện** (headed). Đặt `FLOW_HEADLESS=true` trong `.env` để chạy ẩn.

> Ghép nhiều cảnh thành video hoàn chỉnh: xem [sequence-workflow.md](./sequence-workflow.md)
