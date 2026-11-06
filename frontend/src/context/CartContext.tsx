"use client";
import {saleUnitLabel} from '@/lib/saleUnits';
import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {decodeSavedCart,productSnapshot,cartLimits,type Product,type CartItem} from '@/lib/cartState';
export type {Product,CartItem} from '@/lib/cartState';

type CartContextType = {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number) => { success: boolean; message: string };
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => { success: boolean; message: string };
  clearCart: () => void;
  replaceCart: (entries: CartItem[]) => { success: boolean; message: string };
  totalItems: number;
  totalPrice: number;
  cartNotice: string;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const currentItems=useRef<CartItem[]>([]);
  const [recoveryNotice,setRecoveryNotice]=useState('');
  const [storageNotice,setStorageNotice]=useState('');
  const storageWarning='المتصفح ما يسمح بحفظ السلة حالياً. تبقى متاحة بهالجلسة؛ راجعها إذا أعدت تحميل الصفحة.';
  const applyItems=(next:CartItem[])=>{currentItems.current=next;setItems(next);};

  useEffect(() => {
    try{
      const decoded=decodeSavedCart(localStorage.getItem('thanaya-cart'));
      applyItems(decoded.items);
      if(decoded.recovered)setRecoveryNotice('نظّفنا بيانات غير صالحة من السلة. راجع المنتجات والكميات قبل المتابعة.');
    }catch{setStorageNotice(storageWarning);}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if(hydrated){try{localStorage.setItem('thanaya-cart',JSON.stringify(items));}catch{setStorageNotice(storageWarning);}}
  }, [items, hydrated]);

  const addToCart = (product: Product, quantity: number = 1): { success: boolean; message: string } => {
    if(!hydrated)return {success:false,message:'انتظر تحميل سلتك ثم حاول مرة ثانية'};
    const snapshot=productSnapshot(product);
    if(!snapshot)return {success:false,message:'تفاصيل المنتج غير صالحة. حدّث الصفحة وحاول مرة ثانية'};
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > cartLimits.quantity) {
      return { success: false, message: 'الكمية يجب أن تكون بين 1 و100' };
    }
    const previous=currentItems.current;
    const current = previous.find(item => item.product.id === product.id)?.quantity || 0;
    if(!current&&previous.length>=cartLimits.lines)return {success:false,message:'السلة تقبل حتى 50 منتجاً مختلفاً'};
    if (product.stock <= 0) return { success: false, message: 'نفد المخزون' };
    if (current + quantity > product.stock || current + quantity > 100) {
      return { success: false, message: 'الكمية المطلوبة أكثر من المتوفر' };
    }
    applyItems(current?previous.map(item=>item.product.id===product.id?{product:snapshot,quantity:item.quantity+quantity}:item)
      :[...previous,{product:snapshot,quantity}]);
    return { success: true, message: 'تمت الإضافة للسلة' };
  };

  const removeFromCart = (productId: string) => {
    applyItems(currentItems.current.filter(item=>item.product.id!==productId));
  };

  const updateQuantity = (productId: string, quantity: number): { success: boolean; message: string } => {
    if(!Number.isSafeInteger(quantity)||quantity<0||quantity>cartLimits.quantity)return {success:false,message:'الكمية يجب أن تكون بين 1 و100'};
    if (quantity === 0) {
      removeFromCart(productId);
      return { success: true, message: 'تم الحذف' };
    }

    const item = currentItems.current.find((item) => item.product.id === productId);
    if (!item) {
      return { success: false, message: 'المنتج غير موجود في السلة' };
    }

    if (quantity > item.product.stock) {
      return { success: false, message: `الكمية المطلوبة غير متوفرة (متوفر فقط ${item.product.stock} ${saleUnitLabel(item.product.saleUnit)})` };
    }

    applyItems(currentItems.current.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      ));

    return { success: true, message: 'تم التحديث' };
  };

  const clearCart = () => applyItems([]);

  // Used only after refetching the current prices and available stock from the server.
  // Replace all items atomically; unlike repeated addToCart calls, this cannot
  // accumulate stale quantities or accidentally combine two separate purchases.
  const replaceCart = (entries: CartItem[]): { success: boolean; message: string } => {
    if (!hydrated) return { success: false, message: 'انتظر تحميل سلتك ثم حاول مرة ثانية' };
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 50) {
      return { success: false, message: 'الطلب لا يحتوي منتجات قابلة للإضافة' };
    }
    const ids = new Set<string>(),next:CartItem[]=[];
    for (const entry of entries) {
      const product=productSnapshot(entry?.product),quantity=entry?.quantity;
      if (!product || typeof product.id !== 'string' || ids.has(product.id) ||
          !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100 ||
          !Number.isSafeInteger(product.stock) || product.stock < quantity ||
          !Number.isSafeInteger(product.price) || product.price < 0) {
        return { success: false, message: 'بعض المنتجات أو الكميات لم تعد متوفرة. راجع الطلب.' };
      }
      ids.add(product.id);
      next.push({product,quantity});
    }
    applyItems(next);
    return { success: true, message: 'تم تجهيز السلة، راجع الأسعار والكميات قبل تأكيد طلب جديد' };
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        replaceCart,
        totalItems,
        totalPrice,
        cartNotice:[recoveryNotice,storageNotice].filter(Boolean).join(' '),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
