document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);

function saveOptions() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const demoMode = document.getElementById('demoMode').checked;
  const statusEl = document.getElementById('status');
  
  if (!apiKey && !demoMode) {
    statusEl.textContent = 'Please enter an API key, or enable Demo Mode.';
    statusEl.className = 'status-message error';
    return;
  }

  chrome.storage.local.set({
    geminiApiKey: apiKey,
    demoMode: demoMode
  }, () => {
    statusEl.textContent = 'Settings saved successfully!';
    statusEl.className = 'status-message success';
    setTimeout(() => {
      statusEl.className = 'status-message';
    }, 3000);
  });
}

function restoreOptions() {
  chrome.storage.local.get({
    geminiApiKey: '',
    demoMode: false
  }, (items) => {
    document.getElementById('apiKey').value = items.geminiApiKey;
    document.getElementById('demoMode').checked = items.demoMode;
  });
}