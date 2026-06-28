import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { profileApi, ProfileApiError } from "./profileApi";

type PreviewState = {
  avatarUrl: string | null;
  backgroundUrl: string | null;
};

type ProfilePageProps = {
  onBack: () => void;
  onOpenVip: () => void;
};

export function ProfilePage({ onBack, onOpenVip }: ProfilePageProps) {
  const { user, accessToken, logout, updateUser } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  const [isUploadingAvatar, setUploadingAvatar] = useState(false);
  const [isUploadingBackground, setUploadingBackground] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({
    avatarUrl: null,
    backgroundUrl: null
  });

  useEffect(() => {
    setNickname(user?.nickname ?? "");
  }, [user?.nickname]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!accessToken) {
        return;
      }

      try {
        const profile = await profileApi.getMe(accessToken);

        if (!cancelled) {
          updateUser(profile);
        }
      } catch {
        if (!cancelled) {
          setError("无法刷新个人资料，请稍后再试。");
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [accessToken, updateUser]);

  useEffect(() => {
    return () => {
      if (preview.avatarUrl) {
        URL.revokeObjectURL(preview.avatarUrl);
      }

      if (preview.backgroundUrl) {
        URL.revokeObjectURL(preview.backgroundUrl);
      }
    };
  }, [preview.avatarUrl, preview.backgroundUrl]);

  const avatarLabel = useMemo(() => user?.nickname?.trim().slice(0, 1) || user?.account?.trim().slice(0, 1) || "U", [user]);
  const vipExpiresText = user?.vipCardType === "permanent" ? "永久有效" : user?.vipExpiresAt ? new Date(user.vipExpiresAt).toLocaleString() : "未开通";
  const vipPermanentText = user?.vipCardType === "permanent" ? "是" : "否";

  async function handleNicknameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);

    if (!accessToken) {
      setError("登录状态已失效，请重新登录。");
      return;
    }

    const nextNickname = nickname.trim();

    if (!nextNickname) {
      setError("昵称不能为空。");
      return;
    }

    setSaving(true);

    try {
      const updatedUser = await profileApi.updateMe(accessToken, { nickname: nextNickname });
      updateUser(updatedUser);
      setStatusMessage("昵称已更新。");
    } catch (err) {
      setError(toProfileErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleImageChange(kind: "avatar" | "background", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!accessToken) {
      setError("登录状态已失效，请重新登录。");
      return;
    }

    setError(null);
    setStatusMessage(null);
    setLocalPreview(kind, file);

    if (kind === "avatar") {
      setUploadingAvatar(true);
    } else {
      setUploadingBackground(true);
    }

    try {
      const response =
        kind === "avatar" ? await profileApi.uploadAvatar(accessToken, file) : await profileApi.uploadBackground(accessToken, file);

      updateUser({
        ...response.user,
        avatarUrl: kind === "avatar" ? response.url ?? response.user.avatarUrl ?? null : response.user.avatarUrl ?? user?.avatarUrl ?? null,
        backgroundUrl:
          kind === "background" ? response.url ?? response.user.backgroundUrl ?? null : response.user.backgroundUrl ?? user?.backgroundUrl ?? null
      });
      setStatusMessage(kind === "avatar" ? "头像已上传。" : "背景图已上传。");
    } catch (err) {
      setError(toProfileErrorMessage(err));
    } finally {
      if (kind === "avatar") {
        setUploadingAvatar(false);
      } else {
        setUploadingBackground(false);
      }
    }
  }

  function setLocalPreview(kind: "avatar" | "background", file: File) {
    const objectUrl = URL.createObjectURL(file);

    setPreview((current) => {
      const previousUrl = kind === "avatar" ? current.avatarUrl : current.backgroundUrl;

      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      return {
        ...current,
        [kind === "avatar" ? "avatarUrl" : "backgroundUrl"]: objectUrl
      };
    });
  }

  return (
    <main className="profile-shell app-shell">
      <section className="profile-panel" aria-labelledby="profile-title">
        <div className="profile-nav">
          <button className="secondary-inline" type="button" onClick={onBack}>
            返回首页
          </button>
          <button className="secondary-inline" type="button" onClick={onOpenVip}>
            VIP 中心
          </button>
        </div>

        <div className="profile-cover">
          {preview.backgroundUrl || user?.backgroundUrl ? (
            <img src={preview.backgroundUrl ?? user?.backgroundUrl ?? ""} alt="背景图" />
          ) : (
            <div className="profile-cover-fallback">还没有上传背景图</div>
          )}
        </div>

        <div className="profile-main">
          <div className="profile-avatar" aria-label="头像预览">
            {preview.avatarUrl || user?.avatarUrl ? <img src={preview.avatarUrl ?? user?.avatarUrl ?? ""} alt="头像" /> : <span>{avatarLabel}</span>}
          </div>

          <div className="profile-heading">
            <p>个人资料</p>
            <h1 id="profile-title">{user?.nickname ?? "当前用户"}</h1>
          </div>

          <div className="profile-badges">
            <span className={`vip-chip${user?.vipCardType ? " vip-chip-active" : ""}`}>{formatVip(user?.vipCardType ?? null)}</span>
            <span className="hero-title-chip">{user?.currentTitle?.name ?? "新朋友"}</span>
            {user?.vipCardType === "permanent" ? <span className="hero-title-chip">永久会员</span> : null}
          </div>

          <dl className="profile-list">
            <div>
              <dt>账号</dt>
              <dd>{user?.account ?? "-"}</dd>
            </div>
            <div>
              <dt>昵称</dt>
              <dd>{user?.nickname ?? "-"}</dd>
            </div>
            <div>
              <dt>当前称号</dt>
              <dd>{user?.currentTitle?.name ?? "新朋友"}</dd>
            </div>
            <div>
              <dt>成长等级</dt>
              <dd>Lv.{user?.growthLevel ?? 1}</dd>
            </div>
            <div>
              <dt>VIP 状态</dt>
              <dd>{formatVip(user?.vipCardType ?? null)}</dd>
            </div>
            <div>
              <dt>VIP 到期时间</dt>
              <dd>{vipExpiresText}</dd>
            </div>
            <div>
              <dt>永久会员标识</dt>
              <dd>{vipPermanentText}</dd>
            </div>
            <div>
              <dt>头像资源</dt>
              <dd>{user?.avatarObjectKey ?? "未上传"}</dd>
            </div>
            <div>
              <dt>背景资源</dt>
              <dd>{user?.backgroundObjectKey ?? "未上传"}</dd>
            </div>
          </dl>

          <form className="profile-form" onSubmit={handleNicknameSubmit}>
            <label>
              <span>修改昵称</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="输入新的昵称" />
            </label>
            <button className="primary-button" type="submit" disabled={isSaving || nickname.trim() === user?.nickname}>
              {isSaving ? "保存中..." : "保存昵称"}
            </button>
          </form>

          <div className="upload-grid" aria-label="图片上传">
            <label className="upload-button">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void handleImageChange("avatar", event)} />
              <span>{isUploadingAvatar ? "头像上传中..." : "上传头像"}</span>
            </label>
            <label className="upload-button">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => void handleImageChange("background", event)}
              />
              <span>{isUploadingBackground ? "背景上传中..." : "上传背景图"}</span>
            </label>
          </div>

          {statusMessage ? <div className="form-success">{statusMessage}</div> : null}
          {error ? <div className="form-error">{error}</div> : null}

          <button className="secondary-button" type="button" onClick={() => void logout()}>
            退出登录
          </button>
        </div>
      </section>
    </main>
  );
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

function toProfileErrorMessage(err: unknown) {
  if (err instanceof ProfileApiError) {
    return err.message;
  }

  return "资料服务暂时不可用，请稍后再试。";
}
