'use strict';
// Side pots: a short all-in can only win what they matched.
const assert = require('assert');
const { Table } = require('../server/engine');
const R = '23456789TJQKA', S = 'shdc';
const c = s => S.indexOf(s[1]) * 13 + R.indexOf(s[0]);
const t = new Table({ code: 'SP', name: 'sp', sb: 10, bb: 20, hostId: 'x' }, {});
const seat = (name, total, hand) => ({ kind: 'human', userId: name, name, chips: 0, dealt: true, folded: false, allIn: true, bet: 0, total, hand: hand.split(' ').map(c), won: 0, startChips: total, shown: false });
t.seats = [seat('A', 100, 'As Ad'), seat('B', 300, 'Ks Kd'), seat('C', 300, 'Qs Qd'), null, null, null];
t.board = ['2c', '7h', '9d', 'Jc', '3s'].map(c);
t.dealer = 2; t.phase = 'play';
t.showdown(); t.destroy();
assert.strictEqual(t.seats[0].chips, 300, 'A wins the main pot only (3 x 100)');
assert.strictEqual(t.seats[1].chips, 400, 'B wins the side pot (2 x 200)');
assert.strictEqual(t.seats[2].chips, 0);
// split pot with an odd chip
t.seats = [seat('A', 105, 'As Kd'), seat('B', 105, 'Ad Ks'), null, null, null, null];
t.seats[1].total = 105; t.board = ['2c', '7h', '9d', 'Jc', '3s'].map(c); t.phase = 'play'; t.dealer = 1;
t.showdown(); t.destroy();
assert.strictEqual(t.seats[0].chips + t.seats[1].chips, 210);
assert.deepStrictEqual([t.seats[0].chips, t.seats[1].chips].sort(), [105, 105]);
console.log('side pots and splits: ok');
