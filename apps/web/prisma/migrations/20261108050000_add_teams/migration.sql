-- Teams: members with roles, a shared vault of servers, email invitations
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

ALTER TYPE "AuditAction" ADD VALUE 'TEAM_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_MEMBER_INVITED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_MEMBER_JOINED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_MEMBER_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_ROLE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_SERVER_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'TEAM_SERVER_REMOVED';

CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeamServer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamServer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamServer_teamId_serverId_key" ON "TeamServer"("teamId", "serverId");
CREATE INDEX "TeamServer_serverId_idx" ON "TeamServer"("serverId");
ALTER TABLE "TeamServer" ADD CONSTRAINT "TeamServer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamServer" ADD CONSTRAINT "TeamServer_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TeamInvitation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamInvitation_tokenHash_key" ON "TeamInvitation"("tokenHash");
CREATE INDEX "TeamInvitation_teamId_idx" ON "TeamInvitation"("teamId");
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
