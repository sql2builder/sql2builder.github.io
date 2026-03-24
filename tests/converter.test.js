const {Converter} = require('../src/converter');
const {test, expect} = require('@jest/globals');
const {complex_ast} = require('./ast');
const {cross_join_ast} = require('./crossjoin');

function getQueryBuilder(ast) {
    return (new Converter(ast[0].Query).run());
}

test('complex sql', () => {
    expect(getQueryBuilder(complex_ast)).toBe(`DB::table('posts')
->select('posts.*', 'a.name')
->leftJoin('comments','comments.post_id','=','posts.id')
->rightJoin('users','user.id','=','posts.user_id')
->leftJoin(DB::raw("DB::table('address')
	->select('*')") as a), function($join) {
	$join->on('user.aid','=','a.id');
}
->where(function ($query) {
	$query->where('a.name','=','bejing')
		->where('a.id','<',10);
})
->where('comments.conent','=','abc')
->orderBy('comments.created_at','asc')
->orderBy('posts.created_at','desc')
->get();`);
});

test('cross join', () => {
   expect(getQueryBuilder(cross_join_ast)).toBe(`DB::table('posts')
->crossJoinSub(function ($query) {
	$query->from('posts')
		->select('count', DB::raw("'max'(created_date) as created_date"))
		->groupBy('count');
},'max_counts')
->select('posts.*')
->where('posts.count','=',DB::raw('max_counts.count'))
->where('posts.created_date','=',DB::raw('max_counts.created_date'))
->get();`);
});
