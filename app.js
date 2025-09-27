// --- CONFIG: change these default tickers if you wish ---
// Use Finnhub symbol style (exchange_ticker). Example: 'NSE:RELIANCE'
const DEFAULT_STOCKS = [
    { symbol: 'NSE:RELIANCE', displayname:'organising department' },
    { symbol: 'NSE:TCS', displayName: 'models department' },
    { symbol: 'NSE:INFY', displayName: 'tech department' },
    { symbol: 'NSE:HDFCBANK', displayName: 'foodstalls department' },
    { symbol: 'NSE:ICICIBANK', displayName: 'stalls department' },
    { symbol: 'NSE:SBIN', displayName: 'games department' },
    { symbol: 'NSE:AXISBANK', displayName: 'seminar department' },
    { symbol: 'NSE:LT', displayName: 'financial department' },
    { symbol: 'NSE:BAJFINANCE', displayName: 'volunteer department' }
  ];
// Where to open your existing demat account site (change after deploying)
const DEMAT_URL_KEY = 'dematUrl';

// --- app logic ---
const stocksGrid = document.getElementById('stocksGrid');
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const editBtn = document.getElementById('editBtn');
const bgPicker = document.getElementById('bgPicker');
const openDematBtn = document.getElementById('openDemat');

let editing = false;

// load saved settings
const savedStocks = JSON.parse(localStorage.getItem('stocks_v1') || 'null');
let stocks = savedStocks || DEFAULT_STOCKS;
const savedBg = localStorage.getItem('bgColor');
if (savedBg) document.documentElement.style.setProperty('--bg', savedBg);
// color picker init
bgPicker.value = rgbToHex(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());

// helper: convert rgb() to hex if needed
function rgbToHex(rgb){
  if (!rgb) return '#f7f9fc';
  if (rgb[0]==='#') return rgb;
  const m = rgb.match(/\d+/g);
  if (!m) return '#f7f9fc';
  return '#'+m.slice(0,3).map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
}

bgPicker.addEventListener('input', e=>{
  const v = e.target.value;
  document.documentElement.style.setProperty('--bg', v);
  localStorage.setItem('bgColor', v);
});

// Open demat/embedding button
openDematBtn.addEventListener('click', ()=>{
  const url = localStorage.getItem(DEMAT_URL_KEY) || '';
  if (!url){
    const newUrl = prompt('Paste your Demat site URL (https://commerceday.github.io/demat_account/):');
    if (newUrl) {
      localStorage.setItem(DEMAT_URL_KEY, newUrl);
      window.open(newUrl, '_blank');
    }
  } else window.open(url, '_blank');
});

// Edit names toggle
editBtn.addEventListener('click', ()=>{
  editing = !editing;
  editBtn.textContent = editing ? 'Save Names' : 'Edit Names';
  if (!editing) {
    // save edits
    const inputs = document.querySelectorAll('.displayNameEditable');
    inputs.forEach(inp=>{
      const sym = inp.dataset.symbol;
      const s = stocks.find(x=>x.symbol===sym);
      if (s) s.display = inp.textContent.trim() || s.display;
    });
    localStorage.setItem('stocks_v1', JSON.stringify(stocks));
  }
  render();
});

// login flow
loginForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  loginError.textContent = '';
  const pw = document.getElementById('pw').value;
  try {
    const resp = await fetch('/.netlify/functions/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    if (!resp.ok) throw new Error('Invalid password');
    // success: Netlify function sets cookie; verify then hide overlay
    await checkAuthAndLoad();
  } catch (err) {
    loginError.textContent = 'Wrong password, try again.';
  }
});

// check auth by calling verify function
async function checkAuthAndLoad(){
  try {
    const r = await fetch('/.netlify/functions/verify');
    if (r.ok) {
      loginOverlay.classList.add('hidden');
      await loadAllQuotes();
    } else {
      loginOverlay.classList.remove('hidden');
    }
  } catch (err) {
    // when offline/unreachable, show login overlay
    loginOverlay.classList.remove('hidden');
  }
}

// render UI skeleton
function render(){
  stocksGrid.innerHTML = '';
  stocks.forEach(s=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="top">
        <div>
          <div class="symbol">${s.symbol}</div>
          <div class="displayName ${editing ? 'editable displayNameEditable' : ''}" data-symbol="${s.symbol}" contenteditable="${editing}">${s.display}</div>
        </div>
        <div class="small" id="status-${escapeId(s.symbol)}">Loading...</div>
      </div>
      <div class="price" id="price-${escapeId(s.symbol)}">--</div>
      <div class="change" id="change-${escapeId(s.symbol)}">--</div>
    `;
    stocksGrid.appendChild(card);
  });
}

// helper to make HTML ids safe
function escapeId(s){ return s.replace(/[^a-zA-Z0-9_-]/g, '_'); }

// fetch quotes for all stocks (one by one to avoid rate bursts)
async function loadAllQuotes(){
  render();
  for (let s of stocks){
    await loadQuote(s);
    // small delay to be polite (avoid hitting rate limits)
    await new Promise(r=>setTimeout(r, 250));
  }
}

// load single quote via the Netlify proxy
async function loadQuote(s){
  const id = escapeId(s.symbol);
  const statusEl = document.getElementById('status-'+id);
  const priceEl = document.getElementById('price-'+id);
  const changeEl = document.getElementById('change-'+id);
  statusEl.textContent = 'Fetching...';
  try {
    const resp = await fetch('/.netlify/functions/finnhub-proxy?symbol=' + encodeURIComponent(s.symbol));
    if (!resp.ok) {
      if (resp.status === 401) {
        // unauthorized — show login overlay
        loginOverlay.classList.remove('hidden');
        return;
      }
      throw new Error('Fetch failed');
    }
    const data = await resp.json();
    // Finnhub quote fields: c (current), d (change), dp (change%)
    const c = data.c, d = data.d, dp = data.dp;
    priceEl.textContent = c ? formatNumber(c) : '--';
    if (d==null || dp==null) {
      changeEl.textContent = '--';
    } else {
      const cls = (d>=0)?'change up':'change down';
      changeEl.className = cls;
      changeEl.textContent = `${d>=0?'+':''}${formatNumber(d)} (${d>=0?'+':''}${formatNumber(dp)}%)`;
    }
    statusEl.textContent = s.display;
  } catch (err) {
    statusEl.textContent = 'Error';
    priceEl.textContent = '--';
    changeEl.textContent = '--';
  }
}

function formatNumber(n){
  if (n===null || n===undefined) return '--';
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
  return Number(n).toFixed(2);
}

// initial boot
(async ()=>{
  render();
  await checkAuthAndLoad();
})();
