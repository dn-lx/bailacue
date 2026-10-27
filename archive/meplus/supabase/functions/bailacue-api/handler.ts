// Framework-free handler, exercised by Vitest with an injected Supabase transport.
export type Environment = {
  url: string;
  anonKey: string;
  serviceKey: string;
  allowedOrigin?: string;
};
export const hashToken = async (token: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const opaqueToken = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function createHandler(
  environment: Environment,
  request: typeof fetch = fetch,
) {
  const { url, anonKey, serviceKey } = environment;
  async function api(
    path: string,
    method = "GET",
    body?: unknown,
    auth = serviceKey,
    prefer?: string,
  ) {
    const response = await request(`${url}${path}`, {
      method,
      headers: {
        apikey: auth === serviceKey ? serviceKey : anonKey,
        Authorization: `Bearer ${auth}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return response;
  }
  async function data(
    path: string,
    method = "GET",
    body?: unknown,
    prefer?: string,
  ) {
    const response = await api(
      `/rest/v1/${path}`,
      method,
      body,
      serviceKey,
      prefer,
    );
    if (!response.ok)
      throw new ApiError(
        "BailaCue could not save this change. Try again.",
        response.status === 409 ? 409 : 503,
      );
    return response.status === 204 ? null : response.json();
  }
  return async (incoming: Request): Promise<Response> => {
    const origin = incoming.headers.get("Origin");
    const cors: Record<string, string> =
      environment.allowedOrigin && origin === environment.allowedOrigin
        ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
        : {};
    const respond = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          ...cors,
        },
      });
    if (incoming.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Headers": "authorization, content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    if (incoming.method !== "POST") return respond({ error: "Use POST." }, 405);
    if (origin && origin !== environment.allowedOrigin)
      return respond({ error: "Origin not allowed." }, 403);
    try {
      if (Number(incoming.headers.get("Content-Length")) > 2200000)
        throw new ApiError("Metadata is too large.", 413);
      const raw = await incoming.text();
      if (raw.length > 2200000)
        throw new ApiError("Metadata is too large.", 413);
      const body = JSON.parse(raw) as Record<string, unknown>;
      const action = String(body.action ?? "");
      const ip = incoming.headers.get("x-real-ip") ?? "unknown";
      const rate = await data("rpc/bailacue_rate_limit", "POST", {
        p_key: await hashToken(`ip:${ip}`),
        p_limit: 120,
      });
      if (rate !== true)
        throw new ApiError("Too many requests. Try again in 15 minutes.", 429);
      const username = String(body.username ?? "")
        .trim()
        .toLowerCase();
      const password = String(body.password ?? "");
      if (["login", "register", "recover"].includes(action)) {
        if (
          (await data("rpc/bailacue_rate_limit", "POST", {
            p_key: await hashToken(`identity:${username || body.email}`),
            p_limit: 12,
          })) !== true
        )
          throw new ApiError(
            "Too many attempts. Try again in 15 minutes.",
            429,
          );
        if (action === "recover") {
          const email = String(body.email ?? "");
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new ApiError("Enter your account email.");
          await api("/auth/v1/recover", "POST", { email }, anonKey);
          return respond({
            message:
              "If this email has an account, Supabase will send its recovery instructions. This uses the shared Me+ email policy.",
          });
        }
        if (!/^[a-z0-9_]{3,30}$/.test(username))
          throw new ApiError(
            "Use 3–30 letters, numbers or underscores for your username.",
          );
        if (password.length < 8 || password.length > 256)
          throw new ApiError("Use a password between 8 and 256 characters.");
        if (action === "register") {
          const email = String(body.email ?? "").trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            throw new ApiError("Enter a valid account email.");
          const check = await data(
            `bailacue_profiles?username=eq.${encodeURIComponent(username)}&select=user_id`,
          );
          if (check.length)
            throw new ApiError("This username is unavailable.", 409);
          const existing = await api(
            "/auth/v1/token?grant_type=password",
            "POST",
            { email, password },
            anonKey,
          );
          if (existing.ok) {
            const identity = (await existing.json()) as {
              user: { id: string };
            };
            const profile = await api("/rest/v1/bailacue_profiles", "POST", {
              user_id: identity.user.id,
              username,
            });
            if (!profile.ok)
              throw new ApiError(
                "This Me+ account already has a BailaCue username, or this username is unavailable.",
                409,
              );
            return respond({
              message:
                "BailaCue username linked to your existing Me+ account. You can sign in now.",
            });
          }
          const signup = await api(
            "/auth/v1/signup",
            "POST",
            { email, password },
            anonKey,
          );
          if (!signup.ok)
            throw new ApiError(
              "Registration was not completed. Check the password policy or use password recovery.",
            );
          const result = (await signup.json()) as {
            user?: { id?: string };
            id?: string;
          };
          const userId = result.user?.id ?? result.id;
          if (userId) {
            // auth.users foreign key rejects Supabase's obfuscated existing-account IDs.
            const profile = await api("/rest/v1/bailacue_profiles", "POST", {
              user_id: userId,
              username,
            });
            if (!profile.ok)
              throw new ApiError(
                "Registration needs account verification or this email already has an account. Use sign-in or recovery.",
              );
          }
          return respond({
            message:
              "Check your email if confirmation is required by Me+. Then sign in with your BailaCue username.",
          });
        }
        const profiles = await data(
          `bailacue_profiles?username=eq.${encodeURIComponent(username)}&select=user_id,username`,
        );
        const profile = profiles[0];
        let email = "missing-bailacue-account@invalid.example";
        if (profile) {
          const account = await api(`/auth/v1/admin/users/${profile.user_id}`);
          if (!account.ok)
            throw new ApiError("Sign-in is unavailable. Try again.", 503);
          email = (await account.json()).email;
        }
        const signedIn = await api(
          "/auth/v1/token?grant_type=password",
          "POST",
          { email, password },
          anonKey,
        );
        if (!signedIn.ok || !profile)
          throw new ApiError(
            "Username or password is incorrect, or email confirmation is required.",
            401,
          );
        const auth = (await signedIn.json()) as { user: { id: string } };
        if (auth.user.id !== profile.user_id)
          throw new ApiError("Account verification failed.", 401);
        // Broad Me+ Supabase access/refresh tokens never leave this function.
        const token = opaqueToken();
        const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
        await data("bailacue_app_sessions", "POST", {
          token_hash: await hashToken(token),
          user_id: profile.user_id,
          expires_at: expiresAt,
        });
        return respond({
          token,
          expiresAt,
          user: { id: profile.user_id, username: profile.username },
        });
      }
      const token =
        incoming.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
      if (!/^[a-f0-9]{64}$/.test(token))
        throw new ApiError("Sign in to BailaCue to continue.", 401);
      const tokenHash = await hashToken(token);
      const sessions = await data(
        `bailacue_app_sessions?token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id`,
      );
      const userId = sessions[0]?.user_id;
      if (!userId)
        throw new ApiError(
          "Your BailaCue session expired. Sign in again.",
          401,
        );
      // Owner ID comes exclusively from the validated opaque session, never the body.
      if (action === "logout") {
        await data(
          `bailacue_app_sessions?token_hash=eq.${tokenHash}`,
          "DELETE",
        );
        return respond({ ok: true });
      }
      if (action === "password") {
        const account = await api(`/auth/v1/admin/users/${userId}`);
        const email = (await account.json()).email;
        const verify = await api(
          "/auth/v1/token?grant_type=password",
          "POST",
          { email, password },
          anonKey,
        );
        const next = String(body.newPassword ?? "");
        if (!verify.ok)
          throw new ApiError("Your current password is incorrect.", 401);
        if (next.length < 8 || next.length > 256)
          throw new ApiError("Use a password between 8 and 256 characters.");
        const updated = await api(`/auth/v1/admin/users/${userId}`, "PUT", {
          password: next,
        });
        if (!updated.ok)
          throw new ApiError(
            "The new password did not meet the shared Me+ password policy.",
          );
        await data(`bailacue_app_sessions?user_id=eq.${userId}`, "DELETE");
        return respond({
          ok: true,
          message:
            "Password updated for your shared Me+ identity. Sign in again on your BailaCue devices.",
        });
      }
      if (action === "snapshot") {
        await data(
          "bailacue_sync_snapshots?on_conflict=user_id",
          "POST",
          { user_id: userId },
          "resolution=ignore-duplicates,return=minimal",
        );
        const rows = await data(
          `bailacue_sync_snapshots?user_id=eq.${userId}&select=revision,payload,updated_at`,
        );
        return respond(rows[0]);
      }
      if (action === "save") {
        const revision = Number(body.revision);
        if (!Number.isSafeInteger(revision) || revision < 0)
          throw new ApiError("Invalid sync revision.");
        const payload = body.payload;
        if (
          !payload ||
          typeof payload !== "object" ||
          Array.isArray(payload) ||
          JSON.stringify(payload).length > 2097152
        )
          throw new ApiError("Invalid metadata snapshot.");
        // Device secrets/paths are forbidden even if a compromised client submits them.
        const serialised = JSON.stringify(payload);
        if (
          /"(?:uri|offlineUri|thumbnail|accessToken|refreshToken|token|sessionUrl|sessionId|headers|dropboxAppKey)"\s*:/.test(
            serialised,
          )
        )
          throw new ApiError("Device files and credentials cannot be synced.");
        const rows = await data(
          `bailacue_sync_snapshots?user_id=eq.${userId}&revision=eq.${revision}`,
          "PATCH",
          {
            payload,
            revision: revision + 1,
            updated_at: new Date().toISOString(),
          },
          "return=representation",
        );
        if (!rows.length)
          throw new ApiError(
            "Another device changed this library. Review the cloud copy before replacing it.",
            409,
          );
        return respond({ revision: rows[0].revision });
      }
      if (action === "share-create") {
        const recipientName = String(body.recipient ?? "")
          .trim()
          .toLowerCase();
        if (!/^[a-z0-9_]{3,30}$/.test(recipientName))
          throw new ApiError("Enter the recipient’s BailaCue username.");
        const recipients = await data(
          `bailacue_profiles?username=eq.${encodeURIComponent(recipientName)}&select=user_id,username`,
        );
        const recipient = recipients[0];
        if (!recipient || recipient.user_id === userId)
          throw new ApiError("Choose another BailaCue user.");
        const input = body.payload as
          { name?: unknown; videos?: unknown[] } | undefined;
        if (
          !input ||
          typeof input.name !== "string" ||
          !input.name.trim() ||
          input.name.length > 160 ||
          !Array.isArray(input.videos) ||
          !input.videos.length ||
          input.videos.length > 100
        )
          throw new ApiError(
            "Choose a collection containing 1–100 online videos.",
          );
        const videos = input.videos.map((value) => {
          const v = value as Record<string, unknown>;
          if (
            !v ||
            !["google-drive", "dropbox"].includes(String(v.provider)) ||
            typeof v.fileId !== "string" ||
            !v.fileId ||
            v.fileId.length > 300 ||
            typeof v.title !== "string" ||
            v.title.length > 300
          )
            throw new ApiError("Only provider video references can be shared.");
          return {
            provider: v.provider,
            fileId: v.fileId,
            title: v.title,
            style: ["Bachata", "Salsa", "Other"].includes(String(v.style))
              ? v.style
              : "Other",
          };
        });
        const senders = await data(
          `bailacue_profiles?user_id=eq.${userId}&select=username`,
        );
        const result = await data(
          "bailacue_collection_shares",
          "POST",
          {
            user_id: userId,
            recipient_id: recipient.user_id,
            sender_name: senders[0]?.username ?? "Dancer",
            recipient_name: recipient.username,
            payload: { name: input.name, videos },
          },
          "return=representation",
        );
        return respond({ id: result[0].id });
      }
      if (action === "shares") {
        const rows = await data(
          `bailacue_collection_shares?or=(user_id.eq.${userId},recipient_id.eq.${userId})&select=id,user_id,sender_name,recipient_name,payload,revoked_at,created_at&order=created_at.desc`,
        );
        return respond({ shares: rows });
      }
      if (["share-open", "share-revoke"].includes(action)) {
        const id = String(body.id ?? "");
        if (!/^[a-f0-9-]{36}$/i.test(id))
          throw new ApiError("Invalid collection share.");
        if (action === "share-revoke") {
          await data(
            `bailacue_collection_shares?id=eq.${id}&user_id=eq.${userId}`,
            "PATCH",
            { revoked_at: new Date().toISOString() },
          );
          return respond({ ok: true });
        }
        const rows = await data(
          `bailacue_collection_shares?id=eq.${id}&recipient_id=eq.${userId}&revoked_at=is.null&select=payload`,
        );
        if (!rows.length)
          throw new ApiError(
            "This collection share is unavailable or revoked.",
            403,
          );
        return respond(rows[0].payload);
      }
      if (action === "delete") {
        // A BailaCue deletion never deletes the shared Me+ identity or any health data.
        await data("rpc/bailacue_delete_app_data", "POST", {
          p_user_id: userId,
        });
        return respond({ ok: true });
      }
      throw new ApiError("Unknown BailaCue action.", 404);
    } catch (error) {
      return respond(
        {
          error:
            error instanceof ApiError
              ? error.message
              : "BailaCue could not complete the request. Try again.",
        },
        error instanceof ApiError ? error.status : 500,
      );
    }
  };
}
