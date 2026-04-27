import { inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { z } from "zod";

export const adminRouter = router({
  // Preview what reallocation would look like
  previewReallocation: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership || membership.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can preview reallocation" });
      }

      const group = await db.getGroupById(input.groupId);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });

      const sleeves = await db.getSleevesForGroup(input.groupId);
      if (sleeves.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Need at least 2 participants for reallocation" });
      }

      const reallocationPct = parseFloat(group.reallocationPercent) / 100;

      // Rank sleeves by return %
      const ranked = sleeves
        .map((s) => ({
          sleeveId: s.id,
          userId: s.userId,
          allocatedCapital: parseFloat(s.allocatedCapital),
          totalValue: parseFloat(s.totalValue),
          returnPct: parseFloat(s.returnPct),
        }))
        .sort((a, b) => b.returnPct - a.returnPct);

      // Bottom performer loses, top performer gains
      const loser = ranked[ranked.length - 1];
      const winner = ranked[0];

      const transferAmount = loser.allocatedCapital * reallocationPct;

      const changes = await Promise.all(
        ranked.map(async (s, i) => {
          const user = await db.getUserById(s.userId);
          let newAllocation = s.allocatedCapital;
          let changeAmount = 0;

          if (s.sleeveId === loser.sleeveId) {
            changeAmount = -transferAmount;
            newAllocation = s.allocatedCapital - transferAmount;
          } else if (s.sleeveId === winner.sleeveId) {
            changeAmount = transferAmount;
            newAllocation = s.allocatedCapital + transferAmount;
          }

          return {
            sleeveId: s.sleeveId,
            userId: s.userId,
            username: user?.username || "Unknown",
            displayName: user?.displayName || user?.username || "Unknown",
            previousAllocation: s.allocatedCapital,
            newAllocation,
            changeAmount,
            returnPct: s.returnPct,
            rank: i + 1,
          };
        })
      );

      return {
        changes,
        transferAmount,
        reallocationPct: parseFloat(group.reallocationPercent),
        winner: changes[0],
        loser: changes[changes.length - 1],
      };
    }),

  // Execute reallocation
  executeReallocation: protectedProcedure
    .input(
      z.object({
        groupId: z.number(),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership || membership.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can execute reallocation" });
      }

      const group = await db.getGroupById(input.groupId);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });

      const sleeves = await db.getSleevesForGroup(input.groupId);
      if (sleeves.length < 2) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Need at least 2 participants for reallocation" });
      }

      const reallocationPct = parseFloat(group.reallocationPercent) / 100;

      const ranked = sleeves
        .map((s) => ({
          sleeveId: s.id,
          userId: s.userId,
          allocatedCapital: parseFloat(s.allocatedCapital),
          totalValue: parseFloat(s.totalValue),
          returnPct: parseFloat(s.returnPct),
        }))
        .sort((a, b) => b.returnPct - a.returnPct);

      const loser = ranked[ranked.length - 1];
      const winner = ranked[0];
      const transferAmount = loser.allocatedCapital * reallocationPct;

      // Create reallocation event
      const event = await db.createReallocationEvent(input.groupId, ctx.user.id, input.notes || null);
      if (!event) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create reallocation event" });

      // Apply changes
      for (let i = 0; i < ranked.length; i++) {
        const s = ranked[i];
        let newAllocation = s.allocatedCapital;
        let changeAmount = 0;

        if (s.sleeveId === loser.sleeveId) {
          changeAmount = -transferAmount;
          newAllocation = s.allocatedCapital - transferAmount;
        } else if (s.sleeveId === winner.sleeveId) {
          changeAmount = transferAmount;
          newAllocation = s.allocatedCapital + transferAmount;
        }

        // Update sleeve allocated capital and recalculate returnPct against new allocation
        const sleeve = sleeves.find((sl) => sl.id === s.sleeveId);
        const currentTotalValue = sleeve ? parseFloat(sleeve.totalValue) : s.totalValue;
        const newReturnPct = newAllocation !== 0 ? ((currentTotalValue - newAllocation) / newAllocation) * 100 : 0;
        await db.updateSleeve(s.sleeveId, {
          allocatedCapital: String(newAllocation),
          returnPct: String(newReturnPct),
        });

        // Record the change
        await db.createReallocationChange({
          eventId: event.id,
          sleeveId: s.sleeveId,
          userId: s.userId,
          previousAllocation: String(s.allocatedCapital),
          newAllocation: String(newAllocation),
          changeAmount: String(changeAmount),
          returnPctAtTime: String(s.returnPct),
          rank: i + 1,
        });
      }

      // Update group's last/next reallocation dates
      const now = new Date();
      const nextDate = new Date(now);
      switch (group.reallocationInterval) {
        case "1week":    nextDate.setDate(nextDate.getDate() + 7);          break;
        case "2weeks":   nextDate.setDate(nextDate.getDate() + 14);         break;
        case "1month":   nextDate.setMonth(nextDate.getMonth() + 1);        break;
        case "3months":  nextDate.setMonth(nextDate.getMonth() + 3);        break;
        case "6months":  nextDate.setMonth(nextDate.getMonth() + 6);        break;
        default:         nextDate.setFullYear(nextDate.getFullYear() + 1);  break; // 12months
      }

      await db.updateGroup(input.groupId, {
        lastReallocationDate: now,
        nextReallocationDate: nextDate,
      });

      return {
        success: true,
        eventId: event.id,
        transferAmount,
        winner: { sleeveId: winner.sleeveId, userId: winner.userId },
        loser: { sleeveId: loser.sleeveId, userId: loser.userId },
      };
    }),

  // Get reallocation history
  getReallocationHistory: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      return db.getReallocationHistory(input.groupId);
    }),

  // ── Adjust cash for a player's sleeve ───────────────────────────────────────
  adjustCash: protectedProcedure
    .input(
      z.object({
        groupId: z.number(),
        sleeveId: z.number(),
        amount: z.number().refine((v) => v !== 0, { message: "Amount cannot be zero" }),
        reason: z.string().min(1).max(512),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership || membership.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can adjust cash" });
      }

      const sleeve = await db.getSleeveById(input.sleeveId);
      if (!sleeve || sleeve.groupId !== input.groupId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sleeve not found in this group" });
      }

      const currentCash = parseFloat(sleeve.cashBalance);
      const currentTotal = parseFloat(sleeve.totalValue);
      const currentAlloc = parseFloat(sleeve.allocatedCapital);
      const newCash = currentCash + input.amount;
      const newTotal = currentTotal + input.amount;
      const newAlloc = currentAlloc + input.amount;

      if (newCash < 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Deduction of $${Math.abs(input.amount).toLocaleString()} would result in negative cash balance ($${newCash.toLocaleString()})`,
        });
      }

      // Apply to sleeve
      await db.updateSleeve(input.sleeveId, {
        cashBalance: String(newCash),
        totalValue: String(newTotal),
        allocatedCapital: String(newAlloc),
      });

      // Persist audit record
      await db.createCashAdjustment({
        sleeveId: input.sleeveId,
        groupId: input.groupId,
        userId: sleeve.userId,
        adminId: ctx.user.id,
        amount: String(input.amount),
        reason: input.reason,
      });

      return {
        success: true,
        previousCash: currentCash,
        newCash,
        amount: input.amount,
      };
    }),

  // ── Activity ledger for a sleeve ─────────────────────────────────────────────
  getActivityLedger: protectedProcedure
    .input(z.object({ groupId: z.number(), sleeveId: z.number() }))
    .query(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership || membership.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can view the activity ledger" });
      }
      return db.getActivityLedger(input.sleeveId, input.groupId);
    }),

  // ── Players overview (sleeves + users) for admin ──────────────────────────────
  getPlayers: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership || membership.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can view players" });
      }
      const sleeves = await db.getSleevesForGroup(input.groupId);
      const { getDb } = await import("../db");
      const { users } = await import("../../drizzle/schema");
      const drizzleDb = await getDb();
      if (!drizzleDb) return [];
      const userIds = sleeves.map((s) => s.userId);
      const userRows = userIds.length > 0
        ? await drizzleDb.select({ id: users.id, displayName: users.displayName, username: users.username, email: users.email }).from(users).where(inArray(users.id, userIds))
        : [];
      const userMap = new Map(userRows.map((u) => [u.id, u]));
      return sleeves.map((s) => ({
        ...s,
        displayName: userMap.get(s.userId)?.displayName || userMap.get(s.userId)?.username || "Unknown",
        email: userMap.get(s.userId)?.email || null,
      }));
    }),

  // One-time fix: set startingCapital for all sleeves in a group
  fixStartingCapital: protectedProcedure
    .input(z.object({ groupId: z.number(), startingCapital: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      const sleeves = await db.getSleevesForGroup(input.groupId);
      if (sleeves.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No sleeves found for this group" });
      }
      const results = [];
      for (const sleeve of sleeves) {
        const totalValue = parseFloat(sleeve.totalValue);
        const returnPct = input.startingCapital !== 0
          ? ((totalValue - input.startingCapital) / input.startingCapital) * 100
          : 0;
        await db.updateSleeve(sleeve.id, {
          startingCapital: String(input.startingCapital),
          returnPct: String(returnPct),
        });
        results.push({ sleeveId: sleeve.id, totalValue, returnPct });
      }
      return { fixed: results.length, results };
    }),

  // List all users (admin utility)
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
    }
    const { getDb } = await import("../db");
    const { users } = await import("../../drizzle/schema");
    const drizzleDb = await getDb();
    if (!drizzleDb) return [];
    return drizzleDb.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
    }).from(users);
  }),
});
