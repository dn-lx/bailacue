# First native attempt · build26

Run39504561447 passed nine checks, including import-preview playback, actual resize,
pixel Mirror reversal/restoration, trim handles and named looping. Export confirmation
was not reached. The export action's clipped bounds were[72,1517][648,1600] on the
720×1600 emulator. Logcat records Android Recents/home gesture handling immediately
after the tap while Media3 initialized. The retained screenshot shows the action at
the bottom gesture edge; the report is not a passing export result.

The harness now scrolls the action clear of that edge before tapping. All export,
duration, original-preservation and remaining assertions stay enabled. A separate
acceptance run retests the identical APK, SHA256
3101235f761f09afdf43b77c462a7cc88ae32dbd35ca546c0558cf8f41e7e07c.
Screenshot bytes are unchanged ARTEMIS JPEG, renamed from its.png suffix.
