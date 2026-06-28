import type { AuthUser } from "../auth/authApi";

export class ProfileApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ProfileApiError";
    this.status = status;
    this.code = code;
  }
}

export type UploadProfileImageResponse = {
  objectKey: string;
  url?: string | null;
  bucket?: string;
  contentType: string;
  size: number;
  user: AuthUser;
};

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
      Authorization: `Bearer ${accessToken}`,
      ...init.headers
    }
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ProfileApiError(body?.error?.message ?? body?.message ?? "请求失败，请稍后再试。", response.status, body?.error?.code ?? body?.code);
  }

  return (body?.data ?? body) as T;
}

export const profileApi = {
  getMe(accessToken: string) {
    return request<AuthUser>("/users/me", { method: "GET" }, accessToken);
  },
  updateMe(accessToken: string, payload: { nickname: string }) {
    return request<AuthUser>(
      "/users/me",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      },
      accessToken
    );
  },
  uploadAvatar(accessToken: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);

    return request<UploadProfileImageResponse>(
      "/uploads/avatar",
      {
        method: "POST",
        body: formData
      },
      accessToken
    );
  },
  uploadBackground(accessToken: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);

    return request<UploadProfileImageResponse>(
      "/uploads/background",
      {
        method: "POST",
        body: formData
      },
      accessToken
    );
  }
};
