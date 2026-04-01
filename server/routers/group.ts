import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { z } from "zod";

// ─── Helper: advance a date by a reallocation interval ──────────────────────
type ReallocationInterval = "1week" | "2weeks" | "1month" | "3months" | "6months" | "12months";

function addReallocationInterval(from: Date, interval: ReallocationInterval): Date {
  const d = new Date(from);
  switch (interval) {
    case "1week":   d.setDate(d.getDate() + 7);           break;
    case "2weeks":  d.setDate(d.getDate() + 14);          break;
    case "1month":  d.setMonth(d.getMonth() + 1);         break;
    case "3months": d.setMonth(d.getMonth() + 3);         break;
    case "6months": d.setMonth(d.getMonth() + 6);         break;
    case "12months":d.setFullYear(d.getFullYear() + 1);   break;
  }
  return d;
}

export const groupRouter = router({
  // Public: preview group info by invite code (no auth required — for invite link landing page)
  preview: publicProcedure
    .input(z.object({ inviteCode: z.string() }))
    .query(async ({ input }) => {
      const group = await db.getGroupByInviteCode(input.inviteCode.toUpperCase());
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite code" });
      const members = await db.getGroupMembers(group.id);
      return {
        id: group.id,
        name: group.name,
        description: group.description,
        sleeveSize: group.sleeveSize,
        totalCapital: group.totalCapital,
        maxParticipants: group.maxParticipants,
        currentMembers: members.length,
        reallocationInterval: group.reallocationInterval,
        reallocationPercent: group.reallocationPercent,
        status: group.status,
        isFull: members.length >= group.maxParticipants,
      };
    }),

  // Create a new group (admin)
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        description: z.string().max(500).optional(),
        totalCapital: z.number().positive().default(1000000),
        maxParticipants: z.number().int().min(2).max(20).default(5),
        reallocationInterval: z.enum(["1week", "2weeks", "1month", "3months", "6months", "12months"]).default("3months"),
        reallocationPercent: z.number().min(1).max(50).default(5),
        endDate: z.string().datetime().optional(), // ISO string from date picker
      })
    )
    .mutation(async ({ input, ctx }) => {
      const inviteCode = nanoid(8).toUpperCase();
      const sleeveSize = input.totalCapital / input.maxParticipants;
      const startDate = new Date();

      // Calculate next reallocation date
      const nextReallocationDate = addReallocationInterval(new Date(startDate), input.reallocationInterval);

      const group = await db.createGroup({
        name: input.name,
        description: input.description || null,
        inviteCode,
        totalCapital: String(input.totalCapital),
        sleeveSize: String(sleeveSize),
        maxParticipants: input.maxParticipants,
        reallocationInterval: input.reallocationInterval,
        reallocationPercent: String(input.reallocationPercent),
        startDate,
        endDate: input.endDate ? new Date(input.endDate) : null,
        nextReallocationDate,
        createdBy: ctx.user.id,
      });

      // Add creator as admin member
      await db.addGroupMember({ groupId: group!.id, userId: ctx.user.id, role: "admin" });

      // Create sleeve for creator
      await db.createSleeve({
        groupId: group!.id,
        userId: ctx.user.id,
        name: `${ctx.user.displayName || ctx.user.username}'s Sleeve`,
        allocatedCapital: String(sleeveSize),
        cashBalance: String(sleeveSize),
        totalValue: String(sleeveSize),
      });

      // Promote user to admin if they're creating a group
      const { getDb } = await import("../db");
      const drizzleDb = await getDb();
      if (drizzleDb) {
        const { users } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await drizzleDb.update(users).set({ role: "admin" }).where(eq(users.id, ctx.user.id));
      }

      return { ...group, inviteCode };
    }),

  // Join a group via invite code
  join: protectedProcedure
    .input(z.object({ inviteCode: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const group = await db.getGroupByInviteCode(input.inviteCode.toUpperCase());
      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid invite code" });
      }

      if (group.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This group is no longer accepting members" });
      }

      // Check if already a member
      const existing = await db.getGroupMembership(group.id, ctx.user.id);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "You are already a member of this group" });
      }

      // Check capacity
      const members = await db.getGroupMembers(group.id);
      if (members.length >= group.maxParticipants) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This group is full" });
      }

      await db.addGroupMember({ groupId: group.id, userId: ctx.user.id, role: "member" });

      // Create sleeve
      await db.createSleeve({
        groupId: group.id,
        userId: ctx.user.id,
        name: `${ctx.user.displayName || ctx.user.username}'s Sleeve`,
        allocatedCapital: String(group.sleeveSize),
        cashBalance: String(group.sleeveSize),
        totalValue: String(group.sleeveSize),
      });

      return { success: true, group };
    }),

  // Get all groups for current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const groups = await db.getGroupsByUser(ctx.user.id);
    return groups;
  }),

  // Get a specific group with members and sleeves
  get: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input, ctx }) => {
      const group = await db.getGroupById(input.groupId);
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });

      // Check membership
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this group" });

      const members = await db.getGroupMembers(input.groupId);
      const sleeves = await db.getSleevesForGroup(input.groupId);

      // Get user info for each member
      const memberDetails = await Promise.all(
        members.map(async (m) => {
          const user = await db.getUserById(m.userId);
          const sleeve = sleeves.find((s) => s.userId === m.userId);
          return {
            ...m,
            username: user?.username,
            displayName: user?.displayName,
            sleeve,
          };
        })
      );

      return { ...group, members: memberDetails, sleeves };
    }),

  // Delete a competition (admin only) — cascades all associated data
  delete: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership || membership.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can delete a competition" });
      }
      await db.deleteGroup(input.groupId);
      return { success: true };
    }),

  // Update group settings (admin only)
  update: protectedProcedure
    .input(
      z.object({
        groupId: z.number(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().max(500).optional(),
        reallocationInterval: z.enum(["1week", "2weeks", "1month", "3months", "6months", "12months"]).optional(),
        reallocationPercent: z.number().min(1).max(50).optional(),
        endDate: z.string().datetime().nullable().optional(), // ISO string or null to clear
        status: z.enum(["active", "paused", "completed"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await db.getGroupMembership(input.groupId, ctx.user.id);
      if (!membership || membership.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only group admins can update settings" });
      }

      const { groupId, ...updates } = input;
      const updateData: Record<string, unknown> = {};
      if (updates.name) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.reallocationInterval) updateData.reallocationInterval = updates.reallocationInterval;
      if (updates.reallocationPercent !== undefined) updateData.reallocationPercent = String(updates.reallocationPercent);
      if (updates.endDate !== undefined) updateData.endDate = updates.endDate ? new Date(updates.endDate) : null;
      if (updates.status) updateData.status = updates.status;

      await db.updateGroup(groupId, updateData as any);
      return { success: true };
    }),
});
