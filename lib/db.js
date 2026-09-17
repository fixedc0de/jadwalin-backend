// lib/db.js
import { sql } from '@vercel/postgres';

export async function initDatabase() {
  try {
    // Buat tabel users jika belum ada
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Buat tabel jadwal jika belum ada
    // Kolom android_id ditambahkan untuk sinkronisasi unik per user
    await sql`
      CREATE TABLE IF NOT EXISTS jadwal (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
      );
    `;
    
    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

export { sql };
