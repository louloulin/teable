-- R50 — SAML InResponseTo cross-service replay protection.
--
-- Persist the AuthnRequest ID on the login-state row so the callback
-- can verify the IdP's <samlp:Response InResponseTo="..."> attribute
-- matches the AuthnRequest we actually issued. Without this check a
-- malicious party could forward a valid Response from one service
-- to ours and we'd accept it as ours.
ALTER TABLE "sso_login_state"
  ADD COLUMN "request_id" TEXT;

-- Lookup index for the (state, request_id) tuple used by completeLogin.
CREATE INDEX IF NOT EXISTS "sso_login_state_state_request_id_idx"
  ON "sso_login_state"("state", "request_id");
