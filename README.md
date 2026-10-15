# 🎬 AI Content Factory (MVP Phase 2)

Hệ thống studio nội bộ hỗ trợ sản xuất, quản lý và tổ chức video AI đa dạng thể loại (Shorts, Reels, Phim ngắn, Tài liệu) kết hợp trợ lý Gemini AI và quy trình sản xuất Google Flow (Veo 3.1).

---

## 🎯 Mục Tiêu Của Phase 2 (AI Content Production Workspace)

Phase 2 nâng cấp từ một thư viện video đơn giản thành một **AI Content Production Workspace** hoàn chỉnh:

```
USER
  │
  ├──► 1. TẠO DỰ ÁN (PROJECT)
  │
  ├──► 2. SOẠN THẢO Ý TƯỞNG / CHỦ ĐỀ
  │      │
  │      ├──► [TÙY CHỌN] BẤM "TẠO VỚI GEMINI AI" ──► Tự động sinh Kịch bản & Video Prompt chuẩn
  │      └──► [THỦ CÔNG] Tự viết / Chỉnh sửa toàn bộ Title, Concept, Script, Video Prompt
  │
  ├──► 3. TẠO LỆNH RENDER (GENERATION JOB) ──► Chọn tài khoản Google Pro A hoặc Google Pro B
  │
  ├──► 4. COPY PROMPT & MỞ GOOGLE FLOW ──► Render video Veo 3.1 trên tab Google Flow
  │
  ├──► 5. TẢI MP4 TỪ FLOW VÀ IMPORT VÀO STUDIO
  │
  └──► 6. THƯ VIỆN VIDEO (VIDEO LIBRARY) ──► Tìm kiếm, lọc theo Dự án/Tỉ lệ, Xem trước & Tải về
```

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

* **Frontend**: Next.js 15+ (App Router), React 19, TypeScript
* **Styling**: Tailwind CSS (Thiết kế nhẹ nhàng, hiện đại, tone màu pastel/slate dịu mắt)
* **Database**: PostgreSQL (quản lý qua Prisma ORM)
* **AI Provider (Tùy chọn)**: Google Gemini 2.0 Flash (`@google/generative-ai`)
* **Validation**: Zod
* **Storage**: Local Filesystem Abstraction (`storage/projects/{id}/videos/`)
* **Icons**: Lucide React

---

## ⚙️ Cài Đặt & Chạy Ứng Dụng (Quick Start)

### 1. Yêu cầu môi trường
* **Node.js**: Phiên bản 18+ trở lên
* **Docker Desktop**: Để chạy PostgreSQL bằng 1 lệnh duy nhất (cổng 5438).

### 2. Cấu hình biến môi trường (`.env`)
Tạo file `.env` từ `.env.example`:
```env
DATABASE_URL="postgresql://postgres:postgrespassword@127.0.0.1:5438/aicontentfactory?schema=public"
STORAGE_PATH="./storage"

# TÙY CHỌN: Thêm key nếu muốn dùng tính năng Gemini AI tự động sinh kịch bản
# Nếu không có key, ứng dụng tự động chạy ở Chế độ Thủ công (Manual Mode)
GEMINI_API_KEY=""
```

### 3. Khởi động Database & Seed dữ liệu Phase 2
```bash
# 1. Bật Docker Postgres và nạp dữ liệu mẫu Phase 2 (Google Pro A, Google Pro B, Dự án mẫu)
npm run db:setup
```

### 4. Chạy ứng dụng
```bash
npm run dev
```
Mở trình duyệt tại: **`http://localhost:3000`**

---

## 🧪 Chạy Kiểm Thử (Unit Tests)

Chạy bộ kiểm tra tính đúng đắn của Validation, Mock AI Provider và State transitions:
```bash
npm test
```

---

## 📋 Hướng Dẫn Vận Hành 2 Chế Độ (AI Mode & Manual Mode)

### Chế Độ 1: Có Gemini AI (`GEMINI_API_KEY`)
1. Vào menu **Ý tưởng & Kịch bản** $\rightarrow$ bấm **Tạo Kịch Bản Mới**.
2. Nhập một câu chủ đề (VD: *"5 loài sinh vật kỳ lạ dưới đáy rãnh Mariana"*).
3. Bấm **Tạo Nội Dung với Gemini AI**.
4. Gemini sẽ trả về tiêu đề, kịch bản và câu Video Prompt tiếng Anh tối ưu cho Google Flow.
5. Bạn xem lại, chỉnh sửa tùy thích $\rightarrow$ Bấm **Lưu & Tạo Video Prompt Ngay**.

### Chế Độ 2: Chế Độ Thủ Công (Không Cần API Key)
1. Bạn hoàn toàn có thể tự gõ Tiêu đề, Kịch bản và Video Prompt của riêng mình.
2. Ứng dụng không bắt buộc phải có API Key để vận hành.

---

## 📂 Cấu Trúc Thư Mục

```
AIcontent/
├── src/
│   ├── app/                         # App Router Pages & API Routes
│   │   ├── dashboard/page.tsx       # Bảng điều khiển tổng quan
│   │   ├── projects/                # Quản lý dự án
│   │   ├── contents/                # Quản lý kịch bản & AI Generator
│   │   ├── generations/             # Quản lý lệnh prompt & Google Flow
│   │   ├── videos/                  # Thư viện video & trình xem
│   │   ├── settings/                # Quản lý AI Provider, Google Accounts
│   │   └── api/                     # REST API handlers
│   ├── components/                  # Giao diện UI tái sử dụng
│   │   ├── layout/                  # Sidebar, Header
│   │   ├── contents/                # ContentEditor
│   │   ├── generations/             # VideoImporter, CopyPromptButton, NewGenerationForm
│   │   ├── videos/                  # VideoCard, VideoPlayerModal, VideoLibraryClient
│   │   └── settings/                # SettingsClient
│   ├── lib/
│   │   ├── ai/                      # IAIProvider, GeminiProvider, MockAIProvider, PromptEngine
│   │   ├── db.ts                    # Prisma singleton
│   │   ├── storage.ts               # Storage abstraction
│   │   ├── video-processor.ts       # Trích xuất metadata MP4
│   │   └── validations.ts           # Zod schemas
│   └── tests/
│       └── validations.test.ts      # Unit tests Phase 2
├── prisma/
│   ├── schema.prisma                # Prisma models Phase 2
│   └── seed.ts                      # Script tạo dữ liệu mẫu Phase 2
├── docs/                            # Tài liệu kiến trúc chuyên sâu
│   ├── architecture.md
│   ├── ai-provider.md
│   └── flow-workflow.md
└── storage/                         # Thư mục lưu trữ video MP4 vật lý
```

---

## 🗺️ Lộ Trình Tiếp Theo (Future Phases)

* **Phase 3**: Tích hợp YouTube Data API v3 để xuất bản video trực tiếp lên YouTube Shorts.
* **Phase 4**: Flow Automation Worker / Extension hỗ trợ tự động gửi prompt sang Google Flow.
* **Phase 5**: Bộ điều phối tín dụng nâng cao cho 2 tài khoản Google AI Pro (Credit Scheduler).
* **Phase 6**: Pipeline sản xuất AI Short Film và Movie đa phân cảnh.
Prompt Phase 3 — Connect Google → Flow Automation → Generate → Import
Bạn đang tiếp tục phát triển repository AI Content Factory đã được xây dựng ở các phase trước.

ĐÂY KHÔNG PHẢI PROJECT MỚI.

Hãy đọc và hiểu toàn bộ repository hiện tại trước khi sửa.

MVP hiện tại đã có:

Projects

Content

Generations

Prompt generation

Optional Gemini provider

Google account records

Manual Google Flow workflow

Video import

Video library

Video preview

Video download

Bây giờ hãy nâng cấp hệ thống để tiến tới:

TOPIC
→ AI PROMPT
→ CONNECT GOOGLE ACCOUNT
→ SELECT GOOGLE ACCOUNT
→ OPEN PERSISTENT FLOW SESSION
→ SUBMIT PROMPT TO GOOGLE FLOW
→ START REAL VIDEO GENERATION
→ WAIT FOR COMPLETION
→ DOWNLOAD GENERATED VIDEO
→ IMPORT INTO APP
→ VIDEO LIBRARY

Đây là Phase 3.

MỤC TIÊU CHÍNH:

Biến Google Flow từ manual step thành một automation worker có thể sử dụng session Google thật của user.

1. CRITICAL REQUIREMENT
Google Flow credits phải được sử dụng bởi chính Google account/session đang chạy Flow.

KHÔNG tạo một hệ thống credit giả.

KHÔNG trừ credits trong database rồi giả vờ đó là Google Flow credits.

KHÔNG fake generation.

KHÔNG fake successful video.

KHÔNG gọi một endpoint không tồn tại.

KHÔNG reverse engineer authentication để bypass Google security.

KHÔNG bypass CAPTCHA.

KHÔNG bypass rate limits.

KHÔNG bypass Google Flow subscription restrictions.

Automation chỉ được sử dụng trên Google account mà user đã đăng nhập và có quyền sử dụng.

Nếu Google Flow không cung cấp official public API cho một operation nào đó, dùng browser automation trên session hợp lệ thay vì giả lập API.

Nếu automation không thể thực hiện một bước nào đó vì Flow thay đổi UI hoặc yêu cầu human interaction:

→ dừng job
→ báo trạng thái rõ ràng
→ yêu cầu user tiếp tục thủ công.

Không được cố bypass security challenge.

2. RESEARCH FIRST
Trước khi code:

Kiểm tra documentation/public information hiện tại về:

Google Flow

Flow credits

Google AI Pro

Veo

Google account authentication

Google Flow availability

official Veo API

Đặc biệt phân biệt:

Google Flow credits

và

Gemini/Veo API billing.

KHÔNG assume rằng Google AI Pro subscription cung cấp API credits.

Nếu official documentation không có Flow API:

hãy thiết kế Flow integration như browser automation.

3. AUTOMATION ARCHITECTURE
Không chạy Playwright trực tiếp trong Next.js request.

Tách thành:

Web App
+
Automation Worker

Architecture:

Next.js
|
| create generation job
↓
Database
|
↓
Automation Worker
|
↓
Persistent Browser Profile
|
↓
Google Account
|
↓
Google Flow
|
↓
Veo Generation
|
↓
Generated Video
|
↓
Download
|
↓
Storage
|
↓
VideoAsset
|
↓
Dashboard

4. PLAYWRIGHT
Ở Phase này được phép dùng Playwright.

Use Playwright cho browser automation.

KHÔNG dùng Puppeteer nếu Playwright đáp ứng được.

Tạo package/module riêng:

automation-worker/

hoặc:

apps/worker/

tùy architecture hiện tại.

Không trộn Playwright code vào React components.

5. PERSISTENT GOOGLE PROFILES
Đây là phần quan trọng nhất.

Mỗi Google account phải có browser profile riêng.

Ví dụ:

browser-profiles/
google-account-a/
google-account-b/

Mỗi profile chứa session/cookies/local storage của account tương ứng.

KHÔNG lưu Google password.

KHÔNG lưu password trong database.

KHÔNG yêu cầu app biết password.

User sẽ login Google thủ công lần đầu.

Sau đó Playwright sử dụng persistent browser context/profile.

6. GOOGLE ACCOUNT CONNECTION UX
Settings:

/settings/google-accounts

Hiển thị:

Google Pro A
Status: NOT_CONNECTED

Google Pro B
Status: NOT_CONNECTED

Button:

Connect

7. CONNECT FLOW
Khi user click:

Connect Google Pro A

Application:

Start Playwright persistent context cho account A.

Mở Google Flow.

Hiển thị browser window.

User tự đăng nhập Google.

User hoàn thành bất kỳ normal verification nào.

User mở được Flow.

Application kiểm tra Flow đã load.

Lưu trạng thái CONNECTED.

Đóng browser hoặc giữ worker session theo architecture.

KHÔNG:

tự nhập password

lấy password

bypass MFA

bypass CAPTCHA

bypass security verification.

8. IMPORTANT: SESSION SECURITY
Google session data là sensitive.

Do đó:

không commit profile vào git

không upload profile vào cloud

không expose profile path cho browser

không đưa cookies vào database

không log cookies

không log authorization headers

không log page storage

không log passwords

Add:

browser-profiles/

vào .gitignore.

9. CONNECTION STATUS
Google account status:

NOT_CONNECTED
CONNECTING
CONNECTED
EXPIRED
ERROR
DISABLED

UI:

Google Pro A

CONNECTED

Last checked:
...

Buttons:

Test Connection
Reconnect
Disconnect

10. TEST CONNECTION
Button:

Test Connection

Worker mở persistent context.

Load Google Flow.

Kiểm tra:

Flow page loaded

account appears authenticated

Flow UI available

Nếu success:

CONNECTED

Nếu login expired:

EXPIRED

Nếu blocked/error:

ERROR

Không cố bypass.

11. GENERATION WORKFLOW
Generation UI hiện tại phải có:

Google Account:

[Google Pro A ▼]

Provider:

[Google Flow]

Model:

[select]

Prompt:

[...]

Button:

Generate Video

12. GENERATE VIDEO
Khi user click:

Generate Video

Flow:

Validate generation.

Validate Google account is CONNECTED.

Create generation job.

Status = QUEUED.

Worker picks job.

Worker launches persistent browser context.

Worker opens Google Flow.

Worker verifies session.

Worker navigates to appropriate Flow creation UI.

Worker enters prompt.

Worker selects requested generation options if reliably available.

Worker starts generation.

Worker detects generation state.

Worker waits.

Worker downloads resulting MP4.

Worker stores MP4.

Worker processes metadata.

Worker creates VideoAsset.

Generation = IMPORTED.

UI updates automatically/polling.

13. DO NOT FAKE CREDIT DEDUCTION
The application must NOT have:

"credits = credits - 20"

and claim those are Google credits.

Instead:

Google Flow itself performs the actual credit deduction when it accepts/executes the generation.

The application only records metadata such as:

googleAccountId
generationStartedAt
generationCompletedAt
provider
model
status

Optional:

flowCreditEstimate

but clearly label it:

"Estimated Flow credits"

NOT:

"Actual Google balance"

unless the worker can reliably read the actual balance from the visible Flow UI.

14. FLOW CREDIT DISPLAY
If Flow UI visibly exposes remaining credits for the authenticated account, the worker may read that visible value.

Store:

lastKnownFlowCredits

lastCreditCheckAt

This is:

LAST KNOWN VALUE

not an authoritative API balance.

UI:

Google Pro A

Connected

Last known Flow credits:
XXX

Last checked:
YYYY-MM-DD HH:mm

If the value cannot be reliably read:

show:

"Credit balance unavailable"

Do not guess.

15. CREDIT SAFETY
Before generation:

If visible Flow balance can be read:

check whether there appears to be sufficient balance.

If insufficient:

do not submit generation.

Show:

"Insufficient Flow credits for this account."

If cost cannot be reliably determined:

allow generation but show:

"Flow credit cost will be determined by Google Flow."

Do not invent credit prices.

16. ACCOUNT SELECTION
Generation must explicitly select account.

Example:

Generation #42

Google account:

Google Pro A

The worker MUST use that account's browser profile.

Never accidentally use Account B.

Log:

generationId
googleAccountId
workerId
startedAt

Do NOT log sensitive browser information.

17. TWO ACCOUNT SUPPORT
The user has:

Google Pro A
Google Pro B

The system must support both.

Example:

Queue:

Generation 1 → Account A
Generation 2 → Account B

But DO NOT automatically rotate accounts to evade limits.

Automatic account selection can later be used for legitimate workload scheduling based on user-configured account availability.

Do not bypass Google's limits.

18. JOB QUEUE
Because generation can take a long time, implement a proper asynchronous job system.

Use:

Redis
+
BullMQ

ONLY now introduce it because generation is long-running.

Architecture:

Next.js
↓
DB Generation
↓
BullMQ Job
↓
Automation Worker
↓
Playwright
↓
Flow
↓
Video
↓
Storage
↓
DB

19. WORKER STATES
Generation:

DRAFT
QUEUED
STARTING_BROWSER
CHECKING_ACCOUNT
OPENING_FLOW
SUBMITTING
GENERATING
DOWNLOADING
PROCESSING
COMPLETED
FAILED
NEEDS_USER_ACTION
CANCELLED

UI should display human-readable labels.

Example:

GENERATING

"Google Flow is generating your video..."

20. WORKER RETRIES
Do not blindly retry video generation.

Important distinction:

Browser/network failure:

retry worker operation.

Google Flow generation failed:

do NOT automatically create another paid/credit-consuming generation.

Generation may consume credits.

Therefore:

Never automatically resubmit a generation unless explicitly configured and safe.

21. IDEMPOTENCY
Every Generation has one logical generation job.

Use an idempotency key.

If worker crashes after submitting Flow job:

Do NOT blindly submit again.

Worker should attempt to determine whether the previous generation is still active.

If uncertain:

set:

NEEDS_USER_ACTION

instead of spending credits again.

22. BROWSER AUTOMATION
Create service:

FlowAutomationService

Methods conceptually:

connectAccount()
checkConnection()
openFlow()
createGeneration()
waitForGeneration()
downloadResult()
getVisibleCreditBalance()

Do not expose Playwright objects outside the service.

23. FLOW SELECTORS
Do NOT scatter selectors throughout code.

Create:

flow-selectors.ts

or page-object classes.

Use resilient selectors:

accessible roles

labels

visible text

stable attributes

Avoid fragile nth-child selectors where possible.

24. PAGE OBJECT MODEL
Use Playwright Page Objects.

Example:

FlowLoginPage
FlowHomePage
FlowCreatePage
FlowGenerationPage

Keep each page object small.

25. FLOW UI CHANGES
Google Flow UI can change.

When a selector cannot be found:

Worker should:

capture screenshot

capture sanitized diagnostic information

mark job FAILED or NEEDS_USER_ACTION

preserve enough information for debugging

Do NOT expose cookies or sensitive storage.

26. DOWNLOAD
Once generation completes:

download generated MP4 using the authenticated browser session.

Do not scrape arbitrary unrelated content.

Only download the generation result belonging to the current job.

Save temporarily:

tmp/generations/{generationId}/

Then move to storage.

Delete temp files after successful import.

27. VIDEO IMPORT
Reuse existing VideoProcessor.

After download:

VideoProcessor:

validate

ffprobe

thumbnail

metadata

create VideoAsset

Then:

Generation.status = COMPLETED

28. VIDEO ASSET
Keep current VideoAsset model.

Add if necessary:

source = FLOW_AUTOMATION

externalReference

providerMetadata JSON

Do not store cookies/tokens.

providerMetadata can contain:

flowProjectId if safely available
model
generation parameters
timestamps

Only if those values can be reliably obtained.

29. GENERATION LOG
Add a GenerationEvent or similar lightweight log.

Each generation should have events:

QUEUED
BROWSER_STARTED
ACCOUNT_CHECKED
FLOW_OPENED
SUBMITTED
GENERATING
DOWNLOAD_STARTED
DOWNLOAD_COMPLETED
PROCESSING
COMPLETED
FAILED

Each event:

id
generationId
type
message
createdAt

Do NOT store secrets.

30. REAL-TIME UI
Generation page should update without refresh.

MVP options:

poll every 2–5 seconds

or SSE if already easy in architecture.

Do not add WebSocket infrastructure unless necessary.

31. GENERATION DETAIL UX
Example:

Generation #42

Status:

🟡 Generating

Google Account:

Google Pro A

Provider:

Google Flow

Model:

Veo ...

Prompt:

...

Progress:

Browser connected
✓ Flow opened
✓ Prompt submitted
✓ Generation started
○ Waiting for result
○ Downloading
○ Processing

This should make the process transparent.

32. MANUAL FALLBACK
This is VERY IMPORTANT.

If automation fails:

Generation page must still allow:

Copy Prompt
Open Google Flow
Import Video

So automation is an enhancement, not a single point of failure.

33. AUTOMATION TOGGLE
Generation page:

Generation method:

AUTO
MANUAL

Default:

AUTO if account is connected.

If no connected account:

MANUAL

User can always choose MANUAL.

34. GOOGLE FLOW URL
Use the official current Google Flow URL discovered during research.

Do not hard-code outdated URLs if documentation/site redirects to another canonical URL.

35. BROWSER MANAGEMENT
Worker should not launch unlimited browsers.

Create concurrency control.

MVP:

MAX_CONCURRENT_FLOW_JOBS=1

This is intentional.

Later:

2
3
...

Do not run many simultaneous sessions against one account.

36. ACCOUNT LOCK
Prevent two generations from using the same Google account simultaneously.

Account status:

AVAILABLE
IN_USE
DISABLED

When job starts:

Account → IN_USE

When job ends:

Account → AVAILABLE

If worker crashes:

implement lease/timeout recovery.

Do not permanently lock the account.

37. TWO ACCOUNT QUEUE
Support:

Account A
Account B

Example:

A → generation 1
B → generation 2

If both are busy:

queue.

Do not automatically use another account if user explicitly selected one.

If user selected:

AUTO

then scheduler may choose an AVAILABLE connected account.

This is normal workload scheduling.

It must not be used to evade quotas or subscription restrictions.

38. GEMINI + FLOW PIPELINE
Now support:

Topic
↓
Gemini
↓
Title
Script
Prompt
Description
Tags
↓
User Review
↓
Google Flow
↓
Video

Gemini remains optional.

If Gemini is not configured:

Manual prompt mode works.

39. COST SEPARATION
UI must clearly separate:

AI API usage

and

Google Flow credits.

Example:

Gemini:

Configured
API usage: provider-controlled

Google Flow:

Google Pro A
Last known credits: XXX

Never combine them into one "token balance".

40. GOOGLE AI PRO
Do NOT claim the application can use Google AI Pro as a Gemini API key.

The application should understand:

Google AI Pro subscription
→ Flow access/Flow credits

Gemini API
→ separate API credentials/billing

Veo API
→ separate API access/billing

These are different systems.

41. OPTIONAL VEO API
Do not replace Flow with Veo API.

However, create provider architecture that can later support:

VeoApiProvider

Do NOT enable it by default.

The user's Google AI Pro Flow credits should be used through Google Flow, not through a separate API billing path.

42. GOOGLE ACCOUNT SETTINGS
Update Settings:

/settings/google-accounts

UI:

┌──────────────────────────────┐
│ Google Pro A │
│ ● Connected │
│ Last checked: 2 min ago │
│ Flow credits: 820* │
│ │
│ [Test] [Reconnect] │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Google Pro B │
│ ● Connected │
│ Last checked: 5 min ago │
│ Flow credits: 940* │
│ │
│ [Test] [Reconnect] │
└──────────────────────────────┘

Last known value read from Flow UI.
Do not show a fabricated balance.

43. CONNECT ACCOUNT BUTTON
Click:

Connect

Show modal/page:

"Google login will open in a browser window."

"Log in manually with the Google account you want to connect."

"Do not enter your password into this application."

Button:

Launch Browser

After login:

[Check Connection]

If connected:

CONNECTED

44. DISCONNECT
Disconnect means:

stop using profile

remove local persistent browser profile if user confirms

Do not call Google's account deletion API.

Do not modify the Google account itself.

45. LOCAL DEVELOPMENT
Document:

Browser profiles live locally.

Example:

data/
browser-profiles/
account-a/
account-b/

Add to .gitignore.

Never put this in repository.

46. PRODUCTION SECURITY
Document that persistent browser profiles contain authenticated sessions.

For production:

encrypt at rest

restrict filesystem permissions

run worker under dedicated OS user

isolate browser processes

do not expose browser profile directory

do not back up profiles casually

MVP can use local filesystem.

47. WORKER CONFIG
Environment:

DATABASE_URL=
REDIS_URL=
STORAGE_PATH=./storage
BROWSER_PROFILE_PATH=./data/browser-profiles
FLOW_BASE_URL=

Optional:

GEMINI_API_KEY=

Do not put Google passwords here.

48. DOCKER
If Redis/PostgreSQL local setup becomes annoying, Docker Compose may be used for:

PostgreSQL
Redis

But DO NOT containerize browser automation unless it works reliably.

For MVP local development:

host browser automation is acceptable.

49. TESTING
Do not run real Google Flow generations in automated tests.

Real generations consume credits.

Tests must use mocks.

Test:

FlowAutomationService mocked
Generation state machine
Queue behavior
Account locking
Retry logic
Idempotency
Video processing
Import

Create an optional manual integration test command:

npm run test:flow

This must require explicit environment/configuration.

Never run it as part of normal tests.

50. SAFE MANUAL FLOW TEST
Create documentation:

To test real Flow:

Connect Google Pro A.

Verify status CONNECTED.

Create a low-cost/test generation.

Select appropriate model.

Start generation.

Observe worker.

Verify Google Flow itself reports the generation/credit usage.

Verify video downloads into library.

Do not automatically run many generations.

51. LOGGING
Worker logs:

generationId
accountId
status
step
duration

Do NOT log:

cookies
tokens
passwords
authorization headers
browser local storage
session data

52. OBSERVABILITY
Generation detail should show:

Started
Browser connected
Flow opened
Submitted
Generating
Completed
Downloaded
Imported

If failed:

FAILED

Reason:

"Flow UI changed or generation could not be submitted."

Not:

raw stack trace.

53. FAILURE MODES
Handle:

Google login expired
Flow unavailable
Flow page timeout
Prompt input not found
Generate button not found
Generation failed
Generation still processing
Download failed
Video processing failed
Browser crashed
Account locked
Insufficient visible credits

Each should map to sensible UI status.

54. NO AUTOMATIC CREDIT BYPASS
Explicitly prohibit:

creating fake Google accounts

bypassing Flow quotas

bypassing CAPTCHA

bypassing subscription limits

rotating accounts purely to evade restrictions

exploiting internal/private APIs

stealing session cookies

automating security verification

using undocumented endpoints to circumvent access controls

The automation exists to automate legitimate use of the user's own connected Google accounts.

55. IMPORTANT: DO NOT ASSUME SELECTORS
Before implementing the actual Flow automation:

Open the real Flow UI in the browser.

Inspect current DOM/accessibility tree.

Determine:

prompt input

model selector

aspect ratio selector

generate button

generation status

resulting asset

download action

visible credit balance

Build selectors based on current UI.

If current UI cannot reliably expose an element:

implement a manual fallback.

Do not invent selectors and claim it works.

56. IMPLEMENTATION ORDER
Do NOT modify everything at once.

First:

STEP 1

Inspect existing repository.

STEP 2

Run existing MVP.

STEP 3

Add BullMQ + Redis.

STEP 4

Add automation worker skeleton.

STEP 5

Add persistent browser profiles.

STEP 6

Implement Google account connection.

STEP 7

Implement Test Connection.

STEP 8

Inspect real Google Flow UI.

STEP 9

Implement FlowAutomationService.

STEP 10

Implement one real generation path.

STEP 11

Download generated video.

STEP 12

Reuse VideoProcessor.

STEP 13

Connect result to VideoAsset.

STEP 14

Add generation event timeline.

STEP 15

Add account locking.

STEP 16

Add two-account support.

STEP 17

Add manual fallback.

STEP 18

Polish UI.

STEP 19

Tests.

STEP 20

Documentation.

After each step:

typecheck

lint

tests

build

Fix errors before moving on.

57. FIRST REAL GENERATION TEST
Do NOT attempt movie generation first.

The first real integration test must be:

Prompt:

"A cinematic close-up of a red fox walking through a snowy forest at sunrise, realistic natural lighting, slow camera movement."

Use:

short duration
simple prompt
one video

Purpose:

prove:

Google login
→ Flow
→ prompt
→ generation
→ credit usage
→ download
→ import

Only after this works should more complex workflows be added.

58. MOVIE SUPPORT
Do NOT build movie pipeline in this phase.

However, keep Project/Content/Generation structure compatible with future:

Movie
→ Scenes
→ Shots
→ Generations

Current:

Project
→ Content
→ Generation
→ Video

Future architecture can extend this.

Do not implement it now.

59. FUTURE AUTOMATION
Document future:

Phase 4:

Multi-shot generation

Phase 5:

Storyboard

Phase 6:

Character consistency

Phase 7:

Movie pipeline

Phase 8:

YouTube publishing

Phase 9:

TikTok/Instagram publishing

Phase 10:

Scheduling/analytics

Do not implement these now.

60. ACCEPTANCE CRITERIA
This phase is successful only when:

Account connection
User can add Google Pro A.

User can launch a persistent browser.

User manually logs into Google.

App detects authenticated Flow session.

Account shows CONNECTED.

Generation
User creates project.

User creates content.

User generates/edits prompt.

User selects Google Pro A.

User clicks Generate Video.

Job enters QUEUED.

Worker picks job.

Browser opens account A.

Flow opens.

Prompt is submitted.

Real Flow generation starts.

Google Flow consumes its own credits according to Google's rules.

Worker waits for result.

Worker downloads result.

Video is processed.

VideoAsset is created.

Generation becomes COMPLETED.

Video appears in Video Library.

User can preview/download.

Two accounts
User can connect Google Pro B.

User can select B for another generation.

Worker uses B's persistent profile.

A and B sessions remain isolated.

Failure fallback
If automation fails, user can Copy Prompt.

User can Open Flow manually.

User can Import Video manually.

61. MOST IMPORTANT REQUIREMENT
Do not report:

"Google Flow integration complete"

unless a real browser integration has actually been tested against the current Google Flow UI.

If you cannot test the real Flow UI in the current environment:

implement the worker architecture and account connection flow, then clearly mark:

FLOW AUTOMATION:
READY FOR REAL-UI SELECTOR VALIDATION

Do not fabricate success.

62. FINAL REPORT
After implementation, report only:

Existing functionality preserved.

New functionality.

Google account connection architecture.

Browser profile architecture.

Worker architecture.

Flow automation status.

Real generation test status.

How Flow credits are handled.

Environment variables.

How to run worker.

How to connect Google Pro A/B.

Known limitations.

Exact next step.

Remember:

The primary goal is not "more features".

The primary goal is proving this real loop:

GOOGLE ACCOUNT
→ GOOGLE FLOW
→ REAL VEO GENERATION
→ REAL FLOW CREDIT USAGE
→ VIDEO DOWNLOAD
→ VIDEO LIBRARY

Build this loop reliably before adding anything else.

Có một điểm cực kỳ quan trọng
Prompt này khác hẳn các prompt trước: lần này mình cho phép Playwright, bởi vì nếu mục tiêu là tận dụng credits nằm trong Flow của 2 tài khoản Pro, thì app phải thao tác trên chính Flow session của các tài khoản đó. Google hiện xác nhận Flow dùng Flow/AI credits của account và Pro có 1.000 monthly + 50 daily credits. 
G
Google Support
+1

Còn nếu agent đề xuất:

“Thêm VEO_API_KEY rồi generate video”

thì dừng nó lại. Đó là đường API riêng; Veo API hiện có pricing riêng theo giây và không phải cách dùng Flow credits của Google AI Pro. 
G
Google AI for Developers

Thứ tự mình muốn bạn ép agent làm
Phase 1: Repo/UI/Project/Video Library — đã làm.

Phase 2: Gemini → tự sinh script/prompt — đã làm.

Phase 3 này: Google login/session → Flow → Veo → credit thật → MP4.

Phase 4: batch/multi-shot + queue thông minh.

Phase 5: YouTube/TikTok/Instagram publishing.


Phase 6: Movie/short-film pipeline.

Đừng cho agent nhảy sang movie hoặc auto-post lúc này. Nếu chưa chứng minh được một video đơn giản đi từ Google Pro A → Flow → video thật → library, thì build thêm 20 module nữa cũng chưa giải quyết được core problem.