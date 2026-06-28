import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { vipApi, VipApiError, type VipSummary } from "./vipApi";

type VipPageProps = {
  onBack: () => void;
};

export function VipPage({ onBack }: VipPageProps) {
  const { accessToken, user, updateUser } = useAuth();
  const [vip, setVip] = useState<VipSummary | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;
    const token = accessToken;

    async function loadVip() {
      setLoading(true);
      setError(null);

      try {
        const nextVip = await vipApi.getMyVip(token);
        if (!cancelled) {
          setVip(nextVip);
        }
      } catch (err) {
        if (!cancelled) {
          setError(toVipError(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadVip();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const vipLabel = useMemo(() => formatVip(vip?.cardType ?? null), [vip?.cardType]);

  async function handleRedeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken || !code.trim()) {
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const result = await vipApi.redeem(accessToken, code.trim());
      setVip(result.vip);
      setCode("");
      setMessage("VIP 激活成功。");

      if (user) {
        updateUser({
          ...user,
          vipCardType: result.vip.cardType,
          vipExpiresAt: result.vip.expiresAt
        });
      }
    } catch (err) {
      setError(toVipError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="room-shell app-shell">
      <section className="room-workspace" aria-labelledby="vip-title">
        <header className="room-topbar app-topbar">
          <div>
            <p>VIP 中心</p>
            <h1 id="vip-title">会员状态与兑换</h1>
          </div>
          <div className="room-actions">
            <button type="button" className="secondary-inline" onClick={onBack}>
              返回
            </button>
          </div>
        </header>

        <div className="room-grid dashboard-grid">
          <section className="room-panel hero-panel">
            <div className="hero-badge-row">
              <span className={`vip-chip${vip?.active ? " vip-chip-active" : ""}`}>{vipLabel}</span>
              <span className="hero-title-chip">{user?.currentTitle?.name ?? "新朋友"}</span>
            </div>
            <div className="hero-copy">
              <h2>{user?.nickname ?? user?.account} 的会员状态</h2>
              <p>{vip?.active ? "会员身份已生效，首页、房间页和个人页会同步展示。" : "输入激活码后，会员权益会立即写入当前账号。"}</p>
            </div>
            <div className="status-card-grid">
              <div className="status-card">
                <span>当前卡种</span>
                <strong>{vipLabel}</strong>
              </div>
              <div className="status-card">
                <span>到期时间</span>
                <strong>{vip?.cardType === "permanent" ? "永久有效" : vip?.expiresAt ? new Date(vip.expiresAt).toLocaleString() : loading ? "加载中" : "未开通"}</strong>
              </div>
            </div>
          </section>

          <section className="room-panel">
            <div className="members-heading">
              <h2>兑换激活码</h2>
              <span>即时到账</span>
            </div>
            <form className="profile-form" onSubmit={handleRedeem}>
              <label>
                <span>VIP 激活码</span>
                <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入激活码" />
              </label>
              <button className="primary-button" type="submit" disabled={busy || !code.trim()}>
                {busy ? "兑换中..." : "立即兑换"}
              </button>
            </form>
            <div className="empty-state compact-empty">
              <strong>卡种说明</strong>
              <p>支持日卡、月卡、年卡和永久卡。限时卡会在有效期基础上顺延叠加。</p>
            </div>
          </section>
        </div>

        {message ? <div className="form-success room-status">{message}</div> : null}
        {error ? <div className="form-error room-status">{error}</div> : null}
      </section>
    </main>
  );
}

function formatVip(cardType: VipSummary["cardType"]) {
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

function toVipError(err: unknown) {
  if (err instanceof VipApiError) {
    return err.message;
  }

  return "VIP 服务暂时不可用。";
}
