import express from 'express';
import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cors from 'cors';

const app = express();

// --- KONFIGURASI ---
const JWT_SECRET = process.env.JWT_SECRET;

// Middleware Dasar
app.use(cors());
app.use(express.json());

// --- DATABASE HELPER ---
let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;
  try {
    // Buat tabel users
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Buat tabel jadwal
    await sql`
      CREATE TABLE IF NOT EXISTS jadwal (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        android_id INTEGER NOT NULL,
        judul VARCHAR(255) NOT NULL,
        deskripsi TEXT,
        waktu_mulai VARCHAR(50) NOT NULL,
        kategori VARCHAR(100),
        lokasi VARCHAR(255),
        is_recurring BOOLEAN DEFAULT FALSE,
        hari_dalam_minggu INTEGER DEFAULT 0,
        menit_sebelumnya INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, android_id)
      )
    `;
    
    dbInitialized = true;
    console.log('Database tables initialized.');
  } catch (error) {
    console.error('Error initializing DB:', error);
  }
}

// Jalankan inisialisasi DB saat server mulai
initDB();

// --- MIDDLEWARE AUTHENTIKASI ---
const authenticateToken = (req, res, next) => {
  // Ambil token dari header Authorization (case-insensitive)
  const authHeader = req.headers.authorization;
  
  // Cek apakah header ada dan formatnya "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token tidak ditemukan atau format salah. Gunakan: Authorization: Bearer <token>' 
    });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token tidak ditemukan.' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // Token expired atau invalid selalu kembalikan 401
      return res.status(401).json({ 
        success: false, 
        message: err.name === 'TokenExpiredError' ? 'Token telah kadaluarsa' : 'Token tidak valid' 
      });
    }
    req.user = user;
    next();
  });
};

// --- ROUTES ---

// 1. Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'Data tidak lengkap.' });
    }

    const existingUser = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await sql`
      INSERT INTO users (email, password, name) 
      VALUES (${email}, ${hashedPassword}, ${name}) 
      RETURNING id, email, name
    `;

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ success: true, message: 'Registrasi berhasil', data: { user, token } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
});

// 2. Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    const result = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Kredensial salah.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Kredensial salah.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, message: 'Login berhasil', data: { user: { id: user.id, email: user.email, name: user.name }, token } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
});

// 3. Get Jadwal - SELALU mengembalikan Array [] jika sukses (raw array, no wrapper)
app.get('/api/jadwal', authenticateToken, async (req, res) => {
  try {
    const result = await sql`SELECT * FROM jadwal WHERE user_id = ${req.user.id} ORDER BY waktu_mulai ASC`;
    // Kembalikan array langsung, bukan objek wrapper
    res.json(result.rows || []);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal ambil jadwal.', error: error.message });
  }
});

// 4. Create Jadwal
app.post('/api/jadwal', authenticateToken, async (req, res) => {
  try {
    const { judul, deskripsi, waktu_mulai, kategori, lokasi, isRecurring, hariDalamMinggu, menitSebelumnya, android_id } = req.body;
    
    if (!judul || !waktu_mulai || android_id === undefined) {
      return res.status(400).json({ success: false, message: 'Judul, waktu_mulai, android_id wajib.' });
    }

    const existing = await sql`SELECT * FROM jadwal WHERE user_id = ${req.user.id} AND android_id = ${android_id}`;
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Jadwal dengan ID ini sudah ada.' });
    }

    const result = await sql`
      INSERT INTO jadwal (user_id, android_id, judul, deskripsi, waktu_mulai, kategori, lokasi, is_recurring, hari_dalam_minggu, menit_sebelumnya)
      VALUES (${req.user.id}, ${android_id}, ${judul}, ${deskripsi || null}, ${waktu_mulai}, ${kategori || null}, ${lokasi || null}, ${isRecurring || false}, ${hariDalamMinggu || 0}, ${menitSebelumnya || 0})
      RETURNING *
    `;

    res.status(201).json({ success: true, message: 'Jadwal ditambahkan', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal simpan jadwal.', error: error.message });
  }
});

// 5. Update Jadwal
app.put('/api/jadwal/:android_id', authenticateToken, async (req, res) => {
  try {
    const android_id = parseInt(req.params.android_id);
    const { judul, deskripsi, waktu_mulai, kategori, lokasi, isRecurring, hariDalamMinggu, menitSebelumnya } = req.body;

    const check = await sql`SELECT * FROM jadwal WHERE user_id = ${req.user.id} AND android_id = ${android_id}`;
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan.' });

    const row = check.rows[0];
    const result = await sql`
      UPDATE jadwal SET
        judul = ${judul || row.judul},
        deskripsi = ${deskripsi !== undefined ? deskripsi : row.deskripsi},
        waktu_mulai = ${waktu_mulai || row.waktu_mulai},
        kategori = ${kategori !== undefined ? kategori : row.kategori},
        lokasi = ${lokasi !== undefined ? lokasi : row.lokasi},
        is_recurring = ${isRecurring !== undefined ? isRecurring : row.is_recurring},
        hari_dalam_minggu = ${hariDalamMinggu !== undefined ? hariDalamMinggu : row.hari_dalam_minggu},
        menit_sebelumnya = ${menitSebelumnya !== undefined ? menitSebelumnya : row.menit_sebelumnya},
        updated_at = NOW()
      WHERE user_id = ${req.user.id} AND android_id = ${android_id}
      RETURNING *
    `;

    res.json({ success: true, message: 'Jadwal diupdate', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal update jadwal.', error: error.message });
  }
});

// 6. Delete Jadwal
app.delete('/api/jadwal/:android_id', authenticateToken, async (req, res) => {
  try {
    const android_id = parseInt(req.params.android_id);
    const result = await sql`DELETE FROM jadwal WHERE user_id = ${req.user.id} AND android_id = ${android_id} RETURNING *`;

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan.' });

    res.json({ success: true, message: 'Jadwal dihapus', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Gagal hapus jadwal.', error: error.message });
  }
});

// Export untuk Vercel Serverless
export default app;
