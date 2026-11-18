import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { api, ApiError, clearTokens, saveTokens } from "./api";

export type UserRole = "requester" | "provider" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role: "requester" | "provider") => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync("hn_access_token");
        if (stored) {
          const me = await api.get<AuthUser>("/auth/me");
          setState({ user: me, loading: false });
        } else {
          setState({ user: null, loading: false });
        }
      } catch {
        setState({ user: null, loading: false });
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>(
      "/auth/login",
      { email, password }
    );
    await saveTokens(result.accessToken, result.refreshToken);
    setState({ user: result.user, loading: false });
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name: string, role: "requester" | "provider") => {
      const result = await api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>(
        "/auth/signup",
        { email, password, name, role }
      );
      await saveTokens(result.accessToken, result.refreshToken);
      setState({ user: result.user, loading: false });
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      const rt = await SecureStore.getItemAsync("hn_refresh_token");
      if (rt) await api.post("/auth/logout", { refreshToken: rt });
    } catch { /* silent */ }
    await clearTokens();
    setState({ user: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() called outside <AuthProvider>");
  return ctx;
}
