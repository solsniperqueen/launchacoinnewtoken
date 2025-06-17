// Railway deployment ready - no external dependencies needed
// Uses built-in fetch and HTTP requests

const CONFIG = {
  MORALIS_API: process.env.MORALIS_API || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImMwZGE0YjQ4LTM0OGUtNGRmOC1iMGM1LWQwZDM4NDkwODI5ZSIsIm9yZ0lkIjoiNDU0NDY1IiwidXNlcklkIjoiNDY3NTkwIiwidHlwZUlkIjoiN2M1Y2Q2OTEtMzkwNi00MzkzLWE3MjEtYzg0MzJkNTQwZWU4IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTAxODA3NDAsImV4cCI6NDkwNTk0MDc0MH0.xDHgIJsavVM0caLFOOB-UKPxdQb5Yk4d4L4_6n7YOLA",
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || "7304142526:AAGXeA5RCinM7czenzGFT2U0x-bc9STXiQc",
  CHAT_ID: process.env.CHAT_ID || "818339609",
  CHECK_INTERVAL: 10000, // 10 seconds for Render free tier
  TOKEN_SUFFIX: 'BLV',
  API_LIMIT: 10,
  PORT: process.env.PORT || 10000 // Render uses port 10000
};

// Use HTTP server for Railway (required for deployment)
const http = require('http');

// Token tracking with size limit to prevent memory leaks
const MAX_TRACKED_TOKENS = 1000;
let lastCheckedTokens = new Set();

// Rate limiting
let lastApiCall = 0;
const MIN_API_INTERVAL = 2000; // Minimum 2 seconds between API calls

async function fetchNewTokens() {
  const now = Date.now();
  
  // Rate limiting check
  if (now - lastApiCall < MIN_API_INTERVAL) {
    console.log('Rate limit: skipping API call');
    return [];
  }
  
  try {
    const response = await fetch(
      `https://deep-index.moralis.io/api/v2/solana/pumpfun/new?limit=${CONFIG.API_LIMIT}`,
      { 
        headers: { 'X-API-Key': CONFIG.MORALIS_API },
        timeout: 10000 // 10 second timeout
      }
    );
    
    lastApiCall = now;
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] API Error:`, error.message);
    return [];
  }
}

async function sendTelegramMessage(token) {
  try {
    const message = `🚀 NEW ${CONFIG.TOKEN_SUFFIX} TOKEN FOUND!\n\n` +
                   `📛 Symbol: ${token.symbol}\n` +
                   `📋 Contract: \`${token.token_address}\`\n` +
                   `⏰ Detected: ${new Date().toLocaleString()}`;
    
    const telegramUrl = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
    
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }
    
    console.log(`[${new Date().toISOString()}] Alert sent for ${token.symbol}`);
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Telegram Error:`, error.message);
  }
}

function cleanupTokenSet() {
  // Prevent memory leaks by limiting tracked tokens
  if (lastCheckedTokens.size > MAX_TRACKED_TOKENS) {
    const tokensArray = Array.from(lastCheckedTokens);
    const keepTokens = tokensArray.slice(-Math.floor(MAX_TRACKED_TOKENS / 2));
    lastCheckedTokens = new Set(keepTokens);
    console.log(`[${new Date().toISOString()}] Cleaned up token tracking set`);
  }
}

async function monitorTokens() {
  console.log(`[${new Date().toISOString()}] Checking for new ${CONFIG.TOKEN_SUFFIX} tokens...`);
  
  const tokens = await fetchNewTokens();
  
  if (tokens.length === 0) {
    return;
  }
  
  const matchingTokens = tokens.filter(token => 
    token.symbol && 
    token.symbol.endsWith(CONFIG.TOKEN_SUFFIX) && 
    !lastCheckedTokens.has(token.token_address)
  );
  
  for (const token of matchingTokens) {
    await sendTelegramMessage(token);
    lastCheckedTokens.add(token.token_address);
  }
  
  // Periodic cleanup
  if (Math.random() < 0.1) { // 10% chance each cycle
    cleanupTokenSet();
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Stopping token monitor...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Stopping token monitor...');
  process.exit(0);
});

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection:`, reason);
});

// Create HTTP server (Railway requirement)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Token Monitor Bot Running\nLast check: ${new Date().toISOString()}\nTracked tokens: ${lastCheckedTokens.size}`);
});

server.listen(CONFIG.PORT, () => {
  console.log(`[${new Date().toISOString()}] HTTP server running on port ${CONFIG.PORT}`);
});

// Start monitoring
console.log(`[${new Date().toISOString()}] Starting ${CONFIG.TOKEN_SUFFIX} token monitor...`);
console.log(`Check interval: ${CONFIG.CHECK_INTERVAL}ms`);

// Initial check
monitorTokens();

// Set up interval
setInterval(monitorTokens, CONFIG.CHECK_INTERVAL);