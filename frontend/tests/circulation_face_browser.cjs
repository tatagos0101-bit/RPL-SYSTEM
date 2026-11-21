// Optional browser acceptance: requires Playwright and Edge (or an explicit browser executable).
// Uses synthetic camera frames and intercepted APIs; no real accounts or faces are accessed.
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.QR_BROWSER_BASE || 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use an isolated local server');
const artifacts = process.env.QR_BROWSER_ARTIFACTS || path.join(tmpdir(), 'rpl-face-first-borrow');
const librarian = { id: 1, name: 'Synthetic librarian', role: 'librarian', must_change_password: false };
const member = { id: 11, name: 'Synthetic member', member_id: 'SYN-11', email: 'borrower@example.test' };

async function run() {
  await mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch(process.env.CIRCULATION_BROWSER_EXECUTABLE
    ? { executablePath: process.env.CIRCULATION_BROWSER_EXECUTABLE, headless: true }
    : { channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      await context.addInitScript(() => {
        window.syntheticStreams = [];
        window.cameraDenied = false;
        navigator.mediaDevices.getUserMedia = async () => {
          if (window.cameraDenied) throw new DOMException('Synthetic camera denial', 'NotAllowedError');
          const canvas = document.createElement('canvas');
          canvas.width = 640; canvas.height = 480;
          const drawing = canvas.getContext('2d');
          drawing.fillStyle = '#2c211a'; drawing.fillRect(0, 0, 640, 480);
          drawing.fillStyle = '#f2c66d'; drawing.font = '24px sans-serif';
          drawing.fillText('Synthetic camera - no facial image', 80, 240);
          const stream = canvas.captureStream(10);
          const timer = setInterval(() => drawing.fillRect(0, 0, 1, 1), 100);
          stream.getTracks().forEach(track => {
            const stop = track.stop.bind(track);
            track.stop = () => { clearInterval(timer); stop(); };
          });
          window.syntheticStreams.push(stream);
          return stream;
        };
      });
      const page = await context.newPage();
      const errors = [], writes = [], lookups = [], apiPaths = [];
      let faceReply = { matched: false, message: 'no_face' };
      let heldFaceResponse = null;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        if (!['xhr', 'fetch'].includes(route.request().resourceType()) && route.request().method() !== 'OPTIONS') return route.continue();
        const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
        apiPaths.push(endpoint);
        const headers = { 'access-control-allow-origin': new URL(base).origin,
          'access-control-allow-credentials': 'true', 'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        let data = [];
        if (endpoint.endsWith('/auth/session')) data = librarian;
        else if (endpoint.endsWith('/transactions/count')) data = { total: 0, borrowed: 0, returned: 0, overdue: 0 };
        else if (endpoint.endsWith('/transactions')) data = { items: [], total: 0 };
        else if (endpoint.endsWith('/face-lookup')) {
          lookups.push('face');
          const held = heldFaceResponse;
          if (held) {
            heldFaceResponse = null;
            held.started();
            await held.release;
            data = held.reply;
            await route.fulfill({ status: 200, headers, json: data }).catch(error => {
              if (!request.failure()) throw error;
            });
            held.finished();
            return;
          }
          data = faceReply;
        }
        else if (endpoint.endsWith('/librarian/users')) { lookups.push(url.searchParams.get('search')); data = [member]; }
        else if (endpoint.endsWith('/borrowing-capacity')) data = {
          active_loans: 0, ready_reservations: 0, pending_reservations: 0,
          limit: 5, remaining_slots: 5, borrowing_restrictions: [],
        };
        else if (request.method() !== 'GET') writes.push(endpoint);
        await route.fulfill({ status: 200, headers, json: data });
      });
      const dialog = page.getByRole('dialog', { name: 'Borrow Books', exact: true });
      const openBorrow = async () => {
        await page.getByRole('button', { name: 'Borrow books', exact: true }).click();
        await dialog.waitFor({ state: 'visible' });
      };
      const waitForCamera = () => page.waitForFunction(() => document.querySelector('dialog video')?.readyState >= 2);
      const stopped = () => page.waitForFunction(() => window.syntheticStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
      const closeBorrow = async () => { await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await stopped(); };

      await page.goto(base + '/librarian/borrow-return');
      try { await page.getByRole('button', { name: 'Borrow books', exact: true }).waitFor({ timeout: 5000 }); }
      catch (error) { console.error({ url: page.url(), content: await page.locator('body').innerText(), apiPaths, errors }); throw error; }
      await openBorrow();
      assert.equal(await dialog.locator('video').count(), 1, 'Borrow must open the face scanner immediately');
      await waitForCamera();
      assert.equal(await dialog.locator('input').count(), 0, 'Manual lookup is an optional fallback');
      assert.equal(await dialog.getByRole('button', { name: 'Scan member face', exact: true }).count(), 0,
        'Face recognition must start without a scan button');
      await dialog.getByRole('status').filter({ hasText: 'No face detected' }).waitFor();
      assert.ok(lookups.includes('face'), 'A ready camera must scan automatically');
      await page.screenshot({ path: path.join(artifacts, `borrow-face-${width}.png`) });

      await dialog.getByRole('button', { name: 'Use email or Member ID instead', exact: true }).click();
      await stopped();
      assert.equal(await dialog.locator('video').count(), 0);
      await dialog.getByLabel('Email or Member ID', { exact: true }).fill('borrower');
      await dialog.getByRole('button', { name: 'Identify member', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'No exact member match' }).waitFor();
      await dialog.getByLabel('Email or Member ID', { exact: true }).fill(member.email);
      await dialog.getByRole('button', { name: 'Identify member', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Member reservations (0)', exact: true }).waitFor();
      assert.ok(lookups.includes(member.email));
      await closeBorrow();

      // Switching to fallback during inference must cancel and ignore a late match.
      let requestStarted, releaseResponse, responseFinished;
      const started = new Promise(resolve => { requestStarted = resolve; });
      const release = new Promise(resolve => { releaseResponse = resolve; });
      const finished = new Promise(resolve => { responseFinished = resolve; });
      heldFaceResponse = { started: requestStarted, release, finished: responseFinished,
        reply: { matched: true, user_id: member.id, name: member.name, member_id: member.member_id } };
      await openBorrow(); await started;
      await dialog.getByRole('status').filter({ hasText: 'Scanning…' }).waitFor();
      await page.screenshot({ path: path.join(artifacts, `borrow-scanning-${width}.png`) });
      await dialog.getByRole('button', { name: 'Use email or Member ID instead', exact: true }).click();
      await stopped(); releaseResponse(); await finished;
      await dialog.getByLabel('Email or Member ID', { exact: true }).waitFor();
      assert.equal(await dialog.getByRole('heading', { name: 'Member reservations', exact: false }).count(), 0);
      await closeBorrow();

      await openBorrow(); await waitForCamera();
      await dialog.getByRole('status').filter({ hasText: 'No face detected' }).waitFor();
      assert.equal(await dialog.locator('video').count(), 1);
      faceReply = { matched: false, message: 'too_dark' };
      await dialog.getByRole('status').filter({ hasText: 'Too dark' }).waitFor();
      faceReply = { matched: false, message: 'not_recognized' };
      await dialog.getByRole('status').filter({ hasText: 'Face not recognized' }).waitFor();
      faceReply = { matched: false, message: 'liveness_uncertain' };
      await dialog.getByRole('status').filter({ hasText: 'Live face not confirmed' }).waitFor();
      assert.equal(await dialog.getByRole('heading', { name: 'Member reservations', exact: false }).count(), 0);
      faceReply = { matched: true, user_id: member.id, name: member.name, member_id: member.member_id };
      await dialog.getByRole('heading', { name: 'Member reservations (0)', exact: true }).waitFor();
      await stopped(); await closeBorrow();

      faceReply = { matched: false, message: 'no_face' };
      await openBorrow(); await waitForCamera(); await closeBorrow();
      await openBorrow(); await waitForCamera();
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await dialog.getByLabel('Email or Member ID', { exact: true }).waitFor(); await stopped();
      await page.evaluate(() => { delete document.hidden; }); await closeBorrow();

      await page.evaluate(() => { window.cameraDenied = true; }); await openBorrow();
      await dialog.getByRole('alert').filter({ hasText: 'Camera unavailable' }).waitFor();
      await dialog.getByLabel('Email or Member ID', { exact: true }).waitFor();
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: path.join(artifacts, `borrow-email-${width}.png`) });
      await page.evaluate(() => { window.cameraDenied = false; });
      await dialog.getByRole('button', { name: 'Face recognition', exact: true }).click();
      await waitForCamera(); await closeBorrow();

      await page.getByRole('button', { name: 'Return books', exact: true }).click();
      const returnDialog = page.getByRole('dialog', { name: 'Return Books', exact: true });
      await returnDialog.getByLabel('Library QR code', { exact: true }).waitFor();
      assert.equal(await returnDialog.locator('video').count(), 0);
      assert.equal(await returnDialog.getByRole('heading', { name: 'Identify the borrowing member' }).count(), 0);
      await returnDialog.getByRole('button', { name: 'Close', exact: true }).click();
      assert.deepEqual(writes, [], 'Identity and scan preparation must not record transactions');
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      results.push({ width, automaticScanning: true, automaticRetries: true, emailFallback: true, cameraCleanup: true,
        uncertainFaceBlocked: true, returnFlowUnchanged: true, transactionsWritten: writes.length });
      console.log(`PASS ${width}px: automatic scanning/retries, lighting and recognition feedback, exact email fallback, PAD rejection, camera cleanup, camera denial and retry, unchanged returns`);
      await context.close();
    }
    await writeFile(path.join(artifacts, 'checks.json'), JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
