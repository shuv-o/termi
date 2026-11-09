-- Connection history: one audit entry when a terminal, file browser or
-- desktop is opened, read back by the History page.
ALTER TYPE "AuditAction" ADD VALUE 'CONNECTION_OPENED';

CREATE INDEX "AuditLog_userId_action_createdAt_idx" ON "AuditLog"("userId", "action", "createdAt");
