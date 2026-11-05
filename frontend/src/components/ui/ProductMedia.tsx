import ProductIcon from '@/components/ui/ProductIcon';
import ResilientProductImage from '@/components/ui/ResilientProductImage';

type Props = { image?: string | null; icon?: string | null; name: string; size?: number; className?: string; priority?: boolean;onUnavailable?:()=>void };

export default function ProductMedia({ image, icon, name, size = 58, className = '', priority = false,onUnavailable }: Props) {
  return (
    <div className={`site-product-visual ${className}`}>
      {image ? (
        <ResilientProductImage src={image.replace(/https?:\/\/(?:localhost|127\.0\.0\.1):4000\/uploads\//gi, '/uploads/')}
          name={name} priority={priority} onUnavailable={onUnavailable}
          fallback={<ProductIcon name={icon||'Package'} size={size} className="opacity-80"/>}/>
      ) : (
        <ProductIcon name={icon || 'Package'} size={size} className="opacity-80" />
      )}
    </div>
  );
}
