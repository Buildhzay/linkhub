# LINKHUB — Sơ đồ ERD

Nguồn dữ liệu chuẩn là [`server/src/schema.sql`](../server/src/schema.sql).

```mermaid
erDiagram
  USERS ||--o{ PROJECTS : "owner_id RESTRICT"
  USERS ||--o{ TASKS : "assignee_id RESTRICT"
  USERS ||--o{ CONTENTS : "created_by RESTRICT"
  USERS ||--o{ REPORTS : "created_by RESTRICT"
  USERS ||--o{ ACTIVITY_LOGS : "user_id SET NULL"
  PROJECTS ||--o{ PROFILES : "project_id CASCADE"
  PROJECTS ||--o{ LINKS : "project_id CASCADE"
  PROJECTS ||--o{ TASKS : "project_id CASCADE"
  PROJECTS ||--o{ CONTENTS : "project_id CASCADE"
  PROJECTS o|--o{ REPORTS : "project_id SET NULL"
  PLATFORMS ||--o{ PROFILES : "platform_id RESTRICT"
  PLATFORMS ||--o{ LINKS : "platform_id RESTRICT"
  PLATFORMS o|--o{ TASKS : "platform_id SET NULL"
  PLATFORMS o|--o{ CONTENTS : "platform_id SET NULL"
  PROFILES o|--o{ LINKS : "profile_id SET NULL"

  USERS {
    int id PK
    text username UK
    text email UK
    text password_hash
    text role
    int is_active
  }
  PROJECTS {
    int id PK
    text name
    text website_url
    text status
    int owner_id FK
  }
  PLATFORMS {
    int id PK
    text name UK
    text url
    text category
    text priority
    text status
  }
  PROFILES {
    int id PK
    int project_id FK
    int platform_id FK
    text profile_url
    text verification_status
    text status
  }
  LINKS {
    int id PK
    int project_id FK
    int platform_id FK
    int profile_id FK
    text source_url
    text target_url
    text status
  }
  TASKS {
    int id PK
    int project_id FK
    int platform_id FK
    int assignee_id FK
    text category
    text status
    int position
  }
  CONTENTS {
    int id PK
    int project_id FK
    int platform_id FK
    int created_by FK
    text status
    int is_used
  }
  REPORTS {
    int id PK
    int project_id FK
    int created_by FK
    text report_type
    text format
  }
  ACTIVITY_LOGS {
    int id PK
    int user_id FK
    text action
    text entity_type
    int entity_id
    text message
  }
```

## Quan hệ và hành vi xóa

- Dự án là gốc của hồ sơ, liên kết, nhiệm vụ và nội dung. Xóa dự án sẽ xóa dây chuyền các bản ghi con (`CASCADE`); báo cáo đã xuất được giữ lại với `project_id = NULL`.
- Nền tảng là danh mục dùng chung. Không thể xóa nền tảng đang được hồ sơ hoặc liên kết tham chiếu (`RESTRICT`); tác vụ và nội dung chỉ bỏ tham chiếu (`SET NULL`).
- Mỗi dự án có tối đa một hồ sơ cho mỗi nền tảng nhờ `UNIQUE(project_id, platform_id)`.
- Liên kết có thể gắn hồ sơ; khi xóa hồ sơ, liên kết vẫn còn và `profile_id` thành `NULL`. Ứng dụng còn kiểm tra hồ sơ và liên kết phải cùng dự án/nền tảng.
- Người dùng được tham chiếu bởi dự án, nhiệm vụ, nội dung, báo cáo và nhật ký. Các quan hệ nghiệp vụ dùng `RESTRICT`; nhật ký giữ lại khi người dùng bị xóa bằng `SET NULL`.

## Ràng buộc và chuẩn hóa

- `PRAGMA foreign_keys = ON` được bật khi mở database; các trạng thái, vai trò, loại và cờ boolean được ràng buộc bằng `CHECK`.
- Tên đăng nhập, email, tên nền tảng và cặp dự án/nền tảng của hồ sơ có ràng buộc `UNIQUE`.
- Bảng danh mục và bảng dữ liệu theo dự án được tách riêng; tên hiển thị và số liệu được truy vấn từ dữ liệu gốc thay vì lưu bản tổng hợp.
- `platforms.link_types` là chuỗi danh sách ngắn phân tách bằng dấu phẩy để giao diện hiển thị; đây là lựa chọn đơn giản hóa có chủ đích cho bản demo.
