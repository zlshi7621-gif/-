export type RoomMember = {
  userId: string;
  account: string;
  nickname: string;
  role: "owner" | "admin" | "member";
  userRole?: "user" | "admin" | "developer" | "super_developer";
  joinedAt: string;
  online?: boolean;
};

export type RoomDeveloperControl = {
  active: boolean;
  controllerUserId: string | null;
  previousOwnerId: string | null;
};

export type RoomSummary = {
  id: string;
  title: string;
  status: string;
  ownerId: string;
  owner?: {
    id: string;
    account: string;
    nickname: string;
  };
  currentUserRole: "owner" | "admin" | "member" | null;
  developerControl?: RoomDeveloperControl;
  members: RoomMember[];
  currentVideo?: {
    roomVideoId: string;
    displayUrl: string;
    proxyUrl: string;
    expiresAt: string;
    contentType: string | null;
    contentLength: number | null;
    createdAt: string;
    createdBy: string;
  } | null;
  videos?: Array<{
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
  }>;
};

export type RoomChatMessage = {
  id: string;
  roomId: string;
  senderId: string;
  senderNickname: string;
  content: string;
  createdAt: string;
  status: "visible" | "deleted";
  pending?: boolean;
};

export class RoomApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "RoomApiError";
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
    throw new RoomApiError(body?.error?.message ?? body?.message ?? "房间请求失败。", response.status, body?.error?.code ?? body?.code);
  }

  return body.data as T;
}

export const roomApi = {
  createRoom(accessToken: string, title: string) {
    return request<RoomSummary>(
      "/rooms",
      {
        method: "POST",
        body: JSON.stringify({ title })
      },
      accessToken
    );
  },
  listMyRooms(accessToken: string) {
    return request<RoomSummary[]>("/rooms", { method: "GET" }, accessToken);
  },
  joinRoom(accessToken: string, roomId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/join`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  developerEnter(accessToken: string, roomId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/developer-enter`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  developerTakeover(accessToken: string, roomId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/developer-takeover`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  developerRelease(accessToken: string, roomId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/developer-release`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  getRoom(accessToken: string, roomId: string) {
    return request<RoomSummary>(`/rooms/${encodeURIComponent(roomId)}`, { method: "GET" }, accessToken);
  },
  getMembers(accessToken: string, roomId: string) {
    return request<RoomMember[]>(`/rooms/${encodeURIComponent(roomId)}/members`, { method: "GET" }, accessToken);
  },
  getRecentChats(accessToken: string, roomId: string, limit = 50) {
    return request<RoomChatMessage[]>(
      `/rooms/${encodeURIComponent(roomId)}/chats?limit=${encodeURIComponent(String(limit))}`,
      { method: "GET" },
      accessToken
    );
  },
  leaveRoom(accessToken: string, roomId: string) {
    return request<{ left: boolean }>(
      `/rooms/${encodeURIComponent(roomId)}/leave`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  closeRoom(accessToken: string, roomId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/close`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  addAdmin(accessToken: string, roomId: string, userId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/admins`,
      {
        method: "POST",
        body: JSON.stringify({ userId })
      },
      accessToken
    );
  },
  removeAdmin(accessToken: string, roomId: string, userId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/admins/${encodeURIComponent(userId)}`,
      {
        method: "DELETE"
      },
      accessToken
    );
  },
  kickMember(accessToken: string, roomId: string, userId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/kick`,
      {
        method: "POST",
        body: JSON.stringify({ userId })
      },
      accessToken
    );
  },
  transferOwner(accessToken: string, roomId: string, userId: string) {
    return request<RoomSummary>(
      `/rooms/${encodeURIComponent(roomId)}/transfer-owner`,
      {
        method: "POST",
        body: JSON.stringify({ userId })
      },
      accessToken
    );
  }
};
