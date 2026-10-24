// Public configuration only. No client secret belongs in the H5 package.
export const TAP_CONFIG = Object.freeze({
  appId: 959038,
  miniAppId: 'tapmcvbeyzlb3abnrg',
  rewardedAdUnitId: '1054323', // Landscape unit recorded by official MCP on 2026-10-18; ad service enabled.
  leaderboards: Object.freeze({
    duel: 'muejm85irgwij9cmfj',
    breakthrough: 'd3mk0awqpizsu8rizi',
    survival: 'qukj5kg8xrwg0e8pk0'
  }),
  achievementIds: Object.freeze(Array.from({length:17},(_,i)=>'fg_honor_'+String(i+1).padStart(2,'0'))),
  achievementsPublished: true // 17 ordinary achievements published on 2026-10-19.
});
