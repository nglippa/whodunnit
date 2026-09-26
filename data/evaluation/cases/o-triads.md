We tested the installer on three machines: a 2019 laptop running Windows 11, a Raspberry Pi 5, and the build server. It failed on the Pi because the package assumes an x86 processor. The fix is small, but it needs a second build target, a new test job and an extra download on the release page.

For the next release we need three things from the platform team: a second runner, access to the signing key for ARM builds, and two days of review time before the freeze.
