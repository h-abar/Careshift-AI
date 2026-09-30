"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { users } from "@/lib/data/users";
import { can, type PermKey } from "@/lib/permissions";
import type { User } from "@/lib/types";

interface Auth {
  /** Currently authenticated user (placeholder admin while logged out). */
  user: User;
  loggedIn: boolean;
  /** Returns the user on success, null on bad credentials/suspended account. */
  login: (username: string, password: string) => User | null;
  logout: () => void;
  /** Demo role switcher (kept for the jury walkthrough). */
  setUser: (id: string) => void;
  can: (perm: PermKey) => boolean;
}

const Ctx = createContext<Auth>({
  user: users[7],
  loggedIn: false,
  login: () => null,
  logout: () => {},
  setUser: () => {},
  can: () => true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("U-008");
  const [loggedIn, setLoggedIn] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("careshift-user");
    if (saved && users.some((u) => u.id === saved)) {
      setUserId(saved);
      setLoggedIn(true);
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((id: string) => {
    setUserId(id);
    setLoggedIn(true);
    localStorage.setItem("careshift-user", id);
  }, []);

  const login = useCallback(
    (username: string, password: string): User | null => {
      const u = users.find(
        (x) =>
          (x.username === username.trim().toLowerCase() ||
            x.email.toLowerCase() === username.trim().toLowerCase()) &&
          x.password === password &&
          x.status === "active",
      );
      if (!u) return null;
      persist(u.id);
      return u;
    },
    [persist],
  );

  const logout = useCallback(() => {
    setLoggedIn(false);
    localStorage.removeItem("careshift-user");
  }, []);

  const user = users.find((u) => u.id === userId) ?? users[0];

  const value = useMemo<Auth>(
    () => ({
      user,
      loggedIn: loggedIn && hydrated,
      login,
      logout,
      setUser: persist,
      can: (p) => can(user.role, p),
    }),
    [user, loggedIn, hydrated, login, logout, persist],
  );

  // Before hydration we don't know the session — render nothing (avoids flash).
  if (!hydrated) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
