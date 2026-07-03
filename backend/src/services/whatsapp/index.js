// WhatsApp service layer (Phase 1 foundation — no messages are ever sent).
// Single import surface for controllers: require('../services/whatsapp').
module.exports = {
  settings: require('./whatsappSettingsService'),
  templates: require('./whatsappTemplateService'),
  queue: require('./whatsappQueueService'),
  placeholders: require('./whatsappPlaceholders'),
  service: require('./whatsappService'),
  validation: require('./whatsappValidation'),
  requestLog: require('./whatsappRequestLogService'),
  templateManager: require('./whatsappTemplateManager'),
  webhook: require('./whatsappWebhookService'),
  retry: require('./whatsappRetryService'),
  image: require('./whatsappImageService'),
  renderer: require('./imageRenderer'),
};
