require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,

  fzap: {
    apiUrl: process.env.FZAP_API_URL || 'http://fzap:8080',
    apiKey: process.env.FZAP_API_KEY || '',
    instanceName: process.env.FZAP_INSTANCE || 'bot_instance',
    webhookSecret: process.env.FZAP_WEBHOOK_SECRET || '',
    webhookUrl: process.env.FZAP_WEBHOOK_URL || '',
  },
};

module.exports = config;