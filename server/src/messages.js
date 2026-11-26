const fieldLabels = {
  name: 'Tên',
  website_url: 'Địa chỉ website',
  url: 'Địa chỉ URL',
  profile_url: 'URL hồ sơ',
  source_url: 'URL nguồn',
  target_url: 'URL đích',
  avatar_url: 'URL ảnh đại diện',
  logo_url: 'URL logo',
  project_id: 'Dự án',
  platform_id: 'Nền tảng',
  profile_id: 'Hồ sơ',
  owner_id: 'Chủ dự án',
  assignee_id: 'Người phụ trách',
  position: 'Vị trí',
  is_used: 'Trạng thái sử dụng',
  due_date: 'Ngày hết hạn',
  start_date: 'Ngày bắt đầu',
  end_date: 'Ngày kết thúc',
  report_type: 'Loại báo cáo',
  format: 'Định dạng',
  role: 'Vai trò',
  email: 'Email',
  password: 'Mật khẩu',
  username: 'Tên đăng nhập',
  full_name: 'Họ và tên',
  status: 'Trạng thái',
  priority: 'Mức ưu tiên',
  category: 'Danh mục'
};

const entityLabels = {
  Project: 'dự án',
  Platform: 'nền tảng',
  Profile: 'hồ sơ',
  Link: 'liên kết',
  Task: 'công việc',
  Content: 'nội dung',
  User: 'người dùng',
  Report: 'báo cáo',
  Endpoint: 'đường dẫn API',
  Collection: 'danh mục dữ liệu'
};

const fixedMessages = new Map(Object.entries({
  'page and limit must be positive integers': 'Trang và số lượng mỗi trang phải là số nguyên dương.',
  'Request body exceeds 1 MB': 'Dữ liệu gửi lên vượt quá giới hạn 1 MB.',
  'Request body must be a valid JSON object': 'Dữ liệu gửi lên phải là một đối tượng JSON hợp lệ.',
  'You do not have permission to perform this action': 'Bạn không có quyền thực hiện thao tác này.',
  'sort must be a supported field': 'Trường sắp xếp không được hỗ trợ.',
  'direction must be asc or desc': 'Chiều sắp xếp phải là tăng dần hoặc giảm dần.',
  'profile_id does not reference an existing profile': 'Hồ sơ được chọn không tồn tại.',
  'The linked profile must belong to the same project and platform': 'Hồ sơ liên kết phải thuộc cùng dự án và nền tảng.',
  'A referenced project, platform, or user does not exist': 'Dự án, nền tảng hoặc người dùng được chọn không tồn tại.',
  'Malformed request URL': 'Địa chỉ yêu cầu không đúng định dạng.',
  'username and password are required': 'Vui lòng nhập tên đăng nhập và mật khẩu.',
  'Too many failed sign-in attempts; try again in five minutes': 'Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút.',
  'Invalid username or password': 'Tên đăng nhập hoặc mật khẩu không chính xác.',
  'A valid Bearer token is required': 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  'User is no longer active': 'Tài khoản này đã bị vô hiệu hóa.',
  'format must be xlsx or pdf': 'Định dạng báo cáo phải là Excel hoặc PDF.',
  'start_date must be on or before end_date': 'Ngày bắt đầu phải trước hoặc trùng ngày kết thúc.',
  'report_type must be overview, project, platform, or period': 'Loại báo cáo không hợp lệ.',
  'project_id is required for a project report': 'Vui lòng chọn dự án cho báo cáo theo dự án.',
  'platform_id is required for a platform report': 'Vui lòng chọn nền tảng cho báo cáo theo nền tảng.',
  'start_date or end_date is required for a period report': 'Vui lòng chọn ít nhất một mốc thời gian cho báo cáo.',
  'role must be admin, manager, or staff': 'Vai trò phải là Quản trị viên, Quản lý hoặc Nhân viên.',
  'email must be valid': 'Địa chỉ email không hợp lệ.',
  'password must contain 10 to 256 characters': 'Mật khẩu phải có từ 10 đến 256 ký tự.',
  'Username or email is already in use': 'Tên đăng nhập hoặc email đã được sử dụng.',
  'Invalid role': 'Vai trò không hợp lệ.',
  'No supported fields to update': 'Không có trường hợp lệ để cập nhật.',
  'You cannot deactivate your own account': 'Bạn không thể tự vô hiệu hóa tài khoản của mình.',
  'You cannot delete your own account': 'Bạn không thể tự xóa tài khoản của mình.',
  'User is referenced by projects, tasks, content, reports, or activity': 'Người dùng đang được dữ liệu khác tham chiếu nên không thể xóa.',
  'You can only view tasks assigned to you': 'Bạn chỉ có thể xem công việc được giao cho mình.',
  'No supported fields provided': 'Không có trường dữ liệu được hỗ trợ.',
  'A record with these values already exists': 'Bản ghi có thông tin này đã tồn tại.',
  'Staff may update task status or position only': 'Nhân viên chỉ có thể cập nhật trạng thái hoặc vị trí công việc.',
  'This record is referenced by other data and cannot be deleted': 'Bản ghi đang được dữ liệu khác sử dụng nên không thể xóa.',
  'is_used must be a boolean': 'Trạng thái sử dụng phải là giá trị bật hoặc tắt.',
  'Completed or verified profiles require a profile URL': 'Hồ sơ hoàn thành hoặc đã xác minh phải có URL hồ sơ.',
  'Source and target URLs must be different': 'URL nguồn và URL đích phải khác nhau.'
}));

export function localizeError(message) {
  if (fixedMessages.has(message)) return fixedMessages.get(message);

  const label = (field) => fieldLabels[field] || 'Trường dữ liệu';
  let match = message.match(/^(.+) is required$/);
  if (match) return `${label(match[1])} là bắt buộc.`;
  match = message.match(/^(.+) cannot be empty$/);
  if (match) return `${label(match[1])} không được để trống.`;
  match = message.match(/^(.+) cannot be null$/);
  if (match) return `${label(match[1])} không được để trống.`;
  match = message.match(/^(.+) must be a URL$/);
  if (match) return `${label(match[1])} phải là một URL.`;
  match = message.match(/^(.+) must be a valid URL$/);
  if (match) return `${label(match[1])} không đúng định dạng URL.`;
  match = message.match(/^(.+) must use HTTP or HTTPS$/);
  if (match) return `${label(match[1])} phải dùng giao thức HTTP hoặc HTTPS.`;
  match = message.match(/^(.+) must use YYYY-MM-DD format$/);
  if (match) return `${label(match[1])} phải có định dạng YYYY-MM-DD.`;
  match = message.match(/^(.+) must be at most (\d+) characters$/);
  if (match) return `${label(match[1])} không được vượt quá ${match[2]} ký tự.`;
  match = message.match(/^(.+) must be a non-empty string$/);
  if (match) return `${label(match[1])} phải là nội dung không để trống.`;
  match = message.match(/^(.+) must be a string$/);
  if (match) return `${label(match[1])} không đúng kiểu dữ liệu.`;
  match = message.match(/^(.+) must be a boolean$/);
  if (match) return `${label(match[1])} phải là giá trị bật hoặc tắt.`;
  match = message.match(/^(.+) must be a positive integer$/);
  if (match) return `${label(match[1])} phải là số nguyên dương.`;
  match = message.match(/^(.+) must be a non-negative integer$/);
  if (match) return `${label(match[1])} phải là số nguyên không âm.`;
  match = message.match(/^(.+) must be one of:/);
  if (match) return `${label(match[1])} có giá trị không hợp lệ.`;
  match = message.match(/^(.+) not found$/);
  if (match) {
    const key = match[1][0].toUpperCase() + match[1].slice(1);
    return `Không tìm thấy ${entityLabels[match[1]] || entityLabels[key] || 'dữ liệu yêu cầu'}.`;
  }
  match = message.match(/^(.+) deleted$/);
  if (match) {
    const key = match[1][0].toUpperCase() + match[1].slice(1);
    return `Đã xóa ${entityLabels[match[1]] || entityLabels[key] || 'dữ liệu'}.`;
  }
  return 'Không thể xử lý yêu cầu. Vui lòng kiểm tra dữ liệu và thử lại.';
}
