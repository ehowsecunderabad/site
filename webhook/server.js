const express = require('express');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const parser = new XMLParser({ ignoreAttributes: false });

// Read raw text for XML payloads (YouTube sends atom+xml)
app.use(express.text({ type: ['application/atom+xml', 'application/xml', 'text/*', '*/*'], limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const CHANNEL_ID = process.env.CHANNEL_ID || process.env.YOUTUBE_CHANNEL_ID;
const CALLBACK_URL = process.env.CALLBACK_URL; // public URL where this server is reachable
const REPO = process.env.REPO; // owner/repo
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // personal access token or repo token
const WORKFLOW_FILE = process.env.WORKFLOW_FILE || 'youtube-cache.yml';
const REF = process.env.REF || 'main';

function log(...args) { console.log(new Date().toISOString(), ...args); }

async function triggerWorkflow() {
  if (!REPO || !GITHUB_TOKEN) {
    log('Missing REPO or GITHUB_TOKEN; skipping workflow dispatch');
    return { ok: false, reason: 'missing_auth' };
  }

  const [owner, repo] = REPO.split('/');
  if (!owner || !repo) {
    log('Invalid REPO value, expected owner/repo');
    return { ok: false, reason: 'invalid_repo' };
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/dispatches`;
  const body = { ref: REF };

  log('Triggering workflow dispatch:', WORKFLOW_FILE, 'on', REPO, 'ref', REF);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    log('Workflow dispatch failed', res.status, text);
    return { ok: false, status: res.status, body: text };
  }

  log('Workflow dispatch accepted');
  return { ok: true };
}

// Verification endpoint for WebSub (YouTube PubSubHubbub)
app.get('/webhook', (req, res) => {
  const { 'hub.mode': hubMode, 'hub.challenge': hubChallenge, 'hub.topic': hubTopic } = req.query;
  if (hubMode && hubChallenge) {
    log('Received verification request, mode=', hubMode, 'topic=', hubTopic);
    // Respond with the challenge text (plain)
    res.set('Content-Type', 'text/plain');
    return res.status(200).send(hubChallenge);
  }
  res.status(200).send('OK');
});

// Notification endpoint: YouTube will POST atom XML when the channel updates
app.post('/webhook', async (req, res) => {
  log('Received notification POST to /webhook');
  const raw = req.body || '';
  try {
    // Try parsing XML to get some helpful info for logs, but regardless trigger the workflow
    let parsed;
    try {
      parsed = parser.parse(raw);
    } catch (err) {
      log('Failed to parse incoming XML (non-fatal):', err.message);
      parsed = null;
    }

    if (parsed) {
      // Typical YouTube atom feed contains <entry> elements with <link href="https://www.youtube.com/watch?v=VIDEOID"/>
      const feed = parsed.feed || parsed;
      const entries = feed.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : [];
      log('Parsed entries count:', entries.length);
      for (const e of entries) {
        const link = e.link && (e.link['@_href'] || e.link.href || (e.link[0] && e.link[0]['@_href']));
        if (link) log('Entry link:', link);
        const title = e.title || e['atom:title'];
        if (title) log('Entry title:', title);
      }
    }

    // Trigger the GitHub workflow to update caches
    const result = await triggerWorkflow();
    if (!result.ok) {
      log('Trigger workflow returned non-ok:', result);
      // Return 202 to indicate accepted but with failure detail in logs
      return res.status(202).json({ ok: false, reason: result });
    }

    // Per WebSub spec, a 2xx response is acceptable
    res.status(204).send();
  } catch (err) {
    log('Error handling webhook POST:', err);
    res.status(500).send('Server error');
  }
});

// Helper endpoints to subscribe / unsubscribe via the hub (for convenience)
app.post('/subscribe', express.urlencoded({ extended: true }), async (req, res) => {
  if (!CHANNEL_ID && !req.body.topic) return res.status(400).send('Missing CHANNEL_ID or topic');
  const topic = req.body.topic || `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  const callback = req.body.callback || CALLBACK_URL;
  if (!callback) return res.status(400).send('Missing callback URL (CALLBACK_URL env var or body param)');

  const hubUrl = 'https://pubsubhubbub.appspot.com/subscribe';
  const params = new URLSearchParams();
  params.append('hub.mode', 'subscribe');
  params.append('hub.topic', topic);
  params.append('hub.callback', callback);
  params.append('hub.verify', 'sync');
  if (req.body.verify_token) params.append('hub.verify_token', req.body.verify_token);

  log('Sending subscribe request to hub for topic', topic, 'callback', callback);
  const r = await fetch(hubUrl, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const text = await r.text();
  res.status(r.status).send(text);
});

app.post('/unsubscribe', express.urlencoded({ extended: true }), async (req, res) => {
  const topic = req.body.topic || `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  const callback = req.body.callback || CALLBACK_URL;
  const hubUrl = 'https://pubsubhubbub.appspot.com/subscribe';
  const params = new URLSearchParams();
  params.append('hub.mode', 'unsubscribe');
  params.append('hub.topic', topic);
  params.append('hub.callback', callback);
  params.append('hub.verify', 'sync');

  log('Sending unsubscribe request to hub for topic', topic, 'callback', callback);
  const r = await fetch(hubUrl, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const text = await r.text();
  res.status(r.status).send(text);
});

app.get('/', (req, res) => res.send('EHOW YouTube Webhook Receiver')); 

app.listen(PORT, () => log('Webhook server listening on port', PORT));
