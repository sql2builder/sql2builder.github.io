"use strict";
(self["webpackChunksql2builder_github_io"] = self["webpackChunksql2builder_github_io"] || []).push([["main"],{

/***/ 189:
/*!**************************!*\
  !*** ./src/converter.js ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Converter: () => (/* binding */ Converter)
/* harmony export */ });
class Converter {
  constructor(ast, parent = null) {
    this.ast = ast;
    this.table_name_by_alias = {};
    this.parent = parent;
  }
  run(need_append_get_suffix = true) {
    let sections = [];
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
    sections.push(this.resolveSelectSection());
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
    if (propertyExistsInObjectAndNotNull(this.ast, 'limit')) {
      sections.push('limit(' + this.ast.limit.Value.Number[0] + ')');
    }
    if (propertyExistsInObjectAndNotNull(this.ast, 'offset')) {
      sections.push('offset(' + this.ast.offset.value.Value.Number[0] + ')');
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
    return prefix + '(function ($query) {\n' + '\t' + addTabToEveryLine(new Converter(from_item.relation.Derived.subquery, this).run(false).replace('DB::table', '$query->from'), 2) + ';\n' + '},' + quote(from_item.relation.Derived.alias.name.value) + ')';
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
      let list = condition.list.map(i => this.resolveValue(i.Value));
      let method_name = condition.negated ? 'whereNotIn' : 'whereIn';
      conditions.push(this.addPrefix2Methods(op, method_name) + '(' + column + ',' + '[' + list.join(', ') + '])');
    } else if (condition_type === 'Nested') {
      conditions.push(this.addPrefix2Methods(op, method_name) + '(function ($query) {\n' + '\t$query->' + addTabToEveryLine(this.resolveWhereSection(condition), 2) + ';\n})');
    } else if (condition_type === 'BinaryOp') {
      if (condition.op === 'And' || condition.op === 'Or') {
        let left_condition_type = getNestedUniqueKeyFromObject(condition.left);
        let left_condition = getNestedUniqueValueFromObject(condition.left);
        conditions = conditions.concat(this.prepareConditions(left_condition_type, left_condition, op, method_name));
        let right_condition_type = getNestedUniqueKeyFromObject(condition.right);
        let right_condition = getNestedUniqueValueFromObject(condition.right);
        conditions = conditions.concat(this.prepareConditions(right_condition_type, right_condition, condition.op, method_name));
      } else {
        let left = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.left));
        let right;
        if (propertyExistsInObjectAndNotNull(condition.right, 'Identifier', 'CompoundIdentifier')) {
          right = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.right));
          if (method_name.includes('where')) {
            right = 'DB::raw(' + right + ')';
          }
        } else if (propertyExistsInObjectAndNotNull(condition.right, 'Value')) {
          method_name = 'where';
          right = this.resolveValue(condition.right.Value);
        } else if (propertyExistsInObjectAndNotNull(condition.right, 'Subquery')) {
          right = 'function($query) {\n' + '\t' + addTabToEveryLine(new Converter(condition.right.Subquery, this).run(false).replace('DB::table', '$query->from'), 2) + ';\n' + '}';
        } else if (propertyExistsInObjectAndNotNull(condition.right, 'Function')) {
          right = 'DB::raw(' + this.parseFunctionNode(condition.right.Function) + ')';
        } else {
          throw 'Logic error, unhandled condition.right type:' + getNestedUniqueKeyFromObject(condition.right);
        }
        conditions.push(this.addPrefix2Methods(op, method_name) + '(' + left + ',' + quote(this.transformBinaryOp(condition.op)) + ',' + right + ')');
      }
    } else if (condition_type === 'Exists') {
      conditions.push(this.addPrefix2Methods(op, 'whereExists') + '(function ($query) {\n' + '\t' + addTabToEveryLine(new Converter(condition, this).run(false), 2).replace('DB::table', '$query->from') + ';\n' + '}');
    } else if (condition_type === 'Between') {
      let method_name = condition.negated === true ? 'whereNotBetween' : 'whereBetween';
      conditions.push(this.addPrefix2Methods(op, method_name) + '(' + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr)) + ',' + '[' + this.resolveValue(condition.low.Value) + ',' + this.resolveValue(condition.high.Value) + '])');
    } else if (condition_type === 'InSubquery') {
      let method_name = condition.negated === true ? 'whereNotIn' : 'whereIn';
      conditions.push(this.addPrefix2Methods(op, method_name) + '(' + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(condition.expr)) + ',' + '(function ($query) {\n' + '\t' + addTabToEveryLine(new Converter(condition.subquery, this).run(false), 2).replace('DB::table', '$query->from') + ';\n' + '}');
    } else if (condition_type === 'Function') {
      conditions.push(this.addPrefix2Methods(op, method_name) + '(DB::raw("' + this.parseFunctionNode(condition, false) + '"))');
    } else if (condition_type === 'UnaryOp') {
      conditions.push(this.prepareConditions(getNestedUniqueKeyFromObject(condition.expr), getNestedUniqueValueFromObject(condition.expr), op, method_name)[0].replace(/where/i, 'where' + condition.op));
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
        res.push(quote(this.getActualTableName(select_item.QualifiedWildcard[0].value) + '.*'));
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
      } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Nested')) {
        // e.g. COUNT(DISTINCT('id'))
        let arg_column = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(arg.Unnamed.Expr.Nested));
        if (function_node.distinct === true) {
          arg_column = 'DISTINCT(' + arg_column + ')';
        }
        res = res + arg_column;
      } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Function')) {
        res = res + this.parseFunctionNode(arg.Unnamed.Expr.Function, false);
      } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'BinaryOp')) {
        res = res + this.parseBinaryOpNode(arg.Unnamed.Expr.BinaryOp);
      } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'UnaryOp')) {
        // todo
      } else if (propertyExistsInObjectAndNotNull(arg.Unnamed.Expr, 'Case')) {
        // todo
      } else {
        // throw 'Logic error, unhandled arg type:' + getNestedUniqueKeyFromObject(arg.Unnamed.Expr);
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
  parseBinaryOpPartial(left_or_right) {
    let res;
    if (propertyExistsInObjectAndNotNull(left_or_right, 'Function')) {
      res = quote(this.parseFunctionNode(left_or_right.Function));
    } else if (propertyExistsInObjectAndNotNull(left_or_right, 'Identifier', 'CompoundIdentifier')) {
      res = this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(left_or_right));
    } else if (propertyExistsInObjectAndNotNull(left_or_right, 'Value')) {
      res = this.resolveValue(left_or_right.Value);
    } else if (propertyExistsInObjectAndNotNull(left_or_right, 'BinaryOp')) {
      res = this.parseBinaryOpNode(left_or_right.BinaryOp);
    } else if (propertyExistsInObjectAndNotNull(left_or_right, 'Subquery')) {
      // todo
    } else {
      throw 'Logic error, unhandled type in binary op left or right.';
    }
    return res;
  }
  parseBinaryOpNode(binary_op, separator = ' ') {
    let left = this.parseBinaryOpPartial(binary_op.left);
    let op = quote(this.transformBinaryOp(binary_op.op));
    let right = this.parseBinaryOpPartial(binary_op.right);
    return [left, op, right].join(separator);
  }
  prepareJoins(from_item) {
    let joins = [];
    for (const join of from_item.joins) {
      let join_operator_type = getNestedUniqueKeyFromObject(join.join_operator);
      let join_method = {
        'Inner': 'join',
        'LeftOuter': 'leftJoin',
        'RightOuter': 'rightJoin'
      }[join_operator_type];
      let join_operator = getNestedUniqueValueFromObject(join.join_operator);
      let condition_type = getNestedUniqueKeyFromObject(join_operator.On);
      let condition = getNestedUniqueValueFromObject(join_operator.On);
      let conditions = this.prepareConditions(condition_type, condition, '', 'on');
      if (propertyExistsInObjectAndNotNull(join.relation, 'Derived')) {
        // joined section is sub-query
        let sub_query_sql = new Converter(join.relation.Derived.subquery, this).run(false);
        let sub_query_alias = join.relation.Derived.alias.name.value;
        joins.push(join_method + '(DB::raw("' + addTabToEveryLine(sub_query_sql) + '") as ' + sub_query_alias + '), function($join) {\n\t' + '$join->' + addTabToEveryLine(conditions.join('\n->') + ';', 2) + '\n}');
      } else if (propertyExistsInObjectAndNotNull(join.relation, 'Table')) {
        let joined_table = this.resolveTableNameFromRelationNode(join.relation);
        if (conditions.length === 1) {
          if (propertyExistsInObjectAndNotNull(join_operator.On, 'BinaryOp')) {
            joins.push(join_method + '(' + joined_table + ',' + this.parseBinaryOpNode(join_operator.On.BinaryOp, ',') + ')');
          } else if (propertyExistsInObjectAndNotNull(join_operator.On, 'Nested')) {
            let conditions = this.prepareConditions('Nested', join_operator.On.Nested, '', 'on');
            joins.push(conditions[0]);
          } else {
            throw 'Logic error, unhandled on type';
          }
        } else {
          joins.push(join_method + '(' + joined_table + ',' + 'function($join) {\n\t' + '$join->' + addTabToEveryLine(conditions.join('\n->')) + ';' + '\n})');
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
      } else if (propertyExistsInObjectAndNotNull(group_by_item, 'Identifier', 'CompoundIdentifier')) {
        group_by_columns.push(this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(group_by_item)));
      } else if (propertyExistsInObjectAndNotNull(group_by_item, 'Nested')) {} else if (propertyExistsInObjectAndNotNull(group_by_item, 'Value')) {
        group_by_columns.push(this.resolveValue(group_by_item.Value));
      } else {
        throw 'Logic error, unhandled group by type:' + getNestedUniqueKeyFromObject(group_by_item);
      }
    }
    return 'groupBy(' + group_by_columns.join(',') + ')';
  }
  resolveHavingSection() {
    let binary_op = getNestedUniqueValueFromObject(this.ast.body.Select.having, 'BinaryOp');
    let method_name = propertyExistsInObjectAndNotNull(binary_op.left, 'Function') ? 'havingRaw' : 'having';
    return method_name + '(' + this.parseBinaryOpNode(binary_op, ',') + ')';
  }

  /**
   * @returns {string}
   */
  resolveOrderBySection() {
    let order_bys = [];
    for (const order_by_item of this.ast.order_by) {
      if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'BinaryOp')) {
        order_bys.push('orderByRaw(' + quote(this.parseBinaryOpNode(order_by_item.expr.BinaryOp)) + ')');
      } else if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'Identifier', 'CompoundIdentifier')) {
        order_bys.push('orderBy(' + this.convertIdentifier2qualifiedColumn(getNestedUniqueValueFromObject(order_by_item.expr)) + ',' + quote(order_by_item.asc === false ? 'desc' : 'asc') + ')');
      } else if (propertyExistsInObjectAndNotNull(order_by_item.expr, 'Function')) {
        order_bys.push('orderByRaw("' + this.parseFunctionNode(order_by_item.expr.Function) + ' ' + (order_by_item.asc === false ? 'desc' : 'asc') + '")');
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
    if (isString(valueNode) && valueNode.toLowerCase() === 'null') {
      return 'null';
    }
    let value = getNestedUniqueValueFromObject(valueNode);
    let value_type = getNestedUniqueKeyFromObject(valueNode);
    if (value_type === 'SingleQuotedString') {
      return quote(value);
    } else if (value_type === 'Number') {
      return value[0];
    } else if (value_type === 'CompoundIdentifier' || value_type === 'Identifier') {
      return this.convertIdentifier2qualifiedColumn(value);
    } else if (value_type === 'Boolean') {
      return value;
    } else {
      throw 'Logic error, unhandled arg value type:' + value_type;
    }
  }
  getActualTableName(table_name_or_alias) {
    if (propertyExistsInObjectAndNotNull(this.table_name_by_alias, table_name_or_alias)) {
      return this.table_name_by_alias[table_name_or_alias];
    } else if (this.parent != null) {
      return this.parent.getActualTableName(table_name_or_alias);
    }
    return table_name_or_alias;
  }

  /**
   * @param identifier
   * @param {boolean} need_quote
   * @return {string}
   */
  convertIdentifier2qualifiedColumn(identifier, need_quote = true) {
    let values = [identifier].flat().map(i => i.value);
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
  return property_names.reduce((carry, property_name) => carry || obj.hasOwnProperty(property_name) && obj[property_name] !== null, false);
}

/**
 * @param value
 * @return {boolean}
 */
function isString(value) {
  return typeof value === 'string' || value instanceof String;
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

/***/ }),

/***/ 208:
/*!*************************************************************!*\
  !*** ./node_modules/css-loader/dist/cjs.js!./src/style.css ***!
  \*************************************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../node_modules/css-loader/dist/runtime/sourceMaps.js */ 354);
/* harmony import */ var _node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../node_modules/css-loader/dist/runtime/api.js */ 314);
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _node_modules_css_loader_dist_runtime_getUrl_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../node_modules/css-loader/dist/runtime/getUrl.js */ 417);
/* harmony import */ var _node_modules_css_loader_dist_runtime_getUrl_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_getUrl_js__WEBPACK_IMPORTED_MODULE_2__);
// Imports



var ___CSS_LOADER_URL_IMPORT_0___ = new URL(/* asset import */ __webpack_require__(/*! data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cg fill=%27%23ffffff%27 fill-opacity=%270.05%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E */ 821), __webpack_require__.b);
var ___CSS_LOADER_EXPORT___ = _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default()((_node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default()));
var ___CSS_LOADER_URL_REPLACEMENT_0___ = _node_modules_css_loader_dist_runtime_getUrl_js__WEBPACK_IMPORTED_MODULE_2___default()(___CSS_LOADER_URL_IMPORT_0___);
// Module
___CSS_LOADER_EXPORT___.push([module.id, `/* Modern SQL to Laravel Builder - Custom Styles */

:root {
  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --success-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  --dark-bg: #1a1a2e;
  --card-bg: #ffffff;
  --text-primary: #2d3748;
  --text-secondary: #718096;
  --border-color: #e2e8f0;
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.15);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
}

* {
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
}

/* Hero Section Redesign */
.hero.is-primary {
  background: var(--primary-gradient);
  position: relative;
  overflow: hidden;
}

.hero.is-primary::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url(${___CSS_LOADER_URL_REPLACEMENT_0___});
  opacity: 0.3;
}

.hero-body {
  position: relative;
  z-index: 1;
  padding: 1.5rem 1.5rem;
}

.hero .title {
  font-size: 1.75rem;
  font-weight: 700;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  letter-spacing: -0.5px;
}

.hero .subtitle {
  font-size: 1rem;
  opacity: 0.95;
  margin-top: 0.5rem;
}

/* Navigation/Header */
.nav-header {
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  box-shadow: var(--shadow-sm);
}

.github-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius-sm);
  font-weight: 400;
  font-size: 0.875rem;
  transition: all 0.2s ease;
  opacity: 0.6;
}

.github-link:hover {
  opacity: 0.9;
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.03);
}

.github-link::before {
  content: '★';
  font-size: 0.875rem;
}

/* Main Content Area */
.content-wrapper {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

/* Converter Grid - Side by Side Layout */
.converter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
  align-items: start;
}

.converter-card {
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  padding: 2rem;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.converter-card:hover {
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);
}

/* Section Headers */
.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
}

.section-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.125rem;
  background: var(--primary-gradient);
  color: white;
  box-shadow: var(--shadow-md);
  flex-shrink: 0;
}

/* Textarea Redesign */
.textarea-wrapper {
  position: relative;
  margin-bottom: 1.5rem;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.textarea {
  border: 2px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  font-size: 0.95rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
  line-height: 1.6;
  transition: all 0.3s ease;
  resize: none;
  height: 450px;
  background: #f8fafc;
  width: 100%;
}

.textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  background: white;
}

.textarea::placeholder {
  color: #a0aec0;
  font-style: italic;
  font-size: 0.9rem;
}

/* Copy Button */
.copy-button {
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: 0.625rem 1.25rem;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  backdrop-filter: blur(4px);
  box-shadow: var(--shadow-sm);
}

.copy-button:hover {
  background: #667eea;
  color: white;
  border-color: #667eea;
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.copy-button.copied {
  background: #48bb78;
  color: white;
  border-color: #48bb78;
}

/* Button Controls */
.button-controls {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 0.5rem;
}

.button {
  padding: 1rem 2.5rem;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 1rem;
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  position: relative;
  overflow: hidden;
  flex: 1;
  min-width: 140px;
}

.button::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width 0.6s, height 0.6s;
}

.button:hover::before {
  width: 300px;
  height: 300px;
}

.button.is-primary {
  background: var(--primary-gradient);
  color: white;
  box-shadow: var(--shadow-md);
}

.button.is-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.button.is-secondary {
  background: white;
  color: #667eea;
  border: 2px solid #667eea;
}

.button.is-secondary:hover {
  background: #667eea;
  color: white;
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

/* Loading Animation */
.button.is-loading {
  pointer-events: none;
  opacity: 0.7;
}

.button.is-loading::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  top: 50%;
  left: 50%;
  margin-left: -8px;
  margin-top: -8px;
  border: 2px solid transparent;
  border-top-color: white;
  border-radius: 50%;
  animation: button-loading-spinner 0.6s linear infinite;
}

@keyframes button-loading-spinner {
  from {
    transform: rotate(0turn);
  }
  to {
    transform: rotate(1turn);
  }
}

/* Features Section */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
  margin-bottom: 2rem;
}

.feature-card {
  background: white;
  padding: 1.5rem;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  transition: all 0.3s ease;
  border: 1px solid var(--border-color);
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}

.feature-icon {
  width: 50px;
  height: 50px;
  border-radius: var(--radius-sm);
  background: var(--primary-gradient);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  margin-bottom: 1rem;
}

.feature-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.feature-description {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.6;
}

/* Footer */
.modern-footer {
  background: white;
  padding: 2rem;
  text-align: center;
  margin-top: 4rem;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
}

.modern-footer p {
  color: var(--text-secondary);
  margin: 0;
}

.modern-footer a {
  color: #667eea;
  text-decoration: none;
  font-weight: 600;
}

.modern-footer a:hover {
  text-decoration: underline;
}

/* Animations */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in-up {
  animation: fadeInUp 0.6s ease-out;
}

/* Success/Error Messages */
.message-box {
  padding: 1rem 1.5rem;
  border-radius: var(--radius-md);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  animation: fadeInUp 0.3s ease-out;
}

.message-box.success {
  background: #d4edda;
  color: #155724;
  border-left: 4px solid #28a745;
}

.message-box.error {
  background: #f8d7da;
  color: #721c24;
  border-left: 4px solid #dc3545;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .converter-grid {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .content-wrapper {
    max-width: 1200px;
  }
}

@media (max-width: 768px) {
  .hero .title {
    font-size: 1.75rem;
  }

  .hero .subtitle {
    font-size: 1rem;
  }

  .converter-card {
    padding: 1.5rem;
  }

  .button-controls {
    flex-direction: column;
  }

  .button {
    width: 100%;
    justify-content: center;
  }

  .nav-header {
    flex-direction: column;
    gap: 1rem;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .textarea {
    min-height: 150px;
  }
}

/* Code Highlighting in Output */
.textarea.code-output {
  background: #1e293b;
  color: #e2e8f0;
  border-color: #334155;
  font-size: 0.9rem;
}

.textarea.code-output:focus {
  border-color: #667eea;
  background: #1e293b;
}

.textarea.code-output::placeholder {
  color: #64748b;
}

/* Utility Classes */
.mt-1 { margin-top: 0.5rem; }
.mt-2 { margin-top: 1rem; }
.mt-3 { margin-top: 1.5rem; }
.mt-4 { margin-top: 2rem; }

.mb-1 { margin-bottom: 0.5rem; }
.mb-2 { margin-bottom: 1rem; }
.mb-3 { margin-bottom: 1.5rem; }
.mb-4 { margin-bottom: 2rem; }

.text-center { text-align: center; }
.text-muted { color: var(--text-secondary); }
`, "",{"version":3,"sources":["webpack://./src/style.css"],"names":[],"mappings":"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","sourcesContent":["/* Modern SQL to Laravel Builder - Custom Styles */\n\n:root {\n  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);\n  --success-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);\n  --dark-bg: #1a1a2e;\n  --card-bg: #ffffff;\n  --text-primary: #2d3748;\n  --text-secondary: #718096;\n  --border-color: #e2e8f0;\n  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.05);\n  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);\n  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);\n  --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.15);\n  --radius-sm: 8px;\n  --radius-md: 12px;\n  --radius-lg: 16px;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);\n  min-height: 100vh;\n}\n\n/* Hero Section Redesign */\n.hero.is-primary {\n  background: var(--primary-gradient);\n  position: relative;\n  overflow: hidden;\n}\n\n.hero.is-primary::before {\n  content: '';\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\");\n  opacity: 0.3;\n}\n\n.hero-body {\n  position: relative;\n  z-index: 1;\n  padding: 1.5rem 1.5rem;\n}\n\n.hero .title {\n  font-size: 1.75rem;\n  font-weight: 700;\n  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);\n  letter-spacing: -0.5px;\n}\n\n.hero .subtitle {\n  font-size: 1rem;\n  opacity: 0.95;\n  margin-top: 0.5rem;\n}\n\n/* Navigation/Header */\n.nav-header {\n  padding: 1rem 2rem;\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  background: white;\n  box-shadow: var(--shadow-sm);\n}\n\n.github-link {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.25rem;\n  padding: 0.5rem 0.75rem;\n  background: transparent;\n  color: var(--text-secondary);\n  text-decoration: none;\n  border-radius: var(--radius-sm);\n  font-weight: 400;\n  font-size: 0.875rem;\n  transition: all 0.2s ease;\n  opacity: 0.6;\n}\n\n.github-link:hover {\n  opacity: 0.9;\n  color: var(--text-primary);\n  background: rgba(0, 0, 0, 0.03);\n}\n\n.github-link::before {\n  content: '★';\n  font-size: 0.875rem;\n}\n\n/* Main Content Area */\n.content-wrapper {\n  max-width: 1400px;\n  margin: 0 auto;\n  padding: 2rem 1rem;\n}\n\n/* Converter Grid - Side by Side Layout */\n.converter-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 2rem;\n  margin-bottom: 2rem;\n  align-items: start;\n}\n\n.converter-card {\n  background: var(--card-bg);\n  border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-xl);\n  padding: 2rem;\n  transition: all 0.3s ease;\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n}\n\n.converter-card:hover {\n  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);\n}\n\n/* Section Headers */\n.section-header {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  margin-bottom: 1.5rem;\n  font-size: 1.125rem;\n  font-weight: 700;\n  color: var(--text-primary);\n}\n\n.section-icon {\n  width: 36px;\n  height: 36px;\n  border-radius: var(--radius-sm);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.125rem;\n  background: var(--primary-gradient);\n  color: white;\n  box-shadow: var(--shadow-md);\n  flex-shrink: 0;\n}\n\n/* Textarea Redesign */\n.textarea-wrapper {\n  position: relative;\n  margin-bottom: 1.5rem;\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n}\n\n.textarea {\n  border: 2px solid var(--border-color);\n  border-radius: var(--radius-md);\n  padding: 1.25rem;\n  font-size: 0.95rem;\n  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;\n  line-height: 1.6;\n  transition: all 0.3s ease;\n  resize: none;\n  height: 450px;\n  background: #f8fafc;\n  width: 100%;\n}\n\n.textarea:focus {\n  outline: none;\n  border-color: #667eea;\n  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);\n  background: white;\n}\n\n.textarea::placeholder {\n  color: #a0aec0;\n  font-style: italic;\n  font-size: 0.9rem;\n}\n\n/* Copy Button */\n.copy-button {\n  position: absolute;\n  top: 1rem;\n  right: 1rem;\n  padding: 0.625rem 1.25rem;\n  background: rgba(255, 255, 255, 0.95);\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-sm);\n  cursor: pointer;\n  font-size: 0.875rem;\n  font-weight: 600;\n  color: var(--text-secondary);\n  transition: all 0.2s ease;\n  z-index: 10;\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  backdrop-filter: blur(4px);\n  box-shadow: var(--shadow-sm);\n}\n\n.copy-button:hover {\n  background: #667eea;\n  color: white;\n  border-color: #667eea;\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-md);\n}\n\n.copy-button.copied {\n  background: #48bb78;\n  color: white;\n  border-color: #48bb78;\n}\n\n/* Button Controls */\n.button-controls {\n  display: flex;\n  gap: 1rem;\n  flex-wrap: wrap;\n  margin-top: auto;\n  padding-top: 0.5rem;\n}\n\n.button {\n  padding: 1rem 2.5rem;\n  border-radius: var(--radius-md);\n  font-weight: 700;\n  font-size: 1rem;\n  border: none;\n  cursor: pointer;\n  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 0.5rem;\n  position: relative;\n  overflow: hidden;\n  flex: 1;\n  min-width: 140px;\n}\n\n.button::before {\n  content: '';\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  width: 0;\n  height: 0;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.3);\n  transform: translate(-50%, -50%);\n  transition: width 0.6s, height 0.6s;\n}\n\n.button:hover::before {\n  width: 300px;\n  height: 300px;\n}\n\n.button.is-primary {\n  background: var(--primary-gradient);\n  color: white;\n  box-shadow: var(--shadow-md);\n}\n\n.button.is-primary:hover {\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n}\n\n.button.is-secondary {\n  background: white;\n  color: #667eea;\n  border: 2px solid #667eea;\n}\n\n.button.is-secondary:hover {\n  background: #667eea;\n  color: white;\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n}\n\n/* Loading Animation */\n.button.is-loading {\n  pointer-events: none;\n  opacity: 0.7;\n}\n\n.button.is-loading::after {\n  content: '';\n  position: absolute;\n  width: 16px;\n  height: 16px;\n  top: 50%;\n  left: 50%;\n  margin-left: -8px;\n  margin-top: -8px;\n  border: 2px solid transparent;\n  border-top-color: white;\n  border-radius: 50%;\n  animation: button-loading-spinner 0.6s linear infinite;\n}\n\n@keyframes button-loading-spinner {\n  from {\n    transform: rotate(0turn);\n  }\n  to {\n    transform: rotate(1turn);\n  }\n}\n\n/* Features Section */\n.features-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));\n  gap: 1.5rem;\n  margin-top: 2rem;\n  margin-bottom: 2rem;\n}\n\n.feature-card {\n  background: white;\n  padding: 1.5rem;\n  border-radius: var(--radius-md);\n  box-shadow: var(--shadow-md);\n  transition: all 0.3s ease;\n  border: 1px solid var(--border-color);\n}\n\n.feature-card:hover {\n  transform: translateY(-4px);\n  box-shadow: var(--shadow-lg);\n}\n\n.feature-icon {\n  width: 50px;\n  height: 50px;\n  border-radius: var(--radius-sm);\n  background: var(--primary-gradient);\n  color: white;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.5rem;\n  margin-bottom: 1rem;\n}\n\n.feature-title {\n  font-size: 1.125rem;\n  font-weight: 700;\n  color: var(--text-primary);\n  margin-bottom: 0.5rem;\n}\n\n.feature-description {\n  color: var(--text-secondary);\n  font-size: 0.9rem;\n  line-height: 1.6;\n}\n\n/* Footer */\n.modern-footer {\n  background: white;\n  padding: 2rem;\n  text-align: center;\n  margin-top: 4rem;\n  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);\n}\n\n.modern-footer p {\n  color: var(--text-secondary);\n  margin: 0;\n}\n\n.modern-footer a {\n  color: #667eea;\n  text-decoration: none;\n  font-weight: 600;\n}\n\n.modern-footer a:hover {\n  text-decoration: underline;\n}\n\n/* Animations */\n@keyframes fadeInUp {\n  from {\n    opacity: 0;\n    transform: translateY(20px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n.fade-in-up {\n  animation: fadeInUp 0.6s ease-out;\n}\n\n/* Success/Error Messages */\n.message-box {\n  padding: 1rem 1.5rem;\n  border-radius: var(--radius-md);\n  margin-bottom: 1rem;\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  animation: fadeInUp 0.3s ease-out;\n}\n\n.message-box.success {\n  background: #d4edda;\n  color: #155724;\n  border-left: 4px solid #28a745;\n}\n\n.message-box.error {\n  background: #f8d7da;\n  color: #721c24;\n  border-left: 4px solid #dc3545;\n}\n\n/* Responsive Design */\n@media (max-width: 1024px) {\n  .converter-grid {\n    grid-template-columns: 1fr;\n    gap: 1.5rem;\n  }\n\n  .content-wrapper {\n    max-width: 1200px;\n  }\n}\n\n@media (max-width: 768px) {\n  .hero .title {\n    font-size: 1.75rem;\n  }\n\n  .hero .subtitle {\n    font-size: 1rem;\n  }\n\n  .converter-card {\n    padding: 1.5rem;\n  }\n\n  .button-controls {\n    flex-direction: column;\n  }\n\n  .button {\n    width: 100%;\n    justify-content: center;\n  }\n\n  .nav-header {\n    flex-direction: column;\n    gap: 1rem;\n  }\n\n  .features-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .textarea {\n    min-height: 150px;\n  }\n}\n\n/* Code Highlighting in Output */\n.textarea.code-output {\n  background: #1e293b;\n  color: #e2e8f0;\n  border-color: #334155;\n  font-size: 0.9rem;\n}\n\n.textarea.code-output:focus {\n  border-color: #667eea;\n  background: #1e293b;\n}\n\n.textarea.code-output::placeholder {\n  color: #64748b;\n}\n\n/* Utility Classes */\n.mt-1 { margin-top: 0.5rem; }\n.mt-2 { margin-top: 1rem; }\n.mt-3 { margin-top: 1.5rem; }\n.mt-4 { margin-top: 2rem; }\n\n.mb-1 { margin-bottom: 0.5rem; }\n.mb-2 { margin-bottom: 1rem; }\n.mb-3 { margin-bottom: 1.5rem; }\n.mb-4 { margin-bottom: 2rem; }\n\n.text-center { text-align: center; }\n.text-muted { color: var(--text-secondary); }\n"],"sourceRoot":""}]);
// Exports
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (___CSS_LOADER_EXPORT___);


/***/ }),

/***/ 497:
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! sqlparser-rs-wasm */ 113);
/* harmony import */ var _converter__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./converter */ 189);
/* harmony import */ var _style_css__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./style.css */ 511);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_0__]);
var __webpack_async_dependencies_result__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__);
sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_0__ = __webpack_async_dependencies_result__[0];




// Show notification message
function showNotification(message, type = 'success') {
  // Remove any existing notifications
  const existingNotif = document.querySelector('.message-box');
  if (existingNotif) {
    existingNotif.remove();
  }
  const notification = document.createElement('div');
  notification.className = `message-box ${type}`;
  notification.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${message}</span>`;
  const wrapper = document.querySelector('.content-wrapper');
  wrapper.insertBefore(notification, wrapper.firstChild);
  setTimeout(() => {
    notification.style.animation = 'fadeInUp 0.3s ease-out reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
let converter = function () {
  let input = document.getElementById("input").value;
  let convertButton = document.getElementById("convert-button");
  if (input.trim() === '') {
    showNotification('Please enter a SQL query', 'error');
    return;
  }
  if (input.slice(-1) === ';') {
    input = input.slice(0, -1);
  }
  let output_text_area = document.getElementById("output");
  if (!input.startsWith('select') && !input.startsWith('SELECT')) {
    output_text_area.value = 'SQL must start with select or SELECT';
    showNotification('SQL query must start with SELECT', 'error');
    return;
  }

  // Add loading state
  convertButton.classList.add('is-loading');
  convertButton.disabled = true;

  // Use setTimeout to allow UI to update
  setTimeout(() => {
    try {
      let ast = sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_0__.parse_sql("--mysql", input);
      console.log(ast);
      if (ast.startsWith('Error')) {
        output_text_area.value = ast;
        showNotification('Error parsing SQL query', 'error');
      } else {
        output_text_area.value = new _converter__WEBPACK_IMPORTED_MODULE_1__.Converter(JSON.parse(ast)[0].Query).run();
        showNotification('Successfully converted to Laravel Query Builder!', 'success');
      }
    } catch (e) {
      console.log(input);
      output_text_area.value = e + ', I will fix this issue as soon as possible';
      showNotification('Conversion error occurred', 'error');
      throw e;
    } finally {
      convertButton.classList.remove('is-loading');
      convertButton.disabled = false;
    }
  }, 100);
};

// Copy to clipboard functionality
function copyToClipboard() {
  const output = document.getElementById("output").value;
  const copyButton = document.getElementById("copy-button");
  const copyText = document.getElementById("copy-text");
  const copyIcon = document.getElementById("copy-icon");
  if (!output || output.trim() === '' || output.includes('Your Laravel query builder code will appear here')) {
    showNotification('No output to copy', 'error');
    return;
  }
  navigator.clipboard.writeText(output).then(function () {
    copyButton.classList.add('copied');
    copyText.textContent = 'Copied!';
    copyIcon.textContent = '✓';
    setTimeout(() => {
      copyButton.classList.remove('copied');
      copyText.textContent = 'Copy';
      copyIcon.textContent = '📋';
    }, 2000);
  }, function () {
    showNotification('Failed to copy to clipboard', 'error');
  });
}
window.addEventListener('load', event => {
  let url_search_params = new URLSearchParams(window.location.search);
  if (url_search_params.has('base64sql')) {
    document.getElementById('input').value = atob(url_search_params.get('base64sql'));
    converter();
  }
});
document.getElementById('convert-button').addEventListener('click', converter);

// Add Enter key support (Ctrl/Cmd + Enter to convert)
document.getElementById('input').addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    converter();
  }
});
document.getElementById('share-button').addEventListener('click', function () {
  const input = document.getElementById('input').value;
  if (!input || input.trim() === '') {
    showNotification('Please enter a SQL query first', 'error');
    return;
  }
  let share_link = window.location.origin + window.location.pathname + '?base64sql=' + btoa(input);
  navigator.clipboard.writeText(share_link).then(function () {
    showNotification('Share link copied to clipboard!', 'success');
  }, function () {
    showNotification('Failed to copy share link', 'error');
  });
});

// Add copy button event listener
document.getElementById('copy-button').addEventListener('click', copyToClipboard);
__webpack_async_result__();
} catch(e) { __webpack_async_result__(e); } });

/***/ }),

/***/ 511:
/*!***********************!*\
  !*** ./src/style.css ***!
  \***********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js */ 72);
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/styleDomAPI.js */ 825);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/insertBySelector.js */ 659);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js */ 56);
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/insertStyleElement.js */ 540);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/styleTagTransform.js */ 494);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! !!../node_modules/css-loader/dist/cjs.js!./style.css */ 208);

      
      
      
      
      
      
      
      
      

var options = {};

options.styleTagTransform = (_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default());
options.setAttributes = (_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default());
options.insert = _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default().bind(null, "head");
options.domAPI = (_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default());
options.insertStyleElement = (_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default());

var update = _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default()(_node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__["default"], options);




       /* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (_node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__["default"] && _node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__["default"].locals ? _node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__["default"].locals : undefined);


/***/ }),

/***/ 821:
/*!***********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cg fill=%27%23ffffff%27 fill-opacity=%270.05%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E ***!
  \***********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((module) => {

module.exports = "data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cg fill=%27%23ffffff%27 fill-opacity=%270.05%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E";

/***/ })

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ __webpack_require__.O(0, ["npm.style-loader","npm.css-loader","npm.sqlparser-rs-wasm"], () => (__webpack_exec__(497)));
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUEyQixDQUFDLDRGQUFxQztBQUMvRix5Q0FBeUMsc0ZBQStCO0FBQ3hFO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLG1DQUFtQztBQUN2RDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTtBQUNSLFFBQVE7O0FBRVIsUUFBUTtBQUNSLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTs7QUFFUixlQUFlO0FBQ2YsY0FBYztBQUNkLE9BQU8sd0ZBQXdGLE1BQU0sWUFBWSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxPQUFPLFlBQVksTUFBTSxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLFdBQVcsVUFBVSxVQUFVLFVBQVUsWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxVQUFVLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxXQUFXLE1BQU0sS0FBSyxVQUFVLFlBQVksYUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLE9BQU8sWUFBWSxNQUFNLFlBQVksV0FBVyxZQUFZLE9BQU8sWUFBWSxNQUFNLFVBQVUsWUFBWSxXQUFXLFlBQVksYUFBYSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsV0FBVyxZQUFZLFdBQVcsWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLE9BQU8sWUFBWSxNQUFNLFVBQVUsWUFBWSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsVUFBVSxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxXQUFXLFlBQVksV0FBVyxPQUFPLFlBQVksTUFBTSxZQUFZLGFBQWEsV0FBVyxVQUFVLFlBQVksT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsV0FBVyxVQUFVLFlBQVksV0FBVyxNQUFNLEtBQUssVUFBVSxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLGFBQWEsT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFVBQVUsWUFBWSxhQUFhLGFBQWEsYUFBYSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsV0FBVyxVQUFVLFlBQVksV0FBVyxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxZQUFZLE1BQU0sVUFBVSxVQUFVLFVBQVUsWUFBWSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxXQUFXLFVBQVUsVUFBVSxZQUFZLGFBQWEsYUFBYSxhQUFhLFdBQVcsWUFBWSxhQUFhLFdBQVcsWUFBWSxPQUFPLEtBQUssVUFBVSxZQUFZLFdBQVcsVUFBVSxVQUFVLFVBQVUsWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxVQUFVLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLE9BQU8sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksYUFBYSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsTUFBTSxLQUFLLFVBQVUsWUFBWSxXQUFXLFVBQVUsVUFBVSxVQUFVLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxLQUFLLFlBQVksTUFBTSxLQUFLLFlBQVksTUFBTSxNQUFNLFlBQVksTUFBTSxVQUFVLFlBQVksV0FBVyxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsT0FBTyxLQUFLLFVBQVUsVUFBVSxZQUFZLGFBQWEsV0FBVyxVQUFVLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLE9BQU8sVUFBVSxLQUFLLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxXQUFXLE1BQU0sS0FBSyxVQUFVLFlBQVksYUFBYSxPQUFPLEtBQUssWUFBWSxPQUFPLFVBQVUsS0FBSyxLQUFLLFVBQVUsWUFBWSxNQUFNLEtBQUssVUFBVSxZQUFZLE1BQU0sTUFBTSxLQUFLLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxhQUFhLGFBQWEsV0FBVyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLE9BQU8sWUFBWSxNQUFNLEtBQUssWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLE1BQU0sTUFBTSxLQUFLLEtBQUssWUFBWSxPQUFPLEtBQUssVUFB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QUFNLENBQUNLLFFBQVEsQ0FBQ1MsTUFBTSxHQUFHZCxNQUFNLENBQUNLLFFBQVEsQ0FBQ1UsUUFBUSxHQUFHLGFBQWEsR0FBR0MsSUFBSSxDQUFDekMsS0FBSyxDQUFDO0VBQ2hHb0IsU0FBUyxDQUFDQyxTQUFTLENBQUNDLFNBQVMsQ0FBQ2dCLFVBQVUsQ0FBQyxDQUFDZixJQUFJLENBQUMsWUFBVztJQUN0RHpDLGdCQUFnQixDQUFDLGlDQUFpQyxFQUFFLFNBQVMsQ0FBQztFQUNsRSxDQUFDLEVBQUUsWUFBVztJQUNWQSxnQkFBZ0IsQ0FBQywyQkFBMkIsRUFBRSxPQUFPLENBQUM7RUFDMUQsQ0FBQyxDQUFDO0FBQ04sQ0FBQyxDQUFDOztBQUVGO0FBQ0FJLFFBQVEsQ0FBQ2UsY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDeUIsZ0JBQWdCLENBQUMsT0FBTyxFQUFFWCxlQUFlLENBQUMsQzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDdklqRixNQUErRjtBQUMvRixNQUFxRjtBQUNyRixNQUE0RjtBQUM1RixNQUErRztBQUMvRyxNQUF3RztBQUN4RyxNQUF3RztBQUN4RyxNQUFtRztBQUNuRztBQUNBOztBQUVBOztBQUVBLDRCQUE0QixxR0FBbUI7QUFDL0Msd0JBQXdCLGtIQUFhO0FBQ3JDLGlCQUFpQix1R0FBYTtBQUM5QixpQkFBaUIsK0ZBQU07QUFDdkIsNkJBQTZCLHNHQUFrQjs7QUFFL0MsYUFBYSwwR0FBRyxDQUFDLHNGQUFPOzs7O0FBSTZDO0FBQ3JFLE9BQU8saUVBQWUsc0ZBQU8sSUFBSSxzRkFBTyxVQUFVLHNGQUFPLG1CQUFtQixFQUFDIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vc3FsMmJ1aWxkZXIuZ2l0aHViLmlvLy4vc3JjL2NvbnZlcnRlci5qcyIsIndlYnBhY2s6Ly9zcWwyYnVpbGRlci5naXRodWIuaW8vLi9zcmMvc3R5bGUuY3NzIiwid2VicGFjazovL3NxbDJidWlsZGVyLmdpdGh1Yi5pby8uL3NyYy9pbmRleC5qcyIsIndlYnBhY2s6Ly9zcWwyYnVpbGRlci5naXRodWIuaW8vLi9zcmMvc3R5bGUuY3NzPzcxNjMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNsYXNzIENvbnZlcnRlclxue1xuICAgIGNvbnN0cnVjdG9yKGFzdCwgcGFyZW50ID0gbnVsbCkge1xuICAgICAgICB0aGlzLmFzdCA9IGFzdDtcbiAgICAgICAgdGhpcy50YWJsZV9uYW1lX2J5X2FsaWFzID0ge307XG4gICAgICAgIHRoaXMucGFyZW50ID0gcGFyZW50O1xuICAgIH1cblxuICAgIHJ1bihuZWVkX2FwcGVuZF9nZXRfc3VmZml4ID0gdHJ1ZSkge1xuICAgICAgICBsZXQgc2VjdGlvbnMgPSBbXVxuXG4gICAgICAgIGxldCBmcm9tX2l0ZW0gPSB0aGlzLmFzdC5ib2R5LlNlbGVjdC5mcm9tWzBdO1xuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0ucmVsYXRpb24sICdUYWJsZScpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZU1haW5UYWJsZVNlY3Rpb24oZnJvbV9pdGVtKSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLnJlbGF0aW9uLCAnRGVyaXZlZCcpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZUZyb21TdWJTZWN0aW9uKCdEQjo6cXVlcnkoKS0+ZnJvbVN1YicpLCBmcm9tX2l0ZW0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgcmVsYXRpb24gdHlwZSc7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgam9pbl9zZWN0aW9uID0gJyc7XG5cbiAgICAgICAgLy8gUmVzb2x2ZSAnam9pbicgc2VjdGlvbiBiZWZvcmUgJ3doZXJlJyBzZWN0aW9uLCBiZWNhdXNlIG5lZWQgZmluZCBqb2luZWQgdGFibGUgYWxpYXNcbiAgICAgICAgaWYgKHRoaXMuaGFzSm9pblNlY3Rpb24oZnJvbV9pdGVtKSkge1xuICAgICAgICAgICAgam9pbl9zZWN0aW9uID0gdGhpcy5yZXNvbHZlSm9pblNlY3Rpb24oZnJvbV9pdGVtKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEhhcyBjcm9zcyBqb2luXG4gICAgICAgIGlmICh0aGlzLmFzdC5ib2R5LlNlbGVjdC5mcm9tLnNsaWNlKDEpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHNlY3Rpb25zID0gc2VjdGlvbnMuY29uY2F0KHRoaXMucmVzb2x2ZUNyb3NzSm9pblNlY3Rpb24odGhpcy5hc3QuYm9keS5TZWxlY3QuZnJvbS5zbGljZSgxKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVTZWxlY3RTZWN0aW9uKCkpXG5cbiAgICAgICAgaWYgKGpvaW5fc2VjdGlvbiAhPT0gJycpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2goam9pbl9zZWN0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdC5ib2R5LlNlbGVjdCwgJ3NlbGVjdGlvbicpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZVdoZXJlU2VjdGlvbih0aGlzLmFzdC5ib2R5LlNlbGVjdC5zZWxlY3Rpb24pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdC5ib2R5LlNlbGVjdCwgJ2dyb3VwX2J5JykgJiYgdGhpcy5hc3QuYm9keS5TZWxlY3QuZ3JvdXBfYnkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVHcm91cEJ5U2VjdGlvbigpKTtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LmJvZHkuU2VsZWN0LCAnaGF2aW5nJykpIHtcbiAgICAgICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZUhhdmluZ1NlY3Rpb24oKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QsICdvcmRlcl9ieScpICYmIHRoaXMuYXN0Lm9yZGVyX2J5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlT3JkZXJCeVNlY3Rpb24oKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QsICdsaW1pdCcpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKCdsaW1pdCgnICsgdGhpcy5hc3QubGltaXQuVmFsdWUuTnVtYmVyWzBdICsgJyknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdCwgJ29mZnNldCcpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKCdvZmZzZXQoJyArIHRoaXMuYXN0Lm9mZnNldC52YWx1ZS5WYWx1ZS5OdW1iZXJbMF0gKyAnKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5lZWRfYXBwZW5kX2dldF9zdWZmaXgpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2goJ2dldCgpOycpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNlY3Rpb25zLmpvaW4oJ1xcbi0+Jyk7XG4gICAgfVxuXG4gICAgcmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUocmVsYXRpb25fbm9kZSkge1xuICAgICAgICAgICAgbGV0IHRhYmxlX25hbWUgPSByZWxhdGlvbl9ub2RlLlRhYmxlLm5hbWVbMF0udmFsdWU7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChyZWxhdGlvbl9ub2RlLlRhYmxlLCAnYWxpYXMnKSkge1xuICAgICAgICAgICAgICAgIHRoaXMudGFibGVfbmFtZV9ieV9hbGlhc1tyZWxhdGlvbl9ub2RlLlRhYmxlLmFsaWFzLm5hbWUudmFsdWVdID0gdGFibGVfbmFtZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHF1b3RlKHRhYmxlX25hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlTWFpblRhYmxlU2VjdGlvbihmcm9tX2l0ZW0pIHtcbiAgICAgICAgcmV0dXJuICdEQjo6dGFibGUoJyArIHRoaXMucmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUoZnJvbV9pdGVtLnJlbGF0aW9uKSArICcpJztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZUZyb21TdWJTZWN0aW9uKHByZWZpeCwgZnJvbV9pdGVtKSB7XG4gICAgICAgIHJldHVybiBwcmVmaXggKyAnKGZ1bmN0aW9uICgkcXVlcnkpIHtcXG4nXG4gICAgICAgICAgICArICdcXHQnICsgYWRkVGFiVG9FdmVyeUxpbmUoKG5ldyBDb252ZXJ0ZXIoZnJvbV9pdGVtLnJlbGF0aW9uLkRlcml2ZWQuc3VicXVlcnksIHRoaXMpLnJ1bihmYWxzZSkpLnJlcGxhY2UoJ0RCOjp0YWJsZScsICckcXVlcnktPmZyb20nKSwgMikgKyAnO1xcbidcbiAgICAgICAgICAgICsgJ30sJyArIHF1b3RlKGZyb21faXRlbS5yZWxhdGlvbi5EZXJpdmVkLmFsaWFzLm5hbWUudmFsdWUpICsgJyknO1xuICAgIH1cblxuICAgIHJlc29sdmVXaGVyZVNlY3Rpb24oc2VsZWN0aW9uX25vZGUpIHtcbiAgICAgICAgbGV0IGNvbmRpdGlvbl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChzZWxlY3Rpb25fbm9kZSk7XG4gICAgICAgIGxldCBjb25kaXRpb24gPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qoc2VsZWN0aW9uX25vZGUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzLnByZXBhcmVDb25kaXRpb25zKGNvbmRpdGlvbl90eXBlLCBjb25kaXRpb24sICcnLCAnd2hlcmUnKS5qb2luKCdcXG4tPicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjb25kaXRpb25fdHlwZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjb25kaXRpb25cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3Agb25lIG9mIFsnJywgJ0FuZCcsICdPciddXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1ldGhvZF9uYW1lXG4gICAgICogQHJldHVybiB7c3RyaW5nW119XG4gICAgICovXG4gICAgcHJlcGFyZUNvbmRpdGlvbnMoY29uZGl0aW9uX3R5cGUsIGNvbmRpdGlvbiwgb3AsIG1ldGhvZF9uYW1lKSB7XG4gICAgICAgIGxldCBjb25kaXRpb25zID0gW107XG5cbiAgICAgICAgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnSXNOdWxsJyB8fCBjb25kaXRpb25fdHlwZSA9PT0gJ0lzTm90TnVsbCcpIHtcbiAgICAgICAgICAgIGxldCBtZXRob2RfbmFtZSA9IGNvbmRpdGlvbl90eXBlID09PSAnSXNOdWxsJyA/ICd3aGVyZU51bGwnIDogJ3doZXJlTm90TnVsbCc7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJygnICsgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbikpICsgJyknKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0luTGlzdCcpIHtcbiAgICAgICAgICAgIGxldCBjb2x1bW4gPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpKTtcbiAgICAgICAgICAgIGxldCBsaXN0ID0gY29uZGl0aW9uLmxpc3QubWFwKChpKSA9PiB0aGlzLnJlc29sdmVWYWx1ZShpLlZhbHVlKSk7XG5cbiAgICAgICAgICAgIGxldCBtZXRob2RfbmFtZSA9IGNvbmRpdGlvbi5uZWdhdGVkID8gJ3doZXJlTm90SW4nIDogJ3doZXJlSW4nO1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoJyArIGNvbHVtbiArICcsJyArICdbJyArIGxpc3Quam9pbignLCAnKSArICddKScpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnTmVzdGVkJykge1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICAgIHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoZnVuY3Rpb24gKCRxdWVyeSkge1xcbidcbiAgICAgICAgICAgICAgICArICdcXHQkcXVlcnktPicgKyAgYWRkVGFiVG9FdmVyeUxpbmUodGhpcy5yZXNvbHZlV2hlcmVTZWN0aW9uKGNvbmRpdGlvbiksIDIpICsgJztcXG59KSdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdCaW5hcnlPcCcpIHtcbiAgICAgICAgICAgIGlmIChjb25kaXRpb24ub3AgPT09ICdBbmQnIHx8IGNvbmRpdGlvbi5vcCA9PT0gJ09yJykge1xuICAgICAgICAgICAgICAgIGxldCBsZWZ0X2NvbmRpdGlvbl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChjb25kaXRpb24ubGVmdCk7XG4gICAgICAgICAgICAgICAgbGV0IGxlZnRfY29uZGl0aW9uID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5sZWZ0KTtcbiAgICAgICAgICAgICAgICBjb25kaXRpb25zID0gY29uZGl0aW9ucy5jb25jYXQodGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhsZWZ0X2NvbmRpdGlvbl90eXBlLCBsZWZ0X2NvbmRpdGlvbiwgb3AsIG1ldGhvZF9uYW1lKSk7XG5cbiAgICAgICAgICAgICAgICBsZXQgcmlnaHRfY29uZGl0aW9uX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGNvbmRpdGlvbi5yaWdodCk7XG4gICAgICAgICAgICAgICAgbGV0IHJpZ2h0X2NvbmRpdGlvbiA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24ucmlnaHQpO1xuICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMgPSBjb25kaXRpb25zLmNvbmNhdCh0aGlzLnByZXBhcmVDb25kaXRpb25zKHJpZ2h0X2NvbmRpdGlvbl90eXBlLCByaWdodF9jb25kaXRpb24sIGNvbmRpdGlvbi5vcCwgbWV0aG9kX25hbWUpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsZXQgbGVmdCA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24ubGVmdCkpO1xuICAgICAgICAgICAgICAgIGxldCByaWdodDtcblxuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChjb25kaXRpb24ucmlnaHQsICdJZGVudGlmaWVyJywgJ0NvbXBvdW5kSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5yaWdodCkpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXRob2RfbmFtZS5pbmNsdWRlcygnd2hlcmUnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSAnREI6OnJhdygnICsgcmlnaHQgKyAnKSc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGNvbmRpdGlvbi5yaWdodCwgJ1ZhbHVlJykpIHtcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kX25hbWUgPSAnd2hlcmUnO1xuICAgICAgICAgICAgICAgICAgICByaWdodCA9IHRoaXMucmVzb2x2ZVZhbHVlKGNvbmRpdGlvbi5yaWdodC5WYWx1ZSlcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGNvbmRpdGlvbi5yaWdodCwgJ1N1YnF1ZXJ5JykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSAnZnVuY3Rpb24oJHF1ZXJ5KSB7XFxuJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnXFx0JyArIGFkZFRhYlRvRXZlcnlMaW5lKChuZXcgQ29udmVydGVyKGNvbmRpdGlvbi5yaWdodC5TdWJxdWVyeSwgdGhpcykucnVuKGZhbHNlKSkucmVwbGFjZSgnREI6OnRhYmxlJywgJyRxdWVyeS0+ZnJvbScpLCAyKSArICc7XFxuJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnfSdcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGNvbmRpdGlvbi5yaWdodCwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSAnREI6OnJhdygnICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShjb25kaXRpb24ucmlnaHQuRnVuY3Rpb24pICsgJyknO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGNvbmRpdGlvbi5yaWdodCB0eXBlOicgKyBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGNvbmRpdGlvbi5yaWdodCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoJyArIGxlZnQgKyAnLCcgKyBxdW90ZSh0aGlzLnRyYW5zZm9ybUJpbmFyeU9wKGNvbmRpdGlvbi5vcCkpICsgJywnICsgcmlnaHQgKyAnKScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnRXhpc3RzJykge1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICAgIHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsICd3aGVyZUV4aXN0cycpICsgJyhmdW5jdGlvbiAoJHF1ZXJ5KSB7XFxuJyArXG4gICAgICAgICAgICAgICAgJ1xcdCcgKyAgYWRkVGFiVG9FdmVyeUxpbmUoKG5ldyBDb252ZXJ0ZXIoY29uZGl0aW9uLCB0aGlzKSkucnVuKGZhbHNlKSwgMikucmVwbGFjZSgnREI6OnRhYmxlJywgJyRxdWVyeS0+ZnJvbScpICsgJztcXG4nICtcbiAgICAgICAgICAgICAgICAnfSdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdCZXR3ZWVuJykge1xuICAgICAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gY29uZGl0aW9uLm5lZ2F0ZWQgPT09IHRydWUgPyAnd2hlcmVOb3RCZXR3ZWVuJyA6ICd3aGVyZUJldHdlZW4nO1xuXG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2goXG4gICAgICAgICAgICAgIHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoJ1xuICAgICAgICAgICAgICArIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24uZXhwcikpICsgJywnXG4gICAgICAgICAgICAgICsgJ1snICsgdGhpcy5yZXNvbHZlVmFsdWUoY29uZGl0aW9uLmxvdy5WYWx1ZSkgKyAnLCcgKyB0aGlzLnJlc29sdmVWYWx1ZShjb25kaXRpb24uaGlnaC5WYWx1ZSkgKyAnXSknXG4gICAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnSW5TdWJxdWVyeScpIHtcbiAgICAgICAgICAgIGxldCBtZXRob2RfbmFtZSA9IGNvbmRpdGlvbi5uZWdhdGVkID09PSB0cnVlID8gJ3doZXJlTm90SW4nIDogJ3doZXJlSW4nO1xuXG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2goXG4gICAgICAgICAgICAgIHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKVxuICAgICAgICAgICAgICArICcoJyArIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24uZXhwcikpICsgJywnICsgJyhmdW5jdGlvbiAoJHF1ZXJ5KSB7XFxuJ1xuICAgICAgICAgICAgICArICdcXHQnICsgYWRkVGFiVG9FdmVyeUxpbmUoKG5ldyBDb252ZXJ0ZXIoY29uZGl0aW9uLnN1YnF1ZXJ5LCB0aGlzKSkucnVuKGZhbHNlKSwgMikucmVwbGFjZSgnREI6OnRhYmxlJywgJyRxdWVyeS0+ZnJvbScpICsgJztcXG4nXG4gICAgICAgICAgICAgICsgJ30nXG4gICAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnRnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJyhEQjo6cmF3KFwiJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoY29uZGl0aW9uLCBmYWxzZSkgKyAnXCIpKScpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnVW5hcnlPcCcpIHtcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLnByZXBhcmVDb25kaXRpb25zKGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpLCBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpLCBvcCwgbWV0aG9kX25hbWUpWzBdLnJlcGxhY2UoL3doZXJlL2ksICd3aGVyZScgKyBjb25kaXRpb24ub3ApKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGNvbmRpdGlvbiB0eXBlIFsnICsgY29uZGl0aW9uX3R5cGUgKyAnXSc7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY29uZGl0aW9ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gb3BcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgdHJhbnNmb3JtQmluYXJ5T3Aob3ApIHtcbiAgICAgICAgbGV0IG9wZXJhdG9yX2J5X29wID0ge1xuICAgICAgICAgICAgJ0VxJzogJz0nLFxuICAgICAgICAgICAgJ0d0JzogJz4nLFxuICAgICAgICAgICAgJ0d0RXEnOiAnPj0nLFxuICAgICAgICAgICAgJ0x0JzogJzwnLFxuICAgICAgICAgICAgJ0x0RXEnOiAnPCcsXG4gICAgICAgICAgICAnTm90RXEnOiAnIT0nLFxuICAgICAgICAgICAgJ0xpa2UnOiAnbGlrZScsXG4gICAgICAgICAgICAnTWludXMnOiAnLScsXG4gICAgICAgICAgICAnUGx1cyc6ICcrJyxcbiAgICAgICAgICAgICdNdWx0aXBseSc6ICcqJyxcbiAgICAgICAgICAgICdEaXZpZGUnOiAnLydcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gb3BlcmF0b3JfYnlfb3Bbb3BdO1xuICAgIH1cblxuICAgIGFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkge1xuICAgICAgICBpZiAob3AgPT09ICcnIHx8IG9wID09PSAnQW5kJykge1xuICAgICAgICAgICAgcmV0dXJuIG1ldGhvZF9uYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9wLnRvTG93ZXJDYXNlKCkgKyBjYXBpdGFsaXplRmlyc3RMZXR0ZXIobWV0aG9kX25hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlU2VsZWN0U2VjdGlvbigpIHtcbiAgICAgICAgbGV0IHJlcyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0X2l0ZW0gb2YgdGhpcy5hc3QuYm9keS5TZWxlY3QucHJvamVjdGlvbikge1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHNlbGVjdF9pdGVtLCAnRXhwcldpdGhBbGlhcycpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGFsaWFzID0gc2VsZWN0X2l0ZW0uRXhwcldpdGhBbGlhcy5hbGlhcy52YWx1ZTtcbiAgICAgICAgICAgICAgICByZXMucHVzaCh0aGlzLnJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbShzZWxlY3RfaXRlbS5FeHByV2l0aEFsaWFzLmV4cHIsIGFsaWFzKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHNlbGVjdF9pdGVtLCAnVW5uYW1lZEV4cHInKSkge1xuICAgICAgICAgICAgICAgIHJlcy5wdXNoKHRoaXMucmVzb2x2ZVNlbGVjdFNlY3Rpb25JdGVtKHNlbGVjdF9pdGVtLlVubmFtZWRFeHByKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNlbGVjdF9pdGVtID09PSAnV2lsZGNhcmQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLnB1c2gocXVvdGUoJyonKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHNlbGVjdF9pdGVtLCAnUXVhbGlmaWVkV2lsZGNhcmQnKSkge1xuICAgICAgICAgICAgICAgIHJlcy5wdXNoKHF1b3RlKHRoaXMuZ2V0QWN0dWFsVGFibGVOYW1lKHNlbGVjdF9pdGVtLlF1YWxpZmllZFdpbGRjYXJkWzBdLnZhbHVlKSArICcuKicpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBzZWxlY3QgaXRlbSBbJyArIE9iamVjdC5rZXlzKHNlbGVjdF9pdGVtKVswXSArICddJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAnc2VsZWN0KCcgKyByZXMuam9pbignLCAnKSArICcpJztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gc2VsZWN0X2l0ZW1cbiAgICAgKiBAcGFyYW0gYWxpYXNcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZVNlbGVjdFNlY3Rpb25JdGVtKHNlbGVjdF9pdGVtLCBhbGlhcyA9IG51bGwpIHtcbiAgICAgICAgYXNzZXJ0KGlzVW5kZWZpbmVkT3JOdWxsKHNlbGVjdF9pdGVtKSA9PT0gZmFsc2UsICdzZWxlY3RfaXRlbSBtdXN0IG5vdCBiZSB1bmRlZmluZWQgb3IgbnVsbCcpO1xuXG4gICAgICAgIGxldCBpdGVtO1xuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoc2VsZWN0X2l0ZW0sICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICBpdGVtID0gJ0RCOjpyYXcoXCInICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShzZWxlY3RfaXRlbS5GdW5jdGlvbik7XG5cbiAgICAgICAgICAgIGlmIChhbGlhcyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGl0ZW0gPSBpdGVtICsgJyBhcyAnICsgYWxpYXMgKyAnXCIpJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGl0ZW07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpdGVtID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KHNlbGVjdF9pdGVtKSwgZmFsc2UpO1xuXG4gICAgICAgICAgICBpZiAoYWxpYXMgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpdGVtID0gaXRlbSArICcgYXMgJyArIGFsaWFzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcXVvdGUoaXRlbSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwYXJzZUZ1bmN0aW9uTm9kZShmdW5jdGlvbl9ub2RlLCBuZWVkX3F1b3RlID0gdHJ1ZSkge1xuICAgICAgICBsZXQgZnVuY3Rpb25fbmFtZSA9IGZ1bmN0aW9uX25vZGUubmFtZVswXS52YWx1ZTtcblxuICAgICAgICBpZiAobmVlZF9xdW90ZSkge1xuICAgICAgICAgICAgZnVuY3Rpb25fbmFtZSA9IHF1b3RlKGZ1bmN0aW9uX25hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHJlcyA9IGZ1bmN0aW9uX25hbWUgKyAnKCc7XG4gICAgICAgIGxldCBhcmdzID0gZnVuY3Rpb25fbm9kZS5hcmdzO1xuICAgICAgICBsZXQgYXJnX2NvdW50ID0gYXJncy5sZW5ndGg7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmdfY291bnQ7IGkrKykge1xuICAgICAgICAgICAgbGV0IGFyZyA9IGFyZ3NbaV07XG5cbiAgICAgICAgICAgIGlmIChhcmcuVW5uYW1lZCA9PT0gJ1dpbGRjYXJkJykge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArICcqJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ1ZhbHVlJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyB0aGlzLnJlc29sdmVWYWx1ZShhcmcuVW5uYW1lZC5FeHByLlZhbHVlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0lkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIGFyZy5Vbm5hbWVkLkV4cHIuSWRlbnRpZmllci52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0NvbXBvdW5kSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oYXJnLlVubmFtZWQuRXhwci5Db21wb3VuZElkZW50aWZpZXIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnTmVzdGVkJykpIHsgLy8gZS5nLiBDT1VOVChESVNUSU5DVCgnaWQnKSlcbiAgICAgICAgICAgICAgICBsZXQgYXJnX2NvbHVtbiA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChhcmcuVW5uYW1lZC5FeHByLk5lc3RlZCkpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGZ1bmN0aW9uX25vZGUuZGlzdGluY3QgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgYXJnX2NvbHVtbiA9ICdESVNUSU5DVCgnICsgYXJnX2NvbHVtbiArICcpJztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyBhcmdfY29sdW1uO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoYXJnLlVubmFtZWQuRXhwci5GdW5jdGlvbiwgZmFsc2UpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnQmluYXJ5T3AnKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIHRoaXMucGFyc2VCaW5hcnlPcE5vZGUoYXJnLlVubmFtZWQuRXhwci5CaW5hcnlPcCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdVbmFyeU9wJykpIHtcbiAgICAgICAgICAgICAgICAvLyB0b2RvXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdDYXNlJykpIHtcbiAgICAgICAgICAgICAgICAvLyB0b2RvXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGFyZyB0eXBlOicgKyBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGFyZy5Vbm5hbWVkLkV4cHIpO1xuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIGlmIChpICE9PSBhcmdfY291bnQgLSAxKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgJywgJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJlcyA9IHJlcyArICcpJztcblxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgaGFzSm9pblNlY3Rpb24oZnJvbV9pdGVtKSB7XG4gICAgICAgIHJldHVybiBwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0sICdqb2lucycpICYmIGZyb21faXRlbS5qb2lucy5sZW5ndGggPiAwO1xuICAgIH1cblxuICAgIHBhcnNlQmluYXJ5T3BQYXJ0aWFsKGxlZnRfb3JfcmlnaHQpIHtcbiAgICAgICAgbGV0IHJlcztcblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIHJlcyA9IHF1b3RlKHRoaXMucGFyc2VGdW5jdGlvbk5vZGUobGVmdF9vcl9yaWdodC5GdW5jdGlvbikpO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdJZGVudGlmaWVyJywgJ0NvbXBvdW5kSWRlbnRpZmllcicpKXtcbiAgICAgICAgICAgIHJlcyA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChsZWZ0X29yX3JpZ2h0KSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ1ZhbHVlJykpIHtcbiAgICAgICAgICAgIHJlcyA9IHRoaXMucmVzb2x2ZVZhbHVlKGxlZnRfb3JfcmlnaHQuVmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdCaW5hcnlPcCcpKSB7XG4gICAgICAgICAgICByZXMgPSB0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKGxlZnRfb3JfcmlnaHQuQmluYXJ5T3ApO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdTdWJxdWVyeScpKSB7XG4gICAgICAgICAgICAvLyB0b2RvXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCB0eXBlIGluIGJpbmFyeSBvcCBsZWZ0IG9yIHJpZ2h0Lic7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuICAgIHBhcnNlQmluYXJ5T3BOb2RlKGJpbmFyeV9vcCwgc2VwYXJhdG9yID0gJyAnKSB7XG4gICAgICAgIGxldCBsZWZ0ID0gdGhpcy5wYXJzZUJpbmFyeU9wUGFydGlhbChiaW5hcnlfb3AubGVmdCk7XG4gICAgICAgIGxldCBvcCA9IHF1b3RlKHRoaXMudHJhbnNmb3JtQmluYXJ5T3AoYmluYXJ5X29wLm9wKSk7XG4gICAgICAgIGxldCByaWdodCA9IHRoaXMucGFyc2VCaW5hcnlPcFBhcnRpYWwoYmluYXJ5X29wLnJpZ2h0KTtcblxuICAgICAgICByZXR1cm4gW2xlZnQsIG9wLCByaWdodF0uam9pbihzZXBhcmF0b3IpO1xuICAgIH1cblxuICAgIHByZXBhcmVKb2lucyhmcm9tX2l0ZW0pIHtcbiAgICAgICAgbGV0IGpvaW5zID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBqb2luIG9mIGZyb21faXRlbS5qb2lucykge1xuICAgICAgICAgICAgbGV0IGpvaW5fb3BlcmF0b3JfdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qoam9pbi5qb2luX29wZXJhdG9yKTtcbiAgICAgICAgICAgIGxldCBqb2luX21ldGhvZCA9IHtcbiAgICAgICAgICAgICAgICAnSW5uZXInOiAnam9pbicsXG4gICAgICAgICAgICAgICAgJ0xlZnRPdXRlcic6ICdsZWZ0Sm9pbicsXG4gICAgICAgICAgICAgICAgJ1JpZ2h0T3V0ZXInOiAncmlnaHRKb2luJyxcbiAgICAgICAgICAgIH1bam9pbl9vcGVyYXRvcl90eXBlXTtcbiAgICAgICAgICAgIGxldCBqb2luX29wZXJhdG9yID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGpvaW4uam9pbl9vcGVyYXRvcik7XG4gICAgICAgICAgICBsZXQgY29uZGl0aW9uX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGpvaW5fb3BlcmF0b3IuT24pO1xuICAgICAgICAgICAgbGV0IGNvbmRpdGlvbiA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChqb2luX29wZXJhdG9yLk9uKTtcbiAgICAgICAgICAgIGxldCBjb25kaXRpb25zID0gdGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhjb25kaXRpb25fdHlwZSwgY29uZGl0aW9uLCAnJywgJ29uJyk7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChqb2luLnJlbGF0aW9uLCAnRGVyaXZlZCcpKSB7IC8vIGpvaW5lZCBzZWN0aW9uIGlzIHN1Yi1xdWVyeVxuICAgICAgICAgICAgICAgIGxldCBzdWJfcXVlcnlfc3FsID0gbmV3IENvbnZlcnRlcihqb2luLnJlbGF0aW9uLkRlcml2ZWQuc3VicXVlcnksIHRoaXMpLnJ1bihmYWxzZSk7XG4gICAgICAgICAgICAgICAgbGV0IHN1Yl9xdWVyeV9hbGlhcyA9IGpvaW4ucmVsYXRpb24uRGVyaXZlZC5hbGlhcy5uYW1lLnZhbHVlO1xuICAgICAgICAgICAgICAgIGpvaW5zLnB1c2goam9pbl9tZXRob2QgKyAnKERCOjpyYXcoXCInICsgYWRkVGFiVG9FdmVyeUxpbmUoc3ViX3F1ZXJ5X3NxbCkgKyAnXCIpIGFzICdcbiAgICAgICAgICAgICAgICAgICAgKyBzdWJfcXVlcnlfYWxpYXMgKyAnKSwgZnVuY3Rpb24oJGpvaW4pIHtcXG5cXHQnXG4gICAgICAgICAgICAgICAgICAgICsgJyRqb2luLT4nICsgYWRkVGFiVG9FdmVyeUxpbmUoY29uZGl0aW9ucy5qb2luKCdcXG4tPicpICsgJzsnLCAyKVxuICAgICAgICAgICAgICAgICAgICArICdcXG59Jyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGpvaW4ucmVsYXRpb24sICdUYWJsZScpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGpvaW5lZF90YWJsZSA9IHRoaXMucmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUoam9pbi5yZWxhdGlvbik7XG5cbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9ucy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGpvaW5fb3BlcmF0b3IuT24sICdCaW5hcnlPcCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBqb2lucy5wdXNoKGpvaW5fbWV0aG9kICsgJygnICsgam9pbmVkX3RhYmxlICsgJywnICsgdGhpcy5wYXJzZUJpbmFyeU9wTm9kZShqb2luX29wZXJhdG9yLk9uLkJpbmFyeU9wLCAnLCcpICsgJyknKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChqb2luX29wZXJhdG9yLk9uLCAnTmVzdGVkJykpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGNvbmRpdGlvbnMgPSB0aGlzLnByZXBhcmVDb25kaXRpb25zKCdOZXN0ZWQnLCBqb2luX29wZXJhdG9yLk9uLk5lc3RlZCwgJycsICdvbicpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBqb2lucy5wdXNoKGNvbmRpdGlvbnNbMF0pO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgb24gdHlwZSc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBqb2lucy5wdXNoKGpvaW5fbWV0aG9kICsgJygnICsgam9pbmVkX3RhYmxlICsgJywnXG4gICAgICAgICAgICAgICAgICAgICAgICArICdmdW5jdGlvbigkam9pbikge1xcblxcdCdcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJyRqb2luLT4nICsgYWRkVGFiVG9FdmVyeUxpbmUoY29uZGl0aW9ucy5qb2luKCdcXG4tPicpKSArICc7J1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnXFxufSknXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBqb2luIHJlbGF0aW9uIHR5cGUnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGpvaW5zO1xuICAgIH1cblxuICAgIHJlc29sdmVKb2luU2VjdGlvbihmcm9tX2l0ZW0pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucHJlcGFyZUpvaW5zKGZyb21faXRlbSkuam9pbignXFxuLT4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gZnJvbV9pdGVtc1xuICAgICAqIEByZXR1cm4ge3N0cmluZ1tdfVxuICAgICAqL1xuICAgIHJlc29sdmVDcm9zc0pvaW5TZWN0aW9uKGZyb21faXRlbXMpIHtcbiAgICAgICAgbGV0IGNyb3NzX2pvaW5fc2VjdGlvbnMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGZyb21faXRlbSBvZiBmcm9tX2l0ZW1zKSB7XG4gICAgICAgICAgICBsZXQgY3Jvc3Nfam9pbl9zdHI7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0ucmVsYXRpb24sICdUYWJsZScpKSB7XG4gICAgICAgICAgICAgICAgY3Jvc3Nfam9pbl9zdHIgPSAnY3Jvc3NKb2luKCcgKyB0aGlzLnJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlKGZyb21faXRlbS5yZWxhdGlvbik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbS5yZWxhdGlvbiwgJ0Rlcml2ZWQnKSkge1xuICAgICAgICAgICAgICAgIGNyb3NzX2pvaW5fc3RyID0gdGhpcy5yZXNvbHZlRnJvbVN1YlNlY3Rpb24oJ2Nyb3NzSm9pblN1YicsIGZyb21faXRlbSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGNyb3NzIGpvaW4gcmVsYXRpb24gdHlwZSc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNyb3NzX2pvaW5fc2VjdGlvbnMucHVzaChjcm9zc19qb2luX3N0cik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY3Jvc3Nfam9pbl9zZWN0aW9ucztcbiAgICB9XG5cbiAgICByZXNvbHZlR3JvdXBCeVNlY3Rpb24oKSB7XG4gICAgICAgIGxldCBncm91cF9ieV9jb2x1bW5zID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBncm91cF9ieV9pdGVtIG9mIHRoaXMuYXN0LmJvZHkuU2VsZWN0Lmdyb3VwX2J5KSB7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZ3JvdXBfYnlfaXRlbSwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICBncm91cF9ieV9jb2x1bW5zLnB1c2goJ0RCOjpyYXcoJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoZ3JvdXBfYnlfaXRlbS5GdW5jdGlvbikgKyAnXCIpJyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZ3JvdXBfYnlfaXRlbSwgJ0lkZW50aWZpZXInLCAnQ29tcG91bmRJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICBncm91cF9ieV9jb2x1bW5zLnB1c2godGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGdyb3VwX2J5X2l0ZW0pKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGdyb3VwX2J5X2l0ZW0sICdOZXN0ZWQnKSkge1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChncm91cF9ieV9pdGVtLCAnVmFsdWUnKSkge1xuICAgICAgICAgICAgICAgIGdyb3VwX2J5X2NvbHVtbnMucHVzaCh0aGlzLnJlc29sdmVWYWx1ZShncm91cF9ieV9pdGVtLlZhbHVlKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGdyb3VwIGJ5IHR5cGU6JyArIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoZ3JvdXBfYnlfaXRlbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gJ2dyb3VwQnkoJyArIGdyb3VwX2J5X2NvbHVtbnMuam9pbignLCcpICsgJyknO1xuICAgIH1cblxuICAgIHJlc29sdmVIYXZpbmdTZWN0aW9uKCkge1xuICAgICAgICBsZXQgYmluYXJ5X29wID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KHRoaXMuYXN0LmJvZHkuU2VsZWN0LmhhdmluZywgJ0JpbmFyeU9wJyk7XG4gICAgICAgIGxldCBtZXRob2RfbmFtZSA9IHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGJpbmFyeV9vcC5sZWZ0LCAnRnVuY3Rpb24nKSA/ICdoYXZpbmdSYXcnIDogJ2hhdmluZyc7XG5cbiAgICAgICAgcmV0dXJuIG1ldGhvZF9uYW1lICsgJygnICsgdGhpcy5wYXJzZUJpbmFyeU9wTm9kZShiaW5hcnlfb3AsICcsJykgKyAnKSc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlT3JkZXJCeVNlY3Rpb24oKSB7XG4gICAgICAgIGxldCBvcmRlcl9ieXMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IG9yZGVyX2J5X2l0ZW0gb2YgdGhpcy5hc3Qub3JkZXJfYnkpIHtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChvcmRlcl9ieV9pdGVtLmV4cHIsICdCaW5hcnlPcCcpKSB7XG4gICAgICAgICAgICAgICAgb3JkZXJfYnlzLnB1c2goJ29yZGVyQnlSYXcoJyArIHF1b3RlKHRoaXMucGFyc2VCaW5hcnlPcE5vZGUob3JkZXJfYnlfaXRlbS5leHByLkJpbmFyeU9wKSkgKyAnKScpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChvcmRlcl9ieV9pdGVtLmV4cHIsICdJZGVudGlmaWVyJywgJ0NvbXBvdW5kSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgb3JkZXJfYnlzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICdvcmRlckJ5KCcgK1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qob3JkZXJfYnlfaXRlbS5leHByKSkgKyAnLCcgK1xuICAgICAgICAgICAgICAgICAgICBxdW90ZShvcmRlcl9ieV9pdGVtLmFzYyA9PT0gZmFsc2UgPyAnZGVzYyc6ICdhc2MnKSArICcpJ1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKG9yZGVyX2J5X2l0ZW0uZXhwciwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICBvcmRlcl9ieXMucHVzaCgnb3JkZXJCeVJhdyhcIicgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKG9yZGVyX2J5X2l0ZW0uZXhwci5GdW5jdGlvbikgKyAnICcgKyAob3JkZXJfYnlfaXRlbS5hc2MgPT09IGZhbHNlID8gJ2Rlc2MnOiAnYXNjJykgKyAnXCIpJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIG9yZGVyIGJ5IHR5cGU6JyArIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qob3JkZXJfYnlfaXRlbS5leHByKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvcmRlcl9ieXMuam9pbignXFxuLT4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gdmFsdWVOb2RlXG4gICAgICogQHJldHVybiB7c3RyaW5nfCp9XG4gICAgICovXG4gICAgcmVzb2x2ZVZhbHVlKHZhbHVlTm9kZSkge1xuICAgICAgICBpZiAoaXNTdHJpbmcodmFsdWVOb2RlKSAmJiB2YWx1ZU5vZGUudG9Mb3dlckNhc2UoKSA9PT0gJ251bGwnKSB7XG4gICAgICAgICAgICByZXR1cm4gJ251bGwnO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHZhbHVlID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KHZhbHVlTm9kZSk7XG4gICAgICAgIGxldCB2YWx1ZV90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdCh2YWx1ZU5vZGUpO1xuXG4gICAgICAgIGlmICh2YWx1ZV90eXBlID09PSAnU2luZ2xlUXVvdGVkU3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIHF1b3RlKHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZV90eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlWzBdO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlX3R5cGUgPT09ICdDb21wb3VuZElkZW50aWZpZXInIHx8IHZhbHVlX3R5cGUgPT09ICdJZGVudGlmaWVyJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZV90eXBlID09PSAnQm9vbGVhbicpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBhcmcgdmFsdWUgdHlwZTonICsgdmFsdWVfdHlwZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldEFjdHVhbFRhYmxlTmFtZSh0YWJsZV9uYW1lX29yX2FsaWFzKSB7XG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLnRhYmxlX25hbWVfYnlfYWxpYXMsIHRhYmxlX25hbWVfb3JfYWxpYXMpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50YWJsZV9uYW1lX2J5X2FsaWFzW3RhYmxlX25hbWVfb3JfYWxpYXNdO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucGFyZW50ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5nZXRBY3R1YWxUYWJsZU5hbWUodGFibGVfbmFtZV9vcl9hbGlhcyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGFibGVfbmFtZV9vcl9hbGlhcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gaWRlbnRpZmllclxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gbmVlZF9xdW90ZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBjb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oaWRlbnRpZmllciwgbmVlZF9xdW90ZSA9IHRydWUpIHtcbiAgICAgICAgbGV0IHZhbHVlcyA9IFtpZGVudGlmaWVyXS5mbGF0KCkubWFwKChpKSA9PiBpLnZhbHVlKTtcbiAgICAgICAgbGV0IHRhYmxlX25hbWVfb3JfYWxpYXMgPSB2YWx1ZXNbMF07XG5cbiAgICAgICAgLy8gRmlyc3QgaW5kZXggYWx3YXlzIGlzIHRhYmxlIG5hbWUgb3IgYWxpYXMsIGNoYW5nZSBpdCB0byBhY3R1YWwgdGFibGUgbmFtZS5cbiAgICAgICAgdmFsdWVzWzBdID0gdGhpcy5nZXRBY3R1YWxUYWJsZU5hbWUodGFibGVfbmFtZV9vcl9hbGlhcyk7XG5cbiAgICAgICAgbGV0IHJlcyA9IHZhbHVlcy5qb2luKCcuJyk7XG5cbiAgICAgICAgaWYgKG5lZWRfcXVvdGUpIHtcbiAgICAgICAgICAgIHJlcyA9IHF1b3RlKHJlcyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNvbmRpdGlvblxuICogQHBhcmFtIHtzdHJpbmd9IG1zZ1xuICovXG5mdW5jdGlvbiBhc3NlcnQoY29uZGl0aW9uLCBtc2cpIHtcbiAgICBpZiAoIWNvbmRpdGlvbikge1xuICAgICAgICB0aHJvdyBtc2c7XG4gICAgfVxufVxuXG4vKipcbiAqIEBwYXJhbSBvYmpcbiAqIEBwYXJhbSBwcm9wZXJ0eV9uYW1lc1xuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZnVuY3Rpb24gcHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwob2JqLCAuLi5wcm9wZXJ0eV9uYW1lcykge1xuICAgIHJldHVybiBwcm9wZXJ0eV9uYW1lcy5yZWR1Y2UoKGNhcnJ5LCBwcm9wZXJ0eV9uYW1lKSA9PiBjYXJyeSB8fCAob2JqLmhhc093blByb3BlcnR5KHByb3BlcnR5X25hbWUpICYmIG9ialtwcm9wZXJ0eV9uYW1lXSAhPT0gbnVsbCksIGZhbHNlKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gdmFsdWVcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIGlzU3RyaW5nKHZhbHVlKSB7XG4gICAgcmV0dXJuICB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgU3RyaW5nO1xufVxuXG5mdW5jdGlvbiBjYXBpdGFsaXplRmlyc3RMZXR0ZXIoc3RyaW5nKSB7XG4gICAgcmV0dXJuIHN0cmluZy5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHN0cmluZy5zbGljZSgxKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gdmFsdWVcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gcXVvdGUodmFsdWUpIHtcbiAgICByZXR1cm4gXCInXCIgKyB2YWx1ZSArIFwiJ1wiO1xufVxuXG4vKipcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gdW5xdW90ZSh2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bJ1wiXSsvZywgJycpO1xufVxuXG4vKipcbiAqIEBwYXJhbSBvYmpcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChvYmopIHtcbiAgICBpZiAoT2JqZWN0LmtleXMob2JqKS5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgdGhyb3cgJ1RoZSBmdW5jdGlvbiBjYW4gb25seSBiZSBjYWxsZWQgb24gb2JqZWN0IHRoYXQgaGFzIG9uZSBrZXksIG9iamVjdDogJyArIEpTT04uc3RyaW5naWZ5KG9iaik7XG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKG9iailbMF07XG59XG5cbi8qKlxuICogQHBhcmFtIG9ialxuICogQHJldHVybiB7Kn1cbiAqL1xuZnVuY3Rpb24gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KG9iaikge1xuICAgIHJldHVybiBvYmpbZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChvYmopXTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gdmFsdWVcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkT3JOdWxsKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcgfHwgdmFsdWUgPT09IG51bGw7XG59XG5cbi8qKlxuICogQHBhcmFtIHN0clxuICogQHBhcmFtIHRhYl9jb3VudFxuICovXG5mdW5jdGlvbiBhZGRUYWJUb0V2ZXJ5TGluZShzdHIsIHRhYl9jb3VudCA9IDEpIHtcbiAgICBsZXQgc2VwYXJhdG9yID0gJ1xcbic7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhYl9jb3VudDsgaSsrKSB7XG4gICAgICAgIHNlcGFyYXRvciA9IHNlcGFyYXRvciArICdcXHQnO1xuICAgIH1cblxuICAgIHJldHVybiBzdHIuc3BsaXQoJ1xcbicpLmpvaW4oc2VwYXJhdG9yKTtcbn1cblxuIiwiLy8gSW1wb3J0c1xuaW1wb3J0IF9fX0NTU19MT0FERVJfQVBJX1NPVVJDRU1BUF9JTVBPUlRfX18gZnJvbSBcIi4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvcnVudGltZS9zb3VyY2VNYXBzLmpzXCI7XG5pbXBvcnQgX19fQ1NTX0xPQURFUl9BUElfSU1QT1JUX19fIGZyb20gXCIuLi9ub2RlX21vZHVsZXMvY3NzLWxvYWRlci9kaXN0L3J1bnRpbWUvYXBpLmpzXCI7XG5pbXBvcnQgX19fQ1NTX0xPQURFUl9HRVRfVVJMX0lNUE9SVF9fXyBmcm9tIFwiLi4vbm9kZV9tb2R1bGVzL2Nzcy1sb2FkZXIvZGlzdC9ydW50aW1lL2dldFVybC5qc1wiO1xudmFyIF9fX0NTU19MT0FERVJfVVJMX0lNUE9SVF8wX19fID0gbmV3IFVSTChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwlM0Nzdmcgd2lkdGg9JTI3NjAlMjcgaGVpZ2h0PSUyNzYwJTI3IHZpZXdCb3g9JTI3MCAwIDYwIDYwJTI3IHhtbG5zPSUyN2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJTI3JTNFJTNDZyBmaWxsPSUyN25vbmUlMjcgZmlsbC1ydWxlPSUyN2V2ZW5vZGQlMjclM0UlM0NnIGZpbGw9JTI3JTIzZmZmZmZmJTI3IGZpbGwtb3BhY2l0eT0lMjcwLjA1JTI3JTNFJTNDcGF0aCBkPSUyN00zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMlY2aDRWNGgtNHpNNiAzNHYtNEg0djRIMHYyaDR2NGgydi00aDR2LTJINnpNNiA0VjBINHY0SDB2Mmg0djRoMlY2aDRWNEg2eiUyNy8lM0UlM0MvZyUzRSUzQy9nJTNFJTNDL3N2ZyUzRVwiLCBpbXBvcnQubWV0YS51cmwpO1xudmFyIF9fX0NTU19MT0FERVJfRVhQT1JUX19fID0gX19fQ1NTX0xPQURFUl9BUElfSU1QT1JUX19fKF9fX0NTU19MT0FERVJfQVBJX1NPVVJDRU1BUF9JTVBPUlRfX18pO1xudmFyIF9fX0NTU19MT0FERVJfVVJMX1JFUExBQ0VNRU5UXzBfX18gPSBfX19DU1NfTE9BREVSX0dFVF9VUkxfSU1QT1JUX19fKF9fX0NTU19MT0FERVJfVVJMX0lNUE9SVF8wX19fKTtcbi8vIE1vZHVsZVxuX19fQ1NTX0xPQURFUl9FWFBPUlRfX18ucHVzaChbbW9kdWxlLmlkLCBgLyogTW9kZXJuIFNRTCB0byBMYXJhdmVsIEJ1aWxkZXIgLSBDdXN0b20gU3R5bGVzICovXG5cbjpyb290IHtcbiAgLS1wcmltYXJ5LWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjY3ZWVhIDAlLCAjNzY0YmEyIDEwMCUpO1xuICAtLXNlY29uZGFyeS1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2YwOTNmYiAwJSwgI2Y1NTc2YyAxMDAlKTtcbiAgLS1zdWNjZXNzLWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNGZhY2ZlIDAlLCAjMDBmMmZlIDEwMCUpO1xuICAtLWRhcmstYmc6ICMxYTFhMmU7XG4gIC0tY2FyZC1iZzogI2ZmZmZmZjtcbiAgLS10ZXh0LXByaW1hcnk6ICMyZDM3NDg7XG4gIC0tdGV4dC1zZWNvbmRhcnk6ICM3MTgwOTY7XG4gIC0tYm9yZGVyLWNvbG9yOiAjZTJlOGYwO1xuICAtLXNoYWRvdy1zbTogMCAycHggNHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG4gIC0tc2hhZG93LW1kOiAwIDRweCA2cHggcmdiYSgwLCAwLCAwLCAwLjA3KTtcbiAgLS1zaGFkb3ctbGc6IDAgMTBweCAyNXB4IHJnYmEoMCwgMCwgMCwgMC4xKTtcbiAgLS1zaGFkb3cteGw6IDAgMjBweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC4xNSk7XG4gIC0tcmFkaXVzLXNtOiA4cHg7XG4gIC0tcmFkaXVzLW1kOiAxMnB4O1xuICAtLXJhZGl1cy1sZzogMTZweDtcbn1cblxuKiB7XG4gIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG59XG5cbmJvZHkge1xuICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCAnU2Vnb2UgVUknLCAnUm9ib3RvJywgJ094eWdlbicsICdVYnVudHUnLCAnQ2FudGFyZWxsJywgJ0ZpcmEgU2FucycsICdEcm9pZCBTYW5zJywgJ0hlbHZldGljYSBOZXVlJywgc2Fucy1zZXJpZjtcbiAgLXdlYmtpdC1mb250LXNtb290aGluZzogYW50aWFsaWFzZWQ7XG4gIC1tb3otb3N4LWZvbnQtc21vb3RoaW5nOiBncmF5c2NhbGU7XG4gIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICNmNWY3ZmEgMCUsICNjM2NmZTIgMTAwJSk7XG4gIG1pbi1oZWlnaHQ6IDEwMHZoO1xufVxuXG4vKiBIZXJvIFNlY3Rpb24gUmVkZXNpZ24gKi9cbi5oZXJvLmlzLXByaW1hcnkge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICBvdmVyZmxvdzogaGlkZGVuO1xufVxuXG4uaGVyby5pcy1wcmltYXJ5OjpiZWZvcmUge1xuICBjb250ZW50OiAnJztcbiAgcG9zaXRpb246IGFic29sdXRlO1xuICB0b3A6IDA7XG4gIGxlZnQ6IDA7XG4gIHJpZ2h0OiAwO1xuICBib3R0b206IDA7XG4gIGJhY2tncm91bmQ6IHVybCgke19fX0NTU19MT0FERVJfVVJMX1JFUExBQ0VNRU5UXzBfX199KTtcbiAgb3BhY2l0eTogMC4zO1xufVxuXG4uaGVyby1ib2R5IHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICB6LWluZGV4OiAxO1xuICBwYWRkaW5nOiAxLjVyZW0gMS41cmVtO1xufVxuXG4uaGVybyAudGl0bGUge1xuICBmb250LXNpemU6IDEuNzVyZW07XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIHRleHQtc2hhZG93OiAwIDJweCAxMHB4IHJnYmEoMCwgMCwgMCwgMC4xKTtcbiAgbGV0dGVyLXNwYWNpbmc6IC0wLjVweDtcbn1cblxuLmhlcm8gLnN1YnRpdGxlIHtcbiAgZm9udC1zaXplOiAxcmVtO1xuICBvcGFjaXR5OiAwLjk1O1xuICBtYXJnaW4tdG9wOiAwLjVyZW07XG59XG5cbi8qIE5hdmlnYXRpb24vSGVhZGVyICovXG4ubmF2LWhlYWRlciB7XG4gIHBhZGRpbmc6IDFyZW0gMnJlbTtcbiAgZGlzcGxheTogZmxleDtcbiAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXNtKTtcbn1cblxuLmdpdGh1Yi1saW5rIHtcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGdhcDogMC4yNXJlbTtcbiAgcGFkZGluZzogMC41cmVtIDAuNzVyZW07XG4gIGJhY2tncm91bmQ6IHRyYW5zcGFyZW50O1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1zbSk7XG4gIGZvbnQtd2VpZ2h0OiA0MDA7XG4gIGZvbnQtc2l6ZTogMC44NzVyZW07XG4gIHRyYW5zaXRpb246IGFsbCAwLjJzIGVhc2U7XG4gIG9wYWNpdHk6IDAuNjtcbn1cblxuLmdpdGh1Yi1saW5rOmhvdmVyIHtcbiAgb3BhY2l0eTogMC45O1xuICBjb2xvcjogdmFyKC0tdGV4dC1wcmltYXJ5KTtcbiAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjAzKTtcbn1cblxuLmdpdGh1Yi1saW5rOjpiZWZvcmUge1xuICBjb250ZW50OiAn4piFJztcbiAgZm9udC1zaXplOiAwLjg3NXJlbTtcbn1cblxuLyogTWFpbiBDb250ZW50IEFyZWEgKi9cbi5jb250ZW50LXdyYXBwZXIge1xuICBtYXgtd2lkdGg6IDE0MDBweDtcbiAgbWFyZ2luOiAwIGF1dG87XG4gIHBhZGRpbmc6IDJyZW0gMXJlbTtcbn1cblxuLyogQ29udmVydGVyIEdyaWQgLSBTaWRlIGJ5IFNpZGUgTGF5b3V0ICovXG4uY29udmVydGVyLWdyaWQge1xuICBkaXNwbGF5OiBncmlkO1xuICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmciAxZnI7XG4gIGdhcDogMnJlbTtcbiAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbiAgYWxpZ24taXRlbXM6IHN0YXJ0O1xufVxuXG4uY29udmVydGVyLWNhcmQge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLWxnKTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXhsKTtcbiAgcGFkZGluZzogMnJlbTtcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgZWFzZTtcbiAgZGlzcGxheTogZmxleDtcbiAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgaGVpZ2h0OiAxMDAlO1xufVxuXG4uY29udmVydGVyLWNhcmQ6aG92ZXIge1xuICBib3gtc2hhZG93OiAwIDI1cHggNTBweCByZ2JhKDAsIDAsIDAsIDAuMik7XG59XG5cbi8qIFNlY3Rpb24gSGVhZGVycyAqL1xuLnNlY3Rpb24taGVhZGVyIHtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjc1cmVtO1xuICBtYXJnaW4tYm90dG9tOiAxLjVyZW07XG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xufVxuXG4uc2VjdGlvbi1pY29uIHtcbiAgd2lkdGg6IDM2cHg7XG4gIGhlaWdodDogMzZweDtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xuICBjb2xvcjogd2hpdGU7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG4gIGZsZXgtc2hyaW5rOiAwO1xufVxuXG4vKiBUZXh0YXJlYSBSZWRlc2lnbiAqL1xuLnRleHRhcmVhLXdyYXBwZXIge1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIG1hcmdpbi1ib3R0b206IDEuNXJlbTtcbiAgZmxleDogMTtcbiAgZGlzcGxheTogZmxleDtcbiAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbn1cblxuLnRleHRhcmVhIHtcbiAgYm9yZGVyOiAycHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcbiAgcGFkZGluZzogMS4yNXJlbTtcbiAgZm9udC1zaXplOiAwLjk1cmVtO1xuICBmb250LWZhbWlseTogJ01vbmFjbycsICdNZW5sbycsICdVYnVudHUgTW9ubycsICdDb25zb2xhcycsICdzb3VyY2UtY29kZS1wcm8nLCBtb25vc3BhY2U7XG4gIGxpbmUtaGVpZ2h0OiAxLjY7XG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XG4gIHJlc2l6ZTogbm9uZTtcbiAgaGVpZ2h0OiA0NTBweDtcbiAgYmFja2dyb3VuZDogI2Y4ZmFmYztcbiAgd2lkdGg6IDEwMCU7XG59XG5cbi50ZXh0YXJlYTpmb2N1cyB7XG4gIG91dGxpbmU6IG5vbmU7XG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcbiAgYm94LXNoYWRvdzogMCAwIDAgM3B4IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG59XG5cbi50ZXh0YXJlYTo6cGxhY2Vob2xkZXIge1xuICBjb2xvcjogI2EwYWVjMDtcbiAgZm9udC1zdHlsZTogaXRhbGljO1xuICBmb250LXNpemU6IDAuOXJlbTtcbn1cblxuLyogQ29weSBCdXR0b24gKi9cbi5jb3B5LWJ1dHRvbiB7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiAxcmVtO1xuICByaWdodDogMXJlbTtcbiAgcGFkZGluZzogMC42MjVyZW0gMS4yNXJlbTtcbiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjk1KTtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgY3Vyc29yOiBwb2ludGVyO1xuICBmb250LXNpemU6IDAuODc1cmVtO1xuICBmb250LXdlaWdodDogNjAwO1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4ycyBlYXNlO1xuICB6LWluZGV4OiAxMDtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjVyZW07XG4gIGJhY2tkcm9wLWZpbHRlcjogYmx1cig0cHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctc20pO1xufVxuXG4uY29weS1idXR0b246aG92ZXIge1xuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xuICBjb2xvcjogd2hpdGU7XG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uY29weS1idXR0b24uY29waWVkIHtcbiAgYmFja2dyb3VuZDogIzQ4YmI3ODtcbiAgY29sb3I6IHdoaXRlO1xuICBib3JkZXItY29sb3I6ICM0OGJiNzg7XG59XG5cbi8qIEJ1dHRvbiBDb250cm9scyAqL1xuLmJ1dHRvbi1jb250cm9scyB7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGdhcDogMXJlbTtcbiAgZmxleC13cmFwOiB3cmFwO1xuICBtYXJnaW4tdG9wOiBhdXRvO1xuICBwYWRkaW5nLXRvcDogMC41cmVtO1xufVxuXG4uYnV0dG9uIHtcbiAgcGFkZGluZzogMXJlbSAyLjVyZW07XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGZvbnQtc2l6ZTogMXJlbTtcbiAgYm9yZGVyOiBub25lO1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XG4gIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgZ2FwOiAwLjVyZW07XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgZmxleDogMTtcbiAgbWluLXdpZHRoOiAxNDBweDtcbn1cblxuLmJ1dHRvbjo6YmVmb3JlIHtcbiAgY29udGVudDogJyc7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiA1MCU7XG4gIGxlZnQ6IDUwJTtcbiAgd2lkdGg6IDA7XG4gIGhlaWdodDogMDtcbiAgYm9yZGVyLXJhZGl1czogNTAlO1xuICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7XG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsIC01MCUpO1xuICB0cmFuc2l0aW9uOiB3aWR0aCAwLjZzLCBoZWlnaHQgMC42cztcbn1cblxuLmJ1dHRvbjpob3Zlcjo6YmVmb3JlIHtcbiAgd2lkdGg6IDMwMHB4O1xuICBoZWlnaHQ6IDMwMHB4O1xufVxuXG4uYnV0dG9uLmlzLXByaW1hcnkge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgY29sb3I6IHdoaXRlO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uYnV0dG9uLmlzLXByaW1hcnk6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTJweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG59XG5cbi5idXR0b24uaXMtc2Vjb25kYXJ5IHtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG4gIGNvbG9yOiAjNjY3ZWVhO1xuICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xufVxuXG4uYnV0dG9uLmlzLXNlY29uZGFyeTpob3ZlciB7XG4gIGJhY2tncm91bmQ6ICM2NjdlZWE7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xufVxuXG4vKiBMb2FkaW5nIEFuaW1hdGlvbiAqL1xuLmJ1dHRvbi5pcy1sb2FkaW5nIHtcbiAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gIG9wYWNpdHk6IDAuNztcbn1cblxuLmJ1dHRvbi5pcy1sb2FkaW5nOjphZnRlciB7XG4gIGNvbnRlbnQ6ICcnO1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHdpZHRoOiAxNnB4O1xuICBoZWlnaHQ6IDE2cHg7XG4gIHRvcDogNTAlO1xuICBsZWZ0OiA1MCU7XG4gIG1hcmdpbi1sZWZ0OiAtOHB4O1xuICBtYXJnaW4tdG9wOiAtOHB4O1xuICBib3JkZXI6IDJweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgYm9yZGVyLXRvcC1jb2xvcjogd2hpdGU7XG4gIGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgYW5pbWF0aW9uOiBidXR0b24tbG9hZGluZy1zcGlubmVyIDAuNnMgbGluZWFyIGluZmluaXRlO1xufVxuXG5Aa2V5ZnJhbWVzIGJ1dHRvbi1sb2FkaW5nLXNwaW5uZXIge1xuICBmcm9tIHtcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgwdHVybik7XG4gIH1cbiAgdG8ge1xuICAgIHRyYW5zZm9ybTogcm90YXRlKDF0dXJuKTtcbiAgfVxufVxuXG4vKiBGZWF0dXJlcyBTZWN0aW9uICovXG4uZmVhdHVyZXMtZ3JpZCB7XG4gIGRpc3BsYXk6IGdyaWQ7XG4gIGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KGF1dG8tZml0LCBtaW5tYXgoMjUwcHgsIDFmcikpO1xuICBnYXA6IDEuNXJlbTtcbiAgbWFyZ2luLXRvcDogMnJlbTtcbiAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbn1cblxuLmZlYXR1cmUtY2FyZCB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBwYWRkaW5nOiAxLjVyZW07XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XG59XG5cbi5mZWF0dXJlLWNhcmQ6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTRweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG59XG5cbi5mZWF0dXJlLWljb24ge1xuICB3aWR0aDogNTBweDtcbiAgaGVpZ2h0OiA1MHB4O1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgY29sb3I6IHdoaXRlO1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgZm9udC1zaXplOiAxLjVyZW07XG4gIG1hcmdpbi1ib3R0b206IDFyZW07XG59XG5cbi5mZWF0dXJlLXRpdGxlIHtcbiAgZm9udC1zaXplOiAxLjEyNXJlbTtcbiAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSk7XG4gIG1hcmdpbi1ib3R0b206IDAuNXJlbTtcbn1cblxuLmZlYXR1cmUtZGVzY3JpcHRpb24ge1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICBmb250LXNpemU6IDAuOXJlbTtcbiAgbGluZS1oZWlnaHQ6IDEuNjtcbn1cblxuLyogRm9vdGVyICovXG4ubW9kZXJuLWZvb3RlciB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBwYWRkaW5nOiAycmVtO1xuICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gIG1hcmdpbi10b3A6IDRyZW07XG4gIGJveC1zaGFkb3c6IDAgLTJweCAxMHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG59XG5cbi5tb2Rlcm4tZm9vdGVyIHAge1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICBtYXJnaW46IDA7XG59XG5cbi5tb2Rlcm4tZm9vdGVyIGEge1xuICBjb2xvcjogIzY2N2VlYTtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICBmb250LXdlaWdodDogNjAwO1xufVxuXG4ubW9kZXJuLWZvb3RlciBhOmhvdmVyIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG59XG5cbi8qIEFuaW1hdGlvbnMgKi9cbkBrZXlmcmFtZXMgZmFkZUluVXAge1xuICBmcm9tIHtcbiAgICBvcGFjaXR5OiAwO1xuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgyMHB4KTtcbiAgfVxuICB0byB7XG4gICAgb3BhY2l0eTogMTtcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7XG4gIH1cbn1cblxuLmZhZGUtaW4tdXAge1xuICBhbmltYXRpb246IGZhZGVJblVwIDAuNnMgZWFzZS1vdXQ7XG59XG5cbi8qIFN1Y2Nlc3MvRXJyb3IgTWVzc2FnZXMgKi9cbi5tZXNzYWdlLWJveCB7XG4gIHBhZGRpbmc6IDFyZW0gMS41cmVtO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBnYXA6IDAuNzVyZW07XG4gIGFuaW1hdGlvbjogZmFkZUluVXAgMC4zcyBlYXNlLW91dDtcbn1cblxuLm1lc3NhZ2UtYm94LnN1Y2Nlc3Mge1xuICBiYWNrZ3JvdW5kOiAjZDRlZGRhO1xuICBjb2xvcjogIzE1NTcyNDtcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjMjhhNzQ1O1xufVxuXG4ubWVzc2FnZS1ib3guZXJyb3Ige1xuICBiYWNrZ3JvdW5kOiAjZjhkN2RhO1xuICBjb2xvcjogIzcyMWMyNDtcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjZGMzNTQ1O1xufVxuXG4vKiBSZXNwb25zaXZlIERlc2lnbiAqL1xuQG1lZGlhIChtYXgtd2lkdGg6IDEwMjRweCkge1xuICAuY29udmVydGVyLWdyaWQge1xuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyO1xuICAgIGdhcDogMS41cmVtO1xuICB9XG5cbiAgLmNvbnRlbnQtd3JhcHBlciB7XG4gICAgbWF4LXdpZHRoOiAxMjAwcHg7XG4gIH1cbn1cblxuQG1lZGlhIChtYXgtd2lkdGg6IDc2OHB4KSB7XG4gIC5oZXJvIC50aXRsZSB7XG4gICAgZm9udC1zaXplOiAxLjc1cmVtO1xuICB9XG5cbiAgLmhlcm8gLnN1YnRpdGxlIHtcbiAgICBmb250LXNpemU6IDFyZW07XG4gIH1cblxuICAuY29udmVydGVyLWNhcmQge1xuICAgIHBhZGRpbmc6IDEuNXJlbTtcbiAgfVxuXG4gIC5idXR0b24tY29udHJvbHMge1xuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIH1cblxuICAuYnV0dG9uIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgfVxuXG4gIC5uYXYtaGVhZGVyIHtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgIGdhcDogMXJlbTtcbiAgfVxuXG4gIC5mZWF0dXJlcy1ncmlkIHtcbiAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmcjtcbiAgfVxuXG4gIC50ZXh0YXJlYSB7XG4gICAgbWluLWhlaWdodDogMTUwcHg7XG4gIH1cbn1cblxuLyogQ29kZSBIaWdobGlnaHRpbmcgaW4gT3V0cHV0ICovXG4udGV4dGFyZWEuY29kZS1vdXRwdXQge1xuICBiYWNrZ3JvdW5kOiAjMWUyOTNiO1xuICBjb2xvcjogI2UyZThmMDtcbiAgYm9yZGVyLWNvbG9yOiAjMzM0MTU1O1xuICBmb250LXNpemU6IDAuOXJlbTtcbn1cblxuLnRleHRhcmVhLmNvZGUtb3V0cHV0OmZvY3VzIHtcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xuICBiYWNrZ3JvdW5kOiAjMWUyOTNiO1xufVxuXG4udGV4dGFyZWEuY29kZS1vdXRwdXQ6OnBsYWNlaG9sZGVyIHtcbiAgY29sb3I6ICM2NDc0OGI7XG59XG5cbi8qIFV0aWxpdHkgQ2xhc3NlcyAqL1xuLm10LTEgeyBtYXJnaW4tdG9wOiAwLjVyZW07IH1cbi5tdC0yIHsgbWFyZ2luLXRvcDogMXJlbTsgfVxuLm10LTMgeyBtYXJnaW4tdG9wOiAxLjVyZW07IH1cbi5tdC00IHsgbWFyZ2luLXRvcDogMnJlbTsgfVxuXG4ubWItMSB7IG1hcmdpbi1ib3R0b206IDAuNXJlbTsgfVxuLm1iLTIgeyBtYXJnaW4tYm90dG9tOiAxcmVtOyB9XG4ubWItMyB7IG1hcmdpbi1ib3R0b206IDEuNXJlbTsgfVxuLm1iLTQgeyBtYXJnaW4tYm90dG9tOiAycmVtOyB9XG5cbi50ZXh0LWNlbnRlciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxuLnRleHQtbXV0ZWQgeyBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpOyB9XG5gLCBcIlwiLHtcInZlcnNpb25cIjozLFwic291cmNlc1wiOltcIndlYnBhY2s6Ly8uL3NyYy9zdHlsZS5jc3NcIl0sXCJuYW1lc1wiOltdLFwibWFwcGluZ3NcIjpcIkFBQUEsa0RBQWtEOztBQUVsRDtFQUNFLHFFQUFxRTtFQUNyRSx1RUFBdUU7RUFDdkUscUVBQXFFO0VBQ3JFLGtCQUFrQjtFQUNsQixrQkFBa0I7RUFDbEIsdUJBQXVCO0VBQ3ZCLHlCQUF5QjtFQUN6Qix1QkFBdUI7RUFDdkIsMENBQTBDO0VBQzFDLDBDQUEwQztFQUMxQywyQ0FBMkM7RUFDM0MsNENBQTRDO0VBQzVDLGdCQUFnQjtFQUNoQixpQkFBaUI7RUFDakIsaUJBQWlCO0FBQ25COztBQUVBO0VBQ0Usc0JBQXNCO0FBQ3hCOztBQUVBO0VBQ0UsOEpBQThKO0VBQzlKLG1DQUFtQztFQUNuQyxrQ0FBa0M7RUFDbEMsNkRBQTZEO0VBQzdELGlCQUFpQjtBQUNuQjs7QUFFQSwwQkFBMEI7QUFDMUI7RUFDRSxtQ0FBbUM7RUFDbkMsa0JBQWtCO0VBQ2xCLGdCQUFnQjtBQUNsQjs7QUFFQTtFQUNFLFdBQVc7RUFDWCxrQkFBa0I7RUFDbEIsTUFBTTtFQUNOLE9BQU87RUFDUCxRQUFRO0VBQ1IsU0FBUztFQUNULG1EQUE4WDtFQUM5WCxZQUFZO0FBQ2Q7O0FBRUE7RUFDRSxrQkFBa0I7RUFDbEIsVUFBVTtFQUNWLHNCQUFzQjtBQUN4Qjs7QUFFQTtFQUNFLGtCQUFrQjtFQUNsQixnQkFBZ0I7RUFDaEIsMENBQTBDO0VBQzFDLHNCQUFzQjtBQUN4Qjs7QUFFQTtFQUNFLGVBQWU7RUFDZixhQUFhO0VBQ2Isa0JBQWtCO0FBQ3BCOztBQUVBLHNCQUFzQjtBQUN0QjtFQUNFLGtCQUFrQjtF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RUE7SUFDRSwwQkFBMEI7RUFDNUI7O0VBRUE7SUFDRSxpQkFBaUI7RUFDbkI7QUFDRjs7QUFFQSxnQ0FBZ0M7QUFDaEM7RUFDRSxtQkFBbUI7RUFDbkIsY0FBYztFQUNkLHFCQUFxQjtFQUNyQixpQkFBaUI7QUFDbkI7O0FBRUE7RUFDRSxxQkFBcUI7RUFDckIsbUJBQW1CO0FBQ3JCOztBQUVBO0VBQ0UsY0FBYztBQUNoQjs7QUFFQSxvQkFBb0I7QUFDcEIsUUFBUSxrQkFBa0IsRUFBRTtBQUM1QixRQUFRLGdCQUFnQixFQUFFO0FBQzFCLFFBQVEsa0JBQWtCLEVBQUU7QUFDNUIsUUFBUSxnQkFBZ0IsRUFBRTs7QUFFMUIsUUFBUSxxQkFBcUIsRUFBRTtBQUMvQixRQUFRLG1CQUFtQixFQUFFO0FBQzdCLFFBQVEscUJBQXFCLEVBQUU7QUFDL0IsUUFBUSxtQkFBbUIsRUFBRTs7QUFFN0IsZUFBZSxrQkFBa0IsRUFBRTtBQUNuQyxjQUFjLDRCQUE0QixFQUFFXCIsXCJzb3VyY2VzQ29udGVudFwiOltcIi8qIE1vZGVybiBTUUwgdG8gTGFyYXZlbCBCdWlsZGVyIC0gQ3VzdG9tIFN0eWxlcyAqL1xcblxcbjpyb290IHtcXG4gIC0tcHJpbWFyeS1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzY2N2VlYSAwJSwgIzc2NGJhMiAxMDAlKTtcXG4gIC0tc2Vjb25kYXJ5LWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZjA5M2ZiIDAlLCAjZjU1NzZjIDEwMCUpO1xcbiAgLS1zdWNjZXNzLWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNGZhY2ZlIDAlLCAjMDBmMmZlIDEwMCUpO1xcbiAgLS1kYXJrLWJnOiAjMWExYTJlO1xcbiAgLS1jYXJkLWJnOiAjZmZmZmZmO1xcbiAgLS10ZXh0LXByaW1hcnk6ICMyZDM3NDg7XFxuICAtLXRleHQtc2Vjb25kYXJ5OiAjNzE4MDk2O1xcbiAgLS1ib3JkZXItY29sb3I6ICNlMmU4ZjA7XFxuICAtLXNoYWRvdy1zbTogMCAycHggNHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XFxuICAtLXNoYWRvdy1tZDogMCA0cHggNnB4IHJnYmEoMCwgMCwgMCwgMC4wNyk7XFxuICAtLXNoYWRvdy1sZzogMCAxMHB4IDI1cHggcmdiYSgwLCAwLCAwLCAwLjEpO1xcbiAgLS1zaGFkb3cteGw6IDAgMjBweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC4xNSk7XFxuICAtLXJhZGl1cy1zbTogOHB4O1xcbiAgLS1yYWRpdXMtbWQ6IDEycHg7XFxuICAtLXJhZGl1cy1sZzogMTZweDtcXG59XFxuXFxuKiB7XFxuICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xcbn1cXG5cXG5ib2R5IHtcXG4gIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICdTZWdvZSBVSScsICdSb2JvdG8nLCAnT3h5Z2VuJywgJ1VidW50dScsICdDYW50YXJlbGwnLCAnRmlyYSBTYW5zJywgJ0Ryb2lkIFNhbnMnLCAnSGVsdmV0aWNhIE5ldWUnLCBzYW5zLXNlcmlmO1xcbiAgLXdlYmtpdC1mb250LXNtb290aGluZzogYW50aWFsaWFzZWQ7XFxuICAtbW96LW9zeC1mb250LXNtb290aGluZzogZ3JheXNjYWxlO1xcbiAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2Y1ZjdmYSAwJSwgI2MzY2ZlMiAxMDAlKTtcXG4gIG1pbi1oZWlnaHQ6IDEwMHZoO1xcbn1cXG5cXG4vKiBIZXJvIFNlY3Rpb24gUmVkZXNpZ24gKi9cXG4uaGVyby5pcy1wcmltYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcXG59XFxuXFxuLmhlcm8uaXMtcHJpbWFyeTo6YmVmb3JlIHtcXG4gIGNvbnRlbnQ6ICcnO1xcbiAgcG9zaXRpb246IGFic29sdXRlO1xcbiAgdG9wOiAwO1xcbiAgbGVmdDogMDtcXG4gIHJpZ2h0OiAwO1xcbiAgYm90dG9tOiAwO1xcbiAgYmFja2dyb3VuZDogdXJsKFxcXCJkYXRhOmltYWdlL3N2Zyt4bWwsJTNDc3ZnIHdpZHRoPSc2MCcgaGVpZ2h0PSc2MCcgdmlld0JveD0nMCAwIDYwIDYwJyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnJTNFJTNDZyBmaWxsPSdub25lJyBmaWxsLXJ1bGU9J2V2ZW5vZGQnJTNFJTNDZyBmaWxsPSclMjNmZmZmZmYnIGZpbGwtb3BhY2l0eT0nMC4wNSclM0UlM0NwYXRoIGQ9J00zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMlY2aDRWNGgtNHpNNiAzNHYtNEg0djRIMHYyaDR2NGgydi00aDR2LTJINnpNNiA0VjBINHY0SDB2Mmg0djRoMlY2aDRWNEg2eicvJTNFJTNDL2clM0UlM0MvZyUzRSUzQy9zdmclM0VcXFwiKTtcXG4gIG9wYWNpdHk6IDAuMztcXG59XFxuXFxuLmhlcm8tYm9keSB7XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICB6LWluZGV4OiAxO1xcbiAgcGFkZGluZzogMS41cmVtIDEuNXJlbTtcXG59XFxuXFxuLmhlcm8gLnRpdGxlIHtcXG4gIGZvbnQtc2l6ZTogMS43NXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA3MDA7XFxuICB0ZXh0LXNoYWRvdzogMCAycHggMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7XFxuICBsZXR0ZXItc3BhY2luZzogLTAuNXB4O1xcbn1cXG5cXG4uaGVybyAuc3VidGl0bGUge1xcbiAgZm9udC1zaXplOiAxcmVtO1xcbiAgb3BhY2l0eTogMC45NTtcXG4gIG1hcmdpbi10b3A6IDAuNXJlbTtcXG59XFxuXFxuLyogTmF2aWdhdGlvbi9IZWFkZXIgKi9cXG4ubmF2LWhlYWRlciB7XFxuICBwYWRkaW5nOiAxcmVtIDJyZW07XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXNtKTtcXG59XFxuXFxuLmdpdGh1Yi1saW5rIHtcXG4gIGRpc3BsYXk6IGlubGluZS1mbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGdhcDogMC4yNXJlbTtcXG4gIHBhZGRpbmc6IDAuNXJlbSAwLjc1cmVtO1xcbiAgYmFja2dyb3VuZDogdHJhbnNwYXJlbnQ7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcXG4gIGZvbnQtd2VpZ2h0OiA0MDA7XFxuICBmb250LXNpemU6IDAuODc1cmVtO1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuMnMgZWFzZTtcXG4gIG9wYWNpdHk6IDAuNjtcXG59XFxuXFxuLmdpdGh1Yi1saW5rOmhvdmVyIHtcXG4gIG9wYWNpdHk6IDAuOTtcXG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xcbiAgYmFja2dyb3VuZDogcmdiYSgwLCAwLCAwLCAwLjAzKTtcXG59XFxuXFxuLmdpdGh1Yi1saW5rOjpiZWZvcmUge1xcbiAgY29udGVudDogJ+KYhSc7XFxuICBmb250LXNpemU6IDAuODc1cmVtO1xcbn1cXG5cXG4vKiBNYWluIENvbnRlbnQgQXJlYSAqL1xcbi5jb250ZW50LXdyYXBwZXIge1xcbiAgbWF4LXdpZHRoOiAxNDAwcHg7XFxuICBtYXJnaW46IDAgYXV0bztcXG4gIHBhZGRpbmc6IDJyZW0gMXJlbTtcXG59XFxuXFxuLyogQ29udmVydGVyIEdyaWQgLSBTaWRlIGJ5IFNpZGUgTGF5b3V0ICovXFxuLmNvbnZlcnRlci1ncmlkIHtcXG4gIGRpc3BsYXk6IGdyaWQ7XFxuICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmciAxZnI7XFxuICBnYXA6IDJyZW07XFxuICBtYXJnaW4tYm90dG9tOiAycmVtO1xcbiAgYWxpZ24taXRlbXM6IHN0YXJ0O1xcbn1cXG5cXG4uY29udmVydGVyLWNhcmQge1xcbiAgYmFja2dyb3VuZDogdmFyKC0tY2FyZC1iZyk7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbGcpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXhsKTtcXG4gIHBhZGRpbmc6IDJyZW07XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XFxuICBoZWlnaHQ6IDEwMCU7XFxufVxcblxcbi5jb252ZXJ0ZXItY2FyZDpob3ZlciB7XFxuICBib3gtc2hhZG93OiAwIDI1cHggNTBweCByZ2JhKDAsIDAsIDAsIDAuMik7XFxufVxcblxcbi8qIFNlY3Rpb24gSGVhZGVycyAqL1xcbi5zZWN0aW9uLWhlYWRlciB7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGdhcDogMC43NXJlbTtcXG4gIG1hcmdpbi1ib3R0b206IDEuNXJlbTtcXG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XFxuICBmb250LXdlaWdodDogNzAwO1xcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSk7XFxufVxcblxcbi5zZWN0aW9uLWljb24ge1xcbiAgd2lkdGg6IDM2cHg7XFxuICBoZWlnaHQ6IDM2cHg7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcXG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XFxuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XFxuICBmbGV4LXNocmluazogMDtcXG59XFxuXFxuLyogVGV4dGFyZWEgUmVkZXNpZ24gKi9cXG4udGV4dGFyZWEtd3JhcHBlciB7XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICBtYXJnaW4tYm90dG9tOiAxLjVyZW07XFxuICBmbGV4OiAxO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XFxufVxcblxcbi50ZXh0YXJlYSB7XFxuICBib3JkZXI6IDJweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIHBhZGRpbmc6IDEuMjVyZW07XFxuICBmb250LXNpemU6IDAuOTVyZW07XFxuICBmb250LWZhbWlseTogJ01vbmFjbycsICdNZW5sbycsICdVYnVudHUgTW9ubycsICdDb25zb2xhcycsICdzb3VyY2UtY29kZS1wcm8nLCBtb25vc3BhY2U7XFxuICBsaW5lLWhlaWdodDogMS42O1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgZWFzZTtcXG4gIHJlc2l6ZTogbm9uZTtcXG4gIGhlaWdodDogNDUwcHg7XFxuICBiYWNrZ3JvdW5kOiAjZjhmYWZjO1xcbiAgd2lkdGg6IDEwMCU7XFxufVxcblxcbi50ZXh0YXJlYTpmb2N1cyB7XFxuICBvdXRsaW5lOiBub25lO1xcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xcbiAgYm94LXNoYWRvdzogMCAwIDAgM3B4IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbn1cXG5cXG4udGV4dGFyZWE6OnBsYWNlaG9sZGVyIHtcXG4gIGNvbG9yOiAjYTBhZWMwO1xcbiAgZm9udC1zdHlsZTogaXRhbGljO1xcbiAgZm9udC1zaXplOiAwLjlyZW07XFxufVxcblxcbi8qIENvcHkgQnV0dG9uICovXFxuLmNvcHktYnV0dG9uIHtcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogMXJlbTtcXG4gIHJpZ2h0OiAxcmVtO1xcbiAgcGFkZGluZzogMC42MjVyZW0gMS4yNXJlbTtcXG4gIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC45NSk7XFxuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcXG4gIGN1cnNvcjogcG9pbnRlcjtcXG4gIGZvbnQtc2l6ZTogMC44NzVyZW07XFxuICBmb250LXdlaWdodDogNjAwO1xcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjJzIGVhc2U7XFxuICB6LWluZGV4OiAxMDtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjVyZW07XFxuICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoNHB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1zbSk7XFxufVxcblxcbi5jb3B5LWJ1dHRvbjpob3ZlciB7XFxuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG59XFxuXFxuLmNvcHktYnV0dG9uLmNvcGllZCB7XFxuICBiYWNrZ3JvdW5kOiAjNDhiYjc4O1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgYm9yZGVyLWNvbG9yOiAjNDhiYjc4O1xcbn1cXG5cXG4vKiBCdXR0b24gQ29udHJvbHMgKi9cXG4uYnV0dG9uLWNvbnRyb2xzIHtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBnYXA6IDFyZW07XFxuICBmbGV4LXdyYXA6IHdyYXA7XFxuICBtYXJnaW4tdG9wOiBhdXRvO1xcbiAgcGFkZGluZy10b3A6IDAuNXJlbTtcXG59XFxuXFxuLmJ1dHRvbiB7XFxuICBwYWRkaW5nOiAxcmVtIDIuNXJlbTtcXG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XFxuICBmb250LXdlaWdodDogNzAwO1xcbiAgZm9udC1zaXplOiAxcmVtO1xcbiAgYm9yZGVyOiBub25lO1xcbiAgY3Vyc29yOiBwb2ludGVyO1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcXG4gIGRpc3BsYXk6IGlubGluZS1mbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcbiAgZ2FwOiAwLjVyZW07XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICBvdmVyZmxvdzogaGlkZGVuO1xcbiAgZmxleDogMTtcXG4gIG1pbi13aWR0aDogMTQwcHg7XFxufVxcblxcbi5idXR0b246OmJlZm9yZSB7XFxuICBjb250ZW50OiAnJztcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogNTAlO1xcbiAgbGVmdDogNTAlO1xcbiAgd2lkdGg6IDA7XFxuICBoZWlnaHQ6IDA7XFxuICBib3JkZXItcmFkaXVzOiA1MCU7XFxuICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLCAtNTAlKTtcXG4gIHRyYW5zaXRpb246IHdpZHRoIDAuNnMsIGhlaWdodCAwLjZzO1xcbn1cXG5cXG4uYnV0dG9uOmhvdmVyOjpiZWZvcmUge1xcbiAgd2lkdGg6IDMwMHB4O1xcbiAgaGVpZ2h0OiAzMDBweDtcXG59XFxuXFxuLmJ1dHRvbi5pcy1wcmltYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG59XFxuXFxuLmJ1dHRvbi5pcy1wcmltYXJ5OmhvdmVyIHtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxufVxcblxcbi5idXR0b24uaXMtc2Vjb25kYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbiAgY29sb3I6ICM2NjdlZWE7XFxuICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xcbn1cXG5cXG4uYnV0dG9uLmlzLXNlY29uZGFyeTpob3ZlciB7XFxuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LWxnKTtcXG59XFxuXFxuLyogTG9hZGluZyBBbmltYXRpb24gKi9cXG4uYnV0dG9uLmlzLWxvYWRpbmcge1xcbiAgcG9pbnRlci1ldmVudHM6IG5vbmU7XFxuICBvcGFjaXR5OiAwLjc7XFxufVxcblxcbi5idXR0b24uaXMtbG9hZGluZzo6YWZ0ZXIge1xcbiAgY29udGVudDogJyc7XFxuICBwb3NpdGlvbjogYWJzb2x1dGU7XFxuICB3aWR0aDogMTZweDtcXG4gIGhlaWdodDogMTZweDtcXG4gIHRvcDogNTAlO1xcbiAgbGVmdDogNTAlO1xcbiAgbWFyZ2luLWxlZnQ6IC04cHg7XFxuICBtYXJnaW4tdG9wOiAtOHB4O1xcbiAgYm9yZGVyOiAycHggc29saWQgdHJhbnNwYXJlbnQ7XFxuICBib3JkZXItdG9wLWNvbG9yOiB3aGl0ZTtcXG4gIGJvcmRlci1yYWRpdXM6IDUwJTtcXG4gIGFuaW1hdGlvbjogYnV0dG9uLWxvYWRpbmctc3Bpbm5lciAwLjZzIGxpbmVhciBpbmZpbml0ZTtcXG59XFxuXFxuQGtleWZyYW1lcyBidXR0b24tbG9hZGluZy1zcGlubmVyIHtcXG4gIGZyb20ge1xcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgwdHVybik7XFxuICB9XFxuICB0byB7XFxuICAgIHRyYW5zZm9ybTogcm90YXRlKDF0dXJuKTtcXG4gIH1cXG59XFxuXFxuLyogRmVhdHVyZXMgU2VjdGlvbiAqL1xcbi5mZWF0dXJlcy1ncmlkIHtcXG4gIGRpc3BsYXk6IGdyaWQ7XFxuICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IHJlcGVhdChhdXRvLWZpdCwgbWlubWF4KDI1MHB4LCAxZnIpKTtcXG4gIGdhcDogMS41cmVtO1xcbiAgbWFyZ2luLXRvcDogMnJlbTtcXG4gIG1hcmdpbi1ib3R0b206IDJyZW07XFxufVxcblxcbi5mZWF0dXJlLWNhcmQge1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxuICBwYWRkaW5nOiAxLjVyZW07XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XFxuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xcbn1cXG5cXG4uZmVhdHVyZS1jYXJkOmhvdmVyIHtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtNHB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxufVxcblxcbi5mZWF0dXJlLWljb24ge1xcbiAgd2lkdGg6IDUwcHg7XFxuICBoZWlnaHQ6IDUwcHg7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XFxuICBjb2xvcjogd2hpdGU7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcbiAgZm9udC1zaXplOiAxLjVyZW07XFxuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xcbn1cXG5cXG4uZmVhdHVyZS10aXRsZSB7XFxuICBmb250LXNpemU6IDEuMTI1cmVtO1xcbiAgZm9udC13ZWlnaHQ6IDcwMDtcXG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xcbiAgbWFyZ2luLWJvdHRvbTogMC41cmVtO1xcbn1cXG5cXG4uZmVhdHVyZS1kZXNjcmlwdGlvbiB7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgZm9udC1zaXplOiAwLjlyZW07XFxuICBsaW5lLWhlaWdodDogMS42O1xcbn1cXG5cXG4vKiBGb290ZXIgKi9cXG4ubW9kZXJuLWZvb3RlciB7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIHBhZGRpbmc6IDJyZW07XFxuICB0ZXh0LWFsaWduOiBjZW50ZXI7XFxuICBtYXJnaW4tdG9wOiA0cmVtO1xcbiAgYm94LXNoYWRvdzogMCAtMnB4IDEwcHggcmdiYSgwLCAwLCAwLCAwLjA1KTtcXG59XFxuXFxuLm1vZGVybi1mb290ZXIgcCB7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgbWFyZ2luOiAwO1xcbn1cXG5cXG4ubW9kZXJuLWZvb3RlciBhIHtcXG4gIGNvbG9yOiAjNjY3ZWVhO1xcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xcbiAgZm9udC13ZWlnaHQ6IDYwMDtcXG59XFxuXFxuLm1vZGVybi1mb290ZXIgYTpob3ZlciB7XFxuICB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTtcXG59XFxuXFxuLyogQW5pbWF0aW9ucyAqL1xcbkBrZXlmcmFtZXMgZmFkZUluVXAge1xcbiAgZnJvbSB7XFxuICAgIG9wYWNpdHk6IDA7XFxuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgyMHB4KTtcXG4gIH1cXG4gIHRvIHtcXG4gICAgb3BhY2l0eTogMTtcXG4gICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApO1xcbiAgfVxcbn1cXG5cXG4uZmFkZS1pbi11cCB7XFxuICBhbmltYXRpb246IGZhZGVJblVwIDAuNnMgZWFzZS1vdXQ7XFxufVxcblxcbi8qIFN1Y2Nlc3MvRXJyb3IgTWVzc2FnZXMgKi9cXG4ubWVzc2FnZS1ib3gge1xcbiAgcGFkZGluZzogMXJlbSAxLjVyZW07XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjc1cmVtO1xcbiAgYW5pbWF0aW9uOiBmYWRlSW5VcCAwLjNzIGVhc2Utb3V0O1xcbn1cXG5cXG4ubWVzc2FnZS1ib3guc3VjY2VzcyB7XFxuICBiYWNrZ3JvdW5kOiAjZDRlZGRhO1xcbiAgY29sb3I6ICMxNTU3MjQ7XFxuICBib3JkZXItbGVmdDogNHB4IHNvbGlkICMyOGE3NDU7XFxufVxcblxcbi5tZXNzYWdlLWJveC5lcnJvciB7XFxuICBiYWNrZ3JvdW5kOiAjZjhkN2RhO1xcbiAgY29sb3I6ICM3MjFjMjQ7XFxuICBib3JkZXItbGVmdDogNHB4IHNvbGlkICNkYzM1NDU7XFxufVxcblxcbi8qIFJlc3BvbnNpdmUgRGVzaWduICovXFxuQG1lZGlhIChtYXgtd2lkdGg6IDEwMjRweCkge1xcbiAgLmNvbnZlcnRlci1ncmlkIHtcXG4gICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxZnI7XFxuICAgIGdhcDogMS41cmVtO1xcbiAgfVxcblxcbiAgLmNvbnRlbnQtd3JhcHBlciB7XFxuICAgIG1heC13aWR0aDogMTIwMHB4O1xcbiAgfVxcbn1cXG5cXG5AbWVkaWEgKG1heC13aWR0aDogNzY4cHgpIHtcXG4gIC5oZXJvIC50aXRsZSB7XFxuICAgIGZvbnQtc2l6ZTogMS43NXJlbTtcXG4gIH1cXG5cXG4gIC5oZXJvIC5zdWJ0aXRsZSB7XFxuICAgIGZvbnQtc2l6ZTogMXJlbTtcXG4gIH1cXG5cXG4gIC5jb252ZXJ0ZXItY2FyZCB7XFxuICAgIHBhZGRpbmc6IDEuNXJlbTtcXG4gIH1cXG5cXG4gIC5idXR0b24tY29udHJvbHMge1xcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xcbiAgfVxcblxcbiAgLmJ1dHRvbiB7XFxuICAgIHdpZHRoOiAxMDAlO1xcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcXG4gIH1cXG5cXG4gIC5uYXYtaGVhZGVyIHtcXG4gICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcXG4gICAgZ2FwOiAxcmVtO1xcbiAgfVxcblxcbiAgLmZlYXR1cmVzLWdyaWQge1xcbiAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmcjtcXG4gIH1cXG5cXG4gIC50ZXh0YXJlYSB7XFxuICAgIG1pbi1oZWlnaHQ6IDE1MHB4O1xcbiAgfVxcbn1cXG5cXG4vKiBDb2RlIEhpZ2hsaWdodGluZyBpbiBPdXRwdXQgKi9cXG4udGV4dGFyZWEuY29kZS1vdXRwdXQge1xcbiAgYmFja2dyb3VuZDogIzFlMjkzYjtcXG4gIGNvbG9yOiAjZTJlOGYwO1xcbiAgYm9yZGVyLWNvbG9yOiAjMzM0MTU1O1xcbiAgZm9udC1zaXplOiAwLjlyZW07XFxufVxcblxcbi50ZXh0YXJlYS5jb2RlLW91dHB1dDpmb2N1cyB7XFxuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XFxuICBiYWNrZ3JvdW5kOiAjMWUyOTNiO1xcbn1cXG5cXG4udGV4dGFyZWEuY29kZS1vdXRwdXQ6OnBsYWNlaG9sZGVyIHtcXG4gIGNvbG9yOiAjNjQ3NDhiO1xcbn1cXG5cXG4vKiBVdGlsaXR5IENsYXNzZXMgKi9cXG4ubXQtMSB7IG1hcmdpbi10b3A6IDAuNXJlbTsgfVxcbi5tdC0yIHsgbWFyZ2luLXRvcDogMXJlbTsgfVxcbi5tdC0zIHsgbWFyZ2luLXRvcDogMS41cmVtOyB9XFxuLm10LTQgeyBtYXJnaW4tdG9wOiAycmVtOyB9XFxuXFxuLm1iLTEgeyBtYXJnaW4tYm90dG9tOiAwLjVyZW07IH1cXG4ubWItMiB7IG1hcmdpbi1ib3R0b206IDFyZW07IH1cXG4ubWItMyB7IG1hcmdpbi1ib3R0b206IDEuNXJlbTsgfVxcbi5tYi00IHsgbWFyZ2luLWJvdHRvbTogMnJlbTsgfVxcblxcbi50ZXh0LWNlbnRlciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxcbi50ZXh0LW11dGVkIHsgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTsgfVxcblwiXSxcInNvdXJjZVJvb3RcIjpcIlwifV0pO1xuLy8gRXhwb3J0c1xuZXhwb3J0IGRlZmF1bHQgX19fQ1NTX0xPQURFUl9FWFBPUlRfX187XG4iLCJpbXBvcnQgKiBhcyB3YXNtIGZyb20gXCJzcWxwYXJzZXItcnMtd2FzbVwiO1xuaW1wb3J0IHtDb252ZXJ0ZXJ9IGZyb20gXCIuL2NvbnZlcnRlclwiO1xuaW1wb3J0ICcuL3N0eWxlLmNzcyc7XG5cbi8vIFNob3cgbm90aWZpY2F0aW9uIG1lc3NhZ2VcbmZ1bmN0aW9uIHNob3dOb3RpZmljYXRpb24obWVzc2FnZSwgdHlwZSA9ICdzdWNjZXNzJykge1xuICAgIC8vIFJlbW92ZSBhbnkgZXhpc3Rpbmcgbm90aWZpY2F0aW9uc1xuICAgIGNvbnN0IGV4aXN0aW5nTm90aWYgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubWVzc2FnZS1ib3gnKTtcbiAgICBpZiAoZXhpc3RpbmdOb3RpZikge1xuICAgICAgICBleGlzdGluZ05vdGlmLnJlbW92ZSgpO1xuICAgIH1cblxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIG5vdGlmaWNhdGlvbi5jbGFzc05hbWUgPSBgbWVzc2FnZS1ib3ggJHt0eXBlfWA7XG4gICAgbm90aWZpY2F0aW9uLmlubmVySFRNTCA9IGA8c3Bhbj4ke3R5cGUgPT09ICdzdWNjZXNzJyA/ICfinIUnIDogJ+KdjCd9PC9zcGFuPjxzcGFuPiR7bWVzc2FnZX08L3NwYW4+YDtcblxuICAgIGNvbnN0IHdyYXBwZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29udGVudC13cmFwcGVyJyk7XG4gICAgd3JhcHBlci5pbnNlcnRCZWZvcmUobm90aWZpY2F0aW9uLCB3cmFwcGVyLmZpcnN0Q2hpbGQpO1xuXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIG5vdGlmaWNhdGlvbi5zdHlsZS5hbmltYXRpb24gPSAnZmFkZUluVXAgMC4zcyBlYXNlLW91dCByZXZlcnNlJztcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBub3RpZmljYXRpb24ucmVtb3ZlKCksIDMwMCk7XG4gICAgfSwgMzAwMCk7XG59XG5cbmxldCBjb252ZXJ0ZXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IGlucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJpbnB1dFwiKS52YWx1ZTtcbiAgICBsZXQgY29udmVydEJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29udmVydC1idXR0b25cIik7XG5cbiAgICBpZiAoaW5wdXQudHJpbSgpID09PSAnJykge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdQbGVhc2UgZW50ZXIgYSBTUUwgcXVlcnknLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChpbnB1dC5zbGljZSgtMSkgPT09ICc7Jykge1xuICAgICAgICBpbnB1dCA9IGlucHV0LnNsaWNlKDAsIC0xKTtcbiAgICB9XG5cbiAgICBsZXQgb3V0cHV0X3RleHRfYXJlYSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwib3V0cHV0XCIpO1xuXG4gICAgaWYgKCFpbnB1dC5zdGFydHNXaXRoKCdzZWxlY3QnKSAmJiAhaW5wdXQuc3RhcnRzV2l0aCgnU0VMRUNUJykpIHtcbiAgICAgICAgb3V0cHV0X3RleHRfYXJlYS52YWx1ZSA9ICdTUUwgbXVzdCBzdGFydCB3aXRoIHNlbGVjdCBvciBTRUxFQ1QnO1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdTUUwgcXVlcnkgbXVzdCBzdGFydCB3aXRoIFNFTEVDVCcsICdlcnJvcicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQWRkIGxvYWRpbmcgc3RhdGVcbiAgICBjb252ZXJ0QnV0dG9uLmNsYXNzTGlzdC5hZGQoJ2lzLWxvYWRpbmcnKTtcbiAgICBjb252ZXJ0QnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcblxuICAgIC8vIFVzZSBzZXRUaW1lb3V0IHRvIGFsbG93IFVJIHRvIHVwZGF0ZVxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbGV0IGFzdCA9IHdhc20ucGFyc2Vfc3FsKFwiLS1teXNxbFwiLCBpbnB1dCk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhhc3QpO1xuICAgICAgICAgICAgaWYgKGFzdC5zdGFydHNXaXRoKCdFcnJvcicpKSB7XG4gICAgICAgICAgICAgICAgb3V0cHV0X3RleHRfYXJlYS52YWx1ZSA9IGFzdDtcbiAgICAgICAgICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdFcnJvciBwYXJzaW5nIFNRTCBxdWVyeScsICdlcnJvcicpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBvdXRwdXRfdGV4dF9hcmVhLnZhbHVlID0gKG5ldyBDb252ZXJ0ZXIoSlNPTi5wYXJzZShhc3QpWzBdLlF1ZXJ5KSkucnVuKCk7XG4gICAgICAgICAgICAgICAgc2hvd05vdGlmaWNhdGlvbignU3VjY2Vzc2Z1bGx5IGNvbnZlcnRlZCB0byBMYXJhdmVsIFF1ZXJ5IEJ1aWxkZXIhJywgJ3N1Y2Nlc3MnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coaW5wdXQpO1xuICAgICAgICAgICAgb3V0cHV0X3RleHRfYXJlYS52YWx1ZSA9IGUgKyAnLCBJIHdpbGwgZml4IHRoaXMgaXNzdWUgYXMgc29vbiBhcyBwb3NzaWJsZSc7XG4gICAgICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdDb252ZXJzaW9uIGVycm9yIG9jY3VycmVkJywgJ2Vycm9yJyk7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgY29udmVydEJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKCdpcy1sb2FkaW5nJyk7XG4gICAgICAgICAgICBjb252ZXJ0QnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9LCAxMDApO1xufVxuXG4vLyBDb3B5IHRvIGNsaXBib2FyZCBmdW5jdGlvbmFsaXR5XG5mdW5jdGlvbiBjb3B5VG9DbGlwYm9hcmQoKSB7XG4gICAgY29uc3Qgb3V0cHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJvdXRwdXRcIikudmFsdWU7XG4gICAgY29uc3QgY29weUJ1dHRvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29weS1idXR0b25cIik7XG4gICAgY29uc3QgY29weVRleHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktdGV4dFwiKTtcbiAgICBjb25zdCBjb3B5SWNvbiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29weS1pY29uXCIpO1xuXG4gICAgaWYgKCFvdXRwdXQgfHwgb3V0cHV0LnRyaW0oKSA9PT0gJycgfHwgb3V0cHV0LmluY2x1ZGVzKCdZb3VyIExhcmF2ZWwgcXVlcnkgYnVpbGRlciBjb2RlIHdpbGwgYXBwZWFyIGhlcmUnKSkge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdObyBvdXRwdXQgdG8gY29weScsICdlcnJvcicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQob3V0cHV0KS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICBjb3B5QnV0dG9uLmNsYXNzTGlzdC5hZGQoJ2NvcGllZCcpO1xuICAgICAgICBjb3B5VGV4dC50ZXh0Q29udGVudCA9ICdDb3BpZWQhJztcbiAgICAgICAgY29weUljb24udGV4dENvbnRlbnQgPSAn4pyTJztcblxuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIGNvcHlCdXR0b24uY2xhc3NMaXN0LnJlbW92ZSgnY29waWVkJyk7XG4gICAgICAgICAgICBjb3B5VGV4dC50ZXh0Q29udGVudCA9ICdDb3B5JztcbiAgICAgICAgICAgIGNvcHlJY29uLnRleHRDb250ZW50ID0gJ/Cfk4snO1xuICAgICAgICB9LCAyMDAwKTtcbiAgICB9LCBmdW5jdGlvbigpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignRmFpbGVkIHRvIGNvcHkgdG8gY2xpcGJvYXJkJywgJ2Vycm9yJyk7XG4gICAgfSk7XG59XG5cbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdsb2FkJywgKGV2ZW50KSA9PiB7XG4gICAgbGV0IHVybF9zZWFyY2hfcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyh3aW5kb3cubG9jYXRpb24uc2VhcmNoKTtcblxuICAgIGlmKHVybF9zZWFyY2hfcGFyYW1zLmhhcygnYmFzZTY0c3FsJykpIHtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0JykudmFsdWUgPSBhdG9iKHVybF9zZWFyY2hfcGFyYW1zLmdldCgnYmFzZTY0c3FsJykpO1xuICAgICAgICBjb252ZXJ0ZXIoKTtcbiAgICB9XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbnZlcnQtYnV0dG9uJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjb252ZXJ0ZXIpO1xuXG4vLyBBZGQgRW50ZXIga2V5IHN1cHBvcnQgKEN0cmwvQ21kICsgRW50ZXIgdG8gY29udmVydClcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcpLmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBmdW5jdGlvbihlKSB7XG4gICAgaWYgKChlLmN0cmxLZXkgfHwgZS5tZXRhS2V5KSAmJiBlLmtleSA9PT0gJ0VudGVyJykge1xuICAgICAgICBjb252ZXJ0ZXIoKTtcbiAgICB9XG59KTtcblxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NoYXJlLWJ1dHRvbicpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24gKCkge1xuICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0JykudmFsdWU7XG5cbiAgICBpZiAoIWlucHV0IHx8IGlucHV0LnRyaW0oKSA9PT0gJycpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignUGxlYXNlIGVudGVyIGEgU1FMIHF1ZXJ5IGZpcnN0JywgJ2Vycm9yJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgc2hhcmVfbGluayA9IHdpbmRvdy5sb2NhdGlvbi5vcmlnaW4gKyB3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUgKyAnP2Jhc2U2NHNxbD0nICsgYnRvYShpbnB1dCk7XG4gICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQoc2hhcmVfbGluaykudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignU2hhcmUgbGluayBjb3BpZWQgdG8gY2xpcGJvYXJkIScsICdzdWNjZXNzJyk7XG4gICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ0ZhaWxlZCB0byBjb3B5IHNoYXJlIGxpbmsnLCAnZXJyb3InKTtcbiAgICB9KTtcbn0pO1xuXG4vLyBBZGQgY29weSBidXR0b24gZXZlbnQgbGlzdGVuZXJcbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb3B5LWJ1dHRvbicpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY29weVRvQ2xpcGJvYXJkKTtcbiIsIlxuICAgICAgaW1wb3J0IEFQSSBmcm9tIFwiIS4uL25vZGVfbW9kdWxlcy9zdHlsZS1sb2FkZXIvZGlzdC9ydW50aW1lL2luamVjdFN0eWxlc0ludG9TdHlsZVRhZy5qc1wiO1xuICAgICAgaW1wb3J0IGRvbUFQSSBmcm9tIFwiIS4uL25vZGVfbW9kdWxlcy9zdHlsZS1sb2FkZXIvZGlzdC9ydW50aW1lL3N0eWxlRG9tQVBJLmpzXCI7XG4gICAgICBpbXBvcnQgaW5zZXJ0Rm4gZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9pbnNlcnRCeVNlbGVjdG9yLmpzXCI7XG4gICAgICBpbXBvcnQgc2V0QXR0cmlidXRlcyBmcm9tIFwiIS4uL25vZGVfbW9kdWxlcy9zdHlsZS1sb2FkZXIvZGlzdC9ydW50aW1lL3NldEF0dHJpYnV0ZXNXaXRob3V0QXR0cmlidXRlcy5qc1wiO1xuICAgICAgaW1wb3J0IGluc2VydFN0eWxlRWxlbWVudCBmcm9tIFwiIS4uL25vZGVfbW9kdWxlcy9zdHlsZS1sb2FkZXIvZGlzdC9ydW50aW1lL2luc2VydFN0eWxlRWxlbWVudC5qc1wiO1xuICAgICAgaW1wb3J0IHN0eWxlVGFnVHJhbnNmb3JtRm4gZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9zdHlsZVRhZ1RyYW5zZm9ybS5qc1wiO1xuICAgICAgaW1wb3J0IGNvbnRlbnQsICogYXMgbmFtZWRFeHBvcnQgZnJvbSBcIiEhLi4vbm9kZV9tb2R1bGVzL2Nzcy1sb2FkZXIvZGlzdC9janMuanMhLi9zdHlsZS5jc3NcIjtcbiAgICAgIFxuICAgICAgXG5cbnZhciBvcHRpb25zID0ge307XG5cbm9wdGlvbnMuc3R5bGVUYWdUcmFuc2Zvcm0gPSBzdHlsZVRhZ1RyYW5zZm9ybUZuO1xub3B0aW9ucy5zZXRBdHRyaWJ1dGVzID0gc2V0QXR0cmlidXRlcztcbm9wdGlvbnMuaW5zZXJ0ID0gaW5zZXJ0Rm4uYmluZChudWxsLCBcImhlYWRcIik7XG5vcHRpb25zLmRvbUFQSSA9IGRvbUFQSTtcbm9wdGlvbnMuaW5zZXJ0U3R5bGVFbGVtZW50ID0gaW5zZXJ0U3R5bGVFbGVtZW50O1xuXG52YXIgdXBkYXRlID0gQVBJKGNvbnRlbnQsIG9wdGlvbnMpO1xuXG5cblxuZXhwb3J0ICogZnJvbSBcIiEhLi4vbm9kZV9tb2R1bGVzL2Nzcy1sb2FkZXIvZGlzdC9janMuanMhLi9zdHlsZS5jc3NcIjtcbiAgICAgICBleHBvcnQgZGVmYXVsdCBjb250ZW50ICYmIGNvbnRlbnQubG9jYWxzID8gY29udGVudC5sb2NhbHMgOiB1bmRlZmluZWQ7XG4iXSwibmFtZXMiOlsiQ29udmVydGVyIiwiY29uc3RydWN0b3IiLCJhc3QiLCJwYXJlbnQiLCJ0YWJsZV9uYW1lX2J5X2FsaWFzIiwicnVuIiwibmVlZF9hcHBlbmRfZ2V0X3N1ZmZpeCIsInNlY3Rpb25zIiwiZnJvbV9pdGVtIiwiYm9keSIsIlNlbGVjdCIsImZyb20iLCJwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCIsInJlbGF0aW9uIiwicHVzaCIsInJlc29sdmVNYWluVGFibGVTZWN0aW9uIiwicmVzb2x2ZUZyb21TdWJTZWN0aW9uIiwiam9pbl9zZWN0aW9uIiwiaGFzSm9pblNlY3Rpb24iLCJyZXNvbHZlSm9pblNlY3Rpb24iLCJzbGljZSIsImxlbmd0aCIsImNvbmNhdCIsInJlc29sdmVDcm9zc0pvaW5TZWN0aW9uIiwicmVzb2x2ZVNlbGVjdFNlY3Rpb24iLCJyZXNvbHZlV2hlcmVTZWN0aW9uIiwic2VsZWN0aW9uIiwiZ3JvdXBfYnkiLCJyZXNvbHZlR3JvdXBCeVNlY3Rpb24iLCJyZXNvbHZlSGF2aW5nU2VjdGlvbiIsIm9yZGVyX2J5IiwicmVzb2x2ZU9yZGVyQnlTZWN0aW9uIiwibGltaXQiLCJWYWx1ZSIsIk51bWJlciIsIm9mZnNldCIsInZhbHVlIiwiam9pbiIsInJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlIiwicmVsYXRpb25fbm9kZSIsInRhYmxlX25hbWUiLCJUYWJsZSIsIm5hbWUiLCJhbGlhcyIsInF1b3RlIiwicHJlZml4IiwiYWRkVGFiVG9FdmVyeUxpbmUiLCJEZXJpdmVkIiwic3VicXVlcnkiLCJyZXBsYWNlIiwic2VsZWN0aW9uX25vZGUiLCJjb25kaXRpb25fdHlwZSIsImdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QiLCJjb25kaXRpb24iLCJnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QiLCJwcmVwYXJlQ29uZGl0aW9ucyIsIm9wIiwibWV0aG9kX25hbWUiLCJjb25kaXRpb25zIiwiYWRkUHJlZml4Mk1ldGhvZHMiLCJjb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4iLCJjb2x1bW4iLCJleHByIiwibGlzdCIsIm1hcCIsImkiLCJyZXNvbHZlVmFsdWUiLCJuZWdhdGVkIiwibGVmdF9jb25kaXRpb25fdHlwZSIsImxlZnQiLCJsZWZ0X2NvbmRpdGlvbiIsInJpZ2h0X2NvbmRpdGlvbl90eXBlIiwicmlnaHQiLCJyaWdodF9jb25kaXRpb24iLCJpbmNsdWRlcyIsIlN1YnF1ZXJ5IiwicGFyc2VGdW5jdGlvbk5vZGUiLCJGdW5jdGlvbiIsInRyYW5zZm9ybUJpbmFyeU9wIiwibG93IiwiaGlnaCIsIm9wZXJhdG9yX2J5X29wIiwidG9Mb3dlckNhc2UiLCJjYXBpdGFsaXplRmlyc3RMZXR0ZXIiLCJyZXMiLCJzZWxlY3RfaXRlbSIsInByb2plY3Rpb24iLCJFeHByV2l0aEFsaWFzIiwicmVzb2x2ZVNlbGVjdFNlY3Rpb25JdGVtIiwiVW5uYW1lZEV4cHIiLCJnZXRBY3R1YWxUYWJsZU5hbWUiLCJRdWFsaWZpZWRXaWxkY2FyZCIsIk9iamVjdCIsImtleXMiLCJhc3NlcnQiLCJpc1VuZGVmaW5lZE9yTnVsbCIsIml0ZW0iLCJmdW5jdGlvbl9ub2RlIiwibmVlZF9xdW90ZSIsImZ1bmN0aW9uX25hbWUiLCJhcmdzIiwiYXJnX2NvdW50IiwiYXJnIiwiVW5uYW1lZCIsIkV4cHIiLCJJZGVudGlmaWVyIiwiQ29tcG91bmRJZGVudGlmaWVyIiwiYXJnX2NvbHVtbiIsIk5lc3RlZCIsImRpc3RpbmN0IiwicGFyc2VCaW5hcnlPcE5vZGUiLCJCaW5hcnlPcCIsImpvaW5zIiwicGFyc2VCaW5hcnlPcFBhcnRpYWwiLCJsZWZ0X29yX3JpZ2h0IiwiYmluYXJ5X29wIiwic2VwYXJhdG9yIiwicHJlcGFyZUpvaW5zIiwiam9pbl9vcGVyYXRvcl90eXBlIiwiam9pbl9vcGVyYXRvciIsImpvaW5fbWV0aG9kIiwiT24iLCJzdWJfcXVlcnlfc3FsIiwic3ViX3F1ZXJ5X2FsaWFzIiwiam9pbmVkX3RhYmxlIiwiZnJvbV9pdGVtcyIsImNyb3NzX2pvaW5fc2VjdGlvbnMiLCJjcm9zc19qb2luX3N0ciIsImdyb3VwX2J5X2NvbHVtbnMiLCJncm91cF9ieV9pdGVtIiwiaGF2aW5nIiwib3JkZXJfYnlzIiwib3JkZXJfYnlfaXRlbSIsImFzYyIsInZhbHVlTm9kZSIsImlzU3RyaW5nIiwidmFsdWVfdHlwZSIsInRhYmxlX25hbWVfb3JfYWxpYXMiLCJpZGVudGlmaWVyIiwidmFsdWVzIiwiZmxhdCIsIm1zZyIsIm9iaiIsInByb3BlcnR5X25hbWVzIiwicmVkdWNlIiwiY2FycnkiLCJwcm9wZXJ0eV9uYW1lIiwiaGFzT3duUHJvcGVydHkiLCJTdHJpbmciLCJzdHJpbmciLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInVucXVvdGUiLCJKU09OIiwic3RyaW5naWZ5Iiwic3RyIiwidGFiX2NvdW50Iiwic3BsaXQiLCJ3YXNtIiwic2hvd05vdGlmaWNhdGlvbiIsIm1lc3NhZ2UiLCJ0eXBlIiwiZXhpc3RpbmdOb3RpZiIsImRvY3VtZW50IiwicXVlcnlTZWxlY3RvciIsInJlbW92ZSIsIm5vdGlmaWNhdGlvbiIsImNyZWF0ZUVsZW1lbnQiLCJjbGFzc05hbWUiLCJpbm5lckhUTUwiLCJ3cmFwcGVyIiwiaW5zZXJ0QmVmb3JlIiwiZmlyc3RDaGlsZCIsInNldFRpbWVvdXQiLCJzdHlsZSIsImFuaW1hdGlvbiIsImNvbnZlcnRlciIsImlucHV0IiwiZ2V0RWxlbWVudEJ5SWQiLCJjb252ZXJ0QnV0dG9uIiwidHJpbSIsIm91dHB1dF90ZXh0X2FyZWEiLCJzdGFydHNXaXRoIiwiY2xhc3NMaXN0IiwiYWRkIiwiZGlzYWJsZWQiLCJwYXJzZV9zcWwiLCJjb25zb2xlIiwibG9nIiwicGFyc2UiLCJRdWVyeSIsImUiLCJjb3B5VG9DbGlwYm9hcmQiLCJvdXRwdXQiLCJjb3B5QnV0dG9uIiwiY29weVRleHQiLCJjb3B5SWNvbiIsIm5hdmlnYXRvciIsImNsaXBib2FyZCIsIndyaXRlVGV4dCIsInRoZW4iLCJ0ZXh0Q29udGVudCIsIndpbmRvdyIsImFkZEV2ZW50TGlzdGVuZXIiLCJldmVudCIsInVybF9zZWFyY2hfcGFyYW1zIiwiVVJMU2VhcmNoUGFyYW1zIiwibG9jYXRpb24iLCJzZWFyY2giLCJoYXMiLCJhdG9iIiwiZ2V0IiwiY3RybEtleSIsIm1ldGFLZXkiLCJrZXkiLCJzaGFyZV9saW5rIiwib3JpZ2luIiwicGF0aG5hbWUiLCJidG9hIl0sInNvdXJjZVJvb3QiOiIifQ==