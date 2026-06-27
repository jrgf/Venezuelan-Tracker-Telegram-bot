const assert = require('assert/strict');
const { parseMessage } = require('../src/telegramParser');

async function demo() {
    const parsed = parseMessage({
        update_id: 1,
        message: {
            message_id: 2,
            text: '/start',
            chat: { id: 12345, type: 'private' },
            from: { first_name: 'Rafa', last_name: 'Tester' },
        },
    });

    assert.equal(parsed.remoteJid, '12345');
    assert.equal(parsed.text, '/start');
    assert.equal(parsed.chatType, 'private');
    assert.equal(parsed.pushName, 'Rafa Tester');

    const caption = parseMessage({
        message: {
            caption: 'Maria Perez',
            chat: { id: -100, type: 'group' },
            from: { username: 'reporter' },
        },
    });

    assert.equal(caption.text, 'Maria Perez');
    assert.equal(caption.chatType, 'group');
    assert.equal(caption.pushName, 'reporter');

    assert.equal(parseMessage({ update_id: 3 }), null);

    const telegram = require('../src/services/telegram');
    const axios = require('axios');
    const sent = [];
    telegram.sendText = async (chatId, text) => sent.push({ chatId, text });
    axios.get = async () => {
        throw new Error('search should not run for Telegram commands');
    };

    const { routeMessage } = require('../src/sismoRouter');

    await routeMessage({ remoteJid: '12345', messageType: 'text', text: '/start' });
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /Buscador de Personas/);

    await routeMessage({ remoteJid: '12345', messageType: 'text', text: '/unknown' });
    assert.equal(sent.length, 1);
}

demo();
