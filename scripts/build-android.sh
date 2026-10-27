#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK directory}"
npx expo prebuild --platform android --no-install
# Internal preview only: bundled JS, debug certificate, no Metro server needed.
# Set BAILACUE_ARCHS for an emulator (x86_64) or a universal build.
(cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures="${BAILACUE_ARCHS:-arm64-v8a}" --max-workers=2 --console=plain)
node scripts/package-android.mjs
