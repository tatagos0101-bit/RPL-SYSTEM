// Optional local browser acceptance with synthetic identities, loans and camera frames.
// No real accounts, biometric images, or circulation records are accessed.
const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.QR_BROWSER_BASE || 'http://localhost:5173';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use an isolated local server');
const artifacts = process.env.QR_BROWSER_ARTIFACTS || path.join(tmpdir(), 'rpl-member-first-returns');
const librarian = { id: 1, name: 'Synthetic librarian', role: 'librarian', must_change_password: false };
const member = { id: 11, name: 'Synthetic member', member_id: 'SYN-11', email: 'returner@example.test' };
const loans = [
  { transaction_id: 101, book_id: 1, copy_id: 1001, copy_number: 1, book_title: 'Synthetic shared title', book_author: 'Synthetic author', status: 'active', due_date: '2026-12-01T12:00:00+08:00', fine_amount: '0' },
  { transaction_id: 102, book_id: 1, copy_id: 1002, copy_number: 2, book_title: 'Synthetic shared title', book_author: 'Synthetic author', status: 'active', due_date: '2026-12-01T12:00:00+08:00', fine_amount: '0' },
  { transaction_id: 103, book_id: 3, copy_id: null, copy_number: null, book_title: 'Synthetic legacy loan', book_author: 'Synthetic author', status: 'overdue', due_date: '2026-11-01T12:00:00+08:00', fine_amount: '20' },
];
const scanRow = (loan, userId = member.id) => ({ ...loan, title: loan.book_title, user_id: userId,
  member_name: userId === member.id ? member.name : 'Other synthetic member', member_id: `SYN-${userId}`, estimated_fine: loan.fine_amount });

async function run() {
  await mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch(process.env.CIRCULATION_BROWSER_EXECUTABLE
    ? { executablePath: process.env.CIRCULATION_BROWSER_EXECUTABLE, headless: true }
    : { channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        localStorage.setItem('theme', 'dark');
        window.syntheticStreams = []; window.cameraDenied = false;
        navigator.mediaDevices.getUserMedia = async () => {
          if (window.cameraDenied) throw new DOMException('Synthetic denial', 'NotAllowedError');
          const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
          const drawing = canvas.getContext('2d'); drawing.fillStyle = '#3a3026'; drawing.fillRect(0, 0, 640, 480);
          drawing.fillStyle = '#edbf72'; drawing.font = '22px sans-serif'; drawing.fillText('Synthetic camera — no face image', 100, 240);
          const stream = canvas.captureStream(10);
          const timer = setInterval(() => drawing.fillRect(0, 0, 1, 1), 100);
          stream.getTracks().forEach(track => { const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); }; });
          window.syntheticStreams.push(stream); return stream;
        };
      });
      const page = await context.newPage(), errors = [], writes = [], scans = [], loanRequests = [];
      const confirmed = new Set();
      let faceReply = { matched: false, message: 'no_face' }, loanMode = 'success', heldLoan = null;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        const request = route.request();
        if (!['xhr', 'fetch'].includes(request.resourceType()) && request.method() !== 'OPTIONS') return route.continue();
        const url = new URL(request.url()), endpoint = url.pathname;
        const headers = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-credentials': 'true',
          'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        let data = [];
        if (endpoint.endsWith('/auth/session')) data = librarian;
        else if (endpoint.endsWith('/transactions/count')) data = { total: 1, borrowed: 1, returned: 0, overdue: 0 };
        else if (endpoint.endsWith('/transactions')) data = [{ id: 101, user_id: member.id, book_id: 1, copy_id: 1001, book_title: loans[0].book_title, member_name: member.name, member_id: member.member_id, status: 'active', type: 'borrow', due_date: loans[0].due_date }];
        else if (endpoint.endsWith('/librarian/due-books')) data = [{ id: 103, user_id: member.id, book_id: 3, copy_id: null, book_title: loans[2].book_title, member_name: member.name, member_id: member.member_id, status: 'overdue', due_date: loans[2].due_date }];
        else if (endpoint.endsWith('/face-lookup')) data = faceReply;
        else if (endpoint.endsWith('/librarian/users')) data = [member];
        else if (endpoint.endsWith('/active-loans')) {
          loanRequests.push(endpoint);
          if (heldLoan) { const held = heldLoan; heldLoan = null; held.started(); await held.release; }
          if (loanMode === 'error') return route.fulfill({ status: 503, headers, json: { detail: 'Synthetic loan-list failure' } });
          data = loanMode === 'empty' ? [] : loans.filter(loan => !confirmed.has(loan.transaction_id));
        } else if (endpoint.endsWith('/transactions/scan')) {
          const code = url.searchParams.get('code'); scans.push(code);
          data = { candidates: code === 'RPL-BOOK-00009-C001' ? [scanRow({ ...loans[0], transaction_id: 999 }, 22)]
            : [scanRow(loans[1]), scanRow({ ...loans[0], transaction_id: 998 }, 22)] };
        } else if (endpoint.endsWith('/transactions/return')) {
          const payload = request.postDataJSON(), key = request.headers()['idempotency-key'];
          assert.ok(key); writes.push({ payload, key }); confirmed.add(payload.transaction_id);
          data = { id: payload.transaction_id, fine_amount: '0', return_date: '2026-11-21T17:00:00+08:00' };
        } else if (request.method() !== 'GET') throw new Error(`Unexpected mutation: ${endpoint}`);
        await route.fulfill({ status: 200, headers, json: data }).catch(error => { if (!request.failure()) throw error; });
      });
      const dialog = page.getByRole('dialog', { name: 'Return Books', exact: true });
      const open = async () => { await page.getByRole('button', { name: 'Return books', exact: true }).click(); await dialog.waitFor(); };
      const stopped = () => page.waitForFunction(() => window.syntheticStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')));
      const close = async () => { await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await stopped(); };
      const matched = () => { faceReply = { matched: true, user_id: member.id, name: member.name, member_id: member.member_id }; };
      const enterCode = async code => { const input = dialog.getByLabel('Library QR code', { exact: true }); await input.fill(code); await input.press('Enter'); };
      await page.goto(base + '/librarian/borrow-return');
      await open();
      await dialog.getByRole('status').filter({ hasText: 'No face detected' }).waitFor();
      assert.equal(loanRequests.length, 0);
      assert.equal(await dialog.getByLabel('Library QR code', { exact: true }).count(), 0);
      await page.screenshot({ path: path.join(artifacts, `return-face-${width}.png`) });
      matched();
      await dialog.getByRole('heading', { name: 'Member’s borrowed books (3)', exact: true }).waitFor();
      await stopped();
      assert.equal(loanRequests[0], '/api/librarian/member/11/active-loans');
      assert.equal(await dialog.getByLabel('Library QR code', { exact: true }).count(), 0);
      assert.equal(await dialog.getByRole('button', { name: 'Add to return list', exact: true }).count(), 3);
      assert.equal(await dialog.getByText('Overdue', { exact: true }).count(), 1);
      assert.equal(writes.length, 0);
      assert.equal(scans.length, 0, 'No book-code lookup is required to load borrowed books');
      await page.screenshot({ path: path.join(artifacts, `return-loans-${width}.png`) });
      const legacy = dialog.locator('article').filter({ has: page.getByRole('heading', { name: 'Synthetic legacy loan', exact: true }) });
      const first = dialog.locator('article').filter({ hasText: 'Loan #101' });
      await first.getByRole('button', { name: 'Add to return list', exact: true }).click();
      await legacy.getByRole('button', { name: 'Add to return list', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Pending list (2)', exact: true }).waitFor();
      assert.equal(await first.getByRole('button', { name: 'Add to return list', exact: true }).count(), 0);
      const pending = dialog.locator('section').filter({ has: page.getByRole('heading', { name: 'Pending list (2)', exact: true }) });
      await pending.locator('article').filter({ hasText: 'Loan #101' }).getByRole('button', { name: 'Remove', exact: true }).click();
      await first.getByRole('button', { name: 'Add to return list', exact: true }).click();
      await dialog.getByRole('button', { name: 'Use QR / code instead', exact: true }).click();
      await enterCode('RPL-BOOK-00009-C001');
      await dialog.getByRole('alert').filter({ hasText: 'No active loan for this member' }).waitFor();
      assert.equal(await dialog.getByRole('heading', { name: 'Pending list (2)', exact: true }).count(), 1);
      await enterCode('RPL-BOOK-00001-C002');
      await dialog.getByRole('heading', { name: 'Pending list (3)', exact: true }).waitFor();
      assert.equal(await dialog.getByText('Other synthetic member', { exact: false }).count(), 0);
      await dialog.getByRole('button', { name: 'Hide QR / code fallback', exact: true }).click();
      assert.equal(writes.length, 0);
      await dialog.getByRole('button', { name: 'Review list', exact: true }).click();
      assert.equal(await dialog.getByLabel('Library QR code', { exact: true }).count(), 0);
      assert.equal(await dialog.locator('video').count(), 0);
      await page.screenshot({ path: path.join(artifacts, `return-review-${width}.png`) });
      await dialog.getByRole('button', { name: 'Confirm Returns', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('article [role="status"]').length === 3);
      assert.deepEqual(writes.map(row => row.payload), [
        { user_id: 11, book_id: 3, copy_id: null, transaction_id: 103 },
        { user_id: 11, book_id: 1, copy_id: 1001, transaction_id: 101 },
        { user_id: 11, book_id: 1, copy_id: 1002, transaction_id: 102 },
      ]);
      assert.equal(new Set(writes.map(row => row.key)).size, 3);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('rpl:circulation:v1:1')).length), 0);
      await close();

      // Empty and failed lists never open scanning automatically; refresh can recover.
      loanMode = 'empty'; await open();
      await dialog.getByText('This member has no active borrowed books.', { exact: true }).waitFor();
      assert.equal(await dialog.getByLabel('Library QR code', { exact: true }).count(), 0);
      await close();
      loanMode = 'error'; await page.evaluate(() => { window.cameraDenied = true; }); await open();
      await dialog.getByRole('alert').filter({ hasText: 'Camera unavailable' }).waitFor();
      await dialog.getByLabel('Email or Member ID', { exact: true }).fill(member.email);
      await dialog.getByRole('button', { name: 'Identify member', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'Could not load borrowed books' }).waitFor();
      assert.equal(await dialog.getByText('This member has no active borrowed books.', { exact: true }).count(), 0);
      assert.equal(await dialog.getByLabel('Library QR code', { exact: true }).count(), 0);
      await page.screenshot({ path: path.join(artifacts, `return-error-${width}.png`) });
      loanMode = 'success'; confirmed.clear();
      await dialog.getByRole('button', { name: 'Refresh borrowed books', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Member’s borrowed books (3)', exact: true }).waitFor();
      assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await close(); await page.evaluate(() => { window.cameraDenied = false; });

      // Closing during a loan request must ignore its late response.
      let requestStarted, releaseResponse;
      const started = new Promise(resolve => { requestStarted = resolve; });
      const release = new Promise(resolve => { releaseResponse = resolve; });
      heldLoan = { started: requestStarted, release };
      await open(); await started;
      await dialog.getByRole('status').filter({ hasText: 'Loading this member’s borrowed books' }).waitFor();
      assert.equal(await dialog.getByLabel('Library QR code', { exact: true }).count(), 0);
      await close(); releaseResponse();

      // Transaction-log shortcuts now identify the member instead of bypassing the scan.
      faceReply = { matched: false, message: 'no_face' };
      await page.getByRole('button', { name: 'Return', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Identify the returning member', exact: true }).waitFor();
      assert.equal(await dialog.locator('video').count(), 1);
      assert.equal(await dialog.getByRole('button', { name: 'Confirm Returns', exact: true }).count(), 0);
      await dialog.getByRole('button', { name: 'Use book QR / code instead', exact: true }).click();
      await stopped();
      await dialog.getByLabel('Library QR code', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Back to member identification', exact: true }).click();
      await dialog.getByRole('status').filter({ hasText: 'No face detected' }).waitFor();
      await close();
      await page.goto(base + '/librarian/due-books');
      await page.getByRole('button', { name: 'Returned', exact: true }).click();
      await dialog.getByRole('heading', { name: 'Identify the returning member', exact: true }).waitFor();
      assert.equal(await dialog.locator('video').count(), 1);
      assert.equal(await dialog.getByLabel('Library QR code', { exact: true }).count(), 0);
      await close();
      assert.equal(writes.length, 3, 'Fallback/refresh/identity actions must not submit extra returns');
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      results.push({ width, faceFirst: true, memberLoans: true, noRequiredBookScan: true, exactLegacyAndCopyReturns: true,
        wrongMemberScanBlocked: true, emptyAndErrorRetry: true, quickReturnIdentifies: true, cleanup: true, writes: writes.length });
      console.log(`PASS ${width}px: face-first return, member loan choices, optional guarded QR fallback, exact three-loan payloads, legacy/overdue, empty/error/retry, manual fallback, shortcut and camera cleanup`);
      await context.close();
    }
    await writeFile(path.join(artifacts, 'checks.json'), JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
