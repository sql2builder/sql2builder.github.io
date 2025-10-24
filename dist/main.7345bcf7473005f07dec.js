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
  padding: 0;
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

.github-link {
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  border-radius: var(--radius-sm);
  font-weight: 400;
  font-size: 0.875rem;
  transition: all 0.2s ease;
  z-index: 10;
}

.github-link:hover {
  background: rgba(255, 255, 255, 0.25);
  color: white;
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
`, "",{"version":3,"sources":["webpack://./src/style.css"],"names":[],"mappings":"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","sourcesContent":["/* Modern SQL to Laravel Builder - Custom Styles */\n\n:root {\n  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);\n  --success-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);\n  --dark-bg: #1a1a2e;\n  --card-bg: #ffffff;\n  --text-primary: #2d3748;\n  --text-secondary: #718096;\n  --border-color: #e2e8f0;\n  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.05);\n  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);\n  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);\n  --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.15);\n  --radius-sm: 8px;\n  --radius-md: 12px;\n  --radius-lg: 16px;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);\n  min-height: 100vh;\n}\n\n/* Hero Section Redesign */\n.hero.is-primary {\n  background: var(--primary-gradient);\n  position: relative;\n  overflow: hidden;\n  padding: 0;\n}\n\n.hero.is-primary::before {\n  content: '';\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\");\n  opacity: 0.3;\n}\n\n.hero-body {\n  position: relative;\n  z-index: 1;\n  padding: 1.5rem 1.5rem;\n}\n\n.hero .title {\n  font-size: 1.75rem;\n  font-weight: 700;\n  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);\n  letter-spacing: -0.5px;\n}\n\n.hero .subtitle {\n  font-size: 1rem;\n  opacity: 0.95;\n  margin-top: 0.5rem;\n}\n\n.github-link {\n  position: absolute;\n  top: 1rem;\n  right: 1.5rem;\n  display: inline-flex;\n  align-items: center;\n  gap: 0.25rem;\n  padding: 0.5rem 0.75rem;\n  background: rgba(255, 255, 255, 0.15);\n  color: rgba(255, 255, 255, 0.8);\n  text-decoration: none;\n  border-radius: var(--radius-sm);\n  font-weight: 400;\n  font-size: 0.875rem;\n  transition: all 0.2s ease;\n  z-index: 10;\n}\n\n.github-link:hover {\n  background: rgba(255, 255, 255, 0.25);\n  color: white;\n}\n\n.github-link::before {\n  content: '★';\n  font-size: 0.875rem;\n}\n\n/* Main Content Area */\n.content-wrapper {\n  max-width: 1400px;\n  margin: 0 auto;\n  padding: 2rem 1rem;\n}\n\n/* Converter Grid - Side by Side Layout */\n.converter-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 2rem;\n  margin-bottom: 2rem;\n  align-items: start;\n}\n\n.converter-card {\n  background: var(--card-bg);\n  border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-xl);\n  padding: 2rem;\n  transition: all 0.3s ease;\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n}\n\n.converter-card:hover {\n  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);\n}\n\n/* Section Headers */\n.section-header {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  margin-bottom: 1.5rem;\n  font-size: 1.125rem;\n  font-weight: 700;\n  color: var(--text-primary);\n}\n\n.section-icon {\n  width: 36px;\n  height: 36px;\n  border-radius: var(--radius-sm);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.125rem;\n  background: var(--primary-gradient);\n  color: white;\n  box-shadow: var(--shadow-md);\n  flex-shrink: 0;\n}\n\n/* Textarea Redesign */\n.textarea-wrapper {\n  position: relative;\n  margin-bottom: 1.5rem;\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n}\n\n.textarea {\n  border: 2px solid var(--border-color);\n  border-radius: var(--radius-md);\n  padding: 1.25rem;\n  font-size: 0.95rem;\n  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;\n  line-height: 1.6;\n  transition: all 0.3s ease;\n  resize: none;\n  height: 450px;\n  background: #f8fafc;\n  width: 100%;\n}\n\n.textarea:focus {\n  outline: none;\n  border-color: #667eea;\n  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);\n  background: white;\n}\n\n.textarea::placeholder {\n  color: #a0aec0;\n  font-style: italic;\n  font-size: 0.9rem;\n}\n\n/* Copy Button */\n.copy-button {\n  position: absolute;\n  top: 1rem;\n  right: 1rem;\n  padding: 0.625rem 1.25rem;\n  background: rgba(255, 255, 255, 0.95);\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-sm);\n  cursor: pointer;\n  font-size: 0.875rem;\n  font-weight: 600;\n  color: var(--text-secondary);\n  transition: all 0.2s ease;\n  z-index: 10;\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  backdrop-filter: blur(4px);\n  box-shadow: var(--shadow-sm);\n}\n\n.copy-button:hover {\n  background: #667eea;\n  color: white;\n  border-color: #667eea;\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-md);\n}\n\n.copy-button.copied {\n  background: #48bb78;\n  color: white;\n  border-color: #48bb78;\n}\n\n/* Button Controls */\n.button-controls {\n  display: flex;\n  gap: 1rem;\n  flex-wrap: wrap;\n  margin-top: auto;\n  padding-top: 0.5rem;\n}\n\n.button {\n  padding: 1rem 2.5rem;\n  border-radius: var(--radius-md);\n  font-weight: 700;\n  font-size: 1rem;\n  border: none;\n  cursor: pointer;\n  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 0.5rem;\n  position: relative;\n  overflow: hidden;\n  flex: 1;\n  min-width: 140px;\n}\n\n.button::before {\n  content: '';\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  width: 0;\n  height: 0;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.3);\n  transform: translate(-50%, -50%);\n  transition: width 0.6s, height 0.6s;\n}\n\n.button:hover::before {\n  width: 300px;\n  height: 300px;\n}\n\n.button.is-primary {\n  background: var(--primary-gradient);\n  color: white;\n  box-shadow: var(--shadow-md);\n}\n\n.button.is-primary:hover {\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n}\n\n.button.is-secondary {\n  background: white;\n  color: #667eea;\n  border: 2px solid #667eea;\n}\n\n.button.is-secondary:hover {\n  background: #667eea;\n  color: white;\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n}\n\n/* Loading Animation */\n.button.is-loading {\n  pointer-events: none;\n  opacity: 0.7;\n}\n\n.button.is-loading::after {\n  content: '';\n  position: absolute;\n  width: 16px;\n  height: 16px;\n  top: 50%;\n  left: 50%;\n  margin-left: -8px;\n  margin-top: -8px;\n  border: 2px solid transparent;\n  border-top-color: white;\n  border-radius: 50%;\n  animation: button-loading-spinner 0.6s linear infinite;\n}\n\n@keyframes button-loading-spinner {\n  from {\n    transform: rotate(0turn);\n  }\n  to {\n    transform: rotate(1turn);\n  }\n}\n\n/* Features Section */\n.features-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));\n  gap: 1.5rem;\n  margin-top: 2rem;\n  margin-bottom: 2rem;\n}\n\n.feature-card {\n  background: white;\n  padding: 1.5rem;\n  border-radius: var(--radius-md);\n  box-shadow: var(--shadow-md);\n  transition: all 0.3s ease;\n  border: 1px solid var(--border-color);\n}\n\n.feature-card:hover {\n  transform: translateY(-4px);\n  box-shadow: var(--shadow-lg);\n}\n\n.feature-icon {\n  width: 50px;\n  height: 50px;\n  border-radius: var(--radius-sm);\n  background: var(--primary-gradient);\n  color: white;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.5rem;\n  margin-bottom: 1rem;\n}\n\n.feature-title {\n  font-size: 1.125rem;\n  font-weight: 700;\n  color: var(--text-primary);\n  margin-bottom: 0.5rem;\n}\n\n.feature-description {\n  color: var(--text-secondary);\n  font-size: 0.9rem;\n  line-height: 1.6;\n}\n\n/* Footer */\n.modern-footer {\n  background: white;\n  padding: 2rem;\n  text-align: center;\n  margin-top: 4rem;\n  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);\n}\n\n.modern-footer p {\n  color: var(--text-secondary);\n  margin: 0;\n}\n\n.modern-footer a {\n  color: #667eea;\n  text-decoration: none;\n  font-weight: 600;\n}\n\n.modern-footer a:hover {\n  text-decoration: underline;\n}\n\n/* Animations */\n@keyframes fadeInUp {\n  from {\n    opacity: 0;\n    transform: translateY(20px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n.fade-in-up {\n  animation: fadeInUp 0.6s ease-out;\n}\n\n/* Success/Error Messages */\n.message-box {\n  padding: 1rem 1.5rem;\n  border-radius: var(--radius-md);\n  margin-bottom: 1rem;\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  animation: fadeInUp 0.3s ease-out;\n}\n\n.message-box.success {\n  background: #d4edda;\n  color: #155724;\n  border-left: 4px solid #28a745;\n}\n\n.message-box.error {\n  background: #f8d7da;\n  color: #721c24;\n  border-left: 4px solid #dc3545;\n}\n\n/* Responsive Design */\n@media (max-width: 1024px) {\n  .converter-grid {\n    grid-template-columns: 1fr;\n    gap: 1.5rem;\n  }\n\n  .content-wrapper {\n    max-width: 1200px;\n  }\n}\n\n@media (max-width: 768px) {\n  .hero .title {\n    font-size: 1.75rem;\n  }\n\n  .hero .subtitle {\n    font-size: 1rem;\n  }\n\n  .converter-card {\n    padding: 1.5rem;\n  }\n\n  .button-controls {\n    flex-direction: column;\n  }\n\n  .button {\n    width: 100%;\n    justify-content: center;\n  }\n\n\n  .features-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .textarea {\n    min-height: 150px;\n  }\n}\n\n/* Code Highlighting in Output */\n.textarea.code-output {\n  background: #1e293b;\n  color: #e2e8f0;\n  border-color: #334155;\n  font-size: 0.9rem;\n}\n\n.textarea.code-output:focus {\n  border-color: #667eea;\n  background: #1e293b;\n}\n\n.textarea.code-output::placeholder {\n  color: #64748b;\n}\n\n/* Utility Classes */\n.mt-1 { margin-top: 0.5rem; }\n.mt-2 { margin-top: 1rem; }\n.mt-3 { margin-top: 1.5rem; }\n.mt-4 { margin-top: 2rem; }\n\n.mb-1 { margin-bottom: 0.5rem; }\n.mb-2 { margin-bottom: 1rem; }\n.mb-3 { margin-bottom: 1.5rem; }\n.mb-4 { margin-bottom: 2rem; }\n\n.text-center { text-align: center; }\n.text-muted { color: var(--text-secondary); }\n"],"sourceRoot":""}]);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUEyQixDQUFDLDRGQUFxQztBQUMvRix5Q0FBeUMsc0ZBQStCO0FBQ3hFO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxvQkFBb0IsbUNBQW1DO0FBQ3ZEO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7O0FBR0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTtBQUNSLFFBQVE7O0FBRVIsUUFBUTtBQUNSLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTs7QUFFUixlQUFlO0FBQ2YsY0FBYztBQUNkLE9BQU8sd0ZBQXdGLE1BQU0sWUFBWSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxPQUFPLFlBQVksTUFBTSxZQUFZLGFBQWEsYUFBYSxXQUFXLE1BQU0sS0FBSyxVQUFVLFlBQVksV0FBVyxVQUFVLFVBQVUsVUFBVSxZQUFZLFdBQVcsTUFBTSxLQUFLLFlBQVksV0FBVyxZQUFZLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxVQUFVLFVBQVUsWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLFVBQVUsWUFBWSxhQUFhLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLFdBQVcsTUFBTSxLQUFLLFlBQVksV0FBVyxNQUFNLEtBQUssVUFBVSxZQUFZLE9BQU8sWUFBWSxNQUFNLFlBQVksV0FBVyxZQUFZLE9BQU8sWUFBWSxNQUFNLFVBQVUsWUFBWSxXQUFXLFlBQVksYUFBYSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsV0FBVyxZQUFZLFdBQVcsWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLE9BQU8sWUFBWSxNQUFNLFVBQVUsWUFBWSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsVUFBVSxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxXQUFXLFlBQVksV0FBVyxPQUFPLFlBQVksTUFBTSxZQUFZLGFBQWEsV0FBVyxVQUFVLFlBQVksT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsV0FBVyxVQUFVLFlBQVksV0FBVyxNQUFNLEtBQUssVUFBVSxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLGFBQWEsT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFVBQVUsWUFBWSxhQUFhLGFBQWEsYUFBYSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsV0FBVyxVQUFVLFlBQVksV0FBVyxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxZQUFZLE1BQU0sVUFBVSxVQUFVLFVBQVUsWUFBWSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxXQUFXLFVBQVUsVUFBVSxZQUFZLGFBQWEsYUFBYSxhQUFhLFdBQVcsWUFBWSxhQUFhLFdBQVcsWUFBWSxPQUFPLEtBQUssVUFBVSxZQUFZLFdBQVcsVUFBVSxVQUFVLFVBQVUsWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxVQUFVLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLE9BQU8sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksYUFBYSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsTUFBTSxLQUFLLFVBQVUsWUFBWSxXQUFXLFVBQVUsVUFBVSxVQUFVLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxLQUFLLFlBQVksTUFBTSxLQUFLLFlBQVksTUFBTSxNQUFNLFlBQVksTUFBTSxVQUFVLFlBQVksV0FBVyxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsT0FBTyxLQUFLLFVBQVUsVUFBVSxZQUFZLGFBQWEsV0FBVyxVQUFVLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLE9BQU8sVUFBVSxLQUFLLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxXQUFXLE1BQU0sS0FBSyxVQUFVLFlBQVksYUFBYSxPQUFPLEtBQUssWUFBWSxPQUFPLFVBQVUsS0FBSyxLQUFLLFVBQVUsWUFBWSxNQUFNLEtBQUssVUFBVSxZQUFZLE1BQU0sTUFBTSxLQUFLLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxhQUFhLGFBQWEsV0FBVyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLE9BQU8sWUFBWSxNQUFNLEtBQUssWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLE1BQU0sTUFBTSxLQUFLLEtBQUssWUFBWSxPQUFPLEtBQUssVUFBVSxPQUFPLEtBQUssVUFBVSxPQUFPLEtBQUssWUFBWSxPQUFPLEtBQUssVUFBVSxZQUFZLFFBQVEsS0FBSyxZQUFZLE9BQU8sS0FBSyxZQUFZ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LFlBQVc7SUFDdER6QyxnQkFBZ0IsQ0FBQyxpQ0FBaUMsRUFBRSxTQUFTLENBQUM7RUFDbEUsQ0FBQyxFQUFFLFlBQVc7SUFDVkEsZ0JBQWdCLENBQUMsMkJBQTJCLEVBQUUsT0FBTyxDQUFDO0VBQzFELENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQzs7QUFFRjtBQUNBSSxRQUFRLENBQUNlLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQ3lCLGdCQUFnQixDQUFDLE9BQU8sRUFBRVgsZUFBZSxDQUFDLEM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ3ZJakYsTUFBK0Y7QUFDL0YsTUFBcUY7QUFDckYsTUFBNEY7QUFDNUYsTUFBK0c7QUFDL0csTUFBd0c7QUFDeEcsTUFBd0c7QUFDeEcsTUFBbUc7QUFDbkc7QUFDQTs7QUFFQTs7QUFFQSw0QkFBNEIscUdBQW1CO0FBQy9DLHdCQUF3QixrSEFBYTtBQUNyQyxpQkFBaUIsdUdBQWE7QUFDOUIsaUJBQWlCLCtGQUFNO0FBQ3ZCLDZCQUE2QixzR0FBa0I7O0FBRS9DLGFBQWEsMEdBQUcsQ0FBQyxzRkFBTzs7OztBQUk2QztBQUNyRSxPQUFPLGlFQUFlLHNGQUFPLElBQUksc0ZBQU8sVUFBVSxzRkFBTyxtQkFBbUIsRUFBQyIsInNvdXJjZXMiOlsid2VicGFjazovL3NxbDJidWlsZGVyLmdpdGh1Yi5pby8uL3NyYy9jb252ZXJ0ZXIuanMiLCJ3ZWJwYWNrOi8vc3FsMmJ1aWxkZXIuZ2l0aHViLmlvLy4vc3JjL3N0eWxlLmNzcyIsIndlYnBhY2s6Ly9zcWwyYnVpbGRlci5naXRodWIuaW8vLi9zcmMvaW5kZXguanMiLCJ3ZWJwYWNrOi8vc3FsMmJ1aWxkZXIuZ2l0aHViLmlvLy4vc3JjL3N0eWxlLmNzcz83MTYzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjbGFzcyBDb252ZXJ0ZXJcbntcbiAgICBjb25zdHJ1Y3Rvcihhc3QsIHBhcmVudCA9IG51bGwpIHtcbiAgICAgICAgdGhpcy5hc3QgPSBhc3Q7XG4gICAgICAgIHRoaXMudGFibGVfbmFtZV9ieV9hbGlhcyA9IHt9O1xuICAgICAgICB0aGlzLnBhcmVudCA9IHBhcmVudDtcbiAgICB9XG5cbiAgICBydW4obmVlZF9hcHBlbmRfZ2V0X3N1ZmZpeCA9IHRydWUpIHtcbiAgICAgICAgbGV0IHNlY3Rpb25zID0gW11cblxuICAgICAgICBsZXQgZnJvbV9pdGVtID0gdGhpcy5hc3QuYm9keS5TZWxlY3QuZnJvbVswXTtcblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLnJlbGF0aW9uLCAnVGFibGUnKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVNYWluVGFibGVTZWN0aW9uKGZyb21faXRlbSkpO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbS5yZWxhdGlvbiwgJ0Rlcml2ZWQnKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVGcm9tU3ViU2VjdGlvbignREI6OnF1ZXJ5KCktPmZyb21TdWInKSwgZnJvbV9pdGVtKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIHJlbGF0aW9uIHR5cGUnO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGpvaW5fc2VjdGlvbiA9ICcnO1xuXG4gICAgICAgIC8vIFJlc29sdmUgJ2pvaW4nIHNlY3Rpb24gYmVmb3JlICd3aGVyZScgc2VjdGlvbiwgYmVjYXVzZSBuZWVkIGZpbmQgam9pbmVkIHRhYmxlIGFsaWFzXG4gICAgICAgIGlmICh0aGlzLmhhc0pvaW5TZWN0aW9uKGZyb21faXRlbSkpIHtcbiAgICAgICAgICAgIGpvaW5fc2VjdGlvbiA9IHRoaXMucmVzb2x2ZUpvaW5TZWN0aW9uKGZyb21faXRlbSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBIYXMgY3Jvc3Mgam9pblxuICAgICAgICBpZiAodGhpcy5hc3QuYm9keS5TZWxlY3QuZnJvbS5zbGljZSgxKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBzZWN0aW9ucyA9IHNlY3Rpb25zLmNvbmNhdCh0aGlzLnJlc29sdmVDcm9zc0pvaW5TZWN0aW9uKHRoaXMuYXN0LmJvZHkuU2VsZWN0LmZyb20uc2xpY2UoMSkpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlU2VsZWN0U2VjdGlvbigpKVxuXG4gICAgICAgIGlmIChqb2luX3NlY3Rpb24gIT09ICcnKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKGpvaW5fc2VjdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QuYm9keS5TZWxlY3QsICdzZWxlY3Rpb24nKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVXaGVyZVNlY3Rpb24odGhpcy5hc3QuYm9keS5TZWxlY3Quc2VsZWN0aW9uKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QuYm9keS5TZWxlY3QsICdncm91cF9ieScpICYmIHRoaXMuYXN0LmJvZHkuU2VsZWN0Lmdyb3VwX2J5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlR3JvdXBCeVNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdC5ib2R5LlNlbGVjdCwgJ2hhdmluZycpKSB7XG4gICAgICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVIYXZpbmdTZWN0aW9uKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LCAnb3JkZXJfYnknKSAmJiB0aGlzLmFzdC5vcmRlcl9ieS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZU9yZGVyQnlTZWN0aW9uKCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LCAnbGltaXQnKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCgnbGltaXQoJyArIHRoaXMuYXN0LmxpbWl0LlZhbHVlLk51bWJlclswXSArICcpJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QsICdvZmZzZXQnKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCgnb2Zmc2V0KCcgKyB0aGlzLmFzdC5vZmZzZXQudmFsdWUuVmFsdWUuTnVtYmVyWzBdICsgJyknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChuZWVkX2FwcGVuZF9nZXRfc3VmZml4KSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKCdnZXQoKTsnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzZWN0aW9ucy5qb2luKCdcXG4tPicpO1xuICAgIH1cblxuICAgIHJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlKHJlbGF0aW9uX25vZGUpIHtcbiAgICAgICAgICAgIGxldCB0YWJsZV9uYW1lID0gcmVsYXRpb25fbm9kZS5UYWJsZS5uYW1lWzBdLnZhbHVlO1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwocmVsYXRpb25fbm9kZS5UYWJsZSwgJ2FsaWFzJykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRhYmxlX25hbWVfYnlfYWxpYXNbcmVsYXRpb25fbm9kZS5UYWJsZS5hbGlhcy5uYW1lLnZhbHVlXSA9IHRhYmxlX25hbWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBxdW90ZSh0YWJsZV9uYW1lKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZU1haW5UYWJsZVNlY3Rpb24oZnJvbV9pdGVtKSB7XG4gICAgICAgIHJldHVybiAnREI6OnRhYmxlKCcgKyB0aGlzLnJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlKGZyb21faXRlbS5yZWxhdGlvbikgKyAnKSc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVGcm9tU3ViU2VjdGlvbihwcmVmaXgsIGZyb21faXRlbSkge1xuICAgICAgICByZXR1cm4gcHJlZml4ICsgJyhmdW5jdGlvbiAoJHF1ZXJ5KSB7XFxuJ1xuICAgICAgICAgICAgKyAnXFx0JyArIGFkZFRhYlRvRXZlcnlMaW5lKChuZXcgQ29udmVydGVyKGZyb21faXRlbS5yZWxhdGlvbi5EZXJpdmVkLnN1YnF1ZXJ5LCB0aGlzKS5ydW4oZmFsc2UpKS5yZXBsYWNlKCdEQjo6dGFibGUnLCAnJHF1ZXJ5LT5mcm9tJyksIDIpICsgJztcXG4nXG4gICAgICAgICAgICArICd9LCcgKyBxdW90ZShmcm9tX2l0ZW0ucmVsYXRpb24uRGVyaXZlZC5hbGlhcy5uYW1lLnZhbHVlKSArICcpJztcbiAgICB9XG5cbiAgICByZXNvbHZlV2hlcmVTZWN0aW9uKHNlbGVjdGlvbl9ub2RlKSB7XG4gICAgICAgIGxldCBjb25kaXRpb25fdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qoc2VsZWN0aW9uX25vZGUpO1xuICAgICAgICBsZXQgY29uZGl0aW9uID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KHNlbGVjdGlvbl9ub2RlKTtcblxuICAgICAgICByZXR1cm4gdGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhjb25kaXRpb25fdHlwZSwgY29uZGl0aW9uLCAnJywgJ3doZXJlJykuam9pbignXFxuLT4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gY29uZGl0aW9uX3R5cGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gY29uZGl0aW9uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wIG9uZSBvZiBbJycsICdBbmQnLCAnT3InXVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtZXRob2RfbmFtZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ1tdfVxuICAgICAqL1xuICAgIHByZXBhcmVDb25kaXRpb25zKGNvbmRpdGlvbl90eXBlLCBjb25kaXRpb24sIG9wLCBtZXRob2RfbmFtZSkge1xuICAgICAgICBsZXQgY29uZGl0aW9ucyA9IFtdO1xuXG4gICAgICAgIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0lzTnVsbCcgfHwgY29uZGl0aW9uX3R5cGUgPT09ICdJc05vdE51bGwnKSB7XG4gICAgICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBjb25kaXRpb25fdHlwZSA9PT0gJ0lzTnVsbCcgPyAnd2hlcmVOdWxsJyA6ICd3aGVyZU5vdE51bGwnO1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoJyArIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24pKSArICcpJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdJbkxpc3QnKSB7XG4gICAgICAgICAgICBsZXQgY29sdW1uID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSk7XG4gICAgICAgICAgICBsZXQgbGlzdCA9IGNvbmRpdGlvbi5saXN0Lm1hcCgoaSkgPT4gdGhpcy5yZXNvbHZlVmFsdWUoaS5WYWx1ZSkpO1xuXG4gICAgICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBjb25kaXRpb24ubmVnYXRlZCA/ICd3aGVyZU5vdEluJyA6ICd3aGVyZUluJztcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKCcgKyBjb2x1bW4gKyAnLCcgKyAnWycgKyBsaXN0LmpvaW4oJywgJykgKyAnXSknKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ05lc3RlZCcpIHtcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaChcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKGZ1bmN0aW9uICgkcXVlcnkpIHtcXG4nXG4gICAgICAgICAgICAgICAgKyAnXFx0JHF1ZXJ5LT4nICsgIGFkZFRhYlRvRXZlcnlMaW5lKHRoaXMucmVzb2x2ZVdoZXJlU2VjdGlvbihjb25kaXRpb24pLCAyKSArICc7XFxufSknXG4gICAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnQmluYXJ5T3AnKSB7XG4gICAgICAgICAgICBpZiAoY29uZGl0aW9uLm9wID09PSAnQW5kJyB8fCBjb25kaXRpb24ub3AgPT09ICdPcicpIHtcbiAgICAgICAgICAgICAgICBsZXQgbGVmdF9jb25kaXRpb25fdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoY29uZGl0aW9uLmxlZnQpO1xuICAgICAgICAgICAgICAgIGxldCBsZWZ0X2NvbmRpdGlvbiA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24ubGVmdCk7XG4gICAgICAgICAgICAgICAgY29uZGl0aW9ucyA9IGNvbmRpdGlvbnMuY29uY2F0KHRoaXMucHJlcGFyZUNvbmRpdGlvbnMobGVmdF9jb25kaXRpb25fdHlwZSwgbGVmdF9jb25kaXRpb24sIG9wLCBtZXRob2RfbmFtZSkpO1xuXG4gICAgICAgICAgICAgICAgbGV0IHJpZ2h0X2NvbmRpdGlvbl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChjb25kaXRpb24ucmlnaHQpO1xuICAgICAgICAgICAgICAgIGxldCByaWdodF9jb25kaXRpb24gPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLnJpZ2h0KTtcbiAgICAgICAgICAgICAgICBjb25kaXRpb25zID0gY29uZGl0aW9ucy5jb25jYXQodGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhyaWdodF9jb25kaXRpb25fdHlwZSwgcmlnaHRfY29uZGl0aW9uLCBjb25kaXRpb24ub3AsIG1ldGhvZF9uYW1lKSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGV0IGxlZnQgPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmxlZnQpKTtcbiAgICAgICAgICAgICAgICBsZXQgcmlnaHQ7XG5cbiAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoY29uZGl0aW9uLnJpZ2h0LCAnSWRlbnRpZmllcicsICdDb21wb3VuZElkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgICAgICByaWdodCA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24ucmlnaHQpKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobWV0aG9kX25hbWUuaW5jbHVkZXMoJ3doZXJlJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gJ0RCOjpyYXcoJyArIHJpZ2h0ICsgJyknO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChjb25kaXRpb24ucmlnaHQsICdWYWx1ZScpKSB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZF9uYW1lID0gJ3doZXJlJztcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSB0aGlzLnJlc29sdmVWYWx1ZShjb25kaXRpb24ucmlnaHQuVmFsdWUpXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChjb25kaXRpb24ucmlnaHQsICdTdWJxdWVyeScpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gJ2Z1bmN0aW9uKCRxdWVyeSkge1xcbidcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJ1xcdCcgKyBhZGRUYWJUb0V2ZXJ5TGluZSgobmV3IENvbnZlcnRlcihjb25kaXRpb24ucmlnaHQuU3VicXVlcnksIHRoaXMpLnJ1bihmYWxzZSkpLnJlcGxhY2UoJ0RCOjp0YWJsZScsICckcXVlcnktPmZyb20nKSwgMikgKyAnO1xcbidcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJ30nXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChjb25kaXRpb24ucmlnaHQsICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gJ0RCOjpyYXcoJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoY29uZGl0aW9uLnJpZ2h0LkZ1bmN0aW9uKSArICcpJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBjb25kaXRpb24ucmlnaHQgdHlwZTonICsgZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChjb25kaXRpb24ucmlnaHQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKCcgKyBsZWZ0ICsgJywnICsgcXVvdGUodGhpcy50cmFuc2Zvcm1CaW5hcnlPcChjb25kaXRpb24ub3ApKSArICcsJyArIHJpZ2h0ICsgJyknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0V4aXN0cycpIHtcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaChcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCAnd2hlcmVFeGlzdHMnKSArICcoZnVuY3Rpb24gKCRxdWVyeSkge1xcbicgK1xuICAgICAgICAgICAgICAgICdcXHQnICsgIGFkZFRhYlRvRXZlcnlMaW5lKChuZXcgQ29udmVydGVyKGNvbmRpdGlvbiwgdGhpcykpLnJ1bihmYWxzZSksIDIpLnJlcGxhY2UoJ0RCOjp0YWJsZScsICckcXVlcnktPmZyb20nKSArICc7XFxuJyArXG4gICAgICAgICAgICAgICAgJ30nXG4gICAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnQmV0d2VlbicpIHtcbiAgICAgICAgICAgIGxldCBtZXRob2RfbmFtZSA9IGNvbmRpdGlvbi5uZWdhdGVkID09PSB0cnVlID8gJ3doZXJlTm90QmV0d2VlbicgOiAnd2hlcmVCZXR3ZWVuJztcblxuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICB0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKCdcbiAgICAgICAgICAgICAgKyB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpKSArICcsJ1xuICAgICAgICAgICAgICArICdbJyArIHRoaXMucmVzb2x2ZVZhbHVlKGNvbmRpdGlvbi5sb3cuVmFsdWUpICsgJywnICsgdGhpcy5yZXNvbHZlVmFsdWUoY29uZGl0aW9uLmhpZ2guVmFsdWUpICsgJ10pJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0luU3VicXVlcnknKSB7XG4gICAgICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBjb25kaXRpb24ubmVnYXRlZCA9PT0gdHJ1ZSA/ICd3aGVyZU5vdEluJyA6ICd3aGVyZUluJztcblxuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICB0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSlcbiAgICAgICAgICAgICAgKyAnKCcgKyB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpKSArICcsJyArICcoZnVuY3Rpb24gKCRxdWVyeSkge1xcbidcbiAgICAgICAgICAgICAgKyAnXFx0JyArIGFkZFRhYlRvRXZlcnlMaW5lKChuZXcgQ29udmVydGVyKGNvbmRpdGlvbi5zdWJxdWVyeSwgdGhpcykpLnJ1bihmYWxzZSksIDIpLnJlcGxhY2UoJ0RCOjp0YWJsZScsICckcXVlcnktPmZyb20nKSArICc7XFxuJ1xuICAgICAgICAgICAgICArICd9J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoREI6OnJhdyhcIicgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGNvbmRpdGlvbiwgZmFsc2UpICsgJ1wiKSknKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ1VuYXJ5T3AnKSB7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSwgZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSwgb3AsIG1ldGhvZF9uYW1lKVswXS5yZXBsYWNlKC93aGVyZS9pLCAnd2hlcmUnICsgY29uZGl0aW9uLm9wKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBjb25kaXRpb24gdHlwZSBbJyArIGNvbmRpdGlvbl90eXBlICsgJ10nO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNvbmRpdGlvbnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIG9wXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHRyYW5zZm9ybUJpbmFyeU9wKG9wKSB7XG4gICAgICAgIGxldCBvcGVyYXRvcl9ieV9vcCA9IHtcbiAgICAgICAgICAgICdFcSc6ICc9JyxcbiAgICAgICAgICAgICdHdCc6ICc+JyxcbiAgICAgICAgICAgICdHdEVxJzogJz49JyxcbiAgICAgICAgICAgICdMdCc6ICc8JyxcbiAgICAgICAgICAgICdMdEVxJzogJzwnLFxuICAgICAgICAgICAgJ05vdEVxJzogJyE9JyxcbiAgICAgICAgICAgICdMaWtlJzogJ2xpa2UnLFxuICAgICAgICAgICAgJ01pbnVzJzogJy0nLFxuICAgICAgICAgICAgJ1BsdXMnOiAnKycsXG4gICAgICAgICAgICAnTXVsdGlwbHknOiAnKicsXG4gICAgICAgICAgICAnRGl2aWRlJzogJy8nXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG9wZXJhdG9yX2J5X29wW29wXTtcbiAgICB9XG5cbiAgICBhZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpIHtcbiAgICAgICAgaWYgKG9wID09PSAnJyB8fCBvcCA9PT0gJ0FuZCcpIHtcbiAgICAgICAgICAgIHJldHVybiBtZXRob2RfbmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvcC50b0xvd2VyQ2FzZSgpICsgY2FwaXRhbGl6ZUZpcnN0TGV0dGVyKG1ldGhvZF9uYW1lKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZVNlbGVjdFNlY3Rpb24oKSB7XG4gICAgICAgIGxldCByZXMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdF9pdGVtIG9mIHRoaXMuYXN0LmJvZHkuU2VsZWN0LnByb2plY3Rpb24pIHtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChzZWxlY3RfaXRlbSwgJ0V4cHJXaXRoQWxpYXMnKSkge1xuICAgICAgICAgICAgICAgIGxldCBhbGlhcyA9IHNlbGVjdF9pdGVtLkV4cHJXaXRoQWxpYXMuYWxpYXMudmFsdWU7XG4gICAgICAgICAgICAgICAgcmVzLnB1c2godGhpcy5yZXNvbHZlU2VsZWN0U2VjdGlvbkl0ZW0oc2VsZWN0X2l0ZW0uRXhwcldpdGhBbGlhcy5leHByLCBhbGlhcykpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChzZWxlY3RfaXRlbSwgJ1VubmFtZWRFeHByJykpIHtcbiAgICAgICAgICAgICAgICByZXMucHVzaCh0aGlzLnJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbShzZWxlY3RfaXRlbS5Vbm5hbWVkRXhwcikpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzZWxlY3RfaXRlbSA9PT0gJ1dpbGRjYXJkJykge1xuICAgICAgICAgICAgICAgIHJlcy5wdXNoKHF1b3RlKCcqJykpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChzZWxlY3RfaXRlbSwgJ1F1YWxpZmllZFdpbGRjYXJkJykpIHtcbiAgICAgICAgICAgICAgICByZXMucHVzaChxdW90ZSh0aGlzLmdldEFjdHVhbFRhYmxlTmFtZShzZWxlY3RfaXRlbS5RdWFsaWZpZWRXaWxkY2FyZFswXS52YWx1ZSkgKyAnLionKSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgc2VsZWN0IGl0ZW0gWycgKyBPYmplY3Qua2V5cyhzZWxlY3RfaXRlbSlbMF0gKyAnXSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gJ3NlbGVjdCgnICsgcmVzLmpvaW4oJywgJykgKyAnKSc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHNlbGVjdF9pdGVtXG4gICAgICogQHBhcmFtIGFsaWFzXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbShzZWxlY3RfaXRlbSwgYWxpYXMgPSBudWxsKSB7XG4gICAgICAgIGFzc2VydChpc1VuZGVmaW5lZE9yTnVsbChzZWxlY3RfaXRlbSkgPT09IGZhbHNlLCAnc2VsZWN0X2l0ZW0gbXVzdCBub3QgYmUgdW5kZWZpbmVkIG9yIG51bGwnKTtcblxuICAgICAgICBsZXQgaXRlbTtcbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHNlbGVjdF9pdGVtLCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgaXRlbSA9ICdEQjo6cmF3KFwiJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoc2VsZWN0X2l0ZW0uRnVuY3Rpb24pO1xuXG4gICAgICAgICAgICBpZiAoYWxpYXMgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpdGVtID0gaXRlbSArICcgYXMgJyArIGFsaWFzICsgJ1wiKSc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBpdGVtO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaXRlbSA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChzZWxlY3RfaXRlbSksIGZhbHNlKTtcblxuICAgICAgICAgICAgaWYgKGFsaWFzICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaXRlbSA9IGl0ZW0gKyAnIGFzICcgKyBhbGlhcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHF1b3RlKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcGFyc2VGdW5jdGlvbk5vZGUoZnVuY3Rpb25fbm9kZSwgbmVlZF9xdW90ZSA9IHRydWUpIHtcbiAgICAgICAgbGV0IGZ1bmN0aW9uX25hbWUgPSBmdW5jdGlvbl9ub2RlLm5hbWVbMF0udmFsdWU7XG5cbiAgICAgICAgaWYgKG5lZWRfcXVvdGUpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uX25hbWUgPSBxdW90ZShmdW5jdGlvbl9uYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCByZXMgPSBmdW5jdGlvbl9uYW1lICsgJygnO1xuICAgICAgICBsZXQgYXJncyA9IGZ1bmN0aW9uX25vZGUuYXJncztcbiAgICAgICAgbGV0IGFyZ19jb3VudCA9IGFyZ3MubGVuZ3RoO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXJnX2NvdW50OyBpKyspIHtcbiAgICAgICAgICAgIGxldCBhcmcgPSBhcmdzW2ldO1xuXG4gICAgICAgICAgICBpZiAoYXJnLlVubmFtZWQgPT09ICdXaWxkY2FyZCcpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyAnKic7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdWYWx1ZScpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgdGhpcy5yZXNvbHZlVmFsdWUoYXJnLlVubmFtZWQuRXhwci5WYWx1ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyBhcmcuVW5uYW1lZC5FeHByLklkZW50aWZpZXIudmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdDb21wb3VuZElkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGFyZy5Vbm5hbWVkLkV4cHIuQ29tcG91bmRJZGVudGlmaWVyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ05lc3RlZCcpKSB7IC8vIGUuZy4gQ09VTlQoRElTVElOQ1QoJ2lkJykpXG4gICAgICAgICAgICAgICAgbGV0IGFyZ19jb2x1bW4gPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoYXJnLlVubmFtZWQuRXhwci5OZXN0ZWQpKTtcblxuICAgICAgICAgICAgICAgIGlmIChmdW5jdGlvbl9ub2RlLmRpc3RpbmN0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ19jb2x1bW4gPSAnRElTVElOQ1QoJyArIGFyZ19jb2x1bW4gKyAnKSc7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgYXJnX2NvbHVtbjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGFyZy5Vbm5hbWVkLkV4cHIuRnVuY3Rpb24sIGZhbHNlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0JpbmFyeU9wJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyB0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKGFyZy5Vbm5hbWVkLkV4cHIuQmluYXJ5T3ApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnVW5hcnlPcCcpKSB7XG4gICAgICAgICAgICAgICAgLy8gdG9kb1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnQ2FzZScpKSB7XG4gICAgICAgICAgICAgICAgLy8gdG9kb1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBhcmcgdHlwZTonICsgZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChhcmcuVW5uYW1lZC5FeHByKTtcbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBpZiAoaSAhPT0gYXJnX2NvdW50IC0gMSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArICcsICc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXMgPSByZXMgKyAnKSc7XG5cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGhhc0pvaW5TZWN0aW9uKGZyb21faXRlbSkge1xuICAgICAgICByZXR1cm4gcHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLCAnam9pbnMnKSAmJiBmcm9tX2l0ZW0uam9pbnMubGVuZ3RoID4gMDtcbiAgICB9XG5cbiAgICBwYXJzZUJpbmFyeU9wUGFydGlhbChsZWZ0X29yX3JpZ2h0KSB7XG4gICAgICAgIGxldCByZXM7XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICByZXMgPSBxdW90ZSh0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGxlZnRfb3JfcmlnaHQuRnVuY3Rpb24pKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnSWRlbnRpZmllcicsICdDb21wb3VuZElkZW50aWZpZXInKSl7XG4gICAgICAgICAgICByZXMgPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QobGVmdF9vcl9yaWdodCkpO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdWYWx1ZScpKSB7XG4gICAgICAgICAgICByZXMgPSB0aGlzLnJlc29sdmVWYWx1ZShsZWZ0X29yX3JpZ2h0LlZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnQmluYXJ5T3AnKSkge1xuICAgICAgICAgICAgcmVzID0gdGhpcy5wYXJzZUJpbmFyeU9wTm9kZShsZWZ0X29yX3JpZ2h0LkJpbmFyeU9wKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnU3VicXVlcnknKSkge1xuICAgICAgICAgICAgLy8gdG9kb1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgdHlwZSBpbiBiaW5hcnkgb3AgbGVmdCBvciByaWdodC4nO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG5cbiAgICBwYXJzZUJpbmFyeU9wTm9kZShiaW5hcnlfb3AsIHNlcGFyYXRvciA9ICcgJykge1xuICAgICAgICBsZXQgbGVmdCA9IHRoaXMucGFyc2VCaW5hcnlPcFBhcnRpYWwoYmluYXJ5X29wLmxlZnQpO1xuICAgICAgICBsZXQgb3AgPSBxdW90ZSh0aGlzLnRyYW5zZm9ybUJpbmFyeU9wKGJpbmFyeV9vcC5vcCkpO1xuICAgICAgICBsZXQgcmlnaHQgPSB0aGlzLnBhcnNlQmluYXJ5T3BQYXJ0aWFsKGJpbmFyeV9vcC5yaWdodCk7XG5cbiAgICAgICAgcmV0dXJuIFtsZWZ0LCBvcCwgcmlnaHRdLmpvaW4oc2VwYXJhdG9yKTtcbiAgICB9XG5cbiAgICBwcmVwYXJlSm9pbnMoZnJvbV9pdGVtKSB7XG4gICAgICAgIGxldCBqb2lucyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3Qgam9pbiBvZiBmcm9tX2l0ZW0uam9pbnMpIHtcbiAgICAgICAgICAgIGxldCBqb2luX29wZXJhdG9yX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGpvaW4uam9pbl9vcGVyYXRvcik7XG4gICAgICAgICAgICBsZXQgam9pbl9tZXRob2QgPSB7XG4gICAgICAgICAgICAgICAgJ0lubmVyJzogJ2pvaW4nLFxuICAgICAgICAgICAgICAgICdMZWZ0T3V0ZXInOiAnbGVmdEpvaW4nLFxuICAgICAgICAgICAgICAgICdSaWdodE91dGVyJzogJ3JpZ2h0Sm9pbicsXG4gICAgICAgICAgICB9W2pvaW5fb3BlcmF0b3JfdHlwZV07XG4gICAgICAgICAgICBsZXQgam9pbl9vcGVyYXRvciA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChqb2luLmpvaW5fb3BlcmF0b3IpO1xuICAgICAgICAgICAgbGV0IGNvbmRpdGlvbl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChqb2luX29wZXJhdG9yLk9uKTtcbiAgICAgICAgICAgIGxldCBjb25kaXRpb24gPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qoam9pbl9vcGVyYXRvci5Pbik7XG4gICAgICAgICAgICBsZXQgY29uZGl0aW9ucyA9IHRoaXMucHJlcGFyZUNvbmRpdGlvbnMoY29uZGl0aW9uX3R5cGUsIGNvbmRpdGlvbiwgJycsICdvbicpO1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoam9pbi5yZWxhdGlvbiwgJ0Rlcml2ZWQnKSkgeyAvLyBqb2luZWQgc2VjdGlvbiBpcyBzdWItcXVlcnlcbiAgICAgICAgICAgICAgICBsZXQgc3ViX3F1ZXJ5X3NxbCA9IG5ldyBDb252ZXJ0ZXIoam9pbi5yZWxhdGlvbi5EZXJpdmVkLnN1YnF1ZXJ5LCB0aGlzKS5ydW4oZmFsc2UpO1xuICAgICAgICAgICAgICAgIGxldCBzdWJfcXVlcnlfYWxpYXMgPSBqb2luLnJlbGF0aW9uLkRlcml2ZWQuYWxpYXMubmFtZS52YWx1ZTtcbiAgICAgICAgICAgICAgICBqb2lucy5wdXNoKGpvaW5fbWV0aG9kICsgJyhEQjo6cmF3KFwiJyArIGFkZFRhYlRvRXZlcnlMaW5lKHN1Yl9xdWVyeV9zcWwpICsgJ1wiKSBhcyAnXG4gICAgICAgICAgICAgICAgICAgICsgc3ViX3F1ZXJ5X2FsaWFzICsgJyksIGZ1bmN0aW9uKCRqb2luKSB7XFxuXFx0J1xuICAgICAgICAgICAgICAgICAgICArICckam9pbi0+JyArIGFkZFRhYlRvRXZlcnlMaW5lKGNvbmRpdGlvbnMuam9pbignXFxuLT4nKSArICc7JywgMilcbiAgICAgICAgICAgICAgICAgICAgKyAnXFxufScpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChqb2luLnJlbGF0aW9uLCAnVGFibGUnKSkge1xuICAgICAgICAgICAgICAgIGxldCBqb2luZWRfdGFibGUgPSB0aGlzLnJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlKGpvaW4ucmVsYXRpb24pO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbnMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChqb2luX29wZXJhdG9yLk9uLCAnQmluYXJ5T3AnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgam9pbnMucHVzaChqb2luX21ldGhvZCArICcoJyArIGpvaW5lZF90YWJsZSArICcsJyArIHRoaXMucGFyc2VCaW5hcnlPcE5vZGUoam9pbl9vcGVyYXRvci5Pbi5CaW5hcnlPcCwgJywnKSArICcpJyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoam9pbl9vcGVyYXRvci5PbiwgJ05lc3RlZCcpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBjb25kaXRpb25zID0gdGhpcy5wcmVwYXJlQ29uZGl0aW9ucygnTmVzdGVkJywgam9pbl9vcGVyYXRvci5Pbi5OZXN0ZWQsICcnLCAnb24nKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgam9pbnMucHVzaChjb25kaXRpb25zWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIG9uIHR5cGUnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgam9pbnMucHVzaChqb2luX21ldGhvZCArICcoJyArIGpvaW5lZF90YWJsZSArICcsJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnZnVuY3Rpb24oJGpvaW4pIHtcXG5cXHQnXG4gICAgICAgICAgICAgICAgICAgICAgICArICckam9pbi0+JyArIGFkZFRhYlRvRXZlcnlMaW5lKGNvbmRpdGlvbnMuam9pbignXFxuLT4nKSkgKyAnOydcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJ1xcbn0pJ1xuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgam9pbiByZWxhdGlvbiB0eXBlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBqb2lucztcbiAgICB9XG5cbiAgICByZXNvbHZlSm9pblNlY3Rpb24oZnJvbV9pdGVtKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnByZXBhcmVKb2lucyhmcm9tX2l0ZW0pLmpvaW4oJ1xcbi0+Jyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIGZyb21faXRlbXNcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmdbXX1cbiAgICAgKi9cbiAgICByZXNvbHZlQ3Jvc3NKb2luU2VjdGlvbihmcm9tX2l0ZW1zKSB7XG4gICAgICAgIGxldCBjcm9zc19qb2luX3NlY3Rpb25zID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBmcm9tX2l0ZW0gb2YgZnJvbV9pdGVtcykge1xuICAgICAgICAgICAgbGV0IGNyb3NzX2pvaW5fc3RyO1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLnJlbGF0aW9uLCAnVGFibGUnKSkge1xuICAgICAgICAgICAgICAgIGNyb3NzX2pvaW5fc3RyID0gJ2Nyb3NzSm9pbignICsgdGhpcy5yZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZShmcm9tX2l0ZW0ucmVsYXRpb24pO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0ucmVsYXRpb24sICdEZXJpdmVkJykpIHtcbiAgICAgICAgICAgICAgICBjcm9zc19qb2luX3N0ciA9IHRoaXMucmVzb2x2ZUZyb21TdWJTZWN0aW9uKCdjcm9zc0pvaW5TdWInLCBmcm9tX2l0ZW0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBjcm9zcyBqb2luIHJlbGF0aW9uIHR5cGUnO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjcm9zc19qb2luX3NlY3Rpb25zLnB1c2goY3Jvc3Nfam9pbl9zdHIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNyb3NzX2pvaW5fc2VjdGlvbnM7XG4gICAgfVxuXG4gICAgcmVzb2x2ZUdyb3VwQnlTZWN0aW9uKCkge1xuICAgICAgICBsZXQgZ3JvdXBfYnlfY29sdW1ucyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgZ3JvdXBfYnlfaXRlbSBvZiB0aGlzLmFzdC5ib2R5LlNlbGVjdC5ncm91cF9ieSkge1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGdyb3VwX2J5X2l0ZW0sICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBfYnlfY29sdW1ucy5wdXNoKCdEQjo6cmF3KCcgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGdyb3VwX2J5X2l0ZW0uRnVuY3Rpb24pICsgJ1wiKScpO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGdyb3VwX2J5X2l0ZW0sICdJZGVudGlmaWVyJywgJ0NvbXBvdW5kSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBfYnlfY29sdW1ucy5wdXNoKHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChncm91cF9ieV9pdGVtKSkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChncm91cF9ieV9pdGVtLCAnTmVzdGVkJykpIHtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZ3JvdXBfYnlfaXRlbSwgJ1ZhbHVlJykpIHtcbiAgICAgICAgICAgICAgICBncm91cF9ieV9jb2x1bW5zLnB1c2godGhpcy5yZXNvbHZlVmFsdWUoZ3JvdXBfYnlfaXRlbS5WYWx1ZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBncm91cCBieSB0eXBlOicgKyBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGdyb3VwX2J5X2l0ZW0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICdncm91cEJ5KCcgKyBncm91cF9ieV9jb2x1bW5zLmpvaW4oJywnKSArICcpJztcbiAgICB9XG5cbiAgICByZXNvbHZlSGF2aW5nU2VjdGlvbigpIHtcbiAgICAgICAgbGV0IGJpbmFyeV9vcCA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdCh0aGlzLmFzdC5ib2R5LlNlbGVjdC5oYXZpbmcsICdCaW5hcnlPcCcpO1xuICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChiaW5hcnlfb3AubGVmdCwgJ0Z1bmN0aW9uJykgPyAnaGF2aW5nUmF3JyA6ICdoYXZpbmcnO1xuXG4gICAgICAgIHJldHVybiBtZXRob2RfbmFtZSArICcoJyArIHRoaXMucGFyc2VCaW5hcnlPcE5vZGUoYmluYXJ5X29wLCAnLCcpICsgJyknO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZU9yZGVyQnlTZWN0aW9uKCkge1xuICAgICAgICBsZXQgb3JkZXJfYnlzID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBvcmRlcl9ieV9pdGVtIG9mIHRoaXMuYXN0Lm9yZGVyX2J5KSB7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwob3JkZXJfYnlfaXRlbS5leHByLCAnQmluYXJ5T3AnKSkge1xuICAgICAgICAgICAgICAgIG9yZGVyX2J5cy5wdXNoKCdvcmRlckJ5UmF3KCcgKyBxdW90ZSh0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKG9yZGVyX2J5X2l0ZW0uZXhwci5CaW5hcnlPcCkpICsgJyknKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwob3JkZXJfYnlfaXRlbS5leHByLCAnSWRlbnRpZmllcicsICdDb21wb3VuZElkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgIG9yZGVyX2J5cy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAnb3JkZXJCeSgnICtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KG9yZGVyX2J5X2l0ZW0uZXhwcikpICsgJywnICtcbiAgICAgICAgICAgICAgICAgICAgcXVvdGUob3JkZXJfYnlfaXRlbS5hc2MgPT09IGZhbHNlID8gJ2Rlc2MnOiAnYXNjJykgKyAnKSdcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChvcmRlcl9ieV9pdGVtLmV4cHIsICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgb3JkZXJfYnlzLnB1c2goJ29yZGVyQnlSYXcoXCInICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShvcmRlcl9ieV9pdGVtLmV4cHIuRnVuY3Rpb24pICsgJyAnICsgKG9yZGVyX2J5X2l0ZW0uYXNjID09PSBmYWxzZSA/ICdkZXNjJzogJ2FzYycpICsgJ1wiKScpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBvcmRlciBieSB0eXBlOicgKyBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KG9yZGVyX2J5X2l0ZW0uZXhwcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3JkZXJfYnlzLmpvaW4oJ1xcbi0+Jyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHZhbHVlTm9kZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ3wqfVxuICAgICAqL1xuICAgIHJlc29sdmVWYWx1ZSh2YWx1ZU5vZGUpIHtcbiAgICAgICAgaWYgKGlzU3RyaW5nKHZhbHVlTm9kZSkgJiYgdmFsdWVOb2RlLnRvTG93ZXJDYXNlKCkgPT09ICdudWxsJykge1xuICAgICAgICAgICAgcmV0dXJuICdudWxsJztcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB2YWx1ZSA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdCh2YWx1ZU5vZGUpO1xuICAgICAgICBsZXQgdmFsdWVfdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QodmFsdWVOb2RlKTtcblxuICAgICAgICBpZiAodmFsdWVfdHlwZSA9PT0gJ1NpbmdsZVF1b3RlZFN0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBxdW90ZSh2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVfdHlwZSA9PT0gJ051bWJlcicpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVswXTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZV90eXBlID09PSAnQ29tcG91bmRJZGVudGlmaWVyJyB8fCB2YWx1ZV90eXBlID09PSAnSWRlbnRpZmllcicpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbih2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVfdHlwZSA9PT0gJ0Jvb2xlYW4nKSB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgYXJnIHZhbHVlIHR5cGU6JyArIHZhbHVlX3R5cGU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRBY3R1YWxUYWJsZU5hbWUodGFibGVfbmFtZV9vcl9hbGlhcykge1xuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy50YWJsZV9uYW1lX2J5X2FsaWFzLCB0YWJsZV9uYW1lX29yX2FsaWFzKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMudGFibGVfbmFtZV9ieV9hbGlhc1t0YWJsZV9uYW1lX29yX2FsaWFzXTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBhcmVudCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZ2V0QWN0dWFsVGFibGVOYW1lKHRhYmxlX25hbWVfb3JfYWxpYXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRhYmxlX25hbWVfb3JfYWxpYXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIGlkZW50aWZpZXJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IG5lZWRfcXVvdGVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGlkZW50aWZpZXIsIG5lZWRfcXVvdGUgPSB0cnVlKSB7XG4gICAgICAgIGxldCB2YWx1ZXMgPSBbaWRlbnRpZmllcl0uZmxhdCgpLm1hcCgoaSkgPT4gaS52YWx1ZSk7XG4gICAgICAgIGxldCB0YWJsZV9uYW1lX29yX2FsaWFzID0gdmFsdWVzWzBdO1xuXG4gICAgICAgIC8vIEZpcnN0IGluZGV4IGFsd2F5cyBpcyB0YWJsZSBuYW1lIG9yIGFsaWFzLCBjaGFuZ2UgaXQgdG8gYWN0dWFsIHRhYmxlIG5hbWUuXG4gICAgICAgIHZhbHVlc1swXSA9IHRoaXMuZ2V0QWN0dWFsVGFibGVOYW1lKHRhYmxlX25hbWVfb3JfYWxpYXMpO1xuXG4gICAgICAgIGxldCByZXMgPSB2YWx1ZXMuam9pbignLicpO1xuXG4gICAgICAgIGlmIChuZWVkX3F1b3RlKSB7XG4gICAgICAgICAgICByZXMgPSBxdW90ZShyZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG59XG5cbi8qKlxuICogQHBhcmFtIHtib29sZWFufSBjb25kaXRpb25cbiAqIEBwYXJhbSB7c3RyaW5nfSBtc2dcbiAqL1xuZnVuY3Rpb24gYXNzZXJ0KGNvbmRpdGlvbiwgbXNnKSB7XG4gICAgaWYgKCFjb25kaXRpb24pIHtcbiAgICAgICAgdGhyb3cgbXNnO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAcGFyYW0gb2JqXG4gKiBAcGFyYW0gcHJvcGVydHlfbmFtZXNcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKG9iaiwgLi4ucHJvcGVydHlfbmFtZXMpIHtcbiAgICByZXR1cm4gcHJvcGVydHlfbmFtZXMucmVkdWNlKChjYXJyeSwgcHJvcGVydHlfbmFtZSkgPT4gY2FycnkgfHwgKG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wZXJ0eV9uYW1lKSAmJiBvYmpbcHJvcGVydHlfbmFtZV0gIT09IG51bGwpLCBmYWxzZSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHZhbHVlXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5mdW5jdGlvbiBpc1N0cmluZyh2YWx1ZSkge1xuICAgIHJldHVybiAgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIFN0cmluZztcbn1cblxuZnVuY3Rpb24gY2FwaXRhbGl6ZUZpcnN0TGV0dGVyKHN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmcuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzdHJpbmcuc2xpY2UoMSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHZhbHVlXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIHF1b3RlKHZhbHVlKSB7XG4gICAgcmV0dXJuIFwiJ1wiICsgdmFsdWUgKyBcIidcIjtcbn1cblxuLyoqXG4gKiBAcGFyYW0gdmFsdWVcbiAqIEByZXR1cm5zIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIHVucXVvdGUodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWydcIl0rL2csICcnKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gb2JqXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qob2JqKSB7XG4gICAgaWYgKE9iamVjdC5rZXlzKG9iaikubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgIHRocm93ICdUaGUgZnVuY3Rpb24gY2FuIG9ubHkgYmUgY2FsbGVkIG9uIG9iamVjdCB0aGF0IGhhcyBvbmUga2V5LCBvYmplY3Q6ICcgKyBKU09OLnN0cmluZ2lmeShvYmopO1xuICAgIH1cblxuICAgIHJldHVybiBPYmplY3Qua2V5cyhvYmopWzBdO1xufVxuXG4vKipcbiAqIEBwYXJhbSBvYmpcbiAqIEByZXR1cm4geyp9XG4gKi9cbmZ1bmN0aW9uIGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChvYmopIHtcbiAgICByZXR1cm4gb2JqW2dldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qob2JqKV07XG59XG5cbi8qKlxuICogQHBhcmFtIHZhbHVlXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5mdW5jdGlvbiBpc1VuZGVmaW5lZE9yTnVsbCh2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnIHx8IHZhbHVlID09PSBudWxsO1xufVxuXG4vKipcbiAqIEBwYXJhbSBzdHJcbiAqIEBwYXJhbSB0YWJfY291bnRcbiAqL1xuZnVuY3Rpb24gYWRkVGFiVG9FdmVyeUxpbmUoc3RyLCB0YWJfY291bnQgPSAxKSB7XG4gICAgbGV0IHNlcGFyYXRvciA9ICdcXG4nO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0YWJfY291bnQ7IGkrKykge1xuICAgICAgICBzZXBhcmF0b3IgPSBzZXBhcmF0b3IgKyAnXFx0JztcbiAgICB9XG5cbiAgICByZXR1cm4gc3RyLnNwbGl0KCdcXG4nKS5qb2luKHNlcGFyYXRvcik7XG59XG5cbiIsIi8vIEltcG9ydHNcbmltcG9ydCBfX19DU1NfTE9BREVSX0FQSV9TT1VSQ0VNQVBfSU1QT1JUX19fIGZyb20gXCIuLi9ub2RlX21vZHVsZXMvY3NzLWxvYWRlci9kaXN0L3J1bnRpbWUvc291cmNlTWFwcy5qc1wiO1xuaW1wb3J0IF9fX0NTU19MT0FERVJfQVBJX0lNUE9SVF9fXyBmcm9tIFwiLi4vbm9kZV9tb2R1bGVzL2Nzcy1sb2FkZXIvZGlzdC9ydW50aW1lL2FwaS5qc1wiO1xuaW1wb3J0IF9fX0NTU19MT0FERVJfR0VUX1VSTF9JTVBPUlRfX18gZnJvbSBcIi4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvcnVudGltZS9nZXRVcmwuanNcIjtcbnZhciBfX19DU1NfTE9BREVSX1VSTF9JTVBPUlRfMF9fXyA9IG5ldyBVUkwoXCJkYXRhOmltYWdlL3N2Zyt4bWwsJTNDc3ZnIHdpZHRoPSUyNzYwJTI3IGhlaWdodD0lMjc2MCUyNyB2aWV3Qm94PSUyNzAgMCA2MCA2MCUyNyB4bWxucz0lMjdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyUyNyUzRSUzQ2cgZmlsbD0lMjdub25lJTI3IGZpbGwtcnVsZT0lMjdldmVub2RkJTI3JTNFJTNDZyBmaWxsPSUyNyUyM2ZmZmZmZiUyNyBmaWxsLW9wYWNpdHk9JTI3MC4wNSUyNyUzRSUzQ3BhdGggZD0lMjdNMzYgMzR2LTRoLTJ2NGgtNHYyaDR2NGgydi00aDR2LTJoLTR6bTAtMzBWMGgtMnY0aC00djJoNHY0aDJWNmg0VjRoLTR6TTYgMzR2LTRINHY0SDB2Mmg0djRoMnYtNGg0di0ySDZ6TTYgNFYwSDR2NEgwdjJoNHY0aDJWNmg0VjRINnolMjcvJTNFJTNDL2clM0UlM0MvZyUzRSUzQy9zdmclM0VcIiwgaW1wb3J0Lm1ldGEudXJsKTtcbnZhciBfX19DU1NfTE9BREVSX0VYUE9SVF9fXyA9IF9fX0NTU19MT0FERVJfQVBJX0lNUE9SVF9fXyhfX19DU1NfTE9BREVSX0FQSV9TT1VSQ0VNQVBfSU1QT1JUX19fKTtcbnZhciBfX19DU1NfTE9BREVSX1VSTF9SRVBMQUNFTUVOVF8wX19fID0gX19fQ1NTX0xPQURFUl9HRVRfVVJMX0lNUE9SVF9fXyhfX19DU1NfTE9BREVSX1VSTF9JTVBPUlRfMF9fXyk7XG4vLyBNb2R1bGVcbl9fX0NTU19MT0FERVJfRVhQT1JUX19fLnB1c2goW21vZHVsZS5pZCwgYC8qIE1vZGVybiBTUUwgdG8gTGFyYXZlbCBCdWlsZGVyIC0gQ3VzdG9tIFN0eWxlcyAqL1xuXG46cm9vdCB7XG4gIC0tcHJpbWFyeS1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzY2N2VlYSAwJSwgIzc2NGJhMiAxMDAlKTtcbiAgLS1zZWNvbmRhcnktZ3JhZGllbnQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICNmMDkzZmIgMCUsICNmNTU3NmMgMTAwJSk7XG4gIC0tc3VjY2Vzcy1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzRmYWNmZSAwJSwgIzAwZjJmZSAxMDAlKTtcbiAgLS1kYXJrLWJnOiAjMWExYTJlO1xuICAtLWNhcmQtYmc6ICNmZmZmZmY7XG4gIC0tdGV4dC1wcmltYXJ5OiAjMmQzNzQ4O1xuICAtLXRleHQtc2Vjb25kYXJ5OiAjNzE4MDk2O1xuICAtLWJvcmRlci1jb2xvcjogI2UyZThmMDtcbiAgLS1zaGFkb3ctc206IDAgMnB4IDRweCByZ2JhKDAsIDAsIDAsIDAuMDUpO1xuICAtLXNoYWRvdy1tZDogMCA0cHggNnB4IHJnYmEoMCwgMCwgMCwgMC4wNyk7XG4gIC0tc2hhZG93LWxnOiAwIDEwcHggMjVweCByZ2JhKDAsIDAsIDAsIDAuMSk7XG4gIC0tc2hhZG93LXhsOiAwIDIwcHggNDBweCByZ2JhKDAsIDAsIDAsIDAuMTUpO1xuICAtLXJhZGl1cy1zbTogOHB4O1xuICAtLXJhZGl1cy1tZDogMTJweDtcbiAgLS1yYWRpdXMtbGc6IDE2cHg7XG59XG5cbioge1xuICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xufVxuXG5ib2R5IHtcbiAgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgJ1NlZ29lIFVJJywgJ1JvYm90bycsICdPeHlnZW4nLCAnVWJ1bnR1JywgJ0NhbnRhcmVsbCcsICdGaXJhIFNhbnMnLCAnRHJvaWQgU2FucycsICdIZWx2ZXRpY2EgTmV1ZScsIHNhbnMtc2VyaWY7XG4gIC13ZWJraXQtZm9udC1zbW9vdGhpbmc6IGFudGlhbGlhc2VkO1xuICAtbW96LW9zeC1mb250LXNtb290aGluZzogZ3JheXNjYWxlO1xuICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZjVmN2ZhIDAlLCAjYzNjZmUyIDEwMCUpO1xuICBtaW4taGVpZ2h0OiAxMDB2aDtcbn1cblxuLyogSGVybyBTZWN0aW9uIFJlZGVzaWduICovXG4uaGVyby5pcy1wcmltYXJ5IHtcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgcGFkZGluZzogMDtcbn1cblxuLmhlcm8uaXMtcHJpbWFyeTo6YmVmb3JlIHtcbiAgY29udGVudDogJyc7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiAwO1xuICBsZWZ0OiAwO1xuICByaWdodDogMDtcbiAgYm90dG9tOiAwO1xuICBiYWNrZ3JvdW5kOiB1cmwoJHtfX19DU1NfTE9BREVSX1VSTF9SRVBMQUNFTUVOVF8wX19ffSk7XG4gIG9wYWNpdHk6IDAuMztcbn1cblxuLmhlcm8tYm9keSB7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgei1pbmRleDogMTtcbiAgcGFkZGluZzogMS41cmVtIDEuNXJlbTtcbn1cblxuLmhlcm8gLnRpdGxlIHtcbiAgZm9udC1zaXplOiAxLjc1cmVtO1xuICBmb250LXdlaWdodDogNzAwO1xuICB0ZXh0LXNoYWRvdzogMCAycHggMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7XG4gIGxldHRlci1zcGFjaW5nOiAtMC41cHg7XG59XG5cbi5oZXJvIC5zdWJ0aXRsZSB7XG4gIGZvbnQtc2l6ZTogMXJlbTtcbiAgb3BhY2l0eTogMC45NTtcbiAgbWFyZ2luLXRvcDogMC41cmVtO1xufVxuXG4uZ2l0aHViLWxpbmsge1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogMXJlbTtcbiAgcmlnaHQ6IDEuNXJlbTtcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGdhcDogMC4yNXJlbTtcbiAgcGFkZGluZzogMC41cmVtIDAuNzVyZW07XG4gIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xNSk7XG4gIGNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuOCk7XG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgZm9udC13ZWlnaHQ6IDQwMDtcbiAgZm9udC1zaXplOiAwLjg3NXJlbTtcbiAgdHJhbnNpdGlvbjogYWxsIDAuMnMgZWFzZTtcbiAgei1pbmRleDogMTA7XG59XG5cbi5naXRodWItbGluazpob3ZlciB7XG4gIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4yNSk7XG4gIGNvbG9yOiB3aGl0ZTtcbn1cblxuLmdpdGh1Yi1saW5rOjpiZWZvcmUge1xuICBjb250ZW50OiAn4piFJztcbiAgZm9udC1zaXplOiAwLjg3NXJlbTtcbn1cblxuLyogTWFpbiBDb250ZW50IEFyZWEgKi9cbi5jb250ZW50LXdyYXBwZXIge1xuICBtYXgtd2lkdGg6IDE0MDBweDtcbiAgbWFyZ2luOiAwIGF1dG87XG4gIHBhZGRpbmc6IDJyZW0gMXJlbTtcbn1cblxuLyogQ29udmVydGVyIEdyaWQgLSBTaWRlIGJ5IFNpZGUgTGF5b3V0ICovXG4uY29udmVydGVyLWdyaWQge1xuICBkaXNwbGF5OiBncmlkO1xuICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmciAxZnI7XG4gIGdhcDogMnJlbTtcbiAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbiAgYWxpZ24taXRlbXM6IHN0YXJ0O1xufVxuXG4uY29udmVydGVyLWNhcmQge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLWxnKTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXhsKTtcbiAgcGFkZGluZzogMnJlbTtcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgZWFzZTtcbiAgZGlzcGxheTogZmxleDtcbiAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgaGVpZ2h0OiAxMDAlO1xufVxuXG4uY29udmVydGVyLWNhcmQ6aG92ZXIge1xuICBib3gtc2hhZG93OiAwIDI1cHggNTBweCByZ2JhKDAsIDAsIDAsIDAuMik7XG59XG5cbi8qIFNlY3Rpb24gSGVhZGVycyAqL1xuLnNlY3Rpb24taGVhZGVyIHtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjc1cmVtO1xuICBtYXJnaW4tYm90dG9tOiAxLjVyZW07XG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xufVxuXG4uc2VjdGlvbi1pY29uIHtcbiAgd2lkdGg6IDM2cHg7XG4gIGhlaWdodDogMzZweDtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xuICBjb2xvcjogd2hpdGU7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG4gIGZsZXgtc2hyaW5rOiAwO1xufVxuXG4vKiBUZXh0YXJlYSBSZWRlc2lnbiAqL1xuLnRleHRhcmVhLXdyYXBwZXIge1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIG1hcmdpbi1ib3R0b206IDEuNXJlbTtcbiAgZmxleDogMTtcbiAgZGlzcGxheTogZmxleDtcbiAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbn1cblxuLnRleHRhcmVhIHtcbiAgYm9yZGVyOiAycHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcbiAgcGFkZGluZzogMS4yNXJlbTtcbiAgZm9udC1zaXplOiAwLjk1cmVtO1xuICBmb250LWZhbWlseTogJ01vbmFjbycsICdNZW5sbycsICdVYnVudHUgTW9ubycsICdDb25zb2xhcycsICdzb3VyY2UtY29kZS1wcm8nLCBtb25vc3BhY2U7XG4gIGxpbmUtaGVpZ2h0OiAxLjY7XG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XG4gIHJlc2l6ZTogbm9uZTtcbiAgaGVpZ2h0OiA0NTBweDtcbiAgYmFja2dyb3VuZDogI2Y4ZmFmYztcbiAgd2lkdGg6IDEwMCU7XG59XG5cbi50ZXh0YXJlYTpmb2N1cyB7XG4gIG91dGxpbmU6IG5vbmU7XG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcbiAgYm94LXNoYWRvdzogMCAwIDAgM3B4IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG59XG5cbi50ZXh0YXJlYTo6cGxhY2Vob2xkZXIge1xuICBjb2xvcjogI2EwYWVjMDtcbiAgZm9udC1zdHlsZTogaXRhbGljO1xuICBmb250LXNpemU6IDAuOXJlbTtcbn1cblxuLyogQ29weSBCdXR0b24gKi9cbi5jb3B5LWJ1dHRvbiB7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiAxcmVtO1xuICByaWdodDogMXJlbTtcbiAgcGFkZGluZzogMC42MjVyZW0gMS4yNXJlbTtcbiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjk1KTtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgY3Vyc29yOiBwb2ludGVyO1xuICBmb250LXNpemU6IDAuODc1cmVtO1xuICBmb250LXdlaWdodDogNjAwO1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4ycyBlYXNlO1xuICB6LWluZGV4OiAxMDtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjVyZW07XG4gIGJhY2tkcm9wLWZpbHRlcjogYmx1cig0cHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctc20pO1xufVxuXG4uY29weS1idXR0b246aG92ZXIge1xuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xuICBjb2xvcjogd2hpdGU7XG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uY29weS1idXR0b24uY29waWVkIHtcbiAgYmFja2dyb3VuZDogIzQ4YmI3ODtcbiAgY29sb3I6IHdoaXRlO1xuICBib3JkZXItY29sb3I6ICM0OGJiNzg7XG59XG5cbi8qIEJ1dHRvbiBDb250cm9scyAqL1xuLmJ1dHRvbi1jb250cm9scyB7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGdhcDogMXJlbTtcbiAgZmxleC13cmFwOiB3cmFwO1xuICBtYXJnaW4tdG9wOiBhdXRvO1xuICBwYWRkaW5nLXRvcDogMC41cmVtO1xufVxuXG4uYnV0dG9uIHtcbiAgcGFkZGluZzogMXJlbSAyLjVyZW07XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGZvbnQtc2l6ZTogMXJlbTtcbiAgYm9yZGVyOiBub25lO1xuICBjdXJzb3I6IHBvaW50ZXI7XG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XG4gIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgZ2FwOiAwLjVyZW07XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgZmxleDogMTtcbiAgbWluLXdpZHRoOiAxNDBweDtcbn1cblxuLmJ1dHRvbjo6YmVmb3JlIHtcbiAgY29udGVudDogJyc7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiA1MCU7XG4gIGxlZnQ6IDUwJTtcbiAgd2lkdGg6IDA7XG4gIGhlaWdodDogMDtcbiAgYm9yZGVyLXJhZGl1czogNTAlO1xuICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7XG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsIC01MCUpO1xuICB0cmFuc2l0aW9uOiB3aWR0aCAwLjZzLCBoZWlnaHQgMC42cztcbn1cblxuLmJ1dHRvbjpob3Zlcjo6YmVmb3JlIHtcbiAgd2lkdGg6IDMwMHB4O1xuICBoZWlnaHQ6IDMwMHB4O1xufVxuXG4uYnV0dG9uLmlzLXByaW1hcnkge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgY29sb3I6IHdoaXRlO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uYnV0dG9uLmlzLXByaW1hcnk6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTJweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG59XG5cbi5idXR0b24uaXMtc2Vjb25kYXJ5IHtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG4gIGNvbG9yOiAjNjY3ZWVhO1xuICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xufVxuXG4uYnV0dG9uLmlzLXNlY29uZGFyeTpob3ZlciB7XG4gIGJhY2tncm91bmQ6ICM2NjdlZWE7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xufVxuXG4vKiBMb2FkaW5nIEFuaW1hdGlvbiAqL1xuLmJ1dHRvbi5pcy1sb2FkaW5nIHtcbiAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gIG9wYWNpdHk6IDAuNztcbn1cblxuLmJ1dHRvbi5pcy1sb2FkaW5nOjphZnRlciB7XG4gIGNvbnRlbnQ6ICcnO1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHdpZHRoOiAxNnB4O1xuICBoZWlnaHQ6IDE2cHg7XG4gIHRvcDogNTAlO1xuICBsZWZ0OiA1MCU7XG4gIG1hcmdpbi1sZWZ0OiAtOHB4O1xuICBtYXJnaW4tdG9wOiAtOHB4O1xuICBib3JkZXI6IDJweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgYm9yZGVyLXRvcC1jb2xvcjogd2hpdGU7XG4gIGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgYW5pbWF0aW9uOiBidXR0b24tbG9hZGluZy1zcGlubmVyIDAuNnMgbGluZWFyIGluZmluaXRlO1xufVxuXG5Aa2V5ZnJhbWVzIGJ1dHRvbi1sb2FkaW5nLXNwaW5uZXIge1xuICBmcm9tIHtcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgwdHVybik7XG4gIH1cbiAgdG8ge1xuICAgIHRyYW5zZm9ybTogcm90YXRlKDF0dXJuKTtcbiAgfVxufVxuXG4vKiBGZWF0dXJlcyBTZWN0aW9uICovXG4uZmVhdHVyZXMtZ3JpZCB7XG4gIGRpc3BsYXk6IGdyaWQ7XG4gIGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KGF1dG8tZml0LCBtaW5tYXgoMjUwcHgsIDFmcikpO1xuICBnYXA6IDEuNXJlbTtcbiAgbWFyZ2luLXRvcDogMnJlbTtcbiAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbn1cblxuLmZlYXR1cmUtY2FyZCB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBwYWRkaW5nOiAxLjVyZW07XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XG59XG5cbi5mZWF0dXJlLWNhcmQ6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTRweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG59XG5cbi5mZWF0dXJlLWljb24ge1xuICB3aWR0aDogNTBweDtcbiAgaGVpZ2h0OiA1MHB4O1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgY29sb3I6IHdoaXRlO1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgZm9udC1zaXplOiAxLjVyZW07XG4gIG1hcmdpbi1ib3R0b206IDFyZW07XG59XG5cbi5mZWF0dXJlLXRpdGxlIHtcbiAgZm9udC1zaXplOiAxLjEyNXJlbTtcbiAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSk7XG4gIG1hcmdpbi1ib3R0b206IDAuNXJlbTtcbn1cblxuLmZlYXR1cmUtZGVzY3JpcHRpb24ge1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICBmb250LXNpemU6IDAuOXJlbTtcbiAgbGluZS1oZWlnaHQ6IDEuNjtcbn1cblxuLyogRm9vdGVyICovXG4ubW9kZXJuLWZvb3RlciB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBwYWRkaW5nOiAycmVtO1xuICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gIG1hcmdpbi10b3A6IDRyZW07XG4gIGJveC1zaGFkb3c6IDAgLTJweCAxMHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG59XG5cbi5tb2Rlcm4tZm9vdGVyIHAge1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICBtYXJnaW46IDA7XG59XG5cbi5tb2Rlcm4tZm9vdGVyIGEge1xuICBjb2xvcjogIzY2N2VlYTtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICBmb250LXdlaWdodDogNjAwO1xufVxuXG4ubW9kZXJuLWZvb3RlciBhOmhvdmVyIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG59XG5cbi8qIEFuaW1hdGlvbnMgKi9cbkBrZXlmcmFtZXMgZmFkZUluVXAge1xuICBmcm9tIHtcbiAgICBvcGFjaXR5OiAwO1xuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgyMHB4KTtcbiAgfVxuICB0byB7XG4gICAgb3BhY2l0eTogMTtcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7XG4gIH1cbn1cblxuLmZhZGUtaW4tdXAge1xuICBhbmltYXRpb246IGZhZGVJblVwIDAuNnMgZWFzZS1vdXQ7XG59XG5cbi8qIFN1Y2Nlc3MvRXJyb3IgTWVzc2FnZXMgKi9cbi5tZXNzYWdlLWJveCB7XG4gIHBhZGRpbmc6IDFyZW0gMS41cmVtO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBnYXA6IDAuNzVyZW07XG4gIGFuaW1hdGlvbjogZmFkZUluVXAgMC4zcyBlYXNlLW91dDtcbn1cblxuLm1lc3NhZ2UtYm94LnN1Y2Nlc3Mge1xuICBiYWNrZ3JvdW5kOiAjZDRlZGRhO1xuICBjb2xvcjogIzE1NTcyNDtcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjMjhhNzQ1O1xufVxuXG4ubWVzc2FnZS1ib3guZXJyb3Ige1xuICBiYWNrZ3JvdW5kOiAjZjhkN2RhO1xuICBjb2xvcjogIzcyMWMyNDtcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjZGMzNTQ1O1xufVxuXG4vKiBSZXNwb25zaXZlIERlc2lnbiAqL1xuQG1lZGlhIChtYXgtd2lkdGg6IDEwMjRweCkge1xuICAuY29udmVydGVyLWdyaWQge1xuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyO1xuICAgIGdhcDogMS41cmVtO1xuICB9XG5cbiAgLmNvbnRlbnQtd3JhcHBlciB7XG4gICAgbWF4LXdpZHRoOiAxMjAwcHg7XG4gIH1cbn1cblxuQG1lZGlhIChtYXgtd2lkdGg6IDc2OHB4KSB7XG4gIC5oZXJvIC50aXRsZSB7XG4gICAgZm9udC1zaXplOiAxLjc1cmVtO1xuICB9XG5cbiAgLmhlcm8gLnN1YnRpdGxlIHtcbiAgICBmb250LXNpemU6IDFyZW07XG4gIH1cblxuICAuY29udmVydGVyLWNhcmQge1xuICAgIHBhZGRpbmc6IDEuNXJlbTtcbiAgfVxuXG4gIC5idXR0b24tY29udHJvbHMge1xuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIH1cblxuICAuYnV0dG9uIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgfVxuXG5cbiAgLmZlYXR1cmVzLWdyaWQge1xuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyO1xuICB9XG5cbiAgLnRleHRhcmVhIHtcbiAgICBtaW4taGVpZ2h0OiAxNTBweDtcbiAgfVxufVxuXG4vKiBDb2RlIEhpZ2hsaWdodGluZyBpbiBPdXRwdXQgKi9cbi50ZXh0YXJlYS5jb2RlLW91dHB1dCB7XG4gIGJhY2tncm91bmQ6ICMxZTI5M2I7XG4gIGNvbG9yOiAjZTJlOGYwO1xuICBib3JkZXItY29sb3I6ICMzMzQxNTU7XG4gIGZvbnQtc2l6ZTogMC45cmVtO1xufVxuXG4udGV4dGFyZWEuY29kZS1vdXRwdXQ6Zm9jdXMge1xuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XG4gIGJhY2tncm91bmQ6ICMxZTI5M2I7XG59XG5cbi50ZXh0YXJlYS5jb2RlLW91dHB1dDo6cGxhY2Vob2xkZXIge1xuICBjb2xvcjogIzY0NzQ4Yjtcbn1cblxuLyogVXRpbGl0eSBDbGFzc2VzICovXG4ubXQtMSB7IG1hcmdpbi10b3A6IDAuNXJlbTsgfVxuLm10LTIgeyBtYXJnaW4tdG9wOiAxcmVtOyB9XG4ubXQtMyB7IG1hcmdpbi10b3A6IDEuNXJlbTsgfVxuLm10LTQgeyBtYXJnaW4tdG9wOiAycmVtOyB9XG5cbi5tYi0xIHsgbWFyZ2luLWJvdHRvbTogMC41cmVtOyB9XG4ubWItMiB7IG1hcmdpbi1ib3R0b206IDFyZW07IH1cbi5tYi0zIHsgbWFyZ2luLWJvdHRvbTogMS41cmVtOyB9XG4ubWItNCB7IG1hcmdpbi1ib3R0b206IDJyZW07IH1cblxuLnRleHQtY2VudGVyIHsgdGV4dC1hbGlnbjogY2VudGVyOyB9XG4udGV4dC1tdXRlZCB7IGNvbG9yOiB2YXIoLS10ZXh0LXNlY29uZGFyeSk7IH1cbmAsIFwiXCIse1widmVyc2lvblwiOjMsXCJzb3VyY2VzXCI6W1wid2VicGFjazovLy4vc3JjL3N0eWxlLmNzc1wiXSxcIm5hbWVzXCI6W10sXCJtYXBwaW5nc1wiOlwiQUFBQSxrREFBa0Q7O0FBRWxEO0VBQ0UscUVBQXFFO0VBQ3JFLHVFQUF1RTtFQUN2RSxxRUFBcUU7RUFDckUsa0JBQWtCO0VBQ2xCLGtCQUFrQjtFQUNsQix1QkFBdUI7RUFDdkIseUJBQXlCO0VBQ3pCLHVCQUF1QjtFQUN2QiwwQ0FBMEM7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dmVsIEJ1aWxkZXIgLSBDdXN0b20gU3R5bGVzICovXFxuXFxuOnJvb3Qge1xcbiAgLS1wcmltYXJ5LWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjY3ZWVhIDAlLCAjNzY0YmEyIDEwMCUpO1xcbiAgLS1zZWNvbmRhcnktZ3JhZGllbnQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICNmMDkzZmIgMCUsICNmNTU3NmMgMTAwJSk7XFxuICAtLXN1Y2Nlc3MtZ3JhZGllbnQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM0ZmFjZmUgMCUsICMwMGYyZmUgMTAwJSk7XFxuICAtLWRhcmstYmc6ICMxYTFhMmU7XFxuICAtLWNhcmQtYmc6ICNmZmZmZmY7XFxuICAtLXRleHQtcHJpbWFyeTogIzJkMzc0ODtcXG4gIC0tdGV4dC1zZWNvbmRhcnk6ICM3MTgwOTY7XFxuICAtLWJvcmRlci1jb2xvcjogI2UyZThmMDtcXG4gIC0tc2hhZG93LXNtOiAwIDJweCA0cHggcmdiYSgwLCAwLCAwLCAwLjA1KTtcXG4gIC0tc2hhZG93LW1kOiAwIDRweCA2cHggcmdiYSgwLCAwLCAwLCAwLjA3KTtcXG4gIC0tc2hhZG93LWxnOiAwIDEwcHggMjVweCByZ2JhKDAsIDAsIDAsIDAuMSk7XFxuICAtLXNoYWRvdy14bDogMCAyMHB4IDQwcHggcmdiYSgwLCAwLCAwLCAwLjE1KTtcXG4gIC0tcmFkaXVzLXNtOiA4cHg7XFxuICAtLXJhZGl1cy1tZDogMTJweDtcXG4gIC0tcmFkaXVzLWxnOiAxNnB4O1xcbn1cXG5cXG4qIHtcXG4gIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XFxufVxcblxcbmJvZHkge1xcbiAgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgJ1NlZ29lIFVJJywgJ1JvYm90bycsICdPeHlnZW4nLCAnVWJ1bnR1JywgJ0NhbnRhcmVsbCcsICdGaXJhIFNhbnMnLCAnRHJvaWQgU2FucycsICdIZWx2ZXRpY2EgTmV1ZScsIHNhbnMtc2VyaWY7XFxuICAtd2Via2l0LWZvbnQtc21vb3RoaW5nOiBhbnRpYWxpYXNlZDtcXG4gIC1tb3otb3N4LWZvbnQtc21vb3RoaW5nOiBncmF5c2NhbGU7XFxuICBiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZjVmN2ZhIDAlLCAjYzNjZmUyIDEwMCUpO1xcbiAgbWluLWhlaWdodDogMTAwdmg7XFxufVxcblxcbi8qIEhlcm8gU2VjdGlvbiBSZWRlc2lnbiAqL1xcbi5oZXJvLmlzLXByaW1hcnkge1xcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICBvdmVyZmxvdzogaGlkZGVuO1xcbiAgcGFkZGluZzogMDtcXG59XFxuXFxuLmhlcm8uaXMtcHJpbWFyeTo6YmVmb3JlIHtcXG4gIGNvbnRlbnQ6ICcnO1xcbiAgcG9zaXRpb246IGFic29sdXRlO1xcbiAgdG9wOiAwO1xcbiAgbGVmdDogMDtcXG4gIHJpZ2h0OiAwO1xcbiAgYm90dG9tOiAwO1xcbiAgYmFja2dyb3VuZDogdXJsKFxcXCJkYXRhOmltYWdlL3N2Zyt4bWwsJTNDc3ZnIHdpZHRoPSc2MCcgaGVpZ2h0PSc2MCcgdmlld0JveD0nMCAwIDYwIDYwJyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnJTNFJTNDZyBmaWxsPSdub25lJyBmaWxsLXJ1bGU9J2V2ZW5vZGQnJTNFJTNDZyBmaWxsPSclMjNmZmZmZmYnIGZpbGwtb3BhY2l0eT0nMC4wNSclM0UlM0NwYXRoIGQ9J00zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMlY2aDRWNGgtNHpNNiAzNHYtNEg0djRIMHYyaDR2NGgydi00aDR2LTJINnpNNiA0VjBINHY0SDB2Mmg0djRoMlY2aDRWNEg2eicvJTNFJTNDL2clM0UlM0MvZyUzRSUzQy9zdmclM0VcXFwiKTtcXG4gIG9wYWNpdHk6IDAuMztcXG59XFxuXFxuLmhlcm8tYm9keSB7XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICB6LWluZGV4OiAxO1xcbiAgcGFkZGluZzogMS41cmVtIDEuNXJlbTtcXG59XFxuXFxuLmhlcm8gLnRpdGxlIHtcXG4gIGZvbnQtc2l6ZTogMS43NXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA3MDA7XFxuICB0ZXh0LXNoYWRvdzogMCAycHggMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7XFxuICBsZXR0ZXItc3BhY2luZzogLTAuNXB4O1xcbn1cXG5cXG4uaGVybyAuc3VidGl0bGUge1xcbiAgZm9udC1zaXplOiAxcmVtO1xcbiAgb3BhY2l0eTogMC45NTtcXG4gIG1hcmdpbi10b3A6IDAuNXJlbTtcXG59XFxuXFxuLmdpdGh1Yi1saW5rIHtcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogMXJlbTtcXG4gIHJpZ2h0OiAxLjVyZW07XFxuICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBnYXA6IDAuMjVyZW07XFxuICBwYWRkaW5nOiAwLjVyZW0gMC43NXJlbTtcXG4gIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC4xNSk7XFxuICBjb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjgpO1xcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcXG4gIGZvbnQtd2VpZ2h0OiA0MDA7XFxuICBmb250LXNpemU6IDAuODc1cmVtO1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuMnMgZWFzZTtcXG4gIHotaW5kZXg6IDEwO1xcbn1cXG5cXG4uZ2l0aHViLWxpbms6aG92ZXIge1xcbiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjI1KTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG59XFxuXFxuLmdpdGh1Yi1saW5rOjpiZWZvcmUge1xcbiAgY29udGVudDogJ+KYhSc7XFxuICBmb250LXNpemU6IDAuODc1cmVtO1xcbn1cXG5cXG4vKiBNYWluIENvbnRlbnQgQXJlYSAqL1xcbi5jb250ZW50LXdyYXBwZXIge1xcbiAgbWF4LXdpZHRoOiAxNDAwcHg7XFxuICBtYXJnaW46IDAgYXV0bztcXG4gIHBhZGRpbmc6IDJyZW0gMXJlbTtcXG59XFxuXFxuLyogQ29udmVydGVyIEdyaWQgLSBTaWRlIGJ5IFNpZGUgTGF5b3V0ICovXFxuLmNvbnZlcnRlci1ncmlkIHtcXG4gIGRpc3BsYXk6IGdyaWQ7XFxuICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmciAxZnI7XFxuICBnYXA6IDJyZW07XFxuICBtYXJnaW4tYm90dG9tOiAycmVtO1xcbiAgYWxpZ24taXRlbXM6IHN0YXJ0O1xcbn1cXG5cXG4uY29udmVydGVyLWNhcmQge1xcbiAgYmFja2dyb3VuZDogdmFyKC0tY2FyZC1iZyk7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbGcpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXhsKTtcXG4gIHBhZGRpbmc6IDJyZW07XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XFxuICBoZWlnaHQ6IDEwMCU7XFxufVxcblxcbi5jb252ZXJ0ZXItY2FyZDpob3ZlciB7XFxuICBib3gtc2hhZG93OiAwIDI1cHggNTBweCByZ2JhKDAsIDAsIDAsIDAuMik7XFxufVxcblxcbi8qIFNlY3Rpb24gSGVhZGVycyAqL1xcbi5zZWN0aW9uLWhlYWRlciB7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGdhcDogMC43NXJlbTtcXG4gIG1hcmdpbi1ib3R0b206IDEuNXJlbTtcXG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XFxuICBmb250LXdlaWdodDogNzAwO1xcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSk7XFxufVxcblxcbi5zZWN0aW9uLWljb24ge1xcbiAgd2lkdGg6IDM2cHg7XFxuICBoZWlnaHQ6IDM2cHg7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcXG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XFxuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XFxuICBmbGV4LXNocmluazogMDtcXG59XFxuXFxuLyogVGV4dGFyZWEgUmVkZXNpZ24gKi9cXG4udGV4dGFyZWEtd3JhcHBlciB7XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICBtYXJnaW4tYm90dG9tOiAxLjVyZW07XFxuICBmbGV4OiAxO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XFxufVxcblxcbi50ZXh0YXJlYSB7XFxuICBib3JkZXI6IDJweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIHBhZGRpbmc6IDEuMjVyZW07XFxuICBmb250LXNpemU6IDAuOTVyZW07XFxuICBmb250LWZhbWlseTogJ01vbmFjbycsICdNZW5sbycsICdVYnVudHUgTW9ubycsICdDb25zb2xhcycsICdzb3VyY2UtY29kZS1wcm8nLCBtb25vc3BhY2U7XFxuICBsaW5lLWhlaWdodDogMS42O1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgZWFzZTtcXG4gIHJlc2l6ZTogbm9uZTtcXG4gIGhlaWdodDogNDUwcHg7XFxuICBiYWNrZ3JvdW5kOiAjZjhmYWZjO1xcbiAgd2lkdGg6IDEwMCU7XFxufVxcblxcbi50ZXh0YXJlYTpmb2N1cyB7XFxuICBvdXRsaW5lOiBub25lO1xcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xcbiAgYm94LXNoYWRvdzogMCAwIDAgM3B4IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbn1cXG5cXG4udGV4dGFyZWE6OnBsYWNlaG9sZGVyIHtcXG4gIGNvbG9yOiAjYTBhZWMwO1xcbiAgZm9udC1zdHlsZTogaXRhbGljO1xcbiAgZm9udC1zaXplOiAwLjlyZW07XFxufVxcblxcbi8qIENvcHkgQnV0dG9uICovXFxuLmNvcHktYnV0dG9uIHtcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogMXJlbTtcXG4gIHJpZ2h0OiAxcmVtO1xcbiAgcGFkZGluZzogMC42MjVyZW0gMS4yNXJlbTtcXG4gIGJhY2tncm91bmQ6IHJnYmEoMjU1LCAyNTUsIDI1NSwgMC45NSk7XFxuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcXG4gIGN1cnNvcjogcG9pbnRlcjtcXG4gIGZvbnQtc2l6ZTogMC44NzVyZW07XFxuICBmb250LXdlaWdodDogNjAwO1xcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjJzIGVhc2U7XFxuICB6LWluZGV4OiAxMDtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjVyZW07XFxuICBiYWNrZHJvcC1maWx0ZXI6IGJsdXIoNHB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1zbSk7XFxufVxcblxcbi5jb3B5LWJ1dHRvbjpob3ZlciB7XFxuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG59XFxuXFxuLmNvcHktYnV0dG9uLmNvcGllZCB7XFxuICBiYWNrZ3JvdW5kOiAjNDhiYjc4O1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgYm9yZGVyLWNvbG9yOiAjNDhiYjc4O1xcbn1cXG5cXG4vKiBCdXR0b24gQ29udHJvbHMgKi9cXG4uYnV0dG9uLWNvbnRyb2xzIHtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBnYXA6IDFyZW07XFxuICBmbGV4LXdyYXA6IHdyYXA7XFxuICBtYXJnaW4tdG9wOiBhdXRvO1xcbiAgcGFkZGluZy10b3A6IDAuNXJlbTtcXG59XFxuXFxuLmJ1dHRvbiB7XFxuICBwYWRkaW5nOiAxcmVtIDIuNXJlbTtcXG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XFxuICBmb250LXdlaWdodDogNzAwO1xcbiAgZm9udC1zaXplOiAxcmVtO1xcbiAgYm9yZGVyOiBub25lO1xcbiAgY3Vyc29yOiBwb2ludGVyO1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcXG4gIGRpc3BsYXk6IGlubGluZS1mbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcbiAgZ2FwOiAwLjVyZW07XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICBvdmVyZmxvdzogaGlkZGVuO1xcbiAgZmxleDogMTtcXG4gIG1pbi13aWR0aDogMTQwcHg7XFxufVxcblxcbi5idXR0b246OmJlZm9yZSB7XFxuICBjb250ZW50OiAnJztcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogNTAlO1xcbiAgbGVmdDogNTAlO1xcbiAgd2lkdGg6IDA7XFxuICBoZWlnaHQ6IDA7XFxuICBib3JkZXItcmFkaXVzOiA1MCU7XFxuICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLCAtNTAlKTtcXG4gIHRyYW5zaXRpb246IHdpZHRoIDAuNnMsIGhlaWdodCAwLjZzO1xcbn1cXG5cXG4uYnV0dG9uOmhvdmVyOjpiZWZvcmUge1xcbiAgd2lkdGg6IDMwMHB4O1xcbiAgaGVpZ2h0OiAzMDBweDtcXG59XFxuXFxuLmJ1dHRvbi5pcy1wcmltYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG59XFxuXFxuLmJ1dHRvbi5pcy1wcmltYXJ5OmhvdmVyIHtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxufVxcblxcbi5idXR0b24uaXMtc2Vjb25kYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbiAgY29sb3I6ICM2NjdlZWE7XFxuICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xcbn1cXG5cXG4uYnV0dG9uLmlzLXNlY29uZGFyeTpob3ZlciB7XFxuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LWxnKTtcXG59XFxuXFxuLyogTG9hZGluZyBBbmltYXRpb24gKi9cXG4uYnV0dG9uLmlzLWxvYWRpbmcge1xcbiAgcG9pbnRlci1ldmVudHM6IG5vbmU7XFxuICBvcGFjaXR5OiAwLjc7XFxufVxcblxcbi5idXR0b24uaXMtbG9hZGluZzo6YWZ0ZXIge1xcbiAgY29udGVudDogJyc7XFxuICBwb3NpdGlvbjogYWJzb2x1dGU7XFxuICB3aWR0aDogMTZweDtcXG4gIGhlaWdodDogMTZweDtcXG4gIHRvcDogNTAlO1xcbiAgbGVmdDogNTAlO1xcbiAgbWFyZ2luLWxlZnQ6IC04cHg7XFxuICBtYXJnaW4tdG9wOiAtOHB4O1xcbiAgYm9yZGVyOiAycHggc29saWQgdHJhbnNwYXJlbnQ7XFxuICBib3JkZXItdG9wLWNvbG9yOiB3aGl0ZTtcXG4gIGJvcmRlci1yYWRpdXM6IDUwJTtcXG4gIGFuaW1hdGlvbjogYnV0dG9uLWxvYWRpbmctc3Bpbm5lciAwLjZzIGxpbmVhciBpbmZpbml0ZTtcXG59XFxuXFxuQGtleWZyYW1lcyBidXR0b24tbG9hZGluZy1zcGlubmVyIHtcXG4gIGZyb20ge1xcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgwdHVybik7XFxuICB9XFxuICB0byB7XFxuICAgIHRyYW5zZm9ybTogcm90YXRlKDF0dXJuKTtcXG4gIH1cXG59XFxuXFxuLyogRmVhdHVyZXMgU2VjdGlvbiAqL1xcbi5mZWF0dXJlcy1ncmlkIHtcXG4gIGRpc3BsYXk6IGdyaWQ7XFxuICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IHJlcGVhdChhdXRvLWZpdCwgbWlubWF4KDI1MHB4LCAxZnIpKTtcXG4gIGdhcDogMS41cmVtO1xcbiAgbWFyZ2luLXRvcDogMnJlbTtcXG4gIG1hcmdpbi1ib3R0b206IDJyZW07XFxufVxcblxcbi5mZWF0dXJlLWNhcmQge1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxuICBwYWRkaW5nOiAxLjVyZW07XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XFxuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xcbn1cXG5cXG4uZmVhdHVyZS1jYXJkOmhvdmVyIHtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtNHB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxufVxcblxcbi5mZWF0dXJlLWljb24ge1xcbiAgd2lkdGg6IDUwcHg7XFxuICBoZWlnaHQ6IDUwcHg7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XFxuICBjb2xvcjogd2hpdGU7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcbiAgZm9udC1zaXplOiAxLjVyZW07XFxuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xcbn1cXG5cXG4uZmVhdHVyZS10aXRsZSB7XFxuICBmb250LXNpemU6IDEuMTI1cmVtO1xcbiAgZm9udC13ZWlnaHQ6IDcwMDtcXG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xcbiAgbWFyZ2luLWJvdHRvbTogMC41cmVtO1xcbn1cXG5cXG4uZmVhdHVyZS1kZXNjcmlwdGlvbiB7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgZm9udC1zaXplOiAwLjlyZW07XFxuICBsaW5lLWhlaWdodDogMS42O1xcbn1cXG5cXG4vKiBGb290ZXIgKi9cXG4ubW9kZXJuLWZvb3RlciB7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIHBhZGRpbmc6IDJyZW07XFxuICB0ZXh0LWFsaWduOiBjZW50ZXI7XFxuICBtYXJnaW4tdG9wOiA0cmVtO1xcbiAgYm94LXNoYWRvdzogMCAtMnB4IDEwcHggcmdiYSgwLCAwLCAwLCAwLjA1KTtcXG59XFxuXFxuLm1vZGVybi1mb290ZXIgcCB7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgbWFyZ2luOiAwO1xcbn1cXG5cXG4ubW9kZXJuLWZvb3RlciBhIHtcXG4gIGNvbG9yOiAjNjY3ZWVhO1xcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xcbiAgZm9udC13ZWlnaHQ6IDYwMDtcXG59XFxuXFxuLm1vZGVybi1mb290ZXIgYTpob3ZlciB7XFxuICB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTtcXG59XFxuXFxuLyogQW5pbWF0aW9ucyAqL1xcbkBrZXlmcmFtZXMgZmFkZUluVXAge1xcbiAgZnJvbSB7XFxuICAgIG9wYWNpdHk6IDA7XFxuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgyMHB4KTtcXG4gIH1cXG4gIHRvIHtcXG4gICAgb3BhY2l0eTogMTtcXG4gICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApO1xcbiAgfVxcbn1cXG5cXG4uZmFkZS1pbi11cCB7XFxuICBhbmltYXRpb246IGZhZGVJblVwIDAuNnMgZWFzZS1vdXQ7XFxufVxcblxcbi8qIFN1Y2Nlc3MvRXJyb3IgTWVzc2FnZXMgKi9cXG4ubWVzc2FnZS1ib3gge1xcbiAgcGFkZGluZzogMXJlbSAxLjVyZW07XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjc1cmVtO1xcbiAgYW5pbWF0aW9uOiBmYWRlSW5VcCAwLjNzIGVhc2Utb3V0O1xcbn1cXG5cXG4ubWVzc2FnZS1ib3guc3VjY2VzcyB7XFxuICBiYWNrZ3JvdW5kOiAjZDRlZGRhO1xcbiAgY29sb3I6ICMxNTU3MjQ7XFxuICBib3JkZXItbGVmdDogNHB4IHNvbGlkICMyOGE3NDU7XFxufVxcblxcbi5tZXNzYWdlLWJveC5lcnJvciB7XFxuICBiYWNrZ3JvdW5kOiAjZjhkN2RhO1xcbiAgY29sb3I6ICM3MjFjMjQ7XFxuICBib3JkZXItbGVmdDogNHB4IHNvbGlkICNkYzM1NDU7XFxufVxcblxcbi8qIFJlc3BvbnNpdmUgRGVzaWduICovXFxuQG1lZGlhIChtYXgtd2lkdGg6IDEwMjRweCkge1xcbiAgLmNvbnZlcnRlci1ncmlkIHtcXG4gICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxZnI7XFxuICAgIGdhcDogMS41cmVtO1xcbiAgfVxcblxcbiAgLmNvbnRlbnQtd3JhcHBlciB7XFxuICAgIG1heC13aWR0aDogMTIwMHB4O1xcbiAgfVxcbn1cXG5cXG5AbWVkaWEgKG1heC13aWR0aDogNzY4cHgpIHtcXG4gIC5oZXJvIC50aXRsZSB7XFxuICAgIGZvbnQtc2l6ZTogMS43NXJlbTtcXG4gIH1cXG5cXG4gIC5oZXJvIC5zdWJ0aXRsZSB7XFxuICAgIGZvbnQtc2l6ZTogMXJlbTtcXG4gIH1cXG5cXG4gIC5jb252ZXJ0ZXItY2FyZCB7XFxuICAgIHBhZGRpbmc6IDEuNXJlbTtcXG4gIH1cXG5cXG4gIC5idXR0b24tY29udHJvbHMge1xcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xcbiAgfVxcblxcbiAgLmJ1dHRvbiB7XFxuICAgIHdpZHRoOiAxMDAlO1xcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcXG4gIH1cXG5cXG5cXG4gIC5mZWF0dXJlcy1ncmlkIHtcXG4gICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxZnI7XFxuICB9XFxuXFxuICAudGV4dGFyZWEge1xcbiAgICBtaW4taGVpZ2h0OiAxNTBweDtcXG4gIH1cXG59XFxuXFxuLyogQ29kZSBIaWdobGlnaHRpbmcgaW4gT3V0cHV0ICovXFxuLnRleHRhcmVhLmNvZGUtb3V0cHV0IHtcXG4gIGJhY2tncm91bmQ6ICMxZTI5M2I7XFxuICBjb2xvcjogI2UyZThmMDtcXG4gIGJvcmRlci1jb2xvcjogIzMzNDE1NTtcXG4gIGZvbnQtc2l6ZTogMC45cmVtO1xcbn1cXG5cXG4udGV4dGFyZWEuY29kZS1vdXRwdXQ6Zm9jdXMge1xcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xcbiAgYmFja2dyb3VuZDogIzFlMjkzYjtcXG59XFxuXFxuLnRleHRhcmVhLmNvZGUtb3V0cHV0OjpwbGFjZWhvbGRlciB7XFxuICBjb2xvcjogIzY0NzQ4YjtcXG59XFxuXFxuLyogVXRpbGl0eSBDbGFzc2VzICovXFxuLm10LTEgeyBtYXJnaW4tdG9wOiAwLjVyZW07IH1cXG4ubXQtMiB7IG1hcmdpbi10b3A6IDFyZW07IH1cXG4ubXQtMyB7IG1hcmdpbi10b3A6IDEuNXJlbTsgfVxcbi5tdC00IHsgbWFyZ2luLXRvcDogMnJlbTsgfVxcblxcbi5tYi0xIHsgbWFyZ2luLWJvdHRvbTogMC41cmVtOyB9XFxuLm1iLTIgeyBtYXJnaW4tYm90dG9tOiAxcmVtOyB9XFxuLm1iLTMgeyBtYXJnaW4tYm90dG9tOiAxLjVyZW07IH1cXG4ubWItNCB7IG1hcmdpbi1ib3R0b206IDJyZW07IH1cXG5cXG4udGV4dC1jZW50ZXIgeyB0ZXh0LWFsaWduOiBjZW50ZXI7IH1cXG4udGV4dC1tdXRlZCB7IGNvbG9yOiB2YXIoLS10ZXh0LXNlY29uZGFyeSk7IH1cXG5cIl0sXCJzb3VyY2VSb290XCI6XCJcIn1dKTtcbi8vIEV4cG9ydHNcbmV4cG9ydCBkZWZhdWx0IF9fX0NTU19MT0FERVJfRVhQT1JUX19fO1xuIiwiaW1wb3J0ICogYXMgd2FzbSBmcm9tIFwic3FscGFyc2VyLXJzLXdhc21cIjtcbmltcG9ydCB7Q29udmVydGVyfSBmcm9tIFwiLi9jb252ZXJ0ZXJcIjtcbmltcG9ydCAnLi9zdHlsZS5jc3MnO1xuXG4vLyBTaG93IG5vdGlmaWNhdGlvbiBtZXNzYWdlXG5mdW5jdGlvbiBzaG93Tm90aWZpY2F0aW9uKG1lc3NhZ2UsIHR5cGUgPSAnc3VjY2VzcycpIHtcbiAgICAvLyBSZW1vdmUgYW55IGV4aXN0aW5nIG5vdGlmaWNhdGlvbnNcbiAgICBjb25zdCBleGlzdGluZ05vdGlmID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1lc3NhZ2UtYm94Jyk7XG4gICAgaWYgKGV4aXN0aW5nTm90aWYpIHtcbiAgICAgICAgZXhpc3RpbmdOb3RpZi5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBub3RpZmljYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBub3RpZmljYXRpb24uY2xhc3NOYW1lID0gYG1lc3NhZ2UtYm94ICR7dHlwZX1gO1xuICAgIG5vdGlmaWNhdGlvbi5pbm5lckhUTUwgPSBgPHNwYW4+JHt0eXBlID09PSAnc3VjY2VzcycgPyAn4pyFJyA6ICfinYwnfTwvc3Bhbj48c3Bhbj4ke21lc3NhZ2V9PC9zcGFuPmA7XG5cbiAgICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvbnRlbnQtd3JhcHBlcicpO1xuICAgIHdyYXBwZXIuaW5zZXJ0QmVmb3JlKG5vdGlmaWNhdGlvbiwgd3JhcHBlci5maXJzdENoaWxkKTtcblxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBub3RpZmljYXRpb24uc3R5bGUuYW5pbWF0aW9uID0gJ2ZhZGVJblVwIDAuM3MgZWFzZS1vdXQgcmV2ZXJzZSc7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gbm90aWZpY2F0aW9uLnJlbW92ZSgpLCAzMDApO1xuICAgIH0sIDMwMDApO1xufVxuXG5sZXQgY29udmVydGVyID0gZnVuY3Rpb24gKCkge1xuICAgIGxldCBpbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaW5wdXRcIikudmFsdWU7XG4gICAgbGV0IGNvbnZlcnRCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvbnZlcnQtYnV0dG9uXCIpO1xuXG4gICAgaWYgKGlucHV0LnRyaW0oKSA9PT0gJycpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignUGxlYXNlIGVudGVyIGEgU1FMIHF1ZXJ5JywgJ2Vycm9yJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaW5wdXQuc2xpY2UoLTEpID09PSAnOycpIHtcbiAgICAgICAgaW5wdXQgPSBpbnB1dC5zbGljZSgwLCAtMSk7XG4gICAgfVxuXG4gICAgbGV0IG91dHB1dF90ZXh0X2FyZWEgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm91dHB1dFwiKTtcblxuICAgIGlmICghaW5wdXQuc3RhcnRzV2l0aCgnc2VsZWN0JykgJiYgIWlucHV0LnN0YXJ0c1dpdGgoJ1NFTEVDVCcpKSB7XG4gICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSAnU1FMIG11c3Qgc3RhcnQgd2l0aCBzZWxlY3Qgb3IgU0VMRUNUJztcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignU1FMIHF1ZXJ5IG11c3Qgc3RhcnQgd2l0aCBTRUxFQ1QnLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEFkZCBsb2FkaW5nIHN0YXRlXG4gICAgY29udmVydEJ1dHRvbi5jbGFzc0xpc3QuYWRkKCdpcy1sb2FkaW5nJyk7XG4gICAgY29udmVydEJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG5cbiAgICAvLyBVc2Ugc2V0VGltZW91dCB0byBhbGxvdyBVSSB0byB1cGRhdGVcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBhc3QgPSB3YXNtLnBhcnNlX3NxbChcIi0tbXlzcWxcIiwgaW5wdXQpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYXN0KTtcbiAgICAgICAgICAgIGlmIChhc3Quc3RhcnRzV2l0aCgnRXJyb3InKSkge1xuICAgICAgICAgICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSBhc3Q7XG4gICAgICAgICAgICAgICAgc2hvd05vdGlmaWNhdGlvbignRXJyb3IgcGFyc2luZyBTUUwgcXVlcnknLCAnZXJyb3InKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb3V0cHV0X3RleHRfYXJlYS52YWx1ZSA9IChuZXcgQ29udmVydGVyKEpTT04ucGFyc2UoYXN0KVswXS5RdWVyeSkpLnJ1bigpO1xuICAgICAgICAgICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1N1Y2Nlc3NmdWxseSBjb252ZXJ0ZWQgdG8gTGFyYXZlbCBRdWVyeSBCdWlsZGVyIScsICdzdWNjZXNzJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGlucHV0KTtcbiAgICAgICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSBlICsgJywgSSB3aWxsIGZpeCB0aGlzIGlzc3VlIGFzIHNvb24gYXMgcG9zc2libGUnO1xuICAgICAgICAgICAgc2hvd05vdGlmaWNhdGlvbignQ29udmVyc2lvbiBlcnJvciBvY2N1cnJlZCcsICdlcnJvcicpO1xuICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGNvbnZlcnRCdXR0b24uY2xhc3NMaXN0LnJlbW92ZSgnaXMtbG9hZGluZycpO1xuICAgICAgICAgICAgY29udmVydEJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfSwgMTAwKTtcbn1cblxuLy8gQ29weSB0byBjbGlwYm9hcmQgZnVuY3Rpb25hbGl0eVxuZnVuY3Rpb24gY29weVRvQ2xpcGJvYXJkKCkge1xuICAgIGNvbnN0IG91dHB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwib3V0cHV0XCIpLnZhbHVlO1xuICAgIGNvbnN0IGNvcHlCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktYnV0dG9uXCIpO1xuICAgIGNvbnN0IGNvcHlUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb3B5LXRleHRcIik7XG4gICAgY29uc3QgY29weUljb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktaWNvblwiKTtcblxuICAgIGlmICghb3V0cHV0IHx8IG91dHB1dC50cmltKCkgPT09ICcnIHx8IG91dHB1dC5pbmNsdWRlcygnWW91ciBMYXJhdmVsIHF1ZXJ5IGJ1aWxkZXIgY29kZSB3aWxsIGFwcGVhciBoZXJlJykpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignTm8gb3V0cHV0IHRvIGNvcHknLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KG91dHB1dCkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgY29weUJ1dHRvbi5jbGFzc0xpc3QuYWRkKCdjb3BpZWQnKTtcbiAgICAgICAgY29weVRleHQudGV4dENvbnRlbnQgPSAnQ29waWVkISc7XG4gICAgICAgIGNvcHlJY29uLnRleHRDb250ZW50ID0gJ+Kckyc7XG5cbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICBjb3B5QnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoJ2NvcGllZCcpO1xuICAgICAgICAgICAgY29weVRleHQudGV4dENvbnRlbnQgPSAnQ29weSc7XG4gICAgICAgICAgICBjb3B5SWNvbi50ZXh0Q29udGVudCA9ICfwn5OLJztcbiAgICAgICAgfSwgMjAwMCk7XG4gICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ0ZhaWxlZCB0byBjb3B5IHRvIGNsaXBib2FyZCcsICdlcnJvcicpO1xuICAgIH0pO1xufVxuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIChldmVudCkgPT4ge1xuICAgIGxldCB1cmxfc2VhcmNoX3BhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG5cbiAgICBpZih1cmxfc2VhcmNoX3BhcmFtcy5oYXMoJ2Jhc2U2NHNxbCcpKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcpLnZhbHVlID0gYXRvYih1cmxfc2VhcmNoX3BhcmFtcy5nZXQoJ2Jhc2U2NHNxbCcpKTtcbiAgICAgICAgY29udmVydGVyKCk7XG4gICAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb252ZXJ0LWJ1dHRvbicpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY29udmVydGVyKTtcblxuLy8gQWRkIEVudGVyIGtleSBzdXBwb3J0IChDdHJsL0NtZCArIEVudGVyIHRvIGNvbnZlcnQpXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24oZSkge1xuICAgIGlmICgoZS5jdHJsS2V5IHx8IGUubWV0YUtleSkgJiYgZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgY29udmVydGVyKCk7XG4gICAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGFyZS1idXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcpLnZhbHVlO1xuXG4gICAgaWYgKCFpbnB1dCB8fCBpbnB1dC50cmltKCkgPT09ICcnKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1BsZWFzZSBlbnRlciBhIFNRTCBxdWVyeSBmaXJzdCcsICdlcnJvcicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHNoYXJlX2xpbmsgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lICsgJz9iYXNlNjRzcWw9JyArIGJ0b2EoaW5wdXQpO1xuICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHNoYXJlX2xpbmspLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1NoYXJlIGxpbmsgY29waWVkIHRvIGNsaXBib2FyZCEnLCAnc3VjY2VzcycpO1xuICAgIH0sIGZ1bmN0aW9uKCkge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdGYWlsZWQgdG8gY29weSBzaGFyZSBsaW5rJywgJ2Vycm9yJyk7XG4gICAgfSk7XG59KTtcblxuLy8gQWRkIGNvcHkgYnV0dG9uIGV2ZW50IGxpc3RlbmVyXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29weS1idXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNvcHlUb0NsaXBib2FyZCk7XG4iLCJcbiAgICAgIGltcG9ydCBBUEkgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9pbmplY3RTdHlsZXNJbnRvU3R5bGVUYWcuanNcIjtcbiAgICAgIGltcG9ydCBkb21BUEkgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9zdHlsZURvbUFQSS5qc1wiO1xuICAgICAgaW1wb3J0IGluc2VydEZuIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvaW5zZXJ0QnlTZWxlY3Rvci5qc1wiO1xuICAgICAgaW1wb3J0IHNldEF0dHJpYnV0ZXMgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9zZXRBdHRyaWJ1dGVzV2l0aG91dEF0dHJpYnV0ZXMuanNcIjtcbiAgICAgIGltcG9ydCBpbnNlcnRTdHlsZUVsZW1lbnQgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9pbnNlcnRTdHlsZUVsZW1lbnQuanNcIjtcbiAgICAgIGltcG9ydCBzdHlsZVRhZ1RyYW5zZm9ybUZuIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvc3R5bGVUYWdUcmFuc2Zvcm0uanNcIjtcbiAgICAgIGltcG9ydCBjb250ZW50LCAqIGFzIG5hbWVkRXhwb3J0IGZyb20gXCIhIS4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvY2pzLmpzIS4vc3R5bGUuY3NzXCI7XG4gICAgICBcbiAgICAgIFxuXG52YXIgb3B0aW9ucyA9IHt9O1xuXG5vcHRpb25zLnN0eWxlVGFnVHJhbnNmb3JtID0gc3R5bGVUYWdUcmFuc2Zvcm1Gbjtcbm9wdGlvbnMuc2V0QXR0cmlidXRlcyA9IHNldEF0dHJpYnV0ZXM7XG5vcHRpb25zLmluc2VydCA9IGluc2VydEZuLmJpbmQobnVsbCwgXCJoZWFkXCIpO1xub3B0aW9ucy5kb21BUEkgPSBkb21BUEk7XG5vcHRpb25zLmluc2VydFN0eWxlRWxlbWVudCA9IGluc2VydFN0eWxlRWxlbWVudDtcblxudmFyIHVwZGF0ZSA9IEFQSShjb250ZW50LCBvcHRpb25zKTtcblxuXG5cbmV4cG9ydCAqIGZyb20gXCIhIS4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvY2pzLmpzIS4vc3R5bGUuY3NzXCI7XG4gICAgICAgZXhwb3J0IGRlZmF1bHQgY29udGVudCAmJiBjb250ZW50LmxvY2FscyA/IGNvbnRlbnQubG9jYWxzIDogdW5kZWZpbmVkO1xuIl0sIm5hbWVzIjpbIkNvbnZlcnRlciIsImNvbnN0cnVjdG9yIiwiYXN0IiwicGFyZW50IiwidGFibGVfbmFtZV9ieV9hbGlhcyIsInJ1biIsIm5lZWRfYXBwZW5kX2dldF9zdWZmaXgiLCJzZWN0aW9ucyIsImZyb21faXRlbSIsImJvZHkiLCJTZWxlY3QiLCJmcm9tIiwicHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwiLCJyZWxhdGlvbiIsInB1c2giLCJyZXNvbHZlTWFpblRhYmxlU2VjdGlvbiIsInJlc29sdmVGcm9tU3ViU2VjdGlvbiIsImpvaW5fc2VjdGlvbiIsImhhc0pvaW5TZWN0aW9uIiwicmVzb2x2ZUpvaW5TZWN0aW9uIiwic2xpY2UiLCJsZW5ndGgiLCJjb25jYXQiLCJyZXNvbHZlQ3Jvc3NKb2luU2VjdGlvbiIsInJlc29sdmVTZWxlY3RTZWN0aW9uIiwicmVzb2x2ZVdoZXJlU2VjdGlvbiIsInNlbGVjdGlvbiIsImdyb3VwX2J5IiwicmVzb2x2ZUdyb3VwQnlTZWN0aW9uIiwicmVzb2x2ZUhhdmluZ1NlY3Rpb24iLCJvcmRlcl9ieSIsInJlc29sdmVPcmRlckJ5U2VjdGlvbiIsImxpbWl0IiwiVmFsdWUiLCJOdW1iZXIiLCJvZmZzZXQiLCJ2YWx1ZSIsImpvaW4iLCJyZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZSIsInJlbGF0aW9uX25vZGUiLCJ0YWJsZV9uYW1lIiwiVGFibGUiLCJuYW1lIiwiYWxpYXMiLCJxdW90ZSIsInByZWZpeCIsImFkZFRhYlRvRXZlcnlMaW5lIiwiRGVyaXZlZCIsInN1YnF1ZXJ5IiwicmVwbGFjZSIsInNlbGVjdGlvbl9ub2RlIiwiY29uZGl0aW9uX3R5cGUiLCJnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0IiwiY29uZGl0aW9uIiwiZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0IiwicHJlcGFyZUNvbmRpdGlvbnMiLCJvcCIsIm1ldGhvZF9uYW1lIiwiY29uZGl0aW9ucyIsImFkZFByZWZpeDJNZXRob2RzIiwiY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uIiwiY29sdW1uIiwiZXhwciIsImxpc3QiLCJtYXAiLCJpIiwicmVzb2x2ZVZhbHVlIiwibmVnYXRlZCIsImxlZnRfY29uZGl0aW9uX3R5cGUiLCJsZWZ0IiwibGVmdF9jb25kaXRpb24iLCJyaWdodF9jb25kaXRpb25fdHlwZSIsInJpZ2h0IiwicmlnaHRfY29uZGl0aW9uIiwiaW5jbHVkZXMiLCJTdWJxdWVyeSIsInBhcnNlRnVuY3Rpb25Ob2RlIiwiRnVuY3Rpb24iLCJ0cmFuc2Zvcm1CaW5hcnlPcCIsImxvdyIsImhpZ2giLCJvcGVyYXRvcl9ieV9vcCIsInRvTG93ZXJDYXNlIiwiY2FwaXRhbGl6ZUZpcnN0TGV0dGVyIiwicmVzIiwic2VsZWN0X2l0ZW0iLCJwcm9qZWN0aW9uIiwiRXhwcldpdGhBbGlhcyIsInJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbSIsIlVubmFtZWRFeHByIiwiZ2V0QWN0dWFsVGFibGVOYW1lIiwiUXVhbGlmaWVkV2lsZGNhcmQiLCJPYmplY3QiLCJrZXlzIiwiYXNzZXJ0IiwiaXNVbmRlZmluZWRPck51bGwiLCJpdGVtIiwiZnVuY3Rpb25fbm9kZSIsIm5lZWRfcXVvdGUiLCJmdW5jdGlvbl9uYW1lIiwiYXJncyIsImFyZ19jb3VudCIsImFyZyIsIlVubmFtZWQiLCJFeHByIiwiSWRlbnRpZmllciIsIkNvbXBvdW5kSWRlbnRpZmllciIsImFyZ19jb2x1bW4iLCJOZXN0ZWQiLCJkaXN0aW5jdCIsInBhcnNlQmluYXJ5T3BOb2RlIiwiQmluYXJ5T3AiLCJqb2lucyIsInBhcnNlQmluYXJ5T3BQYXJ0aWFsIiwibGVmdF9vcl9yaWdodCIsImJpbmFyeV9vcCIsInNlcGFyYXRvciIsInByZXBhcmVKb2lucyIsImpvaW5fb3BlcmF0b3JfdHlwZSIsImpvaW5fb3BlcmF0b3IiLCJqb2luX21ldGhvZCIsIk9uIiwic3ViX3F1ZXJ5X3NxbCIsInN1Yl9xdWVyeV9hbGlhcyIsImpvaW5lZF90YWJsZSIsImZyb21faXRlbXMiLCJjcm9zc19qb2luX3NlY3Rpb25zIiwiY3Jvc3Nfam9pbl9zdHIiLCJncm91cF9ieV9jb2x1bW5zIiwiZ3JvdXBfYnlfaXRlbSIsImhhdmluZyIsIm9yZGVyX2J5cyIsIm9yZGVyX2J5X2l0ZW0iLCJhc2MiLCJ2YWx1ZU5vZGUiLCJpc1N0cmluZyIsInZhbHVlX3R5cGUiLCJ0YWJsZV9uYW1lX29yX2FsaWFzIiwiaWRlbnRpZmllciIsInZhbHVlcyIsImZsYXQiLCJtc2ciLCJvYmoiLCJwcm9wZXJ0eV9uYW1lcyIsInJlZHVjZSIsImNhcnJ5IiwicHJvcGVydHlfbmFtZSIsImhhc093blByb3BlcnR5IiwiU3RyaW5nIiwic3RyaW5nIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJ1bnF1b3RlIiwiSlNPTiIsInN0cmluZ2lmeSIsInN0ciIsInRhYl9jb3VudCIsInNwbGl0Iiwid2FzbSIsInNob3dOb3RpZmljYXRpb24iLCJtZXNzYWdlIiwidHlwZSIsImV4aXN0aW5nTm90aWYiLCJkb2N1bWVudCIsInF1ZXJ5U2VsZWN0b3IiLCJyZW1vdmUiLCJub3RpZmljYXRpb24iLCJjcmVhdGVFbGVtZW50IiwiY2xhc3NOYW1lIiwiaW5uZXJIVE1MIiwid3JhcHBlciIsImluc2VydEJlZm9yZSIsImZpcnN0Q2hpbGQiLCJzZXRUaW1lb3V0Iiwic3R5bGUiLCJhbmltYXRpb24iLCJjb252ZXJ0ZXIiLCJpbnB1dCIsImdldEVsZW1lbnRCeUlkIiwiY29udmVydEJ1dHRvbiIsInRyaW0iLCJvdXRwdXRfdGV4dF9hcmVhIiwic3RhcnRzV2l0aCIsImNsYXNzTGlzdCIsImFkZCIsImRpc2FibGVkIiwicGFyc2Vfc3FsIiwiY29uc29sZSIsImxvZyIsInBhcnNlIiwiUXVlcnkiLCJlIiwiY29weVRvQ2xpcGJvYXJkIiwib3V0cHV0IiwiY29weUJ1dHRvbiIsImNvcHlUZXh0IiwiY29weUljb24iLCJuYXZpZ2F0b3IiLCJjbGlwYm9hcmQiLCJ3cml0ZVRleHQiLCJ0aGVuIiwidGV4dENvbnRlbnQiLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwiZXZlbnQiLCJ1cmxfc2VhcmNoX3BhcmFtcyIsIlVSTFNlYXJjaFBhcmFtcyIsImxvY2F0aW9uIiwic2VhcmNoIiwiaGFzIiwiYXRvYiIsImdldCIsImN0cmxLZXkiLCJtZXRhS2V5Iiwia2V5Iiwic2hhcmVfbGluayIsIm9yaWdpbiIsInBhdGhuYW1lIiwiYnRvYSJdLCJzb3VyY2VSb290IjoiIn0=