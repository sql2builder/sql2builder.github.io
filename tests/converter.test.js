import {Converter} from "../src/converter";
import {test, expect} from "@jest/globals";
import {complex_ast} from './ast';
import {cross_join_ast} from './crossjoin';


function getQueryBuilder(ast) {
    return (new Converter(ast[0].Query).run());
}

test('complex sql', () => {
    expect(getQueryBuilder(complex_ast)).toBe(`DB::table('posts')
->select('posts.*', 'a.name')
->leftJoin('comments','comments.post_id','=','posts.id')
->rightJoin('users','user.id','=','posts.user_id')
->leftJoin(DB::raw("DB::table('address')
\t->select('*')") as a), function($join) {
\t$join->on('user.aid','=','a.id');
}
->where(function ($query) {
\t$query->where('a.name','=','bejing')
\t\t->where('a.id','<',10);
})
->where('comments.conent','=','abc')
->orderBy('comments.created_at','asc')
->orderBy('posts.created_at','desc')
->get();`);
});

test('cross join', () => {
   expect(getQueryBuilder(cross_join_ast)).toBe(`DB::table('posts')
->crossJoinSub(function ($query) {
\t$query->from('posts')
\t\t->select('count', DB::raw("'max'(created_date) as created_date"))
\t\t->groupBy('count');
},'max_counts')
->select('posts.*')
->where('posts.count','=',DB::raw('max_counts.count'))
->where('posts.created_date','=',DB::raw('max_counts.created_date'))
->get();`);
});
