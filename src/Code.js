// ============================================================================
// GMAIL AUTO-CLASSIFIER BOT
// Mengklasifikasikan email Gmail otomatis menggunakan AI dari Openrouter
// ============================================================================

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // API Settings
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_MODEL: 'meta-llama/llama-3.1-8b-instruct:free', // Ganti sesuai kebutuhan
  
  // Processing Settings
  BATCH_SIZE: 20,              // Jumlah email per run
  EMAIL_BODY_LIMIT: 300,       // Karakter body yang diambil untuk AI
  NEWSLETTER_AGE_DAYS: 7,      // Hapus newsletter lebih dari X hari
  API_DELAY_MS: 500,           // Delay antar API call (rate limiting)
  
  // Label Names
  PROCESSED_LABEL: 'Bot-Processed',
  NEWSLETTER_LABEL: 'Newsletter',
  MARKETPLACE_LABEL: 'Marketplace',
  IMPORTANT_LABEL: 'Penting',
  
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
    'orami'
  ],
  
  // Subcategory Mapping
  MARKETPLACE_SUBLABELS: {
    invoice: 'Marketplace/Invoice',
    shipping: 'Marketplace/Shipping',
    receipt: 'Marketplace/Receipt'
  },
  
  IMPORTANT_SUBLABELS: {
    invoice: 'Penting/Invoice',
    booking: 'Penting/Booking',
    shipping: 'Penting/Shipping',
    document: 'Penting/Document'
  }
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
    var label = GmailApp.getUserLabelByName(labelName);
    
    if (!label) {
      label = GmailApp.createLabel(labelName);
      Logger.log('✓ Label baru dibuat: ' + labelName);
    }
    
    return label;
  } catch (error) {
    Logger.log('✗ Error membuat/mengambil label "' + labelName + '": ' + error.toString());
    throw error;
  }
}

/**
 * Mendapatkan API key dari Properties Service
 * @return {string} API key
 */
function getApiKey() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('OPENROUTER_KEY');
  
  if (!apiKey) {
    throw new Error('API key tidak ditemukan! Jalankan setupApiKey() terlebih dahulu.');
  }
  
  return apiKey;
}

/**
 * Setup API key (jalankan sekali saat pertama kali)
 * Ganti 'YOUR_API_KEY_HERE' dengan API key asli dari Openrouter
 */
function setupApiKey() {
  var apiKey = 'YOUR_API_KEY_HERE'; // GANTI INI!
  
  PropertiesService.getScriptProperties().setProperty('OPENROUTER_KEY', apiKey);
  Logger.log('✓ API key berhasil disimpan!');
  Logger.log('Sekarang Anda bisa menjalankan processEmails()');
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
  type = type || 'info';
  
  var prefix = {
    'info': 'ℹ',
    'success': '✓',
    'error': '✗',
    'warning': '⚠'
  };
  
  Logger.log((prefix[type] || '') + ' ' + message);
}

/**
 * Format durasi dalam detik ke format yang lebih readable
 * @param {number} seconds - Durasi dalam detik
 * @return {string} Formatted duration
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return seconds.toFixed(1) + 's';
  } else {
    var minutes = Math.floor(seconds / 60);
    var remainingSeconds = Math.floor(seconds % 60);
    return minutes + 'm ' + remainingSeconds + 's';
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
      throw new Error('Model Openrouter belum dikonfigurasi!');
    }
    
    if (CONFIG.BATCH_SIZE < 1 || CONFIG.BATCH_SIZE > 100) {
      throw new Error('BATCH_SIZE harus antara 1-100');
    }
    
    logMessage('Konfigurasi valid', 'success');
    return true;
    
  } catch (error) {
    logMessage('Validasi konfigurasi gagal: ' + error.toString(), 'error');
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
  var errorMessage = 'Error';
  
  if (context) {
    errorMessage += ' [' + context + ']';
  }
  
  errorMessage += ': ' + error.toString();
  
  // Log stack trace jika ada
  if (error.stack) {
    errorMessage += '\nStack: ' + error.stack;
  }
  
  logMessage(errorMessage, 'error');
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
      logMessage('Retry ' + (i + 1) + '/' + maxRetries + ' setelah ' + delay + 'ms...', 'warning');
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
  logMessage('Menginisialisasi labels...', 'info');
  
  var labels = {
    processed: getOrCreateLabel(CONFIG.PROCESSED_LABEL),
    newsletter: getOrCreateLabel(CONFIG.NEWSLETTER_LABEL),
    marketplace: getOrCreateLabel(CONFIG.MARKETPLACE_LABEL),
    important: getOrCreateLabel(CONFIG.IMPORTANT_LABEL)
  };
  
  // Create sublabels untuk marketplace
  for (var key in CONFIG.MARKETPLACE_SUBLABELS) {
    getOrCreateLabel(CONFIG.MARKETPLACE_SUBLABELS[key]);
  }
  
  // Create sublabels untuk important
  for (var key in CONFIG.IMPORTANT_SUBLABELS) {
    getOrCreateLabel(CONFIG.IMPORTANT_SUBLABELS[key]);
  }
  
  logMessage('Semua labels siap', 'success');
  return labels;
}

// ============================================================================
// OPTIONAL: CUSTOM MENU (Uncomment untuk mengaktifkan)
// ============================================================================

/**
 * Membuat custom menu di Gmail
 * Uncomment function ini untuk menambahkan menu di Gmail UI
 */
/*
function onOpen() {
  GmailApp.createMenu('🤖 Email Classifier')
    .addItem('▶ Process Emails', 'processEmails')
    .addSeparator()
    .addItem('⚙ Setup API Key', 'setupApiKey')
    .addItem('📊 Show Stats', 'showStats')
    .addToUi();
}
*/

/**
 * Menampilkan statistik label (optional)
 */
function showStats() {
  var stats = {
    processed: GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL),
    newsletter: GmailApp.getUserLabelByName(CONFIG.NEWSLETTER_LABEL),
    marketplace: GmailApp.getUserLabelByName(CONFIG.MARKETPLACE_LABEL),
    important: GmailApp.getUserLabelByName(CONFIG.IMPORTANT_LABEL)
  };
  
  Logger.log('===== STATISTIK LABEL =====');
  
  for (var key in stats) {
    if (stats[key]) {
      var count = stats[key].getThreads().length;
      Logger.log(key.toUpperCase() + ': ' + count + ' threads');
    } else {
      Logger.log(key.toUpperCase() + ': Label belum ada');
    }
  }
  
  Logger.log('===========================');
}
