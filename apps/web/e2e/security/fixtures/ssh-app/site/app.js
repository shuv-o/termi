// A hostile tunneled app: tries everything an attacker would.
(async () => {
    const r = { origin: self.origin };
    const attempt = async (k, url, opts) => {
        try {
            const res = await fetch(url, opts);
            r[k] = res.status + (k === 'data' ? ':' + (await res.text()).trim() : '');
        } catch {
            r[k] = 'blocked';
        }
    };
    await attempt('data', 'data.json');
    await attempt('postJson', 'echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' });
    await attempt('apiServers', '/api/servers', { credentials: 'include' });
    await attempt('apiToken', '/api/connection/token', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: '{"serverId":"x","protocol":"ssh"}',
    });
    try { localStorage.setItem('k', '1'); r.localStorage = 'ok'; } catch { r.localStorage = 'blocked'; }
    try { document.cookie = 'appcookie=1; path=/'; r.cookie = document.cookie.includes('appcookie') ? 'ok' : 'empty'; } catch { r.cookie = 'blocked'; }
    try { await navigator.serviceWorker.register('sw.js'); r.serviceWorker = 'registered'; } catch { r.serviceWorker = 'blocked'; }
    document.getElementById('out').textContent = JSON.stringify(r);
    document.title = 'done';
})();
