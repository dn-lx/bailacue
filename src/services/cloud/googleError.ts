export class GoogleDriveSetupError extends Error {
  constructor() {
    super(
      "Google Drive isn’t ready in this build. BailaCue’s connection setup needs to be completed. You can import videos from Files in the meantime.",
    );
    this.name = "GoogleDriveSetupError";
  }
}

/** Google code 10 concerns the app registration, never the user's password. */
export function googleConnectionError(error: unknown): Error {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const message = error instanceof Error ? error.message : "";
  if (
    code === "10" ||
    code === "DEVELOPER_ERROR" ||
    /DEVELOPER_ERROR|developer console is not set up correctly/i.test(message)
  ) {
    return new GoogleDriveSetupError();
  }
  return error instanceof Error
    ? error
    : new Error("Google Drive connection did not complete. Please try again.");
}
