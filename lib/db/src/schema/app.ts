import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, varchar, pgEnum, primaryKey, index, foreignKey } from "drizzle-orm/pg-core";
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
  isSupporter: boolean("is_supporter").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  referralCode: varchar("referral_code", { length: 16 }).unique(),
  referredByUserId: varchar("referred_by_user_id"),
  signupIp: text("signup_ip"),
  referralSupporterUntil: timestamp("referral_supporter_until", { withTimezone: true }),
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
  nsfw: boolean("nsfw").notNull().default(false),
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

// Expo push tokens — registered from the mobile app, used to deliver native push
export const expoPushTokensTable = pgTable("expo_push_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  token: text("token").notNull().unique(),
  label: varchar("label", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_expo_push_tokens_user_id").on(t.userId)]);

export type ExpoPushToken = typeof expoPushTokensTable.$inferSelect;

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
  userId: varchar("user_id").notNull().references(() => userProfilesTable.userId, { onDelete: "cascade" }),
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

// ── Foldr (cloud file manager) ─────────────────────────────────────────────

export const foldrFoldersTable = pgTable("foldr_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => userProfilesTable.userId, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: varchar("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("foldr_folders_user_id_idx").on(t.userId),
  index("foldr_folders_parent_id_idx").on(t.parentId),
]);

export type FoldrFolder = typeof foldrFoldersTable.$inferSelect;

export const foldrFilesTable = pgTable("foldr_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => userProfilesTable.userId, { onDelete: "cascade" }),
  folderId: varchar("folder_id"),
  name: varchar("name", { length: 512 }).notNull(),
  size: integer("size").notNull(),
  mimeType: varchar("mime_type", { length: 128 }).notNull(),
  cid: varchar("cid", { length: 256 }).notNull(),
  isEncrypted: boolean("is_encrypted").notNull().default(false),
  encryptedKey: text("encrypted_key"),
  isClientEncrypted: boolean("is_client_encrypted").notNull().default(false),
  iv: varchar("iv", { length: 64 }),
  isStarred: boolean("is_starred").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  index("foldr_files_user_id_idx").on(t.userId),
  index("foldr_files_folder_id_idx").on(t.folderId),
  index("foldr_files_uploaded_at_idx").on(t.uploadedAt),
]);

export type FoldrFile = typeof foldrFilesTable.$inferSelect;

export const foldrUserKeysTable = pgTable("foldr_user_keys", {
  userId: varchar("user_id").primaryKey().notNull().references(() => userProfilesTable.userId, { onDelete: "cascade" }),
  wrappedKey: text("wrapped_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type FoldrUserKey = typeof foldrUserKeysTable.$inferSelect;

// ── Ballpoint (rich text notes) ────────────────────────────────────────────
export const ballpointNotesTable = pgTable("ballpoint_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => userProfilesTable.userId, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull().default("Untitled"),
  content: text("content").notNull().default(""),
  isPinned: boolean("is_pinned").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  isTrashed: boolean("is_trashed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("ballpoint_notes_user_id_idx").on(t.userId),
  index("ballpoint_notes_updated_at_idx").on(t.updatedAt),
]);

export type BallpointNote = typeof ballpointNotesTable.$inferSelect;

// ── Referral system ────────────────────────────────────────────────────────
export const referralsTable = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => userProfilesTable.userId, { onDelete: "cascade" }),
  referredUserId: varchar("referred_user_id").notNull().unique().references(() => userProfilesTable.userId, { onDelete: "cascade" }),
  signupIp: text("signup_ip"),
  validated: boolean("validated").notNull().default(false),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("referrals_referrer_id_idx").on(t.referrerId),
  index("referrals_referred_user_id_idx").on(t.referredUserId),
]);

export type Referral = typeof referralsTable.$inferSelect;
