const wasm = require('../node_modules/sqlparser-rs-wasm');
const Converter = require('../src/converter');

test('union all for users where null', () => {
  const sql = "(select * from `users` where `last_name` is null) union all (select * from `users` where `first_name` is null) order by id";
  const ast = wasm.parse_sql('--mysql', sql);
  const conv = new Converter(ast, null);
  const out = conv.run(true);

  const expected = `DB::table('users')\n->whereNull('last_name')\n->unionAll(\n DB::table('users')\n ->whereNull('first_name')\n)\n->orderBy('id')\n->get();`;

  expect(out.replace(/\s+$/g, '')).toBe(expected);
});
