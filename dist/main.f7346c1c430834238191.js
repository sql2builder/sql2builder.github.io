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
}

.converter-card {
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  padding: 2.5rem;
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
`, "",{"version":3,"sources":["webpack://./src/style.css"],"names":[],"mappings":"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","sourcesContent":["/* Modern SQL to Laravel Builder - Custom Styles */\n\n:root {\n  --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n  --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);\n  --success-gradient: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);\n  --dark-bg: #1a1a2e;\n  --card-bg: #ffffff;\n  --text-primary: #2d3748;\n  --text-secondary: #718096;\n  --border-color: #e2e8f0;\n  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.05);\n  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);\n  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);\n  --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.15);\n  --radius-sm: 8px;\n  --radius-md: 12px;\n  --radius-lg: 16px;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);\n  min-height: 100vh;\n}\n\n/* Hero Section Redesign */\n.hero.is-primary {\n  background: var(--primary-gradient);\n  position: relative;\n  overflow: hidden;\n}\n\n.hero.is-primary::before {\n  content: '';\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background: url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\");\n  opacity: 0.3;\n}\n\n.hero-body {\n  position: relative;\n  z-index: 1;\n  padding: 3rem 1.5rem;\n}\n\n.hero .title {\n  font-size: 2.5rem;\n  font-weight: 800;\n  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);\n  letter-spacing: -0.5px;\n}\n\n.hero .subtitle {\n  font-size: 1.25rem;\n  opacity: 0.95;\n  margin-top: 1rem;\n}\n\n/* Navigation/Header */\n.nav-header {\n  padding: 1rem 2rem;\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  background: white;\n  box-shadow: var(--shadow-sm);\n}\n\n.github-link {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.5rem;\n  padding: 0.75rem 1.5rem;\n  background: var(--dark-bg);\n  color: white;\n  text-decoration: none;\n  border-radius: var(--radius-md);\n  font-weight: 600;\n  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n  box-shadow: var(--shadow-md);\n}\n\n.github-link:hover {\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n  color: white;\n}\n\n.github-link::before {\n  content: '★';\n  font-size: 1.25rem;\n}\n\n/* Main Content Area */\n.content-wrapper {\n  max-width: 1400px;\n  margin: 0 auto;\n  padding: 2rem 1rem;\n}\n\n/* Converter Grid - Side by Side Layout */\n.converter-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 2rem;\n  margin-bottom: 2rem;\n}\n\n.converter-card {\n  background: var(--card-bg);\n  border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-xl);\n  padding: 2.5rem;\n  transition: all 0.3s ease;\n}\n\n.converter-card:hover {\n  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.2);\n}\n\n/* Section Headers */\n.section-header {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  margin-bottom: 1rem;\n  font-size: 1.25rem;\n  font-weight: 700;\n  color: var(--text-primary);\n}\n\n.section-icon {\n  width: 40px;\n  height: 40px;\n  border-radius: var(--radius-sm);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.25rem;\n  background: var(--primary-gradient);\n  color: white;\n  box-shadow: var(--shadow-md);\n}\n\n/* Textarea Redesign */\n.textarea-wrapper {\n  position: relative;\n  margin-bottom: 1.5rem;\n}\n\n.textarea {\n  border: 2px solid var(--border-color);\n  border-radius: var(--radius-md);\n  padding: 1.25rem;\n  font-size: 1rem;\n  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;\n  line-height: 1.6;\n  transition: all 0.3s ease;\n  resize: vertical;\n  min-height: 200px;\n  background: #f8fafc;\n}\n\n.textarea:focus {\n  outline: none;\n  border-color: #667eea;\n  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);\n  background: white;\n}\n\n.textarea::placeholder {\n  color: #a0aec0;\n  font-style: italic;\n}\n\n/* Copy Button */\n.copy-button {\n  position: absolute;\n  top: 0.75rem;\n  right: 0.75rem;\n  padding: 0.5rem 1rem;\n  background: white;\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-sm);\n  cursor: pointer;\n  font-size: 0.875rem;\n  font-weight: 600;\n  color: var(--text-secondary);\n  transition: all 0.2s ease;\n  z-index: 10;\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n}\n\n.copy-button:hover {\n  background: #667eea;\n  color: white;\n  border-color: #667eea;\n  transform: translateY(-1px);\n  box-shadow: var(--shadow-md);\n}\n\n.copy-button.copied {\n  background: #48bb78;\n  color: white;\n  border-color: #48bb78;\n}\n\n/* Button Controls */\n.button-controls {\n  display: flex;\n  gap: 1rem;\n  flex-wrap: wrap;\n}\n\n.button {\n  padding: 0.875rem 2rem;\n  border-radius: var(--radius-md);\n  font-weight: 700;\n  font-size: 1rem;\n  border: none;\n  cursor: pointer;\n  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);\n  display: inline-flex;\n  align-items: center;\n  gap: 0.5rem;\n  position: relative;\n  overflow: hidden;\n}\n\n.button::before {\n  content: '';\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  width: 0;\n  height: 0;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.3);\n  transform: translate(-50%, -50%);\n  transition: width 0.6s, height 0.6s;\n}\n\n.button:hover::before {\n  width: 300px;\n  height: 300px;\n}\n\n.button.is-primary {\n  background: var(--primary-gradient);\n  color: white;\n  box-shadow: var(--shadow-md);\n}\n\n.button.is-primary:hover {\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n}\n\n.button.is-secondary {\n  background: white;\n  color: #667eea;\n  border: 2px solid #667eea;\n}\n\n.button.is-secondary:hover {\n  background: #667eea;\n  color: white;\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-lg);\n}\n\n/* Loading Animation */\n.button.is-loading {\n  pointer-events: none;\n  opacity: 0.7;\n}\n\n.button.is-loading::after {\n  content: '';\n  position: absolute;\n  width: 16px;\n  height: 16px;\n  top: 50%;\n  left: 50%;\n  margin-left: -8px;\n  margin-top: -8px;\n  border: 2px solid transparent;\n  border-top-color: white;\n  border-radius: 50%;\n  animation: button-loading-spinner 0.6s linear infinite;\n}\n\n@keyframes button-loading-spinner {\n  from {\n    transform: rotate(0turn);\n  }\n  to {\n    transform: rotate(1turn);\n  }\n}\n\n/* Features Section */\n.features-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));\n  gap: 1.5rem;\n  margin-top: 2rem;\n  margin-bottom: 2rem;\n}\n\n.feature-card {\n  background: white;\n  padding: 1.5rem;\n  border-radius: var(--radius-md);\n  box-shadow: var(--shadow-md);\n  transition: all 0.3s ease;\n  border: 1px solid var(--border-color);\n}\n\n.feature-card:hover {\n  transform: translateY(-4px);\n  box-shadow: var(--shadow-lg);\n}\n\n.feature-icon {\n  width: 50px;\n  height: 50px;\n  border-radius: var(--radius-sm);\n  background: var(--primary-gradient);\n  color: white;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 1.5rem;\n  margin-bottom: 1rem;\n}\n\n.feature-title {\n  font-size: 1.125rem;\n  font-weight: 700;\n  color: var(--text-primary);\n  margin-bottom: 0.5rem;\n}\n\n.feature-description {\n  color: var(--text-secondary);\n  font-size: 0.9rem;\n  line-height: 1.6;\n}\n\n/* Footer */\n.modern-footer {\n  background: white;\n  padding: 2rem;\n  text-align: center;\n  margin-top: 4rem;\n  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);\n}\n\n.modern-footer p {\n  color: var(--text-secondary);\n  margin: 0;\n}\n\n.modern-footer a {\n  color: #667eea;\n  text-decoration: none;\n  font-weight: 600;\n}\n\n.modern-footer a:hover {\n  text-decoration: underline;\n}\n\n/* Animations */\n@keyframes fadeInUp {\n  from {\n    opacity: 0;\n    transform: translateY(20px);\n  }\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n.fade-in-up {\n  animation: fadeInUp 0.6s ease-out;\n}\n\n/* Success/Error Messages */\n.message-box {\n  padding: 1rem 1.5rem;\n  border-radius: var(--radius-md);\n  margin-bottom: 1rem;\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  animation: fadeInUp 0.3s ease-out;\n}\n\n.message-box.success {\n  background: #d4edda;\n  color: #155724;\n  border-left: 4px solid #28a745;\n}\n\n.message-box.error {\n  background: #f8d7da;\n  color: #721c24;\n  border-left: 4px solid #dc3545;\n}\n\n/* Responsive Design */\n@media (max-width: 1024px) {\n  .converter-grid {\n    grid-template-columns: 1fr;\n    gap: 1.5rem;\n  }\n\n  .content-wrapper {\n    max-width: 1200px;\n  }\n}\n\n@media (max-width: 768px) {\n  .hero .title {\n    font-size: 1.75rem;\n  }\n\n  .hero .subtitle {\n    font-size: 1rem;\n  }\n\n  .converter-card {\n    padding: 1.5rem;\n  }\n\n  .button-controls {\n    flex-direction: column;\n  }\n\n  .button {\n    width: 100%;\n    justify-content: center;\n  }\n\n  .nav-header {\n    flex-direction: column;\n    gap: 1rem;\n  }\n\n  .features-grid {\n    grid-template-columns: 1fr;\n  }\n\n  .textarea {\n    min-height: 150px;\n  }\n}\n\n/* Code Highlighting in Output */\n.textarea.code-output {\n  background: #2d3748;\n  color: #e2e8f0;\n  border-color: #4a5568;\n}\n\n.textarea.code-output:focus {\n  border-color: #667eea;\n}\n\n/* Utility Classes */\n.mt-1 { margin-top: 0.5rem; }\n.mt-2 { margin-top: 1rem; }\n.mt-3 { margin-top: 1.5rem; }\n.mt-4 { margin-top: 2rem; }\n\n.mb-1 { margin-bottom: 0.5rem; }\n.mb-2 { margin-bottom: 1rem; }\n.mb-3 { margin-bottom: 1.5rem; }\n.mb-4 { margin-bottom: 2rem; }\n\n.text-center { text-align: center; }\n.text-muted { color: var(--text-secondary); }\n"],"sourceRoot":""}]);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5mNzM0NmMxYzQzMDgzNDIzODE5MS5qcyIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQU8sTUFBTUEsU0FBUyxDQUN0QjtFQUNJQyxXQUFXQSxDQUFDQyxHQUFHLEVBQUVDLE1BQU0sR0FBRyxJQUFJLEVBQUU7SUFDNUIsSUFBSSxDQUFDRCxHQUFHLEdBQUdBLEdBQUc7SUFDZCxJQUFJLENBQUNFLG1CQUFtQixHQUFHLENBQUMsQ0FBQztJQUM3QixJQUFJLENBQUNELE1BQU0sR0FBR0EsTUFBTTtFQUN4QjtFQUVBRSxHQUFHQSxDQUFDQyxzQkFBc0IsR0FBRyxJQUFJLEVBQUU7SUFDL0IsSUFBSUMsUUFBUSxHQUFHLEVBQUU7SUFFakIsSUFBSUMsU0FBUyxHQUFHLElBQUksQ0FBQ04sR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUU1QyxJQUFJQyxnQ0FBZ0MsQ0FBQ0osU0FBUyxDQUFDSyxRQUFRLEVBQUUsT0FBTyxDQUFDLEVBQUU7TUFDL0ROLFFBQVEsQ0FBQ08sSUFBSSxDQUFDLElBQUksQ0FBQ0MsdUJBQXVCLENBQUNQLFNBQVMsQ0FBQyxDQUFDO0lBQzFELENBQUMsTUFBTSxJQUFJSSxnQ0FBZ0MsQ0FBQ0osU0FBUyxDQUFDSyxRQUFRLEVBQUUsU0FBUyxDQUFDLEVBQUU7TUFDeEVOLFFBQVEsQ0FBQ08sSUFBSSxDQUFDLElBQUksQ0FBQ0UscUJBQXFCLENBQUMsc0JBQXNCLENBQUMsRUFBRVIsU0FBUyxDQUFDO0lBQ2hGLENBQUMsTUFBTTtNQUNILE1BQU0sc0NBQXNDO0lBQ2hEO0lBRUEsSUFBSVMsWUFBWSxHQUFHLEVBQUU7O0lBRXJCO0lBQ0EsSUFBSSxJQUFJLENBQUNDLGNBQWMsQ0FBQ1YsU0FBUyxDQUFDLEVBQUU7TUFDaENTLFlBQVksR0FBRyxJQUFJLENBQUNFLGtCQUFrQixDQUFDWCxTQUFTLENBQUM7SUFDckQ7O0lBRUE7SUFDQSxJQUFJLElBQUksQ0FBQ04sR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDUyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUNDLE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDL0NkLFFBQVEsR0FBR0EsUUFBUSxDQUFDZSxNQUFNLENBQUMsSUFBSSxDQUFDQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUNyQixHQUFHLENBQUNPLElBQUksQ0FBQ0MsTUFBTSxDQUFDQyxJQUFJLENBQUNTLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hHO0lBRUFiLFFBQVEsQ0FBQ08sSUFBSSxDQUFDLElBQUksQ0FBQ1Usb0JBQW9CLENBQUMsQ0FBQyxDQUFDO0lBRTFDLElBQUlQLFlBQVksS0FBSyxFQUFFLEVBQUU7TUFDckJWLFFBQVEsQ0FBQ08sSUFBSSxDQUFDRyxZQUFZLENBQUM7SUFDL0I7SUFFQSxJQUFJTCxnQ0FBZ0MsQ0FBQyxJQUFJLENBQUNWLEdBQUcsQ0FBQ08sSUFBSSxDQUFDQyxNQUFNLEVBQUUsV0FBVyxDQUFDLEVBQUU7TUFDckVILFFBQVEsQ0FBQ08sSUFBSSxDQUFDLElBQUksQ0FBQ1csbUJBQW1CLENBQUMsSUFBSSxDQUFDdkIsR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ2dCLFNBQVMsQ0FBQyxDQUFDO0lBQzNFO0lBRUEsSUFBSWQsZ0NBQWdDLENBQUMsSUFBSSxDQUFDVixHQUFHLENBQUNPLElBQUksQ0FBQ0MsTUFBTSxFQUFFLFVBQVUsQ0FBQyxJQUFJLElBQUksQ0FBQ1IsR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ2lCLFFBQVEsQ0FBQ04sTUFBTSxHQUFHLENBQUMsRUFBRTtNQUNoSGQsUUFBUSxDQUFDTyxJQUFJLENBQUMsSUFBSSxDQUFDYyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7TUFFM0MsSUFBSWhCLGdDQUFnQyxDQUFDLElBQUksQ0FBQ1YsR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sRUFBRSxRQUFRLENBQUMsRUFBRTtRQUNsRUgsUUFBUSxDQUFDTyxJQUFJLENBQUMsSUFBSSxDQUFDZSxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7TUFDOUM7SUFDSjtJQUVBLElBQUlqQixnQ0FBZ0MsQ0FBQyxJQUFJLENBQUNWLEdBQUcsRUFBRSxVQUFVLENBQUMsSUFBSSxJQUFJLENBQUNBLEdBQUcsQ0FBQzRCLFFBQVEsQ0FBQ1QsTUFBTSxHQUFHLENBQUMsRUFBRTtNQUN4RmQsUUFBUSxDQUFDTyxJQUFJLENBQUMsSUFBSSxDQUFDaUIscUJBQXFCLENBQUMsQ0FBQyxDQUFDO0lBQy9DO0lBRUEsSUFBSW5CLGdDQUFnQyxDQUFDLElBQUksQ0FBQ1YsR0FBRyxFQUFFLE9BQU8sQ0FBQyxFQUFFO01BQ3JESyxRQUFRLENBQUNPLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDWixHQUFHLENBQUM4QixLQUFLLENBQUNDLEtBQUssQ0FBQ0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUNsRTtJQUVBLElBQUl0QixnQ0FBZ0MsQ0FBQyxJQUFJLENBQUNWLEdBQUcsRUFBRSxRQUFRLENBQUMsRUFBRTtNQUN0REssUUFBUSxDQUFDTyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQ1osR0FBRyxDQUFDaUMsTUFBTSxDQUFDQyxLQUFLLENBQUNILEtBQUssQ0FBQ0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUMxRTtJQUVBLElBQUk1QixzQkFBc0IsRUFBRTtNQUN4QkMsUUFBUSxDQUFDTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQzNCO0lBRUEsT0FBT1AsUUFBUSxDQUFDOEIsSUFBSSxDQUFDLE1BQU0sQ0FBQztFQUNoQztFQUVBQyxnQ0FBZ0NBLENBQUNDLGFBQWEsRUFBRTtJQUN4QyxJQUFJQyxVQUFVLEdBQUdELGFBQWEsQ0FBQ0UsS0FBSyxDQUFDQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUNOLEtBQUs7SUFFbEQsSUFBSXhCLGdDQUFnQyxDQUFDMkIsYUFBYSxDQUFDRSxLQUFLLEVBQUUsT0FBTyxDQUFDLEVBQUU7TUFDaEUsSUFBSSxDQUFDckMsbUJBQW1CLENBQUNtQyxhQUFhLENBQUNFLEtBQUssQ0FBQ0UsS0FBSyxDQUFDRCxJQUFJLENBQUNOLEtBQUssQ0FBQyxHQUFHSSxVQUFVO0lBQy9FO0lBRUEsT0FBT0ksS0FBSyxDQUFDSixVQUFVLENBQUM7RUFDaEM7O0VBRUE7QUFDSjtBQUNBO0VBQ0l6Qix1QkFBdUJBLENBQUNQLFNBQVMsRUFBRTtJQUMvQixPQUFPLFlBQVksR0FBRyxJQUFJLENBQUM4QixnQ0FBZ0MsQ0FBQzlCLFNBQVMsQ0FBQ0ssUUFBUSxDQUFDLEdBQUcsR0FBRztFQUN6Rjs7RUFFQTtBQUNKO0FBQ0E7RUFDSUcscUJBQXFCQSxDQUFDNkIsTUFBTSxFQUFFckMsU0FBUyxFQUFFO0lBQ3JDLE9BQU9xQyxNQUFNLEdBQUcsd0JBQXdCLEdBQ2xDLElBQUksR0FBR0MsaUJBQWlCLENBQUUsSUFBSTlDLFNBQVMsQ0FBQ1EsU0FBUyxDQUFDSyxRQUFRLENBQUNrQyxPQUFPLENBQUNDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQzNDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBRTRDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUMvSSxJQUFJLEdBQUdMLEtBQUssQ0FBQ3BDLFNBQVMsQ0FBQ0ssUUFBUSxDQUFDa0MsT0FBTyxDQUFDSixLQUFLLENBQUNELElBQUksQ0FBQ04sS0FBSyxDQUFDLEdBQUcsR0FBRztFQUN6RTtFQUVBWCxtQkFBbUJBLENBQUN5QixjQUFjLEVBQUU7SUFDaEMsSUFBSUMsY0FBYyxHQUFHQyw0QkFBNEIsQ0FBQ0YsY0FBYyxDQUFDO0lBQ2pFLElBQUlHLFNBQVMsR0FBR0MsOEJBQThCLENBQUNKLGNBQWMsQ0FBQztJQUU5RCxPQUFPLElBQUksQ0FBQ0ssaUJBQWlCLENBQUNKLGNBQWMsRUFBRUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQ2hCLElBQUksQ0FBQyxNQUFNLENBQUM7RUFDdEY7O0VBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSWtCLGlCQUFpQkEsQ0FBQ0osY0FBYyxFQUFFRSxTQUFTLEVBQUVHLEVBQUUsRUFBRUMsV0FBVyxFQUFFO0lBQzFELElBQUlDLFVBQVUsR0FBRyxFQUFFO0lBRW5CLElBQUlQLGNBQWMsS0FBSyxRQUFRLElBQUlBLGNBQWMsS0FBSyxXQUFXLEVBQUU7TUFDL0QsSUFBSU0sV0FBVyxHQUFHTixjQUFjLEtBQUssUUFBUSxHQUFHLFdBQVcsR0FBRyxjQUFjO01BQzVFTyxVQUFVLENBQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDNkMsaUJBQWlCLENBQUNILEVBQUUsRUFBRUMsV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQ0csaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDRCxTQUFTLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUM1SixDQUFDLE1BQU0sSUFBSUYsY0FBYyxLQUFLLFFBQVEsRUFBRTtNQUNwQyxJQUFJVSxNQUFNLEdBQUcsSUFBSSxDQUFDRCxpQ0FBaUMsQ0FBQ04sOEJBQThCLENBQUNELFNBQVMsQ0FBQ1MsSUFBSSxDQUFDLENBQUM7TUFDbkcsSUFBSUMsSUFBSSxHQUFHVixTQUFTLENBQUNVLElBQUksQ0FBQ0MsR0FBRyxDQUFFQyxDQUFDLElBQUssSUFBSSxDQUFDQyxZQUFZLENBQUNELENBQUMsQ0FBQ2hDLEtBQUssQ0FBQyxDQUFDO01BRWhFLElBQUl3QixXQUFXLEdBQUdKLFNBQVMsQ0FBQ2MsT0FBTyxHQUFHLFlBQVksR0FBRyxTQUFTO01BQzlEVCxVQUFVLENBQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDNkMsaUJBQWlCLENBQUNILEVBQUUsRUFBRUMsV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBR0UsSUFBSSxDQUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNoSCxDQUFDLE1BQU0sSUFBSWMsY0FBYyxLQUFLLFFBQVEsRUFBRTtNQUNwQ08sVUFBVSxDQUFDNUMsSUFBSSxDQUNYLElBQUksQ0FBQzZDLGlCQUFpQixDQUFDSCxFQUFFLEVBQUVDLFdBQVcsQ0FBQyxHQUFHLHdCQUF3QixHQUNoRSxZQUFZLEdBQUlYLGlCQUFpQixDQUFDLElBQUksQ0FBQ3JCLG1CQUFtQixDQUFDNEIsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsT0FDbEYsQ0FBQztJQUNMLENBQUMsTUFBTSxJQUFJRixjQUFjLEtBQUssVUFBVSxFQUFFO01BQ3RDLElBQUlFLFNBQVMsQ0FBQ0csRUFBRSxLQUFLLEtBQUssSUFBSUgsU0FBUyxDQUFDRyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2pELElBQUlZLG1CQUFtQixHQUFHaEIsNEJBQTRCLENBQUNDLFNBQVMsQ0FBQ2dCLElBQUksQ0FBQztRQUN0RSxJQUFJQyxjQUFjLEdBQUdoQiw4QkFBOEIsQ0FBQ0QsU0FBUyxDQUFDZ0IsSUFBSSxDQUFDO1FBQ25FWCxVQUFVLEdBQUdBLFVBQVUsQ0FBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUNpQyxpQkFBaUIsQ0FBQ2EsbUJBQW1CLEVBQUVFLGNBQWMsRUFBRWQsRUFBRSxFQUFFQyxXQUFXLENBQUMsQ0FBQztRQUU1RyxJQUFJYyxvQkFBb0IsR0FBR25CLDRCQUE0QixDQUFDQyxTQUFTLENBQUNtQixLQUFLLENBQUM7UUFDeEUsSUFBSUMsZUFBZSxHQUFHbkIsOEJBQThCLENBQUNELFNBQVMsQ0FBQ21CLEtBQUssQ0FBQztRQUNyRWQsVUFBVSxHQUFHQSxVQUFVLENBQUNwQyxNQUFNLENBQUMsSUFBSSxDQUFDaUMsaUJBQWlCLENBQUNnQixvQkFBb0IsRUFBRUUsZUFBZSxFQUFFcEIsU0FBUyxDQUFDRyxFQUFFLEVBQUVDLFdBQVcsQ0FBQyxDQUFDO01BQzVILENBQUMsTUFBTTtRQUNILElBQUlZLElBQUksR0FBRyxJQUFJLENBQUNULGlDQUFpQyxDQUFDTiw4QkFBOEIsQ0FBQ0QsU0FBUyxDQUFDZ0IsSUFBSSxDQUFDLENBQUM7UUFDakcsSUFBSUcsS0FBSztRQUVULElBQUk1RCxnQ0FBZ0MsQ0FBQ3lDLFNBQVMsQ0FBQ21CLEtBQUssRUFBRSxZQUFZLEVBQUUsb0JBQW9CLENBQUMsRUFBRTtVQUN2RkEsS0FBSyxHQUFHLElBQUksQ0FBQ1osaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDRCxTQUFTLENBQUNtQixLQUFLLENBQUMsQ0FBQztVQUUvRixJQUFJZixXQUFXLENBQUNpQixRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDL0JGLEtBQUssR0FBRyxVQUFVLEdBQUdBLEtBQUssR0FBRyxHQUFHO1VBQ3BDO1FBQ0osQ0FBQyxNQUFNLElBQUk1RCxnQ0FBZ0MsQ0FBQ3lDLFNBQVMsQ0FBQ21CLEtBQUssRUFBRSxPQUFPLENBQUMsRUFBRTtVQUNuRWYsV0FBVyxHQUFHLE9BQU87VUFDckJlLEtBQUssR0FBRyxJQUFJLENBQUNOLFlBQVksQ0FBQ2IsU0FBUyxDQUFDbUIsS0FBSyxDQUFDdkMsS0FBSyxDQUFDO1FBQ3BELENBQUMsTUFBTSxJQUFJckIsZ0NBQWdDLENBQUN5QyxTQUFTLENBQUNtQixLQUFLLEVBQUUsVUFBVSxDQUFDLEVBQUU7VUFDdEVBLEtBQUssR0FBRyxzQkFBc0IsR0FDeEIsSUFBSSxHQUFHMUIsaUJBQWlCLENBQUUsSUFBSTlDLFNBQVMsQ0FBQ3FELFNBQVMsQ0FBQ21CLEtBQUssQ0FBQ0csUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDdEUsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFFNEMsT0FBTyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLEdBQ3BJLEdBQUc7UUFDYixDQUFDLE1BQU0sSUFBSXJDLGdDQUFnQyxDQUFDeUMsU0FBUyxDQUFDbUIsS0FBSyxFQUFFLFVBQVUsQ0FBQyxFQUFFO1VBQ3RFQSxLQUFLLEdBQUcsVUFBVSxHQUFHLElBQUksQ0FBQ0ksaUJBQWlCLENBQUN2QixTQUFTLENBQUNtQixLQUFLLENBQUNLLFFBQVEsQ0FBQyxHQUFHLEdBQUc7UUFDL0UsQ0FBQyxNQUFNO1VBQ0gsTUFBTSw4Q0FBOEMsR0FBR3pCLDRCQUE0QixDQUFDQyxTQUFTLENBQUNtQixLQUFLLENBQUM7UUFDeEc7UUFFQWQsVUFBVSxDQUFDNUMsSUFBSSxDQUFDLElBQUksQ0FBQzZDLGlCQUFpQixDQUFDSCxFQUFFLEVBQUVDLFdBQVcsQ0FBQyxHQUFHLEdBQUcsR0FBR1ksSUFBSSxHQUFHLEdBQUcsR0FBR3pCLEtBQUssQ0FBQyxJQUFJLENBQUNrQyxpQkFBaUIsQ0FBQ3pCLFNBQVMsQ0FBQ0csRUFBRSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUdnQixLQUFLLEdBQUcsR0FBRyxDQUFDO01BQ2pKO0lBQ0osQ0FBQyxNQUFNLElBQUlyQixjQUFjLEtBQUssUUFBUSxFQUFFO01BQ3BDTyxVQUFVLENBQUM1QyxJQUFJLENBQ1gsSUFBSSxDQUFDNkMsaUJBQWlCLENBQUNILEVBQUUsRUFBRSxhQUFhLENBQUMsR0FBRyx3QkFBd0IsR0FDcEUsSUFBSSxHQUFJVixpQkFBaUIsQ0FBRSxJQUFJOUMsU0FBUyxDQUFDcUQsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFFaEQsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDNEMsT0FBTyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsR0FBRyxLQUFLLEdBQ3RILEdBQ0osQ0FBQztJQUNMLENBQUMsTUFBTSxJQUFJRSxjQUFjLEtBQUssU0FBUyxFQUFFO01BQ3JDLElBQUlNLFdBQVcsR0FBR0osU0FBUyxDQUFDYyxPQUFPLEtBQUssSUFBSSxHQUFHLGlCQUFpQixHQUFHLGNBQWM7TUFFakZULFVBQVUsQ0FBQzVDLElBQUksQ0FDYixJQUFJLENBQUM2QyxpQkFBaUIsQ0FBQ0gsRUFBRSxFQUFFQyxXQUFXLENBQUMsR0FBRyxHQUFHLEdBQzNDLElBQUksQ0FBQ0csaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDRCxTQUFTLENBQUNTLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUM1RixHQUFHLEdBQUcsSUFBSSxDQUFDSSxZQUFZLENBQUNiLFNBQVMsQ0FBQzBCLEdBQUcsQ0FBQzlDLEtBQUssQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUNpQyxZQUFZLENBQUNiLFNBQVMsQ0FBQzJCLElBQUksQ0FBQy9DLEtBQUssQ0FBQyxHQUFHLElBQ25HLENBQUM7SUFDTCxDQUFDLE1BQU0sSUFBSWtCLGNBQWMsS0FBSyxZQUFZLEVBQUU7TUFDeEMsSUFBSU0sV0FBVyxHQUFHSixTQUFTLENBQUNjLE9BQU8sS0FBSyxJQUFJLEdBQUcsWUFBWSxHQUFHLFNBQVM7TUFFdkVULFVBQVUsQ0FBQzVDLElBQUksQ0FDYixJQUFJLENBQUM2QyxpQkFBaUIsQ0FBQ0gsRUFBRSxFQUFFQyxXQUFXLENBQUMsR0FDckMsR0FBRyxHQUFHLElBQUksQ0FBQ0csaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDRCxTQUFTLENBQUNTLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLHdCQUF3QixHQUM3SCxJQUFJLEdBQUdoQixpQkFBaUIsQ0FBRSxJQUFJOUMsU0FBUyxDQUFDcUQsU0FBUyxDQUFDTCxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUUzQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM0QyxPQUFPLENBQUMsV0FBVyxFQUFFLGNBQWMsQ0FBQyxHQUFHLEtBQUssR0FDOUgsR0FDSixDQUFDO0lBQ0wsQ0FBQyxNQUFNLElBQUlFLGNBQWMsS0FBSyxVQUFVLEVBQUU7TUFDdENPLFVBQVUsQ0FBQzVDLElBQUksQ0FBQyxJQUFJLENBQUM2QyxpQkFBaUIsQ0FBQ0gsRUFBRSxFQUFFQyxXQUFXLENBQUMsR0FBRyxZQUFZLEdBQUcsSUFBSSxDQUFDbUIsaUJBQWlCLENBQUN2QixTQUFTLEVBQUUsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQzlILENBQUMsTUFBTSxJQUFJRixjQUFjLEtBQUssU0FBUyxFQUFFO01BQ3JDTyxVQUFVLENBQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDeUMsaUJBQWlCLENBQUNILDRCQUE0QixDQUFDQyxTQUFTLENBQUNTLElBQUksQ0FBQyxFQUFFUiw4QkFBOEIsQ0FBQ0QsU0FBUyxDQUFDUyxJQUFJLENBQUMsRUFBRU4sRUFBRSxFQUFFQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ1IsT0FBTyxDQUFDLFFBQVEsRUFBRSxPQUFPLEdBQUdJLFNBQVMsQ0FBQ0csRUFBRSxDQUFDLENBQUM7SUFDdk0sQ0FBQyxNQUFNO01BQ0gsTUFBTSx5Q0FBeUMsR0FBR0wsY0FBYyxHQUFHLEdBQUc7SUFDMUU7SUFFQSxPQUFPTyxVQUFVO0VBQ3JCOztFQUVBO0FBQ0o7QUFDQTtBQUNBO0VBQ0lvQixpQkFBaUJBLENBQUN0QixFQUFFLEVBQUU7SUFDbEIsSUFBSXlCLGNBQWMsR0FBRztNQUNqQixJQUFJLEVBQUUsR0FBRztNQUNULElBQUksRUFBRSxHQUFHO01BQ1QsTUFBTSxFQUFFLElBQUk7TUFDWixJQUFJLEVBQUUsR0FBRztNQUNULE1BQU0sRUFBRSxHQUFHO01BQ1gsT0FBTyxFQUFFLElBQUk7TUFDYixNQUFNLEVBQUUsTUFBTTtNQUNkLE9BQU8sRUFBRSxHQUFHO01BQ1osTUFBTSxFQUFFLEdBQUc7TUFDWCxVQUFVLEVBQUUsR0FBRztNQUNmLFFBQVEsRUFBRTtJQUNkLENBQUM7SUFFRCxPQUFPQSxjQUFjLENBQUN6QixFQUFFLENBQUM7RUFDN0I7RUFFQUcsaUJBQWlCQSxDQUFDSCxFQUFFLEVBQUVDLFdBQVcsRUFBRTtJQUMvQixJQUFJRCxFQUFFLEtBQUssRUFBRSxJQUFJQSxFQUFFLEtBQUssS0FBSyxFQUFFO01BQzNCLE9BQU9DLFdBQVc7SUFDdEI7SUFFQSxPQUFPRCxFQUFFLENBQUMwQixXQUFXLENBQUMsQ0FBQyxHQUFHQyxxQkFBcUIsQ0FBQzFCLFdBQVcsQ0FBQztFQUNoRTs7RUFFQTtBQUNKO0FBQ0E7RUFDSWpDLG9CQUFvQkEsQ0FBQSxFQUFHO0lBQ25CLElBQUk0RCxHQUFHLEdBQUcsRUFBRTtJQUVaLEtBQUssTUFBTUMsV0FBVyxJQUFJLElBQUksQ0FBQ25GLEdBQUcsQ0FBQ08sSUFBSSxDQUFDQyxNQUFNLENBQUM0RSxVQUFVLEVBQUU7TUFDdkQsSUFBSTFFLGdDQUFnQyxDQUFDeUUsV0FBVyxFQUFFLGVBQWUsQ0FBQyxFQUFFO1FBQ2hFLElBQUkxQyxLQUFLLEdBQUcwQyxXQUFXLENBQUNFLGFBQWEsQ0FBQzVDLEtBQUssQ0FBQ1AsS0FBSztRQUNqRGdELEdBQUcsQ0FBQ3RFLElBQUksQ0FBQyxJQUFJLENBQUMwRSx3QkFBd0IsQ0FBQ0gsV0FBVyxDQUFDRSxhQUFhLENBQUN6QixJQUFJLEVBQUVuQixLQUFLLENBQUMsQ0FBQztNQUNsRixDQUFDLE1BQU0sSUFBSS9CLGdDQUFnQyxDQUFDeUUsV0FBVyxFQUFFLGFBQWEsQ0FBQyxFQUFFO1FBQ3JFRCxHQUFHLENBQUN0RSxJQUFJLENBQUMsSUFBSSxDQUFDMEUsd0JBQXdCLENBQUNILFdBQVcsQ0FBQ0ksV0FBVyxDQUFDLENBQUM7TUFDcEUsQ0FBQyxNQUFNLElBQUlKLFdBQVcsS0FBSyxVQUFVLEVBQUU7UUFDbkNELEdBQUcsQ0FBQ3RFLElBQUksQ0FBQzhCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztNQUN4QixDQUFDLE1BQU0sSUFBSWhDLGdDQUFnQyxDQUFDeUUsV0FBVyxFQUFFLG1CQUFtQixDQUFDLEVBQUU7UUFDM0VELEdBQUcsQ0FBQ3RFLElBQUksQ0FBQzhCLEtBQUssQ0FBQyxJQUFJLENBQUM4QyxrQkFBa0IsQ0FBQ0wsV0FBVyxDQUFDTSxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQ3ZELEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO01BQzNGLENBQUMsTUFBTTtRQUNILE1BQU0sc0NBQXNDLEdBQUd3RCxNQUFNLENBQUNDLElBQUksQ0FBQ1IsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRztNQUNwRjtJQUNKO0lBRUEsT0FBTyxTQUFTLEdBQUdELEdBQUcsQ0FBQy9DLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHO0VBQzNDOztFQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSW1ELHdCQUF3QkEsQ0FBQ0gsV0FBVyxFQUFFMUMsS0FBSyxHQUFHLElBQUksRUFBRTtJQUNoRG1ELE1BQU0sQ0FBQ0MsaUJBQWlCLENBQUNWLFdBQVcsQ0FBQyxLQUFLLEtBQUssRUFBRSwyQ0FBMkMsQ0FBQztJQUU3RixJQUFJVyxJQUFJO0lBQ1IsSUFBSXBGLGdDQUFnQyxDQUFDeUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxFQUFFO01BQzNEVyxJQUFJLEdBQUcsV0FBVyxHQUFHLElBQUksQ0FBQ3BCLGlCQUFpQixDQUFDUyxXQUFXLENBQUNSLFFBQVEsQ0FBQztNQUVqRSxJQUFJbEMsS0FBSyxLQUFLLElBQUksRUFBRTtRQUNoQnFELElBQUksR0FBR0EsSUFBSSxHQUFHLE1BQU0sR0FBR3JELEtBQUssR0FBRyxJQUFJO01BQ3ZDO01BRUEsT0FBT3FELElBQUk7SUFDZixDQUFDLE1BQU07TUFDSEEsSUFBSSxHQUFHLElBQUksQ0FBQ3BDLGlDQUFpQyxDQUFDTiw4QkFBOEIsQ0FBQytCLFdBQVcsQ0FBQyxFQUFFLEtBQUssQ0FBQztNQUVqRyxJQUFJMUMsS0FBSyxLQUFLLElBQUksRUFBRTtRQUNoQnFELElBQUksR0FBR0EsSUFBSSxHQUFHLE1BQU0sR0FBR3JELEtBQUs7TUFDaEM7TUFFQSxPQUFPQyxLQUFLLENBQUNvRCxJQUFJLENBQUM7SUFDdEI7RUFDSjtFQUVBcEIsaUJBQWlCQSxDQUFDcUIsYUFBYSxFQUFFQyxVQUFVLEdBQUcsSUFBSSxFQUFFO0lBQ2hELElBQUlDLGFBQWEsR0FBR0YsYUFBYSxDQUFDdkQsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDTixLQUFLO0lBRS9DLElBQUk4RCxVQUFVLEVBQUU7TUFDWkMsYUFBYSxHQUFHdkQsS0FBSyxDQUFDdUQsYUFBYSxDQUFDO0lBQ3hDO0lBRUEsSUFBSWYsR0FBRyxHQUFHZSxhQUFhLEdBQUcsR0FBRztJQUM3QixJQUFJQyxJQUFJLEdBQUdILGFBQWEsQ0FBQ0csSUFBSTtJQUM3QixJQUFJQyxTQUFTLEdBQUdELElBQUksQ0FBQy9FLE1BQU07SUFFM0IsS0FBSyxJQUFJNEMsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHb0MsU0FBUyxFQUFFcEMsQ0FBQyxFQUFFLEVBQUU7TUFDaEMsSUFBSXFDLEdBQUcsR0FBR0YsSUFBSSxDQUFDbkMsQ0FBQyxDQUFDO01BRWpCLElBQUlxQyxHQUFHLENBQUNDLE9BQU8sS0FBSyxVQUFVLEVBQUU7UUFDNUJuQixHQUFHLEdBQUdBLEdBQUcsR0FBRyxHQUFHO01BQ25CLENBQUMsTUFBTSxJQUFJeEUsZ0NBQWdDLENBQUMwRixHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxFQUFFLE9BQU8sQ0FBQyxFQUFFO1FBQ3BFcEIsR0FBRyxHQUFHQSxHQUFHLEdBQUcsSUFBSSxDQUFDbEIsWUFBWSxDQUFDb0MsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQ3ZFLEtBQUssQ0FBQztNQUN6RCxDQUFDLE1BQU0sSUFBSXJCLGdDQUFnQyxDQUFDMEYsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksRUFBRSxZQUFZLENBQUMsRUFBRTtRQUN6RXBCLEdBQUcsR0FBR0EsR0FBRyxHQUFHa0IsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQ0MsVUFBVSxDQUFDckUsS0FBSztNQUNqRCxDQUFDLE1BQU0sSUFBSXhCLGdDQUFnQyxDQUFDMEYsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksRUFBRSxvQkFBb0IsQ0FBQyxFQUFFO1FBQ2pGcEIsR0FBRyxHQUFHQSxHQUFHLEdBQUcsSUFBSSxDQUFDeEIsaUNBQWlDLENBQUMwQyxHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDRSxrQkFBa0IsQ0FBQztNQUMzRixDQUFDLE1BQU0sSUFBSTlGLGdDQUFnQyxDQUFDMEYsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksRUFBRSxRQUFRLENBQUMsRUFBRTtRQUFFO1FBQ3ZFLElBQUlHLFVBQVUsR0FBRyxJQUFJLENBQUMvQyxpQ0FBaUMsQ0FBQ04sOEJBQThCLENBQUNnRCxHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDSSxNQUFNLENBQUMsQ0FBQztRQUVoSCxJQUFJWCxhQUFhLENBQUNZLFFBQVEsS0FBSyxJQUFJLEVBQUU7VUFDakNGLFVBQVUsR0FBRyxXQUFXLEdBQUdBLFVBQVUsR0FBRyxHQUFHO1FBQy9DO1FBRUF2QixHQUFHLEdBQUdBLEdBQUcsR0FBR3VCLFVBQVU7TUFDMUIsQ0FBQyxNQUFNLElBQUkvRixnQ0FBZ0MsQ0FBQzBGLEdBQUcsQ0FBQ0MsT0FBTyxDQUFDQyxJQUFJLEVBQUUsVUFBVSxDQUFDLEVBQUU7UUFDdkVwQixHQUFHLEdBQUdBLEdBQUcsR0FBRyxJQUFJLENBQUNSLGlCQUFpQixDQUFDMEIsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQzNCLFFBQVEsRUFBRSxLQUFLLENBQUM7TUFDeEUsQ0FBQyxNQUFNLElBQUlqRSxnQ0FBZ0MsQ0FBQzBGLEdBQUcsQ0FBQ0MsT0FBTyxDQUFDQyxJQUFJLEVBQUUsVUFBVSxDQUFDLEVBQUU7UUFDdkVwQixHQUFHLEdBQUdBLEdBQUcsR0FBRyxJQUFJLENBQUMwQixpQkFBaUIsQ0FBQ1IsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQ08sUUFBUSxDQUFDO01BQ2pFLENBQUMsTUFBTSxJQUFJbkcsZ0NBQWdDLENBQUMwRixHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxFQUFFLFNBQVMsQ0FBQyxFQUFFO1FBQ3RFO01BQUEsQ0FDSCxNQUFNLElBQUk1RixnQ0FBZ0MsQ0FBQzBGLEdBQUcsQ0FBQ0MsT0FBTyxDQUFDQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUU7UUFDbkU7TUFBQSxDQUNILE1BQU07UUFDSDtNQUFBO01BSUosSUFBSXZDLENBQUMsS0FBS29DLFNBQVMsR0FBRyxDQUFDLEVBQUU7UUFDckJqQixHQUFHLEdBQUdBLEdBQUcsR0FBRyxJQUFJO01BQ3BCO0lBQ0o7SUFFQUEsR0FBRyxHQUFHQSxHQUFHLEdBQUcsR0FBRztJQUVmLE9BQU9BLEdBQUc7RUFDZDs7RUFFQTtBQUNKO0FBQ0E7RUFDSWxFLGNBQWNBLENBQUNWLFNBQVMsRUFBRTtJQUN0QixPQUFPSSxnQ0FBZ0MsQ0FBQ0osU0FBUyxFQUFFLE9BQU8sQ0FBQyxJQUFJQSxTQUFTLENBQUN3RyxLQUFLLENBQUMzRixNQUFNLEdBQUcsQ0FBQztFQUM3RjtFQUVBNEYsb0JBQW9CQSxDQUFDQyxhQUFhLEVBQUU7SUFDaEMsSUFBSTlCLEdBQUc7SUFFUCxJQUFJeEUsZ0NBQWdDLENBQUNzRyxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7TUFDN0Q5QixHQUFHLEdBQUd4QyxLQUFLLENBQUMsSUFBSSxDQUFDZ0MsaUJBQWlCLENBQUNzQyxhQUFhLENBQUNyQyxRQUFRLENBQUMsQ0FBQztJQUMvRCxDQUFDLE1BQU0sSUFBSWpFLGdDQUFnQyxDQUFDc0csYUFBYSxFQUFFLFlBQVksRUFBRSxvQkFBb0IsQ0FBQyxFQUFDO01BQzNGOUIsR0FBRyxHQUFHLElBQUksQ0FBQ3hCLGlDQUFpQyxDQUFDTiw4QkFBOEIsQ0FBQzRELGFBQWEsQ0FBQyxDQUFDO0lBQy9GLENBQUMsTUFBTSxJQUFJdEcsZ0NBQWdDLENBQUNzRyxhQUFhLEVBQUUsT0FBTyxDQUFDLEVBQUU7TUFDakU5QixHQUFHLEdBQUcsSUFBSSxDQUFDbEIsWUFBWSxDQUFDZ0QsYUFBYSxDQUFDakYsS0FBSyxDQUFDO0lBQ2hELENBQUMsTUFBTSxJQUFJckIsZ0NBQWdDLENBQUNzRyxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7TUFDcEU5QixHQUFHLEdBQUcsSUFBSSxDQUFDMEIsaUJBQWlCLENBQUNJLGFBQWEsQ0FBQ0gsUUFBUSxDQUFDO0lBQ3hELENBQUMsTUFBTSxJQUFJbkcsZ0NBQWdDLENBQUNzRyxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7TUFDcEU7SUFBQSxDQUNILE1BQU07TUFDSCxNQUFNLHlEQUF5RDtJQUNuRTtJQUVBLE9BQU85QixHQUFHO0VBQ2Q7RUFFQTBCLGlCQUFpQkEsQ0FBQ0ssU0FBUyxFQUFFQyxTQUFTLEdBQUcsR0FBRyxFQUFFO0lBQzFDLElBQUkvQyxJQUFJLEdBQUcsSUFBSSxDQUFDNEMsb0JBQW9CLENBQUNFLFNBQVMsQ0FBQzlDLElBQUksQ0FBQztJQUNwRCxJQUFJYixFQUFFLEdBQUdaLEtBQUssQ0FBQyxJQUFJLENBQUNrQyxpQkFBaUIsQ0FBQ3FDLFNBQVMsQ0FBQzNELEVBQUUsQ0FBQyxDQUFDO0lBQ3BELElBQUlnQixLQUFLLEdBQUcsSUFBSSxDQUFDeUMsb0JBQW9CLENBQUNFLFNBQVMsQ0FBQzNDLEtBQUssQ0FBQztJQUV0RCxPQUFPLENBQUNILElBQUksRUFBRWIsRUFBRSxFQUFFZ0IsS0FBSyxDQUFDLENBQUNuQyxJQUFJLENBQUMrRSxTQUFTLENBQUM7RUFDNUM7RUFFQUMsWUFBWUEsQ0FBQzdHLFNBQVMsRUFBRTtJQUNwQixJQUFJd0csS0FBSyxHQUFHLEVBQUU7SUFFZCxLQUFLLE1BQU0zRSxJQUFJLElBQUk3QixTQUFTLENBQUN3RyxLQUFLLEVBQUU7TUFDaEMsSUFBSU0sa0JBQWtCLEdBQUdsRSw0QkFBNEIsQ0FBQ2YsSUFBSSxDQUFDa0YsYUFBYSxDQUFDO01BQ3pFLElBQUlDLFdBQVcsR0FBRztRQUNkLE9BQU8sRUFBRSxNQUFNO1FBQ2YsV0FBVyxFQUFFLFVBQVU7UUFDdkIsWUFBWSxFQUFFO01BQ2xCLENBQUMsQ0FBQ0Ysa0JBQWtCLENBQUM7TUFDckIsSUFBSUMsYUFBYSxHQUFHakUsOEJBQThCLENBQUNqQixJQUFJLENBQUNrRixhQUFhLENBQUM7TUFDdEUsSUFBSXBFLGNBQWMsR0FBR0MsNEJBQTRCLENBQUNtRSxhQUFhLENBQUNFLEVBQUUsQ0FBQztNQUNuRSxJQUFJcEUsU0FBUyxHQUFHQyw4QkFBOEIsQ0FBQ2lFLGFBQWEsQ0FBQ0UsRUFBRSxDQUFDO01BQ2hFLElBQUkvRCxVQUFVLEdBQUcsSUFBSSxDQUFDSCxpQkFBaUIsQ0FBQ0osY0FBYyxFQUFFRSxTQUFTLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQztNQUU1RSxJQUFJekMsZ0NBQWdDLENBQUN5QixJQUFJLENBQUN4QixRQUFRLEVBQUUsU0FBUyxDQUFDLEVBQUU7UUFBRTtRQUM5RCxJQUFJNkcsYUFBYSxHQUFHLElBQUkxSCxTQUFTLENBQUNxQyxJQUFJLENBQUN4QixRQUFRLENBQUNrQyxPQUFPLENBQUNDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQzNDLEdBQUcsQ0FBQyxLQUFLLENBQUM7UUFDbEYsSUFBSXNILGVBQWUsR0FBR3RGLElBQUksQ0FBQ3hCLFFBQVEsQ0FBQ2tDLE9BQU8sQ0FBQ0osS0FBSyxDQUFDRCxJQUFJLENBQUNOLEtBQUs7UUFDNUQ0RSxLQUFLLENBQUNsRyxJQUFJLENBQUMwRyxXQUFXLEdBQUcsWUFBWSxHQUFHMUUsaUJBQWlCLENBQUM0RSxhQUFhLENBQUMsR0FBRyxRQUFRLEdBQzdFQyxlQUFlLEdBQUcsMEJBQTBCLEdBQzVDLFNBQVMsR0FBRzdFLGlCQUFpQixDQUFDWSxVQUFVLENBQUNyQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUMvRCxLQUFLLENBQUM7TUFDaEIsQ0FBQyxNQUFNLElBQUl6QixnQ0FBZ0MsQ0FBQ3lCLElBQUksQ0FBQ3hCLFFBQVEsRUFBRSxPQUFPLENBQUMsRUFBRTtRQUNqRSxJQUFJK0csWUFBWSxHQUFHLElBQUksQ0FBQ3RGLGdDQUFnQyxDQUFDRCxJQUFJLENBQUN4QixRQUFRLENBQUM7UUFFdkUsSUFBSTZDLFVBQVUsQ0FBQ3JDLE1BQU0sS0FBSyxDQUFDLEVBQUU7VUFDekIsSUFBSVQsZ0NBQWdDLENBQUMyRyxhQUFhLENBQUNFLEVBQUUsRUFBRSxVQUFVLENBQUMsRUFBRTtZQUNoRVQsS0FBSyxDQUFDbEcsSUFBSSxDQUFDMEcsV0FBVyxHQUFHLEdBQUcsR0FBR0ksWUFBWSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUNkLGlCQUFpQixDQUFDUyxhQUFhLENBQUNFLEVBQUUsQ0FBQ1YsUUFBUSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztVQUNySCxDQUFDLE1BQU0sSUFBSW5HLGdDQUFnQyxDQUFDMkcsYUFBYSxDQUFDRSxFQUFFLEVBQUUsUUFBUSxDQUFDLEVBQUM7WUFDcEUsSUFBSS9ELFVBQVUsR0FBRyxJQUFJLENBQUNILGlCQUFpQixDQUFDLFFBQVEsRUFBRWdFLGFBQWEsQ0FBQ0UsRUFBRSxDQUFDYixNQUFNLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQztZQUVwRkksS0FBSyxDQUFDbEcsSUFBSSxDQUFDNEMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1VBQzdCLENBQUMsTUFBTTtZQUNILE1BQU0sZ0NBQWdDO1VBQzFDO1FBQ0osQ0FBQyxNQUFNO1VBQ0hzRCxLQUFLLENBQUNsRyxJQUFJLENBQUMwRyxXQUFXLEdBQUcsR0FBRyxHQUFHSSxZQUFZLEdBQUcsR0FBRyxHQUMzQyx1QkFBdUIsR0FDdkIsU0FBUyxHQUFHOUUsaUJBQWlCLENBQUNZLFVBQVUsQ0FBQ3JCLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FDNUQsTUFDTixDQUFDO1FBQ0w7TUFDSixDQUFDLE1BQU07UUFDSCxNQUFNLDJDQUEyQztNQUNyRDtJQUNKO0lBRUEsT0FBTzJFLEtBQUs7RUFDaEI7RUFFQTdGLGtCQUFrQkEsQ0FBQ1gsU0FBUyxFQUFFO0lBQzFCLE9BQU8sSUFBSSxDQUFDNkcsWUFBWSxDQUFDN0csU0FBUyxDQUFDLENBQUM2QixJQUFJLENBQUMsTUFBTSxDQUFDO0VBQ3BEOztFQUVBO0FBQ0o7QUFDQTtBQUNBO0VBQ0lkLHVCQUF1QkEsQ0FBQ3NHLFVBQVUsRUFBRTtJQUNoQyxJQUFJQyxtQkFBbUIsR0FBRyxFQUFFO0lBRTVCLEtBQUssTUFBTXRILFNBQVMsSUFBSXFILFVBQVUsRUFBRTtNQUNoQyxJQUFJRSxjQUFjO01BRWxCLElBQUluSCxnQ0FBZ0MsQ0FBQ0osU0FBUyxDQUFDSyxRQUFRLEVBQUUsT0FBTyxDQUFDLEVBQUU7UUFDL0RrSCxjQUFjLEdBQUcsWUFBWSxHQUFHLElBQUksQ0FBQ3pGLGdDQUFnQyxDQUFDOUIsU0FBUyxDQUFDSyxRQUFRLENBQUM7TUFDN0YsQ0FBQyxNQUFNLElBQUlELGdDQUFnQyxDQUFDSixTQUFTLENBQUNLLFFBQVEsRUFBRSxTQUFTLENBQUMsRUFBRTtRQUN4RWtILGNBQWMsR0FBRyxJQUFJLENBQUMvRyxxQkFBcUIsQ0FBQyxjQUFjLEVBQUVSLFNBQVMsQ0FBQztNQUMxRSxDQUFDLE1BQU07UUFDSCxNQUFNLGlEQUFpRDtNQUMzRDtNQUVBc0gsbUJBQW1CLENBQUNoSCxJQUFJLENBQUNpSCxjQUFjLENBQUM7SUFDNUM7SUFFQSxPQUFPRCxtQkFBbUI7RUFDOUI7RUFFQWxHLHFCQUFxQkEsQ0FBQSxFQUFHO0lBQ3BCLElBQUlvRyxnQkFBZ0IsR0FBRyxFQUFFO0lBRXpCLEtBQUssTUFBTUMsYUFBYSxJQUFJLElBQUksQ0FBQy9ILEdBQUcsQ0FBQ08sSUFBSSxDQUFDQyxNQUFNLENBQUNpQixRQUFRLEVBQUU7TUFDdkQsSUFBSWYsZ0NBQWdDLENBQUNxSCxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7UUFDN0RELGdCQUFnQixDQUFDbEgsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM4RCxpQkFBaUIsQ0FBQ3FELGFBQWEsQ0FBQ3BELFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQztNQUM3RixDQUFDLE1BQU0sSUFBR2pFLGdDQUFnQyxDQUFDcUgsYUFBYSxFQUFFLFlBQVksRUFBRSxvQkFBb0IsQ0FBQyxFQUFFO1FBQzNGRCxnQkFBZ0IsQ0FBQ2xILElBQUksQ0FBQyxJQUFJLENBQUM4QyxpQ0FBaUMsQ0FBQ04sOEJBQThCLENBQUMyRSxhQUFhLENBQUMsQ0FBQyxDQUFDO01BQ2hILENBQUMsTUFBTSxJQUFJckgsZ0NBQWdDLENBQUNxSCxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FDdEUsQ0FBQyxNQUFNLElBQUlySCxnQ0FBZ0MsQ0FBQ3FILGFBQWEsRUFBRSxPQUFPLENBQUMsRUFBRTtRQUNqRUQsZ0JBQWdCLENBQUNsSCxJQUFJLENBQUMsSUFBSSxDQUFDb0QsWUFBWSxDQUFDK0QsYUFBYSxDQUFDaEcsS0FBSyxDQUFDLENBQUM7TUFDakUsQ0FBQyxNQUFNO1FBQ0gsTUFBTSx1Q0FBdUMsR0FBR21CLDRCQUE0QixDQUFDNkUsYUFBYSxDQUFDO01BQy9GO0lBQ0o7SUFFQSxPQUFPLFVBQVUsR0FBR0QsZ0JBQWdCLENBQUMzRixJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRztFQUN4RDtFQUVBUixvQkFBb0JBLENBQUEsRUFBRztJQUNuQixJQUFJc0YsU0FBUyxHQUFHN0QsOEJBQThCLENBQUMsSUFBSSxDQUFDcEQsR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ3dILE1BQU0sRUFBRSxVQUFVLENBQUM7SUFDdkYsSUFBSXpFLFdBQVcsR0FBRzdDLGdDQUFnQyxDQUFDdUcsU0FBUyxDQUFDOUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxHQUFHLFdBQVcsR0FBRyxRQUFRO0lBRXZHLE9BQU9aLFdBQVcsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDcUQsaUJBQWlCLENBQUNLLFNBQVMsRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHO0VBQzNFOztFQUVBO0FBQ0o7QUFDQTtFQUNJcEYscUJBQXFCQSxDQUFBLEVBQUc7SUFDcEIsSUFBSW9HLFNBQVMsR0FBRyxFQUFFO0lBRWxCLEtBQUssTUFBTUMsYUFBYSxJQUFJLElBQUksQ0FBQ2xJLEdBQUcsQ0FBQzRCLFFBQVEsRUFBRTtNQUMzQyxJQUFJbEIsZ0NBQWdDLENBQUN3SCxhQUFhLENBQUN0RSxJQUFJLEVBQUUsVUFBVSxDQUFDLEVBQUU7UUFDbEVxRSxTQUFTLENBQUNySCxJQUFJLENBQUMsYUFBYSxHQUFHOEIsS0FBSyxDQUFDLElBQUksQ0FBQ2tFLGlCQUFpQixDQUFDc0IsYUFBYSxDQUFDdEUsSUFBSSxDQUFDaUQsUUFBUSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7TUFDcEcsQ0FBQyxNQUFNLElBQUluRyxnQ0FBZ0MsQ0FBQ3dILGFBQWEsQ0FBQ3RFLElBQUksRUFBRSxZQUFZLEVBQUUsb0JBQW9CLENBQUMsRUFBRTtRQUNqR3FFLFNBQVMsQ0FBQ3JILElBQUksQ0FDVixVQUFVLEdBQ1YsSUFBSSxDQUFDOEMsaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDOEUsYUFBYSxDQUFDdEUsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQ2hHbEIsS0FBSyxDQUFDd0YsYUFBYSxDQUFDQyxHQUFHLEtBQUssS0FBSyxHQUFHLE1BQU0sR0FBRSxLQUFLLENBQUMsR0FBRyxHQUN6RCxDQUFDO01BQ0wsQ0FBQyxNQUFNLElBQUl6SCxnQ0FBZ0MsQ0FBQ3dILGFBQWEsQ0FBQ3RFLElBQUksRUFBRSxVQUFVLENBQUMsRUFBRTtRQUN6RXFFLFNBQVMsQ0FBQ3JILElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDOEQsaUJBQWlCLENBQUN3RCxhQUFhLENBQUN0RSxJQUFJLENBQUNlLFFBQVEsQ0FBQyxHQUFHLEdBQUcsSUFBSXVELGFBQWEsQ0FBQ0MsR0FBRyxLQUFLLEtBQUssR0FBRyxNQUFNLEdBQUUsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDO01BQ3JKLENBQUMsTUFBTTtRQUNILE1BQU0sdUNBQXVDLEdBQUdqRiw0QkFBNEIsQ0FBQ2dGLGFBQWEsQ0FBQ3RFLElBQUksQ0FBQztNQUNwRztJQUNKO0lBRUEsT0FBT3FFLFNBQVMsQ0FBQzlGLElBQUksQ0FBQyxNQUFNLENBQUM7RUFDakM7O0VBRUE7QUFDSjtBQUNBO0FBQ0E7RUFDSTZCLFlBQVlBLENBQUNvRSxTQUFTLEVBQUU7SUFDcEIsSUFBSUMsUUFBUSxDQUFDRCxTQUFTLENBQUMsSUFBSUEsU0FBUyxDQUFDcEQsV0FBVyxDQUFDLENBQUMsS0FBSyxNQUFNLEVBQUU7TUFDM0QsT0FBTyxNQUFNO0lBQ2pCO0lBRUEsSUFBSTlDLEtBQUssR0FBR2tCLDhCQUE4QixDQUFDZ0YsU0FBUyxDQUFDO0lBQ3JELElBQUlFLFVBQVUsR0FBR3BGLDRCQUE0QixDQUFDa0YsU0FBUyxDQUFDO0lBRXhELElBQUlFLFVBQVUsS0FBSyxvQkFBb0IsRUFBRTtNQUNyQyxPQUFPNUYsS0FBSyxDQUFDUixLQUFLLENBQUM7SUFDdkIsQ0FBQyxNQUFNLElBQUlvRyxVQUFVLEtBQUssUUFBUSxFQUFFO01BQ2hDLE9BQU9wRyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25CLENBQUMsTUFBTSxJQUFJb0csVUFBVSxLQUFLLG9CQUFvQixJQUFJQSxVQUFVLEtBQUssWUFBWSxFQUFFO01BQzNFLE9BQU8sSUFBSSxDQUFDNUUsaUNBQWlDLENBQUN4QixLQUFLLENBQUM7SUFDeEQsQ0FBQyxNQUFNLElBQUlvRyxVQUFVLEtBQUssU0FBUyxFQUFFO01BQ25DLE9BQU9wRyxLQUFLO0lBQ2QsQ0FBQyxNQUFNO01BQ0gsTUFBTSx3Q0FBd0MsR0FBR29HLFVBQVU7SUFDL0Q7RUFDSjtFQUVBOUMsa0JBQWtCQSxDQUFDK0MsbUJBQW1CLEVBQUU7SUFDcEMsSUFBSTdILGdDQUFnQyxDQUFDLElBQUksQ0FBQ1IsbUJBQW1CLEVBQUVxSSxtQkFBbUIsQ0FBQyxFQUFFO01BQ2pGLE9BQU8sSUFBSSxDQUFDckksbUJBQW1CLENBQUNxSSxtQkFBbUIsQ0FBQztJQUN4RCxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUN0SSxNQUFNLElBQUksSUFBSSxFQUFFO01BQzVCLE9BQU8sSUFBSSxDQUFDQSxNQUFNLENBQUN1RixrQkFBa0IsQ0FBQytDLG1CQUFtQixDQUFDO0lBQzlEO0lBRUEsT0FBT0EsbUJBQW1CO0VBQzlCOztFQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSTdFLGlDQUFpQ0EsQ0FBQzhFLFVBQVUsRUFBRXhDLFVBQVUsR0FBRyxJQUFJLEVBQUU7SUFDN0QsSUFBSXlDLE1BQU0sR0FBRyxDQUFDRCxVQUFVLENBQUMsQ0FBQ0UsSUFBSSxDQUFDLENBQUMsQ0FBQzVFLEdBQUcsQ0FBRUMsQ0FBQyxJQUFLQSxDQUFDLENBQUM3QixLQUFLLENBQUM7SUFDcEQsSUFBSXFHLG1CQUFtQixHQUFHRSxNQUFNLENBQUMsQ0FBQyxDQUFDOztJQUVuQztJQUNBQSxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDakQsa0JBQWtCLENBQUMrQyxtQkFBbUIsQ0FBQztJQUV4RCxJQUFJckQsR0FBRyxHQUFHdUQsTUFBTSxDQUFDdEcsSUFBSSxDQUFDLEdBQUcsQ0FBQztJQUUxQixJQUFJNkQsVUFBVSxFQUFFO01BQ1pkLEdBQUcsR0FBR3hDLEtBQUssQ0FBQ3dDLEdBQUcsQ0FBQztJQUNwQjtJQUVBLE9BQU9BLEdBQUc7RUFDZDtBQUNKOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU1UsTUFBTUEsQ0FBQ3pDLFNBQVMsRUFBRXdGLEdBQUcsRUFBRTtFQUM1QixJQUFJLENBQUN4RixTQUFTLEVBQUU7SUFDWixNQUFNd0YsR0FBRztFQUNiO0FBQ0o7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVNqSSxnQ0FBZ0NBLENBQUNrSSxHQUFHLEVBQUUsR0FBR0MsY0FBYyxFQUFFO0VBQzlELE9BQU9BLGNBQWMsQ0FBQ0MsTUFBTSxDQUFDLENBQUNDLEtBQUssRUFBRUMsYUFBYSxLQUFLRCxLQUFLLElBQUtILEdBQUcsQ0FBQ0ssY0FBYyxDQUFDRCxhQUFhLENBQUMsSUFBSUosR0FBRyxDQUFDSSxhQUFhLENBQUMsS0FBSyxJQUFLLEVBQUUsS0FBSyxDQUFDO0FBQzlJOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU1gsUUFBUUEsQ0FBQ25HLEtBQUssRUFBRTtFQUNyQixPQUFRLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssWUFBWWdILE1BQU07QUFDaEU7QUFFQSxTQUFTakUscUJBQXFCQSxDQUFDa0UsTUFBTSxFQUFFO0VBQ25DLE9BQU9BLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDQyxXQUFXLENBQUMsQ0FBQyxHQUFHRixNQUFNLENBQUNqSSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzNEOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU3dCLEtBQUtBLENBQUNSLEtBQUssRUFBRTtFQUNsQixPQUFPLEdBQUcsR0FBR0EsS0FBSyxHQUFHLEdBQUc7QUFDNUI7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTb0gsT0FBT0EsQ0FBQ3BILEtBQUssRUFBRTtFQUNwQixPQUFPQSxLQUFLLENBQUNhLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO0FBQ3RDOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU0csNEJBQTRCQSxDQUFDMEYsR0FBRyxFQUFFO0VBQ3ZDLElBQUlsRCxNQUFNLENBQUNDLElBQUksQ0FBQ2lELEdBQUcsQ0FBQyxDQUFDekgsTUFBTSxLQUFLLENBQUMsRUFBRTtJQUMvQixNQUFNLHNFQUFzRSxHQUFHb0ksSUFBSSxDQUFDQyxTQUFTLENBQUNaLEdBQUcsQ0FBQztFQUN0RztFQUVBLE9BQU9sRCxNQUFNLENBQUNDLElBQUksQ0FBQ2lELEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM5Qjs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVN4Riw4QkFBOEJBLENBQUN3RixHQUFHLEVBQUU7RUFDekMsT0FBT0EsR0FBRyxDQUFDMUYsNEJBQTRCLENBQUMwRixHQUFHLENBQUMsQ0FBQztBQUNqRDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVMvQyxpQkFBaUJBLENBQUMzRCxLQUFLLEVBQUU7RUFDOUIsT0FBTyxPQUFPQSxLQUFLLEtBQUssV0FBVyxJQUFJQSxLQUFLLEtBQUssSUFBSTtBQUN6RDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVNVLGlCQUFpQkEsQ0FBQzZHLEdBQUcsRUFBRUMsU0FBUyxHQUFHLENBQUMsRUFBRTtFQUMzQyxJQUFJeEMsU0FBUyxHQUFHLElBQUk7RUFFcEIsS0FBSyxJQUFJbkQsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHMkYsU0FBUyxFQUFFM0YsQ0FBQyxFQUFFLEVBQUU7SUFDaENtRCxTQUFTLEdBQUdBLFNBQVMsR0FBRyxJQUFJO0VBQ2hDO0VBRUEsT0FBT3VDLEdBQUcsQ0FBQ0UsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDeEgsSUFBSSxDQUFDK0UsU0FBUyxDQUFDO0FBQzFDLEM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDOW5CQTtBQUMwRztBQUNqQjtBQUNPO0FBQ2hHLDRDQUE0Qyx5ZEFBa2E7QUFDOWMsOEJBQThCLG1GQUEyQixDQUFDLDRGQUFxQztBQUMvRix5Q0FBeUMsc0ZBQStCO0FBQ3hFO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLG1DQUFtQztBQUN2RDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSxRQUFRO0FBQ1IsUUFBUTtBQUNSLFFBQVE7QUFDUixRQUFROztBQUVSLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTtBQUNSLFFBQVE7O0FBRVIsZUFBZTtBQUNmLGNBQWM7QUFDZCxPQUFPLHdGQUF3RixNQUFNLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxZQUFZLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxhQUFhLGFBQWEsT0FBTyxZQUFZLE1BQU0sWUFBWSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsWUFBWSxXQUFXLFVBQVUsVUFBVSxVQUFVLFlBQVksV0FBVyxNQUFNLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLE9BQU8sWUFBWSxNQUFNLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsV0FBVyxZQUFZLGFBQWEsV0FBVyxZQUFZLGFBQWEsYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxXQUFXLE1BQU0sS0FBSyxVQUFVLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFlBQVksT0FBTyxZQUFZLE1BQU0sVUFBVSxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsV0FBVyxZQUFZLE9BQU8sS0FBSyxZQUFZLE9BQU8sWUFBWSxNQUFNLFVBQVUsWUFBWSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsVUFBVSxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxXQUFXLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxVQUFVLFlBQVksYUFBYSxhQUFhLE9BQU8sS0FBSyxVQUFVLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFVBQVUsWUFBWSxhQUFhLGFBQWEsYUFBYSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsV0FBVyxVQUFVLFlBQVksV0FBVyxNQUFNLEtBQUssWUFBWSxXQUFXLFlBQVksYUFBYSxhQUFhLE9BQU8sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLFlBQVksTUFBTSxVQUFVLFVBQVUsVUFBVSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsV0FBVyxVQUFVLFVBQVUsWUFBWSxhQUFhLGFBQWEsV0FBVyxZQUFZLGFBQWEsT0FBTyxLQUFLLFVBQVUsWUFBWSxXQUFXLFVBQVUsVUFBVSxVQUFVLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsVUFBVSxNQUFNLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxLQUFLLFlBQVksYUFBYSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLGFBQWEsT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLE1BQU0sS0FBSyxVQUFVLFlBQVksV0FBVyxVQUFVLFVBQVUsVUFBVSxZQUFZLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssS0FBSyxZQUFZLE1BQU0sS0FBSyxZQUFZLE1BQU0sTUFBTSxZQUFZLE1BQU0sVUFBVSxZQUFZLFdBQVcsWUFBWSxhQUFhLE9BQU8sS0FBSyxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxhQUFhLE9BQU8sS0FBSyxVQUFVLFVBQVUsWUFBWSxhQUFhLFdBQVcsVUFBVSxZQUFZLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxPQUFPLFVBQVUsS0FBSyxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxNQUFNLEtBQUssVUFBVSxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksT0FBTyxVQUFVLEtBQUssS0FBSyxVQUFVLFlBQVksTUFBTSxLQUFLLFVBQVUsWUFBWSxNQUFNLE1BQU0sS0FBSyxZQUFZLE9BQU8sWUFBWSxNQUFNLFlBQVksYUFBYSxhQUFhLFdBQVcsWUFBWSxXQUFXLFlBQVksT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLE9BQU8sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLFlBQVksTUFBTSxLQUFLLFlBQVksV0FBVyxNQUFNLEtBQUssWUFBWSxNQUFNLE1BQU0sS0FBSyxLQUFLLFlBQVksT0FBTyxLQUFLLFVBQVUsT0FBTyxLQUFLLFVBQVUsT0FBTyxLQUFLLFlBQVksT0FBTyxLQUFLLFVBQVUsWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLE9BQU8sS0FBSyxZQUFZLE1BQU0sTUFBTSxZQUFZLE1BQU0sWUFBWSxXQUFXLFlBQVksT0FBTyxLQUFLLFlBQVksT0FBTyxZQUFZLHVCQUF1Qix1QkFBdUIsdUJBQXVCLHdCQUF3Qix1QkFBdUIsdUJBQXVCLHVC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QyxDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUN2SWpGLE1BQStGO0FBQy9GLE1BQXFGO0FBQ3JGLE1BQTRGO0FBQzVGLE1BQStHO0FBQy9HLE1BQXdHO0FBQ3hHLE1BQXdHO0FBQ3hHLE1BQW1HO0FBQ25HO0FBQ0E7O0FBRUE7O0FBRUEsNEJBQTRCLHFHQUFtQjtBQUMvQyx3QkFBd0Isa0hBQWE7QUFDckMsaUJBQWlCLHVHQUFhO0FBQzlCLGlCQUFpQiwrRkFBTTtBQUN2Qiw2QkFBNkIsc0dBQWtCOztBQUUvQyxhQUFhLDBHQUFHLENBQUMsc0ZBQU87Ozs7QUFJNkM7QUFDckUsT0FBTyxpRUFBZSxzRkFBTyxJQUFJLHNGQUFPLFVBQVUsc0ZBQU8sbUJBQW1CLEVBQUMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9zcWwyYnVpbGRlci5naXRodWIuaW8vLi9zcmMvY29udmVydGVyLmpzIiwid2VicGFjazovL3NxbDJidWlsZGVyLmdpdGh1Yi5pby8uL3NyYy9zdHlsZS5jc3MiLCJ3ZWJwYWNrOi8vc3FsMmJ1aWxkZXIuZ2l0aHViLmlvLy4vc3JjL2luZGV4LmpzIiwid2VicGFjazovL3NxbDJidWlsZGVyLmdpdGh1Yi5pby8uL3NyYy9zdHlsZS5jc3M/NzE2MyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgY2xhc3MgQ29udmVydGVyXG57XG4gICAgY29uc3RydWN0b3IoYXN0LCBwYXJlbnQgPSBudWxsKSB7XG4gICAgICAgIHRoaXMuYXN0ID0gYXN0O1xuICAgICAgICB0aGlzLnRhYmxlX25hbWVfYnlfYWxpYXMgPSB7fTtcbiAgICAgICAgdGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG4gICAgfVxuXG4gICAgcnVuKG5lZWRfYXBwZW5kX2dldF9zdWZmaXggPSB0cnVlKSB7XG4gICAgICAgIGxldCBzZWN0aW9ucyA9IFtdXG5cbiAgICAgICAgbGV0IGZyb21faXRlbSA9IHRoaXMuYXN0LmJvZHkuU2VsZWN0LmZyb21bMF07XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbS5yZWxhdGlvbiwgJ1RhYmxlJykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlTWFpblRhYmxlU2VjdGlvbihmcm9tX2l0ZW0pKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0ucmVsYXRpb24sICdEZXJpdmVkJykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlRnJvbVN1YlNlY3Rpb24oJ0RCOjpxdWVyeSgpLT5mcm9tU3ViJyksIGZyb21faXRlbSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCByZWxhdGlvbiB0eXBlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBqb2luX3NlY3Rpb24gPSAnJztcblxuICAgICAgICAvLyBSZXNvbHZlICdqb2luJyBzZWN0aW9uIGJlZm9yZSAnd2hlcmUnIHNlY3Rpb24sIGJlY2F1c2UgbmVlZCBmaW5kIGpvaW5lZCB0YWJsZSBhbGlhc1xuICAgICAgICBpZiAodGhpcy5oYXNKb2luU2VjdGlvbihmcm9tX2l0ZW0pKSB7XG4gICAgICAgICAgICBqb2luX3NlY3Rpb24gPSB0aGlzLnJlc29sdmVKb2luU2VjdGlvbihmcm9tX2l0ZW0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSGFzIGNyb3NzIGpvaW5cbiAgICAgICAgaWYgKHRoaXMuYXN0LmJvZHkuU2VsZWN0LmZyb20uc2xpY2UoMSkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc2VjdGlvbnMgPSBzZWN0aW9ucy5jb25jYXQodGhpcy5yZXNvbHZlQ3Jvc3NKb2luU2VjdGlvbih0aGlzLmFzdC5ib2R5LlNlbGVjdC5mcm9tLnNsaWNlKDEpKSk7XG4gICAgICAgIH1cblxuICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZVNlbGVjdFNlY3Rpb24oKSlcblxuICAgICAgICBpZiAoam9pbl9zZWN0aW9uICE9PSAnJykge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaChqb2luX3NlY3Rpb24pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LmJvZHkuU2VsZWN0LCAnc2VsZWN0aW9uJykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlV2hlcmVTZWN0aW9uKHRoaXMuYXN0LmJvZHkuU2VsZWN0LnNlbGVjdGlvbikpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LmJvZHkuU2VsZWN0LCAnZ3JvdXBfYnknKSAmJiB0aGlzLmFzdC5ib2R5LlNlbGVjdC5ncm91cF9ieS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZUdyb3VwQnlTZWN0aW9uKCkpO1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QuYm9keS5TZWxlY3QsICdoYXZpbmcnKSkge1xuICAgICAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlSGF2aW5nU2VjdGlvbigpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdCwgJ29yZGVyX2J5JykgJiYgdGhpcy5hc3Qub3JkZXJfYnkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVPcmRlckJ5U2VjdGlvbigpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdCwgJ2xpbWl0JykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2goJ2xpbWl0KCcgKyB0aGlzLmFzdC5saW1pdC5WYWx1ZS5OdW1iZXJbMF0gKyAnKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LCAnb2Zmc2V0JykpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2goJ29mZnNldCgnICsgdGhpcy5hc3Qub2Zmc2V0LnZhbHVlLlZhbHVlLk51bWJlclswXSArICcpJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobmVlZF9hcHBlbmRfZ2V0X3N1ZmZpeCkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCgnZ2V0KCk7Jyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2VjdGlvbnMuam9pbignXFxuLT4nKTtcbiAgICB9XG5cbiAgICByZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZShyZWxhdGlvbl9ub2RlKSB7XG4gICAgICAgICAgICBsZXQgdGFibGVfbmFtZSA9IHJlbGF0aW9uX25vZGUuVGFibGUubmFtZVswXS52YWx1ZTtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHJlbGF0aW9uX25vZGUuVGFibGUsICdhbGlhcycpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50YWJsZV9uYW1lX2J5X2FsaWFzW3JlbGF0aW9uX25vZGUuVGFibGUuYWxpYXMubmFtZS52YWx1ZV0gPSB0YWJsZV9uYW1lO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcXVvdGUodGFibGVfbmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVNYWluVGFibGVTZWN0aW9uKGZyb21faXRlbSkge1xuICAgICAgICByZXR1cm4gJ0RCOjp0YWJsZSgnICsgdGhpcy5yZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZShmcm9tX2l0ZW0ucmVsYXRpb24pICsgJyknO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlRnJvbVN1YlNlY3Rpb24ocHJlZml4LCBmcm9tX2l0ZW0pIHtcbiAgICAgICAgcmV0dXJuIHByZWZpeCArICcoZnVuY3Rpb24gKCRxdWVyeSkge1xcbidcbiAgICAgICAgICAgICsgJ1xcdCcgKyBhZGRUYWJUb0V2ZXJ5TGluZSgobmV3IENvbnZlcnRlcihmcm9tX2l0ZW0ucmVsYXRpb24uRGVyaXZlZC5zdWJxdWVyeSwgdGhpcykucnVuKGZhbHNlKSkucmVwbGFjZSgnREI6OnRhYmxlJywgJyRxdWVyeS0+ZnJvbScpLCAyKSArICc7XFxuJ1xuICAgICAgICAgICAgKyAnfSwnICsgcXVvdGUoZnJvbV9pdGVtLnJlbGF0aW9uLkRlcml2ZWQuYWxpYXMubmFtZS52YWx1ZSkgKyAnKSc7XG4gICAgfVxuXG4gICAgcmVzb2x2ZVdoZXJlU2VjdGlvbihzZWxlY3Rpb25fbm9kZSkge1xuICAgICAgICBsZXQgY29uZGl0aW9uX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KHNlbGVjdGlvbl9ub2RlKTtcbiAgICAgICAgbGV0IGNvbmRpdGlvbiA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChzZWxlY3Rpb25fbm9kZSk7XG5cbiAgICAgICAgcmV0dXJuIHRoaXMucHJlcGFyZUNvbmRpdGlvbnMoY29uZGl0aW9uX3R5cGUsIGNvbmRpdGlvbiwgJycsICd3aGVyZScpLmpvaW4oJ1xcbi0+Jyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGNvbmRpdGlvbl90eXBlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGNvbmRpdGlvblxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcCBvbmUgb2YgWycnLCAnQW5kJywgJ09yJ11cbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gbWV0aG9kX25hbWVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmdbXX1cbiAgICAgKi9cbiAgICBwcmVwYXJlQ29uZGl0aW9ucyhjb25kaXRpb25fdHlwZSwgY29uZGl0aW9uLCBvcCwgbWV0aG9kX25hbWUpIHtcbiAgICAgICAgbGV0IGNvbmRpdGlvbnMgPSBbXTtcblxuICAgICAgICBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdJc051bGwnIHx8IGNvbmRpdGlvbl90eXBlID09PSAnSXNOb3ROdWxsJykge1xuICAgICAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gY29uZGl0aW9uX3R5cGUgPT09ICdJc051bGwnID8gJ3doZXJlTnVsbCcgOiAnd2hlcmVOb3ROdWxsJztcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKCcgKyB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uKSkgKyAnKScpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnSW5MaXN0Jykge1xuICAgICAgICAgICAgbGV0IGNvbHVtbiA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24uZXhwcikpO1xuICAgICAgICAgICAgbGV0IGxpc3QgPSBjb25kaXRpb24ubGlzdC5tYXAoKGkpID0+IHRoaXMucmVzb2x2ZVZhbHVlKGkuVmFsdWUpKTtcblxuICAgICAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gY29uZGl0aW9uLm5lZ2F0ZWQgPyAnd2hlcmVOb3RJbicgOiAnd2hlcmVJbic7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJygnICsgY29sdW1uICsgJywnICsgJ1snICsgbGlzdC5qb2luKCcsICcpICsgJ10pJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdOZXN0ZWQnKSB7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2goXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJyhmdW5jdGlvbiAoJHF1ZXJ5KSB7XFxuJ1xuICAgICAgICAgICAgICAgICsgJ1xcdCRxdWVyeS0+JyArICBhZGRUYWJUb0V2ZXJ5TGluZSh0aGlzLnJlc29sdmVXaGVyZVNlY3Rpb24oY29uZGl0aW9uKSwgMikgKyAnO1xcbn0pJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0JpbmFyeU9wJykge1xuICAgICAgICAgICAgaWYgKGNvbmRpdGlvbi5vcCA9PT0gJ0FuZCcgfHwgY29uZGl0aW9uLm9wID09PSAnT3InKSB7XG4gICAgICAgICAgICAgICAgbGV0IGxlZnRfY29uZGl0aW9uX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGNvbmRpdGlvbi5sZWZ0KTtcbiAgICAgICAgICAgICAgICBsZXQgbGVmdF9jb25kaXRpb24gPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmxlZnQpO1xuICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMgPSBjb25kaXRpb25zLmNvbmNhdCh0aGlzLnByZXBhcmVDb25kaXRpb25zKGxlZnRfY29uZGl0aW9uX3R5cGUsIGxlZnRfY29uZGl0aW9uLCBvcCwgbWV0aG9kX25hbWUpKTtcblxuICAgICAgICAgICAgICAgIGxldCByaWdodF9jb25kaXRpb25fdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoY29uZGl0aW9uLnJpZ2h0KTtcbiAgICAgICAgICAgICAgICBsZXQgcmlnaHRfY29uZGl0aW9uID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5yaWdodCk7XG4gICAgICAgICAgICAgICAgY29uZGl0aW9ucyA9IGNvbmRpdGlvbnMuY29uY2F0KHRoaXMucHJlcGFyZUNvbmRpdGlvbnMocmlnaHRfY29uZGl0aW9uX3R5cGUsIHJpZ2h0X2NvbmRpdGlvbiwgY29uZGl0aW9uLm9wLCBtZXRob2RfbmFtZSkpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxldCBsZWZ0ID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5sZWZ0KSk7XG4gICAgICAgICAgICAgICAgbGV0IHJpZ2h0O1xuXG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGNvbmRpdGlvbi5yaWdodCwgJ0lkZW50aWZpZXInLCAnQ29tcG91bmRJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLnJpZ2h0KSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG1ldGhvZF9uYW1lLmluY2x1ZGVzKCd3aGVyZScpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByaWdodCA9ICdEQjo6cmF3KCcgKyByaWdodCArICcpJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoY29uZGl0aW9uLnJpZ2h0LCAnVmFsdWUnKSkge1xuICAgICAgICAgICAgICAgICAgICBtZXRob2RfbmFtZSA9ICd3aGVyZSc7XG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gdGhpcy5yZXNvbHZlVmFsdWUoY29uZGl0aW9uLnJpZ2h0LlZhbHVlKVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoY29uZGl0aW9uLnJpZ2h0LCAnU3VicXVlcnknKSkge1xuICAgICAgICAgICAgICAgICAgICByaWdodCA9ICdmdW5jdGlvbigkcXVlcnkpIHtcXG4nXG4gICAgICAgICAgICAgICAgICAgICAgICArICdcXHQnICsgYWRkVGFiVG9FdmVyeUxpbmUoKG5ldyBDb252ZXJ0ZXIoY29uZGl0aW9uLnJpZ2h0LlN1YnF1ZXJ5LCB0aGlzKS5ydW4oZmFsc2UpKS5yZXBsYWNlKCdEQjo6dGFibGUnLCAnJHF1ZXJ5LT5mcm9tJyksIDIpICsgJztcXG4nXG4gICAgICAgICAgICAgICAgICAgICAgICArICd9J1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoY29uZGl0aW9uLnJpZ2h0LCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgICAgICByaWdodCA9ICdEQjo6cmF3KCcgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGNvbmRpdGlvbi5yaWdodC5GdW5jdGlvbikgKyAnKSc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgY29uZGl0aW9uLnJpZ2h0IHR5cGU6JyArIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoY29uZGl0aW9uLnJpZ2h0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJygnICsgbGVmdCArICcsJyArIHF1b3RlKHRoaXMudHJhbnNmb3JtQmluYXJ5T3AoY29uZGl0aW9uLm9wKSkgKyAnLCcgKyByaWdodCArICcpJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdFeGlzdHMnKSB7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2goXG4gICAgICAgICAgICAgICAgdGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgJ3doZXJlRXhpc3RzJykgKyAnKGZ1bmN0aW9uICgkcXVlcnkpIHtcXG4nICtcbiAgICAgICAgICAgICAgICAnXFx0JyArICBhZGRUYWJUb0V2ZXJ5TGluZSgobmV3IENvbnZlcnRlcihjb25kaXRpb24sIHRoaXMpKS5ydW4oZmFsc2UpLCAyKS5yZXBsYWNlKCdEQjo6dGFibGUnLCAnJHF1ZXJ5LT5mcm9tJykgKyAnO1xcbicgK1xuICAgICAgICAgICAgICAgICd9J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0JldHdlZW4nKSB7XG4gICAgICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBjb25kaXRpb24ubmVnYXRlZCA9PT0gdHJ1ZSA/ICd3aGVyZU5vdEJldHdlZW4nIDogJ3doZXJlQmV0d2Vlbic7XG5cbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaChcbiAgICAgICAgICAgICAgdGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJygnXG4gICAgICAgICAgICAgICsgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSkgKyAnLCdcbiAgICAgICAgICAgICAgKyAnWycgKyB0aGlzLnJlc29sdmVWYWx1ZShjb25kaXRpb24ubG93LlZhbHVlKSArICcsJyArIHRoaXMucmVzb2x2ZVZhbHVlKGNvbmRpdGlvbi5oaWdoLlZhbHVlKSArICddKSdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdJblN1YnF1ZXJ5Jykge1xuICAgICAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gY29uZGl0aW9uLm5lZ2F0ZWQgPT09IHRydWUgPyAnd2hlcmVOb3RJbicgOiAnd2hlcmVJbic7XG5cbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaChcbiAgICAgICAgICAgICAgdGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpXG4gICAgICAgICAgICAgICsgJygnICsgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSkgKyAnLCcgKyAnKGZ1bmN0aW9uICgkcXVlcnkpIHtcXG4nXG4gICAgICAgICAgICAgICsgJ1xcdCcgKyBhZGRUYWJUb0V2ZXJ5TGluZSgobmV3IENvbnZlcnRlcihjb25kaXRpb24uc3VicXVlcnksIHRoaXMpKS5ydW4oZmFsc2UpLCAyKS5yZXBsYWNlKCdEQjo6dGFibGUnLCAnJHF1ZXJ5LT5mcm9tJykgKyAnO1xcbidcbiAgICAgICAgICAgICAgKyAnfSdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdGdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKERCOjpyYXcoXCInICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShjb25kaXRpb24sIGZhbHNlKSArICdcIikpJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdVbmFyeU9wJykge1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMucHJlcGFyZUNvbmRpdGlvbnMoZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChjb25kaXRpb24uZXhwciksIGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24uZXhwciksIG9wLCBtZXRob2RfbmFtZSlbMF0ucmVwbGFjZSgvd2hlcmUvaSwgJ3doZXJlJyArIGNvbmRpdGlvbi5vcCkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgY29uZGl0aW9uIHR5cGUgWycgKyBjb25kaXRpb25fdHlwZSArICddJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjb25kaXRpb25zO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBvcFxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICB0cmFuc2Zvcm1CaW5hcnlPcChvcCkge1xuICAgICAgICBsZXQgb3BlcmF0b3JfYnlfb3AgPSB7XG4gICAgICAgICAgICAnRXEnOiAnPScsXG4gICAgICAgICAgICAnR3QnOiAnPicsXG4gICAgICAgICAgICAnR3RFcSc6ICc+PScsXG4gICAgICAgICAgICAnTHQnOiAnPCcsXG4gICAgICAgICAgICAnTHRFcSc6ICc8JyxcbiAgICAgICAgICAgICdOb3RFcSc6ICchPScsXG4gICAgICAgICAgICAnTGlrZSc6ICdsaWtlJyxcbiAgICAgICAgICAgICdNaW51cyc6ICctJyxcbiAgICAgICAgICAgICdQbHVzJzogJysnLFxuICAgICAgICAgICAgJ011bHRpcGx5JzogJyonLFxuICAgICAgICAgICAgJ0RpdmlkZSc6ICcvJ1xuICAgICAgICB9O1xuXG4gICAgICAgIHJldHVybiBvcGVyYXRvcl9ieV9vcFtvcF07XG4gICAgfVxuXG4gICAgYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSB7XG4gICAgICAgIGlmIChvcCA9PT0gJycgfHwgb3AgPT09ICdBbmQnKSB7XG4gICAgICAgICAgICByZXR1cm4gbWV0aG9kX25hbWU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3AudG9Mb3dlckNhc2UoKSArIGNhcGl0YWxpemVGaXJzdExldHRlcihtZXRob2RfbmFtZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVTZWxlY3RTZWN0aW9uKCkge1xuICAgICAgICBsZXQgcmVzID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBzZWxlY3RfaXRlbSBvZiB0aGlzLmFzdC5ib2R5LlNlbGVjdC5wcm9qZWN0aW9uKSB7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoc2VsZWN0X2l0ZW0sICdFeHByV2l0aEFsaWFzJykpIHtcbiAgICAgICAgICAgICAgICBsZXQgYWxpYXMgPSBzZWxlY3RfaXRlbS5FeHByV2l0aEFsaWFzLmFsaWFzLnZhbHVlO1xuICAgICAgICAgICAgICAgIHJlcy5wdXNoKHRoaXMucmVzb2x2ZVNlbGVjdFNlY3Rpb25JdGVtKHNlbGVjdF9pdGVtLkV4cHJXaXRoQWxpYXMuZXhwciwgYWxpYXMpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoc2VsZWN0X2l0ZW0sICdVbm5hbWVkRXhwcicpKSB7XG4gICAgICAgICAgICAgICAgcmVzLnB1c2godGhpcy5yZXNvbHZlU2VsZWN0U2VjdGlvbkl0ZW0oc2VsZWN0X2l0ZW0uVW5uYW1lZEV4cHIpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2VsZWN0X2l0ZW0gPT09ICdXaWxkY2FyZCcpIHtcbiAgICAgICAgICAgICAgICByZXMucHVzaChxdW90ZSgnKicpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoc2VsZWN0X2l0ZW0sICdRdWFsaWZpZWRXaWxkY2FyZCcpKSB7XG4gICAgICAgICAgICAgICAgcmVzLnB1c2gocXVvdGUodGhpcy5nZXRBY3R1YWxUYWJsZU5hbWUoc2VsZWN0X2l0ZW0uUXVhbGlmaWVkV2lsZGNhcmRbMF0udmFsdWUpICsgJy4qJykpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIHNlbGVjdCBpdGVtIFsnICsgT2JqZWN0LmtleXMoc2VsZWN0X2l0ZW0pWzBdICsgJ10nO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICdzZWxlY3QoJyArIHJlcy5qb2luKCcsICcpICsgJyknO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBzZWxlY3RfaXRlbVxuICAgICAqIEBwYXJhbSBhbGlhc1xuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlU2VsZWN0U2VjdGlvbkl0ZW0oc2VsZWN0X2l0ZW0sIGFsaWFzID0gbnVsbCkge1xuICAgICAgICBhc3NlcnQoaXNVbmRlZmluZWRPck51bGwoc2VsZWN0X2l0ZW0pID09PSBmYWxzZSwgJ3NlbGVjdF9pdGVtIG11c3Qgbm90IGJlIHVuZGVmaW5lZCBvciBudWxsJyk7XG5cbiAgICAgICAgbGV0IGl0ZW07XG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChzZWxlY3RfaXRlbSwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIGl0ZW0gPSAnREI6OnJhdyhcIicgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKHNlbGVjdF9pdGVtLkZ1bmN0aW9uKTtcblxuICAgICAgICAgICAgaWYgKGFsaWFzICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaXRlbSA9IGl0ZW0gKyAnIGFzICcgKyBhbGlhcyArICdcIiknO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaXRlbTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGl0ZW0gPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qoc2VsZWN0X2l0ZW0pLCBmYWxzZSk7XG5cbiAgICAgICAgICAgIGlmIChhbGlhcyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGl0ZW0gPSBpdGVtICsgJyBhcyAnICsgYWxpYXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBxdW90ZShpdGVtKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHBhcnNlRnVuY3Rpb25Ob2RlKGZ1bmN0aW9uX25vZGUsIG5lZWRfcXVvdGUgPSB0cnVlKSB7XG4gICAgICAgIGxldCBmdW5jdGlvbl9uYW1lID0gZnVuY3Rpb25fbm9kZS5uYW1lWzBdLnZhbHVlO1xuXG4gICAgICAgIGlmIChuZWVkX3F1b3RlKSB7XG4gICAgICAgICAgICBmdW5jdGlvbl9uYW1lID0gcXVvdGUoZnVuY3Rpb25fbmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgcmVzID0gZnVuY3Rpb25fbmFtZSArICcoJztcbiAgICAgICAgbGV0IGFyZ3MgPSBmdW5jdGlvbl9ub2RlLmFyZ3M7XG4gICAgICAgIGxldCBhcmdfY291bnQgPSBhcmdzLmxlbmd0aDtcblxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGFyZ19jb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgYXJnID0gYXJnc1tpXTtcblxuICAgICAgICAgICAgaWYgKGFyZy5Vbm5hbWVkID09PSAnV2lsZGNhcmQnKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgJyonO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnVmFsdWUnKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIHRoaXMucmVzb2x2ZVZhbHVlKGFyZy5Vbm5hbWVkLkV4cHIuVmFsdWUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgYXJnLlVubmFtZWQuRXhwci5JZGVudGlmaWVyLnZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnQ29tcG91bmRJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihhcmcuVW5uYW1lZC5FeHByLkNvbXBvdW5kSWRlbnRpZmllcik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdOZXN0ZWQnKSkgeyAvLyBlLmcuIENPVU5UKERJU1RJTkNUKCdpZCcpKVxuICAgICAgICAgICAgICAgIGxldCBhcmdfY29sdW1uID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGFyZy5Vbm5hbWVkLkV4cHIuTmVzdGVkKSk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZnVuY3Rpb25fbm9kZS5kaXN0aW5jdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICAgICAgICBhcmdfY29sdW1uID0gJ0RJU1RJTkNUKCcgKyBhcmdfY29sdW1uICsgJyknO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIGFyZ19jb2x1bW47XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShhcmcuVW5uYW1lZC5FeHByLkZ1bmN0aW9uLCBmYWxzZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdCaW5hcnlPcCcpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgdGhpcy5wYXJzZUJpbmFyeU9wTm9kZShhcmcuVW5uYW1lZC5FeHByLkJpbmFyeU9wKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ1VuYXJ5T3AnKSkge1xuICAgICAgICAgICAgICAgIC8vIHRvZG9cbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0Nhc2UnKSkge1xuICAgICAgICAgICAgICAgIC8vIHRvZG9cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgYXJnIHR5cGU6JyArIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoYXJnLlVubmFtZWQuRXhwcik7XG4gICAgICAgICAgICB9XG5cblxuICAgICAgICAgICAgaWYgKGkgIT09IGFyZ19jb3VudCAtIDEpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyAnLCAnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmVzID0gcmVzICsgJyknO1xuXG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBoYXNKb2luU2VjdGlvbihmcm9tX2l0ZW0pIHtcbiAgICAgICAgcmV0dXJuIHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbSwgJ2pvaW5zJykgJiYgZnJvbV9pdGVtLmpvaW5zLmxlbmd0aCA+IDA7XG4gICAgfVxuXG4gICAgcGFyc2VCaW5hcnlPcFBhcnRpYWwobGVmdF9vcl9yaWdodCkge1xuICAgICAgICBsZXQgcmVzO1xuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgcmVzID0gcXVvdGUodGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShsZWZ0X29yX3JpZ2h0LkZ1bmN0aW9uKSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ0lkZW50aWZpZXInLCAnQ29tcG91bmRJZGVudGlmaWVyJykpe1xuICAgICAgICAgICAgcmVzID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGxlZnRfb3JfcmlnaHQpKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnVmFsdWUnKSkge1xuICAgICAgICAgICAgcmVzID0gdGhpcy5yZXNvbHZlVmFsdWUobGVmdF9vcl9yaWdodC5WYWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ0JpbmFyeU9wJykpIHtcbiAgICAgICAgICAgIHJlcyA9IHRoaXMucGFyc2VCaW5hcnlPcE5vZGUobGVmdF9vcl9yaWdodC5CaW5hcnlPcCk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ1N1YnF1ZXJ5JykpIHtcbiAgICAgICAgICAgIC8vIHRvZG9cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIHR5cGUgaW4gYmluYXJ5IG9wIGxlZnQgb3IgcmlnaHQuJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfVxuXG4gICAgcGFyc2VCaW5hcnlPcE5vZGUoYmluYXJ5X29wLCBzZXBhcmF0b3IgPSAnICcpIHtcbiAgICAgICAgbGV0IGxlZnQgPSB0aGlzLnBhcnNlQmluYXJ5T3BQYXJ0aWFsKGJpbmFyeV9vcC5sZWZ0KTtcbiAgICAgICAgbGV0IG9wID0gcXVvdGUodGhpcy50cmFuc2Zvcm1CaW5hcnlPcChiaW5hcnlfb3Aub3ApKTtcbiAgICAgICAgbGV0IHJpZ2h0ID0gdGhpcy5wYXJzZUJpbmFyeU9wUGFydGlhbChiaW5hcnlfb3AucmlnaHQpO1xuXG4gICAgICAgIHJldHVybiBbbGVmdCwgb3AsIHJpZ2h0XS5qb2luKHNlcGFyYXRvcik7XG4gICAgfVxuXG4gICAgcHJlcGFyZUpvaW5zKGZyb21faXRlbSkge1xuICAgICAgICBsZXQgam9pbnMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGpvaW4gb2YgZnJvbV9pdGVtLmpvaW5zKSB7XG4gICAgICAgICAgICBsZXQgam9pbl9vcGVyYXRvcl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChqb2luLmpvaW5fb3BlcmF0b3IpO1xuICAgICAgICAgICAgbGV0IGpvaW5fbWV0aG9kID0ge1xuICAgICAgICAgICAgICAgICdJbm5lcic6ICdqb2luJyxcbiAgICAgICAgICAgICAgICAnTGVmdE91dGVyJzogJ2xlZnRKb2luJyxcbiAgICAgICAgICAgICAgICAnUmlnaHRPdXRlcic6ICdyaWdodEpvaW4nLFxuICAgICAgICAgICAgfVtqb2luX29wZXJhdG9yX3R5cGVdO1xuICAgICAgICAgICAgbGV0IGpvaW5fb3BlcmF0b3IgPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qoam9pbi5qb2luX29wZXJhdG9yKTtcbiAgICAgICAgICAgIGxldCBjb25kaXRpb25fdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qoam9pbl9vcGVyYXRvci5Pbik7XG4gICAgICAgICAgICBsZXQgY29uZGl0aW9uID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGpvaW5fb3BlcmF0b3IuT24pO1xuICAgICAgICAgICAgbGV0IGNvbmRpdGlvbnMgPSB0aGlzLnByZXBhcmVDb25kaXRpb25zKGNvbmRpdGlvbl90eXBlLCBjb25kaXRpb24sICcnLCAnb24nKTtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGpvaW4ucmVsYXRpb24sICdEZXJpdmVkJykpIHsgLy8gam9pbmVkIHNlY3Rpb24gaXMgc3ViLXF1ZXJ5XG4gICAgICAgICAgICAgICAgbGV0IHN1Yl9xdWVyeV9zcWwgPSBuZXcgQ29udmVydGVyKGpvaW4ucmVsYXRpb24uRGVyaXZlZC5zdWJxdWVyeSwgdGhpcykucnVuKGZhbHNlKTtcbiAgICAgICAgICAgICAgICBsZXQgc3ViX3F1ZXJ5X2FsaWFzID0gam9pbi5yZWxhdGlvbi5EZXJpdmVkLmFsaWFzLm5hbWUudmFsdWU7XG4gICAgICAgICAgICAgICAgam9pbnMucHVzaChqb2luX21ldGhvZCArICcoREI6OnJhdyhcIicgKyBhZGRUYWJUb0V2ZXJ5TGluZShzdWJfcXVlcnlfc3FsKSArICdcIikgYXMgJ1xuICAgICAgICAgICAgICAgICAgICArIHN1Yl9xdWVyeV9hbGlhcyArICcpLCBmdW5jdGlvbigkam9pbikge1xcblxcdCdcbiAgICAgICAgICAgICAgICAgICAgKyAnJGpvaW4tPicgKyBhZGRUYWJUb0V2ZXJ5TGluZShjb25kaXRpb25zLmpvaW4oJ1xcbi0+JykgKyAnOycsIDIpXG4gICAgICAgICAgICAgICAgICAgICsgJ1xcbn0nKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoam9pbi5yZWxhdGlvbiwgJ1RhYmxlJykpIHtcbiAgICAgICAgICAgICAgICBsZXQgam9pbmVkX3RhYmxlID0gdGhpcy5yZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZShqb2luLnJlbGF0aW9uKTtcblxuICAgICAgICAgICAgICAgIGlmIChjb25kaXRpb25zLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoam9pbl9vcGVyYXRvci5PbiwgJ0JpbmFyeU9wJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGpvaW5zLnB1c2goam9pbl9tZXRob2QgKyAnKCcgKyBqb2luZWRfdGFibGUgKyAnLCcgKyB0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKGpvaW5fb3BlcmF0b3IuT24uQmluYXJ5T3AsICcsJykgKyAnKScpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGpvaW5fb3BlcmF0b3IuT24sICdOZXN0ZWQnKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgY29uZGl0aW9ucyA9IHRoaXMucHJlcGFyZUNvbmRpdGlvbnMoJ05lc3RlZCcsIGpvaW5fb3BlcmF0b3IuT24uTmVzdGVkLCAnJywgJ29uJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGpvaW5zLnB1c2goY29uZGl0aW9uc1swXSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBvbiB0eXBlJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGpvaW5zLnB1c2goam9pbl9tZXRob2QgKyAnKCcgKyBqb2luZWRfdGFibGUgKyAnLCdcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJ2Z1bmN0aW9uKCRqb2luKSB7XFxuXFx0J1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnJGpvaW4tPicgKyBhZGRUYWJUb0V2ZXJ5TGluZShjb25kaXRpb25zLmpvaW4oJ1xcbi0+JykpICsgJzsnXG4gICAgICAgICAgICAgICAgICAgICAgICArICdcXG59KSdcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGpvaW4gcmVsYXRpb24gdHlwZSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gam9pbnM7XG4gICAgfVxuXG4gICAgcmVzb2x2ZUpvaW5TZWN0aW9uKGZyb21faXRlbSkge1xuICAgICAgICByZXR1cm4gdGhpcy5wcmVwYXJlSm9pbnMoZnJvbV9pdGVtKS5qb2luKCdcXG4tPicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBmcm9tX2l0ZW1zXG4gICAgICogQHJldHVybiB7c3RyaW5nW119XG4gICAgICovXG4gICAgcmVzb2x2ZUNyb3NzSm9pblNlY3Rpb24oZnJvbV9pdGVtcykge1xuICAgICAgICBsZXQgY3Jvc3Nfam9pbl9zZWN0aW9ucyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgZnJvbV9pdGVtIG9mIGZyb21faXRlbXMpIHtcbiAgICAgICAgICAgIGxldCBjcm9zc19qb2luX3N0cjtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbS5yZWxhdGlvbiwgJ1RhYmxlJykpIHtcbiAgICAgICAgICAgICAgICBjcm9zc19qb2luX3N0ciA9ICdjcm9zc0pvaW4oJyArIHRoaXMucmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUoZnJvbV9pdGVtLnJlbGF0aW9uKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLnJlbGF0aW9uLCAnRGVyaXZlZCcpKSB7XG4gICAgICAgICAgICAgICAgY3Jvc3Nfam9pbl9zdHIgPSB0aGlzLnJlc29sdmVGcm9tU3ViU2VjdGlvbignY3Jvc3NKb2luU3ViJywgZnJvbV9pdGVtKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgY3Jvc3Mgam9pbiByZWxhdGlvbiB0eXBlJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY3Jvc3Nfam9pbl9zZWN0aW9ucy5wdXNoKGNyb3NzX2pvaW5fc3RyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBjcm9zc19qb2luX3NlY3Rpb25zO1xuICAgIH1cblxuICAgIHJlc29sdmVHcm91cEJ5U2VjdGlvbigpIHtcbiAgICAgICAgbGV0IGdyb3VwX2J5X2NvbHVtbnMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGdyb3VwX2J5X2l0ZW0gb2YgdGhpcy5hc3QuYm9keS5TZWxlY3QuZ3JvdXBfYnkpIHtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChncm91cF9ieV9pdGVtLCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgIGdyb3VwX2J5X2NvbHVtbnMucHVzaCgnREI6OnJhdygnICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShncm91cF9ieV9pdGVtLkZ1bmN0aW9uKSArICdcIiknKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZihwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChncm91cF9ieV9pdGVtLCAnSWRlbnRpZmllcicsICdDb21wb3VuZElkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgIGdyb3VwX2J5X2NvbHVtbnMucHVzaCh0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoZ3JvdXBfYnlfaXRlbSkpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZ3JvdXBfYnlfaXRlbSwgJ05lc3RlZCcpKSB7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGdyb3VwX2J5X2l0ZW0sICdWYWx1ZScpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBfYnlfY29sdW1ucy5wdXNoKHRoaXMucmVzb2x2ZVZhbHVlKGdyb3VwX2J5X2l0ZW0uVmFsdWUpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgZ3JvdXAgYnkgdHlwZTonICsgZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChncm91cF9ieV9pdGVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAnZ3JvdXBCeSgnICsgZ3JvdXBfYnlfY29sdW1ucy5qb2luKCcsJykgKyAnKSc7XG4gICAgfVxuXG4gICAgcmVzb2x2ZUhhdmluZ1NlY3Rpb24oKSB7XG4gICAgICAgIGxldCBiaW5hcnlfb3AgPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QodGhpcy5hc3QuYm9keS5TZWxlY3QuaGF2aW5nLCAnQmluYXJ5T3AnKTtcbiAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gcHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYmluYXJ5X29wLmxlZnQsICdGdW5jdGlvbicpID8gJ2hhdmluZ1JhdycgOiAnaGF2aW5nJztcblxuICAgICAgICByZXR1cm4gbWV0aG9kX25hbWUgKyAnKCcgKyB0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKGJpbmFyeV9vcCwgJywnKSArICcpJztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVPcmRlckJ5U2VjdGlvbigpIHtcbiAgICAgICAgbGV0IG9yZGVyX2J5cyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3Qgb3JkZXJfYnlfaXRlbSBvZiB0aGlzLmFzdC5vcmRlcl9ieSkge1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKG9yZGVyX2J5X2l0ZW0uZXhwciwgJ0JpbmFyeU9wJykpIHtcbiAgICAgICAgICAgICAgICBvcmRlcl9ieXMucHVzaCgnb3JkZXJCeVJhdygnICsgcXVvdGUodGhpcy5wYXJzZUJpbmFyeU9wTm9kZShvcmRlcl9ieV9pdGVtLmV4cHIuQmluYXJ5T3ApKSArICcpJyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKG9yZGVyX2J5X2l0ZW0uZXhwciwgJ0lkZW50aWZpZXInLCAnQ29tcG91bmRJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICBvcmRlcl9ieXMucHVzaChcbiAgICAgICAgICAgICAgICAgICAgJ29yZGVyQnkoJyArXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChvcmRlcl9ieV9pdGVtLmV4cHIpKSArICcsJyArXG4gICAgICAgICAgICAgICAgICAgIHF1b3RlKG9yZGVyX2J5X2l0ZW0uYXNjID09PSBmYWxzZSA/ICdkZXNjJzogJ2FzYycpICsgJyknXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwob3JkZXJfYnlfaXRlbS5leHByLCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgIG9yZGVyX2J5cy5wdXNoKCdvcmRlckJ5UmF3KFwiJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUob3JkZXJfYnlfaXRlbS5leHByLkZ1bmN0aW9uKSArICcgJyArIChvcmRlcl9ieV9pdGVtLmFzYyA9PT0gZmFsc2UgPyAnZGVzYyc6ICdhc2MnKSArICdcIiknKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgb3JkZXIgYnkgdHlwZTonICsgZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChvcmRlcl9ieV9pdGVtLmV4cHIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9yZGVyX2J5cy5qb2luKCdcXG4tPicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB2YWx1ZU5vZGVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd8Kn1cbiAgICAgKi9cbiAgICByZXNvbHZlVmFsdWUodmFsdWVOb2RlKSB7XG4gICAgICAgIGlmIChpc1N0cmluZyh2YWx1ZU5vZGUpICYmIHZhbHVlTm9kZS50b0xvd2VyQ2FzZSgpID09PSAnbnVsbCcpIHtcbiAgICAgICAgICAgIHJldHVybiAnbnVsbCc7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdmFsdWUgPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QodmFsdWVOb2RlKTtcbiAgICAgICAgbGV0IHZhbHVlX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KHZhbHVlTm9kZSk7XG5cbiAgICAgICAgaWYgKHZhbHVlX3R5cGUgPT09ICdTaW5nbGVRdW90ZWRTdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gcXVvdGUodmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlX3R5cGUgPT09ICdOdW1iZXInKSB7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWVbMF07XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVfdHlwZSA9PT0gJ0NvbXBvdW5kSWRlbnRpZmllcicgfHwgdmFsdWVfdHlwZSA9PT0gJ0lkZW50aWZpZXInKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4odmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlX3R5cGUgPT09ICdCb29sZWFuJykge1xuICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGFyZyB2YWx1ZSB0eXBlOicgKyB2YWx1ZV90eXBlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZ2V0QWN0dWFsVGFibGVOYW1lKHRhYmxlX25hbWVfb3JfYWxpYXMpIHtcbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMudGFibGVfbmFtZV9ieV9hbGlhcywgdGFibGVfbmFtZV9vcl9hbGlhcykpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRhYmxlX25hbWVfYnlfYWxpYXNbdGFibGVfbmFtZV9vcl9hbGlhc107XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wYXJlbnQgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50LmdldEFjdHVhbFRhYmxlTmFtZSh0YWJsZV9uYW1lX29yX2FsaWFzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0YWJsZV9uYW1lX29yX2FsaWFzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSBpZGVudGlmaWVyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBuZWVkX3F1b3RlXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihpZGVudGlmaWVyLCBuZWVkX3F1b3RlID0gdHJ1ZSkge1xuICAgICAgICBsZXQgdmFsdWVzID0gW2lkZW50aWZpZXJdLmZsYXQoKS5tYXAoKGkpID0+IGkudmFsdWUpO1xuICAgICAgICBsZXQgdGFibGVfbmFtZV9vcl9hbGlhcyA9IHZhbHVlc1swXTtcblxuICAgICAgICAvLyBGaXJzdCBpbmRleCBhbHdheXMgaXMgdGFibGUgbmFtZSBvciBhbGlhcywgY2hhbmdlIGl0IHRvIGFjdHVhbCB0YWJsZSBuYW1lLlxuICAgICAgICB2YWx1ZXNbMF0gPSB0aGlzLmdldEFjdHVhbFRhYmxlTmFtZSh0YWJsZV9uYW1lX29yX2FsaWFzKTtcblxuICAgICAgICBsZXQgcmVzID0gdmFsdWVzLmpvaW4oJy4nKTtcblxuICAgICAgICBpZiAobmVlZF9xdW90ZSkge1xuICAgICAgICAgICAgcmVzID0gcXVvdGUocmVzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfVxufVxuXG4vKipcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gY29uZGl0aW9uXG4gKiBAcGFyYW0ge3N0cmluZ30gbXNnXG4gKi9cbmZ1bmN0aW9uIGFzc2VydChjb25kaXRpb24sIG1zZykge1xuICAgIGlmICghY29uZGl0aW9uKSB7XG4gICAgICAgIHRocm93IG1zZztcbiAgICB9XG59XG5cbi8qKlxuICogQHBhcmFtIG9ialxuICogQHBhcmFtIHByb3BlcnR5X25hbWVzXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5mdW5jdGlvbiBwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChvYmosIC4uLnByb3BlcnR5X25hbWVzKSB7XG4gICAgcmV0dXJuIHByb3BlcnR5X25hbWVzLnJlZHVjZSgoY2FycnksIHByb3BlcnR5X25hbWUpID0+IGNhcnJ5IHx8IChvYmouaGFzT3duUHJvcGVydHkocHJvcGVydHlfbmFtZSkgJiYgb2JqW3Byb3BlcnR5X25hbWVdICE9PSBudWxsKSwgZmFsc2UpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZnVuY3Rpb24gaXNTdHJpbmcodmFsdWUpIHtcbiAgICByZXR1cm4gIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBTdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGNhcGl0YWxpemVGaXJzdExldHRlcihzdHJpbmcpIHtcbiAgICByZXR1cm4gc3RyaW5nLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgc3RyaW5nLnNsaWNlKDEpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiBxdW90ZSh2YWx1ZSkge1xuICAgIHJldHVybiBcIidcIiArIHZhbHVlICsgXCInXCI7XG59XG5cbi8qKlxuICogQHBhcmFtIHZhbHVlXG4gKiBAcmV0dXJucyB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiB1bnF1b3RlKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnJlcGxhY2UoL1snXCJdKy9nLCAnJyk7XG59XG5cbi8qKlxuICogQHBhcmFtIG9ialxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5mdW5jdGlvbiBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KG9iaikge1xuICAgIGlmIChPYmplY3Qua2V5cyhvYmopLmxlbmd0aCAhPT0gMSkge1xuICAgICAgICB0aHJvdyAnVGhlIGZ1bmN0aW9uIGNhbiBvbmx5IGJlIGNhbGxlZCBvbiBvYmplY3QgdGhhdCBoYXMgb25lIGtleSwgb2JqZWN0OiAnICsgSlNPTi5zdHJpbmdpZnkob2JqKTtcbiAgICB9XG5cbiAgICByZXR1cm4gT2JqZWN0LmtleXMob2JqKVswXTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gb2JqXG4gKiBAcmV0dXJuIHsqfVxuICovXG5mdW5jdGlvbiBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qob2JqKSB7XG4gICAgcmV0dXJuIG9ialtnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KG9iaildO1xufVxuXG4vKipcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZnVuY3Rpb24gaXNVbmRlZmluZWRPck51bGwodmFsdWUpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJyB8fCB2YWx1ZSA9PT0gbnVsbDtcbn1cblxuLyoqXG4gKiBAcGFyYW0gc3RyXG4gKiBAcGFyYW0gdGFiX2NvdW50XG4gKi9cbmZ1bmN0aW9uIGFkZFRhYlRvRXZlcnlMaW5lKHN0ciwgdGFiX2NvdW50ID0gMSkge1xuICAgIGxldCBzZXBhcmF0b3IgPSAnXFxuJztcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGFiX2NvdW50OyBpKyspIHtcbiAgICAgICAgc2VwYXJhdG9yID0gc2VwYXJhdG9yICsgJ1xcdCc7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN0ci5zcGxpdCgnXFxuJykuam9pbihzZXBhcmF0b3IpO1xufVxuXG4iLCIvLyBJbXBvcnRzXG5pbXBvcnQgX19fQ1NTX0xPQURFUl9BUElfU09VUkNFTUFQX0lNUE9SVF9fXyBmcm9tIFwiLi4vbm9kZV9tb2R1bGVzL2Nzcy1sb2FkZXIvZGlzdC9ydW50aW1lL3NvdXJjZU1hcHMuanNcIjtcbmltcG9ydCBfX19DU1NfTE9BREVSX0FQSV9JTVBPUlRfX18gZnJvbSBcIi4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvcnVudGltZS9hcGkuanNcIjtcbmltcG9ydCBfX19DU1NfTE9BREVSX0dFVF9VUkxfSU1QT1JUX19fIGZyb20gXCIuLi9ub2RlX21vZHVsZXMvY3NzLWxvYWRlci9kaXN0L3J1bnRpbWUvZ2V0VXJsLmpzXCI7XG52YXIgX19fQ1NTX0xPQURFUl9VUkxfSU1QT1JUXzBfX18gPSBuZXcgVVJMKFwiZGF0YTppbWFnZS9zdmcreG1sLCUzQ3N2ZyB3aWR0aD0lMjc2MCUyNyBoZWlnaHQ9JTI3NjAlMjcgdmlld0JveD0lMjcwIDAgNjAgNjAlMjcgeG1sbnM9JTI3aHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmclMjclM0UlM0NnIGZpbGw9JTI3bm9uZSUyNyBmaWxsLXJ1bGU9JTI3ZXZlbm9kZCUyNyUzRSUzQ2cgZmlsbD0lMjclMjNmZmZmZmYlMjcgZmlsbC1vcGFjaXR5PSUyNzAuMDUlMjclM0UlM0NwYXRoIGQ9JTI3TTM2IDM0di00aC0ydjRoLTR2Mmg0djRoMnYtNGg0di0yaC00em0wLTMwVjBoLTJ2NGgtNHYyaDR2NGgyVjZoNFY0aC00ek02IDM0di00SDR2NEgwdjJoNHY0aDJ2LTRoNHYtMkg2ek02IDRWMEg0djRIMHYyaDR2NGgyVjZoNFY0SDZ6JTI3LyUzRSUzQy9nJTNFJTNDL2clM0UlM0Mvc3ZnJTNFXCIsIGltcG9ydC5tZXRhLnVybCk7XG52YXIgX19fQ1NTX0xPQURFUl9FWFBPUlRfX18gPSBfX19DU1NfTE9BREVSX0FQSV9JTVBPUlRfX18oX19fQ1NTX0xPQURFUl9BUElfU09VUkNFTUFQX0lNUE9SVF9fXyk7XG52YXIgX19fQ1NTX0xPQURFUl9VUkxfUkVQTEFDRU1FTlRfMF9fXyA9IF9fX0NTU19MT0FERVJfR0VUX1VSTF9JTVBPUlRfX18oX19fQ1NTX0xPQURFUl9VUkxfSU1QT1JUXzBfX18pO1xuLy8gTW9kdWxlXG5fX19DU1NfTE9BREVSX0VYUE9SVF9fXy5wdXNoKFttb2R1bGUuaWQsIGAvKiBNb2Rlcm4gU1FMIHRvIExhcmF2ZWwgQnVpbGRlciAtIEN1c3RvbSBTdHlsZXMgKi9cblxuOnJvb3Qge1xuICAtLXByaW1hcnktZ3JhZGllbnQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM2NjdlZWEgMCUsICM3NjRiYTIgMTAwJSk7XG4gIC0tc2Vjb25kYXJ5LWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZjA5M2ZiIDAlLCAjZjU1NzZjIDEwMCUpO1xuICAtLXN1Y2Nlc3MtZ3JhZGllbnQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM0ZmFjZmUgMCUsICMwMGYyZmUgMTAwJSk7XG4gIC0tZGFyay1iZzogIzFhMWEyZTtcbiAgLS1jYXJkLWJnOiAjZmZmZmZmO1xuICAtLXRleHQtcHJpbWFyeTogIzJkMzc0ODtcbiAgLS10ZXh0LXNlY29uZGFyeTogIzcxODA5NjtcbiAgLS1ib3JkZXItY29sb3I6ICNlMmU4ZjA7XG4gIC0tc2hhZG93LXNtOiAwIDJweCA0cHggcmdiYSgwLCAwLCAwLCAwLjA1KTtcbiAgLS1zaGFkb3ctbWQ6IDAgNHB4IDZweCByZ2JhKDAsIDAsIDAsIDAuMDcpO1xuICAtLXNoYWRvdy1sZzogMCAxMHB4IDI1cHggcmdiYSgwLCAwLCAwLCAwLjEpO1xuICAtLXNoYWRvdy14bDogMCAyMHB4IDQwcHggcmdiYSgwLCAwLCAwLCAwLjE1KTtcbiAgLS1yYWRpdXMtc206IDhweDtcbiAgLS1yYWRpdXMtbWQ6IDEycHg7XG4gIC0tcmFkaXVzLWxnOiAxNnB4O1xufVxuXG4qIHtcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcbn1cblxuYm9keSB7XG4gIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICdTZWdvZSBVSScsICdSb2JvdG8nLCAnT3h5Z2VuJywgJ1VidW50dScsICdDYW50YXJlbGwnLCAnRmlyYSBTYW5zJywgJ0Ryb2lkIFNhbnMnLCAnSGVsdmV0aWNhIE5ldWUnLCBzYW5zLXNlcmlmO1xuICAtd2Via2l0LWZvbnQtc21vb3RoaW5nOiBhbnRpYWxpYXNlZDtcbiAgLW1vei1vc3gtZm9udC1zbW9vdGhpbmc6IGdyYXlzY2FsZTtcbiAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2Y1ZjdmYSAwJSwgI2MzY2ZlMiAxMDAlKTtcbiAgbWluLWhlaWdodDogMTAwdmg7XG59XG5cbi8qIEhlcm8gU2VjdGlvbiBSZWRlc2lnbiAqL1xuLmhlcm8uaXMtcHJpbWFyeSB7XG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIG92ZXJmbG93OiBoaWRkZW47XG59XG5cbi5oZXJvLmlzLXByaW1hcnk6OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICcnO1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogMDtcbiAgbGVmdDogMDtcbiAgcmlnaHQ6IDA7XG4gIGJvdHRvbTogMDtcbiAgYmFja2dyb3VuZDogdXJsKCR7X19fQ1NTX0xPQURFUl9VUkxfUkVQTEFDRU1FTlRfMF9fX30pO1xuICBvcGFjaXR5OiAwLjM7XG59XG5cbi5oZXJvLWJvZHkge1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIHotaW5kZXg6IDE7XG4gIHBhZGRpbmc6IDNyZW0gMS41cmVtO1xufVxuXG4uaGVybyAudGl0bGUge1xuICBmb250LXNpemU6IDIuNXJlbTtcbiAgZm9udC13ZWlnaHQ6IDgwMDtcbiAgdGV4dC1zaGFkb3c6IDAgMnB4IDEwcHggcmdiYSgwLCAwLCAwLCAwLjEpO1xuICBsZXR0ZXItc3BhY2luZzogLTAuNXB4O1xufVxuXG4uaGVybyAuc3VidGl0bGUge1xuICBmb250LXNpemU6IDEuMjVyZW07XG4gIG9wYWNpdHk6IDAuOTU7XG4gIG1hcmdpbi10b3A6IDFyZW07XG59XG5cbi8qIE5hdmlnYXRpb24vSGVhZGVyICovXG4ubmF2LWhlYWRlciB7XG4gIHBhZGRpbmc6IDFyZW0gMnJlbTtcbiAgZGlzcGxheTogZmxleDtcbiAganVzdGlmeS1jb250ZW50OiBzcGFjZS1iZXR3ZWVuO1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXNtKTtcbn1cblxuLmdpdGh1Yi1saW5rIHtcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGdhcDogMC41cmVtO1xuICBwYWRkaW5nOiAwLjc1cmVtIDEuNXJlbTtcbiAgYmFja2dyb3VuZDogdmFyKC0tZGFyay1iZyk7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBmb250LXdlaWdodDogNjAwO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uZ2l0aHViLWxpbms6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTJweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG4gIGNvbG9yOiB3aGl0ZTtcbn1cblxuLmdpdGh1Yi1saW5rOjpiZWZvcmUge1xuICBjb250ZW50OiAn4piFJztcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xufVxuXG4vKiBNYWluIENvbnRlbnQgQXJlYSAqL1xuLmNvbnRlbnQtd3JhcHBlciB7XG4gIG1heC13aWR0aDogMTQwMHB4O1xuICBtYXJnaW46IDAgYXV0bztcbiAgcGFkZGluZzogMnJlbSAxcmVtO1xufVxuXG4vKiBDb252ZXJ0ZXIgR3JpZCAtIFNpZGUgYnkgU2lkZSBMYXlvdXQgKi9cbi5jb252ZXJ0ZXItZ3JpZCB7XG4gIGRpc3BsYXk6IGdyaWQ7XG4gIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyIDFmcjtcbiAgZ2FwOiAycmVtO1xuICBtYXJnaW4tYm90dG9tOiAycmVtO1xufVxuXG4uY29udmVydGVyLWNhcmQge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLWxnKTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LXhsKTtcbiAgcGFkZGluZzogMi41cmVtO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xufVxuXG4uY29udmVydGVyLWNhcmQ6aG92ZXIge1xuICBib3gtc2hhZG93OiAwIDI1cHggNTBweCByZ2JhKDAsIDAsIDAsIDAuMik7XG59XG5cbi8qIFNlY3Rpb24gSGVhZGVycyAqL1xuLnNlY3Rpb24taGVhZGVyIHtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjc1cmVtO1xuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xuICBmb250LXNpemU6IDEuMjVyZW07XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xufVxuXG4uc2VjdGlvbi1pY29uIHtcbiAgd2lkdGg6IDQwcHg7XG4gIGhlaWdodDogNDBweDtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIGZvbnQtc2l6ZTogMS4yNXJlbTtcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcbn1cblxuLyogVGV4dGFyZWEgUmVkZXNpZ24gKi9cbi50ZXh0YXJlYS13cmFwcGVyIHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICBtYXJnaW4tYm90dG9tOiAxLjVyZW07XG59XG5cbi50ZXh0YXJlYSB7XG4gIGJvcmRlcjogMnB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XG4gIHBhZGRpbmc6IDEuMjVyZW07XG4gIGZvbnQtc2l6ZTogMXJlbTtcbiAgZm9udC1mYW1pbHk6ICdNb25hY28nLCAnTWVubG8nLCAnVWJ1bnR1IE1vbm8nLCAnQ29uc29sYXMnLCAnc291cmNlLWNvZGUtcHJvJywgbW9ub3NwYWNlO1xuICBsaW5lLWhlaWdodDogMS42O1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xuICByZXNpemU6IHZlcnRpY2FsO1xuICBtaW4taGVpZ2h0OiAyMDBweDtcbiAgYmFja2dyb3VuZDogI2Y4ZmFmYztcbn1cblxuLnRleHRhcmVhOmZvY3VzIHtcbiAgb3V0bGluZTogbm9uZTtcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xuICBib3gtc2hhZG93OiAwIDAgMCAzcHggcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbn1cblxuLnRleHRhcmVhOjpwbGFjZWhvbGRlciB7XG4gIGNvbG9yOiAjYTBhZWMwO1xuICBmb250LXN0eWxlOiBpdGFsaWM7XG59XG5cbi8qIENvcHkgQnV0dG9uICovXG4uY29weS1idXR0b24ge1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogMC43NXJlbTtcbiAgcmlnaHQ6IDAuNzVyZW07XG4gIHBhZGRpbmc6IDAuNXJlbSAxcmVtO1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgY3Vyc29yOiBwb2ludGVyO1xuICBmb250LXNpemU6IDAuODc1cmVtO1xuICBmb250LXdlaWdodDogNjAwO1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4ycyBlYXNlO1xuICB6LWluZGV4OiAxMDtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjVyZW07XG59XG5cbi5jb3B5LWJ1dHRvbjpob3ZlciB7XG4gIGJhY2tncm91bmQ6ICM2NjdlZWE7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG59XG5cbi5jb3B5LWJ1dHRvbi5jb3BpZWQge1xuICBiYWNrZ3JvdW5kOiAjNDhiYjc4O1xuICBjb2xvcjogd2hpdGU7XG4gIGJvcmRlci1jb2xvcjogIzQ4YmI3ODtcbn1cblxuLyogQnV0dG9uIENvbnRyb2xzICovXG4uYnV0dG9uLWNvbnRyb2xzIHtcbiAgZGlzcGxheTogZmxleDtcbiAgZ2FwOiAxcmVtO1xuICBmbGV4LXdyYXA6IHdyYXA7XG59XG5cbi5idXR0b24ge1xuICBwYWRkaW5nOiAwLjg3NXJlbSAycmVtO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBmb250LXdlaWdodDogNzAwO1xuICBmb250LXNpemU6IDFyZW07XG4gIGJvcmRlcjogbm9uZTtcbiAgY3Vyc29yOiBwb2ludGVyO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xuICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjVyZW07XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcbn1cblxuLmJ1dHRvbjo6YmVmb3JlIHtcbiAgY29udGVudDogJyc7XG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgdG9wOiA1MCU7XG4gIGxlZnQ6IDUwJTtcbiAgd2lkdGg6IDA7XG4gIGhlaWdodDogMDtcbiAgYm9yZGVyLXJhZGl1czogNTAlO1xuICBiYWNrZ3JvdW5kOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuMyk7XG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlKC01MCUsIC01MCUpO1xuICB0cmFuc2l0aW9uOiB3aWR0aCAwLjZzLCBoZWlnaHQgMC42cztcbn1cblxuLmJ1dHRvbjpob3Zlcjo6YmVmb3JlIHtcbiAgd2lkdGg6IDMwMHB4O1xuICBoZWlnaHQ6IDMwMHB4O1xufVxuXG4uYnV0dG9uLmlzLXByaW1hcnkge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgY29sb3I6IHdoaXRlO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uYnV0dG9uLmlzLXByaW1hcnk6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTJweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG59XG5cbi5idXR0b24uaXMtc2Vjb25kYXJ5IHtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG4gIGNvbG9yOiAjNjY3ZWVhO1xuICBib3JkZXI6IDJweCBzb2xpZCAjNjY3ZWVhO1xufVxuXG4uYnV0dG9uLmlzLXNlY29uZGFyeTpob3ZlciB7XG4gIGJhY2tncm91bmQ6ICM2NjdlZWE7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xufVxuXG4vKiBMb2FkaW5nIEFuaW1hdGlvbiAqL1xuLmJ1dHRvbi5pcy1sb2FkaW5nIHtcbiAgcG9pbnRlci1ldmVudHM6IG5vbmU7XG4gIG9wYWNpdHk6IDAuNztcbn1cblxuLmJ1dHRvbi5pcy1sb2FkaW5nOjphZnRlciB7XG4gIGNvbnRlbnQ6ICcnO1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHdpZHRoOiAxNnB4O1xuICBoZWlnaHQ6IDE2cHg7XG4gIHRvcDogNTAlO1xuICBsZWZ0OiA1MCU7XG4gIG1hcmdpbi1sZWZ0OiAtOHB4O1xuICBtYXJnaW4tdG9wOiAtOHB4O1xuICBib3JkZXI6IDJweCBzb2xpZCB0cmFuc3BhcmVudDtcbiAgYm9yZGVyLXRvcC1jb2xvcjogd2hpdGU7XG4gIGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgYW5pbWF0aW9uOiBidXR0b24tbG9hZGluZy1zcGlubmVyIDAuNnMgbGluZWFyIGluZmluaXRlO1xufVxuXG5Aa2V5ZnJhbWVzIGJ1dHRvbi1sb2FkaW5nLXNwaW5uZXIge1xuICBmcm9tIHtcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgwdHVybik7XG4gIH1cbiAgdG8ge1xuICAgIHRyYW5zZm9ybTogcm90YXRlKDF0dXJuKTtcbiAgfVxufVxuXG4vKiBGZWF0dXJlcyBTZWN0aW9uICovXG4uZmVhdHVyZXMtZ3JpZCB7XG4gIGRpc3BsYXk6IGdyaWQ7XG4gIGdyaWQtdGVtcGxhdGUtY29sdW1uczogcmVwZWF0KGF1dG8tZml0LCBtaW5tYXgoMjUwcHgsIDFmcikpO1xuICBnYXA6IDEuNXJlbTtcbiAgbWFyZ2luLXRvcDogMnJlbTtcbiAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbn1cblxuLmZlYXR1cmUtY2FyZCB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBwYWRkaW5nOiAxLjVyZW07XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1tZCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGVhc2U7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XG59XG5cbi5mZWF0dXJlLWNhcmQ6aG92ZXIge1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTRweCk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XG59XG5cbi5mZWF0dXJlLWljb24ge1xuICB3aWR0aDogNTBweDtcbiAgaGVpZ2h0OiA1MHB4O1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgY29sb3I6IHdoaXRlO1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgZm9udC1zaXplOiAxLjVyZW07XG4gIG1hcmdpbi1ib3R0b206IDFyZW07XG59XG5cbi5mZWF0dXJlLXRpdGxlIHtcbiAgZm9udC1zaXplOiAxLjEyNXJlbTtcbiAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgY29sb3I6IHZhcigtLXRleHQtcHJpbWFyeSk7XG4gIG1hcmdpbi1ib3R0b206IDAuNXJlbTtcbn1cblxuLmZlYXR1cmUtZGVzY3JpcHRpb24ge1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICBmb250LXNpemU6IDAuOXJlbTtcbiAgbGluZS1oZWlnaHQ6IDEuNjtcbn1cblxuLyogRm9vdGVyICovXG4ubW9kZXJuLWZvb3RlciB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBwYWRkaW5nOiAycmVtO1xuICB0ZXh0LWFsaWduOiBjZW50ZXI7XG4gIG1hcmdpbi10b3A6IDRyZW07XG4gIGJveC1zaGFkb3c6IDAgLTJweCAxMHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG59XG5cbi5tb2Rlcm4tZm9vdGVyIHAge1xuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xuICBtYXJnaW46IDA7XG59XG5cbi5tb2Rlcm4tZm9vdGVyIGEge1xuICBjb2xvcjogIzY2N2VlYTtcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xuICBmb250LXdlaWdodDogNjAwO1xufVxuXG4ubW9kZXJuLWZvb3RlciBhOmhvdmVyIHtcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG59XG5cbi8qIEFuaW1hdGlvbnMgKi9cbkBrZXlmcmFtZXMgZmFkZUluVXAge1xuICBmcm9tIHtcbiAgICBvcGFjaXR5OiAwO1xuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgyMHB4KTtcbiAgfVxuICB0byB7XG4gICAgb3BhY2l0eTogMTtcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMCk7XG4gIH1cbn1cblxuLmZhZGUtaW4tdXAge1xuICBhbmltYXRpb246IGZhZGVJblVwIDAuNnMgZWFzZS1vdXQ7XG59XG5cbi8qIFN1Y2Nlc3MvRXJyb3IgTWVzc2FnZXMgKi9cbi5tZXNzYWdlLWJveCB7XG4gIHBhZGRpbmc6IDFyZW0gMS41cmVtO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xuICBkaXNwbGF5OiBmbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBnYXA6IDAuNzVyZW07XG4gIGFuaW1hdGlvbjogZmFkZUluVXAgMC4zcyBlYXNlLW91dDtcbn1cblxuLm1lc3NhZ2UtYm94LnN1Y2Nlc3Mge1xuICBiYWNrZ3JvdW5kOiAjZDRlZGRhO1xuICBjb2xvcjogIzE1NTcyNDtcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjMjhhNzQ1O1xufVxuXG4ubWVzc2FnZS1ib3guZXJyb3Ige1xuICBiYWNrZ3JvdW5kOiAjZjhkN2RhO1xuICBjb2xvcjogIzcyMWMyNDtcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjZGMzNTQ1O1xufVxuXG4vKiBSZXNwb25zaXZlIERlc2lnbiAqL1xuQG1lZGlhIChtYXgtd2lkdGg6IDEwMjRweCkge1xuICAuY29udmVydGVyLWdyaWQge1xuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyO1xuICAgIGdhcDogMS41cmVtO1xuICB9XG5cbiAgLmNvbnRlbnQtd3JhcHBlciB7XG4gICAgbWF4LXdpZHRoOiAxMjAwcHg7XG4gIH1cbn1cblxuQG1lZGlhIChtYXgtd2lkdGg6IDc2OHB4KSB7XG4gIC5oZXJvIC50aXRsZSB7XG4gICAgZm9udC1zaXplOiAxLjc1cmVtO1xuICB9XG5cbiAgLmhlcm8gLnN1YnRpdGxlIHtcbiAgICBmb250LXNpemU6IDFyZW07XG4gIH1cblxuICAuY29udmVydGVyLWNhcmQge1xuICAgIHBhZGRpbmc6IDEuNXJlbTtcbiAgfVxuXG4gIC5idXR0b24tY29udHJvbHMge1xuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gIH1cblxuICAuYnV0dG9uIHtcbiAgICB3aWR0aDogMTAwJTtcbiAgICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcbiAgfVxuXG4gIC5uYXYtaGVhZGVyIHtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgIGdhcDogMXJlbTtcbiAgfVxuXG4gIC5mZWF0dXJlcy1ncmlkIHtcbiAgICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IDFmcjtcbiAgfVxuXG4gIC50ZXh0YXJlYSB7XG4gICAgbWluLWhlaWdodDogMTUwcHg7XG4gIH1cbn1cblxuLyogQ29kZSBIaWdobGlnaHRpbmcgaW4gT3V0cHV0ICovXG4udGV4dGFyZWEuY29kZS1vdXRwdXQge1xuICBiYWNrZ3JvdW5kOiAjMmQzNzQ4O1xuICBjb2xvcjogI2UyZThmMDtcbiAgYm9yZGVyLWNvbG9yOiAjNGE1NTY4O1xufVxuXG4udGV4dGFyZWEuY29kZS1vdXRwdXQ6Zm9jdXMge1xuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XG59XG5cbi8qIFV0aWxpdHkgQ2xhc3NlcyAqL1xuLm10LTEgeyBtYXJnaW4tdG9wOiAwLjVyZW07IH1cbi5tdC0yIHsgbWFyZ2luLXRvcDogMXJlbTsgfVxuLm10LTMgeyBtYXJnaW4tdG9wOiAxLjVyZW07IH1cbi5tdC00IHsgbWFyZ2luLXRvcDogMnJlbTsgfVxuXG4ubWItMSB7IG1hcmdpbi1ib3R0b206IDAuNXJlbTsgfVxuLm1iLTIgeyBtYXJnaW4tYm90dG9tOiAxcmVtOyB9XG4ubWItMyB7IG1hcmdpbi1ib3R0b206IDEuNXJlbTsgfVxuLm1iLTQgeyBtYXJnaW4tYm90dG9tOiAycmVtOyB9XG5cbi50ZXh0LWNlbnRlciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxuLnRleHQtbXV0ZWQgeyBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpOyB9XG5gLCBcIlwiLHtcInZlcnNpb25cIjozLFwic291cmNlc1wiOltcIndlYnBhY2s6Ly8uL3NyYy9zdHlsZS5jc3NcIl0sXCJuYW1lc1wiOltdLFwibWFwcGluZ3NcIjpcIkFBQUEsa0RBQWtEOztBQUVsRDtFQUNFLHFFQUFxRTtFQUNyRSx1RUFBdUU7RUFDdkUscUVBQXFFO0VBQ3JFLGtCQUFrQjtFQUNsQixrQkFBa0I7RUFDbEIsdUJBQXVCO0VBQ3ZCLHlCQUF5QjtFQUN6Qix1QkFBdUI7RUFDdkIsMENBQTBDO0VBQzFDLDBDQUEwQztFQUMxQywyQ0FBMkM7RUFDM0MsNENBQTRDO0VBQzVDLGdCQUFnQjtFQUNoQixpQkFBaUI7RUFDakIsaUJBQWlCO0FBQ25COztBQUVBO0VBQ0Usc0JBQXNCO0FBQ3hCOztBQUVBO0VBQ0UsOEpBQThKO0VBQzlKLG1DQUFtQztFQUNuQyxrQ0FBa0M7RUFDbEMsNkRBQTZEO0VBQzdELGlCQUFpQjtBQUNuQjs7QUFFQSwwQkFBMEI7QUFDMUI7RUFDRSxtQ0FBbUM7RUFDbkMsa0JBQWtCO0VBQ2xCLGdCQUFnQjtBQUNsQjs7QUFFQTtFQUNFLFdBQVc7RUFDWCxrQkFBa0I7RUFDbEIsTUFBTTtFQUNOLE9BQU87RUFDUCxRQUFRO0VBQ1IsU0FBUztFQUNULG1EQUE4WDtFQUM5WCxZQUFZO0FBQ2Q7O0FBRUE7RUFDRSxrQkFBa0I7RUFDbEIsVUFBVTtFQUNWLG9CQUFvQjtBQUN0Qjs7QUFFQTtFQUNFLGlCQUFpQjtFQUNqQixnQkFBZ0I7RUFDaEIsMENBQTBDO0VBQzFDLHNCQUFzQjtBQUN4Qjs7QUFFQTtFQUNFLGtCQUFrQjtFQUNsQixhQUFhO0VBQ2IsZ0JBQWdCO0FBQ2xCOztBQUVBLHNC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QixFQUFFO0FBQzFCLFFBQVEsa0JBQWtCLEVBQUU7QUFDNUIsUUFBUSxnQkFBZ0IsRUFBRTs7QUFFMUIsUUFBUSxxQkFBcUIsRUFBRTtBQUMvQixRQUFRLG1CQUFtQixFQUFFO0FBQzdCLFFBQVEscUJBQXFCLEVBQUU7QUFDL0IsUUFBUSxtQkFBbUIsRUFBRTs7QUFFN0IsZUFBZSxrQkFBa0IsRUFBRTtBQUNuQyxjQUFjLDRCQUE0QixFQUFFXCIsXCJzb3VyY2VzQ29udGVudFwiOltcIi8qIE1vZGVybiBTUUwgdG8gTGFyYXZlbCBCdWlsZGVyIC0gQ3VzdG9tIFN0eWxlcyAqL1xcblxcbjpyb290IHtcXG4gIC0tcHJpbWFyeS1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzY2N2VlYSAwJSwgIzc2NGJhMiAxMDAlKTtcXG4gIC0tc2Vjb25kYXJ5LWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjZjA5M2ZiIDAlLCAjZjU1NzZjIDEwMCUpO1xcbiAgLS1zdWNjZXNzLWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNGZhY2ZlIDAlLCAjMDBmMmZlIDEwMCUpO1xcbiAgLS1kYXJrLWJnOiAjMWExYTJlO1xcbiAgLS1jYXJkLWJnOiAjZmZmZmZmO1xcbiAgLS10ZXh0LXByaW1hcnk6ICMyZDM3NDg7XFxuICAtLXRleHQtc2Vjb25kYXJ5OiAjNzE4MDk2O1xcbiAgLS1ib3JkZXItY29sb3I6ICNlMmU4ZjA7XFxuICAtLXNoYWRvdy1zbTogMCAycHggNHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XFxuICAtLXNoYWRvdy1tZDogMCA0cHggNnB4IHJnYmEoMCwgMCwgMCwgMC4wNyk7XFxuICAtLXNoYWRvdy1sZzogMCAxMHB4IDI1cHggcmdiYSgwLCAwLCAwLCAwLjEpO1xcbiAgLS1zaGFkb3cteGw6IDAgMjBweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC4xNSk7XFxuICAtLXJhZGl1cy1zbTogOHB4O1xcbiAgLS1yYWRpdXMtbWQ6IDEycHg7XFxuICAtLXJhZGl1cy1sZzogMTZweDtcXG59XFxuXFxuKiB7XFxuICBib3gtc2l6aW5nOiBib3JkZXItYm94O1xcbn1cXG5cXG5ib2R5IHtcXG4gIGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICdTZWdvZSBVSScsICdSb2JvdG8nLCAnT3h5Z2VuJywgJ1VidW50dScsICdDYW50YXJlbGwnLCAnRmlyYSBTYW5zJywgJ0Ryb2lkIFNhbnMnLCAnSGVsdmV0aWNhIE5ldWUnLCBzYW5zLXNlcmlmO1xcbiAgLXdlYmtpdC1mb250LXNtb290aGluZzogYW50aWFsaWFzZWQ7XFxuICAtbW96LW9zeC1mb250LXNtb290aGluZzogZ3JheXNjYWxlO1xcbiAgYmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2Y1ZjdmYSAwJSwgI2MzY2ZlMiAxMDAlKTtcXG4gIG1pbi1oZWlnaHQ6IDEwMHZoO1xcbn1cXG5cXG4vKiBIZXJvIFNlY3Rpb24gUmVkZXNpZ24gKi9cXG4uaGVyby5pcy1wcmltYXJ5IHtcXG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xcbiAgb3ZlcmZsb3c6IGhpZGRlbjtcXG59XFxuXFxuLmhlcm8uaXMtcHJpbWFyeTo6YmVmb3JlIHtcXG4gIGNvbnRlbnQ6ICcnO1xcbiAgcG9zaXRpb246IGFic29sdXRlO1xcbiAgdG9wOiAwO1xcbiAgbGVmdDogMDtcXG4gIHJpZ2h0OiAwO1xcbiAgYm90dG9tOiAwO1xcbiAgYmFja2dyb3VuZDogdXJsKFxcXCJkYXRhOmltYWdlL3N2Zyt4bWwsJTNDc3ZnIHdpZHRoPSc2MCcgaGVpZ2h0PSc2MCcgdmlld0JveD0nMCAwIDYwIDYwJyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnJTNFJTNDZyBmaWxsPSdub25lJyBmaWxsLXJ1bGU9J2V2ZW5vZGQnJTNFJTNDZyBmaWxsPSclMjNmZmZmZmYnIGZpbGwtb3BhY2l0eT0nMC4wNSclM0UlM0NwYXRoIGQ9J00zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMlY2aDRWNGgtNHpNNiAzNHYtNEg0djRIMHYyaDR2NGgydi00aDR2LTJINnpNNiA0VjBINHY0SDB2Mmg0djRoMlY2aDRWNEg2eicvJTNFJTNDL2clM0UlM0MvZyUzRSUzQy9zdmclM0VcXFwiKTtcXG4gIG9wYWNpdHk6IDAuMztcXG59XFxuXFxuLmhlcm8tYm9keSB7XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICB6LWluZGV4OiAxO1xcbiAgcGFkZGluZzogM3JlbSAxLjVyZW07XFxufVxcblxcbi5oZXJvIC50aXRsZSB7XFxuICBmb250LXNpemU6IDIuNXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA4MDA7XFxuICB0ZXh0LXNoYWRvdzogMCAycHggMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7XFxuICBsZXR0ZXItc3BhY2luZzogLTAuNXB4O1xcbn1cXG5cXG4uaGVybyAuc3VidGl0bGUge1xcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xcbiAgb3BhY2l0eTogMC45NTtcXG4gIG1hcmdpbi10b3A6IDFyZW07XFxufVxcblxcbi8qIE5hdmlnYXRpb24vSGVhZGVyICovXFxuLm5hdi1oZWFkZXIge1xcbiAgcGFkZGluZzogMXJlbSAycmVtO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1zbSk7XFxufVxcblxcbi5naXRodWItbGluayB7XFxuICBkaXNwbGF5OiBpbmxpbmUtZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBnYXA6IDAuNXJlbTtcXG4gIHBhZGRpbmc6IDAuNzVyZW0gMS41cmVtO1xcbiAgYmFja2dyb3VuZDogdmFyKC0tZGFyay1iZyk7XFxuICBjb2xvcjogd2hpdGU7XFxuICB0ZXh0LWRlY29yYXRpb246IG5vbmU7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgZm9udC13ZWlnaHQ6IDYwMDtcXG4gIHRyYW5zaXRpb246IGFsbCAwLjNzIGN1YmljLWJlemllcigwLjQsIDAsIDAuMiwgMSk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xcbn1cXG5cXG4uZ2l0aHViLWxpbms6aG92ZXIge1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LWxnKTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG59XFxuXFxuLmdpdGh1Yi1saW5rOjpiZWZvcmUge1xcbiAgY29udGVudDogJ+KYhSc7XFxuICBmb250LXNpemU6IDEuMjVyZW07XFxufVxcblxcbi8qIE1haW4gQ29udGVudCBBcmVhICovXFxuLmNvbnRlbnQtd3JhcHBlciB7XFxuICBtYXgtd2lkdGg6IDE0MDBweDtcXG4gIG1hcmdpbjogMCBhdXRvO1xcbiAgcGFkZGluZzogMnJlbSAxcmVtO1xcbn1cXG5cXG4vKiBDb252ZXJ0ZXIgR3JpZCAtIFNpZGUgYnkgU2lkZSBMYXlvdXQgKi9cXG4uY29udmVydGVyLWdyaWQge1xcbiAgZGlzcGxheTogZ3JpZDtcXG4gIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyIDFmcjtcXG4gIGdhcDogMnJlbTtcXG4gIG1hcmdpbi1ib3R0b206IDJyZW07XFxufVxcblxcbi5jb252ZXJ0ZXItY2FyZCB7XFxuICBiYWNrZ3JvdW5kOiB2YXIoLS1jYXJkLWJnKTtcXG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1sZyk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3cteGwpO1xcbiAgcGFkZGluZzogMi41cmVtO1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgZWFzZTtcXG59XFxuXFxuLmNvbnZlcnRlci1jYXJkOmhvdmVyIHtcXG4gIGJveC1zaGFkb3c6IDAgMjVweCA1MHB4IHJnYmEoMCwgMCwgMCwgMC4yKTtcXG59XFxuXFxuLyogU2VjdGlvbiBIZWFkZXJzICovXFxuLnNlY3Rpb24taGVhZGVyIHtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjc1cmVtO1xcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcXG4gIGZvbnQtc2l6ZTogMS4yNXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA3MDA7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1wcmltYXJ5KTtcXG59XFxuXFxuLnNlY3Rpb24taWNvbiB7XFxuICB3aWR0aDogNDBweDtcXG4gIGhlaWdodDogNDBweDtcXG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1zbSk7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XFxuICBjb2xvcjogd2hpdGU7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xcbn1cXG5cXG4vKiBUZXh0YXJlYSBSZWRlc2lnbiAqL1xcbi50ZXh0YXJlYS13cmFwcGVyIHtcXG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcXG4gIG1hcmdpbi1ib3R0b206IDEuNXJlbTtcXG59XFxuXFxuLnRleHRhcmVhIHtcXG4gIGJvcmRlcjogMnB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgcGFkZGluZzogMS4yNXJlbTtcXG4gIGZvbnQtc2l6ZTogMXJlbTtcXG4gIGZvbnQtZmFtaWx5OiAnTW9uYWNvJywgJ01lbmxvJywgJ1VidW50dSBNb25vJywgJ0NvbnNvbGFzJywgJ3NvdXJjZS1jb2RlLXBybycsIG1vbm9zcGFjZTtcXG4gIGxpbmUtaGVpZ2h0OiAxLjY7XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xcbiAgcmVzaXplOiB2ZXJ0aWNhbDtcXG4gIG1pbi1oZWlnaHQ6IDIwMHB4O1xcbiAgYmFja2dyb3VuZDogI2Y4ZmFmYztcXG59XFxuXFxuLnRleHRhcmVhOmZvY3VzIHtcXG4gIG91dGxpbmU6IG5vbmU7XFxuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XFxuICBib3gtc2hhZG93OiAwIDAgMCAzcHggcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxufVxcblxcbi50ZXh0YXJlYTo6cGxhY2Vob2xkZXIge1xcbiAgY29sb3I6ICNhMGFlYzA7XFxuICBmb250LXN0eWxlOiBpdGFsaWM7XFxufVxcblxcbi8qIENvcHkgQnV0dG9uICovXFxuLmNvcHktYnV0dG9uIHtcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogMC43NXJlbTtcXG4gIHJpZ2h0OiAwLjc1cmVtO1xcbiAgcGFkZGluZzogMC41cmVtIDFyZW07XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xcbiAgY3Vyc29yOiBwb2ludGVyO1xcbiAgZm9udC1zaXplOiAwLjg3NXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA2MDA7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuMnMgZWFzZTtcXG4gIHotaW5kZXg6IDEwO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBnYXA6IDAuNXJlbTtcXG59XFxuXFxuLmNvcHktYnV0dG9uOmhvdmVyIHtcXG4gIGJhY2tncm91bmQ6ICM2NjdlZWE7XFxuICBjb2xvcjogd2hpdGU7XFxuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xcbn1cXG5cXG4uY29weS1idXR0b24uY29waWVkIHtcXG4gIGJhY2tncm91bmQ6ICM0OGJiNzg7XFxuICBjb2xvcjogd2hpdGU7XFxuICBib3JkZXItY29sb3I6ICM0OGJiNzg7XFxufVxcblxcbi8qIEJ1dHRvbiBDb250cm9scyAqL1xcbi5idXR0b24tY29udHJvbHMge1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGdhcDogMXJlbTtcXG4gIGZsZXgtd3JhcDogd3JhcDtcXG59XFxuXFxuLmJ1dHRvbiB7XFxuICBwYWRkaW5nOiAwLjg3NXJlbSAycmVtO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIGZvbnQtd2VpZ2h0OiA3MDA7XFxuICBmb250LXNpemU6IDFyZW07XFxuICBib3JkZXI6IG5vbmU7XFxuICBjdXJzb3I6IHBvaW50ZXI7XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjVyZW07XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICBvdmVyZmxvdzogaGlkZGVuO1xcbn1cXG5cXG4uYnV0dG9uOjpiZWZvcmUge1xcbiAgY29udGVudDogJyc7XFxuICBwb3NpdGlvbjogYWJzb2x1dGU7XFxuICB0b3A6IDUwJTtcXG4gIGxlZnQ6IDUwJTtcXG4gIHdpZHRoOiAwO1xcbiAgaGVpZ2h0OiAwO1xcbiAgYm9yZGVyLXJhZGl1czogNTAlO1xcbiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjMpO1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoLTUwJSwgLTUwJSk7XFxuICB0cmFuc2l0aW9uOiB3aWR0aCAwLjZzLCBoZWlnaHQgMC42cztcXG59XFxuXFxuLmJ1dHRvbjpob3Zlcjo6YmVmb3JlIHtcXG4gIHdpZHRoOiAzMDBweDtcXG4gIGhlaWdodDogMzAwcHg7XFxufVxcblxcbi5idXR0b24uaXMtcHJpbWFyeSB7XFxuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XFxufVxcblxcbi5idXR0b24uaXMtcHJpbWFyeTpob3ZlciB7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTJweCk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xcbn1cXG5cXG4uYnV0dG9uLmlzLXNlY29uZGFyeSB7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIGNvbG9yOiAjNjY3ZWVhO1xcbiAgYm9yZGVyOiAycHggc29saWQgIzY2N2VlYTtcXG59XFxuXFxuLmJ1dHRvbi5pcy1zZWNvbmRhcnk6aG92ZXIge1xcbiAgYmFja2dyb3VuZDogIzY2N2VlYTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxufVxcblxcbi8qIExvYWRpbmcgQW5pbWF0aW9uICovXFxuLmJ1dHRvbi5pcy1sb2FkaW5nIHtcXG4gIHBvaW50ZXItZXZlbnRzOiBub25lO1xcbiAgb3BhY2l0eTogMC43O1xcbn1cXG5cXG4uYnV0dG9uLmlzLWxvYWRpbmc6OmFmdGVyIHtcXG4gIGNvbnRlbnQ6ICcnO1xcbiAgcG9zaXRpb246IGFic29sdXRlO1xcbiAgd2lkdGg6IDE2cHg7XFxuICBoZWlnaHQ6IDE2cHg7XFxuICB0b3A6IDUwJTtcXG4gIGxlZnQ6IDUwJTtcXG4gIG1hcmdpbi1sZWZ0OiAtOHB4O1xcbiAgbWFyZ2luLXRvcDogLThweDtcXG4gIGJvcmRlcjogMnB4IHNvbGlkIHRyYW5zcGFyZW50O1xcbiAgYm9yZGVyLXRvcC1jb2xvcjogd2hpdGU7XFxuICBib3JkZXItcmFkaXVzOiA1MCU7XFxuICBhbmltYXRpb246IGJ1dHRvbi1sb2FkaW5nLXNwaW5uZXIgMC42cyBsaW5lYXIgaW5maW5pdGU7XFxufVxcblxcbkBrZXlmcmFtZXMgYnV0dG9uLWxvYWRpbmctc3Bpbm5lciB7XFxuICBmcm9tIHtcXG4gICAgdHJhbnNmb3JtOiByb3RhdGUoMHR1cm4pO1xcbiAgfVxcbiAgdG8ge1xcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgxdHVybik7XFxuICB9XFxufVxcblxcbi8qIEZlYXR1cmVzIFNlY3Rpb24gKi9cXG4uZmVhdHVyZXMtZ3JpZCB7XFxuICBkaXNwbGF5OiBncmlkO1xcbiAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoYXV0by1maXQsIG1pbm1heCgyNTBweCwgMWZyKSk7XFxuICBnYXA6IDEuNXJlbTtcXG4gIG1hcmdpbi10b3A6IDJyZW07XFxuICBtYXJnaW4tYm90dG9tOiAycmVtO1xcbn1cXG5cXG4uZmVhdHVyZS1jYXJkIHtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbiAgcGFkZGluZzogMS41cmVtO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcXG59XFxuXFxuLmZlYXR1cmUtY2FyZDpob3ZlciB7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTRweCk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xcbn1cXG5cXG4uZmVhdHVyZS1pY29uIHtcXG4gIHdpZHRoOiA1MHB4O1xcbiAgaGVpZ2h0OiA1MHB4O1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcXG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcXG4gIGZvbnQtc2l6ZTogMS41cmVtO1xcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcXG59XFxuXFxuLmZlYXR1cmUtdGl0bGUge1xcbiAgZm9udC1zaXplOiAxLjEyNXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA3MDA7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1wcmltYXJ5KTtcXG4gIG1hcmdpbi1ib3R0b206IDAuNXJlbTtcXG59XFxuXFxuLmZlYXR1cmUtZGVzY3JpcHRpb24ge1xcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcXG4gIGZvbnQtc2l6ZTogMC45cmVtO1xcbiAgbGluZS1oZWlnaHQ6IDEuNjtcXG59XFxuXFxuLyogRm9vdGVyICovXFxuLm1vZGVybi1mb290ZXIge1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxuICBwYWRkaW5nOiAycmVtO1xcbiAgdGV4dC1hbGlnbjogY2VudGVyO1xcbiAgbWFyZ2luLXRvcDogNHJlbTtcXG4gIGJveC1zaGFkb3c6IDAgLTJweCAxMHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XFxufVxcblxcbi5tb2Rlcm4tZm9vdGVyIHAge1xcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcXG4gIG1hcmdpbjogMDtcXG59XFxuXFxuLm1vZGVybi1mb290ZXIgYSB7XFxuICBjb2xvcjogIzY2N2VlYTtcXG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcXG4gIGZvbnQtd2VpZ2h0OiA2MDA7XFxufVxcblxcbi5tb2Rlcm4tZm9vdGVyIGE6aG92ZXIge1xcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XFxufVxcblxcbi8qIEFuaW1hdGlvbnMgKi9cXG5Aa2V5ZnJhbWVzIGZhZGVJblVwIHtcXG4gIGZyb20ge1xcbiAgICBvcGFjaXR5OiAwO1xcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMjBweCk7XFxuICB9XFxuICB0byB7XFxuICAgIG9wYWNpdHk6IDE7XFxuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwKTtcXG4gIH1cXG59XFxuXFxuLmZhZGUtaW4tdXAge1xcbiAgYW5pbWF0aW9uOiBmYWRlSW5VcCAwLjZzIGVhc2Utb3V0O1xcbn1cXG5cXG4vKiBTdWNjZXNzL0Vycm9yIE1lc3NhZ2VzICovXFxuLm1lc3NhZ2UtYm94IHtcXG4gIHBhZGRpbmc6IDFyZW0gMS41cmVtO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIG1hcmdpbi1ib3R0b206IDFyZW07XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGdhcDogMC43NXJlbTtcXG4gIGFuaW1hdGlvbjogZmFkZUluVXAgMC4zcyBlYXNlLW91dDtcXG59XFxuXFxuLm1lc3NhZ2UtYm94LnN1Y2Nlc3Mge1xcbiAgYmFja2dyb3VuZDogI2Q0ZWRkYTtcXG4gIGNvbG9yOiAjMTU1NzI0O1xcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjMjhhNzQ1O1xcbn1cXG5cXG4ubWVzc2FnZS1ib3guZXJyb3Ige1xcbiAgYmFja2dyb3VuZDogI2Y4ZDdkYTtcXG4gIGNvbG9yOiAjNzIxYzI0O1xcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjZGMzNTQ1O1xcbn1cXG5cXG4vKiBSZXNwb25zaXZlIERlc2lnbiAqL1xcbkBtZWRpYSAobWF4LXdpZHRoOiAxMDI0cHgpIHtcXG4gIC5jb252ZXJ0ZXItZ3JpZCB7XFxuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyO1xcbiAgICBnYXA6IDEuNXJlbTtcXG4gIH1cXG5cXG4gIC5jb250ZW50LXdyYXBwZXIge1xcbiAgICBtYXgtd2lkdGg6IDEyMDBweDtcXG4gIH1cXG59XFxuXFxuQG1lZGlhIChtYXgtd2lkdGg6IDc2OHB4KSB7XFxuICAuaGVybyAudGl0bGUge1xcbiAgICBmb250LXNpemU6IDEuNzVyZW07XFxuICB9XFxuXFxuICAuaGVybyAuc3VidGl0bGUge1xcbiAgICBmb250LXNpemU6IDFyZW07XFxuICB9XFxuXFxuICAuY29udmVydGVyLWNhcmQge1xcbiAgICBwYWRkaW5nOiAxLjVyZW07XFxuICB9XFxuXFxuICAuYnV0dG9uLWNvbnRyb2xzIHtcXG4gICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcXG4gIH1cXG5cXG4gIC5idXR0b24ge1xcbiAgICB3aWR0aDogMTAwJTtcXG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XFxuICB9XFxuXFxuICAubmF2LWhlYWRlciB7XFxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XFxuICAgIGdhcDogMXJlbTtcXG4gIH1cXG5cXG4gIC5mZWF0dXJlcy1ncmlkIHtcXG4gICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxZnI7XFxuICB9XFxuXFxuICAudGV4dGFyZWEge1xcbiAgICBtaW4taGVpZ2h0OiAxNTBweDtcXG4gIH1cXG59XFxuXFxuLyogQ29kZSBIaWdobGlnaHRpbmcgaW4gT3V0cHV0ICovXFxuLnRleHRhcmVhLmNvZGUtb3V0cHV0IHtcXG4gIGJhY2tncm91bmQ6ICMyZDM3NDg7XFxuICBjb2xvcjogI2UyZThmMDtcXG4gIGJvcmRlci1jb2xvcjogIzRhNTU2ODtcXG59XFxuXFxuLnRleHRhcmVhLmNvZGUtb3V0cHV0OmZvY3VzIHtcXG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcXG59XFxuXFxuLyogVXRpbGl0eSBDbGFzc2VzICovXFxuLm10LTEgeyBtYXJnaW4tdG9wOiAwLjVyZW07IH1cXG4ubXQtMiB7IG1hcmdpbi10b3A6IDFyZW07IH1cXG4ubXQtMyB7IG1hcmdpbi10b3A6IDEuNXJlbTsgfVxcbi5tdC00IHsgbWFyZ2luLXRvcDogMnJlbTsgfVxcblxcbi5tYi0xIHsgbWFyZ2luLWJvdHRvbTogMC41cmVtOyB9XFxuLm1iLTIgeyBtYXJnaW4tYm90dG9tOiAxcmVtOyB9XFxuLm1iLTMgeyBtYXJnaW4tYm90dG9tOiAxLjVyZW07IH1cXG4ubWItNCB7IG1hcmdpbi1ib3R0b206IDJyZW07IH1cXG5cXG4udGV4dC1jZW50ZXIgeyB0ZXh0LWFsaWduOiBjZW50ZXI7IH1cXG4udGV4dC1tdXRlZCB7IGNvbG9yOiB2YXIoLS10ZXh0LXNlY29uZGFyeSk7IH1cXG5cIl0sXCJzb3VyY2VSb290XCI6XCJcIn1dKTtcbi8vIEV4cG9ydHNcbmV4cG9ydCBkZWZhdWx0IF9fX0NTU19MT0FERVJfRVhQT1JUX19fO1xuIiwiaW1wb3J0ICogYXMgd2FzbSBmcm9tIFwic3FscGFyc2VyLXJzLXdhc21cIjtcbmltcG9ydCB7Q29udmVydGVyfSBmcm9tIFwiLi9jb252ZXJ0ZXJcIjtcbmltcG9ydCAnLi9zdHlsZS5jc3MnO1xuXG4vLyBTaG93IG5vdGlmaWNhdGlvbiBtZXNzYWdlXG5mdW5jdGlvbiBzaG93Tm90aWZpY2F0aW9uKG1lc3NhZ2UsIHR5cGUgPSAnc3VjY2VzcycpIHtcbiAgICAvLyBSZW1vdmUgYW55IGV4aXN0aW5nIG5vdGlmaWNhdGlvbnNcbiAgICBjb25zdCBleGlzdGluZ05vdGlmID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1lc3NhZ2UtYm94Jyk7XG4gICAgaWYgKGV4aXN0aW5nTm90aWYpIHtcbiAgICAgICAgZXhpc3RpbmdOb3RpZi5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBub3RpZmljYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBub3RpZmljYXRpb24uY2xhc3NOYW1lID0gYG1lc3NhZ2UtYm94ICR7dHlwZX1gO1xuICAgIG5vdGlmaWNhdGlvbi5pbm5lckhUTUwgPSBgPHNwYW4+JHt0eXBlID09PSAnc3VjY2VzcycgPyAn4pyFJyA6ICfinYwnfTwvc3Bhbj48c3Bhbj4ke21lc3NhZ2V9PC9zcGFuPmA7XG5cbiAgICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvbnRlbnQtd3JhcHBlcicpO1xuICAgIHdyYXBwZXIuaW5zZXJ0QmVmb3JlKG5vdGlmaWNhdGlvbiwgd3JhcHBlci5maXJzdENoaWxkKTtcblxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBub3RpZmljYXRpb24uc3R5bGUuYW5pbWF0aW9uID0gJ2ZhZGVJblVwIDAuM3MgZWFzZS1vdXQgcmV2ZXJzZSc7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gbm90aWZpY2F0aW9uLnJlbW92ZSgpLCAzMDApO1xuICAgIH0sIDMwMDApO1xufVxuXG5sZXQgY29udmVydGVyID0gZnVuY3Rpb24gKCkge1xuICAgIGxldCBpbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaW5wdXRcIikudmFsdWU7XG4gICAgbGV0IGNvbnZlcnRCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvbnZlcnQtYnV0dG9uXCIpO1xuXG4gICAgaWYgKGlucHV0LnRyaW0oKSA9PT0gJycpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignUGxlYXNlIGVudGVyIGEgU1FMIHF1ZXJ5JywgJ2Vycm9yJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaW5wdXQuc2xpY2UoLTEpID09PSAnOycpIHtcbiAgICAgICAgaW5wdXQgPSBpbnB1dC5zbGljZSgwLCAtMSk7XG4gICAgfVxuXG4gICAgbGV0IG91dHB1dF90ZXh0X2FyZWEgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm91dHB1dFwiKTtcblxuICAgIGlmICghaW5wdXQuc3RhcnRzV2l0aCgnc2VsZWN0JykgJiYgIWlucHV0LnN0YXJ0c1dpdGgoJ1NFTEVDVCcpKSB7XG4gICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSAnU1FMIG11c3Qgc3RhcnQgd2l0aCBzZWxlY3Qgb3IgU0VMRUNUJztcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignU1FMIHF1ZXJ5IG11c3Qgc3RhcnQgd2l0aCBTRUxFQ1QnLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEFkZCBsb2FkaW5nIHN0YXRlXG4gICAgY29udmVydEJ1dHRvbi5jbGFzc0xpc3QuYWRkKCdpcy1sb2FkaW5nJyk7XG4gICAgY29udmVydEJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG5cbiAgICAvLyBVc2Ugc2V0VGltZW91dCB0byBhbGxvdyBVSSB0byB1cGRhdGVcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBhc3QgPSB3YXNtLnBhcnNlX3NxbChcIi0tbXlzcWxcIiwgaW5wdXQpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYXN0KTtcbiAgICAgICAgICAgIGlmIChhc3Quc3RhcnRzV2l0aCgnRXJyb3InKSkge1xuICAgICAgICAgICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSBhc3Q7XG4gICAgICAgICAgICAgICAgc2hvd05vdGlmaWNhdGlvbignRXJyb3IgcGFyc2luZyBTUUwgcXVlcnknLCAnZXJyb3InKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb3V0cHV0X3RleHRfYXJlYS52YWx1ZSA9IChuZXcgQ29udmVydGVyKEpTT04ucGFyc2UoYXN0KVswXS5RdWVyeSkpLnJ1bigpO1xuICAgICAgICAgICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1N1Y2Nlc3NmdWxseSBjb252ZXJ0ZWQgdG8gTGFyYXZlbCBRdWVyeSBCdWlsZGVyIScsICdzdWNjZXNzJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGlucHV0KTtcbiAgICAgICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSBlICsgJywgSSB3aWxsIGZpeCB0aGlzIGlzc3VlIGFzIHNvb24gYXMgcG9zc2libGUnO1xuICAgICAgICAgICAgc2hvd05vdGlmaWNhdGlvbignQ29udmVyc2lvbiBlcnJvciBvY2N1cnJlZCcsICdlcnJvcicpO1xuICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGNvbnZlcnRCdXR0b24uY2xhc3NMaXN0LnJlbW92ZSgnaXMtbG9hZGluZycpO1xuICAgICAgICAgICAgY29udmVydEJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfSwgMTAwKTtcbn1cblxuLy8gQ29weSB0byBjbGlwYm9hcmQgZnVuY3Rpb25hbGl0eVxuZnVuY3Rpb24gY29weVRvQ2xpcGJvYXJkKCkge1xuICAgIGNvbnN0IG91dHB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwib3V0cHV0XCIpLnZhbHVlO1xuICAgIGNvbnN0IGNvcHlCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktYnV0dG9uXCIpO1xuICAgIGNvbnN0IGNvcHlUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb3B5LXRleHRcIik7XG4gICAgY29uc3QgY29weUljb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktaWNvblwiKTtcblxuICAgIGlmICghb3V0cHV0IHx8IG91dHB1dC50cmltKCkgPT09ICcnIHx8IG91dHB1dC5pbmNsdWRlcygnWW91ciBMYXJhdmVsIHF1ZXJ5IGJ1aWxkZXIgY29kZSB3aWxsIGFwcGVhciBoZXJlJykpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignTm8gb3V0cHV0IHRvIGNvcHknLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KG91dHB1dCkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgY29weUJ1dHRvbi5jbGFzc0xpc3QuYWRkKCdjb3BpZWQnKTtcbiAgICAgICAgY29weVRleHQudGV4dENvbnRlbnQgPSAnQ29waWVkISc7XG4gICAgICAgIGNvcHlJY29uLnRleHRDb250ZW50ID0gJ+Kckyc7XG5cbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICBjb3B5QnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoJ2NvcGllZCcpO1xuICAgICAgICAgICAgY29weVRleHQudGV4dENvbnRlbnQgPSAnQ29weSc7XG4gICAgICAgICAgICBjb3B5SWNvbi50ZXh0Q29udGVudCA9ICfwn5OLJztcbiAgICAgICAgfSwgMjAwMCk7XG4gICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ0ZhaWxlZCB0byBjb3B5IHRvIGNsaXBib2FyZCcsICdlcnJvcicpO1xuICAgIH0pO1xufVxuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIChldmVudCkgPT4ge1xuICAgIGxldCB1cmxfc2VhcmNoX3BhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG5cbiAgICBpZih1cmxfc2VhcmNoX3BhcmFtcy5oYXMoJ2Jhc2U2NHNxbCcpKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcpLnZhbHVlID0gYXRvYih1cmxfc2VhcmNoX3BhcmFtcy5nZXQoJ2Jhc2U2NHNxbCcpKTtcbiAgICAgICAgY29udmVydGVyKCk7XG4gICAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb252ZXJ0LWJ1dHRvbicpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY29udmVydGVyKTtcblxuLy8gQWRkIEVudGVyIGtleSBzdXBwb3J0IChDdHJsL0NtZCArIEVudGVyIHRvIGNvbnZlcnQpXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24oZSkge1xuICAgIGlmICgoZS5jdHJsS2V5IHx8IGUubWV0YUtleSkgJiYgZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgY29udmVydGVyKCk7XG4gICAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGFyZS1idXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcpLnZhbHVlO1xuXG4gICAgaWYgKCFpbnB1dCB8fCBpbnB1dC50cmltKCkgPT09ICcnKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1BsZWFzZSBlbnRlciBhIFNRTCBxdWVyeSBmaXJzdCcsICdlcnJvcicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHNoYXJlX2xpbmsgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lICsgJz9iYXNlNjRzcWw9JyArIGJ0b2EoaW5wdXQpO1xuICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHNoYXJlX2xpbmspLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1NoYXJlIGxpbmsgY29waWVkIHRvIGNsaXBib2FyZCEnLCAnc3VjY2VzcycpO1xuICAgIH0sIGZ1bmN0aW9uKCkge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdGYWlsZWQgdG8gY29weSBzaGFyZSBsaW5rJywgJ2Vycm9yJyk7XG4gICAgfSk7XG59KTtcblxuLy8gQWRkIGNvcHkgYnV0dG9uIGV2ZW50IGxpc3RlbmVyXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29weS1idXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNvcHlUb0NsaXBib2FyZCk7XG4iLCJcbiAgICAgIGltcG9ydCBBUEkgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9pbmplY3RTdHlsZXNJbnRvU3R5bGVUYWcuanNcIjtcbiAgICAgIGltcG9ydCBkb21BUEkgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9zdHlsZURvbUFQSS5qc1wiO1xuICAgICAgaW1wb3J0IGluc2VydEZuIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvaW5zZXJ0QnlTZWxlY3Rvci5qc1wiO1xuICAgICAgaW1wb3J0IHNldEF0dHJpYnV0ZXMgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9zZXRBdHRyaWJ1dGVzV2l0aG91dEF0dHJpYnV0ZXMuanNcIjtcbiAgICAgIGltcG9ydCBpbnNlcnRTdHlsZUVsZW1lbnQgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9pbnNlcnRTdHlsZUVsZW1lbnQuanNcIjtcbiAgICAgIGltcG9ydCBzdHlsZVRhZ1RyYW5zZm9ybUZuIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvc3R5bGVUYWdUcmFuc2Zvcm0uanNcIjtcbiAgICAgIGltcG9ydCBjb250ZW50LCAqIGFzIG5hbWVkRXhwb3J0IGZyb20gXCIhIS4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvY2pzLmpzIS4vc3R5bGUuY3NzXCI7XG4gICAgICBcbiAgICAgIFxuXG52YXIgb3B0aW9ucyA9IHt9O1xuXG5vcHRpb25zLnN0eWxlVGFnVHJhbnNmb3JtID0gc3R5bGVUYWdUcmFuc2Zvcm1Gbjtcbm9wdGlvbnMuc2V0QXR0cmlidXRlcyA9IHNldEF0dHJpYnV0ZXM7XG5vcHRpb25zLmluc2VydCA9IGluc2VydEZuLmJpbmQobnVsbCwgXCJoZWFkXCIpO1xub3B0aW9ucy5kb21BUEkgPSBkb21BUEk7XG5vcHRpb25zLmluc2VydFN0eWxlRWxlbWVudCA9IGluc2VydFN0eWxlRWxlbWVudDtcblxudmFyIHVwZGF0ZSA9IEFQSShjb250ZW50LCBvcHRpb25zKTtcblxuXG5cbmV4cG9ydCAqIGZyb20gXCIhIS4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvY2pzLmpzIS4vc3R5bGUuY3NzXCI7XG4gICAgICAgZXhwb3J0IGRlZmF1bHQgY29udGVudCAmJiBjb250ZW50LmxvY2FscyA/IGNvbnRlbnQubG9jYWxzIDogdW5kZWZpbmVkO1xuIl0sIm5hbWVzIjpbIkNvbnZlcnRlciIsImNvbnN0cnVjdG9yIiwiYXN0IiwicGFyZW50IiwidGFibGVfbmFtZV9ieV9hbGlhcyIsInJ1biIsIm5lZWRfYXBwZW5kX2dldF9zdWZmaXgiLCJzZWN0aW9ucyIsImZyb21faXRlbSIsImJvZHkiLCJTZWxlY3QiLCJmcm9tIiwicHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwiLCJyZWxhdGlvbiIsInB1c2giLCJyZXNvbHZlTWFpblRhYmxlU2VjdGlvbiIsInJlc29sdmVGcm9tU3ViU2VjdGlvbiIsImpvaW5fc2VjdGlvbiIsImhhc0pvaW5TZWN0aW9uIiwicmVzb2x2ZUpvaW5TZWN0aW9uIiwic2xpY2UiLCJsZW5ndGgiLCJjb25jYXQiLCJyZXNvbHZlQ3Jvc3NKb2luU2VjdGlvbiIsInJlc29sdmVTZWxlY3RTZWN0aW9uIiwicmVzb2x2ZVdoZXJlU2VjdGlvbiIsInNlbGVjdGlvbiIsImdyb3VwX2J5IiwicmVzb2x2ZUdyb3VwQnlTZWN0aW9uIiwicmVzb2x2ZUhhdmluZ1NlY3Rpb24iLCJvcmRlcl9ieSIsInJlc29sdmVPcmRlckJ5U2VjdGlvbiIsImxpbWl0IiwiVmFsdWUiLCJOdW1iZXIiLCJvZmZzZXQiLCJ2YWx1ZSIsImpvaW4iLCJyZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZSIsInJlbGF0aW9uX25vZGUiLCJ0YWJsZV9uYW1lIiwiVGFibGUiLCJuYW1lIiwiYWxpYXMiLCJxdW90ZSIsInByZWZpeCIsImFkZFRhYlRvRXZlcnlMaW5lIiwiRGVyaXZlZCIsInN1YnF1ZXJ5IiwicmVwbGFjZSIsInNlbGVjdGlvbl9ub2RlIiwiY29uZGl0aW9uX3R5cGUiLCJnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0IiwiY29uZGl0aW9uIiwiZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0IiwicHJlcGFyZUNvbmRpdGlvbnMiLCJvcCIsIm1ldGhvZF9uYW1lIiwiY29uZGl0aW9ucyIsImFkZFByZWZpeDJNZXRob2RzIiwiY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uIiwiY29sdW1uIiwiZXhwciIsImxpc3QiLCJtYXAiLCJpIiwicmVzb2x2ZVZhbHVlIiwibmVnYXRlZCIsImxlZnRfY29uZGl0aW9uX3R5cGUiLCJsZWZ0IiwibGVmdF9jb25kaXRpb24iLCJyaWdodF9jb25kaXRpb25fdHlwZSIsInJpZ2h0IiwicmlnaHRfY29uZGl0aW9uIiwiaW5jbHVkZXMiLCJTdWJxdWVyeSIsInBhcnNlRnVuY3Rpb25Ob2RlIiwiRnVuY3Rpb24iLCJ0cmFuc2Zvcm1CaW5hcnlPcCIsImxvdyIsImhpZ2giLCJvcGVyYXRvcl9ieV9vcCIsInRvTG93ZXJDYXNlIiwiY2FwaXRhbGl6ZUZpcnN0TGV0dGVyIiwicmVzIiwic2VsZWN0X2l0ZW0iLCJwcm9qZWN0aW9uIiwiRXhwcldpdGhBbGlhcyIsInJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbSIsIlVubmFtZWRFeHByIiwiZ2V0QWN0dWFsVGFibGVOYW1lIiwiUXVhbGlmaWVkV2lsZGNhcmQiLCJPYmplY3QiLCJrZXlzIiwiYXNzZXJ0IiwiaXNVbmRlZmluZWRPck51bGwiLCJpdGVtIiwiZnVuY3Rpb25fbm9kZSIsIm5lZWRfcXVvdGUiLCJmdW5jdGlvbl9uYW1lIiwiYXJncyIsImFyZ19jb3VudCIsImFyZyIsIlVubmFtZWQiLCJFeHByIiwiSWRlbnRpZmllciIsIkNvbXBvdW5kSWRlbnRpZmllciIsImFyZ19jb2x1bW4iLCJOZXN0ZWQiLCJkaXN0aW5jdCIsInBhcnNlQmluYXJ5T3BOb2RlIiwiQmluYXJ5T3AiLCJqb2lucyIsInBhcnNlQmluYXJ5T3BQYXJ0aWFsIiwibGVmdF9vcl9yaWdodCIsImJpbmFyeV9vcCIsInNlcGFyYXRvciIsInByZXBhcmVKb2lucyIsImpvaW5fb3BlcmF0b3JfdHlwZSIsImpvaW5fb3BlcmF0b3IiLCJqb2luX21ldGhvZCIsIk9uIiwic3ViX3F1ZXJ5X3NxbCIsInN1Yl9xdWVyeV9hbGlhcyIsImpvaW5lZF90YWJsZSIsImZyb21faXRlbXMiLCJjcm9zc19qb2luX3NlY3Rpb25zIiwiY3Jvc3Nfam9pbl9zdHIiLCJncm91cF9ieV9jb2x1bW5zIiwiZ3JvdXBfYnlfaXRlbSIsImhhdmluZyIsIm9yZGVyX2J5cyIsIm9yZGVyX2J5X2l0ZW0iLCJhc2MiLCJ2YWx1ZU5vZGUiLCJpc1N0cmluZyIsInZhbHVlX3R5cGUiLCJ0YWJsZV9uYW1lX29yX2FsaWFzIiwiaWRlbnRpZmllciIsInZhbHVlcyIsImZsYXQiLCJtc2ciLCJvYmoiLCJwcm9wZXJ0eV9uYW1lcyIsInJlZHVjZSIsImNhcnJ5IiwicHJvcGVydHlfbmFtZSIsImhhc093blByb3BlcnR5IiwiU3RyaW5nIiwic3RyaW5nIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJ1bnF1b3RlIiwiSlNPTiIsInN0cmluZ2lmeSIsInN0ciIsInRhYl9jb3VudCIsInNwbGl0Iiwid2FzbSIsInNob3dOb3RpZmljYXRpb24iLCJtZXNzYWdlIiwidHlwZSIsImV4aXN0aW5nTm90aWYiLCJkb2N1bWVudCIsInF1ZXJ5U2VsZWN0b3IiLCJyZW1vdmUiLCJub3RpZmljYXRpb24iLCJjcmVhdGVFbGVtZW50IiwiY2xhc3NOYW1lIiwiaW5uZXJIVE1MIiwid3JhcHBlciIsImluc2VydEJlZm9yZSIsImZpcnN0Q2hpbGQiLCJzZXRUaW1lb3V0Iiwic3R5bGUiLCJhbmltYXRpb24iLCJjb252ZXJ0ZXIiLCJpbnB1dCIsImdldEVsZW1lbnRCeUlkIiwiY29udmVydEJ1dHRvbiIsInRyaW0iLCJvdXRwdXRfdGV4dF9hcmVhIiwic3RhcnRzV2l0aCIsImNsYXNzTGlzdCIsImFkZCIsImRpc2FibGVkIiwicGFyc2Vfc3FsIiwiY29uc29sZSIsImxvZyIsInBhcnNlIiwiUXVlcnkiLCJlIiwiY29weVRvQ2xpcGJvYXJkIiwib3V0cHV0IiwiY29weUJ1dHRvbiIsImNvcHlUZXh0IiwiY29weUljb24iLCJuYXZpZ2F0b3IiLCJjbGlwYm9hcmQiLCJ3cml0ZVRleHQiLCJ0aGVuIiwidGV4dENvbnRlbnQiLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwiZXZlbnQiLCJ1cmxfc2VhcmNoX3BhcmFtcyIsIlVSTFNlYXJjaFBhcmFtcyIsImxvY2F0aW9uIiwic2VhcmNoIiwiaGFzIiwiYXRvYiIsImdldCIsImN0cmxLZXkiLCJtZXRhS2V5Iiwia2V5Iiwic2hhcmVfbGluayIsIm9yaWdpbiIsInBhdGhuYW1lIiwiYnRvYSJdLCJzb3VyY2VSb290IjoiIn0=