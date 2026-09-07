export class ControlPlaneError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "ControlPlaneError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.auditRecorded = false;
  }
}

export function fail(code, message, status = 400, details = undefined) {
  throw new ControlPlaneError(code, message, status, details);
}

export function assert(condition, code, message, status = 400, details = undefined) {
  if (!condition) fail(code, message, status, details);
}

export function asControlPlaneError(error) {
  if (error instanceof ControlPlaneError) return error;
  const normalized = new ControlPlaneError("INTERNAL_ERROR", "服务器内部错误", 500);
  normalized.cause = error;
  return normalized;
}
