import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { growthApi, GrowthApiError, type GrowthSummary } from "./growthApi";

type GrowthPageProps = {
  onBack: () => void;
};

export function GrowthPage({ onBack }: GrowthPageProps) {
  const { accessToken, updateUser, user } = useAuth();
  const [summary, setSummary] = useState<GrowthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTitle, setBusyTitle] = useState<string | null>(null);
  const [isCheckingIn, setCheckingIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    async function loadSummary() {
      if (!accessToken) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextSummary = await growthApi.getMe(accessToken);

        if (!cancelled) {
          setSummary(nextSummary);
          syncUserGrowth(nextSummary);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toGrowthError(err, "成长信息加载失败。"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function syncUserGrowth(nextSummary: GrowthSummary) {
    if (!user) {
      return;
    }

    updateUser({
      ...user,
      currentTitle: nextSummary.currentTitle ? { code: nextSummary.currentTitle.code, name: nextSummary.currentTitle.name } : null,
      growthLevel: nextSummary.level,
      totalExp: nextSummary.totalExp
    });
  }

  async function handleCheckIn() {
    if (!accessToken) {
      return;
    }

    setCheckingIn(true);
    setError(null);
    setMessage(null);

    try {
      const result = await growthApi.checkIn(accessToken);
      setSummary(result);
      syncUserGrowth(result);
      setMessage(`签到成功，获得 ${result.gainedExp} 经验。`);
    } catch (err) {
      setError(toGrowthError(err, "签到失败。"));
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleEquipTitle(code: string) {
    if (!accessToken) {
      return;
    }

    setBusyTitle(code);
    setError(null);
    setMessage(null);

    try {
      const nextSummary = await growthApi.equipTitle(accessToken, code);
      setSummary(nextSummary);
      syncUserGrowth(nextSummary);
      setMessage("称号已更新。");
    } catch (err) {
      setError(toGrowthError(err, "称号切换失败。"));
    } finally {
      setBusyTitle(null);
    }
  }

  return (
    <main className="friends-shell">
      <section className="friends-workspace" aria-labelledby="growth-title">
        <header className="room-topbar">
          <div>
            <p>成长中心</p>
            <h1 id="growth-title">签到、称号与徽章</h1>
          </div>
          <button type="button" className="secondary-inline" onClick={onBack}>
            返回首页
          </button>
        </header>

        <div className="friends-grid">
          <section className="room-panel friends-panel">
            <div className="members-heading">
              <h2>成长概览</h2>
              <span>{loading ? "加载中" : `Lv.${summary?.level ?? 1}`}</span>
            </div>
            <div className="profile-list">
              <div>
                <dt>总经验</dt>
                <dd>{summary?.totalExp ?? 0}</dd>
              </div>
              <div>
                <dt>签到次数</dt>
                <dd>{summary?.checkInCount ?? 0}</dd>
              </div>
              <div>
                <dt>当前连续</dt>
                <dd>{summary?.currentStreak ?? 0} 天</dd>
              </div>
              <div>
                <dt>最长连续</dt>
                <dd>{summary?.longestStreak ?? 0} 天</dd>
              </div>
              <div>
                <dt>当前称号</dt>
                <dd>{summary?.currentTitle?.name ?? "未设置"}</dd>
              </div>
            </div>
            <button className="primary-button" type="button" disabled={loading || isCheckingIn || summary?.hasCheckedInToday} onClick={handleCheckIn}>
              {summary?.hasCheckedInToday ? "今日已签到" : isCheckingIn ? "签到中..." : "立即签到"}
            </button>
          </section>

          <section className="room-panel friends-panel">
            <div className="members-heading">
              <h2>可用称号</h2>
              <span>{summary?.titles.length ?? 0} 个</span>
            </div>
            <div className="friend-list">
              {summary?.titles.map((title) => (
                <div className="friend-row" key={title.code}>
                  <div className="member-summary">
                    <strong>{title.name}</strong>
                    <span>{title.description}</span>
                    <code>
                      需求：Lv.{title.requiredLevel} / 连续 {title.requiredStreak} 天
                    </code>
                  </div>
                  <div className="member-actions">
                    <span className={`role-badge${title.equipped ? " role-owner" : ""}`}>{title.equipped ? "当前佩戴" : title.unlocked ? "已解锁" : "未解锁"}</span>
                    <button className="small-action" type="button" disabled={!title.unlocked || title.equipped || busyTitle === title.code} onClick={() => void handleEquipTitle(title.code)}>
                      {busyTitle === title.code ? "保存中..." : "佩戴"}
                    </button>
                  </div>
                </div>
              ))}
              {!loading && !summary?.titles.length ? <p className="room-note">暂无称号。</p> : null}
            </div>
          </section>

          <section className="room-panel friends-panel">
            <div className="members-heading">
              <h2>徽章墙</h2>
              <span>{summary?.badges.filter((badge) => badge.unlocked).length ?? 0} 已解锁</span>
            </div>
            <div className="friend-list">
              {summary?.badges.map((badge) => (
                <div className="friend-row" key={badge.code}>
                  <div className="member-summary">
                    <strong>{badge.name}</strong>
                    <span>{badge.description}</span>
                    <code>
                      需求：Lv.{badge.requiredLevel} / 连续 {badge.requiredStreak} 天 / 签到 {badge.requiredCheckInCount} 次
                    </code>
                  </div>
                  <div className="member-actions">
                    <span className={`role-badge${badge.unlocked ? " role-admin" : ""}`}>{badge.unlocked ? "已获得" : "未达成"}</span>
                  </div>
                </div>
              ))}
              {!loading && !summary?.badges.length ? <p className="room-note">暂无徽章。</p> : null}
            </div>
          </section>
        </div>

        {message ? <div className="form-success room-status">{message}</div> : null}
        {error ? <div className="form-error room-status">{error}</div> : null}
      </section>
    </main>
  );
}

function toGrowthError(err: unknown, fallback: string) {
  if (err instanceof GrowthApiError) {
    return err.message;
  }

  return fallback;
}
