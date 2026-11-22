// Synthetic-only browser acceptance. Browser plugin unavailable; local Playwright fallback.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const base = process.env.PERFORMANCE_BROWSER_BASE || 'http://localhost:5192';
const baseline = process.env.PERFORMANCE_BASELINE === '1';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const actor = { id: 11, user_id: 11, name: 'Synthetic member', member_id: 'SYN-11', role: 'member',
  status: 'active', must_change_password: false, avatar_url: null, email: null, phone: null, location: 'Synthetic location' };
const books = Array.from({ length: 65 }, (_, index) => ({ id: index + 1,
  title: 'Synthetic book ' + String(index + 1).padStart(3, '0'), author: 'Synthetic author',
  category: 'General', copies_available: 1, copies_total: 1 }));

async function surface(browser, width, signedIn = true) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
  await context.addInitScript(({ initial, actor }) => {
    if (initial) {
      localStorage.setItem('isLoggedIn', 'true'); localStorage.setItem('userId', String(actor.id));
      localStorage.setItem('userRole', actor.role); localStorage.setItem('userName', actor.name);
    }
    window.syntheticStreams = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const draw = canvas.getContext('2d'); draw.fillStyle = '#302820'; draw.fillRect(0, 0, 640, 480);
      draw.fillStyle = '#edbf72'; draw.font = '20px sans-serif'; draw.fillText('Synthetic camera: no facial image', 80, 230);
      const stream = canvas.captureStream(10);
      const timer = setInterval(() => draw.fillRect(0, 0, 1, 1), 100);
      stream.getTracks().forEach(track => { const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); }; });
      window.syntheticStreams.push(stream);
      return stream;
    };
  }, { initial: signedIn, actor });
  const page = await context.newPage(), errors = [];
  const state = { signedIn, actor: { ...actor }, requests: [], held: null, reply: { matched: false, message: 'no_face' }, releasedAt: 0 };
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (!['xhr', 'fetch'].includes(request.resourceType()) && request.method() !== 'OPTIONS') return route.continue();
    const url = new URL(request.url()), endpoint = url.pathname;
    const headers = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-credentials': 'true',
      'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    state.requests.push({ endpoint, query: url.search, method: request.method() });
    let data = [], status = 200;
    if (endpoint === '/api/auth/session') {
      if (state.signedIn) data = state.actor; else { status = 401; data = { detail: 'Not signed in' }; }
    } else if (endpoint === '/api/user/profile') { await delay(180); data = state.actor; }
    else if (endpoint === '/api/user/fines') { await delay(180); data = { total_fine: 0, overdue_loans: [] }; }
    else if (endpoint === '/api/user/biometric-status') data = { has_face: false };
    else if (endpoint === '/api/user/account-notice') data = { notice: null };
    else if (endpoint === '/api/user/reading-stats') data = { genres: [], total_books_borrowed: 0 };
    else if (endpoint === '/api/books/categories') data = [{ category: 'General', count: 65, preview_covers: [] }];
    else if (endpoint === '/api/books') {
      const skip = Number(url.searchParams.get('skip') || 0), limit = Number(url.searchParams.get('limit') || 20);
      data = { items: books.slice(skip, skip + limit), total: books.length };
    } else if (endpoint === '/api/auth/face') {
      const held = state.held;
      if (held) { state.held = null; held.started(); await held.promise; data = held.data; }
      else data = state.reply;
      if (data.matched) state.signedIn = true;
      state.releasedAt = Date.now();
    } else if (endpoint === '/api/auth/logout') { state.signedIn = false; data = {}; }
    await route.fulfill({ status, headers, json: data }).catch(error => { if (!request.failure()) throw error; });
  });
  return { context, page, state, errors };
}
async function healthy(page, errors) {
  await page.waitForFunction(() => document.body.innerText.length > 30);
  assert.deepEqual(errors, []);
  assert.ok(await page.title());
  assert.ok((await page.locator('body').innerText()).length > 30);
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal page overflow');
}
async function run() {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PERFORMANCE_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'rpl-performance-'));
  const results = [];
  try {
    for (const width of [1440, 390]) {
      {
        const { page, state, context, errors } = await surface(browser, width);
        await page.goto(base + '/user/profile');
        await page.getByRole('button', { name: 'Edit Profile', exact: true }).waitFor();
        const profileRequests = state.requests.filter(r => r.endpoint === '/api/user/profile').length;
        assert.equal(profileRequests, baseline ? 4 : 1); // Development StrictMode repeats both consumers.
        await healthy(page, errors);
        results.push({ width, profileRequests }); await context.close();
      }
      {
        const { page, state, context, errors } = await surface(browser, width);
        await page.goto(base + '/user/home');
        await page.getByText(/Good (morning|afternoon|evening)/).first().waitFor();
        const fineRequests = state.requests.filter(r => r.endpoint === '/api/user/fines').length;
        assert.equal(fineRequests, baseline ? 4 : 1);
        await healthy(page, errors);
        results.push({ width, fineRequests }); await context.close();
      }
      {
        const { page, state, context, errors } = await surface(browser, width, false);
        await page.goto(base + '/browse');
        await page.locator('.catalog-public-book').first().waitFor();
        const count = await page.locator('.catalog-public-book').count();
        assert.equal(count, baseline ? 65 : 24);
        const firstRequest = state.requests.find(r => r.endpoint === '/api/books');
        assert.ok(firstRequest.query.includes('limit=' + (baseline ? 100 : 24)));
        if (!baseline) {
          await page.getByRole('button', { name: 'Next page', exact: true }).first().click();
          await page.getByRole('button', { name: 'View details for Synthetic book 025', exact: true }).waitFor();
          await page.getByRole('button', { name: 'Previous page', exact: true }).first().click();
          await page.getByRole('button', { name: 'View details for Synthetic book 001', exact: true }).waitFor();
        }
        await healthy(page, errors); await page.screenshot({ path: path.join(artifacts, 'catalog-' + width + '.png') });
        results.push({ width, initialCatalogBooks: count }); await context.close();
      }
      if (baseline) continue;
      {
        const { page, state, context, errors } = await surface(browser, width, false);
        await page.goto(base + '/user/login');
        await page.getByRole('button', { name: 'Face ID', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'No face detected' }).waitFor();
        assert.equal(await page.locator('video').count(), 1);
        let started, release;
        const startedPromise = new Promise(resolve => { started = resolve; });
        const promise = new Promise(resolve => { release = resolve; });
        state.held = { started, promise, data: { ...actor, matched: true } };
        await startedPromise;
        await page.getByRole('button', { name: 'Password', exact: true }).click();
        release(); await delay(200);
        assert.ok(page.url().endsWith('/user/login'));
        assert.notEqual(await page.evaluate(() => localStorage.getItem('isLoggedIn')), 'true');
        await page.waitForFunction(() => window.syntheticStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')));

        state.signedIn = false;
        await page.getByRole('button', { name: 'Face ID', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'No face detected' }).waitFor();
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.getByText('Camera paused', { exact: true }).waitFor();
        await page.waitForFunction(() => window.syntheticStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
        await page.evaluate(() => { delete document.hidden; });
        await page.getByRole('button', { name: 'Try Again', exact: true }).click();
        await page.getByRole('status').filter({ hasText: 'No face detected' }).waitFor();
        await healthy(page, errors);
        await page.screenshot({ path: path.join(artifacts, 'face-login-' + width + '.png') });
        state.reply = { matched: false, message: 'Spoofing Detected' };
        await page.getByText('Spoofing Detected. Please use a live face.', { exact: true }).waitFor({ timeout: 10000 });
        assert.ok(page.url().endsWith('/user/login'));
        state.reply = { ...actor, matched: true };
        await page.waitForURL('**/user/home');
        results.push({ width, faceRedirectMs: Date.now() - state.releasedAt, staleMatchIgnored: true, hiddenCameraStopped: true });
        await page.waitForFunction(() => window.syntheticStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
        await page.getByText(/Good (morning|afternoon|evening)/).first().waitFor();
        await healthy(page, errors); await context.close();
      }
    }
    if (!baseline) {
      const { page, state, context, errors } = await surface(browser, 1440, false);
      await page.goto(base + '/user/login');
      state.reply = { ...actor, role: 'librarian', matched: true };
      await page.getByRole('button', { name: 'Face ID', exact: true }).click();
      await page.getByText('This is not a member account. Please contact library staff if you need help.', { exact: true }).waitFor();
      assert.ok(page.url().endsWith('/user/login'));
      assert.notEqual(await page.evaluate(() => localStorage.getItem('isLoggedIn')), 'true');
      await page.getByRole('button', { name: 'Password', exact: true }).click();
      state.actor.must_change_password = true;
      state.reply = { ...state.actor, matched: true };
      await page.getByRole('button', { name: 'Face ID', exact: true }).click();
      await page.waitForURL('**/user/change-password');
      await healthy(page, errors);
      results.push({ wrongRoleBlocked: true, temporaryPasswordChangeRequired: true });
      await context.close();
    }
    console.log(JSON.stringify({ baseline, results, artifacts }));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
