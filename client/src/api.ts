import type {
  Activity,
  DashboardData,
  PageResult,
  Platform,
  Profile,
  Project,
  RecordData,
  Task,
  User,
  ContentRecord
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000/api';
const TOKEN_KEY = 'linkhub_access_token';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('linkhub:unauthorized'));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(body?.error || `Yêu cầu thất bại (${response.status})`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value) !== '') query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export const api = {
  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    return request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },
  me: () => request<{ user: User }>('/auth/me'),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST', body: '{}' }),
  dashboard: () => request<DashboardData>('/dashboard'),
  list<T>(resource: string, params: Record<string, string | number | undefined> = {}) {
    return request<PageResult<T>>(`/${resource}${queryString(params)}`);
  },
  get<T>(resource: string, id: number) {
    return request<T>(`/${resource}/${id}`);
  },
  create<T>(resource: string, data: RecordData) {
    return request<T>(`/${resource}`, { method: 'POST', body: JSON.stringify(data) });
  },
  update<T>(resource: string, id: number, data: RecordData) {
    return request<T>(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
  remove(resource: string, id: number) {
    return request<{ message: string }>(`/${resource}/${id}`, { method: 'DELETE' });
  },
  checkLink: (id: number) => request<{
    id: number;
    status: string;
    last_checked_at: string;
    check_note: string;
  }>(`/links/${id}/check`, {
    method: 'POST',
    body: '{}'
  }),
  linkStats: () => request<{
    by_status: Array<{ status: string; count: number }>;
    by_platform: Array<{ platform_id: number; platform: string; count: number; active: number }>;
  }>('/links/stats'),
  exportReport: async (data: {
    report_type: 'overview' | 'project' | 'platform' | 'period';
    format: 'xlsx' | 'pdf';
    project_id?: number;
    platform_id?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<Blob> => {
    const token = getToken();
    const response = await fetch(`${API_BASE}/reports/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(data)
    });
    if (response.status === 401) {
      clearToken();
      window.dispatchEvent(new Event('linkhub:unauthorized'));
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new ApiError(body?.error || 'Không thể xuất báo cáo', response.status);
    }
    return response.blob();
  }
};

export type { Activity, DashboardData, Platform, Profile, Project, Task, User, ContentRecord };
