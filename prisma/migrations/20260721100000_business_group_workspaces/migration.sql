BEGIN;

CREATE TYPE "BusinessGroupRole" AS ENUM ('OWNER', 'MANAGER');

CREATE TABLE "BusinessGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessGroupMembership" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "BusinessGroupRole" NOT NULL DEFAULT 'MANAGER',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessGroupMembership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Company" ADD COLUMN "groupId" TEXT;

-- Existing workspaces become a one-workspace business group without deleting or moving any data.
INSERT INTO "BusinessGroup" ("id", "name", "createdAt", "updatedAt")
SELECT 'grp_' || md5("id"), COALESCE(NULLIF(trim("name"), ''), 'Business Group'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company";

UPDATE "Company"
SET "groupId" = 'grp_' || md5("id")
WHERE "groupId" IS NULL;

-- Every current workspace owner becomes the protected owner of that workspace's new group.
INSERT INTO "BusinessGroupMembership" ("id", "groupId", "userId", "role", "active", "createdAt", "updatedAt")
SELECT 'bgm_' || md5(c."groupId" || ':' || u."id"), c."groupId", u."id", 'OWNER'::"BusinessGroupRole", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
JOIN "Company" c ON c."id" = u."companyId"
WHERE u."role" = 'OWNER'
ON CONFLICT DO NOTHING;

ALTER TABLE "Company" ADD CONSTRAINT "Company_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "BusinessGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessGroupMembership" ADD CONSTRAINT "BusinessGroupMembership_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "BusinessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessGroupMembership" ADD CONSTRAINT "BusinessGroupMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Company_groupId_idx" ON "Company"("groupId");
CREATE UNIQUE INDEX "BusinessGroupMembership_groupId_userId_key" ON "BusinessGroupMembership"("groupId", "userId");
CREATE INDEX "BusinessGroupMembership_userId_active_idx" ON "BusinessGroupMembership"("userId", "active");
CREATE INDEX "BusinessGroupMembership_groupId_role_active_idx" ON "BusinessGroupMembership"("groupId", "role", "active");

-- Store one ISO country code only. The UI displays the full country name.
UPDATE "Branch"
SET "country" = CASE
  WHEN upper(trim(COALESCE("country", ''))) IN ('ZW', 'ZIM', 'ZIMBABWE') THEN 'ZW'
  WHEN upper(trim(COALESCE("country", ''))) IN ('ZA', 'SA', 'RSA', 'SOUTH AFRICA') THEN 'ZA'
  ELSE NULL
END;

UPDATE "Branch" b
SET "country" = CASE
  WHEN upper(trim(COALESCE(f."country", c."market", ''))) IN ('ZA', 'SA', 'RSA', 'SOUTH AFRICA') THEN 'ZA'
  ELSE 'ZW'
END
FROM "Company" c
LEFT JOIN "CompanyFinanceSettings" f ON f."companyId" = c."id"
WHERE c."id" = b."companyId"
  AND b."country" IS NULL;

UPDATE "Branch" b
SET "timezone" = CASE WHEN b."country" = 'ZA' THEN 'Africa/Johannesburg' ELSE 'Africa/Harare' END
WHERE b."timezone" IS NULL OR trim(b."timezone") = '';

COMMIT;
