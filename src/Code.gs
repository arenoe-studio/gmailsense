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
  OPENROUTER_MODEL: "meta-llama/llama-3.1-8b-instruct:free", // Ganti sesuai kebutuhan

  // Processing Settings
  BATCH_SIZE: 20, // Jumlah email per run
  EMAIL_BODY_LIMIT: 300, // Karakter body yang diambil untuk AI
  NEWSLETTER_AGE_DAYS: 7, // Hapus newsletter lebih dari X hari
  API_DELAY_MS: 500, // Delay antar API call (rate limiting)

  // Label Names
  PROCESSED_LABEL: "Bot-Processed",
  NEWSLETTER_LABEL: "Newsletter",
  MARKETPLACE_LABEL: "Marketplace",
  IMPORTANT_LABEL: "Penting",

  // Marketplace Detection Patterns (domain/sender keywords)
  MARKETPLACE_PATTERNS: [
    "tokopedia",
    "shopee",
    "lazada",
    "bukalapak",
    "blibli",
    "jd.id",
    "zalora",
    "sociolla",
    "orami",
  ],

  // Subcategory Mapping
  MARKETPLACE_SUBLABELS: {
    invoice: "Marketplace/Invoice",
    shipping: "Marketplace/Shipping",
    receipt: "Marketplace/Receipt",
  },

  IMPORTANT_SUBLABELS: {
    invoice: "Penting/Invoice",
    booking: "Penting/Booking",
    shipping: "Penting/Shipping",
    document: "Penting/Document",
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Mendapatkan atau membuat label Gmail
 * @param {string} labelName - Nama label yang akan dibuat/diambil
 * @return {GmailLabel} Label object
 */
function getOrCreateLabel(labelName) {
  try {
    if (
      !labelName ||
      typeof labelName !== "string" ||
      labelName.trim() === ""
    ) {
      logMessage("⚠ Skip label invalid (kosong/null)", "warning");
      return null;
    }

    var label = GmailApp.getUserLabelByName(labelName);

    if (!label) {
      label = GmailApp.createLabel(labelName);
      logMessage("✓ Label baru dibuat: " + labelName, "success");
    }

    return label;
  } catch (error) {
    logMessage(
      '✗ Error membuat/mengambil label "' +
        labelName +
        '": ' +
        error.toString(),
      "error",
    );
    // Jangan throw error agar tidak mematikan seluruh proses, return null saja
    return null;
  }
}

/**
 * Mendapatkan API key dari Properties Service
 * @return {string} API key
 */
function getApiKey() {
  var apiKey =
    PropertiesService.getScriptProperties().getProperty("OPENROUTER_KEY");

  if (!apiKey) {
    throw new Error(
      "API key tidak ditemukan! Jalankan setupApiKey() terlebih dahulu.",
    );
  }

  return apiKey;
}

/**
 * Setup API key (jalankan sekali saat pertama kali)
 * Ganti 'YOUR_API_KEY_HERE' dengan API key asli dari Openrouter
 */
function setupApiKey() {
  var apiKey = "YOUR_API_KEY_HERE"; // GANTI INI!

  PropertiesService.getScriptProperties().setProperty("OPENROUTER_KEY", apiKey);
  Logger.log("✓ API key berhasil disimpan!");
  Logger.log("Sekarang Anda bisa menjalankan processEmails()");
}

/**
 * Cek apakah sender adalah marketplace
 * @param {string} from - Email sender
 * @return {boolean} True jika marketplace
 */
function isMarketplace(from) {
  var fromLower = from.toLowerCase();

  for (var i = 0; i < CONFIG.MARKETPLACE_PATTERNS.length; i++) {
    if (fromLower.indexOf(CONFIG.MARKETPLACE_PATTERNS[i]) !== -1) {
      return true;
    }
  }

  return false;
}

/**
 * Log dengan format yang rapi
 * @param {string} message - Pesan log
 * @param {string} type - Tipe log: 'info', 'success', 'error', 'warning'
 */
function logMessage(message, type) {
  type = type || "info";

  var prefix = {
    info: "ℹ",
    success: "✓",
    error: "✗",
    warning: "⚠",
  };

  Logger.log((prefix[type] || "") + " " + message);
}

/**
 * Format durasi dalam detik ke format yang lebih readable
 * @param {number} seconds - Durasi dalam detik
 * @return {string} Formatted duration
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return seconds.toFixed(1) + "s";
  } else {
    var minutes = Math.floor(seconds / 60);
    var remainingSeconds = Math.floor(seconds % 60);
    return minutes + "m " + remainingSeconds + "s";
  }
}

/**
 * Validasi konfigurasi sebelum memproses
 * @return {boolean} True jika konfigurasi valid
 */
function validateConfig() {
  try {
    // Cek API key
    getApiKey();

    // Cek konfigurasi dasar
    if (!CONFIG.OPENROUTER_MODEL) {
      throw new Error("Model Openrouter belum dikonfigurasi!");
    }

    if (CONFIG.BATCH_SIZE < 1 || CONFIG.BATCH_SIZE > 100) {
      throw new Error("BATCH_SIZE harus antara 1-100");
    }

    logMessage("Konfigurasi valid", "success");
    return true;
  } catch (error) {
    logMessage("Validasi konfigurasi gagal: " + error.toString(), "error");
    return false;
  }
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Handle error dengan logging detail
 * @param {Error} error - Error object
 * @param {string} context - Konteks error (misal: email subject)
 */
function handleError(error, context) {
  var errorMessage = "Error";

  if (context) {
    errorMessage += " [" + context + "]";
  }

  errorMessage += ": " + error.toString();

  // Log stack trace jika ada
  if (error.stack) {
    errorMessage += "\nStack: " + error.stack;
  }

  logMessage(errorMessage, "error");
}

/**
 * Retry function dengan exponential backoff
 * @param {Function} fn - Function yang akan di-retry
 * @param {number} maxRetries - Maksimal retry
 * @param {number} initialDelay - Initial delay dalam ms
 * @return {*} Result dari function
 */
function retryWithBackoff(fn, maxRetries, initialDelay) {
  maxRetries = maxRetries || 3;
  initialDelay = initialDelay || 1000;

  for (var i = 0; i < maxRetries; i++) {
    try {
      return fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error; // Throw jika sudah max retry
      }

      var delay = initialDelay * Math.pow(2, i);
      logMessage(
        "Retry " + (i + 1) + "/" + maxRetries + " setelah " + delay + "ms...",
        "warning",
      );
      Utilities.sleep(delay);
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Inisialisasi semua label yang diperlukan
 * @return {Object} Object berisi semua label
 */
function initializeLabels() {
  logMessage("Menginisialisasi labels...", "info");

  var labels = {
    processed: getOrCreateLabel(CONFIG.PROCESSED_LABEL),
    newsletter: getOrCreateLabel(CONFIG.NEWSLETTER_LABEL),
    marketplace: getOrCreateLabel(CONFIG.MARKETPLACE_LABEL),
    important: getOrCreateLabel(CONFIG.IMPORTANT_LABEL),
  };

  // Create sublabels untuk marketplace
  for (var key in CONFIG.MARKETPLACE_SUBLABELS) {
    getOrCreateLabel(CONFIG.MARKETPLACE_SUBLABELS[key]);
  }

  // Create sublabels untuk important
  for (var key in CONFIG.IMPORTANT_SUBLABELS) {
    getOrCreateLabel(CONFIG.IMPORTANT_SUBLABELS[key]);
  }

  logMessage("Semua labels siap", "success");
  return labels;
}

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
    var threadId = thread.getId();

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
      // logMessage('From: ' + from, 'info');

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
      logMessage("Reason: " + classification.reason, "info");

      // 5. Execute Action (FASE 4 - Placeholder)
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

  // System Prompt: Brain dari classifier ini
  var systemPrompt = `Kamu adalah sistem klasifikasi email otomatis yang cerdas dan ketat.
Tugasmu adalah menganalisis email dan mengkategorikannya ke dalam salah satu kategori berikut:

1. **NEWSLETTER**
   - Definisi: Email marketing, promosi sales, buletin berita, info produk baru.
   - Kata kunci: "diskon", "promo", "penawaran", "newsletter", "unsubscribe".

2. **OTP** (Sangat Ketat!)
   - Definisi: HANYA kode verifikasi sementara, kode OTP (6 digit), link aktivasi sekali pakai, akses login sementara.
   - PENTING: Konfirmasi perubahan password, notifikasi login dari device baru, peringatan keamanan akun BUKAN OTP (masuk ke BIASA/PENTING).
   - Kata kunci: "kode verifikasi", "kode OTP", "login code", "verification code".

3. **MARKETPLACE**
   - Definisi: Email transaksional dari e-commerce (Tokopedia, Shopee, Lazada, Bukalapak, Tiket.com, Traveloka, dll).
   - Jenis: Invoice pembelian, resi pengiriman, konfirmasi pembayaran.

4. **PENTING**
   - Definisi: Dokumen penting, kontrak kerja, tagihan/invoice (NON-marketplace), tiket pesawat/hotel (direct booking), surat resmi instansi.
   - Jika ragu, masukkan ke BIASA.

5. **BIASA**
   - Definisi: Email personal, percakapan tim, notifikasi sosial media, update sistem umum, notifikasi keamanan akun, konfirmasi ganti password.

OUTPUT FORMAT (Wajib JSON valid):
{
  "category": "NEWSLETTER|OTP|MARKETPLACE|PENTING|BIASA",
  "subcategory": "invoice|shipping|receipt|booking|document|null",
  "confidence": 0.0-1.0,
  "reason": "Penjelasan singkat max 10 kata"
}`;

  // User Prompt: Data email yang akan dianalisis
  var userPrompt = `Subject: ${subject}
From: ${from}
Date: ${date}

Body Preview:
${body}

Klasifikasikan email ini!`;

  var payload = {
    model: CONFIG.OPENROUTER_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1, // Rendah agar konsisten
    response_format: { type: "json_object" }, // Force JSON mode
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

  // Parse JSON Result
  try {
    return JSON.parse(aiContent);
  } catch (e) {
    logMessage("Gagal parse JSON dari AI: " + aiContent, "error");
    // Fallback
    return {
      category: "BIASA",
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

  // 1. Handle berdasarkan kategori
  switch (category) {
    case "NEWSLETTER":
      handleNewsletter(thread, message, labels.newsletter);
      break;

    case "OTP":
      handleOTP(thread);
      break;

    case "MARKETPLACE":
      handleMarketplace(thread, subcategory, labels.marketplace);
      break;

    case "PENTING":
      handleImportant(thread, subcategory, labels.important);
      break;

    case "BIASA":
      // Tidak ada aksi khusus, biarkan di inbox tanpa label
      logMessage("Kategori BIASA (no action)", "info");
      break;

    default:
      logMessage("Kategori tidak dikenal: " + category, "warning");
  }

  // 2. Tandai sudah diproses (jika belum kehapus)
  // Perlu cek apakah thread masih ada di inbox/trash (belum deleted permanently)
  try {
    thread.addLabel(labels.processed);
  } catch (e) {
    // Thread mungkin sudah dihapus permanen (jarang terjadi di script ini karena kita pakai moveToTrash)
    // Atau error lain
    logMessage("Gagal menambah label processed: " + e.toString(), "warning");
  }
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

/**
 * Handle Newsletter: Label + Hapus jika tua
 */
function handleNewsletter(thread, message, label) {
  // Labeling
  thread.addLabel(label);

  // Cek umur
  var messageDate = message.getDate();
  var ageInDays = (new Date() - messageDate) / (1000 * 60 * 60 * 24);

  if (ageInDays > CONFIG.NEWSLETTER_AGE_DAYS) {
    thread.moveToTrash();
    logMessage(
      "Newsletter tua (" + ageInDays.toFixed(1) + " hari) -> Trash",
      "warning",
    );
  } else {
    logMessage("Newsletter baru -> Label only", "info");
  }
}

/**
 * Handle OTP: Langsung ke Trash
 */
function handleOTP(thread) {
  thread.moveToTrash();
  logMessage("OTP detected -> Trash immediately", "warning");
}

/**
 * Handle Marketplace: Label + Sublabel
 */
function handleMarketplace(thread, subcategory, mainLabel) {
  thread.addLabel(mainLabel);

  if (subcategory && CONFIG.MARKETPLACE_SUBLABELS[subcategory]) {
    var subLabelName = CONFIG.MARKETPLACE_SUBLABELS[subcategory];
    var subLabel = getOrCreateLabel(subLabelName);
    thread.addLabel(subLabel);
    logMessage("Marketplace: " + subcategory, "info");
  } else {
    logMessage("Marketplace (General)", "info");
  }
}

/**
 * Handle Important: Label + Sublabel
 */
function handleImportant(thread, subcategory, mainLabel) {
  thread.addLabel(mainLabel);

  if (subcategory && CONFIG.IMPORTANT_SUBLABELS[subcategory]) {
    var subLabelName = CONFIG.IMPORTANT_SUBLABELS[subcategory];
    var subLabel = getOrCreateLabel(subLabelName);
    thread.addLabel(subLabel);
    logMessage("Penting: " + subcategory, "info");
  } else {
    logMessage("Penting (General)", "info");
  }
}

/**
 * Menampilkan statistik label (optional)
 */
function showStats() {
  var stats = {
    processed: GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL),
    newsletter: GmailApp.getUserLabelByName(CONFIG.NEWSLETTER_LABEL),
    marketplace: GmailApp.getUserLabelByName(CONFIG.MARKETPLACE_LABEL),
    important: GmailApp.getUserLabelByName(CONFIG.IMPORTANT_LABEL),
  };

  Logger.log("===== STATISTIK LABEL =====");

  for (var key in stats) {
    if (stats[key]) {
      var count = stats[key].getThreads().length;
      Logger.log(key.toUpperCase() + ": " + count + " threads");
    } else {
      Logger.log(key.toUpperCase() + ": Label belum ada");
    }
  }

  Logger.log("===========================");
}
