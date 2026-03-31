import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { COOKIE_NAME } from "@shared/const";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  try {
    const cookies = opts.req.headers.cookie ?? "";
    const cookieMap = new Map(
      cookies.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k?.trim() ?? "", v.join("=")];
      })
    );
    const sessionId = cookieMap.get(COOKIE_NAME);
    if (sessionId) {
      const session = await db.getSession(sessionId);
      if (session && session.expiresAt > Date.now()) {
        user = await db.getUserById(session.userId);
      }
    }
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
