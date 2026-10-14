// The optical zoom changes projection, never weapon range or aim limits.
export const GUN_SIGHT_ZOOM=2.5;
export const GUN_SIGHT_FOV=2*Math.atan(Math.tan(62*Math.PI/360)/GUN_SIGHT_ZOOM)*180/Math.PI;
export function canUseGunSight(player){return !!player&&!player.pilot&&(['tankCannon','autocannon'].includes(player.selected)||player.vehicleId==='silver_valkyrie'&&player.selected==='missile');}
