/**
 * Offline page behaviour.
 *
 * Loaded as an external script because the app's Content-Security-Policy
 * (script-src 'self' 'nonce-…') blocks inline event handlers — an inline
 * `onclick` on the retry button silently does nothing.
 *
 * Handles a manual "Retry Connection" click (with a real connectivity check)
 * and auto-reloads the moment the browser regains connectivity.
 */
(function () {
    var btn = document.getElementById('retry');
    var status = document.getElementById('status');

    function reload() {
        window.location.reload();
    }

    function setStatus(message) {
        if (status) status.textContent = message || '';
    }

    async function checkAndReload() {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Checking…';
        }
        setStatus('');
        try {
            // Bypass the HTTP and service-worker caches so this is a genuine
            // network probe rather than a cached response.
            await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
            reload();
        } catch {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Retry Connection';
            }
            setStatus('Still offline — check your connection and try again.');
        }
    }

    if (btn) btn.addEventListener('click', checkAndReload);

    // Recover automatically when connectivity is restored.
    window.addEventListener('online', reload);
})();
