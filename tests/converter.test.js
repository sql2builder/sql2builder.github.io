import {Converter} from "../src/converter";
import {test, expect} from "@jest/globals";
import {complex_ast} from './ast'


function getQueryBuilder(ast) {
    return (new Converter(ast[0].Query).run());
}

test('complex sql', () => {
    expect(getQueryBuilder(complex_ast)).toBe(`DB::table('posts')
->select('posts.*', 'a.name')
->leftJoin('comments','c.post_id','=','posts.id')
->rightJoin('users','user.id','=','posts.user_id')
->leftJoin(DB::raw("DB::table('address')
\t->select('*')
\t") as a), function($join) {
\t$join->on('user.aid','=','a.id');
}
->where(function ($query) {
\t$query->where('a.name',=,'bejing')
\t\t->andWhere('a.id',<,10);
})
->andWhere('comments.conent',=,'abc')
->orderBy('','asc')
->orderBy('','desc')
->get();`);
});
