const test = require('node:test');
const assert = require('node:assert');
const { maskCedula, normalizeText, escapeHtml } = require('../src/sismoRouter');

test('normalizeText - basic normalization', () => {
    assert.strictEqual(normalizeText('María Aguero'), 'maria aguero');
    assert.strictEqual(normalizeText('CÉDULA de Identidad'), 'cedula de identidad');
    assert.strictEqual(normalizeText('   Espacios   '), '   espacios   ');
    assert.strictEqual(normalizeText(''), '');
    assert.strictEqual(normalizeText(null), '');
});

test('maskCedula - enmascarar cédulas de distintos tamaños', () => {
    assert.strictEqual(maskCedula('17849208'), '17***208');
    assert.strictEqual(maskCedula('958321'), '95***321');
    assert.strictEqual(maskCedula('123'), '***');
    assert.strictEqual(maskCedula(''), '');
    assert.strictEqual(maskCedula(null), '');
});

test('maskCedula - enmascarar cédulas con caracteres no numéricos', () => {
    assert.strictEqual(maskCedula('V-21.450.908'), 'V-*******908');
});

test('escapeHtml - sanitizar caracteres HTML', () => {
    assert.strictEqual(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.strictEqual(escapeHtml('María & Juana'), 'María &amp; Juana');
    assert.strictEqual(escapeHtml(''), '');
    assert.strictEqual(escapeHtml(null), '');
});
