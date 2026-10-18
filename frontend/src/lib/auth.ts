import { authAPI } from './api';

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'owner' | 'admin' | 'inventory' | 'sales' | 'customer';
  createdAt: string;
};

export const registerUser = async (name: string, email: string, phone: string, password: string): Promise<{ user: User | null; error: string }> => {
  try {
    const result = await authAPI.register({ name, email, phone, password });
    localStorage.setItem('thanaya-current-user', JSON.stringify(result.user));
    localStorage.setItem('thanaya-token', result.token);
    return { user: result.user, error: '' };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
};

export const loginUser = async (email: string, password: string): Promise<{ user: User | null; error: string }> => {
  try {
    const result = await authAPI.login(email, password);
    localStorage.setItem('thanaya-current-user', JSON.stringify(result.user));
    localStorage.setItem('thanaya-token', result.token);
    return { user: result.user, error: '' };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
};

export const logoutUser = () => {
  localStorage.removeItem('thanaya-current-user');
  localStorage.removeItem('thanaya-token');
};

export const getCurrentUser = (): User | null => {
  const saved = localStorage.getItem('thanaya-current-user');
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
};
