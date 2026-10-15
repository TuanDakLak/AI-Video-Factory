# 📐 Kiến Trúc Hệ Thống (AI Content Factory — Phase 2)

## 1. Mô hình Phân cấp Dữ liệu (Core Hierarchy)

```
Project (Dự án / Chủ đề lớn)
  │
  ├──► Content (Kịch bản / Ý tưởng do User hoặc Gemini AI tạo ra)
  │      │
  │      └──► Generation (Lệnh render Google Flow - liên kết Google Pro A/B)
  │             │
  │             └──► VideoAsset (File MP4 thực tế đã tải từ Google Flow & metadata)
```

---

## 2. Kiến Trúc Phân Lớp (Layered Architecture)

```
AI Content Factory
│
├── AI Provider Layer (Tùy chọn / Optional)
│   ├── IAIProvider (Interface)
│   ├── GeminiProvider (Sử dụng Google Gemini 2.0 Flash)
│   └── MockAIProvider (Dành cho Unit Test & Local Offline)
│
├── Video Generation Layer
│   ├── ManualFlowBridge (Quy trình 5 bước thủ công chuẩn Google Flow)
│   └── GoogleAccountTracker (Theo dõi phân bổ Google Pro A & Google Pro B)
│
├── Video Storage & Processing Layer
│   ├── IStorageProvider (Local Filesystem Abstraction)
│   └── VideoProcessor (Trích xuất metadata MP4: duration, resolution, filesize)
│
└── Social Publishing (Future Phase - Giữ kiến trúc mở)
```

---

## 3. Nguyên Tắc Thiết Kế Trọng Yếu

1. **Tách Biệt Trách Nhiệm Rõ Ràng**:
   * **Gemini AI**: Chịu trách nhiệm phân tích ý tưởng $\rightarrow$ Kịch bản $\rightarrow$ Video Prompt tối ưu $\rightarrow$ Tiêu đề / Thẻ Tags.
   * **Google Flow (Veo 3.1)**: Chịu trách nhiệm render video MP4 thực tế từ Video Prompt.
   * **AI Content Factory Studio**: Quản lý tập trung Dự án, Kịch bản, Lệnh render, Lưu trữ file và Thư viện video.
2. **Khả Năng Hoạt Động Độc Lập Không Cần AI (No-AI Fallback)**:
   * Toàn bộ hệ thống hoạt động 100% bình thường ngay cả khi không có `GEMINI_API_KEY`.
   * Người dùng có toàn quyền nhập prompt và chỉnh sửa bất kỳ trường dữ liệu nào.
