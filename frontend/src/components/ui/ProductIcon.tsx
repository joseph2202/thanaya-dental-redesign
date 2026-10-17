import * as Icons from 'lucide-react';

type IconProps = {
  name: string;
  className?: string;
  size?: number;
};

export default function ProductIcon({ name, className = '', size = 48 }: IconProps) {
  const IconComponent = (Icons as any)[name] || Icons.Package;
  return <IconComponent className={className} size={size} strokeWidth={1.5} />;
}
