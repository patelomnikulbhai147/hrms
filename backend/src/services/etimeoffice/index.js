// E-TimeOffice integration service — public surface.
module.exports = {
  client: require('./etimeClient'),
  settings: require('./etimeSettingsService'),
  sync: require('./etimeSyncService'),
  unmatched: require('./etimeUnmatchedService'),
};
