# Match queue deployment and respawns

The player now chooses a vehicle after a match has formed. Both local campaign matches and ranked matches enter the battle/loading flow first, then open the vehicle deployment screen. The game simulation remains paused until the required human players deploy.

The selected player's saved vehicle queue is sent with the ranked join request and retained in the authoritative match engine. The first deployment can use any queued vehicle. In 5v5, each destroyed vehicle is marked unavailable for the rest of the match and the player may respawn twice using another queued vehicle. 1v1 and Dark Forest keep the full queue available for the initial choice but have no respawns. A 1v1 match ends as soon as one side is destroyed.

The same deployment state is applied to the local ranked practice engine and TapTap frame-synchronized matches. The worker validates selected vehicle IDs against that player's queued vehicles. If a player leaves before deploying, the match is allowed to continue without leaving the simulation permanently frozen.

## Verification

- `node tests/match-deployment-flow.test.cjs`
- `node tests/breakthrough.test.cjs`
- `node tests/ranked.test.mjs`
- `node tests/ranked-client.test.mjs`

The tests cover frozen simulation before deployment, queue transport, two unique 5v5 respawns, 1v1 elimination, and one-life Dark Forest behavior.

For an Android full-unlock test build, the project supports `-PfullUnlockTest=true`. This source snapshot does not include an Android SDK/Gradle wrapper or signing key; APK creation and signature validation must run in an equipped Android build environment.
