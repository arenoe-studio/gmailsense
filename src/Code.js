// ============================================================================
// GMAIL AUTO-CLASSIFIER BOT
// Mengklasifikasikan email Gmail otomatis menggunakan AI dari Openrouter
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API Settings
  OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
  OPENROUTER_MODEL: "google/gemini-2.5-flash-lite", // Ganti sesuai kebutuhan

  // Processing Settings
  BATCH_SIZE: 100, // Jumlah email per run (Upgraded!)
  EMAIL_BODY_LIMIT: 500, // Diperbesar agar AI lebih paham konteks
  NEWSLETTER_AGE_DAYS: 7, // Hapus newsletter lebih dari X hari
  API_DELAY_MS: 500, // Delay antar API call (rate limiting)

  // Label Names
  PROCESSED_LABEL: 'Bot-Processed',
  NEWSLETTER_LABEL: 'Newsletter',
  MARKETPLACE_LABEL: 'Marketplace',
  IMPORTANT_LABEL: 'Priority',
  GENERAL_LABEL: 'General', // Label baru untuk kategori BIASA
  
  // Marketplace Detection Patterns (domain/sender keywords)
  MARKETPLACE_PATTERNS: [
    'tokopedia',
    'shopee',
    'lazada',
    'bukalapak',
    'blibli',
    'jd.id',
    'zalora',
    'sociolla',
    'orami',
    'google play',
    'apple',
    'steam'
  ],
  
  // Subcategory Mapping
  MARKETPLACE_SUBLABELS: {
    invoice: 'Marketplace/Invoice',
    shipping: 'Marketplace/Shipping',
    receipt: 'Marketplace/Receipt'
  },
  
  IMPORTANT_SUBLABELS: {
    invoice: 'Priority/Invoice',
    booking: 'Priority/Booking',
    shipping: 'Priority/Shipping',
    document: 'Priority/Document',
    security: 'Priority/Security', // Security alert penting (Google/GitHub)
    work: 'Priority/Work' // Notifikasi server/kerjaan (Render/Fly.io)
  }
};

// ============================================================================
// CORE LOGIC: PROCESSOR ENGINE
// ============================================================================

/**
 * Main Function: Memproses email secara batch
 * Dijalankan manual atau via trigger
 */
function processEmails() {
  logMessage("===== MULAI PROCESSING =====", "info");
  var startTime = new Date();

  if (!validateConfig()) return;

  // 1. Inisialisasi Label & Config
  var labels = initializeLabels();
  var stats = {
    total: 0,
    success: 0,
    error: 0,
    skipped: 0,
  };

  // 2. Search Email
  // Query: Belum ada label "Bot-Processed"
  var query = "-label:" + CONFIG.PROCESSED_LABEL;

  // Search threads (default return newest first)
  // Kita perlu memproses yang LAMA dulu, tapi GmailApp.search tidak punya sort order parameter
  // Solusi: Ambil batch yang lebih besar, lalu reverse array
  // NOTE: GmailApp limit 500 threads max per search
  var threads = GmailApp.search(query, 0, 50);

  if (threads.length === 0) {
    logMessage("Tidak ada email untuk diproses.", "info");
    return;
  }

  // REVERSE untuk memproses email terlama dulu (sesuai request user)
  threads.reverse();

  // Limit sesuai BATCH_SIZE config
  var batchThreads = threads.slice(0, CONFIG.BATCH_SIZE);

  logMessage(
    "Ditemukan " +
      threads.length +
      " threads, memproses " +
      batchThreads.length +
      " terlama...",
    "info",
  );

  // 3. Loop Processing
  for (var i = 0; i < batchThreads.length; i++) {
    var thread = batchThreads[i];
    
    try {
      // Cek ulang label (untuk validasi double-check)
      var currentLabels = thread.getLabels();
      var alreadyProcessed = currentLabels.some(function (l) {
        return l.getName() === CONFIG.PROCESSED_LABEL;
      });

      if (alreadyProcessed) {
        logMessage(
          "[" +
            (i + 1) +
            "] Skip (sudah diproses): " +
            thread.getFirstMessageSubject(),
          "info",
        );
        stats.skipped++;
        continue;
      }

      // Ambil message pertama di thread
      var messages = thread.getMessages();
      var message = messages[0]; // Message pertama = message paling awal (root cause)

      var subject = message.getSubject();
      var from = message.getFrom();
      var date = message.getDate();
      var body = message.getPlainBody().substring(0, CONFIG.EMAIL_BODY_LIMIT); // Limit body

      logMessage(
        "\n[" +
          (i + 1) +
          "/" +
          batchThreads.length +
          "] Processing: " +
          subject,
        "info",
      );

      // 4. Classify with AI
      var classification = retryWithBackoff(
        function () {
          return classifyWithAI(subject, from, body, date);
        },
        3,
        1000,
      );

      logMessage(
        "Result: " +
          classification.category +
          (classification.subcategory
            ? " (" + classification.subcategory + ")"
            : ""),
        "success",
      );
      
      // 5. Execute Action
      executeAction(thread, message, classification, labels);

      stats.success++;

      // Anti rate-limit delay
      Utilities.sleep(CONFIG.API_DELAY_MS);
    } catch (error) {
      stats.error++;
      handleError(error, thread.getFirstMessageSubject());
      // Lanjut ke email berikutnya (graceful failure)
    }
  }

  // 6. Summary
  var duration = (new Date() - startTime) / 1000;
  logMessage("\n===== SUMMARY =====", "info");
  logMessage("Total Processed: " + stats.success, "success");
  logMessage("Errors: " + stats.error, "error");
  logMessage("Skipped: " + stats.skipped, "warning");
  logMessage("Duration: " + formatDuration(duration), "info");
  logMessage("===================", "info");
}

// ============================================================================
// AI ENGINE: CLASSIFIER
// ============================================================================

/**
 * Mengirim data email ke Openrouter AI untuk diklasifikasikan
 */
function classifyWithAI(subject, from, body, date) {
  var apiKey = getApiKey();

  // System Prompt V2: Lebih Strict, Anti-Halu, & Support New Categories
  var systemPrompt = `Kamu adalah sistem klasifikasi email otomatis yang sangat cerdas, detail, dan ketat.
Tugas utama: Mengkategorikan email untuk manajemen inbox yang bersih ("Zero Inbox").

KATEGORI & ATURAN:

1. **OTP_VERIFY** (Strict Cleanup!)
   - Definisi: HANYA email verifikasi yang punya BATAS WAKTU (expired).
   - Termasuk: Kode OTP (6 digit), Link verifikasi ("Verify email", "Confirm account"), Magic Link login.
   - PENTING: Jangan masukkan Security Alert di sini!

2. **NEWSLETTER** (Bersihkan!)
   - Definisi: Email marketing, promosi, "You might like", "Weekly Digest", rekomendasi produk.
   - Kata kunci: "Unsubscribe", "Promo", "Deal", "Diskon".

3. **PRIORITY** (Jangan dihapus!)
   - Definisi: Email yang MEMERLUKAN PERHATIAN USER atau ARSIP PENTING.
   - Subkategori:
     - "security": Security alert (Google/GitHub/FB), login alert, password changed.
     - "invoice": Tagihan, invoice berbayar (provider server, internet, dll).
     - "work": Notifikasi server (Render/Fly.io/AWS), error sistem, job application update.
     - "document": Tiket pesawat, booking hotel, dokumen legal.

4. **MARKETPLACE**
   - Definisi: Transaksi belanja online (Tokopedia, Shopee, Steam, Google Play Receipt).
   - Subkategori: "receipt" (bukti bayar), "shipping" (pengiriman).

5. **GENERAL** (Lain-lain)
   - Definisi: Email informatif biasa yang TIDAK expired dan BUKAN promosi sampah.
   - Termasuk: Welcome email (Onboarding), Notifikasi sosial media, Update Terms of Service (ToS), Informasi akun umum.

OUTPUT FORMAT (JSON):
{
  "category": "OTP_VERIFY|NEWSLETTER|PRIORITY|MARKETPLACE|GENERAL",
  "subcategory": "security|invoice|work|document|receipt|shipping|null",
  "confidence": 0.0-1.0,
  "reason": "Penjelasan singkat kenapa masuk kategori ini"
}`;

  // User Prompt
  var userPrompt = `Subject: ${subject}
From: ${from}
Date: ${date}

Body Preview:
${body}

Klasifikasikan!`;

  var payload = {
    model: CONFIG.OPENROUTER_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1, // Sangat strict
    response_format: { type: "json_object" },
  };

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + apiKey,
      "HTTP-Referer": "https://github.com/arenoe-studio/gmailsense",
      "X-Title": "GmailSense Classifier",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  // Call API
  var response = UrlFetchApp.fetch(CONFIG.OPENROUTER_API_URL, options);
  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(
      "Openrouter API Error (" + responseCode + "): " + responseText,
    );
  }

  var json = JSON.parse(responseText);
  var aiContent = json.choices[0].message.content;

  try {
    return JSON.parse(aiContent);
  } catch (e) {
    logMessage("Gagal parse JSON dari AI: " + aiContent, "error");
    return {
      category: "GENERAL",
      subcategory: null,
      confidence: 0.0,
      reason: "JSON Parse Error",
    };
  }
}

/**
 * Eksekusi aksi berdasarkan hasil klasifikasi
 */
function executeAction(thread, message, classification, labels) {
  var category = classification.category;
  var subcategory = classification.subcategory;

  // Dispatch Action
  switch (category) {
    case "NEWSLETTER":
      handleNewsletter(thread, message, labels.newsletter);
      break;

    case "OTP_VERIFY": // Nama kategori baru
      handleOTP(thread);
      break;

    case "MARKETPLACE":
      handleMarketplace(thread, subcategory, labels.marketplace);
      break;

    case "PRIORITY":
      handlePriority(thread, subcategory, labels.important); // Use 'important' label variable (mapped to Priority)
      break;

    case "GENERAL":
      handleGeneral(thread, labels.general);
      break;

    default: // Fallback ke General jika AI halu kategori aneh
      handleGeneral(thread, labels.general);
  }

  // Finalize: Tandai Bot-Processed
  try {
    thread.addLabel(labels.processed);
  } catch (e) {
    logMessage("Gagal menambah label processed: " + e.toString(), "warning");
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

function handleNewsletter(thread, message, label) {
  if (label) thread.addLabel(label);
  
  // Mark Read (Supaya inbox tidak tebal)
  thread.markRead();

  // Cek umur
  var messageDate = message.getDate();
  var ageInDays = (new Date() - messageDate) / (1000 * 60 * 60 * 24);
  
  if (ageInDays > CONFIG.NEWSLETTER_AGE_DAYS) {
    thread.moveToTrash();
    logMessage('Newsletter tua (' + ageInDays.toFixed(1) + ' hari) -> Trash', 'warning');
  } else {
    logMessage('Newsletter baru -> Label & Read', 'info');
  }
}

function handleOTP(thread) {
  // Langsung hapus karena time-sensitive dan dianggap sudah expired/digunakan
  thread.moveToTrash();
  logMessage('OTP/Verify Link -> Trash immediately', 'warning');
}

function handleMarketplace(thread, subcategory, mainLabel) {
  if (mainLabel) thread.addLabel(mainLabel);
  
  // Mark Read (Kecuali user ingin receipts tetap unread, tapi biasanya receipts cukup diarsip/read)
  thread.markRead();
  
  if (subcategory && CONFIG.MARKETPLACE_SUBLABELS[subcategory]) {
    var subLabelName = CONFIG.MARKETPLACE_SUBLABELS[subcategory];
    var subLabel = getOrCreateLabel(subLabelName);
    if (subLabel) thread.addLabel(subLabel);
  }
  logMessage('Marketplace -> Label & Read', 'info');
}

function handlePriority(thread, subcategory, mainLabel) {
  if (mainLabel) thread.addLabel(mainLabel);
  
  // KEEP UNREAD! Ini penting.
  thread.markUnread(); 
  
  if (subcategory && CONFIG.IMPORTANT_SUBLABELS[subcategory]) {
    var subLabelName = CONFIG.IMPORTANT_SUBLABELS[subcategory];
    var subLabel = getOrCreateLabel(subLabelName);
    if (subLabel) thread.addLabel(subLabel);
  }
  logMessage('Priority -> Label & Keep Unread', 'info');
}

function handleGeneral(thread, label) {
  if (label) thread.addLabel(label);
  
  // Mark Read (Info umum tidak perlu menuhin notifikasi unread)
  thread.markRead();
  
  logMessage('General -> Label & Read', 'info');
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getOrCreateLabel(labelName) {
  try {
    if (!labelName || typeof labelName !== "string" || labelName.trim() === "") {
      return null;
    }
    var label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      label = GmailApp.createLabel(labelName);
      logMessage("✓ Label baru dibuat: " + labelName, "success");
    }
    return label;
  } catch (error) {
    logMessage('✗ Error membuat/mengambil label "' + labelName + '": ' + error.toString(), "error");
    return null;
  }
}

function getApiKey() {
  var apiKey = PropertiesService.getScriptProperties().getProperty("OPENROUTER_KEY");
  if (!apiKey) throw new Error("API key tidak ditemukan!");
  return apiKey;
}

function setupApiKey() {
  var apiKey = "YOUR_API_KEY_HERE";
  PropertiesService.getScriptProperties().setProperty("OPENROUTER_KEY", apiKey);
  Logger.log("✓ API key berhasil disimpan!");
}

function logMessage(message, type) {
  type = type || "info";
  var prefix = { info: "ℹ", success: "✓", error: "✗", warning: "⚠" };
  Logger.log((prefix[type] || "") + " " + message);
}

function formatDuration(seconds) {
  if (seconds < 60) return seconds.toFixed(1) + "s";
  var minutes = Math.floor(seconds / 60);
  var remainingSeconds = Math.floor(seconds % 60);
  return minutes + "m " + remainingSeconds + "s";
}

function validateConfig() {
  try {
    getApiKey();
    if (!CONFIG.OPENROUTER_MODEL) throw new Error("Model Openrouter belum dikonfigurasi!");
    logMessage("Konfigurasi valid", "success");
    return true;
  } catch (error) {
    logMessage("Validasi konfigurasi gagal: " + error.toString(), "error");
    return false;
  }
}

function handleError(error, context) {
  var errorMessage = "Error";
  if (context) errorMessage += " [" + context + "]";
  errorMessage += ": " + error.toString();
  if (error.stack) errorMessage += "\nStack: " + error.stack;
  logMessage(errorMessage, "error");
}

function retryWithBackoff(fn, maxRetries, initialDelay) {
  maxRetries = maxRetries || 3;
  initialDelay = initialDelay || 1000;
  for (var i = 0; i < maxRetries; i++) {
    try {
      return fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      var delay = initialDelay * Math.pow(2, i);
      Utilities.sleep(delay);
    }
  }
}

function initializeLabels() {
  logMessage("Menginisialisasi labels...", "info");
  var labels = {
    processed: getOrCreateLabel(CONFIG.PROCESSED_LABEL),
    newsletter: getOrCreateLabel(CONFIG.NEWSLETTER_LABEL),
    marketplace: getOrCreateLabel(CONFIG.MARKETPLACE_LABEL),
    important: getOrCreateLabel(CONFIG.IMPORTANT_LABEL),
    general: getOrCreateLabel(CONFIG.GENERAL_LABEL), // Label baru
  };
  for (var key in CONFIG.MARKETPLACE_SUBLABELS) getOrCreateLabel(CONFIG.MARKETPLACE_SUBLABELS[key]);
  for (var key in CONFIG.IMPORTANT_SUBLABELS) getOrCreateLabel(CONFIG.IMPORTANT_SUBLABELS[key]);
  logMessage("Semua labels siap", "success");
  return labels;
}

// ============================================================================
// MONITORING & STATS
// ============================================================================

/**
 * Menampilkan statistik jumlah email per label
 */
function showStats() {
  var stats = {
    processed: GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL),
    newsletter: GmailApp.getUserLabelByName(CONFIG.NEWSLETTER_LABEL),
    marketplace: GmailApp.getUserLabelByName(CONFIG.MARKETPLACE_LABEL),
    priority: GmailApp.getUserLabelByName(CONFIG.IMPORTANT_LABEL), // Priority
    general: GmailApp.getUserLabelByName(CONFIG.GENERAL_LABEL)
  };

  Logger.log("===== STATISTIK LABEL =====");

  for (var key in stats) {
    if (stats[key]) {
      var count = stats[key].getThreads().length;
      Logger.log(key.toUpperCase() + ": " + count + " threads");
    } else {
      Logger.log(key.toUpperCase() + ": Label '" + key + "' belum ada");
    }
  }
  
  // Cek Trash count tidak bisa langsung via API
  Logger.log("===========================");
  Logger.log("Tip: Run processEmails() untuk memproses batch berikutnya.");
}
