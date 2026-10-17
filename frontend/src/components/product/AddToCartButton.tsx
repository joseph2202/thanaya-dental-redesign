"use client";
import { useCart, Product } from '@/context/CartContext';
import { useState } from 'react';

export default function AddToCartButton({ product }: { product: Product }) {
  const { addToCart } = useCart();
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const handleAdd = () => {
    const result = addToCart(product);
    setMessage(result.message);
    setIsError(!result.success);
    
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleAdd}
        disabled={product.stock <= 0}
        className={`site-btn site-btn-primary disabled:opacity-50 disabled:cursor-not-allowed ${
          message && !isError ? 'bg-success' : 'hover:bg-brand-dark'
        }`}
      >
        {product.stock <= 0 ? 'نفد المخزون' : (message || 'أضف للسلة')}
      </button>
      {message && isError && (
        <p className="text-red-600 text-sm font-bold">{message}</p>
      )}
    </div>
  );
}
