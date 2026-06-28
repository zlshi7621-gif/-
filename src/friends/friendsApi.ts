export type FriendUser = {
  id: string;
  account: string;
  nickname: string;
  avatarObjectKey?: string | null;
  avatarUrl?: string | null;
  friendshipStatus?: "friend" | "none" | string;
  requestStatus?: "incoming_pending" | "outgoing_pending" | "none" | string;
};

export type FriendSummary = FriendUser & {
  friendshipId?: string;
  friendId?: string;
  status?: string;
  createdAt?: string;
};

export type FriendRequestSummary = {
  id: string;
  fromUserId: string;
  toUserId: string;
  direction: "incoming" | "outgoing" | string;
  status: "pending" | "accepted" | "rejected" | "cancelled" | string;
  fromUser?: FriendUser;
  toUser?: FriendUser;
  createdAt?: string;
  handledAt?: string | null;
};

export type RoomInvitationSummary = {
  id: string;
  roomId: string;
  fromUserId: string;
  toUserId: string;
  direction: "incoming" | "outgoing" | string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled" | string;
  room?: {
    id: string;
    title: string;
    status: string;
  };
  fromUser?: FriendUser;
  toUser?: FriendUser;
  createdAt?: string;
  expiresAt?: string | null;
};

export class FriendsApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "FriendsApiError";
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
    throw new FriendsApiError(body?.error?.message ?? body?.message ?? "好友服务请求失败。", response.status, body?.error?.code ?? body?.code);
  }

  return (body?.data ?? body) as T;
}

export const friendsApi = {
  listFriends(accessToken: string) {
    return request<FriendSummary[]>("/friends", { method: "GET" }, accessToken);
  },
  searchUsers(accessToken: string, query: string) {
    return request<FriendUser[]>(`/friends/search?q=${encodeURIComponent(query)}`, { method: "GET" }, accessToken);
  },
  createFriendRequest(accessToken: string, toUserId: string) {
    return request<FriendRequestSummary>(
      "/friend-requests",
      {
        method: "POST",
        body: JSON.stringify({ toUserId })
      },
      accessToken
    );
  },
  listFriendRequests(accessToken: string) {
    return request<FriendRequestSummary[]>("/friend-requests", { method: "GET" }, accessToken);
  },
  acceptFriendRequest(accessToken: string, requestId: string) {
    return request<FriendRequestSummary>(
      `/friend-requests/${encodeURIComponent(requestId)}/accept`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  rejectFriendRequest(accessToken: string, requestId: string) {
    return request<FriendRequestSummary>(
      `/friend-requests/${encodeURIComponent(requestId)}/reject`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  inviteToRoom(accessToken: string, roomId: string, toUserId: string) {
    return request<RoomInvitationSummary>(
      `/rooms/${encodeURIComponent(roomId)}/invitations`,
      {
        method: "POST",
        body: JSON.stringify({ toUserId })
      },
      accessToken
    );
  },
  listRoomInvitations(accessToken: string, direction: "incoming" | "outgoing" | "all" = "all", status = "pending") {
    return request<RoomInvitationSummary[]>(
      `/room-invitations?direction=${encodeURIComponent(direction)}&status=${encodeURIComponent(status)}`,
      { method: "GET" },
      accessToken
    );
  },
  acceptRoomInvitation(accessToken: string, invitationId: string) {
    return request<RoomInvitationSummary>(
      `/room-invitations/${encodeURIComponent(invitationId)}/accept`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  },
  rejectRoomInvitation(accessToken: string, invitationId: string) {
    return request<RoomInvitationSummary>(
      `/room-invitations/${encodeURIComponent(invitationId)}/reject`,
      {
        method: "POST",
        body: "{}"
      },
      accessToken
    );
  }
};
