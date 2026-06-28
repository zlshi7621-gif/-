import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi, type AuthResponse, type AuthUser, type LoginRequest, type RegisterRequest } from "./authApi";
import { clearTokens, readTokens, saveTokens } from "./tokenStorage";

type AuthStatus = "checking" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function persistAuth(response: AuthResponse, setUser: (user: AuthUser) => void, setAccessToken: (token: string) => void) {
  saveTokens({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken
  });
  setUser(response.user);
  setAccessToken(response.accessToken);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tokens = readTokens();

    async function restoreSession() {
      if (!tokens) {
        setStatus("anonymous");
        return;
      }

      try {
        const currentUser = await authApi.me(tokens.accessToken);

        if (cancelled) {
          return;
        }

        setUser(currentUser);
        setAccessToken(tokens.accessToken);
        setStatus("authenticated");
      } catch {
        try {
          const refreshed = await authApi.refresh(tokens.refreshToken);

          if (cancelled) {
            return;
          }

          persistAuth(refreshed, setUser, setAccessToken);
          setStatus("authenticated");
        } catch {
          clearTokens();

          if (!cancelled) {
            setUser(null);
            setAccessToken(null);
            setStatus("anonymous");
          }
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginRequest) => {
    const response = await authApi.login(payload);
    persistAuth(response, setUser, setAccessToken);
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (payload: RegisterRequest) => {
    const response = await authApi.register(payload);
    persistAuth(response, setUser, setAccessToken);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    const tokens = readTokens();

    clearTokens();
    setUser(null);
    setAccessToken(null);
    setStatus("anonymous");

    if (!tokens) {
      return;
    }

    try {
      await authApi.logout(tokens.refreshToken, tokens.accessToken);
    } catch {
      // The local session is already cleared; remote logout can be retried by signing in again.
    }
  }, []);

  const updateUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      accessToken,
      login,
      register,
      logout,
      updateUser
    }),
    [accessToken, login, logout, register, status, updateUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
