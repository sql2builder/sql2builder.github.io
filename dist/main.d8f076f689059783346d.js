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
Object(function webpackMissingModule() { var e = new Error("Cannot find module './style.css'"); e.code = 'MODULE_NOT_FOUND'; throw e; }());
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

/***/ })

},
/******/ __webpack_require__ => { // webpackRuntimeModules
/******/ var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
/******/ __webpack_require__.O(0, ["npm.sqlparser-rs-wasm"], () => (__webpack_exec__(579)));
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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O0FBQ0osQ0FBQyxDQUFDO0FBRUZiLFFBQVEsQ0FBQ2UsY0FBYyxDQUFDLGNBQWMsQ0FBQyxDQUFDeUIsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLFlBQVk7RUFDMUUsTUFBTTFCLEtBQUssR0FBR2QsUUFBUSxDQUFDZSxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM5SSxLQUFLO0VBRXBELElBQUksQ0FBQzZJLEtBQUssSUFBSUEsS0FBSyxDQUFDRyxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtJQUMvQnJCLGdCQUFnQixDQUFDLGdDQUFnQyxFQUFFLE9BQU8sQ0FBQztJQUMzRDtFQUNKO0VBRUEsSUFBSXdELFVBQVUsR0FBR2IsTUFBTSxDQUFDSyxRQUFRLENBQUNTLE1BQU0sR0FBR2QsTUFBTSxDQUFDSyxRQUFRLENBQUNVLFFBQVEsR0FBRyxhQUFhLEdBQUdDLElBQUksQ0FBQ3pDLEtBQUssQ0FBQztFQUNoR29CLFNBQVMsQ0FBQ0MsU0FBUyxDQUFDQyxTQUFTLENBQUNnQixVQUFVLENBQUMsQ0FBQ2YsSUFBSSxDQUFDLFlBQVc7SUFDdER6QyxnQkFBZ0IsQ0FBQyxpQ0FBaUMsRUFBRSxTQUFTLENBQUM7RUFDbEUsQ0FBQyxFQUFFLFlBQVc7SUFDVkEsZ0JBQWdCLENBQUMsMkJBQTJCLEVBQUUsT0FBTyxDQUFDO0VBQzFELENBQUMsQ0FBQztBQUNOLENBQUMsQ0FBQzs7QUFFRjtBQUNBSSxRQUFRLENBQUNlLGNBQWMsQ0FBQyxhQUFhLENBQUMsQ0FBQ3lCLGdCQUFnQixDQUFDLE9BQU8sRUFBRVgsZUFBZSxDQUFDIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vc3FsMmJ1aWxkZXIuZ2l0aHViLmlvLy4vc3JjL2NvbnZlcnRlci5qcyIsIndlYnBhY2s6Ly9zcWwyYnVpbGRlci5naXRodWIuaW8vLi9zcmMvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNsYXNzIENvbnZlcnRlclxue1xuICAgIGNvbnN0cnVjdG9yKGFzdCwgcGFyZW50ID0gbnVsbCkge1xuICAgICAgICB0aGlzLmFzdCA9IGFzdDtcbiAgICAgICAgdGhpcy50YWJsZV9uYW1lX2J5X2FsaWFzID0ge307XG4gICAgICAgIHRoaXMucGFyZW50ID0gcGFyZW50O1xuICAgIH1cblxuICAgIHJ1bihuZWVkX2FwcGVuZF9nZXRfc3VmZml4ID0gdHJ1ZSkge1xuICAgICAgICBsZXQgc2VjdGlvbnMgPSBbXVxuXG4gICAgICAgIGxldCBmcm9tX2l0ZW0gPSB0aGlzLmFzdC5ib2R5LlNlbGVjdC5mcm9tWzBdO1xuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0ucmVsYXRpb24sICdUYWJsZScpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZU1haW5UYWJsZVNlY3Rpb24oZnJvbV9pdGVtKSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZnJvbV9pdGVtLnJlbGF0aW9uLCAnRGVyaXZlZCcpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZUZyb21TdWJTZWN0aW9uKCdEQjo6cXVlcnkoKS0+ZnJvbVN1YicpLCBmcm9tX2l0ZW0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgcmVsYXRpb24gdHlwZSc7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgam9pbl9zZWN0aW9uID0gJyc7XG5cbiAgICAgICAgLy8gUmVzb2x2ZSAnam9pbicgc2VjdGlvbiBiZWZvcmUgJ3doZXJlJyBzZWN0aW9uLCBiZWNhdXNlIG5lZWQgZmluZCBqb2luZWQgdGFibGUgYWxpYXNcbiAgICAgICAgaWYgKHRoaXMuaGFzSm9pblNlY3Rpb24oZnJvbV9pdGVtKSkge1xuICAgICAgICAgICAgam9pbl9zZWN0aW9uID0gdGhpcy5yZXNvbHZlSm9pblNlY3Rpb24oZnJvbV9pdGVtKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEhhcyBjcm9zcyBqb2luXG4gICAgICAgIGlmICh0aGlzLmFzdC5ib2R5LlNlbGVjdC5mcm9tLnNsaWNlKDEpLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHNlY3Rpb25zID0gc2VjdGlvbnMuY29uY2F0KHRoaXMucmVzb2x2ZUNyb3NzSm9pblNlY3Rpb24odGhpcy5hc3QuYm9keS5TZWxlY3QuZnJvbS5zbGljZSgxKSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVTZWxlY3RTZWN0aW9uKCkpXG5cbiAgICAgICAgaWYgKGpvaW5fc2VjdGlvbiAhPT0gJycpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2goam9pbl9zZWN0aW9uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdC5ib2R5LlNlbGVjdCwgJ3NlbGVjdGlvbicpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZVdoZXJlU2VjdGlvbih0aGlzLmFzdC5ib2R5LlNlbGVjdC5zZWxlY3Rpb24pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdC5ib2R5LlNlbGVjdCwgJ2dyb3VwX2J5JykgJiYgdGhpcy5hc3QuYm9keS5TZWxlY3QuZ3JvdXBfYnkubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgc2VjdGlvbnMucHVzaCh0aGlzLnJlc29sdmVHcm91cEJ5U2VjdGlvbigpKTtcblxuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHRoaXMuYXN0LmJvZHkuU2VsZWN0LCAnaGF2aW5nJykpIHtcbiAgICAgICAgICAgICAgICBzZWN0aW9ucy5wdXNoKHRoaXMucmVzb2x2ZUhhdmluZ1NlY3Rpb24oKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QsICdvcmRlcl9ieScpICYmIHRoaXMuYXN0Lm9yZGVyX2J5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2godGhpcy5yZXNvbHZlT3JkZXJCeVNlY3Rpb24oKSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwodGhpcy5hc3QsICdsaW1pdCcpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKCdsaW1pdCgnICsgdGhpcy5hc3QubGltaXQuVmFsdWUuTnVtYmVyWzBdICsgJyknKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLmFzdCwgJ29mZnNldCcpKSB7XG4gICAgICAgICAgICBzZWN0aW9ucy5wdXNoKCdvZmZzZXQoJyArIHRoaXMuYXN0Lm9mZnNldC52YWx1ZS5WYWx1ZS5OdW1iZXJbMF0gKyAnKScpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG5lZWRfYXBwZW5kX2dldF9zdWZmaXgpIHtcbiAgICAgICAgICAgIHNlY3Rpb25zLnB1c2goJ2dldCgpOycpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHNlY3Rpb25zLmpvaW4oJ1xcbi0+Jyk7XG4gICAgfVxuXG4gICAgcmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUocmVsYXRpb25fbm9kZSkge1xuICAgICAgICAgICAgbGV0IHRhYmxlX25hbWUgPSByZWxhdGlvbl9ub2RlLlRhYmxlLm5hbWVbMF0udmFsdWU7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChyZWxhdGlvbl9ub2RlLlRhYmxlLCAnYWxpYXMnKSkge1xuICAgICAgICAgICAgICAgIHRoaXMudGFibGVfbmFtZV9ieV9hbGlhc1tyZWxhdGlvbl9ub2RlLlRhYmxlLmFsaWFzLm5hbWUudmFsdWVdID0gdGFibGVfbmFtZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHF1b3RlKHRhYmxlX25hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlTWFpblRhYmxlU2VjdGlvbihmcm9tX2l0ZW0pIHtcbiAgICAgICAgcmV0dXJuICdEQjo6dGFibGUoJyArIHRoaXMucmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUoZnJvbV9pdGVtLnJlbGF0aW9uKSArICcpJztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZUZyb21TdWJTZWN0aW9uKHByZWZpeCwgZnJvbV9pdGVtKSB7XG4gICAgICAgIHJldHVybiBwcmVmaXggKyAnKGZ1bmN0aW9uICgkcXVlcnkpIHtcXG4nXG4gICAgICAgICAgICArICdcXHQnICsgYWRkVGFiVG9FdmVyeUxpbmUoKG5ldyBDb252ZXJ0ZXIoZnJvbV9pdGVtLnJlbGF0aW9uLkRlcml2ZWQuc3VicXVlcnksIHRoaXMpLnJ1bihmYWxzZSkpLnJlcGxhY2UoJ0RCOjp0YWJsZScsICckcXVlcnktPmZyb20nKSwgMikgKyAnO1xcbidcbiAgICAgICAgICAgICsgJ30sJyArIHF1b3RlKGZyb21faXRlbS5yZWxhdGlvbi5EZXJpdmVkLmFsaWFzLm5hbWUudmFsdWUpICsgJyknO1xuICAgIH1cblxuICAgIHJlc29sdmVXaGVyZVNlY3Rpb24oc2VsZWN0aW9uX25vZGUpIHtcbiAgICAgICAgbGV0IGNvbmRpdGlvbl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChzZWxlY3Rpb25fbm9kZSk7XG4gICAgICAgIGxldCBjb25kaXRpb24gPSBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qoc2VsZWN0aW9uX25vZGUpO1xuXG4gICAgICAgIHJldHVybiB0aGlzLnByZXBhcmVDb25kaXRpb25zKGNvbmRpdGlvbl90eXBlLCBjb25kaXRpb24sICcnLCAnd2hlcmUnKS5qb2luKCdcXG4tPicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjb25kaXRpb25fdHlwZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBjb25kaXRpb25cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3Agb25lIG9mIFsnJywgJ0FuZCcsICdPciddXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1ldGhvZF9uYW1lXG4gICAgICogQHJldHVybiB7c3RyaW5nW119XG4gICAgICovXG4gICAgcHJlcGFyZUNvbmRpdGlvbnMoY29uZGl0aW9uX3R5cGUsIGNvbmRpdGlvbiwgb3AsIG1ldGhvZF9uYW1lKSB7XG4gICAgICAgIGxldCBjb25kaXRpb25zID0gW107XG5cbiAgICAgICAgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnSXNOdWxsJyB8fCBjb25kaXRpb25fdHlwZSA9PT0gJ0lzTm90TnVsbCcpIHtcbiAgICAgICAgICAgIGxldCBtZXRob2RfbmFtZSA9IGNvbmRpdGlvbl90eXBlID09PSAnSXNOdWxsJyA/ICd3aGVyZU51bGwnIDogJ3doZXJlTm90TnVsbCc7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJygnICsgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbikpICsgJyknKTtcbiAgICAgICAgfSBlbHNlIGlmIChjb25kaXRpb25fdHlwZSA9PT0gJ0luTGlzdCcpIHtcbiAgICAgICAgICAgIGxldCBjb2x1bW4gPSB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpKTtcbiAgICAgICAgICAgIGxldCBsaXN0ID0gY29uZGl0aW9uLmxpc3QubWFwKChpKSA9PiB0aGlzLnJlc29sdmVWYWx1ZShpLlZhbHVlKSk7XG5cbiAgICAgICAgICAgIGxldCBtZXRob2RfbmFtZSA9IGNvbmRpdGlvbi5uZWdhdGVkID8gJ3doZXJlTm90SW4nIDogJ3doZXJlSW4nO1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoJyArIGNvbHVtbiArICcsJyArICdbJyArIGxpc3Quam9pbignLCAnKSArICddKScpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnTmVzdGVkJykge1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICAgIHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoZnVuY3Rpb24gKCRxdWVyeSkge1xcbidcbiAgICAgICAgICAgICAgICArICdcXHQkcXVlcnktPicgKyAgYWRkVGFiVG9FdmVyeUxpbmUodGhpcy5yZXNvbHZlV2hlcmVTZWN0aW9uKGNvbmRpdGlvbiksIDIpICsgJztcXG59KSdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdCaW5hcnlPcCcpIHtcbiAgICAgICAgICAgIGlmIChjb25kaXRpb24ub3AgPT09ICdBbmQnIHx8IGNvbmRpdGlvbi5vcCA9PT0gJ09yJykge1xuICAgICAgICAgICAgICAgIGxldCBsZWZ0X2NvbmRpdGlvbl90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChjb25kaXRpb24ubGVmdCk7XG4gICAgICAgICAgICAgICAgbGV0IGxlZnRfY29uZGl0aW9uID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5sZWZ0KTtcbiAgICAgICAgICAgICAgICBjb25kaXRpb25zID0gY29uZGl0aW9ucy5jb25jYXQodGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhsZWZ0X2NvbmRpdGlvbl90eXBlLCBsZWZ0X2NvbmRpdGlvbiwgb3AsIG1ldGhvZF9uYW1lKSk7XG5cbiAgICAgICAgICAgICAgICBsZXQgcmlnaHRfY29uZGl0aW9uX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGNvbmRpdGlvbi5yaWdodCk7XG4gICAgICAgICAgICAgICAgbGV0IHJpZ2h0X2NvbmRpdGlvbiA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24ucmlnaHQpO1xuICAgICAgICAgICAgICAgIGNvbmRpdGlvbnMgPSBjb25kaXRpb25zLmNvbmNhdCh0aGlzLnByZXBhcmVDb25kaXRpb25zKHJpZ2h0X2NvbmRpdGlvbl90eXBlLCByaWdodF9jb25kaXRpb24sIGNvbmRpdGlvbi5vcCwgbWV0aG9kX25hbWUpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsZXQgbGVmdCA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24ubGVmdCkpO1xuICAgICAgICAgICAgICAgIGxldCByaWdodDtcblxuICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChjb25kaXRpb24ucmlnaHQsICdJZGVudGlmaWVyJywgJ0NvbXBvdW5kSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0ID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGNvbmRpdGlvbi5yaWdodCkpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChtZXRob2RfbmFtZS5pbmNsdWRlcygnd2hlcmUnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSAnREI6OnJhdygnICsgcmlnaHQgKyAnKSc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGNvbmRpdGlvbi5yaWdodCwgJ1ZhbHVlJykpIHtcbiAgICAgICAgICAgICAgICAgICAgbWV0aG9kX25hbWUgPSAnd2hlcmUnO1xuICAgICAgICAgICAgICAgICAgICByaWdodCA9IHRoaXMucmVzb2x2ZVZhbHVlKGNvbmRpdGlvbi5yaWdodC5WYWx1ZSlcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGNvbmRpdGlvbi5yaWdodCwgJ1N1YnF1ZXJ5JykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSAnZnVuY3Rpb24oJHF1ZXJ5KSB7XFxuJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnXFx0JyArIGFkZFRhYlRvRXZlcnlMaW5lKChuZXcgQ29udmVydGVyKGNvbmRpdGlvbi5yaWdodC5TdWJxdWVyeSwgdGhpcykucnVuKGZhbHNlKSkucmVwbGFjZSgnREI6OnRhYmxlJywgJyRxdWVyeS0+ZnJvbScpLCAyKSArICc7XFxuJ1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnfSdcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGNvbmRpdGlvbi5yaWdodCwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgPSAnREI6OnJhdygnICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShjb25kaXRpb24ucmlnaHQuRnVuY3Rpb24pICsgJyknO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGNvbmRpdGlvbi5yaWdodCB0eXBlOicgKyBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGNvbmRpdGlvbi5yaWdodCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoJyArIGxlZnQgKyAnLCcgKyBxdW90ZSh0aGlzLnRyYW5zZm9ybUJpbmFyeU9wKGNvbmRpdGlvbi5vcCkpICsgJywnICsgcmlnaHQgKyAnKScpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnRXhpc3RzJykge1xuICAgICAgICAgICAgY29uZGl0aW9ucy5wdXNoKFxuICAgICAgICAgICAgICAgIHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsICd3aGVyZUV4aXN0cycpICsgJyhmdW5jdGlvbiAoJHF1ZXJ5KSB7XFxuJyArXG4gICAgICAgICAgICAgICAgJ1xcdCcgKyAgYWRkVGFiVG9FdmVyeUxpbmUoKG5ldyBDb252ZXJ0ZXIoY29uZGl0aW9uLCB0aGlzKSkucnVuKGZhbHNlKSwgMikucmVwbGFjZSgnREI6OnRhYmxlJywgJyRxdWVyeS0+ZnJvbScpICsgJztcXG4nICtcbiAgICAgICAgICAgICAgICAnfSdcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAoY29uZGl0aW9uX3R5cGUgPT09ICdCZXR3ZWVuJykge1xuICAgICAgICAgICAgbGV0IG1ldGhvZF9uYW1lID0gY29uZGl0aW9uLm5lZ2F0ZWQgPT09IHRydWUgPyAnd2hlcmVOb3RCZXR3ZWVuJyA6ICd3aGVyZUJldHdlZW4nO1xuXG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2goXG4gICAgICAgICAgICAgIHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKSArICcoJ1xuICAgICAgICAgICAgICArIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24uZXhwcikpICsgJywnXG4gICAgICAgICAgICAgICsgJ1snICsgdGhpcy5yZXNvbHZlVmFsdWUoY29uZGl0aW9uLmxvdy5WYWx1ZSkgKyAnLCcgKyB0aGlzLnJlc29sdmVWYWx1ZShjb25kaXRpb24uaGlnaC5WYWx1ZSkgKyAnXSknXG4gICAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnSW5TdWJxdWVyeScpIHtcbiAgICAgICAgICAgIGxldCBtZXRob2RfbmFtZSA9IGNvbmRpdGlvbi5uZWdhdGVkID09PSB0cnVlID8gJ3doZXJlTm90SW4nIDogJ3doZXJlSW4nO1xuXG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2goXG4gICAgICAgICAgICAgIHRoaXMuYWRkUHJlZml4Mk1ldGhvZHMob3AsIG1ldGhvZF9uYW1lKVxuICAgICAgICAgICAgICArICcoJyArIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChjb25kaXRpb24uZXhwcikpICsgJywnICsgJyhmdW5jdGlvbiAoJHF1ZXJ5KSB7XFxuJ1xuICAgICAgICAgICAgICArICdcXHQnICsgYWRkVGFiVG9FdmVyeUxpbmUoKG5ldyBDb252ZXJ0ZXIoY29uZGl0aW9uLnN1YnF1ZXJ5LCB0aGlzKSkucnVuKGZhbHNlKSwgMikucmVwbGFjZSgnREI6OnRhYmxlJywgJyRxdWVyeS0+ZnJvbScpICsgJztcXG4nXG4gICAgICAgICAgICAgICsgJ30nXG4gICAgICAgICAgICApO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnRnVuY3Rpb24nKSB7XG4gICAgICAgICAgICBjb25kaXRpb25zLnB1c2godGhpcy5hZGRQcmVmaXgyTWV0aG9kcyhvcCwgbWV0aG9kX25hbWUpICsgJyhEQjo6cmF3KFwiJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoY29uZGl0aW9uLCBmYWxzZSkgKyAnXCIpKScpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmRpdGlvbl90eXBlID09PSAnVW5hcnlPcCcpIHtcbiAgICAgICAgICAgIGNvbmRpdGlvbnMucHVzaCh0aGlzLnByZXBhcmVDb25kaXRpb25zKGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpLCBnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QoY29uZGl0aW9uLmV4cHIpLCBvcCwgbWV0aG9kX25hbWUpWzBdLnJlcGxhY2UoL3doZXJlL2ksICd3aGVyZScgKyBjb25kaXRpb24ub3ApKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGNvbmRpdGlvbiB0eXBlIFsnICsgY29uZGl0aW9uX3R5cGUgKyAnXSc7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY29uZGl0aW9ucztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gb3BcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgdHJhbnNmb3JtQmluYXJ5T3Aob3ApIHtcbiAgICAgICAgbGV0IG9wZXJhdG9yX2J5X29wID0ge1xuICAgICAgICAgICAgJ0VxJzogJz0nLFxuICAgICAgICAgICAgJ0d0JzogJz4nLFxuICAgICAgICAgICAgJ0d0RXEnOiAnPj0nLFxuICAgICAgICAgICAgJ0x0JzogJzwnLFxuICAgICAgICAgICAgJ0x0RXEnOiAnPCcsXG4gICAgICAgICAgICAnTm90RXEnOiAnIT0nLFxuICAgICAgICAgICAgJ0xpa2UnOiAnbGlrZScsXG4gICAgICAgICAgICAnTWludXMnOiAnLScsXG4gICAgICAgICAgICAnUGx1cyc6ICcrJyxcbiAgICAgICAgICAgICdNdWx0aXBseSc6ICcqJyxcbiAgICAgICAgICAgICdEaXZpZGUnOiAnLydcbiAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gb3BlcmF0b3JfYnlfb3Bbb3BdO1xuICAgIH1cblxuICAgIGFkZFByZWZpeDJNZXRob2RzKG9wLCBtZXRob2RfbmFtZSkge1xuICAgICAgICBpZiAob3AgPT09ICcnIHx8IG9wID09PSAnQW5kJykge1xuICAgICAgICAgICAgcmV0dXJuIG1ldGhvZF9uYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG9wLnRvTG93ZXJDYXNlKCkgKyBjYXBpdGFsaXplRmlyc3RMZXR0ZXIobWV0aG9kX25hbWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlU2VsZWN0U2VjdGlvbigpIHtcbiAgICAgICAgbGV0IHJlcyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3Qgc2VsZWN0X2l0ZW0gb2YgdGhpcy5hc3QuYm9keS5TZWxlY3QucHJvamVjdGlvbikge1xuICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHNlbGVjdF9pdGVtLCAnRXhwcldpdGhBbGlhcycpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGFsaWFzID0gc2VsZWN0X2l0ZW0uRXhwcldpdGhBbGlhcy5hbGlhcy52YWx1ZTtcbiAgICAgICAgICAgICAgICByZXMucHVzaCh0aGlzLnJlc29sdmVTZWxlY3RTZWN0aW9uSXRlbShzZWxlY3RfaXRlbS5FeHByV2l0aEFsaWFzLmV4cHIsIGFsaWFzKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHNlbGVjdF9pdGVtLCAnVW5uYW1lZEV4cHInKSkge1xuICAgICAgICAgICAgICAgIHJlcy5wdXNoKHRoaXMucmVzb2x2ZVNlbGVjdFNlY3Rpb25JdGVtKHNlbGVjdF9pdGVtLlVubmFtZWRFeHByKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNlbGVjdF9pdGVtID09PSAnV2lsZGNhcmQnKSB7XG4gICAgICAgICAgICAgICAgcmVzLnB1c2gocXVvdGUoJyonKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKHNlbGVjdF9pdGVtLCAnUXVhbGlmaWVkV2lsZGNhcmQnKSkge1xuICAgICAgICAgICAgICAgIHJlcy5wdXNoKHF1b3RlKHRoaXMuZ2V0QWN0dWFsVGFibGVOYW1lKHNlbGVjdF9pdGVtLlF1YWxpZmllZFdpbGRjYXJkWzBdLnZhbHVlKSArICcuKicpKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBzZWxlY3QgaXRlbSBbJyArIE9iamVjdC5rZXlzKHNlbGVjdF9pdGVtKVswXSArICddJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAnc2VsZWN0KCcgKyByZXMuam9pbignLCAnKSArICcpJztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gc2VsZWN0X2l0ZW1cbiAgICAgKiBAcGFyYW0gYWxpYXNcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcmVzb2x2ZVNlbGVjdFNlY3Rpb25JdGVtKHNlbGVjdF9pdGVtLCBhbGlhcyA9IG51bGwpIHtcbiAgICAgICAgYXNzZXJ0KGlzVW5kZWZpbmVkT3JOdWxsKHNlbGVjdF9pdGVtKSA9PT0gZmFsc2UsICdzZWxlY3RfaXRlbSBtdXN0IG5vdCBiZSB1bmRlZmluZWQgb3IgbnVsbCcpO1xuXG4gICAgICAgIGxldCBpdGVtO1xuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoc2VsZWN0X2l0ZW0sICdGdW5jdGlvbicpKSB7XG4gICAgICAgICAgICBpdGVtID0gJ0RCOjpyYXcoXCInICsgdGhpcy5wYXJzZUZ1bmN0aW9uTm9kZShzZWxlY3RfaXRlbS5GdW5jdGlvbik7XG5cbiAgICAgICAgICAgIGlmIChhbGlhcyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGl0ZW0gPSBpdGVtICsgJyBhcyAnICsgYWxpYXMgKyAnXCIpJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGl0ZW07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpdGVtID0gdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KHNlbGVjdF9pdGVtKSwgZmFsc2UpO1xuXG4gICAgICAgICAgICBpZiAoYWxpYXMgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpdGVtID0gaXRlbSArICcgYXMgJyArIGFsaWFzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcXVvdGUoaXRlbSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwYXJzZUZ1bmN0aW9uTm9kZShmdW5jdGlvbl9ub2RlLCBuZWVkX3F1b3RlID0gdHJ1ZSkge1xuICAgICAgICBsZXQgZnVuY3Rpb25fbmFtZSA9IGZ1bmN0aW9uX25vZGUubmFtZVswXS52YWx1ZTtcblxuICAgICAgICBpZiAobmVlZF9xdW90ZSkge1xuICAgICAgICAgICAgZnVuY3Rpb25fbmFtZSA9IHF1b3RlKGZ1bmN0aW9uX25hbWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHJlcyA9IGZ1bmN0aW9uX25hbWUgKyAnKCc7XG4gICAgICAgIGxldCBhcmdzID0gZnVuY3Rpb25fbm9kZS5hcmdzO1xuICAgICAgICBsZXQgYXJnX2NvdW50ID0gYXJncy5sZW5ndGg7XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhcmdfY291bnQ7IGkrKykge1xuICAgICAgICAgICAgbGV0IGFyZyA9IGFyZ3NbaV07XG5cbiAgICAgICAgICAgIGlmIChhcmcuVW5uYW1lZCA9PT0gJ1dpbGRjYXJkJykge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArICcqJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ1ZhbHVlJykpIHtcbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyB0aGlzLnJlc29sdmVWYWx1ZShhcmcuVW5uYW1lZC5FeHByLlZhbHVlKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0lkZW50aWZpZXInKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIGFyZy5Vbm5hbWVkLkV4cHIuSWRlbnRpZmllci52YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoYXJnLlVubmFtZWQuRXhwciwgJ0NvbXBvdW5kSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgdGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oYXJnLlVubmFtZWQuRXhwci5Db21wb3VuZElkZW50aWZpZXIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnTmVzdGVkJykpIHsgLy8gZS5nLiBDT1VOVChESVNUSU5DVCgnaWQnKSlcbiAgICAgICAgICAgICAgICBsZXQgYXJnX2NvbHVtbiA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChhcmcuVW5uYW1lZC5FeHByLk5lc3RlZCkpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGZ1bmN0aW9uX25vZGUuZGlzdGluY3QgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgICAgICAgYXJnX2NvbHVtbiA9ICdESVNUSU5DVCgnICsgYXJnX2NvbHVtbiArICcpJztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXMgPSByZXMgKyBhcmdfY29sdW1uO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnRnVuY3Rpb24nKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoYXJnLlVubmFtZWQuRXhwci5GdW5jdGlvbiwgZmFsc2UpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChhcmcuVW5uYW1lZC5FeHByLCAnQmluYXJ5T3AnKSkge1xuICAgICAgICAgICAgICAgIHJlcyA9IHJlcyArIHRoaXMucGFyc2VCaW5hcnlPcE5vZGUoYXJnLlVubmFtZWQuRXhwci5CaW5hcnlPcCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdVbmFyeU9wJykpIHtcbiAgICAgICAgICAgICAgICAvLyB0b2RvXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGFyZy5Vbm5hbWVkLkV4cHIsICdDYXNlJykpIHtcbiAgICAgICAgICAgICAgICAvLyB0b2RvXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGFyZyB0eXBlOicgKyBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGFyZy5Vbm5hbWVkLkV4cHIpO1xuICAgICAgICAgICAgfVxuXG5cbiAgICAgICAgICAgIGlmIChpICE9PSBhcmdfY291bnQgLSAxKSB7XG4gICAgICAgICAgICAgICAgcmVzID0gcmVzICsgJywgJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJlcyA9IHJlcyArICcpJztcblxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgaGFzSm9pblNlY3Rpb24oZnJvbV9pdGVtKSB7XG4gICAgICAgIHJldHVybiBwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0sICdqb2lucycpICYmIGZyb21faXRlbS5qb2lucy5sZW5ndGggPiAwO1xuICAgIH1cblxuICAgIHBhcnNlQmluYXJ5T3BQYXJ0aWFsKGxlZnRfb3JfcmlnaHQpIHtcbiAgICAgICAgbGV0IHJlcztcblxuICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgIHJlcyA9IHF1b3RlKHRoaXMucGFyc2VGdW5jdGlvbk5vZGUobGVmdF9vcl9yaWdodC5GdW5jdGlvbikpO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdJZGVudGlmaWVyJywgJ0NvbXBvdW5kSWRlbnRpZmllcicpKXtcbiAgICAgICAgICAgIHJlcyA9IHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChsZWZ0X29yX3JpZ2h0KSk7XG4gICAgICAgIH0gZWxzZSBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwobGVmdF9vcl9yaWdodCwgJ1ZhbHVlJykpIHtcbiAgICAgICAgICAgIHJlcyA9IHRoaXMucmVzb2x2ZVZhbHVlKGxlZnRfb3JfcmlnaHQuVmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdCaW5hcnlPcCcpKSB7XG4gICAgICAgICAgICByZXMgPSB0aGlzLnBhcnNlQmluYXJ5T3BOb2RlKGxlZnRfb3JfcmlnaHQuQmluYXJ5T3ApO1xuICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGxlZnRfb3JfcmlnaHQsICdTdWJxdWVyeScpKSB7XG4gICAgICAgICAgICAvLyB0b2RvXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCB0eXBlIGluIGJpbmFyeSBvcCBsZWZ0IG9yIHJpZ2h0Lic7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cblxuICAgIHBhcnNlQmluYXJ5T3BOb2RlKGJpbmFyeV9vcCwgc2VwYXJhdG9yID0gJyAnKSB7XG4gICAgICAgIGxldCBsZWZ0ID0gdGhpcy5wYXJzZUJpbmFyeU9wUGFydGlhbChiaW5hcnlfb3AubGVmdCk7XG4gICAgICAgIGxldCBvcCA9IHF1b3RlKHRoaXMudHJhbnNmb3JtQmluYXJ5T3AoYmluYXJ5X29wLm9wKSk7XG4gICAgICAgIGxldCByaWdodCA9IHRoaXMucGFyc2VCaW5hcnlPcFBhcnRpYWwoYmluYXJ5X29wLnJpZ2h0KTtcblxuICAgICAgICByZXR1cm4gW2xlZnQsIG9wLCByaWdodF0uam9pbihzZXBhcmF0b3IpO1xuICAgIH1cblxuICAgIHByZXBhcmVKb2lucyhmcm9tX2l0ZW0pIHtcbiAgICAgICAgbGV0IGpvaW5zID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBqb2luIG9mIGZyb21faXRlbS5qb2lucykge1xuICAgICAgICAgICAgbGV0IGpvaW5fb3BlcmF0b3JfdHlwZSA9IGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qoam9pbi5qb2luX29wZXJhdG9yKTtcbiAgICAgICAgICAgIGxldCBqb2luX21ldGhvZCA9IHtcbiAgICAgICAgICAgICAgICAnSW5uZXInOiAnam9pbicsXG4gICAgICAgICAgICAgICAgJ0xlZnRPdXRlcic6ICdsZWZ0Sm9pbicsXG4gICAgICAgICAgICAgICAgJ1JpZ2h0T3V0ZXInOiAncmlnaHRKb2luJyxcbiAgICAgICAgICAgIH1bam9pbl9vcGVyYXRvcl90eXBlXTtcbiAgICAgICAgICAgIGxldCBqb2luX29wZXJhdG9yID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGpvaW4uam9pbl9vcGVyYXRvcik7XG4gICAgICAgICAgICBsZXQgY29uZGl0aW9uX3R5cGUgPSBnZXROZXN0ZWRVbmlxdWVLZXlGcm9tT2JqZWN0KGpvaW5fb3BlcmF0b3IuT24pO1xuICAgICAgICAgICAgbGV0IGNvbmRpdGlvbiA9IGdldE5lc3RlZFVuaXF1ZVZhbHVlRnJvbU9iamVjdChqb2luX29wZXJhdG9yLk9uKTtcbiAgICAgICAgICAgIGxldCBjb25kaXRpb25zID0gdGhpcy5wcmVwYXJlQ29uZGl0aW9ucyhjb25kaXRpb25fdHlwZSwgY29uZGl0aW9uLCAnJywgJ29uJyk7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChqb2luLnJlbGF0aW9uLCAnRGVyaXZlZCcpKSB7IC8vIGpvaW5lZCBzZWN0aW9uIGlzIHN1Yi1xdWVyeVxuICAgICAgICAgICAgICAgIGxldCBzdWJfcXVlcnlfc3FsID0gbmV3IENvbnZlcnRlcihqb2luLnJlbGF0aW9uLkRlcml2ZWQuc3VicXVlcnksIHRoaXMpLnJ1bihmYWxzZSk7XG4gICAgICAgICAgICAgICAgbGV0IHN1Yl9xdWVyeV9hbGlhcyA9IGpvaW4ucmVsYXRpb24uRGVyaXZlZC5hbGlhcy5uYW1lLnZhbHVlO1xuICAgICAgICAgICAgICAgIGpvaW5zLnB1c2goam9pbl9tZXRob2QgKyAnKERCOjpyYXcoXCInICsgYWRkVGFiVG9FdmVyeUxpbmUoc3ViX3F1ZXJ5X3NxbCkgKyAnXCIpIGFzICdcbiAgICAgICAgICAgICAgICAgICAgKyBzdWJfcXVlcnlfYWxpYXMgKyAnKSwgZnVuY3Rpb24oJGpvaW4pIHtcXG5cXHQnXG4gICAgICAgICAgICAgICAgICAgICsgJyRqb2luLT4nICsgYWRkVGFiVG9FdmVyeUxpbmUoY29uZGl0aW9ucy5qb2luKCdcXG4tPicpICsgJzsnLCAyKVxuICAgICAgICAgICAgICAgICAgICArICdcXG59Jyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGpvaW4ucmVsYXRpb24sICdUYWJsZScpKSB7XG4gICAgICAgICAgICAgICAgbGV0IGpvaW5lZF90YWJsZSA9IHRoaXMucmVzb2x2ZVRhYmxlTmFtZUZyb21SZWxhdGlvbk5vZGUoam9pbi5yZWxhdGlvbik7XG5cbiAgICAgICAgICAgICAgICBpZiAoY29uZGl0aW9ucy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGpvaW5fb3BlcmF0b3IuT24sICdCaW5hcnlPcCcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBqb2lucy5wdXNoKGpvaW5fbWV0aG9kICsgJygnICsgam9pbmVkX3RhYmxlICsgJywnICsgdGhpcy5wYXJzZUJpbmFyeU9wTm9kZShqb2luX29wZXJhdG9yLk9uLkJpbmFyeU9wLCAnLCcpICsgJyknKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChqb2luX29wZXJhdG9yLk9uLCAnTmVzdGVkJykpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGNvbmRpdGlvbnMgPSB0aGlzLnByZXBhcmVDb25kaXRpb25zKCdOZXN0ZWQnLCBqb2luX29wZXJhdG9yLk9uLk5lc3RlZCwgJycsICdvbicpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBqb2lucy5wdXNoKGNvbmRpdGlvbnNbMF0pO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgJ0xvZ2ljIGVycm9yLCB1bmhhbmRsZWQgb24gdHlwZSc7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBqb2lucy5wdXNoKGpvaW5fbWV0aG9kICsgJygnICsgam9pbmVkX3RhYmxlICsgJywnXG4gICAgICAgICAgICAgICAgICAgICAgICArICdmdW5jdGlvbigkam9pbikge1xcblxcdCdcbiAgICAgICAgICAgICAgICAgICAgICAgICsgJyRqb2luLT4nICsgYWRkVGFiVG9FdmVyeUxpbmUoY29uZGl0aW9ucy5qb2luKCdcXG4tPicpKSArICc7J1xuICAgICAgICAgICAgICAgICAgICAgICAgKyAnXFxufSknXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBqb2luIHJlbGF0aW9uIHR5cGUnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGpvaW5zO1xuICAgIH1cblxuICAgIHJlc29sdmVKb2luU2VjdGlvbihmcm9tX2l0ZW0pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucHJlcGFyZUpvaW5zKGZyb21faXRlbSkuam9pbignXFxuLT4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gZnJvbV9pdGVtc1xuICAgICAqIEByZXR1cm4ge3N0cmluZ1tdfVxuICAgICAqL1xuICAgIHJlc29sdmVDcm9zc0pvaW5TZWN0aW9uKGZyb21faXRlbXMpIHtcbiAgICAgICAgbGV0IGNyb3NzX2pvaW5fc2VjdGlvbnMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGZyb21faXRlbSBvZiBmcm9tX2l0ZW1zKSB7XG4gICAgICAgICAgICBsZXQgY3Jvc3Nfam9pbl9zdHI7XG5cbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChmcm9tX2l0ZW0ucmVsYXRpb24sICdUYWJsZScpKSB7XG4gICAgICAgICAgICAgICAgY3Jvc3Nfam9pbl9zdHIgPSAnY3Jvc3NKb2luKCcgKyB0aGlzLnJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlKGZyb21faXRlbS5yZWxhdGlvbik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGZyb21faXRlbS5yZWxhdGlvbiwgJ0Rlcml2ZWQnKSkge1xuICAgICAgICAgICAgICAgIGNyb3NzX2pvaW5fc3RyID0gdGhpcy5yZXNvbHZlRnJvbVN1YlNlY3Rpb24oJ2Nyb3NzSm9pblN1YicsIGZyb21faXRlbSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGNyb3NzIGpvaW4gcmVsYXRpb24gdHlwZSc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNyb3NzX2pvaW5fc2VjdGlvbnMucHVzaChjcm9zc19qb2luX3N0cik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY3Jvc3Nfam9pbl9zZWN0aW9ucztcbiAgICB9XG5cbiAgICByZXNvbHZlR3JvdXBCeVNlY3Rpb24oKSB7XG4gICAgICAgIGxldCBncm91cF9ieV9jb2x1bW5zID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBncm91cF9ieV9pdGVtIG9mIHRoaXMuYXN0LmJvZHkuU2VsZWN0Lmdyb3VwX2J5KSB7XG4gICAgICAgICAgICBpZiAocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZ3JvdXBfYnlfaXRlbSwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICBncm91cF9ieV9jb2x1bW5zLnB1c2goJ0RCOjpyYXcoJyArIHRoaXMucGFyc2VGdW5jdGlvbk5vZGUoZ3JvdXBfYnlfaXRlbS5GdW5jdGlvbikgKyAnXCIpJyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYocHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwoZ3JvdXBfYnlfaXRlbSwgJ0lkZW50aWZpZXInLCAnQ29tcG91bmRJZGVudGlmaWVyJykpIHtcbiAgICAgICAgICAgICAgICBncm91cF9ieV9jb2x1bW5zLnB1c2godGhpcy5jb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KGdyb3VwX2J5X2l0ZW0pKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGdyb3VwX2J5X2l0ZW0sICdOZXN0ZWQnKSkge1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChncm91cF9ieV9pdGVtLCAnVmFsdWUnKSkge1xuICAgICAgICAgICAgICAgIGdyb3VwX2J5X2NvbHVtbnMucHVzaCh0aGlzLnJlc29sdmVWYWx1ZShncm91cF9ieV9pdGVtLlZhbHVlKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIGdyb3VwIGJ5IHR5cGU6JyArIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QoZ3JvdXBfYnlfaXRlbSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gJ2dyb3VwQnkoJyArIGdyb3VwX2J5X2NvbHVtbnMuam9pbignLCcpICsgJyknO1xuICAgIH1cblxuICAgIHJlc29sdmVIYXZpbmdTZWN0aW9uKCkge1xuICAgICAgICBsZXQgYmluYXJ5X29wID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KHRoaXMuYXN0LmJvZHkuU2VsZWN0LmhhdmluZywgJ0JpbmFyeU9wJyk7XG4gICAgICAgIGxldCBtZXRob2RfbmFtZSA9IHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKGJpbmFyeV9vcC5sZWZ0LCAnRnVuY3Rpb24nKSA/ICdoYXZpbmdSYXcnIDogJ2hhdmluZyc7XG5cbiAgICAgICAgcmV0dXJuIG1ldGhvZF9uYW1lICsgJygnICsgdGhpcy5wYXJzZUJpbmFyeU9wTm9kZShiaW5hcnlfb3AsICcsJykgKyAnKSc7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKi9cbiAgICByZXNvbHZlT3JkZXJCeVNlY3Rpb24oKSB7XG4gICAgICAgIGxldCBvcmRlcl9ieXMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IG9yZGVyX2J5X2l0ZW0gb2YgdGhpcy5hc3Qub3JkZXJfYnkpIHtcbiAgICAgICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChvcmRlcl9ieV9pdGVtLmV4cHIsICdCaW5hcnlPcCcpKSB7XG4gICAgICAgICAgICAgICAgb3JkZXJfYnlzLnB1c2goJ29yZGVyQnlSYXcoJyArIHF1b3RlKHRoaXMucGFyc2VCaW5hcnlPcE5vZGUob3JkZXJfYnlfaXRlbS5leHByLkJpbmFyeU9wKSkgKyAnKScpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbChvcmRlcl9ieV9pdGVtLmV4cHIsICdJZGVudGlmaWVyJywgJ0NvbXBvdW5kSWRlbnRpZmllcicpKSB7XG4gICAgICAgICAgICAgICAgb3JkZXJfYnlzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICdvcmRlckJ5KCcgK1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbnZlcnRJZGVudGlmaWVyMnF1YWxpZmllZENvbHVtbihnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3Qob3JkZXJfYnlfaXRlbS5leHByKSkgKyAnLCcgK1xuICAgICAgICAgICAgICAgICAgICBxdW90ZShvcmRlcl9ieV9pdGVtLmFzYyA9PT0gZmFsc2UgPyAnZGVzYyc6ICdhc2MnKSArICcpJ1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByb3BlcnR5RXhpc3RzSW5PYmplY3RBbmROb3ROdWxsKG9yZGVyX2J5X2l0ZW0uZXhwciwgJ0Z1bmN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICBvcmRlcl9ieXMucHVzaCgnb3JkZXJCeVJhdyhcIicgKyB0aGlzLnBhcnNlRnVuY3Rpb25Ob2RlKG9yZGVyX2J5X2l0ZW0uZXhwci5GdW5jdGlvbikgKyAnICcgKyAob3JkZXJfYnlfaXRlbS5hc2MgPT09IGZhbHNlID8gJ2Rlc2MnOiAnYXNjJykgKyAnXCIpJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93ICdMb2dpYyBlcnJvciwgdW5oYW5kbGVkIG9yZGVyIGJ5IHR5cGU6JyArIGdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3Qob3JkZXJfYnlfaXRlbS5leHByKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBvcmRlcl9ieXMuam9pbignXFxuLT4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gdmFsdWVOb2RlXG4gICAgICogQHJldHVybiB7c3RyaW5nfCp9XG4gICAgICovXG4gICAgcmVzb2x2ZVZhbHVlKHZhbHVlTm9kZSkge1xuICAgICAgICBpZiAoaXNTdHJpbmcodmFsdWVOb2RlKSAmJiB2YWx1ZU5vZGUudG9Mb3dlckNhc2UoKSA9PT0gJ251bGwnKSB7XG4gICAgICAgICAgICByZXR1cm4gJ251bGwnO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHZhbHVlID0gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KHZhbHVlTm9kZSk7XG4gICAgICAgIGxldCB2YWx1ZV90eXBlID0gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdCh2YWx1ZU5vZGUpO1xuXG4gICAgICAgIGlmICh2YWx1ZV90eXBlID09PSAnU2luZ2xlUXVvdGVkU3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIHF1b3RlKHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZV90eXBlID09PSAnTnVtYmVyJykge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlWzBdO1xuICAgICAgICB9IGVsc2UgaWYgKHZhbHVlX3R5cGUgPT09ICdDb21wb3VuZElkZW50aWZpZXInIHx8IHZhbHVlX3R5cGUgPT09ICdJZGVudGlmaWVyJykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29udmVydElkZW50aWZpZXIycXVhbGlmaWVkQ29sdW1uKHZhbHVlKTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZV90eXBlID09PSAnQm9vbGVhbicpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyAnTG9naWMgZXJyb3IsIHVuaGFuZGxlZCBhcmcgdmFsdWUgdHlwZTonICsgdmFsdWVfdHlwZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGdldEFjdHVhbFRhYmxlTmFtZSh0YWJsZV9uYW1lX29yX2FsaWFzKSB7XG4gICAgICAgIGlmIChwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCh0aGlzLnRhYmxlX25hbWVfYnlfYWxpYXMsIHRhYmxlX25hbWVfb3JfYWxpYXMpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50YWJsZV9uYW1lX2J5X2FsaWFzW3RhYmxlX25hbWVfb3JfYWxpYXNdO1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucGFyZW50ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5nZXRBY3R1YWxUYWJsZU5hbWUodGFibGVfbmFtZV9vcl9hbGlhcyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGFibGVfbmFtZV9vcl9hbGlhcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcGFyYW0gaWRlbnRpZmllclxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gbmVlZF9xdW90ZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBjb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4oaWRlbnRpZmllciwgbmVlZF9xdW90ZSA9IHRydWUpIHtcbiAgICAgICAgbGV0IHZhbHVlcyA9IFtpZGVudGlmaWVyXS5mbGF0KCkubWFwKChpKSA9PiBpLnZhbHVlKTtcbiAgICAgICAgbGV0IHRhYmxlX25hbWVfb3JfYWxpYXMgPSB2YWx1ZXNbMF07XG5cbiAgICAgICAgLy8gRmlyc3QgaW5kZXggYWx3YXlzIGlzIHRhYmxlIG5hbWUgb3IgYWxpYXMsIGNoYW5nZSBpdCB0byBhY3R1YWwgdGFibGUgbmFtZS5cbiAgICAgICAgdmFsdWVzWzBdID0gdGhpcy5nZXRBY3R1YWxUYWJsZU5hbWUodGFibGVfbmFtZV9vcl9hbGlhcyk7XG5cbiAgICAgICAgbGV0IHJlcyA9IHZhbHVlcy5qb2luKCcuJyk7XG5cbiAgICAgICAgaWYgKG5lZWRfcXVvdGUpIHtcbiAgICAgICAgICAgIHJlcyA9IHF1b3RlKHJlcyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGNvbmRpdGlvblxuICogQHBhcmFtIHtzdHJpbmd9IG1zZ1xuICovXG5mdW5jdGlvbiBhc3NlcnQoY29uZGl0aW9uLCBtc2cpIHtcbiAgICBpZiAoIWNvbmRpdGlvbikge1xuICAgICAgICB0aHJvdyBtc2c7XG4gICAgfVxufVxuXG4vKipcbiAqIEBwYXJhbSBvYmpcbiAqIEBwYXJhbSBwcm9wZXJ0eV9uYW1lc1xuICogQHJldHVybiB7Ym9vbGVhbn1cbiAqL1xuZnVuY3Rpb24gcHJvcGVydHlFeGlzdHNJbk9iamVjdEFuZE5vdE51bGwob2JqLCAuLi5wcm9wZXJ0eV9uYW1lcykge1xuICAgIHJldHVybiBwcm9wZXJ0eV9uYW1lcy5yZWR1Y2UoKGNhcnJ5LCBwcm9wZXJ0eV9uYW1lKSA9PiBjYXJyeSB8fCAob2JqLmhhc093blByb3BlcnR5KHByb3BlcnR5X25hbWUpICYmIG9ialtwcm9wZXJ0eV9uYW1lXSAhPT0gbnVsbCksIGZhbHNlKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gdmFsdWVcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIGlzU3RyaW5nKHZhbHVlKSB7XG4gICAgcmV0dXJuICB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgU3RyaW5nO1xufVxuXG5mdW5jdGlvbiBjYXBpdGFsaXplRmlyc3RMZXR0ZXIoc3RyaW5nKSB7XG4gICAgcmV0dXJuIHN0cmluZy5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHN0cmluZy5zbGljZSgxKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gdmFsdWVcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gcXVvdGUodmFsdWUpIHtcbiAgICByZXR1cm4gXCInXCIgKyB2YWx1ZSArIFwiJ1wiO1xufVxuXG4vKipcbiAqIEBwYXJhbSB2YWx1ZVxuICogQHJldHVybnMge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gdW5xdW90ZSh2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bJ1wiXSsvZywgJycpO1xufVxuXG4vKipcbiAqIEBwYXJhbSBvYmpcbiAqIEByZXR1cm4ge3N0cmluZ31cbiAqL1xuZnVuY3Rpb24gZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChvYmopIHtcbiAgICBpZiAoT2JqZWN0LmtleXMob2JqKS5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgdGhyb3cgJ1RoZSBmdW5jdGlvbiBjYW4gb25seSBiZSBjYWxsZWQgb24gb2JqZWN0IHRoYXQgaGFzIG9uZSBrZXksIG9iamVjdDogJyArIEpTT04uc3RyaW5naWZ5KG9iaik7XG4gICAgfVxuXG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKG9iailbMF07XG59XG5cbi8qKlxuICogQHBhcmFtIG9ialxuICogQHJldHVybiB7Kn1cbiAqL1xuZnVuY3Rpb24gZ2V0TmVzdGVkVW5pcXVlVmFsdWVGcm9tT2JqZWN0KG9iaikge1xuICAgIHJldHVybiBvYmpbZ2V0TmVzdGVkVW5pcXVlS2V5RnJvbU9iamVjdChvYmopXTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gdmFsdWVcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkT3JOdWxsKHZhbHVlKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcgfHwgdmFsdWUgPT09IG51bGw7XG59XG5cbi8qKlxuICogQHBhcmFtIHN0clxuICogQHBhcmFtIHRhYl9jb3VudFxuICovXG5mdW5jdGlvbiBhZGRUYWJUb0V2ZXJ5TGluZShzdHIsIHRhYl9jb3VudCA9IDEpIHtcbiAgICBsZXQgc2VwYXJhdG9yID0gJ1xcbic7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRhYl9jb3VudDsgaSsrKSB7XG4gICAgICAgIHNlcGFyYXRvciA9IHNlcGFyYXRvciArICdcXHQnO1xuICAgIH1cblxuICAgIHJldHVybiBzdHIuc3BsaXQoJ1xcbicpLmpvaW4oc2VwYXJhdG9yKTtcbn1cblxuIiwiaW1wb3J0ICogYXMgd2FzbSBmcm9tIFwic3FscGFyc2VyLXJzLXdhc21cIjtcbmltcG9ydCB7Q29udmVydGVyfSBmcm9tIFwiLi9jb252ZXJ0ZXJcIjtcbmltcG9ydCAnLi9zdHlsZS5jc3MnO1xuXG4vLyBTaG93IG5vdGlmaWNhdGlvbiBtZXNzYWdlXG5mdW5jdGlvbiBzaG93Tm90aWZpY2F0aW9uKG1lc3NhZ2UsIHR5cGUgPSAnc3VjY2VzcycpIHtcbiAgICAvLyBSZW1vdmUgYW55IGV4aXN0aW5nIG5vdGlmaWNhdGlvbnNcbiAgICBjb25zdCBleGlzdGluZ05vdGlmID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1lc3NhZ2UtYm94Jyk7XG4gICAgaWYgKGV4aXN0aW5nTm90aWYpIHtcbiAgICAgICAgZXhpc3RpbmdOb3RpZi5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBub3RpZmljYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBub3RpZmljYXRpb24uY2xhc3NOYW1lID0gYG1lc3NhZ2UtYm94ICR7dHlwZX1gO1xuICAgIG5vdGlmaWNhdGlvbi5pbm5lckhUTUwgPSBgPHNwYW4+JHt0eXBlID09PSAnc3VjY2VzcycgPyAn4pyFJyA6ICfinYwnfTwvc3Bhbj48c3Bhbj4ke21lc3NhZ2V9PC9zcGFuPmA7XG5cbiAgICBjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmNvbnRlbnQtd3JhcHBlcicpO1xuICAgIHdyYXBwZXIuaW5zZXJ0QmVmb3JlKG5vdGlmaWNhdGlvbiwgd3JhcHBlci5maXJzdENoaWxkKTtcblxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBub3RpZmljYXRpb24uc3R5bGUuYW5pbWF0aW9uID0gJ2ZhZGVJblVwIDAuM3MgZWFzZS1vdXQgcmV2ZXJzZSc7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gbm90aWZpY2F0aW9uLnJlbW92ZSgpLCAzMDApO1xuICAgIH0sIDMwMDApO1xufVxuXG5sZXQgY29udmVydGVyID0gZnVuY3Rpb24gKCkge1xuICAgIGxldCBpbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiaW5wdXRcIikudmFsdWU7XG4gICAgbGV0IGNvbnZlcnRCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvbnZlcnQtYnV0dG9uXCIpO1xuXG4gICAgaWYgKGlucHV0LnRyaW0oKSA9PT0gJycpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignUGxlYXNlIGVudGVyIGEgU1FMIHF1ZXJ5JywgJ2Vycm9yJyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoaW5wdXQuc2xpY2UoLTEpID09PSAnOycpIHtcbiAgICAgICAgaW5wdXQgPSBpbnB1dC5zbGljZSgwLCAtMSk7XG4gICAgfVxuXG4gICAgbGV0IG91dHB1dF90ZXh0X2FyZWEgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm91dHB1dFwiKTtcblxuICAgIGlmICghaW5wdXQuc3RhcnRzV2l0aCgnc2VsZWN0JykgJiYgIWlucHV0LnN0YXJ0c1dpdGgoJ1NFTEVDVCcpKSB7XG4gICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSAnU1FMIG11c3Qgc3RhcnQgd2l0aCBzZWxlY3Qgb3IgU0VMRUNUJztcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignU1FMIHF1ZXJ5IG11c3Qgc3RhcnQgd2l0aCBTRUxFQ1QnLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIEFkZCBsb2FkaW5nIHN0YXRlXG4gICAgY29udmVydEJ1dHRvbi5jbGFzc0xpc3QuYWRkKCdpcy1sb2FkaW5nJyk7XG4gICAgY29udmVydEJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XG5cbiAgICAvLyBVc2Ugc2V0VGltZW91dCB0byBhbGxvdyBVSSB0byB1cGRhdGVcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGxldCBhc3QgPSB3YXNtLnBhcnNlX3NxbChcIi0tbXlzcWxcIiwgaW5wdXQpO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYXN0KTtcbiAgICAgICAgICAgIGlmIChhc3Quc3RhcnRzV2l0aCgnRXJyb3InKSkge1xuICAgICAgICAgICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSBhc3Q7XG4gICAgICAgICAgICAgICAgc2hvd05vdGlmaWNhdGlvbignRXJyb3IgcGFyc2luZyBTUUwgcXVlcnknLCAnZXJyb3InKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgb3V0cHV0X3RleHRfYXJlYS52YWx1ZSA9IChuZXcgQ29udmVydGVyKEpTT04ucGFyc2UoYXN0KVswXS5RdWVyeSkpLnJ1bigpO1xuICAgICAgICAgICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1N1Y2Nlc3NmdWxseSBjb252ZXJ0ZWQgdG8gTGFyYXZlbCBRdWVyeSBCdWlsZGVyIScsICdzdWNjZXNzJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGlucHV0KTtcbiAgICAgICAgICAgIG91dHB1dF90ZXh0X2FyZWEudmFsdWUgPSBlICsgJywgSSB3aWxsIGZpeCB0aGlzIGlzc3VlIGFzIHNvb24gYXMgcG9zc2libGUnO1xuICAgICAgICAgICAgc2hvd05vdGlmaWNhdGlvbignQ29udmVyc2lvbiBlcnJvciBvY2N1cnJlZCcsICdlcnJvcicpO1xuICAgICAgICAgICAgdGhyb3cgZTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIGNvbnZlcnRCdXR0b24uY2xhc3NMaXN0LnJlbW92ZSgnaXMtbG9hZGluZycpO1xuICAgICAgICAgICAgY29udmVydEJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfSwgMTAwKTtcbn1cblxuLy8gQ29weSB0byBjbGlwYm9hcmQgZnVuY3Rpb25hbGl0eVxuZnVuY3Rpb24gY29weVRvQ2xpcGJvYXJkKCkge1xuICAgIGNvbnN0IG91dHB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwib3V0cHV0XCIpLnZhbHVlO1xuICAgIGNvbnN0IGNvcHlCdXR0b24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktYnV0dG9uXCIpO1xuICAgIGNvbnN0IGNvcHlUZXh0ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjb3B5LXRleHRcIik7XG4gICAgY29uc3QgY29weUljb24gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvcHktaWNvblwiKTtcblxuICAgIGlmICghb3V0cHV0IHx8IG91dHB1dC50cmltKCkgPT09ICcnIHx8IG91dHB1dC5pbmNsdWRlcygnWW91ciBMYXJhdmVsIHF1ZXJ5IGJ1aWxkZXIgY29kZSB3aWxsIGFwcGVhciBoZXJlJykpIHtcbiAgICAgICAgc2hvd05vdGlmaWNhdGlvbignTm8gb3V0cHV0IHRvIGNvcHknLCAnZXJyb3InKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KG91dHB1dCkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgY29weUJ1dHRvbi5jbGFzc0xpc3QuYWRkKCdjb3BpZWQnKTtcbiAgICAgICAgY29weVRleHQudGV4dENvbnRlbnQgPSAnQ29waWVkISc7XG4gICAgICAgIGNvcHlJY29uLnRleHRDb250ZW50ID0gJ+Kckyc7XG5cbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICBjb3B5QnV0dG9uLmNsYXNzTGlzdC5yZW1vdmUoJ2NvcGllZCcpO1xuICAgICAgICAgICAgY29weVRleHQudGV4dENvbnRlbnQgPSAnQ29weSc7XG4gICAgICAgICAgICBjb3B5SWNvbi50ZXh0Q29udGVudCA9ICfwn5OLJztcbiAgICAgICAgfSwgMjAwMCk7XG4gICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ0ZhaWxlZCB0byBjb3B5IHRvIGNsaXBib2FyZCcsICdlcnJvcicpO1xuICAgIH0pO1xufVxuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsIChldmVudCkgPT4ge1xuICAgIGxldCB1cmxfc2VhcmNoX3BhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaCk7XG5cbiAgICBpZih1cmxfc2VhcmNoX3BhcmFtcy5oYXMoJ2Jhc2U2NHNxbCcpKSB7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcpLnZhbHVlID0gYXRvYih1cmxfc2VhcmNoX3BhcmFtcy5nZXQoJ2Jhc2U2NHNxbCcpKTtcbiAgICAgICAgY29udmVydGVyKCk7XG4gICAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjb252ZXJ0LWJ1dHRvbicpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgY29udmVydGVyKTtcblxuLy8gQWRkIEVudGVyIGtleSBzdXBwb3J0IChDdHJsL0NtZCArIEVudGVyIHRvIGNvbnZlcnQpXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5wdXQnKS5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24oZSkge1xuICAgIGlmICgoZS5jdHJsS2V5IHx8IGUubWV0YUtleSkgJiYgZS5rZXkgPT09ICdFbnRlcicpIHtcbiAgICAgICAgY29udmVydGVyKCk7XG4gICAgfVxufSk7XG5cbmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaGFyZS1idXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcbiAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpbnB1dCcpLnZhbHVlO1xuXG4gICAgaWYgKCFpbnB1dCB8fCBpbnB1dC50cmltKCkgPT09ICcnKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1BsZWFzZSBlbnRlciBhIFNRTCBxdWVyeSBmaXJzdCcsICdlcnJvcicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgbGV0IHNoYXJlX2xpbmsgPSB3aW5kb3cubG9jYXRpb24ub3JpZ2luICsgd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lICsgJz9iYXNlNjRzcWw9JyArIGJ0b2EoaW5wdXQpO1xuICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHNoYXJlX2xpbmspLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIHNob3dOb3RpZmljYXRpb24oJ1NoYXJlIGxpbmsgY29waWVkIHRvIGNsaXBib2FyZCEnLCAnc3VjY2VzcycpO1xuICAgIH0sIGZ1bmN0aW9uKCkge1xuICAgICAgICBzaG93Tm90aWZpY2F0aW9uKCdGYWlsZWQgdG8gY29weSBzaGFyZSBsaW5rJywgJ2Vycm9yJyk7XG4gICAgfSk7XG59KTtcblxuLy8gQWRkIGNvcHkgYnV0dG9uIGV2ZW50IGxpc3RlbmVyXG5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29weS1idXR0b24nKS5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGNvcHlUb0NsaXBib2FyZCk7XG4iXSwibmFtZXMiOlsiQ29udmVydGVyIiwiY29uc3RydWN0b3IiLCJhc3QiLCJwYXJlbnQiLCJ0YWJsZV9uYW1lX2J5X2FsaWFzIiwicnVuIiwibmVlZF9hcHBlbmRfZ2V0X3N1ZmZpeCIsInNlY3Rpb25zIiwiZnJvbV9pdGVtIiwiYm9keSIsIlNlbGVjdCIsImZyb20iLCJwcm9wZXJ0eUV4aXN0c0luT2JqZWN0QW5kTm90TnVsbCIsInJlbGF0aW9uIiwicHVzaCIsInJlc29sdmVNYWluVGFibGVTZWN0aW9uIiwicmVzb2x2ZUZyb21TdWJTZWN0aW9uIiwiam9pbl9zZWN0aW9uIiwiaGFzSm9pblNlY3Rpb24iLCJyZXNvbHZlSm9pblNlY3Rpb24iLCJzbGljZSIsImxlbmd0aCIsImNvbmNhdCIsInJlc29sdmVDcm9zc0pvaW5TZWN0aW9uIiwicmVzb2x2ZVNlbGVjdFNlY3Rpb24iLCJyZXNvbHZlV2hlcmVTZWN0aW9uIiwic2VsZWN0aW9uIiwiZ3JvdXBfYnkiLCJyZXNvbHZlR3JvdXBCeVNlY3Rpb24iLCJyZXNvbHZlSGF2aW5nU2VjdGlvbiIsIm9yZGVyX2J5IiwicmVzb2x2ZU9yZGVyQnlTZWN0aW9uIiwibGltaXQiLCJWYWx1ZSIsIk51bWJlciIsIm9mZnNldCIsInZhbHVlIiwiam9pbiIsInJlc29sdmVUYWJsZU5hbWVGcm9tUmVsYXRpb25Ob2RlIiwicmVsYXRpb25fbm9kZSIsInRhYmxlX25hbWUiLCJUYWJsZSIsIm5hbWUiLCJhbGlhcyIsInF1b3RlIiwicHJlZml4IiwiYWRkVGFiVG9FdmVyeUxpbmUiLCJEZXJpdmVkIiwic3VicXVlcnkiLCJyZXBsYWNlIiwic2VsZWN0aW9uX25vZGUiLCJjb25kaXRpb25fdHlwZSIsImdldE5lc3RlZFVuaXF1ZUtleUZyb21PYmplY3QiLCJjb25kaXRpb24iLCJnZXROZXN0ZWRVbmlxdWVWYWx1ZUZyb21PYmplY3QiLCJwcmVwYXJlQ29uZGl0aW9ucyIsIm9wIiwibWV0aG9kX25hbWUiLCJjb25kaXRpb25zIiwiYWRkUHJlZml4Mk1ldGhvZHMiLCJjb252ZXJ0SWRlbnRpZmllcjJxdWFsaWZpZWRDb2x1bW4iLCJjb2x1bW4iLCJleHByIiwibGlzdCIsIm1hcCIsImkiLCJyZXNvbHZlVmFsdWUiLCJuZWdhdGVkIiwibGVmdF9jb25kaXRpb25fdHlwZSIsImxlZnQiLCJsZWZ0X2NvbmRpdGlvbiIsInJpZ2h0X2NvbmRpdGlvbl90eXBlIiwicmlnaHQiLCJyaWdodF9jb25kaXRpb24iLCJpbmNsdWRlcyIsIlN1YnF1ZXJ5IiwicGFyc2VGdW5jdGlvbk5vZGUiLCJGdW5jdGlvbiIsInRyYW5zZm9ybUJpbmFyeU9wIiwibG93IiwiaGlnaCIsIm9wZXJhdG9yX2J5X29wIiwidG9Mb3dlckNhc2UiLCJjYXBpdGFsaXplRmlyc3RMZXR0ZXIiLCJyZXMiLCJzZWxlY3RfaXRlbSIsInByb2plY3Rpb24iLCJFeHByV2l0aEFsaWFzIiwicmVzb2x2ZVNlbGVjdFNlY3Rpb25JdGVtIiwiVW5uYW1lZEV4cHIiLCJnZXRBY3R1YWxUYWJsZU5hbWUiLCJRdWFsaWZpZWRXaWxkY2FyZCIsIk9iamVjdCIsImtleXMiLCJhc3NlcnQiLCJpc1VuZGVmaW5lZE9yTnVsbCIsIml0ZW0iLCJmdW5jdGlvbl9ub2RlIiwibmVlZF9xdW90ZSIsImZ1bmN0aW9uX25hbWUiLCJhcmdzIiwiYXJnX2NvdW50IiwiYXJnIiwiVW5uYW1lZCIsIkV4cHIiLCJJZGVudGlmaWVyIiwiQ29tcG91bmRJZGVudGlmaWVyIiwiYXJnX2NvbHVtbiIsIk5lc3RlZCIsImRpc3RpbmN0IiwicGFyc2VCaW5hcnlPcE5vZGUiLCJCaW5hcnlPcCIsImpvaW5zIiwicGFyc2VCaW5hcnlPcFBhcnRpYWwiLCJsZWZ0X29yX3JpZ2h0IiwiYmluYXJ5X29wIiwic2VwYXJhdG9yIiwicHJlcGFyZUpvaW5zIiwiam9pbl9vcGVyYXRvcl90eXBlIiwiam9pbl9vcGVyYXRvciIsImpvaW5fbWV0aG9kIiwiT24iLCJzdWJfcXVlcnlfc3FsIiwic3ViX3F1ZXJ5X2FsaWFzIiwiam9pbmVkX3RhYmxlIiwiZnJvbV9pdGVtcyIsImNyb3NzX2pvaW5fc2VjdGlvbnMiLCJjcm9zc19qb2luX3N0ciIsImdyb3VwX2J5X2NvbHVtbnMiLCJncm91cF9ieV9pdGVtIiwiaGF2aW5nIiwib3JkZXJfYnlzIiwib3JkZXJfYnlfaXRlbSIsImFzYyIsInZhbHVlTm9kZSIsImlzU3RyaW5nIiwidmFsdWVfdHlwZSIsInRhYmxlX25hbWVfb3JfYWxpYXMiLCJpZGVudGlmaWVyIiwidmFsdWVzIiwiZmxhdCIsIm1zZyIsIm9iaiIsInByb3BlcnR5X25hbWVzIiwicmVkdWNlIiwiY2FycnkiLCJwcm9wZXJ0eV9uYW1lIiwiaGFzT3duUHJvcGVydHkiLCJTdHJpbmciLCJzdHJpbmciLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInVucXVvdGUiLCJKU09OIiwic3RyaW5naWZ5Iiwic3RyIiwidGFiX2NvdW50Iiwic3BsaXQiLCJ3YXNtIiwic2hvd05vdGlmaWNhdGlvbiIsIm1lc3NhZ2UiLCJ0eXBlIiwiZXhpc3RpbmdOb3RpZiIsImRvY3VtZW50IiwicXVlcnlTZWxlY3RvciIsInJlbW92ZSIsIm5vdGlmaWNhdGlvbiIsImNyZWF0ZUVsZW1lbnQiLCJjbGFzc05hbWUiLCJpbm5lckhUTUwiLCJ3cmFwcGVyIiwiaW5zZXJ0QmVmb3JlIiwiZmlyc3RDaGlsZCIsInNldFRpbWVvdXQiLCJzdHlsZSIsImFuaW1hdGlvbiIsImNvbnZlcnRlciIsImlucHV0IiwiZ2V0RWxlbWVudEJ5SWQiLCJjb252ZXJ0QnV0dG9uIiwidHJpbSIsIm91dHB1dF90ZXh0X2FyZWEiLCJzdGFydHNXaXRoIiwiY2xhc3NMaXN0IiwiYWRkIiwiZGlzYWJsZWQiLCJwYXJzZV9zcWwiLCJjb25zb2xlIiwibG9nIiwicGFyc2UiLCJRdWVyeSIsImUiLCJjb3B5VG9DbGlwYm9hcmQiLCJvdXRwdXQiLCJjb3B5QnV0dG9uIiwiY29weVRleHQiLCJjb3B5SWNvbiIsIm5hdmlnYXRvciIsImNsaXBib2FyZCIsIndyaXRlVGV4dCIsInRoZW4iLCJ0ZXh0Q29udGVudCIsIndpbmRvdyIsImFkZEV2ZW50TGlzdGVuZXIiLCJldmVudCIsInVybF9zZWFyY2hfcGFyYW1zIiwiVVJMU2VhcmNoUGFyYW1zIiwibG9jYXRpb24iLCJzZWFyY2giLCJoYXMiLCJhdG9iIiwiZ2V0IiwiY3RybEtleSIsIm1ldGFLZXkiLCJrZXkiLCJzaGFyZV9saW5rIiwib3JpZ2luIiwicGF0aG5hbWUiLCJidG9hIl0sInNvdXJjZVJvb3QiOiIifQ==