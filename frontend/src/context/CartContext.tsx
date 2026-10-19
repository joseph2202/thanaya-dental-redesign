"use client";
import {saleUnitLabel} from '@/lib/saleUnits';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
  usdPrice?: number;
  category?: string;
  brand?: string;
  icon?: string;
  image?: string | null;
  badge?: string;
  stock: number;
  availableStock?: number;
  saleUnit?: string | null;
};

export type CartItem = {
  product: Product;
  quantity: number;
};

type CartContextType = {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number) => { success: boolean; message: string };
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => { success: boolean; message: string };
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('thanaya-cart');
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse cart', e);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem('thanaya-cart', JSON.stringify(items));
  }, [items, hydrated]);

  const addToCart = (product: Product, quantity: number = 1): { success: boolean; message: string } => {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
      return { success: false, message: 'الكمية يجب أن تكون بين 1 و100' };
    }
    const current = items.find(item => item.product.id === product.id)?.quantity || 0;
    if ((product.availableStock??product.stock) <= 0) return { success: false, message: 'نفد المخزون' };
    if (current + quantity > (product.availableStock??product.stock) || current + quantity > 100) {
      return { success: false, message: 'الكمية المطلوبة أكثر من المتوفر' };
    }
    setItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) return prev.map(item => item.product.id === product.id
        ? { product, quantity: item.quantity + quantity } : item);
      return [...prev, { product, quantity }];
    });
    return { success: true, message: 'تمت الإضافة للسلة' };
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number): { success: boolean; message: string } => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return { success: true, message: 'تم الحذف' };
    }

    const item = items.find((item) => item.product.id === productId);
    if (!item) {
      return { success: false, message: 'المنتج غير موجود في السلة' };
    }

    if (quantity > (item.product.availableStock??item.product.stock)) {
      return { success: false, message: `الكمية المطلوبة غير متوفرة (متوفر فقط ${item.product.stock} ${saleUnitLabel(item.product.saleUnit)})` };
    }

    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );

    return { success: true, message: 'تم التحديث' };
  };

  const clearCart = () => setItems([]);

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
        totalItems,
        totalPrice,
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
