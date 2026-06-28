import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "../auth/AuthContext";
import { addVideoLinks, getPlaylist, removePlaylistItem, type PlaylistItem, toAbsoluteApiUrl, videoImportErrorMessage } from "../video/videoApi";
import { AdvancedRoomPlayer, type PlayerRuntimeState } from "./AdvancedRoomPlayer";
import { roomApi, RoomApiError, type RoomChatMessage, type RoomMember, type RoomSummary } from "./roomApi";

type PlaybackState = {
  roomId: string;
  videoId: string | null;
  videoRevision?: number;
  status: "playing" | "paused";
  positionSeconds: number;
  playbackRate: number;
  serverTimestamp: number;
  sequence: number;
  controllerUserId: string;
};

type PresenceState = {
  roomId: string;
  onlineCount: number;
  onlineUserIds: string[];
};

type RoomSnapshot = {
  roomId: string;
  playback: PlaybackState | null;
  presence: PresenceState;
  members: RoomMember[];
};

type RoomPageProps = {
  initialRoom: RoomSummary | null;
  onRoomSnapshotChange: (room: RoomSummary | null) => void;
  onBackToDashboard: () => void;
  onOpenFriends: () => void;
  onOpenProfile: () => void;
};

type VideoDraft = {
  url: string;
  displayName: string;
};

const SOCKET_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1").replace(/\/api\/v1\/?$/, "");

export function RoomPage({
  initialRoom,
  onRoomSnapshotChange,
  onBackToDashboard,
  onOpenFriends,
  onOpenProfile
}: RoomPageProps) {
  const { accessToken, logout, user } = useAuth();
  const [room, setRoom] = useState<RoomSummary | null>(initialRoom);
  const [members, setMembers] = useState<RoomMember[]>(initialRoom?.members ?? []);
  const [presence, setPresence] = useState<PresenceState | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [socketStatus, setSocketStatus] = useState("offline");
  const [title, setTitle] = useState("一起看点什么");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [position, setPosition] = useState(0);
  const [videoSource, setVideoSource] = useState("");
  const [playlist, setPlaylist] = useState<PlaylistItem[]>(initialRoom?.videos ?? []);
  const [videoDrafts, setVideoDrafts] = useState<VideoDraft[]>([{ url: "", displayName: "" }]);
  const [isImportingVideo, setImportingVideo] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [memberActionUserId, setMemberActionUserId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSendingChat, setSendingChat] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const chatListRef = useRef<HTMLDivElement | null>(null);
  const playlistRef = useRef<PlaylistItem[]>(initialRoom?.videos ?? []);
  const playerRuntimeRef = useRef<PlayerRuntimeState>({ currentTime: 0, playbackRate: 1 });
  const playbackPanelRef = useRef<HTMLElement | null>(null);
  const membersPanelRef = useRef<HTMLElement | null>(null);

  const currentMember = useMemo(() => members.find((member) => member.userId === user?.id) ?? null, [members, user?.id]);
  const currentUserRole = currentMember?.role ?? room?.currentUserRole ?? null;
  const developerControl = room?.developerControl ?? {
    active: false,
    controllerUserId: null,
    previousOwnerId: null
  };
  const isDeveloper = user?.role === "developer" || user?.role === "super_developer";
  const isDeveloperController = developerControl.active && developerControl.controllerUserId === user?.id;
  const isRoomClosed = room?.status === "closed";
  const controlLockedByDeveloper = developerControl.active && !isDeveloperController;
  const canControlPlayback = Boolean(
    room && !isRoomClosed && (isDeveloperController || (!developerControl.active && (currentUserRole === "owner" || currentUserRole === "admin")))
  );
  const canCloseRoom = Boolean(room && !isRoomClosed && (isDeveloperController || (!developerControl.active && currentUserRole === "owner")));
  const canManageOwnerActions = Boolean(room && !isRoomClosed && (isDeveloperController || (!developerControl.active && currentUserRole === "owner")));
  const canModerateMembers = Boolean(
    room && !isRoomClosed && (isDeveloperController || (!developerControl.active && (currentUserRole === "owner" || currentUserRole === "admin")))
  );
  const canChat = Boolean(room && currentMember && socketStatus === "online" && !isRoomClosed);
  const onlineCount = presence?.onlineCount ?? members.filter((member) => member.online).length;
  const currentVideoId = playback?.videoId ?? room?.currentVideo?.roomVideoId ?? null;
  const currentPlaylistEntry = useMemo(() => playlist.find((item) => item.roomVideoId === currentVideoId) ?? null, [currentVideoId, playlist]);
  const currentPlaylistItem = currentPlaylistEntry ?? room?.currentVideo ?? null;
  const currentVideoDisplayName = currentPlaylistEntry?.displayName ?? null;
  const playerSyncLabel = canControlPlayback ? "正在同步给成员" : "跟随房主/管理员播放";
  const developerController = useMemo(
    () => members.find((member) => member.userId === developerControl.controllerUserId) ?? null,
    [developerControl.controllerUserId, members]
  );

  useEffect(() => {
    setRoom(initialRoom);
  }, [initialRoom]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    if (!room) {
      setMembers([]);
      setPresence(null);
      setPlayback(null);
      setPlaylist([]);
      setVideoSource("");
      return;
    }

    setMembers(room.members);
    if (room.currentVideo?.proxyUrl) {
      setVideoSource(toAbsoluteApiUrl(room.currentVideo.proxyUrl));
    }
    if (room.videos) {
      setPlaylist(room.videos);
    }
  }, [room]);

  useEffect(() => {
    onRoomSnapshotChange(room);
  }, [onRoomSnapshotChange, room]);

  useEffect(() => {
    if (!accessToken || !room?.id || room.status === "closed") {
      setSocketStatus("offline");
      return;
    }

    let disposed = false;
    const activeRoomId = room.id;
    const socket: Socket = io(`${SOCKET_BASE_URL}/rooms`, {
      auth: {
        token: accessToken
      },
      transports: ["websocket"]
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("online");
      socket.emit("room:join", { roomId: activeRoomId });
    });

    socket.on("disconnect", () => {
      if (!disposed) {
        setSocketStatus("offline");
      }
    });

    socket.on("room:snapshot", (snapshot: RoomSnapshot) => {
      applyPlaybackState(snapshot.playback);
      setPresence(snapshot.presence);
      setMembers(snapshot.members);
      void refreshRoom(activeRoomId);
    });

    socket.on("room:presence", (nextPresence: PresenceState) => {
      setPresence(nextPresence);
    });

    socket.on("room:members", (nextMembers: RoomMember[]) => {
      setMembers(nextMembers);
    });

    socket.on("room:role-changed", () => {
      void refreshRoom(activeRoomId);
    });

    socket.on("room:owner-transferred", () => {
      void refreshRoom(activeRoomId);
    });

    socket.on("playback:state", (nextPlayback: PlaybackState) => {
      applyPlaybackState(nextPlayback);
    });

    socket.on("video:changed", (nextPlayback: PlaybackState) => {
      applyPlaybackState(nextPlayback);
      void refreshRoom(activeRoomId);
    });

    socket.on("chat:message", (nextMessage: RoomChatMessage) => {
      appendChatMessage(nextMessage);
      setChatError(null);
      setSendingChat(false);
    });

    socket.on("room:kicked", () => {
      setRoom(null);
      setMembers([]);
      setPresence(null);
      setPlayback(null);
      setPlaylist([]);
      setChatMessages([]);
      setChatInput("");
      setChatError("你已被移出房间。");
      setMessage("你已离开当前房间。");
    });

    socket.on("room:error", (payload: { message?: string; code?: string }) => {
      const nextMessage = toRoomError(new RoomApiError(payload.message ?? "房间实时操作失败。", 400, payload.code));

      if (payload.code === "ROOM_CLOSED") {
        setRoom((currentRoom) => (currentRoom ? { ...currentRoom, status: "closed" } : currentRoom));
        setMessage("房间已关闭。");
      } else {
        setError(nextMessage);
      }

      setSendingChat(false);
    });

    return () => {
      disposed = true;
      socket.emit("room:leave", { roomId: activeRoomId });
      socket.disconnect();
      socketRef.current = null;
      setSocketStatus("offline");
    };
  }, [accessToken, room?.id, room?.status]);

  useEffect(() => {
    if (!accessToken || !room || room.status === "closed") {
      setChatMessages([]);
      setChatInput("");
      setChatError(null);
      return;
    }

    let cancelled = false;

    roomApi
      .getRecentChats(accessToken, room.id, 50)
      .then((messages) => {
        if (!cancelled) {
          setChatMessages(messages);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChatError("聊天记录加载失败。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, room?.id, room?.status]);

  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  function applyPlaybackState(nextPlayback: PlaybackState | null) {
    setPlayback(nextPlayback);

    if (!nextPlayback) {
      return;
    }

    setPosition(nextPlayback.positionSeconds);

    if (nextPlayback.videoId) {
      const activeItem = playlistRef.current.find((item) => item.roomVideoId === nextPlayback.videoId);
      if (activeItem) {
        setVideoSource(toAbsoluteApiUrl(activeItem.proxyUrl));
      }
    }
  }

  async function loadPlaylist(roomId: string) {
    if (!accessToken) {
      return;
    }

    try {
      const result = await getPlaylist(accessToken, roomId);
      setPlaylist(result.items);
    } catch {
      // Keep current playlist if refresh fails.
    }
  }

  async function refreshRoom(roomId: string) {
    if (!accessToken) {
      return;
    }

    try {
      const [nextRoom, nextPlaylist] = await Promise.all([roomApi.getRoom(accessToken, roomId), getPlaylist(accessToken, roomId)]);
      setRoom(nextRoom);
      setMembers(nextRoom.members);
      setPlaylist(nextPlaylist.items);

      if (nextRoom.currentVideo?.proxyUrl) {
        setVideoSource(toAbsoluteApiUrl(nextRoom.currentVideo.proxyUrl));
      }
    } catch {
      // Realtime snapshot can keep the page usable until the next refresh.
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      return;
    }

    setBusyAction("create");
    await runRoomAction(async () => {
      const created = await roomApi.createRoom(accessToken, title.trim() || "一起看点什么");
      setRoom(created);
      setJoinRoomId(created.id);
      setMessage("房间已创建。");
    });
    setBusyAction(null);
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !joinRoomId.trim()) {
      return;
    }

    setBusyAction("join");
    await runRoomAction(async () => {
      const joined = await roomApi.joinRoom(accessToken, joinRoomId.trim());
      setRoom(joined);
      setMessage("已进入房间。");
    });
    setBusyAction(null);
  }

  async function handleDeveloperEnter() {
    if (!accessToken || !joinRoomId.trim() || !isDeveloper) {
      return;
    }

    setBusyAction("developer-enter");
    await runRoomAction(async () => {
      const joined = await roomApi.developerEnter(accessToken, joinRoomId.trim());
      setRoom(joined);
      setMessage("已用开发者身份进入房间。");
    });
    setBusyAction(null);
  }

  async function handleLeave() {
    if (!accessToken || !room) {
      return;
    }

    setBusyAction("leave");
    await runRoomAction(async () => {
      await roomApi.leaveRoom(accessToken, room.id);
      setRoom(null);
      setMembers([]);
      setPresence(null);
      setPlayback(null);
      setPlaylist([]);
      setVideoSource("");
      setChatMessages([]);
      setChatInput("");
      setChatError(null);
      setMessage("已离开房间。");
    });
    setBusyAction(null);
  }

  async function handleCloseRoom() {
    if (!accessToken || !room || !canCloseRoom) {
      return;
    }

    if (!window.confirm(`确认关闭房间“${room.title}”吗？关闭后成员将无法继续加入和播放。`)) {
      return;
    }

    setBusyAction("close-room");
    setError(null);
    setMessage(null);

    try {
      await roomApi.closeRoom(accessToken, room.id);
      setRoom((currentRoom) => (currentRoom ? { ...currentRoom, status: "closed" } : currentRoom));
      setPresence(null);
      setPlayback(null);
      setMessage("房间已关闭。");
    } catch (err) {
      setError(toRoomError(err));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeveloperTakeover() {
    if (!accessToken || !room || !isDeveloper || developerControl.active) {
      return;
    }

    if (!window.confirm("确认接管房间控制权吗？接管后原房主的房主按钮会被隐藏或禁用。")) {
      return;
    }

    setBusyAction("takeover");
    await runRoomAction(async () => {
      const updatedRoom = await roomApi.developerTakeover(accessToken, room.id);
      setRoom(updatedRoom);
      setMembers(updatedRoom.members);
      setMessage("开发者已接管房间控制权。");
    });
    setBusyAction(null);
  }

  async function handleDeveloperRelease() {
    if (!accessToken || !room || !isDeveloperController) {
      return;
    }

    if (!window.confirm("确认释放控制权吗？房主控制按钮会恢复给原房主。")) {
      return;
    }

    setBusyAction("release");
    await runRoomAction(async () => {
      const updatedRoom = await roomApi.developerRelease(accessToken, room.id);
      setRoom(updatedRoom);
      setMembers(updatedRoom.members);
      setMessage("开发者已释放控制权。");
    });
    setBusyAction(null);
  }

  async function runRoomAction(action: () => Promise<void>) {
    setError(null);
    setMessage(null);

    try {
      await action();
    } catch (err) {
      setError(toRoomError(err));
    }
  }

  async function runMemberAction(target: RoomMember, action: () => Promise<RoomSummary>, successMessage: string, confirmText?: string) {
    if (!accessToken || !room) {
      return;
    }

    if (confirmText && !window.confirm(confirmText)) {
      return;
    }

    setMemberActionUserId(target.userId);
    setError(null);
    setMessage(null);

    try {
      const updatedRoom = await action();
      setRoom(updatedRoom);
      setMembers(updatedRoom.members);
      setMessage(successMessage);
    } catch (err) {
      setError(toRoomError(err));
    } finally {
      setMemberActionUserId(null);
    }
  }

  function canSetAdmin(member: RoomMember) {
    return canManageOwnerActions && member.role === "member" && member.userId !== user?.id;
  }

  function canRemoveAdmin(member: RoomMember) {
    return canManageOwnerActions && member.role === "admin";
  }

  function canKick(member: RoomMember) {
    if (!canModerateMembers || !user || member.userId === user.id || member.role === "owner") {
      return false;
    }

    if (isDeveloperController || currentUserRole === "owner") {
      return true;
    }

    return currentUserRole === "admin" && member.role === "member";
  }

  function canTransferOwner(member: RoomMember) {
    return !developerControl.active && currentUserRole === "owner" && member.userId !== user?.id;
  }

  async function handleVideoImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !room || !canControlPlayback) {
      return;
    }

    setError(null);
    setMessage(null);
    setImportingVideo(true);

    try {
      const videos = videoDrafts
        .map((draft) => ({
          url: draft.url.trim(),
          displayName: draft.displayName.trim() || undefined
        }))
        .filter((draft) => draft.url);

      if (videos.length === 0) {
        setError("请至少录入一条视频直链。");
        return;
      }

      const result = await addVideoLinks(accessToken, {
        roomId: room.id,
        videos
      });

      setPlaylist(result.items);
      setVideoDrafts([{ url: "", displayName: "" }]);
      setPosition(0);
      setMessage(`已录入 ${videos.length} 条视频。`);

      if (result.items[0]) {
        switchPlaylistItem(result.items[0]);
      }
    } catch (err) {
      setError(videoImportErrorMessage(err));
    } finally {
      setImportingVideo(false);
    }
  }

  function updateVideoDraft(index: number, key: keyof VideoDraft, value: string) {
    setVideoDrafts((currentDrafts) =>
      currentDrafts.map((draft, draftIndex) => (draftIndex === index ? { ...draft, [key]: value } : draft))
    );
  }

  function addVideoDraftRow() {
    setVideoDrafts((currentDrafts) => [...currentDrafts, { url: "", displayName: "" }]);
  }

  function removeVideoDraftRow(index: number) {
    setVideoDrafts((currentDrafts) => {
      if (currentDrafts.length === 1) {
        return [{ url: "", displayName: "" }];
      }

      return currentDrafts.filter((_, draftIndex) => draftIndex !== index);
    });
  }

  function switchPlaylistItem(item: PlaylistItem) {
    if (!room || !canControlPlayback) {
      return;
    }

    setVideoSource(toAbsoluteApiUrl(item.proxyUrl));
    setPosition(0);

    socketRef.current?.emit("video:change", {
      roomId: room.id,
      videoId: item.roomVideoId,
      status: "paused",
      positionSeconds: 0,
      playbackRate: 1
    });
  }

  async function handleRemovePlaylistItem(item: PlaylistItem) {
    if (!accessToken || !room || !canControlPlayback) {
      return;
    }

    if (!window.confirm(`确认删除「${item.displayName || safeHostname(item.displayUrl)}」吗？`)) {
      return;
    }

    setDeletingVideoId(item.roomVideoId);
    setError(null);
    setMessage(null);

    try {
      const result = await removePlaylistItem(accessToken, room.id, item.roomVideoId);
      setPlaylist(result.items);

      if (currentVideoId === item.roomVideoId) {
        const nextItem = result.items[0] ?? null;
        setVideoSource(nextItem ? toAbsoluteApiUrl(nextItem.proxyUrl) : "");
        setPlayback(null);
        setPosition(0);
      }

      await refreshRoom(room.id);
      setMessage("视频已从播放列表删除。");
    } catch (err) {
      setError(videoImportErrorMessage(err));
    } finally {
      setDeletingVideoId(null);
    }
  }

  function sendPlayback(status: "playing" | "paused") {
    if (!room || !canControlPlayback || !socketRef.current) {
      return;
    }

    socketRef.current.emit("playback:command", {
      roomId: room.id,
      videoId: currentVideoId,
      videoRevision: playback?.videoRevision,
      status,
      positionSeconds: playerRuntimeRef.current.currentTime || position,
      playbackRate: playerRuntimeRef.current.playbackRate || 1
    });
  }

  function appendChatMessage(nextMessage: RoomChatMessage) {
    setChatMessages((currentMessages) => {
      const existingIndex = currentMessages.findIndex((message) => message.id === nextMessage.id);
      if (existingIndex >= 0) {
        const updatedMessages = [...currentMessages];
        updatedMessages[existingIndex] = nextMessage;
        return updatedMessages.slice(-100);
      }

      return [...currentMessages, nextMessage].slice(-100);
    });
  }

  function handleSendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!room || !socketRef.current || !canChat) {
      setChatError("进入房间后才能发送消息。");
      return;
    }

    const content = chatInput.trim();

    if (!content) {
      return;
    }

    if (content.length > 1000) {
      setChatError("消息最长 1000 字。");
      return;
    }

    setChatError(null);
    setSendingChat(true);
    setChatInput("");

    socketRef.current.emit("chat:send", { roomId: room.id, content }, (response?: { ok?: boolean }) => {
      setSendingChat(false);

      if (response?.ok === false) {
        setChatError("聊天发送失败。");
      }
    });
  }

  function scrollToPanel(kind: "playback" | "members") {
    const target = kind === "playback" ? playbackPanelRef.current : membersPanelRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="room-shell app-shell">
      <section className="room-workspace" aria-labelledby="room-title">
        <header className="room-topbar app-topbar">
          <div>
            <p>一起看</p>
            <h1 id="room-title">房间空间</h1>
          </div>
          <div className="room-actions">
            <button type="button" className="secondary-inline" onClick={onBackToDashboard}>
              返回首页
            </button>
            <button type="button" className="secondary-inline" onClick={onOpenProfile}>
              个人页
            </button>
            <button type="button" className="secondary-inline" onClick={onOpenFriends}>
              好友
            </button>
            <button type="button" className="secondary-inline" onClick={() => void logout()}>
              退出登录
            </button>
          </div>
        </header>

        <div className="room-grid room-grid-enhanced">
          <section className="room-panel room-entry-panel">
            <div className="members-heading">
              <h2>房间入口</h2>
              <span>{room ? (isRoomClosed ? "已关闭" : "同步中") : "未进入"}</span>
            </div>

            <div className="room-panel-stack">
              <form className="room-form" onSubmit={handleCreate}>
                <label>
                  <span>创建房间</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="输入房间标题" />
                </label>
                <button className="primary-button" type="submit" disabled={busyAction === "create"}>
                  {busyAction === "create" ? "创建中..." : "创建房间"}
                </button>
              </form>

              <form className="room-form" onSubmit={handleJoin}>
                <label>
                  <span>加入房间</span>
                  <input value={joinRoomId} onChange={(event) => setJoinRoomId(event.target.value)} placeholder="输入房间 ID" />
                </label>
                <div className="inline-button-row">
                  <button className="secondary-button inline-secondary-button" type="submit" disabled={busyAction === "join" || !joinRoomId.trim()}>
                    {busyAction === "join" ? "加入中..." : "普通加入"}
                  </button>
                  {isDeveloper ? (
                    <button
                      className="secondary-button inline-secondary-button"
                      type="button"
                      disabled={busyAction === "developer-enter" || !joinRoomId.trim()}
                      onClick={() => void handleDeveloperEnter()}
                    >
                      {busyAction === "developer-enter" ? "进入中..." : "开发者进入"}
                    </button>
                  ) : null}
                </div>
              </form>
            </div>

            {room ? (
              <div className="room-meta room-meta-tight">
                <div>
                  <span>当前房间</span>
                  <strong>{room.title}</strong>
                  <code>{room.id}</code>
                </div>
                <div>
                  <span>你的房间身份</span>
                  <strong>{formatRole(currentUserRole)}</strong>
                  <code>{onlineCount} 人在线</code>
                </div>
                <div>
                  <span>控制状态</span>
                  <strong>{developerControl.active ? "开发者接管中" : "房主控制中"}</strong>
                  <code>{developerController ? `${developerController.nickname} 正在控制` : socketStatus === "online" ? "实时已连接" : "实时未连接"}</code>
                </div>
                <div className="member-actions">
                  <button className="secondary-button inline-secondary-button" type="button" onClick={() => void handleLeave()} disabled={busyAction === "leave"}>
                    {busyAction === "leave" ? "离开中..." : "离开房间"}
                  </button>
                  <button className="secondary-button inline-secondary-button" type="button" onClick={onOpenFriends}>
                    邀请好友
                  </button>
                  {canCloseRoom ? (
                    <button className="small-action danger-action" type="button" disabled={busyAction === "close-room"} onClick={() => void handleCloseRoom()}>
                      关闭房间
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="empty-state compact-empty">
                <strong>还没有进入房间</strong>
                <p>先创建房间或输入房间 ID，视频同步、成员管理和聊天功能就会一起就位。</p>
              </div>
            )}
          </section>

          {isDeveloper && room ? (
            <section className="room-panel developer-console-panel">
              <div className="members-heading">
                <h2>开发者控制台</h2>
                <span>{developerControl.active ? "已接管" : "待命中"}</span>
              </div>

              <div className="profile-list developer-console-list">
                <div>
                  <dt>平台身份</dt>
                  <dd>{formatUserRole(user?.role)}</dd>
                </div>
                <div>
                  <dt>控制人</dt>
                  <dd>{developerController?.nickname ?? (developerControl.active ? "当前开发者" : "未接管")}</dd>
                </div>
                <div>
                  <dt>原房主</dt>
                  <dd>{members.find((member) => member.userId === developerControl.previousOwnerId)?.nickname ?? room.owner?.nickname ?? "暂无"}</dd>
                </div>
                <div>
                  <dt>控制范围</dt>
                  <dd>接管房间 / 释放控制权 / 关闭房间 / 播放控制 / 视频切换 / 成员管理</dd>
                </div>
              </div>

              <div className="member-actions developer-console-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={developerControl.active || busyAction === "takeover"}
                  onClick={() => void handleDeveloperTakeover()}
                >
                  {busyAction === "takeover" ? "接管中..." : "接管房间"}
                </button>
                <button
                  className="secondary-button inline-secondary-button"
                  type="button"
                  disabled={!isDeveloperController || busyAction === "release"}
                  onClick={() => void handleDeveloperRelease()}
                >
                  {busyAction === "release" ? "释放中..." : "释放控制权"}
                </button>
                <button
                  className="secondary-button inline-secondary-button"
                  type="button"
                  disabled={!canCloseRoom}
                  onClick={() => void handleCloseRoom()}
                >
                  关闭房间
                </button>
                <button className="secondary-button inline-secondary-button" type="button" onClick={() => scrollToPanel("playback")}>
                  播放控制
                </button>
                <button className="secondary-button inline-secondary-button" type="button" onClick={() => scrollToPanel("playback")}>
                  视频切换
                </button>
                <button className="secondary-button inline-secondary-button" type="button" onClick={() => scrollToPanel("members")}>
                  成员管理
                </button>
              </div>

              <p className="room-note developer-console-note">
                {developerControl.active
                  ? "当前房间已进入开发者接管状态，原房主的房主控制按钮会自动隐藏或禁用。"
                  : "开发者进入房间后，可以在这里直接接管房间控制权。"}
              </p>
            </section>
          ) : null}

          <section className="room-panel playback-panel" ref={playbackPanelRef}>
            <div className="members-heading">
              <h2>视频播放</h2>
              <span>{playlist.length} 条视频</span>
            </div>

            {!room ? (
              <div className="empty-state compact-empty">
                <strong>进入房间后可同步视频</strong>
                <p>支持多条视频的列表式管理，也支持为默认集数添加备注。</p>
              </div>
            ) : (
              <>
                {isRoomClosed ? <div className="form-error">房间已关闭，当前页面进入只读状态。</div> : null}

                {canControlPlayback ? (
                  <form className="video-import-form" onSubmit={handleVideoImport}>
                    <div className="video-draft-list">
                      {videoDrafts.map((draft, index) => (
                        <div className="video-draft-row" key={index}>
                          <input value={draft.url} onChange={(event) => updateVideoDraft(index, "url", event.target.value)} placeholder="https://example.com/video.mp4" />
                          <input
                            value={draft.displayName}
                            onChange={(event) => updateVideoDraft(index, "displayName", event.target.value)}
                            placeholder={`默认备注：第 ${index + 1} 集`}
                          />
                          <button className="small-action" type="button" onClick={() => removeVideoDraftRow(index)}>
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="member-actions">
                      <button className="secondary-button inline-secondary-button" type="button" onClick={addVideoDraftRow}>
                        新增一条
                      </button>
                      <button className="primary-button" type="submit" disabled={isImportingVideo}>
                        {isImportingVideo ? "录入中..." : "录入视频列表"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="room-note">
                    {controlLockedByDeveloper
                      ? "当前房间已被开发者接管，房主和管理员的播放控制已锁定。"
                      : "普通成员可以查看列表并接收房间控制人切换的播放内容。"}
                  </p>
                )}

                <div className="playlist-list">
                  {playlist.map((item, index) => (
                    <div
                      key={item.roomVideoId}
                      className={`playlist-item${currentVideoId === item.roomVideoId ? " playlist-item-active" : ""}`}
                    >
                      <button className="playlist-main-button" type="button" onClick={() => switchPlaylistItem(item)} disabled={!canControlPlayback}>
                        <div className="playlist-item-meta">
                          <strong>{item.displayName || `第 ${index + 1} 集`}</strong>
                          <span>{safeHostname(item.displayUrl)}</span>
                        </div>
                        <code>{currentVideoId === item.roomVideoId ? "当前播放" : `序号 ${index + 1}`}</code>
                      </button>
                      {canControlPlayback ? (
                        <button
                          className="small-action danger-action playlist-delete-button"
                          type="button"
                          disabled={deletingVideoId === item.roomVideoId}
                          onClick={() => void handleRemovePlaylistItem(item)}
                        >
                          {deletingVideoId === item.roomVideoId ? "删除中" : "删除"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {playlist.length === 0 ? (
                    <div className="empty-state compact-empty">
                      <strong>视频列表还是空的</strong>
                      <p>支持一次录入多条直链，系统会按顺序生成默认集数备注。</p>
                    </div>
                  ) : null}
                </div>

                <AdvancedRoomPlayer
                  source={videoSource}
                  contentType={currentPlaylistItem?.contentType ?? null}
                  displayName={currentVideoDisplayName}
                  displayUrl={currentPlaylistItem?.displayUrl ?? null}
                  contentLength={currentPlaylistItem?.contentLength ?? null}
                  playback={playback}
                  canControlPlayback={canControlPlayback}
                  syncModeLabel={playerSyncLabel}
                  runtimeStateRef={playerRuntimeRef}
                  onPositionChange={setPosition}
                  onPlaybackBlocked={setMessage}
                  onPlaybackCommand={sendPlayback}
                />

                <div className="playback-state">
                  <span>播放状态</span>
                  <strong>{playback?.status === "playing" ? "播放中" : "已暂停"}</strong>
                  <code>同步序号 {playback?.sequence ?? 0}</code>
                </div>

                <label className="position-control">
                  <span>播放位置（秒）</span>
                  <input type="number" min={0} max={86400} value={position} onChange={(event) => setPosition(Number(event.target.value))} />
                </label>

                <div className="playback-buttons">
                  <button className="primary-button" type="button" disabled={!canControlPlayback || !videoSource} onClick={() => sendPlayback("playing")}>
                    播放
                  </button>
                  <button
                    className="secondary-button inline-secondary-button"
                    type="button"
                    disabled={!canControlPlayback || !videoSource}
                    onClick={() => sendPlayback("paused")}
                  >
                    暂停
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="room-panel members-panel" ref={membersPanelRef}>
            <div className="members-heading">
              <h2>成员列表</h2>
              <span>{onlineCount} 人在线</span>
            </div>

            {room ? (
              <div className="member-list">
                {members.map((member) => (
                  <div className="member-row" key={member.userId}>
                    <div className="member-summary">
                      <strong>{member.nickname}</strong>
                      <span>{member.account}</span>
                      <code className={`member-presence ${member.online ? "member-presence-online" : "member-presence-offline"}`}>
                        {member.online ? "在线" : "离线"}
                      </code>
                    </div>

                    <div className="member-badge-row">
                      <span className={`role-badge role-${member.role}`}>{formatRole(member.role)}</span>
                      {member.userRole && member.userRole !== "user" ? (
                        <span className={`platform-badge platform-badge-${member.userRole.replace("_", "-")}`}>{formatUserRole(member.userRole)}</span>
                      ) : null}
                    </div>

                    <div className="member-actions">
                      {canSetAdmin(member) ? (
                        <button
                          className="small-action"
                          type="button"
                          disabled={memberActionUserId === member.userId}
                          onClick={() =>
                            void runMemberAction(member, () => roomApi.addAdmin(accessToken!, room.id, member.userId), `${member.nickname} 已设为管理员。`)
                          }
                        >
                          设为管理员
                        </button>
                      ) : null}

                      {canRemoveAdmin(member) ? (
                        <button
                          className="small-action"
                          type="button"
                          disabled={memberActionUserId === member.userId}
                          onClick={() =>
                            void runMemberAction(member, () => roomApi.removeAdmin(accessToken!, room.id, member.userId), `已取消 ${member.nickname} 的管理员权限。`)
                          }
                        >
                          取消管理员
                        </button>
                      ) : null}

                      {canKick(member) ? (
                        <button
                          className="small-action danger-action"
                          type="button"
                          disabled={memberActionUserId === member.userId}
                          onClick={() =>
                            void runMemberAction(
                              member,
                              () => roomApi.kickMember(accessToken!, room.id, member.userId),
                              `${member.nickname} 已被移出房间。`,
                              `确认移出 ${member.nickname} 吗？`
                            )
                          }
                        >
                          移出成员
                        </button>
                      ) : null}

                      {canTransferOwner(member) ? (
                        <button
                          className="small-action"
                          type="button"
                          disabled={memberActionUserId === member.userId}
                          onClick={() =>
                            void runMemberAction(
                              member,
                              () => roomApi.transferOwner(accessToken!, room.id, member.userId),
                              `房主已转让给 ${member.nickname}。`,
                              `确认把房主转让给 ${member.nickname} 吗？`
                            )
                          }
                        >
                          转让房主
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {members.length === 0 ? (
                  <div className="empty-state compact-empty">
                    <strong>当前没有成员</strong>
                    <p>进入房间后，成员会在这里公开展示在线状态、房间身份和开发者标识。</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state compact-empty">
                <strong>进入房间后可管理成员</strong>
                <p>这里会展示成员身份、开发者标识，以及管理员和房主的操作入口。</p>
              </div>
            )}
          </section>

          <section className="room-panel chat-panel">
            <div className="members-heading">
              <h2>文字聊天</h2>
              <span>{chatMessages.length} 条消息</span>
            </div>

            {room ? (
              <>
                <div className="chat-list" ref={chatListRef} aria-live="polite">
                  {chatMessages.map((chatMessage) => (
                    <article className="chat-message" key={chatMessage.id}>
                      <div className="chat-meta">
                        <strong>{chatMessage.senderNickname}</strong>
                        <span>{formatChatTime(chatMessage.createdAt)}</span>
                      </div>
                      <p>{chatMessage.content}</p>
                    </article>
                  ))}

                  {chatMessages.length === 0 ? (
                    <div className="empty-state compact-empty">
                      <strong>还没有聊天消息</strong>
                      <p>进房后先打个招呼，房间里的文字记录会实时同步给所有成员。</p>
                    </div>
                  ) : null}
                </div>

                <form className="chat-form" onSubmit={handleSendChat}>
                  <input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder={canChat ? "输入你要发送的消息" : isRoomClosed ? "房间已关闭，无法发送消息" : "进入房间后才能聊天"}
                    disabled={!canChat}
                    maxLength={1000}
                  />
                  <button className="primary-button" type="submit" disabled={!canChat || isSendingChat || !chatInput.trim()}>
                    发送
                  </button>
                </form>

                {chatError ? <div className="form-error chat-error">{chatError}</div> : null}
              </>
            ) : (
              <div className="empty-state compact-empty">
                <strong>进入房间后可聊天</strong>
                <p>房间消息会跟随实时在线状态同步更新，移动端也能直接查看。</p>
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

    if (err.code === "DEVELOPER_CONTROL_NOT_ACTIVE") {
      return "当前房间没有处于开发者接管状态，暂时无法释放控制权。";
    }

    return err.message;
  }

  return "房间服务暂时不可用。";
}

function formatRole(role?: RoomMember["role"] | null) {
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

function formatUserRole(role?: string | null) {
  if (role === "super_developer") {
    return "超级开发者";
  }

  if (role === "developer") {
    return "开发者";
  }

  if (role === "admin") {
    return "管理员";
  }

  return "普通用户";
}

function formatChatTime(createdAt: string) {
  const time = new Date(createdAt);

  if (Number.isNaN(time.getTime())) {
    return "";
  }

  return time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
