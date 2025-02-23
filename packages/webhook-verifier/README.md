# webhook-verifier

## What is this

This is a small function for verifying incoming webhooks to your Discord application.

## How do I use this?

```typescript
import verify from "webhook-verifier";

async function fetch(request: Request, env: any): Response {
    const body = request.text();

    const isValid = await verify(env.DISCORD_PUBLIC_KEY, request.headers, body);
    if (!isValid) {
        return new Response("", { status: 401 });
    }
```
