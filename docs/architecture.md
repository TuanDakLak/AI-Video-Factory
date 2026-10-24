# Kiến trúc

## Tiến trình

| Tiến trình | Vai trò |
|---|---|
| Web (`next dev` / `next start`) | Giao diện, API, xác thực. Không bao giờ mở trình duyệt Flow. |
| Worker (`npm run worker`) | Một hàng đợi BullMQ, 1 job một lúc: điều khiển Chromium (Playwright, hồ sơ đăng nhập riêng mỗi tài khoản Google). Bộ lập lịch mỗi `AUTOMATION_TICK_SEC`. |
| Postgres | Toàn bộ dữ liệu (Prisma). |
| Redis | Hàng đợi job Flow, giới hạn tần suất. |

Mỗi phút, worker chạy theo thứ tự:

1. dọn job mồ côi và khoá tài khoản bị kẹt (`automation/reliability.ts`);
2. kiểm tra giao diện Flow hằng ngày (0 credit);
3. tìm chủ đề cho một kênh và lịch sản xuất (`automation/scheduler.ts`, `automation/topics.ts`);
4. đăng bài (`publish/publisher.ts`).

## Dữ liệu

```
User ─┬─ Channel ── Topic ──► Sequence (1 video dài)
      │     │                    ├── Generation × N   (1 clip ~10 s; cảnh 0 là "lead" chạy cả batch)
      │     └── projectId ──► Project (thư mục lưu file nội bộ, không hiện trong giao diện)
      │                          └── VideoAsset (video dài; clip 10 s bị xoá sau khi ghép)
      ├─ GoogleAccount (hồ sơ trình duyệt Flow, số dư credit, khoá)
      ├─ SocialAccount (TikTok / Facebook Page, token mã hoá) ── Publication
      └─ RefreshToken / OAuthAccount
```

- Video thủ công không chọn kênh được lưu trong thư mục "Video tự tạo" của người dùng (`ensureManualProject`).
- Bảng `Content` và các generation lẻ được giữ cho dữ liệu cũ, nhưng không còn được tạo mới.

## Render một video

`SequenceService.create` tạo Sequence (luôn ở chế độ `FLOW_AGENT`) và N Generation nháp. Việc tạo này không gọi LLM.

`SequenceService.start` có ba chế độ, đều chỉ xếp hàng **cảnh 0**:

- `RUN`: chạy thật. Hạn mức credit được kiểm tra trước khi xếp hàng.
- `DRYRUN`: Agent lập kế hoạch, tool đọc giá rồi từ chối. 0 credit.
- `RECOVER`: tải clip đã có trong project Flow. 0 credit.

`FlowAutomationService.executeGeneration` chạy job:

1. Mở Flow và kiểm tra phiên đăng nhập, số dư.
2. Dùng lại project Flow của video nếu đã có.
3. Đính kèm ảnh tham chiếu (Ingredients).
4. Gửi **một** brief (`agent-prompt.ts`).
5. Chỉ bấm Phê duyệt khi kế hoạch đúng N video và trong hạn mức (`credit-guard.ts`). Mỗi lần duyệt được ghi `CREDITS_SPENT`.
6. Chờ đủ N clip mới.
7. Mở từng clip, đọc "Scene k" ở nhật ký và tải bản 720p (bắt blob ngay trong trang, tránh lỗi crash khi tải).

Khi đủ clip, `onGenerationSettled` gọi `assemble`: ffmpeg nối clip, cân âm -14 LUFS, đệm âm cho khớp hình, fade 30/80 ms ở mỗi điểm cắt. Sau đó các clip 10 s bị xoá.

Lỗi trước khi duyệt → `FAILED` (chạy lại an toàn). Lỗi sau khi duyệt → `NEEDS_USER_ACTION` (khôi phục clip, không render lại).

## Nội dung

| Thành phần | Vai trò |
|---|---|
| `content/genres.ts` | 7 khung thể loại (nhịp từng clip, giọng kể / thoại). |
| `content/script-writer.ts` | 1 lệnh Gemini → kịch bản "Scene 1…N", caption, hashtag. Không có LLM thì để Flow Agent tự viết theo khung thể loại. |
| `research/sources.ts`, `research/researcher.ts` | Tín hiệu miễn phí → 1 lệnh Gemini chọn chủ đề → hộp chủ đề (lọc trùng bằng tiêu đề chuẩn hoá + Jaccard ≥ 0.7, kể cả chủ đề đã xoá). |
| `ai/llm.ts` | Gemini REST (`gemini-2.5-flash`, dự phòng `-lite`), hoặc OpenRouter nếu key bắt đầu bằng `sk-or-`. |

## Xác thực & phân quyền

| Thành phần | Vai trò |
|---|---|
| `auth/*`, `middleware.ts` | JWT HS256 10 phút (cookie), refresh token mờ, băm sha256, xoay vòng theo họ (phát hiện dùng lại), argon2id, Google OIDC (PKCE + state + nonce, không tự liên kết với tài khoản mật khẩu). |
| `auth/ownership.ts` | Mọi truy vấn lọc theo chủ sở hữu. Tài nguyên của người khác trả về 404. |

## Thư mục

```
src/app            trang + API (Next.js App Router)
src/components     giao diện theo trang
src/lib/automation Flow (Playwright), lập lịch, chủ đề, tự phục hồi
src/lib/sequence   tạo / chạy / ghép video, hạn mức credit
src/lib/content    thể loại, viết kịch bản
src/lib/research   tìm chủ đề
src/lib/publish    TikTok, Facebook, mã hoá token, hàng đợi đăng
src/lib/auth       đăng nhập, phiên, phân quyền
src/worker         tiến trình worker
src/scripts        công cụ dòng lệnh
src/tests          test (tsx, cần Postgres + Redis)
```
