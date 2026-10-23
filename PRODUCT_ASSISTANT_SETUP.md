# Product assistant activation

The public demo uses a product guide until the separate Vercel function is configured. This is not a fine-tuned model: connected AI receives the maintained product guide with every request. It has no account, database, payment or payroll tools.

In the KeeperBMA Vercel project's **Settings → Environment Variables**, set these for Production, then redeploy:

- `OPENAI_API_KEY`: the secret key from your OpenAI API project with API billing available. Never put it in browser code or chat.
- `OPENAI_MODEL`: a text model ID available to that API project and compatible with the Responses API.
- `PRODUCT_ASSISTANT_AI_ENABLED`: `true`.

No real key was available during implementation. Provider requests were tested with mocked responses; a real paid-model answer still needs verification after configuration. `GET /api/product-assistant` returns the configured mode without exposing secrets. Ask a product question in the demo and verify that its answer is labeled **AI**, rather than **Product guide**. On a provider error it falls back to the product guide and says so.

API requests include only the entered question and up to six bounded conversation messages, not sample account records. They use `store: false`, a 20-second provider timeout and a 700-token output cap. The function has a per-instance burst limiter of twelve requests per IP per minute; this is not a distributed or hard spending limit. Configure provider project spending controls and hosting-wide request controls before opening a high-volume paid AI service.

The guide in `frontends/web/product-guide.js` includes public website list pricing, task navigation and explicit demo/planned limitations. Update it whenever pricing or capabilities change. Unit tests check the stored prices against the website's plan source. Checkout remains authoritative.

Official implementation references: [OpenAI authentication](https://developers.openai.com/api/reference/overview), [Responses API quickstart](https://developers.openai.com/api/docs/quickstart), [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js).
