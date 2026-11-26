export type Role = 'admin' | 'manager' | 'staff';

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface PageResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface Project {
  id: number;
  name: string;
  website_url: string;
  description: string;
  industry: string;
  main_keywords: string;
  secondary_keywords: string;
  introduction: string;
  logo_url: string;
  status: string;
  owner_id: number;
  created_at: string;
  updated_at: string;
}

export interface Platform {
  id: number;
  name: string;
  url: string;
  category: string;
  description: string;
  link_types: string;
  priority: string;
  status: string;
  notes: string;
}

export interface Profile {
  id: number;
  project_id: number;
  platform_id: number;
  name: string;
  profile_url: string;
  brand_name: string;
  description: string;
  verification_status: string;
  status: string;
}

export interface LinkRecord {
  id: number;
  project_id: number;
  platform_id: number;
  profile_id: number | null;
  source_url: string;
  target_url: string;
  link_type: string;
  anchor_text: string;
  status: string;
  recorded_at: string;
  last_checked_at: string | null;
  check_note: string;
  notes: string;
}

export interface Task {
  id: number;
  project_id: number;
  platform_id: number | null;
  assignee_id: number;
  title: string;
  description: string;
  category: string;
  due_date: string | null;
  priority: string;
  status: 'todo' | 'in_progress' | 'review' | 'completed';
  completed_at: string | null;
  position: number;
}

export interface ContentRecord {
  id: number;
  project_id: number;
  platform_id: number | null;
  title: string;
  description: string;
  keywords: string;
  target_url: string;
  status: string;
  is_used: number;
}

export interface Activity {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  message: string;
  created_at: string;
  user_id: number | null;
  user_name: string | null;
}

export interface DashboardData {
  totals: {
    projects: number;
    platforms: number;
    profiles: number;
    completed_profiles: number;
    in_progress_profiles: number;
    links: number;
    active_links: number;
    tasks: number;
    completed_tasks: number;
    completion_rate: number;
  };
  links_by_status: Array<{ status: string; count: number }>;
  platforms_by_category: Array<{ category: string; count: number }>;
  progress_by_day: Array<{ date: string; count: number }>;
  upcoming_tasks: Array<{
    id: number;
    title: string;
    due_date: string;
    priority: string;
    status: string;
    project_name: string;
    assignee_name: string;
  }>;
  latest_activity: Activity[];
}

export type RecordValue = string | number | boolean | null;
export type RecordData = Record<string, RecordValue>;
