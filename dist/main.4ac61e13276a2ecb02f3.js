"use strict";
(self["webpackChunksql2builder_github_io"] = self["webpackChunksql2builder_github_io"] || []).push([["main"],{

/***/ 15:
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

/***/ 579:
/*!**********************!*\
  !*** ./src/index.js ***!
  \**********************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! sqlparser-rs-wasm */ 337);
/* harmony import */ var _converter__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./converter */ 15);
/* harmony import */ var _style_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./style.css */ 654);
var __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_2__]);
sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_2__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];




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
      let ast = sqlparser_rs_wasm__WEBPACK_IMPORTED_MODULE_2__.parse_sql("--mysql", input);
      console.log(ast);
      if (ast.startsWith('Error')) {
        output_text_area.value = ast;
        showNotification('Error parsing SQL query', 'error');
      } else {
        output_text_area.value = new _converter__WEBPACK_IMPORTED_MODULE_0__.Converter(JSON.parse(ast)[0].Query).run();
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

/***/ 426:
/*!*************************************************************!*\
  !*** ./node_modules/css-loader/dist/cjs.js!./src/style.css ***!
  \*************************************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../node_modules/css-loader/dist/runtime/sourceMaps.js */ 537);
/* harmony import */ var _node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../node_modules/css-loader/dist/runtime/api.js */ 645);
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _node_modules_css_loader_dist_runtime_getUrl_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../node_modules/css-loader/dist/runtime/getUrl.js */ 667);
/* harmony import */ var _node_modules_css_loader_dist_runtime_getUrl_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_getUrl_js__WEBPACK_IMPORTED_MODULE_2__);
// Imports



var ___CSS_LOADER_URL_IMPORT_0___ = new URL(/* asset import */ __webpack_require__(/*! data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cg fill=%27%23ffffff%27 fill-opacity=%270.05%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E */ 547), __webpack_require__.b);
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

/***/ 654:
/*!***********************!*\
  !*** ./src/style.css ***!
  \***********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js */ 379);
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/styleDomAPI.js */ 795);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/insertBySelector.js */ 569);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js */ 565);
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/insertStyleElement.js */ 216);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! !../node_modules/style-loader/dist/runtime/styleTagTransform.js */ 589);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! !!../node_modules/css-loader/dist/cjs.js!./style.css */ 426);

      
      
      
      
      
      
      
      
      

var options = {};

options.styleTagTransform = (_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default());
options.setAttributes = (_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default());
options.insert = _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default().bind(null, "head");
options.domAPI = (_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default());
options.insertStyleElement = (_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default());

var update = _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default()(_node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__["default"], options);




       /* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (_node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__["default"] && _node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__["default"].locals ? _node_modules_css_loader_dist_cjs_js_style_css__WEBPACK_IMPORTED_MODULE_6__["default"].locals : undefined);


/***/ }),

/***/ 547:
/*!***********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cg fill=%27%23ffffff%27 fill-opacity=%270.05%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E ***!
  \***********************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((module) => {

module.exports = "data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cg fill=%27%23ffffff%27 fill-opacity=%270.05%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E";

/***/ })

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ __webpack_require__.O(0, ["npm.style-loader","npm.css-loader","npm.sqlparser-rs-wasm"], () => (__webpack_exec__(579)));
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi40YWM2MWUxMzI3NmEyZWNiMDJmMy5qcyIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7O0FBQU8sTUFBTUEsU0FBUyxDQUN0QjtFQUNJQyxXQUFXQSxDQUFDQyxHQUFHLEVBQUVDLE1BQU0sR0FBRyxJQUFJLEVBQUU7SUFDNUIsSUFBSSxDQUFDRCxHQUFHLEdBQUdBLEdBQUc7SUFDZCxJQUFJLENBQUNFLG1CQUFtQixHQUFHLENBQUMsQ0FBQztJQUM3QixJQUFJLENBQUNELE1BQU0sR0FBR0EsTUFBTTtFQUN4QjtFQUVBRSxHQUFHQSxDQUFDQyxzQkFBc0IsR0FBRyxJQUFJLEVBQUU7SUFDL0IsSUFBSUMsUUFBUSxHQUFHLEVBQUU7SUFFakIsSUFBSUMsU0FBUyxHQUFHLElBQUksQ0FBQ04sR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUU1QyxJQUFJQyxnQ0FBZ0MsQ0FBQ0osU0FBUyxDQUFDSyxRQUFRLEVBQUUsT0FBTyxDQUFDLEVBQUU7TUFDL0ROLFFBQVEsQ0FBQ08sSUFBSSxDQUFDLElBQUksQ0FBQ0MsdUJBQXVCLENBQUNQLFNBQVMsQ0FBQyxDQUFDO0lBQzFELENBQUMsTUFBTSxJQUFJSSxnQ0FBZ0MsQ0FBQ0osU0FBUyxDQUFDSyxRQUFRLEVBQUUsU0FBUyxDQUFDLEVBQUU7TUFDeEVOLFFBQVEsQ0FBQ08sSUFBSSxDQUFDLElBQUksQ0FBQ0UscUJBQXFCLENBQUMsc0JBQXNCLENBQUMsRUFBRVIsU0FBUyxDQUFDO0lBQ2hGLENBQUMsTUFBTTtNQUNILE1BQU0sc0NBQXNDO0lBQ2hEO0lBRUEsSUFBSVMsWUFBWSxHQUFHLEVBQUU7O0lBRXJCO0lBQ0EsSUFBSSxJQUFJLENBQUNDLGNBQWMsQ0FBQ1YsU0FBUyxDQUFDLEVBQUU7TUFDaENTLFlBQVksR0FBRyxJQUFJLENBQUNFLGtCQUFrQixDQUFDWCxTQUFTLENBQUM7SUFDckQ7O0lBRUE7SUFDQSxJQUFJLElBQUksQ0FBQ04sR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ0MsSUFBSSxDQUFDUyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUNDLE1BQU0sR0FBRyxDQUFDLEVBQUU7TUFDL0NkLFFBQVEsR0FBR0EsUUFBUSxDQUFDZSxNQUFNLENBQUMsSUFBSSxDQUFDQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUNyQixHQUFHLENBQUNPLElBQUksQ0FBQ0MsTUFBTSxDQUFDQyxJQUFJLENBQUNTLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hHO0lBRUFiLFFBQVEsQ0FBQ08sSUFBSSxDQUFDLElBQUksQ0FBQ1Usb0JBQW9CLENBQUMsQ0FBQyxDQUFDO0lBRTFDLElBQUlQLFlBQVksS0FBSyxFQUFFLEVBQUU7TUFDckJWLFFBQVEsQ0FBQ08sSUFBSSxDQUFDRyxZQUFZLENBQUM7SUFDL0I7SUFFQSxJQUFJTCxnQ0FBZ0MsQ0FBQyxJQUFJLENBQUNWLEdBQUcsQ0FBQ08sSUFBSSxDQUFDQyxNQUFNLEVBQUUsV0FBVyxDQUFDLEVBQUU7TUFDckVILFFBQVEsQ0FBQ08sSUFBSSxDQUFDLElBQUksQ0FBQ1csbUJBQW1CLENBQUMsSUFBSSxDQUFDdkIsR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ2dCLFNBQVMsQ0FBQyxDQUFDO0lBQzNFO0lBRUEsSUFBSWQsZ0NBQWdDLENBQUMsSUFBSSxDQUFDVixHQUFHLENBQUNPLElBQUksQ0FBQ0MsTUFBTSxFQUFFLFVBQVUsQ0FBQyxJQUFJLElBQUksQ0FBQ1IsR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ2lCLFFBQVEsQ0FBQ04sTUFBTSxHQUFHLENBQUMsRUFBRTtNQUNoSGQsUUFBUSxDQUFDTyxJQUFJLENBQUMsSUFBSSxDQUFDYyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7TUFFM0MsSUFBSWhCLGdDQUFnQyxDQUFDLElBQUksQ0FBQ1YsR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sRUFBRSxRQUFRLENBQUMsRUFBRTtRQUNsRUgsUUFBUSxDQUFDTyxJQUFJLENBQUMsSUFBSSxDQUFDZSxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7TUFDOUM7SUFDSjtJQUVBLElBQUlqQixnQ0FBZ0MsQ0FBQyxJQUFJLENBQUNWLEdBQUcsRUFBRSxVQUFVLENBQUMsSUFBSSxJQUFJLENBQUNBLEdBQUcsQ0FBQzRCLFFBQVEsQ0FBQ1QsTUFBTSxHQUFHLENBQUMsRUFBRTtNQUN4RmQsUUFBUSxDQUFDTyxJQUFJLENBQUMsSUFBSSxDQUFDaUIscUJBQXFCLENBQUMsQ0FBQyxDQUFDO0lBQy9DO0lBRUEsSUFBSW5CLGdDQUFnQyxDQUFDLElBQUksQ0FBQ1YsR0FBRyxFQUFFLE9BQU8sQ0FBQyxFQUFFO01BQ3JESyxRQUFRLENBQUNPLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDWixHQUFHLENBQUM4QixLQUFLLENBQUNDLEtBQUssQ0FBQ0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUNsRTtJQUVBLElBQUl0QixnQ0FBZ0MsQ0FBQyxJQUFJLENBQUNWLEdBQUcsRUFBRSxRQUFRLENBQUMsRUFBRTtNQUN0REssUUFBUSxDQUFDTyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQ1osR0FBRyxDQUFDaUMsTUFBTSxDQUFDQyxLQUFLLENBQUNILEtBQUssQ0FBQ0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUMxRTtJQUVBLElBQUk1QixzQkFBc0IsRUFBRTtNQUN4QkMsUUFBUSxDQUFDTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQzNCO0lBRUEsT0FBT1AsUUFBUSxDQUFDOEIsSUFBSSxDQUFDLE1BQU0sQ0FBQztFQUNoQztFQUVBQyxnQ0FBZ0NBLENBQUNDLGFBQWEsRUFBRTtJQUN4QyxJQUFJQyxVQUFVLEdBQUdELGFBQWEsQ0FBQ0UsS0FBSyxDQUFDQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUNOLEtBQUs7SUFFbEQsSUFBSXhCLGdDQUFnQyxDQUFDMkIsYUFBYSxDQUFDRSxLQUFLLEVBQUUsT0FBTyxDQUFDLEVBQUU7TUFDaEUsSUFBSSxDQUFDckMsbUJBQW1CLENBQUNtQyxhQUFhLENBQUNFLEtBQUssQ0FBQ0UsS0FBSyxDQUFDRCxJQUFJLENBQUNOLEtBQUssQ0FBQyxHQUFHSSxVQUFVO0lBQy9FO0lBRUEsT0FBT0ksS0FBSyxDQUFDSixVQUFVLENBQUM7RUFDaEM7O0VBRUE7QUFDSjtBQUNBO0VBQ0l6Qix1QkFBdUJBLENBQUNQLFNBQVMsRUFBRTtJQUMvQixPQUFPLFlBQVksR0FBRyxJQUFJLENBQUM4QixnQ0FBZ0MsQ0FBQzlCLFNBQVMsQ0FBQ0ssUUFBUSxDQUFDLEdBQUcsR0FBRztFQUN6Rjs7RUFFQTtBQUNKO0FBQ0E7RUFDSUcscUJBQXFCQSxDQUFDNkIsTUFBTSxFQUFFckMsU0FBUyxFQUFFO0lBQ3JDLE9BQU9xQyxNQUFNLEdBQUcsd0JBQXdCLEdBQ2xDLElBQUksR0FBR0MsaUJBQWlCLENBQUUsSUFBSTlDLFNBQVMsQ0FBQ1EsU0FBUyxDQUFDSyxRQUFRLENBQUNrQyxPQUFPLENBQUNDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQzNDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBRTRDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsS0FBSyxHQUMvSSxJQUFJLEdBQUdMLEtBQUssQ0FBQ3BDLFNBQVMsQ0FBQ0ssUUFBUSxDQUFDa0MsT0FBTyxDQUFDSixLQUFLLENBQUNELElBQUksQ0FBQ04sS0FBSyxDQUFDLEdBQUcsR0FBRztFQUN6RTtFQUVBWCxtQkFBbUJBLENBQUN5QixjQUFjLEVBQUU7SUFDaEMsSUFBSUMsY0FBYyxHQUFHQyw0QkFBNEIsQ0FBQ0YsY0FBYyxDQUFDO0lBQ2pFLElBQUlHLFNBQVMsR0FBR0MsOEJBQThCLENBQUNKLGNBQWMsQ0FBQztJQUU5RCxPQUFPLElBQUksQ0FBQ0ssaUJBQWlCLENBQUNKLGNBQWMsRUFBRUUsU0FBUyxFQUFFLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQ2hCLElBQUksQ0FBQyxNQUFNLENBQUM7RUFDdEY7O0VBRUE7QUFDSjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDSWtCLGlCQUFpQkEsQ0FBQ0osY0FBYyxFQUFFRSxTQUFTLEVBQUVHLEVBQUUsRUFBRUMsV0FBVyxFQUFFO0lBQzFELElBQUlDLFVBQVUsR0FBRyxFQUFFO0lBRW5CLElBQUlQLGNBQWMsS0FBSyxRQUFRLElBQUlBLGNBQWMsS0FBSyxXQUFXLEVBQUU7TUFDL0QsSUFBSU0sV0FBVyxHQUFHTixjQUFjLEtBQUssUUFBUSxHQUFHLFdBQVcsR0FBRyxjQUFjO01BQzVFTyxVQUFVLENBQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDNkMsaUJBQWlCLENBQUNILEVBQUUsRUFBRUMsV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQ0csaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDRCxTQUFTLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQztJQUM1SixDQUFDLE1BQU0sSUFBSUYsY0FBYyxLQUFLLFFBQVEsRUFBRTtNQUNwQyxJQUFJVSxNQUFNLEdBQUcsSUFBSSxDQUFDRCxpQ0FBaUMsQ0FBQ04sOEJBQThCLENBQUNELFNBQVMsQ0FBQ1MsSUFBSSxDQUFDLENBQUM7TUFDbkcsSUFBSUMsSUFBSSxHQUFHVixTQUFTLENBQUNVLElBQUksQ0FBQ0MsR0FBRyxDQUFFQyxDQUFDLElBQUssSUFBSSxDQUFDQyxZQUFZLENBQUNELENBQUMsQ0FBQ2hDLEtBQUssQ0FBQyxDQUFDO01BRWhFLElBQUl3QixXQUFXLEdBQUdKLFNBQVMsQ0FBQ2MsT0FBTyxHQUFHLFlBQVksR0FBRyxTQUFTO01BQzlEVCxVQUFVLENBQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDNkMsaUJBQWlCLENBQUNILEVBQUUsRUFBRUMsV0FBVyxDQUFDLEdBQUcsR0FBRyxHQUFHSSxNQUFNLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBR0UsSUFBSSxDQUFDMUIsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNoSCxDQUFDLE1BQU0sSUFBSWMsY0FBYyxLQUFLLFFBQVEsRUFBRTtNQUNwQ08sVUFBVSxDQUFDNUMsSUFBSSxDQUNYLElBQUksQ0FBQzZDLGlCQUFpQixDQUFDSCxFQUFFLEVBQUVDLFdBQVcsQ0FBQyxHQUFHLHdCQUF3QixHQUNoRSxZQUFZLEdBQUlYLGlCQUFpQixDQUFDLElBQUksQ0FBQ3JCLG1CQUFtQixDQUFDNEIsU0FBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsT0FDbEYsQ0FBQztJQUNMLENBQUMsTUFBTSxJQUFJRixjQUFjLEtBQUssVUFBVSxFQUFFO01BQ3RDLElBQUlFLFNBQVMsQ0FBQ0csRUFBRSxLQUFLLEtBQUssSUFBSUgsU0FBUyxDQUFDRyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2pELElBQUlZLG1CQUFtQixHQUFHaEIsNEJBQTRCLENBQUNDLFNBQVMsQ0FBQ2dCLElBQUksQ0FBQztRQUN0RSxJQUFJQyxjQUFjLEdBQUdoQiw4QkFBOEIsQ0FBQ0QsU0FBUyxDQUFDZ0IsSUFBSSxDQUFDO1FBQ25FWCxVQUFVLEdBQUdBLFVBQVUsQ0FBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUNpQyxpQkFBaUIsQ0FBQ2EsbUJBQW1CLEVBQUVFLGNBQWMsRUFBRWQsRUFBRSxFQUFFQyxXQUFXLENBQUMsQ0FBQztRQUU1RyxJQUFJYyxvQkFBb0IsR0FBR25CLDRCQUE0QixDQUFDQyxTQUFTLENBQUNtQixLQUFLLENBQUM7UUFDeEUsSUFBSUMsZUFBZSxHQUFHbkIsOEJBQThCLENBQUNELFNBQVMsQ0FBQ21CLEtBQUssQ0FBQztRQUNyRWQsVUFBVSxHQUFHQSxVQUFVLENBQUNwQyxNQUFNLENBQUMsSUFBSSxDQUFDaUMsaUJBQWlCLENBQUNnQixvQkFBb0IsRUFBRUUsZUFBZSxFQUFFcEIsU0FBUyxDQUFDRyxFQUFFLEVBQUVDLFdBQVcsQ0FBQyxDQUFDO01BQzVILENBQUMsTUFBTTtRQUNILElBQUlZLElBQUksR0FBRyxJQUFJLENBQUNULGlDQUFpQyxDQUFDTiw4QkFBOEIsQ0FBQ0QsU0FBUyxDQUFDZ0IsSUFBSSxDQUFDLENBQUM7UUFDakcsSUFBSUcsS0FBSztRQUVULElBQUk1RCxnQ0FBZ0MsQ0FBQ3lDLFNBQVMsQ0FBQ21CLEtBQUssRUFBRSxZQUFZLEVBQUUsb0JBQW9CLENBQUMsRUFBRTtVQUN2RkEsS0FBSyxHQUFHLElBQUksQ0FBQ1osaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDRCxTQUFTLENBQUNtQixLQUFLLENBQUMsQ0FBQztVQUUvRixJQUFJZixXQUFXLENBQUNpQixRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDL0JGLEtBQUssR0FBRyxVQUFVLEdBQUdBLEtBQUssR0FBRyxHQUFHO1VBQ3BDO1FBQ0osQ0FBQyxNQUFNLElBQUk1RCxnQ0FBZ0MsQ0FBQ3lDLFNBQVMsQ0FBQ21CLEtBQUssRUFBRSxPQUFPLENBQUMsRUFBRTtVQUNuRWYsV0FBVyxHQUFHLE9BQU87VUFDckJlLEtBQUssR0FBRyxJQUFJLENBQUNOLFlBQVksQ0FBQ2IsU0FBUyxDQUFDbUIsS0FBSyxDQUFDdkMsS0FBSyxDQUFDO1FBQ3BELENBQUMsTUFBTSxJQUFJckIsZ0NBQWdDLENBQUN5QyxTQUFTLENBQUNtQixLQUFLLEVBQUUsVUFBVSxDQUFDLEVBQUU7VUFDdEVBLEtBQUssR0FBRyxzQkFBc0IsR0FDeEIsSUFBSSxHQUFHMUIsaUJBQWlCLENBQUUsSUFBSTlDLFNBQVMsQ0FBQ3FELFNBQVMsQ0FBQ21CLEtBQUssQ0FBQ0csUUFBUSxFQUFFLElBQUksQ0FBQyxDQUFDdEUsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFFNEMsT0FBTyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLEdBQ3BJLEdBQUc7UUFDYixDQUFDLE1BQU0sSUFBSXJDLGdDQUFnQyxDQUFDeUMsU0FBUyxDQUFDbUIsS0FBSyxFQUFFLFVBQVUsQ0FBQyxFQUFFO1VBQ3RFQSxLQUFLLEdBQUcsVUFBVSxHQUFHLElBQUksQ0FBQ0ksaUJBQWlCLENBQUN2QixTQUFTLENBQUNtQixLQUFLLENBQUNLLFFBQVEsQ0FBQyxHQUFHLEdBQUc7UUFDL0UsQ0FBQyxNQUFNO1VBQ0gsTUFBTSw4Q0FBOEMsR0FBR3pCLDRCQUE0QixDQUFDQyxTQUFTLENBQUNtQixLQUFLLENBQUM7UUFDeEc7UUFFQWQsVUFBVSxDQUFDNUMsSUFBSSxDQUFDLElBQUksQ0FBQzZDLGlCQUFpQixDQUFDSCxFQUFFLEVBQUVDLFdBQVcsQ0FBQyxHQUFHLEdBQUcsR0FBR1ksSUFBSSxHQUFHLEdBQUcsR0FBR3pCLEtBQUssQ0FBQyxJQUFJLENBQUNrQyxpQkFBaUIsQ0FBQ3pCLFNBQVMsQ0FBQ0csRUFBRSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUdnQixLQUFLLEdBQUcsR0FBRyxDQUFDO01BQ2pKO0lBQ0osQ0FBQyxNQUFNLElBQUlyQixjQUFjLEtBQUssUUFBUSxFQUFFO01BQ3BDTyxVQUFVLENBQUM1QyxJQUFJLENBQ1gsSUFBSSxDQUFDNkMsaUJBQWlCLENBQUNILEVBQUUsRUFBRSxhQUFhLENBQUMsR0FBRyx3QkFBd0IsR0FDcEUsSUFBSSxHQUFJVixpQkFBaUIsQ0FBRSxJQUFJOUMsU0FBUyxDQUFDcUQsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFFaEQsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDNEMsT0FBTyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsR0FBRyxLQUFLLEdBQ3RILEdBQ0osQ0FBQztJQUNMLENBQUMsTUFBTSxJQUFJRSxjQUFjLEtBQUssU0FBUyxFQUFFO01BQ3JDLElBQUlNLFdBQVcsR0FBR0osU0FBUyxDQUFDYyxPQUFPLEtBQUssSUFBSSxHQUFHLGlCQUFpQixHQUFHLGNBQWM7TUFFakZULFVBQVUsQ0FBQzVDLElBQUksQ0FDYixJQUFJLENBQUM2QyxpQkFBaUIsQ0FBQ0gsRUFBRSxFQUFFQyxXQUFXLENBQUMsR0FBRyxHQUFHLEdBQzNDLElBQUksQ0FBQ0csaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDRCxTQUFTLENBQUNTLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUM1RixHQUFHLEdBQUcsSUFBSSxDQUFDSSxZQUFZLENBQUNiLFNBQVMsQ0FBQzBCLEdBQUcsQ0FBQzlDLEtBQUssQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUNpQyxZQUFZLENBQUNiLFNBQVMsQ0FBQzJCLElBQUksQ0FBQy9DLEtBQUssQ0FBQyxHQUFHLElBQ25HLENBQUM7SUFDTCxDQUFDLE1BQU0sSUFBSWtCLGNBQWMsS0FBSyxZQUFZLEVBQUU7TUFDeEMsSUFBSU0sV0FBVyxHQUFHSixTQUFTLENBQUNjLE9BQU8sS0FBSyxJQUFJLEdBQUcsWUFBWSxHQUFHLFNBQVM7TUFFdkVULFVBQVUsQ0FBQzVDLElBQUksQ0FDYixJQUFJLENBQUM2QyxpQkFBaUIsQ0FBQ0gsRUFBRSxFQUFFQyxXQUFXLENBQUMsR0FDckMsR0FBRyxHQUFHLElBQUksQ0FBQ0csaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDRCxTQUFTLENBQUNTLElBQUksQ0FBQyxDQUFDLEdBQUcsR0FBRyxHQUFHLHdCQUF3QixHQUM3SCxJQUFJLEdBQUdoQixpQkFBaUIsQ0FBRSxJQUFJOUMsU0FBUyxDQUFDcUQsU0FBUyxDQUFDTCxRQUFRLEVBQUUsSUFBSSxDQUFDLENBQUUzQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM0QyxPQUFPLENBQUMsV0FBVyxFQUFFLGNBQWMsQ0FBQyxHQUFHLEtBQUssR0FDOUgsR0FDSixDQUFDO0lBQ0wsQ0FBQyxNQUFNLElBQUlFLGNBQWMsS0FBSyxVQUFVLEVBQUU7TUFDdENPLFVBQVUsQ0FBQzVDLElBQUksQ0FBQyxJQUFJLENBQUM2QyxpQkFBaUIsQ0FBQ0gsRUFBRSxFQUFFQyxXQUFXLENBQUMsR0FBRyxZQUFZLEdBQUcsSUFBSSxDQUFDbUIsaUJBQWlCLENBQUN2QixTQUFTLEVBQUUsS0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQzlILENBQUMsTUFBTSxJQUFJRixjQUFjLEtBQUssU0FBUyxFQUFFO01BQ3JDTyxVQUFVLENBQUM1QyxJQUFJLENBQUMsSUFBSSxDQUFDeUMsaUJBQWlCLENBQUNILDRCQUE0QixDQUFDQyxTQUFTLENBQUNTLElBQUksQ0FBQyxFQUFFUiw4QkFBOEIsQ0FBQ0QsU0FBUyxDQUFDUyxJQUFJLENBQUMsRUFBRU4sRUFBRSxFQUFFQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ1IsT0FBTyxDQUFDLFFBQVEsRUFBRSxPQUFPLEdBQUdJLFNBQVMsQ0FBQ0csRUFBRSxDQUFDLENBQUM7SUFDdk0sQ0FBQyxNQUFNO01BQ0gsTUFBTSx5Q0FBeUMsR0FBR0wsY0FBYyxHQUFHLEdBQUc7SUFDMUU7SUFFQSxPQUFPTyxVQUFVO0VBQ3JCOztFQUVBO0FBQ0o7QUFDQTtBQUNBO0VBQ0lvQixpQkFBaUJBLENBQUN0QixFQUFFLEVBQUU7SUFDbEIsSUFBSXlCLGNBQWMsR0FBRztNQUNqQixJQUFJLEVBQUUsR0FBRztNQUNULElBQUksRUFBRSxHQUFHO01BQ1QsTUFBTSxFQUFFLElBQUk7TUFDWixJQUFJLEVBQUUsR0FBRztNQUNULE1BQU0sRUFBRSxHQUFHO01BQ1gsT0FBTyxFQUFFLElBQUk7TUFDYixNQUFNLEVBQUUsTUFBTTtNQUNkLE9BQU8sRUFBRSxHQUFHO01BQ1osTUFBTSxFQUFFLEdBQUc7TUFDWCxVQUFVLEVBQUUsR0FBRztNQUNmLFFBQVEsRUFBRTtJQUNkLENBQUM7SUFFRCxPQUFPQSxjQUFjLENBQUN6QixFQUFFLENBQUM7RUFDN0I7RUFFQUcsaUJBQWlCQSxDQUFDSCxFQUFFLEVBQUVDLFdBQVcsRUFBRTtJQUMvQixJQUFJRCxFQUFFLEtBQUssRUFBRSxJQUFJQSxFQUFFLEtBQUssS0FBSyxFQUFFO01BQzNCLE9BQU9DLFdBQVc7SUFDdEI7SUFFQSxPQUFPRCxFQUFFLENBQUMwQixXQUFXLENBQUMsQ0FBQyxHQUFHQyxxQkFBcUIsQ0FBQzFCLFdBQVcsQ0FBQztFQUNoRTs7RUFFQTtBQUNKO0FBQ0E7RUFDSWpDLG9CQUFvQkEsQ0FBQSxFQUFHO0lBQ25CLElBQUk0RCxHQUFHLEdBQUcsRUFBRTtJQUVaLEtBQUssTUFBTUMsV0FBVyxJQUFJLElBQUksQ0FBQ25GLEdBQUcsQ0FBQ08sSUFBSSxDQUFDQyxNQUFNLENBQUM0RSxVQUFVLEVBQUU7TUFDdkQsSUFBSTFFLGdDQUFnQyxDQUFDeUUsV0FBVyxFQUFFLGVBQWUsQ0FBQyxFQUFFO1FBQ2hFLElBQUkxQyxLQUFLLEdBQUcwQyxXQUFXLENBQUNFLGFBQWEsQ0FBQzVDLEtBQUssQ0FBQ1AsS0FBSztRQUNqRGdELEdBQUcsQ0FBQ3RFLElBQUksQ0FBQyxJQUFJLENBQUMwRSx3QkFBd0IsQ0FBQ0gsV0FBVyxDQUFDRSxhQUFhLENBQUN6QixJQUFJLEVBQUVuQixLQUFLLENBQUMsQ0FBQztNQUNsRixDQUFDLE1BQU0sSUFBSS9CLGdDQUFnQyxDQUFDeUUsV0FBVyxFQUFFLGFBQWEsQ0FBQyxFQUFFO1FBQ3JFRCxHQUFHLENBQUN0RSxJQUFJLENBQUMsSUFBSSxDQUFDMEUsd0JBQXdCLENBQUNILFdBQVcsQ0FBQ0ksV0FBVyxDQUFDLENBQUM7TUFDcEUsQ0FBQyxNQUFNLElBQUlKLFdBQVcsS0FBSyxVQUFVLEVBQUU7UUFDbkNELEdBQUcsQ0FBQ3RFLElBQUksQ0FBQzhCLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztNQUN4QixDQUFDLE1BQU0sSUFBSWhDLGdDQUFnQyxDQUFDeUUsV0FBVyxFQUFFLG1CQUFtQixDQUFDLEVBQUU7UUFDM0VELEdBQUcsQ0FBQ3RFLElBQUksQ0FBQzhCLEtBQUssQ0FBQyxJQUFJLENBQUM4QyxrQkFBa0IsQ0FBQ0wsV0FBVyxDQUFDTSxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQ3ZELEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO01BQzNGLENBQUMsTUFBTTtRQUNILE1BQU0sc0NBQXNDLEdBQUd3RCxNQUFNLENBQUNDLElBQUksQ0FBQ1IsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRztNQUNwRjtJQUNKO0lBRUEsT0FBTyxTQUFTLEdBQUdELEdBQUcsQ0FBQy9DLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHO0VBQzNDOztFQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSW1ELHdCQUF3QkEsQ0FBQ0gsV0FBVyxFQUFFMUMsS0FBSyxHQUFHLElBQUksRUFBRTtJQUNoRG1ELE1BQU0sQ0FBQ0MsaUJBQWlCLENBQUNWLFdBQVcsQ0FBQyxLQUFLLEtBQUssRUFBRSwyQ0FBMkMsQ0FBQztJQUU3RixJQUFJVyxJQUFJO0lBQ1IsSUFBSXBGLGdDQUFnQyxDQUFDeUUsV0FBVyxFQUFFLFVBQVUsQ0FBQyxFQUFFO01BQzNEVyxJQUFJLEdBQUcsV0FBVyxHQUFHLElBQUksQ0FBQ3BCLGlCQUFpQixDQUFDUyxXQUFXLENBQUNSLFFBQVEsQ0FBQztNQUVqRSxJQUFJbEMsS0FBSyxLQUFLLElBQUksRUFBRTtRQUNoQnFELElBQUksR0FBR0EsSUFBSSxHQUFHLE1BQU0sR0FBR3JELEtBQUssR0FBRyxJQUFJO01BQ3ZDO01BRUEsT0FBT3FELElBQUk7SUFDZixDQUFDLE1BQU07TUFDSEEsSUFBSSxHQUFHLElBQUksQ0FBQ3BDLGlDQUFpQyxDQUFDTiw4QkFBOEIsQ0FBQytCLFdBQVcsQ0FBQyxFQUFFLEtBQUssQ0FBQztNQUVqRyxJQUFJMUMsS0FBSyxLQUFLLElBQUksRUFBRTtRQUNoQnFELElBQUksR0FBR0EsSUFBSSxHQUFHLE1BQU0sR0FBR3JELEtBQUs7TUFDaEM7TUFFQSxPQUFPQyxLQUFLLENBQUNvRCxJQUFJLENBQUM7SUFDdEI7RUFDSjtFQUVBcEIsaUJBQWlCQSxDQUFDcUIsYUFBYSxFQUFFQyxVQUFVLEdBQUcsSUFBSSxFQUFFO0lBQ2hELElBQUlDLGFBQWEsR0FBR0YsYUFBYSxDQUFDdkQsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDTixLQUFLO0lBRS9DLElBQUk4RCxVQUFVLEVBQUU7TUFDWkMsYUFBYSxHQUFHdkQsS0FBSyxDQUFDdUQsYUFBYSxDQUFDO0lBQ3hDO0lBRUEsSUFBSWYsR0FBRyxHQUFHZSxhQUFhLEdBQUcsR0FBRztJQUM3QixJQUFJQyxJQUFJLEdBQUdILGFBQWEsQ0FBQ0csSUFBSTtJQUM3QixJQUFJQyxTQUFTLEdBQUdELElBQUksQ0FBQy9FLE1BQU07SUFFM0IsS0FBSyxJQUFJNEMsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHb0MsU0FBUyxFQUFFcEMsQ0FBQyxFQUFFLEVBQUU7TUFDaEMsSUFBSXFDLEdBQUcsR0FBR0YsSUFBSSxDQUFDbkMsQ0FBQyxDQUFDO01BRWpCLElBQUlxQyxHQUFHLENBQUNDLE9BQU8sS0FBSyxVQUFVLEVBQUU7UUFDNUJuQixHQUFHLEdBQUdBLEdBQUcsR0FBRyxHQUFHO01BQ25CLENBQUMsTUFBTSxJQUFJeEUsZ0NBQWdDLENBQUMwRixHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxFQUFFLE9BQU8sQ0FBQyxFQUFFO1FBQ3BFcEIsR0FBRyxHQUFHQSxHQUFHLEdBQUcsSUFBSSxDQUFDbEIsWUFBWSxDQUFDb0MsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQ3ZFLEtBQUssQ0FBQztNQUN6RCxDQUFDLE1BQU0sSUFBSXJCLGdDQUFnQyxDQUFDMEYsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksRUFBRSxZQUFZLENBQUMsRUFBRTtRQUN6RXBCLEdBQUcsR0FBR0EsR0FBRyxHQUFHa0IsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQ0MsVUFBVSxDQUFDckUsS0FBSztNQUNqRCxDQUFDLE1BQU0sSUFBSXhCLGdDQUFnQyxDQUFDMEYsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksRUFBRSxvQkFBb0IsQ0FBQyxFQUFFO1FBQ2pGcEIsR0FBRyxHQUFHQSxHQUFHLEdBQUcsSUFBSSxDQUFDeEIsaUNBQWlDLENBQUMwQyxHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDRSxrQkFBa0IsQ0FBQztNQUMzRixDQUFDLE1BQU0sSUFBSTlGLGdDQUFnQyxDQUFDMEYsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksRUFBRSxRQUFRLENBQUMsRUFBRTtRQUFFO1FBQ3ZFLElBQUlHLFVBQVUsR0FBRyxJQUFJLENBQUMvQyxpQ0FBaUMsQ0FBQ04sOEJBQThCLENBQUNnRCxHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxDQUFDSSxNQUFNLENBQUMsQ0FBQztRQUVoSCxJQUFJWCxhQUFhLENBQUNZLFFBQVEsS0FBSyxJQUFJLEVBQUU7VUFDakNGLFVBQVUsR0FBRyxXQUFXLEdBQUdBLFVBQVUsR0FBRyxHQUFHO1FBQy9DO1FBRUF2QixHQUFHLEdBQUdBLEdBQUcsR0FBR3VCLFVBQVU7TUFDMUIsQ0FBQyxNQUFNLElBQUkvRixnQ0FBZ0MsQ0FBQzBGLEdBQUcsQ0FBQ0MsT0FBTyxDQUFDQyxJQUFJLEVBQUUsVUFBVSxDQUFDLEVBQUU7UUFDdkVwQixHQUFHLEdBQUdBLEdBQUcsR0FBRyxJQUFJLENBQUNSLGlCQUFpQixDQUFDMEIsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQzNCLFFBQVEsRUFBRSxLQUFLLENBQUM7TUFDeEUsQ0FBQyxNQUFNLElBQUlqRSxnQ0FBZ0MsQ0FBQzBGLEdBQUcsQ0FBQ0MsT0FBTyxDQUFDQyxJQUFJLEVBQUUsVUFBVSxDQUFDLEVBQUU7UUFDdkVwQixHQUFHLEdBQUdBLEdBQUcsR0FBRyxJQUFJLENBQUMwQixpQkFBaUIsQ0FBQ1IsR0FBRyxDQUFDQyxPQUFPLENBQUNDLElBQUksQ0FBQ08sUUFBUSxDQUFDO01BQ2pFLENBQUMsTUFBTSxJQUFJbkcsZ0NBQWdDLENBQUMwRixHQUFHLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxFQUFFLFNBQVMsQ0FBQyxFQUFFO1FBQ3RFO01BQUEsQ0FDSCxNQUFNLElBQUk1RixnQ0FBZ0MsQ0FBQzBGLEdBQUcsQ0FBQ0MsT0FBTyxDQUFDQyxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUU7UUFDbkU7TUFBQSxDQUNILE1BQU07UUFDSDtNQUFBO01BSUosSUFBSXZDLENBQUMsS0FBS29DLFNBQVMsR0FBRyxDQUFDLEVBQUU7UUFDckJqQixHQUFHLEdBQUdBLEdBQUcsR0FBRyxJQUFJO01BQ3BCO0lBQ0o7SUFFQUEsR0FBRyxHQUFHQSxHQUFHLEdBQUcsR0FBRztJQUVmLE9BQU9BLEdBQUc7RUFDZDs7RUFFQTtBQUNKO0FBQ0E7RUFDSWxFLGNBQWNBLENBQUNWLFNBQVMsRUFBRTtJQUN0QixPQUFPSSxnQ0FBZ0MsQ0FBQ0osU0FBUyxFQUFFLE9BQU8sQ0FBQyxJQUFJQSxTQUFTLENBQUN3RyxLQUFLLENBQUMzRixNQUFNLEdBQUcsQ0FBQztFQUM3RjtFQUVBNEYsb0JBQW9CQSxDQUFDQyxhQUFhLEVBQUU7SUFDaEMsSUFBSTlCLEdBQUc7SUFFUCxJQUFJeEUsZ0NBQWdDLENBQUNzRyxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7TUFDN0Q5QixHQUFHLEdBQUd4QyxLQUFLLENBQUMsSUFBSSxDQUFDZ0MsaUJBQWlCLENBQUNzQyxhQUFhLENBQUNyQyxRQUFRLENBQUMsQ0FBQztJQUMvRCxDQUFDLE1BQU0sSUFBSWpFLGdDQUFnQyxDQUFDc0csYUFBYSxFQUFFLFlBQVksRUFBRSxvQkFBb0IsQ0FBQyxFQUFDO01BQzNGOUIsR0FBRyxHQUFHLElBQUksQ0FBQ3hCLGlDQUFpQyxDQUFDTiw4QkFBOEIsQ0FBQzRELGFBQWEsQ0FBQyxDQUFDO0lBQy9GLENBQUMsTUFBTSxJQUFJdEcsZ0NBQWdDLENBQUNzRyxhQUFhLEVBQUUsT0FBTyxDQUFDLEVBQUU7TUFDakU5QixHQUFHLEdBQUcsSUFBSSxDQUFDbEIsWUFBWSxDQUFDZ0QsYUFBYSxDQUFDakYsS0FBSyxDQUFDO0lBQ2hELENBQUMsTUFBTSxJQUFJckIsZ0NBQWdDLENBQUNzRyxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7TUFDcEU5QixHQUFHLEdBQUcsSUFBSSxDQUFDMEIsaUJBQWlCLENBQUNJLGFBQWEsQ0FBQ0gsUUFBUSxDQUFDO0lBQ3hELENBQUMsTUFBTSxJQUFJbkcsZ0NBQWdDLENBQUNzRyxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7TUFDcEU7SUFBQSxDQUNILE1BQU07TUFDSCxNQUFNLHlEQUF5RDtJQUNuRTtJQUVBLE9BQU85QixHQUFHO0VBQ2Q7RUFFQTBCLGlCQUFpQkEsQ0FBQ0ssU0FBUyxFQUFFQyxTQUFTLEdBQUcsR0FBRyxFQUFFO0lBQzFDLElBQUkvQyxJQUFJLEdBQUcsSUFBSSxDQUFDNEMsb0JBQW9CLENBQUNFLFNBQVMsQ0FBQzlDLElBQUksQ0FBQztJQUNwRCxJQUFJYixFQUFFLEdBQUdaLEtBQUssQ0FBQyxJQUFJLENBQUNrQyxpQkFBaUIsQ0FBQ3FDLFNBQVMsQ0FBQzNELEVBQUUsQ0FBQyxDQUFDO0lBQ3BELElBQUlnQixLQUFLLEdBQUcsSUFBSSxDQUFDeUMsb0JBQW9CLENBQUNFLFNBQVMsQ0FBQzNDLEtBQUssQ0FBQztJQUV0RCxPQUFPLENBQUNILElBQUksRUFBRWIsRUFBRSxFQUFFZ0IsS0FBSyxDQUFDLENBQUNuQyxJQUFJLENBQUMrRSxTQUFTLENBQUM7RUFDNUM7RUFFQUMsWUFBWUEsQ0FBQzdHLFNBQVMsRUFBRTtJQUNwQixJQUFJd0csS0FBSyxHQUFHLEVBQUU7SUFFZCxLQUFLLE1BQU0zRSxJQUFJLElBQUk3QixTQUFTLENBQUN3RyxLQUFLLEVBQUU7TUFDaEMsSUFBSU0sa0JBQWtCLEdBQUdsRSw0QkFBNEIsQ0FBQ2YsSUFBSSxDQUFDa0YsYUFBYSxDQUFDO01BQ3pFLElBQUlDLFdBQVcsR0FBRztRQUNkLE9BQU8sRUFBRSxNQUFNO1FBQ2YsV0FBVyxFQUFFLFVBQVU7UUFDdkIsWUFBWSxFQUFFO01BQ2xCLENBQUMsQ0FBQ0Ysa0JBQWtCLENBQUM7TUFDckIsSUFBSUMsYUFBYSxHQUFHakUsOEJBQThCLENBQUNqQixJQUFJLENBQUNrRixhQUFhLENBQUM7TUFDdEUsSUFBSXBFLGNBQWMsR0FBR0MsNEJBQTRCLENBQUNtRSxhQUFhLENBQUNFLEVBQUUsQ0FBQztNQUNuRSxJQUFJcEUsU0FBUyxHQUFHQyw4QkFBOEIsQ0FBQ2lFLGFBQWEsQ0FBQ0UsRUFBRSxDQUFDO01BQ2hFLElBQUkvRCxVQUFVLEdBQUcsSUFBSSxDQUFDSCxpQkFBaUIsQ0FBQ0osY0FBYyxFQUFFRSxTQUFTLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQztNQUU1RSxJQUFJekMsZ0NBQWdDLENBQUN5QixJQUFJLENBQUN4QixRQUFRLEVBQUUsU0FBUyxDQUFDLEVBQUU7UUFBRTtRQUM5RCxJQUFJNkcsYUFBYSxHQUFHLElBQUkxSCxTQUFTLENBQUNxQyxJQUFJLENBQUN4QixRQUFRLENBQUNrQyxPQUFPLENBQUNDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQzNDLEdBQUcsQ0FBQyxLQUFLLENBQUM7UUFDbEYsSUFBSXNILGVBQWUsR0FBR3RGLElBQUksQ0FBQ3hCLFFBQVEsQ0FBQ2tDLE9BQU8sQ0FBQ0osS0FBSyxDQUFDRCxJQUFJLENBQUNOLEtBQUs7UUFDNUQ0RSxLQUFLLENBQUNsRyxJQUFJLENBQUMwRyxXQUFXLEdBQUcsWUFBWSxHQUFHMUUsaUJBQWlCLENBQUM0RSxhQUFhLENBQUMsR0FBRyxRQUFRLEdBQzdFQyxlQUFlLEdBQUcsMEJBQTBCLEdBQzVDLFNBQVMsR0FBRzdFLGlCQUFpQixDQUFDWSxVQUFVLENBQUNyQixJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQyxHQUMvRCxLQUFLLENBQUM7TUFDaEIsQ0FBQyxNQUFNLElBQUl6QixnQ0FBZ0MsQ0FBQ3lCLElBQUksQ0FBQ3hCLFFBQVEsRUFBRSxPQUFPLENBQUMsRUFBRTtRQUNqRSxJQUFJK0csWUFBWSxHQUFHLElBQUksQ0FBQ3RGLGdDQUFnQyxDQUFDRCxJQUFJLENBQUN4QixRQUFRLENBQUM7UUFFdkUsSUFBSTZDLFVBQVUsQ0FBQ3JDLE1BQU0sS0FBSyxDQUFDLEVBQUU7VUFDekIsSUFBSVQsZ0NBQWdDLENBQUMyRyxhQUFhLENBQUNFLEVBQUUsRUFBRSxVQUFVLENBQUMsRUFBRTtZQUNoRVQsS0FBSyxDQUFDbEcsSUFBSSxDQUFDMEcsV0FBVyxHQUFHLEdBQUcsR0FBR0ksWUFBWSxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUNkLGlCQUFpQixDQUFDUyxhQUFhLENBQUNFLEVBQUUsQ0FBQ1YsUUFBUSxFQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQztVQUNySCxDQUFDLE1BQU0sSUFBSW5HLGdDQUFnQyxDQUFDMkcsYUFBYSxDQUFDRSxFQUFFLEVBQUUsUUFBUSxDQUFDLEVBQUM7WUFDcEUsSUFBSS9ELFVBQVUsR0FBRyxJQUFJLENBQUNILGlCQUFpQixDQUFDLFFBQVEsRUFBRWdFLGFBQWEsQ0FBQ0UsRUFBRSxDQUFDYixNQUFNLEVBQUUsRUFBRSxFQUFFLElBQUksQ0FBQztZQUVwRkksS0FBSyxDQUFDbEcsSUFBSSxDQUFDNEMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1VBQzdCLENBQUMsTUFBTTtZQUNILE1BQU0sZ0NBQWdDO1VBQzFDO1FBQ0osQ0FBQyxNQUFNO1VBQ0hzRCxLQUFLLENBQUNsRyxJQUFJLENBQUMwRyxXQUFXLEdBQUcsR0FBRyxHQUFHSSxZQUFZLEdBQUcsR0FBRyxHQUMzQyx1QkFBdUIsR0FDdkIsU0FBUyxHQUFHOUUsaUJBQWlCLENBQUNZLFVBQVUsQ0FBQ3JCLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEdBQUcsR0FDNUQsTUFDTixDQUFDO1FBQ0w7TUFDSixDQUFDLE1BQU07UUFDSCxNQUFNLDJDQUEyQztNQUNyRDtJQUNKO0lBRUEsT0FBTzJFLEtBQUs7RUFDaEI7RUFFQTdGLGtCQUFrQkEsQ0FBQ1gsU0FBUyxFQUFFO0lBQzFCLE9BQU8sSUFBSSxDQUFDNkcsWUFBWSxDQUFDN0csU0FBUyxDQUFDLENBQUM2QixJQUFJLENBQUMsTUFBTSxDQUFDO0VBQ3BEOztFQUVBO0FBQ0o7QUFDQTtBQUNBO0VBQ0lkLHVCQUF1QkEsQ0FBQ3NHLFVBQVUsRUFBRTtJQUNoQyxJQUFJQyxtQkFBbUIsR0FBRyxFQUFFO0lBRTVCLEtBQUssTUFBTXRILFNBQVMsSUFBSXFILFVBQVUsRUFBRTtNQUNoQyxJQUFJRSxjQUFjO01BRWxCLElBQUluSCxnQ0FBZ0MsQ0FBQ0osU0FBUyxDQUFDSyxRQUFRLEVBQUUsT0FBTyxDQUFDLEVBQUU7UUFDL0RrSCxjQUFjLEdBQUcsWUFBWSxHQUFHLElBQUksQ0FBQ3pGLGdDQUFnQyxDQUFDOUIsU0FBUyxDQUFDSyxRQUFRLENBQUM7TUFDN0YsQ0FBQyxNQUFNLElBQUlELGdDQUFnQyxDQUFDSixTQUFTLENBQUNLLFFBQVEsRUFBRSxTQUFTLENBQUMsRUFBRTtRQUN4RWtILGNBQWMsR0FBRyxJQUFJLENBQUMvRyxxQkFBcUIsQ0FBQyxjQUFjLEVBQUVSLFNBQVMsQ0FBQztNQUMxRSxDQUFDLE1BQU07UUFDSCxNQUFNLGlEQUFpRDtNQUMzRDtNQUVBc0gsbUJBQW1CLENBQUNoSCxJQUFJLENBQUNpSCxjQUFjLENBQUM7SUFDNUM7SUFFQSxPQUFPRCxtQkFBbUI7RUFDOUI7RUFFQWxHLHFCQUFxQkEsQ0FBQSxFQUFHO0lBQ3BCLElBQUlvRyxnQkFBZ0IsR0FBRyxFQUFFO0lBRXpCLEtBQUssTUFBTUMsYUFBYSxJQUFJLElBQUksQ0FBQy9ILEdBQUcsQ0FBQ08sSUFBSSxDQUFDQyxNQUFNLENBQUNpQixRQUFRLEVBQUU7TUFDdkQsSUFBSWYsZ0NBQWdDLENBQUNxSCxhQUFhLEVBQUUsVUFBVSxDQUFDLEVBQUU7UUFDN0RELGdCQUFnQixDQUFDbEgsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM4RCxpQkFBaUIsQ0FBQ3FELGFBQWEsQ0FBQ3BELFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQztNQUM3RixDQUFDLE1BQU0sSUFBR2pFLGdDQUFnQyxDQUFDcUgsYUFBYSxFQUFFLFlBQVksRUFBRSxvQkFBb0IsQ0FBQyxFQUFFO1FBQzNGRCxnQkFBZ0IsQ0FBQ2xILElBQUksQ0FBQyxJQUFJLENBQUM4QyxpQ0FBaUMsQ0FBQ04sOEJBQThCLENBQUMyRSxhQUFhLENBQUMsQ0FBQyxDQUFDO01BQ2hILENBQUMsTUFBTSxJQUFJckgsZ0NBQWdDLENBQUNxSCxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsQ0FDdEUsQ0FBQyxNQUFNLElBQUlySCxnQ0FBZ0MsQ0FBQ3FILGFBQWEsRUFBRSxPQUFPLENBQUMsRUFBRTtRQUNqRUQsZ0JBQWdCLENBQUNsSCxJQUFJLENBQUMsSUFBSSxDQUFDb0QsWUFBWSxDQUFDK0QsYUFBYSxDQUFDaEcsS0FBSyxDQUFDLENBQUM7TUFDakUsQ0FBQyxNQUFNO1FBQ0gsTUFBTSx1Q0FBdUMsR0FBR21CLDRCQUE0QixDQUFDNkUsYUFBYSxDQUFDO01BQy9GO0lBQ0o7SUFFQSxPQUFPLFVBQVUsR0FBR0QsZ0JBQWdCLENBQUMzRixJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsR0FBRztFQUN4RDtFQUVBUixvQkFBb0JBLENBQUEsRUFBRztJQUNuQixJQUFJc0YsU0FBUyxHQUFHN0QsOEJBQThCLENBQUMsSUFBSSxDQUFDcEQsR0FBRyxDQUFDTyxJQUFJLENBQUNDLE1BQU0sQ0FBQ3dILE1BQU0sRUFBRSxVQUFVLENBQUM7SUFDdkYsSUFBSXpFLFdBQVcsR0FBRzdDLGdDQUFnQyxDQUFDdUcsU0FBUyxDQUFDOUMsSUFBSSxFQUFFLFVBQVUsQ0FBQyxHQUFHLFdBQVcsR0FBRyxRQUFRO0lBRXZHLE9BQU9aLFdBQVcsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDcUQsaUJBQWlCLENBQUNLLFNBQVMsRUFBRSxHQUFHLENBQUMsR0FBRyxHQUFHO0VBQzNFOztFQUVBO0FBQ0o7QUFDQTtFQUNJcEYscUJBQXFCQSxDQUFBLEVBQUc7SUFDcEIsSUFBSW9HLFNBQVMsR0FBRyxFQUFFO0lBRWxCLEtBQUssTUFBTUMsYUFBYSxJQUFJLElBQUksQ0FBQ2xJLEdBQUcsQ0FBQzRCLFFBQVEsRUFBRTtNQUMzQyxJQUFJbEIsZ0NBQWdDLENBQUN3SCxhQUFhLENBQUN0RSxJQUFJLEVBQUUsVUFBVSxDQUFDLEVBQUU7UUFDbEVxRSxTQUFTLENBQUNySCxJQUFJLENBQUMsYUFBYSxHQUFHOEIsS0FBSyxDQUFDLElBQUksQ0FBQ2tFLGlCQUFpQixDQUFDc0IsYUFBYSxDQUFDdEUsSUFBSSxDQUFDaUQsUUFBUSxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7TUFDcEcsQ0FBQyxNQUFNLElBQUluRyxnQ0FBZ0MsQ0FBQ3dILGFBQWEsQ0FBQ3RFLElBQUksRUFBRSxZQUFZLEVBQUUsb0JBQW9CLENBQUMsRUFBRTtRQUNqR3FFLFNBQVMsQ0FBQ3JILElBQUksQ0FDVixVQUFVLEdBQ1YsSUFBSSxDQUFDOEMsaUNBQWlDLENBQUNOLDhCQUE4QixDQUFDOEUsYUFBYSxDQUFDdEUsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQ2hHbEIsS0FBSyxDQUFDd0YsYUFBYSxDQUFDQyxHQUFHLEtBQUssS0FBSyxHQUFHLE1BQU0sR0FBRSxLQUFLLENBQUMsR0FBRyxHQUN6RCxDQUFDO01BQ0wsQ0FBQyxNQUFNLElBQUl6SCxnQ0FBZ0MsQ0FBQ3dILGFBQWEsQ0FBQ3RFLElBQUksRUFBRSxVQUFVLENBQUMsRUFBRTtRQUN6RXFFLFNBQVMsQ0FBQ3JILElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxDQUFDOEQsaUJBQWlCLENBQUN3RCxhQUFhLENBQUN0RSxJQUFJLENBQUNlLFFBQVEsQ0FBQyxHQUFHLEdBQUcsSUFBSXVELGFBQWEsQ0FBQ0MsR0FBRyxLQUFLLEtBQUssR0FBRyxNQUFNLEdBQUUsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDO01BQ3JKLENBQUMsTUFBTTtRQUNILE1BQU0sdUNBQXVDLEdBQUdqRiw0QkFBNEIsQ0FBQ2dGLGFBQWEsQ0FBQ3RFLElBQUksQ0FBQztNQUNwRztJQUNKO0lBRUEsT0FBT3FFLFNBQVMsQ0FBQzlGLElBQUksQ0FBQyxNQUFNLENBQUM7RUFDakM7O0VBRUE7QUFDSjtBQUNBO0FBQ0E7RUFDSTZCLFlBQVlBLENBQUNvRSxTQUFTLEVBQUU7SUFDcEIsSUFBSUMsUUFBUSxDQUFDRCxTQUFTLENBQUMsSUFBSUEsU0FBUyxDQUFDcEQsV0FBVyxDQUFDLENBQUMsS0FBSyxNQUFNLEVBQUU7TUFDM0QsT0FBTyxNQUFNO0lBQ2pCO0lBRUEsSUFBSTlDLEtBQUssR0FBR2tCLDhCQUE4QixDQUFDZ0YsU0FBUyxDQUFDO0lBQ3JELElBQUlFLFVBQVUsR0FBR3BGLDRCQUE0QixDQUFDa0YsU0FBUyxDQUFDO0lBRXhELElBQUlFLFVBQVUsS0FBSyxvQkFBb0IsRUFBRTtNQUNyQyxPQUFPNUYsS0FBSyxDQUFDUixLQUFLLENBQUM7SUFDdkIsQ0FBQyxNQUFNLElBQUlvRyxVQUFVLEtBQUssUUFBUSxFQUFFO01BQ2hDLE9BQU9wRyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ25CLENBQUMsTUFBTSxJQUFJb0csVUFBVSxLQUFLLG9CQUFvQixJQUFJQSxVQUFVLEtBQUssWUFBWSxFQUFFO01BQzNFLE9BQU8sSUFBSSxDQUFDNUUsaUNBQWlDLENBQUN4QixLQUFLLENBQUM7SUFDeEQsQ0FBQyxNQUFNLElBQUlvRyxVQUFVLEtBQUssU0FBUyxFQUFFO01BQ25DLE9BQU9wRyxLQUFLO0lBQ2QsQ0FBQyxNQUFNO01BQ0gsTUFBTSx3Q0FBd0MsR0FBR29HLFVBQVU7SUFDL0Q7RUFDSjtFQUVBOUMsa0JBQWtCQSxDQUFDK0MsbUJBQW1CLEVBQUU7SUFDcEMsSUFBSTdILGdDQUFnQyxDQUFDLElBQUksQ0FBQ1IsbUJBQW1CLEVBQUVxSSxtQkFBbUIsQ0FBQyxFQUFFO01BQ2pGLE9BQU8sSUFBSSxDQUFDckksbUJBQW1CLENBQUNxSSxtQkFBbUIsQ0FBQztJQUN4RCxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUN0SSxNQUFNLElBQUksSUFBSSxFQUFFO01BQzVCLE9BQU8sSUFBSSxDQUFDQSxNQUFNLENBQUN1RixrQkFBa0IsQ0FBQytDLG1CQUFtQixDQUFDO0lBQzlEO0lBRUEsT0FBT0EsbUJBQW1CO0VBQzlCOztFQUVBO0FBQ0o7QUFDQTtBQUNBO0FBQ0E7RUFDSTdFLGlDQUFpQ0EsQ0FBQzhFLFVBQVUsRUFBRXhDLFVBQVUsR0FBRyxJQUFJLEVBQUU7SUFDN0QsSUFBSXlDLE1BQU0sR0FBRyxDQUFDRCxVQUFVLENBQUMsQ0FBQ0UsSUFBSSxDQUFDLENBQUMsQ0FBQzVFLEdBQUcsQ0FBRUMsQ0FBQyxJQUFLQSxDQUFDLENBQUM3QixLQUFLLENBQUM7SUFDcEQsSUFBSXFHLG1CQUFtQixHQUFHRSxNQUFNLENBQUMsQ0FBQyxDQUFDOztJQUVuQztJQUNBQSxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDakQsa0JBQWtCLENBQUMrQyxtQkFBbUIsQ0FBQztJQUV4RCxJQUFJckQsR0FBRyxHQUFHdUQsTUFBTSxDQUFDdEcsSUFBSSxDQUFDLEdBQUcsQ0FBQztJQUUxQixJQUFJNkQsVUFBVSxFQUFFO01BQ1pkLEdBQUcsR0FBR3hDLEtBQUssQ0FBQ3dDLEdBQUcsQ0FBQztJQUNwQjtJQUVBLE9BQU9BLEdBQUc7RUFDZDtBQUNKOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU1UsTUFBTUEsQ0FBQ3pDLFNBQVMsRUFBRXdGLEdBQUcsRUFBRTtFQUM1QixJQUFJLENBQUN4RixTQUFTLEVBQUU7SUFDWixNQUFNd0YsR0FBRztFQUNiO0FBQ0o7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVNqSSxnQ0FBZ0NBLENBQUNrSSxHQUFHLEVBQUUsR0FBR0MsY0FBYyxFQUFFO0VBQzlELE9BQU9BLGNBQWMsQ0FBQ0MsTUFBTSxDQUFDLENBQUNDLEtBQUssRUFBRUMsYUFBYSxLQUFLRCxLQUFLLElBQUtILEdBQUcsQ0FBQ0ssY0FBYyxDQUFDRCxhQUFhLENBQUMsSUFBSUosR0FBRyxDQUFDSSxhQUFhLENBQUMsS0FBSyxJQUFLLEVBQUUsS0FBSyxDQUFDO0FBQzlJOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU1gsUUFBUUEsQ0FBQ25HLEtBQUssRUFBRTtFQUNyQixPQUFRLE9BQU9BLEtBQUssS0FBSyxRQUFRLElBQUlBLEtBQUssWUFBWWdILE1BQU07QUFDaEU7QUFFQSxTQUFTakUscUJBQXFCQSxDQUFDa0UsTUFBTSxFQUFFO0VBQ25DLE9BQU9BLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDQyxXQUFXLENBQUMsQ0FBQyxHQUFHRixNQUFNLENBQUNqSSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzNEOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU3dCLEtBQUtBLENBQUNSLEtBQUssRUFBRTtFQUNsQixPQUFPLEdBQUcsR0FBR0EsS0FBSyxHQUFHLEdBQUc7QUFDNUI7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQSxTQUFTb0gsT0FBT0EsQ0FBQ3BILEtBQUssRUFBRTtFQUNwQixPQUFPQSxLQUFLLENBQUNhLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO0FBQ3RDOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsU0FBU0csNEJBQTRCQSxDQUFDMEYsR0FBRyxFQUFFO0VBQ3ZDLElBQUlsRCxNQUFNLENBQUNDLElBQUksQ0FBQ2lELEdBQUcsQ0FBQyxDQUFDekgsTUFBTSxLQUFLLENBQUMsRUFBRTtJQUMvQixNQUFNLHNFQUFzRSxHQUFHb0ksSUFBSSxDQUFDQyxTQUFTLENBQUNaLEdBQUcsQ0FBQztFQUN0RztFQUVBLE9BQU9sRCxNQUFNLENBQUNDLElBQUksQ0FBQ2lELEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM5Qjs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVN4Riw4QkFBOEJBLENBQUN3RixHQUFHLEVBQUU7RUFDekMsT0FBT0EsR0FBRyxDQUFDMUYsNEJBQTRCLENBQUMwRixHQUFHLENBQUMsQ0FBQztBQUNqRDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVMvQyxpQkFBaUJBLENBQUMzRCxLQUFLLEVBQUU7RUFDOUIsT0FBTyxPQUFPQSxLQUFLLEtBQUssV0FBVyxJQUFJQSxLQUFLLEtBQUssSUFBSTtBQUN6RDs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVNVLGlCQUFpQkEsQ0FBQzZHLEdBQUcsRUFBRUMsU0FBUyxHQUFHLENBQUMsRUFBRTtFQUMzQyxJQUFJeEMsU0FBUyxHQUFHLElBQUk7RUFFcEIsS0FBSyxJQUFJbkQsQ0FBQyxHQUFHLENBQUMsRUFBRUEsQ0FBQyxHQUFHMkYsU0FBUyxFQUFFM0YsQ0FBQyxFQUFFLEVBQUU7SUFDaENtRCxTQUFTLEdBQUdBLFNBQVMsR0FBRyxJQUFJO0VBQ2hDO0VBRUEsT0FBT3VDLEdBQUcsQ0FBQ0UsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDeEgsSUFBSSxDQUFDK0UsU0FBUyxDQUFDO0FBQzFDOzs7Ozs7Ozs7Ozs7Ozs7OztBQzluQjBDO0FBQ0o7QUFDakI7O0FBRXJCO0FBQ0EsU0FBUzJDLGdCQUFnQkEsQ0FBQ0MsT0FBTyxFQUFFQyxJQUFJLEdBQUcsU0FBUyxFQUFFO0VBQ2pEO0VBQ0EsTUFBTUMsYUFBYSxHQUFHQyxRQUFRLENBQUNDLGFBQWEsQ0FBQyxjQUFjLENBQUM7RUFDNUQsSUFBSUYsYUFBYSxFQUFFO0lBQ2ZBLGFBQWEsQ0FBQ0csTUFBTSxDQUFDLENBQUM7RUFDMUI7RUFFQSxNQUFNQyxZQUFZLEdBQUdILFFBQVEsQ0FBQ0ksYUFBYSxDQUFDLEtBQUssQ0FBQztFQUNsREQsWUFBWSxDQUFDRSxTQUFTLEdBQUksZUFBY1AsSUFBSyxFQUFDO0VBQzlDSyxZQUFZLENBQUNHLFNBQVMsR0FBSSxTQUFRUixJQUFJLEtBQUssU0FBUyxHQUFHLEdBQUcsR0FBRyxHQUFJLGdCQUFlRCxPQUFRLFNBQVE7RUFFaEcsTUFBTVUsT0FBTyxHQUFHUCxRQUFRLENBQUNDLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQztFQUMxRE0sT0FBTyxDQUFDQyxZQUFZLENBQUNMLFlBQVksRUFBRUksT0FBTyxDQUFDRSxVQUFVLENBQUM7RUFFdERDLFVBQVUsQ0FBQyxNQUFNO0lBQ2JQLFlBQVksQ0FBQ1EsS0FBSyxDQUFDQyxTQUFTLEdBQUcsZ0NBQWdDO0lBQy9ERixVQUFVLENBQUMsTUFBTVAsWUFBWSxDQUFDRCxNQUFNLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQztFQUNoRCxDQUFDLEVBQUUsSUFBSSxDQUFDO0FBQ1o7QUFFQSxJQUFJVyxTQUFTLEdBQUcsU0FBQUEsQ0FBQSxFQUFZO0VBQ3hCLElBQUlDLEtBQUssR0FBR2QsUUFBUSxDQUFDZSxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM5SSxLQUFLO0VBQ2xELElBQUkrSSxhQUFhLEdBQUdoQixRQUFRLENBQUNlLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQztFQUU3RCxJQUFJRCxLQUFLLENBQUNHLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO0lBQ3JCckIsZ0JBQWdCLENBQUMsMEJBQTBCLEVBQUUsT0FBTyxDQUFDO0lBQ3JEO0VBQ0o7RUFFQSxJQUFJa0IsS0FBSyxDQUFDN0osS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxFQUFFO0lBQ3pCNkosS0FBSyxHQUFHQSxLQUFLLENBQUM3SixLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0VBQzlCO0VBRUEsSUFBSWlLLGdCQUFnQixHQUFHbEIsUUFBUSxDQUFDZSxjQUFjLENBQUMsUUFBUSxDQUFDO0VBRXhELElBQUksQ0FBQ0QsS0FBSyxDQUFDSyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQ0wsS0FBSyxDQUFDSyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7SUFDNURELGdCQUFnQixDQUFDakosS0FBSyxHQUFHLHNDQUFzQztJQUMvRDJILGdCQUFnQixDQUFDLGtDQUFrQyxFQUFFLE9BQU8sQ0FBQztJQUM3RDtFQUNKOztFQUVBO0VBQ0FvQixhQUFhLENBQUNJLFNBQVMsQ0FBQ0MsR0FBRyxDQUFDLFlBQVksQ0FBQztFQUN6Q0wsYUFBYSxDQUFDTSxRQUFRLEdBQUcsSUFBSTs7RUFFN0I7RUFDQVosVUFBVSxDQUFDLE1BQU07SUFDYixJQUFJO01BQ0EsSUFBSTNLLEdBQUcsR0FBRzRKLHdEQUFjLENBQUMsU0FBUyxFQUFFbUIsS0FBSyxDQUFDO01BQzFDVSxPQUFPLENBQUNDLEdBQUcsQ0FBQzFMLEdBQUcsQ0FBQztNQUNoQixJQUFJQSxHQUFHLENBQUNvTCxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUU7UUFDekJELGdCQUFnQixDQUFDakosS0FBSyxHQUFHbEMsR0FBRztRQUM1QjZKLGdCQUFnQixDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQztNQUN4RCxDQUFDLE1BQU07UUFDSHNCLGdCQUFnQixDQUFDakosS0FBSyxHQUFJLElBQUlwQyxpREFBUyxDQUFDeUosSUFBSSxDQUFDb0MsS0FBSyxDQUFDM0wsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM0TCxLQUFLLENBQUMsQ0FBRXpMLEdBQUcsQ0FBQyxDQUFDO1FBQ3hFMEosZ0JBQWdCLENBQUMsa0RBQWtELEVBQUUsU0FBUyxDQUFDO01BQ25GO0lBQ0osQ0FBQyxDQUFDLE9BQU9nQyxDQUFDLEVBQUU7TUFDUkosT0FBTyxDQUFDQyxHQUFHLENBQUNYLEtBQUssQ0FBQztNQUNsQkksZ0JBQWdCLENBQUNqSixLQUFLLEdBQUcySixDQUFDLEdBQUcsNkNBQTZDO01BQzFFaEMsZ0JBQWdCLENBQUMsMkJBQTJCLEVBQUUsT0FBTyxDQUFDO01BQ3RELE1BQU1nQyxDQUFDO0lBQ1gsQ0FBQyxTQUFTO01BQ05aLGFBQWEsQ0FBQ0ksU0FBUyxDQUFDbEIsTUFBTSxDQUFDLFlBQVksQ0FBQztNQUM1Q2MsYUFBYSxDQUFDTSxRQUFRLEdBQUcsS0FBSztJQUNsQztFQUNKLENBQUMsRUFBRSxHQUFHLENBQUM7QUFDWCxDQUFDOztBQUVEO0FBQ0EsU0FBU08sZUFBZUEsQ0FBQSxFQUFHO0VBQ3ZCLE1BQU1DLE1BQU0sR0FBRzlCLFFBQVEsQ0FBQ2UsY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDOUksS0FBSztFQUN0RCxNQUFNOEosVUFBVSxHQUFHL0IsUUFBUSxDQUFDZSxjQUFjLENBQUMsYUFBYSxDQUFDO0VBQ3pELE1BQU1pQixRQUFRLEdBQUdoQyxRQUFRLENBQUNlLGNBQWMsQ0FBQyxXQUFXLENBQUM7RUFDckQsTUFBTWtCLFFBQVEsR0FBR2pDLFFBQVEsQ0FBQ2UsY0FBYyxDQUFDLFdBQVcsQ0FBQztFQUVyRCxJQUFJLENBQUNlLE1BQU0sSUFBSUEsTUFBTSxDQUFDYixJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsSUFBSWEsTUFBTSxDQUFDdkgsUUFBUSxDQUFDLGtEQUFrRCxDQUFDLEVBQUU7SUFDeEdxRixnQkFBZ0IsQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUM7SUFDOUM7RUFDSjtFQUVBc0MsU0FBUyxDQUFDQyxTQUFTLENBQUNDLFNBQVMsQ0FBQ04sTUFBTSxDQUFDLENBQUNPLElBQUksQ0FBQyxZQUFXO0lBQ2xETixVQUFVLENBQUNYLFNBQVMsQ0FBQ0MsR0FBRyxDQUFDLFFBQVEsQ0FBQztJQUNsQ1csUUFBUSxDQUFDTSxXQUFXLEdBQUcsU0FBUztJQUNoQ0wsUUFBUSxDQUFDSyxXQUFXLEdBQUcsR0FBRztJQUUxQjVCLFVBQVUsQ0FBQyxNQUFNO01BQ2JxQixVQUFVLENBQUNYLFNBQVMsQ0FBQ2xCLE1BQU0sQ0FBQyxRQUFRLENBQUM7TUFDckM4QixRQUFRLENBQUNNLFdBQVcsR0FBRyxNQUFNO01BQzdCTCxRQUFRLENBQUNLLFdBQVcsR0FBRyxJQUFJO0lBQy9CLENBQUMsRUFBRSxJQUFJLENBQUM7RUFDWixDQUFDLEVBQUUsWUFBVztJQUNWMUMsZ0JBQWdCLENBQUMsNkJBQTZCLEVBQUUsT0FBTyxDQUFDO0VBQzVELENBQUMsQ0FBQztBQUNOO0FBRUEyQyxNQUFNLENBQUNDLGdCQUFnQixDQUFDLE1BQU0sRUFBR0MsS0FBSyxJQUFLO0VBQ3ZDLElBQUlDLGlCQUFpQixHQUFHLElBQUlDLGVBQWUsQ0FBQ0osTUFBTSxDQUFDSyxRQUFRLENBQUNDLE1BQU0sQ0FBQztFQUVuRSxJQUFHSCxpQkFBaUIsQ0FBQ0ksR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFO0lBQ25DOUMsUUFBUSxDQUFDZSxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM5SSxLQUFLLEdBQUc4SyxJQUFJLENBQUNMLGlCQUFpQixDQUFDTSxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDakZuQyxTQUFTLENBQUMsQ0FBQztFQUNmO0FBQ0osQ0FBQyxDQUFDO0FBRUZiLFFBQVEsQ0FBQ2UsY0FBYyxDQUFDLGdCQUFnQixDQUFDLENBQUN5QixnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUzQixTQUFTLENBQUM7O0FBRTlFO0FBQ0FiLFFBQVEsQ0FBQ2UsY0FBYyxDQUFDLE9BQU8sQ0FBQyxDQUFDeUIsZ0JBQWdCLENBQUMsU0FBUyxFQUFFLFVBQVNaLENBQUMsRUFBRTtFQUNyRSxJQUFJLENBQUNBLENBQUMsQ0FBQ3FCLE9BQU8sSUFBSXJCLENBQUMsQ0FBQ3NCLE9BQU8sS0FBS3RCLENBQUMsQ0FBQ3VCLEdBQUcsS0FBSyxPQUFPLEVBQUU7SUFDL0N0QyxTQUFTLENBQUMsQ0FBQztFQUNmO0FBQ0osQ0FBQyxDQUFDO0FBRUZiLFFBQVEsQ0FBQ2UsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDeUIsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLFlBQVk7RUFDMUUsTUFBTTFCLEtBQUssR0FBR2QsUUFBUSxDQUFDZSxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM5SSxLQUFLO0VBRXBELElBQUksQ0FBQzZJLEtBQUssSUFBSUEsS0FBSyxDQUFDRyxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtJQUMvQnJCLGdCQUFnQixDQUFDLGdDQUFnQyxFQUFFLE9BQU8sQ0FBQztJQUMzRDtFQUNKO0VBRUEsSUFBSXdELFVBQVUsR0FBR2IsTUFBTSxDQUFDSyxRQUFRLENBQUNTLE1BQU0sR0FBR2QsTUFBTSxDQUFDSyxRQUFRLENBQUNVLFFBQVEsR0FBRyxhQUFhLEdBQUdDLElBQUksQ0FBQ3pDLEtBQUssQ0FBQztFQUNoR29CLFNBQVMsQ0FBQ0MsU0FBUyxDQUFDQyxTQUFTLENBQUNnQixVQUFVLENBQUMsQ0FBQ2YsSUFBSSxDQUFDLFlBQVc7SUFDdER6QyxnQkFBZ0IsQ0FBQyxpQ0FBaUMsRUFBRSxTQUFTLENBQUM7RUFDbEUsQ0FBQyxFQUFFLFlBQVc7SUFDVkEsZ0JBQWdCLENBQUMsMkJBQTJCLEVBQUUsT0FBTyxDQUFDO0VBQzFELENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQzs7QUFFRjtBQUNBSSxRQUFRLENBQUNlLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQ3lCLGdCQUFnQixDQUFDLE9BQU8sRUFBRVgsZUFBZSxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FDeElqRjtBQUMwRztBQUNqQjtBQUNPO0FBQ2hHLDRDQUE0Qyx5ZEFBa2E7QUFDOWMsOEJBQThCLG1GQUEyQixDQUFDLDRGQUFxQztBQUMvRix5Q0FBeUMsc0ZBQStCO0FBQ3hFO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0Esb0JBQW9CLG1DQUFtQztBQUN2RDtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTtBQUNSLFFBQVE7O0FBRVIsUUFBUTtBQUNSLFFBQVE7QUFDUixRQUFRO0FBQ1IsUUFBUTs7QUFFUixlQUFlO0FBQ2YsY0FBYztBQUNkLE9BQU8sd0ZBQXdGLE1BQU0sWUFBWSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxPQUFPLFlBQVksTUFBTSxZQUFZLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLFdBQVcsVUFBVSxVQUFVLFVBQVUsWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxXQUFXLFlBQVksYUFBYSxXQUFXLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssWUFBWSxhQUFhLFdBQVcsTUFBTSxLQUFLLFVBQVUsWUFBWSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLGFBQWEsV0FBVyxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksT0FBTyxZQUFZLE1BQU0sVUFBVSxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxVQUFVLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxhQUFhLFdBQVcsWUFBWSxPQUFPLFlBQVksTUFBTSxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksYUFBYSxhQUFhLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsWUFBWSxhQUFhLGFBQWEsT0FBTyxLQUFLLFVBQVUsWUFBWSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsVUFBVSxZQUFZLGFBQWEsYUFBYSxhQUFhLFdBQVcsWUFBWSxhQUFhLGFBQWEsYUFBYSxXQUFXLFVBQVUsWUFBWSxXQUFXLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxhQUFhLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLE9BQU8sWUFBWSxNQUFNLFVBQVUsVUFBVSxVQUFVLE9BQU8sS0FBSyxZQUFZLGFBQWEsYUFBYSxXQUFXLFVBQVUsVUFBVSxZQUFZLGFBQWEsYUFBYSxXQUFXLFlBQVksYUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLFdBQVcsVUFBVSxVQUFVLFVBQVUsWUFBWSxhQUFhLGFBQWEsYUFBYSxPQUFPLEtBQUssVUFBVSxVQUFVLE1BQU0sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxhQUFhLE9BQU8sS0FBSyxZQUFZLFdBQVcsWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLFlBQVksYUFBYSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsTUFBTSxLQUFLLFVBQVUsWUFBWSxXQUFXLFVBQVUsVUFBVSxVQUFVLFlBQVksYUFBYSxhQUFhLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxLQUFLLFlBQVksTUFBTSxLQUFLLFlBQVksTUFBTSxNQUFNLFlBQVksTUFBTSxVQUFVLFlBQVksV0FBVyxZQUFZLGFBQWEsT0FBTyxLQUFLLFlBQVksV0FBVyxZQUFZLGFBQWEsYUFBYSxhQUFhLE9BQU8sS0FBSyxZQUFZLGFBQWEsT0FBTyxLQUFLLFVBQVUsVUFBVSxZQUFZLGFBQWEs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QUksc0ZBQU8sVUFBVSxzRkFBTyxtQkFBbUIsRUFBQyIsInNvdXJjZXMiOlsid2VicGFjazovL3NxbDJidWlsZGVyLmdpdGh1Yi5pby8uL3NyYy9jb252ZXJ0ZXIuanMiLCJ3ZWJwYWNrOi8vc3FsMmJ1aWxkZXIuZ2l0aHViLmlvLy4vc3JjL2luZGV4LmpzIiwid2VicGFjazovL3NxbDJidWlsZGVyLmdpdGh1Yi5pby8uL3NyYy9zdHlsZS5jc3MiLCJ3ZWJwYWNrOi8vc3FsMmJ1aWxkZXIuZ2l0aHViLmlvLy4vc3JjL3N0eWxlLmNzcz83MTYzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjbGFzcyBDb252ZXJ0ZXJcbntcbiAgICBjb25zdHJ1Y3Rvcihhc3QsIHBhcmVudCA9IG51bGwpIHtcbiAgICAgICAgdGhpcy5hc3QgPSBhc3Q7XG4gICAgICAgIHRoaXMudGFibGVfbmFtZV9ieV9hbGlhcyA9IHt9O1xuICAgICAgICB0aGlzLnBhcmVudCA9IHBhcmVudDtcbiAgICB9XG5cbiAgICBydW4obmVlZF9hcHBlbmRfZ2V0X3N1ZmZpeCA9IHRydWUpIHtcbiAgICAgICAgbGV0IHNlY3Rpb25zID0gW11cblxuICAgICAgICBsZXQgZnJvbV9pdGVtID0gdGhpcy5hc3QuYm9keS5TZWxlY3QuZnJvbVswXTtcblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLnJlbGF0aW9uLCAnVGFibGUnKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVNYWluVGFibGVTZWN0aW9uKGZyb21faXRlbSkpO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbS5yZWxhdGlvbiwgJ0Rlcml2ZWQnKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVGcm9tU3ViU2VjdGlvbignREI6OnF1ZXJ5KCktPmZyb21TdWInKSwgZnJvbV9pdGVtKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIHJlbGF0aW9uIHR5cGUnO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGpvaW5fc2VjdGlvbiA9ICcnO1xuXG4gICAgICAgIC8vIFJlc29sdmUgJ2pvaW4nIHNlY3Rpb24gYmVmb3JlICd3aGVyZScgc2VjdGlvbiwgYmVjYXVzZSBuZWVkIGZpbmQgam9pbmVkIHRhYmxlIGFsaWFzXG4gICAgICAgIGlmICh0aGlzLmhhc0pvaW5TZWN0aW9uKGZyb21faXRlbSkpIHtcbiAgICAgICAgICAgIGpvaW5fc2VjdGlvbiA9IHRoaXMucmVzb2x2ZUpvaW5TZWN0aW9uKGZyb21faXRlbSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBIYXMgY3Jvc3Mgam9pblxuICAgICAgICBpZiAodGhpcy5hc3QuYm9keS5TZWxlY3QuZnJvbS5zbGljZSgxKS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBzZWN0aW9ucyA9IHNlY3Rpb25zLmNvbmNhdCh0aGlzLnJlc29sdmVDcm9zc0pvaW5TZWN0aW9uKHRoaXMuYXN0LmJvZHkuU2VsZWN0LmZyb20uc2xpY2UoMSkpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlU2VsZWN0U2VjdGlvbigpKVxuXG4gICAgICAgIGlmIChqb2luX3NlY3Rpb24gIT09ICcnKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKGpvaW5fc2VjdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QuYm9keS5TZWxlY3QsICdzZWxlY3Rpb24nKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVXaGVyZVNlY3Rpb24odGhpcy5hc3QuYm9keS5TZWxlY3Quc2VsZWN0aW9uKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QuYm9keS5TZWxlY3QsICdncm91cF9ieScpICYmIHRoaXMuYXN0LmJvZHkuU2VsZWN0Lmdyb3VwX2J5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlR3JvdXBCeVNlY3Rpb24oKSk7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdC5ib2R5LlNlbGVjdCwgJ2hhdmluZycpKSB7XG4gICAgICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVIYXZpbmdTZWN0aW9uKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LCAnb3JkZXJfYnknKSAmJiB0aGlzLmFzdC5vcmRlcl9ieS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZU9yZGVyQnlTZWN0aW9uKCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LCAnbGltaXQnKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCgnbGltaXQoJyArIHRoaXMuYXN0LmxpbWl0LlZhbHVlLk51bWJlclswXSArICcpJyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QsICdvZmZzZXQnKSkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCgnb2Zmc2V0KCcgKyB0aGlzLmFzdC5vZmZzZXQudmFsdWUuVmFsdWUuTnVtYmVyWzBdICsgJyknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChuZWVkX2FwcGVuZF9nZXRfc3VmZml4KSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKCdnZXQoKTsnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzZWN0aW9ucy5qb2luKCdcXG4tPicpO1xuICAgIH1cblxuICAgIHJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlKHJlbGF0aW9uX25vZGUpIHtcbiAgICAgICAgICAgIGxldCB0YWJsZV9uYW1lID0gcmVsYXRpb25fbm9kZS5UYWJsZS5uYW1lWzBdLnZhbHVlO1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwocmVsYXRpb25fbm9kZS5UYWJsZSwgJ2FsaWFzJykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRhYmxlX25hbWVfYnlfYWxpYXNbcmVsYXRpb25fbm9kZS5UYWJsZS5hbGlhcy5uYW1lLnZhbHVlXSA9IHRhYmxlX25hbWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBxdW90ZSh0YWJsZV9uYW1lKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZU1haW5UYWJsZVNlY3Rpb24oZnJvbV9pdGVtKSB7XG4gICAgICAgIHJldHVybiAnREI6OnRhYmxlKCcgKyB0aGlzLnJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlKGZyb21faXRlbS5yZWxhdGlvbikgKyAnKSc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVGcm9tU3ViU2VjdGlvbihwcmVmaXgsIGZyb21faXRlbSkge1xuICAgICAgICByZXR1cm4gcHJlZml4ICsgJyhmdW5jdGlvbiAoJHF1ZXJ5KSB7XFxuJ1xuICAgICAgICAgICAgKyAnXFx0JyArIGFkZFRhYlRvRXZlcnlMaW5lKChuZXcgQ29udmVydGVyKGZyb21faXRlbS5yZWxhdGlvbi5EZXJpdmVkLnN1YnF1ZXJ5LCB0aGlzKS5ydW4oZmFsc2UpKS5yZXBsYWNlKCdEQjo6dGFibGUnLCAnJHF1ZXJ5LT5mcm9tJyksIDIpICsgJztcXG4nXG4gICAgICAgICAgICArICd9LCcgKyBxdW90ZShmcm9tX2l0ZW0ucmVsYXRpb24uRGVyaXZlZC5hbGlhcy5uYW1lLnZhbHVlKSArICcpJztcbiAgICB9XG5cbiAgICByZXNvbHZlV2hlcmVTZWN0aW9uKHNlbGVjdGlvbl9ub2RlKSB7XG4gICAgICAgIGxldCBjb25kaXRpb25fdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qoc2VsZWN0aW9uX25vZGUpO1xuICAgICAgICBsZXQgY29uZGl0aW9uID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KHNlbGVjdGlvbl9ub2RlKTtcblxuICAgICAgICByZXR1cm4gdGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhjb25kaXRpb25fdHlwZSwgY29uZGl0aW9uLCAnJywgJ3doZXJlJykuam9pbignXFxuLT4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gY29uZGl0aW9uX3R5cGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gY29uZGl0aW9uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wIG9uZSBvZiBbJycsICdBbmQnLCAnT3InXVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtZXRob2RfbmFtZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ1tdfVxuICAgICAqL1xuICAgIHByZXBhcmVDb25kaXRpb25zKGNvbmRpdGlvbl90eXBlLCBjb25kaXRpb24sIG9wLCBtZXRob2RfbmFtZSkge1xuICAgICAgICBsZXQgY29uZGl0aW9ucyA9IFtdO1xuXG4gICAgICAgIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0lzTnVsbCcgfHwgY29uZGl0aW9uX3R5cGUgPT09ICdJc05vdE51bGwnKSB7XG4gICAgICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBjb25kaXRpb25fdHlwZSA9PT0gJ0lzTnVsbCcgPyAnd2hlcmVOdWxsJyA6ICd3aGVyZU5vdE51bGwnO1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoJyArIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24pKSArICcpJyk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdJbkxpc3QnKSB7XG4gICAgICAgICAgICBsZXQgY29sdW1uID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSk7XG4gICAgICAgICAgICBsZXQgbGlzdCA9IGNvbmRpdGlvbi5saXN0Lm1hcCgoaSkgPT4gdGhpcy5yZXNvbHZlVmFsdWUoaS5WYWx1ZSkpO1xuXG4gICAgICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBjb25kaXRpb24ubmVnYXRlZCA/ICd3aGVyZU5vdEluJyA6ICd3aGVyZUluJztcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKCcgKyBjb2x1bW4gKyAnLCcgKyAnWycgKyBsaXN0LmpvaW4oJywgJykgKyAnXSknKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ05lc3RlZCcpIHtcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaChcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKGZ1bmN0aW9uICgkcXVlcnkpIHtcXG4nXG4gICAgICAgICAgICAgICAgKyAnXFx0JHF1ZXJ5LT4nICsgIGFkZFRhYlRvRXZlcnlMaW5lKHRoaXMucmVzb2x2ZVdoZXJlU2VjdGlvbihjb25kaXRpb24pLCAyKSArICc7XFxufSknXG4gICAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnQmluYXJ5T3AnKSB7XG4gICAgICAgICAgICBpZiAoY29uZGl0aW9uLm9wID09PSAnQW5kJyB8fCBjb25kaXRpb24ub3AgPT09ICdPcicpIHtcbiAgICAgICAgICAgICAgICBsZXQgbGVmdF9jb25kaXRpb25fdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoY29uZGl0aW9uLmxlZnQpO1xuICAgICAgICAgICAgICAgIGxldCBsZWZ0X2NvbmRpdGlvbiA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24ubGVmdCk7XG4gICAgICAgICAgICAgICAgY29uZGl0aW9ucyA9IGNvbmRpdGlvbnMuY29uY2F0KHRoaXMucHJlcGFyZUNvbmRpdGlvbnMobGVmdF9jb25kaXRpb25fdHlwZSwgbGVmdF9jb25kaXRpb24sIG9wLCBtZXRob2RfbmFtZSkpO1xuXG4gICAgICAgICAgICAgICAgbGV0IHJpZ2h0X2NvbmRpdGlvbl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChjb25kaXRpb24ucmlnaHQpO1xuICAgICAgICAgICAgICAgIGxldCByaWdodF9jb25kaXRpb24gPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLnJpZ2h0KTtcbiAgICAgICAgICAgICAgICBjb25kaXRpb25zID0gY29uZGl0aW9ucy5jb25jYXQodGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhyaWdodF9jb25kaXRpb25fdHlwZSwgcmlnaHRfY29uZGl0aW9uLCBjb25kaXRpb24ub3AsIG1ldGhvZF9uYW1lKSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGV0IGxlZnQgPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmxlZnQpKTtcbiAgICAgICAgICAgICAgICBsZXQgcmlnaHQ7XG5cbiAgICAgICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoY29uZGl0aW9uLnJpZ2h0LCAnSWRlbnRpZmllcicsICdDb21wb3VuZElkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgICAgICByaWdodCA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24ucmlnaHQpKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobWV0aG9kX25hbWUuaW5jbHVkZXMoJ3doZXJlJykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gJ0RCOjpyYXcoJyArIHJpZ2h0ICsgJyknO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChjb25kaXRpb24ucmlnaHQsICdWYWx1ZScpKSB7XG4gICAgICAgICAgICAgICAgICAgIG1ldGhvZF9uYW1lID0gJ3doZXJlJztcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSB0aGlzLnJlc29sdmVWYWx1ZShjb25kaXRpb24ucmlnaHQuVmFsdWUpXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChjb25kaXRpb24ucmlnaHQsICdTdWJxdWVyeScpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gJ2Z1bmN0aW9uKCRxdWVyeSkge1xcbidcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJ1xcdCcgKyBhZGRUYWJUb0V2ZXJ5TGluZSgobmV3IENvbnZlcnRlcihjb25kaXRpb24ucmlnaHQuU3VicXVlcnksIHRoaXMpLnJ1bihmYWxzZSkpLnJlcGxhY2UoJ0RCOjp0YWJsZScsICckcXVlcnktPmZyb20nKSwgMikgKyAnO1xcbidcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJ30nXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChjb25kaXRpb24ucmlnaHQsICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gJ0RCOjpyYXcoJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoY29uZGl0aW9uLnJpZ2h0LkZ1bmN0aW9uKSArICcpJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBjb25kaXRpb24ucmlnaHQgdHlwZTonICsgZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChjb25kaXRpb24ucmlnaHQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKCcgKyBsZWZ0ICsgJywnICsgcXVvdGUodGhpcy50cmFuc2Zvcm1CaW5hcnlPcChjb25kaXRpb24ub3ApKSArICcsJyArIHJpZ2h0ICsgJyknKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0V4aXN0cycpIHtcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaChcbiAgICAgICAgICAgICAgICB0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCAnd2hlcmVFeGlzdHMnKSArICcoZnVuY3Rpb24gKCRxdWVyeSkge1xcbicgK1xuICAgICAgICAgICAgICAgICdcXHQnICsgIGFkZFRhYlRvRXZlcnlMaW5lKChuZXcgQ29udmVydGVyKGNvbmRpdGlvbiwgdGhpcykpLnJ1bihmYWxzZSksIDIpLnJlcGxhY2UoJ0RCOjp0YWJsZScsICckcXVlcnktPmZyb20nKSArICc7XFxuJyArXG4gICAgICAgICAgICAgICAgJ30nXG4gICAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnQmV0d2VlbicpIHtcbiAgICAgICAgICAgIGxldCBtZXRob2RfbmFtZSA9IGNvbmRpdGlvbi5uZWdhdGVkID09PSB0cnVlID8gJ3doZXJlTm90QmV0d2VlbicgOiAnd2hlcmVCZXR3ZWVuJztcblxuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICB0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkgKyAnKCdcbiAgICAgICAgICAgICAgKyB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpKSArICcsJ1xuICAgICAgICAgICAgICArICdbJyArIHRoaXMucmVzb2x2ZVZhbHVlKGNvbmRpdGlvbi5sb3cuVmFsdWUpICsgJywnICsgdGhpcy5yZXNvbHZlVmFsdWUoY29uZGl0aW9uLmhpZ2guVmFsdWUpICsgJ10pJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0luU3VicXVlcnknKSB7XG4gICAgICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBjb25kaXRpb24ubmVnYXRlZCA9PT0gdHJ1ZSA/ICd3aGVyZU5vdEluJyA6ICd3aGVyZUluJztcblxuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICB0aGlzLmFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSlcbiAgICAgICAgICAgICAgKyAnKCcgKyB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpKSArICcsJyArICcoZnVuY3Rpb24gKCRxdWVyeSkge1xcbidcbiAgICAgICAgICAgICAgKyAnXFx0JyArIGFkZFRhYlRvRXZlcnlMaW5lKChuZXcgQ29udmVydGVyKGNvbmRpdGlvbi5zdWJxdWVyeSwgdGhpcykpLnJ1bihmYWxzZSksIDIpLnJlcGxhY2UoJ0RCOjp0YWJsZScsICckcXVlcnktPmZyb20nKSArICc7XFxuJ1xuICAgICAgICAgICAgICArICd9J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0Z1bmN0aW9uJykge1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoREI6OnJhdyhcIicgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGNvbmRpdGlvbiwgZmFsc2UpICsgJ1wiKSknKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ1VuYXJ5T3AnKSB7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSwgZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5leHByKSwgb3AsIG1ldGhvZF9uYW1lKVswXS5yZXBsYWNlKC93aGVyZS9pLCAnd2hlcmUnICsgY29uZGl0aW9uLm9wKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBjb25kaXRpb24gdHlwZSBbJyArIGNvbmRpdGlvbl90eXBlICsgJ10nO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNvbmRpdGlvbnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIG9wXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHRyYW5zZm9ybUJpbmFyeU9wKG9wKSB7XG4gICAgICAgIGxldCBvcGVyYXRvcl9ieV9vcCA9IHtcbiAgICAgICAgICAgICdFcSc6ICc9JyxcbiAgICAgICAgICAgICdHdCc6ICc+JyxcbiAgICAgICAgICAgICdHdEVxJzogJz49JyxcbiAgICAgICAgICAgICdMdCc6ICc8JyxcbiAgICAgICAgICAgICdMdEVxJzogJzwnLFxuICAgICAgICAgICAgJ05vdEVxJzogJyE9JyxcbiAgICAgICAgICAgICdMaWtlJzogJ2xpa2UnLFxuICAgICAgICAgICAgJ01pbnVzJzogJy0nLFxuICAgICAgICAgICAgJ1BsdXMnOiAnKycsXG4gICAgICAgICAgICAnTXVsdGlwbHknOiAnKicsXG4gICAgICAgICAgICAnRGl2aWRlJzogJy8nXG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIG9wZXJhdG9yX2J5X29wW29wXTtcbiAgICB9XG5cbiAgICBhZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpIHtcbiAgICAgICAgaWYgKG9wID09PSAnJyB8fCBvcCA9PT0gJ0FuZCcpIHtcbiAgICAgICAgICAgIHJldHVybiBtZXRob2RfbmFtZTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvcC50b0xvd2VyQ2FzZSgpICsgY2FwaXRhbGl6ZUZpcnN0TGV0dGVyKG1ldGhvZF9uYW1lKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZVNlbGVjdFNlY3Rpb24oKSB7XG4gICAgICAgIGxldCByZXMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IHNlbGVjdF9pdGVtIG9mIHRoaXMuYXN0LmJvZHkuU2VsZWN0LnByb2plY3Rpb24pIHtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChzZWxlY3RfaXRlbSwgJ0V4cHJXaXRoQWxpYXMnKSkge1xuICAgICAgICAgICAgICAgIGxldCBhbGlhcyA9IHNlbGVjdF9pdGVtLkV4cHJXaXRoQWxpYXMuYWxpYXMudmFsdWU7XG4gICAgICAgICAgICAgICAgcmVzLnB1c2godGhpcy5yZXNvbHZlU2VsZWN0U2VjdGlvbkl0ZW0oc2VsZWN0X2l0ZW0uRXhwcldpdGhBbGlhcy5leHByLCBhbGlhcykpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChzZWxlY3RfaXRlbSwgJ1VubmFtZWRFeHByJykpIHtcbiAgICAgICAgICAgICAgICByZXMucHVzaCh0aGlzLnJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbShzZWxlY3RfaXRlbS5Vbm5hbWVkRXhwcikpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzZWxlY3RfaXRlbSA9PT0gJ1dpbGRjYXJkJykge1xuICAgICAgICAgICAgICAgIHJlcy5wdXNoKHF1b3RlKCcqJykpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChzZWxlY3RfaXRlbSwgJ1F1YWxpZmllZFdpbGRjYXJkJykpIHtcbiAgICAgICAgICAgICAgICByZXMucHVzaChxdW90ZSh0aGlzLmdldEFjdHVhbFRhYmxlTmFtZShzZWxlY3RfaXRlbS5RdWFsaWZpZWRXaWxkY2FyZFswXS52YWx1ZSkgKyAnLionKSlcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgc2VsZWN0IGl0ZW0gWycgKyBPYmplY3Qua2V5cyhzZWxlY3RfaXRlbSlbMF0gKyAnXSc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gJ3NlbGVjdCgnICsgcmVzLmpvaW4oJywgJykgKyAnKSc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHNlbGVjdF9pdGVtXG4gICAgICogQHBhcmFtIGFsaWFzXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbShzZWxlY3RfaXRlbSwgYWxpYXMgPSBudWxsKSB7XG4gICAgICAgIGFzc2VydChpc1VuZGVmaW5lZE9yTnVsbChzZWxlY3RfaXRlbSkgPT09IGZhbHNlLCAnc2VsZWN0X2l0ZW0gbXVzdCBub3QgYmUgdW5kZWZpbmVkIG9yIG51bGwnKTtcblxuICAgICAgICBsZXQgaXRlbTtcbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHNlbGVjdF9pdGVtLCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgaXRlbSA9ICdEQjo6cmF3KFwiJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoc2VsZWN0X2l0ZW0uRnVuY3Rpb24pO1xuXG4gICAgICAgICAgICBpZiAoYWxpYXMgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpdGVtID0gaXRlbSArICcgYXMgJyArIGFsaWFzICsgJ1wiKSc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBpdGVtO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaXRlbSA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChzZWxlY3RfaXRlbSksIGZhbHNlKTtcblxuICAgICAgICAgICAgaWYgKGFsaWFzICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaXRlbSA9IGl0ZW0gKyAnIGFzICcgKyBhbGlhcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHF1b3RlKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcGFyc2VGdW5jdGlvbk5vZGUoZnVuY3Rpb25fbm9kZSwgbmVlZF9xdW90ZSA9IHRydWUpIHtcbiAgICAgICAgbGV0IGZ1bmN0aW9uX25hbWUgPSBmdW5jdGlvbl9ub2RlLm5hbWVbMF0udmFsdWU7XG5cbiAgICAgICAgaWYgKG5lZWRfcXVvdGUpIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uX25hbWUgPSBxdW90ZShmdW5jdGlvbl9uYW1lKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCByZXMgPSBmdW5jdGlvbl9uYW1lICsgJygnO1xuICAgICAgICBsZXQgYXJncyA9IGZ1bmN0aW9uX25vZGUuYXJncztcbiAgICAgICAgbGV0IGFyZ19jb3VudCA9IGFyZ3MubGVuZ3RoO1xuXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXJnX2NvdW50OyBpKyspIHtcbiAgICAgICAgICAgIGxldCBhcmcgPSBhcmdzW2ldO1xuXG4gICAgICAgICAgICBpZiAoYXJnLlVubmFtZWQgPT09ICdXaWxkY2FyZCcpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyAnKic7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdWYWx1ZScpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgdGhpcy5yZXNvbHZlVmFsdWUoYXJnLlVubmFtZWQuRXhwci5WYWx1ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyBhcmcuVW5uYW1lZC5FeHByLklkZW50aWZpZXIudmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdDb21wb3VuZElkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGFyZy5Vbm5hbWVkLkV4cHIuQ29tcG91bmRJZGVudGlmaWVyKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ05lc3RlZCcpKSB7IC8vIGUuZy4gQ09VTlQoRElTVElOQ1QoJ2lkJykpXG4gICAgICAgICAgICAgICAgbGV0IGFyZ19jb2x1bW4gPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoYXJnLlVubmFtZWQuRXhwci5OZXN0ZWQpKTtcblxuICAgICAgICAgICAgICAgIGlmIChmdW5jdGlvbl9ub2RlLmRpc3RpbmN0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyZ19jb2x1bW4gPSAnRElTVElOQ1QoJyArIGFyZ19jb2x1bW4gKyAnKSc7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgYXJnX2NvbHVtbjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGFyZy5Vbm5hbWVkLkV4cHIuRnVuY3Rpb24sIGZhbHNlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0JpbmFyeU9wJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyB0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKGFyZy5Vbm5hbWVkLkV4cHIuQmluYXJ5T3ApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnVW5hcnlPcCcpKSB7XG4gICAgICAgICAgICAgICAgLy8gdG9kb1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnQ2FzZScpKSB7XG4gICAgICAgICAgICAgICAgLy8gdG9kb1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBhcmcgdHlwZTonICsgZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChhcmcuVW5uYW1lZC5FeHByKTtcbiAgICAgICAgICAgIH1cblxuXG4gICAgICAgICAgICBpZiAoaSAhPT0gYXJnX2NvdW50IC0gMSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArICcsICc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXMgPSByZXMgKyAnKSc7XG5cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGhhc0pvaW5TZWN0aW9uKGZyb21faXRlbSkge1xuICAgICAgICByZXR1cm4gcHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLCAnam9pbnMnKSAmJiBmcm9tX2l0ZW0uam9pbnMubGVuZ3RoID4gMDtcbiAgICB9XG5cbiAgICBwYXJzZUJpbmFyeU9wUGFydGlhbChsZWZ0X29yX3JpZ2h0KSB7XG4gICAgICAgIGxldCByZXM7XG5cbiAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICByZXMgPSBxdW90ZSh0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGxlZnRfb3JfcmlnaHQuRnVuY3Rpb24pKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnSWRlbnRpZmllcicsICdDb21wb3VuZElkZW50aWZpZXInKSl7XG4gICAgICAgICAgICByZXMgPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QobGVmdF9vcl9yaWdodCkpO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdWYWx1ZScpKSB7XG4gICAgICAgICAgICByZXMgPSB0aGlzLnJlc29sdmVWYWx1ZShsZWZ0X29yX3JpZ2h0LlZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnQmluYXJ5T3AnKSkge1xuICAgICAgICAgICAgcmVzID0gdGhpcy5wYXJzZUJpbmFyeU9wTm9kZShsZWZ0X29yX3JpZ2h0LkJpbmFyeU9wKTtcbiAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChsZWZ0X29yX3JpZ2h0LCAnU3VicXVlcnknKSkge1xuICAgICAgICAgICAgLy8gdG9kb1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgdHlwZSBpbiBiaW5hcnkgb3AgbGVmdCBvciByaWdodC4nO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG5cbiAgICBwYXJzZUJpbmFyeU9wTm9kZShiaW5hcnlfb3AsIHNlcGFyYXRvciA9ICcgJykge1xuICAgICAgICBsZXQgbGVmdCA9IHRoaXMucGFyc2VCaW5hcnlPcFBhcnRpYWwoYmluYXJ5X29wLmxlZnQpO1xuICAgICAgICBsZXQgb3AgPSBxdW90ZSh0aGlzLnRyYW5zZm9ybUJpbmFyeU9wKGJpbmFyeV9vcC5vcCkpO1xuICAgICAgICBsZXQgcmlnaHQgPSB0aGlzLnBhcnNlQmluYXJ5T3BQYXJ0aWFsKGJpbmFyeV9vcC5yaWdodCk7XG5cbiAgICAgICAgcmV0dXJuIFtsZWZ0LCBvcCwgcmlnaHRdLmpvaW4oc2VwYXJhdG9yKTtcbiAgICB9XG5cbiAgICBwcmVwYXJlSm9pbnMoZnJvbV9pdGVtKSB7XG4gICAgICAgIGxldCBqb2lucyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3Qgam9pbiBvZiBmcm9tX2l0ZW0uam9pbnMpIHtcbiAgICAgICAgICAgIGxldCBqb2luX29wZXJhdG9yX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGpvaW4uam9pbl9vcGVyYXRvcik7XG4gICAgICAgICAgICBsZXQgam9pbl9tZXRob2QgPSB7XG4gICAgICAgICAgICAgICAgJ0lubmVyJzogJ2pvaW4nLFxuICAgICAgICAgICAgICAgICdMZWZ0T3V0ZXInOiAnbGVmdEpvaW4nLFxuICAgICAgICAgICAgICAgICdSaWdodE91dGVyJzogJ3JpZ2h0Sm9pbicsXG4gICAgICAgICAgICB9W2pvaW5fb3BlcmF0b3JfdHlwZV07XG4gICAgICAgICAgICBsZXQgam9pbl9vcGVyYXRvciA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChqb2luLmpvaW5fb3BlcmF0b3IpO1xuICAgICAgICAgICAgbGV0IGNvbmRpdGlvbl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChqb2luX29wZXJhdG9yLk9uKTtcbiAgICAgICAgICAgIGxldCBjb25kaXRpb24gPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qoam9pbl9vcGVyYXRvci5Pbik7XG4gICAgICAgICAgICBsZXQgY29uZGl0aW9ucyA9IHRoaXMucHJlcGFyZUNvbmRpdGlvbnMoY29uZGl0aW9uX3R5cGUsIGNvbmRpdGlvbiwgJycsICdvbicpO1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoam9pbi5yZWxhdGlvbiwgJ0Rlcml2ZWQnKSkgeyAvLyBqb2luZWQgc2VjdGlvbiBpcyBzdWItcXVlcnlcbiAgICAgICAgICAgICAgICBsZXQgc3ViX3F1ZXJ5X3NxbCA9IG5ldyBDb252ZXJ0ZXIoam9pbi5yZWxhdGlvbi5EZXJpdmVkLnN1YnF1ZXJ5LCB0aGlzKS5ydW4oZmFsc2UpO1xuICAgICAgICAgICAgICAgIGxldCBzdWJfcXVlcnlfYWxpYXMgPSBqb2luLnJlbGF0aW9uLkRlcml2ZWQuYWxpYXMubmFtZS52YWx1ZTtcbiAgICAgICAgICAgICAgICBqb2lucy5wdXNoKGpvaW5fbWV0aG9kICsgJyhEQjo6cmF3KFwiJyArIGFkZFRhYlRvRXZlcnlMaW5lKHN1Yl9xdWVyeV9zcWwpICsgJ1wiKSBhcyAnXG4gICAgICAgICAgICAgICAgICAgICsgc3ViX3F1ZXJ5X2FsaWFzICsgJyksIGZ1bmN0aW9uKCRqb2luKSB7XFxuXFx0J1xuICAgICAgICAgICAgICAgICAgICArICckam9pbi0+JyArIGFkZFRhYlRvRXZlcnlMaW5lKGNvbmRpdGlvbnMuam9pbignXFxuLT4nKSArICc7JywgMilcbiAgICAgICAgICAgICAgICAgICAgKyAnXFxufScpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChqb2luLnJlbGF0aW9uLCAnVGFibGUnKSkge1xuICAgICAgICAgICAgICAgIGxldCBqb2luZWRfdGFibGUgPSB0aGlzLnJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlKGpvaW4ucmVsYXRpb24pO1xuXG4gICAgICAgICAgICAgICAgaWYgKGNvbmRpdGlvbnMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChqb2luX29wZXJhdG9yLk9uLCAnQmluYXJ5T3AnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgam9pbnMucHVzaChqb2luX21ldGhvZCArICcoJyArIGpvaW5lZF90YWJsZSArICcsJyArIHRoaXMucGFyc2VCaW5hcnlPcE5vZGUoam9pbl9vcGVyYXRvci5Pbi5CaW5hcnlPcCwgJywnKSArICcpJyk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoam9pbl9vcGVyYXRvci5PbiwgJ05lc3RlZCcpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBjb25kaXRpb25zID0gdGhpcy5wcmVwYXJlQ29uZGl0aW9ucygnTmVzdGVkJywgam9pbl9vcGVyYXRvci5Pbi5OZXN0ZWQsICcnLCAnb24nKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgam9pbnMucHVzaChjb25kaXRpb25zWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIG9uIHR5cGUnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgam9pbnMucHVzaChqb2luX21ldGhvZCArICcoJyArIGpvaW5lZF90YWJsZSArICcsJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnZnVuY3Rpb24oJGpvaW4pIHtcXG5cXHQnXG4gICAgICAgICAgICAgICAgICAgICAgICArICckam9pbi0+JyArIGFkZFRhYlRvRXZlcnlMaW5lKGNvbmRpdGlvbnMuam9pbignXFxuLT4nKSkgKyAnOydcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJ1xcbn0pJ1xuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgam9pbiByZWxhdGlvbiB0eXBlJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBqb2lucztcbiAgICB9XG5cbiAgICByZXNvbHZlSm9pblNlY3Rpb24oZnJvbV9pdGVtKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnByZXBhcmVKb2lucyhmcm9tX2l0ZW0pLmpvaW4oJ1xcbi0+Jyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIGZyb21faXRlbXNcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmdbXX1cbiAgICAgKi9cbiAgICByZXNvbHZlQ3Jvc3NKb2luU2VjdGlvbihmcm9tX2l0ZW1zKSB7XG4gICAgICAgIGxldCBjcm9zc19qb2luX3NlY3Rpb25zID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBmcm9tX2l0ZW0gb2YgZnJvbV9pdGVtcykge1xuICAgICAgICAgICAgbGV0IGNyb3NzX2pvaW5fc3RyO1xuXG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLnJlbGF0aW9uLCAnVGFibGUnKSkge1xuICAgICAgICAgICAgICAgIGNyb3NzX2pvaW5fc3RyID0gJ2Nyb3NzSm9pbignICsgdGhpcy5yZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZShmcm9tX2l0ZW0ucmVsYXRpb24pO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0ucmVsYXRpb24sICdEZXJpdmVkJykpIHtcbiAgICAgICAgICAgICAgICBjcm9zc19qb2luX3N0ciA9IHRoaXMucmVzb2x2ZUZyb21TdWJTZWN0aW9uKCdjcm9zc0pvaW5TdWInLCBmcm9tX2l0ZW0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBjcm9zcyBqb2luIHJlbGF0aW9uIHR5cGUnO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjcm9zc19qb2luX3NlY3Rpb25zLnB1c2goY3Jvc3Nfam9pbl9zdHIpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNyb3NzX2pvaW5fc2VjdGlvbnM7XG4gICAgfVxuXG4gICAgcmVzb2x2ZUdyb3VwQnlTZWN0aW9uKCkge1xuICAgICAgICBsZXQgZ3JvdXBfYnlfY29sdW1ucyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgZ3JvdXBfYnlfaXRlbSBvZiB0aGlzLmFzdC5ib2R5LlNlbGVjdC5ncm91cF9ieSkge1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGdyb3VwX2J5X2l0ZW0sICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBfYnlfY29sdW1ucy5wdXNoKCdEQjo6cmF3KCcgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKGdyb3VwX2J5X2l0ZW0uRnVuY3Rpb24pICsgJ1wiKScpO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGdyb3VwX2J5X2l0ZW0sICdJZGVudGlmaWVyJywgJ0NvbXBvdW5kSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgZ3JvdXBfYnlfY29sdW1ucy5wdXNoKHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChncm91cF9ieV9pdGVtKSkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChncm91cF9ieV9pdGVtLCAnTmVzdGVkJykpIHtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZ3JvdXBfYnlfaXRlbSwgJ1ZhbHVlJykpIHtcbiAgICAgICAgICAgICAgICBncm91cF9ieV9jb2x1bW5zLnB1c2godGhpcy5yZXNvbHZlVmFsdWUoZ3JvdXBfYnlfaXRlbS5WYWx1ZSkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBncm91cCBieSB0eXBlOicgKyBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGdyb3VwX2J5X2l0ZW0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICdncm91cEJ5KCcgKyBncm91cF9ieV9jb2x1bW5zLmpvaW4oJywnKSArICcpJztcbiAgICB9XG5cbiAgICByZXNvbHZlSGF2aW5nU2VjdGlvbigpIHtcbiAgICAgICAgbGV0IGJpbmFyeV9vcCA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdCh0aGlzLmFzdC5ib2R5LlNlbGVjdC5oYXZpbmcsICdCaW5hcnlPcCcpO1xuICAgICAgICBsZXQgbWV0aG9kX25hbWUgPSBwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChiaW5hcnlfb3AubGVmdCwgJ0Z1bmN0aW9uJykgPyAnaGF2aW5nUmF3JyA6ICdoYXZpbmcnO1xuXG4gICAgICAgIHJldHVybiBtZXRob2RfbmFtZSArICcoJyArIHRoaXMucGFyc2VCaW5hcnlPcE5vZGUoYmluYXJ5X29wLCAnLCcpICsgJyknO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZU9yZGVyQnlTZWN0aW9uKCkge1xuICAgICAgICBsZXQgb3JkZXJfYnlzID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBvcmRlcl9ieV9pdGVtIG9mIHRoaXMuYXN0Lm9yZGVyX2J5KSB7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwob3JkZXJfYnlfaXRlbS5leHByLCAnQmluYXJ5T3AnKSkge1xuICAgICAgICAgICAgICAgIG9yZGVyX2J5cy5wdXNoKCdvcmRlckJ5UmF3KCcgKyBxdW90ZSh0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKG9yZGVyX2J5X2l0ZW0uZXhwci5CaW5hcnlPcCkpICsgJyknKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwob3JkZXJfYnlfaXRlbS5leHByLCAnSWRlbnRpZmllcicsICdDb21wb3VuZElkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgIG9yZGVyX2J5cy5wdXNoKFxuICAgICAgICAgICAgICAgICAgICAnb3JkZXJCeSgnICtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KG9yZGVyX2J5X2l0ZW0uZXhwcikpICsgJywnICtcbiAgICAgICAgICAgICAgICAgICAgcXVvdGUob3JkZXJfYnlfaXRlbS5hc2MgPT09IGZhbHNlID8gJ2Rlc2MnOiAnYXNjJykgKyAnKSdcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChvcmRlcl9ieV9pdGVtLmV4cHIsICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICAgICAgb3JkZXJfYnlzLnB1c2goJ29yZGVyQnlSYXcoXCInICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShvcmRlcl9ieV9pdGVtLmV4cHIuRnVuY3Rpb24pICsgJyAnICsgKG9yZGVyX2J5X2l0ZW0uYXNjID09PSBmYWxzZSA/ICdkZXNjJzogJ2FzYycpICsgJ1wiKScpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBvcmRlciBieSB0eXBlOicgKyBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KG9yZGVyX2J5X2l0ZW0uZXhwcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3JkZXJfYnlzLmpvaW4oJ1xcbi0+Jyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHZhbHVlTm9kZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ3wqfVxuICAgICAqL1xuICAgIHJlc29sdmVWYWx1ZSh2YWx1ZU5vZGUpIHtcbiAgICAgICAgaWYgKGlzU3RyaW5nKHZhbHVlTm9kZSkgJiYgdmFsdWVOb2RlLnRvTG93ZXJDYXNlKCkgPT09ICdudWxsJykge1xuICAgICAgICAgICAgcmV0dXJuICdudWxsJztcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB2YWx1ZSA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdCh2YWx1ZU5vZGUpO1xuICAgICAgICBsZXQgdmFsdWVfdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QodmFsdWVOb2RlKTtcblxuICAgICAgICBpZiAodmFsdWVfdHlwZSA9PT0gJ1NpbmdsZVF1b3RlZFN0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBxdW90ZSh2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVfdHlwZSA9PT0gJ051bWJlcicpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVswXTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZV90eXBlID09PSAnQ29tcG91bmRJZGVudGlmaWVyJyB8fCB2YWx1ZV90eXBlID09PSAnSWRlbnRpZmllcicpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbih2YWx1ZSk7XG4gICAgICAgIH0gZWxzZSBpZiAodmFsdWVfdHlwZSA9PT0gJ0Jvb2xlYW4nKSB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgYXJnIHZhbHVlIHR5cGU6JyArIHZhbHVlX3R5cGU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBnZXRBY3R1YWxUYWJsZU5hbWUodGFibGVfbmFtZV9vcl9hbGlhcykge1xuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy50YWJsZV9uYW1lX2J5X2FsaWFzLCB0YWJsZV9uYW1lX29yX2FsaWFzKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMudGFibGVfbmFtZV9ieV9hbGlhc1t0YWJsZV9uYW1lX29yX2FsaWFzXTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLnBhcmVudCAhPSBudWxsKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZ2V0QWN0dWFsVGFibGVOYW1lKHRhYmxlX25hbWVfb3JfYWxpYXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRhYmxlX25hbWVfb3JfYWxpYXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIGlkZW50aWZpZXJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IG5lZWRfcXVvdGVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGlkZW50aWZpZXIsIG5lZWRfcXVvdGUgPSB0cnVlKSB7XG4gICAgICAgIGxldCB2YWx1ZXMgPSBbaWRlbnRpZmllcl0uZmxhdCgpLm1hcCgoaSkgPT4gaS52YWx1ZSk7XG4gICAgICAgIGxldCB0YWJsZV9uYW1lX29yX2FsaWFzID0gdmFsdWVzWzBdO1xuXG4gICAgICAgIC8vIEZpcnN0IGluZGV4IGFsd2F5cyBpcyB0YWJsZSBuYW1lIG9yIGFsaWFzLCBjaGFuZ2UgaXQgdG8gYWN0dWFsIHRhYmxlIG5hbWUuXG4gICAgICAgIHZhbHVlc1swXSA9IHRoaXMuZ2V0QWN0dWFsVGFibGVOYW1lKHRhYmxlX25hbWVfb3JfYWxpYXMpO1xuXG4gICAgICAgIGxldCByZXMgPSB2YWx1ZXMuam9pbignLicpO1xuXG4gICAgICAgIGlmIChuZWVkX3F1b3RlKSB7XG4gICAgICAgICAgICByZXMgPSBxdW90ZShyZXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG59XG5cbi8qKlxuICogQHBhcmFtIHtib29sZWFufSBjb25kaXRpb25cbiAqIEBwYXJhbSB7c3RyaW5nfSBtc2dcbiAqL1xuZnVuY3Rpb24gYXNzZXJ0KGNvbmRpdGlvbiwgbXNnKSB7XG4gICAgaWYgKCFjb25kaXRpb24pIHtcbiAgICAgICAgdGhyb3cgbXNnO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAcGFyYW0gb2JqXG4gKiBAcGFyYW0gcHJvcGVydHlfbmFtZXNcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKG9iaiwgLi4ucHJvcGVydHlfbmFtZXMpIHtcbiAgICByZXR1cm4gcHJvcGVydHlfbmFtZXMucmVkdWNlKChjYXJyeSwgcHJvcGVydHlfbmFtZSkgPT4gY2FycnkgfHwgKG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wZXJ0eV9uYW1lKSAmJiBvYmpbcHJvcGVydHlfbmFtZV0gIT09IG51bGwpLCBmYWxzZSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHZhbHVlXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5mdW5jdGlvbiBpc1N0cmluZyh2YWx1ZSkge1xuICAgIHJldHVybiAgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIFN0cmluZztcbn1cblxuZnVuY3Rpb24gY2FwaXRhbGl6ZUZpcnN0TGV0dGVyKHN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmcuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBzdHJpbmcuc2xpY2UoMSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHZhbHVlXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIHF1b3RlKHZhbHVlKSB7XG4gICAgcmV0dXJuIFwiJ1wiICsgdmFsdWUgKyBcIidcIjtcbn1cblxuLyoqXG4gKiBAcGFyYW0gdmFsdWVcbiAqIEByZXR1cm5zIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIHVucXVvdGUodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWydcIl0rL2csICcnKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gb2JqXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmZ1bmN0aW9uIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qob2JqKSB7XG4gICAgaWYgKE9iamVjdC5rZXlzKG9iaikubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgIHRocm93ICdUaGUgZnVuY3Rpb24gY2FuIG9ubHkgYmUgY2FsbGVkIG9uIG9iamVjdCB0aGF0IGhhcyBvbmUga2V5LCBvYmplY3Q6ICcgKyBKU09OLnN0cmluZ2lmeShvYmopO1xuICAgIH1cblxuICAgIHJldHVybiBPYmplY3Qua2V5cyhvYmopWzBdO1xufVxuXG4vKipcbiAqIEBwYXJhbSBvYmpcbiAqIEByZXR1cm4geyp9XG4gKi9cbmZ1bmN0aW9uIGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChvYmopIHtcbiAgICByZXR1cm4gb2JqW2dldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qob2JqKV07XG59XG5cbi8qKlxuICogQHBhcmFtIHZhbHVlXG4gKiBAcmV0dXJuIHtib29sZWFufVxuICovXG5mdW5jdGlvbiBpc1VuZGVmaW5lZE9yTnVsbCh2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnIHx8IHZhbHVlID09PSBudWxsO1xufVxuXG4vKipcbiAqIEBwYXJhbSBzdHJcbiAqIEBwYXJhbSB0YWJfY291bnRcbiAqL1xuZnVuY3Rpb24gYWRkVGFiVG9FdmVyeUxpbmUoc3RyLCB0YWJfY291bnQgPSAxKSB7XG4gICAgbGV0IHNlcGFyYXRvciA9ICdcXG4nO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0YWJfY291bnQ7IGkrKykge1xuICAgICAgICBzZXBhcmF0b3IgPSBzZXBhcmF0b3IgKyAnXFx0JztcbiAgICB9XG5cbiAgICByZXR1cm4gc3RyLnNwbGl0KCdcXG4nKS5qb2luKHNlcGFyYXRvcik7XG59XG5cbiIsImltcG9ydCAqIGFzIHdhc20gZnJvbSBcInNxbHBhcnNlci1ycy13YXNtXCI7XG5pbXBvcnQge0NvbnZlcnRlcn0gZnJvbSBcIi4vY29udmVydGVyXCI7XG5pbXBvcnQgJy4vc3R5bGUuY3NzJztcblxuLy8gU2hvdyBub3RpZmljYXRpb24gbWVzc2FnZVxuZnVuY3Rpb24gc2hvd05vdGlmaWNhdGlvbihtZXNzYWdlLCB0eXBlID0gJ3N1Y2Nlc3MnKSB7XG4gICAgLy8gUmVtb3ZlIGFueSBleGlzdGluZyBub3RpZmljYXRpb25zXG4gICAgY29uc3QgZXhpc3RpbmdOb3RpZiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5tZXNzYWdlLWJveCcpO1xuICAgIGlmIChleGlzdGluZ05vdGlmKSB7XG4gICAgICAgIGV4aXN0aW5nTm90aWYucmVtb3ZlKCk7XG4gICAgfVxuXG4gICAgY29uc3Qgbm90aWZpY2F0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgbm90aWZpY2F0aW9uLmNsYXNzTmFtZSA9IGBtZXNzYWdlLWJveCAke3R5cGV9YDtcbiAgICBub3RpZmljYXRpb24uaW5uZXJIVE1MID0gYDxzcGFuPiR7dHlwZSA9PT0gJ3N1Y2Nlc3MnID8gJ+KchScgOiAn4p2MJ308L3NwYW4+PHNwYW4+JHttZXNzYWdlfTwvc3Bhbj5gO1xuXG4gICAgY29uc3Qgd3JhcHBlciA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jb250ZW50LXdyYXBwZXInKTtcbiAgICB3cmFwcGVyLmluc2VydEJlZm9yZShub3RpZmljYXRpb24sIHdyYXBwZXIuZmlyc3RDaGlsZCk7XG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgbm90aWZpY2F0aW9uLnN0eWxlLmFuaW1hdGlvbiA9ICdmYWRlSW5VcCAwLjNzIGVhc2Utb3V0IHJldmVyc2UnO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IG5vdGlmaWNhdGlvbi5yZW1vdmUoKSwgMzAwKTtcbiAgICB9LCAzMDAwKTtcbn1cblxubGV0IGNvbnZlcnRlciA9IGZ1bmN0aW9uICgpIHtcbiAgICBsZXQgaW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImlucHV0XCIpLnZhbHVlO1xuICAgIGxldCBjb252ZXJ0QnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb252ZXJ0LWJ1dHRvblwiKTtcblxuICAgIGlmIChpbnB1dC50cmltKCkgPT09ICcnKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1BsZWFzZSBlbnRlciBhIFNRTCBxdWVyeScsICdlcnJvcicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGlucHV0LnNsaWNlKC0xKSA9PT0gJzsnKSB7XG4gICAgICAgIGlucHV0ID0gaW5wdXQuc2xpY2UoMCwgLTEpO1xuICAgIH1cblxuICAgIGxldCBvdXRwdXRfdGV4dF9hcmVhID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJvdXRwdXRcIik7XG5cbiAgICBpZiAoIWlucHV0LnN0YXJ0c1dpdGgoJ3NlbGVjdCcpICYmICFpbnB1dC5zdGFydHNXaXRoKCdTRUxFQ1QnKSkge1xuICAgICAgICBvdXRwdXRfdGV4dF9hcmVhLnZhbHVlID0gJ1NRTCBtdXN0IHN0YXJ0IHdpdGggc2VsZWN0IG9yIFNFTEVDVCc7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1NRTCBxdWVyeSBtdXN0IHN0YXJ0IHdpdGggU0VMRUNUJywgJ2Vycm9yJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBBZGQgbG9hZGluZyBzdGF0ZVxuICAgIGNvbnZlcnRCdXR0b24uY2xhc3NMaXN0LmFkZCgnaXMtbG9hZGluZycpO1xuICAgIGNvbnZlcnRCdXR0b24uZGlzYWJsZWQgPSB0cnVlO1xuXG4gICAgLy8gVXNlIHNldFRpbWVvdXQgdG8gYWxsb3cgVUkgdG8gdXBkYXRlXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBsZXQgYXN0ID0gd2FzbS5wYXJzZV9zcWwoXCItLW15c3FsXCIsIGlucHV0KTtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGFzdCk7XG4gICAgICAgICAgICBpZiAoYXN0LnN0YXJ0c1dpdGgoJ0Vycm9yJykpIHtcbiAgICAgICAgICAgICAgICBvdXRwdXRfdGV4dF9hcmVhLnZhbHVlID0gYXN0O1xuICAgICAgICAgICAgICAgIHNob3dOb3RpZmljYXRpb24oJ0Vycm9yIHBhcnNpbmcgU1FMIHF1ZXJ5JywgJ2Vycm9yJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSAobmV3IENvbnZlcnRlcihKU09OLnBhcnNlKGFzdClbMF0uUXVlcnkpKS5ydW4oKTtcbiAgICAgICAgICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdTdWNjZXNzZnVsbHkgY29udmVydGVkIHRvIExhcmF2ZWwgUXVlcnkgQnVpbGRlciEnLCAnc3VjY2VzcycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhpbnB1dCk7XG4gICAgICAgICAgICBvdXRwdXRfdGV4dF9hcmVhLnZhbHVlID0gZSArICcsIEkgd2lsbCBmaXggdGhpcyBpc3N1ZSBhcyBzb29uIGFzIHBvc3NpYmxlJztcbiAgICAgICAgICAgIHNob3dOb3RpZmljYXRpb24oJ0NvbnZlcnNpb24gZXJyb3Igb2NjdXJyZWQnLCAnZXJyb3InKTtcbiAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjb252ZXJ0QnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoJ2lzLWxvYWRpbmcnKTtcbiAgICAgICAgICAgIGNvbnZlcnRCdXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgIH0sIDEwMCk7XG59XG5cbi8vIENvcHkgdG8gY2xpcGJvYXJkIGZ1bmN0aW9uYWxpdHlcbmZ1bmN0aW9uIGNvcHlUb0NsaXBib2FyZCgpIHtcbiAgICBjb25zdCBvdXRwdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm91dHB1dFwiKS52YWx1ZTtcbiAgICBjb25zdCBjb3B5QnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb3B5LWJ1dHRvblwiKTtcbiAgICBjb25zdCBjb3B5VGV4dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29weS10ZXh0XCIpO1xuICAgIGNvbnN0IGNvcHlJY29uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb3B5LWljb25cIik7XG5cbiAgICBpZiAoIW91dHB1dCB8fCBvdXRwdXQudHJpbSgpID09PSAnJyB8fCBvdXRwdXQuaW5jbHVkZXMoJ1lvdXIgTGFyYXZlbCBxdWVyeSBidWlsZGVyIGNvZGUgd2lsbCBhcHBlYXIgaGVyZScpKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ05vIG91dHB1dCB0byBjb3B5JywgJ2Vycm9yJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChvdXRwdXQpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIGNvcHlCdXR0b24uY2xhc3NMaXN0LmFkZCgnY29waWVkJyk7XG4gICAgICAgIGNvcHlUZXh0LnRleHRDb250ZW50ID0gJ0NvcGllZCEnO1xuICAgICAgICBjb3B5SWNvbi50ZXh0Q29udGVudCA9ICfinJMnO1xuXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgY29weUJ1dHRvbi5jbGFzc0xpc3QucmVtb3ZlKCdjb3BpZWQnKTtcbiAgICAgICAgICAgIGNvcHlUZXh0LnRleHRDb250ZW50ID0gJ0NvcHknO1xuICAgICAgICAgICAgY29weUljb24udGV4dENvbnRlbnQgPSAn8J+Tiyc7XG4gICAgICAgIH0sIDIwMDApO1xuICAgIH0sIGZ1bmN0aW9uKCkge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdGYWlsZWQgdG8gY29weSB0byBjbGlwYm9hcmQnLCAnZXJyb3InKTtcbiAgICB9KTtcbn1cblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCAoZXZlbnQpID0+IHtcbiAgICBsZXQgdXJsX3NlYXJjaF9wYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHdpbmRvdy5sb2NhdGlvbi5zZWFyY2gpO1xuXG4gICAgaWYodXJsX3NlYXJjaF9wYXJhbXMuaGFzKCdiYXNlNjRzcWwnKSkge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS52YWx1ZSA9IGF0b2IodXJsX3NlYXJjaF9wYXJhbXMuZ2V0KCdiYXNlNjRzcWwnKSk7XG4gICAgICAgIGNvbnZlcnRlcigpO1xuICAgIH1cbn0pO1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29udmVydC1idXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNvbnZlcnRlcik7XG5cbi8vIEFkZCBFbnRlciBrZXkgc3VwcG9ydCAoQ3RybC9DbWQgKyBFbnRlciB0byBjb252ZXJ0KVxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2lucHV0JykuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGZ1bmN0aW9uKGUpIHtcbiAgICBpZiAoKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpICYmIGUua2V5ID09PSAnRW50ZXInKSB7XG4gICAgICAgIGNvbnZlcnRlcigpO1xuICAgIH1cbn0pO1xuXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2hhcmUtYnV0dG9uJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbiAoKSB7XG4gICAgY29uc3QgaW5wdXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS52YWx1ZTtcblxuICAgIGlmICghaW5wdXQgfHwgaW5wdXQudHJpbSgpID09PSAnJykge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdQbGVhc2UgZW50ZXIgYSBTUUwgcXVlcnkgZmlyc3QnLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBzaGFyZV9saW5rID0gd2luZG93LmxvY2F0aW9uLm9yaWdpbiArIHdpbmRvdy5sb2NhdGlvbi5wYXRobmFtZSArICc/YmFzZTY0c3FsPScgKyBidG9hKGlucHV0KTtcbiAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dChzaGFyZV9saW5rKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdTaGFyZSBsaW5rIGNvcGllZCB0byBjbGlwYm9hcmQhJywgJ3N1Y2Nlc3MnKTtcbiAgICB9LCBmdW5jdGlvbigpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignRmFpbGVkIHRvIGNvcHkgc2hhcmUgbGluaycsICdlcnJvcicpO1xuICAgIH0pO1xufSk7XG5cbi8vIEFkZCBjb3B5IGJ1dHRvbiBldmVudCBsaXN0ZW5lclxuZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvcHktYnV0dG9uJykuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBjb3B5VG9DbGlwYm9hcmQpO1xuIiwiLy8gSW1wb3J0c1xuaW1wb3J0IF9fX0NTU19MT0FERVJfQVBJX1NPVVJDRU1BUF9JTVBPUlRfX18gZnJvbSBcIi4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvcnVudGltZS9zb3VyY2VNYXBzLmpzXCI7XG5pbXBvcnQgX19fQ1NTX0xPQURFUl9BUElfSU1QT1JUX19fIGZyb20gXCIuLi9ub2RlX21vZHVsZXMvY3NzLWxvYWRlci9kaXN0L3J1bnRpbWUvYXBpLmpzXCI7XG5pbXBvcnQgX19fQ1NTX0xPQURFUl9HRVRfVVJMX0lNUE9SVF9fXyBmcm9tIFwiLi4vbm9kZV9tb2R1bGVzL2Nzcy1sb2FkZXIvZGlzdC9ydW50aW1lL2dldFVybC5qc1wiO1xudmFyIF9fX0NTU19MT0FERVJfVVJMX0lNUE9SVF8wX19fID0gbmV3IFVSTChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwlM0Nzdmcgd2lkdGg9JTI3NjAlMjcgaGVpZ2h0PSUyNzYwJTI3IHZpZXdCb3g9JTI3MCAwIDYwIDYwJTI3IHhtbG5zPSUyN2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJTI3JTNFJTNDZyBmaWxsPSUyN25vbmUlMjcgZmlsbC1ydWxlPSUyN2V2ZW5vZGQlMjclM0UlM0NnIGZpbGw9JTI3JTIzZmZmZmZmJTI3IGZpbGwtb3BhY2l0eT0lMjcwLjA1JTI3JTNFJTNDcGF0aCBkPSUyN00zNiAzNHYtNGgtMnY0aC00djJoNHY0aDJ2LTRoNHYtMmgtNHptMC0zMFYwaC0ydjRoLTR2Mmg0djRoMlY2aDRWNGgtNHpNNiAzNHYtNEg0djRIMHYyaDR2NGgydi00aDR2LTJINnpNNiA0VjBINHY0SDB2Mmg0djRoMlY2aDRWNEg2eiUyNy8lM0UlM0MvZyUzRSUzQy9nJTNFJTNDL3N2ZyUzRVwiLCBpbXBvcnQubWV0YS51cmwpO1xudmFyIF9fX0NTU19MT0FERVJfRVhQT1JUX19fID0gX19fQ1NTX0xPQURFUl9BUElfSU1QT1JUX19fKF9fX0NTU19MT0FERVJfQVBJX1NPVVJDRU1BUF9JTVBPUlRfX18pO1xudmFyIF9fX0NTU19MT0FERVJfVVJMX1JFUExBQ0VNRU5UXzBfX18gPSBfX19DU1NfTE9BREVSX0dFVF9VUkxfSU1QT1JUX19fKF9fX0NTU19MT0FERVJfVVJMX0lNUE9SVF8wX19fKTtcbi8vIE1vZHVsZVxuX19fQ1NTX0xPQURFUl9FWFBPUlRfX18ucHVzaChbbW9kdWxlLmlkLCBgLyogTW9kZXJuIFNRTCB0byBMYXJhdmVsIEJ1aWxkZXIgLSBDdXN0b20gU3R5bGVzICovXG5cbjpyb290IHtcbiAgLS1wcmltYXJ5LWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNjY3ZWVhIDAlLCAjNzY0YmEyIDEwMCUpO1xuICAtLXNlY29uZGFyeS1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2YwOTNmYiAwJSwgI2Y1NTc2YyAxMDAlKTtcbiAgLS1zdWNjZXNzLWdyYWRpZW50OiBsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLCAjNGZhY2ZlIDAlLCAjMDBmMmZlIDEwMCUpO1xuICAtLWRhcmstYmc6ICMxYTFhMmU7XG4gIC0tY2FyZC1iZzogI2ZmZmZmZjtcbiAgLS10ZXh0LXByaW1hcnk6ICMyZDM3NDg7XG4gIC0tdGV4dC1zZWNvbmRhcnk6ICM3MTgwOTY7XG4gIC0tYm9yZGVyLWNvbG9yOiAjZTJlOGYwO1xuICAtLXNoYWRvdy1zbTogMCAycHggNHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XG4gIC0tc2hhZG93LW1kOiAwIDRweCA2cHggcmdiYSgwLCAwLCAwLCAwLjA3KTtcbiAgLS1zaGFkb3ctbGc6IDAgMTBweCAyNXB4IHJnYmEoMCwgMCwgMCwgMC4xKTtcbiAgLS1zaGFkb3cteGw6IDAgMjBweCA0MHB4IHJnYmEoMCwgMCwgMCwgMC4xNSk7XG4gIC0tcmFkaXVzLXNtOiA4cHg7XG4gIC0tcmFkaXVzLW1kOiAxMnB4O1xuICAtLXJhZGl1cy1sZzogMTZweDtcbn1cblxuKiB7XG4gIGJveC1zaXppbmc6IGJvcmRlci1ib3g7XG59XG5cbmJvZHkge1xuICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCAnU2Vnb2UgVUknLCAnUm9ib3RvJywgJ094eWdlbicsICdVYnVudHUnLCAnQ2FudGFyZWxsJywgJ0ZpcmEgU2FucycsICdEcm9pZCBTYW5zJywgJ0hlbHZldGljYSBOZXVlJywgc2Fucy1zZXJpZjtcbiAgLXdlYmtpdC1mb250LXNtb290aGluZzogYW50aWFsaWFzZWQ7XG4gIC1tb3otb3N4LWZvbnQtc21vb3RoaW5nOiBncmF5c2NhbGU7XG4gIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICNmNWY3ZmEgMCUsICNjM2NmZTIgMTAwJSk7XG4gIG1pbi1oZWlnaHQ6IDEwMHZoO1xufVxuXG4vKiBIZXJvIFNlY3Rpb24gUmVkZXNpZ24gKi9cbi5oZXJvLmlzLXByaW1hcnkge1xuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICBvdmVyZmxvdzogaGlkZGVuO1xufVxuXG4uaGVyby5pcy1wcmltYXJ5OjpiZWZvcmUge1xuICBjb250ZW50OiAnJztcbiAgcG9zaXRpb246IGFic29sdXRlO1xuICB0b3A6IDA7XG4gIGxlZnQ6IDA7XG4gIHJpZ2h0OiAwO1xuICBib3R0b206IDA7XG4gIGJhY2tncm91bmQ6IHVybCgke19fX0NTU19MT0FERVJfVVJMX1JFUExBQ0VNRU5UXzBfX199KTtcbiAgb3BhY2l0eTogMC4zO1xufVxuXG4uaGVyby1ib2R5IHtcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xuICB6LWluZGV4OiAxO1xuICBwYWRkaW5nOiAzcmVtIDEuNXJlbTtcbn1cblxuLmhlcm8gLnRpdGxlIHtcbiAgZm9udC1zaXplOiAyLjVyZW07XG4gIGZvbnQtd2VpZ2h0OiA4MDA7XG4gIHRleHQtc2hhZG93OiAwIDJweCAxMHB4IHJnYmEoMCwgMCwgMCwgMC4xKTtcbiAgbGV0dGVyLXNwYWNpbmc6IC0wLjVweDtcbn1cblxuLmhlcm8gLnN1YnRpdGxlIHtcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xuICBvcGFjaXR5OiAwLjk1O1xuICBtYXJnaW4tdG9wOiAxcmVtO1xufVxuXG4vKiBOYXZpZ2F0aW9uL0hlYWRlciAqL1xuLm5hdi1oZWFkZXIge1xuICBwYWRkaW5nOiAxcmVtIDJyZW07XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1zbSk7XG59XG5cbi5naXRodWItbGluayB7XG4gIGRpc3BsYXk6IGlubGluZS1mbGV4O1xuICBhbGlnbi1pdGVtczogY2VudGVyO1xuICBnYXA6IDAuNXJlbTtcbiAgcGFkZGluZzogMC43NXJlbSAxLjVyZW07XG4gIGJhY2tncm91bmQ6IHZhcigtLWRhcmstYmcpO1xuICBjb2xvcjogd2hpdGU7XG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcbiAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcbn1cblxuLmdpdGh1Yi1saW5rOmhvdmVyIHtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xuICBjb2xvcjogd2hpdGU7XG59XG5cbi5naXRodWItbGluazo6YmVmb3JlIHtcbiAgY29udGVudDogJ+KYhSc7XG4gIGZvbnQtc2l6ZTogMS4yNXJlbTtcbn1cblxuLyogTWFpbiBDb250ZW50IEFyZWEgKi9cbi5jb250ZW50LXdyYXBwZXIge1xuICBtYXgtd2lkdGg6IDEyMDBweDtcbiAgbWFyZ2luOiAwIGF1dG87XG4gIHBhZGRpbmc6IDJyZW0gMXJlbTtcbn1cblxuLmNvbnZlcnRlci1jYXJkIHtcbiAgYmFja2dyb3VuZDogdmFyKC0tY2FyZC1iZyk7XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1sZyk7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy14bCk7XG4gIHBhZGRpbmc6IDIuNXJlbTtcbiAgbWFyZ2luLWJvdHRvbTogMnJlbTtcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgZWFzZTtcbn1cblxuLmNvbnZlcnRlci1jYXJkOmhvdmVyIHtcbiAgYm94LXNoYWRvdzogMCAyNXB4IDUwcHggcmdiYSgwLCAwLCAwLCAwLjIpO1xufVxuXG4vKiBTZWN0aW9uIEhlYWRlcnMgKi9cbi5zZWN0aW9uLWhlYWRlciB7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGdhcDogMC43NXJlbTtcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xuICBmb250LXdlaWdodDogNzAwO1xuICBjb2xvcjogdmFyKC0tdGV4dC1wcmltYXJ5KTtcbn1cblxuLnNlY3Rpb24taWNvbiB7XG4gIHdpZHRoOiA0MHB4O1xuICBoZWlnaHQ6IDQwcHg7XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1zbSk7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xuICBmb250LXNpemU6IDEuMjVyZW07XG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xuICBjb2xvcjogd2hpdGU7XG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XG59XG5cbi8qIFRleHRhcmVhIFJlZGVzaWduICovXG4udGV4dGFyZWEtd3JhcHBlciB7XG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgbWFyZ2luLWJvdHRvbTogMS41cmVtO1xufVxuXG4udGV4dGFyZWEge1xuICBib3JkZXI6IDJweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBwYWRkaW5nOiAxLjI1cmVtO1xuICBmb250LXNpemU6IDFyZW07XG4gIGZvbnQtZmFtaWx5OiAnTW9uYWNvJywgJ01lbmxvJywgJ1VidW50dSBNb25vJywgJ0NvbnNvbGFzJywgJ3NvdXJjZS1jb2RlLXBybycsIG1vbm9zcGFjZTtcbiAgbGluZS1oZWlnaHQ6IDEuNjtcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgZWFzZTtcbiAgcmVzaXplOiB2ZXJ0aWNhbDtcbiAgbWluLWhlaWdodDogMjAwcHg7XG4gIGJhY2tncm91bmQ6ICNmOGZhZmM7XG59XG5cbi50ZXh0YXJlYTpmb2N1cyB7XG4gIG91dGxpbmU6IG5vbmU7XG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcbiAgYm94LXNoYWRvdzogMCAwIDAgM3B4IHJnYmEoMTAyLCAxMjYsIDIzNCwgMC4xKTtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG59XG5cbi50ZXh0YXJlYTo6cGxhY2Vob2xkZXIge1xuICBjb2xvcjogI2EwYWVjMDtcbiAgZm9udC1zdHlsZTogaXRhbGljO1xufVxuXG4vKiBDb3B5IEJ1dHRvbiAqL1xuLmNvcHktYnV0dG9uIHtcbiAgcG9zaXRpb246IGFic29sdXRlO1xuICB0b3A6IDAuNzVyZW07XG4gIHJpZ2h0OiAwLjc1cmVtO1xuICBwYWRkaW5nOiAwLjVyZW0gMXJlbTtcbiAgYmFja2dyb3VuZDogd2hpdGU7XG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1zbSk7XG4gIGN1cnNvcjogcG9pbnRlcjtcbiAgZm9udC1zaXplOiAwLjg3NXJlbTtcbiAgZm9udC13ZWlnaHQ6IDYwMDtcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcbiAgdHJhbnNpdGlvbjogYWxsIDAuMnMgZWFzZTtcbiAgei1pbmRleDogMTA7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGdhcDogMC41cmVtO1xufVxuXG4uY29weS1idXR0b246aG92ZXIge1xuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xuICBjb2xvcjogd2hpdGU7XG4gIGJvcmRlci1jb2xvcjogIzY2N2VlYTtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0xcHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xufVxuXG4uY29weS1idXR0b24uY29waWVkIHtcbiAgYmFja2dyb3VuZDogIzQ4YmI3ODtcbiAgY29sb3I6IHdoaXRlO1xuICBib3JkZXItY29sb3I6ICM0OGJiNzg7XG59XG5cbi8qIEJ1dHRvbiBDb250cm9scyAqL1xuLmJ1dHRvbi1jb250cm9scyB7XG4gIGRpc3BsYXk6IGZsZXg7XG4gIGdhcDogMXJlbTtcbiAgZmxleC13cmFwOiB3cmFwO1xufVxuXG4uYnV0dG9uIHtcbiAgcGFkZGluZzogMC44NzVyZW0gMnJlbTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcbiAgZm9udC13ZWlnaHQ6IDcwMDtcbiAgZm9udC1zaXplOiAxcmVtO1xuICBib3JkZXI6IG5vbmU7XG4gIGN1cnNvcjogcG9pbnRlcjtcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgY3ViaWMtYmV6aWVyKDAuNCwgMCwgMC4yLCAxKTtcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XG4gIGdhcDogMC41cmVtO1xuICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gIG92ZXJmbG93OiBoaWRkZW47XG59XG5cbi5idXR0b246OmJlZm9yZSB7XG4gIGNvbnRlbnQ6ICcnO1xuICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gIHRvcDogNTAlO1xuICBsZWZ0OiA1MCU7XG4gIHdpZHRoOiAwO1xuICBoZWlnaHQ6IDA7XG4gIGJvcmRlci1yYWRpdXM6IDUwJTtcbiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjMpO1xuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZSgtNTAlLCAtNTAlKTtcbiAgdHJhbnNpdGlvbjogd2lkdGggMC42cywgaGVpZ2h0IDAuNnM7XG59XG5cbi5idXR0b246aG92ZXI6OmJlZm9yZSB7XG4gIHdpZHRoOiAzMDBweDtcbiAgaGVpZ2h0OiAzMDBweDtcbn1cblxuLmJ1dHRvbi5pcy1wcmltYXJ5IHtcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcbn1cblxuLmJ1dHRvbi5pcy1wcmltYXJ5OmhvdmVyIHtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC0ycHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xufVxuXG4uYnV0dG9uLmlzLXNlY29uZGFyeSB7XG4gIGJhY2tncm91bmQ6IHdoaXRlO1xuICBjb2xvcjogIzY2N2VlYTtcbiAgYm9yZGVyOiAycHggc29saWQgIzY2N2VlYTtcbn1cblxuLmJ1dHRvbi5pcy1zZWNvbmRhcnk6aG92ZXIge1xuICBiYWNrZ3JvdW5kOiAjNjY3ZWVhO1xuICBjb2xvcjogd2hpdGU7XG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTtcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LWxnKTtcbn1cblxuLyogTG9hZGluZyBBbmltYXRpb24gKi9cbi5idXR0b24uaXMtbG9hZGluZyB7XG4gIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICBvcGFjaXR5OiAwLjc7XG59XG5cbi5idXR0b24uaXMtbG9hZGluZzo6YWZ0ZXIge1xuICBjb250ZW50OiAnJztcbiAgcG9zaXRpb246IGFic29sdXRlO1xuICB3aWR0aDogMTZweDtcbiAgaGVpZ2h0OiAxNnB4O1xuICB0b3A6IDUwJTtcbiAgbGVmdDogNTAlO1xuICBtYXJnaW4tbGVmdDogLThweDtcbiAgbWFyZ2luLXRvcDogLThweDtcbiAgYm9yZGVyOiAycHggc29saWQgdHJhbnNwYXJlbnQ7XG4gIGJvcmRlci10b3AtY29sb3I6IHdoaXRlO1xuICBib3JkZXItcmFkaXVzOiA1MCU7XG4gIGFuaW1hdGlvbjogYnV0dG9uLWxvYWRpbmctc3Bpbm5lciAwLjZzIGxpbmVhciBpbmZpbml0ZTtcbn1cblxuQGtleWZyYW1lcyBidXR0b24tbG9hZGluZy1zcGlubmVyIHtcbiAgZnJvbSB7XG4gICAgdHJhbnNmb3JtOiByb3RhdGUoMHR1cm4pO1xuICB9XG4gIHRvIHtcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgxdHVybik7XG4gIH1cbn1cblxuLyogRmVhdHVyZXMgU2VjdGlvbiAqL1xuLmZlYXR1cmVzLWdyaWQge1xuICBkaXNwbGF5OiBncmlkO1xuICBncmlkLXRlbXBsYXRlLWNvbHVtbnM6IHJlcGVhdChhdXRvLWZpdCwgbWlubWF4KDI1MHB4LCAxZnIpKTtcbiAgZ2FwOiAxLjVyZW07XG4gIG1hcmdpbi10b3A6IDJyZW07XG4gIG1hcmdpbi1ib3R0b206IDJyZW07XG59XG5cbi5mZWF0dXJlLWNhcmQge1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgcGFkZGluZzogMS41cmVtO1xuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xuICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1ib3JkZXItY29sb3IpO1xufVxuXG4uZmVhdHVyZS1jYXJkOmhvdmVyIHtcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC00cHgpO1xuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xufVxuXG4uZmVhdHVyZS1pY29uIHtcbiAgd2lkdGg6IDUwcHg7XG4gIGhlaWdodDogNTBweDtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XG4gIGNvbG9yOiB3aGl0ZTtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIGZvbnQtc2l6ZTogMS41cmVtO1xuICBtYXJnaW4tYm90dG9tOiAxcmVtO1xufVxuXG4uZmVhdHVyZS10aXRsZSB7XG4gIGZvbnQtc2l6ZTogMS4xMjVyZW07XG4gIGZvbnQtd2VpZ2h0OiA3MDA7XG4gIGNvbG9yOiB2YXIoLS10ZXh0LXByaW1hcnkpO1xuICBtYXJnaW4tYm90dG9tOiAwLjVyZW07XG59XG5cbi5mZWF0dXJlLWRlc2NyaXB0aW9uIHtcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcbiAgZm9udC1zaXplOiAwLjlyZW07XG4gIGxpbmUtaGVpZ2h0OiAxLjY7XG59XG5cbi8qIEZvb3RlciAqL1xuLm1vZGVybi1mb290ZXIge1xuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcbiAgcGFkZGluZzogMnJlbTtcbiAgdGV4dC1hbGlnbjogY2VudGVyO1xuICBtYXJnaW4tdG9wOiA0cmVtO1xuICBib3gtc2hhZG93OiAwIC0ycHggMTBweCByZ2JhKDAsIDAsIDAsIDAuMDUpO1xufVxuXG4ubW9kZXJuLWZvb3RlciBwIHtcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcbiAgbWFyZ2luOiAwO1xufVxuXG4ubW9kZXJuLWZvb3RlciBhIHtcbiAgY29sb3I6ICM2NjdlZWE7XG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcbiAgZm9udC13ZWlnaHQ6IDYwMDtcbn1cblxuLm1vZGVybi1mb290ZXIgYTpob3ZlciB7XG4gIHRleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1xufVxuXG4vKiBBbmltYXRpb25zICovXG5Aa2V5ZnJhbWVzIGZhZGVJblVwIHtcbiAgZnJvbSB7XG4gICAgb3BhY2l0eTogMDtcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMjBweCk7XG4gIH1cbiAgdG8ge1xuICAgIG9wYWNpdHk6IDE7XG4gICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKDApO1xuICB9XG59XG5cbi5mYWRlLWluLXVwIHtcbiAgYW5pbWF0aW9uOiBmYWRlSW5VcCAwLjZzIGVhc2Utb3V0O1xufVxuXG4vKiBTdWNjZXNzL0Vycm9yIE1lc3NhZ2VzICovXG4ubWVzc2FnZS1ib3gge1xuICBwYWRkaW5nOiAxcmVtIDEuNXJlbTtcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcbiAgZGlzcGxheTogZmxleDtcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgZ2FwOiAwLjc1cmVtO1xuICBhbmltYXRpb246IGZhZGVJblVwIDAuM3MgZWFzZS1vdXQ7XG59XG5cbi5tZXNzYWdlLWJveC5zdWNjZXNzIHtcbiAgYmFja2dyb3VuZDogI2Q0ZWRkYTtcbiAgY29sb3I6ICMxNTU3MjQ7XG4gIGJvcmRlci1sZWZ0OiA0cHggc29saWQgIzI4YTc0NTtcbn1cblxuLm1lc3NhZ2UtYm94LmVycm9yIHtcbiAgYmFja2dyb3VuZDogI2Y4ZDdkYTtcbiAgY29sb3I6ICM3MjFjMjQ7XG4gIGJvcmRlci1sZWZ0OiA0cHggc29saWQgI2RjMzU0NTtcbn1cblxuLyogUmVzcG9uc2l2ZSBEZXNpZ24gKi9cbkBtZWRpYSAobWF4LXdpZHRoOiA3NjhweCkge1xuICAuaGVybyAudGl0bGUge1xuICAgIGZvbnQtc2l6ZTogMS43NXJlbTtcbiAgfVxuXG4gIC5oZXJvIC5zdWJ0aXRsZSB7XG4gICAgZm9udC1zaXplOiAxcmVtO1xuICB9XG5cbiAgLmNvbnZlcnRlci1jYXJkIHtcbiAgICBwYWRkaW5nOiAxLjVyZW07XG4gIH1cblxuICAuYnV0dG9uLWNvbnRyb2xzIHtcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICB9XG5cbiAgLmJ1dHRvbiB7XG4gICAgd2lkdGg6IDEwMCU7XG4gICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG4gIH1cblxuICAubmF2LWhlYWRlciB7XG4gICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICBnYXA6IDFyZW07XG4gIH1cblxuICAuZmVhdHVyZXMtZ3JpZCB7XG4gICAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiAxZnI7XG4gIH1cbn1cblxuLyogQ29kZSBIaWdobGlnaHRpbmcgaW4gT3V0cHV0ICovXG4udGV4dGFyZWEuY29kZS1vdXRwdXQge1xuICBiYWNrZ3JvdW5kOiAjMmQzNzQ4O1xuICBjb2xvcjogI2UyZThmMDtcbiAgYm9yZGVyLWNvbG9yOiAjNGE1NTY4O1xufVxuXG4udGV4dGFyZWEuY29kZS1vdXRwdXQ6Zm9jdXMge1xuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XG59XG5cbi8qIFV0aWxpdHkgQ2xhc3NlcyAqL1xuLm10LTEgeyBtYXJnaW4tdG9wOiAwLjVyZW07IH1cbi5tdC0yIHsgbWFyZ2luLXRvcDogMXJlbTsgfVxuLm10LTMgeyBtYXJnaW4tdG9wOiAxLjVyZW07IH1cbi5tdC00IHsgbWFyZ2luLXRvcDogMnJlbTsgfVxuXG4ubWItMSB7IG1hcmdpbi1ib3R0b206IDAuNXJlbTsgfVxuLm1iLTIgeyBtYXJnaW4tYm90dG9tOiAxcmVtOyB9XG4ubWItMyB7IG1hcmdpbi1ib3R0b206IDEuNXJlbTsgfVxuLm1iLTQgeyBtYXJnaW4tYm90dG9tOiAycmVtOyB9XG5cbi50ZXh0LWNlbnRlciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxuLnRleHQtbXV0ZWQgeyBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpOyB9XG5gLCBcIlwiLHtcInZlcnNpb25cIjozLFwic291cmNlc1wiOltcIndlYnBhY2s6Ly8uL3NyYy9zdHlsZS5jc3NcIl0sXCJuYW1lc1wiOltdLFwibWFwcGluZ3NcIjpcIkFBQUEsa0RBQWtEOztBQUVsRDtFQUNFLHFFQUFxRTtFQUNyRSx1RUFBdUU7RUFDdkUscUVBQXFFO0VBQ3JFLGtCQUFrQjtFQUNsQixrQkFBa0I7RUFDbEIsdUJBQXVCO0VBQ3ZCLHlCQUF5QjtFQUN6Qix1QkFBdUI7RUFDdkIsMENBQTBDO0VBQzFDLDBDQUEwQztFQUMxQywyQ0FBMkM7RUFDM0MsNENBQTRDO0VBQzVDLGdCQUFnQjtFQUNoQixpQkFBaUI7RUFDakIsaUJBQWlCO0FBQ25COztBQUVBO0VBQ0Usc0JBQXNCO0FBQ3hCOztBQUVBO0VBQ0UsOEpBQThKO0VBQzlKLG1DQUFtQztFQUNuQyxrQ0FBa0M7RUFDbEMsNkRBQTZEO0VBQzdELGlCQUFpQjtBQUNuQjs7QUFFQSwwQkFBMEI7QUFDMUI7RUFDRSxtQ0FBbUM7RUFDbkMsa0JBQWtCO0VBQ2xCLGdCQUFnQjtBQUNsQjs7QUFFQTtFQUNFLFdBQVc7RUFDWCxrQkFBa0I7RUFDbEIsTUFBTTtFQUNOLE9BQU87RUFDUCxRQUFRO0VBQ1IsU0FBUztFQUNULG1EQUE4WDtFQUM5WCxZQUFZO0FBQ2Q7O0FBRUE7RUFDRSxrQkFBa0I7RUFDbEIsVUFBVTtFQUNWLG9CQUFvQjtBQUN0Qjs7QUFFQTtFQUNFLGlCQUFpQjtFQUNqQixnQkFBZ0I7RUFDaEIsMENBQTBDO0VBQzFDLHNCQUFzQjtBQUN4Qjs7QUFFQTtFQUNFLGtCQUFrQjtFQUNsQixhQUFhO0VBQ2IsZ0JBQWdCO0FBQ2xCOztBQUVBLHNCQUFzQjtBQUN0QjtFQUNFLGtCQUFrQjtFQUNsQixhQUFhO0VBQ2IsOEJBQThCO0VBQzlCLG1CQUFtQjtFQUNuQixpQkFBaUI7RUFDakIsNEJBQTRCO0FBQzlCOztBQUVBO0VBQ0Usb0JBQW9CO0VBQ3BCLG1CQUFtQjtFQUNuQixXQUFXO0VBQ1gsdUJBQXVCO0VBQ3ZCLDBCQUEw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VTtJQUNWLHdCQUF3QjtFQUMxQjtBQUNGOztBQUVBO0VBQ0UsaUNBQWlDO0FBQ25DOztBQUVBLDJCQUEyQjtBQUMzQjtFQUNFLG9CQUFvQjtFQUNwQiwrQkFBK0I7RUFDL0IsbUJBQW1CO0VBQ25CLGFBQWE7RUFDYixtQkFBbUI7RUFDbkIsWUFBWTtFQUNaLGlDQUFpQztBQUNuQzs7QUFFQTtFQUNFLG1CQUFtQjtFQUNuQixjQUFjO0VBQ2QsOEJBQThCO0FBQ2hDOztBQUVBO0VBQ0UsbUJBQW1CO0VBQ25CLGNBQWM7RUFDZCw4QkFBOEI7QUFDaEM7O0FBRUEsc0JBQXNCO0FBQ3RCO0VBQ0U7SUFDRSxrQkFBa0I7RUFDcEI7O0VBRUE7SUFDRSxlQUFlO0VBQ2pCOztFQUVBO0lBQ0UsZUFBZTtFQUNqQjs7RUFFQTtJQUNFLHNCQUFzQjtFQUN4Qjs7RUFFQTtJQUNFLFdBQVc7SUFDWCx1QkFBdUI7RUFDekI7O0VBRUE7SUFDRSxzQkFBc0I7SUFDdEIsU0FBUztFQUNYOztFQUVBO0lBQ0UsMEJBQTBCO0VBQzVCO0FBQ0Y7O0FBRUEsZ0NBQWdDO0FBQ2hDO0VBQ0UsbUJBQW1CO0VBQ25CLGNBQWM7RUFDZCxxQkFBcUI7QUFDdkI7O0FBRUE7RUFDRSxxQkFBcUI7QUFDdkI7O0FBRUEsb0JBQW9CO0FBQ3BCLFFBQVEsa0JBQWtCLEVBQUU7QUFDNUIsUUFBUSxnQkFBZ0IsRUFBRTtBQUMxQixRQUFRLGtCQUFrQixFQUFFO0FBQzVCLFFBQVEsZ0JBQWdCLEVBQUU7O0FBRTFCLFFBQVEscUJBQXFCLEVBQUU7QUFDL0IsUUFBUSxtQkFBbUIsRUFBRTtBQUM3QixRQUFRLHFCQUFxQixFQUFFO0FBQy9CLFFBQVEsbUJBQW1CLEVBQUU7O0FBRTdCLGVBQWUsa0JBQWtCLEVBQUU7QUFDbkMsY0FBYyw0QkFBNEIsRUFBRVwiLFwic291cmNlc0NvbnRlbnRcIjpbXCIvKiBNb2Rlcm4gU1FMIHRvIExhcmF2ZWwgQnVpbGRlciAtIEN1c3RvbSBTdHlsZXMgKi9cXG5cXG46cm9vdCB7XFxuICAtLXByaW1hcnktZ3JhZGllbnQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICM2NjdlZWEgMCUsICM3NjRiYTIgMTAwJSk7XFxuICAtLXNlY29uZGFyeS1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgI2YwOTNmYiAwJSwgI2Y1NTc2YyAxMDAlKTtcXG4gIC0tc3VjY2Vzcy1ncmFkaWVudDogbGluZWFyLWdyYWRpZW50KDEzNWRlZywgIzRmYWNmZSAwJSwgIzAwZjJmZSAxMDAlKTtcXG4gIC0tZGFyay1iZzogIzFhMWEyZTtcXG4gIC0tY2FyZC1iZzogI2ZmZmZmZjtcXG4gIC0tdGV4dC1wcmltYXJ5OiAjMmQzNzQ4O1xcbiAgLS10ZXh0LXNlY29uZGFyeTogIzcxODA5NjtcXG4gIC0tYm9yZGVyLWNvbG9yOiAjZTJlOGYwO1xcbiAgLS1zaGFkb3ctc206IDAgMnB4IDRweCByZ2JhKDAsIDAsIDAsIDAuMDUpO1xcbiAgLS1zaGFkb3ctbWQ6IDAgNHB4IDZweCByZ2JhKDAsIDAsIDAsIDAuMDcpO1xcbiAgLS1zaGFkb3ctbGc6IDAgMTBweCAyNXB4IHJnYmEoMCwgMCwgMCwgMC4xKTtcXG4gIC0tc2hhZG93LXhsOiAwIDIwcHggNDBweCByZ2JhKDAsIDAsIDAsIDAuMTUpO1xcbiAgLS1yYWRpdXMtc206IDhweDtcXG4gIC0tcmFkaXVzLW1kOiAxMnB4O1xcbiAgLS1yYWRpdXMtbGc6IDE2cHg7XFxufVxcblxcbioge1xcbiAgYm94LXNpemluZzogYm9yZGVyLWJveDtcXG59XFxuXFxuYm9keSB7XFxuICBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCAnU2Vnb2UgVUknLCAnUm9ib3RvJywgJ094eWdlbicsICdVYnVudHUnLCAnQ2FudGFyZWxsJywgJ0ZpcmEgU2FucycsICdEcm9pZCBTYW5zJywgJ0hlbHZldGljYSBOZXVlJywgc2Fucy1zZXJpZjtcXG4gIC13ZWJraXQtZm9udC1zbW9vdGhpbmc6IGFudGlhbGlhc2VkO1xcbiAgLW1vei1vc3gtZm9udC1zbW9vdGhpbmc6IGdyYXlzY2FsZTtcXG4gIGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCgxMzVkZWcsICNmNWY3ZmEgMCUsICNjM2NmZTIgMTAwJSk7XFxuICBtaW4taGVpZ2h0OiAxMDB2aDtcXG59XFxuXFxuLyogSGVybyBTZWN0aW9uIFJlZGVzaWduICovXFxuLmhlcm8uaXMtcHJpbWFyeSB7XFxuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcXG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcXG4gIG92ZXJmbG93OiBoaWRkZW47XFxufVxcblxcbi5oZXJvLmlzLXByaW1hcnk6OmJlZm9yZSB7XFxuICBjb250ZW50OiAnJztcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogMDtcXG4gIGxlZnQ6IDA7XFxuICByaWdodDogMDtcXG4gIGJvdHRvbTogMDtcXG4gIGJhY2tncm91bmQ6IHVybChcXFwiZGF0YTppbWFnZS9zdmcreG1sLCUzQ3N2ZyB3aWR0aD0nNjAnIGhlaWdodD0nNjAnIHZpZXdCb3g9JzAgMCA2MCA2MCcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJyUzRSUzQ2cgZmlsbD0nbm9uZScgZmlsbC1ydWxlPSdldmVub2RkJyUzRSUzQ2cgZmlsbD0nJTIzZmZmZmZmJyBmaWxsLW9wYWNpdHk9JzAuMDUnJTNFJTNDcGF0aCBkPSdNMzYgMzR2LTRoLTJ2NGgtNHYyaDR2NGgydi00aDR2LTJoLTR6bTAtMzBWMGgtMnY0aC00djJoNHY0aDJWNmg0VjRoLTR6TTYgMzR2LTRINHY0SDB2Mmg0djRoMnYtNGg0di0ySDZ6TTYgNFYwSDR2NEgwdjJoNHY0aDJWNmg0VjRINnonLyUzRSUzQy9nJTNFJTNDL2clM0UlM0Mvc3ZnJTNFXFxcIik7XFxuICBvcGFjaXR5OiAwLjM7XFxufVxcblxcbi5oZXJvLWJvZHkge1xcbiAgcG9zaXRpb246IHJlbGF0aXZlO1xcbiAgei1pbmRleDogMTtcXG4gIHBhZGRpbmc6IDNyZW0gMS41cmVtO1xcbn1cXG5cXG4uaGVybyAudGl0bGUge1xcbiAgZm9udC1zaXplOiAyLjVyZW07XFxuICBmb250LXdlaWdodDogODAwO1xcbiAgdGV4dC1zaGFkb3c6IDAgMnB4IDEwcHggcmdiYSgwLCAwLCAwLCAwLjEpO1xcbiAgbGV0dGVyLXNwYWNpbmc6IC0wLjVweDtcXG59XFxuXFxuLmhlcm8gLnN1YnRpdGxlIHtcXG4gIGZvbnQtc2l6ZTogMS4yNXJlbTtcXG4gIG9wYWNpdHk6IDAuOTU7XFxuICBtYXJnaW4tdG9wOiAxcmVtO1xcbn1cXG5cXG4vKiBOYXZpZ2F0aW9uL0hlYWRlciAqL1xcbi5uYXYtaGVhZGVyIHtcXG4gIHBhZGRpbmc6IDFyZW0gMnJlbTtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctc20pO1xcbn1cXG5cXG4uZ2l0aHViLWxpbmsge1xcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjVyZW07XFxuICBwYWRkaW5nOiAwLjc1cmVtIDEuNXJlbTtcXG4gIGJhY2tncm91bmQ6IHZhcigtLWRhcmstYmcpO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgdGV4dC1kZWNvcmF0aW9uOiBub25lO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIGZvbnQtd2VpZ2h0OiA2MDA7XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xcbiAgYm94LXNoYWRvdzogdmFyKC0tc2hhZG93LW1kKTtcXG59XFxuXFxuLmdpdGh1Yi1saW5rOmhvdmVyIHtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxuICBjb2xvcjogd2hpdGU7XFxufVxcblxcbi5naXRodWItbGluazo6YmVmb3JlIHtcXG4gIGNvbnRlbnQ6ICfimIUnO1xcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xcbn1cXG5cXG4vKiBNYWluIENvbnRlbnQgQXJlYSAqL1xcbi5jb250ZW50LXdyYXBwZXIge1xcbiAgbWF4LXdpZHRoOiAxMjAwcHg7XFxuICBtYXJnaW46IDAgYXV0bztcXG4gIHBhZGRpbmc6IDJyZW0gMXJlbTtcXG59XFxuXFxuLmNvbnZlcnRlci1jYXJkIHtcXG4gIGJhY2tncm91bmQ6IHZhcigtLWNhcmQtYmcpO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLWxnKTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy14bCk7XFxuICBwYWRkaW5nOiAyLjVyZW07XFxuICBtYXJnaW4tYm90dG9tOiAycmVtO1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuM3MgZWFzZTtcXG59XFxuXFxuLmNvbnZlcnRlci1jYXJkOmhvdmVyIHtcXG4gIGJveC1zaGFkb3c6IDAgMjVweCA1MHB4IHJnYmEoMCwgMCwgMCwgMC4yKTtcXG59XFxuXFxuLyogU2VjdGlvbiBIZWFkZXJzICovXFxuLnNlY3Rpb24taGVhZGVyIHtcXG4gIGRpc3BsYXk6IGZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjc1cmVtO1xcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcXG4gIGZvbnQtc2l6ZTogMS4yNXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA3MDA7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1wcmltYXJ5KTtcXG59XFxuXFxuLnNlY3Rpb24taWNvbiB7XFxuICB3aWR0aDogNDBweDtcXG4gIGhlaWdodDogNDBweDtcXG4gIGJvcmRlci1yYWRpdXM6IHZhcigtLXJhZGl1cy1zbSk7XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcbiAgZm9udC1zaXplOiAxLjI1cmVtO1xcbiAgYmFja2dyb3VuZDogdmFyKC0tcHJpbWFyeS1ncmFkaWVudCk7XFxuICBjb2xvcjogd2hpdGU7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xcbn1cXG5cXG4vKiBUZXh0YXJlYSBSZWRlc2lnbiAqL1xcbi50ZXh0YXJlYS13cmFwcGVyIHtcXG4gIHBvc2l0aW9uOiByZWxhdGl2ZTtcXG4gIG1hcmdpbi1ib3R0b206IDEuNXJlbTtcXG59XFxuXFxuLnRleHRhcmVhIHtcXG4gIGJvcmRlcjogMnB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtbWQpO1xcbiAgcGFkZGluZzogMS4yNXJlbTtcXG4gIGZvbnQtc2l6ZTogMXJlbTtcXG4gIGZvbnQtZmFtaWx5OiAnTW9uYWNvJywgJ01lbmxvJywgJ1VidW50dSBNb25vJywgJ0NvbnNvbGFzJywgJ3NvdXJjZS1jb2RlLXBybycsIG1vbm9zcGFjZTtcXG4gIGxpbmUtaGVpZ2h0OiAxLjY7XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xcbiAgcmVzaXplOiB2ZXJ0aWNhbDtcXG4gIG1pbi1oZWlnaHQ6IDIwMHB4O1xcbiAgYmFja2dyb3VuZDogI2Y4ZmFmYztcXG59XFxuXFxuLnRleHRhcmVhOmZvY3VzIHtcXG4gIG91dGxpbmU6IG5vbmU7XFxuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XFxuICBib3gtc2hhZG93OiAwIDAgMCAzcHggcmdiYSgxMDIsIDEyNiwgMjM0LCAwLjEpO1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxufVxcblxcbi50ZXh0YXJlYTo6cGxhY2Vob2xkZXIge1xcbiAgY29sb3I6ICNhMGFlYzA7XFxuICBmb250LXN0eWxlOiBpdGFsaWM7XFxufVxcblxcbi8qIENvcHkgQnV0dG9uICovXFxuLmNvcHktYnV0dG9uIHtcXG4gIHBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gIHRvcDogMC43NXJlbTtcXG4gIHJpZ2h0OiAwLjc1cmVtO1xcbiAgcGFkZGluZzogMC41cmVtIDFyZW07XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJvcmRlci1jb2xvcik7XFxuICBib3JkZXItcmFkaXVzOiB2YXIoLS1yYWRpdXMtc20pO1xcbiAgY3Vyc29yOiBwb2ludGVyO1xcbiAgZm9udC1zaXplOiAwLjg3NXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA2MDA7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1zZWNvbmRhcnkpO1xcbiAgdHJhbnNpdGlvbjogYWxsIDAuMnMgZWFzZTtcXG4gIHotaW5kZXg6IDEwO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBnYXA6IDAuNXJlbTtcXG59XFxuXFxuLmNvcHktYnV0dG9uOmhvdmVyIHtcXG4gIGJhY2tncm91bmQ6ICM2NjdlZWE7XFxuICBjb2xvcjogd2hpdGU7XFxuICBib3JkZXItY29sb3I6ICM2NjdlZWE7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTFweCk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbWQpO1xcbn1cXG5cXG4uY29weS1idXR0b24uY29waWVkIHtcXG4gIGJhY2tncm91bmQ6ICM0OGJiNzg7XFxuICBjb2xvcjogd2hpdGU7XFxuICBib3JkZXItY29sb3I6ICM0OGJiNzg7XFxufVxcblxcbi8qIEJ1dHRvbiBDb250cm9scyAqL1xcbi5idXR0b24tY29udHJvbHMge1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGdhcDogMXJlbTtcXG4gIGZsZXgtd3JhcDogd3JhcDtcXG59XFxuXFxuLmJ1dHRvbiB7XFxuICBwYWRkaW5nOiAwLjg3NXJlbSAycmVtO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIGZvbnQtd2VpZ2h0OiA3MDA7XFxuICBmb250LXNpemU6IDFyZW07XFxuICBib3JkZXI6IG5vbmU7XFxuICBjdXJzb3I6IHBvaW50ZXI7XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBjdWJpYy1iZXppZXIoMC40LCAwLCAwLjIsIDEpO1xcbiAgZGlzcGxheTogaW5saW5lLWZsZXg7XFxuICBhbGlnbi1pdGVtczogY2VudGVyO1xcbiAgZ2FwOiAwLjVyZW07XFxuICBwb3NpdGlvbjogcmVsYXRpdmU7XFxuICBvdmVyZmxvdzogaGlkZGVuO1xcbn1cXG5cXG4uYnV0dG9uOjpiZWZvcmUge1xcbiAgY29udGVudDogJyc7XFxuICBwb3NpdGlvbjogYWJzb2x1dGU7XFxuICB0b3A6IDUwJTtcXG4gIGxlZnQ6IDUwJTtcXG4gIHdpZHRoOiAwO1xcbiAgaGVpZ2h0OiAwO1xcbiAgYm9yZGVyLXJhZGl1czogNTAlO1xcbiAgYmFja2dyb3VuZDogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjMpO1xcbiAgdHJhbnNmb3JtOiB0cmFuc2xhdGUoLTUwJSwgLTUwJSk7XFxuICB0cmFuc2l0aW9uOiB3aWR0aCAwLjZzLCBoZWlnaHQgMC42cztcXG59XFxuXFxuLmJ1dHRvbjpob3Zlcjo6YmVmb3JlIHtcXG4gIHdpZHRoOiAzMDBweDtcXG4gIGhlaWdodDogMzAwcHg7XFxufVxcblxcbi5idXR0b24uaXMtcHJpbWFyeSB7XFxuICBiYWNrZ3JvdW5kOiB2YXIoLS1wcmltYXJ5LWdyYWRpZW50KTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XFxufVxcblxcbi5idXR0b24uaXMtcHJpbWFyeTpob3ZlciB7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTJweCk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xcbn1cXG5cXG4uYnV0dG9uLmlzLXNlY29uZGFyeSB7XFxuICBiYWNrZ3JvdW5kOiB3aGl0ZTtcXG4gIGNvbG9yOiAjNjY3ZWVhO1xcbiAgYm9yZGVyOiAycHggc29saWQgIzY2N2VlYTtcXG59XFxuXFxuLmJ1dHRvbi5pcy1zZWNvbmRhcnk6aG92ZXIge1xcbiAgYmFja2dyb3VuZDogIzY2N2VlYTtcXG4gIGNvbG9yOiB3aGl0ZTtcXG4gIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtMnB4KTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1sZyk7XFxufVxcblxcbi8qIExvYWRpbmcgQW5pbWF0aW9uICovXFxuLmJ1dHRvbi5pcy1sb2FkaW5nIHtcXG4gIHBvaW50ZXItZXZlbnRzOiBub25lO1xcbiAgb3BhY2l0eTogMC43O1xcbn1cXG5cXG4uYnV0dG9uLmlzLWxvYWRpbmc6OmFmdGVyIHtcXG4gIGNvbnRlbnQ6ICcnO1xcbiAgcG9zaXRpb246IGFic29sdXRlO1xcbiAgd2lkdGg6IDE2cHg7XFxuICBoZWlnaHQ6IDE2cHg7XFxuICB0b3A6IDUwJTtcXG4gIGxlZnQ6IDUwJTtcXG4gIG1hcmdpbi1sZWZ0OiAtOHB4O1xcbiAgbWFyZ2luLXRvcDogLThweDtcXG4gIGJvcmRlcjogMnB4IHNvbGlkIHRyYW5zcGFyZW50O1xcbiAgYm9yZGVyLXRvcC1jb2xvcjogd2hpdGU7XFxuICBib3JkZXItcmFkaXVzOiA1MCU7XFxuICBhbmltYXRpb246IGJ1dHRvbi1sb2FkaW5nLXNwaW5uZXIgMC42cyBsaW5lYXIgaW5maW5pdGU7XFxufVxcblxcbkBrZXlmcmFtZXMgYnV0dG9uLWxvYWRpbmctc3Bpbm5lciB7XFxuICBmcm9tIHtcXG4gICAgdHJhbnNmb3JtOiByb3RhdGUoMHR1cm4pO1xcbiAgfVxcbiAgdG8ge1xcbiAgICB0cmFuc2Zvcm06IHJvdGF0ZSgxdHVybik7XFxuICB9XFxufVxcblxcbi8qIEZlYXR1cmVzIFNlY3Rpb24gKi9cXG4uZmVhdHVyZXMtZ3JpZCB7XFxuICBkaXNwbGF5OiBncmlkO1xcbiAgZ3JpZC10ZW1wbGF0ZS1jb2x1bW5zOiByZXBlYXQoYXV0by1maXQsIG1pbm1heCgyNTBweCwgMWZyKSk7XFxuICBnYXA6IDEuNXJlbTtcXG4gIG1hcmdpbi10b3A6IDJyZW07XFxuICBtYXJnaW4tYm90dG9tOiAycmVtO1xcbn1cXG5cXG4uZmVhdHVyZS1jYXJkIHtcXG4gIGJhY2tncm91bmQ6IHdoaXRlO1xcbiAgcGFkZGluZzogMS41cmVtO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIGJveC1zaGFkb3c6IHZhcigtLXNoYWRvdy1tZCk7XFxuICB0cmFuc2l0aW9uOiBhbGwgMC4zcyBlYXNlO1xcbiAgYm9yZGVyOiAxcHggc29saWQgdmFyKC0tYm9yZGVyLWNvbG9yKTtcXG59XFxuXFxuLmZlYXR1cmUtY2FyZDpob3ZlciB7XFxuICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoLTRweCk7XFxuICBib3gtc2hhZG93OiB2YXIoLS1zaGFkb3ctbGcpO1xcbn1cXG5cXG4uZmVhdHVyZS1pY29uIHtcXG4gIHdpZHRoOiA1MHB4O1xcbiAgaGVpZ2h0OiA1MHB4O1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLXNtKTtcXG4gIGJhY2tncm91bmQ6IHZhcigtLXByaW1hcnktZ3JhZGllbnQpO1xcbiAgY29sb3I6IHdoaXRlO1xcbiAgZGlzcGxheTogZmxleDtcXG4gIGFsaWduLWl0ZW1zOiBjZW50ZXI7XFxuICBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjtcXG4gIGZvbnQtc2l6ZTogMS41cmVtO1xcbiAgbWFyZ2luLWJvdHRvbTogMXJlbTtcXG59XFxuXFxuLmZlYXR1cmUtdGl0bGUge1xcbiAgZm9udC1zaXplOiAxLjEyNXJlbTtcXG4gIGZvbnQtd2VpZ2h0OiA3MDA7XFxuICBjb2xvcjogdmFyKC0tdGV4dC1wcmltYXJ5KTtcXG4gIG1hcmdpbi1ib3R0b206IDAuNXJlbTtcXG59XFxuXFxuLmZlYXR1cmUtZGVzY3JpcHRpb24ge1xcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcXG4gIGZvbnQtc2l6ZTogMC45cmVtO1xcbiAgbGluZS1oZWlnaHQ6IDEuNjtcXG59XFxuXFxuLyogRm9vdGVyICovXFxuLm1vZGVybi1mb290ZXIge1xcbiAgYmFja2dyb3VuZDogd2hpdGU7XFxuICBwYWRkaW5nOiAycmVtO1xcbiAgdGV4dC1hbGlnbjogY2VudGVyO1xcbiAgbWFyZ2luLXRvcDogNHJlbTtcXG4gIGJveC1zaGFkb3c6IDAgLTJweCAxMHB4IHJnYmEoMCwgMCwgMCwgMC4wNSk7XFxufVxcblxcbi5tb2Rlcm4tZm9vdGVyIHAge1xcbiAgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTtcXG4gIG1hcmdpbjogMDtcXG59XFxuXFxuLm1vZGVybi1mb290ZXIgYSB7XFxuICBjb2xvcjogIzY2N2VlYTtcXG4gIHRleHQtZGVjb3JhdGlvbjogbm9uZTtcXG4gIGZvbnQtd2VpZ2h0OiA2MDA7XFxufVxcblxcbi5tb2Rlcm4tZm9vdGVyIGE6aG92ZXIge1xcbiAgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XFxufVxcblxcbi8qIEFuaW1hdGlvbnMgKi9cXG5Aa2V5ZnJhbWVzIGZhZGVJblVwIHtcXG4gIGZyb20ge1xcbiAgICBvcGFjaXR5OiAwO1xcbiAgICB0cmFuc2Zvcm06IHRyYW5zbGF0ZVkoMjBweCk7XFxuICB9XFxuICB0byB7XFxuICAgIG9wYWNpdHk6IDE7XFxuICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgwKTtcXG4gIH1cXG59XFxuXFxuLmZhZGUtaW4tdXAge1xcbiAgYW5pbWF0aW9uOiBmYWRlSW5VcCAwLjZzIGVhc2Utb3V0O1xcbn1cXG5cXG4vKiBTdWNjZXNzL0Vycm9yIE1lc3NhZ2VzICovXFxuLm1lc3NhZ2UtYm94IHtcXG4gIHBhZGRpbmc6IDFyZW0gMS41cmVtO1xcbiAgYm9yZGVyLXJhZGl1czogdmFyKC0tcmFkaXVzLW1kKTtcXG4gIG1hcmdpbi1ib3R0b206IDFyZW07XFxuICBkaXNwbGF5OiBmbGV4O1xcbiAgYWxpZ24taXRlbXM6IGNlbnRlcjtcXG4gIGdhcDogMC43NXJlbTtcXG4gIGFuaW1hdGlvbjogZmFkZUluVXAgMC4zcyBlYXNlLW91dDtcXG59XFxuXFxuLm1lc3NhZ2UtYm94LnN1Y2Nlc3Mge1xcbiAgYmFja2dyb3VuZDogI2Q0ZWRkYTtcXG4gIGNvbG9yOiAjMTU1NzI0O1xcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjMjhhNzQ1O1xcbn1cXG5cXG4ubWVzc2FnZS1ib3guZXJyb3Ige1xcbiAgYmFja2dyb3VuZDogI2Y4ZDdkYTtcXG4gIGNvbG9yOiAjNzIxYzI0O1xcbiAgYm9yZGVyLWxlZnQ6IDRweCBzb2xpZCAjZGMzNTQ1O1xcbn1cXG5cXG4vKiBSZXNwb25zaXZlIERlc2lnbiAqL1xcbkBtZWRpYSAobWF4LXdpZHRoOiA3NjhweCkge1xcbiAgLmhlcm8gLnRpdGxlIHtcXG4gICAgZm9udC1zaXplOiAxLjc1cmVtO1xcbiAgfVxcblxcbiAgLmhlcm8gLnN1YnRpdGxlIHtcXG4gICAgZm9udC1zaXplOiAxcmVtO1xcbiAgfVxcblxcbiAgLmNvbnZlcnRlci1jYXJkIHtcXG4gICAgcGFkZGluZzogMS41cmVtO1xcbiAgfVxcblxcbiAgLmJ1dHRvbi1jb250cm9scyB7XFxuICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XFxuICB9XFxuXFxuICAuYnV0dG9uIHtcXG4gICAgd2lkdGg6IDEwMCU7XFxuICAgIGp1c3RpZnktY29udGVudDogY2VudGVyO1xcbiAgfVxcblxcbiAgLm5hdi1oZWFkZXIge1xcbiAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xcbiAgICBnYXA6IDFyZW07XFxuICB9XFxuXFxuICAuZmVhdHVyZXMtZ3JpZCB7XFxuICAgIGdyaWQtdGVtcGxhdGUtY29sdW1uczogMWZyO1xcbiAgfVxcbn1cXG5cXG4vKiBDb2RlIEhpZ2hsaWdodGluZyBpbiBPdXRwdXQgKi9cXG4udGV4dGFyZWEuY29kZS1vdXRwdXQge1xcbiAgYmFja2dyb3VuZDogIzJkMzc0ODtcXG4gIGNvbG9yOiAjZTJlOGYwO1xcbiAgYm9yZGVyLWNvbG9yOiAjNGE1NTY4O1xcbn1cXG5cXG4udGV4dGFyZWEuY29kZS1vdXRwdXQ6Zm9jdXMge1xcbiAgYm9yZGVyLWNvbG9yOiAjNjY3ZWVhO1xcbn1cXG5cXG4vKiBVdGlsaXR5IENsYXNzZXMgKi9cXG4ubXQtMSB7IG1hcmdpbi10b3A6IDAuNXJlbTsgfVxcbi5tdC0yIHsgbWFyZ2luLXRvcDogMXJlbTsgfVxcbi5tdC0zIHsgbWFyZ2luLXRvcDogMS41cmVtOyB9XFxuLm10LTQgeyBtYXJnaW4tdG9wOiAycmVtOyB9XFxuXFxuLm1iLTEgeyBtYXJnaW4tYm90dG9tOiAwLjVyZW07IH1cXG4ubWItMiB7IG1hcmdpbi1ib3R0b206IDFyZW07IH1cXG4ubWItMyB7IG1hcmdpbi1ib3R0b206IDEuNXJlbTsgfVxcbi5tYi00IHsgbWFyZ2luLWJvdHRvbTogMnJlbTsgfVxcblxcbi50ZXh0LWNlbnRlciB7IHRleHQtYWxpZ246IGNlbnRlcjsgfVxcbi50ZXh0LW11dGVkIHsgY29sb3I6IHZhcigtLXRleHQtc2Vjb25kYXJ5KTsgfVxcblwiXSxcInNvdXJjZVJvb3RcIjpcIlwifV0pO1xuLy8gRXhwb3J0c1xuZXhwb3J0IGRlZmF1bHQgX19fQ1NTX0xPQURFUl9FWFBPUlRfX187XG4iLCJcbiAgICAgIGltcG9ydCBBUEkgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9pbmplY3RTdHlsZXNJbnRvU3R5bGVUYWcuanNcIjtcbiAgICAgIGltcG9ydCBkb21BUEkgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9zdHlsZURvbUFQSS5qc1wiO1xuICAgICAgaW1wb3J0IGluc2VydEZuIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvaW5zZXJ0QnlTZWxlY3Rvci5qc1wiO1xuICAgICAgaW1wb3J0IHNldEF0dHJpYnV0ZXMgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9zZXRBdHRyaWJ1dGVzV2l0aG91dEF0dHJpYnV0ZXMuanNcIjtcbiAgICAgIGltcG9ydCBpbnNlcnRTdHlsZUVsZW1lbnQgZnJvbSBcIiEuLi9ub2RlX21vZHVsZXMvc3R5bGUtbG9hZGVyL2Rpc3QvcnVudGltZS9pbnNlcnRTdHlsZUVsZW1lbnQuanNcIjtcbiAgICAgIGltcG9ydCBzdHlsZVRhZ1RyYW5zZm9ybUZuIGZyb20gXCIhLi4vbm9kZV9tb2R1bGVzL3N0eWxlLWxvYWRlci9kaXN0L3J1bnRpbWUvc3R5bGVUYWdUcmFuc2Zvcm0uanNcIjtcbiAgICAgIGltcG9ydCBjb250ZW50LCAqIGFzIG5hbWVkRXhwb3J0IGZyb20gXCIhIS4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvY2pzLmpzIS4vc3R5bGUuY3NzXCI7XG4gICAgICBcbiAgICAgIFxuXG52YXIgb3B0aW9ucyA9IHt9O1xuXG5vcHRpb25zLnN0eWxlVGFnVHJhbnNmb3JtID0gc3R5bGVUYWdUcmFuc2Zvcm1Gbjtcbm9wdGlvbnMuc2V0QXR0cmlidXRlcyA9IHNldEF0dHJpYnV0ZXM7XG5vcHRpb25zLmluc2VydCA9IGluc2VydEZuLmJpbmQobnVsbCwgXCJoZWFkXCIpO1xub3B0aW9ucy5kb21BUEkgPSBkb21BUEk7XG5vcHRpb25zLmluc2VydFN0eWxlRWxlbWVudCA9IGluc2VydFN0eWxlRWxlbWVudDtcblxudmFyIHVwZGF0ZSA9IEFQSShjb250ZW50LCBvcHRpb25zKTtcblxuXG5cbmV4cG9ydCAqIGZyb20gXCIhIS4uL25vZGVfbW9kdWxlcy9jc3MtbG9hZGVyL2Rpc3QvY2pzLmpzIS4vc3R5bGUuY3NzXCI7XG4gICAgICAgZXhwb3J0IGRlZmF1bHQgY29udGVudCAmJiBjb250ZW50LmxvY2FscyA/IGNvbnRlbnQubG9jYWxzIDogdW5kZWZpbmVkO1xuIl0sIm5hbWVzIjpbIkNvbnZlcnRlciIsImNvbnN0cnVjdG9yIiwiYXN0IiwicGFyZW50IiwidGFibGVfbmFtZV9ieV9hbGlhcyIsInJ1biIsIm5lZWRfYXBwZW5kX2dldF9zdWZmaXgiLCJzZWN0aW9ucyIsImZyb21faXRlbSIsImJvZHkiLCJTZWxlY3QiLCJmcm9tIiwicHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwiLCJyZWxhdGlvbiIsInB1c2giLCJyZXNvbHZlTWFpblRhYmxlU2VjdGlvbiIsInJlc29sdmVGcm9tU3ViU2VjdGlvbiIsImpvaW5fc2VjdGlvbiIsImhhc0pvaW5TZWN0aW9uIiwicmVzb2x2ZUpvaW5TZWN0aW9uIiwic2xpY2UiLCJsZW5ndGgiLCJjb25jYXQiLCJyZXNvbHZlQ3Jvc3NKb2luU2VjdGlvbiIsInJlc29sdmVTZWxlY3RTZWN0aW9uIiwicmVzb2x2ZVdoZXJlU2VjdGlvbiIsInNlbGVjdGlvbiIsImdyb3VwX2J5IiwicmVzb2x2ZUdyb3VwQnlTZWN0aW9uIiwicmVzb2x2ZUhhdmluZ1NlY3Rpb24iLCJvcmRlcl9ieSIsInJlc29sdmVPcmRlckJ5U2VjdGlvbiIsImxpbWl0IiwiVmFsdWUiLCJOdW1iZXIiLCJvZmZzZXQiLCJ2YWx1ZSIsImpvaW4iLCJyZXNvbHZlVGFibGVOYW1lRnJvbVJlbGF0aW9uTm9kZSIsInJlbGF0aW9uX25vZGUiLCJ0YWJsZV9uYW1lIiwiVGFibGUiLCJuYW1lIiwiYWxpYXMiLCJxdW90ZSIsInByZWZpeCIsImFkZFRhYlRvRXZlcnlMaW5lIiwiRGVyaXZlZCIsInN1YnF1ZXJ5IiwicmVwbGFjZSIsInNlbGVjdGlvbl9ub2RlIiwiY29uZGl0aW9uX3R5cGUiLCJnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0IiwiY29uZGl0aW9uIiwiZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0IiwicHJlcGFyZUNvbmRpdGlvbnMiLCJvcCIsIm1ldGhvZF9uYW1lIiwiY29uZGl0aW9ucyIsImFkZFByZWZpeDJNZXRob2RzIiwiY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uIiwiY29sdW1uIiwiZXhwciIsImxpc3QiLCJtYXAiLCJpIiwicmVzb2x2ZVZhbHVlIiwibmVnYXRlZCIsImxlZnRfY29uZGl0aW9uX3R5cGUiLCJsZWZ0IiwibGVmdF9jb25kaXRpb24iLCJyaWdodF9jb25kaXRpb25fdHlwZSIsInJpZ2h0IiwicmlnaHRfY29uZGl0aW9uIiwiaW5jbHVkZXMiLCJTdWJxdWVyeSIsInBhcnNlRnVuY3Rpb25Ob2RlIiwiRnVuY3Rpb24iLCJ0cmFuc2Zvcm1CaW5hcnlPcCIsImxvdyIsImhpZ2giLCJvcGVyYXRvcl9ieV9vcCIsInRvTG93ZXJDYXNlIiwiY2FwaXRhbGl6ZUZpcnN0TGV0dGVyIiwicmVzIiwic2VsZWN0X2l0ZW0iLCJwcm9qZWN0aW9uIiwiRXhwcldpdGhBbGlhcyIsInJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbSIsIlVubmFtZWRFeHByIiwiZ2V0QWN0dWFsVGFibGVOYW1lIiwiUXVhbGlmaWVkV2lsZGNhcmQiLCJPYmplY3QiLCJrZXlzIiwiYXNzZXJ0IiwiaXNVbmRlZmluZWRPck51bGwiLCJpdGVtIiwiZnVuY3Rpb25fbm9kZSIsIm5lZWRfcXVvdGUiLCJmdW5jdGlvbl9uYW1lIiwiYXJncyIsImFyZ19jb3VudCIsImFyZyIsIlVubmFtZWQiLCJFeHByIiwiSWRlbnRpZmllciIsIkNvbXBvdW5kSWRlbnRpZmllciIsImFyZ19jb2x1bW4iLCJOZXN0ZWQiLCJkaXN0aW5jdCIsInBhcnNlQmluYXJ5T3BOb2RlIiwiQmluYXJ5T3AiLCJqb2lucyIsInBhcnNlQmluYXJ5T3BQYXJ0aWFsIiwibGVmdF9vcl9yaWdodCIsImJpbmFyeV9vcCIsInNlcGFyYXRvciIsInByZXBhcmVKb2lucyIsImpvaW5fb3BlcmF0b3JfdHlwZSIsImpvaW5fb3BlcmF0b3IiLCJqb2luX21ldGhvZCIsIk9uIiwic3ViX3F1ZXJ5X3NxbCIsInN1Yl9xdWVyeV9hbGlhcyIsImpvaW5lZF90YWJsZSIsImZyb21faXRlbXMiLCJjcm9zc19qb2luX3NlY3Rpb25zIiwiY3Jvc3Nfam9pbl9zdHIiLCJncm91cF9ieV9jb2x1bW5zIiwiZ3JvdXBfYnlfaXRlbSIsImhhdmluZyIsIm9yZGVyX2J5cyIsIm9yZGVyX2J5X2l0ZW0iLCJhc2MiLCJ2YWx1ZU5vZGUiLCJpc1N0cmluZyIsInZhbHVlX3R5cGUiLCJ0YWJsZV9uYW1lX29yX2FsaWFzIiwiaWRlbnRpZmllciIsInZhbHVlcyIsImZsYXQiLCJtc2ciLCJvYmoiLCJwcm9wZXJ0eV9uYW1lcyIsInJlZHVjZSIsImNhcnJ5IiwicHJvcGVydHlfbmFtZSIsImhhc093blByb3BlcnR5IiwiU3RyaW5nIiwic3RyaW5nIiwiY2hhckF0IiwidG9VcHBlckNhc2UiLCJ1bnF1b3RlIiwiSlNPTiIsInN0cmluZ2lmeSIsInN0ciIsInRhYl9jb3VudCIsInNwbGl0Iiwid2FzbSIsInNob3dOb3RpZmljYXRpb24iLCJtZXNzYWdlIiwidHlwZSIsImV4aXN0aW5nTm90aWYiLCJkb2N1bWVudCIsInF1ZXJ5U2VsZWN0b3IiLCJyZW1vdmUiLCJub3RpZmljYXRpb24iLCJjcmVhdGVFbGVtZW50IiwiY2xhc3NOYW1lIiwiaW5uZXJIVE1MIiwid3JhcHBlciIsImluc2VydEJlZm9yZSIsImZpcnN0Q2hpbGQiLCJzZXRUaW1lb3V0Iiwic3R5bGUiLCJhbmltYXRpb24iLCJjb252ZXJ0ZXIiLCJpbnB1dCIsImdldEVsZW1lbnRCeUlkIiwiY29udmVydEJ1dHRvbiIsInRyaW0iLCJvdXRwdXRfdGV4dF9hcmVhIiwic3RhcnRzV2l0aCIsImNsYXNzTGlzdCIsImFkZCIsImRpc2FibGVkIiwicGFyc2Vfc3FsIiwiY29uc29sZSIsImxvZyIsInBhcnNlIiwiUXVlcnkiLCJlIiwiY29weVRvQ2xpcGJvYXJkIiwib3V0cHV0IiwiY29weUJ1dHRvbiIsImNvcHlUZXh0IiwiY29weUljb24iLCJuYXZpZ2F0b3IiLCJjbGlwYm9hcmQiLCJ3cml0ZVRleHQiLCJ0aGVuIiwidGV4dENvbnRlbnQiLCJ3aW5kb3ciLCJhZGRFdmVudExpc3RlbmVyIiwiZXZlbnQiLCJ1cmxfc2VhcmNoX3BhcmFtcyIsIlVSTFNlYXJjaFBhcmFtcyIsImxvY2F0aW9uIiwic2VhcmNoIiwiaGFzIiwiYXRvYiIsImdldCIsImN0cmxLZXkiLCJtZXRhS2V5Iiwia2V5Iiwic2hhcmVfbGluayIsIm9yaWdpbiIsInBhdGhuYW1lIiwiYnRvYSJdLCJzb3VyY2VSb290IjoiIn0=