# Backend Jadwalin - Vercel Postgres

Backend untuk aplikasi Android Jadwalin menggunakan Vercel Serverless Functions dan Vercel Postgres.

## Struktur Folder

```
jadwalin-backend/
├── api/
│   ├── auth/
│   │   ├── register.js    # POST /api/auth/register
│   │   └── login.js       # POST /api/auth/login
│   └── jadwal/
│       └── route.js       # GET/POST/PUT/DELETE /api/jadwal[:android_id]
├── middleware/
│   └── auth.js            # JWT verification middleware
├── lib/
│   └── db.js              # Database connection & table creation
├── package.json
└── vercel.json
```

## Setup Environment Variables

Di dashboard Vercel project Anda, tambahkan environment variables berikut:

1. **POSTGRES_URL** - URL koneksi ke Vercel Postgres
   - Dapatkan dari Vercel Dashboard > Storage > Create Database > PostgreSQL
   - Format: `postgres://username:password@host:port/database`

2. **JWT_SECRET** - Secret key untuk JWT token (buat random string yang aman)
   - Contoh: `my-super-secret-jwt-key-change-this-in-production`
   - Gunakan minimal 32 karakter untuk keamanan

3. **NODE_ENV** - (Optional) Set ke `production` saat deploy

## Cara Deploy ke Vercel

### 1. Install Vercel CLI (jika belum)
```bash
npm install -g vercel
```

### 2. Login ke Vercel
```bash
vercel login
```

### 3. Deploy
```bash
cd /path/to/jadwalin-backend
vercel
```

Ikuti instruksi di terminal:
- Pilih "Set up and deploy" untuk pertama kali
- Link ke existing project atau buat baru
- Tunggu build selesai

### 4. Set Environment Variables di Vercel Dashboard
1. Buka https://vercel.com/dashboard
2. Pilih project Anda
3. Settings > Environment Variables
4. Tambahkan:
   - `POSTGRES_URL`
   - `JWT_SECRET`
5. Redeploy project agar env vars diterapkan

### 5. Inisialisasi Database
Setelah deploy pertama kali, buat endpoint sementara untuk inisialisasi tabel atau jalankan script SQL langsung dari Vercel Postgres dashboard.

## Testing API dengan cURL

### 1. Register User Baru
```bash
curl -X POST https://your-project.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

Response:
```json
{
  "success": true,
  "message": "Registrasi berhasil",
  "data": {
    "user": {
      "id": 1,
      "email": "test@example.com",
      "name": "Test User"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. Login
```bash
curl -X POST https://your-project.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 3. Get Semua Jadwal (Protected)
```bash
curl -X GET https://your-project.vercel.app/api/jadwal \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

### 4. Tambah Jadwal Baru (Protected)
```bash
curl -X POST https://your-project.vercel.app/api/jadwal \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "android_id": 1,
    "judul": "Meeting Tim",
    "deskripsi": "Rapat mingguan tim development",
    "waktu_mulai": "2024-01-15T10:00:00",
    "kategori": "Work",
    "lokasi": "Room A",
    "isRecurring": true,
    "hariDalamMinggu": 1,
    "menitSebelumnya": 15
  }'
```

### 5. Update Jadwal (Protected)
```bash
curl -X PUT https://your-project.vercel.app/api/jadwal/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "judul": "Meeting Tim - Updated",
    "deskripsi": "Rapat mingguan tim development (updated)"
  }'
```

### 6. Hapus Jadwal (Protected)
```bash
curl -X DELETE https://your-project.vercel.app/api/jadwal/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

## Testing dengan Postman

1. **Import Collection**: Buat collection baru di Postman
2. **Set Base URL**: Gunakan URL production atau local dev Anda
3. **Auth Request**: 
   - POST ke `/api/auth/register` atau `/api/auth/login`
   - Copy token dari response
4. **Protected Requests**:
   - Di tab "Authorization", pilih type "Bearer Token"
   - Paste token Anda
   - Atau manual di Headers: `Authorization: Bearer YOUR_TOKEN`

## Skema Database

### Tabel `users`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | SERIAL | Primary Key |
| email | VARCHAR(255) | Unique, Indexed |
| password | TEXT | Hash bcrypt |
| name | VARCHAR(255) | Nama pengguna |
| created_at | TIMESTAMP | Waktu registrasi |

### Tabel `jadwal`
| Kolom | Tipe | Keterangan |
|-------|------|------------|
| id | SERIAL | Primary Key |
| user_id | INTEGER | Foreign Key → users(id) |
| android_id | INTEGER | Unique per user (untuk sync) |
| judul | VARCHAR(255) | Judul jadwal |
| deskripsi | TEXT | Deskripsi (nullable) |
| waktu_mulai | VARCHAR(50) | Waktu mulai |
| kategori | VARCHAR(100) | Kategori |
| lokasi | VARCHAR(255) | Lokasi (nullable) |
| is_recurring | BOOLEAN | Apakah berulang |
| hari_dalam_minggu | INTEGER | Hari dalam minggu (0-6) |
| menit_sebelumnya | INTEGER | Reminder menit sebelumnya |
| created_at | TIMESTAMP | Waktu pembuatan |
| updated_at | TIMESTAMP | Waktu update terakhir |

## Keamanan

- ✅ Password di-hash dengan bcrypt (salt rounds: 10)
- ✅ JWT Token dengan expiry 7 hari
- ✅ Middleware verifikasi token pada semua endpoint protected
- ✅ Row-level security: user hanya bisa akses jadwal mereka sendiri
- ✅ Input validation pada semua endpoint
- ✅ SQL injection prevention (parameterized queries)

## Error Handling

Semua endpoint mengembalikan format JSON konsisten:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (development only)"
}
```

Status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (invalid input)
- `401`: Unauthorized (missing/invalid token)
- `403`: Forbidden (invalid token)
- `404`: Not Found
- `409`: Conflict (duplicate data)
- `500`: Internal Server Error
