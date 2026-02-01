# Gmail Auto-Classifier Bot

Sistem otomatis untuk mengklasifikasikan email Gmail menggunakan AI dari Openrouter API.

## 🚀 Fitur

- ✅ Klasifikasi otomatis email dengan AI (Openrouter)
- ✅ Auto-labeling berdasarkan kategori (Newsletter, Marketplace, Penting, Biasa)
- ✅ Deteksi marketplace Indonesia (Tokopedia, Shopee, Lazada, dll)
- ✅ Auto-delete email OTP dan newsletter lama (ke Trash, bukan permanent)
- ✅ Prioritas memproses email## 🧠 Cara Kerja Bot

Bot ini bekerja dengan prinsip **"Zero Inbox" & "Smart Cleanup"**:

1. **Strict Labeling**: Tidak ada email yang terlewat tanpa label.
2. **Auto-Read**: Email non-urgent otomatis ditandai **Read** agar inbox tidak penuh notifikasi.
3. **Smart Trash**: OTP/Verifikasi basi dan Newsletter tua langsung dibuang.

### 🏷️ Kategori & Aksi Otomatis

| Kategori        | Definisi                                                              | Aksi Bot                                                | Label                                               |
| :-------------- | :-------------------------------------------------------------------- | :------------------------------------------------------ | :-------------------------------------------------- |
| **OTP_VERIFY**  | Kode OTP, Link verifikasi, Confirm account (yang punya expired time). | **🗑️ TRASH IMMEDIATELY**                                | `Bot-Processed`                                     |
| **NEWSLETTER**  | Email marketing, promosi, rekomendasi produk.                         | **🗑️ TRASH** (jika > 7 hari)<br>**👀 READ** (jika baru) | `Newsletter`                                        |
| **MARKETPLACE** | Transaksi belanja, resi, bukti bayar.                                 | **👀 READ**                                             | `Marketplace` + Sublabel (Invoice/Shipping/Receipt) |
| **PRIORITY**    | Security alert, Tagihan/Invoice, Lowongan kerja, Server alert.        | **🔔 KEEP UNREAD**                                      | `Priority` + Sublabel (Security/Invoice/Work)       |
| **GENERAL**     | Info umum, Welcome email, ToS update, Notifikasi sosmed.              | **👀 READ**                                             | `General`                                           |

> **Catatan:** Semua email yang sudah diproses akan mendapat label induk `Bot-Processed`.

## ⚙️ Logic Pembersihan (Detail)

1. **Search**: Mencari email yang BELUM berlabel `Bot-Processed`.
2. **Sort**: Memproses email **TERLAMA** lebih dulu (Oldest First).
3. **AI Analysis**: Mengirim body email ke **Google Gemini Flash Lite** (via OpenRouter) dengan instruksi strict.
4. **Action**:
   - Jika **Security Alert** (Google/GitHub) -> Masuk `Priority/Security` (UNREAD).
   - Jika **OTP/Verification** -> Masuk `TRASH` (karena biasanya sudah expired).
   - Jika **Newsletter** -> Cek umur. Jika > 7 hari, buang. Jika baru, label & read.
   - Jika **Biasa** -> Masuk `General` & Read.Jalankan function `setupApiKey()` dan ganti `YOUR_API_KEY_HERE` dengan API key Anda

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
