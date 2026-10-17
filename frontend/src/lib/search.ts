import { products, Product } from '@/data/products';

export type SearchFilters = {
  query?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price-asc' | 'price-desc' | 'name' | 'newest';
};

export function searchProducts(filters: SearchFilters): Product[] {
  let results = [...products];

  // البحث بالنص
  if (filters.query) {
    const q = filters.query.toLowerCase();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }

  // فلتر التصنيف
  if (filters.category) {
    results = results.filter((p) => p.category === filters.category);
  }

  // فلتر الماركة
  if (filters.brand) {
    results = results.filter((p) => p.brand === filters.brand);
  }

  // فلتر السعر
  if (filters.minPrice !== undefined) {
    results = results.filter((p) => p.price >= filters.minPrice!);
  }
  if (filters.maxPrice !== undefined) {
    results = results.filter((p) => p.price <= filters.maxPrice!);
  }

  // الترتيب
  if (filters.sortBy === 'price-asc') {
    results.sort((a, b) => a.price - b.price);
  } else if (filters.sortBy === 'price-desc') {
    results.sort((a, b) => b.price - a.price);
  } else if (filters.sortBy === 'name') {
    results.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  return results;
}

export function getAllBrands(): string[] {
  return [...new Set(products.map((p) => p.brand))];
}

export function getAllCategories(): string[] {
  return [...new Set(products.map((p) => p.category))];
}

export function getPriceRange(): { min: number; max: number } {
  const prices = products.map((p) => p.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}
