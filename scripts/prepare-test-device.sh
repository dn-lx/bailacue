#!/usr/bin/env bash
# Only the isolated CI emulator. Verify root before tests that pull owned fixtures.
set -euo pipefail
serial="${ARTEMIS_DEVICE_ID:-emulator-5554}"
for attempt in 1 2 3; do
  timeout 45 adb -s "$serial" wait-for-device
  if [ "$(adb -s "$serial" shell id -u | tr -d '\r')" = 0 ]; then
    exit 0
  fi
  # adb root may close its transport while restarting adbd. Verify the restarted
  # daemon on the next iteration rather than treating that close as an app failure.
  adb -s "$serial" root || true
  sleep 2
done
timeout 45 adb -s "$serial" wait-for-device
test "$(adb -s "$serial" shell id -u | tr -d '\r')" = 0
