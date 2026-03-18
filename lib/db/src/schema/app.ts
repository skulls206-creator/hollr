import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userStatusEnum = pgEnum("user_status", ["online", "idle", "dnd", "offline"]);
export const channelTypeEnum = pgEnum("channel_type", ["text", "voice"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);

export const userProfilesTable = pgTable("user_profiles", {
  userId: varchar("user_id").primaryKey().notNull(),
  username: varchar("username", { length: 32 }).notNull(),
  displayName: varchar("display_name", { length: 32 }).notNull(),
  avatarUrl: text("avatar_url"),
  status: userStatusEnum("status").notNull().default("offline"),
  customStatus: varchar("custom_status", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable);
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;

export const serversTable = pgTable("servers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  iconUrl: text("icon_url"),
  ownerId: varchar("owner_id").notNull(),
  inviteCode: varchar("invite_code", { length: 32 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertServerSchema = createInsertSchema(serversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServer = z.infer<typeof insertServerSchema>;
export type DbServer = typeof serversTable.$inferSelect;

export const serverMembersTable = pgTable("server_members", {
  userId: varchar("user_id").notNull(),
  serverId: varchar("server_id").notNull(),
  role: memberRoleEnum("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServerMember = typeof serverMembersTable.$inferSelect;

export const channelsTable = pgTable("channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  topic: text("topic"),
  type: channelTypeEnum("type").notNull().default("text"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertChannelSchema = createInsertSchema(channelsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type DbChannel = typeof channelsTable.$inferSelect;

export const dmThreadsTable = pgTable("dm_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DmThread = typeof dmThreadsTable.$inferSelect;

export const dmParticipantsTable = pgTable("dm_participants", {
  threadId: varchar("thread_id").notNull(),
  userId: varchar("user_id").notNull(),
});

export const messagesTable = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  authorId: varchar("author_id").notNull(),
  channelId: varchar("channel_id"),
  dmThreadId: varchar("dm_thread_id"),
  parentMessageId: varchar("parent_message_id"),
  replyCount: integer("reply_count").notNull().default(0),
  edited: boolean("edited").notNull().default(false),
  pinned: boolean("pinned").notNull().default(false),
  pinnedBy: varchar("pinned_by"),
  mentions: text("mentions").default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type DbMessage = typeof messagesTable.$inferSelect;

export const attachmentsTable = pgTable("attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull(),
  objectPath: text("object_path").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 128 }).notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Attachment = typeof attachmentsTable.$inferSelect;

export const messageReactionsTable = pgTable("message_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull(),
  userId: varchar("user_id").notNull(),
  emojiId: varchar("emoji_id", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MessageReaction = typeof messageReactionsTable.$inferSelect;
