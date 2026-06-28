export type TitleSummary = {
  code: string;
  name: string;
  description: string;
  requiredLevel: number;
  requiredStreak: number;
  unlocked: boolean;
  equipped: boolean;
};

export type BadgeSummary = {
  code: string;
  name: string;
  description: string;
  requiredLevel: number;
  requiredStreak: number;
  requiredCheckInCount: number;
  unlocked: boolean;
  unlockedAt: string | null;
};

export type GrowthSummary = {
  totalExp: number;
  level: number;
  checkInCount: number;
  currentStreak: number;
  longestStreak: number;
  hasCheckedInToday: boolean;
  todayExpGain: number;
  currentTitle: TitleSummary | null;
  titles: TitleSummary[];
  badges: BadgeSummary[];
};

export type CheckInResult = GrowthSummary & {
  gainedExp: number;
};

export class GrowthApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "GrowthApiError";
    this.status = status;
    this.code = code;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

async function request<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...init.headers
    }
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new GrowthApiError(body?.error?.message ?? body?.message ?? "成长服务暂时不可用。", response.status, body?.error?.code ?? body?.code);
  }

  return body.data as T;
}

export const growthApi = {
  getMe(accessToken: string) {
    return request<GrowthSummary>("/growth/me", { method: "GET" }, accessToken);
  },
  checkIn(accessToken: string) {
    return request<CheckInResult>("/growth/check-in", { method: "POST" }, accessToken);
  },
  listTitles(accessToken: string) {
    return request<TitleSummary[]>("/growth/titles", { method: "GET" }, accessToken);
  },
  equipTitle(accessToken: string, code: string) {
    return request<GrowthSummary>(`/growth/titles/${encodeURIComponent(code)}/equip`, { method: "POST" }, accessToken);
  }
};
