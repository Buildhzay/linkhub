# Kịch bản trình diễn LINKHUB (10–12 phút)

## Chuẩn bị

1. Chạy `npm run seed` trong `server` nếu cần dữ liệu demo.
2. Khởi động API bằng `npm start`; ở cửa sổ khác chạy `npm run dev` trong `client`.
3. Mở `http://localhost:5173`. Tài khoản demo là `admin / Admin@123`, `manager / Manager@123` và `staff / Staff@123`.
4. Chỉ dùng dữ liệu demo; không nhập thông tin tài khoản hoặc website thật. Dừng API bằng Ctrl+C sau buổi trình diễn.

## 1. Đăng nhập và quyền truy cập (1 phút)

- Đăng nhập bằng Manager, chỉ ra vai trò và menu điều hướng.
- Đăng xuất rồi đăng nhập Staff. Menu Báo cáo và Người dùng không hiển thị; thử mở `/reports` trực tiếp để thấy quyền trang được kiểm tra.
- Nhấn mạnh: server mới là nơi quyết định quyền; ẩn menu ở frontend không phải biện pháp bảo mật.

## 2. Dashboard (1–2 phút)

- Chỉ các thẻ tổng quan và bốn biểu đồ: tiến độ, tỷ lệ hoàn thành, danh mục nền tảng, trạng thái liên kết.
- Xem danh sách công việc gần hạn và nhật ký gần đây.
- Nêu rõ số liệu được truy vấn từ database demo.

## 3. Dự án và hồ sơ (2 phút)

- Mở Dự án, vào trang chi tiết của một dự án mẫu, xem các tab tổng quan/hồ sơ/liên kết/công việc/nội dung.
- Tạo dự án demo mới với website thuộc miền `.example`.
- Thêm một hồ sơ nền tảng cho dự án; thử tạo hồ sơ trùng nền tảng để thấy ràng buộc duy nhất.

## 4. Liên kết (1–2 phút)

- Tạo liên kết mẫu gắn với dự án và nền tảng.
- Nhấn “Kiểm tra (mô phỏng)”. Đọc thông báo: ứng dụng chỉ xác thực định dạng URL, không truy cập Internet và không tự đặt trạng thái hoạt động.
- Cập nhật trạng thái thủ công nếu cần cho kịch bản.

## 5. Kanban (1–2 phút)

- Đăng nhập Manager, tạo công việc demo hoặc chọn thẻ có sẵn; kéo thẻ qua các cột.
- Đăng nhập Staff và cập nhật trạng thái công việc được giao. Staff không được sửa nội dung công việc hay thay đổi công việc người khác.

## 6. Nội dung và báo cáo (2 phút)

- Mở Nội dung và xem các trạng thái draft/review/ready/published.
- Đăng nhập Manager, tạo báo cáo tổng hợp hoặc theo dự án rồi tải Excel và PDF.
- Cho biết Excel giữ Unicode; PDF hiện bỏ dấu tiếng Việt do font tích hợp.
- Xem lịch sử xuất báo cáo.

## 7. Nhật ký và người dùng (1 phút)

- Mở Nhật ký, chỉ ra người thực hiện, thao tác và thời gian.
- Đăng nhập Admin, mở Người dùng. Tránh vô hiệu hóa tài khoản đang cần cho phần demo tiếp theo.

## Thông điệp kết thúc

- LINKHUB là công cụ ghi nhận và quản lý nội bộ; không tự đăng nhập, xuất bản nội dung hay tạo liên kết trên nền tảng bên ngoài.
- Link check là mô phỏng; việc quản lý tài khoản ngoài hệ thống và xác minh liên kết do con người thực hiện theo quy định của nền tảng.
- Đây là bản demo cục bộ, chưa được kiểm thử frontend trong trình duyệt hoặc xác nhận trên Microsoft Excel thật.
