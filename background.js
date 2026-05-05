importScripts('ExtPay.js');
const extpay = ExtPay('whatsapp-bulk-sender-pro');   
extpay.startBackground();

let isPro = false;

extpay.getUser().then(user => {
  isPro = user.paid;
  chrome.storage.local.set({ isPro: isPro });
});

extpay.onPaid.addListener(() => {
  isPro = true;
  chrome.storage.local.set({ isPro: true });
});

class WhatsAppBulkSender {
  constructor() {
    this.running = false;
    this.stopRequested = false;
    this.config = {};
  }

  async loadConfig() {
    try {
      const response = await fetch(chrome.runtime.getURL('config.json'));
      this.config = await response.json();
    } catch (err) {
      console.error('Error loading config:', err);
      this.config = {
        whatsappWebUrl: 'https://web.whatsapp.com/',
        retryTimeout: 6000,
        retryMaxTimeout: 10000
      };
    }
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getWhatsAppTab() {
    let tabs = await chrome.tabs.query({ url: `${this.config.whatsappWebUrl}*` });
    if (tabs && tabs.length) return tabs[0];
    return await chrome.tabs.create({ url: this.config.whatsappWebUrl });
  }

  async navigateToContact(tabId, contact, messageTemplate) {
    const personalized = messageTemplate.replace(/{{\s*name\s*}}/gi, contact.name || '');
    const encoded = encodeURIComponent(personalized);
    const sendUrl = `${this.config.whatsappWebUrl}send?phone=${contact.number}&text=${encoded}`;
    await chrome.tabs.update(tabId, { url: sendUrl });
  }

  async clickSendButton(tabId) {
    try {
      // Direct function injection – multiple fallback selectors
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const selectors = [
            'button[aria-label="Send"]',
            'button span[data-icon="send"]',
            'div[data-testid="send"] button',
            'footer button'
          ];
          for (let sel of selectors) {
            const btn = document.querySelector(sel);
            if (btn && btn.click) {
              btn.click();
              console.log('Send button clicked via selector:', sel);
              return true;
            }
          }
          console.log('Send button not found');
          return false;
        }
      });
    } catch (err) {
      console.error('Error clicking send button:', err);
    }
  }

  async processMessages(tab, contacts, minDelay, maxDelay, messageTemplate) {
    for (let i = 0; i < contacts.length; i++) {
      if (this.stopRequested) break;
      const contact = contacts[i];
      await this.navigateToContact(tab.id, contact, messageTemplate);
      await this.wait(5000); // give the page time to load
      await this.clickSendButton(tab.id);
      const delaySec = minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
      chrome.runtime.sendMessage({ type: 'status', text: `Sent ${i+1}/${contacts.length} – waiting ${delaySec}s` });
      await this.wait(delaySec * 1000);
    }
  }

  async runSendLoop(contacts, minDelay, maxDelay, messageTemplate) {
    try {
      this.running = true;
      this.stopRequested = false;
      await this.loadConfig();
      const tab = await this.getWhatsAppTab();
      await this.processMessages(tab, contacts, minDelay, maxDelay, messageTemplate);
      chrome.runtime.sendMessage({ type: 'status', text: 'Completed' });
    } catch (err) {
      console.error(err);
      chrome.runtime.sendMessage({ type: 'status', text: 'Error: ' + err.message });
    } finally {
      this.running = false;
      this.stopRequested = false;
    }
  }

  stop() {
    this.stopRequested = true;
  }
}

const sender = new WhatsAppBulkSender();

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'start') {
    if (sender.running) {
      chrome.runtime.sendMessage({ type: 'status', text: 'Already running' });
      return;
    }
    sender.runSendLoop(msg.contacts, msg.minDelay, msg.maxDelay, msg.messageTemplate);
  }
  if (msg.action === 'stop') {
    sender.stop();
  }
  if (msg.action === 'openPayment') {
    extpay.openPaymentPage();
  }
});