import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ghostSecretsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function generateSecretId(len = 14): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

router.post("/secrets", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const content = req.body?.content;
  if (!content || typeof content !== "string" || content.length < 1 || content.length > 4000) {
    res.status(400).json({ error: "content must be a string between 1 and 4000 characters" });
    return;
  }

  const id = generateSecretId(14);
  await db.insert(ghostSecretsTable).values({
    id,
    content,
    senderId: req.user.id,
  });

  res.status(201).json({ id });
});

router.get("/secrets/:id", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const secret = await db.query.ghostSecretsTable.findFirst({
    where: eq(ghostSecretsTable.id, req.params.id),
  });

  if (!secret) {
    res.status(410).json({ error: "This ghost message has already been viewed or does not exist." });
    return;
  }

  if (secret.viewedAt) {
    res.status(410).json({ error: "This ghost message has already been viewed." });
    return;
  }

  await db.delete(ghostSecretsTable).where(eq(ghostSecretsTable.id, req.params.id));

  res.json({ content: secret.content });
});

export default router;
