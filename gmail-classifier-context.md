# Context Engineering: Gmail Auto-Classifier Bot
## Untuk Antigravity IDE

---

## 🎯 Project Overview

Bangun Google Apps Script yang mengklasifikasikan email Gmail secara otomatis menggunakan AI dari Openrouter API. Bot dijalankan manual, memproses batch email, dan memberikan label/aksi otomatis berdasarkan kategori email.

---

## 📋 Technical Stack

- **Platform**: Google Apps Script (Web IDE)
- **AI Provider**: Openrouter API
- **Model**: `meta-llama/llama-3.1-8b-instruct:free` (atau model free lainnya)
- **Gmail API**: Built-in `GmailApp` service
- **Execution Mode**: Manual trigger dari Apps Script editor
- **Language**: JavaScript (Apps Script flavor)

---

## 🏗️ Architecture & Flow

### High-Level Flow
```
1. User clicks "Run" di Apps Script
2. Ambil 20 email terakhir yang belum ada label "Bot-Processed"
3. Loop setiap email:
   - Ekstrak subject + body (max 300 karakter)
   - Kirim ke Openrouter API untuk klasifikasi
   - Parse response AI (kategori + reasoning)
   - Eksekusi aksi sesuai kategori
   - Tandai email dengan label "Bot-Processed"
4. Log hasil ke console
5. Selesai
```

### Email Categories & Actions

| Kategori | Kondisi | Aksi |
|----------|---------|------|
| **Newsletter** | Email promosi/marketing berulang | - Beri label "Newsletter"<br>- Hapus jika lebih dari 7 hari |
| **OTP/Expired** | Kode verifikasi, OTP, password reset | - Langsung hapus (sudah pasti expired)<br>- Tidak perlu label |
| **Penting** | Invoice, booking, tiket, kontrak | - Label "Penting"<br>- Sub-label sesuai jenis (misal: "Penting/Invoice") |
| **Biasa** | Email personal, update ringan | - Tidak diberi label<br>- Tetap di inbox |

---

## 📝 Detailed Requirements

### 1. Configuration Object
```javascript
const CONFIG = {
  // API Settings
  OPENROUTER_API_KEY: 'sk-or-v1-xxxxx', // User harus ganti
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_MODEL: 'meta-llama/llama-3.1-8b-instruct:free',
  
  // Processing Settings
  BATCH_SIZE: 20,              // Jumlah email per run
  EMAIL_BODY_LIMIT: 300,       // Karakter body yang diambil
  NEWSLETTER_AGE_DAYS: 7,      // Hapus newsletter > 7 hari
  
  // Labels
  PROCESSED_LABEL: 'Bot-Processed',
  NEWSLETTER_LABEL: 'Newsletter',
  IMPORTANT_LABEL: 'Penting',
  
  // Sub-labels untuk kategori penting
  IMPORTANT_SUBLABELS: {
    invoice: 'Penting/Invoice',
    booking: 'Penting/Booking',
    shipping: 'Penting/Pengiriman',
    financial: 'Penting/Keuangan'
  }
};
```

### 2. Main Function Structure
```javascript
function processEmails() {
  // 1. Inisialisasi
  // 2. Get atau create labels
  // 3. Search unprocessed emails
  // 4. Loop & process each email
  // 5. Log summary
}
```

### 3. Email Search Query
```javascript
// Cari email yang:
// - Belum ada label "Bot-Processed"
// - Maksimal 20 thread terbaru
// - Bisa unread atau read (proses semua)

var query = '-label:' + CONFIG.PROCESSED_LABEL;
var threads = GmailApp.search(query, 0, CONFIG.BATCH_SIZE);
```

### 4. Email Content Extraction
```javascript
// Untuk setiap thread, ambil message pertama
var messages = thread.getMessages();
var message = messages[0];

// Ekstrak data
var subject = message.getSubject();
var from = message.getFrom();
var date = message.getDate();
var body = message.getPlainBody().substring(0, CONFIG.EMAIL_BODY_LIMIT);
```

### 5. AI Prompt Engineering

**System Prompt:**
```
Kamu adalah AI classifier untuk email. Analisis email dan klasifikasikan ke salah satu kategori berikut:

1. NEWSLETTER - Email marketing, promosi, newsletter berlangganan
2. OTP - Kode verifikasi, OTP, password reset, kode aktivasi
3. PENTING - Invoice, receipt, booking confirmation, shipping notification, important documents
4. BIASA - Email personal, update biasa, notifikasi umum

WAJIB respond dalam format JSON:
{
  "category": "NEWSLETTER|OTP|PENTING|BIASA",
  "subcategory": "invoice|booking|shipping|financial|null",
  "confidence": 0.0-1.0,
  "reason": "penjelasan singkat"
}

Subcategory hanya diisi jika category = PENTING.
```

**User Prompt Template:**
```
Subject: {subject}
From: {from}
Date: {date}

Body preview:
{body}

Klasifikasikan email ini.
```

### 6. Openrouter API Call
```javascript
function classifyWithAI(subject, from, body, date) {
  var payload = {
    "model": CONFIG.OPENROUTER_MODEL,
    "messages": [
      {
        "role": "system",
        "content": "[System prompt dari section 5]"
      },
      {
        "role": "user",
        "content": "Subject: " + subject + "\nFrom: " + from + "\n\nBody:\n" + body
      }
    ],
    "temperature": 0.3,
    "max_tokens": 200
  };
  
  var options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": "Bearer " + CONFIG.OPENROUTER_API_KEY,
      "HTTP-Referer": "https://script.google.com",
      "X-Title": "Gmail Classifier Bot"
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  var response = UrlFetchApp.fetch(CONFIG.OPENROUTER_API_URL, options);
  var json = JSON.parse(response.getContentText());
  
  // Parse AI response
  var aiMessage = json.choices[0].message.content;
  return JSON.parse(aiMessage); // {category, subcategory, confidence, reason}
}
```

### 7. Action Executor
```javascript
function executeAction(thread, message, classification) {
  var category = classification.category;
  
  switch(category) {
    case 'NEWSLETTER':
      handleNewsletter(thread, message);
      break;
    
    case 'OTP':
      handleOTP(thread);
      break;
    
    case 'PENTING':
      handleImportant(thread, classification.subcategory);
      break;
    
    case 'BIASA':
      // Tidak ada aksi khusus
      break;
  }
  
  // Tandai sudah diproses
  var processedLabel = getOrCreateLabel(CONFIG.PROCESSED_LABEL);
  thread.addLabel(processedLabel);
}

function handleNewsletter(thread, message) {
  var newsletterLabel = getOrCreateLabel(CONFIG.NEWSLETTER_LABEL);
  thread.addLabel(newsletterLabel);
  
  // Cek umur email
  var messageDate = message.getDate();
  var ageInDays = (new Date() - messageDate) / (1000 * 60 * 60 * 24);
  
  if (ageInDays > CONFIG.NEWSLETTER_AGE_DAYS) {
    thread.moveToTrash();
    Logger.log('Newsletter dihapus (umur: ' + ageInDays.toFixed(1) + ' hari)');
  }
}

function handleOTP(thread) {
  // Langsung hapus, OTP pasti sudah expired
  thread.moveToTrash();
  Logger.log('OTP email dihapus');
}

function handleImportant(thread, subcategory) {
  var mainLabel = getOrCreateLabel(CONFIG.IMPORTANT_LABEL);
  thread.addLabel(mainLabel);
  
  // Tambah sublabel jika ada
  if (subcategory && CONFIG.IMPORTANT_SUBLABELS[subcategory]) {
    var subLabel = getOrCreateLabel(CONFIG.IMPORTANT_SUBLABELS[subcategory]);
    thread.addLabel(subLabel);
  }
  
  Logger.log('Email penting dilabeli: ' + subcategory);
}
```

### 8. Label Management
```javascript
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  
  if (!label) {
    label = GmailApp.createLabel(labelName);
    Logger.log('Label baru dibuat: ' + labelName);
  }
  
  return label;
}
```

### 9. Error Handling
```javascript
try {
  var classification = classifyWithAI(subject, from, body, date);
  executeAction(thread, message, classification);
  successCount++;
} catch (error) {
  Logger.log('ERROR pada email: ' + subject);
  Logger.log('Error detail: ' + error.toString());
  errorCount++;
  // Lanjut ke email berikutnya, jangan stop
}
```

### 10. Logging & Summary
```javascript
function processEmails() {
  var startTime = new Date();
  var processedCount = 0;
  var successCount = 0;
  var errorCount = 0;
  
  // ... processing logic ...
  
  var endTime = new Date();
  var duration = (endTime - startTime) / 1000;
  
  Logger.log('===== SUMMARY =====');
  Logger.log('Total threads: ' + threads.length);
  Logger.log('Berhasil: ' + successCount);
  Logger.log('Error: ' + errorCount);
  Logger.log('Durasi: ' + duration + ' detik');
  Logger.log('==================');
}
```

---

## 🔧 Implementation Steps for Antigravity

### Step 1: Setup Project
```
Buat Google Apps Script baru dengan nama "Gmail Auto Classifier"
File utama: Code.gs
```

### Step 2: Dependencies Check
```
Pastikan service Gmail API sudah enabled (default enabled di Apps Script)
Tidak perlu library eksternal, semua built-in
```

### Step 3: Code Structure
```
Code.gs harus berisi:
1. CONFIG object
2. processEmails() - main function
3. classifyWithAI() - API caller
4. executeAction() - action dispatcher
5. handleNewsletter() - newsletter handler
6. handleOTP() - OTP handler
7. handleImportant() - important email handler
8. getOrCreateLabel() - label utility
```

### Step 4: Testing Flow
```
1. Ganti OPENROUTER_API_KEY dengan key asli
2. Klik "Run" pada function processEmails()
3. Authorize akses Gmail (popup pertama kali)
4. Lihat log untuk hasil
5. Cek Gmail untuk verifikasi label
```

### Step 5: Troubleshooting Checklist
```
- API key valid?
- Quota Openrouter cukup?
- Gmail authorization granted?
- Email search query benar? (cek dengan GmailApp.search di console)
- JSON parse error? (cek format response AI)
```

---

## 📊 Expected Behavior

### First Run
- Proses 20 email terakhir yang belum ada label "Bot-Processed"
- Buat label baru jika belum ada
- Newsletter lama (>7 hari) langsung dihapus
- OTP langsung dihapus
- Email penting diberi label dengan sublabel
- Log menampilkan summary

### Subsequent Runs
- Hanya proses email baru (belum ada label "Bot-Processed")
- Skip email yang sudah diproses sebelumnya
- Jika tidak ada email baru, log: "Tidak ada email untuk diproses"

### Manual Re-process
User bisa hapus label "Bot-Processed" dari email tertentu di Gmail, lalu run lagi untuk re-classify.

---

## 🚨 Important Notes for Antigravity

1. **API Key Security**: Jangan hardcode API key di code final. Gunakan Properties Service:
   ```javascript
   var apiKey = PropertiesService.getScriptProperties().getProperty('OPENROUTER_KEY');
   ```

2. **Rate Limiting**: Openrouter free tier punya limit. Jika error 429, tambahkan delay:
   ```javascript
   Utilities.sleep(1000); // 1 detik delay antar API call
   ```

3. **Gmail Quota**: Apps Script punya quota harian untuk Gmail operations. Untuk akun free: 500 emails/day.

4. **Execution Time Limit**: Apps Script timeout di 6 menit. Jika BATCH_SIZE terlalu besar, kurangi.

5. **JSON Parsing**: AI response kadang tidak perfect JSON. Tambah try-catch:
   ```javascript
   try {
     return JSON.parse(aiMessage);
   } catch {
     // Fallback ke kategori BIASA
     return {category: 'BIASA', subcategory: null, confidence: 0.5, reason: 'Parse error'};
   }
   ```

---

## 🎨 Optional Enhancements

### 1. Custom Menu di Gmail
```javascript
function onOpen() {
  GmailApp.createMenu('Email Classifier')
    .addItem('Process Emails', 'processEmails')
    .addToUi();
}
```

### 2. Email Summary Report
```javascript
function sendSummaryEmail(stats) {
  var htmlBody = '<h3>Email Classification Summary</h3>' +
                 '<p>Processed: ' + stats.processed + '</p>' +
                 '<p>Newsletter: ' + stats.newsletter + '</p>' +
                 '<p>OTP Deleted: ' + stats.otp + '</p>' +
                 '<p>Important: ' + stats.important + '</p>';
  
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: 'Gmail Classifier Report',
    htmlBody: htmlBody
  });
}
```

### 3. Whitelist Senders
```javascript
const WHITELIST = ['boss@company.com', 'noreply@bank.com'];

function isWhitelisted(from) {
  return WHITELIST.some(email => from.includes(email));
}

// Di processEmails, skip whitelisted:
if (isWhitelisted(from)) {
  Logger.log('Skipped (whitelisted): ' + from);
  continue;
}
```

---

## 📚 Complete Code Template

```javascript
// ===== CONFIGURATION =====
const CONFIG = {
  OPENROUTER_API_KEY: 'GANTI_DENGAN_KEY_ASLI',
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_MODEL: 'meta-llama/llama-3.1-8b-instruct:free',
  BATCH_SIZE: 20,
  EMAIL_BODY_LIMIT: 300,
  NEWSLETTER_AGE_DAYS: 7,
  PROCESSED_LABEL: 'Bot-Processed',
  NEWSLETTER_LABEL: 'Newsletter',
  IMPORTANT_LABEL: 'Penting'
};

// ===== MAIN FUNCTION =====
function processEmails() {
  Logger.log('===== MULAI PROCESSING =====');
  var startTime = new Date();
  
  // Search unprocessed emails
  var query = '-label:' + CONFIG.PROCESSED_LABEL;
  var threads = GmailApp.search(query, 0, CONFIG.BATCH_SIZE);
  
  if (threads.length === 0) {
    Logger.log('Tidak ada email untuk diproses');
    return;
  }
  
  Logger.log('Ditemukan ' + threads.length + ' email');
  
  var stats = {success: 0, error: 0};
  
  // Process each thread
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var messages = thread.getMessages();
    var message = messages[0];
    
    try {
      var subject = message.getSubject();
      var from = message.getFrom();
      var date = message.getDate();
      var body = message.getPlainBody().substring(0, CONFIG.EMAIL_BODY_LIMIT);
      
      Logger.log('\n[' + (i+1) + '] ' + subject);
      
      // Classify with AI
      var classification = classifyWithAI(subject, from, body, date);
      Logger.log('Category: ' + classification.category + ' (confidence: ' + classification.confidence + ')');
      
      // Execute action
      executeAction(thread, message, classification);
      
      stats.success++;
      Utilities.sleep(500); // Anti rate-limit
      
    } catch (error) {
      Logger.log('ERROR: ' + error.toString());
      stats.error++;
    }
  }
  
  // Summary
  var duration = (new Date() - startTime) / 1000;
  Logger.log('\n===== SUMMARY =====');
  Logger.log('Berhasil: ' + stats.success);
  Logger.log('Error: ' + stats.error);
  Logger.log('Durasi: ' + duration + 's');
}

// ===== AI CLASSIFIER =====
function classifyWithAI(subject, from, body, date) {
  var systemPrompt = `Kamu adalah AI classifier untuk email. Analisis email dan klasifikasikan ke salah satu kategori:

1. NEWSLETTER - Email marketing, promosi, newsletter
2. OTP - Kode verifikasi, OTP, password reset
3. PENTING - Invoice, booking, shipping, dokumen penting
4. BIASA - Email personal, update biasa

Respond dalam JSON:
{
  "category": "NEWSLETTER|OTP|PENTING|BIASA",
  "subcategory": "invoice|booking|shipping|null",
  "confidence": 0.0-1.0,
  "reason": "singkat"
}`;

  var userPrompt = 'Subject: ' + subject + '\nFrom: ' + from + '\n\nBody:\n' + body;
  
  var payload = {
    model: CONFIG.OPENROUTER_MODEL,
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userPrompt}
    ],
    temperature: 0.3,
    max_tokens: 200
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + CONFIG.OPENROUTER_API_KEY,
      'HTTP-Referer': 'https://script.google.com'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(CONFIG.OPENROUTER_API_URL, options);
  var json = JSON.parse(response.getContentText());
  var aiMessage = json.choices[0].message.content;
  
  // Parse JSON dari AI
  try {
    return JSON.parse(aiMessage);
  } catch {
    return {category: 'BIASA', subcategory: null, confidence: 0.5, reason: 'Parse error'};
  }
}

// ===== ACTION EXECUTOR =====
function executeAction(thread, message, classification) {
  var category = classification.category;
  
  switch(category) {
    case 'NEWSLETTER':
      var label = getOrCreateLabel(CONFIG.NEWSLETTER_LABEL);
      thread.addLabel(label);
      
      var ageInDays = (new Date() - message.getDate()) / (1000 * 60 * 60 * 24);
      if (ageInDays > CONFIG.NEWSLETTER_AGE_DAYS) {
        thread.moveToTrash();
        Logger.log('Newsletter dihapus (umur: ' + ageInDays.toFixed(1) + ' hari)');
      }
      break;
    
    case 'OTP':
      thread.moveToTrash();
      Logger.log('OTP dihapus');
      break;
    
    case 'PENTING':
      var mainLabel = getOrCreateLabel(CONFIG.IMPORTANT_LABEL);
      thread.addLabel(mainLabel);
      
      if (classification.subcategory) {
        var subLabelName = CONFIG.IMPORTANT_LABEL + '/' + classification.subcategory;
        var subLabel = getOrCreateLabel(subLabelName);
        thread.addLabel(subLabel);
      }
      Logger.log('Labeled as important');
      break;
  }
  
  // Mark as processed
  var processedLabel = getOrCreateLabel(CONFIG.PROCESSED_LABEL);
  thread.addLabel(processedLabel);
}

// ===== UTILITY =====
function getOrCreateLabel(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  return label;
}
```

---

## ✅ Final Checklist untuk Antigravity

- [ ] Copy seluruh code template ke Code.gs
- [ ] Ganti `OPENROUTER_API_KEY` dengan key asli
- [ ] Test run function `processEmails()`
- [ ] Authorize Gmail access saat popup muncul
- [ ] Verifikasi label terbuat di Gmail
- [ ] Cek log untuk error/success
- [ ] Test dengan berbagai jenis email
- [ ] Adjust BATCH_SIZE sesuai kebutuhan
- [ ] Adjust NEWSLETTER_AGE_DAYS sesuai preferensi

---

## 🎓 Context untuk Antigravity AI

**Antigravity, tolong bangun Google Apps Script sesuai spesifikasi di atas dengan prioritas:**

1. **Code Quality**: Clean, readable, well-commented
2. **Error Handling**: Robust try-catch, graceful failures
3. **Logging**: Detailed logging untuk debugging
4. **Modularity**: Function-based, easy to modify
5. **Performance**: Efficient API calls, proper delays

**Output yang diharapkan:**
- File `Code.gs` lengkap dan siap pakai
- Semua function sudah terimplementasi
- Config mudah di-customize
- Ready untuk manual execution

**Testing scenario:**
- Email newsletter dari Tokopedia → Label "Newsletter"
- Email OTP dari bank → Hapus langsung  
- Invoice dari marketplace → Label "Penting/Invoice"
- Email dari teman → Tidak ada aksi (kategori BIASA)

Terima kasih Antigravity! 🚀
