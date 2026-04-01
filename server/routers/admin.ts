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
