import { beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  configure: vi.fn(),
  hasPlayServices: vi.fn(),
  signIn: vi.fn(),
  signInSilently: vi.fn(),
  getTokens: vi.fn(),
  getCurrentUser: vi.fn(),
  signOut: vi.fn(),
  platform: { OS: "android" },
}));
vi.mock("react-native", () => ({ Platform: sdk.platform }));
vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: sdk,
}));
import {
  connectGoogle,
  googleToken,
} from "../src/services/cloud/google.native";
import { GoogleDriveSetupError } from "../src/services/cloud/googleError";

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  sdk.platform.OS = "android";
  sdk.signIn.mockResolvedValue({
    type: "success",
    data: {
      user: { id: "chosen-user", email: "dancer@example.com", name: "Dancer" },
    },
  });
});
it.each([10, "10", "DEVELOPER_ERROR"])(
  "turns Google registration rejection %s into actionable setup failure",
  async (code) => {
    sdk.signIn.mockRejectedValue(
      Object.assign(new Error("DEVELOPER_ERROR: see troubleshooting"), {
        code,
      }),
    );
    await expect(connectGoogle()).rejects.toBeInstanceOf(GoogleDriveSetupError);
    await expect(connectGoogle()).rejects.toThrow("import videos from Files");
  },
);
it("recognizes the photographed developer error even without a numeric code", async () => {
  sdk.signIn.mockRejectedValue(
    new Error(
      "DEVELOPER_ERROR: Follow troubleshooting instructions at https://react-native-google-signin.github.io/docs/troubleshooting",
    ),
  );
  await expect(connectGoogle()).rejects.toBeInstanceOf(GoogleDriveSetupError);
});
it("retains the user's chosen account and requests read-only access unless uploads are chosen", async () => {
  await expect(connectGoogle()).resolves.toMatchObject({
    accountId: "chosen-user",
    writable: false,
  });
  expect(sdk.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    }),
  );
  await expect(connectGoogle(true)).resolves.toMatchObject({
    accountId: "chosen-user",
    writable: true,
  });
  expect(sdk.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      scopes: ["https://www.googleapis.com/auth/drive"],
    }),
  );
});
it("handles the same registration error when reopening a connected video", async () => {
  sdk.signInSilently.mockRejectedValue(
    Object.assign(new Error("Google rejected registration"), { code: "10" }),
  );
  await expect(googleToken("chosen-user")).rejects.toBeInstanceOf(
    GoogleDriveSetupError,
  );
  expect(sdk.getTokens).not.toHaveBeenCalled();
});
it("does not return a different user's access token", async () => {
  sdk.signInSilently.mockResolvedValue({
    type: "success",
    data: { user: { id: "other-user" } },
  });
  await expect(googleToken("chosen-user")).rejects.toThrow(
    "Reconnect this Google account",
  );
  expect(sdk.getTokens).not.toHaveBeenCalled();
});
it("reports missing iOS registration before starting the SDK", async () => {
  sdk.platform.OS = "ios";
  vi.stubEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", "");
  await expect(connectGoogle()).rejects.toBeInstanceOf(GoogleDriveSetupError);
  expect(sdk.configure).not.toHaveBeenCalled();
});
it("keeps unrelated connection failures distinguishable from app setup", async () => {
  const network = new Error("Network unavailable");
  sdk.signIn.mockRejectedValue(network);
  await expect(connectGoogle()).rejects.toBe(network);
});
it.each([true, false])(
  "refreshes the chosen account token with its upload permission (write=%s)",
  async (write) => {
    sdk.signInSilently.mockResolvedValue({
      type: "success",
      data: { user: { id: "chosen-user" } },
    });
    sdk.getTokens.mockResolvedValue({ accessToken: "own-token" });
    await expect(googleToken("chosen-user", write)).resolves.toBe("own-token");
    expect(sdk.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scopes: [
          write
            ? "https://www.googleapis.com/auth/drive"
            : "https://www.googleapis.com/auth/drive.readonly",
        ],
      }),
    );
  },
);
