import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { roomApi, RoomApiError, type RoomSummary } from "../rooms/roomApi";

type DashboardPageProps = {
  currentRoom: RoomSummary | null;
  onEnterRoom: (room: RoomSummary) => void;
  onOpenRoom: () => void;
  onOpenFriends: () => void;
  onOpenProfile: () => void;
  onOpenGrowth: () => void;
  onOpenVip: () => void;
};

export function DashboardPage({
  currentRoom,
  onEnterRoom,
  onOpenRoom,
  onOpenFriends,
  onOpenProfile,
  onOpenGrowth,
  onOpenVip
}: DashboardPageProps) {
  const { accessToken, user, logout } = useAuth();
  const [title, setTitle] = useState("一起看点什么");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  const vipExpiryText = useMemo(() => {
    if (user?.vipCardType === "permanent") {
      return "永久有效";
    }

    if (user?.vipExpiresAt) {
      return new Date(user.vipExpiresAt).toLocaleString();
    }

    return "未开通";
  }, [user?.vipCardType, user?.vipExpiresAt]);

  useEffect(() => {
    if (!accessToken) {
      setRooms([]);
      return;
    }

    let cancelled = false;
    setLoadingRooms(true);

    roomApi
      .listMyRooms(accessToken)
      .then((nextRooms) => {
        if (!cancelled) {
          setRooms(nextRooms);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("房间列表加载失败，请稍后再试。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRooms(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      return;
    }

    setBusy("create");
    setError(null);
    setMessage(null);

    try {
      const room = await roomApi.createRoom(accessToken, title.trim() || "一起看点什么");
      setRooms((currentRooms) => [room, ...currentRooms.filter((item) => item.id !== room.id)]);
      onEnterRoom(room);
      setMessage("房间已创建，正在为你打开。");
    } catch (err) {
      setError(toRoomError(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !joinRoomId.trim()) {
      return;
    }

    setBusy("join");
    setError(null);
    setMessage(null);

    try {
      const room = await roomApi.joinRoom(accessToken, joinRoomId.trim());
      setRooms((currentRooms) => [room, ...currentRooms.filter((item) => item.id !== room.id)]);
      onEnterRoom(room);
      setMessage("已进入房间。");
    } catch (err) {
      setError(toRoomError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="room-shell app-shell">
      <section className="room-workspace" aria-labelledby="dashboard-title">
        <header className="room-topbar app-topbar">
          <div>
            <p>一起看</p>
            <h1 id="dashboard-title">欢迎回来，{user?.nickname ?? user?.account}</h1>
          </div>
          <div className="room-actions">
            <button type="button" className="secondary-inline" onClick={onOpenFriends}>
              好友
            </button>
            <button type="button" className="secondary-inline" onClick={onOpenProfile}>
              个人页
            </button>
            <button type="button" className="secondary-inline" onClick={onOpenVip}>
              VIP
            </button>
            <button type="button" className="secondary-inline" onClick={onOpenGrowth}>
              成长
            </button>
            <button type="button" className="secondary-inline" onClick={() => void logout()}>
              退出登录
            </button>
          </div>
        </header>

        <div className="room-grid dashboard-grid">
          <section className="room-panel hero-panel">
            <div className="hero-badge-row">
              <span className={`vip-chip${user?.vipCardType ? " vip-chip-active" : ""}`}>{formatVip(user?.vipCardType ?? null)}</span>
              <span className="hero-title-chip">{user?.currentTitle?.name ?? "新朋友"}</span>
            </div>

            <div className="hero-copy">
              <h2>把首页变成随时继续观影的入口。</h2>
              <p>
                {currentRoom
                  ? `你当前正在房间「${currentRoom.title}」中，可以直接回到房间继续同步播放。`
                  : "创建房间或输入房间 ID，就能快速开始同步观影。"}
              </p>
            </div>

            <div className="status-card-grid">
              <div className="status-card">
                <span>成长等级</span>
                <strong>Lv.{user?.growthLevel ?? 1}</strong>
              </div>
              <div className="status-card">
                <span>累计经验</span>
                <strong>{user?.totalExp ?? 0}</strong>
              </div>
              <div className="status-card">
                <span>VIP 状态</span>
                <strong>{formatVip(user?.vipCardType ?? null)}</strong>
              </div>
            </div>
          </section>

          <section className="room-panel">
            <div className="members-heading">
              <h2>快捷开始</h2>
              <span>房间入口</span>
            </div>

            <div className="room-panel-stack">
              <form className="room-form" onSubmit={handleCreate}>
                <label>
                  <span>创建房间</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入房间标题" />
                </label>
                <button className="primary-button" type="submit" disabled={busy === "create"}>
                  {busy === "create" ? "创建中..." : "创建房间"}
                </button>
              </form>

              <form className="room-form" onSubmit={handleJoin}>
                <label>
                  <span>加入房间</span>
                  <input value={joinRoomId} onChange={(event) => setJoinRoomId(event.target.value)} placeholder="输入房间 ID" />
                </label>
                <button className="secondary-button inline-secondary-button" type="submit" disabled={busy === "join" || !joinRoomId.trim()}>
                  {busy === "join" ? "加入中..." : "加入房间"}
                </button>
              </form>
            </div>
          </section>

          <section className="room-panel">
            <div className="members-heading">
              <h2>我的状态</h2>
              <span>账号信息</span>
            </div>

            <div className="profile-list">
              <div>
                <dt>当前称号</dt>
                <dd>{user?.currentTitle?.name ?? "新朋友"}</dd>
              </div>
              <div>
                <dt>当前等级</dt>
                <dd>Lv.{user?.growthLevel ?? 1}</dd>
              </div>
              <div>
                <dt>VIP 状态</dt>
                <dd>{formatVip(user?.vipCardType ?? null)}</dd>
              </div>
              <div>
                <dt>VIP 到期</dt>
                <dd>{vipExpiryText}</dd>
              </div>
            </div>
          </section>

          <section className="room-panel">
            <div className="members-heading">
              <h2>我的房间</h2>
              <span>{loadingRooms ? "加载中..." : `${rooms.length} 个活跃房间`}</span>
            </div>

            {currentRoom ? (
              <div className="room-meta room-meta-tight">
                <div>
                  <span>当前房间</span>
                  <strong>{currentRoom.title}</strong>
                  <code>{currentRoom.id}</code>
                </div>
                <div>
                  <span>你的身份</span>
                  <strong>{formatRole(currentRoom.currentUserRole)}</strong>
                  <code>{currentRoom.members.length} 位成员</code>
                </div>
                <div>
                  <span>控制状态</span>
                  <strong>{currentRoom.developerControl?.active ? "开发者接管中" : "正常控制"}</strong>
                  <code>{currentRoom.status === "closed" ? "房间已关闭" : "可继续同步"}</code>
                </div>
                <button className="primary-button" type="button" onClick={onOpenRoom}>
                  进入当前房间
                </button>
              </div>
            ) : rooms.length > 0 ? (
              <div className="room-meta room-meta-tight">
                {rooms.map((room) => (
                  <div key={room.id}>
                    <span>{room.status === "active" ? "正在进行" : room.status}</span>
                    <strong>{room.title}</strong>
                    <code>
                      {room.members.length} 位成员 / {formatRole(room.currentUserRole)}
                    </code>
                    <button className="secondary-button inline-secondary-button" type="button" onClick={() => onEnterRoom(room)}>
                      进入房间
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>还没有活跃房间</strong>
                <p>创建房间或加入房间后，它会显示在这里，刷新页面后也能继续进入。</p>
              </div>
            )}
          </section>
        </div>

        {message ? <div className="form-success room-status">{message}</div> : null}
        {error ? <div className="form-error room-status">{error}</div> : null}
      </section>
    </main>
  );
}

function toRoomError(err: unknown) {
  if (err instanceof RoomApiError) {
    if (err.code === "ROOM_OWNED_QUOTA_EXCEEDED") {
      return "创建失败：已达到当前账号可创建的活跃房间上限，请先关闭一个房间或升级 VIP。";
    }

    if (err.code === "ROOM_JOINED_QUOTA_EXCEEDED") {
      return "加入失败：已达到当前账号可加入的活跃房间上限，请先退出一个房间或升级 VIP。";
    }

    if (err.code === "ROOM_MEMBER_LIMIT_EXCEEDED") {
      return "加入失败：该房间人数已达上限，房主需要更高的 VIP 额度。";
    }

    return err.message;
  }

  return "房间服务暂时不可用。";
}

function formatVip(cardType: string | null) {
  if (cardType === "permanent") {
    return "永久 VIP";
  }

  if (cardType === "year") {
    return "年卡 VIP";
  }

  if (cardType === "month") {
    return "月卡 VIP";
  }

  if (cardType === "day") {
    return "日卡 VIP";
  }

  return "普通用户";
}

function formatRole(role: RoomSummary["currentUserRole"]) {
  if (role === "owner") {
    return "房主";
  }

  if (role === "admin") {
    return "管理员";
  }

  if (role === "member") {
    return "成员";
  }

  return "未加入";
}
