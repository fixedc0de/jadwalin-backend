import { sql } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import { generateToken } from '../../middleware/auth.js';

// POST /api/auth/login - Login pengguna
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validasi input
    if (!email || !password) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Email dan password harus diisi' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Cari user berdasarkan email
    const result = await sql`
      SELECT id, email, password, name FROM users WHERE email = ${email}
    `;

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Email atau password salah' 
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const user = result.rows[0];

    // Verifikasi password dengan bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Email atau password salah' 
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Generate JWT token
    const token = generateToken(user);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Login berhasil',
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name
          },
          token
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error login:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Terjadi kesalahan saat login',
        error: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
