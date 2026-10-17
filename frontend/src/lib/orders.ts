import { CartItem } from '@/context/CartContext';

export type Order = {
  id: string;
  items: CartItem[];
  total: number;
  customer: {
    name: string;
    phone: string;
    address: string;
    city: string;
  };
  paymentMethod: 'cod';
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
  createdAt: string;
};

export const saveOrder = (order: Omit<Order, 'id' | 'createdAt' | 'status'>): Order => {
  const fullOrder: Order = {
    ...order,
    id: 'ORD-' + Date.now().toString().slice(-8),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const orders = getOrders();
  orders.push(fullOrder);
  localStorage.setItem('thanaya-orders', JSON.stringify(orders));

  return fullOrder;
};

export const getOrders = (): Order[] => {
  const saved = localStorage.getItem('thanaya-orders');
  if (!saved) return [];
  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
};

export const getOrder = (id: string): Order | undefined => {
  return getOrders().find((o) => o.id === id);
};
