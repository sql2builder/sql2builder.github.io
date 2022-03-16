(window["webpackJsonp"] = window["webpackJsonp"] || []).push([[1],{

/***/ "./src/converter.js":
/*!**************************!*\
  !*** ./src/converter.js ***!
  \**************************/
/*! exports provided: Converter */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Converter\", function() { return Converter; });\nclass Converter\n{\n    constructor(ast) {\n        this.ast = ast;\n        this.table_name_by_alias = {};\n    }\n\n    run(need_append_get_suffix = true) {\n        let sections = []\n\n        let from_item = this.ast.body.Select.from[0];\n\n        if (propertyExistsInObjectAndNotNull(from_item.relation, 'Table')) {\n            sections.push(this.resolveMainTableSection(from_item));\n        } else if (propertyExistsInObjectAndNotNull(from_item.relation, 'Derived')) {\n            sections.push(this.resolveFromSubSection('DB::query()->fromSub'), from_item);\n        } else {\n            throw 'Logic error, unhandled relation type';\n        }\n\n        let join_section = '';\n\n        // Resolve 'join' section before 'where' section, because need find joined table alias\n        if (this.hasJoinSection(from_item)) {\n            join_section = this.resolveJoinSection(from_item);\n        }\n\n        // Has cross join\n        if (this.ast.body.Select.from.slice(1).length > 0) {\n            sections = sections.concat(this.resolveCrossJoinSection(this.ast.body.Select.from.slice(1)));\n        }\n\n        sections.push(this.resolveSelectSection())\n\n        if (join_section !== '') {\n            sections.push(join_section);\n        }\n\n        if (propertyExistsInObjectAndNotNull(this.ast.body.Select, 'selection')) {\n            sections.push(this.resolveWhereSection(this.ast.body.Select.selection));\n        }\n\n        if (propertyExistsInObjectAndNotNull(this.ast.body.Select, 'group_by') && this.ast.body.Select.group_by.length > 0) {\n            sections.push(this.resolveGroupBySection());\n\n            if (propertyExistsInObjectAndNotNull(this.ast.body.Select, 'having')) {\n                sections.push(this.resolveHavingSection());\n            }\n        }\n\n        if (propertyExistsInObjectAndNotNull(this.ast, 'order_by') && this.ast.order_by.length > 0) {\n            sections.push(this.resolveOrderBySection());\n        }\n\n        if (need_append_get_suffix) {\n            sections.push('get();');\n        }\n\n        return sections.join('\\n->');\n    }\n\n    resolveTableNameFromRelationNode(relation_node) {\n            let table_name = relation_node.Table.name[0].value;\n\n            if (propertyExistsInObjectAndNotNull(relation_node.Table, 'alias')) {\n                this.table_name_by_alias[relation_node.Table.alias.name.value] = table_name;\n            }\n\n            return quote(table_name);\n    }\n\n    /**\n     * @return {string}\n     */\n    resolveMainTableSection(from_item) {\n        return 'DB::table(' + this.resolveTableNameFromRelationNode(from_item.relation) + ')';\n    }\n\n    /**\n     * @return {string}\n     */\n    resolveFromSubSection(prefix, from_item) {\n        return prefix + '(function ($query) {\\n'\n            + '\\t' + addTabToEveryLine((new Converter(from_item.relation.Derived.subquery).run(false)).replace('DB::table', '$query->from'), 2) + ';\\n'\n            + '},' + quote(from_item.relation.Derived.alias.name.value) + ')';\n    }\n\n    resolveWhereSection(selection_node) {\n        let condition_type = getNestedUniqueKeyFromObject(selection_node);\n        let condition = getNestedUniqueValueFromObject(selection_node);\n\n        return this.prepareConditions(condition_type, condition, '', 'where').join('\\n->');\n    }\n\n    /**\n     * @param {string} condition_type\n     * @param {Object} condition\n     * @param {Object} op one of ['', 'And', 'Or']\n     * @param {string} method_name\n     * @return {string[]}\n     */\n    prepareConditions(condition_type, condition, op, method_name) {\n        let conditions = [];\n\n        if (condition_type === 'IsNull' || condition_type === 'IsNotNull') {\n            let method_name = condition_type === 'IsNull' ? 'whereNull' : 'whereNotNull';\n            conditions.push(this.addPrefix2Methods(op, method_name) + '(' + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition)) + ')');\n        } else if (condition_type === 'InList') {\n            let column = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr));\n            let list = condition.list.map((i) => this.resolveValue(i.Value));\n\n            let method_name = condition.negated ? 'whereNotIn' : 'whereIn';\n            conditions.push(this.addPrefix2Methods(op, method_name) + '(' + column + ',' + '[' + list.join(', ') + '])');\n        } else if (condition_type === 'Nested') {\n            conditions.push(\n                this.addPrefix2Methods(op, method_name) + '(function ($query) {\\n'\n                + '\\t$query->' +  addTabToEveryLine(this.resolveWhereSection(condition), 2) + ';\\n})'\n            );\n        } else if (condition_type === 'BinaryOp') {\n            if (condition.op === 'And' || condition.op === 'Or') {\n                let left_condition_type = getNestedUniqueKeyFromObject(condition.left);\n                let left_condition = getNestedUniqueValueFromObject(condition.left);\n                conditions = conditions.concat(this.prepareConditions(left_condition_type, left_condition, op, method_name));\n\n                let right_condition_type = getNestedUniqueKeyFromObject(condition.right);\n                let right_condition = getNestedUniqueValueFromObject(condition.right);\n                conditions = conditions.concat(this.prepareConditions(right_condition_type, right_condition, condition.op, method_name))\n            } else {\n                let left = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.left));\n                let right;\n\n                if (propertyExistsInObjectAndNotNull(condition.right, 'Identifier', 'CompoundIdentifier')) {\n                    right = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.right));\n                } else if (propertyExistsInObjectAndNotNull(condition.right, 'Value')) {\n                    method_name = 'where';\n                    right = this.resolveValue(condition.right.Value)\n                } else if (propertyExistsInObjectAndNotNull(condition.right, 'Subquery')) {\n                    right = 'function($query) {\\n'\n                        + '\\t' + addTabToEveryLine((new Converter(condition.right.Subquery).run(false)).replace('DB::table', '$query->from'), 2) + ';\\n'\n                        + '}'\n                } else if (propertyExistsInObjectAndNotNull(condition.right, 'Function')) {\n                    right = 'DB::raw(' + this.parseFunctionNode(condition.right.Function) + ')';\n                } else {\n                    throw 'Logic error, unhandled condition.right type:' + getNestedUniqueKeyFromObject(condition.right);\n                }\n\n                conditions.push(this.addPrefix2Methods(op, method_name) + '(' + left + ',' + quote(this.transformBinaryOp(condition.op)) + ',' + right + ')');\n            }\n        } else if (condition_type === 'Exists') {\n            conditions.push(\n                this.addPrefix2Methods(op, 'whereExists') + '(function ($query) {\\n' +\n                '\\t' +  addTabToEveryLine((new Converter(condition)).run(false), 2).replace('DB::table', '$query->from') + ';\\n' +\n                '}'\n            );\n        } else if (condition_type === 'Between') {\n            let method_name = condition.negated === true ? 'whereBetween' : 'whereNotBetween';\n\n            conditions.push(\n              this.addPrefix2Methods(op, method_name) + '('\n              + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr)) + ','\n              + '[' + this.resolveValue(condition.low.Value) + ',' + this.resolveValue(condition.high.Value) + '])'\n            );\n        } else if (condition_type === 'InSubquery') {\n            let method_name = condition.negated === true ? 'whereIn' : 'whereNotIn';\n\n            conditions.push(\n              this.addPrefix2Methods(op, method_name)\n              + '(' + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr)) + ',' + '(function ($query) {\\n'\n              + '\\t' + addTabToEveryLine((new Converter(condition.subquery)).run(false), 2).replace('DB::table', '$query->from') + ';\\n'\n              + '}'\n            );\n        } else if (condition_type === 'Function') {\n            conditions.push(this.addPrefix2Methods(op, method_name) + '(DB::raw(\"' + this.parseFunctionNode(condition, false) + '\"))');\n        } else if (condition_type === 'UnaryOp') {\n            conditions.push(this.prepareConditions(getNestedUniqueKeyFromObject(condition.expr), getNestedUniqueValueFromObject(condition.expr), op, method_name)[0].replace(/where/i, 'where' + condition.op));\n        } else {\n            throw 'Logic error, unhandled condition type [' + condition_type + ']';\n        }\n\n        return conditions;\n    }\n\n    /**\n     * @param op\n     * @return {string}\n     */\n    transformBinaryOp(op) {\n        let operator_by_op = {\n            'Eq': '=',\n            'Gt': '>',\n            'GtEq': '>=',\n            'Lt': '<',\n            'LtEq': '<',\n            'NotEq': '!=',\n            'Like': 'like',\n            'Minus': '-',\n            'Plus': '+',\n            'Multiply': '*',\n            'Divide': '/'\n        };\n\n        return operator_by_op[op];\n    }\n\n    addPrefix2Methods(op, method_name) {\n        if (op === '' || op === 'And') {\n            return method_name;\n        }\n\n        return op.toLowerCase() + capitalizeFirstLetter(method_name);\n    }\n\n    /**\n     * @return {string}\n     */\n    resolveSelectSection() {\n        let res = [];\n\n        for (const select_item of this.ast.body.Select.projection) {\n            if (propertyExistsInObjectAndNotNull(select_item, 'ExprWithAlias')) {\n                let alias = select_item.ExprWithAlias.alias.value;\n                res.push(this.resolveSelectSectionItem(select_item.ExprWithAlias.expr, alias));\n            } else if (propertyExistsInObjectAndNotNull(select_item, 'UnnamedExpr')) {\n                res.push(this.resolveSelectSectionItem(select_item.UnnamedExpr));\n            } else if (select_item === 'Wildcard') {\n                res.push(quote('*'));\n            } else if (propertyExistsInObjectAndNotNull(select_item, 'QualifiedWildcard')) {\n                res.push(quote(this.getActualTableName(select_item.QualifiedWildcard[0].value) + '.*'))\n            } else {\n                throw 'Logic error, unhandled select item [' + Object.keys(select_item)[0] + ']';\n            }\n        }\n\n        return 'select(' + res.join(', ') + ')';\n    }\n\n    /**\n     * @param select_item\n     * @param alias\n     * @return {string}\n     */\n    resolveSelectSectionItem(select_item, alias = null) {\n        assert(isUndefinedOrNull(select_item) === false, 'select_item must not be undefined or null');\n\n        let item;\n        if (propertyExistsInObjectAndNotNull(select_item, 'Function')) {\n            item = 'DB::raw(\"' + this.parseFunctionNode(select_item.Function);\n\n            if (alias !== null) {\n                item = item + ' as ' + alias + '\")';\n            }\n\n            return item;\n        } else {\n            item = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(select_item), false);\n\n            if (alias !== null) {\n                item = item + ' as ' + alias;\n            }\n\n            return quote(item);\n        }\n    }\n\n    parseFunctionNode(function_node, need_quote = true) {\n        let function_name = function_node.name[0].value;\n\n        if (need_quote) {\n            function_name = quote(function_name);\n        }\n\n        let res = function_name + '(';\n        let args = function_node.args;\n        let arg_count = args.length;\n\n        for (let i = 0; i < arg_count; i++) {\n            let arg = args[i];\n\n            if (arg.Unnamed === 'Wildcard') {\n                res = res + '*';\n            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Value')) {\n                res = res + this.resolveValue(arg.Unnamed.Expr.Value);\n            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Identifier')) {\n                res = res + arg.Unnamed.Expr.Identifier.value;\n            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'CompoundIdentifier')) {\n                res = res + this.convertIdentifier2qualifiedColumn(arg.Unnamed.Expr.CompoundIdentifier);\n            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Nested')) { // e.g. COUNT(DISTINCT('id'))\n                let arg_column = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(arg.Unnamed.Expr.Nested));\n\n                if (function_node.distinct === true) {\n                    arg_column = 'DISTINCT(' + arg_column + ')';\n                }\n\n                res = res + arg_column;\n            } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Function')) {\n                res = res + this.parseFunctionNode(arg.Unnamed.Expr.Function, false);\n            } else {\n                throw 'Logic error, unhandled arg type:' + getNestedUniqueKeyFromObject(arg.Unnamed.Expr);\n            }\n\n\n            if (i !== arg_count - 1) {\n                res = res + ', ';\n            }\n        }\n\n        res = res + ')';\n\n        return res;\n    }\n\n    /**\n     * @return {boolean}\n     */\n    hasJoinSection(from_item) {\n        return propertyExistsInObjectAndNotNull(from_item, 'joins') && from_item.joins.length > 0;\n    }\n\n    parseBinaryOpNode(binary_op) {\n        let left;\n\n        if (propertyExistsInObjectAndNotNull(binary_op.left, 'Function')) {\n            left = quote(this.parseFunctionNode(binary_op.left.Function));\n        } else if (propertyExistsInObjectAndNotNull(binary_op.left, 'Identifier', 'CompoundIdentifier')){\n            left = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(binary_op.left));\n        } else {\n            throw 'Logic error, unhandled type in binary op left';\n        }\n\n        let op = quote(this.transformBinaryOp(binary_op.op));\n        let right = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(binary_op.right));\n\n        return [left, op, right];\n    }\n\n    prepareJoins(from_item) {\n        let joins = [];\n\n        for (const join of from_item.joins) {\n            let join_operator_type = getNestedUniqueKeyFromObject(join.join_operator);\n            let join_method = {\n                'Inner': 'join',\n                'LeftOuter': 'leftJoin',\n                'RightOuter': 'rightJoin',\n            }[join_operator_type];\n            let join_operator = getNestedUniqueValueFromObject(join.join_operator);\n            let condition_type = getNestedUniqueKeyFromObject(join_operator.On);\n            let condition = getNestedUniqueValueFromObject(join_operator.On);\n            let conditions = this.prepareConditions(condition_type, condition, '', 'on');\n\n            if (propertyExistsInObjectAndNotNull(join.relation, 'Derived')) { // joined section is sub-query\n                let sub_query_sql = new Converter(join.relation.Derived.subquery).run(false);\n                let sub_query_alias = join.relation.Derived.alias.name.value;\n                joins.push(join_method + '(DB::raw(\"' + addTabToEveryLine(sub_query_sql) + '\") as '\n                    + sub_query_alias + '), function($join) {\\n\\t'\n                    + '$join->' + addTabToEveryLine(conditions.join('\\n->') + ';', 2)\n                    + '\\n}');\n            } else if (propertyExistsInObjectAndNotNull(join.relation, 'Table')) {\n                let joined_table = this.resolveTableNameFromRelationNode(join.relation);\n\n                if (conditions.length === 1) {\n                    if (propertyExistsInObjectAndNotNull(join_operator.On, 'BinaryOp')) {\n                        let left;\n                        let on_condition;\n                        let right;\n                        [left, on_condition, right] = this.parseBinaryOpNode(join_operator.On.BinaryOp);\n\n                        joins.push(join_method + '(' + joined_table + ',' + left + ',' + on_condition + ',' + right + ')');\n                    } else if (propertyExistsInObjectAndNotNull(join_operator.On, 'Nested')){\n                        let conditions = this.prepareConditions('Nested', join_operator.On.Nested, '', 'on');\n\n                        joins.push(conditions[0]);\n                    } else {\n                        throw 'Logic error, unhandled on type';\n                    }\n                } else {\n                    joins.push(join_method + '(' + joined_table + ','\n                        + 'function($join) {\\n\\t'\n                        + '$join->' + addTabToEveryLine(conditions.join('\\n->')) + ';'\n                        + '\\n}'\n                    );\n                }\n            } else {\n                throw 'Logic error, unhandled join relation type';\n            }\n        }\n\n        return joins;\n    }\n\n    resolveJoinSection(from_item) {\n        return this.prepareJoins(from_item).join('\\n->');\n    }\n\n    /**\n     * @param from_items\n     * @return {string[]}\n     */\n    resolveCrossJoinSection(from_items) {\n        let cross_join_sections = [];\n\n        for (const from_item of from_items) {\n            let cross_join_str;\n\n            if (propertyExistsInObjectAndNotNull(from_item.relation, 'Table')) {\n                cross_join_str = 'crossJoin(' + this.resolveTableNameFromRelationNode(from_item.relation);\n            } else if (propertyExistsInObjectAndNotNull(from_item.relation, 'Derived')) {\n                cross_join_str = this.resolveFromSubSection('crossJoinSub', from_item);\n            } else {\n                throw 'Logic error, unhandled cross join relation type';\n            }\n\n            cross_join_sections.push(cross_join_str);\n        }\n\n        return cross_join_sections;\n    }\n\n    resolveGroupBySection() {\n        let group_by_columns = [];\n\n        for (const group_by_item of this.ast.body.Select.group_by) {\n            if (propertyExistsInObjectAndNotNull(group_by_item, 'Function')) {\n                group_by_columns.push('DB::raw(' + this.parseFunctionNode(group_by_item.Function) + '\")');\n            } else if(propertyExistsInObjectAndNotNull(group_by_item, 'Identifier', 'CompoundIdentifier')) {\n                group_by_columns.push(this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(group_by_item)));\n            } else if (propertyExistsInObjectAndNotNull(group_by_item, 'Nested')) {\n            } else {\n                throw 'Logic error, unhandled group by type:' + getNestedUniqueKeyFromObject(group_by_item);\n            }\n        }\n\n        return 'groupBy(' + group_by_columns.join(',') + ')';\n    }\n\n    resolveHavingSection() {\n        let binary_op = getNestedUniqueValueFromObject(this.ast.body.Select.having, 'BinaryOp');\n        let method_name = propertyExistsInObjectAndNotNull(binary_op.left, 'Function') ? 'havingRaw' : 'having';\n\n        return method_name + '(' + this.parseBinaryOpNode(binary_op).join(',') + ')';\n    }\n\n    /**\n     * @returns {string}\n     */\n    resolveOrderBySection() {\n        let order_bys = [];\n\n        for (const order_by_item of this.ast.order_by) {\n            if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'BinaryOp')) {\n                order_bys.push('orderByRaw(' + quote(this.parseBinaryOpNode(order_by_item.expr.BinaryOp).map((i) => unquote(i)).join(' ')) + ')');\n            } else if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'Identifier', 'CompoundIdentifier')) {\n                order_bys.push(\n                    'orderBy(' +\n                    this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(order_by_item.expr)) + ',' +\n                    quote(order_by_item.asc === false ? 'desc': 'asc') + ')'\n                );\n            } else if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'Function')) {\n                order_bys.push('orderByRaw(\"' + this.parseFunctionNode(order_by_item.expr.Function) + ' ' + (order_by_item.asc === false ? 'desc': 'asc') + '\")');\n            } else {\n                throw 'Logic error, unhandled order by type:' + getNestedUniqueKeyFromObject(order_by_item.expr);\n            }\n        }\n\n        return order_bys.join('\\n->');\n    }\n\n    /**\n     * @param valueNode\n     * @return {string|*}\n     */\n    resolveValue(valueNode) {\n        let value = getNestedUniqueValueFromObject(valueNode);\n        let value_type = getNestedUniqueKeyFromObject(valueNode);\n\n        if (value_type === 'SingleQuotedString') {\n            return quote(value);\n        } else if (value_type === 'Number') {\n            return value[0];\n        } else if (value_type === 'CompoundIdentifier' || value_type === 'Identifier') {\n            return this.convertIdentifier2qualifiedColumn(value);\n        } else {\n            throw 'Logic error, unhandled arg value type:' + value_type;\n        }\n    }\n\n    getActualTableName(table_name_or_alias) {\n        if (propertyExistsInObjectAndNotNull(this.table_name_by_alias, table_name_or_alias)) {\n            return this.table_name_by_alias[table_name_or_alias];\n        }\n\n        return table_name_or_alias;\n    }\n\n    /**\n     * @param identifier\n     * @param {boolean} need_quote\n     * @return {string}\n     */\n    convertIdentifier2qualifiedColumn(identifier, need_quote = true) {\n        let values = [identifier].flat().map((i) => i.value);\n        let table_name_or_alias = values[0];\n\n        // First index always is table name or alias, change it to actual table name.\n        values[0] = this.getActualTableName(table_name_or_alias);\n\n        let res = values.join('.');\n\n        if (need_quote) {\n            res = quote(res);\n        }\n\n        return res;\n    }\n}\n\n/**\n * @param {boolean} condition\n * @param {string} msg\n */\nfunction assert(condition, msg) {\n    if (!condition) {\n        throw msg;\n    }\n}\n\n/**\n * @param obj\n * @param property_names\n * @return {boolean}\n */\nfunction propertyExistsInObjectAndNotNull(obj, ...property_names) {\n    return property_names.reduce((carry, property_name) => carry || (obj.hasOwnProperty(property_name) && obj[property_name] !== null), false);\n}\n\n/**\n * @param value\n * @return {boolean}\n */\nfunction isString(value) {\n    return  typeof value === 'string' || value instanceof String;\n}\n\nfunction capitalizeFirstLetter(string) {\n    return string.charAt(0).toUpperCase() + string.slice(1);\n}\n\n/**\n * @param value\n * @return {string}\n */\nfunction quote(value) {\n    return \"'\" + value + \"'\";\n}\n\n/**\n * @param value\n * @returns {string}\n */\nfunction unquote(value) {\n    return value.replace(/['\"]+/g, '');\n}\n\n/**\n * @param obj\n * @return {string}\n */\nfunction getNestedUniqueKeyFromObject(obj) {\n    if (Object.keys(obj).length !== 1) {\n        throw 'The function can only be called on object that has one key, object: ' + JSON.stringify(obj);\n    }\n\n    return Object.keys(obj)[0];\n}\n\n/**\n * @param obj\n * @return {*}\n */\nfunction getNestedUniqueValueFromObject(obj) {\n    return obj[getNestedUniqueKeyFromObject(obj)];\n}\n\n/**\n * @param value\n * @return {boolean}\n */\nfunction isUndefinedOrNull(value) {\n    return typeof value === 'undefined' || value === null;\n}\n\n/**\n * @param str\n * @param tab_count\n */\nfunction addTabToEveryLine(str, tab_count = 1) {\n    let separator = '\\n';\n\n    for (let i = 0; i < tab_count; i++) {\n        separator = separator + '\\t';\n    }\n\n    return str.split('\\n').join(separator);\n}\n\n\n\n//# sourceURL=webpack:///./src/converter.js?");

/***/ }),

/***/ "./src/index.js":
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! sqlparser-rs-wasm */ \"./node_modules/sqlparser-rs-wasm/sqlparser-rs-wasm.js\");\n/* harmony import */ var _converter__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./converter */ \"./src/converter.js\");\n/* harmony import */ var _sentry_browser__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @sentry/browser */ \"./node_modules/@sentry/browser/esm/index.js\");\n/* harmony import */ var _sentry_tracing__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! @sentry/tracing */ \"./node_modules/@sentry/tracing/esm/index.js\");\n\n\n\n\n\n_sentry_browser__WEBPACK_IMPORTED_MODULE_2__[\"init\"]({\n    dsn: \"https://1130fb45d5b944bc83e0bf90a7d46182@o1161856.ingest.sentry.io/6248410\",\n    integrations: [new _sentry_tracing__WEBPACK_IMPORTED_MODULE_3__[\"BrowserTracing\"]()],\n\n    // Set tracesSampleRate to 1.0 to capture 100%\n    // of transactions for performance monitoring.\n    // We recommend adjusting this value in production\n    tracesSampleRate: 1.0,\n    allowUrls: ['https://sql2builder.github.io/']\n});\n\ndocument.getElementById('convert-button').addEventListener('click', function () {\n    let input = document.getElementById(\"input\").value;\n\n    if (input.trim() === '') {\n        return;\n    }\n\n    if (input.slice(-1) === ';') {\n        input = input.slice(0, -1);\n    }\n\n    let output_text_area = document.getElementById(\"output\");\n\n    if (!input.startsWith('select') && !input.startsWith('SELECT')) {\n        output_text_area.value = 'SQL must start with select or SELECT';\n\n        return;\n    }\n\n    try {\n        let ast = sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_0__[\"parse_sql\"](\"--mysql\", input);\n\n        if (ast.startsWith('Error')) {\n            output_text_area.value = ast;\n        } else {\n            output_text_area.value = (new _converter__WEBPACK_IMPORTED_MODULE_1__[\"Converter\"](JSON.parse(ast)[0].Query)).run();\n        }\n    } catch (e) {\n        console.log(input);\n        output_text_area.value = e + ', I will fix this issue as soon as possible';\n        \n        throw e;\n    }\n});\n\n\n//# sourceURL=webpack:///./src/index.js?");

/***/ })

}]);