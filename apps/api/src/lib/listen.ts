import type { Server } from 'node:http';

// Takes a server rather than the Express app, so add-ons like Socket.IO can attach before it
// accepts a connection. Bind errors (e.g. EADDRINUSE) arrive as an 'error' event, not a throw.
export function listen(server: Server, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}
