import test from "node:test"
import assert from "node:assert/strict"
import {
  parseSsoOidcProviders,
  SsoConfigError,
  type SsoOidcProviderConfig,
} from "./sso-providers.js"

const VALID: SsoOidcProviderConfig = {
  id: "okta",
  name: "Okta",
  clientId: "0oa1b2c3d4",
  clientSecret: "secret-value",
  authorizationUrl: "https://example.okta.com/oauth2/v1/authorize",
  tokenUrl: "https://example.okta.com/oauth2/v1/token",
  userInfoUrl: "https://example.okta.com/oauth2/v1/userinfo",
  scopes: ["openid", "email", "profile"],
}

test("sso-providers: empty/unset raw yields no providers (login surface unchanged)", () => {
  assert.deepEqual(parseSsoOidcProviders(""), [])
  assert.deepEqual(parseSsoOidcProviders("   "), [])
})

test("sso-providers: valid provider parses and applies default scopes", () => {
  const providers = parseSsoOidcProviders(
    JSON.stringify([{ ...VALID, scopes: undefined }].map((p) => ({ ...p, scopes: undefined })))
  )
  assert.equal(providers.length, 1)
  assert.equal(providers[0].id, "okta")
  assert.deepEqual(providers[0].scopes, ["openid", "email", "profile"])
})

test("sso-providers: malformed JSON fails loud", () => {
  assert.throws(() => parseSsoOidcProviders("{not json"), SsoConfigError)
})

test("sso-providers: schema violations fail loud with paths", () => {
  assert.throws(
    () => parseSsoOidcProviders(JSON.stringify([{ ...VALID, id: "Bad_Id!" }])),
    (error: unknown) => {
      assert.ok(error instanceof SsoConfigError)
      assert.match(error.message, /id must be a short lowercase slug/)
      return true
    }
  )
  assert.throws(
    () => parseSsoOidcProviders(JSON.stringify([{ ...VALID, authorizationUrl: "ftp://nope" }])),
    (error: unknown) => {
      assert.ok(error instanceof SsoConfigError)
      assert.match(error.message, /authorizationUrl/)
      return true
    }
  )
})

test("sso-providers: duplicate ids are rejected", () => {
  assert.throws(() => parseSsoOidcProviders(JSON.stringify([VALID, VALID])), SsoConfigError)
})
