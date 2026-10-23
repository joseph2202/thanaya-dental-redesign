import {apiRequest} from '@/lib/api';
import type {CatalogCardProduct} from '@/components/catalog/CatalogProductCard';

// Server-only call used by the initial homepage and category pages.
// A failed/slow backend must never leave a visitor staring at endless skeletons.
// No persistent cache: prices and stock must be checked again for each request.
export async function getPublicCatalog():Promise<CatalogCardProduct[]>{
 const data:unknown=await apiRequest('/products',{
  cache:'no-store',
  signal:AbortSignal.timeout(7000)
 });
 if(!Array.isArray(data))throw new Error('Invalid public catalog response');
 return data as CatalogCardProduct[];
}
