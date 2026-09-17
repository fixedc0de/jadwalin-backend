import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../middleware/auth.js';

// POST /api/auth/register - Daftar pengguna baru
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validasi input
    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Email, password, dan name harus diisi' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validasi format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Format email tidak valid' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validasi panjang password
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Password minimal 6 karakter' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Cek apakah email sudah terdaftar
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existingUser.rows.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Email sudah terdaftar' 
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Hash password dengan bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Simpan user baru ke database
    const result = await sql`
      INSERT INTO users (email, password, name)
      VALUES (${email}, ${hashedPassword}, ${name})
      RETURNING id, email, name
    `;

    const newUser = result.rows[0];

    // Generate JWT token
    const token = generateToken(newUser);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Registrasi berhasil',
        data: {
          user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name
          },
          token
        }
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error register:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Terjadi kesalahan saat registrasi',
        error: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
