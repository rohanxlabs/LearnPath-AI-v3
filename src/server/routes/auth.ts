import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authLimiter, loginLimiter, isValidEmail, validatePassword } from '../lib/middleware';
import { loadUserDB, saveUserDB } from '../lib/db';
import { getUserRoadmapsReconstructed } from '../db/schema';
import { sendVerificationEmail } from './email';

const router = Router();

router.post('/register', authLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name || !name.trim()) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  try {
    const db = await loadUserDB(email);
    if (db.passwordHash) return res.status(400).json({ error: 'User already exists' });
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    db.passwordHash = passwordHash;
    if (!db.progress) db.progress = {};
    if (!db.progress.profile) db.progress.profile = {};
    db.progress.profile.name = name.trim();
    saveUserDB(email, db);
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: 'Session initialization failed' });
      req.session.userEmail = email;
      // Fire-and-forget — never delays or blocks registration response.
      sendVerificationEmail(email.toLowerCase()).catch(() => {});
      return res.json({ success: true, email, name });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || typeof email !== 'string' || !email.trim()) return res.status(400).json({ error: 'Email is required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Password is required' });

  const normalizedEmail = email.trim().toLowerCase();
  const dbUser = await loadUserDB(normalizedEmail, { createIfMissing: false });
  if (!dbUser || !dbUser.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

  const passwordMatches = await bcrypt.compare(password, dbUser.passwordHash);
  if (!passwordMatches) return res.status(401).json({ error: 'Invalid credentials' });

  const storedName = dbUser.progress?.profile?.name || null;
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session initialization failed' });
    req.session.userEmail = normalizedEmail;
    return res.json({ ok: true, name: storedName });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Failed to logout' });
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

router.get('/session', (req, res) => {
  const userEmail = req.session.userEmail;
  if (!userEmail) return res.status(401).json({ authenticated: false });
  return res.json({ authenticated: true, email: userEmail });
});

// Merged bootstrap endpoint: session + profile + roadmaps in ONE db call.
router.get('/bootstrap', async (req, res) => {
  const userEmail = req.session.userEmail;
  if (!userEmail) return res.status(401).json({ authenticated: false });

  try {
    const dbData = await loadUserDB(userEmail, { createIfMissing: false });
    const progress = dbData?.progress || {};
    const roadmaps = await getUserRoadmapsReconstructed(userEmail);
    return res.json({
      authenticated: true, email: userEmail,
      profile: progress.profile || {}, settings: progress.settings || {},
      achievements: progress.achievements || [], notifications: progress.notifications || [],
      chats: progress.chats || [], activityLog: progress.activityLog || {}, roadmaps
    });
  } catch (error) {
    console.error('Bootstrap error:', error);
    return res.json({ authenticated: true, email: userEmail, profile: {}, settings: {}, achievements: [], notifications: [], chats: [], activityLog: {}, roadmaps: [] });
  }
});

export default router;
