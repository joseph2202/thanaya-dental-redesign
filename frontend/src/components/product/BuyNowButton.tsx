"use client";
import { useCart, Product } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function BuyNowButton({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleBuyNow = () => {
    const result = addToCart(product);
    
    if (!result.success) {
      setMessage(result.message);
      setIsError(true);
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    if (!user) {
      router.push('/login?redirect=/checkout');
      return;
    }

    router.push('/checkout');
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleBuyNow}
        disabled={product.stock <= 0}
        className="site-btn site-btn-outline px-8 py-3 hover:bg-paper2 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {product.stock <= 0 ? 'نفد المخزون' : 'اشتري الآن'}
      </button>
      {message && isError && (
        <p className="text-red-600 text-sm font-bold">{message}</p>
      )}
    </div>
  );
}
