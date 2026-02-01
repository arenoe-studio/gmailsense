# 📧 GmailSense: AI-Powered Smart Inbox Cleaner

**GmailSense** adalah bot cerdas berbasis Google Apps Script yang menggunakan **Google Gemini 2.5 Flash Lite** (via OpenRouter) untuk membersihkan dan mengorganisir inbox Gmail Anda secara otomatis. Tidak sekadar filter biasa, bot ini "membaca" konteks email untuk menentukan apakah itu penting, spam, atau newsletter.

---

## 🚀 Fitur Utama

- **🧠 AI Processor**: Mengklasifikasikan email dengan akurasi tinggi (lebih pintar dari regex/filter biasa).
- **🧹 Auto-Trash OTP**: Kode OTP/Verifikasi yang expired langsung dibuang ke Sampah.
- **📰 Smart Newsletter**: Newsletter baru ditandai "Read" & Label. Newsletter tua (>7 hari) otomatis dibuang.
- **⚡ Priority Alert**: Email penting (Security, Server Alert, Invoice) dibiarkan **UNREAD** & diberi label `Priority` agar Anda notice.
- **🧼 Zero Inbox Philosophy**: Semua email yang diproses akan ditandai **READ** (kecuali Priority) dan diberi label, sehingga inbox tetap rapi.

---

## 🛠️ Tools Tersedia

Di dalam script ini terdapat 3 fungsi utama yang bisa Anda jalankan:

### 1. `processEmails()` (The Sorter)

- **Fungsi**: Mengambil 100 email **terlama** (belum diproses), membaca isinya dengan AI, lalu memberi label & aksi sesuai kategori.
- **Gunakan saat**: Ingin membersihkan tumpukan inbox.
- **Saran**: Set trigger otomatis per jam.

### 2. `purgeOldNewsletters()` (The Janitor)

- **Fungsi**: Mencari semua email berlabel `Newsletter` yang umurnya > 7 hari, lalu membuangnya ke Trash.
- **Keunggulan**: Sangat cepat (tanpa AI), hemat kuota.
- **Gunakan saat**: Ingin bersih-bersih rutin mingguan.

### 3. `showStats()` (The Monitor)

- **Fungsi**: Menampilkan jumlah email di setiap label (`Processed`, `Newsletter`, `Priority`, dll) di console log.

---

## 🏷️ Kategori & Aksi

| Kategori        | Contoh Email                            | Label           | Aksi Bot                                  |
| :-------------- | :-------------------------------------- | :-------------- | :---------------------------------------- |
| **OTP_VERIFY**  | Kode OTP, Link Verifikasi, Magic Link   | `Bot-Processed` | **🗑️ TRASH** (Langsung)                   |
| **NEWSLETTER**  | Promo, Buletin, Rekomendasi Produk      | `Newsletter`    | **� READ** (Baru) / **�️ TRASH** (>7 hari) |
| **MARKETPLACE** | Tokopedia, Shopee, Steam Receipt        | `Marketplace`   | **👀 READ** + Sublabel                    |
| **PRIORITY**    | Security Alert, Invoice Server, Tagihan | `Priority`      | **🔔 KEEP UNREAD** + Sublabel             |
| **GENERAL**     | Welcome email, Info ToS, Sosmed         | `General`       | **👀 READ**                               |

---

## ⚙️ Cara Install & Setup

### Prasyarat

- Akun Google (Gmail).
- API Key dari [OpenRouter](https://openrouter.ai/) (Model: `google/gemini-2.5-flash-lite`).
- Node.js & Clasp (untuk development lokal).

### Langkah Setup

1. **Clone Repo**:
   ```bash
   git clone https://github.com/arenoe-studio/gmailsense.git
   cd gmailsense
   ```
2. **Push ke Apps Script**:
   ```bash
   clasp login
   clasp create --type standalone --title "Gmail Smart Bot"
   clasp push
   ```
3. **Setup API Key**:
   - Buka project di browser: `clasp open`
   - Pergi ke **Project Settings** (⚙️) -> **Script Properties**.
   - Tambahkan Property: `OPENROUTER_KEY`, Value: `sk-or-xxxx...` (Key Anda).
4. **Jalankan Bot**:
   - Di editor, pilih fungsi `processEmails`.
   - Klik **Run**.
   - Berikan izin akses (Authorization) saat diminta.

---

## ⏱️ Otomatisasi (Trigger)

Agar bot bekerja otomatis tanpa perlu ditungguin:

1. Buka Apps Script (`clasp open`).
2. Klik menu **Triggers** (ikon Jam).
3. Buat Trigger baru:
   - Function: `processEmails`
   - Event Source: **Time-driven**
   - Type: **Hourly** (Setiap jam).

---

## � Struktur Project

```
GmailSense/
├── src/
│   ├── Code.js           # Logika utama (Config, Tools, AI, Handlers)
│   └── appsscript.json   # Manifest permissions
├── .clasp.json          # Config Clasp
├── .claspignore         # Ignore rules
└── README.md            # Dokumentasi ini
```

---

**Happy Cleansing!** 🧹✨
