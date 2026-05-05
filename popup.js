const contactsPaste = document.getElementById('contactsPaste');
const messageEl = document.getElementById('message');
const minDelayEl = document.getElementById('minDelay');
const maxDelayEl = document.getElementById('maxDelay');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const statusEl = document.getElementById('status');
const testCountEl = document.getElementById('testCount');
const upgradeBtn = document.getElementById('upgradeBtn');

let contacts = [];

function parsePastedContacts(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const result = [];
  for (let line of lines) {
    let number = '', name = '';
    if (line.includes(',')) {
      const parts = line.split(',');
      number = parts[0].trim().replace(/[^0-9]/g, '');
      name = parts[1] ? parts[1].trim() : '';
    } else {
      number = line.replace(/[^0-9]/g, '');
      name = '';
    }
    if (number) result.push({ number, name });
  }
  return result;
}

function updateContacts() {
  const text = contactsPaste.value;
  if (!text.trim()) {
    contacts = [];
    statusEl.textContent = 'Status: paste contacts above';
    return;
  }
  try {
    contacts = parsePastedContacts(text);
    statusEl.textContent = `Status: ${contacts.length} contacts loaded`;
  } catch (err) {
    statusEl.textContent = 'Error parsing contacts: ' + err.message;
  }
}

contactsPaste.addEventListener('input', updateContacts);
updateContacts();

startBtn.addEventListener('click', async () => {
  if (!contacts.length) {
    statusEl.textContent = 'No contacts. Paste some first.';
    return;
  }
  const minDelay = parseInt(minDelayEl.value,10) || 5;
  const maxDelay = parseInt(maxDelayEl.value,10) || (minDelay+5);
  let testCount = parseInt(testCountEl.value,10) || 0;
  if (testCount <= 0 || testCount > contacts.length) testCount = contacts.length;
  const selectedContacts = contacts.slice(0, testCount);
  const messageTemplate = messageEl.value || '';

  // --- PRO CHECK (freemium limit) ---
  const proStatus = await new Promise(resolve => {
    chrome.storage.local.get(['isPro'], result => resolve(result.isPro || false));
  });
  if (!proStatus && selectedContacts.length > 5) {
    statusEl.textContent = 'Status: free version limited to 5 contacts. Click Upgrade.';
    upgradeBtn.style.display = 'block';
    upgradeBtn.onclick = () => chrome.runtime.sendMessage({ action: 'openPayment' });
    return;
  }
  upgradeBtn.style.display = 'none';

  chrome.runtime.sendMessage({
    action: 'start',
    contacts: selectedContacts,
    minDelay, maxDelay, messageTemplate
  });
  statusEl.textContent = 'Status: started';
});

stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop' });
  statusEl.textContent = 'Status: stop requested';
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status') statusEl.textContent = 'Status: ' + msg.text;
});