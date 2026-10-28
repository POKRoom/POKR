'use strict';
// Club, shop and cashier rules. Run: node test/shop.test.js
const assert = require('assert');
const shop = require('../server/shop');
const u = { bankroll: 100000, avatar: { a: 3, c: 3 } };
const t0 = 1_800_000_000_000;

// fees only on instant transfers
assert.strictEqual(shop.instantFee(10000), 150);          // 1.5% of $100
assert.strictEqual(shop.instantFee(1000), 50);            // $0.50 minimum
let r = shop.cashier(u, { action: 'deposit', amount: 5000, speed: 'standard' }, t0);
assert.strictEqual(r.tx.fee, 0); assert.strictEqual(r.tx.status, 'pending'); assert.strictEqual(u.bankroll, 100000, 'standard deposit waits');
r = shop.cashier(u, { action: 'deposit', amount: 10000, speed: 'instant' }, t0);
assert.strictEqual(r.tx.fee, 150); assert.strictEqual(u.bankroll, 100000 + 9850, 'instant deposit lands minus fee');
assert.strictEqual(shop.settle(u, t0 + 1000).length, 0, 'not settled early');
assert.strictEqual(shop.settle(u, t0 + 60 * 60 * 1000).length, 1);
assert.strictEqual(u.bankroll, 100000 + 9850 + 5000, 'standard deposit lands in full');
const before = u.bankroll;
r = shop.cashier(u, { action: 'withdraw', amount: 2000, speed: 'standard' }, t0);
assert.strictEqual(r.tx.fee, 0); assert.strictEqual(u.bankroll, before - 2000, 'standard withdrawal is free');
r = shop.cashier(u, { action: 'withdraw', amount: 2000, speed: 'instant' }, t0);
assert.strictEqual(u.bankroll, before - 4000 - 50, 'instant withdrawal pays the fee');
assert.ok(shop.cashier(u, { action: 'withdraw', amount: u.bankroll + 1, speed: 'standard' }, t0).error, 'cannot overdraw');
assert.ok(shop.cashier(u, { action: 'deposit', amount: 100, speed: 'standard' }, t0).error, 'minimum enforced');
assert.ok(shop.cashier(u, { action: 'deposit', amount: 5000, speed: 'warp' }, t0).error);
console.log('cashier: ok');

// themes and avatars
assert.strictEqual(shop.canUseTheme(u, 'neon'), false);
assert.ok(shop.setTheme(u, 'neon').error);
assert.strictEqual(shop.canUseAvatar(u, 18), false);
const bankrollBefore = u.bankroll;
assert.ok(shop.club(u, 'join', t0).ok);
assert.strictEqual(u.bankroll, bankrollBefore, 'club never touches the poker balance');
assert.ok(shop.setTheme(u, 'neon').ok);
assert.strictEqual(shop.canUseAvatar(u, 18), true);
u.avatar = { a: 18, c: 2 };
assert.ok(shop.club(u, 'cancel', t0).ok);
assert.strictEqual(u.theme, 'lounge', 'theme falls back after cancel');
assert.strictEqual(u.avatar.a, 0, 'member avatar falls back after cancel');
assert.strictEqual(shop.canUseAvatar(u, 24), false);
assert.ok(shop.buyAvatar(u, 24).ok);
assert.strictEqual(shop.canUseAvatar(u, 24), true);
assert.ok(shop.buyAvatar(u, 24).error, 'no double purchase');
assert.ok(shop.buyAvatar(u, 18).error, 'club avatars are not for sale');
assert.strictEqual(u.bankroll, bankrollBefore, 'purchases never touch the poker balance');
console.log('club, themes, avatars: ok');
