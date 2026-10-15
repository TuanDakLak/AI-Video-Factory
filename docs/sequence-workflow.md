# Video nhiều cảnh (Sequence): từ nhiều clip Flow thành 1 video hoàn chỉnh

Flow chỉ sinh clip ngắn (khoảng 8–10s/clip), nên mọi video sản phẩm dài hơn đều cần nối nhiều clip.
Tài liệu này mô tả luồng, các chế độ liền mạch, cách xử lý lỗi và "hợp đồng" bàn giao cho bước **publish**.

## Chế độ mặc định: Flow tự chia cảnh (FLOW_AGENT)

Một video dài (ví dụ 90s) = **1 project Flow chứa N clip** (N = ceil(tổng/độ dài clip), ví dụ 9 clip × 10s). Không dùng API AI ngoài để chia cảnh.

1. Tạo video nhiều cảnh với chế độ "Flow tự chia cảnh": tool chỉ tạo N cảnh rỗng (chưa gọi AI nào).
2. Chạy: tool mở project Flow mới, mở phiên Agent mới, (đính kèm ảnh tham chiếu nếu có) rồi gửi MỘT brief yêu cầu "đúng N clip liên tiếp, dùng chung ảnh tham chiếu, mỗi clip nối tiếp clip trước".
3. Agent hỏi duyệt: *"tạo N video này với chi phí là X tín dụng"* (Phê duyệt / Luôn phê duyệt / Từ chối). Tool chỉ bấm **Phê duyệt** khi đúng N video và giá ≤ 25 tín dụng/clip (và ≤ số dư); ngược lại bấm **Từ chối** (không tốn credit) và báo lỗi. `FLOW_AUTO_APPROVE=false` để tự duyệt tay.
4. Chờ N ô video mới trong lưới, đọc danh sách "Scene k: …" trong khung chat để biết clip nào là cảnh nào, tải từng clip bản 720p gốc, lưu vào từng cảnh (prompt Flow viết được ghi lại vào cảnh).
5. Đủ clip → ffmpeg tự ghép (Cắt thẳng/Crossfade) → video hoàn chỉnh + gói đăng.

Lưu ý: nếu chỉ có một phần clip (Flow xếp hàng/quá thời gian), cảnh lead chuyển NEEDS_USER_ACTION và KHÔNG tự chạy lại (tránh trả tiền lần 2): tải clip còn thiếu từ project Flow rồi Import thủ công. Thời gian chờ = `FLOW_GENERATION_TIMEOUT_SEC` (480s) + 180s mỗi clip.

Các chế độ cũ (Cảnh độc lập / Nối frame cuối) vẫn còn nhưng dùng AI ngoài (Gemini) để chia cảnh.


## 1. Research: Google Flow tự hỗ trợ gì? (kiểm tra 10/2026)

| Tính năng của Flow | Làm được gì | Tự động hoá được không |
|---|---|---|
| **Extend** | Kéo dài 1 clip Veo, có âm thanh, nối tiếp cùng 1 shot (cho video "một phút trở lên") | Không có API; phải thao tác UI, chưa có DOM thật |
| **Frames to Video** | Cho ảnh khung hình đầu (và cuối), Veo sinh video nối hai khung | Có thể: đính kèm ảnh qua hộp chọn file (đã làm) |
| **Ingredients to Video** | Tối đa 3 ảnh tham chiếu (nhân vật / sản phẩm / phong cách) | Có thể: cùng cơ chế đính kèm ảnh (đã làm) |
| **Scenebuilder / Jump to** | Sắp xếp clip, trim, xem thử cả chuỗi, **tải "scene"**; Jump to giữ nhân vật khi đổi bối cảnh | Không có API; định dạng/độ phân giải tải về không được tài liệu nêu |
| **Flow Agent** | Trợ lý Gemini trong project; câu hỏi của agent không tốn credit (credits chỉ tính khi sinh video/ảnh) | Là panel chat "Bạn muốn tạo gì?" |

Kết luận: Flow **có** công cụ nối clip (Extend, Frames, Scenebuilder) nhưng chỉ qua giao diện, không có API chính thức.
Vì vậy hệ thống dùng:
1. **Flow cho độ liền mạch giữa 2 clip** (ảnh đầu = frame cuối clip trước; ảnh tham chiếu sản phẩm).
2. **ffmpeg cho việc ghép cuối** (cut / crossfade, chuẩn hoá kích thước, fps, âm thanh, H.264 + AAC + faststart) để file đầu ra ổn định cho đăng mạng xã hội, không phụ thuộc UI "Download scene" của Flow.

Nguồn: [Edit videos & build scenes in Flow (Google Help)](https://support.google.com/flow/answer/16935718), [Veo 3.1 updates in Flow (Google blog)](https://blog.google/innovation-and-ai/products/veo-updates-flow/), [5 tips for Flow (Google blog)](https://blog.google/innovation-and-ai/products/flow-video-tips/).
Chưa kiểm chứng được: số giây mỗi lần Extend, số lần Extend tối đa và chi phí credits (tài liệu chính thức không nêu).

## 2. Luồng

```
Brief/Kịch bản ─► AI chia N cảnh + style bible + caption/hashtag
      │
      ▼
Sequence (PLANNED) + N Generation (DRAFT)  ◄── bạn xem/sửa prompt từng cảnh, thêm ảnh sản phẩm
      │  Bắt đầu render
      ▼
Hàng đợi BullMQ (tuần tự, 1 job/lần) ─► Worker Playwright ─► Flow ─► clip MP4
      │                                    └─ cảnh k: đính kèm ảnh (Ingredients hoặc frame cuối cảnh k-1)
      ▼
Đủ N clip ─► ffmpeg ghép ─► VideoAsset (source=SEQUENCE) ─► Sequence COMPLETED
      │
      ▼
GET /api/videos/{id}/publish-package  ─► bước publish
```

Các cảnh của cùng một sequence dùng chung **một project Flow**.

## 3. Chế độ liền mạch

- `INDEPENDENT` (mặc định): mỗi cảnh chạy riêng, nhất quán nhờ **style bible** lặp trong mọi prompt (+ ảnh tham chiếu nếu có).
- `LAST_FRAME`: cảnh 1 dùng ảnh tham chiếu (nếu có); cảnh k>1 bắt đầu từ **frame cuối cảnh k-1**.
  - Bắt buộc chạy tuần tự. Render lại một cảnh giữa chừng thì phải render lại các cảnh sau nó.
  - **Chưa kiểm chứng trên giao diện Flow thật.** Nếu đính kèm thất bại, cảnh dừng **trước khi gửi prompt** (không mất credit); đổi sang `INDEPENDENT` rồi bấm Tiếp tục.

## 4. Lỗi & credits

| Tình huống | Trạng thái cảnh | Hành vi |
|---|---|---|
| Lỗi trước khi gửi prompt (không thấy ô prompt, đính kèm ảnh lỗi, hết phiên) | `FAILED` | Không tốn credit. Sequence tạm dừng; bấm **Tiếp tục** hoặc **Chạy lại cảnh** |
| Flow báo từ chối (policy…) | `FAILED` | Thường không tính credit |
| Lỗi **sau** khi gửi prompt (hết thời gian chờ, tải file lỗi) | `NEEDS_USER_ACTION` | Credit có thể đã trừ, clip có thể đã có trong Flow: tải về và **Import thủ công**, đừng chạy lại mù quáng |
| Một cảnh lỗi | các cảnh sau → `DRAFT` | Tự dừng để không tốn credit; bấm Tiếp tục |

Khi đủ clip (kể cả clip import thủ công), hệ thống tự ghép.

## 5. Bàn giao cho bước publish

`GET /api/videos/{videoAssetId}/publish-package` (hoặc `getPublishPackage()` trong `src/lib/publish/package.ts`) trả về:
file (`storageKey`, `absolutePath`), `mimeType`, `fileSize`, `duration`, `width`, `height`, `title`, `caption`, `tags[]`,
`origin` và `checks[]` theo từng nền tảng (`ok` / `warn` / `fail`) + `publishable`.

- Video ghép cuối: `source = "SEQUENCE"`, H.264 + AAC, `yuv420p`, `+faststart`.
- Các mốc giới hạn nền tảng nằm trong **một bảng duy nhất** (`src/lib/publish/readiness.ts`). Nguồn công khai mâu thuẫn nhau (ví dụ Shorts 60s so với 180s) nên có hai mức: khuyến nghị (cảnh báo) và tối đa (lỗi). **Cần đối chiếu tài liệu chính thức của từng nền tảng khi làm bước publish.**
- Chưa có: nhạc nền / phụ đề / watermark, upscale độ phân giải (clip Flow thường 720p–1080p).

## 6. Cài đặt

1. `npx prisma db push` (thêm bảng `Sequence` và các cột liên quan).
2. ffmpeg + ffprobe trong PATH, hoặc đặt `FFMPEG_PATH` / `FFPROBE_PATH` trong `.env`.
3. `GEMINI_API_KEY` để AI chia cảnh (không có thì dùng bộ chia đơn giản và có cảnh báo).
4. `npm run worker` + `npm run dev`. Kiểm tra: `npm test`.

## Bảo vệ credit & khôi phục (Giai đoạn 1)

| Cơ chế | Cách dùng |
|---|---|
| Trần mỗi video | `FLOW_MAX_CREDITS_PER_VIDEO` (mặc định 300, 0 = tắt). Tính cả các lần Agent xin duyệt lại (tạo lại clip lỗi). |
| Ngân sách trong ngày | `FLOW_DAILY_CREDIT_BUDGET` (mặc định 0 = tắt). Sổ cái: mỗi lần bấm Phê duyệt ghi 1 event `CREDITS_SPENT`. |
| Kiểm tra số dư | Trước khi xếp hàng (số dư lưu ≤ 12 giờ) và lại lần nữa khi worker đọc số dư thật trên Flow. |
| Chạy thử (0 credit) | Nút **Chạy thử**: Flow Agent lập kế hoạch, tool đọc "N video / X tín dụng" rồi bấm **Từ chối**. Biết trước Agent có hỏi lại không, có đúng N video không và giá bao nhiêu. API: `POST /api/sequences/:id/start {"mode":"DRYRUN"}`. |
| Khôi phục clip (0 credit) | Nút **Khôi phục clip từ Flow** (khi video ở trạng thái cần thao tác): mở project Flow, mở từng clip, đọc prompt "Scene k" ở trình chỉnh sửa để biết đúng cảnh, tải 720p. API: `{"mode":"RECOVER","flowProjectUrl":"…/project/…"}` (URL tuỳ chọn). |

Khuyến nghị: luôn **Chạy thử** trước khi **Bắt đầu render** một video dài.

## Tự động hoá (Giai đoạn 1.5 – 3)

### Kiểm tra sức khoẻ Flow (0 credit)
- `npm run flow:health` mở Flow bằng profile của tài khoản, kiểm tra: đăng nhập, số dư, trang dự án, ô prompt, nút "+", "Cài đặt", "Phiên mới". Lỗi → exit code 1 (dùng được với Task Scheduler/cron) và gửi webhook.
- Kết quả lưu ở `data/flow-health.json`; `GET /api/flow/health` trả báo cáo mới nhất, `POST /api/flow/health` chạy ngay.
- Worker tự kiểm tra định kỳ khi đặt `FLOW_HEALTHCHECK_HOURS=24` (bỏ qua nếu đang chạy job).
- `npm run flow:attach-test` kiểm chứng việc đính ảnh tham chiếu trên Flow thật **trên máy bạn** (không gửi gì, không tốn credit).

### Preset kênh
Trang **Preset kênh** (`/presets`) lưu phong cách cố định, ngôn ngữ, hashtag, định dạng và tối đa 3 ảnh tham chiếu cho từng kênh (file `data/channel-presets.json`). Form tạo video có ô chọn preset; ảnh tham chiếu được **sao chép** vào video nên xoá video không mất ảnh của preset.

### Ba cách chia cảnh
| Chế độ | Ai chia cảnh | Ưu | Nhược |
|---|---|---|---|
| Flow tự chia cảnh (mặc định) | Flow Agent | không cần API key, ảnh tham chiếu đồng nhất | Agent có thể hỏi lại / đổi cách trả lời (đã có xử lý) |
| Tool chia cảnh – clip riêng | Gemini (`GEMINI_API_KEY`, có hạn mức miễn phí) hoặc bộ chia cảnh đơn giản | ổn định, kiểm soát từng prompt, 12 tín dụng/clip | cần đính ảnh tham chiếu để giữ nhân vật |
| Tool chia cảnh + nối frame cuối | như trên | liền mạch hành động giữa các clip | chạy tuần tự |

Nút **Chạy thử (0 credit)** dùng được với mọi chế độ.

### Veo API dự phòng (tính theo USD)
- Cần `GEMINI_API_KEY` (hoặc `VEO_API_KEY`) có bật thanh toán. Model: `VEO_API_MODEL` (mặc định `veo-3.1-fast-generate-preview`). Clip 8s, 720p, 9:16 hoặc 16:9.
- Trần: `VEO_API_MAX_USD_PER_VIDEO` (mặc định 15), `VEO_API_DAILY_USD_BUDGET` (mặc định tắt), giá ước tính `VEO_API_USD_PER_SECOND` (mặc định 0.10).
- Nút **Chạy bằng Veo API** trên video chưa có clip. Hoặc tự động: `VIDEO_FALLBACK_TO_API=true` → khi Flow lỗi **trước khi bấm phê duyệt** (chưa tốn credit) thì tự chuyển sang Veo API.
- API chỉ tính phí clip thành công nên lỗi nào cũng an toàn để chạy lại.

### Endpoint cho hệ thống tự động (hot-trend)
`POST /api/automation/videos` (header `x-api-key` nếu đặt `AUTOMATION_API_KEY`):
```json
{ "topics": ["Siêu đại chiến chiến binh châu Á", "Top 5 loài vật nguy hiểm nhất rừng Amazon"], "presetId": "<id preset>", "totalDuration": 30 }
```
Mỗi chủ đề → 1 video, đưa vào hàng đợi (tuần tự), mọi trần chi phí đều áp dụng. `"dryRunOnly": true` chỉ tạo + chạy thử không tốn credit; `"autostart": false` chỉ tạo. `GET /api/automation/videos?limit=20` trả trạng thái để poll.

### Webhook
Đặt `AUTOMATION_WEBHOOK_URL` (Slack/Discord/n8n/Make…) để nhận: `video.completed`, `sequence.needs_attention`, `sequence.fallback_to_api`, `generation.failed`, `flow.health.failed`.
