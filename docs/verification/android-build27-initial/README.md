# Initial build27 device attempt

[Release run](https://github.com/dn-lx/BailaCue/actions/runs/39789411994).
The APK built and passed 11 actual native checks, including new MP4 export,
original checksum preservation and Photos save. The test then stopped while
verifying Search labels after unconditional Back navigation dismissed the route
when the helper had not opened a keyboard.

The harness now checks actual input-method visibility before sending Back. No app
code or APK bytes changed. The [separate acceptance run](https://github.com/dn-lx/BailaCue/actions/runs/39793692531)
passes all 15 checks on the same SHA-256. This partial run is retained for audit;
it is not described as a full native pass.
