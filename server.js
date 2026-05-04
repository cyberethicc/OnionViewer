const express = require('express');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = 8080;
const HOST = '127.0.0.1';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({ windowMs: 60000, max: 120, message: 'Too many requests.' });
app.use('/view', limiter);

const agent9050 = new SocksProxyAgent('socks5h://127.0.0.1:9050');
const agent9150 = new SocksProxyAgent('socks5h://127.0.0.1:9150');

// Fetch through Tor with port fallback
async function torFetch(targetUrl, opts = {}) {
    try {
        return await axios.get(targetUrl, { httpAgent: agent9050, httpsAgent: agent9050, timeout: 20000, ...opts });
    } catch (e) {
        return await axios.get(targetUrl, { httpAgent: agent9150, httpsAgent: agent9150, timeout: 20000, ...opts });
    }
}



// Main proxy endpoint - serves pages directly in the browser
app.get('/view', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.redirect('/');

    try {
        const response = await torFetch(targetUrl, { responseType: 'arraybuffer', validateStatus: () => true });
        const contentType = response.headers['content-type'] || '';

        // Non-HTML content (images, CSS, fonts, etc.) - pass through directly
        if (!contentType.includes('text/html')) {
            res.setHeader('Content-Type', contentType);
            return res.send(response.data);
        }

        // HTML content - rewrite URLs and inject toolbar
        const html = response.data.toString();
        const $ = cheerio.load(html);

        // Helper to proxy any URL
        const rewrite = (val) => {
            if (!val || val.startsWith('data:') || val.startsWith('javascript:') || val.startsWith('#') || val.startsWith('mailto:')) return null;
            try {
                const abs = new URL(val, targetUrl).href;
                if (abs.includes('.onion')) return `/view?url=${encodeURIComponent(abs)}`;
            } catch (e) {}
            return null;
        };

        // Rewrite all href, src, action, srcset, poster attributes
        $('[href]').each((_, el) => { const r = rewrite($(el).attr('href')); if (r) $(el).attr('href', r); });
        $('[src]').each((_, el) => { const r = rewrite($(el).attr('src')); if (r) $(el).attr('src', r); });
        $('[action]').each((_, el) => { const r = rewrite($(el).attr('action')); if (r) $(el).attr('action', r); });
        $('[poster]').each((_, el) => { const r = rewrite($(el).attr('poster')); if (r) $(el).attr('poster', r); });
        $('[srcset]').each((_, el) => {
            const srcset = $(el).attr('srcset');
            const newSrcset = srcset.split(',').map(entry => {
                const parts = entry.trim().split(/\s+/);
                const r = rewrite(parts[0]);
                if (r) parts[0] = r;
                return parts.join(' ');
            }).join(', ');
            $(el).attr('srcset', newSrcset);
        });

        // Rewrite CSS url() in style attributes and <style> tags
        const rewriteCssUrls = (css) => css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, u) => {
            const r = rewrite(u);
            return r ? `url('${r}')` : match;
        });
        $('[style]').each((_, el) => $(el).attr('style', rewriteCssUrls($(el).attr('style'))));
        $('style').each((_, el) => $(el).html(rewriteCssUrls($(el).html())));



        // Remove X-Frame-Options meta tags (not needed since we render directly)
        $('meta[http-equiv="X-Frame-Options"]').remove();

        res.setHeader('Content-Type', 'text/html');
        res.send($.html());

    } catch (err) {
        res.status(502).send(`
            <html><body style="background:#0A0A0A;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
                <h1 style="color:#ff4b5c;">Connection Failed</h1>
                <p style="color:#888;">Could not reach: ${targetUrl}</p>
                <a href="/" style="color:#2F5BFF;margin-top:20px;">← Back to Search</a>
            </body></html>
        `);
    }
});

// POST /view — handles form submissions from proxied pages
app.post('/view', express.urlencoded({ extended: true }), async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.redirect('/');

    try {
        // Forward the form data to the .onion site via POST
        let response;
        const postData = new URLSearchParams(req.body).toString();
        const postOpts = {
            method: 'post',
            data: postData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            responseType: 'arraybuffer',
            validateStatus: () => true,
            timeout: 20000
        };

        try {
            response = await axios({ url: targetUrl, httpAgent: agent9050, httpsAgent: agent9050, ...postOpts });
        } catch (e) {
            response = await axios({ url: targetUrl, httpAgent: agent9150, httpsAgent: agent9150, ...postOpts });
        }

        const contentType = response.headers['content-type'] || '';

        if (!contentType.includes('text/html')) {
            res.setHeader('Content-Type', contentType);
            return res.send(response.data);
        }

        // Same HTML rewriting as GET
        const html = response.data.toString();
        const $ = cheerio.load(html);

        const rewrite = (val) => {
            if (!val || val.startsWith('data:') || val.startsWith('javascript:') || val.startsWith('#') || val.startsWith('mailto:')) return null;
            try {
                const abs = new URL(val, targetUrl).href;
                if (abs.includes('.onion')) return `/view?url=${encodeURIComponent(abs)}`;
            } catch (e) {}
            return null;
        };

        $('[href]').each((_, el) => { const r = rewrite($(el).attr('href')); if (r) $(el).attr('href', r); });
        $('[src]').each((_, el) => { const r = rewrite($(el).attr('src')); if (r) $(el).attr('src', r); });
        $('[action]').each((_, el) => { const r = rewrite($(el).attr('action')); if (r) $(el).attr('action', r); });
        $('[poster]').each((_, el) => { const r = rewrite($(el).attr('poster')); if (r) $(el).attr('poster', r); });

        const rewriteCssUrls = (css) => css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, u) => {
            const r = rewrite(u);
            return r ? `url('${r}')` : match;
        });
        $('[style]').each((_, el) => $(el).attr('style', rewriteCssUrls($(el).attr('style'))));
        $('style').each((_, el) => $(el).html(rewriteCssUrls($(el).html())));

        $('meta[http-equiv="X-Frame-Options"]').remove();

        res.setHeader('Content-Type', 'text/html');
        res.send($.html());

    } catch (err) {
        res.status(502).send(`
            <html><body style="background:#0A0A0A;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;">
                <h1 style="color:#ff4b5c;">Connection Failed</h1>
                <p style="color:#888;">Could not reach: ${targetUrl}</p>
                <a href="/" style="color:#2F5BFF;margin-top:20px;">← Back to Search</a>
            </body></html>
        `);
    }
});

// POST endpoint for search form
app.post('/fetch', (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL provided.' });
    if (!url.startsWith('http')) url = `http://${url}`;
    res.json({ proxyUrl: `/view?url=${encodeURIComponent(url)}` });
});

app.listen(PORT, HOST, () => {
    console.log(`CyberEthic Tunnel active on http://${HOST}:${PORT}`);
});
