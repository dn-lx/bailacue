export async function connectGoogle(_write = false): Promise<{
  accountId: string;
  email: string;
  name: string;
  writable: boolean;
}> {
  throw new Error(
    "Connect Google Drive in the Android or iOS app. Browser previews support local imports.",
  );
}
export async function googleToken(
  _accountId: string,
  _write = false,
): Promise<string> {
  throw new Error("Connect Google Drive in the mobile app.");
}
export async function disconnectGoogle(_id: string) {}
