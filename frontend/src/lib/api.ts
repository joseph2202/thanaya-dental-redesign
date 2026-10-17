const API_BASE = 'http://localhost:4000/api';

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'خطأ في الطلب');
  }

  return response.json();
}

// Auth API
export const authAPI = {
  register: (data: { name: string; email: string; phone: string; password: string }) =>
    apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  
  login: (email: string, password: string) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
};

// Products API
export const productsAPI = {
  getAll: (params?: { category?: string; brand?: string; sort?: string; search?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiRequest(`/products?${query}`);
  },
  
  getById: (id: string) => apiRequest(`/products/${id}`),
  
  create: (data: any) => apiRequest('/products', { method: 'POST', body: JSON.stringify(data) }),
  
  update: (id: string, data: any) => apiRequest(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  delete: (id: string) => apiRequest(`/products/${id}`, { method: 'DELETE' }),
};

// Orders API
export const ordersAPI = {
  getAll: () => apiRequest('/orders'),
  
  create: (data: any) => apiRequest('/orders', { method: 'POST', body: JSON.stringify(data) }),
  
  updateStatus: (id: string, status: string) =>
    apiRequest(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};

// Categories API
export const categoriesAPI = {
  getAll: () => apiRequest('/categories'),
  create: (data: any) => apiRequest('/categories', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => apiRequest(`/categories/${id}`, { method: 'DELETE' }),
};

// Coupons API
export const couponsAPI = {
  getAll: () => apiRequest('/coupons'),
  create: (data: any) => apiRequest('/coupons', { method: 'POST', body: JSON.stringify(data) }),
  toggle: (id: string) => apiRequest(`/coupons/${id}/toggle`, { method: 'PATCH' }),
  delete: (id: string) => apiRequest(`/coupons/${id}`, { method: 'DELETE' }),
};

// Users API
export const usersAPI = {
  getAll: () => apiRequest('/users'),
};

// Upload API
export const uploadAPI = {
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('image', file);
    
    const response = await fetch('http://localhost:4000/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'فشل رفع الصورة');
    }

    return response.json();
  },
};
