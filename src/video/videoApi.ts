export type InspectVideoResponse = {
  roomVideoId: string;
  displayUrl: string;
  proxyUrl: string;
  expiresAt: string;
  contentType: string | null;
  contentLength: number | null;
};

export type PlaylistItem = {
  roomVideoId: string;
  displayUrl: string;
  proxyUrl: string;
  expiresAt: string;
  contentType: string | null;
  contentLength: number | null;
  createdAt: string;
  createdBy: string;
  position: number;
  displayName: string | null;
};

export class VideoApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "VideoApiError";
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

export function toAbsoluteApiUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const apiRoot = API_BASE_URL.replace(/\/api\/v1\/?$/, "");
  return `${apiRoot}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

export async function inspectVideo(accessToken: string, payload: { roomId: string; url: string; displayName?: string }) {
  const response = await fetch(`${API_BASE_URL}/video/inspect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new VideoApiError(
      body?.error?.message ?? body?.message ?? "视频导入失败。",
      response.status,
      body?.error?.code ?? body?.code
    );
  }

  return (body?.data ?? body) as InspectVideoResponse;
}

export async function addVideoLinks(accessToken: string, payload: { roomId: string; videos: Array<{ url: string; displayName?: string }> }) {
  const response = await fetch(`${API_BASE_URL}/video/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new VideoApiError(
      body?.error?.message ?? body?.message ?? "视频录入失败。",
      response.status,
      body?.error?.code ?? body?.code
    );
  }

  return (body?.data ?? body) as { items: PlaylistItem[] };
}

export async function getPlaylist(accessToken: string, roomId: string) {
  const response = await fetch(`${API_BASE_URL}/video/rooms/${encodeURIComponent(roomId)}/playlist`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new VideoApiError(
      body?.error?.message ?? body?.message ?? "视频列表加载失败。",
      response.status,
      body?.error?.code ?? body?.code
    );
  }

  return (body?.data ?? body) as { items: PlaylistItem[] };
}

export async function removePlaylistItem(accessToken: string, roomId: string, roomVideoId: string) {
  const response = await fetch(
    `${API_BASE_URL}/video/rooms/${encodeURIComponent(roomId)}/playlist/${encodeURIComponent(roomVideoId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new VideoApiError(
      body?.error?.message ?? body?.message ?? "视频删除失败。",
      response.status,
      body?.error?.code ?? body?.code
    );
  }

  return (body?.data ?? body) as { items: PlaylistItem[] };
}

export function videoImportErrorMessage(error: unknown) {
  if (!(error instanceof VideoApiError)) {
    return "视频导入失败，请稍后再试。";
  }

  const code = error.code ?? "";
  const message = error.message.toLowerCase();

  if (error.status === 429 || message.includes("rate limit")) {
    return "请求过于频繁，请稍后再试。";
  }

  if (code === "VALIDATION_FAILED" || message.includes("invalid") || message.includes("only http") || message.includes("credentials")) {
    return "URL 不合法，请输入 http 或 https 视频直链。";
  }

  if (message.includes("target is not allowed") || message.includes("redirect")) {
    return "该 URL 被安全策略拦截。";
  }

  if (message.includes("too large") || message.includes("size limit")) {
    return "文件过大，无法导入。";
  }

  if (message.includes("content type") || message.includes("not allowed")) {
    return "类型不支持，请换用受支持的视频直链。";
  }

  return error.message || "视频导入失败。";
}
