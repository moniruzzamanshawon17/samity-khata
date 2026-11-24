import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import type { Role, TokenResponse, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  is: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/auth/me")
      .then(setUser)
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const t = await api.post<TokenResponse>("/auth/login", { email, password }, { auth: false });
    setToken(t.access_token, t.expires_in);
    const me = await api.get<User>("/auth/me");
    setUser(me);
    return me;
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      await api.post<User>("/auth/register", { name, email, password }, { auth: false });
      return login(email, password);
    },
    [login],
  );

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, is: (...roles) => !!user && roles.includes(user.role) }),
    [user, loading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function homeFor(role: Role) {
  return role === "customer" ? "/me" : "/";
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Secretary · admin",
  staff: "Collector · staff",
  customer: "Member",
};
