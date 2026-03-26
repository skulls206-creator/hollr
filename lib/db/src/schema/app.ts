import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, varchar, pgEnum, primaryKey, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userStatusEnum = pgEnum("user_status", ["online", "idle", "dnd", "offline", "invisible"]);
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
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  inviteMaxUses: integer("invite_max_uses"),
  inviteUseCount: integer("invite_use_count").notNull().default(0),
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
}, (t) => [
  index("server_members_server_id_idx").on(t.serverId),
  index("server_members_user_id_idx").on(t.userId),
]);

export type ServerMember = typeof serverMembersTable.$inferSelect;

export const serverBansTable = pgTable("server_bans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  userId: varchar("user_id").notNull(),
  bannedBy: varchar("banned_by").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("server_bans_server_id_idx").on(t.serverId),
  index("server_bans_user_id_idx").on(t.userId),
]);

export type ServerBan = typeof serverBansTable.$inferSelect;

export const channelsTable = pgTable("channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  topic: text("topic"),
  type: channelTypeEnum("type").notNull().default("text"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("channels_server_id_idx").on(t.serverId),
]);

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
}, (t) => [
  index("dm_participants_user_id_idx").on(t.userId),
  index("dm_participants_thread_id_idx").on(t.threadId),
]);

export const messagesTable = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  authorId: varchar("author_id").notNull(),
  channelId: varchar("channel_id"),
  dmThreadId: varchar("dm_thread_id"),
  parentMessageId: varchar("parent_message_id"),
  replyCount: integer("reply_count").notNull().default(0),
  edited: boolean("edited").notNull().default(false),
  deleted: boolean("deleted").notNull().default(false),
  pinned: boolean("pinned").notNull().default(false),
  pinnedBy: varchar("pinned_by"),
  mentions: text("mentions").default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("messages_channel_id_idx").on(t.channelId),
  index("messages_author_id_idx").on(t.authorId),
  index("messages_dm_thread_id_idx").on(t.dmThreadId),
  index("messages_created_at_idx").on(t.createdAt),
]);

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
}, (t) => [
  index("attachments_message_id_idx").on(t.messageId),
]);

export type Attachment = typeof attachmentsTable.$inferSelect;

export const messageReactionsTable = pgTable("message_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull(),
  userId: varchar("user_id").notNull(),
  emojiId: varchar("emoji_id", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("message_reactions_message_id_idx").on(t.messageId),
]);

export type MessageReaction = typeof messageReactionsTable.$inferSelect;

export const channelReadsTable = pgTable("channel_reads", {
  userId: varchar("user_id").notNull(),
  channelId: varchar("channel_id").notNull(),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.channelId] })]);

export type ChannelRead = typeof channelReadsTable.$inferSelect;

// Push notification subscriptions (one row per browser/device per user)
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  // Per-device settings
  label: varchar("label", { length: 64 }),      // user-chosen nickname for this device
  quiet: boolean("quiet").notNull().default(false), // silent notifications (no sound/vibration)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_push_subs_user_id").on(t.userId)]);

// Per-user notification preferences (one row per user, upserted on change)
export const notificationPrefsTable = pgTable("notification_prefs", {
  userId: varchar("user_id").primaryKey().notNull(),
  muteDms: boolean("mute_dms").notNull().default(false),
  // JSON array of channelIds the user has muted
  mutedChannelIds: text("muted_channel_ids").notNull().default("[]"),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type NotificationPrefs = typeof notificationPrefsTable.$inferSelect;

// Tracks which KHURK ecosystem apps a user has removed from their sidebar.
// All apps are visible by default (no row = visible). A row means hidden.
export const khurkAppDismissalsTable = pgTable("khurk_app_dismissals", {
  userId: varchar("user_id").notNull(),
  appId: varchar("app_id", { length: 32 }).notNull(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.appId] })]);

export type KhurkAppDismissal = typeof khurkAppDismissalsTable.$inferSelect;

// Stores DM call signals in the DB so they survive across server instances.
// WS delivers signals instantly; REST polling delivers them cross-instance.
export const dmCallSignalsTable = pgTable("dm_call_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromUserId: varchar("from_user_id").notNull(),
  toUserId: varchar("to_user_id").notNull(),
  threadId: varchar("thread_id"),
  signalType: varchar("signal_type", { length: 32 }).notNull(),
  payload: text("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
}, (t) => [
  index("dm_call_signals_to_user_idx").on(t.toUserId),
  index("dm_call_signals_created_at_idx").on(t.createdAt),
]);

export type DmCallSignal = typeof dmCallSignalsTable.$inferSelect;

// In-app notification history (bell inbox)
export const notificationsTable = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: varchar("type", { length: 32 }).notNull(), // 'dm_message' | 'mention' | 'missed_call' | 'system'
  title: varchar("title", { length: 200 }).notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  link: varchar("link", { length: 500 }),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notifications_user_id_idx").on(t.userId),
  index("notifications_created_at_idx").on(t.createdAt),
]);

export type DbNotification = typeof notificationsTable.$inferSelect;
