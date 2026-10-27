import * as LocalAuthentication from "expo-local-authentication";
export async function unlock() {
  if (!(await LocalAuthentication.isEnrolledAsync()))
    throw new Error(
      "Set up a screen lock, fingerprint or Face ID in your phone’s settings first.",
    );
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock BailaCue",
    cancelLabel: "Keep locked",
    disableDeviceFallback: false,
  });
  if (!result.success)
    throw new Error("BailaCue is locked. Try again when you’re ready.");
}
