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
    assert.match(sent[0].text, /Asistente de Ayuda Sismo/);

    await routeMessage({ remoteJid: '12345', messageType: 'text', text: '/unknown' });
    assert.equal(sent.length, 1);

    const calls = [];
    axios.get = async (url, options = {}) => {
        calls.push({ url, options });
        if (url.includes('/api/v1/localizados')) {
            const hasLocalHit = options.params?.q === 'Maria Perez';
            return {
                data: {
                    data: hasLocalHit ? [{
                        nombreCompleto: 'Maria Perez',
                        lugarNombre: 'Hospital Central',
                        condicion: 'desconocido',
                        slug: 'maria-perez',
                    }] : [],
                    meta: { total: hasLocalHit ? 1 : 0 },
                },
            };
        }
        if (url.includes('sosvenezuela2026.com')) {
            return {
                data: [{
                    display_name: 'Maria Jose Perez',
                    status: 'seeking_info',
                    parroquia: 'La Guaira',
                }],
            };
        }
        throw new Error(`unexpected url: ${url}`);
    };

    await routeMessage({ remoteJid: '12345', messageType: 'text', text: 'Maria Perez' });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.params.q, 'Maria Perez');
    assert.equal(calls[1].options.params.offset, undefined);
    assert.equal(calls[1].options.params.limit, undefined);
    assert.match(sent.at(-1).text, /MARIA PEREZ/);
    assert.match(sent.at(-1).text, /Encontrados: 2/);
    assert.doesNotMatch(sent.at(-1).text, /Similares en SOS Venezuela 2026/);
    assert.match(sent.at(-1).text, /MARIA JOSE PEREZ/);

    await routeMessage({ remoteJid: '12345', messageType: 'text', text: 'Maria Jose' });
    assert.doesNotMatch(sent.at(-1).text, /No se encontraron coincidencias exactas/);
    assert.doesNotMatch(sent.at(-1).text, /Similares en SOS Venezuela 2026/);
    assert.match(sent.at(-1).text, /MARIA JOSE PEREZ/);
}

demo();
