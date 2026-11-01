import { authAPI } from './api';

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'owner' | 'admin' | 'inventory' | 'sales' | 'customer';
  createdAt: string;
};

export function clearLegacyAuthStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('thanaya-token');
    localStorage.removeItem('thanaya-current-user');
  } catch {
    // Browser storage may be disabled. Cookie auth does not need it.
  }
}

export const registerUser = async (
  name: string, email: string, phone: string, password: string
): Promise<{ user: User | null; error: string }> => {
  try {
    const result = await authAPI.register({ name, email, phone, password });
    clearLegacyAuthStorage();
    return { user: result.user, error: '' };
  } catch (error: unknown) {
    return { user: null, error: error instanceof Error ? error.message : 'تعذّر إنشاء الحساب' };
  }
};

export const loginUser = async (
  email: string, password: string
): Promise<{ user: User | null; error: string }> => {
  try {
    const result = await authAPI.login(email, password);
    clearLegacyAuthStorage();
    return { user: result.user, error: '' };
  } catch (error: unknown) {
    return { user: null, error: error instanceof Error ? error.message : 'تعذّر تسجيل الدخول' };
  }
};

export const logoutUser = async (): Promise<void> => {
  // If the request fails, the HttpOnly cookie may still be valid; do not
  // pretend logout succeeded. Let the UI show a retry message.
  await authAPI.logout();
  clearLegacyAuthStorage();
};
