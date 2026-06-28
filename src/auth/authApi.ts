export type AuthUser = {
  id: string;
  account: string;
  nickname: string;
  role: string;
  status: string;
  avatarObjectKey: string | null;
  backgroundObjectKey: string | null;
  vipCardType?: "day" | "month" | "year" | "permanent" | null;
  vipExpiresAt?: string | null;
  currentTitle?: {
    code: string;
    name: string;
  } | null;
  growthLevel?: number | null;
  totalExp?: number | null;
  avatarUrl?: string | null;
  backgroundUrl?: string | null;
  imageUrlExpiresInSeconds?: number | null;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = AuthTokens & {
  user: AuthUser;
};

export type LoginRequest = {
  account: string;
  password: string;
};

export type RegisterRequest = LoginRequest & {
  nickname: string;
  registrationCode?: string;
};

export class AuthApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AuthApiError";
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

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string | null): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers
    }
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new AuthApiError(body?.error?.message ?? body?.message ?? "请求失败，请稍后再试。", response.status, body?.error?.code ?? body?.code);
  }

  return (body?.data ?? body) as T;
}

export const authApi = {
  register(payload: RegisterRequest) {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  login(payload: LoginRequest) {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  refresh(refreshToken: string) {
    return request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    });
  },
  logout(refreshToken: string, accessToken?: string | null) {
    return request<void>(
      "/auth/logout",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken })
      },
      accessToken
    );
  },
  me(accessToken: string) {
    return request<AuthUser>("/auth/me", { method: "GET" }, accessToken);
  }
};
