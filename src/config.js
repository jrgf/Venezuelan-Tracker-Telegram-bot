require('dotenv').config();

const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },

  siteUrl: process.env.SITE_URL || 'https://localizadosvenezuela.com',
};

module.exports = config;
