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
const pushMainBtn = document.getElementById('pushMainBtn');
const videoElem = document.getElementById('videoPreview');
let codeReader = null;
let pauseScan = false;
let audioCtx = null;
// --- Microsoft Graph / OneDrive push config ---
// Replace CLIENT_ID with your Azure AD app's client id, or call `setClientId()` at runtime.
let CLIENT_ID = null; // e.g. 'your-client-id-here'
const REDIRECT_URI = window.location.origin + '/dashboard.html';
const SCOPES = 'openid profile offline_access Files.ReadWrite.All';

function setClientId(id) {
  CLIENT_ID = id;
  localStorage.setItem('ms_client_id', id);
}

// Try load saved client id
if (!CLIENT_ID) {
  const saved = localStorage.getItem('ms_client_id');
  if (saved) CLIENT_ID = saved;
}

function playBeep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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

function checkAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    window.location.href = '/login.html';
    return false;
  }
  
  currentUser = JSON.parse(user);
  if (userDisplay) {
    userDisplay.textContent = `Welcome, ${currentUser.name}`;
  }
  if (excelUserName) {
    excelUserName.textContent = currentUser.name;
  }
  
  // Show admin link if user is admin
  const adminLink = document.getElementById('adminLink');
  if (adminLink && currentUser.role === 'admin') {
    adminLink.style.display = 'inline-block';
  }
  
  return true;
}

function startCameraScan() {
  if (!videoElem) return;
  try {
    codeReader = new ZXing.BrowserMultiFormatReader();
    codeReader.listVideoInputDevices().then((videoInputDevices) => {
      // try to pick a rear-facing camera by looking for common keywords
      let deviceId;
      if (videoInputDevices && videoInputDevices.length) {
        const rear = videoInputDevices.find(d => /back|rear|environment/i.test(d.label));
        deviceId = (rear || videoInputDevices[0]).deviceId;
      }

      // if the deviceId is undefined it will let the browser choose default
      try {
        codeReader.decodeFromVideoDevice(deviceId, videoElem, (result, err) => {
          if (result && !pauseScan) {
            pauseScan = true;
            const text = result.getText();
            if (barcodeInput) barcodeInput.value = text;
            if (datePicker) datePicker.value = selectedDate;
            if (extractPanel) extractPanel.style.display = 'block';
            try { playBeep(); } catch (e) {}
            // vibration is already included; make sure it runs on supported devices
            if (navigator.vibrate) { try { navigator.vibrate(160); } catch(e){} }
            setMessage('✅ Barcode detected (camera)', 'ok');
            setTimeout(() => { pauseScan = false; }, 1500);
          }
        });
      } catch (e) {
        setMessage('Camera scanning failed: ' + (e.message || e), 'error');
      }
    }).catch(err => {
      setMessage('No camera devices found: ' + err.message, 'error');
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
        user: entry.userName
      }));
      renderTable();
    } else if (response.status === 401 || response.status === 403) {
      logout();
    }
  } catch (error) {
    console.error('Error fetching entries:', error);
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
    }
    return false;
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
    }
    return false;
  } catch (error) {
    console.error('Error clearing entries:', error);
    return false;
  }
}

function renderTable() {
  tableBody.innerHTML = '';
  if (currentEntries.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#9aaebf; padding:1.5rem;">— no entries yet —</td></tr>`;
  } else {
    currentEntries.forEach((entry) => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${escapeHtml(entry.barcode) || '—'}</td>
                      <td>${escapeHtml(entry.date) || '—'}</td>
                      <td>${escapeHtml(entry.user) || '—'}</td>`;
      tableBody.appendChild(row);
    });
  }
  counterBadge.innerText = `${currentEntries.length} entry${currentEntries.length !== 1 ? 's' : ''}`;
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[&<>"']/g, function(m) {
    if(m === '&') return '&amp;';
    if(m === '<') return '&lt;';
    if(m === '>') return '&gt;';
    if(m === '"') return '&quot;';
    return '&#039;';
  });
}

function setMessage(text, type = 'error') {
  if (!scanMessage) return;
  scanMessage.innerHTML = '';
  if (!text) return;
  const div = document.createElement('div');
  div.className = 'msg ' + (type === 'ok' ? 'ok' : '');
  if (type === 'loading') {
    div.innerHTML = '<span class="spinner"></span>' + text;
  } else {
    div.innerText = text;
  }
  scanMessage.appendChild(div);
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
  try {
    const codeReader = new ZXing.BrowserMultiFormatReader();
    const image = new Image();
    const imageUrl = URL.createObjectURL(file);

    return new Promise((resolve, reject) => {
      image.onload = async () => {
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
        URL.revokeObjectURL(imageUrl);
        reject(new Error('Failed to load image.'));
      };
      image.src = imageUrl;
    });
  } catch (err) {
    throw new Error('Scanner initialization failed: ' + err.message);
  }
}

async function handleFileSelect(e) {
  const file = e.target.files[0];

  // ---------------- Microsoft OAuth PKCE helpers and push ----------------
  function base64UrlEncode(buffer) {
    // buffer may be ArrayBuffer or Uint8Array
    const bytes = (buffer instanceof ArrayBuffer) ? new Uint8Array(buffer) : buffer;
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function sha256plain(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    return await crypto.subtle.digest('SHA-256', data);
  }

  function genCodeVerifier() {
    const array = new Uint8Array(56);
    crypto.getRandomValues(array);
    return base64UrlEncode(array);
  }

  async function buildAuthUrl() {
    if (!CLIENT_ID) {
      const id = prompt('Enter your Azure AD Client ID (app registration):');
      if (!id) return null;
      setClientId(id);
    }
    const code_verifier = genCodeVerifier();
    sessionStorage.setItem('ms_code_verifier', code_verifier);
    const hash = await sha256plain(code_verifier);
    const challenge = base64UrlEncode(hash);
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      response_mode: 'query',
      scope: SCOPES,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async function exchangeCodeForToken(code) {
    const code_verifier = sessionStorage.getItem('ms_code_verifier');
    if (!code_verifier) throw new Error('Missing PKCE code_verifier');
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: code_verifier
    });
    const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    if (!resp.ok) throw new Error('Token exchange failed');
    const data = await resp.json();
    sessionStorage.setItem('ms_access_token', data.access_token);
    sessionStorage.setItem('ms_refresh_token', data.refresh_token || '');
    return data;
  }

  async function completeOAuthIfNeeded() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    if (code && CLIENT_ID) {
      try {
        setMessage('Completing Microsoft sign-in...', 'loading');
        await exchangeCodeForToken(code);
        setMessage('Microsoft sign-in completed', 'ok');
        url.searchParams.delete('code');
        window.history.replaceState({}, document.title, url.toString());
      } catch (e) {
        setMessage('OAuth completion failed: ' + e.message, 'error');
      }
    }
  }

  function ensureAccessToken() {
    return sessionStorage.getItem('ms_access_token');
  }

  function startAuthRedirect() {
    buildAuthUrl().then(url => {
      if (url) window.location.href = url;
    }).catch(err => setMessage('Auth start failed: ' + err.message, 'error'));
  }

  function shareUrlToId(shareUrl) {
    const b64 = btoa(unescape(encodeURIComponent(shareUrl))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `u!${b64}`;
  }

  async function pushToMainExcel() {
    if (!confirm('Push all current entries to the main Excel workbook?')) return;
    const access = ensureAccessToken();
    if (!access) { startAuthRedirect(); return; }
    setMessage('Pushing to main workbook...', 'loading');
    try {
      const shareLink = 'https://1drv.ms/x/c/2f4ac71fffd6fb02/IQCu0l_ZxidBT4K-OppuQfLkATnojFHCf80IAb-bhi1cFN4';
      const shareId = shareUrlToId(shareLink);
      let resp = await fetch(`https://graph.microsoft.com/v1.0/shares/${shareId}/driveItem`, {
        headers: { 'Authorization': `Bearer ${access}` }
      });
      if (!resp.ok) throw new Error('Failed to resolve shared workbook');
      const item = await resp.json();
      const itemId = item.id;
      resp = await fetch(`https://graph.microsoft.com/v1.0/drive/items/${itemId}/workbook/worksheets('Sheet1')/usedRange`, {
        headers: { 'Authorization': `Bearer ${access}` }
      });
      let nextRow = 1;
      if (resp.ok) {
        const used = await resp.json();
        const values = used.values || [];
        nextRow = (values.length || 0) + 1;
      }
      const rows = currentEntries.map(e => {
        const row = new Array(8).fill('');
        row[0] = e.barcode;
        row[1] = e.date;
        row[7] = e.user || (currentUser && currentUser.name) || '';
        return row;
      });
      if (rows.length === 0) { setMessage('No entries to push', 'error'); return; }
      const endRow = nextRow + rows.length - 1;
      const address = `A${nextRow}:H${endRow}`;
      resp = await fetch(`https://graph.microsoft.com/v1.0/drive/items/${itemId}/workbook/worksheets('Sheet1')/range(address='${address}')`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${access}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: rows })
      });
      if (!resp.ok) throw new Error('Failed to write rows to workbook');
      setMessage(`Pushed ${rows.length} rows to main workbook`, 'ok');
    } catch (e) {
      setMessage('Push failed: ' + e.message, 'error');
      if (e.message && e.message.indexOf('invalid_grant') >= 0) startAuthRedirect();
    }
  }
  if (!file) {
    setPreviewPlaceholder();
    if (extractPanel) extractPanel.style.display = 'none';
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    if (previewDiv) {
      previewDiv.innerHTML = `<img src="${ev.target.result}" alt="upload preview">`;
    }
  };
  reader.readAsDataURL(file);

  setMessage('Scanning barcode ...', 'loading');
  if (extractPanel) extractPanel.style.display = 'none';

  try {
    const barcodeText = await scanBarcodeFromFile(file);
    setMessage('✅ Barcode detected!', 'ok');
    if (barcodeInput) barcodeInput.value = barcodeText;
    if (datePicker) datePicker.value = selectedDate;
    if (extractPanel) extractPanel.style.display = 'block';
    try { playBeep(); } catch (e) {}
    if (navigator.vibrate) { try { navigator.vibrate(160); } catch(e){} }
  } catch (error) {
    setMessage(error.message || 'Scan failed', 'error');
    if (barcodeInput) barcodeInput.value = '';
    if (extractPanel) extractPanel.style.display = 'block';
    if (datePicker) datePicker.value = selectedDate;
  }
}

function handleDateChange(e) {
  selectedDate = e.target.value;
}

async function handleAddEntry() {
  const barcodeVal = barcodeInput ? barcodeInput.value.trim() : '';
  if (!barcodeVal) {
    setMessage('Please scan or enter a barcode value', 'error');
    return;
  }
  if (!selectedDate) {
    setMessage('Pick a date', 'error');
    return;
  }

  const saved = await saveEntry(barcodeVal, selectedDate);
  
  if (saved) {
    currentEntries.push({ 
      barcode: barcodeVal, 
      date: selectedDate,
      user: currentUser.name 
    });
    renderTable();
    setMessage(`Row added (${barcodeVal}) · ready for next`, 'ok');
    resetForNextScan();
  } else {
    setMessage('Failed to save entry', 'error');
  }
}

async function handleClearTable() {
  if (currentEntries.length > 0) {
    const cleared = await clearUserEntries();
    if (cleared) {
      currentEntries = [];
      renderTable();
      setMessage('All entries cleared', 'ok');
    } else {
      setMessage('Failed to clear entries', 'error');
    }
  } else {
    setMessage('No entries to clear', 'error');
  }
}

async function handleDownload() {
  if (currentEntries.length === 0) {
    setMessage('No data to export', 'error');
    return;
  }

  // ask user where to send the file; cancelling will just trigger a download
  const recipient = prompt('Enter email address to send the file to (cancel to just download):', '');
  if (recipient) {
    setMessage('Preparing email…', 'loading');
    const token = localStorage.getItem('token');
    try {
      const resp = await fetch('/api/send-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ to: recipient })
      });
      const data = await resp.json();
      if (resp.ok) {
        setMessage(`Email sent to ${recipient}`, 'ok');
      } else {
        setMessage(data.error || 'Email failed', 'error');
      }
    } catch (e) {
      console.error('Email request failed', e);
      setMessage('Email request failed', 'error');
    }
  }

  // always still provide a local download as before
  const dataForExcel = currentEntries.map(entry => ({
    'Barcode': entry.barcode,
    'Date': entry.date,
    'Recorded By': entry.user,
    'User ID': currentUser.username
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'BarcodeLog');
  
  const filename = `barcodes_${currentUser.username}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(workbook, filename);

  setMessage(`Exported ${currentEntries.length} rows with your name`, 'ok');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

async function init() {
  if (!checkAuth()) return;
  
  if (datePicker) {
    datePicker.value = selectedDate;
  }
  
  await fetchUserEntries();
  setPreviewPlaceholder();
  startCameraScan();
  // complete OAuth if redirected back with code
  completeOAuthIfNeeded();
  
  if (fileInput) {
    fileInput.addEventListener('click', () => { fileInput.value = ''; });
    fileInput.addEventListener('change', handleFileSelect);
  }
  
  if (datePicker) {
    datePicker.addEventListener('change', handleDateChange);
  }
  
  if (addBtn) {
    addBtn.addEventListener('click', handleAddEntry);
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', handleClearTable);
  }
  
  if (downloadBtn) {
    downloadBtn.addEventListener('click', handleDownload);
  }
  if (pushMainBtn) {
    pushMainBtn.addEventListener('click', pushToMainExcel);
  }
}

window.logout = logout;
document.addEventListener('DOMContentLoaded', init);