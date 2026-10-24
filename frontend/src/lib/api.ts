// Browser calls use the site's own /api route (also behind Cloudflare).
// Server-rendered pages run inside Node.js, where fetch('/api/...') has no
// absolute origin. Contact the local Express backend directly on the server.
// The internal URL is NEVER sent to a visitor's browser.
const API_BASE = typeof window === 'undefined'
  ? `${process.env.THANAYA_INTERNAL_API_ORIGIN || 'http://127.0.0.1:4000'}/api`
  : '/api';

// The home page renders categories and products together. Coalesce only
// simultaneous unfiltered catalog GETs; don't cache stock or prices after
// the request completes.
let pendingCatalog: Promise<any> | null = null;

// Older products/banners already store absolute localhost upload URLs.
// Rewrite only those local image paths to the shared /uploads/* route.
// This also handles gallery URLs inside serialized JSON strings.
function normalizeLegacyUploadLinks<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/https?:\/\/(?:localhost|127\.0\.0\.1):4000\/uploads\//gi, '/uploads/') as T;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeLegacyUploadLinks) as T;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeLegacyUploadLinks(item)])
    ) as T;
  }
  return value;
}

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

  // A stopped backend or a failed Next.js rewrite can return plain text or
  // HTML (e.g. "Internal Server Error"). Never JSON.parse these responses
  // blindly and never expose a server stack trace to the storefront.
  const body = await response.text();
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { parsed = null; }
  const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown> : null;

  if (!response.ok || !data) {
    const serverMessage = data && typeof data.error === 'string' ? data.error : null;
    const fallback = response.status >= 500
      ? 'تعذّر الاتصال بخدمة ثنايا. تحقق من تشغيل الـBackend على المنفذ 4000 وتحديث Prisma Client.'
      : response.status === 404
        ? 'مسار الخدمة غير موجود. تأكد من تحديث وتشغيل الـBackend الجديد.'
        : response.status === 401
          ? 'يرجى تسجيل الدخول مجدداً.'
          : response.status === 403
            ? 'لا توجد صلاحية للوصول لهذه البيانات.'
            : 'تعذّر استلام رد صحيح من خدمة ثنايا.';
    // Untrusted non-JSON response text is deliberately not displayed.
    const apiError = new Error(serverMessage || fallback) as Error & { status: number };
    apiError.status = response.status;
    throw apiError;
  }

  return normalizeLegacyUploadLinks(data);
}

// Auth API
export const authAPI = {
  register: (data: { name: string; email: string; phone: string; password: string }) =>
    apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  
  me: (signal?: AbortSignal) => apiRequest('/auth/me', { signal }),
  login: (email: string, password: string) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
};

// Products API
export const productsAPI = {
  getAll: (params?: { category?: string; brand?: string; sort?: string; search?: string; minPrice?: string; maxPrice?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    if (typeof window !== 'undefined' && !query) {
      if (!pendingCatalog) {
        pendingCatalog = apiRequest('/products').finally(() => { pendingCatalog = null; });
      }
      return pendingCatalog;
    }
    return apiRequest(query ? `/products?${query}` : '/products');
  },
  
  getById: (id: string) => apiRequest(`/products/${id}`),
  manage: () => apiRequest('/products/manage'),
  setVisibility: (id: string, published: boolean) => apiRequest(`/products/${encodeURIComponent(id)}/visibility`, { method: 'PATCH', body: JSON.stringify({published}) }),
  quote: (items: {productId:string;quantity:number}[]):Promise<CartQuote> => apiRequest('/products/quote',{method:'POST',body:JSON.stringify({items})}),
  
  create: (data: any) => apiRequest('/products', { method: 'POST', body: JSON.stringify(data) }),
  
  update: (id: string, data: any) => apiRequest(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  delete: (id: string) => apiRequest(`/products/${id}`, { method: 'DELETE' }),
  getInventory: (id: string) => apiRequest(`/products/${id}/inventory`),
  getLots: (id: string) => apiRequest(`/products/${encodeURIComponent(id)}/lots`),
  savePurchaseCost:(id:string,purchaseCostIqd:number|null,expectedRevision:number):Promise<{purchaseCostIqd:number|null;costRevision:number}>=>
    apiRequest(`/products/${encodeURIComponent(id)}/purchase-cost`,{method:'PATCH',body:JSON.stringify({purchaseCostIqd,expectedRevision})}),
  saveLotPurchaseCost:(id:string,lotId:string,purchaseCostIqd:number|null,expectedRevision:number):Promise<{purchaseCostIqd:number|null;costRevision:number}>=>
    apiRequest(`/products/${encodeURIComponent(id)}/lots/${encodeURIComponent(lotId)}/purchase-cost`,{method:'PATCH',body:JSON.stringify({purchaseCostIqd,expectedRevision})}),
  purchaseCostHistory:(id:string)=>apiRequest(`/products/${encodeURIComponent(id)}/purchase-cost/history`),
  enableLots: (id: string) => apiRequest(`/products/${encodeURIComponent(id)}/enable-lots`, { method: 'POST', body: '{}' }),
  receiveLot: (id: string, data: { code: string; expiryDate: string; quantity: number }) =>
    apiRequest(`/products/${encodeURIComponent(id)}/lots`, { method: 'POST', body: JSON.stringify(data) }),
  adjustLot: (id: string, lotId: string, data: { delta: number; reason: string }) =>
    apiRequest(`/products/${encodeURIComponent(id)}/lots/${encodeURIComponent(lotId)}/adjust`, { method: 'POST', body: JSON.stringify(data) }),
  adjustStock: (id: string, delta: number, reason: string) => apiRequest(`/products/${id}/stock-adjustment`, { method: 'POST', body: JSON.stringify({ delta, reason }) }),
};

export type SavedAddress = { id:string;label:string;name:string;phone:string;city:string;address:string;isDefault:boolean;createdAt:string;updatedAt:string };
export type AddressInput = Pick<SavedAddress,'label'|'name'|'phone'|'city'|'address'>;
export const addressesAPI = {
  getMine: ():Promise<SavedAddress[]> => apiRequest('/addresses'),
  create: (data:AddressInput):Promise<SavedAddress> => apiRequest('/addresses',{method:'POST',body:JSON.stringify(data)}),
  update: (id:string,data:AddressInput):Promise<SavedAddress> => apiRequest('/addresses/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(data)}),
  setDefault: (id:string):Promise<SavedAddress> => apiRequest('/addresses/'+encodeURIComponent(id)+'/default',{method:'POST',body:'{}'}),
  delete: (id:string):Promise<{deleted:boolean}> => apiRequest('/addresses/'+encodeURIComponent(id),{method:'DELETE'}),
};

// Downloads real XLSX archives. Authorization travels in the request header rather
// than an exposed query parameter, and is checked again by the server.
export const exportsAPI={
  download:async (kind:'orders'|'inventory',range:'7'|'30'|'90'|'all'='30')=>{
    const token=localStorage.getItem('thanaya-token');
    if(!token)throw new Error('سجّل دخولك أولاً');
    const pathname=kind==='orders'?'/exports/orders?range='+range:'/exports/inventory';
    const response=await fetch(API_BASE+pathname,{headers:{Authorization:'Bearer '+token}});
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw new Error(data.error||'تعذّر تصدير البيانات');
    }
    const data=await response.blob();
    const url=URL.createObjectURL(data);
    const link=document.createElement('a');
    link.href=url;
    const filename=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1];
    link.download=filename||'thanaya-export.xlsx';
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
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
  receiveReturn: (id:string,data:{requestId:string;reason:string;items:{orderItemId:string;quantity:number;quarantinedQuantity?:number;lots?:{lotId:string;quantity:number;quarantinedQuantity?:number}[]}[]})=>
    apiRequest('/orders/'+encodeURIComponent(id)+'/returns',{method:'POST',body:JSON.stringify(data)}),
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
    
    const response = await fetch(API_BASE + '/upload', {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'فشل رفع الصورة');
    }

    return normalizeLegacyUploadLinks(await response.json());
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

export type FinancialEvent={
 id:string;kind:'collection'|'refund';method:'cash'|'bank_transfer'|'card'|'other';
 amountIqd:number;note:string;actorId:string;createdAt:string
};
export type OrderFinancialLedger={
 order:{id:string;customerName:string;status:string;total:number;paymentMethod:string};
 totals:{collectedIqd:number;refundedIqd:number;netIqd:number;collectionRemainingIqd:number;
 refundableCeilingIqd:number;refundableRemainingIqd:number;ledgerOnly:true};
 events:FinancialEvent[]
};
export type FinancialSummary={
 range:string;receivedIqd:number;refundedIqd:number;netRecordedIqd:number;
 receipts:number;refunds:number;deliveredWithoutReceipt:number;generatedAt:string;explanation:string
};
export type FinanceOrderChoice={
 id:string;customerName:string;status:'delivered'|'returned';total:number;
 createdAt:string;collectedIqd:number;refundedIqd:number;collectionRemainingIqd:number
};
export type FinanceOrderFinder={orders:FinanceOrderChoice[];limit:number;hasMore:boolean};
export const financeAPI={
 findOrders:(search:string):Promise<FinanceOrderFinder>=>apiRequest('/finance/orders?'+new URLSearchParams({search}).toString()),
 summary:(range:'7'|'30'|'90'|'all'):Promise<FinancialSummary>=>apiRequest('/finance/summary?range='+range),
 order:(id:string):Promise<OrderFinancialLedger>=>apiRequest('/finance/orders/'+encodeURIComponent(id)),
 record:(id:string,event:{requestId:string;kind:'collection'|'refund';method:'cash'|'bank_transfer'|'card'|'other';amountIqd:number;note:string}):
  Promise<{id:string;kind:string;amountIqd:number;alreadyProcessed:boolean}>=>
  apiRequest('/finance/orders/'+encodeURIComponent(id)+'/events',{method:'POST',body:JSON.stringify(event)})
};

export type SupplierRecord={
 id:string;code:string;name:string;contact:string|null;phone:string|null;
 email:string|null;city:string|null;address:string|null;note:string|null;
 active:boolean;revision:number;createdAt:string;updatedAt:string
};
export type SupplierInput={
 code:string;name:string;contact?:string;phone?:string;email?:string;
 city?:string;address?:string;note?:string
};
export type PurchaseDraftLine={
 id:string;purchaseOrderId:string;productId:string;productName:string;sku:string|null;
 quantity:number;unitCostIqd:number
};
export type PurchaseStatus='draft'|'approved'|'ordered'|'cancelled';
export type PurchaseDecision={
 id:string;requestId:string;actorId:string;action:'approved'|'ordered'|'cancelled';
 fromStatus:PurchaseStatus;toStatus:PurchaseStatus;note:string;createdAt:string;
 actor:{id:string;name:string};
};
export type PurchaseDraftRecord={
 id:string;requestId:string;status:PurchaseStatus;revision:number;
 supplierId:string;createdById:string;
 note:string|null;createdAt:string;updatedAt:string;totalIqd:number;
 supplier:{id:string;name:string;code:string;active:boolean};
 createdBy:{id:string;name:string};lines:PurchaseDraftLine[];events:PurchaseDecision[]
};
export const procurementAPI={
 suppliers:(search=''):Promise<SupplierRecord[]>=>
  apiRequest('/procurement/suppliers?'+new URLSearchParams({search}).toString()),
 createSupplier:(input:SupplierInput):Promise<SupplierRecord>=>
  apiRequest('/procurement/suppliers',{method:'POST',body:JSON.stringify(input)}),
 updateSupplier:(id:string,input:Partial<SupplierInput>&{active?:boolean;expectedRevision:number}):Promise<SupplierRecord>=>
  apiRequest('/procurement/suppliers/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(input)}),
 drafts:():Promise<PurchaseDraftRecord[]>=>apiRequest('/procurement/purchase-drafts'),
 decide:(id:string,input:{requestId:string;expectedRevision:number;
  action:'approved'|'ordered'|'cancelled';note:string}):
  Promise<{eventId:string;alreadyProcessed:boolean;status:PurchaseStatus;message:string}>=>
   apiRequest('/procurement/purchase-drafts/'+encodeURIComponent(id)+'/transitions',{
    method:'POST',body:JSON.stringify(input)
   }),
 createDraft:(input:{requestId:string;supplierId:string;note?:string;
  lines:{productId:string;quantity:number;unitCostIqd:number}[]}):
  Promise<{id:string;alreadyCreated:boolean;notice:string}>=>
  apiRequest('/procurement/purchase-drafts',{method:'POST',body:JSON.stringify(input)})
};
