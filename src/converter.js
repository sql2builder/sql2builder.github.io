export class Converter
{
    constructor(ast) {
        this.ast = ast;
        this.table_name_by_alias = {};
    }

    run(need_append_get_suffix = true) {
        let sections = []

        let from_item = this.ast.body.Select.from[0];

        if (propertyExistsInObjectAndNotNull(from_item.relation, 'Table')) {
            sections.push(this.resolveMainTableSection(from_item));
        } else if (propertyExistsInObjectAndNotNull(from_item.relation, 'Derived')) {
            sections.push(this.resolveFromSubSection('DB::query()->fromSub'), from_item);
        } else {
            throw 'Logic error, unhandled relation type';
        }

        let join_section = '';

        // Resolve 'join' section before 'where' section, because need find joined table alias
        if (this.hasJoinSection(from_item)) {
            join_section = this.resolveJoinSection(from_item);
        }

        // Has cross join
        if (this.ast.body.Select.from.slice(1).length > 0) {
            sections = sections.concat(this.resolveCrossJoinSection(this.ast.body.Select.from.slice(1)));
        }

        sections.push(this.resolveSelectSection())

        if (join_section !== '') {
            sections.push(join_section);
        }

        if (propertyExistsInObjectAndNotNull(this.ast.body.Select, 'selection')) {
            sections.push(this.resolveWhereSection(this.ast.body.Select.selection));
        }

        if (propertyExistsInObjectAndNotNull(this.ast.body.Select, 'group_by') && this.ast.body.Select.group_by.length > 0) {
            sections.push(this.resolveGroupBySection());

            if (propertyExistsInObjectAndNotNull(this.ast.body.Select, 'having')) {
                sections.push(this.resolveHavingSection());
            }
        }

        if (propertyExistsInObjectAndNotNull(this.ast, 'order_by') && this.ast.order_by.length > 0) {
            sections.push(this.resolveOrderBySection());
        }

        if (need_append_get_suffix) {
            sections.push('get();');
        }

        return sections.join('\n->');
    }

    resolveTableNameFromRelationNode(relation_node) {
            let table_name = relation_node.Table.name[0].value;

            if (propertyExistsInObjectAndNotNull(relation_node.Table, 'alias')) {
                this.table_name_by_alias[relation_node.Table.alias.name.value] = table_name;
            }

            return quote(table_name);
    }

    /**
     * @return {string}
     */
    resolveMainTableSection(from_item) {
        return 'DB::table(' + this.resolveTableNameFromRelationNode(from_item.relation) + ')';
    }

    /**
     * @return {string}
     */
    resolveFromSubSection(prefix, from_item) {
        return prefix + '(function ($query) {\n'
            + '\t' + addTabToEveryLine((new Converter(from_item.relation.Derived.subquery).run(false)).replace('DB::table', '$query->from'), 2) + ';\n'
            + '},' + quote(from_item.relation.Derived.alias.name.value) + ')';
    }

    resolveWhereSection(selection_node) {
        let condition_type = getNestedUniqueKeyFromObject(selection_node);
        let condition = getNestedUniqueValueFromObject(selection_node);

        return this.prepareConditions(condition_type, condition, '', 'where').join('\n->');
    }

    /**
     * @param {string} condition_type
     * @param {Object} condition
     * @param {Object} op one of ['', 'And', 'Or']
     * @param {string} method_name
     * @return {string[]}
     */
    prepareConditions(condition_type, condition, op, method_name) {
        let conditions = [];

        if (condition_type === 'IsNull' || condition_type === 'IsNotNull') {
            let method_name = condition_type === 'IsNull' ? 'whereNull' : 'whereNotNull';
            conditions.push(this.addPrefix2Methods(op, method_name) + '(' + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition)) + ')');
        } else if (condition_type === 'InList') {
            let column = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr));
            let list = condition.list.map((i) => this.resolveValue(i.Value));

            let method_name = condition.negated ? 'whereNotIn' : 'whereIn';
            conditions.push(this.addPrefix2Methods(op, method_name) + '(' + column + ',' + '[' + list.join(', ') + '])');
        } else if (condition_type === 'Nested') {
            conditions.push(
                this.addPrefix2Methods(op, method_name) + '(function ($query) {\n'
                + '\t$query->' +  addTabToEveryLine(this.resolveWhereSection(condition), 2) + ';\n})'
            );
        } else if (condition_type === 'BinaryOp') {
            if (condition.op === 'And' || condition.op === 'Or') {
                let left_condition_type = getNestedUniqueKeyFromObject(condition.left);
                let left_condition = getNestedUniqueValueFromObject(condition.left);
                conditions = conditions.concat(this.prepareConditions(left_condition_type, left_condition, op, method_name));

                let right_condition_type = getNestedUniqueKeyFromObject(condition.right);
                let right_condition = getNestedUniqueValueFromObject(condition.right);
                conditions = conditions.concat(this.prepareConditions(right_condition_type, right_condition, condition.op, method_name))
            } else {
                let left = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.left));
                let right;

                if (propertyExistsInObjectAndNotNull(condition.right, 'Identifier', 'CompoundIdentifier')) {
                    right = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.right));
                } else if (propertyExistsInObjectAndNotNull(condition.right, 'Value')) {
                    method_name = 'where';
                    right = this.resolveValue(condition.right.Value)
                } else if (propertyExistsInObjectAndNotNull(condition.right, 'Subquery')) {
                    right = 'function($query) {\n'
                        + '\t' + addTabToEveryLine((new Converter(condition.right.Subquery).run(false)).replace('DB::table', '$query->from'), 2) + ';\n'
                        + '}'
                } else if (propertyExistsInObjectAndNotNull(condition.right, 'Function')) {
                    right = 'DB::raw(' + this.parseFunctionNode(condition.right.Function) + ')';
                } else {
                    throw 'Logic error, unhandled condition.right type:' + getNestedUniqueKeyFromObject(condition.right);
                }

                conditions.push(this.addPrefix2Methods(op, method_name) + '(' + left + ',' + quote(this.transformBinaryOp(condition.op)) + ',' + right + ')');
            }
        } else if (condition_type === 'Exists') {
            conditions.push(
                this.addPrefix2Methods(op, 'whereExists') + '(function ($query) {\n' +
                '\t' +  addTabToEveryLine((new Converter(condition)).run(false), 2).replace('DB::table', '$query->from') + ';\n' +
                '}'
            );
        } else if (condition_type === 'Between') {
            let method_name = condition.negated === true ? 'whereBetween' : 'whereNotBetween';

            conditions.push(
              this.addPrefix2Methods(op, method_name) + '('
              + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr)) + ','
              + '[' + this.resolveValue(condition.low.Value) + ',' + this.resolveValue(condition.high.Value) + '])'
            );
        } else if (condition_type === 'InSubquery') {
            let method_name = condition.negated === true ? 'whereIn' : 'whereNotIn';

            conditions.push(
              this.addPrefix2Methods(op, method_name)
              + '(' + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr)) + ',' + '(function ($query) {\n'
              + '\t' + addTabToEveryLine((new Converter(condition.subquery)).run(false), 2).replace('DB::table', '$query->from') + ';\n'
              + '}'
            );
        } else if (condition_type === 'Function') {
            conditions.push(this.addPrefix2Methods(op, method_name) + '(DB::raw("' + this.parseFunctionNode(condition, false) + '"))');
        } else {
            throw 'Logic error, unhandled condition type [' + condition_type + ']';
        }

        return conditions;
    }

    /**
     * @param op
     * @return {string}
     */
    transformBinaryOp(op) {
        let operator_by_op = {
            'Eq': '=',
            'Gt': '>',
            'GtEq': '>=',
            'Lt': '<',
            'LtEq': '<',
            'NotEq': '!=',
            'Like': 'like',
            'Minus': '-',
            'Plus': '+',
            'Multiply': '*',
            'Divide': '/'
        };

        return operator_by_op[op];
    }

    addPrefix2Methods(op, method_name) {
        if (op === '' || op === 'And') {
            return method_name;
        }

        return op.toLowerCase() + capitalizeFirstLetter(method_name);
    }

    /**
     * @return {string}
     */
    resolveSelectSection() {
        let res = [];

        for (const select_item of this.ast.body.Select.projection) {
            if (propertyExistsInObjectAndNotNull(select_item, 'ExprWithAlias')) {
                let alias = select_item.ExprWithAlias.alias.value;
                res.push(this.resolveSelectSectionItem(select_item.ExprWithAlias.expr, alias));
            } else if (propertyExistsInObjectAndNotNull(select_item, 'UnnamedExpr')) {
                res.push(this.resolveSelectSectionItem(select_item.UnnamedExpr));
            } else if (select_item === 'Wildcard') {
                res.push(quote('*'));
            } else if (propertyExistsInObjectAndNotNull(select_item, 'QualifiedWildcard')) {
                res.push(quote(this.getActualTableName(select_item.QualifiedWildcard[0].value) + '.*'))
            } else {
                throw 'Logic error, unhandled select item [' + Object.keys(select_item)[0] + ']';
            }
        }

        return 'select(' + res.join(', ') + ')';
    }

    /**
     * @param select_item
     * @param alias
     * @return {string}
     */
    resolveSelectSectionItem(select_item, alias = null) {
        assert(isUndefinedOrNull(select_item) === false, 'select_item must not be undefined or null');

        let item;
        if (propertyExistsInObjectAndNotNull(select_item, 'Function')) {
            item = 'DB::raw("' + this.parseFunctionNode(select_item.Function);

            if (alias !== null) {
                item = item + ' as ' + alias + '")';
            }

            return item;
        } else {
            item = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(select_item), false);

            if (alias !== null) {
                item = item + ' as ' + alias;
            }

            return quote(item);
        }
    }

    parseFunctionNode(function_node, need_quote = true) {
        let function_name = function_node.name[0].value;

        if (need_quote) {
            function_name = quote(function_name);
        }

        let res = function_name + '(';
        let args = function_node.args;
        let arg_count = args.length;

        for (let i = 0; i < arg_count; i++) {
            let arg = args[i];

            if (arg.Unnamed === 'Wildcard') {
                res = res + '*';
            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Value')) {
                res = res + this.resolveValue(arg.Unnamed.Expr.Value);
            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Identifier')) {
                res = res + arg.Unnamed.Expr.Identifier.value;
            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'CompoundIdentifier')) {
                res = res + this.convertIdentifier2qualifiedColumn(arg.Unnamed.Expr.CompoundIdentifier);
            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Nested')) { // e.g. COUNT(DISTINCT('id'))
                let arg_column = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(arg.Unnamed.Expr.Nested));

                if (function_node.distinct === true) {
                    arg_column = 'DISTINCT(' + arg_column + ')';
                }

                res = res + arg_column;
            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Function')) {
                res = res + this.parseFunctionNode(arg.Unnamed.Expr.Function, false);
            } else {
                throw 'Logic error, unhandled arg type:' + getNestedUniqueKeyFromObject(arg.Unnamed.Expr);
            }


            if (i !== arg_count - 1) {
                res = res + ', ';
            }
        }

        res = res + ')';

        return res;
    }

    /**
     * @return {boolean}
     */
    hasJoinSection(from_item) {
        return propertyExistsInObjectAndNotNull(from_item, 'joins') && from_item.joins.length > 0;
    }

    parseBinaryOpNode(binary_op) {
        let left;

        if (propertyExistsInObjectAndNotNull(binary_op.left, 'Function')) {
            left = quote(this.parseFunctionNode(binary_op.left.Function));
        } else if (propertyExistsInObjectAndNotNull(binary_op.left, 'Identifier', 'CompoundIdentifier')){
            left = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(binary_op.left));
        } else {
            throw 'Logic error, unhandled type in binary op left';
        }

        let op = quote(this.transformBinaryOp(binary_op.op));
        let right = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(binary_op.right));

        return [left, op, right];
    }

    prepareJoins(from_item) {
        let joins = [];

        for (const join of from_item.joins) {
            let join_operator_type = getNestedUniqueKeyFromObject(join.join_operator);
            let join_method = {
                'Inner': 'join',
                'LeftOuter': 'leftJoin',
                'RightOuter': 'rightJoin',
            }[join_operator_type];
            let join_operator = getNestedUniqueValueFromObject(join.join_operator);
            let condition_type = getNestedUniqueKeyFromObject(join_operator.On);
            let condition = getNestedUniqueValueFromObject(join_operator.On);
            let conditions = this.prepareConditions(condition_type, condition, '', 'on');

            if (propertyExistsInObjectAndNotNull(join.relation, 'Derived')) { // joined section is sub-query
                let sub_query_sql = new Converter(join.relation.Derived.subquery).run(false);
                let sub_query_alias = join.relation.Derived.alias.name.value;
                joins.push(join_method + '(DB::raw("' + addTabToEveryLine(sub_query_sql) + '") as '
                    + sub_query_alias + '), function($join) {\n\t'
                    + '$join->' + addTabToEveryLine(conditions.join('\n->') + ';', 2)
                    + '\n}');
            } else if (propertyExistsInObjectAndNotNull(join.relation, 'Table')) {
                let joined_table = this.resolveTableNameFromRelationNode(join.relation);

                if (conditions.length === 1) {
                    if (propertyExistsInObjectAndNotNull(join_operator.On, 'BinaryOp')) {
                        let left;
                        let on_condition;
                        let right;
                        [left, on_condition, right] = this.parseBinaryOpNode(join_operator.On.BinaryOp);

                        joins.push(join_method + '(' + joined_table + ',' + left + ',' + on_condition + ',' + right + ')');
                    } else if (propertyExistsInObjectAndNotNull(join_operator.On, 'Nested')){
                        let conditions = this.prepareConditions('Nested', join_operator.On.Nested, '', 'on');

                        joins.push(conditions[0]);
                    } else {
                        throw 'Logic error, unhandled on type';
                    }
                } else {
                    joins.push(join_method + '(' + joined_table + ','
                        + 'function($join) {\n\t'
                        + '$join->' + addTabToEveryLine(conditions.join('\n->')) + ';'
                        + '\n}'
                    );
                }
            } else {
                throw 'Logic error, unhandled join relation type';
            }
        }

        return joins;
    }

    resolveJoinSection(from_item) {
        return this.prepareJoins(from_item).join('\n->');
    }

    /**
     * @param from_items
     * @return {string[]}
     */
    resolveCrossJoinSection(from_items) {
        let cross_join_sections = [];

        for (const from_item of from_items) {
            let cross_join_str;

            if (propertyExistsInObjectAndNotNull(from_item.relation, 'Table')) {
                cross_join_str = 'crossJoin(' + this.resolveTableNameFromRelationNode(from_item.relation);
            } else if (propertyExistsInObjectAndNotNull(from_item.relation, 'Derived')) {
                cross_join_str = this.resolveFromSubSection('crossJoinSub', from_item);
            } else {
                throw 'Logic error, unhandled cross join relation type';
            }

            cross_join_sections.push(cross_join_str);
        }

        return cross_join_sections;
    }

    resolveGroupBySection() {
        let group_by_columns = [];

        for (const group_by_item of this.ast.body.Select.group_by) {
            if (propertyExistsInObjectAndNotNull(group_by_item, 'Function')) {
                group_by_columns.push('DB::raw(' + this.parseFunctionNode(group_by_item.Function) + '")');
            } else if(propertyExistsInObjectAndNotNull(group_by_item, 'Identifier', 'CompoundIdentifier')) {
                group_by_columns.push(this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(group_by_item)));
            } else {
                throw 'Logic error, unhandled group by type:' + getNestedUniqueKeyFromObject(group_by_item);
            }
        }

        return 'groupBy(' + group_by_columns.join(',') + ')';
    }

    resolveHavingSection() {
        let binary_op = getNestedUniqueValueFromObject(this.ast.body.Select.having, 'BinaryOp');
        let method_name = propertyExistsInObjectAndNotNull(binary_op.left, 'Function') ? 'havingRaw' : 'having';

        return method_name + '(' + this.parseBinaryOpNode(binary_op).join(',') + ')';
    }

    /**
     * @returns {string}
     */
    resolveOrderBySection() {
        let order_bys = [];

        for (const order_by_item of this.ast.order_by) {
            if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'BinaryOp')) {
                order_bys.push('orderByRaw(' + quote(this.parseBinaryOpNode(order_by_item.expr.BinaryOp).map((i) => unquote(i)).join(' ')) + ')');
            } else if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'Identifier', 'CompoundIdentifier')) {
                order_bys.push(
                    'orderBy(' +
                    this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(order_by_item.expr)) + ',' +
                    quote(order_by_item.asc === false ? 'desc': 'asc') + ')'
                );
            } else if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'Function')) {
                order_bys.push('orderByRaw("' + this.parseFunctionNode(order_by_item.expr.Function) + ' ' + (order_by_item.asc === false ? 'desc': 'asc') + '")');
            } else {
                throw 'Logic error, unhandled order by type:' + getNestedUniqueKeyFromObject(order_by_item.expr);
            }
        }

        return order_bys.join('\n->');
    }

    /**
     * @param valueNode
     * @return {string|*}
     */
    resolveValue(valueNode) {
        let value = getNestedUniqueValueFromObject(valueNode);
        let value_type = getNestedUniqueKeyFromObject(valueNode);

        if (value_type === 'SingleQuotedString') {
            return quote(value);
        } else if (value_type === 'Number') {
            return value[0];
        } else if (value_type === 'CompoundIdentifier' || value_type === 'Identifier') {
            return this.convertIdentifier2qualifiedColumn(value);
        } else {
            throw 'Logic error, unhandled arg value type:' + value_type;
        }
    }

    getActualTableName(table_name_or_alias) {
        if (propertyExistsInObjectAndNotNull(this.table_name_by_alias, table_name_or_alias)) {
            return this.table_name_by_alias[table_name_or_alias];
        }

        return table_name_or_alias;
    }

    /**
     * @param identifier
     * @param {boolean} need_quote
     * @return {string}
     */
    convertIdentifier2qualifiedColumn(identifier, need_quote = true) {
        let values = [identifier].flat().map((i) => i.value);
        let table_name_or_alias = values[0];

        // First index always is table name or alias, change it to actual table name.
        values[0] = this.getActualTableName(table_name_or_alias);

        let res = values.join('.');

        if (need_quote) {
            res = quote(res);
        }

        return res;
    }
}

/**
 * @param {boolean} condition
 * @param {string} msg
 */
function assert(condition, msg) {
    if (!condition) {
        throw msg;
    }
}

/**
 * @param obj
 * @param property_names
 * @return {boolean}
 */
function propertyExistsInObjectAndNotNull(obj, ...property_names) {
    return property_names.reduce((carry, property_name) => carry || (obj.hasOwnProperty(property_name) && obj[property_name] !== null), false);
}

/**
 * @param value
 * @return {boolean}
 */
function isString(value) {
    return  typeof value === 'string' || value instanceof String;
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * @param value
 * @return {string}
 */
function quote(value) {
    return "'" + value + "'";
}

/**
 * @param value
 * @returns {string}
 */
function unquote(value) {
    return value.replace(/['"]+/g, '');
}

/**
 * @param obj
 * @return {string}
 */
function getNestedUniqueKeyFromObject(obj) {
    if (Object.keys(obj).length !== 1) {
        throw 'The function can only be called on object that has one key, object: ' + JSON.stringify(obj);
    }

    return Object.keys(obj)[0];
}

/**
 * @param obj
 * @return {*}
 */
function getNestedUniqueValueFromObject(obj) {
    return obj[getNestedUniqueKeyFromObject(obj)];
}

/**
 * @param value
 * @return {boolean}
 */
function isUndefinedOrNull(value) {
    return typeof value === 'undefined' || value === null;
}

/**
 * @param str
 * @param tab_count
 */
function addTabToEveryLine(str, tab_count = 1) {
    let separator = '\n';

    for (let i = 0; i < tab_count; i++) {
        separator = separator + '\t';
    }

    return str.split('\n').join(separator);
}

