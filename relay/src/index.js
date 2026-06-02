import { Hono } from 'hono';

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'bail-sign-relay' }));

export default app;
