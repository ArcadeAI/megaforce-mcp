import { MCPClient } from '../scripts/MCPClient.js';

const mcpClient = new MCPClient();


const message = document.body.querySelector('#message');
if (message) {
  message.textContent = 'Hello from MegaForce Starter TS Edition!';
}

const extractButton = document.body.querySelector('#extract') as HTMLButtonElement | null;
const connectButton = document.body.querySelector('#connect') as HTMLButtonElement | null;
const summarizeButton = document.body.querySelector('#summarize') as HTMLButtonElement | null;
const contentPre = document.body.querySelector('#content') as HTMLPreElement | null;
const summaryPre = document.body.querySelector('#summary') as HTMLPreElement | null;
const connectStatus = document.body.querySelector('#connect-status') as HTMLDivElement | null;

async function summarizeWithMcp(this: HTMLButtonElement, ev: MouseEvent){
  summarizeButton!.disabled = true;
  console.log('Summarizing with MCP');
  console.log(contentPre!.textContent);
  const result = await mcpClient.callTool('summarize', { text: contentPre!.textContent });
  console.log(result);
  summaryPre!.textContent = JSON.stringify(result, null, 2);
  summarizeButton!.disabled = false;
}

async function extractPageText() {
  try {
    extractButton!.disabled = true;
    contentPre!.textContent = 'Extracting…';

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.id || !/^https?:\/\//.test(tab.url || '')) {
      contentPre!.textContent = 'No eligible tab or URL to extract.';
      return;
    }

    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/extract-content.js']
    });

    const result = injection && injection[0] ? (injection[0].result as string | null) : null;
    if (!result) {
      contentPre!.textContent = 'Page is not readable or no content found.';
    } else {
      contentPre!.textContent = result;
    }
  } catch (err) {
    const message = err && (err as any).message ? (err as any).message : String(err);
    contentPre!.textContent = 'Error extracting content: ' + message;
  } finally {
    if (extractButton) {
      extractButton.disabled = false;
    }
  }
}

if (extractButton) {
  extractButton.addEventListener('click', extractPageText);
}

if (summarizeButton) {
  summarizeButton.addEventListener('click', summarizeWithMcp);
}


function updateConnectionStatus(isConnected: boolean): void {
  if (!connectStatus) return;
  connectStatus.innerHTML = '';

  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', isConnected ? 'link' : 'link-2-off');
  icon.className = `status-icon ${isConnected ? 'status-connected' : 'status-disconnected'}`;
  icon.setAttribute('aria-label', isConnected ? 'Connected' : 'Disconnected');
  connectStatus.appendChild(icon);

  // Render the newly added icon createIcons();
}

// Start with disconnected state
updateConnectionStatus(false);

// Example: expose a helper to toggle status (replace with real connection events)
(window as any).setConnected = (v: boolean) => updateConnectionStatus(v);

// Temporarily mark as connected on button click (replace with real connect flow)
if (connectButton) {
  connectButton.addEventListener('click', () => {
    console.log('Connecting to MCP');
    mcpClient.connect();
    updateConnectionStatus(true);
  });
} else {
  console.log('No connect button found');
}


