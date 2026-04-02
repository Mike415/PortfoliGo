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

/** Derive a unique internal username from an email address */
function usernameFromEmail(email: string): string {
  // Take the local part, strip non-alphanumeric, lowercase, max 32 chars
  return email.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase().slice(0, 32) || "user";
}

export const authRouter = router({
  // Get current user
  me: publicProcedure.query((opts) => {
    if (!opts.ctx.user) return null;
    const { id, username, displayName, role, email } = opts.ctx.user;
    return { id, username, displayName, role, email: email ?? null };
  }),

  // Register a new user — email + displayName + passcode (no username field for users)
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email("Please enter a valid email address"),
        displayName: z.string().min(1, "Display name is required").max(64).transform((v) => v.trim()).pipe(z.string().min(1, "Display name is required").max(64)),
        passcode: z.string().min(4).max(64),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const emailLower = input.email.toLowerCase().trim();

      // Check email uniqueness
      const emailExists = await db.getUserByEmail(emailLower);
      if (emailExists) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
      }

      // Generate a unique internal username from the email
      let baseUsername = usernameFromEmail(emailLower);
      let username = baseUsername;
      let attempt = 0;
      while (await db.getUserByUsername(username)) {
        attempt++;
        username = `${baseUsername}${attempt}`;
      }

      const passcodeHash = hashPasscode(input.passcode);
      const user = await db.createUser({
        username,
        passcodeHash,
        displayName: input.displayName,
        role: "user",
        email: emailLower,
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

      return { success: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, email: user.email ?? null } };
    }),

  // Login with email + passcode
  login: publicProcedure
    .input(
      z.object({
        email: z.string().min(1, "Email is required"),
        passcode: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or passcode" });
      }

      const passcodeHash = hashPasscode(input.passcode);
      if (user.passcodeHash !== passcodeHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or passcode" });
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

      return { success: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, email: user.email ?? null } };
    }),

  // Update email (for existing users who signed up without one)
  updateEmail: protectedProcedure
    .input(
      z.object({
        email: z.string().email("Please enter a valid email address"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const emailLower = input.email.toLowerCase().trim();
      // Check uniqueness
      const existing = await db.getUserByEmail(emailLower);
      if (existing && existing.id !== ctx.user.id) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
      }
      await db.updateUserEmail(ctx.user.id, emailLower);
      return { success: true };
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
