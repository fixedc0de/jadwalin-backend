import { sql } from '@vercel/postgres';
import { verifyToken } from '../../middleware/auth.js';

// Helper function untuk handle response JSON
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// GET /api/jadwal - Ambil semua jadwal milik user yang login
export async function GET(request) {
  try {
    // Buat mock request object untuk middleware
    const mockReq = { headers: request.headers };
    let res;
    
    // Gunakan middleware verifyToken
    await new Promise((resolve) => {
      verifyToken(mockReq, {
        status: (code) => ({ json: (data) => {
          res = jsonResponse(data, code);
          resolve();
        }}),
        json: (data) => {
          res = jsonResponse(data, 401);
          resolve();
        }
      }, () => resolve());
    });

    if (res) return res;

    const userId = mockReq.user.id;

    // Ambil semua jadwal milik user ini
    const result = await sql`
      SELECT 
        android_id,
        judul,
        deskripsi,
        waktu_mulai,
        kategori,
        lokasi,
        is_recurring as "isRecurring",
        hari_dalam_minggu as "hariDalamMinggu",
        menit_sebelumnya as "menitSebelumnya"
      FROM jadwal
      WHERE user_id = ${userId}
      ORDER BY waktu_mulai ASC
    `;

    return jsonResponse({
      success: true,
      message: 'Jadwal berhasil diambil',
      data: result.rows
    });
  } catch (error) {
    console.error('Error getting jadwal:', error);
    return jsonResponse({
      success: false,
      message: 'Terjadi kesalahan saat mengambil jadwal',
      error: error.message
    }, 500);
  }
}

// POST /api/jadwal - Tambah jadwal baru
export async function POST(request) {
  try {
    // Buat mock request object untuk middleware
    const mockReq = { headers: request.headers };
    let res;
    
    // Gunakan middleware verifyToken
    await new Promise((resolve) => {
      verifyToken(mockReq, {
        status: (code) => ({ json: (data) => {
          res = jsonResponse(data, code);
          resolve();
        }}),
        json: (data) => {
          res = jsonResponse(data, 401);
          resolve();
        }
      }, () => resolve());
    });

    if (res) return res;

    const userId = mockReq.user.id;
    const body = await request.json();
    const { 
      android_id, 
      judul, 
      deskripsi, 
      waktu_mulai, 
      kategori, 
      lokasi, 
      isRecurring, 
      hariDalamMinggu, 
      menitSebelumnya 
    } = body;

    // Validasi input wajib
    if (!android_id || !judul || !waktu_mulai || !kategori) {
      return jsonResponse({
        success: false,
        message: 'android_id, judul, waktu_mulai, dan kategori harus diisi'
      }, 400);
    }

    // Cek apakah android_id sudah ada untuk user ini
    const existing = await sql`
      SELECT id FROM jadwal 
      WHERE user_id = ${userId} AND android_id = ${android_id}
    `;

    if (existing.rows.length > 0) {
      return jsonResponse({
        success: false,
        message: 'Jadwal dengan android_id ini sudah ada. Gunakan PUT untuk update.'
      }, 409);
    }

    // Simpan jadwal baru
    const result = await sql`
      INSERT INTO jadwal (
        user_id,
        android_id,
        judul,
        deskripsi,
        waktu_mulai,
        kategori,
        lokasi,
        is_recurring,
        hari_dalam_minggu,
        menit_sebelumnya
      ) VALUES (
        ${userId},
        ${android_id},
        ${judul},
        ${deskripsi || null},
        ${waktu_mulai},
        ${kategori},
        ${lokasi || null},
        ${isRecurring || false},
        ${hariDalamMinggu || 0},
        ${menitSebelumnya || 0}
      )
      RETURNING *
    `;

    return jsonResponse({
      success: true,
      message: 'Jadwal berhasil ditambahkan',
      data: {
        android_id: result.rows[0].android_id,
        judul: result.rows[0].judul,
        deskripsi: result.rows[0].deskripsi,
        waktu_mulai: result.rows[0].waktu_mulai,
        kategori: result.rows[0].kategori,
        lokasi: result.rows[0].lokasi,
        isRecurring: result.rows[0].is_recurring,
        hariDalamMinggu: result.rows[0].hari_dalam_minggu,
        menitSebelumnya: result.rows[0].menit_sebelumnya
      }
    }, 201);
  } catch (error) {
    console.error('Error adding jadwal:', error);
    return jsonResponse({
      success: false,
      message: 'Terjadi kesalahan saat menambahkan jadwal',
      error: error.message
    }, 500);
  }
}

// PUT /api/jadwal/:android_id - Update jadwal
export async function PUT(request, { params }) {
  try {
    // Buat mock request object untuk middleware
    const mockReq = { headers: request.headers };
    let res;
    
    // Gunakan middleware verifyToken
    await new Promise((resolve) => {
      verifyToken(mockReq, {
        status: (code) => ({ json: (data) => {
          res = jsonResponse(data, code);
          resolve();
        }}),
        json: (data) => {
          res = jsonResponse(data, 401);
          resolve();
        }
      }, () => resolve());
    });

    if (res) return res;

    const userId = mockReq.user.id;
    const androidId = parseInt(params.android_id);
    
    if (isNaN(androidId)) {
      return jsonResponse({
        success: false,
        message: 'android_id harus berupa angka'
      }, 400);
    }

    const body = await request.json();
    const { 
      judul, 
      deskripsi, 
      waktu_mulai, 
      kategori, 
      lokasi, 
      isRecurring, 
      hariDalamMinggu, 
      menitSebelumnya 
    } = body;

    // Cek apakah jadwal ada dan milik user ini
    const existing = await sql`
      SELECT id FROM jadwal 
      WHERE user_id = ${userId} AND android_id = ${androidId}
    `;

    if (existing.rows.length === 0) {
      return jsonResponse({
        success: false,
        message: 'Jadwal tidak ditemukan'
      }, 404);
    }

    // Update jadwal
    await sql`
      UPDATE jadwal SET
        judul = ${judul !== undefined ? judul : judul},
        deskripsi = ${deskripsi !== undefined ? deskripsi : null},
        waktu_mulai = ${waktu_mulai !== undefined ? waktu_mulai : waktu_mulai},
        kategori = ${kategori !== undefined ? kategori : kategori},
        lokasi = ${lokasi !== undefined ? lokasi : null},
        is_recurring = ${isRecurring !== undefined ? isRecurring : false},
        hari_dalam_minggu = ${hariDalamMinggu !== undefined ? hariDalamMinggu : 0},
        menit_sebelumnya = ${menitSebelumnya !== undefined ? menitSebelumnya : 0},
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ${userId} AND android_id = ${androidId}
    `;

    // Ambil data yang sudah diupdate
    const result = await sql`
      SELECT 
        android_id,
        judul,
        deskripsi,
        waktu_mulai,
        kategori,
        lokasi,
        is_recurring as "isRecurring",
        hari_dalam_minggu as "hariDalamMinggu",
        menit_sebelumnya as "menitSebelumnya"
      FROM jadwal
      WHERE user_id = ${userId} AND android_id = ${androidId}
    `;

    return jsonResponse({
      success: true,
      message: 'Jadwal berhasil diupdate',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating jadwal:', error);
    return jsonResponse({
      success: false,
      message: 'Terjadi kesalahan saat mengupdate jadwal',
      error: error.message
    }, 500);
  }
}

// DELETE /api/jadwal/:android_id - Hapus jadwal
export async function DELETE(request, { params }) {
  try {
    // Buat mock request object untuk middleware
    const mockReq = { headers: request.headers };
    let res;
    
    // Gunakan middleware verifyToken
    await new Promise((resolve) => {
      verifyToken(mockReq, {
        status: (code) => ({ json: (data) => {
          res = jsonResponse(data, code);
          resolve();
        }}),
        json: (data) => {
          res = jsonResponse(data, 401);
          resolve();
        }
      }, () => resolve());
    });

    if (res) return res;

    const userId = mockReq.user.id;
    const androidId = parseInt(params.android_id);
    
    if (isNaN(androidId)) {
      return jsonResponse({
        success: false,
        message: 'android_id harus berupa angka'
      }, 400);
    }

    // Cek apakah jadwal ada dan milik user ini
    const existing = await sql`
      SELECT id FROM jadwal 
      WHERE user_id = ${userId} AND android_id = ${androidId}
    `;

    if (existing.rows.length === 0) {
      return jsonResponse({
        success: false,
        message: 'Jadwal tidak ditemukan'
      }, 404);
    }

    // Hapus jadwal
    await sql`
      DELETE FROM jadwal 
      WHERE user_id = ${userId} AND android_id = ${androidId}
    `;

    return jsonResponse({
      success: true,
      message: 'Jadwal berhasil dihapus'
    });
  } catch (error) {
    console.error('Error deleting jadwal:', error);
    return jsonResponse({
      success: false,
      message: 'Terjadi kesalahan saat menghapus jadwal',
      error: error.message
    }, 500);
  }
}
