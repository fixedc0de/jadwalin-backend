// api/index.js
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { initDatabase, sql } from '../lib/db.js';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_in_prod';

// Middleware Global
app.use(cors());
app.use(express.json());

// --- Inisialisasi Database saat Server Mulai ---
// Catatan: Di Vercel Serverless, ini berjalan setiap ada request dingin (cold start)
let dbInitialized = false;

async function ensureDb() {
  if (!dbInitialized) {
    try {
      await initDatabase();
      dbInitialized = true;
    } catch (err) {
      console.error("DB Init Error:", err);
    }
  }
}

// --- Middleware Autentikasi JWT ---
const authenticateToken = (req, res, next) => {
  // Handle case-insensitive header
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Token tidak valid atau kadaluarsa' });
    }
    req.user = user; // Simpan data user (id, email, name) ke request
    next();
  });
};

// --- ROUTES: AUTH ---

// POST /api/auth/register
app.post('/auth/register', async (req, res) => {
  await ensureDb();
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ success: false, message: 'Email, password, dan name wajib diisi' });
  }

  try {
    // Cek apakah user sudah ada
    const existingUser = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await sql`
      INSERT INTO users (email, password, name) 
      VALUES (${email}, ${hashedPassword}, ${name}) 
      RETURNING id, email, name
    `;

    const user = result.rows[0];
    
    // Generate Token
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registrasi berhasil',
      data: { user, token }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server', error: error.message });
  }
});

// POST /api/auth/login
app.post('/auth/login', async (req, res) => {
  await ensureDb();
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
  }

  try {
    const result = await sql`SELECT * FROM users WHERE email = ${email}`;
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login berhasil',
      data: { user: { id: user.id, email: user.email, name: user.name }, token }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server', error: error.message });
  }
});

// --- ROUTES: JADWAL (Protected) ---

// GET /api/jadwal
app.get('/jadwal', authenticateToken, async (req, res) => {
  await ensureDb();
  try {
    const result = await sql`
      SELECT * FROM jadwal 
      WHERE user_id = ${req.user.id} 
      ORDER BY waktu_mulai ASC
    `;
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get jadwal error:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil jadwal', error: error.message });
  }
});

// POST /api/jadwal
app.post('/jadwal', authenticateToken, async (req, res) => {
  await ensureDb();
  const { judul, deskripsi, waktu_mulai, kategori, lokasi, isRecurring, hariDalamMinggu, menitSebelumnya, android_id } = req.body;

  if (!judul || !waktu_mulai || android_id === undefined) {
    return res.status(400).json({ success: false, message: 'Judul, waktu_mulai, dan android_id wajib diisi' });
  }

  try {
    const result = await sql`
      INSERT INTO jadwal (
        user_id, android_id, judul, deskripsi, waktu_mulai, kategori, lokasi, 
        is_recurring, hari_dalam_minggu, menit_sebelumnya
      ) VALUES (
        ${req.user.id}, ${android_id}, ${judul}, ${deskripsi || null}, ${waktu_mulai}, 
        ${kategori || null}, ${lokasi || null}, ${!!isRecurring}, ${hariDalamMinggu || 0}, ${menitSebelumnya || 0}
      )
      ON CONFLICT (user_id, android_id) DO UPDATE SET
        judul = EXCLUDED.judul,
        deskripsi = EXCLUDED.deskripsi,
        waktu_mulai = EXCLUDED.waktu_mulai,
        kategori = EXCLUDED.kategori,
        lokasi = EXCLUDED.lokasi,
        is_recurring = EXCLUDED.is_recurring,
        hari_dalam_minggu = EXCLUDED.hari_dalam_minggu,
        menit_sebelumnya = EXCLUDED.menit_sebelumnya,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    res.status(201).json({ success: true, message: 'Jadwal berhasil disimpan', data: result.rows[0] });
  } catch (error) {
    console.error('Post jadwal error:', error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan jadwal', error: error.message });
  }
});

// PUT /api/jadwal/:android_id
app.put('/jadwal/:android_id', authenticateToken, async (req, res) => {
  await ensureDb();
  const { android_id } = req.params;
  const { judul, deskripsi, waktu_mulai, kategori, lokasi, isRecurring, hariDalamMinggu, menitSebelumnya } = req.body;

  try {
    // Pastikan hanya user pemilik yang bisa update
    const result = await sql`
      UPDATE jadwal SET
        judul = ${judul},
        deskripsi = ${deskripsi || null},
        waktu_mulai = ${waktu_mulai},
        kategori = ${kategori || null},
        lokasi = ${lokasi || null},
        is_recurring = ${!!isRecurring},
        hari_dalam_minggu = ${hariDalamMinggu || 0},
        menit_sebelumnya = ${menitSebelumnya || 0},
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${req.user.id} AND android_id = ${parseInt(android_id)}
      RETURNING *
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan atau bukan milik Anda' });
    }

    res.json({ success: true, message: 'Jadwal berhasil diupdate', data: result.rows[0] });
  } catch (error) {
    console.error('Put jadwal error:', error);
    res.status(500).json({ success: false, message: 'Gagal mengupdate jadwal', error: error.message });
  }
});

// DELETE /api/jadwal/:android_id
app.delete('/jadwal/:android_id', authenticateToken, async (req, res) => {
  await ensureDb();
  const { android_id } = req.params;

  try {
    const result = await sql`
      DELETE FROM jadwal 
      WHERE user_id = ${req.user.id} AND android_id = ${parseInt(android_id)}
      RETURNING *
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan atau bukan milik Anda' });
    }

    res.json({ success: true, message: 'Jadwal berhasil dihapus' });
  } catch (error) {
    console.error('Delete jadwal error:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus jadwal', error: error.message });
  }
});

// Export handler untuk Vercel
export default app;
