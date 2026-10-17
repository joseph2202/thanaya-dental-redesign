import ProductIcon from '@/components/ui/ProductIcon';

type Props = { image?: string | null; icon?: string | null; name: string; size?: number; className?: string };

export default function ProductMedia({ image, icon, name, size = 58, className = '' }: Props) {
  return (
    <div className={`site-product-visual ${className}`}>
      {image ? (
        // Image URLs are supplied by the existing product API and may point to the local upload server.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} loading="lazy" />
      ) : (
        <ProductIcon name={icon || 'Package'} size={size} className="opacity-80" />
      )}
    </div>
  );
}
