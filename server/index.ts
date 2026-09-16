import { fileURLToPath } from 'node:url';
import { createPokerServer } from './app.js';
const production = process.env.NODE_ENV !== 'development';
const port = Number(process.env.PORT ?? (production ? 3000 : 3001));
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be between 1 and 65535');
const origin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : undefined;
const { server, close } = createPokerServer({
  origin,
  clientDir: production ? fileURLToPath(new URL('../../client', import.meta.url)) : undefined,
});
server.listen(port, '0.0.0.0', () => console.log(`Pokerplanner listening on port ${port}`));
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    void close().then(() => process.exit(0));
  });
