let currentEntries = [];
let selectedDate = new Date().toISOString().slice(0,10);
let currentUser = null;

const fileInput = document.getElementById('barcodeFile');
const previewDiv = document.getElementById('imagePreview');
const extractPanel = document.getElementById('extractPanel');
const barcodeInput = document.getElementById('barcodeInput');
const datePicker = document.getElementById('datePicker');
const addBtn = document.getElementById('addEntryBtn');
const tableBody = document.getElementById('tableBody');
const counterBadge = document.getElementById('counterBadge');
const scanMessage = document.getElementById('scanMessage');
const clearBtn = document.getElementById('clearTableBtn');
const downloadBtn = document.getElementById('downloadExcelBtn');
const userDisplay = document.getElementById('userDisplay');
const excelUserName = document.getElementById('excelUserName');
const videoElem = document.getElementById('videoPreview');
let codeReader = null;
let pauseScan = false;
let audioCtx = null;

// Email recipient for exports
const EXPORT_EMAIL = 'joe.abiramia@totersapp.com';

function playBeep() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume audio context if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = 800;
    g.gain.value = 0.02;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    setTimeout(() => { o.stop(); }, 120);
  } catch (e) {
    // ignore audio errors
  }
}

// Clean up audio context when page is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden && audioCtx) {
    audioCtx.suspend();
  } else if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
});

function checkAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    window.location.href = '/login.html';
    return false;
  }
  
  try {
    currentUser = JSON.parse(user);
    if (userDisplay) {
      userDisplay.textContent = `Welcome, ${currentUser.name || currentUser.username}`;
    }
    if (excelUserName) {
      excelUserName.textContent = currentUser.name || currentUser.username;
    }
    
    // Show admin link if user is admin
    const adminLink = document.getElementById('adminLink');
    if (adminLink && currentUser.role === 'admin') {
      adminLink.style.display = 'inline-block';
    }
    
    return true;
  } catch (e) {
    console.error('Error parsing user data:', e);
    logout();
    return false;
  }
}

function startCameraScan() {
  if (!videoElem) return;
  
  // Stop any existing scan
  stopCameraScan();
  
  try {
    if (typeof ZXing === 'undefined') {
      setMessage('Barcode scanner library not loaded', 'error');
      return;
    }
    
    codeReader = new ZXing.BrowserMultiFormatReader();
    codeReader.listVideoInputDevices().then((videoInputDevices) => {
      // try to pick a rear-facing camera by looking for common keywords
      let deviceId;
      if (videoInputDevices && videoInputDevices.length) {
        const rear = videoInputDevices.find(d => /back|rear|environment/i.test(d.label));
        deviceId = (rear || videoInputDevices[0]).deviceId;
        console.log('Selected camera:', rear ? 'rear' : 'front', videoInputDevices[0].label);
      }

      // Start decoding
      codeReader.decodeFromVideoDevice(deviceId, videoElem, (result, err) => {
        if (result && !pauseScan) {
          pauseScan = true;
          const text = result.getText();
          if (barcodeInput) barcodeInput.value = text;
          if (datePicker) datePicker.value = selectedDate;
          if (extractPanel) {
            extractPanel.style.display = 'block';
            ensureAddBtnListener();
          }
          playBeep();
          // vibration on supported devices
          if (navigator.vibrate) { 
            try { navigator.vibrate(160); } catch(e){} 
          }
          setMessage('✅ Barcode detected (camera)', 'ok');
          setTimeout(() => { pauseScan = false; }, 1500);
        }
        
        // Log errors only if they're not "No MultiFormat Readers were able to detect the code"
        if (err && !err.message?.includes('No MultiFormat Readers')) {
          console.debug('Camera scan error:', err.message);
        }
      }).catch(err => {
        setMessage('Camera scanning failed: ' + (err.message || err), 'error');
      });
    }).catch(err => {
      setMessage('No camera devices found: ' + err.message, 'error');
      // Fall back to file upload mode
      if (fileInput) {
        setMessage('Using file upload mode (no camera detected)', 'ok');
      }
    });
  } catch (e) {
    setMessage('Camera scanner init error: ' + (e.message || e), 'error');
  }
}

function stopCameraScan() {
  try {
    if (codeReader) {
      codeReader.reset();
      codeReader = null;
    }
  } catch (e) {
    // ignore
  }
}

// Clean up camera on page unload
window.addEventListener('beforeunload', stopCameraScan);

async function fetchUserEntries() {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch('/api/entries', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const entries = await response.json();
      currentEntries = entries.map(entry => ({
        barcode: entry.barcode,
        date: entry.date,
        user: entry.userName || entry.user
      }));
      renderTable();
    } else if (response.status === 401 || response.status === 403) {
      logout();
    } else {
      console.error('Failed to fetch entries:', response.status);
    }
  } catch (error) {
    console.error('Error fetching entries:', error);
    setMessage('Failed to load entries from server', 'error');
  }
}

async function saveEntry(barcode, date) {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch('/api/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ barcode, date })
    });
    
    if (response.ok) {
      return true;
    } else if (response.status === 401 || response.status === 403) {
      logout();
      return false;
    } else {
      const error = await response.json();
      console.error('Save entry error:', error);
      return false;
    }
  } catch (error) {
    console.error('Error saving entry:', error);
    return false;
  }
}

async function clearUserEntries() {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch('/api/entries', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      return true;
    } else if (response.status === 401 || response.status === 403) {
      logout();
      return false;
    } else {
      const error = await response.json();
      console.error('Clear entries error:', error);
      return false;
    }
  } catch (error) {
    console.error('Error clearing entries:', error);
    return false;
  }
}

function renderTable() {
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  if (currentEntries.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#9aaebf; padding:1.5rem;">— no entries yet —</td></tr>`;
  } else {
    // Use DocumentFragment for better performance with many entries
    const fragment = document.createDocumentFragment();
    
    currentEntries.forEach((entry) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${escapeHtml(entry.barcode) || '—'}</td>
                      <td>${escapeHtml(entry.date) || '—'}</td>
                      <td>${escapeHtml(entry.user) || '—'}</td>`;
      fragment.appendChild(row);
    });
    
    tableBody.appendChild(fragment);
  }
  
  if (counterBadge) {
    counterBadge.innerText = `${currentEntries.length} entry${currentEntries.length !== 1 ? 's' : ''}`;
  }
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  // More comprehensive HTML escaping
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/`/g, "&#96;");
}

function setMessage(text, type = 'error') {
  if (!scanMessage) return;
  
  // Clear previous message
  scanMessage.innerHTML = '';
  
  if (!text) return;
  
  const div = document.createElement('div');
  div.className = 'msg ' + (type === 'ok' ? 'ok' : '');
  
  if (type === 'loading') {
    div.innerHTML = '<span class="spinner"></span>' + escapeHtml(text);
  } else {
    div.innerText = text;
  }
  
  scanMessage.appendChild(div);
  
  // Auto-clear success messages after 3 seconds
  if (type === 'ok') {
    setTimeout(() => {
      if (scanMessage.innerHTML === div.outerHTML) {
        scanMessage.innerHTML = '';
      }
    }, 3000);
  }
}

function setPreviewPlaceholder() {
  if (previewDiv) {
    previewDiv.innerHTML = '<span style="color:#7c8b9c;">preview will appear here</span>';
  }
}

function resetForNextScan() {
  if (fileInput) fileInput.value = '';
  setPreviewPlaceholder();
  if (extractPanel) extractPanel.style.display = 'none';
  if (barcodeInput) barcodeInput.value = '';
  const today = new Date().toISOString().slice(0,10);
  selectedDate = today;
  if (datePicker) datePicker.value = today;
  setMessage('Ready for next image', 'ok');
}

async function scanBarcodeFromFile(file) {
  // Validate file type
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file');
  }
  
  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image too large (max 10MB)');
  }
  
  try {
    const codeReader = new ZXing.BrowserMultiFormatReader();
    const image = new Image();
    const imageUrl = URL.createObjectURL(file);

    return new Promise((resolve, reject) => {
      // Set timeout for image loading
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(imageUrl);
        reject(new Error('Image loading timeout'));
      }, 10000);
      
      image.onload = async () => {
        clearTimeout(timeout);
        try {
          const result = await codeReader.decodeFromImageElement(image);
          URL.revokeObjectURL(imageUrl);
          resolve(result.getText());
        } catch (e) {
          URL.revokeObjectURL(imageUrl);
          reject(new Error('No barcode found. Try a clearer image.'));
        } finally {
          codeReader.reset();
        }
      };
      
      image.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(imageUrl);
        reject(new Error('Failed to load image.'));
      };
      
      image.src = imageUrl;
    });
  } catch (err) {
    throw new Error('Scanner initialization failed: ' + err.message);
  }
}

// Debounce file selection to prevent race conditions
let fileSelectTimeout = null;
async function handleFileSelect(e) {
  // Clear any pending file selection
  if (fileSelectTimeout) {
    clearTimeout(fileSelectTimeout);
  }
  
  const file = e.target.files[0];

  if (!file) {
    setPreviewPlaceholder();
    if (extractPanel) extractPanel.style.display = 'none';
    return;
  }

  // Show preview
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (previewDiv) {
      previewDiv.innerHTML = `<img src="${ev.target.result}" alt="upload preview">`;
    }
  };
  reader.readAsDataURL(file);

  setMessage('Scanning barcode ...', 'loading');
  if (extractPanel) extractPanel.style.display = 'none';

  // Debounce to prevent multiple simultaneous scans
  fileSelectTimeout = setTimeout(async () => {
    try {
      const barcodeText = await scanBarcodeFromFile(file);
      setMessage('✅ Barcode detected!', 'ok');
      if (barcodeInput) barcodeInput.value = barcodeText;
      if (datePicker) datePicker.value = selectedDate;
      if (extractPanel) {
        extractPanel.style.display = 'block';
        ensureAddBtnListener();
      }
      playBeep();
      if (navigator.vibrate) { 
        try { navigator.vibrate(160); } catch(e){} 
      }
    } catch (error) {
      setMessage(error.message || 'Scan failed', 'error');
      if (barcodeInput) barcodeInput.value = '';
      if (extractPanel) extractPanel.style.display = 'block';
      if (datePicker) datePicker.value = selectedDate;
    }
    fileSelectTimeout = null;
  }, 100);
}

function handleDateChange(e) {
  selectedDate = e.target.value;
}

function validateBarcode(barcode) {
  // Basic barcode validation - at least 3 characters, alphanumeric
  return barcode && barcode.length >= 3 && /^[A-Za-z0-9\-]+$/.test(barcode);
}

async function handleAddEntry() {
  console.debug('handleAddEntry called');
  
  const barcodeVal = barcodeInput ? barcodeInput.value.trim() : '';
  if (!barcodeVal) {
    setMessage('Please scan or enter a barcode value', 'error');
    return;
  }
  
  if (!validateBarcode(barcodeVal)) {
    setMessage('Invalid barcode format', 'error');
    return;
  }
  
  if (!selectedDate) {
    setMessage('Pick a date', 'error');
    return;
  }

  // Check for duplicates (optional)
  const isDuplicate = currentEntries.some(entry => 
    entry.barcode === barcodeVal && entry.date === selectedDate
  );
  
  if (isDuplicate) {
    if (!confirm('This barcode already exists for this date. Add anyway?')) {
      return;
    }
  }

  setMessage('Saving entry...', 'loading');

  const saved = await saveEntry(barcodeVal, selectedDate);
  
  if (saved) {
    console.debug('entry saved, pushing locally');
    currentEntries.push({ 
      barcode: barcodeVal, 
      date: selectedDate,
      user: currentUser.name || currentUser.username 
    });
    renderTable();
    setMessage(`Row added (${barcodeVal}) · ready for next`, 'ok');
    resetForNextScan();
  } else {
    setMessage('Failed to save entry', 'error');
  }
}

async function handleClearTable() {
  if (currentEntries.length === 0) {
    setMessage('No entries to clear', 'error');
    return;
  }
  
  if (!confirm(`Clear all ${currentEntries.length} entries?`)) {
    return;
  }
  
  setMessage('Clearing entries...', 'loading');
  
  const cleared = await clearUserEntries();
  if (cleared) {
    currentEntries = [];
    renderTable();
    setMessage('All entries cleared', 'ok');
  } else {
    setMessage('Failed to clear entries', 'error');
  }
}

function showEmailBanner(text) {
  const b = document.getElementById('emailBanner');
  if (!b) return;
  b.textContent = text;
  b.style.display = 'block';
  setTimeout(() => { b.style.display = 'none'; }, 3000);
}

async function handleDownload() {
  console.debug('handleDownload triggered');
  
  if (currentEntries.length === 0) {
    setMessage('No data to export', 'error');
    return;
  }

  // Prepare data for export
  const dataForExcel = currentEntries.map(entry => ({
    'Barcode': entry.barcode,
    'Date': entry.date,
    'Recorded By': entry.user,
    'User ID': currentUser.username || currentUser.email
  }));

  // Generate Excel file for local download
  const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'BarcodeLog');
  
  const filename = `barcodes_${currentUser.username || 'user'}_${new Date().toISOString().slice(0,10)}.xlsx`;
  
  try {
    XLSX.writeFile(workbook, filename);
    setMessage(`Downloaded ${currentEntries.length} rows`, 'ok');
  } catch (e) {
    console.error('Excel download failed:', e);
    setMessage('Failed to generate Excel file', 'error');
    return;
  }

  // Try to send email if recipient is configured
  if (EXPORT_EMAIL) {
    try {
      const token = localStorage.getItem('token');
      
      // Show email sending indicator
      setMessage('Sending email...', 'loading');
      
      const response = await fetch('/api/send-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          entries: currentEntries,
          user: {
            name: currentUser.name || currentUser.username,
            email: currentUser.email,
            username: currentUser.username
          },
          recipient: EXPORT_EMAIL,
          filename: filename
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage(`✅ Email sent to ${EXPORT_EMAIL}`, 'ok');
        showEmailBanner('Email sent successfully');
      } else {
        // Email failed but download already succeeded, so just show warning
        console.warn('Email failed but download succeeded:', data);
        setMessage(`Downloaded, but email failed: ${data.error || 'Unknown error'}`, 'ok');
        showEmailBanner('Email delivery failed, but file downloaded');
      }
    } catch (e) {
      // Network error but download already succeeded
      console.error('Email request failed:', e);
      setMessage('Downloaded, but email failed (network error)', 'ok');
      showEmailBanner('Network error - email not sent');
    }
  }
}

function logout() {
  // Clean up resources
  stopCameraScan();
  
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

// ensure add button always has listener attached
function ensureAddBtnListener() {
  if (!addBtn) return;
  // Remove any existing listeners to prevent duplicates
  addBtn.removeEventListener('click', handleAddEntry);
  addBtn.addEventListener('click', handleAddEntry);
}

async function init() {
  console.log('Initializing app...');
  
  if (!checkAuth()) return;
  
  // Set today's date
  if (datePicker) {
    datePicker.value = selectedDate;
  }
  
  // Load existing entries
  await fetchUserEntries();
  
  // Set up UI
  setPreviewPlaceholder();
  
  // Start camera if available
  if (videoElem) {
    startCameraScan();
  }
  
  // File input handling
  if (fileInput) {
    fileInput.addEventListener('click', () => { 
      fileInput.value = ''; 
    });
    fileInput.addEventListener('change', handleFileSelect);
  }
  
  // Date picker
  if (datePicker) {
    datePicker.addEventListener('change', handleDateChange);
  }
  
  // Add button
  ensureAddBtnListener();
  
  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', handleClearTable);
  }
  
  // Download button
  if (downloadBtn) {
    downloadBtn.addEventListener('click', handleDownload);
  }
  
  // Logout button (if exists)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
  
  console.log('App initialized successfully');
}

// Make logout function available globally
window.logout = logout;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}