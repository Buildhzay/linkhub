# LINKHUB — Phân tích và thiết kế

## Mục tiêu

LINKHUB là ứng dụng demo nội bộ để theo dõi sự hiện diện số của nhiều dự án trong một giao diện: danh mục nền tảng, hồ sơ, liên kết đã ghi nhận, công việc, nội dung, báo cáo và nhật ký hoạt động. Ứng dụng không đăng nhập vào nền tảng bên ngoài, không tự đăng bài và không tự tạo liên kết.

## Vai trò

| Vai trò | Phạm vi chính |
|---|---|
| Admin | Quản lý người dùng và toàn bộ dữ liệu, xem báo cáo và nhật ký |
| Manager | Quản lý dự án và tài nguyên, phân công công việc, xem/xuất báo cáo |
| Staff | Xem dữ liệu công việc, cập nhật trạng thái nhiệm vụ được giao, thao tác tài nguyên được phép và xem nhật ký của mình |

Máy chủ kiểm tra quyền với vai trò và trạng thái tài khoản đọc từ SQLite. Giao diện chỉ điều chỉnh menu và nút theo vai trò, không thay thế kiểm tra phía server.

## Phân hệ

1. Xác thực và quản lý người dùng.
2. Dự án, nền tảng và hồ sơ nền tảng.
3. Liên kết đã ghi nhận; thao tác kiểm tra URL chỉ xác nhận cú pháp, không truy cập Internet.
4. Nhiệm vụ Kanban gồm To do, In progress, Review và Completed.
5. Nội dung được chuẩn bị thủ công.
6. Dashboard, báo cáo Excel/PDF và lịch sử xuất báo cáo.
7. Nhật ký hoạt động có người thực hiện và thời gian.

## Kiến trúc hiện thực

```text
React + TypeScript + Vite
        │ HTTP JSON / tải file
        ▼
Node.js HTTP API ── SQLite (node:sqlite)
        │
        ├── Xác thực JWT HS256, mật khẩu scrypt
        ├── Kiểm tra đầu vào, quyền và quan hệ dữ liệu
        └── Tạo XLSX/PDF bằng Node built-ins
```

Backend dùng các module tích hợp của Node.js nên không cần cài package. Frontend dùng React, TypeScript, Vite, Tailwind CSS và Recharts; cần cài dependency npm. Xem [ERD](./02-ERD.md) để biết cấu trúc dữ liệu.

## Nguyên tắc và giới hạn an toàn

- Dữ liệu demo dùng tên miền `.example`, không đại diện cho tài khoản hoặc website thật.
- Link check không gửi request đến URL; kết quả không được coi là xác minh hoạt động.
- Lưu mật khẩu dưới dạng scrypt có salt; token phải được ký bằng bí mật cấu hình trong `.env`.
- Dùng câu lệnh SQLite tham số hóa và khóa ngoại để bảo vệ toàn vẹn dữ liệu.
- Không tự động tạo tài khoản bên ngoài, gửi nội dung hay đặt liên kết.
- Đây là demo cục bộ; không có HTTPS, chưa thiết kế cho tải lớn và chưa có frontend test trình duyệt.

## Cấu trúc dự án

- `server/src/schema.sql`: bảng, ràng buộc và chỉ mục SQLite.
- `server/src/db.js`: mở database và seed dữ liệu demo.
- `server/src/auth.js`: hash mật khẩu và ký/xác minh token.
- `server/src/index.js`: HTTP API, quyền truy cập, CRUD, thống kê, báo cáo và nhật ký.
- `server/tests/`: kiểm thử API và các trường hợp biên.
- `client/src/`: giao diện React, API client, xác thực, layout và các trang.
- `docs/`: phân tích, ERD và kịch bản trình diễn.

## Kế hoạch triển khai

| Giai đoạn | Nội dung |
|---|---|
| 1 | Phân tích yêu cầu, kiến trúc và mô hình dữ liệu |
| 2 | Schema SQLite, kết nối, bảo mật mật khẩu và dữ liệu demo |
| 3 | API, CRUD, xác thực, phân quyền, dashboard và báo cáo |
| 4 | Giao diện React/TypeScript |
| 5 | Kiểm thử API, dữ liệu sai, quyền và trường hợp biên |
| 6 | Tài liệu Windows, kịch bản demo và gói bàn giao |

## Công nghệ ưu tiên và khác biệt

Ứng dụng dùng Node.js thuần và tự tạo Excel/PDF thay vì Express/ExcelJS do môi trường xây dựng ban đầu không cài được package. Frontend vẫn theo hướng React + TypeScript + Tailwind CSS + Recharts. PDF dùng font chuẩn không có glyph tiếng Việt đầy đủ nên bỏ dấu; Excel giữ UTF-8.
