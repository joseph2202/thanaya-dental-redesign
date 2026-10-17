const fs = require('fs');

// 1) تحديث products.ts - إضافة حقل icon بدل emoji
let productsContent = fs.readFileSync('src/data/products.ts', 'utf8');

// إضافة mapping للإيقونات
const iconMapping = {
  'dental-kit-3': 'Stethoscope',
  'pressure-monitor': 'Activity',
  'wheelchair-basic': 'Wheelchair',
  'sterilizer-device': 'ShieldCheck',
  'stethoscope-pro': 'HeartPulse',
  'nitrile-gloves-100': 'Hand',
  'sterilization-solution': 'Droplets',
  'surgical-brush': 'Brush',
  'lab-microscope': 'Microscope',
  'pulse-oximeter': 'Heart',
  'surgical-kit': 'Scissors',
  'dental-chair-cover': 'Armchair',
};

// تحديث الـ type
productsContent = productsContent.replace(
  "emoji: string;",
  "icon: string;"
);

// تحديث كل منتج
Object.entries(iconMapping).forEach(([id, icon]) => {
  productsContent = productsContent.replace(
    new RegExp(`id: '${id}',[\\s\\S]*?emoji: '[^']*',`, 'm'),
    (match) => match.replace(/emoji: '[^']*',/, `icon: '${icon}',`)
  );
});

fs.writeFileSync('src/data/products.ts', productsContent);

// 2) إنشاء مكون ProductIcon
fs.mkdirSync('src/components/ui', { recursive: true });
fs.writeFileSync('src/components/ui/ProductIcon.tsx', `import * as Icons from 'lucide-react';

type IconProps = {
  name: string;
  className?: string;
  size?: number;
};

export default function ProductIcon({ name, className = '', size = 48 }: IconProps) {
  const IconComponent = (Icons as any)[name] || Icons.Package;
  return <IconComponent className={className} size={size} strokeWidth={1.5} />;
}
`);

// 3) تحديث صفحة المنتجات
fs.writeFileSync('src/app/products/page.tsx', `import { searchProducts, getAllBrands, getAllCategories, getPriceRange } from '@/lib/search';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Link from 'next/link';
import ProductIcon from '@/components/ui/ProductIcon';

export const instant = false;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; brand?: string; sort?: string; minPrice?: string; maxPrice?: string }> }) {
  const params = await searchParams;
  
  const filters = {
    category: params.category,
    brand: params.brand,
    sortBy: params.sort as any,
    minPrice: params.minPrice ? Number(params.minPrice) : undefined,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
  };

  const products = searchProducts(filters);
  const brands = getAllBrands();
  const categories = getAllCategories();

  const createQueryString = (key: string, value: string) => {
    const newParams = new URLSearchParams(params as any);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    return newParams.toString();
  };

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-5xl font-black text-center mb-4 text-ink">المنتجات</h1>
        <p className="text-center text-neutral-600 mb-8">{products.length} منتج وجهاز متاح للتسوق</p>

        <div className="grid md:grid-cols-4 gap-6">
          <aside className="md:col-span-1">
            <div className="bg-white border-2 border-brand/20 rounded-2xl p-5 sticky top-24 space-y-6">
              <div>
                <h3 className="font-black mb-3 text-ink">التصنيف</h3>
                <div className="space-y-2">
                  <Link href="/products" className="block text-sm hover:text-brand transition">الكل</Link>
                  {categories.map((c) => (
                    <Link
                      key={c}
                      href={\`/products?\${createQueryString('category', c)}\`}
                      className={\`block text-sm transition \${params.category === c ? 'text-brand font-bold' : 'hover:text-brand'}\`}
                    >
                      {c}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-black mb-3 text-ink">الماركة</h3>
                <div className="space-y-2">
                  <Link href="/products" className="block text-sm hover:text-brand transition">الكل</Link>
                  {brands.map((b) => (
                    <Link
                      key={b}
                      href={\`/products?\${createQueryString('brand', b)}\`}
                      className={\`block text-sm transition \${params.brand === b ? 'text-brand font-bold' : 'hover:text-brand'}\`}
                    >
                      {b}
                    </Link>
                  ))}
                </div>
              </div>
              <Link href="/products" className="block text-center bg-paper2 border-2 border-brand/30 rounded-lg py-2 text-sm font-bold hover:bg-brand/10 transition">
                إعادة تعيين الفلاتر
              </Link>
            </div>
          </aside>

          <div className="md:col-span-3">
            <div className="bg-white border-2 border-brand/20 rounded-2xl p-4 mb-6 flex items-center justify-between">
              <span className="font-bold text-sm text-ink">ترتيب حسب:</span>
              <div className="flex gap-2 flex-wrap">
                <Link href={\`/products?\${createQueryString('sort', 'price-asc')}\`} className={\`text-sm px-3 py-1 rounded-full transition \${params.sort === 'price-asc' ? 'bg-brand text-white' : 'bg-paper2 hover:bg-brand/10'}\`}>
                  السعر: الأقل
                </Link>
                <Link href={\`/products?\${createQueryString('sort', 'price-desc')}\`} className={\`text-sm px-3 py-1 rounded-full transition \${params.sort === 'price-desc' ? 'bg-brand text-white' : 'bg-paper2 hover:bg-brand/10'}\`}>
                  السعر: الأعلى
                </Link>
                <Link href={\`/products?\${createQueryString('sort', 'name')}\`} className={\`text-sm px-3 py-1 rounded-full transition \${params.sort === 'name' ? 'bg-brand text-white' : 'bg-paper2 hover:bg-brand/10'}\`}>
                  الاسم
                </Link>
              </div>
            </div>

            {products.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-8xl mb-6">📦</div>
                <h2 className="text-2xl font-black mb-4 text-ink">لا توجد منتجات</h2>
                <p className="text-neutral-600 mb-8">جرب تغيير الفلاتر</p>
                <Link href="/products" className="bg-brand text-white rounded-full px-8 py-3 font-bold inline-block">
                  عرض كل المنتجات
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((p) => (
                  <Link
                    key={p.id}
                    href={\`/product/\${p.id}\`}
                    className="bg-white border-2 border-brand/20 rounded-2xl p-6 font-bold hover:-translate-y-1 transition shadow-[4px_4px_0_#047ba8]"
                  >
                    <div className="bg-paper2 rounded-xl h-32 mb-4 grid place-items-center text-brand">
                      <ProductIcon name={p.icon} size={64} />
                    </div>
                    {p.badge && (
                      <span className="inline-block bg-brand/10 text-brand border border-brand/30 rounded-full px-2 py-0.5 text-xs mb-2">
                        {p.badge === 'new' ? 'جديد' : p.badge === 'sale' ? 'خصم' : 'مطلوب'}
                      </span>
                    )}
                    <h3 className="mb-1 text-sm text-ink">{p.name}</h3>
                    <p className="text-xs text-neutral-500 mb-2">{p.brand}</p>
                    <p className="text-ink font-black text-lg">{p.price.toLocaleString()} د.ع</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
`);

// 4) تحديث صفحة المنتج الواحد
fs.writeFileSync('src/app/product/[id]/page.tsx', `import { products, getProduct } from '@/data/products';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import AddToCartButton from '@/components/product/AddToCartButton';
import BuyNowButton from '@/components/product/BuyNowButton';
import ProductIcon from '@/components/ui/ProductIcon';

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();

  const related = products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 3);

  return (
    <>
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-12">
        <nav className="text-sm text-neutral-500 mb-8">
          <Link href="/" className="hover:text-brand">الرئيسية</Link>
          <span className="mx-2">/</span>
          <Link href="/products" className="hover:text-brand">المنتجات</Link>
          <span className="mx-2">/</span>
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          <div className="bg-paper2 rounded-3xl aspect-square grid place-items-center text-brand border-2 border-brand/20">
            <ProductIcon name={product.icon} size={180} />
          </div>

          <div>
            {product.badge && (
              <span className="inline-block bg-brand/10 text-brand border border-brand/30 rounded-full px-3 py-1 text-xs font-bold mb-4">
                {product.badge === 'new' ? 'جديد' : product.badge === 'sale' ? 'خصم' : 'مطلوب'}
              </span>
            )}
            <h1 className="text-3xl md:text-4xl font-black mb-3 text-ink">{product.name}</h1>
            <p className="text-neutral-500 mb-4">{product.brand} · {product.category}</p>

            <div className="mb-6">
              <p className="text-4xl font-black text-ink">{product.price.toLocaleString()} د.ع</p>
              <p className="text-neutral-500">≈ {product.usdPrice} دولار</p>
            </div>

            <p className="text-neutral-700 leading-9 mb-6">{product.description}</p>

            <div className="flex items-center gap-3 mb-6">
              <span className={\`inline-block w-3 h-3 rounded-full \${product.stock > 0 ? 'bg-success' : 'bg-red-500'}\`}></span>
              <span className="font-bold text-ink">
                {product.stock > 0 ? \`متوفر (\${product.stock} قطعة)\` : 'نفد المخزون'}
              </span>
            </div>

            <div className="flex gap-3 flex-wrap">
              <AddToCartButton product={product} />
              <BuyNowButton product={product} />
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-20">
            <h2 className="text-2xl font-black mb-6 text-ink">منتجات مشابهة</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {related.map((p) => (
                <Link key={p.id} href={\`/product/\${p.id}\`} className="bg-white border-2 border-brand/20 rounded-2xl p-5 font-bold hover:border-brand hover:-translate-y-1 transition">
                  <div className="bg-paper2 rounded-xl h-24 mb-3 grid place-items-center text-brand">
                    <ProductIcon name={p.icon} size={48} />
                  </div>
                  <h3 className="text-sm mb-1 text-ink">{p.name}</h3>
                  <p className="text-ink font-black">{p.price.toLocaleString()} د.ع</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
`);

// 5) تحديث صفحة السلة
let cartContent = fs.readFileSync('src/app/cart/page.tsx', 'utf8');
cartContent = cartContent.replace(
  /<div className="bg-paper2 rounded-xl w-20 h-20 grid place-items-center text-3xl flex-shrink-0">\s*\{item\.product\.emoji\}\s*<\/div>/g,
  '<div className="bg-paper2 rounded-xl w-20 h-20 grid place-items-center text-brand flex-shrink-0"><ProductIcon name={item.product.icon} size={40} /></div>'
);

if (!cartContent.includes("import ProductIcon")) {
  cartContent = cartContent.replace(
    "import Footer from '@/components/layout/Footer';",
    "import Footer from '@/components/layout/Footer';\nimport ProductIcon from '@/components/ui/ProductIcon';"
  );
}
fs.writeFileSync('src/app/cart/page.tsx', cartContent);

// 6) تحديث صفحة Checkout
let checkoutContent = fs.readFileSync('src/app/checkout/page.tsx', 'utf8');
checkoutContent = checkoutContent.replace(
  /<div className="w-12 h-12 bg-paper2 rounded-lg grid place-items-center text-2xl flex-shrink-0">\s*\{item\.product\.emoji\}\s*<\/div>/g,
  '<div className="w-12 h-12 bg-paper2 rounded-lg grid place-items-center text-brand flex-shrink-0"><ProductIcon name={item.product.icon} size={28} /></div>'
);

if (!checkoutContent.includes("import ProductIcon")) {
  checkoutContent = checkoutContent.replace(
    "import Footer from '@/components/layout/Footer';",
    "import Footer from '@/components/layout/Footer';\nimport ProductIcon from '@/components/ui/ProductIcon';"
  );
}
fs.writeFileSync('src/app/checkout/page.tsx', checkoutContent);

// 7) تحديث صفحة البحث
let searchContent = fs.readFileSync('src/app/search/page.tsx', 'utf8');
searchContent = searchContent.replace(
  /<div className="bg-paper2 rounded-xl h-32 mb-4 grid place-items-center text-4xl">\{p\.emoji\}<\/div>/g,
  '<div className="bg-paper2 rounded-xl h-32 mb-4 grid place-items-center text-brand"><ProductIcon name={p.icon} size={64} /></div>'
);

if (!searchContent.includes("import ProductIcon")) {
  searchContent = searchContent.replace(
    "import Footer from '@/components/layout/Footer';",
    "import Footer from '@/components/layout/Footer';\nimport ProductIcon from '@/components/ui/ProductIcon';"
  );
}
fs.writeFileSync('src/app/search/page.tsx', searchContent);

// 8) تحديث صفحة إدارة المنتجات
let adminProductsContent = fs.readFileSync('src/app/admin/products/page.tsx', 'utf8');
adminProductsContent = adminProductsContent.replace(
  /<span className="text-2xl">\{p\.emoji\}<\/span>/g,
  '<div className="text-brand"><ProductIcon name={p.icon} size={32} /></div>'
);

if (!adminProductsContent.includes("import ProductIcon")) {
  adminProductsContent = adminProductsContent.replace(
    "import Link from 'next/link';",
    "import Link from 'next/link';\nimport ProductIcon from '@/components/ui/ProductIcon';"
  );
}

// تحديث حقل emoji في النموذج إلى icon
adminProductsContent = adminProductsContent.replace(
  /placeholder="Emoji \(مثل 🦷\)"/g,
  'placeholder="اسم الأيقونة (مثل Stethoscope)"'
);
adminProductsContent = adminProductsContent.replace(
  /value=\{form\.emoji\}/g,
  'value={form.icon}'
);
adminProductsContent = adminProductsContent.replace(
  /setForm\(\{ \.\.\.form, emoji: e\.target\.value \}\)/g,
  'setForm({ ...form, icon: e.target.value })'
);
adminProductsContent = adminProductsContent.replace(
  /emoji: '📦',/g,
  "icon: 'Package',"
);

fs.writeFileSync('src/app/admin/products/page.tsx', adminProductsContent);

console.log('✅ تم استبدال الإيموجي بأيقونات Lucide React');
console.log(' المكتبة: lucide-react (700+ أيقونة SVG)');
console.log(' الموقع: lucide.dev/icons');