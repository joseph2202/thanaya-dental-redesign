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

// Only the session-bound CSRF proof is exposed to JavaScript, never the signed JWT.
function csrfProof(): string | null {
  if (typeof document === 'undefined') return null;
  for (const name of ['__Host-thanaya_csrf', 'thanaya_csrf']) {
    const pair = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith(name + '='));
    if (pair) return pair.slice(name.length + 1);
  }
  return null;
}
function csrfHeader(method = 'GET'): Record<string, string> {
  if (['GET','HEAD','OPTIONS'].includes(method.toUpperCase())) return {};
  const proof = csrfProof();
  return proof ? { 'X-Thanaya-CSRF': proof } : {};
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeader(options.method),
      ...Object.fromEntries(new Headers(options.headers).entries()),
    },
  });

  // A stopped backend or a failed Next.js rewrite can return plain text or
  // HTML (e.g. "Internal Server Error"). Never JSON.parse these responses
  // blindly and never expose a server stack trace to the storefront.
  if (response.ok && response.status === 204) return undefined as T;
  const body = await response.text();
  let parsed: unknown;
  let validJson = false;
  try { parsed = JSON.parse(body); validJson = true; } catch { parsed = null; }
  const errorBody = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown> : null;

  // JSON arrays are valid for products, suppliers, orders, categories, etc.
  if (!response.ok || !validJson) {
    const serverMessage = errorBody && typeof errorBody.error === 'string' ? errorBody.error : null;
    const fallback = response.status >= 500
      ? 'الخدمة غير متاحة مؤقتاً. يرجى المحاولة مرة أخرى بعد قليل.'
      : response.status === 404
        ? 'تعذّر العثور على الخدمة المطلوبة.'
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

  return normalizeLegacyUploadLinks(parsed as T);
}

export type SandboxPayment={provider:'mock';environment:'sandbox';reference:string;orderId:string;
 amountIqd:number;currency:'IQD';status:'pending'|'authorized'|'paid'|'failed'|'cancelled'|'refunded';refundedIqd:number;sequence:number};
export type SandboxPaymentDetail={payment:SandboxPayment;sandbox:true;realMoney:false;events:{eventId:string;
 sequence:number;status:SandboxPayment['status'];refundedIqd:number;source:string;outcome:string;
 actorName:string|null;occurredAt:string;recordedAt:string}[];webhookDelivered?:boolean};
export type SandboxPaymentCatalog={enabled:boolean;sandbox:true;realMoney:false;
 intents?:{payment:SandboxPayment;createdBy:string;createdAt:string}[];orders?:{id:string;total:number;status:string}[]};
export const paymentSandboxAPI={
 status:(signal?:AbortSignal):Promise<SandboxPaymentCatalog>=>apiRequest('/payment-sandbox',{signal}),
 get:(reference:string):Promise<SandboxPaymentDetail>=>apiRequest('/payment-sandbox/intents/'+encodeURIComponent(reference)),
 create:(orderId:string,requestId:string):Promise<SandboxPaymentDetail>=>apiRequest('/payment-sandbox/intents',{
  method:'POST',body:JSON.stringify({orderId,requestId})}),
 simulate:(reference:string,status:'authorized'|'paid'|'failed'|'cancelled',deliverWebhook=true):Promise<SandboxPaymentDetail>=>
  apiRequest('/payment-sandbox/intents/'+encodeURIComponent(reference)+'/simulate',{method:'POST',body:JSON.stringify({status,deliverWebhook})}),
 reconcile:(reference:string):Promise<SandboxPaymentDetail>=>apiRequest('/payment-sandbox/intents/'+encodeURIComponent(reference)+'/reconcile',{method:'POST',body:'{}'}),
 refund:(reference:string,amountIqd:number,requestId:string):Promise<SandboxPaymentDetail>=>
  apiRequest('/payment-sandbox/intents/'+encodeURIComponent(reference)+'/refunds',{method:'POST',body:JSON.stringify({amountIqd,requestId})}),
};

// Auth API
export const authAPI = {
  register: (data: { name: string; email: string; phone: string; password: string }) =>
    apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(data), headers: { 'X-Thanaya-Auth-Mode': 'cookie' } }),
  
  me: (signal?: AbortSignal) => apiRequest('/auth/me', { signal }),
  login: (email: string, password: string) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), headers: { 'X-Thanaya-Auth-Mode': 'cookie' } }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
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

// XLSX downloads authenticate with same-origin HttpOnly session cookies.
export const exportsAPI={
  download:async (kind:'orders'|'inventory',range:'7'|'30'|'90'|'all'='30')=>{
    const pathname=kind==='orders'?'/exports/orders?range='+range:'/exports/inventory';
    const response=await fetch(API_BASE+pathname,{credentials:'same-origin'});
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
export type OrderStatusHistory={
  order:{id:string;status:string;createdAt:string};
  events:{id:string;kind:string;fromStatus:string|null;toStatus:string;actorName:string;
    actorRole:string;createdAt:string;reason:string|null;referenceId:string|null}[];
  hasMore:boolean;completeFromCreation:boolean;recordedOnly:true;explanation:string;
};

export const ordersAPI = {
  getAll: () => apiRequest('/orders'),
  manage: (params: {page:number;status:string;search:string}) => apiRequest('/orders/manage?'+new URLSearchParams({page:String(params.page),status:params.status,search:params.search}).toString()),
  getMine: () => apiRequest('/orders/mine'),
  recoverAttempt: (requestId:string):Promise<{id:string;total:number;status:string}> => apiRequest('/orders/attempt/'+encodeURIComponent(requestId)),
  getById: (id: string) => apiRequest(`/orders/${encodeURIComponent(id)}`),
  
  create: (data: any) => apiRequest('/orders', { method: 'POST', body: JSON.stringify(data) }),
  
  history:(id:string,signal?:AbortSignal):Promise<OrderStatusHistory> =>
    apiRequest('/orders/'+encodeURIComponent(id)+'/history',{signal}),
  updateStatus: (id: string, status: string,reason?:string) =>
    apiRequest(`/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status,...(reason?{reason}:{}) }) }),
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
    const response = await fetch(API_BASE + '/upload', {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
      headers: csrfHeader('POST'),
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
export type CostCoverageReport={
 range:string;generatedAt:string;eligibleDelivered:number;
 completeCostOrders:number;missingCostOrders:number;returnedDeliveredOrders:number;
 unreturnedDeliveredOrders:number;coveragePercent:number;
 knownCostIqd:number;coveredSalesIqd:number;knownMerchandiseMarginIqd:number;
 complete:boolean;warning:string
};
export type OperationalSummary={range:string;generatedAt:string;
 period:{collectedIqd:number;refundedIqd:number;netCollectionsIqd:number;expenseIqd:number;netRecordedCashMovementIqd:number};
 receivables:{dueIqd:number;orders:number;excludedReturnOrders:number;returnedOrders:number;scope:string};
 payables:{dueIqd:number;invoices:number;overdueIqd:number;overdueInvoices:number;scope:string};
 expiry:{today:string;through:string;expiredLots:number;expiredUnits:number;soonLots:number;soonUnits:number;
  lots:{id:string;code:string;expiryDate:string;stock:number;product:{id:string;name:string}}[];limit:number;hasMore:boolean};
 netProfitIqd:null;actualCashBalanceIqd:null;
 explanations:{period:string;receivables:string;payables:string;cash:string};
};
export type ReturnReviewReport={
 range:string;page:number;pageSize:number;total:number;totalPages:number;generatedAt:string;
 legacyWithoutEvidence:number;reviewScope:'received_return_documents';settlementRecorded:false;
 explanations:{period:string;cost:string;money:string;review:string};
 rows:{returnId:string;orderId:string;receivedAt:string;currentOrderStatus:string;requiresReview:true;
  units:number;restockedUnits:number;quarantinedUnits:number;grossSaleValueIqd:number;
  cost:{documentedPartIqd:number;unknownUnits:number;totalHistoricalSaleCostIqd:number|null};
  currentOrderLedger:{collectedIqd:number;refundedIqd:number;refundableCeilingIqd:number;refundableRemainingIqd:number;refundAboveMerchandiseCeiling:boolean};
  lines:{productId:string;productName:string|null;quantity:number;disposition:'restocked'|'quarantined';lotId:string|null;grossSaleValueIqd:number;historicalSaleCostIqd:number|null}[]
 }[];
};
export const reportsAPI={
 overview:(range:'7'|'30'|'90'|'all',signal?:AbortSignal):Promise<SalesReport>=>apiRequest('/reports/overview?range='+range,{signal}),
 returnReview:(range:'7'|'30'|'90'|'all',page=1,signal?:AbortSignal):Promise<ReturnReviewReport>=>apiRequest('/reports/return-review?'+new URLSearchParams({range,page:String(page)}),{signal}),
 costs:(range:'7'|'30'|'90'|'all',signal?:AbortSignal):Promise<CostCoverageReport>=>apiRequest('/reports/costs?range='+range,{signal}),
 operations:(range:'7'|'30'|'90'|'all',signal?:AbortSignal):Promise<OperationalSummary>=>apiRequest('/reports/operations?range='+range,{signal})
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
export type ReceivingLine = {
  id:string;productId:string;productName:string;quantity:number;
  unitCostIqd:number;lotTracking:boolean;receivedQuantity:number;remainingQuantity:number
};
export type SupplierGoodsReceipt = {
  id:string;createdAt:string;actorId:string;note:string;
  lines:{purchaseOrderLineId:string;quantity:number;unitCostIqd:number;lotCode:string|null;expiryDate:string|null}[]
};
export type ReceivingSnapshot = {
  id:string;status:PurchaseStatus;receiptRevision:number;
  lines:ReceivingLine[];receipts:SupplierGoodsReceipt[];complete:boolean
};
export type ReceivingRequest = {
  requestId:string;expectedRevision:number;note:string;
  lines:{purchaseOrderLineId:string;quantity:number;lotCode?:string;expiryDate?:string}[]
};
export const receivingAPI = {
  get:(orderId:string):Promise<ReceivingSnapshot> =>
    apiRequest('/receiving/purchase-orders/'+encodeURIComponent(orderId)),
  receive:(orderId:string,input:ReceivingRequest):Promise<{id:string;alreadyProcessed:boolean;message:string}> =>
    apiRequest('/receiving/purchase-orders/'+encodeURIComponent(orderId)+'/receipts',{
      method:'POST',body:JSON.stringify(input)
    })
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

export type SupplierPaymentEvent={
 id:string;requestId:string;actorId:string;
 method:'cash'|'bank_transfer'|'other';amountIqd:number;reference:string;createdAt:string
};
export type SupplierInvoiceRecord={
 id:string;supplierId:string;purchaseOrderId:string;invoiceNumber:string;
 invoiceDate:string;dueDate:string;amountIqd:number;note:string;
 createdById:string;createdAt:string;paymentRevision:number;
 paidIqd:number;remainingIqd:number;status:'unpaid'|'partial'|'paid';
 supplier:{id:string;name:string;code:string};
 payments:SupplierPaymentEvent[]
};
export type SupplierPayablesList={
 invoices:SupplierInvoiceRecord[];limit:number;totalInvoices:number;matchedInvoices:number;hasMore:boolean;
 totals:{invoicedIqd:number;paidIqd:number;remainingIqd:number};
 explanation:string
};
export const payablesAPI={
 list:(supplierId?:string,search?:string):Promise<SupplierPayablesList>=>{
  const query=new URLSearchParams();
  if(supplierId)query.set('supplierId',supplierId);
  if(search)query.set('search',search);
  return apiRequest('/payables/invoices'+(query.size?'?'+query.toString():''));
 },
 get:(id:string):Promise<SupplierInvoiceRecord> =>
  apiRequest('/payables/invoices/'+encodeURIComponent(id)),
 create:(input:{requestId:string;purchaseOrderId:string;invoiceNumber:string;
  invoiceDate:string;dueDate:string;amountIqd:number;note:string}):
  Promise<{id:string;alreadyCreated:boolean;message:string}> =>
  apiRequest('/payables/invoices',{method:'POST',body:JSON.stringify(input)}),
 recordPayment:(id:string,input:{requestId:string;amountIqd:number;
  method:'cash'|'bank_transfer'|'other';reference:string}):
  Promise<{id:string;alreadyProcessed:boolean;message:string}> =>
  apiRequest('/payables/invoices/'+encodeURIComponent(id)+'/payments',{
   method:'POST',body:JSON.stringify(input)
  })
};

export type CashSummary={
 range:string;generatedAt:string;expenseCount:number;recordedExpenseIqd:number;
 cashInIqd:number;cashOutIqd:number;netRecordedCashMovementIqd:number;
 components:{customerCashCollectedIqd:number;customerCashRefundedIqd:number;
  supplierCashPaidIqd:number;cashOperatingExpensesIqd:number;
  ownerCashContributionsIqd:number;ownerCashWithdrawalsIqd:number};
 warning:string
};
export type StoreExpenseRecord={
 id:string;actorId:string;category:string;method:string;amountIqd:number;
 reference:string;note:string;createdAt:string
};
export const cashAPI={
 summary:(range:'7'|'30'|'90'|'all'):Promise<CashSummary> =>
  apiRequest('/cash/summary?range='+range),
 expenses:():Promise<StoreExpenseRecord[]>=>apiRequest('/cash/expenses'),
 recordExpense:(input:{requestId:string;category:string;method:'cash'|'bank_transfer'|'other';
  amountIqd:number;reference:string;note:string}):Promise<{id:string;alreadyRecorded:boolean}> =>
  apiRequest('/cash/expenses',{method:'POST',body:JSON.stringify(input)}),
 ownerMovement:(input:{requestId:string;direction:'contribution'|'withdrawal';
  amountIqd:number;reference:string;note:string}):Promise<{id:string;alreadyRecorded:boolean}> =>
  apiRequest('/cash/owner-movements',{method:'POST',body:JSON.stringify(input)})
};
