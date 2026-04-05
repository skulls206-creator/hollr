import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ghostSecretsTable, dmParticipantsTable, channelsTable, serverMembersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

const router: IRouter = Router();

function generateSecretId(): string {
  return randomBytes(8).toString("hex");
}

async function canAccessContext(
  userId: string,
  contextType: string | null | undefined,
  contextId: string | null | undefined,
  senderId: string,
  targetUserId: string | null | undefined,
): Promise<boolean> {
  if (!contextType || !contextId) {
    return userId === senderId;
  }
  if (contextType === "dm") {
    const participant = await db.query.dmParticipantsTable.findFirst({
      where: and(
        eq(dmParticipantsTable.threadId, contextId),
        eq(dmParticipantsTable.userId, userId),
      ),
    });
    return !!participant;
  }
  if (contextType === "channel") {
    if (targetUserId) {
      return userId === targetUserId;
    }
    const channel = await db.query.channelsTable.findFirst({
      where: eq(channelsTable.id, contextId),
    });
    if (!channel) return false;
    const member = await db.query.serverMembersTable.findFirst({
      where: and(
        eq(serverMembersTable.serverId, channel.serverId),
        eq(serverMembersTable.userId, userId),
      ),
    });
    return !!member;
  }
  return false;
}

router.post("/secrets", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { ciphertext, iv, contextType, contextId, targetUserId } = req.body ?? {};
  if (
    !ciphertext || typeof ciphertext !== "string" || ciphertext.length < 1 ||
    !iv || typeof iv !== "string" || iv.length < 1
  ) {
    res.status(400).json({ error: "ciphertext and iv are required" });
    return;
  }

  const id = generateSecretId();
  await db.insert(ghostSecretsTable).values({
    id,
    ciphertext,
    iv,
    senderId: req.user.id,
    contextType: contextType ?? null,
    contextId: contextId ?? null,
    targetUserId: (typeof targetUserId === "string" && targetUserId.length > 0) ? targetUserId : null,
  });

  res.status(201).json({ id });
});

router.get("/secrets/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const secretId = req.params.id;
  const userId = req.user.id;

  // First check authorization without locking (avoids long-held locks during network I/O)
  const secretMeta = await db.query.ghostSecretsTable.findFirst({
    where: eq(ghostSecretsTable.id, secretId),
  });

  if (!secretMeta) {
    res.status(410).json({ error: "This ghost message has already been viewed or does not exist." });
    return;
  }

  const authorized = await canAccessContext(userId, secretMeta.contextType, secretMeta.contextId, secretMeta.senderId, secretMeta.targetUserId);
  if (!authorized) {
    res.status(403).json({ error: "You are not authorized to view this message." });
    return;
  }

  // Atomically delete and return the secret — DELETE RETURNING ensures exactly one reader wins
  const deleted = await db
    .delete(ghostSecretsTable)
    .where(eq(ghostSecretsTable.id, secretId))
    .returning();

  if (!deleted.length) {
    // Concurrently deleted by another request
    res.status(410).json({ error: "This ghost message has already been viewed or does not exist." });
    return;
  }

  const secret = deleted[0];
  res.json({ ciphertext: secret.ciphertext, iv: secret.iv });
});

export default router;
