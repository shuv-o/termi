-- Dynamic (SOCKS) and remote port forwarding
CREATE TYPE "TunnelMode" AS ENUM ('LOCAL', 'DYNAMIC', 'REMOTE');

ALTER TABLE "TunnelSession" ADD COLUMN "mode" "TunnelMode" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN "localHost" TEXT;
