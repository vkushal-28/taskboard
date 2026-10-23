import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

let mongo: MongoMemoryServer | undefined;

// One mongod for the whole run; each test file gets its own database in test/setup.ts.
export async function setup(project: TestProject) {
  mongo = await MongoMemoryServer.create();
  project.provide('mongoUri', mongo.getUri());
}

export async function teardown() {
  await mongo?.stop();
}
