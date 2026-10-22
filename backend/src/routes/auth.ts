import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/auth';
import {
  limitLoginTraffic, limitRegistrations, rejectRepeatedLoginFailures,
  noteFailedLogin, clearFailedLogins
} from '../lib/authRateLimit';

const router = Router();
const prisma = new PrismaClient();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^07\d{9}$/;

// Defensive checks are done on the API itself: browser validation can be bypassed.
// Existing passwords remain valid for login, even if shorter than the NEW signup policy.
router.post('/register', limitRegistrations, async (req, res) => {
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return res.status(400).json({ error: 'معلومات التسجيل غير صالحة' });
  }
  const { name, email, phone, password } = input;
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 80) {
    return res.status(400).json({ error: 'الاسم يجب أن يكون بين 3 و80 حرفاً' });
  }
  if (typeof email !== 'string' || email.trim().length > 254 || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  }
  if (typeof phone !== 'string' || !PHONE_PATTERN.test(phone.trim())) {
    return res.status(400).json({ error: 'رقم الهاتف العراقي لازم يكون 11 رقماً ويبدأ بـ07' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'كلمة المرور لازم تكون بين 8 و128 حرفاً' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  try {
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: normalizedEmail, phone: phone.trim(), password: hashedPassword }
    });
    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '7d' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }, token });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
    }
    console.error('auth register failed', error);
    return res.status(500).json({ error: 'خطأ في التسجيل' });
  }
});

router.post('/login', limitLoginTraffic, async (req, res) => {
  const input = req.body;
  const email = input && typeof input === 'object' && !Array.isArray(input) ? input.email : undefined;
  const password = input && typeof input === 'object' && !Array.isArray(input) ? input.password : undefined;
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_PATTERN.test(email.trim()) ||
      typeof password !== 'string' || password.length < 1 || password.length > 128) {
    return res.status(400).json({ error: 'أدخل البريد الإلكتروني وكلمة المرور بصورة صحيحة' });
  }
  const trimmedEmail = email.trim();
  const normalizedEmail = trimmedEmail.toLowerCase();
  if (rejectRepeatedLoginFailures(normalizedEmail, res)) return;

  try {
    // First try exact spelling for compatibility with older mixed-case accounts;
    // new registrations always store normalized email addresses.
    const user = await prisma.user.findUnique({ where: { email: trimmedEmail } }) ||
      (trimmedEmail === normalizedEmail ? null :
        await prisma.user.findUnique({ where: { email: normalizedEmail } }));
    if (!user || !(await bcrypt.compare(password, user.password))) {
      noteFailedLogin(normalizedEmail);
      return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
    }

    clearFailedLogins(normalizedEmail);
    const token = jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '7d' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }, token });
  } catch (error) {
    console.error('auth login failed', error);
    return res.status(500).json({ error: 'خطأ في تسجيل الدخول' });
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
