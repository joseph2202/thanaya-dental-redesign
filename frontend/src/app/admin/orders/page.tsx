"use client";
import { useState, useEffect } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { ordersAPI } from '@/lib/api';

export default function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await ordersAPI.getAll();
      setOrders(data);
    } catch (error) {
      console.error('فشل تحميل الطلبات:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId: string, status: string) => {
    try {
      await ordersAPI.updateStatus(orderId, status);
      await loadOrders();
      alert('تم تحديث حالة الطلب بنجاح');
    } catch (error) {
      alert('فشل تحديث حالة الطلب');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'confirmed': return 'bg-blue-100 text-blue-700';
      case 'shipped': return 'bg-purple-100 text-purple-700';
      case 'delivered': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'returned': return 'bg-gray-200 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'قيد المعالجة';
      case 'confirmed': return 'مؤكد';
      case 'shipped': return 'تم الشحن';
      case 'delivered': return 'تم التوصيل';
      case 'cancelled': return 'ملغي';
      case 'returned': return 'مرتجع';
      default: return status;
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="text-center py-20">
          <p className="text-neutral-600">جاري تحميل الطلبات...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h2 className="text-3xl font-black mb-8 text-ink">إدارة الطلبات</h2>
      
      {orders.length === 0 ? (
        <div className="bg-white border-2 border-brand/20 rounded-2xl p-12 text-center">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-neutral-600">لا توجد طلبات بعد</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white border-2 border-brand/20 rounded-2xl p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-black text-lg text-brand">{order.id}</h3>
                  <p className="text-sm text-neutral-500">{new Date(order.createdAt).toLocaleString('ar-IQ')}</p>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-bold ${getStatusColor(order.status)}`}>
                  {getStatusLabel(order.status)}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-neutral-500 mb-1">العميل</p>
                  <p className="font-bold text-ink">{order.customerName}</p>
                  <p className="text-sm text-neutral-600">{order.customerPhone}</p>
                  <p className="text-sm text-neutral-600">{order.customerAddress}، {order.customerCity}</p>
                </div>
                <div>
                  <p className="text-sm text-neutral-500 mb-1">الإجمالي</p>
                  <p className="text-2xl font-black text-brand">{order.total.toLocaleString()} د.ع</p>
                </div>
              </div>

              <div className="border-t border-brand/10 pt-4">
                <p className="text-sm font-bold text-ink mb-2">المنتجات:</p>
                <div className="space-y-1">
                  {order.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-neutral-600">{item.product?.name || 'منتج'} × {item.quantity}</span>
                      <span className="font-bold text-ink">{(item.price * item.quantity).toLocaleString()} د.ع</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-brand/10 pt-4 mt-4 flex gap-2 flex-wrap">
                <span className="text-sm font-bold text-ink">تغيير الحالة:</span>
                {({ pending: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered'], delivered: ['returned'], cancelled: [], returned: [] } as Record<string, string[]>)[order.status]?.map((status) => (
                  <button
                    key={status}
                    onClick={() => { if ((status === 'cancelled' || status === 'returned') && !window.confirm('هل تأكدت من الإلغاء أو استلام البضاعة المرتجعة؟ سيتم إعادة الكمية للمخزون.')) return; updateStatus(order.id, status); }}
                    disabled={order.status === status}
                    className={`text-xs px-3 py-1 rounded-full font-bold transition ${
                      order.status === status
                        ? 'bg-brand text-white'
                        : 'bg-paper2 text-ink hover:bg-brand/10'
                    }`}
                  >
                    {getStatusLabel(status)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
