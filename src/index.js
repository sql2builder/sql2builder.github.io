import * as wasm from "sqlparser-rs-wasm";

document.getElementById('convert-button').addEventListener('click', function () {
    let input = document.getElementById("input").value;

    if (input.trim() === '') {
        return;
    }

    if (input.slice(-1) === ';') {
        input = input.slice(0, -1);
    }

    let output_text_area = document.getElementById("output");

    if (!input.startsWith('select') && !input.startsWith('SELECT')) {
        output_text_area.value = 'SQL must start with select or SELECT';

        return;
    }

    try {
        let ast = wasm.parse_sql("--mysql", input);
        console.log(ast);

        output_text_area.value = (new Converter(JSON.parse(ast)[0].Query)).run();
    } catch (e) {
        output_text_area.value = e;
    }

});

class Converter
{
    constructor(ast) {
        this.ast = ast;
        this.wheres = [];
        this.joins = [];
        this.table_name_by_alias = {};
    }

    run(need_append_get_suffix = true) {
        let res = this.resolveMainTableSection() + '\n';
        let join_section = '';

        // Resolve 'join' section before 'where' section, because need find joined table alias
        if (this.hasJoinSection()) {
            join_section =this.resolveJoinSection();
        }

        res = res + '->' + this.resolveSelectSection() + '\n';

        if (join_section !== '') {
            res = res + '->' + join_section + '\n';
        }

        if (this.hasWhereSection()) {
            res = res + '->' + this.resolveWhereSection() + '\n';
        }

        if (this.hasGroupBySection()) {
            res = res + '->' + this.resolveGroupBySection() + '\n';

            if (this.hasHavingSection()) {
                res = res + '->' + this.resolveHavingSection() + '\n';
            }
        }

        if (need_append_get_suffix) {
            res = res + '->get();';
        }

        return res;
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
    resolveMainTableSection() {
        return 'DB::table(' + this.resolveTableNameFromRelationNode(this.ast.body.Select.from[0].relation) + ')';
    }

    /**
     * @return {boolean}
     */
    hasWhereSection() {
        return propertyExistsInObjectAndNotNull(this.ast.body.Select, 'selection');
    }

    resolveWhereSection() {
        assert(this.ast.body.Select.selection !== null, 'selection section must exist');

        let condition_type = getNestedUniqueKeyFromObject(this.ast.body.Select.selection);
        let condition = getNestedUniqueValueFromObject(this.ast.body.Select.selection);

        this.prepareWheres(condition_type, condition, '');

        return this.wheres.join('\n->');
    }

    /**
     * @param {string} condition_type
     * @param {Object} condition
     * @param {Object} op one of ['', 'And', 'Or']
     * @return {void}
     */
    prepareWheres(condition_type, condition, op) {
        if (condition_type === 'IsNull' || condition_type === 'IsNotNull') {
            let method_name = condition_type === 'IsNull' ? 'whereNull' : 'whereNotNull';
            this.wheres.push(this.addPrefix2WhereMethods(op, method_name) + '(' + this.convertIdentifier2qualifiedColumn(condition.CompoundIdentifier) + ')');
        } else if (condition_type === 'InList') {
            let column = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr));
            let list = condition.list.map((i) => this.resolveValue(getNestedUniqueValueFromObject(i)));

            let method_name = condition.negated ? 'whereNotIn' : 'whereIn';
            this.wheres.push(this.addPrefix2WhereMethods(op, method_name) + '(' + column + ',' + '[' + list.join(', ') + '])');
        } else if (condition_type === 'BinaryOp') {
            if (condition.op === 'And' || condition.op === 'Or') {
                let left_condition_type = getNestedUniqueKeyFromObject(condition.left);
                let left_condition = getNestedUniqueValueFromObject(condition.left);
                this.prepareWheres(left_condition_type, left_condition, op);

                let right_condition_type = getNestedUniqueKeyFromObject(condition.right);
                let right_condition = getNestedUniqueValueFromObject(condition.right);
                this.prepareWheres(right_condition_type, right_condition, condition.op);
            } else {
                let left = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.left));
                let right = this.resolveValue(getNestedUniqueValueFromObject(condition.right))
                this.wheres.push(this.addPrefix2WhereMethods(op, 'where') + '(' + left + ',' + this.transformBinaryOp(condition.op) + ',' + right + ')');
            }
        } else {
            throw 'Logic error, unhandled condition type [' + condition_type + ']';
        }
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
        };

        return operator_by_op[op];
    }

    addPrefix2WhereMethods(op, method_name) {
        if (op === '') {
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
                res.push('*');
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
            if (propertyExistsInObjectAndNotNull(select_item, 'CompoundIdentifier')) {
                item = this.convertIdentifier2qualifiedColumn(select_item.CompoundIdentifier, false);
            } else {
                item = select_item.Identifier.value;
            }

            if (alias !== null) {
                item = item + ' as ' + alias;
            }

            return quote(item);
        }
    }

    parseFunctionNode(function_node) {
        let function_name = function_node.name[0].value;
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
            } else {
                throw 'Logic error, unhandled arg type';
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
    hasJoinSection() {
        if (this.ast.body.Select.from.length > 1) {
            throw 'Cross join is not supported';
        }

        return propertyExistsInObjectAndNotNull(this.ast.body.Select.from[0], 'joins') && this.ast.body.Select.from[0].joins.length > 0;
    }

    prepareJoins() {
        for (const join of this.ast.body.Select.from[0].joins) {
            let join_operator_type = getNestedUniqueKeyFromObject(join.join_operator);
            let join_method = {
                'Inner': 'join',
                'LeftOuter': 'leftJoin',
                'RightOuter': 'rightJoin',
            }[join_operator_type];
            let join_operator = getNestedUniqueValueFromObject(join.join_operator);
            let binary_op = join_operator.On.BinaryOp;
            let left = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(binary_op.left));
            let on_condition = this.transformBinaryOp(binary_op.op);
            let right = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(binary_op.right));

            if (propertyExistsInObjectAndNotNull(join.relation, 'Derived')) { // joined section is sub-query
                let sub_query_sql = new Converter(join.relation.Derived.subquery).run(false);
                let sub_query_alias = join.relation.Derived.alias.name.value;
                this.joins.push(join_method + '(DB::raw("' + addTabToEveryLine(sub_query_sql) + '") as '
                    + sub_query_alias + '), function($join) {\n\t'
                    + '$join->on(' + left + ',' + on_condition + ',' + right + ');'
                    + '\n}');
            } else {
                let joined_table = this.resolveTableNameFromRelationNode(join.relation);
                this.joins.push(join_method + '(' + joined_table + ',' + left + ',' + on_condition + ',' + right + ')');
            }
        }
    }

    resolveJoinSection() {
        this.prepareJoins();

        return this.joins.join('\n->');
    }

    hasGroupBySection() {
        return propertyExistsInObjectAndNotNull(this.ast.body.Select, 'group_by') && this.ast.body.Select.group_by.length > 0;
    }

    resolveGroupBySection() {
        let group_by = this.ast.body.Select.group_by;

        if (group_by.length === 1) {
            return 'groupBy(' + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(group_by[0])) + ')';
        } else {
            return 'groupByRaw(' + quote(group_by.map((i) => this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(i), false)).join(', ')) + ')';
        }
    }

    hasHavingSection() {
        return propertyExistsInObjectAndNotNull(this.ast.body.Select, 'having');
    }

    resolveHavingSection() {
        let binary_op = getNestedUniqueValueFromObject(this.ast.body.Select.having, 'BinaryOp');
        let right = this.resolveValue(getNestedUniqueValueFromObject(binary_op.right))
        let left;
        let method_name;

        if (propertyExistsInObjectAndNotNull(binary_op.left, 'Function')) {
            left = quote(this.parseFunctionNode(binary_op.left.Function));
            method_name = 'havingRaw';
        } else {
            left = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(binary_op.left));
            method_name = 'having';
        }

        return method_name + '(' + left + ', ' + quote(this.transformBinaryOp(binary_op.op)) + ',' + right + ')';
    }

    /**
     * @param value
     * @return {string|*}
     */
    resolveValue(value) {
        if (propertyExistsInObjectAndNotNull(value, 'SingleQuotedString')) {
            return quote(value.SingleQuotedString);
        } else if (propertyExistsInObjectAndNotNull(value, 'Number')) {
            return value.Number[0];
        } else {
            throw 'Logic error, unhandled arg value type [' + Object.keys(selection)[0] + ']';
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

// region helper functions
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
 * @param property_name
 * @return {boolean}
 */
function propertyExistsInObjectAndNotNull(obj, property_name) {
    return obj.hasOwnProperty(property_name) && obj[property_name] !== null;
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


// end region
