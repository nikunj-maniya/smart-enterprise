-- Store the self-registration token raw (re-displayable invite URL) instead of hashed.
DROP INDEX "RegistrationLink_tokenHash_key";
ALTER TABLE "RegistrationLink" RENAME COLUMN "tokenHash" TO "token";
CREATE UNIQUE INDEX "RegistrationLink_token_key" ON "RegistrationLink"("token");
