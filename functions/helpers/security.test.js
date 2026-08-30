const test = require('node:test');
const assert = require('node:assert/strict');
const { checkIsAdmin, checkIsSuperAdmin } = require('./security');

const contextFor = (email, admin = false) => ({
    auth: {
        uid: 'test-uid',
        token: { email, admin }
    }
});

test('le compte développeur exact peut utiliser les opérations super-admin', () => {
    assert.doesNotThrow(() => checkIsSuperAdmin(contextFor('matthis.fradin2@gmail.com')));
});

test('la comparaison du compte développeur normalise casse et espaces', () => {
    assert.doesNotThrow(() => checkIsSuperAdmin(contextFor('  MATTHIS.FRADIN2@GMAIL.COM  ')));
});

test('un autre compte admin est refusé pour les opérations dangereuses', () => {
    assert.throws(
        () => checkIsSuperAdmin(contextFor('tousatablemadeinnormandie@example.com', true)),
        error => error.code === 'permission-denied'
    );
});

test('un autre compte admin conserve les opérations administratives ordinaires', () => {
    assert.deepEqual(
        checkIsAdmin(contextFor('tousatablemadeinnormandie@example.com', true)),
        { isSuper: false }
    );
});

test('un appel non authentifié est refusé pour les opérations dangereuses', () => {
    assert.throws(
        () => checkIsSuperAdmin({}),
        error => error.code === 'permission-denied'
    );
});
