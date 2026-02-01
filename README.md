# Gmail Auto-Classifier Bot

Sistem otomatis untuk mengklasifikasikan email Gmail menggunakan AI dari Openrouter API.

## 🚀 Fitur

- ✅ Klasifikasi otomatis email dengan AI (Openrouter)
- ✅ Auto-labeling berdasarkan kategori (Newsletter, Marketplace, Penting, Biasa)
- ✅ Deteksi marketplace Indonesia (Tokopedia, Shopee, Lazada, dll)
- ✅ Auto-delete email OTP dan newsletter lama (ke Trash, bukan permanent)
- ✅ Prioritas memproses email lama terlebih dahulu
- ✅ Batch processing (20 email per run, configurable)

## 📋 Kategori Email

| Kategori        | Aksi                                                     |
| --------------- | -------------------------------------------------------- |
| **Newsletter**  | Label "Newsletter" + hapus jika > 7 hari                 |
| **OTP**         | Hapus langsung (OTP, password reset, verification codes) |
| **Marketplace** | Label "Marketplace" + sublabel (Invoice/Shipping)        |
| **Penting**     | Label "Penting" + sublabel (untuk non-marketplace)       |
| **Biasa**       | Tidak ada aksi                                           |

## 🛠️ Setup

### 1. Clone Repository

```bash
git clone <repo-url>
cd GmailSense
```

### 2. Install Clasp (jika belum)

```bash
npm install -g @google/clasp
```

### 3. Login ke Google

```bash
clasp login
```

### 4. Setup API Key

- Dapatkan API key dari [Openrouter](https://openrouter.ai/)
- Buka Apps Script: `clasp open`
- Jalankan function `setupApiKey()` dan ganti `YOUR_API_KEY_HERE` dengan API key Anda

### 5. Deploy

```bash
clasp push
```

## 📖 Cara Pakai

### Manual Run

1. Buka Apps Script: `clasp open`
2. Pilih function `processEmails`
3. Klik Run
4. Authorize akses Gmail (pertama kali)
5. Lihat log untuk hasil

### Custom Menu (Optional)

Uncomment function `onOpen()` di `Code.gs` untuk menambahkan menu di Gmail UI.

## ⚙️ Konfigurasi

Edit `CONFIG` object di `src/Code.gs`:

```javascript
const CONFIG = {
  OPENROUTER_MODEL: "meta-llama/llama-3.1-8b-instruct:free", // Ganti model
  BATCH_SIZE: 20, // Jumlah email per run
  NEWSLETTER_AGE_DAYS: 7, // Threshold hapus newsletter
  // ... dll
};
```

## 📁 Struktur Folder

```
GmailSense/
├── src/
│   ├── Code.gs           # Main script
│   └── appsscript.json   # Apps Script manifest
├── .clasp.json           # Clasp configuration
├── .claspignore          # Files to ignore
├── .gitignore            # Git ignore
├── gmail-classifier-context.md  # Project context
└── README.md             # This file
```

## 🔒 Security

- API key disimpan di Properties Service (tidak di code)
- OAuth scopes minimal yang diperlukan
- Email dihapus ke Trash (30 hari retention), bukan permanent delete

## 📊 Monitoring

Lihat statistik label:

```javascript
showStats(); // Di Apps Script console
```

## 🐛 Troubleshooting

### Error: API key tidak ditemukan

Jalankan `setupApiKey()` terlebih dahulu

### Error: Rate limit

Kurangi `BATCH_SIZE` atau tingkatkan `API_DELAY_MS`

### Email tidak terklasifikasi

Cek log untuk error detail, pastikan API key valid

## 📝 License

MIT License - Gunakan sesuka Anda!

## 🙏 Credits

Built with ❤️ using Google Apps Script & Openrouter AI
