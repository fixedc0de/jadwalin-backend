import { sql } from '@vercel/postgres';

export async function createTables() {
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
    console.log('Tabel users dibuat/diperiksa');

    // Buat index pada email untuk performa
    await sql`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `;
    console.log('Index email dibuat');

    // Buat tabel jadwal
    await sql`
      CREATE TABLE IF NOT EXISTS jadwal (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        android_id INTEGER NOT NULL,
        judul VARCHAR(255) NOT NULL,
        deskripsi TEXT,
        waktu_mulai VARCHAR(50) NOT NULL,
        kategori VARCHAR(100) NOT NULL,
        lokasi VARCHAR(255),
        is_recurring BOOLEAN NOT NULL DEFAULT false,
        hari_dalam_minggu INTEGER NOT NULL DEFAULT 0,
        menit_sebelumnya INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, android_id)
      )
    `;
    console.log('Tabel jadwal dibuat/diperiksa');

    // Buat index untuk performa query per user
    await sql`
      CREATE INDEX IF NOT EXISTS idx_jadwal_user_id ON jadwal(user_id)
    `;
    console.log('Index user_id pada jadwal dibuat');

    return { success: true, message: 'Semua tabel berhasil dibuat' };
  } catch (error) {
    console.error('Error membuat tabel:', error);
    throw error;
  }
}
