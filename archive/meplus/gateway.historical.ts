import { describe, expect, it, vi } from "vitest";
import {
  createHandler,
  hashToken,
} from "../supabase/functions/bailacue-api/handler";
const token = "a".repeat(64);
const env = {
  url: "https://project.supabase.co",
  anonKey: "anon-public",
  serviceKey: "server-only",
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function send(body: unknown, credential = token) {
  return new Request("https://project.supabase.co/functions/v1/bailacue-api", {
    method: "POST",
    headers: { Authorization: `Bearer ${credential}` },
    body: JSON.stringify(body),
  });
}
describe("scoped BailaCue gateway", () => {
  it("accepts only opaque BailaCue sessions, never a broad Supabase JWT", async () => {
    const request = vi.fn().mockResolvedValue(response(true));
    const result = await createHandler(
      env,
      request,
    )(send({ action: "snapshot" }, "eyJhbGciOiJIUzI1NiJ9.broad-me-plus.jwt"));
    expect(result.status).toBe(401);
    expect(
      request.mock.calls.some((c) =>
        String(c[0]).includes("bailacue_app_sessions"),
      ),
    ).toBe(false);
  });
  it("derives ownership from the hashed session and ignores a forged body user ID", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response([{ user_id: "alice" }]))
      .mockResolvedValueOnce(response(null))
      .mockResolvedValueOnce(response([{ revision: 0, payload: {} }]));
    const result = await createHandler(
      env,
      request,
    )(send({ action: "snapshot", userId: "bob" }));
    expect(result.status).toBe(200);
    expect(request.mock.calls[1][0]).toContain(
      `token_hash=eq.${await hashToken(token)}`,
    );
    expect(request.mock.calls[3][0]).toContain("user_id=eq.alice");
    expect(JSON.stringify(request.mock.calls)).not.toContain("eq.bob");
  });
  it("rejects file paths and credentials in metadata", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response([{ user_id: "alice" }]));
    const result = await createHandler(
      env,
      request,
    )(
      send({
        action: "save",
        revision: 0,
        payload: { videos: [{ uri: "file:///private.mov" }] },
      }),
    );
    expect(result.status).toBe(400);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("reports revision conflicts without overwriting newer metadata", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response([{ user_id: "alice" }]))
      .mockResolvedValueOnce(response([]));
    const result = await createHandler(
      env,
      request,
    )(
      send({
        action: "save",
        revision: 4,
        payload: { version: 1, videos: [] },
      }),
    );
    expect(result.status).toBe(409);
    expect(request.mock.calls[2][0]).toContain("revision=eq.4");
  });
  it("rate limits authentication before resolving an account", async () => {
    const request = vi.fn().mockResolvedValue(response(false));
    expect(
      (
        await createHandler(
          env,
          request,
        )(send({ action: "login", username: "alice", password: "password" }))
      ).status,
    ).toBe(429);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("returns a custom session while keeping Me+ Auth tokens server-side", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(
        response([{ user_id: "alice", username: "alice" }]),
      )
      .mockResolvedValueOnce(response({ email: "alice@example.com" }))
      .mockResolvedValueOnce(
        response({
          user: { id: "alice" },
          access_token: "broad-private-auth-token",
          refresh_token: "private-refresh",
        }),
      )
      .mockResolvedValueOnce(response(null));
    const result = await createHandler(
      env,
      request,
    )(send({ action: "login", username: "ALICE", password: "valid-password" }));
    const body = await result.json();
    expect(body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain("private");
    expect(body.user.id).toBe("alice");
    const saved = JSON.parse(request.mock.calls[5][1].body);
    expect(saved.token_hash).toBe(await hashToken(body.token));
    expect(saved.token_hash).not.toBe(body.token);
  });
  it("deletes only BailaCue data through the restricted cleanup RPC", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response([{ user_id: "alice" }]))
      .mockResolvedValueOnce(response(null));
    expect(
      (
        await createHandler(
          env,
          request,
        )(send({ action: "delete", userId: "bob" }))
      ).status,
    ).toBe(200);
    expect(request.mock.calls[2][0]).toContain("rpc/bailacue_delete_app_data");
    expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({
      p_user_id: "alice",
    });
    expect(
      request.mock.calls.every((c) => !String(c[0]).includes("/auth/v1/admin")),
    ).toBe(true);
  });
});
describe("provider-aware collection grant boundaries", () => {
  it("checks recipient ownership and revocation when opening a collection", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response([{ user_id: "alice" }]))
      .mockResolvedValueOnce(response([]));
    const result = await createHandler(
      env,
      request,
    )(
      send({
        action: "share-open",
        id: "10000000-0000-0000-0000-000000000001",
        recipient_id: "bob",
      }),
    );
    expect(result.status).toBe(403);
    expect(request.mock.calls[2][0]).toContain(
      "recipient_id=eq.alice&revoked_at=is.null",
    );
  });
  it("only allows the sender to revoke its own grant", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response([{ user_id: "alice" }]))
      .mockResolvedValueOnce(response(null));
    const result = await createHandler(
      env,
      request,
    )(
      send({
        action: "share-revoke",
        id: "10000000-0000-0000-0000-000000000001",
        userId: "bob",
      }),
    );
    expect(result.status).toBe(200);
    expect(request.mock.calls[2][0]).toContain("user_id=eq.alice");
  });
  it("shares only references and titles, excluding private notes and any submitted credentials", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response([{ user_id: "alice" }]))
      .mockResolvedValueOnce(response([{ user_id: "bob", username: "bob" }]))
      .mockResolvedValueOnce(response([{ username: "alice" }]))
      .mockResolvedValueOnce(response([{ id: "grant" }]));
    const result = await createHandler(
      env,
      request,
    )(
      send({
        action: "share-create",
        recipient: "bob",
        payload: {
          name: "Sunday",
          videos: [
            {
              provider: "google-drive",
              fileId: "file",
              title: "Move",
              style: "Salsa",
              notes: ["private"],
              accessToken: "secret",
              uri: "https://public.example",
            },
          ],
        },
      }),
    );
    expect(result.status).toBe(200);
    const saved = JSON.parse(request.mock.calls[4][1].body);
    expect(saved.payload.videos).toEqual([
      {
        provider: "google-drive",
        fileId: "file",
        title: "Move",
        style: "Salsa",
      },
    ]);
    expect(JSON.stringify(saved)).not.toContain("secret");
  });
});

describe("exact username resolution", () => {
  it("treats underscores as literal username characters, not query wildcards", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response(true))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({}, 400));
    const result = await createHandler(
      env,
      request,
    )(
      send({
        action: "login",
        username: "alice_test",
        password: "valid-password",
      }),
    );
    expect(result.status).toBe(401);
    expect(request.mock.calls[2][0]).toContain("username=eq.alice_test");
    expect(request.mock.calls[2][0]).not.toContain("ilike");
  });
});
