# Vehicle tiers and research update

No APK or H5 package is built for this change. Existing portrait viewport and remote room configuration are preserved.

## Vehicles

- Tier 1: Handlv (missile), KFZ (artillery), B tank (tank).
- Tiers 2 and 3 are reserved, with no vehicles yet.
- Tier 4: Longnose (artillery).
- Branches have independent research balances. Tier 1 vehicles are researched initially; the paid vehicles still require coins. Longnose costs 2,500 artillery research points to unlock and 5,000 coins to buy. Existing owners keep their vehicle and its research unlock when their save migrates.
- Matching prefers enemy vehicles exactly one tier above or below. Since the current roster has no adjacent tiers, it falls back to the same tier. Tier 1 vehicles cannot face tier 4 vehicles through AI matchmaking. The room tier is the highest participant tier.

## Combat

- Longnose: HP 300, artillery center damage 260, UAV damage 80 and HP 60, MG damage 18 against air and 12 against ground. These upgrades are vehicle-specific; Handlv retains its original weapons.
- Longnose elevation: -3 to +68 degrees. KFZ: -3 to +72 degrees. Direct mode uses the low arc (-3 to +45 degrees), curve mode the high arc (+45 to vehicle maximum). Physical muzzle speed is shared between modes and calibrated for the existing 1,200m / 1,000m nominal maximum on level ground. Curve minimum range follows the actual gun limit; near targets require direct fire. Map aiming rejects unreachable high arcs instead of silently clamping to another landing point. Terrain affects actual reachable ranges.
- Bomber speed: 78m/s, up from 65m/s. AI bomb lead uses actual plane speed.
- Missiles, UAVs, shells, bombs, MG rounds and autocannon rounds can collide with hostile airborne targets. Explosion splash also affects air targets. Autocannon rounds stop at 500m. SAM remains automatically guided.
- KFZ and B tank use animated original tread geometry and individual wheel pivots; left and right track travel also accounts for chassis turning. B turret yaw and gun elevation remain active while its support abilities are selected.
- B tank: HP 150, speed 39m/s, recon 200m, intel retention 5s, immune to individual damage below 10, cost 200 coins; body dimensions 4.81 x 2.28 x 2.02m, elevation -9 to +20 degrees.
- B autocannon: 14 damage, 10-round magazine, 0.4s shot interval, 5s reload, 500m range. Can fire while moving; the touch fire button repeats while held.
- B repair: once per battle, immediately stops the tank, locks movement and attacks for 15s, restores full HP at completion. Being destroyed ends the battle normally.
- Commander observation: current turret heading, 90-degree sector, 500m radius, 8s duration, 15s cooldown. Normal 5s intel retention still applies after contact is lost.

## Rewards

Performance bonus = floor(damage * 0.2 + detections * 3 + interceptions * 12).
Room multiplier = 1 + (room tier - 1) * 0.5.
Coins = round((100 for win / 50 draw / 25 loss + performance bonus) * multiplier).
Research = round((40 for win / 25 draw / 15 loss + performance bonus * 0.5) * multiplier), credited only to the vehicle's branch.
Completed round IDs prevent duplicate coins and research. Abandoned rounds receive neither. The first tutorial completion keeps its existing one-time reward.

## Validation

Rules and geometry tests cover gun arcs, map rejection, airborne collisions, center damage, magazine/reload, stationary repair, sector scan, range limits, branch rewards, migration and AI loadouts. Renderer geometry tests load actual GLBs, check original tread vertices at rest, verify wheel/tread movement, turret/barrel articulation, chase framing and fixed-north map movement. Real browser / TapTap / Android device testing is still pending because no Chromium executable is available and its download failed in this environment.
