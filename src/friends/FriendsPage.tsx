import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  friendsApi,
  FriendsApiError,
  type FriendRequestSummary,
  type FriendSummary,
  type FriendUser,
  type RoomInvitationSummary
} from "./friendsApi";

type FriendsPageProps = {
  currentRoomId?: string | null;
  currentRoomTitle?: string | null;
  onBackToRoom: () => void;
  onAcceptRoomInvitation: (roomId: string) => Promise<void>;
};

export function FriendsPage({ currentRoomId, currentRoomTitle, onBackToRoom, onAcceptRoomInvitation }: FriendsPageProps) {
  const { accessToken, user } = useAuth();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [requests, setRequests] = useState<FriendRequestSummary[]>([]);
  const [roomInvitations, setRoomInvitations] = useState<RoomInvitationSummary[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [isSearching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incomingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending" && request.direction !== "outgoing"),
    [requests]
  );
  const outgoingRequests = useMemo(
    () => requests.filter((request) => request.status === "pending" && request.direction === "outgoing"),
    [requests]
  );
  const incomingRoomInvitations = useMemo(
    () => roomInvitations.filter((invitation) => invitation.status === "pending" && invitation.direction !== "outgoing"),
    [roomInvitations]
  );
  const outgoingRoomInvitations = useMemo(
    () => roomInvitations.filter((invitation) => invitation.status === "pending" && invitation.direction === "outgoing"),
    [roomInvitations]
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    async function loadFriends() {
      if (!accessToken) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const snapshot = await loadFriendSnapshot(accessToken);

        if (!cancelled) {
          applyFriendSnapshot(snapshot);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toFriendsErrorMessage(err, "好友与邀请加载失败。"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadFriends();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function loadFriendSnapshot(token: string) {
    const [nextFriends, nextRequests, nextRoomInvitations] = await Promise.all([
      friendsApi.listFriends(token),
      friendsApi.listFriendRequests(token),
      friendsApi.listRoomInvitations(token, "all", "pending")
    ]);

    return {
      nextFriends,
      nextRequests,
      nextRoomInvitations
    };
  }

  function applyFriendSnapshot(snapshot: Awaited<ReturnType<typeof loadFriendSnapshot>>) {
    setFriends(snapshot.nextFriends);
    setRequests(snapshot.nextRequests);
    setRoomInvitations(snapshot.nextRoomInvitations);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !query.trim()) {
      return;
    }

    setSearching(true);
    setError(null);
    setStatusMessage(null);

    try {
      const results = await friendsApi.searchUsers(accessToken, query.trim());
      setSearchResults(results.filter((result) => result.id !== user?.id));
    } catch (err) {
      setError(toFriendsErrorMessage(err, "好友搜索失败。"));
    } finally {
      setSearching(false);
    }
  }

  async function runFriendAction(action: () => Promise<void>) {
    setError(null);
    setStatusMessage(null);

    try {
      await action();

      if (accessToken) {
        applyFriendSnapshot(await loadFriendSnapshot(accessToken));
      }
    } catch (err) {
      setError(toFriendsErrorMessage(err, "好友相关操作失败。"));
    } finally {
      setBusyId(null);
    }
  }

  function sendFriendRequest(target: FriendUser) {
    if (!accessToken) {
      return;
    }

    setBusyId(target.id);
    void runFriendAction(async () => {
      await friendsApi.createFriendRequest(accessToken, target.id);
      setStatusMessage(`已向 ${target.nickname} 发送好友申请。`);
    });
  }

  function acceptRequest(request: FriendRequestSummary) {
    if (!accessToken) {
      return;
    }

    setBusyId(request.id);
    void runFriendAction(async () => {
      await friendsApi.acceptFriendRequest(accessToken, request.id);
      setStatusMessage("已接受好友申请。");
    });
  }

  function rejectRequest(request: FriendRequestSummary) {
    if (!accessToken) {
      return;
    }

    setBusyId(request.id);
    void runFriendAction(async () => {
      await friendsApi.rejectFriendRequest(accessToken, request.id);
      setStatusMessage("已拒绝好友申请。");
    });
  }

  function inviteFriend(friend: FriendSummary) {
    if (!accessToken || !currentRoomId) {
      return;
    }

    const targetUserId = friend.friendId ?? friend.id;

    setBusyId(targetUserId);
    void runFriendAction(async () => {
      await friendsApi.inviteToRoom(accessToken, currentRoomId, targetUserId);
      setStatusMessage(`已向 ${friend.nickname} 发出房间邀请。`);
    });
  }

  function acceptRoomInvitation(invitation: RoomInvitationSummary) {
    if (!accessToken) {
      return;
    }

    setBusyId(invitation.id);
    void runFriendAction(async () => {
      const accepted = await friendsApi.acceptRoomInvitation(accessToken, invitation.id);
      await onAcceptRoomInvitation(accepted.roomId);
      setStatusMessage(`已加入房间：${accepted.room?.title ?? accepted.roomId}。`);
    });
  }

  function rejectRoomInvitation(invitation: RoomInvitationSummary) {
    if (!accessToken) {
      return;
    }

    setBusyId(invitation.id);
    void runFriendAction(async () => {
      await friendsApi.rejectRoomInvitation(accessToken, invitation.id);
      setStatusMessage("已拒绝房间邀请。");
    });
  }

  return (
    <main className="friends-shell">
      <section className="friends-workspace" aria-labelledby="friends-title">
        <header className="room-topbar">
          <div>
            <p>好友系统</p>
            <h1 id="friends-title">好友与邀请</h1>
          </div>
          <button type="button" className="secondary-inline" onClick={onBackToRoom}>
            返回
          </button>
        </header>

        <div className="friends-grid">
          <section className="room-panel friends-panel">
            <div className="members-heading">
              <h2>搜索用户</h2>
              <span>{searchResults.length} 条结果</span>
            </div>
            <form className="friend-search-form" onSubmit={handleSearch}>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入账号或昵称" />
              <button className="primary-button" type="submit" disabled={isSearching || !query.trim()}>
                {isSearching ? "搜索中..." : "搜索"}
              </button>
            </form>
            <div className="friend-list">
              {searchResults.map((result) => (
                <FriendRow key={result.id} user={result}>
                  <button
                    className="small-action"
                    type="button"
                    disabled={busyId === result.id || result.friendshipStatus === "friend" || result.requestStatus?.includes("pending")}
                    onClick={() => sendFriendRequest(result)}
                  >
                    {searchActionLabel(result)}
                  </button>
                </FriendRow>
              ))}
              {searchResults.length === 0 ? <p className="room-note">搜索用户后，就可以发送好友申请。</p> : null}
            </div>
          </section>

          <section className="room-panel friends-panel">
            <div className="members-heading">
              <h2>好友列表</h2>
              <span>{friends.length} 位好友</span>
            </div>
            {currentRoomId ? <p className="room-note">当前房间：{currentRoomTitle ?? currentRoomId}</p> : <p className="room-note">请先进入房间，再邀请好友。</p>}
            <div className="friend-list">
              {friends.map((friend) => {
                const targetUserId = friend.friendId ?? friend.id;

                return (
                  <FriendRow key={friend.id} user={friend}>
                    <button className="small-action" type="button" disabled={!currentRoomId || busyId === targetUserId} onClick={() => inviteFriend(friend)}>
                      邀请进房间
                    </button>
                  </FriendRow>
                );
              })}
              {friends.length === 0 ? <p className="room-note">{isLoading ? "正在加载好友..." : "你还没有好友。"}</p> : null}
            </div>
          </section>

          <RequestPanel
            title="收到的好友申请"
            countText={`${incomingRequests.length} 条待处理`}
            emptyText="暂时没有收到新的好友申请。"
          >
            {incomingRequests.map((request) => (
              <FriendRow key={request.id} user={request.fromUser}>
                <button className="small-action" type="button" disabled={busyId === request.id} onClick={() => acceptRequest(request)}>
                  接受
                </button>
                <button className="small-action danger-action" type="button" disabled={busyId === request.id} onClick={() => rejectRequest(request)}>
                  拒绝
                </button>
              </FriendRow>
            ))}
          </RequestPanel>

          <RequestPanel
            title="发出的好友申请"
            countText={`${outgoingRequests.length} 条待回应`}
            emptyText="你还没有发出好友申请。"
          >
            {outgoingRequests.map((request) => (
              <FriendRow key={request.id} user={request.toUser}>
                <span className="role-badge">等待中</span>
              </FriendRow>
            ))}
          </RequestPanel>

          <RequestPanel
            title="收到的房间邀请"
            countText={`${incomingRoomInvitations.length} 条待处理`}
            emptyText="暂时没有房间邀请。"
          >
            {incomingRoomInvitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation}>
                <button className="small-action" type="button" disabled={busyId === invitation.id} onClick={() => acceptRoomInvitation(invitation)}>
                  接受并进入
                </button>
                <button className="small-action danger-action" type="button" disabled={busyId === invitation.id} onClick={() => rejectRoomInvitation(invitation)}>
                  拒绝
                </button>
              </InvitationRow>
            ))}
          </RequestPanel>

          <RequestPanel
            title="发出的房间邀请"
            countText={`${outgoingRoomInvitations.length} 条待接受`}
            emptyText="你还没有发出房间邀请。"
          >
            {outgoingRoomInvitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation}>
                <span className="role-badge">等待中</span>
              </InvitationRow>
            ))}
          </RequestPanel>
        </div>

        {statusMessage ? <div className="form-success room-status">{statusMessage}</div> : null}
        {error ? <div className="form-error room-status">{error}</div> : null}
      </section>
    </main>
  );
}

function RequestPanel({
  title,
  countText,
  emptyText,
  children
}: {
  title: string;
  countText: string;
  emptyText: string;
  children: ReactNode;
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;

  return (
    <section className="room-panel friends-panel">
      <div className="members-heading">
        <h2>{title}</h2>
        <span>{countText}</span>
      </div>
      <div className="friend-list">
        {children}
        {isEmpty ? <p className="room-note">{emptyText}</p> : null}
      </div>
    </section>
  );
}

function FriendRow({ user, children }: { user?: FriendUser; children: ReactNode }) {
  return (
    <div className="friend-row">
      <div className="member-summary">
        <strong>{user?.nickname ?? "未知用户"}</strong>
        <span>{user?.account ?? "-"}</span>
      </div>
      <div className="member-actions">{children}</div>
    </div>
  );
}

function InvitationRow({ invitation, children }: { invitation: RoomInvitationSummary; children: ReactNode }) {
  const otherUser = invitation.direction === "outgoing" ? invitation.toUser : invitation.fromUser;
  const directionLabel = invitation.direction === "outgoing" ? "发给" : "来自";

  return (
    <div className="friend-row">
      <div className="member-summary">
        <strong>{invitation.room?.title ?? invitation.roomId}</strong>
        <span>{otherUser ? `${directionLabel} ${otherUser.nickname}` : invitation.direction}</span>
        <code>{invitation.expiresAt ? `到期：${new Date(invitation.expiresAt).toLocaleDateString()}` : invitation.status}</code>
      </div>
      <div className="member-actions">{children}</div>
    </div>
  );
}

function searchActionLabel(user: FriendUser) {
  if (user.friendshipStatus === "friend") {
    return "已经是好友";
  }

  if (user.requestStatus === "outgoing_pending") {
    return "已发送申请";
  }

  if (user.requestStatus === "incoming_pending") {
    return "对方已申请";
  }

  return "添加好友";
}

function toFriendsErrorMessage(err: unknown, fallback: string) {
  if (err instanceof FriendsApiError) {
    if (err.status === 403) {
      return "你没有权限执行这个操作。";
    }

    if (err.status === 429) {
      return "操作过于频繁，请稍后再试。";
    }

    return err.message;
  }

  return fallback;
}
