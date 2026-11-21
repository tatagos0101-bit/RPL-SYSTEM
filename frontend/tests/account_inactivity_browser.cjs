const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const base = process.env.INACTIVITY_BROWSER_BASE || 'http://localhost:5188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const member = { id: 11, name: 'Synthetic member', member_id: 'SYN-11', role: 'member',
  active_loans: 0, status: 'active', joined_at: '2024-01-01T08:00:00+08:00', created_at: '2024-01-01T08:00:00+08:00' };
const fixtureNotice = () => ({
  id: '11111111-1111-4111-8111-111111111111', user_id: 11, member_name: member.name, member_id: member.member_id,
  notification_id: 41, last_activity_at: '2025-01-01T08:00:00+08:00', inactive_days: 600,
  created_at: '2026-11-01T08:00:00+08:00', respond_by: '2026-11-04T08:00:00+08:00', status: 'waiting',
  delivery_channel: 'email', delivery_status: 'unknown', has_outstanding_loans: false,
  message: 'Hello Synthetic member, how are you? We have not seen recorded activity for a while. Please let us know within three days if you would like to keep your library account. We would love to welcome you back.',
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async check => {
  for (let i = 0; i < 60; i++) { if (await check()) return; await sleep(50); }
  throw Error('Expected browser state was not reached.');
};

// Every API request is fulfilled locally: no real patrons, messages or deletions.
async function scenario(browser, role, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 1000 } });
  await context.addInitScript(theme => localStorage.setItem('theme', theme), options.theme || 'dark');
  const page = await context.newPage();
  const state = { notice: null, eligible: true, lastActivity: '2025-01-01T08:00:00+08:00', loans: 0, requests: [],
    reviewFailures: 0, listFailures: 0, keepFailures: 0, deleted: false, listTotal: 1, ...options.state };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route('**/api/**', async route => {
    const req = route.request();
    if (!['xhr', 'fetch'].includes(req.resourceType()) && req.method() !== 'OPTIONS') return route.continue();
    const headers = { 'access-control-allow-origin': new URL(base).origin, 'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET, POST, DELETE, PATCH, OPTIONS', 'access-control-allow-headers': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(req.url()), pathname = url.pathname, method = req.method();
    state.requests.push({ pathname, method, search: url.search, body: req.postDataJSON() });
    let data = [], status = 200;
    const fail = detail => { data = { detail }; status = 503; };
    if (pathname.endsWith('/auth/session')) data = { ...member, role };
    else if (pathname.endsWith('/librarian/users')) data = state.deleted ? [] : [{ ...member, active_loans: state.loans }];
    else if (pathname.endsWith('/count') || pathname.endsWith('/librarian/users/stats')) data = { total: state.deleted ? 0 : 1, active: 1, suspended: 0 };
    else if (pathname === '/api/librarian/member/11/account-notice') {
      if (method === 'POST') {
        if (req.postDataJSON()?.current_password !== 'synthetic-password') { status = 403; data = { detail: 'Incorrect current password.' }; }
        else { state.notice = fixtureNotice(); state.eligible = false; data = state.notice; }
      } else if (state.reviewFailures-- > 0) fail('Synthetic activity service unavailable.');
      else data = { notice: state.notice, last_activity_at: state.lastActivity, inactive_days: state.lastActivity ? 600 : null,
        eligible: state.eligible, has_outstanding_loans: state.loans > 0, inactivity_months: 6, response_hours: 72 };
    } else if (pathname === '/api/librarian/account-notices') {
      if (state.listFailures-- > 0) fail('Synthetic list unavailable.');
      else {
        const visible = !state.deleted && state.notice && ['waiting', 'ready_for_review'].includes(state.notice.status)
          && (url.searchParams.get('status') !== 'ready_for_review' || state.notice.status === 'ready_for_review');
        const skip = Number(url.searchParams.get('skip') || 0);
        data = { items: visible ? [{ ...state.notice, id: skip ? '22222222-2222-4222-8222-222222222222' : state.notice.id,
          member_name: skip ? 'Synthetic next-page member' : member.name }] : [], total: visible ? state.listTotal : 0 };
      }
    } else if (pathname === '/api/librarian/account-notices/check') { await sleep(120); data = { created: 0, processed: 1 }; }
    else if (pathname.endsWith('/record-reply')) { state.notice = { ...state.notice, status: 'cancelled' }; state.eligible = false; data = state.notice; }
    else if (pathname.endsWith('/approve') || (pathname === '/api/librarian/users/11' && method === 'DELETE')) {
      state.deleted = true; state.notice = state.notice ? { ...state.notice, status: 'deleted' } : null; data = { status: 'deleted' };
    } else if (pathname === '/api/user/account-notice') data = { notice: state.notice };
    else if (/\/api\/user\/account-notices\/[^/]+\/keep$/.test(pathname)) {
      await sleep(150);
      if (state.keepFailures-- > 0) fail('Synthetic response failure.');
      else { state.notice = { ...state.notice, status: 'cancelled' }; data = state.notice; }
    } else if (/\/notifications\/\d+$/.test(pathname)) data = { id: Number(pathname.split('/').pop()), type: 'account_inactivity',
      message: fixtureNotice().message, is_read: true, created_at: fixtureNotice().created_at };
    else if (pathname === '/api/user/profile') data = { ...member, location: 'Synthetic location', email: null, phone: null, avatar_url: null };
    else if (pathname === '/api/user/biometric-status') data = { has_face: false };
    else if (pathname === '/api/user/reading-stats') data = { books_borrowed: 0, books_read: 0, genres: [] };
    else if (pathname === '/api/user/fines') data = { total_fine: 0, overdue_loans: [] };
    return route.fulfill({ status, headers, json: data });
  });
  return { page, state, context, errors };
}
async function openReview(page) {
  await page.goto(base + '/librarian/users');
  await page.getByRole('button', { name: 'Actions for Synthetic member' }).click();
  await page.getByRole('button', { name: 'Delete Account', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Account activity review' });
  await dialog.waitFor();
  return dialog;
}
async function healthy(page, errors) {
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.deepEqual(errors, []);
  assert.ok(await page.title());
  assert.ok(await page.locator('body').innerText());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must not overflow horizontally.');
}
async function run() {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.INACTIVITY_BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const shots = await fs.mkdtemp(path.join(os.tmpdir(), 'rpl-inactivity-ui-'));
  try {
    // A confirmed Keep response must remain visible on Profile.
    {
      const { page, state, context, errors } = await scenario(browser, 'member', { state: { notice: fixtureNotice() } });
      await page.goto(base + '/user/profile');
      const panel = page.getByRole('region', { name: 'Membership check-in' });
      await panel.getByRole('button', { name: 'Keep my account' }).click();
      await until(async () => state.notice.status === 'cancelled');
      await panel.getByText('Account kept active', { exact: true }).waitFor({ timeout: 3000 });
      await healthy(page, errors); await context.close();
    }
    // Review first, send with password, record a reply and explicit manual override.
    {
      const { page, state, context, errors } = await scenario(browser, 'librarian');
      const dialog = await openReview(page), send = dialog.getByRole('button', { name: 'Send three-day notice' });
      await send.waitFor(); assert.equal(await send.isDisabled(), true);
      assert.equal(state.requests.some(r => r.method === 'DELETE'), false);
      await dialog.getByLabel('Your librarian password').fill('wrong-password'); await send.click();
      await dialog.getByText('Incorrect current password.', { exact: true }).waitFor();
      await dialog.getByLabel('Your librarian password').fill('synthetic-password'); await send.click();
      await dialog.getByText(/Email delivery is unconfirmed/).waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Review deletion approval' }).count(), 0);
      await page.screenshot({ path: path.join(shots, 'librarian-desktop.png') });
      await dialog.getByRole('button', { name: 'Record member reply' }).click();
      await dialog.getByText('Account kept active', { exact: true }).first().waitFor();
      await dialog.getByRole('button', { name: 'Delete account now', exact: true }).click();
      const deletion = page.getByRole('dialog', { name: 'Delete Account', exact: true });
      await deletion.getByText(/immediate manual deletion/).waitFor();
      await deletion.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(state.requests.some(r => r.method === 'DELETE'), false);
      await healthy(page, errors); await context.close();
    }
    // Mature approval, pagination, status filter and confirmed-deletion refresh.
    {
      const { page, state, context, errors } = await scenario(browser, 'librarian',
        { state: { notice: { ...fixtureNotice(), status: 'ready_for_review' }, listTotal: 21 } });
      await page.goto(base + '/librarian/users');
      await page.getByRole('button', { name: 'Review notices', exact: true }).click();
      await page.getByRole('button', { name: 'Next notices', exact: true }).click();
      await page.getByRole('button', { name: 'Review Synthetic next-page member', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Previous notices', exact: true }).click();
      await page.getByLabel('Notice status').selectOption('ready_for_review');
      await page.getByRole('button', { name: 'Review Synthetic member', exact: true }).click();
      await page.getByRole('dialog', { name: 'Account activity review' }).getByRole('button', { name: 'Review deletion approval' }).click();
      const deletion = page.getByRole('dialog', { name: 'Approve Account Deletion' });
      const approve = deletion.getByRole('button', { name: 'Approve Account Deletion', exact: true });
      assert.equal(await approve.isDisabled(), true);
      await deletion.getByLabel('Your librarian password').fill('synthetic-password');
      assert.equal(await approve.isDisabled(), true);
      await deletion.getByLabel('Type DELETE to confirm').fill('DELETE'); await approve.click();
      await deletion.getByText(/Account deleted\. Completed history/).waitFor();
      await deletion.getByRole('button', { name: 'Done', exact: true }).click();
      await page.getByText('No pending account notices in this view.', { exact: true }).waitFor({ timeout: 3000 });
      assert.equal(state.requests.filter(r => r.pathname.endsWith('/approve')).length, 1);
      assert.equal(state.requests.some(r => r.method === 'DELETE'), false);
      assert.ok(state.requests.some(r => r.search.includes('skip=20')));
      await healthy(page, errors); await context.close();
    }
    // The librarian's immediate override remains available for a recent member.
    {
      const { page, state, context, errors } = await scenario(browser, 'librarian',
        { state: { eligible: false, lastActivity: new Date().toISOString() } });
      const review = await openReview(page);
      await review.getByText('No inactivity notice needed', { exact: true }).waitFor();
      await review.getByRole('button', { name: 'Delete account now', exact: true }).click();
      const deletion = page.getByRole('dialog', { name: 'Delete Account', exact: true });
      await deletion.getByLabel('Your librarian password').fill('synthetic-password');
      await deletion.getByLabel('Type DELETE to confirm').fill('DELETE');
      await deletion.getByRole('button', { name: 'Delete Account', exact: true }).click();
      await deletion.getByText(/Account deleted\. Completed history/).waitFor();
      assert.equal(state.requests.filter(r => r.method === 'DELETE' && r.pathname === '/api/librarian/users/11').length, 1);
      await healthy(page, errors); await context.close();
    }
    // Retry, missing dates, outstanding-book safeguard, keyboard close and mobile.
    {
      const { page, state, context, errors } = await scenario(browser, 'librarian', { viewport: { width: 390, height: 844 },
        theme: 'light', state: { reviewFailures: 1, lastActivity: null, eligible: false, loans: 1 } });
      const dialog = await openReview(page);
      await dialog.getByRole('button', { name: 'Retry activity review' }).click();
      await dialog.getByText('Not recorded', { exact: true }).waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Send three-day notice' }).count(), 0);
      await page.screenshot({ path: path.join(shots, 'librarian-mobile.png') });
      await dialog.getByRole('button', { name: 'Delete account now', exact: true }).click();
      const deletion = page.getByRole('dialog', { name: 'Delete Account', exact: true });
      await deletion.getByText('Return all outstanding books before deleting this account.').waitFor();
      assert.equal(await deletion.getByLabel('Your librarian password').count(), 0);
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByRole('button', { name: 'Review notices', exact: true }).click();
      state.listFailures = 1;
      await page.getByLabel('Notice status').selectOption('ready_for_review');
      await page.getByRole('button', { name: 'Retry notices' }).click();
      await page.getByText('No pending account notices in this view.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Check activity', exact: true }).click();
      await page.getByText('Activity checked. 0 new account notices created.', { exact: true }).waitFor();
      await healthy(page, errors); await context.close();
    }
    // Notification detail, unconfirmed response, retry and duplicate-click guard.
    {
      const { page, state, context, errors } = await scenario(browser, 'member', { viewport: { width: 390, height: 844 },
        state: { notice: fixtureNotice(), keepFailures: 1 } });
      await page.goto(base + '/user/notifications/41');
      const panel = page.getByRole('region', { name: 'Membership check-in' }), keep = panel.getByRole('button', { name: 'Keep my account' });
      await keep.click(); await panel.getByText(/Keeping your account was not confirmed/).waitFor();
      const contrast = await keep.evaluate(button => {
        const style = getComputedStyle(button);
        const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(v => {
          const c = Number(v) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
        }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const fg = luminance(style.color), bg = luminance(style.backgroundColor);
        return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
      });
      assert.ok(contrast >= 4.5, 'Hovered member response button must have readable text contrast.');
      assert.equal(await page.getByText(fixtureNotice().message, { exact: true }).count(), 1);
      await page.screenshot({ path: path.join(shots, 'member-mobile.png') });
      await keep.evaluate(button => { button.click(); button.click(); });
      await panel.getByText('Account kept active', { exact: true }).waitFor();
      assert.equal(state.requests.filter(r => r.pathname.endsWith('/keep')).length, 2);
      await healthy(page, errors);
      state.notice = { ...fixtureNotice(), notification_id: 42 };
      await page.reload();
      await page.getByText(/This message is not the current account review/).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Keep my account' }).count(), 0);
      state.notice = fixtureNotice();
      await page.goto(base + '/user/home');
      await page.getByRole('region', { name: 'Membership check-in' }).waitFor();
      await healthy(page, errors);
      await context.close();
    }
    console.log('PASS: member response, notice send/reply/approval, guards, queue refresh, errors, desktop/mobile.');
    console.log('Synthetic screenshot folder: ' + shots);
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
