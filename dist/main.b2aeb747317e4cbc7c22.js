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
  padding: 3rem 1.5rem;
}

.hero .title {
  font-size: 2.5rem;
  font-weight: 800;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  letter-spacing: -0.5px;
}

.hero .subtitle {
  font-size: 1.25rem;
  opacity: 0.95;
  margin-top: 1rem;
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
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--dark-bg);
  color: white;
  text-decoration: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--shadow-md);
}

.github-link:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  color: white;
}

.github-link::before {
  content: '★';
  font-size: 1.25rem;
}

/* Main Content Area */
.content-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.converter-card {
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  padding: 2.5rem;
  margin-bottom: 2rem;
  transition: all 0.3s ease;
}

.converter-card:hover {
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);
}

/* Section Headers */
.section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.section-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  background: var(--primary-gradient);
  color: white;
  box-shadow: var(--shadow-md);
}

/* Textarea Redesign */
.textarea-wrapper {
  position: relative;
  margin-bottom: 1.5rem;
}

.textarea {
  border: 2px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1.25rem;
  font-size: 1rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
  line-height: 1.6;
  transition: all 0.3s ease;
  resize: vertical;
  min-height: 200px;
  background: #f8fafc;
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
}

/* Copy Button */
.copy-button {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.5rem 1rem;
  background: white;
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
}

.copy-button:hover {
  background: #667eea;
  color: white;
  border-color: #667eea;
  transform: translateY(-1px);
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
}

.button {
  padding: 0.875rem 2rem;
  border-radius: var(--radius-md);
  font-weight: 700;
  font-size: 1rem;
  border: none;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  position: relative;
  overflow: hidden;
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
}

/* Code Highlighting in Output */
.textarea.code-output {
  background: #2d3748;
  color: #e2e8f0;
  border-color: #4a5568;
}

.textarea.code-output:focus {
  border-color: #667eea;
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
`, "",{"version":3,"sources":["webpack://./src/style.css"],"names":[],"mappings":"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","sourcesContent":["/* Modern SQL to Laravel Builder - Custom Styles */\n\n:root {\n  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);\n  --success-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);\n  --dark-bg: #1a1a2e;\n  --card-bg: #ffffff;\n  --text-primary: #2d3748;\n  --text-secondary: #718096;\n  --border-color: #e2e8f0;\n  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.05);\n  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);\n  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);\n  --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.15);\n  --radius-sm: 8px;\n  --radius-md: 12px;\n  --radius-lg: 16px;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);\n  min-height: 100vh;\n}\n\n/* Hero Section Redesign */\n.hero.is-primary {\n  background: var(--primary-gradient);\n  position: relative;\n  overflow: hidden;\n}\n\n.hero.is-primary::before {\n  content: '';\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\");\n  opacity: 0.3;\n}\n\n.hero-body {\n  position: relative;\n  z-index: 1;\n  padding: 3rem 1.5rem;\n}\n\n.hero .title {\n  font-size: 2.5rem;\n  font-weight: 800;\n  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);\n  letter-spacing: -0.5px;\n}\n\n.hero .subtitle {\n  font-size: 1.25rem;\n  opacity: 0.95;\n  margin-top: 1rem;\n}\n\n/* Navigation/Header */\n.nav-header {\n  padding: 1rem 2rem;\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  background: white;\n  box-shadow: var(--shadow-sm);\n}\n\n.github-link {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.5rem;\n  padding: 0.75rem 1.5rem;\n  background: var(--dark-bg);\n  color: white;\n  text-decoration: none;\n  border-radius: var(--radius-md);\n  font-weight: 600;\n  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n  box-shadow: var(--shadow-md);\n}\n\n.github-link:hover {\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n  color: white;\n}\n\n.github-link::before {\n  content: '★';\n  font-size: 1.25rem;\n}\n\n/* Main Content Area */\n.content-wrapper {\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 2rem 1rem;\n}\n\n.converter-card {\n  background: var(--card-bg);\n  border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-xl);\n  padding: 2.5rem;\n  margin-bottom: 2rem;\n  transition: all 0.3s ease;\n}\n\n.converter-card:hover {\n  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);\n}\n\n/* Section Headers */\n.section-header {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  margin-bottom: 1rem;\n  font-size: 1.25rem;\n  font-weight: 700;\n  color: var(--text-primary);\n}\n\n.section-icon {\n  width: 40px;\n  height: 40px;\n  border-radius: var(--radius-sm);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.25rem;\n  background: var(--primary-gradient);\n  color: white;\n  box-shadow: var(--shadow-md);\n}\n\n/* Textarea Redesign */\n.textarea-wrapper {\n  position: relative;\n  margin-bottom: 1.5rem;\n}\n\n.textarea {\n  border: 2px solid var(--border-color);\n  border-radius: var(--radius-md);\n  padding: 1.25rem;\n  font-size: 1rem;\n  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;\n  line-height: 1.6;\n  transition: all 0.3s ease;\n  resize: vertical;\n  min-height: 200px;\n  background: #f8fafc;\n}\n\n.textarea:focus {\n  outline: none;\n  border-color: #667eea;\n  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);\n  background: white;\n}\n\n.textarea::placeholder {\n  color: #a0aec0;\n  font-style: italic;\n}\n\n/* Copy Button */\n.copy-button {\n  position: absolute;\n  top: 0.75rem;\n  right: 0.75rem;\n  padding: 0.5rem 1rem;\n  background: white;\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-sm);\n  cursor: pointer;\n  font-size: 0.875rem;\n  font-weight: 600;\n  color: var(--text-secondary);\n  transition: all 0.2s ease;\n  z-index: 10;\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n}\n\n.copy-button:hover {\n  background: #667eea;\n  color: white;\n  border-color: #667eea;\n  transform: translateY(-1px);\n  box-shadow: var(--shadow-md);\n}\n\n.copy-button.copied {\n  background: #48bb78;\n  color: white;\n  border-color: #48bb78;\n}\n\n/* Button Controls */\n.button-controls {\n  display: flex;\n  gap: 1rem;\n  flex-wrap: wrap;\n}\n\n.button {\n  padding: 0.875rem 2rem;\n  border-radius: var(--radius-md);\n  font-weight: 700;\n  font-size: 1rem;\n  border: none;\n  cursor: pointer;\n  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n  display: inline-flex;\n  align-items: center;\n  gap: 0.5rem;\n  position: relative;\n  overflow: hidden;\n}\n\n.button::before {\n  content: '';\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  width: 0;\n  height: 0;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.3);\n  transform: translate(-50%, -50%);\n  transition: width 0.6s, height 0.6s;\n}\n\n.button:hover::before {\n  width: 300px;\n  height: 300px;\n}\n\n.button.is-primary {\n  background: var(--primary-gradient);\n  color: white;\n  box-shadow: var(--shadow-md);\n}\n\n.button.is-primary:hover {\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n}\n\n.button.is-secondary {\n  background: white;\n  color: #667eea;\n  border: 2px solid #667eea;\n}\n\n.button.is-secondary:hover {\n  background: #667eea;\n  color: white;\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n}\n\n/* Loading Animation */\n.button.is-loading {\n  pointer-events: none;\n  opacity: 0.7;\n}\n\n.button.is-loading::after {\n  content: '';\n  position: absolute;\n  width: 16px;\n  height: 16px;\n  top: 50%;\n  left: 50%;\n  margin-left: -8px;\n  margin-top: -8px;\n  border: 2px solid transparent;\n  border-top-color: white;\n  border-radius: 50%;\n  animation: button-loading-spinner 0.6s linear infinite;\n}\n\n@keyframes button-loading-spinner {\n  from {\n    transform: rotate(0turn);\n  }\n  to {\n    transform: rotate(1turn);\n  }\n}\n\n/* Features Section */\n.features-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));\n  gap: 1.5rem;\n  margin-top: 2rem;\n  margin-bottom: 2rem;\n}\n\n.feature-card {\n  background: white;\n  padding: 1.5rem;\n  border-radius: var(--radius-md);\n  box-shadow: var(--shadow-md);\n  transition: all 0.3s ease;\n  border: 1px solid var(--border-color);\n}\n\n.feature-card:hover {\n  transform: translateY(-4px);\n  box-shadow: var(--shadow-lg);\n}\n\n.feature-icon {\n  width: 50px;\n  height: 50px;\n  border-radius: var(--radius-sm);\n  background: var(--primary-gradient);\n  color: white;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.5rem;\n  margin-bottom: 1rem;\n}\n\n.feature-title {\n  font-size: 1.125rem;\n  font-weight: 700;\n  color: var(--text-primary);\n  margin-bottom: 0.5rem;\n}\n\n.feature-description {\n  color: var(--text-secondary);\n  font-size: 0.9rem;\n  line-height: 1.6;\n}\n\n/* Footer */\n.modern-footer {\n  background: white;\n  padding: 2rem;\n  text-align: center;\n  margin-top: 4rem;\n  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);\n}\n\n.modern-footer p {\n  color: var(--text-secondary);\n  margin: 0;\n}\n\n.modern-footer a {\n  color: #667eea;\n  text-decoration: none;\n  font-weight: 600;\n}\n\n.modern-footer a:hover {\n  text-decoration: underline;\n}\n\n/* Animations */\n@keyframes fadeInUp {\n  from {\n    opacity: 0;\n    transform: translateY(20px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n.fade-in-up {\n  animation: fadeInUp 0.6s ease-out;\n}\n\n/* Success/Error Messages */\n.message-box {\n  padding: 1rem 1.5rem;\n  border-radius: var(--radius-md);\n  margin-bottom: 1rem;\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  animation: fadeInUp 0.3s ease-out;\n}\n\n.message-box.success {\n  background: #d4edda;\n  color: #155724;\n  border-left: 4px solid #28a745;\n}\n\n.message-box.error {\n  background: #f8d7da;\n  color: #721c24;\n  border-left: 4px solid #dc3545;\n}\n\n/* Responsive Design */\n@media (max-width: 768px) {\n  .hero .title {\n    font-size: 1.75rem;\n  }\n\n  .hero .subtitle {\n    font-size: 1rem;\n  }\n\n  .converter-card {\n    padding: 1.5rem;\n  }\n\n  .button-controls {\n    flex-direction: column;\n  }\n\n  .button {\n    width: 100%;\n    justify-content: center;\n  }\n\n  .nav-header {\n    flex-direction: column;\n    gap: 1rem;\n  }\n\n  .features-grid {\n    grid-template-columns: 1fr;\n  }\n}\n\n/* Code Highlighting in Output */\n.textarea.code-output {\n  background: #2d3748;\n  color: #e2e8f0;\n  border-color: #4a5568;\n}\n\n.textarea.code-output:focus {\n  border-color: #667eea;\n}\n\n/* Utility Classes */\n.mt-1 { margin-top: 0.5rem; }\n.mt-2 { margin-top: 1rem; }\n.mt-3 { margin-top: 1.5rem; }\n.mt-4 { margin-top: 2rem; }\n\n.mb-1 { margin-bottom: 0.5rem; }\n.mb-2 { margin-bottom: 1rem; }\n.mb-3 { margin-bottom: 1.5rem; }\n.mb-4 { margin-bottom: 2rem; }\n\n.text-center { text-align: center; }\n.text-muted { color: var(--text-secondary); }\n"],"sourceRoot":""}]);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUEyQixDQUFDLDRGQUFxQztBQUMvRix5Q0FBeUMsc0ZBQStCO0FBQ3hFO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLG1DQUFtQztBQUN2RDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTtBQUNSLFFBQVE7O0FBRVIsUUFBUTtBQUNSLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTs7QUFFUixlQUFlO0FBQ2YsY0FBYztBQUNkLE9BQU8sd0ZBQXdGLE1BQU0sWUFBWSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxPQUFPLFlBQVksTUFBTSxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLFdBQVcsVUFBVSxVQUFVLFVBQVUsWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxXQUFXLFlBQVksYUFBYSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxhQUFhLFdBQVcsTUFBTSxLQUFLLFVBQVUsWUFBWSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsV0FBVyxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksT0FBTyxZQUFZLE1BQU0sVUFBVSxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxVQUFVLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxhQUFhLFdBQVcsWUFBWSxPQUFPLFlBQVksTUFBTSxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsWUFBWSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsWUFBWSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsVUFBVSxZQUFZLGFBQWEsYUFBYSxhQUFhLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxXQUFXLFVBQVUsWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLE9BQU8sWUFBWSxNQUFNLFVBQVUsVUFBVSxVQUFVLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxXQUFXLFVBQVUsVUFBVSxZQUFZLGFBQWEsYUFBYSxXQUFXLFlBQVksYUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLFdBQVcsVUFBVSxVQUFVLFVBQVUsWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxVQUFVLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLE9BQU8sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksYUFBYSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsTUFBTSxLQUFLLFVBQVUsWUFBWSxXQUFXLFVBQVUsVUFBVSxVQUFVLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxLQUFLLFlBQVksTUFBTSxLQUFLLFlBQVksTUFB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TyxJQUFJLHNGQUFPLFVBQVUsc0ZBQU8sbUJBQW1CLEVBQUMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9zcWwyYnVpbGRlci5naXRodWIuaW8vLi9zcmMvY29udmVydGVyLmpzIiwid2VicGFjazovL3NxbDJidWlsZGVyLmdpdGh1Yi5pby8uL3NyYy9zdHlsZS5jc3MiLCJ3ZWJwYWNrOi8vc3FsMmJ1aWxkZXIuZ2l0aHViLmlvLy4vc3JjL2luZGV4LmpzIiwid2VicGFjazovL3NxbDJidWlsZGVyLmdpdGh1Yi5pby8uL3NyYy9zdHlsZS5jc3M/NzE2MyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY2xhc3MgQ29udmVydGVyXG57XG4gICAgY29uc3RydWN0b3IoYXN0LCBwYXJlbnQgPSBudWxsKSB7XG4gICAgICAgIHRoaXMuYXN0ID0gYXN0O1xuICAgICAgICB0aGlzLnRhYmxlX25hbWVfYnlfYWxpYXMgPSB7fTtcbiAgICAgICAgdGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG4gICAgfVxuXG4gICAgcnVuKG5lZWRfYXBwZW5kX2dldF9zdWZmaXggPSB0cnVlKSB7XG4gICAgICAgIGxldCBzZWN0aW9ucyA9IFtdXG5cbiAgICAgICAgbGV0IGZyb21faXRlbSA9IHRoaXMuYXN0LmJvZHkuU2VsZWN0LmZyb21bMF07XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbS5yZWxhdGlvbiwgJ1RhYmxlJykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlTWFpblRhYmxlU2VjdGlvbihmcm9tX2l0ZW0pKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0ucmVsYXRpb24sICdEZXJpdmVkJykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlRnJvbVN1YlNlY3Rpb24oJ0RCOjpxdWVyeSgpLT5mcm9tU3ViJyksIGZyb21faXRlbSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCByZWxhdGlvbiB0eXBlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBqb2luX3NlY3Rpb24gPSAnJztcblxuICAgICAgICAvLyBSZXNvbHZlICdqb2luJyBzZWN0aW9uIGJlZm9yZSAnd2hlcmUnIHNlY3Rpb24sIGJlY2F1c2UgbmVlZCBmaW5kIGpvaW5lZCB0YWJsZSBhbGlhc1xuICAgICAgICBpZiAodGhpcy5oYXNKb2luU2VjdGlvbihmcm9tX2l0ZW0pKSB7XG4gICAgICAgICAgICBqb2luX3NlY3Rpb24gPSB0aGlzLnJlc29sdmVKb2luU2VjdGlvbihmcm9tX2l0ZW0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSGFzIGNyb3NzIGpvaW5cbiAgICAgICAgaWYgKHRoaXMuYXN0LmJvZHkuU2VsZWN0LmZyb20uc2xpY2UoMSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc2VjdGlvbnMgPSBzZWN0aW9ucy5jb25jYXQodGhpcy5yZXNvbHZlQ3Jvc3NKb2luU2VjdGlvbih0aGlzLmFzdC5ib2R5LlNlbGVjdC5mcm9tLnNsaWNlKDEpKSk7XG4gICAgICAgIH1cblxuICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZVNlbGVjdFNlY3Rpb24oKSlcblxuICAgICAgICBpZiAoam9pbl9zZWN0aW9uICE9PSAnJykge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaChqb2luX3NlY3Rpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LmJvZHkuU2VsZWN0LCAnc2VsZWN0aW9uJykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlV2hlcmVTZWN0aW9uKHRoaXMuYXN0LmJvZHkuU2VsZWN0LnNlbGVjdGlvbikpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LmJvZHkuU2VsZWN0LCAnZ3JvdXBfYnknKSAmJiB0aGlzLmFzdC5ib2R5LlNlbGVjdC5ncm91cF9ieS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZUdyb3VwQnlTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QuYm9keS5TZWxlY3QsICdoYXZpbmcnKSkge1xuICAgICAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlSGF2aW5nU2VjdGlvbigpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdCwgJ29yZGVyX2J5JykgJiYgdGhpcy5hc3Qub3JkZXJfYnkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVPcmRlckJ5U2VjdGlvbigpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdCwgJ2xpbWl0JykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2goJ2xpbWl0KCcgKyB0aGlzLmFzdC5saW1pdC5WYWx1ZS5OdW1iZXJbMF0gKyAnKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LCAnb2Zmc2V0JykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2goJ29mZnNldCgnICsgdGhpcy5hc3Qub2Zmc2V0LnZhbHVlLlZhbHVlLk51bWJlclswXSArICcpJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmVlZF9hcHBlbmRfZ2V0X3N1ZmZpeCkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCgnZ2V0KCk7Jyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2VjdGlvbnMuam9pbignXFxuLT4nKTtcbiAgICB9XG5cbiAgICByZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZShyZWxhdGlvbl9ub2RlKSB7XG4gICAgICAgICAgICBsZXQgdGFibGVfbmFtZSA9IHJlbGF0aW9uX25vZGUuVGFibGUubmFtZVswXS52YWx1ZTtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHJlbGF0aW9uX25vZGUuVGFibGUsICdhbGlhcycpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50YWJsZV9uYW1lX2J5X2FsaWFzW3JlbGF0aW9uX25vZGUuVGFibGUuYWxpYXMubmFtZS52YWx1ZV0gPSB0YWJsZV9uYW1lO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcXVvdGUodGFibGVfbmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVNYWluVGFibGVTZWN0aW9uKGZyb21faXRlbSkge1xuICAgICAgICByZXR1cm4gJ0RCOjp0YWJsZSgnICsgdGhpcy5yZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZShmcm9tX2l0ZW0ucmVsYXRpb24pICsgJyknO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlRnJvbVN1YlNlY3Rpb24ocHJlZml4LCBmcm9tX2l0ZW0pIHtcbiAgICAgICAgcmV0dXJuIHByZWZpeCArICcoZnVuY3Rpb24gKCRxdWVyeSkge1xcbidcbiAgICAgICAgICAgICsgJ1xcdCcgKyBhZGRUYWJUb0V2ZXJ5TGluZSgobmV3IENvbnZlcnRlcihmcm9tX2l0ZW0ucmVsYXRpb24uRGVyaXZlZC5zdWJxdWVyeSwgdGhpcykucnVuKGZhbHNlKSkucmVwbGFjZSgnREI6OnRhYmxlJywgJyRxdWVyeS0+ZnJvbScpLCAyKSArICc7XFxuJ1xuICAgICAgICAgICAgKyAnfSwnICsgcXVvdGUoZnJvbV9pdGVtLnJlbGF0aW9uLkRlcml2ZWQuYWxpYXMubmFtZS52YWx1ZSkgKyAnKSc7XG4gICAgfVxuXG4gICAgcmVzb2x2ZVdoZXJlU2VjdGlvbihzZWxlY3Rpb25fbm9kZSkge1xuICAgICAgICBsZXQgY29uZGl0aW9uX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KHNlbGVjdGlvbl9ub2RlKTtcbiAgICAgICAgbGV0IGNvbmRpdGlvbiA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChzZWxlY3Rpb25fbm9kZSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMucHJlcGFyZUNvbmRpdGlvbnMoY29uZGl0aW9uX3R5cGUsIGNvbmRpdGlvbiwgJycsICd3aGVyZScpLmpvaW4oJ1xcbi0+Jyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGNvbmRpdGlvbl90eXBlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGNvbmRpdGlvblxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcCBvbmUgb2YgWycnLCAnQW5kJywgJ09yJ11cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbWV0aG9kX25hbWVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmdbXX1cbiAgICAgKi9cbiAgICBwcmVwYXJlQ29uZGl0aW9ucyhjb25kaXRpb25fdHlwZSwgY29uZGl0aW9uLCBvcCwgbWV0aG9kX25hbWUpIHtcbiAgICAgICAgbGV0IGNvbmRpdGlvbnMgPSBbXTtcblxuICAgICAgICBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdJc051bGwnIHx8IGNvbmRpdGlvbl90eXBlID09PSAnSXNOb3ROdWxsJykge1xuICAgICAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gY29uZGl0aW9uX3R5cGUgPT09ICdJc051bGwnID8gJ3doZXJlTnVsbCcgOiAnd2hlcmVOb3ROdWxsJztcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKCcgKyB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uKSkgKyAnKScpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnSW5MaXN0Jykge1xuICAgICAgICAgICAgbGV0IGNvbHVtbiA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24uZXhwcikpO1xuICAgICAgICAgICAgbGV0IGxpc3QgPSBjb25kaXRpb24ubGlzdC5tYXAoKGkpID0+IHRoaXMucmVzb2x2ZVZhbHVlKGkuVmFsdWUpKTtcblxuICAgICAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gY29uZGl0aW9uLm5lZ2F0ZWQgPyAnd2hlcmVOb3RJbicgOiAnd2hlcmVJbic7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJygnICsgY29sdW1uICsgJywnICsgJ1snICsgbGlzdC5qb2luKCcsICcpICsgJ10pJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdOZXN0ZWQnKSB7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2goXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJyhmdW5jdGlvbiAoJHF1ZXJ5KSB7XFxuJ1xuICAgICAgICAgICAgICAgICsgJ1xcdCRxdWVyeS0+JyArICBhZGRUYWJUb0V2ZXJ5TGluZSh0aGlzLnJlc29sdmVXaGVyZVNlY3Rpb24oY29uZGl0aW9uKSwgMikgKyAnO1xcbn0pJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0JpbmFyeU9wJykge1xuICAgICAgICAgICAgaWYgKGNvbmRpdGlvbi5vcCA9PT0gJ0FuZCcgfHwgY29uZGl0aW9uLm9wID09PSAnT3InKSB7XG4gICAgICAgICAgICAgICAgbGV0IGxlZnRfY29uZGl0aW9uX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGNvbmRpdGlvbi5sZWZ0KTtcbiAgICAgICAgICAgICAgICBsZXQgbGVmdF9jb25kaXRpb24gPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmxlZnQpO1xuICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMgPSBjb25kaXRpb25zLmNvbmNhdCh0aGlzLnByZXBhcmVDb25kaXRpb25zKGxlZnRfY29uZGl0aW9uX3R5cGUsIGxlZnRfY29uZGl0aW9uLCBvcCwgbWV0aG9kX25hbWUpKTtcblxuICAgICAgICAgICAgICAgIGxldCByaWdodF9jb25kaXRpb25fdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoY29uZGl0aW9uLnJpZ2h0KTtcbiAgICAgICAgICAgICAgICBsZXQgcmlnaHRfY29uZGl0aW9uID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5yaWdodCk7XG4gICAgICAgICAgICAgICAgY29uZGl0aW9ucyA9IGNvbmRpdGlvbnMuY29uY2F0KHRoaXMucHJlcGFyZUNvbmRpdGlvbnMocmlnaHRfY29uZGl0aW9uX3R5cGUsIHJpZ2h0X2NvbmRpdGlvbiwgY29uZGl0aW9uLm9wLCBtZXRob2RfbmFtZSkpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxldCBsZWZ0ID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5sZWZ0KSk7XG4gICAgICAgICAgICAgICAgbGV0IHJpZ2h0O1xuXG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGNvbmRpdGlvbi5yaWdodCwgJ0lkZW50aWZpZXInLCAnQ29tcG91bmRJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLnJpZ2h0KSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG1ldGhvZF9uYW1lLmluY2x1ZGVzKCd3aGVyZScpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByaWdodCA9ICdEQjo6cmF3KCcgKyByaWdodCArICcpJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoY29uZGl0aW9uLnJpZ2h0LCAnVmFsdWUnKSkge1xuICAgICAgICAgICAgICAgICAgICBtZXRob2RfbmFtZSA9ICd3aGVyZSc7XG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gdGhpcy5yZXNvbHZlVmFsdWUoY29uZGl0aW9uLnJpZ2h0LlZhbHVlKVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoY29uZGl0aW9uLnJpZ2h0LCAnU3VicXVlcnknKSkge1xuICAgICAgICAgICAgICAgICAgICByaWdodCA9ICdmdW5jdGlvbigkcXVlcnkpIHtcXG4nXG4gICAgICAgICAgICAgICAgICAgICAgICArICdcXHQnICsgYWRkVGFiVG9FdmVyeUxpbmUoKG5ldyBDb252ZXJ0ZXIoY29uZGl0aW9uLnJpZ2h0LlN1YnF1ZXJ5LCB0aGlzKS5ydW4oZmFsc2UpKS5yZXBsYWNlKCdEQjo6dGFibGUnLCAnJHF1ZXJ5LT5mcm9tJyksIDIpICsgJztcXG4nXG4gICAgICAgICAgICAgICAgICAgICAgICArICd9J1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoY29uZGl0aW9uLnJpZ2h0LCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgICAgICByaWdodCA9ICdEQjo6cmF3KCcgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGNvbmRpdGlvbi5yaWdodC5GdW5jdGlvbikgKyAnKSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgY29uZGl0aW9uLnJpZ2h0IHR5cGU6JyArIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoY29uZGl0aW9uLnJpZ2h0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJygnICsgbGVmdCArICcsJyArIHF1b3RlKHRoaXMudHJhbnNmb3JtQmluYXJ5T3AoY29uZGl0aW9uLm9wKSkgKyAnLCcgKyByaWdodCArICcpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdFeGlzdHMnKSB7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2goXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgJ3doZXJlRXhpc3RzJykgKyAnKGZ1bmN0aW9uICgkcXVlcnkpIHtcXG4nICtcbiAgICAgICAgICAgICAgICAnXFx0JyArICBhZGRUYWJUb0V2ZXJ5TGluZSgobmV3IENvbnZlcnRlcihjb25kaXRpb24sIHRoaXMpKS5ydW4oZmFsc2UpLCAyKS5yZXBsYWNlKCdEQjo6dGFibGUnLCAnJHF1ZXJ5LT5mcm9tJykgKyAnO1xcbicgK1xuICAgICAgICAgICAgICAgICd9J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0JldHdlZW4nKSB7XG4gICAgICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBjb25kaXRpb24ubmVnYXRlZCA9PT0gdHJ1ZSA/ICd3aGVyZU5vdEJldHdlZW4nIDogJ3doZXJlQmV0d2Vlbic7XG5cbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaChcbiAgICAgICAgICAgICAgdGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJygnXG4gICAgICAgICAgICAgICsgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSkgKyAnLCdcbiAgICAgICAgICAgICAgKyAnWycgKyB0aGlzLnJlc29sdmVWYWx1ZShjb25kaXRpb24ubG93LlZhbHVlKSArICcsJyArIHRoaXMucmVzb2x2ZVZhbHVlKGNvbmRpdGlvbi5oaWdoLlZhbHVlKSArICddKSdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdJblN1YnF1ZXJ5Jykge1xuICAgICAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gY29uZGl0aW9uLm5lZ2F0ZWQgPT09IHRydWUgPyAnd2hlcmVOb3RJbicgOiAnd2hlcmVJbic7XG5cbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaChcbiAgICAgICAgICAgICAgdGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpXG4gICAgICAgICAgICAgICsgJygnICsgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSkgKyAnLCcgKyAnKGZ1bmN0aW9uICgkcXVlcnkpIHtcXG4nXG4gICAgICAgICAgICAgICsgJ1xcdCcgKyBhZGRUYWJUb0V2ZXJ5TGluZSgobmV3IENvbnZlcnRlcihjb25kaXRpb24uc3VicXVlcnksIHRoaXMpKS5ydW4oZmFsc2UpLCAyKS5yZXBsYWNlKCdEQjo6dGFibGUnLCAnJHF1ZXJ5LT5mcm9tJykgKyAnO1xcbidcbiAgICAgICAgICAgICAgKyAnfSdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdGdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKERCOjpyYXcoXCInICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShjb25kaXRpb24sIGZhbHNlKSArICdcIikpJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdVbmFyeU9wJykge1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMucHJlcGFyZUNvbmRpdGlvbnMoZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChjb25kaXRpb24uZXhwciksIGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24uZXhwciksIG9wLCBtZXRob2RfbmFtZSlbMF0ucmVwbGFjZSgvd2hlcmUvaSwgJ3doZXJlJyArIGNvbmRpdGlvbi5vcCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgY29uZGl0aW9uIHR5cGUgWycgKyBjb25kaXRpb25fdHlwZSArICddJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjb25kaXRpb25zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBvcFxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICB0cmFuc2Zvcm1CaW5hcnlPcChvcCkge1xuICAgICAgICBsZXQgb3BlcmF0b3JfYnlfb3AgPSB7XG4gICAgICAgICAgICAnRXEnOiAnPScsXG4gICAgICAgICAgICAnR3QnOiAnPicsXG4gICAgICAgICAgICAnR3RFcSc6ICc+PScsXG4gICAgICAgICAgICAnTHQnOiAnPCcsXG4gICAgICAgICAgICAnTHRFcSc6ICc8JyxcbiAgICAgICAgICAgICdOb3RFcSc6ICchPScsXG4gICAgICAgICAgICAnTGlrZSc6ICdsaWtlJyxcbiAgICAgICAgICAgICdNaW51cyc6ICctJyxcbiAgICAgICAgICAgICdQbHVzJzogJysnLFxuICAgICAgICAgICAgJ011bHRpcGx5JzogJyonLFxuICAgICAgICAgICAgJ0RpdmlkZSc6ICcvJ1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBvcGVyYXRvcl9ieV9vcFtvcF07XG4gICAgfVxuXG4gICAgYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSB7XG4gICAgICAgIGlmIChvcCA9PT0gJycgfHwgb3AgPT09ICdBbmQnKSB7XG4gICAgICAgICAgICByZXR1cm4gbWV0aG9kX25hbWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3AudG9Mb3dlckNhc2UoKSArIGNhcGl0YWxpemVGaXJzdExldHRlcihtZXRob2RfbmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVTZWxlY3RTZWN0aW9uKCkge1xuICAgICAgICBsZXQgcmVzID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RfaXRlbSBvZiB0aGlzLmFzdC5ib2R5LlNlbGVjdC5wcm9qZWN0aW9uKSB7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoc2VsZWN0X2l0ZW0sICdFeHByV2l0aEFsaWFzJykpIHtcbiAgICAgICAgICAgICAgICBsZXQgYWxpYXMgPSBzZWxlY3RfaXRlbS5FeHByV2l0aEFsaWFzLmFsaWFzLnZhbHVlO1xuICAgICAgICAgICAgICAgIHJlcy5wdXNoKHRoaXMucmVzb2x2ZVNlbGVjdFNlY3Rpb25JdGVtKHNlbGVjdF9pdGVtLkV4cHJXaXRoQWxpYXMuZXhwciwgYWxpYXMpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoc2VsZWN0X2l0ZW0sICdVbm5hbWVkRXhwcicpKSB7XG4gICAgICAgICAgICAgICAgcmVzLnB1c2godGhpcy5yZXNvbHZlU2VsZWN0U2VjdGlvbkl0ZW0oc2VsZWN0X2l0ZW0uVW5uYW1lZEV4cHIpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2VsZWN0X2l0ZW0gPT09ICdXaWxkY2FyZCcpIHtcbiAgICAgICAgICAgICAgICByZXMucHVzaChxdW90ZSgnKicpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoc2VsZWN0X2l0ZW0sICdRdWFsaWZpZWRXaWxkY2FyZCcpKSB7XG4gICAgICAgICAgICAgICAgcmVzLnB1c2gocXVvdGUodGhpcy5nZXRBY3R1YWxUYWJsZU5hbWUoc2VsZWN0X2l0ZW0uUXVhbGlmaWVkV2lsZGNhcmRbMF0udmFsdWUpICsgJy4qJykpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIHNlbGVjdCBpdGVtIFsnICsgT2JqZWN0LmtleXMoc2VsZWN0X2l0ZW0pWzBdICsgJ10nO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICdzZWxlY3QoJyArIHJlcy5qb2luKCcsICcpICsgJyknO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBzZWxlY3RfaXRlbVxuICAgICAqIEBwYXJhbSBhbGlhc1xuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlU2VsZWN0U2VjdGlvbkl0ZW0oc2VsZWN0X2l0ZW0sIGFsaWFzID0gbnVsbCkge1xuICAgICAgICBhc3NlcnQoaXNVbmRlZmluZWRPck51bGwoc2VsZWN0X2l0ZW0pID09PSBmYWxzZSwgJ3NlbGVjdF9pdGVtIG11c3Qgbm90IGJlIHVuZGVmaW5lZCBvciBudWxsJyk7XG5cbiAgICAgICAgbGV0IGl0ZW07XG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChzZWxlY3RfaXRlbSwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIGl0ZW0gPSAnREI6OnJhdyhcIicgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKHNlbGVjdF9pdGVtLkZ1bmN0aW9uKTtcblxuICAgICAgICAgICAgaWYgKGFsaWFzICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaXRlbSA9IGl0ZW0gKyAnIGFzICcgKyBhbGlhcyArICdcIiknO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGl0ZW0gPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qoc2VsZWN0X2l0ZW0pLCBmYWxzZSk7XG5cbiAgICAgICAgICAgIGlmIChhbGlhcyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGl0ZW0gPSBpdGVtICsgJyBhcyAnICsgYWxpYXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBxdW90ZShpdGVtKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhcnNlRnVuY3Rpb25Ob2RlKGZ1bmN0aW9uX25vZGUsIG5lZWRfcXVvdGUgPSB0cnVlKSB7XG4gICAgICAgIGxldCBmdW5jdGlvbl9uYW1lID0gZnVuY3Rpb25fbm9kZS5uYW1lWzBdLnZhbHVlO1xuXG4gICAgICAgIGlmIChuZWVkX3F1b3RlKSB7XG4gICAgICAgICAgICBmdW5jdGlvbl9uYW1lID0gcXVvdGUoZnVuY3Rpb25fbmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcmVzID0gZnVuY3Rpb25fbmFtZSArICcoJztcbiAgICAgICAgbGV0IGFyZ3MgPSBmdW5jdGlvbl9ub2RlLmFyZ3M7XG4gICAgICAgIGxldCBhcmdfY291bnQgPSBhcmdzLmxlbmd0aDtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyZ19jb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgYXJnID0gYXJnc1tpXTtcblxuICAgICAgICAgICAgaWYgKGFyZy5Vbm5hbWVkID09PSAnV2lsZGNhcmQnKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgJyonO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnVmFsdWUnKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIHRoaXMucmVzb2x2ZVZhbHVlKGFyZy5Vbm5hbWVkLkV4cHIuVmFsdWUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgYXJnLlVubmFtZWQuRXhwci5JZGVudGlmaWVyLnZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnQ29tcG91bmRJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihhcmcuVW5uYW1lZC5FeHByLkNvbXBvdW5kSWRlbnRpZmllcik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdOZXN0ZWQnKSkgeyAvLyBlLmcuIENPVU5UKERJU1RJTkNUKCdpZCcpKVxuICAgICAgICAgICAgICAgIGxldCBhcmdfY29sdW1uID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGFyZy5Vbm5hbWVkLkV4cHIuTmVzdGVkKSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZnVuY3Rpb25fbm9kZS5kaXN0aW5jdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICBhcmdfY29sdW1uID0gJ0RJU1RJTkNUKCcgKyBhcmdfY29sdW1uICsgJyknO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIGFyZ19jb2x1bW47XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShhcmcuVW5uYW1lZC5FeHByLkZ1bmN0aW9uLCBmYWxzZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdCaW5hcnlPcCcpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgdGhpcy5wYXJzZUJpbmFyeU9wTm9kZShhcmcuVW5uYW1lZC5FeHByLkJpbmFyeU9wKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ1VuYXJ5T3AnKSkge1xuICAgICAgICAgICAgICAgIC8vIHRvZG9cbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0Nhc2UnKSkge1xuICAgICAgICAgICAgICAgIC8vIHRvZG9cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgYXJnIHR5cGU6JyArIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoYXJnLlVubmFtZWQuRXhwcik7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgaWYgKGkgIT09IGFyZ19jb3VudCAtIDEpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyAnLCAnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmVzID0gcmVzICsgJyknO1xuXG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBoYXNKb2luU2VjdGlvbihmcm9tX2l0ZW0pIHtcbiAgICAgICAgcmV0dXJuIHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbSwgJ2pvaW5zJykgJiYgZnJvbV9pdGVtLmpvaW5zLmxlbmd0aCA+IDA7XG4gICAgfVxuXG4gICAgcGFyc2VCaW5hcnlPcFBhcnRpYWwobGVmdF9vcl9yaWdodCkge1xuICAgICAgICBsZXQgcmVzO1xuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgcmVzID0gcXVvdGUodGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShsZWZ0X29yX3JpZ2h0LkZ1bmN0aW9uKSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ0lkZW50aWZpZXInLCAnQ29tcG91bmRJZGVudGlmaWVyJykpe1xuICAgICAgICAgICAgcmVzID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGxlZnRfb3JfcmlnaHQpKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnVmFsdWUnKSkge1xuICAgICAgICAgICAgcmVzID0gdGhpcy5yZXNvbHZlVmFsdWUobGVmdF9vcl9yaWdodC5WYWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ0JpbmFyeU9wJykpIHtcbiAgICAgICAgICAgIHJlcyA9IHRoaXMucGFyc2VCaW5hcnlPcE5vZGUobGVmdF9vcl9yaWdodC5CaW5hcnlPcCk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ1N1YnF1ZXJ5JykpIHtcbiAgICAgICAgICAgIC8vIHRvZG9cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIHR5cGUgaW4gYmluYXJ5IG9wIGxlZnQgb3IgcmlnaHQuJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfVxuXG4gICAgcGFyc2VCaW5hcnlPcE5vZGUoYmluYXJ5X29wLCBzZXBhcmF0b3IgPSAnICcpIHtcbiAgICAgICAgbGV0IGxlZnQgPSB0aGlzLnBhcnNlQmluYXJ5T3BQYXJ0aWFsKGJpbmFyeV9vcC5sZWZ0KTtcbiAgICAgICAgbGV0IG9wID0gcXVvdGUodGhpcy50cmFuc2Zvcm1CaW5hcnlPcChiaW5hcnlfb3Aub3ApKTtcbiAgICAgICAgbGV0IHJpZ2h0ID0gdGhpcy5wYXJzZUJpbmFyeU9wUGFydGlhbChiaW5hcnlfb3AucmlnaHQpO1xuXG4gICAgICAgIHJldHVybiBbbGVmdCwgb3AsIHJpZ2h0XS5qb2luKHNlcGFyYXRvcik7XG4gICAgfVxuXG4gICAgcHJlcGFyZUpvaW5zKGZyb21faXRlbSkge1xuICAgICAgICBsZXQgam9pbnMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGpvaW4gb2YgZnJvbV9pdGVtLmpvaW5zKSB7XG4gICAgICAgICAgICBsZXQgam9pbl9vcGVyYXRvcl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChqb2luLmpvaW5fb3BlcmF0b3IpO1xuICAgICAgICAgICAgbGV0IGpvaW5fbWV0aG9kID0ge1xuICAgICAgICAgICAgICAgICdJbm5lcic6ICdqb2luJyxcbiAgICAgICAgICAgICAgICAnTGVmdE91dGVyJzogJ2xlZnRKb2luJyxcbiAgICAgICAgICAgICAgICAnUmlnaHRPdXRlcic6ICdyaWdodEpvaW4nLFxuICAgICAgICAgICAgfVtqb2luX29wZXJhdG9yX3R5cGVdO1xuICAgICAgICAgICAgbGV0IGpvaW5fb3BlcmF0b3IgPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qoam9pbi5qb2luX29wZXJhdG9yKTtcbiAgICAgICAgICAgIGxldCBjb25kaXRpb25fdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qoam9pbl9vcGVyYXRvci5Pbik7XG4gICAgICAgICAgICBsZXQgY29uZGl0aW9uID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGpvaW5fb3BlcmF0b3IuT24pO1xuICAgICAgICAgICAgbGV0IGNvbmRpdGlvbnMgPSB0aGlzLnByZXBhcmVDb25kaXRpb25zKGNvbmRpdGlvbl90eXBlLCBjb25kaXRpb24sICcnLCAnb24nKTtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGpvaW4ucmVsYXRpb24sICdEZXJpdmVkJykpIHsgLy8gam9pbmVkIHNlY3Rpb24gaXMgc3ViLXF1ZXJ5XG4gICAgICAgICAgICAgICAgbGV0IHN1Yl9xdWVyeV9zcWwgPSBuZXcgQ29udmVydGVyKGpvaW4ucmVsYXRpb24uRGVyaXZlZC5zdWJxdWVyeSwgdGhpcykucnVuKGZhbHNlKTtcbiAgICAgICAgICAgICAgICBsZXQgc3ViX3F1ZXJ5X2FsaWFzID0gam9pbi5yZWxhdGlvbi5EZXJpdmVkLmFsaWFzLm5hbWUudmFsdWU7XG4gICAgICAgICAgICAgICAgam9pbnMucHVzaChqb2luX21ldGhvZCArICcoREI6OnJhdyhcIicgKyBhZGRUYWJUb0V2ZXJ5TGluZShzdWJfcXVlcnlfc3FsKSArICdcIikgYXMgJ1xuICAgICAgICAgICAgICAgICAgICArIHN1Yl9xdWVyeV9hbGlhcyArICcpLCBmdW5jdGlvbigkam9pbikge1xcblxcdCdcbiAgICAgICAgICAgICAgICAgICAgKyAnJGpvaW4tPicgKyBhZGRUYWJUb0V2ZXJ5TGluZShjb25kaXRpb25zLmpvaW4oJ1xcbi0+JykgKyAnOycsIDIpXG4gICAgICAgICAgICAgICAgICAgICsgJ1xcbn0nKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoam9pbi5yZWxhdGlvbiwgJ1RhYmxlJykpIHtcbiAgICAgICAgICAgICAgICBsZXQgam9pbmVkX3RhYmxlID0gdGhpcy5yZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZShqb2luLnJlbGF0aW9uKTtcblxuICAgICAgICAgICAgICAgIGlmIChjb25kaXRpb25zLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoam9pbl9vcGVyYXRvci5PbiwgJ0JpbmFyeU9wJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGpvaW5zLnB1c2goam9pbl9tZXRob2QgKyAnKCcgKyBqb2luZWRfdGFibGUgKyAnLCcgKyB0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKGpvaW5fb3BlcmF0b3IuT24uQmluYXJ5T3AsICcsJykgKyAnKScpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGpvaW5fb3BlcmF0b3IuT24sICdOZXN0ZWQnKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgY29uZGl0aW9ucyA9IHRoaXMucHJlcGFyZUNvbmRpdGlvbnMoJ05lc3RlZCcsIGpvaW5fb3BlcmF0b3IuT24uTmVzdGVkLCAnJywgJ29uJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGpvaW5zLnB1c2goY29uZGl0aW9uc1swXSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBvbiB0eXBlJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGpvaW5zLnB1c2goam9pbl9tZXRob2QgKyAnKCcgKyBqb2luZWRfdGFibGUgKyAnLCdcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJ2Z1bmN0aW9uKCRqb2luKSB7XFxuXFx0J1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnJGpvaW4tPicgKyBhZGRUYWJUb0V2ZXJ5TGluZShjb25kaXRpb25zLmpvaW4oJ1xcbi0+JykpICsgJzsnXG4gICAgICAgICAgICAgICAgICAgICAgICArICdcXG59KSdcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGpvaW4gcmVsYXRpb24gdHlwZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gam9pbnM7XG4gICAgfVxuXG4gICAgcmVzb2x2ZUpvaW5TZWN0aW9uKGZyb21faXRlbSkge1xuICAgICAgICByZXR1cm4gdGhpcy5wcmVwYXJlSm9pbnMoZnJvbV9pdGVtKS5qb2luKCdcXG4tPicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBmcm9tX2l0ZW1zXG4gICAgICogQHJldHVybiB7c3RyaW5nW119XG4gICAgICovXG4gICAgcmVzb2x2ZUNyb3NzSm9pblNlY3Rpb24oZnJvbV9pdGVtcykge1xuICAgICAgICBsZXQgY3Jvc3Nfam9pbl9zZWN0aW9ucyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgZnJvbV9pdGVtIG9mIGZyb21faXRlbXMpIHtcbiAgICAgICAgICAgIGxldCBjcm9zc19qb2luX3N0cjtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbS5yZWxhdGlvbiwgJ1RhYmxlJykpIHtcbiAgICAgICAgICAgICAgICBjcm9zc19qb2luX3N0ciA9ICdjcm9zc0pvaW4oJyArIHRoaXMucmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUoZnJvbV9pdGVtLnJlbGF0aW9uKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLnJlbGF0aW9uLCAnRGVyaXZlZCcpKSB7XG4gICAgICAgICAgICAgICAgY3Jvc3Nfam9pbl9zdHIgPSB0aGlzLnJlc29sdmVGcm9tU3ViU2VjdGlvbignY3Jvc3NKb2luU3ViJywgZnJvbV9pdGVtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgY3Jvc3Mgam9pbiByZWxhdGlvbiB0eXBlJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY3Jvc3Nfam9pbl9zZWN0aW9ucy5wdXNoKGNyb3NzX2pvaW5fc3RyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjcm9zc19qb2luX3NlY3Rpb25zO1xuICAgIH1cblxuICAgIHJlc29sdmVHcm91cEJ5U2VjdGlvbigpIHtcbiAgICAgICAgbGV0IGdyb3VwX2J5X2NvbHVtbnMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGdyb3VwX2J5X2l0ZW0gb2YgdGhpcy5hc3QuYm9keS5TZWxlY3QuZ3JvdXBfYnkpIHtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChncm91cF9ieV9pdGVtLCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgIGdyb3VwX2J5X2NvbHVtbnMucHVzaCgnREI6OnJhdygnICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShncm91cF9ieV9pdGVtLkZ1bmN0aW9uKSArICdcIiknKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZihwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChncm91cF9ieV9pdGVtLCAnSWRlbnRpZmllcicsICdDb21wb3VuZElkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgIGdyb3VwX2J5X2NvbHVtbnMucHVzaCh0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoZ3JvdXBfYnlfaXRlbSkpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZ3JvdXBfYnlfaXRlbSwgJ05lc3RlZCcpKSB7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGdyb3VwX2J5X2l0ZW0sICdWYWx1ZScpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBfYnlfY29sdW1ucy5wdXNoKHRoaXMucmVzb2x2ZVZhbHVlKGdyb3VwX2J5X2l0ZW0uVmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgZ3JvdXAgYnkgdHlwZTonICsgZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChncm91cF9ieV9pdGVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAnZ3JvdXBCeSgnICsgZ3JvdXBfYnlfY29sdW1ucy5qb2luKCcsJykgKyAnKSc7XG4gICAgfVxuXG4gICAgcmVzb2x2ZUhhdmluZ1NlY3Rpb24oKSB7XG4gICAgICAgIGxldCBiaW5hcnlfb3AgPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QodGhpcy5hc3QuYm9keS5TZWxlY3QuaGF2aW5nLCAnQmluYXJ5T3AnKTtcbiAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gcHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYmluYXJ5X29wLmxlZnQsICdGdW5jdGlvbicpID8gJ2hhdmluZ1JhdycgOiAnaGF2aW5nJztcblxuICAgICAgICByZXR1cm4gbWV0aG9kX25hbWUgKyAnKCcgKyB0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKGJpbmFyeV9vcCwgJywnKSArICcpJztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVPcmRlckJ5U2VjdGlvbigpIHtcbiAgICAgICAgbGV0IG9yZGVyX2J5cyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3Qgb3JkZXJfYnlfaXRlbSBvZiB0aGlzLmFzdC5vcmRlcl9ieSkge1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKG9yZGVyX2J5X2l0ZW0uZXhwciwgJ0JpbmFyeU9wJykpIHtcbiAgICAgICAgICAgICAgICBvcmRlcl9ieXMucHVzaCgnb3JkZXJCeVJhdygnICsgcXVvdGUodGhpcy5wYXJzZUJpbmFyeU9wTm9kZShvcmRlcl9ieV9pdGVtLmV4cHIuQmluYXJ5T3ApKSArICcpJyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKG9yZGVyX2J5X2l0ZW0uZXhwciwgJ0lkZW50aWZpZXInLCAnQ29tcG91bmRJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICBvcmRlcl9ieXMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgJ29yZGVyQnkoJyArXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChvcmRlcl9ieV9pdGVtLmV4cHIpKSArICcsJyArXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlKG9yZGVyX2J5X2l0ZW0uYXNjID09PSBmYWxzZSA/ICdkZXNjJzogJ2FzYycpICsgJyknXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwob3JkZXJfYnlfaXRlbS5leHByLCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgIG9yZGVyX2J5cy5wdXNoKCdvcmRlckJ5UmF3KFwiJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUob3JkZXJfYnlfaXRlbS5leHByLkZ1bmN0aW9uKSArICcgJyArIChvcmRlcl9ieV9pdGVtLmFzYyA9PT0gZmFsc2UgPyAnZGVzYyc6ICdhc2MnKSArICdcIiknKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgb3JkZXIgYnkgdHlwZTonICsgZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChvcmRlcl9ieV9pdGVtLmV4cHIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9yZGVyX2J5cy5qb2luKCdcXG4tPicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB2YWx1ZU5vZGVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd8Kn1cbiAgICAgKi9cbiAgICByZXNvbHZlVmFsdWUodmFsdWVOb2RlKSB7XG4gICAgICAgIGlmIChpc1N0cmluZyh2YWx1ZU5vZGUpICYmIHZhbHVlTm9kZS50b0xvd2VyQ2FzZSgpID09PSAnbnVsbCcpIHtcbiAgICAgICAgICAgIHJldHVybiAnbnVsbCc7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdmFsdWUgPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QodmFsdWVOb2RlKTtcbiAgICAgICAgbGV0IHZhbHVlX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KHZhbHVlTm9kZSk7XG5cbiAgICAgICAgaWYgKHZhbHVlX3R5cGUgPT09ICdTaW5nbGVRdW90ZWRTdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gcXVvdGUodmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlX3R5cGUgPT09ICdOdW1iZXInKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVbMF07XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVfdHlwZSA9PT0gJ0NvbXBvdW5kSWRlbnRpZmllcicgfHwgdmFsdWVfdHlwZSA9PT0gJ0lkZW50aWZpZXInKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4odmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlX3R5cGUgPT09ICdCb29sZWFuJykge1xuICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGFyZyB2YWx1ZSB0eXBlOicgKyB2YWx1ZV90eXBlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0QWN0dWFsVGFibGVOYW1lKHRhYmxlX25hbWVfb3JfYWxpYXMpIHtcbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMudGFibGVfbmFtZV9ieV9hbGlhcywgdGFibGVfbmFtZV9vcl9hbGlhcykpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRhYmxlX25hbWVfYnlfYWxpYXNbdGFibGVfbmFtZV9vcl9hbGlhc107XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wYXJlbnQgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50LmdldEFjdHVhbFRhYmxlTmFtZSh0YWJsZV9uYW1lX29yX2FsaWFzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0YWJsZV9uYW1lX29yX2FsaWFzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBpZGVudGlmaWVyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBuZWVkX3F1b3RlXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihpZGVudGlmaWVyLCBuZWVkX3F1b3RlID0gdHJ1ZSkge1xuICAgICAgICBsZXQgdmFsdWVzID0gW2lkZW50aWZpZXJdLmZsYXQoKS5tYXAoKGkpID0+IGkudmFsdWUpO1xuICAgICAgICBsZXQgdGFibGVfbmFtZV9vcl9hbGlhcyA9IHZhbHVlc1swXTtcblxuICAgICAgICAvLyBGaXJzdCBpbmRleCBhbHdheXMgaXMgdGFibGUgbmFtZSBvciBhbGlhcywgY2hhbmdlIGl0IHRvIGFjdHVhbCB0YWJsZSBuYW1lLlxuICAgICAgICB2YWx1ZXNbMF0gPSB0aGlzLmdldEFjdHVhbFRhYmxlTmFtZSh0YWJsZV9uYW1lX29yX2FsaWFzKTtcblxuICAgICAgICBsZXQgcmVzID0gdmFsdWVzLmpvaW4oJy4nKTtcblxuICAgICAgICBpZiAobmVlZF9xdW90ZSkge1xuICAgICAgICAgICAgcmVzID0gcXVvdGUocmVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfVxufVxuXG4vKipcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gY29uZGl0aW9uXG4gKiBAcGFyYW0ge3N0cmluZ30gbXNnXG4gKi9cbmZ1bmN0aW9uIGFzc2VydChjb25kaXRpb24sIG1zZykge1xuICAgIGlmICghY29uZGl0aW9uKSB7XG4gICAgICAgIHRocm93IG1zZztcbiAgICB9XG59XG5cbi8qKlxuICogQHBhcmFtIG9ialxuICogQHBhcmFtIHByb3BlcnR5X25hbWVzXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5mdW5jdGlvbiBwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChvYmosIC4uLnByb3BlcnR5X25hbWVzKSB7XG4gICAgcmV0dXJuIHByb3BlcnR5X25hbWVzLnJlZHVjZSgoY2FycnksIHByb3BlcnR5X25hbWUpID0+IGNhcnJ5IHx8IChvYmouaGFzT3duUHJvcGVydHkocHJvcGVydHlfbmFtZSkgJiYgb2JqW3Byb3BlcnR5X25hbWVdICE9PSBudWxsKSwgZmFsc2UpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZnVuY3Rpb24gaXNTdHJpbmcodmFsdWUpIHtcbiAgICByZXR1cm4gIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBTdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGNhcGl0YWxpemVGaXJzdExldHRlcihzdHJpbmcpIHtcbiAgICByZXR1cm4gc3RyaW5nLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc3RyaW5nLnNsaWNlKDEpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiBxdW90ZSh2YWx1ZSkge1xuICAgIHJldHVybiBcIidcIiArIHZhbHVlICsgXCInXCI7XG59XG5cbi8qKlxuICogQHBhcmFtIHZhbHVlXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiB1bnF1b3RlKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1snXCJdKy9nLCAnJyk7XG59XG5cbi8qKlxuICogQHBhcmFtIG9ialxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KG9iaikge1xuICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCAhPT0gMSkge1xuICAgICAgICB0aHJvdyAnVGhlIGZ1bmN0aW9uIGNhbiBvbmx5IGJlIGNhbGxlZCBvbiBvYmplY3QgdGhhdCBoYXMgb25lIGtleSwgb2JqZWN0OiAnICsgSlNPTi5zdHJpbmdpZnkob2JqKTtcbiAgICB9XG5cbiAgICByZXR1cm4gT2JqZWN0LmtleXMob2JqKVswXTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gb2JqXG4gKiBAcmV0dXJuIHsqfVxuICovXG5mdW5jdGlvbiBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qob2JqKSB7XG4gICAgcmV0dXJuIG9ialtnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KG9iaildO1xufVxuXG4vKipcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZnVuY3Rpb24gaXNVbmRlZmluZWRPck51bGwodmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJyB8fCB2YWx1ZSA9PT0gbnVsbDtcbn1cblxuLyoqXG4gKiBAcGFyYW0gc3RyXG4gKiBAcGFyYW0gdGFiX2NvdW50XG4gKi9cbmZ1bmN0aW9uIGFkZFRhYlRvRXZlcnlMaW5lKHN0ciwgdGFiX2NvdW50ID0gMSkge1xuICAgIGxldCBzZXBhcmF0b3IgPSAnXFxuJztcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGFiX2NvdW50OyBpKyspIHtcbiAgICAgICAgc2VwYXJhdG9yID0gc2VwYXJhdG9yICsgJ1xcdCc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0ci5zcGxpdCgnXFxuJykuam9pbihzZXBhcmF0b3IpO1xufVxuXG4iLCIvLyBJbXBvcnRzXG5pbXBvcnQgX19fQ1NTX0xPQURFUl9BUElfU09VUkNFTUFQX0lNUE9SVF9fXyBmcm9tIFwiLi4vbm9kZV9tb2R1bGVzL2Nzcy1sb2FkZXIvZGlzdC9ydW50aW1lL3NvdXJjZU1hcHMuanNcIjtcbmltcG9ydCBfX19DU1NfTE9BREVSX0FQSV9JTVBPUlRfX18gZnJvbSBcIi4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvcnVudGltZS9hcGkuanNcIjtcbmltcG9ydCBfX19DU1NfTE9BREVSX0dFVF9VUkxfSU1QT1JUX19fIGZyb20gXCIuLi9ub2RlX21vZHVsZXMvY3NzLWxvYWRlci9kaXN0L3J1bnRpbWUvZ2V0VXJsLmpzXCI7XG52YXIgX19fQ1NTX0xPQURFUl9VUkxfSU1QT1JUXzBfX18gPSBuZXcgVVJMKFwiZGF0YTppbWFnZS9zdmcreG1sLCUzQ3N2ZyB3aWR0aD0lMjc2MCUyNyBoZWlnaHQ9JTI3NjAlMjcgdmlld0JveD0lMjcwIDAgNjAgNjAlMjcgeG1sbnM9JTI3aHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmclMjclM0UlM0NnIGZpbGw9JTI3bm9uZSUyNyBmaWxsLXJ1bGU9JTI3ZXZlbm9kZCUyNyUzRSUzQ2cgZmlsbD0lMjclMjNmZmZmZmYlMjcgZmlsbC1vcGFjaXR5PSUyNzAuMDUlMjclM0UlM0NwYXRoIGQ9JTI3TTM2IDM0di00aC0ydjRoLTR2Mmg0djRoMnYtNGg0di0yaC00em0wLTMwVjBoLTJ2NGgtNHYyaDR2NGgyVjZoNFY0aC00ek02IDM0di00SDR2NEgwdjJoNHY0aDJ2LTRoNHYtMkg2ek02IDRWMEg0djRIMHYyaDR2NGgyVjZoNFY0SDZ6JTI3LyUzRSUzQy9nJTNFJTNDL2clM0UlM0Mvc3ZnJTNFXCIsIGltcG9ydC5tZXRhLnVybCk7XG52YXIgX19fQ1NTX0xPQURFUl9FWFBPUlRfX18gPSBfX19DU1NfTE9BREVSX0FQSV9JTVBPUlRfX18oX19fQ1NTX0xPQURFUl9BUElfU09VUkNFTUFQX0lNUE9SVF9fXyk7XG52YXIgX19fQ1NTX0xPQURFUl9VUkxfUkVQTEFDRU1FTlRfMF9fXyA9IF9fX0NTU19MT0FERVJfR0VUX1VSTF9JTVBPUlRfX18oX19fQ1NTX0xPQURFUl9VUkxfSU1QT1JUXzBfX18pO1xuLy8gTW9kdWxlXG5fX19DU1NfTE9BREVSX0VYUE9SVF9fXy5wdXNoKFttb2R1bGUuaWQsIGAvKiBNb2Rlcm4gU1FMIHRvIExhcmF2ZWwgQnVpbGRlciAtIEN1c3RvbSBTdHlsZXMgKi9cblxuOnJvb3Qge1xuICAtLXByaW1hcnktZ3JhZGllbnQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM2NjdlZWEgMCUsICM3NjRiYTIgMTAwJSk7XG4gIC0tc2Vjb25kYXJ5LWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZjA5M2ZiIDAlLCAjZjU1NzZjIDEwMCUpO1xuICAtLXN1Y2Nlc3MtZ3JhZGllbnQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM0ZmFjZmUgMCUsICMwMGYyZmUgMTAwJSk7XG4gIC0tZGFyay1iZzogIzFhMWEyZTtcbiAgLS1jYXJkLWJnOiAjZmZmZmZmO1xuICAtLXRleHQtcHJpbWFyeTogIzJkMzc0ODtcbiAgLS10ZXh0LXNlY29uZGFyeTogIzcxODA5NjtcbiAgLS1ib3JkZXItY29sb3I6ICNlMmU4ZjA7XG4gIC0tc2hhZG93LXNtOiAwIDJweCA0cHggcmdiYSgwLCAwLCAwLCAwLjA1KTtcbiAgLS1zaGFkb3ctbWQ6IDAgNHB4IDZweCByZ2JhKDAsIDAsIDAsIDAuMDcpO1xuICAtLXNoYWRvdy1sZzogMCAxMHB4IDI1cHggcmdiYSgwLCAwLCAwLCAwLjEpO1xuICAtLXNoYWRvdy14bDogMCAyMHB4IDQwcHggcmdiYSgwLCAwLCAwLCAwLjE1KTtcbiAgLS1yYWRpdXMtc206IDhweDtcbiAgLS1yYWRpdXMtbWQ6IDEycHg7XG4gIC0tcmFkaXVzLWxnOiAxNnB4O1xufVxuXG4qIHtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbn1cblxuYm9keSB7XG4gIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICdTZWdvZSBVSScsICdSb2JvdG8nLCAnT3h5Z2VuJywgJ1VidW50dScsICdDYW50YXJlbGwnLCAnRmlyYSBTYW5zJywgJ0Ryb2lkIFNhbnMnLCAnSGVsdmV0aWNhIE5ldWUnLCBzYW5zLXNlcmlmO1xuICAtd2Via2l0LWZvbnQtc21vb3RoaW5nOiBhbnRpYWxpYXNlZDtcbiAgLW1vei1vc3gtZm9udC1zbW9vdGhpbmc6IGdyYXlzY2FsZTtcbiAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2Y1ZjdmYSAwJSwgI2MzY2ZlMiAxMDAlKTtcbiAgbWluLWhlaWdodDogMTAwdmg7XG59XG5cbi8qIEhlcm8gU2VjdGlvbiBSZWRlc2lnbiAqL1xuLmhlcm8uaXMtcHJpbWFyeSB7XG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIG92ZXJmbG93OiBoaWRkZW47XG59XG5cbi5oZXJvLmlzLXByaW1hcnk6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICcnO1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogMDtcbiAgbGVmdDogMDtcbiAgcmlnaHQ6IDA7XG4gIGJvdHRvbTogMDtcbiAgYmFja2dyb3VuZDogdXJsKCR7X19fQ1NTX0xPQURFUl9VUkxfUkVQTEFDRU1FTlRfMF9fX30pO1xuICBvcGFjaXR5OiAwLjM7XG59XG5cbi5oZXJvLWJvZHkge1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIHotaW5kZXg6IDE7XG4gIHBhZGRpbmc6IDNyZW0gMS41cmVtO1xufVxuXG4uaGVybyAudGl0bGUge1xuICBmb250LXNpemU6IDIuNXJlbTtcbiAgZm9udC13ZWlnaHQ6IDgwMDtcbiAgdGV4dC1zaGFkb3c6IDAgMnB4IDEwcHggcmdiYSgwLCAwLCAwLCAwLjEpO1xuICBsZXR0ZXItc3BhY2luZzogLTAuNXB4O1xufVxuXG4uaGVybyAuc3VidGl0bGUge1xuICBmb250LXNpemU6IDEuMjVyZW07XG4gIG9wYWNpdHk6IDAuOTU7XG4gIG1hcmdpbi10b3A6IDFyZW07XG59XG5cbi8qIE5hdmlnYXRpb24vSGVhZGVyICovXG4ubmF2LWhlYWRlciB7XG4gIHBhZGRpbmc6IDFyZW0gMnJlbTtcbiAgZGlzcGxheTogZmxleDtcbiAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXNtKTtcbn1cblxuLmdpdGh1Yi1saW5rIHtcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGdhcDogMC41cmVtO1xuICBwYWRkaW5nOiAwLjc1cmVtIDEuNXJlbTtcbiAgYmFja2dyb3VuZDogdmFyKC0tZGFyay1iZyk7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBmb250LXdlaWdodDogNjAwO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uZ2l0aHViLWxpbms6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTJweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG4gIGNvbG9yOiB3aGl0ZTtcbn1cblxuLmdpdGh1Yi1saW5rOjpiZWZvcmUge1xuICBjb250ZW50OiAn4piFJztcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xufVxuXG4vKiBNYWluIENvbnRlbnQgQXJlYSAqL1xuLmNvbnRlbnQtd3JhcHBlciB7XG4gIG1heC13aWR0aDogMTIwMHB4O1xuICBtYXJnaW46IDAgYXV0bztcbiAgcGFkZGluZzogMnJlbSAxcmVtO1xufVxuXG4uY29udmVydGVyLWNhcmQge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLWxnKTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXhsKTtcbiAgcGFkZGluZzogMi41cmVtO1xuICBtYXJnaW4tYm90dG9tOiAycmVtO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xufVxuXG4uY29udmVydGVyLWNhcmQ6aG92ZXIge1xuICBib3gtc2hhZG93OiAwIDI1cHggNTBweCByZ2JhKDAsIDAsIDAsIDAuMik7XG59XG5cbi8qIFNlY3Rpb24gSGVhZGVycyAqL1xuLnNlY3Rpb24taGVhZGVyIHtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjc1cmVtO1xuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xuICBmb250LXNpemU6IDEuMjVyZW07XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xufVxuXG4uc2VjdGlvbi1pY29uIHtcbiAgd2lkdGg6IDQwcHg7XG4gIGhlaWdodDogNDBweDtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIGZvbnQtc2l6ZTogMS4yNXJlbTtcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcbn1cblxuLyogVGV4dGFyZWEgUmVkZXNpZ24gKi9cbi50ZXh0YXJlYS13cmFwcGVyIHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICBtYXJnaW4tYm90dG9tOiAxLjVyZW07XG59XG5cbi50ZXh0YXJlYSB7XG4gIGJvcmRlcjogMnB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XG4gIHBhZGRpbmc6IDEuMjVyZW07XG4gIGZvbnQtc2l6ZTogMXJlbTtcbiAgZm9udC1mYW1pbHk6ICdNb25hY28nLCAnTWVubG8nLCAnVWJ1bnR1IE1vbm8nLCAnQ29uc29sYXMnLCAnc291cmNlLWNvZGUtcHJvJywgbW9ub3NwYWNlO1xuICBsaW5lLWhlaWdodDogMS42O1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xuICByZXNpemU6IHZlcnRpY2FsO1xuICBtaW4taGVpZ2h0OiAyMDBweDtcbiAgYmFja2dyb3VuZDogI2Y4ZmFmYztcbn1cblxuLnRleHRhcmVhOmZvY3VzIHtcbiAgb3V0bGluZTogbm9uZTtcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xuICBib3gtc2hhZG93OiAwIDAgMCAzcHggcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbn1cblxuLnRleHRhcmVhOjpwbGFjZWhvbGRlciB7XG4gIGNvbG9yOiAjYTBhZWMwO1xuICBmb250LXN0eWxlOiBpdGFsaWM7XG59XG5cbi8qIENvcHkgQnV0dG9uICovXG4uY29weS1idXR0b24ge1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogMC43NXJlbTtcbiAgcmlnaHQ6IDAuNzVyZW07XG4gIHBhZGRpbmc6IDAuNXJlbSAxcmVtO1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgY3Vyc29yOiBwb2ludGVyO1xuICBmb250LXNpemU6IDAuODc1cmVtO1xuICBmb250LXdlaWdodDogNjAwO1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4ycyBlYXNlO1xuICB6LWluZGV4OiAxMDtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjVyZW07XG59XG5cbi5jb3B5LWJ1dHRvbjpob3ZlciB7XG4gIGJhY2tncm91bmQ6ICM2NjdlZWE7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG59XG5cbi5jb3B5LWJ1dHRvbi5jb3BpZWQge1xuICBiYWNrZ3JvdW5kOiAjNDhiYjc4O1xuICBjb2xvcjogd2hpdGU7XG4gIGJvcmRlci1jb2xvcjogIzQ4YmI3ODtcbn1cblxuLyogQnV0dG9uIENvbnRyb2xzICovXG4uYnV0dG9uLWNvbnRyb2xzIHtcbiAgZGlzcGxheTogZmxleDtcbiAgZ2FwOiAxcmVtO1xuICBmbGV4LXdyYXA6IHdyYXA7XG59XG5cbi5idXR0b24ge1xuICBwYWRkaW5nOiAwLjg3NXJlbSAycmVtO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBmb250LXdlaWdodDogNzAwO1xuICBmb250LXNpemU6IDFyZW07XG4gIGJvcmRlcjogbm9uZTtcbiAgY3Vyc29yOiBwb2ludGVyO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xuICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjVyZW07XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbn1cblxuLmJ1dHRvbjo6YmVmb3JlIHtcbiAgY29udGVudDogJyc7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiA1MCU7XG4gIGxlZnQ6IDUwJTtcbiAgd2lkdGg6IDA7XG4gIGhlaWdodDogMDtcbiAgYm9yZGVyLXJhZGl1czogNTAlO1xuICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7XG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsIC01MCUpO1xuICB0cmFuc2l0aW9uOiB3aWR0aCAwLjZzLCBoZWlnaHQgMC42cztcbn1cblxuLmJ1dHRvbjpob3Zlcjo6YmVmb3JlIHtcbiAgd2lkdGg6IDMwMHB4O1xuICBoZWlnaHQ6IDMwMHB4O1xufVxuXG4uYnV0dG9uLmlzLXByaW1hcnkge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgY29sb3I6IHdoaXRlO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uYnV0dG9uLmlzLXByaW1hcnk6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTJweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG59XG5cbi5idXR0b24uaXMtc2Vjb25kYXJ5IHtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG4gIGNvbG9yOiAjNjY3ZWVhO1xuICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xufVxuXG4uYnV0dG9uLmlzLXNlY29uZGFyeTpob3ZlciB7XG4gIGJhY2tncm91bmQ6ICM2NjdlZWE7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xufVxuXG4vKiBMb2FkaW5nIEFuaW1hdGlvbiAqL1xuLmJ1dHRvbi5pcy1sb2FkaW5nIHtcbiAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gIG9wYWNpdHk6IDAuNztcbn1cblxuLmJ1dHRvbi5pcy1sb2FkaW5nOjphZnRlciB7XG4gIGNvbnRlbnQ6ICcnO1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHdpZHRoOiAxNnB4O1xuICBoZWlnaHQ6IDE2cHg7XG4gIHRvcDogNTAlO1xuICBsZWZ0OiA1MCU7XG4gIG1hcmdpbi1sZWZ0OiAtOHB4O1xuICBtYXJnaW4tdG9wOiAtOHB4O1xuICBib3JkZXI6IDJweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgYm9yZGVyLXRvcC1jb2xvcjogd2hpdGU7XG4gIGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgYW5pbWF0aW9uOiBidXR0b24tbG9hZGluZy1zcGlubmVyIDAuNnMgbGluZWFyIGluZmluaXRlO1xufVxuXG5Aa2V5ZnJhbWVzIGJ1dHRvbi1sb2FkaW5nLXNwaW5uZXIge1xuICBmcm9tIHtcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgwdHVybik7XG4gIH1cbiAgdG8ge1xuICAgIHRyYW5zZm9ybTogcm90YXRlKDF0dXJuKTtcbiAgfVxufVxuXG4vKiBGZWF0dXJlcyBTZWN0aW9uICovXG4uZmVhdHVyZXMtZ3JpZCB7XG4gIGRpc3BsYXk6IGdyaWQ7XG4gIGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KGF1dG8tZml0LCBtaW5tYXgoMjUwcHgsIDFmcikpO1xuICBnYXA6IDEuNXJlbTtcbiAgbWFyZ2luLXRvcDogMnJlbTtcbiAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbn1cblxuLmZlYXR1cmUtY2FyZCB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBwYWRkaW5nOiAxLjVyZW07XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XG59XG5cbi5mZWF0dXJlLWNhcmQ6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTRweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG59XG5cbi5mZWF0dXJlLWljb24ge1xuICB3aWR0aDogNTBweDtcbiAgaGVpZ2h0OiA1MHB4O1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgY29sb3I6IHdoaXRlO1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgZm9udC1zaXplOiAxLjVyZW07XG4gIG1hcmdpbi1ib3R0b206IDFyZW07XG59XG5cbi5mZWF0dXJlLXRpdGxlIHtcbiAgZm9udC1zaXplOiAxLjEyNXJlbTtcbiAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSk7XG4gIG1hcmdpbi1ib3R0b206IDAuNXJlbTtcbn1cblxuLmZlYXR1cmUtZGVzY3JpcHRpb24ge1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICBmb250LXNpemU6IDAuOXJlbTtcbiAgbGluZS1oZWlnaHQ6IDEuNjtcbn1cblxuLyogRm9vdGVyICovXG4ubW9kZXJuLWZvb3RlciB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBwYWRkaW5nOiAycmVtO1xuICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gIG1hcmdpbi10b3A6IDRyZW07XG4gIGJveC1zaGFkb3c6IDAgLTJweCAxMHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG59XG5cbi5tb2Rlcm4tZm9vdGVyIHAge1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICBtYXJnaW46IDA7XG59XG5cbi5tb2Rlcm4tZm9vdGVyIGEge1xuICBjb2xvcjogIzY2N2VlYTtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICBmb250LXdlaWdodDogNjAwO1xufVxuXG4ubW9kZXJuLWZvb3RlciBhOmhvdmVyIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG59XG5cbi8qIEFuaW1hdGlvbnMgKi9cbkBrZXlmcmFtZXMgZmFkZUluVXAge1xuICBmcm9tIHtcbiAgICBvcGFjaXR5OiAwO1xuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgyMHB4KTtcbiAgfVxuICB0byB7XG4gICAgb3BhY2l0eTogMTtcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7XG4gIH1cbn1cblxuLmZhZGUtaW4tdXAge1xuICBhbmltYXRpb246IGZhZGVJblVwIDAuNnMgZWFzZS1vdXQ7XG59XG5cbi8qIFN1Y2Nlc3MvRXJyb3IgTWVzc2FnZXMgKi9cbi5tZXNzYWdlLWJveCB7XG4gIHBhZGRpbmc6IDFyZW0gMS41cmVtO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBnYXA6IDAuNzVyZW07XG4gIGFuaW1hdGlvbjogZmFkZUluVXAgMC4zcyBlYXNlLW91dDtcbn1cblxuLm1lc3NhZ2UtYm94LnN1Y2Nlc3Mge1xuICBiYWNrZ3JvdW5kOiAjZDRlZGRhO1xuICBjb2xvcjogIzE1NTcyNDtcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjMjhhNzQ1O1xufVxuXG4ubWVzc2FnZS1ib3guZXJyb3Ige1xuICBiYWNrZ3JvdW5kOiAjZjhkN2RhO1xuICBjb2xvcjogIzcyMWMyNDtcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjZGMzNTQ1O1xufVxuXG4vKiBSZXNwb25zaXZlIERlc2lnbiAqL1xuQG1lZGlhIChtYXgtd2lkdGg6IDc2OHB4KSB7XG4gIC5oZXJvIC50aXRsZSB7XG4gICAgZm9udC1zaXplOiAxLjc1cmVtO1xuICB9XG5cbiAgLmhlcm8gLnN1YnRpdGxlIHtcbiAgICBmb250LXNpemU6IDFyZW07XG4gIH1cblxuICAuY29udmVydGVyLWNhcmQge1xuICAgIHBhZGRpbmc6IDEuNXJlbTtcbiAgfVxuXG4gIC5idXR0b24tY29udHJvbHMge1xuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIH1cblxuICAuYnV0dG9uIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgfVxuXG4gIC5uYXYtaGVhZGVyIHtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgIGdhcDogMXJlbTtcbiAgfVxuXG4gIC5mZWF0dXJlcy1ncmlkIHtcbiAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmcjtcbiAgfVxufVxuXG4vKiBDb2RlIEhpZ2hsaWdodGluZyBpbiBPdXRwdXQgKi9cbi50ZXh0YXJlYS5jb2RlLW91dHB1dCB7XG4gIGJhY2tncm91bmQ6ICMyZDM3NDg7XG4gIGNvbG9yOiAjZTJlOGYwO1xuICBib3JkZXItY29sb3I6ICM0YTU1Njg7XG59XG5cbi50ZXh0YXJlYS5jb2RlLW91dHB1dDpmb2N1cyB7XG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcbn1cblxuLyogVXRpbGl0eSBDbGFzc2VzICovXG4ubXQtMSB7IG1hcmdpbi10b3A6IDAuNXJlbTsgfVxuLm10LTIgeyBtYXJnaW4tdG9wOiAxcmVtOyB9XG4ubXQtMyB7IG1hcmdpbi10b3A6IDEuNXJlbTsgfVxuLm10LTQgeyBtYXJnaW4tdG9wOiAycmVtOyB9XG5cbi5tYi0xIHsgbWFyZ2luLWJvdHRvbTogMC41cmVtOyB9XG4ubWItMiB7IG1hcmdpbi1ib3R0b206IDFyZW07IH1cbi5tYi0zIHsgbWFyZ2luLWJvdHRvbTogMS41cmVtOyB9XG4ubWItNCB7IG1hcmdpbi1ib3R0b206IDJyZW07IH1cblxuLnRleHQtY2VudGVyIHsgdGV4dC1hbGlnbjogY2VudGVyOyB9XG4udGV4dC1tdXRlZCB7IGNvbG9yOiB2YXIoLS10ZXh0LXNlY29uZGFyeSk7IH1cbmAsIFwiXCIse1widmVyc2lvblwiOjMsXCJzb3VyY2VzXCI6W1wid2VicGFjazovLy4vc3JjL3N0eWxlLmNzc1wiXSxcIm5hbWVzXCI6W10sXCJtYXBwaW5nc1wiOlwiQUFBQSxrREFBa0Q7O0FBRWxEO0VBQ0UscUVBQXFFO0VBQ3JFLHVFQUF1RTtFQUN2RSxxRUFBcUU7RUFDckUsa0JBQWtCO0VBQ2xCLGtCQUFrQjtFQUNsQix1QkFBdUI7RUFDdkIseUJBQXlCO0VBQ3pCLHVCQUF1QjtFQUN2QiwwQ0FBMEM7RUFDMUMsMENBQTBDO0VBQzFDLDJDQUEyQztFQUMzQyw0Q0FBNEM7RUFDNUMsZ0JBQWdCO0VBQ2hCLGlCQUFpQjtFQUNqQixpQkFBaUI7QUFDbkI7O0FBRUE7RUFDRSxzQkFBc0I7QUFDeEI7O0FBRUE7RUFDRSw4SkFBOEo7RUFDOUosbUNBQW1DO0VBQ25DLGtDQUFrQztFQUNsQyw2REFBNkQ7RUFDN0QsaUJBQWlCO0FBQ25COztBQUVBLDBCQUEwQjtBQUMxQjtFQUNFLG1DQUFtQztFQUNuQyxrQkFBa0I7RUFDbEIsZ0JBQWdCO0FBQ2xC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RSxtQkFBbUI7RUFDbkIsY0FBYztFQUNkLHFCQUFxQjtBQUN2Qjs7QUFFQTtFQUNFLHFCQUFxQjtBQUN2Qjs7QUFFQSxvQkFBb0I7QUFDcEIsUUFBUSxrQkFBa0IsRUFBRTtBQUM1QixRQUFRLGdCQUFnQixFQUFFO0FBQzFCLFFBQVEsa0JBQWtCLEVBQUU7QUFDNUIsUUFBUSxnQkFBZ0IsRUFBRTs7QUFFMUIsUUFBUSxxQkFBcUIsRUFBRTtBQUMvQixRQUFRLG1CQUFtQixFQUFFO0FBQzdCLFFBQVEscUJBQXFCLEVBQUU7QUFDL0IsUUFBUSxtQkFBbUIsRUFBRTs7QUFFN0IsZUFBZSxrQkFBa0IsRUFBRTtBQUNuQyxjQUFjLDRCQUE0QixFQUFFXCIsXCJzb3VyY2VzQ29udGVudFwiOltcIi8qIE1vZGVybiBTUUwgdG8gTGFyYXZlbCBCdWlsZGVyIC0gQ3VzdG9tIFN0eWxlcyAqL1xcblxcbjpyb290IHtcXG4gIC0tcHJpbWFyeS1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzY2N2VlYSAwJSwgIzc2NGJhMiAxMDAlKTtcXG4gIC0tc2Vjb25kYXJ5LWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZjA5M2ZiIDAlLCAjZjU1NzZjIDEwMCUpO1xcbiAgLS1zdWNjZXNzLWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNGZhY2ZlIDAlLCAjMDBmMmZlIDEwMCUpO1xcbiAgLS1kYXJrLWJnOiAjMWExYTJlO1xcbiAgLS1jYXJkLWJnOiAjZmZmZmZmO1xcbiAgLS10ZXh0LXByaW1hcnk6ICMyZDM3NDg7XFxuICAtLXRleHQtc2Vjb25kYXJ5OiAjNzE4MDk2O1xcbiAgLS1ib3JkZXItY29sb3I6ICNlMmU4ZjA7XFxuICAtLXNoYWRvdy1zbTogMCAycHggNHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XFxuICAtLXNoYWRvdy1tZDogMCA0cHggNnB4IHJnYmEoMCwgMCwgMCwgMC4wNyk7XFxuICAtLXNoYWRvdy1sZzogMCAxMHB4IDI1cHggcmdiYSgwLCAwLCAwLCAwLjEpO1xcbiAgLS1zaGFkb3cteGw6IDAgMjBweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC4xNSk7XFxuICAtLXJhZGl1cy1zbTogOHB4O1xcbiAgLS1yYWRpdXMtbWQ6IDEycHg7XFxuICAtLXJhZGl1cy1sZzogMTZweDtcXG59XFxuXFxuKiB7XFxuICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xcbn1cXG5cXG5ib2R5IHtcXG4gIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICdTZWdvZSBVSScsICdSb2JvdG8nLCAnT3h5Z2VuJywgJ1VidW50dScsICdDYW50YXJlbGwnLCAnRmlyYSBTYW5zJywgJ0Ryb2lkIFNhbnMnLCAnSGVsdmV0aWNhIE5ldWUnLCBzYW5zLXNlcmlmO1xcbiAgLXdlYmtpdC1mb250LXNtb290aGluZzogYW50aWFsaWFzZWQ7XFxuICAtbW96LW9zeC1mb250LXNtb290aGluZzogZ3JheXNjYWxlO1xcbiAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2Y1ZjdmYSAwJSwgI2MzY2ZlMiAxMDAlKTtcXG4gIG1pbi1oZWlnaHQ6IDEwMHZoO1xcbn1cXG5cXG4vKiBIZXJvIFNlY3Rpb24gUmVkZXNpZ24gKi9cXG4uaGVyby5pcy1wcmltYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcXG59XFxuXFxuLmhlcm8uaXMtcHJpbWFyeTo6YmVmb3JlIHtcXG4gIGNvbnRlbnQ6ICcnO1xcbiAgcG9zaXRpb246IGFic29sdXRlO1xcbiAgdG9wOiAwO1xcbiAgbGVmdDogMDtcXG4gIHJpZ2h0OiAwO1xcbiAgYm90dG9tOiAwO1xcbiAgYmFja2dyb3VuZDogdXJsKFxcXCJkYXRhOmltYWdlL3N2Zyt4bWwsJTNDc3ZnIHdpZHRoPSc2MCcgaGVpZ2h0PSc2MCcgdmlld0JveD0nMCAwIDYwIDYwJyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnJTNFJTNDZyBmaWxsPSdub25lJyBmaWxsLXJ1bGU9J2V2ZW5vZGQnJTNFJTNDZyBmaWxsPSclMjNmZmZmZmYnIGZpbGwtb3BhY2l0eT0nMC4wNSclM0UlM0NwYXRoIGQ9J00zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMlY2aDRWNGgtNHpNNiAzNHYtNEg0djRIMHYyaDR2NGgydi00aDR2LTJINnpNNiA0VjBINHY0SDB2Mmg0djRoMlY2aDRWNEg2eicvJTNFJTNDL2clM0UlM0MvZyUzRSUzQy9zdmclM0VcXFwiKTtcXG4gIG9wYWNpdHk6IDAuMztcXG59XFxuXFxuLmhlcm8tYm9keSB7XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICB6LWluZGV4OiAxO1xcbiAgcGFkZGluZzogM3JlbSAxLjVyZW07XFxufVxcblxcbi5oZXJvIC50aXRsZSB7XFxuICBmb250LXNpemU6IDIuNXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA4MDA7XFxuICB0ZXh0LXNoYWRvdzogMCAycHggMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7XFxuICBsZXR0ZXItc3BhY2luZzogLTAuNXB4O1xcbn1cXG5cXG4uaGVybyAuc3VidGl0bGUge1xcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xcbiAgb3BhY2l0eTogMC45NTtcXG4gIG1hcmdpbi10b3A6IDFyZW07XFxufVxcblxcbi8qIE5hdmlnYXRpb24vSGVhZGVyICovXFxuLm5hdi1oZWFkZXIge1xcbiAgcGFkZGluZzogMXJlbSAycmVtO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1zbSk7XFxufVxcblxcbi5naXRodWItbGluayB7XFxuICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBnYXA6IDAuNXJlbTtcXG4gIHBhZGRpbmc6IDAuNzVyZW0gMS41cmVtO1xcbiAgYmFja2dyb3VuZDogdmFyKC0tZGFyay1iZyk7XFxuICBjb2xvcjogd2hpdGU7XFxuICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgZm9udC13ZWlnaHQ6IDYwMDtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xcbn1cXG5cXG4uZ2l0aHViLWxpbms6aG92ZXIge1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LWxnKTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG59XFxuXFxuLmdpdGh1Yi1saW5rOjpiZWZvcmUge1xcbiAgY29udGVudDogJ+KYhSc7XFxuICBmb250LXNpemU6IDEuMjVyZW07XFxufVxcblxcbi8qIE1haW4gQ29udGVudCBBcmVhICovXFxuLmNvbnRlbnQtd3JhcHBlciB7XFxuICBtYXgtd2lkdGg6IDEyMDBweDtcXG4gIG1hcmdpbjogMCBhdXRvO1xcbiAgcGFkZGluZzogMnJlbSAxcmVtO1xcbn1cXG5cXG4uY29udmVydGVyLWNhcmQge1xcbiAgYmFja2dyb3VuZDogdmFyKC0tY2FyZC1iZyk7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbGcpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXhsKTtcXG4gIHBhZGRpbmc6IDIuNXJlbTtcXG4gIG1hcmdpbi1ib3R0b206IDJyZW07XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xcbn1cXG5cXG4uY29udmVydGVyLWNhcmQ6aG92ZXIge1xcbiAgYm94LXNoYWRvdzogMCAyNXB4IDUwcHggcmdiYSgwLCAwLCAwLCAwLjIpO1xcbn1cXG5cXG4vKiBTZWN0aW9uIEhlYWRlcnMgKi9cXG4uc2VjdGlvbi1oZWFkZXIge1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBnYXA6IDAuNzVyZW07XFxuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xcbiAgZm9udC13ZWlnaHQ6IDcwMDtcXG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xcbn1cXG5cXG4uc2VjdGlvbi1pY29uIHtcXG4gIHdpZHRoOiA0MHB4O1xcbiAgaGVpZ2h0OiA0MHB4O1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XFxuICBmb250LXNpemU6IDEuMjVyZW07XFxuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XFxufVxcblxcbi8qIFRleHRhcmVhIFJlZGVzaWduICovXFxuLnRleHRhcmVhLXdyYXBwZXIge1xcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xcbiAgbWFyZ2luLWJvdHRvbTogMS41cmVtO1xcbn1cXG5cXG4udGV4dGFyZWEge1xcbiAgYm9yZGVyOiAycHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcXG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XFxuICBwYWRkaW5nOiAxLjI1cmVtO1xcbiAgZm9udC1zaXplOiAxcmVtO1xcbiAgZm9udC1mYW1pbHk6ICdNb25hY28nLCAnTWVubG8nLCAnVWJ1bnR1IE1vbm8nLCAnQ29uc29sYXMnLCAnc291cmNlLWNvZGUtcHJvJywgbW9ub3NwYWNlO1xcbiAgbGluZS1oZWlnaHQ6IDEuNjtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XFxuICByZXNpemU6IHZlcnRpY2FsO1xcbiAgbWluLWhlaWdodDogMjAwcHg7XFxuICBiYWNrZ3JvdW5kOiAjZjhmYWZjO1xcbn1cXG5cXG4udGV4dGFyZWE6Zm9jdXMge1xcbiAgb3V0bGluZTogbm9uZTtcXG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcXG4gIGJveC1zaGFkb3c6IDAgMCAwIDNweCByZ2JhKDEwMiwgMTI2LCAyMzQsIDAuMSk7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG59XFxuXFxuLnRleHRhcmVhOjpwbGFjZWhvbGRlciB7XFxuICBjb2xvcjogI2EwYWVjMDtcXG4gIGZvbnQtc3R5bGU6IGl0YWxpYztcXG59XFxuXFxuLyogQ29weSBCdXR0b24gKi9cXG4uY29weS1idXR0b24ge1xcbiAgcG9zaXRpb246IGFic29sdXRlO1xcbiAgdG9wOiAwLjc1cmVtO1xcbiAgcmlnaHQ6IDAuNzVyZW07XFxuICBwYWRkaW5nOiAwLjVyZW0gMXJlbTtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcXG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1zbSk7XFxuICBjdXJzb3I6IHBvaW50ZXI7XFxuICBmb250LXNpemU6IDAuODc1cmVtO1xcbiAgZm9udC13ZWlnaHQ6IDYwMDtcXG4gIGNvbG9yOiB2YXIoLS10ZXh0LXNlY29uZGFyeSk7XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4ycyBlYXNlO1xcbiAgei1pbmRleDogMTA7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGdhcDogMC41cmVtO1xcbn1cXG5cXG4uY29weS1idXR0b246aG92ZXIge1xcbiAgYmFja2dyb3VuZDogIzY2N2VlYTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMXB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XFxufVxcblxcbi5jb3B5LWJ1dHRvbi5jb3BpZWQge1xcbiAgYmFja2dyb3VuZDogIzQ4YmI3ODtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIGJvcmRlci1jb2xvcjogIzQ4YmI3ODtcXG59XFxuXFxuLyogQnV0dG9uIENvbnRyb2xzICovXFxuLmJ1dHRvbi1jb250cm9scyB7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgZ2FwOiAxcmVtO1xcbiAgZmxleC13cmFwOiB3cmFwO1xcbn1cXG5cXG4uYnV0dG9uIHtcXG4gIHBhZGRpbmc6IDAuODc1cmVtIDJyZW07XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgZm9udC13ZWlnaHQ6IDcwMDtcXG4gIGZvbnQtc2l6ZTogMXJlbTtcXG4gIGJvcmRlcjogbm9uZTtcXG4gIGN1cnNvcjogcG9pbnRlcjtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XFxuICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBnYXA6IDAuNXJlbTtcXG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcXG4gIG92ZXJmbG93OiBoaWRkZW47XFxufVxcblxcbi5idXR0b246OmJlZm9yZSB7XFxuICBjb250ZW50OiAnJztcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogNTAlO1xcbiAgbGVmdDogNTAlO1xcbiAgd2lkdGg6IDA7XFxuICBoZWlnaHQ6IDA7XFxuICBib3JkZXItcmFkaXVzOiA1MCU7XFxuICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLCAtNTAlKTtcXG4gIHRyYW5zaXRpb246IHdpZHRoIDAuNnMsIGhlaWdodCAwLjZzO1xcbn1cXG5cXG4uYnV0dG9uOmhvdmVyOjpiZWZvcmUge1xcbiAgd2lkdGg6IDMwMHB4O1xcbiAgaGVpZ2h0OiAzMDBweDtcXG59XFxuXFxuLmJ1dHRvbi5pcy1wcmltYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG59XFxuXFxuLmJ1dHRvbi5pcy1wcmltYXJ5OmhvdmVyIHtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxufVxcblxcbi5idXR0b24uaXMtc2Vjb25kYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbiAgY29sb3I6ICM2NjdlZWE7XFxuICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xcbn1cXG5cXG4uYnV0dG9uLmlzLXNlY29uZGFyeTpob3ZlciB7XFxuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LWxnKTtcXG59XFxuXFxuLyogTG9hZGluZyBBbmltYXRpb24gKi9cXG4uYnV0dG9uLmlzLWxvYWRpbmcge1xcbiAgcG9pbnRlci1ldmVudHM6IG5vbmU7XFxuICBvcGFjaXR5OiAwLjc7XFxufVxcblxcbi5idXR0b24uaXMtbG9hZGluZzo6YWZ0ZXIge1xcbiAgY29udGVudDogJyc7XFxuICBwb3NpdGlvbjogYWJzb2x1dGU7XFxuICB3aWR0aDogMTZweDtcXG4gIGhlaWdodDogMTZweDtcXG4gIHRvcDogNTAlO1xcbiAgbGVmdDogNTAlO1xcbiAgbWFyZ2luLWxlZnQ6IC04cHg7XFxuICBtYXJnaW4tdG9wOiAtOHB4O1xcbiAgYm9yZGVyOiAycHggc29saWQgdHJhbnNwYXJlbnQ7XFxuICBib3JkZXItdG9wLWNvbG9yOiB3aGl0ZTtcXG4gIGJvcmRlci1yYWRpdXM6IDUwJTtcXG4gIGFuaW1hdGlvbjogYnV0dG9uLWxvYWRpbmctc3Bpbm5lciAwLjZzIGxpbmVhciBpbmZpbml0ZTtcXG59XFxuXFxuQGtleWZyYW1lcyBidXR0b24tbG9hZGluZy1zcGlubmVyIHtcXG4gIGZyb20ge1xcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgwdHVybik7XFxuICB9XFxuICB0byB7XFxuICAgIHRyYW5zZm9ybTogcm90YXRlKDF0dXJuKTtcXG4gIH1cXG59XFxuXFxuLyogRmVhdHVyZXMgU2VjdGlvbiAqL1xcbi5mZWF0dXJlcy1ncmlkIHtcXG4gIGRpc3BsYXk6IGdyaWQ7XFxuICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IHJlcGVhdChhdXRvLWZpdCwgbWlubWF4KDI1MHB4LCAxZnIpKTtcXG4gIGdhcDogMS41cmVtO1xcbiAgbWFyZ2luLXRvcDogMnJlbTtcXG4gIG1hcmdpbi1ib3R0b206IDJyZW07XFxufVxcblxcbi5mZWF0dXJlLWNhcmQge1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxuICBwYWRkaW5nOiAxLjVyZW07XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XFxuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xcbn1cXG5cXG4uZmVhdHVyZS1jYXJkOmhvdmVyIHtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtNHB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxufVxcblxcbi5mZWF0dXJlLWljb24ge1xcbiAgd2lkdGg6IDUwcHg7XFxuICBoZWlnaHQ6IDUwcHg7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XFxuICBjb2xvcjogd2hpdGU7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcbiAgZm9udC1zaXplOiAxLjVyZW07XFxuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xcbn1cXG5cXG4uZmVhdHVyZS10aXRsZSB7XFxuICBmb250LXNpemU6IDEuMTI1cmVtO1xcbiAgZm9udC13ZWlnaHQ6IDcwMDtcXG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xcbiAgbWFyZ2luLWJvdHRvbTogMC41cmVtO1xcbn1cXG5cXG4uZmVhdHVyZS1kZXNjcmlwdGlvbiB7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgZm9udC1zaXplOiAwLjlyZW07XFxuICBsaW5lLWhlaWdodDogMS42O1xcbn1cXG5cXG4vKiBGb290ZXIgKi9cXG4ubW9kZXJuLWZvb3RlciB7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIHBhZGRpbmc6IDJyZW07XFxuICB0ZXh0LWFsaWduOiBjZW50ZXI7XFxuICBtYXJnaW4tdG9wOiA0cmVtO1xcbiAgYm94LXNoYWRvdzogMCAtMnB4IDEwcHggcmdiYSgwLCAwLCAwLCAwLjA1KTtcXG59XFxuXFxuLm1vZGVybi1mb290ZXIgcCB7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgbWFyZ2luOiAwO1xcbn1cXG5cXG4ubW9kZXJuLWZvb3RlciBhIHtcXG4gIGNvbG9yOiAjNjY3ZWVhO1xcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xcbiAgZm9udC13ZWlnaHQ6IDYwMDtcXG59XFxuXFxuLm1vZGVybi1mb290ZXIgYTpob3ZlciB7XFxuICB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTtcXG59XFxuXFxuLyogQW5pbWF0aW9ucyAqL1xcbkBrZXlmcmFtZXMgZmFkZUluVXAge1xcbiAgZnJvbSB7XFxuICAgIG9wYWNpdHk6IDA7XFxuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgyMHB4KTtcXG4gIH1cXG4gIHRvIHtcXG4gICAgb3BhY2l0eTogMTtcXG4gICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApO1xcbiAgfVxcbn1cXG5cXG4uZmFkZS1pbi11cCB7XFxuICBhbmltYXRpb246IGZhZGVJblVwIDAuNnMgZWFzZS1vdXQ7XFxufVxcblxcbi8qIFN1Y2Nlc3MvRXJyb3IgTWVzc2FnZXMgKi9cXG4ubWVzc2FnZS1ib3gge1xcbiAgcGFkZGluZzogMXJlbSAxLjVyZW07XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjc1cmVtO1xcbiAgYW5pbWF0aW9uOiBmYWRlSW5VcCAwLjNzIGVhc2Utb3V0O1xcbn1cXG5cXG4ubWVzc2FnZS1ib3guc3VjY2VzcyB7XFxuICBiYWNrZ3JvdW5kOiAjZDRlZGRhO1xcbiAgY29sb3I6ICMxNTU3MjQ7XFxuICBib3JkZXItbGVmdDogNHB4IHNvbGlkICMyOGE3NDU7XFxufVxcblxcbi5tZXNzYWdlLWJveC5lcnJvciB7XFxuICBiYWNrZ3JvdW5kOiAjZjhkN2RhO1xcbiAgY29sb3I6ICM3MjFjMjQ7XFxuICBib3JkZXItbGVmdDogNHB4IHNvbGlkICNkYzM1NDU7XFxufVxcblxcbi8qIFJlc3BvbnNpdmUgRGVzaWduICovXFxuQG1lZGlhIChtYXgtd2lkdGg6IDc2OHB4KSB7XFxuICAuaGVybyAudGl0bGUge1xcbiAgICBmb250LXNpemU6IDEuNzVyZW07XFxuICB9XFxuXFxuICAuaGVybyAuc3VidGl0bGUge1xcbiAgICBmb250LXNpemU6IDFyZW07XFxuICB9XFxuXFxuICAuY29udmVydGVyLWNhcmQge1xcbiAgICBwYWRkaW5nOiAxLjVyZW07XFxuICB9XFxuXFxuICAuYnV0dG9uLWNvbnRyb2xzIHtcXG4gICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcXG4gIH1cXG5cXG4gIC5idXR0b24ge1xcbiAgICB3aWR0aDogMTAwJTtcXG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XFxuICB9XFxuXFxuICAubmF2LWhlYWRlciB7XFxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XFxuICAgIGdhcDogMXJlbTtcXG4gIH1cXG5cXG4gIC5mZWF0dXJlcy1ncmlkIHtcXG4gICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxZnI7XFxuICB9XFxufVxcblxcbi8qIENvZGUgSGlnaGxpZ2h0aW5nIGluIE91dHB1dCAqL1xcbi50ZXh0YXJlYS5jb2RlLW91dHB1dCB7XFxuICBiYWNrZ3JvdW5kOiAjMmQzNzQ4O1xcbiAgY29sb3I6ICNlMmU4ZjA7XFxuICBib3JkZXItY29sb3I6ICM0YTU1Njg7XFxufVxcblxcbi50ZXh0YXJlYS5jb2RlLW91dHB1dDpmb2N1cyB7XFxuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XFxufVxcblxcbi8qIFV0aWxpdHkgQ2xhc3NlcyAqL1xcbi5tdC0xIHsgbWFyZ2luLXRvcDogMC41cmVtOyB9XFxuLm10LTIgeyBtYXJnaW4tdG9wOiAxcmVtOyB9XFxuLm10LTMgeyBtYXJnaW4tdG9wOiAxLjVyZW07IH1cXG4ubXQtNCB7IG1hcmdpbi10b3A6IDJyZW07IH1cXG5cXG4ubWItMSB7IG1hcmdpbi1ib3R0b206IDAuNXJlbTsgfVxcbi5tYi0yIHsgbWFyZ2luLWJvdHRvbTogMXJlbTsgfVxcbi5tYi0zIHsgbWFyZ2luLWJvdHRvbTogMS41cmVtOyB9XFxuLm1iLTQgeyBtYXJnaW4tYm90dG9tOiAycmVtOyB9XFxuXFxuLnRleHQtY2VudGVyIHsgdGV4dC1hbGlnbjogY2VudGVyOyB9XFxuLnRleHQtbXV0ZWQgeyBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpOyB9XFxuXCJdLFwic291cmNlUm9vdFwiOlwiXCJ9XSk7XG4vLyBFeHBvcnRzXG5leHBvcnQgZGVmYXVsdCBfX19DU1NfTE9BREVSX0VYUE9SVF9fXztcbiIsImltcG9ydCAqIGFzIHdhc20gZnJvbSBcInNxbHBhcnNlci1ycy13YXNtXCI7XG5pbXBvcnQge0NvbnZlcnRlcn0gZnJvbSBcIi4vY29udmVydGVyXCI7XG5pbXBvcnQgJy4vc3R5bGUuY3NzJztcblxuLy8gU2hvdyBub3RpZmljYXRpb24gbWVzc2FnZVxuZnVuY3Rpb24gc2hvd05vdGlmaWNhdGlvbihtZXNzYWdlLCB0eXBlID0gJ3N1Y2Nlc3MnKSB7XG4gICAgLy8gUmVtb3ZlIGFueSBleGlzdGluZyBub3RpZmljYXRpb25zXG4gICAgY29uc3QgZXhpc3RpbmdOb3RpZiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tZXNzYWdlLWJveCcpO1xuICAgIGlmIChleGlzdGluZ05vdGlmKSB7XG4gICAgICAgIGV4aXN0aW5nTm90aWYucmVtb3ZlKCk7XG4gICAgfVxuXG4gICAgY29uc3Qgbm90aWZpY2F0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbm90aWZpY2F0aW9uLmNsYXNzTmFtZSA9IGBtZXNzYWdlLWJveCAke3R5cGV9YDtcbiAgICBub3RpZmljYXRpb24uaW5uZXJIVE1MID0gYDxzcGFuPiR7dHlwZSA9PT0gJ3N1Y2Nlc3MnID8gJ+KchScgOiAn4p2MJ308L3NwYW4+PHNwYW4+JHttZXNzYWdlfTwvc3Bhbj5gO1xuXG4gICAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb250ZW50LXdyYXBwZXInKTtcbiAgICB3cmFwcGVyLmluc2VydEJlZm9yZShub3RpZmljYXRpb24sIHdyYXBwZXIuZmlyc3RDaGlsZCk7XG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgbm90aWZpY2F0aW9uLnN0eWxlLmFuaW1hdGlvbiA9ICdmYWRlSW5VcCAwLjNzIGVhc2Utb3V0IHJldmVyc2UnO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IG5vdGlmaWNhdGlvbi5yZW1vdmUoKSwgMzAwKTtcbiAgICB9LCAzMDAwKTtcbn1cblxubGV0IGNvbnZlcnRlciA9IGZ1bmN0aW9uICgpIHtcbiAgICBsZXQgaW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImlucHV0XCIpLnZhbHVlO1xuICAgIGxldCBjb252ZXJ0QnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb252ZXJ0LWJ1dHRvblwiKTtcblxuICAgIGlmIChpbnB1dC50cmltKCkgPT09ICcnKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1BsZWFzZSBlbnRlciBhIFNRTCBxdWVyeScsICdlcnJvcicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGlucHV0LnNsaWNlKC0xKSA9PT0gJzsnKSB7XG4gICAgICAgIGlucHV0ID0gaW5wdXQuc2xpY2UoMCwgLTEpO1xuICAgIH1cblxuICAgIGxldCBvdXRwdXRfdGV4dF9hcmVhID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJvdXRwdXRcIik7XG5cbiAgICBpZiAoIWlucHV0LnN0YXJ0c1dpdGgoJ3NlbGVjdCcpICYmICFpbnB1dC5zdGFydHNXaXRoKCdTRUxFQ1QnKSkge1xuICAgICAgICBvdXRwdXRfdGV4dF9hcmVhLnZhbHVlID0gJ1NRTCBtdXN0IHN0YXJ0IHdpdGggc2VsZWN0IG9yIFNFTEVDVCc7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1NRTCBxdWVyeSBtdXN0IHN0YXJ0IHdpdGggU0VMRUNUJywgJ2Vycm9yJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBBZGQgbG9hZGluZyBzdGF0ZVxuICAgIGNvbnZlcnRCdXR0b24uY2xhc3NMaXN0LmFkZCgnaXMtbG9hZGluZycpO1xuICAgIGNvbnZlcnRCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xuXG4gICAgLy8gVXNlIHNldFRpbWVvdXQgdG8gYWxsb3cgVUkgdG8gdXBkYXRlXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgYXN0ID0gd2FzbS5wYXJzZV9zcWwoXCItLW15c3FsXCIsIGlucHV0KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGFzdCk7XG4gICAgICAgICAgICBpZiAoYXN0LnN0YXJ0c1dpdGgoJ0Vycm9yJykpIHtcbiAgICAgICAgICAgICAgICBvdXRwdXRfdGV4dF9hcmVhLnZhbHVlID0gYXN0O1xuICAgICAgICAgICAgICAgIHNob3dOb3RpZmljYXRpb24oJ0Vycm9yIHBhcnNpbmcgU1FMIHF1ZXJ5JywgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSAobmV3IENvbnZlcnRlcihKU09OLnBhcnNlKGFzdClbMF0uUXVlcnkpKS5ydW4oKTtcbiAgICAgICAgICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdTdWNjZXNzZnVsbHkgY29udmVydGVkIHRvIExhcmF2ZWwgUXVlcnkgQnVpbGRlciEnLCAnc3VjY2VzcycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbnB1dCk7XG4gICAgICAgICAgICBvdXRwdXRfdGV4dF9hcmVhLnZhbHVlID0gZSArICcsIEkgd2lsbCBmaXggdGhpcyBpc3N1ZSBhcyBzb29uIGFzIHBvc3NpYmxlJztcbiAgICAgICAgICAgIHNob3dOb3RpZmljYXRpb24oJ0NvbnZlcnNpb24gZXJyb3Igb2NjdXJyZWQnLCAnZXJyb3InKTtcbiAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjb252ZXJ0QnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoJ2lzLWxvYWRpbmcnKTtcbiAgICAgICAgICAgIGNvbnZlcnRCdXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH0sIDEwMCk7XG59XG5cbi8vIENvcHkgdG8gY2xpcGJvYXJkIGZ1bmN0aW9uYWxpdHlcbmZ1bmN0aW9uIGNvcHlUb0NsaXBib2FyZCgpIHtcbiAgICBjb25zdCBvdXRwdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm91dHB1dFwiKS52YWx1ZTtcbiAgICBjb25zdCBjb3B5QnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb3B5LWJ1dHRvblwiKTtcbiAgICBjb25zdCBjb3B5VGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29weS10ZXh0XCIpO1xuICAgIGNvbnN0IGNvcHlJY29uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb3B5LWljb25cIik7XG5cbiAgICBpZiAoIW91dHB1dCB8fCBvdXRwdXQudHJpbSgpID09PSAnJyB8fCBvdXRwdXQuaW5jbHVkZXMoJ1lvdXIgTGFyYXZlbCBxdWVyeSBidWlsZGVyIGNvZGUgd2lsbCBhcHBlYXIgaGVyZScpKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ05vIG91dHB1dCB0byBjb3B5JywgJ2Vycm9yJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChvdXRwdXQpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIGNvcHlCdXR0b24uY2xhc3NMaXN0LmFkZCgnY29waWVkJyk7XG4gICAgICAgIGNvcHlUZXh0LnRleHRDb250ZW50ID0gJ0NvcGllZCEnO1xuICAgICAgICBjb3B5SWNvbi50ZXh0Q29udGVudCA9ICfinJMnO1xuXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgY29weUJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKCdjb3BpZWQnKTtcbiAgICAgICAgICAgIGNvcHlUZXh0LnRleHRDb250ZW50ID0gJ0NvcHknO1xuICAgICAgICAgICAgY29weUljb24udGV4dENvbnRlbnQgPSAn8J+Tiyc7XG4gICAgICAgIH0sIDIwMDApO1xuICAgIH0sIGZ1bmN0aW9uKCkge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdGYWlsZWQgdG8gY29weSB0byBjbGlwYm9hcmQnLCAnZXJyb3InKTtcbiAgICB9KTtcbn1cblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCAoZXZlbnQpID0+IHtcbiAgICBsZXQgdXJsX3NlYXJjaF9wYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuXG4gICAgaWYodXJsX3NlYXJjaF9wYXJhbXMuaGFzKCdiYXNlNjRzcWwnKSkge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS52YWx1ZSA9IGF0b2IodXJsX3NlYXJjaF9wYXJhbXMuZ2V0KCdiYXNlNjRzcWwnKSk7XG4gICAgICAgIGNvbnZlcnRlcigpO1xuICAgIH1cbn0pO1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29udmVydC1idXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNvbnZlcnRlcik7XG5cbi8vIEFkZCBFbnRlciBrZXkgc3VwcG9ydCAoQ3RybC9DbWQgKyBFbnRlciB0byBjb252ZXJ0KVxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0JykuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGZ1bmN0aW9uKGUpIHtcbiAgICBpZiAoKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpICYmIGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgIGNvbnZlcnRlcigpO1xuICAgIH1cbn0pO1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hhcmUtYnV0dG9uJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS52YWx1ZTtcblxuICAgIGlmICghaW5wdXQgfHwgaW5wdXQudHJpbSgpID09PSAnJykge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdQbGVhc2UgZW50ZXIgYSBTUUwgcXVlcnkgZmlyc3QnLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBzaGFyZV9saW5rID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSArICc/YmFzZTY0c3FsPScgKyBidG9hKGlucHV0KTtcbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChzaGFyZV9saW5rKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdTaGFyZSBsaW5rIGNvcGllZCB0byBjbGlwYm9hcmQhJywgJ3N1Y2Nlc3MnKTtcbiAgICB9LCBmdW5jdGlvbigpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignRmFpbGVkIHRvIGNvcHkgc2hhcmUgbGluaycsICdlcnJvcicpO1xuICAgIH0pO1xufSk7XG5cbi8vIEFkZCBjb3B5IGJ1dHRvbiBldmVudCBsaXN0ZW5lclxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvcHktYnV0dG9uJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjb3B5VG9DbGlwYm9hcmQpO1xuIiwiXG4gICAgICBpbXBvcnQgQVBJIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvaW5qZWN0U3R5bGVzSW50b1N0eWxlVGFnLmpzXCI7XG4gICAgICBpbXBvcnQgZG9tQVBJIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvc3R5bGVEb21BUEkuanNcIjtcbiAgICAgIGltcG9ydCBpbnNlcnRGbiBmcm9tIFwiIS4uL25vZGVfbW9kdWxlcy9zdHlsZS1sb2FkZXIvZGlzdC9ydW50aW1lL2luc2VydEJ5U2VsZWN0b3IuanNcIjtcbiAgICAgIGltcG9ydCBzZXRBdHRyaWJ1dGVzIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvc2V0QXR0cmlidXRlc1dpdGhvdXRBdHRyaWJ1dGVzLmpzXCI7XG4gICAgICBpbXBvcnQgaW5zZXJ0U3R5bGVFbGVtZW50IGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvaW5zZXJ0U3R5bGVFbGVtZW50LmpzXCI7XG4gICAgICBpbXBvcnQgc3R5bGVUYWdUcmFuc2Zvcm1GbiBmcm9tIFwiIS4uL25vZGVfbW9kdWxlcy9zdHlsZS1sb2FkZXIvZGlzdC9ydW50aW1lL3N0eWxlVGFnVHJhbnNmb3JtLmpzXCI7XG4gICAgICBpbXBvcnQgY29udGVudCwgKiBhcyBuYW1lZEV4cG9ydCBmcm9tIFwiISEuLi9ub2RlX21vZHVsZXMvY3NzLWxvYWRlci9kaXN0L2Nqcy5qcyEuL3N0eWxlLmNzc1wiO1xuICAgICAgXG4gICAgICBcblxudmFyIG9wdGlvbnMgPSB7fTtcblxub3B0aW9ucy5zdHlsZVRhZ1RyYW5zZm9ybSA9IHN0eWxlVGFnVHJhbnNmb3JtRm47XG5vcHRpb25zLnNldEF0dHJpYnV0ZXMgPSBzZXRBdHRyaWJ1dGVzO1xub3B0aW9ucy5pbnNlcnQgPSBpbnNlcnRGbi5iaW5kKG51bGwsIFwiaGVhZFwiKTtcbm9wdGlvbnMuZG9tQVBJID0gZG9tQVBJO1xub3B0aW9ucy5pbnNlcnRTdHlsZUVsZW1lbnQgPSBpbnNlcnRTdHlsZUVsZW1lbnQ7XG5cbnZhciB1cGRhdGUgPSBBUEkoY29udGVudCwgb3B0aW9ucyk7XG5cblxuXG5leHBvcnQgKiBmcm9tIFwiISEuLi9ub2RlX21vZHVsZXMvY3NzLWxvYWRlci9kaXN0L2Nqcy5qcyEuL3N0eWxlLmNzc1wiO1xuICAgICAgIGV4cG9ydCBkZWZhdWx0IGNvbnRlbnQgJiYgY29udGVudC5sb2NhbHMgPyBjb250ZW50LmxvY2FscyA6IHVuZGVmaW5lZDtcbiJdLCJuYW1lcyI6WyJDb252ZXJ0ZXIiLCJjb25zdHJ1Y3RvciIsImFzdCIsInBhcmVudCIsInRhYmxlX25hbWVfYnlfYWxpYXMiLCJydW4iLCJuZWVkX2FwcGVuZF9nZXRfc3VmZml4Iiwic2VjdGlvbnMiLCJmcm9tX2l0ZW0iLCJib2R5IiwiU2VsZWN0IiwiZnJvbSIsInByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsIiwicmVsYXRpb24iLCJwdXNoIiwicmVzb2x2ZU1haW5UYWJsZVNlY3Rpb24iLCJyZXNvbHZlRnJvbVN1YlNlY3Rpb24iLCJqb2luX3NlY3Rpb24iLCJoYXNKb2luU2VjdGlvbiIsInJlc29sdmVKb2luU2VjdGlvbiIsInNsaWNlIiwibGVuZ3RoIiwiY29uY2F0IiwicmVzb2x2ZUNyb3NzSm9pblNlY3Rpb24iLCJyZXNvbHZlU2VsZWN0U2VjdGlvbiIsInJlc29sdmVXaGVyZVNlY3Rpb24iLCJzZWxlY3Rpb24iLCJncm91cF9ieSIsInJlc29sdmVHcm91cEJ5U2VjdGlvbiIsInJlc29sdmVIYXZpbmdTZWN0aW9uIiwib3JkZXJfYnkiLCJyZXNvbHZlT3JkZXJCeVNlY3Rpb24iLCJsaW1pdCIsIlZhbHVlIiwiTnVtYmVyIiwib2Zmc2V0IiwidmFsdWUiLCJqb2luIiwicmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUiLCJyZWxhdGlvbl9ub2RlIiwidGFibGVfbmFtZSIsIlRhYmxlIiwibmFtZSIsImFsaWFzIiwicXVvdGUiLCJwcmVmaXgiLCJhZGRUYWJUb0V2ZXJ5TGluZSIsIkRlcml2ZWQiLCJzdWJxdWVyeSIsInJlcGxhY2UiLCJzZWxlY3Rpb25fbm9kZSIsImNvbmRpdGlvbl90eXBlIiwiZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdCIsImNvbmRpdGlvbiIsImdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdCIsInByZXBhcmVDb25kaXRpb25zIiwib3AiLCJtZXRob2RfbmFtZSIsImNvbmRpdGlvbnMiLCJhZGRQcmVmaXgyTWV0aG9kcyIsImNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbiIsImNvbHVtbiIsImV4cHIiLCJsaXN0IiwibWFwIiwiaSIsInJlc29sdmVWYWx1ZSIsIm5lZ2F0ZWQiLCJsZWZ0X2NvbmRpdGlvbl90eXBlIiwibGVmdCIsImxlZnRfY29uZGl0aW9uIiwicmlnaHRfY29uZGl0aW9uX3R5cGUiLCJyaWdodCIsInJpZ2h0X2NvbmRpdGlvbiIsImluY2x1ZGVzIiwiU3VicXVlcnkiLCJwYXJzZUZ1bmN0aW9uTm9kZSIsIkZ1bmN0aW9uIiwidHJhbnNmb3JtQmluYXJ5T3AiLCJsb3ciLCJoaWdoIiwib3BlcmF0b3JfYnlfb3AiLCJ0b0xvd2VyQ2FzZSIsImNhcGl0YWxpemVGaXJzdExldHRlciIsInJlcyIsInNlbGVjdF9pdGVtIiwicHJvamVjdGlvbiIsIkV4cHJXaXRoQWxpYXMiLCJyZXNvbHZlU2VsZWN0U2VjdGlvbkl0ZW0iLCJVbm5hbWVkRXhwciIsImdldEFjdHVhbFRhYmxlTmFtZSIsIlF1YWxpZmllZFdpbGRjYXJkIiwiT2JqZWN0Iiwia2V5cyIsImFzc2VydCIsImlzVW5kZWZpbmVkT3JOdWxsIiwiaXRlbSIsImZ1bmN0aW9uX25vZGUiLCJuZWVkX3F1b3RlIiwiZnVuY3Rpb25fbmFtZSIsImFyZ3MiLCJhcmdfY291bnQiLCJhcmciLCJVbm5hbWVkIiwiRXhwciIsIklkZW50aWZpZXIiLCJDb21wb3VuZElkZW50aWZpZXIiLCJhcmdfY29sdW1uIiwiTmVzdGVkIiwiZGlzdGluY3QiLCJwYXJzZUJpbmFyeU9wTm9kZSIsIkJpbmFyeU9wIiwiam9pbnMiLCJwYXJzZUJpbmFyeU9wUGFydGlhbCIsImxlZnRfb3JfcmlnaHQiLCJiaW5hcnlfb3AiLCJzZXBhcmF0b3IiLCJwcmVwYXJlSm9pbnMiLCJqb2luX29wZXJhdG9yX3R5cGUiLCJqb2luX29wZXJhdG9yIiwiam9pbl9tZXRob2QiLCJPbiIsInN1Yl9xdWVyeV9zcWwiLCJzdWJfcXVlcnlfYWxpYXMiLCJqb2luZWRfdGFibGUiLCJmcm9tX2l0ZW1zIiwiY3Jvc3Nfam9pbl9zZWN0aW9ucyIsImNyb3NzX2pvaW5fc3RyIiwiZ3JvdXBfYnlfY29sdW1ucyIsImdyb3VwX2J5X2l0ZW0iLCJoYXZpbmciLCJvcmRlcl9ieXMiLCJvcmRlcl9ieV9pdGVtIiwiYXNjIiwidmFsdWVOb2RlIiwiaXNTdHJpbmciLCJ2YWx1ZV90eXBlIiwidGFibGVfbmFtZV9vcl9hbGlhcyIsImlkZW50aWZpZXIiLCJ2YWx1ZXMiLCJmbGF0IiwibXNnIiwib2JqIiwicHJvcGVydHlfbmFtZXMiLCJyZWR1Y2UiLCJjYXJyeSIsInByb3BlcnR5X25hbWUiLCJoYXNPd25Qcm9wZXJ0eSIsIlN0cmluZyIsInN0cmluZyIsImNoYXJBdCIsInRvVXBwZXJDYXNlIiwidW5xdW90ZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJzdHIiLCJ0YWJfY291bnQiLCJzcGxpdCIsIndhc20iLCJzaG93Tm90aWZpY2F0aW9uIiwibWVzc2FnZSIsInR5cGUiLCJleGlzdGluZ05vdGlmIiwiZG9jdW1lbnQiLCJxdWVyeVNlbGVjdG9yIiwicmVtb3ZlIiwibm90aWZpY2F0aW9uIiwiY3JlYXRlRWxlbWVudCIsImNsYXNzTmFtZSIsImlubmVySFRNTCIsIndyYXBwZXIiLCJpbnNlcnRCZWZvcmUiLCJmaXJzdENoaWxkIiwic2V0VGltZW91dCIsInN0eWxlIiwiYW5pbWF0aW9uIiwiY29udmVydGVyIiwiaW5wdXQiLCJnZXRFbGVtZW50QnlJZCIsImNvbnZlcnRCdXR0b24iLCJ0cmltIiwib3V0cHV0X3RleHRfYXJlYSIsInN0YXJ0c1dpdGgiLCJjbGFzc0xpc3QiLCJhZGQiLCJkaXNhYmxlZCIsInBhcnNlX3NxbCIsImNvbnNvbGUiLCJsb2ciLCJwYXJzZSIsIlF1ZXJ5IiwiZSIsImNvcHlUb0NsaXBib2FyZCIsIm91dHB1dCIsImNvcHlCdXR0b24iLCJjb3B5VGV4dCIsImNvcHlJY29uIiwibmF2aWdhdG9yIiwiY2xpcGJvYXJkIiwid3JpdGVUZXh0IiwidGhlbiIsInRleHRDb250ZW50Iiwid2luZG93IiwiYWRkRXZlbnRMaXN0ZW5lciIsImV2ZW50IiwidXJsX3NlYXJjaF9wYXJhbXMiLCJVUkxTZWFyY2hQYXJhbXMiLCJsb2NhdGlvbiIsInNlYXJjaCIsImhhcyIsImF0b2IiLCJnZXQiLCJjdHJsS2V5IiwibWV0YUtleSIsImtleSIsInNoYXJlX2xpbmsiLCJvcmlnaW4iLCJwYXRobmFtZSIsImJ0b2EiXSwic291cmNlUm9vdCI6IiJ9