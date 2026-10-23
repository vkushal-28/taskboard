declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth from the verified access token. */
      userId?: string;
    }
  }
}

export {};
