import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import * as crypto from "crypto";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { z } from "zod";

// Simple hash using SHA-256 (no bcrypt to keep it lightweight)
function hashPasscode(passcode: string): string {
  return crypto.createHmac("sha256", ENV.cookieSecret).update(passcode).digest("hex");
}

function generateSessionId(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const authRouter = router({
  // Get current user
  me: publicProcedure.query((opts) => opts.ctx.user),

  // Register a new user
  register: publicProcedure
    .input(
      z.object({
        username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
        passcode: z.string().min(4).max(64),
        displayName: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getUserByUsername(input.username.toLowerCase());
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already taken" });
      }

      const passcodeHash = hashPasscode(input.passcode);
      const user = await db.createUser({
        username: input.username.toLowerCase(),
        passcodeHash,
        displayName: input.displayName || input.username,
        role: "user",
      });

      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });

      // Create session
      const sessionId = generateSessionId();
      const expiresAt = Date.now() + ONE_YEAR_MS;
      await db.createSession(sessionId, user.id, expiresAt);

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionId, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return { success: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } };
    }),

  // Login with username + passcode
  login: publicProcedure
    .input(
      z.object({
        username: z.string(),
        passcode: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByUsername(input.username.toLowerCase());
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or passcode" });
      }

      const passcodeHash = hashPasscode(input.passcode);
      if (user.passcodeHash !== passcodeHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or passcode" });
      }

      await db.updateUserLastSignedIn(user.id);

      const sessionId = generateSessionId();
      const expiresAt = Date.now() + ONE_YEAR_MS;
      await db.createSession(sessionId, user.id, expiresAt);

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionId, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return { success: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } };
    }),

  // Logout
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie ?? "";
    const cookieMap = new Map(
      cookies.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k?.trim() ?? "", v.join("=")];
      })
    );
    const sessionId = cookieMap.get(COOKIE_NAME);
    if (sessionId) {
      await db.deleteSession(sessionId);
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),
});
