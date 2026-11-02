import express, { RequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import orderRoutes from './routes/orders';
import categoryRoutes from './routes/categories';
import couponRoutes from './routes/coupons';
import userRoutes from './routes/users';
import settingsRoutes from './routes/settings';
import deliveryRoutes from './routes/delivery';
import notificationsRoutes from './routes/notifications';
import reportsRoutes from './routes/reports';
import financeRoutes from './routes/finance';
import procurementRoutes from './routes/procurement';
import receivingRoutes from './routes/receiving';
import exportsRoutes from './routes/exports';
import addressesRoutes from './routes/addresses';

// استيراد مكتبات رفع الصور
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import { getJwtSecret } from './config/auth';
import { cookieSessionBridge, cookieAllowedOrigins } from './lib/cookieSession';
import { requireAdmin, requireInventory } from './middleware/requireAdmin';

dotenv.config();
getJwtSecret();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

// All current frontend API calls are same-origin via Next.js rewrites.
// Never expose a wildcard CORS policy when the preview URL is public.
// Additional trusted cross-origin clients can be explicitly configured.
const allowedOrigins = cookieAllowedOrigins();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)) }));
app.use(express.json());
// Cookie transport is opt-in. Existing Bearer sessions keep working during migration.
// CSRF checks happen before any authenticated mutation reaches the API routes.
app.use(cookieSessionBridge(allowedOrigins));

// Sensitive customer and staff data must not enter shared/browser HTTP caches.
// Public product/catalog endpoints remain unaffected.
const privateApiPrefixes=[
  '/api/auth','/api/orders','/api/addresses','/api/finance',
  '/api/users','/api/procurement','/api/notifications','/api/exports',
  '/api/upload','/api/reports','/api/products/manage'
];
app.use((req, res, next) => {
  if(privateApiPrefixes.some(prefix=>req.path===prefix||req.path.startsWith(prefix+'/'))){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"frame-ancestors 'none'; object-src 'none'");
  }
  next();
});

// ==========================================
// إعدادات رفع الصور (Multer)
// ==========================================
// Tests can explicitly isolate uploaded files in a disposable directory.
// Never point test uploads at the real Mac store's backend/uploads directory.
const uploadDir = process.env.THANAYA_UPLOAD_DIR
  ? path.resolve(process.env.THANAYA_UPLOAD_DIR)
  : path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const imageTypes: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Never derive public filenames from user input or predictable timestamps.
    cb(null, randomUUID() + imageTypes[file.mimetype]);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!imageTypes[file.mimetype]) return cb(new Error('نوع الصورة غير مدعوم'));
    cb(null, true);
  },
});

const uploadImage: RequestHandler = (req, res, next) => {
  upload.single('image')(req, res, error => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'حجم الصورة يجب أن لا يتجاوز 5MB' });
      return;
    }
    if (error) {
      res.status(400).json({ error: 'تعذّر رفع الصورة. استخدم JPG أو PNG أو WebP فقط.' });
      return;
    }
    next();
  });
};

function hasImageSignature(filePath: string, type: string): boolean {
  const header = Buffer.alloc(12);
  const file = fs.openSync(filePath, 'r');
  try {
    fs.readSync(file, header, 0, header.length, 0);
  } finally {
    fs.closeSync(file);
  }
  if (type === 'image/png') return header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (type === 'image/jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (type === 'image/webp') return header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

// جعل مجلد uploads متاحاً للوصول للصور عبر المتصفح
// Uploaded media uses unique, never-overwritten filenames (timestamp + random suffix).
// Let repeat visitors reuse thumbnails/product photos instead of downloading them
// from the Mac again through a temporary tunnel on every page navigation.
app.use('/uploads', express.static(uploadDir, {
  maxAge: '7d',
  immutable: true,
}));

// نقطة نهاية (Endpoint) لرفع الصورة
app.post('/api/upload', requireAdmin, uploadImage, (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم رفع أي صورة' });
  }
  if (!hasImageSignature(req.file.path, req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'محتوى الملف ليس صورة مدعومة' });
  }
  // إرجاع رابط الصورة ليحفظه الفرونت إند في قاعدة البيانات
  // Use the existing same-origin Next.js rewrite, including private HTTPS previews.
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ url: imageUrl });
});
// ==========================================

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/receiving', receivingRoutes);
app.use('/api/exports', exportsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Thanaya API is running' });
});

// Always return structured errors from /api, including unknown paths and
// unexpected errors forwarded by Express 5 asynchronous route handlers.
// Details remain in local backend logs, never in the browser response.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'الخدمة المطلوبة غير موجودة.' });
});
app.use(((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unexpected API error', req.method, req.path, error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'تعذّر تنفيذ الطلب حالياً. يرجى المحاولة لاحقاً.' });
}) as express.ErrorRequestHandler);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
