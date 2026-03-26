const BASE = import.meta.env.VITE_API_URL || '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Types ---

export interface Project {
  id: string;
  name: string;
  url: string | null;
  source: string;
  notes: string | null;
  createdAt: string;
  cases?: ResearchCase[];
}

export interface ResearchCase {
  id: string;
  status: string;
  decision?: string;
  createdAt: string;
  scoring?: ScoringResult;
}

export interface ResearchStatus {
  caseId: string;
  status: string;
  sections: Record<string, { status: string; iteration: number; critic: string | null }>;
  progress: string;
}

export interface SectionReport {
  sectionType: string;
  iteration: number;
  content: Record<string, unknown>;
  critic: {
    evidenceQuality: number;
    logicQuality: number;
    completeness: number;
    verdict: string;
  } | null;
}

export interface ScoringResult {
  scores: Record<string, number>;
  totalScore: number;
  recommendation: string;
  reasoning: string;
  weakSections: string[];
  strongSections: string[];
}

export interface Report {
  caseId: string;
  project: { name: string; url: string };
  sections: SectionReport[];
  scoring: ScoringResult | null;
  status: string;
}

// --- API calls ---

export const api = {
  projects: {
    list: () => request<{ items: Project[]; total: number }>('/projects'),
    get: (id: string) => request<Project>(`/projects/${id}`),
    create: (data: { name: string; url?: string; source: string; notes?: string }) =>
      request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  },
  research: {
    start: (projectId: string) =>
      request<{ caseId: string; status: string }>(`/projects/${projectId}/research`, { method: 'POST' }),
    status: (projectId: string, caseId: string) =>
      request<ResearchStatus>(`/projects/${projectId}/research/${caseId}/status`),
    report: (projectId: string, caseId: string) =>
      request<Report>(`/projects/${projectId}/research/${caseId}/report`),
    decide: (projectId: string, caseId: string, decision: string, comment?: string) =>
      request(`/projects/${projectId}/research/${caseId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, comment }),
      }),
    stop: (projectId: string, caseId: string) =>
      request(`/projects/${projectId}/research/${caseId}/stop`, { method: 'POST' }),
    restart: (projectId: string, caseId: string) =>
      request(`/projects/${projectId}/research/${caseId}/restart`, { method: 'POST' }),
  },
};

// Archive
export const archiveApi = {
  archive: (id: string) =>
    request(`/projects/${id}/archive`, { method: 'PATCH' }),
  unarchive: (id: string) =>
    request(`/projects/${id}/unarchive`, { method: 'PATCH' }),
  listArchived: () =>
    request<{ items: Project[]; total: number }>('/projects?archived=true'),
};
