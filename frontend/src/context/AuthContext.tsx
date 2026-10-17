"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, getCurrentUser, logoutUser } from '@/lib/auth';

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
    try { setUser(getCurrentUser()); }
    finally { setIsLoading(false); }
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
