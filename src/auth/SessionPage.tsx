import { useAuth } from "./AuthContext";

export function SessionPage() {
  const { user, logout } = useAuth();

  return (
    <main className="auth-shell">
      <section className="auth-panel compact-panel" aria-labelledby="session-title">
        <div className="auth-heading">
          <p>当前登录状态</p>
          <h1 id="session-title">已登录</h1>
        </div>

        <dl className="session-list">
          <div>
            <dt>账号</dt>
            <dd>{user?.account ?? "-"}</dd>
          </div>
          <div>
            <dt>昵称</dt>
            <dd>{user?.nickname ?? "-"}</dd>
          </div>
          <div>
            <dt>角色</dt>
            <dd>{user?.role ?? "-"}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{user?.status ?? "-"}</dd>
          </div>
        </dl>

        <button className="secondary-button" type="button" onClick={() => void logout()}>
          退出登录
        </button>
      </section>
    </main>
  );
}
