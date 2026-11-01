"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, getCurrentUser, logoutUser } from '@/lib/auth';
import { authAPI } from '@/lib/api';

type AuthContextType = {
  user: User | null;
  logout: () => void;
  refreshUser: () => void;
  isAdmin: boolean;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      try {
        // Some browser privacy modes block storage access. That should take the
        // visitor to /login, never freeze the admin page on "checking".
        const cached = getCurrentUser();
        const token = localStorage.getItem('thanaya-token');
        if (!cached || !token) {
          if (mounted) setUser(null);
          return;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        try {
          const current: User = await authAPI.me(controller.signal);
          if (!mounted) return;
          localStorage.setItem('thanaya-current-user', JSON.stringify(current));
          setUser(current);
        } catch (error: unknown) {
          if (!mounted) return;
          // Only an explicit 401 clears credentials; offline and timeout keep
          // the cached identity while every privileged API still checks JWT.
          if (error instanceof Error && (error as Error & { status?: number }).status === 401) {
            logoutUser();
            setUser(null);
          } else {
            setUser(cached);
          }
        } finally {
          window.clearTimeout(timeout);
        }
      } catch {
        // Failure to read localStorage must not strand the screen indefinitely.
        if (mounted) setUser(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    void restoreSession();
    return () => { mounted = false; };
  }, []);

  const logout = () => {
    logoutUser();
    setUser(null);
  };

  const refreshUser = () => {
    setUser(getCurrentUser());
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
