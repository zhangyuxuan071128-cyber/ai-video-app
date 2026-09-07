import { createServer } from "node:http";
import { createControlPlane, ControlPlaneError } from "./control-plane.mjs";
import { clearSessionCookie, parseCookies, randomId, sessionCookie } from "./security.mjs";
import { asControlPlaneError } from "./errors.mjs";

const MAX_JSON_BYTES = 1_048_576;

function configuredOrigins(env = process.env) {
  const origins = new Set([
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
  ]);
  for (const origin of String(env.CONTROL_PLANE_ALLOWED_ORIGINS ?? "").split(",")) {
    if (origin.trim()) origins.add(origin.trim().replace(/\/$/, ""));
  }
  const key = env.X_IDE_SPACE_KEY;
  const region = env.X_IDE_SPACE_REGION;
  const rawHost = env.X_IDE_SPACE_HOST;
  if (key && region && rawHost) {
    const host = rawHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    origins.add(`https://${key}--3000.${region}.${host}`);
    origins.add(`https://${key}--3001.${region}.${host}`);
  }
  return origins;
}

function writeCorsHeaders(request, response, origins) {
  const origin = request.headers.origin;
  if (origin && origins.has(origin.replace(/\/$/, ""))) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
  }
}

function assertAllowedOrigin(request, origins) {
  const origin = request.headers.origin;
  if (!origin) return;
  if (!origins.has(origin.replace(/\/$/, ""))) {
    throw new ControlPlaneError("ORIGIN_NOT_ALLOWED", "请求来源不在允许列表", 403);
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      throw new ControlPlaneError("PAYLOAD_TOO_LARGE", "JSON 请求体超过 1 MiB", 413);
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new ControlPlaneError("UNSUPPORTED_MEDIA_TYPE", "写操作必须使用 application/json", 415);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ControlPlaneError("INVALID_JSON", "JSON 请求体无效", 400);
  }
}

function forwardedProtocol(request, trustProxy) {
  if (!trustProxy) return null;
  return String(request.headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase();
}

function sourceIp(request, trustProxy) {
  if (trustProxy) {
    const forwarded = String(request.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return request.socket.remoteAddress ?? null;
}

function sendJson(response, status, payload) {
  const serialized = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(serialized));
  response.end(serialized);
}

function sendResult(response, result) {
  response.statusCode = result.status ?? 200;
  for (const [name, value] of Object.entries(result.headers ?? {})) response.setHeader(name, value);
  if (result.contentType && typeof result.data === "string") {
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Length", Buffer.byteLength(result.data));
    response.end(result.data);
    return;
  }
  sendJson(response, result.status ?? 200, {
    data: result.data,
    ...(result.revision === undefined ? {} : { revision: result.revision }),
    ...(result.auditId === undefined ? {} : { auditId: result.auditId }),
    ...(result.idempotentReplay === undefined ? {} : { idempotentReplay: result.idempotentReplay }),
  });
}

export async function createControlPlaneHttpServer(options = {}) {
  const controlPlane = options.controlPlane ?? await createControlPlane(options);
  const origins = options.allowedOrigins ?? configuredOrigins(options.env ?? process.env);
  const trustProxy = options.trustProxy ?? process.env.CONTROL_PLANE_TRUST_PROXY === "1";
  const configuredSecureCookie = options.secureCookies ?? process.env.CONTROL_PLANE_SECURE_COOKIE === "1";

  const server = createServer(async (request, response) => {
    const requestId = String(request.headers["x-request-id"] ?? randomId("req"));
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    writeCorsHeaders(request, response, origins);

    const rawUrl = new URL(request.url ?? "/", "http://control-plane.local");
    const method = String(request.method ?? "GET").toUpperCase();
    const cookies = parseCookies(request.headers.cookie);
    const normalizedRequest = {
      method,
      path: rawUrl.pathname,
      query: rawUrl.searchParams,
      headers: request.headers,
      token: cookies.sid,
      sourceIp: sourceIp(request, trustProxy),
      userAgent: request.headers["user-agent"] ?? null,
      requestId,
      secure: configuredSecureCookie
        || forwardedProtocol(request, true) === "https"
        || String(request.headers.origin ?? "").toLowerCase().startsWith("https://"),
    };

    try {
      if (method === "OPTIONS") {
        assertAllowedOrigin(request, origins);
        response.statusCode = 204;
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key, If-Match, X-Request-Id");
        response.setHeader("Access-Control-Max-Age", "600");
        response.end();
        return;
      }
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) assertAllowedOrigin(request, origins);
      const body = ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? await readJsonBody(request) : {};
      const result = await controlPlane.handle({ ...normalizedRequest, body });
      if (result.setSessionToken) {
        response.setHeader("Set-Cookie", sessionCookie(result.setSessionToken, {
          maxAgeSeconds: result.sessionMaxAgeSeconds,
          secure: result.secureCookie,
        }));
      } else if (result.clearSession) {
        response.setHeader("Set-Cookie", clearSessionCookie({ secure: result.secureCookie }));
      }
      sendResult(response, result);
    } catch (error) {
      const normalizedError = asControlPlaneError(error);
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !normalizedError.auditRecorded) {
        try {
          await controlPlane.recordRejectedWrite(normalizedRequest, normalizedError);
          normalizedError.auditRecorded = true;
        } catch {
          // Do not hide the original request failure behind secondary audit failure handling.
        }
      }
      sendJson(response, normalizedError.status ?? 500, {
        error: {
          code: normalizedError.code ?? "INTERNAL_ERROR",
          message: normalizedError.message,
          ...(normalizedError.details === undefined ? {} : { details: normalizedError.details }),
          requestId,
        },
      });
    }
  });

  return { server, controlPlane, allowedOrigins: origins };
}

export async function startControlPlaneServer(options = {}) {
  const host = options.host ?? process.env.CONTROL_PLANE_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.CONTROL_PLANE_PORT ?? 8788);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new ControlPlaneError("CONFIG_INVALID", "CONTROL_PLANE_PORT 无效", 500);
  }
  const result = await createControlPlaneHttpServer(options);
  await new Promise((resolveListen, rejectListen) => {
    result.server.once("error", rejectListen);
    result.server.listen(port, host, () => {
      result.server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = result.server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    ...result,
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: () => new Promise((resolveClose, rejectClose) => {
      result.server.close((error) => error ? rejectClose(error) : resolveClose());
    }),
  };
}
