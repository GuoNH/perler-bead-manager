import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** HTTP Basic Auth 中间件：设置 AUTH_PASS 时启用，未设置时放行。 */
export function basicAuth() {
  const user = process.env.AUTH_USER || "admin";
  const pass = process.env.AUTH_PASS;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!pass) return next();

    const header = req.headers.authorization;
    if (!header?.startsWith("Basic ")) {
      unauthorized(res);
      return;
    }

    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    const u = sep === -1 ? decoded : decoded.slice(0, sep);
    const p = sep === -1 ? "" : decoded.slice(sep + 1);

    if (u !== user || !safeEqual(p, pass)) {
      unauthorized(res);
      return;
    }
    next();
  };
}

function unauthorized(res: Response): void {
  res.set("WWW-Authenticate", 'Basic realm="pinpin"');
  res.status(401).json({ error: "未认证" });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
