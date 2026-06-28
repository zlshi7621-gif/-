import { FormEvent, useMemo, useState } from "react";
import { AuthApiError } from "./authApi";
import { useAuth } from "./AuthContext";

type AuthMode = "login" | "register";

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-heading">
          <p>远程观影社区</p>
          <h1 id="auth-title">{mode === "login" ? "登录账号" : "注册账号"}</h1>
        </div>
        <AuthForm mode={mode} />
        <p className="auth-switch">
          {mode === "login" ? "还没有账号？" : "已经有账号？"}
          <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "去注册" : "去登录"}
          </button>
        </p>
      </section>
    </main>
  );
}

function AuthForm({ mode }: { mode: AuthMode }) {
  const { login, register } = useAuth();
  const [account, setAccount] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const isRegister = mode === "register";

  const canSubmit = useMemo(() => {
    if (!account.trim() || password.length < 8) {
      return false;
    }

    if (isRegister && !nickname.trim()) {
      return false;
    }

    return true;
  }, [account, isRegister, nickname, password]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isRegister) {
        await register({
          account: account.trim(),
          nickname: nickname.trim(),
          password,
          registrationCode: registrationCode.trim() || undefined
        });
      } else {
        await login({
          account: account.trim(),
          password
        });
      }
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.message);
      } else {
        setError("账号服务暂时不可用，请稍后再试。");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label>
        <span>账号</span>
        <input autoComplete="username" value={account} onChange={(event) => setAccount(event.target.value)} placeholder="请输入账号" />
      </label>

      {isRegister ? (
        <label>
          <span>昵称</span>
          <input autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="请输入昵称" />
        </label>
      ) : null}

      <label>
        <span>密码</span>
        <input
          autoComplete={isRegister ? "new-password" : "current-password"}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="至少 8 位密码"
        />
      </label>

      {isRegister ? (
        <label>
          <span>注册码</span>
          <input
            autoComplete="off"
            value={registrationCode}
            onChange={(event) => setRegistrationCode(event.target.value)}
            placeholder="如果系统开启注册码注册，请在此填写"
          />
        </label>
      ) : null}

      {error ? <div className="form-error">{error}</div> : null}

      <button className="primary-button" type="submit" disabled={!canSubmit || isSubmitting}>
        {isSubmitting ? "提交中..." : isRegister ? "注册并登录" : "登录"}
      </button>
    </form>
  );
}
