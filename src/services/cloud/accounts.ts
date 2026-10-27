import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { vault } from "./vault";
import { connectGoogle, googleToken, disconnectGoogle } from "./google";
import { type Connection } from "../../core/types";
WebBrowser.maybeCompleteAuthSession();
const discovery = {
  authorizationEndpoint: "https://www.dropbox.com/oauth2/authorize",
  tokenEndpoint: "https://api.dropboxapi.com/oauth2/token",
};
type Credential = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  appKey: string;
};
async function tokenRequest(params: Record<string, string>) {
  const response = await fetch(discovery.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok)
    throw new Error(
      "Dropbox sign-in expired or was refused. Reconnect your account; your notes are kept.",
    );
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}
export async function connectAccount(
  provider: Connection["provider"],
  appKey: string,
  write = false,
): Promise<Connection> {
  if (provider === "google-drive") {
    const account = await connectGoogle(write);
    return {
      ...account,
      id: `google-${account.accountId}`,
      provider,
      connected: true,
    };
  }
  if (!/^[A-Za-z0-9_-]{5,100}$/.test(appKey))
    throw new Error(
      "BailaCue needs its Dropbox app key before connecting. Add it under App connection setup. This is a public app identifier, not your password.",
    );
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "bailacue",
    path: "oauth/dropbox",
  });
  const request = new AuthSession.AuthRequest({
    clientId: appKey,
    redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    scopes: [
      "account_info.read",
      "files.metadata.read",
      "files.content.read",
      "files.content.write",
    ],
    extraParams: { token_access_type: "offline" },
  });
  await request.makeAuthUrlAsync(discovery);
  const result = await request.promptAsync(discovery);
  if (result.type !== "success" || !result.params.code || !request.codeVerifier)
    throw new Error("Dropbox connection cancelled or not completed.");
  const token = await tokenRequest({
    code: result.params.code,
    grant_type: "authorization_code",
    client_id: appKey,
    code_verifier: request.codeVerifier,
    redirect_uri: redirectUri,
  });
  const response = await fetch(
    "https://api.dropboxapi.com/2/users/get_current_account",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token.access_token}` },
    },
  );
  if (!response.ok)
    throw new Error("Dropbox did not confirm the signed-in account.");
  const account = (await response.json()) as {
    account_id: string;
    email: string;
    name: { display_name: string };
  };
  const id = `dropbox-${account.account_id.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  const credential: Credential = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? "",
    expiresAt: Date.now() + token.expires_in * 1000,
    appKey,
  };
  await vault.set(id, JSON.stringify(credential));
  return {
    id,
    provider,
    accountId: account.account_id,
    email: account.email,
    name: account.name.display_name,
    writable: true,
    connected: true,
  };
}
// Serialise refreshes per account so simultaneous playback/refresh cannot race.
const refreshing = new Map<string, Promise<string>>();
export async function accessToken(connection: Connection) {
  if (!connection.connected)
    throw new Error(
      "Reconnect this storage account to continue. Your notes are kept.",
    );
  const existing = refreshing.get(connection.id);
  if (existing) return existing;
  const refresh = (async () => {
    if (connection.provider === "google-drive")
      return googleToken(connection.accountId, connection.writable);
    const raw = await vault.get(connection.id);
    if (!raw)
      throw new Error(
        Platform.OS === "web"
          ? "Reconnect Dropbox after reloading this browser preview."
          : "Reconnect your Dropbox account in Storage.",
      );
    const credential: Credential = JSON.parse(raw);
    if (credential.expiresAt > Date.now() + 60000)
      return credential.accessToken;
    const next = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: credential.refreshToken,
      client_id: credential.appKey,
    });
    await vault.set(
      connection.id,
      JSON.stringify({
        ...credential,
        accessToken: next.access_token,
        expiresAt: Date.now() + next.expires_in * 1000,
      }),
    );
    return next.access_token;
  })();
  refreshing.set(connection.id, refresh);
  try {
    return await refresh;
  } finally {
    refreshing.delete(connection.id);
  }
}
export async function disconnectAccount(id: string) {
  if (id.startsWith("google-")) await disconnectGoogle(id);
  await vault.remove(id);
}
