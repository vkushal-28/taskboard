import type { Server } from 'node:http';
import type { Express } from 'express';

// Express 5 passes bind errors (e.g. EADDRINUSE) to the listen callback instead of throwing.
export function listen(app: Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, (error?: Error) => {
      if (error) reject(error);
      else resolve(server);
    });
  });
}
