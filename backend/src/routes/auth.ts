import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/auth';

const router = Router();
const prisma = new PrismaClient();

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, phone, password: hashedPassword }
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '7d' });

    res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }, token });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في التسجيل' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '7d' });

    res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }, token });
  } catch (error) {
    res.status(500).json({ error: 'خطأ في تسجيل الدخول' });
  }
});


// Refresh the session from the database instead of trusting cached browser role.
router.get('/me', async (req, res) => {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  }
  try {
    const payload = jwt.verify(authorization.slice(7), getJwtSecret());
    if (typeof payload === 'string' || typeof payload.userId !== 'string') {
      return res.status(401).json({ error: 'جلسة غير صالحة' });
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true }
    });
    if (!user) return res.status(401).json({ error: 'الحساب غير موجود' });
    return res.json(user);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'انتهت الجلسة، سجل الدخول مجدداً' });
    }
    console.error('auth /me', error);
    return res.status(500).json({ error: 'تعذر التحقق من الحساب' });
  }
});

export default router;
