export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = 'Request validation failed') {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class Unauthorized extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class Forbidden extends AppError {
  constructor(message = 'You do not have permission to do this') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFound extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class Conflict extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class TooManyRequests extends AppError {
  constructor(message = 'Too many requests, try again later') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}
