import worker from '../src/index.js';

const ENV = { PI_API_KEY: 'test-key', ALLOWED_ORIGINS: 'https://yao-pi.github.io', TIP_AMOUNT: '0.1' };
const ORIGIN = 'https://yao-pi.github.io';

let calls = [];
function mockPi({ uid = 'user-1', payment = {}, meOk = true, approveOk = true, completeOk = true } = {}) {
  const base = {
    identifier: 'pay-1', user_uid: 'user-1', amount: 0.1,
    status: { developer_approved: false, developer_completed: false, cancelled: false, user_cancelled: false },
    ...payment,
  };
  globalThis.fetch = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${url.replace('https://api.minepi.com/v2', '')}`);
    const J = (b, ok = true) => new Response(JSON.stringify(b), { status: ok ? 200 : 400 });
    if (url.endsWith('/me')) return meOk ? J({ uid }) : new Response('{}', { status: 401 });
    if (url.endsWith('/approve')) return approveOk ? J({ ...base, status: { ...base.status, developer_approved: true } }) : J({}, false);
    if (url.endsWith('/complete')) return completeOk ? J({ ...base, status: { ...base.status, developer_completed: true } }) : J({}, false);
    if (url.includes('/payments/')) return J(base);
    throw new Error('unexpected ' + url);
  };
}

async function post(path, body, origin = ORIGIN) {
  calls = [];
  const res = await worker.fetch(new Request(`https://w.dev${path}`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), ENV);
  return { status: res.status, body: await res.json(), cors: res.headers.get('Access-Control-Allow-Origin'), calls: [...calls] };
}

const results = [];
const check = (name, cond, detail) => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + JSON.stringify(detail)}`);

// 1. happy path approve
mockPi();
let r = await post('/approve', { paymentId: 'pay-1', accessToken: 'tok' });
check('approve: 200 + calls /me, GET payment, POST approve', r.status === 200 && r.body.ok && r.calls.join('|') === 'GET /me|GET /payments/pay-1|POST /payments/pay-1/approve', r);
check('approve: CORS echoes allowed origin', r.cors === ORIGIN, r.cors);

// 2. happy path complete
mockPi();
r = await post('/complete', { paymentId: 'pay-1', txid: 'tx-abc', accessToken: 'tok' });
check('complete: 200 + POST complete', r.status === 200 && r.body.ok && r.calls.includes('POST /payments/pay-1/complete'), r);

// 3. bad token
mockPi({ meOk: false });
r = await post('/approve', { paymentId: 'pay-1', accessToken: 'bad' });
check('approve: 401 on invalid access token', r.status === 401, r);

// 4. amount tampering
mockPi({ payment: { amount: 0.0001 } });
r = await post('/approve', { paymentId: 'pay-1', accessToken: 'tok' });
check('approve: 400 when amount != 0.1', r.status === 400 && !r.calls.some(c => c.includes('approve')), r);

// 5. payment belongs to someone else
mockPi({ uid: 'user-2' });
r = await post('/approve', { paymentId: 'pay-1', accessToken: 'tok' });
check('approve: 403 when uid mismatch', r.status === 403, r);

// 6. cancelled payment
mockPi({ payment: { status: { cancelled: true } } });
r = await post('/complete', { paymentId: 'pay-1', txid: 'tx', accessToken: 'tok' });
check('complete: 409 when cancelled', r.status === 409, r);

// 7. idempotency
mockPi({ payment: { status: { developer_completed: true } } });
r = await post('/complete', { paymentId: 'pay-1', txid: 'tx', accessToken: 'tok' });
check('complete: idempotent, no second POST', r.status === 200 && r.body.alreadyCompleted && !r.calls.some(c => c.includes('/complete')), r);

// 8. Pi rejects completion -> must NOT report success
mockPi({ completeOk: false });
r = await post('/complete', { paymentId: 'pay-1', txid: 'forged', accessToken: 'tok' });
check('complete: 502 when Pi rejects (forged txid not credited)', r.status === 502 && !r.body.ok, r);

// 9. missing txid
mockPi();
r = await post('/complete', { paymentId: 'pay-1', accessToken: 'tok' });
check('complete: 400 without txid', r.status === 400, r);

// 10. disallowed origin
mockPi();
r = await post('/approve', { paymentId: 'pay-1', accessToken: 'tok' }, 'https://evil.example');
check('approve: 403 from disallowed origin, no CORS header', r.status === 403 && r.cors === null, r);

// 11. preflight
const pre = await worker.fetch(new Request('https://w.dev/approve', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), ENV);
check('OPTIONS: 204 preflight with CORS', pre.status === 204 && pre.headers.get('Access-Control-Allow-Origin') === ORIGIN, pre.status);

// 12. missing API key
const res12 = await worker.fetch(new Request('https://w.dev/approve', { method: 'POST', headers: { Origin: ORIGIN }, body: '{}' }), { ...ENV, PI_API_KEY: '' });
check('approve: 500 when PI_API_KEY unset', res12.status === 500, res12.status);

// 13. unknown route
mockPi();
r = await post('/nope', {});
check('unknown route: 404', r.status === 404, r);

console.log(results.join('\n'));
console.log('\n' + results.filter(r => r.startsWith('PASS')).length + '/' + results.length + ' passed');
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
