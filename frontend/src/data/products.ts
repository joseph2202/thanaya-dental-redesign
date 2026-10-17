export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  usdPrice: number;
  category: string;
  brand: string;
  icon: string;
  badge?: 'new' | 'sale' | 'hot';
  stock: number;
};

export const products: Product[] = [
  {
    id: 'dental-kit-3',
    name: 'طقم أدوات فحص أسنان 3 قطع',
    description: 'طقم احترافي يحتوي على مرآة فحص، مسبار، وملاقط. معقم وجاهز للاستخدام في العيادات.',
    price: 25000,
    usdPrice: 19,
    category: 'طب الأسنان',
    brand: 'DentaPro',
    icon: 'Stethoscope',
    badge: 'new',
    stock: 50,
  },
  {
    id: 'pressure-monitor',
    name: 'جهاز قياس ضغط دم رقمي',
    description: 'جهاز دقيق وسهل الاستخدام مع شاشة LCD واضحة وذاكرة لآخر 60 قراءة.',
    price: 45000,
    usdPrice: 34,
    category: 'أجهزة طبية',
    brand: 'MediCare',
    icon: 'Activity',
    stock: 30,
  },
  {
    id: 'wheelchair-basic',
    name: 'كرسي متحرك قياسي',
    description: 'كرسي متحرك متين ومريح، مناسب للاستخدام اليومي، مع فرامل يدوية وعجلات كبيرة.',
    price: 180000,
    usdPrice: 138,
    category: 'كراسي ومتحركة',
    brand: 'MobilityPlus',
    icon: 'Wheelchair',
    badge: 'hot',
    stock: 8,
  },
  {
    id: 'sterilizer-device',
    name: 'جهاز تعقيم بخار مكتبي',
    description: 'جهاز تعقيم بالبخار للأدوات الطبية الصغيرة، سعة 8 لتر، مع نظام أمان تلقائي.',
    price: 95000,
    usdPrice: 73,
    category: 'تعقيم',
    brand: 'SterilMax',
    icon: 'ShieldCheck',
    stock: 15,
  },
  {
    id: 'stethoscope-pro',
    name: 'سماعة طبيب احترافية',
    description: 'سماعة طبية مزدوجة الجانب بحساسية عالية، مناسبة للفحص السريري الدقيق.',
    price: 28000,
    usdPrice: 21,
    category: 'مستلزمات طبية',
    brand: 'CardioTech',
    icon: 'HeartPulse',
    stock: 40,
  },
  {
    id: 'nitrile-gloves-100',
    name: 'قفوف طبية نتريل علبة 100 حبة',
    description: 'قفوف خالية من اللاتكس، مناسبة للحساسية، مقاومة للثقب، بألوان متعددة.',
    price: 18500,
    usdPrice: 14,
    category: 'مستلزمات طبية',
    brand: 'SafeHands',
    icon: 'Hand',
    badge: 'sale',
    stock: 200,
  },
  {
    id: 'sterilization-solution',
    name: 'محلول تعقيم أدوات طبية 1 لتر',
    description: 'محلول تعقيم فعال ضد البكتيريا والفيروسات، آمن على الأدوات الحساسة.',
    price: 12000,
    usdPrice: 9,
    category: 'تعقيم',
    brand: 'CleanMed',
    icon: 'Droplets',
    stock: 150,
  },
  {
    id: 'surgical-brush',
    name: 'فرشاة أسنان جراحية معقمة',
    description: 'فرشاة معقمة للاستخدام الجراحي، شعيرات ناعمة، عبوة فردية.',
    price: 7500,
    usdPrice: 6,
    category: 'طب الأسنان',
    brand: 'SurgiClean',
    icon: 'Brush',
    badge: 'new',
    stock: 500,
  },
  {
    id: 'lab-microscope',
    name: 'مجهر مختبري رقمي',
    description: 'مجهر بدقة 1000x مع كاميرا مدمجة وشاشة عرض، مثالي للمختبرات والعيادات.',
    price: 320000,
    usdPrice: 246,
    category: 'مختبرات',
    brand: 'LabVision',
    icon: 'Microscope',
    stock: 5,
  },
  {
    id: 'pulse-oximeter',
    name: 'جهاز قياس الأكسجين بالدم',
    description: 'جهاز صغير ودقيق لقياس نسبة الأكسجين ونبضات القلب، مع شاشة OLED.',
    price: 22000,
    usdPrice: 17,
    category: 'أجهزة طبية',
    brand: 'OxyCheck',
    icon: 'Heart',
    stock: 60,
  },
  {
    id: 'surgical-kit',
    name: 'طقم أدوات جراحية أساسي',
    description: 'طقم يحتوي على 12 أداة جراحية من الستانلس ستيل، مع حقيبة تخزين.',
    price: 145000,
    usdPrice: 111,
    category: 'مستلزمات طبية',
    brand: 'SurgiPro',
    icon: 'Scissors',
    badge: 'hot',
    stock: 12,
  },
  {
    id: 'dental-chair-cover',
    name: 'غطاء كرسي أسنان معقم',
    description: 'أغطية معقمة لكراسي الأسنان، عبوة 100 قطعة، سهلة التركيب.',
    price: 15000,
    usdPrice: 11,
    category: 'طب الأسنان',
    brand: 'DentaCover',
    icon: 'Armchair',
    stock: 300,
  },
];

export const getProduct = (id: string) => products.find((p) => p.id === id);
export const getProductsByCategory = (category: string) =>
  products.filter((p) => p.category === category);


export const checkStock = (productId: string, quantity: number): { available: boolean; message: string } => {
  const product = products.find((p) => p.id === productId);
  if (!product) {
    return { available: false, message: 'المنتج غير موجود' };
  }
  if (product.stock <= 0) {
    return { available: false, message: 'نفد المخزون' };
  }
  if (quantity > product.stock) {
    return { available: false, message: `الكمية المطلوبة غير متوفرة (متوفر فقط ${product.stock} قطعة)` };
  }
  return { available: true, message: 'متوفر' };
};
