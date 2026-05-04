const fetchBtn = document.getElementById('fetch-btn');
const resetBtn = document.getElementById('reset-btn');
const urlInput = document.getElementById('url-input');
const previewArea = document.getElementById('preview-area');
const displayUrl = document.getElementById('display-url');
const status = document.getElementById('status');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnRefresh = document.getElementById('btn-refresh');

const getIframe = () => previewArea.querySelector('iframe');

const executeFetch = async (targetUrl) => {
    if (!targetUrl) return;

    status.innerText = 'OPENING TUNNEL...';
    fetchBtn.disabled = true;

    try {
        const response = await fetch('/fetch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl })
        });

        const data = await response.json();

        if (data.proxyUrl) {
            status.innerText = 'TUNNEL ESTABLISHED.';
            displayUrl.innerText = targetUrl;
            previewArea.innerHTML = `<iframe src="${data.proxyUrl}" title="preview"></iframe>`;

            // Update URL bar when iframe navigates
            const iframe = getIframe();
            iframe.addEventListener('load', () => {
                try {
                    const loc = iframe.contentWindow.location.href;
                    const match = loc.match(/[?&]url=([^&]+)/);
                    if (match) displayUrl.innerText = decodeURIComponent(match[1]);
                } catch (e) {}
            });
        } else {
            throw new Error(data.error || 'Gateway Timeout');
        }
    } catch (err) {
        status.innerText = 'ERROR: ' + err.message;
    } finally {
        fetchBtn.disabled = false;
    }
};

// Navigation controls
btnBack.addEventListener('click', () => {
    const iframe = getIframe();
    if (iframe) {
        try { iframe.contentWindow.history.back(); } catch (e) {}
    }
});

btnForward.addEventListener('click', () => {
    const iframe = getIframe();
    if (iframe) {
        try { iframe.contentWindow.history.forward(); } catch (e) {}
    }
});

btnRefresh.addEventListener('click', () => {
    const iframe = getIframe();
    if (iframe) {
        try { iframe.contentWindow.location.reload(); } catch (e) {}
    }
});

fetchBtn.addEventListener('click', () => executeFetch(urlInput.value.trim()));

resetBtn.addEventListener('click', () => {
    urlInput.value = '';
    displayUrl.innerText = 'No active stream';
    status.innerText = 'SYSTEM READY';
    previewArea.innerHTML = '<div class="empty-msg">Awaiting destination instructions...</div>';
});

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeFetch(urlInput.value.trim());
});
