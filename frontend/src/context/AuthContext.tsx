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
    const cached = getCurrentUser();
    if (!cached || !localStorage.getItem('thanaya-token')) {
      setUser(null); setIsLoading(false); return;
    }
    authAPI.me().then((current: User) => {
      if (!mounted) return;
      localStorage.setItem('thanaya-current-user', JSON.stringify(current));
      setUser(current);
    }).catch((error: unknown) => {
      if (!mounted) return;
      // Unavailable server should not erase the session; the API still enforces permissions.
      // If rejected, clear only after an explicit authentication failure.
      if (error instanceof Error && (error as Error & { status?: number }).status === 401) {
        logoutUser(); setUser(null);
      } else setUser(cached);
    }).finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const logout = () => {
    logoutUser();
    setUser(null);
  };

  const refreshUser = () => {
    setUser(getCurrentUser());
  };

  const isAdmin = user?.role === 'admin';

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
