import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";

const allowedOrigins = new Set(
  [
    process.env.APP_ORIGIN,
    process.env.SITE_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    "https://janani-careorbit.vercel.app",
  ].filter(Boolean),
);

const securityMiddleware = createMiddleware().server(async ({ next }) => {
  const request = getRequest();
  const isMutatingRequest = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (isMutatingRequest) {
    const origin = request.headers.get("origin");
    if (!origin || !allowedOrigins.has(new URL(origin).origin)) {
      throw new Response("Origin check failed", { status: 403 });
    }
  }

  setResponseHeader("Cache-Control", "private, no-store");
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityMiddleware, errorMiddleware],
}));
