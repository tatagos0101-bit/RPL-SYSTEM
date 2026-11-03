"""Local UI acceptance with synthetic API responses; requires Python Playwright and Edge.

Run a Vite server on localhost:5187, then python frontend/tests/circulation_browser.py.
This does not contact the deployed API or certify physical scanning equipment.
"""
import json
import os
import time
import base64
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright
import qrcode

BASE = os.environ.get('QR_BROWSER_BASE', 'http://127.0.0.1:5187')
assert urlparse(BASE).hostname in ('127.0.0.1', 'localhost'), 'Use a local test server only'
ARTIFACTS = Path(os.environ.get('QR_BROWSER_ARTIFACTS', '.tools/qr-browser'))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
qr_bytes = BytesIO()
qrcode.make('RPL-BOOK-00001-C001').save(qr_bytes, format='PNG')
QR_IMAGE = 'data:image/png;base64,' + base64.b64encode(qr_bytes.getvalue()).decode()


def row(number, mode='return'):
    return dict(book_id=number, title=f'Synthetic book {number}', copy_id=number,
                copy_number=1, copy_qr=f'RPL-BOOK-{number:05d}-C001', available=True,
                copy_status='available', due_date='2026-11-07T12:00:00+08:00',
                **(dict(transaction_id=number + 100, user_id=number + 10,
                        member_name=f'Synthetic member {number}', member_id=f'SYN-{number}',
                        estimated_fine='0') if mode == 'return' else {}))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    for width, height in [(1440, 1000), (390, 844)]:
        context = browser.new_context(viewport=dict(width=width, height=height))
        context.add_init_script("""navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException('Synthetic camera denial', 'NotAllowedError');
        };""")
        page = context.new_page()
        def wait_for_condition(expression, arg=None):
            # Playwright's wait_for_function uses eval internally, which the production CSP denies.
            # Evaluate directly through the browser debugger without weakening the served policy.
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if page.evaluate(expression, arg):
                    return
                page.wait_for_timeout(50)
            raise AssertionError('Timed out waiting for synthetic browser state')

        errors, writes, scans = [], [], []
        receipts = {}
        unknown = [False]
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' and not message.text.startswith('Failed to load resource:') else None)

        def route_api(route):
            request = route.request
            if request.resource_type not in ('xhr', 'fetch'):
                return route.continue_()
            path = urlparse(request.url).path
            params = parse_qs(urlparse(request.url).query)
            status = 200
            if path.endswith('/profile'):
                data = dict(id=1, name='Synthetic librarian', role='librarian', must_change_password=False)
            elif path.endswith('/transactions/count'):
                data = dict(total=0, borrowed=0, returned=0, overdue=0)
            elif path.endswith('/transactions/scan'):
                scans.append(params['code'][0])
                number = 2 if '00002' in params['code'][0] else 1
                data = dict(qr_type='copy', candidates=[row(number, params['mode'][0])])
                if params['code'][0] == 'RPL-00001':
                    data = dict(qr_type='book', candidates=[row(1, params['mode'][0]), row(2, params['mode'][0])])
            elif path.endswith('/borrowing-capacity'):
                data = dict(active_loans=0, ready_reservations=0, pending_reservations=0, limit=5, remaining_slots=5, borrowing_restrictions=[])
            elif path.endswith('/users'):
                data = [dict(id=11, name='Synthetic member 1', member_id='SYN-1', role='member', status='active')]
            elif path.endswith('/face-lookup'):
                data = dict(matched=True, user_id=11, name='Synthetic member 1', member_id='SYN-1')
            elif '/write-requests/' in path:
                data = receipts.get(path.rsplit('/', 1)[1])
                if data is None:
                    status, data = 404, dict(detail='No receipt yet')
            elif path.endswith('/return') or path.endswith('/borrow'):
                writes.append(dict(key=request.headers.get('idempotency-key'), body=request.post_data_json))
                assert writes[-1]['key']
                operation = path.rsplit('/', 1)[1]
                if operation == 'return':
                    assert writes[-1]['body']['transaction_id']
                data = dict(id=request.post_data_json.get('transaction_id', 201), fine_amount='0',
                            due_date='2026-11-07T12:00:00+08:00', return_date='2026-10-31T12:00:00+08:00')
                if unknown[0]:
                    status, data = 503, dict(detail='Synthetic lost response')
                else:
                    receipts[writes[-1]['key']] = dict(operation=operation, result=data)
            else:
                data = []
            route.fulfill(status=status, json=data)

        page.route('**/api/**', route_api)
        if os.environ.get('QR_BROWSER_CSP') == 'true':
            config = json.loads((Path(__file__).resolve().parents[2] / 'vercel.json').read_text())
            policy = next(header['value'] for group in config['headers'] for header in group['headers'] if header['key'] == 'Content-Security-Policy')
            def with_csp(route):
                if route.request.resource_type != 'document':
                    return route.fallback()
                response = route.fetch()
                route.fulfill(response=response, headers={**response.headers, 'content-security-policy': policy})
            page.route(BASE + '/**', with_csp)
        page.goto(BASE + '/librarian/borrow-return')
        page.get_by_role('button', name='Quick Scan Session', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_role('button', name='Return Books', exact=True).click()
        assert not dialog.get_by_label('Member ID', exact=True).count()
        dialog.get_by_role('button', name='Start QR camera').click()
        dialog.get_by_text('Camera permission denied.', exact=False).wait_for()
        code_input = dialog.get_by_label('Library QR code', exact=True)

        def scan(code):
            code_input.fill(code)
            code_input.press('Enter')

        scan('RPL-BOOK-00001-C001')
        dialog.get_by_role('heading', name='Pending list (1)', exact=True).wait_for()
        scan('RPL-BOOK-00001-C001')
        scan('RPL-BOOK-00002-C001')
        dialog.get_by_role('heading', name='Pending list (2)', exact=True).wait_for()
        assert len(writes) == 0 and scans.count('RPL-BOOK-00001-C001') == 1
        dialog.get_by_role('button', name='Review list').click()
        assert not dialog.locator('video').count()
        assert dialog.get_by_text('Synthetic member 1', exact=False).count() == 1
        assert dialog.get_by_text('Synthetic member 2', exact=False).count() == 1
        assert dialog.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
        page.screenshot(path=str(ARTIFACTS / f'return-review-{width}.png'))
        dialog.get_by_role('button', name='Confirm Returns').click()
        wait_for_condition("document.querySelectorAll('article [role=status]').length === 2")
        assert len(writes) == 2 and writes[0]['body']['user_id'] != writes[1]['body']['user_id']
        assert page.evaluate("JSON.parse(localStorage.getItem('rpl:circulation:v1:1')).length") == 0
        dialog.get_by_role('button', name='Close', exact=True).click()

        # Borrowing uses supervised ID, then explicit legacy-copy choice.
        page.get_by_role('button', name='Quick Scan Session', exact=True).click()
        dialog.get_by_role('button', name='Borrow Books', exact=True).click()
        dialog.get_by_label('Member ID', exact=True).fill('SYN-1')
        dialog.get_by_role('button', name='Identify member', exact=True).click()
        code_input = dialog.get_by_label('Library QR code', exact=True)
        scan('RPL-00001')
        dialog.get_by_role('heading', name='Choose the physical copy / active loan').wait_for()
        assert len(writes) == 2
        dialog.get_by_role('button', name='Synthetic book 2', exact=False).click()
        dialog.get_by_role('heading', name='Pending list (1)', exact=True).wait_for()
        scan('RPL-BOOK-00001-C001')
        dialog.get_by_role('heading', name='Pending list (2)', exact=True).wait_for()
        dialog.get_by_role('button', name='Review list').click()
        unknown[0] = True
        dialog.get_by_role('button', name='Confirm Borrowing').click()
        dialog.get_by_role('heading', name='Unresolved requests', exact=False).wait_for()
        assert len(writes) == 3  # Second item must not be submitted after unknown outcome.
        original_key = writes[-1]['key']
        page.reload()
        page.get_by_role('button', name='Quick Scan Session', exact=True).click()
        dialog.get_by_role('heading', name='Unresolved requests', exact=False).wait_for()
        assert len(writes) == 3  # Reload must never replay.
        unknown[0] = False
        dialog.get_by_role('button', name='Retry original request', exact=True).click()
        dialog.get_by_text('Confirmed borrow, transaction 201.', exact=True).wait_for()
        assert writes[-1]['key'] == original_key and len(writes) == 4

        # Exercise the real bundled decoder with a synthetic camera stream.
        dialog.get_by_role('button', name='Close', exact=True).click()
        page.evaluate("""async imageUrl => {
            const image = new Image(); image.src = imageUrl; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 640;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,640,640);
            ctx.drawImage(image, 100,100,440,440);
            window.syntheticCanvas = canvas; window.cameraStops = 0;
            navigator.mediaDevices.getUserMedia = async () => {
                const stream = canvas.captureStream(10);
                const ticker = setInterval(() => ctx.drawImage(image, 100,100,440,440), 100);
                stream.getTracks().forEach(track => {
                    const stop = track.stop.bind(track);
                    track.stop = () => { window.cameraStops++; clearInterval(ticker); stop(); };
                });
                return stream;
            };
            navigator.mediaDevices.enumerateDevices = async () => [
                {kind:'videoinput', deviceId:'synthetic-camera', label:'Synthetic QR camera'}
            ];
        }""", QR_IMAGE)
        page.get_by_role('button', name='Quick Scan Session', exact=True).click()
        dialog.get_by_role('button', name='Borrow Books', exact=True).click()
        dialog.get_by_role('button', name='Face recognition', exact=True).click()
        wait_for_condition("document.querySelector('dialog video')?.readyState >= 2")
        dialog.get_by_role('button', name='Identify member', exact=True).click()
        dialog.get_by_label('Library QR code', exact=True).wait_for()
        assert page.evaluate('window.cameraStops') >= 1  # Face stream released first.
        stops = page.evaluate('window.cameraStops')
        dialog.get_by_role('button', name='Start QR camera').click()
        dialog.get_by_role('heading', name='Pending list (1)', exact=True).wait_for()
        assert len(writes) == 4
        page.screenshot(path=str(ARTIFACTS / f'qr-camera-{width}.png'))
        dialog.get_by_label('Camera', exact=True).select_option('synthetic-camera')
        wait_for_condition('(previous) => window.cameraStops > previous', arg=stops)
        wait_for_condition("document.querySelector('dialog video')?.readyState >= 2")
        stops = page.evaluate('window.cameraStops')
        page.evaluate("Object.defineProperty(document, 'hidden', {configurable:true, get:() => true}); document.dispatchEvent(new Event('visibilitychange'))")
        dialog.get_by_role('button', name='Start QR camera').wait_for()
        assert page.evaluate('window.cameraStops') > stops
        page.evaluate("delete document.hidden")
        dialog.get_by_role('button', name='Start QR camera').click()
        wait_for_condition("document.querySelector('dialog video')?.readyState >= 2")
        stops = page.evaluate('window.cameraStops')
        dialog.get_by_role('button', name='Review list').click()
        assert page.evaluate('window.cameraStops') > stops
        assert not page.locator('vite-error-overlay').count()
        assert not errors, errors
        print(f'PASS {width}px: mixed returns, review-only scans, denial, duplicates, legacy choice, ID/face borrow, recovery, real QR decoder, camera switch/hidden/review cleanup')
        context.close()
    browser.close()
