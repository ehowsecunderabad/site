# YouTube WebSub webhook receiver

This small Express server receives YouTube WebSub (PubSubHubbub) notifications for a channel and triggers the `youtube-cache.yml` GitHub Actions workflow to update the cached stream JSON files.

Features:
- Responds to WebSub verification requests (GET /webhook)
- Accepts notifications (POST /webhook) and triggers the `youtube-cache.yml` workflow
- Convenience endpoints to subscribe/unsubscribe to the hub: `POST /subscribe` and `POST /unsubscribe`

Environment variables
- `PORT` — port to listen on (default 3000)
- `CHANNEL_ID` — YouTube channel ID (optional; used by `/subscribe` helper)
- `CALLBACK_URL` — Public callback URL for the hub (optional; used by `/subscribe` helper)
- `REPO` — GitHub repository in `owner/repo` format (required to dispatch workflow)
- `GITHUB_TOKEN` — Personal Access Token or repo token with `repo` and `workflow` permissions (required)
- `WORKFLOW_FILE` — Workflow file name to dispatch (defaults to `youtube-cache.yml`)
- `REF` — Git ref for the dispatch (defaults to `main`)

Quick start

1. Deploy this server somewhere reachable by YouTube (Vercel, Fly, Heroku, a VPS). Ensure `CALLBACK_URL` points to `https://your-host/webhook`.
2. Set environment variables for `REPO` and `GITHUB_TOKEN`.
3. Start the server: `npm install && npm start`.
4. Subscribe to YouTube's hub (example using curl):

```bash
curl -X POST https://pubsubhubbub.appspot.com/subscribe \
  -d "hub.mode=subscribe" \
  -d "hub.topic=https://www.youtube.com/xml/feeds/videos.xml?channel_id=YOUR_CHANNEL_ID" \
  -d "hub.callback=https://your-host/webhook" \
  -d "hub.verify=sync"
```

Notes
- The webhook will receive atom XML; this server logs parsed entries for debugging.
- The server triggers the `youtube-cache.yml` workflow via the GitHub API. Ensure the workflow accepts `workflow_dispatch` (the repo already has this).
- You will still need to deploy this server to make the webhook usable. GitHub Pages cannot accept inbound POSTs.
