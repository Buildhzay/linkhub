# LINKHUB

LINKHUB là ứng dụng demo nội bộ để quản lý dự án, nền tảng, hồ sơ, liên kết đã ghi nhận, công việc, nội dung, báo cáo và nhật ký hoạt động. Ứng dụng **không** tạo tài khoản bên ngoài, đăng bài hay tự đặt liên kết. Kiểm tra liên kết chỉ xác nhận cú pháp URL, không truy cập Internet.

## Yêu cầu

- Node.js 22.13 trở lên (`node:sqlite` dùng được mà không cần cờ thử nghiệm từ Node 22.13; backend không cần cài package).
- npm và kết nối Internet để cài dependency và chạy giao diện React.

Kiểm tra phiên bản trong PowerShell:

```powershell
node -v
npm -v
```

## Chạy trên Windows

### 1. Cấu hình và chạy backend

Mở PowerShell:

```powershell
Set-Location D:\lienket\server
Copy-Item .env.example .env
notepad .env
```

Trong `server\.env`, đặt `JWT_SECRET` thành chuỗi bí mật riêng dài ít nhất 24 ký tự, lưu file rồi chạy:

```powershell
npm run seed
npm start
```

API chạy tại `http://127.0.0.1:4000`. Mở `http://127.0.0.1:4000/api/health`; server hoạt động sẽ trả `{"status":"ok","database":"connected"}`. Giữ cửa sổ này mở.

SQLite được tạo tại `server\data\linkhub.sqlite`. Chạy seed lại không nhân đôi dữ liệu demo. Không dùng mật khẩu demo hoặc khóa bí mật mẫu cho môi trường thật.

Seed chỉ điền database mới/đang trống; database đã có người dùng sẽ được giữ nguyên. Dữ liệu mẫu tiếng Việt và mốc thời gian mới vì vậy chỉ xuất hiện trong database mới. Muốn thử dữ liệu mới mà không ảnh hưởng database hiện tại, hãy dừng server, đổi `DATABASE_PATH` trong `server\.env` sang một file mới như `./data/linkhub-v2.sqlite`, chạy seed và khởi động lại. Khôi phục giá trị cũ trong `.env` để dùng lại database trước đó.

Không chia sẻ bản nén chứa `server\.env` hoặc `server\data\*.sqlite`: chúng có thể chứa khóa bí mật và dữ liệu cục bộ. Chỉ đưa `.env.example` vào gói bàn giao; `.gitignore` không tự loại các tệp này khỏi ZIP tạo thủ công.

### 2. Cài và chạy giao diện

Mở cửa sổ PowerShell thứ hai:

```powershell
Set-Location D:\lienket\client
npm install
npm run dev
```

Mở **http://localhost:5173** hoặc **http://127.0.0.1:5173**. Cả hai Vite origin mặc định đều được backend cho phép qua CORS. Vite bind trên máy cục bộ; API client mặc định gọi `http://127.0.0.1:4000/api`.

### 3. Đăng nhập

| Vai trò | Tên đăng nhập | Mật khẩu |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Manager | `manager` | `Manager@123` |
| Staff | `staff` | `Staff@123` |

Trang đăng nhập có nút điền nhanh. Hãy đổi mật khẩu demo trước khi dùng database ngoài mục đích trình diễn.

### Script Windows (tùy chọn)

Từ `D:\lienket`, chạy `setup.bat` một lần để kiểm tra Node, tạo `.env`, seed database và cài package frontend. Sau đó chạy `start-server.bat` và `start-client.bat` trong hai cửa sổ riêng. Các script chỉ là tiện ích và chưa được xác minh trên một máy Windows vật lý; nếu gặp lỗi, dùng các lệnh PowerShell ở trên.

## Build và kiểm thử

Test backend dùng database SQLite tạm:

```powershell
Set-Location D:\lienket\server
npm test
```

Kiểm tra TypeScript strict và tạo bản build frontend:

```powershell
Set-Location D:\lienket\client
npm run build
```

Frontend hiện chạy bằng Vite; backend **không** phục vụ thư mục `client/dist`. Cần chạy Vite cùng lúc với API.

Bộ test API bao gồm xác thực/phân quyền, CRUD, Dashboard, xuất báo cáo, validate đầu vào, token giả mạo, request lỗi, dữ liệu kiểu SQL injection, ghi đồng thời, nhật ký và seed idempotent. Các test và frontend build cần được chạy trong môi trường có Node/npm.

## Chức năng chính

- Quản lý dự án, nền tảng, hồ sơ, liên kết, nhiệm vụ, nội dung, người dùng, báo cáo và nhật ký.
- Dashboard với số liệu và biểu đồ lấy từ database.
- Kanban bốn cột; Staff chỉ cập nhật được nhiệm vụ được giao.
- Xuất báo cáo Excel/PDF; lưu lịch sử xuất và ghi nhật ký.
- Server kiểm tra quyền; việc ẩn nút trên giao diện chỉ nhằm thuận tiện sử dụng.

Báo cáo tính **nền tảng đã triển khai** là số nền tảng có hồ sơ vừa hoàn thành vừa được đánh dấu xác minh trong hệ thống (đây là xác minh do người dùng ghi nhận, không phải xác minh trực tuyến). Báo cáo hiển thị cả **tỷ lệ hoàn thành dự án** (dự án có trạng thái `Hoàn thành` / tổng dự án trong phạm vi) và **tỷ lệ hoàn thành công việc** (công việc ở trạng thái `Hoàn thành` / tổng công việc trong phạm vi). Báo cáo theo thời gian có thêm bảng xu hướng theo tuần.

Xem [kịch bản trình diễn](docs/03-KICH-BAN-TRINH-DIEN.md), [ERD](docs/02-ERD.md) và [tài liệu phân tích](docs/01-PHAN-TICH.md).

## Khắc phục sự cố

| Lỗi | Cách xử lý |
|---|---|
| Không nhận `node` hoặc `npm` | Cài Node.js 22.13+ rồi mở lại PowerShell. |
| `No such built-in module: node:sqlite` | Node cũ hơn 22.13; cập nhật Node và kiểm tra `node -v`. |
| Server báo `JWT_SECRET` quá ngắn | Đặt giá trị ít nhất 24 ký tự trong `server\.env`, rồi khởi động lại backend. |
| `EADDRINUSE` trên cổng 4000 | Dừng tiến trình đang chiếm cổng hoặc đổi `PORT` trong `server\.env`, rồi khởi động lại. |
| Trình duyệt báo CORS | Mặc định cả `http://localhost:5173` và `http://127.0.0.1:5173` đều được phép. Nếu đổi cổng hoặc host, cập nhật `CORS_ORIGINS` trong `server\.env` rồi khởi động lại API. |
| Frontend báo `Failed to fetch` | Chạy backend trong cửa sổ riêng và kiểm tra `http://127.0.0.1:4000/api/health`. |
| `npm install` thất bại | Kiểm tra Internet/proxy rồi chạy lại trong `client`. Backend không cần `npm install`. |
| PDF không có đầy đủ dấu tiếng Việt | PDF dùng font Helvetica chuẩn; dấu tiếng Việt được lược bỏ, còn `đ/Đ` lần lượt xuất thành `d/D`. Excel giữ được tiếng Việt. |
| Tài khoản demo bị khóa tạm | Nhiều lần đăng nhập sai sẽ bị giới hạn trong 5 phút; chờ hoặc khởi động lại server cục bộ. |

## Giới hạn của bản demo

- Không tích hợp API nền tảng bên ngoài; người dùng tự tạo và quản lý hồ sơ bên ngoài.
- Kiểm tra liên kết là mô phỏng, chỉ xác thực cú pháp URL; không kiểm tra khả năng truy cập hay vị trí liên kết.
- PDF lược bỏ dấu tiếng Việt (đ/Đ thành d/D); Excel giữ UTF-8.
- Chưa có HTTPS, quản lý phiên sản xuất hay kiểm thử frontend trong trình duyệt. Token được lưu trong localStorage.
- Backend dùng Node built-ins và SQLite thay vì Express/ExcelJS do môi trường xây dựng ban đầu không cài được package.
- Ứng dụng hướng tới demo cục bộ/nhóm nhỏ, không phải bản triển khai quy mô sản xuất.

## Tình trạng bàn giao

Môi trường tạo mã hiện tại không có lệnh `node` hoặc `npm`, vì vậy chưa chạy được API tests hay Vite build tại đây. Hãy chạy các lệnh ở trên trước khi sử dụng. Microsoft Excel và các file `.bat` cũng chưa được kiểm thử trên máy Windows vật lý.

