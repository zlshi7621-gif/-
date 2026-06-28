import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from "react";

type PlaybackState = {
  status: "playing" | "paused";
  positionSeconds: number;
  playbackRate: number;
  sequence: number;
};

export type PlayerRuntimeState = {
  currentTime: number;
  playbackRate: number;
};

type AdvancedRoomPlayerProps = {
  source: string;
  contentType: string | null | undefined;
  displayName: string | null | undefined;
  displayUrl: string | null | undefined;
  contentLength: number | null | undefined;
  playback: PlaybackState | null;
  canControlPlayback: boolean;
  syncModeLabel: string;
  runtimeStateRef: MutableRefObject<PlayerRuntimeState>;
  onPositionChange: (positionSeconds: number) => void;
  onPlaybackBlocked: (message: string) => void;
  onPlaybackCommand: (status: "playing" | "paused") => void;
};

const HLS_TYPES = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl", "application/mpegurl"]);

type HlsRuntime = {
  destroy: () => void;
  loadSource: (source: string) => void;
  attachMedia: (video: HTMLVideoElement) => void;
};

export function AdvancedRoomPlayer({
  source,
  contentType,
  displayName,
  displayUrl,
  contentLength,
  playback,
  canControlPlayback,
  syncModeLabel,
  runtimeStateRef,
  onPositionChange,
  onPlaybackBlocked,
  onPlaybackCommand
}: AdvancedRoomPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<HlsRuntime | null>(null);
  const [detectedQualityLabel, setDetectedQualityLabel] = useState<string | null>(null);
  const [playerMode, setPlayerMode] = useState<"normal" | "cinema">("normal");
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isWaiting, setWaiting] = useState(false);
  const [hasCanPlay, setCanPlay] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const sourceType = useMemo(() => inferSourceType(source, contentType), [source, contentType]);
  const isHlsSource = sourceType.includes("mpegurl") || /\.m3u8(\?|$)/i.test(source);
  const isAdaptiveSource = isHlsSource || sourceType.includes("dash");
  const qualityText = isAdaptiveSource ? "自适应清晰度" : detectedQualityLabel ?? "源画质检测中";
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  useEffect(() => {
    const video = videoRef.current;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setPlayerError(null);
    setCanPlay(false);
    setWaiting(Boolean(source));
    setDetectedQualityLabel(null);
    setDuration(0);
    setCurrentTime(0);

    if (!video || !source) {
      return;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();

    if (!isHlsSource || video.canPlayType(sourceType)) {
      video.src = source;
      video.load();
      return;
    }

    let disposed = false;
    void import("hls.js")
      .then(({ default: Hls }) => {
        if (disposed || !video) {
          return;
        }

        if (!Hls.isSupported()) {
          setPlayerError("当前浏览器不支持这个 HLS 视频源，请换用 MP4 直链或更换浏览器。");
          setWaiting(false);
          return;
        }

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false
        });
        hlsRef.current = hls;
        hls.loadSource(source);
        hls.attachMedia(video);
      })
      .catch(() => {
        setPlayerError("HLS 播放器加载失败，请换用 MP4 直链或稍后重试。");
        setWaiting(false);
      });

    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [isHlsSource, source, sourceType]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !playback) {
      return;
    }

    if (Math.abs(video.currentTime - playback.positionSeconds) > 1.25) {
      video.currentTime = playback.positionSeconds;
    }

    video.playbackRate = playback.playbackRate;
    updateRuntimeState(video);

    if (playback.status === "playing") {
      void video.play().catch(() => {
        onPlaybackBlocked("浏览器阻止了自动播放，请手动点击播放器上的播放按钮。");
      });
    } else {
      video.pause();
    }
  }, [onPlaybackBlocked, playback, source]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const handleLoadedMetadata = () => {
      updateRuntimeState(video);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setDetectedQualityLabel(readSourceQuality(video));
      setPlayerError(null);
    };

    const handleTimeUpdate = () => {
      updateRuntimeState(video);
      setCurrentTime(video.currentTime || 0);
      onPositionChange(video.currentTime || 0);
    };

    const handleCanPlay = () => {
      setCanPlay(true);
      setWaiting(false);
      setPlayerError(null);
      setDetectedQualityLabel((current) => current ?? readSourceQuality(video));
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };

    const handleWaiting = () => {
      setWaiting(true);
    };

    const handlePlaying = () => {
      setWaiting(false);
      setPlayerError(null);
      updateRuntimeState(video);
    };

    const handleVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    const handleError = () => {
      setWaiting(false);
      setPlayerError(videoErrorMessage(video.error));
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("durationchange", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("volumechange", handleVolumeChange);
    video.addEventListener("ratechange", () => updateRuntimeState(video));
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("durationchange", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("volumechange", handleVolumeChange);
      video.removeEventListener("ratechange", () => updateRuntimeState(video));
      video.removeEventListener("error", handleError);
    };
  }, [onPositionChange, runtimeStateRef, source]);

  function updateRuntimeState(video: HTMLVideoElement) {
    runtimeStateRef.current = {
      currentTime: video.currentTime || 0,
      playbackRate: video.playbackRate || 1
    };
  }

  function retryPlayback() {
    const video = videoRef.current;

    setPlayerError(null);
    if (video) {
      video.load();
      void video.play().catch(() => {
        onPlaybackBlocked("浏览器阻止了自动播放，请手动点击播放器上的播放按钮。");
      });
    }
  }

  function requestPlayback(status: "playing" | "paused") {
    const video = videoRef.current;

    if (!source || !video) {
      return;
    }

    if (canControlPlayback) {
      updateRuntimeState(video);
      onPlaybackCommand(status);
    } else if (status === "paused") {
      onPlaybackBlocked("当前身份不能暂停房间播放，请跟随房主或管理员同步播放。");
      return;
    }

    if (status === "playing") {
      void video.play().catch(() => {
        onPlaybackBlocked("浏览器阻止了自动播放，请再次点击播放器上的播放按钮。");
      });
    } else {
      video.pause();
    }
  }

  function seekTo(value: number, shouldSync: boolean) {
    const video = videoRef.current;

    if (!video || !Number.isFinite(value)) {
      return;
    }

    const nextTime = Math.min(Math.max(value, 0), duration || value);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    onPositionChange(nextTime);
    updateRuntimeState(video);

    if (shouldSync && canControlPlayback) {
      onPlaybackCommand(playback?.status ?? "paused");
    }
  }

  function changeVolume(value: number) {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const nextVolume = Math.min(Math.max(value, 0), 1);
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(video.muted);
  }

  async function toggleFullscreen() {
    const target = stageRef.current;

    if (!target) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch {
      onPlaybackBlocked("当前浏览器暂时无法进入全屏。");
    }
  }

  return (
    <div className={`advanced-player-shell advanced-player-${playerMode}`}>
      <div className="advanced-player-topbar">
        <div className="advanced-player-title">
          <strong>{displayName || "当前视频"}</strong>
          <span>{displayUrl ? safeHostname(displayUrl) : "未选择视频源"}</span>
        </div>
        <div className="advanced-player-actions">
          <code>{qualityText}</code>
          <button className="small-action" type="button" onClick={() => setPlayerMode((mode) => (mode === "cinema" ? "normal" : "cinema"))}>
            {playerMode === "cinema" ? "退出影院" : "影院模式"}
          </button>
        </div>
      </div>

      <div className="advanced-player-stage" ref={stageRef}>
        {source ? (
          <video
            ref={videoRef}
            className="advanced-native-video"
            playsInline
            preload="metadata"
            controls={false}
            onClick={() => requestPlayback(playback?.status === "playing" ? "paused" : "playing")}
          />
        ) : (
          <div className="advanced-player-placeholder">
            <strong>还没有可播放的视频</strong>
            <span>导入直链后会在这里显示高级播放器。</span>
          </div>
        )}

        {source && (isWaiting || !hasCanPlay) && !playerError ? (
          <div className="advanced-player-overlay">
            <div className="player-spinner" />
            <strong>正在缓冲视频</strong>
            <span>大文件或非流式 MP4 可能需要多请求几段数据。</span>
          </div>
        ) : null}

        {playerError ? (
          <div className="advanced-player-overlay player-error-panel">
            <strong>播放遇到问题</strong>
            <span>{playerError}</span>
            <button className="primary-button" type="button" onClick={retryPlayback}>
              重试播放
            </button>
          </div>
        ) : null}

        {source ? (
          <div className="advanced-player-controls">
            <div className="player-progress-row">
              <span>{formatTime(currentTime)}</span>
              <input
                aria-label="播放进度"
                className="player-progress-slider"
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || currentTime)}
                style={{ "--progress": `${progressPercent}%` } as CSSProperties}
                disabled={!duration}
                onChange={(event) => seekTo(Number(event.target.value), false)}
                onMouseUp={(event) => seekTo(Number(event.currentTarget.value), true)}
                onTouchEnd={(event) => seekTo(Number(event.currentTarget.value), true)}
                onKeyUp={(event) => seekTo(Number(event.currentTarget.value), true)}
              />
              <span>{formatTime(duration)}</span>
            </div>

            <div className="player-button-row">
              <button className="player-control-button player-control-primary" type="button" onClick={() => requestPlayback(playback?.status === "playing" ? "paused" : "playing")}>
                {playback?.status === "playing" ? "暂停" : "播放"}
              </button>
              <button className="player-control-button" type="button" onClick={() => seekTo(Math.max(currentTime - 10, 0), true)}>
                -10s
              </button>
              <button className="player-control-button" type="button" onClick={() => seekTo(currentTime + 10, true)}>
                +10s
              </button>
              <button className="player-control-button" type="button" onClick={() => changeVolume(muted ? volume || 0.8 : 0)}>
                {muted || volume === 0 ? "取消静音" : "静音"}
              </button>
              <input
                aria-label="音量"
                className="player-volume-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
              />
              <button className="player-control-button" type="button" onClick={retryPlayback}>
                重试
              </button>
              <button className="player-control-button" type="button" onClick={() => void toggleFullscreen()}>
                全屏
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="advanced-player-infobar">
        <span>{syncModeLabel}</span>
        <span>{canControlPlayback ? "你可以同步控制播放" : "跟随房主/管理员播放"}</span>
        <span>{formatBytes(contentLength)}</span>
        <span>{playback?.status === "playing" ? "播放中" : "已暂停"} · 序号 {playback?.sequence ?? 0}</span>
      </div>
    </div>
  );
}

function inferSourceType(source: string, contentType: string | null | undefined) {
  const normalized = contentType?.split(";")[0].trim().toLowerCase();

  if (normalized && (normalized.startsWith("video/") || HLS_TYPES.has(normalized) || normalized === "application/dash+xml")) {
    return normalized;
  }

  if (/\.m3u8(\?|$)/i.test(source)) {
    return "application/vnd.apple.mpegurl";
  }

  if (/\.mpd(\?|$)/i.test(source)) {
    return "application/dash+xml";
  }

  return "video/mp4";
}

function readSourceQuality(video: HTMLVideoElement) {
  const height = video.videoHeight ?? 0;

  if (!height) {
    return "源画质未知";
  }

  if (height >= 2160) return "源画质 4K";
  if (height >= 1440) return "源画质 1440P";
  if (height >= 1080) return "源画质 1080P";
  if (height >= 720) return "源画质 720P";
  if (height >= 480) return "源画质 480P";
  return `源画质 ${height}P`;
}

function videoErrorMessage(error: MediaError | null) {
  if (!error) {
    return "视频加载失败，请检查直链是否过期或稍后重试。";
  }

  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "浏览器无法解码这个视频源，请换用 MP4/HLS 直链或检查视频编码。";
  }

  if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return "视频网络加载失败，请检查直链是否过期或网络是否可访问。";
  }

  if (error.code === MediaError.MEDIA_ERR_DECODE) {
    return "视频解码失败，可能是编码格式不被当前浏览器支持。";
  }

  return "视频加载失败，请检查直链是否过期或稍后重试。";
}

function safeHostname(input: string) {
  try {
    return new URL(input).hostname;
  } catch {
    return input;
  }
}

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) {
    return "大小未知";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
