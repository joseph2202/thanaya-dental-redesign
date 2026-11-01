"use client";
import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, clearLegacyAuthStorage, logoutUser } from '@/lib/auth';
import { authAPI } from '@/lib/api';

type AuthContextType = {
  user: User | null;
  logout: () => Promise<void>;
  refreshUser: (confirmedUser: User) => void;
  isAdmin: boolean;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const sessionVersion = useRef(0);

  useEffect(() => {
    let mounted = true;
    const version = sessionVersion.current;
    // Remove obsolete JavaScript-readable bearer credentials from upgrades.
    // Authentication is always re-verified against the server cookie.
    clearLegacyAuthStorage();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    void authAPI.me(controller.signal).then((current: User) => {
      if (mounted && version === sessionVersion.current) setUser(current);
    }).catch(() => {
      if (mounted && version === sessionVersion.current) setUser(null);
    }).finally(() => {
      window.clearTimeout(timeout);
      if (mounted) setIsLoading(false);
    });
    return () => {
      mounted = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);

  const refreshUser = (confirmedUser: User) => {
    // The user response comes directly from successful backend login/register.
    // Do not trust unverified localStorage roles.
    sessionVersion.current += 1;
    setUser(confirmedUser);
    setIsLoading(false);
  };

  const logout = async () => {
    try {
      await logoutUser();
      sessionVersion.current += 1;
      setUser(null);
    } catch {
      // The HttpOnly cookie may still be valid: never display a false success.
      window.alert('تعذّر تسجيل الخروج بسبب الاتصال. تحقق من الإنترنت وحاول مرة ثانية.');
    }
  };

  const isAdmin = ['owner', 'admin', 'inventory', 'sales'].includes(user?.role || '');

  return (
    <AuthContext.Provider value={{ user, logout, refreshUser, isAdmin, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
