const express = require('express');
const { sql } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

// Middleware Dasar
app.use(cors());
app.use(express.json());

// --- KONFIGURASI ---
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_sangat_panjang_untuk_keamanan';

// --- DATABASE HELPER ---
// Inisialisasi tabel jika belum ada (Hanya berjalan sekali saat cold start)
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
    // Jangan throw error agar server tetap bisa start, tapi log errornya
  }
}

// Jalankan inisialisasi DB
initDB();

// --- MIDDLEWARE AUTHENTIKASI ---
const authenticateToken = (req, res, next) => {
  // Handle case-insensitive header
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Token tidak ditemukan. Pastikan header Authorization: Bearer <token> dikirim.' 
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Token tidak valid atau kadaluarsa.' });
    }
    req.user = user; // Simpan data user (id, email, name) ke request
    next();
  });
};

// --- ROUTES ---

// 1. Register: POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'Email, password, dan name wajib diisi.' });
    }

    // Cek user existing
    const existingUser = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
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
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server.', error: error.message });
  }
});

// 2. Login: POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    const result = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Email atau password salah.' });
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
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server.', error: error.message });
  }
});

// 3. Get Jadwal: GET /api/jadwal
app.get('/api/jadwal', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await sql`
      SELECT * FROM jadwal 
      WHERE user_id = ${userId} 
      ORDER BY waktu_mulai ASC
    `;

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Get jadwal error:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil jadwal.', error: error.message });
  }
});

// 4. Create Jadwal: POST /api/jadwal
app.post('/api/jadwal', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      judul, deskripsi, waktu_mulai, kategori, lokasi, 
      isRecurring, hariDalamMinggu, menitSebelumnya, android_id 
    } = req.body;

    if (!judul || !waktu_mulai || android_id === undefined) {
      return res.status(400).json({ success: false, message: 'Judul, waktu_mulai, dan android_id wajib diisi.' });
    }

    // Cek apakah android_id sudah ada untuk user ini
    const existing = await sql`
      SELECT * FROM jadwal WHERE user_id = ${userId} AND android_id = ${android_id}
    `;

    if (existing.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'Jadwal dengan android_id ini sudah ada. Gunakan PUT untuk update.' 
      });
    }

    const result = await sql`
      INSERT INTO jadwal (
        user_id, android_id, judul, deskripsi, waktu_mulai, kategori, lokasi, 
        is_recurring, hari_dalam_minggu, menit_sebelumnya
      ) VALUES (
        ${userId}, ${android_id}, ${judul}, ${deskripsi || null}, ${waktu_mulai}, 
        ${kategori || null}, ${lokasi || null}, ${isRecurring || false}, 
        ${hariDalamMinggu || 0}, ${menitSebeforenya || 0}
      )
      RETURNING *
    `;

    res.status(201).json({
      success: true,
      message: 'Jadwal berhasil ditambahkan',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Create jadwal error:', error);
    res.status(500).json({ success: false, message: 'Gagal menyimpan jadwal.', error: error.message });
  }
});

// 5. Update Jadwal: PUT /api/jadwal/:android_id
app.put('/api/jadwal/:android_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const android_id = parseInt(req.params.android_id);
    
    const { 
      judul, deskripsi, waktu_mulai, kategori, lokasi, 
      isRecurring, hariDalamMinggu, menitSebelumnya 
    } = req.body;

    // Cek keberadaan data
    const check = await sql`
      SELECT * FROM jadwal WHERE user_id = ${userId} AND android_id = ${android_id}
    `;

    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan.' });
    }

    const result = await sql`
      UPDATE jadwal SET
        judul = ${judul || check.rows[0].judul},
        deskripsi = ${deskripsi !== undefined ? deskripsi : check.rows[0].deskripsi},
        waktu_mulai = ${waktu_mulai || check.rows[0].waktu_mulai},
        kategori = ${kategori !== undefined ? kategori : check.rows[0].kategori},
        lokasi = ${lokasi !== undefined ? lokasi : check.rows[0].lokasi},
        is_recurring = ${isRecurring !== undefined ? isRecurring : check.rows[0].is_recurring},
        hari_dalam_minggu = ${hariDalamMinggu !== undefined ? hariDalamMinggu : check.rows[0].hari_dalam_minggu},
        menit_sebelumnya = ${menitSebelumnya !== undefined ? menitSebelumnya : check.rows[0].menit_sebelumnya},
        updated_at = NOW()
      WHERE user_id = ${userId} AND android_id = ${android_id}
      RETURNING *
    `;

    res.json({
      success: true,
      message: 'Jadwal berhasil diupdate',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Update jadwal error:', error);
    res.status(500).json({ success: false, message: 'Gagal mengupdate jadwal.', error: error.message });
  }
});

// 6. Delete Jadwal: DELETE /api/jadwal/:android_id
app.delete('/api/jadwal/:android_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const android_id = parseInt(req.params.android_id);

    const result = await sql`
      DELETE FROM jadwal 
      WHERE user_id = ${userId} AND android_id = ${android_id}
      RETURNING *
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Jadwal tidak ditemukan.' });
    }

    res.json({
      success: true,
      message: 'Jadwal berhasil dihapus',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Delete jadwal error:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus jadwal.', error: error.message });
  }
});

// Export handler untuk Vercel Serverless
module.exports = app;
