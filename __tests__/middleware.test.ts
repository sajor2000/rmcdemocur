import { afterEach, describe, expect, it } from "vitest";
import { middleware } from "@/middleware";
import { AUTH_COOKIE, signToken } from "@/lib/api-auth";

const SECRET = "test-api-secret";
const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

type FakeRequestInit = {
  path: string;
  bearer?: string;
  cookie?: string;
};

/** Minimal NextRequest stand-in covering the fields middleware() reads. */
function fakeRequest({ path, bearer, cookie }: FakeRequestInit) {
  return {
    nextUrl: { pathname: path, searchParams: new URLSearchParams() },
    headers: new Headers(bearer ? { authorization: bearer } : {}),
    cookies: {
      get: (name: string) =>
        name === AUTH_COOKIE && cookie !== undefined ? { name, value: cookie } : undefined,
    },
  } as unknown as Parameters<typeof middleware>[0];
}

describe("middleware auth", () => {
  it("leaves everything open when API_SECRET is unset", async () => {
    delete process.env.API_SECRET;
    const res = await middleware(fakeRequest({ path: "/api/courses/1/summary" }));
    expect(res.status).toBe(200);
  });

  it("401s /api/* with no credential when API_SECRET is set", async () => {
    process.env.API_SECRET = SECRET;
    const res = await middleware(fakeRequest({ path: "/api/courses/1/summary" }));
    expect(res.status).toBe(401);
  });

  it("accepts the raw-secret bearer on /api/*", async () => {
    process.env.API_SECRET = SECRET;
    const res = await middleware(
      fakeRequest({ path: "/api/courses/1/map", bearer: `Bearer ${SECRET}` }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts a valid session cookie on /api/* (including /api/media)", async () => {
    process.env.API_SECRET = SECRET;
    const token = await signToken(SECRET, Date.now() / 1000);
    for (const path of ["/api/search", "/api/media/1"]) {
      const res = await middleware(fakeRequest({ path, cookie: token }));
      expect(res.status).toBe(200);
    }
  });

  it("rejects an expired or forged cookie on /api/*", async () => {
    process.env.API_SECRET = SECRET;
    const expired = await signToken(SECRET, Date.now() / 1000 - 10_000, 60);
    const forged = await signToken("other-secret", Date.now() / 1000);
    for (const cookie of [expired, forged, "garbage", SECRET]) {
      const res = await middleware(fakeRequest({ path: "/api/search", cookie }));
      expect(res.status).toBe(401);
    }
  });

  it("mints a session cookie on a page load with no cookie", async () => {
    process.env.API_SECRET = SECRET;
    const res = await middleware(fakeRequest({ path: "/courses/1" }));
    expect(res.status).toBe(200);
    expect(res.cookies.get(AUTH_COOKIE)?.value).toBeTruthy();
  });

  it("does not re-mint when the cookie is fresh and valid", async () => {
    process.env.API_SECRET = SECRET;
    const fresh = await signToken(SECRET, Date.now() / 1000);
    const res = await middleware(fakeRequest({ path: "/courses/1", cookie: fresh }));
    expect(res.cookies.get(AUTH_COOKIE)).toBeUndefined();
  });

  it("re-mints on a page load when the cookie was signed with a rotated-out secret", async () => {
    process.env.API_SECRET = SECRET;
    const staleSecretCookie = await signToken("old-secret", Date.now() / 1000);
    const res = await middleware(
      fakeRequest({ path: "/courses/1", cookie: staleSecretCookie }),
    );
    expect(res.cookies.get(AUTH_COOKIE)?.value).toBeTruthy();
  });
});
