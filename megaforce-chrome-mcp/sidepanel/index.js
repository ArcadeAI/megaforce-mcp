const message = document.body.querySelector('#message');
if (message) {
  message.textContent = 'Hello from MegaForce Starter!';
}

const extractButton = document.body.querySelector('#extract');
const contentPre = document.body.querySelector('#content');

async function extractPageText() {
  try {
    extractButton.disabled = true;
    contentPre.textContent = 'Extracting…';

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id || !/^https?:\/\//.test(tab.url || '')) {
      contentPre.textContent = 'No eligible tab or URL to extract.';
      return;
    }

    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/extract-content.js']
    });

    const result = injection && injection[0] ? injection[0].result : null;
    if (!result) {
      contentPre.textContent = 'Page is not readable or no content found.';
    } else {
      contentPre.textContent = result;
    }
  } catch (err) {
    contentPre.textContent = 'Error extracting content: ' + (err && err.message ? err.message : String(err));
  } finally {
    extractButton.disabled = false;
  }
}

if (extractButton) {
  extractButton.addEventListener('click', extractPageText);
}
