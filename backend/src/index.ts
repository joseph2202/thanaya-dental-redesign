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

// استيراد مكتبات رفع الصور
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getJwtSecret } from './config/auth';
import { requireAdmin, requireInventory } from './middleware/requireAdmin';

dotenv.config();
getJwtSecret();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ==========================================
// إعدادات رفع الصور (Multer)
// ==========================================
const uploadDir = path.join(__dirname, '../uploads');
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
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + imageTypes[file.mimetype]);
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
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
  const imageUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
  res.json({ url: imageUrl });
});
// ==========================================

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/notifications', notificationsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Thanaya API is running' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
