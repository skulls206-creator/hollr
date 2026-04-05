import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ghostSecretsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

const router: IRouter = Router();

function generateSecretId(): string {
  return randomBytes(8).toString("hex");
}

router.post("/secrets", async (req, res) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { ciphertext, iv } = req.body ?? {};
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

  await db.delete(ghostSecretsTable).where(eq(ghostSecretsTable.id, req.params.id));

  res.json({ ciphertext: secret.ciphertext, iv: secret.iv });
});

export default router;
