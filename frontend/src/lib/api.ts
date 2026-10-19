const API_BASE = 'http://localhost:4000/api';

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('thanaya-token') : null;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    const apiError = new Error(error.error || 'خطأ في الطلب') as Error & { status: number };
    apiError.status = response.status;
    throw apiError;
  }

  return response.json();
}

// Auth API
export const authAPI = {
  register: (data: { name: string; email: string; phone: string; password: string }) =>
    apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  
  me: () => apiRequest('/auth/me'),
  login: (email: string, password: string) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
};

// Products API
export const productsAPI = {
  getAll: (params?: { category?: string; brand?: string; sort?: string; search?: string; minPrice?: string; maxPrice?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiRequest(`/products?${query}`);
  },
  
  getById: (id: string) => apiRequest(`/products/${id}`),
  quote: (items: {productId:string;quantity:number}[]):Promise<CartQuote> => apiRequest('/products/quote',{method:'POST',body:JSON.stringify({items})}),
  
  create: (data: any) => apiRequest('/products', { method: 'POST', body: JSON.stringify(data) }),
  
  update: (id: string, data: any) => apiRequest(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  delete: (id: string) => apiRequest(`/products/${id}`, { method: 'DELETE' }),
  getInventory: (id: string) => apiRequest(`/products/${id}/inventory`),
  getLots: (id: string) => apiRequest(`/products/${encodeURIComponent(id)}/lots`),
  enableLots: (id: string) => apiRequest(`/products/${encodeURIComponent(id)}/enable-lots`, { method: 'POST', body: '{}' }),
  receiveLot: (id: string, data: { code: string; expiryDate: string; quantity: number }) =>
    apiRequest(`/products/${encodeURIComponent(id)}/lots`, { method: 'POST', body: JSON.stringify(data) }),
  adjustLot: (id: string, lotId: string, data: { delta: number; reason: string }) =>
    apiRequest(`/products/${encodeURIComponent(id)}/lots/${encodeURIComponent(lotId)}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
  adjustStock: (id: string, delta: number, reason: string) => apiRequest(`/products/${id}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ delta, reason }) }),
};

// Orders API
export const ordersAPI = {
  getAll: () => apiRequest('/orders'),
  manage: (params: {page:number;status:string;search:string}) => apiRequest('/orders/manage?'+new URLSearchParams({page:String(params.page),status:params.status,search:params.search}).toString()),
  getMine: () => apiRequest('/orders/mine'),
  recoverAttempt: (requestId:string):Promise<{id:string;total:number;status:string}> => apiRequest('/orders/attempt/'+encodeURIComponent(requestId)),
  getById: (id: string) => apiRequest(`/orders/${encodeURIComponent(id)}`),
  
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
  preview: (code: string, items: {productId:string;quantity:number}[]) => apiRequest('/coupons/preview', {method:'POST',body:JSON.stringify({code,items})}),
  delete: (id: string) => apiRequest(`/coupons/${id}`, { method: 'DELETE' }),
};

// Users API
export const usersAPI = {
  getAll: () => apiRequest('/users'),
  updateRole: (id: string, role: string) => apiRequest(`/users/${encodeURIComponent(id)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  roleHistory: () => apiRequest('/users/role-history'),
};

// Upload API
export const uploadAPI = {
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('image', file);
    const token = localStorage.getItem('thanaya-token');
    
    const response = await fetch('http://localhost:4000/api/upload', {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'فشل رفع الصورة');
    }

    return response.json();
  },
};

// Central settings (GET public for storefront; writes owner-only).
export const settingsAPI = {
  getPublic: () => apiRequest('/settings/public'),
  getAdmin: () => apiRequest('/settings'),
  save: (data: any) => apiRequest('/settings', { method: 'PUT', body: JSON.stringify(data) }),
};

export type DeliveryRate={province:string;fee:number;available:boolean};
export type DeliveryConfig={enabled:boolean;revision:number;rates:DeliveryRate[]};
export const deliveryAPI={
  getPublic:():Promise<DeliveryConfig>=>apiRequest('/delivery/public'),
  getAdmin:():Promise<DeliveryConfig>=>apiRequest('/delivery'),
  save:(data:DeliveryConfig):Promise<DeliveryConfig>=>apiRequest('/delivery',{method:'PUT',body:JSON.stringify(data)})
};

export type StoreNotification={id:string;kind:string;title:string;message:string;orderId:string|null;createdAt:string;readAt:string|null};
export type NotificationInbox={items:StoreNotification[];unread:number;lowStock:{id:string;name:string;stock:number}[]};
export const notificationsAPI={
  get:():Promise<NotificationInbox>=>apiRequest('/notifications'),
  read:(id:string)=>apiRequest('/notifications/'+encodeURIComponent(id)+'/read',{method:'PATCH'})
};

export type SalesReport={
 range:string;generatedAt:string;
 stats:{orders:number;deliveredOrders:number;deliveredValue:number;discountsOnDelivered:number;deliveryFeesOnDelivered:number;averageDeliveredOrderValue:number;awaitingOrders:number;cancelledOrders:number;returnedOrders:number;totalProducts:number;lowStockProducts:number;outOfStockProducts:number};
 statusCounts:Record<string,number>;
 topProducts:{productId:string;name:string;units:number}[];
 lowStock:{id:string;name:string;stock:number}[];
 trendDays:number;trend:{date:string;orders:number;value:number}[];
};
export const reportsAPI={
 overview:(range:'7'|'30'|'90'|'all'):Promise<SalesReport>=>apiRequest('/reports/overview?range='+range)
};

export type CartQuote={items:{productId:string;quantity:number;product:{id:string;name:string;price:number;stock:number;availableStock:number;saleUnit:string|null}|null;available:boolean}[];subtotal:number;canCheckout:boolean};
