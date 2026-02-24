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
      const deviceId = videoInputDevices && videoInputDevices.length ? videoInputDevices[0].deviceId : undefined;
      try {
        codeReader.decodeFromVideoDevice(deviceId, videoElem, (result, err) => {
          if (result && !pauseScan) {
            pauseScan = true;
            const text = result.getText();
            if (barcodeInput) barcodeInput.value = text;
            if (datePicker) datePicker.value = selectedDate;
            if (extractPanel) extractPanel.style.display = 'block';
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

function handleDownload() {
  if (currentEntries.length === 0) {
    setMessage('No data to export', 'error');
    return;
  }

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
}

window.logout = logout;
document.addEventListener('DOMContentLoaded', init);