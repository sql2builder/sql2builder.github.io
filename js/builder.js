class Meta {
    constructor(name, args = []) {
        this.name = name;
        this.args = args;
    }
}

class Generator {
    constructor(class_name, args = []) {
        this.class_name = class_name;
        this.args = args;
        this.functions = [];
    }

    addFunction(name, args = []) {
        this.functions.push(new Meta(name, Array.isArray(args) ? args : [args]));
    }

    isStatic() {
        return this.class_name.substring(0, 1) != '$';
    }

    generate(tab_count = 1, semicolon = true) {
        if (this.functions.length == 0) {
            throw Error('No functions');
        }

        let sections = [];

        for (let i = 0; i < this.functions.length; i++) {
            let func = this.functions[i];
            let args = [];

            if (func.args) {
                args = this.generateArgs(func.args);
            }

            sections.push(`${func.name}(${args.join(',')})`);
        }

        let space = '';

        for (let i = 0; i < tab_count * 4; i++) {
            space += ' ';
        }

        return `${this.class_name}${this.isStatic() ? '::' : '->'}${sections.join('\n' + space + '->')}${semicolon ? ';' : ''}`;

    }

    generateArgs(args) {
        let res = [];

        for (let i = 0; i < args.length; i++) {
            let arg = args[i];

            if (typeof arg === 'number' || arg === true || arg === false || (typeof arg == 'string' && arg.startsWith('function'))) {
                res.push(arg);
            } else if (Array.isArray(arg)) {
                res.push(`[${this.generateArgs(arg).join(',')}]`)
            } else if (arg instanceof Generator) {
                res.push(arg.generate(1, false));
            } else {
                res.push(`'${arg}'`);
            }
        }

        return res;
    }
}

class Builder {
    constructor(input) {
        this.input = input;
        this.generator = new Generator('DB');
        this.alias_table_map = {};
    }

    source() {
        if (this.input.source.alias != null) {
            this.alias_table_map[this.input.source.alias.value] = this.input.source.name.value;
        }

        this.generator.addFunction('table', this.input.source.name.value);
    }

    joins() {
        for (let join of this.input.joins) {
            let conditions = join.conditions;
            let right_table = join.right.name.value;
            let func_name = `${join.side != null ? join.side.toLowerCase() : ''}Join`;

            if (join.right.alias != null) {
                this.alias_table_map[join.right.alias.value] = right_table;
            }

            if (this.isOp(conditions.left) && this.isOp(conditions.right)) {
                let left = conditions;
                let join_generator = new Generator('$join');

                this.where(join_generator, left);

                while (!this.isLiteralValue(left.left)) {
                    left = left.left;
                }

                join_generator.functions.shift();
                join_generator.functions.unshift(new Meta('on', [
                    this.parseQualfiedIdFromLiteralValue(left.right),
                    left.operation,
                    this.parseQualfiedIdFromLiteralValue(left.left),
                ]));

                this.generator.addFunction(func_name, [
                    right_table,
                    `function($join) {
                        ${join_generator.generate(7)}
                    }`
                ]);
            } else {
                this.generator.addFunction(func_name, [
                    right_table,
                    this.parseQualfiedIdFromLiteralValue(conditions.right),
                    conditions.operation,
                    this.parseQualfiedIdFromLiteralValue(conditions.left)]);
            }
        }
    }

    select() {
        if (this.input.fields.length == 1 && this.input.fields[0].constructor.name == 'Star') {
            console.log('star');
            return;
        }

        let args = [];

        for (const field of this.input.fields) {
            if (this.isLiteralValue(field.field)) {
                args.push(this.parseQualfiedIdFromLiteralValue(field.field));
            } else if (field.field.constructor.name == 'FunctionValue') {
                let value = `${field.field.name}(${field.field.arguments.value.map(v => this.parseQualfiedIdFromLiteralValue(v)).join('')})`;

                if (field.name !== null) {
                    value += ' AS ' + field.name.value;
                }

                let raw_generator = new Generator('DB');
                raw_generator.addFunction('raw', value);

                args.push(raw_generator);
            }
        }

        if (args.length > 0) {
            this.generator.addFunction('select', args);
        }
    }

    where(generator, left) {
        if (left == null) {
            return;
        }

        let funcs = [];

        while (!this.isLiteralValue(left.left)) {
            if (this.isOp(left.right.left) && this.isOp(left.right.right)) {
                let where_closure_generator = new Generator('$query');
                this.where(where_closure_generator, left.right);

                generator.addFunction(this.formatFuncName(left.operation, 'where'), [
                    `function($query) {
                        ${where_closure_generator.generate(7)}
            }`
                ]);
            } else {
                funcs.push(this.parseWhere(left.right, left.operation));
            }

            left = left.left;
        }

        funcs.push(this.parseWhere(left));

        for (const func of funcs.reverse()) {
            generator.addFunction(func.name, func.args);
        }
    }

    orderBy() {
        if (this.input.order !== null) {
            for (const order of this.input.order.orderings) {
                this.generator.addFunction('orderBy', [
                    this.parseQualfiedIdFromLiteralValue(order.value),
                    order.direction,
                ]);
            }
        }
    }

    groupBy() {
        if (this.input.group != null) {
            this.generator.addFunction('groupBy', ...this.input.group.fields.map(f => this.parseQualfiedIdFromLiteralValue(f)));

            if (this.input.group.having != null) {
                this.generator.addFunction('having', [
                    this.parseQualfiedIdFromLiteralValue(this.input.group.having.conditions.left),
                    this.input.group.having.conditions.operation,
                    this.input.group.having.conditions.right.value,
                ]);
            }
        }
    }

    parseWhere(op, pre_operation = null) {
        let func_name = '';
        let args = [this.parseQualfiedIdFromLiteralValue(op.left)];

        switch (op.operation) {
            case '=':
                func_name = 'where';
                args.push(op.right.value);
                break;
            case 'IS':
                if (op.right.value == null) {
                    func_name = 'whereNull';
                } else {
                    func_name = 'where';
                    args.push(op.right.value);
                }

                break;
            case 'IS NOT':
                if (op.right.value == null) {
                    func_name = 'whereNotNull'
                } else {
                    func_name = 'where';
                    args.push(op.right.value);
                }

                break;
            case 'IN':
                func_name = 'whereIn';
                args.push(op.right.value.map(v => v.value));

                break;
            case '<':
            case '!=':
            case '<>':
                func_name = 'where';
                args.push(op.operation);
                args.push(op.right.value);
                break;
            default:
                throw new Error(`Operator ${op.operation} not supported.`)
        }

        return new Meta(this.formatFuncName(pre_operation, func_name), args);
    }

    isLiteralValue(obj) {
        return obj !== null && obj.constructor.name == 'LiteralValue';
    }

    isOp(obj) {
        return obj != null && obj.constructor.name == 'Op';
    }

    formatFuncName(operation, name) {
        let prefix = (operation == null || operation == 'AND') ? '' : 'or';

        return prefix == '' ? name : prefix + name[0].toUpperCase() + name.slice(1);
    }

    parseQualfiedIdFromLiteralValue(literal) {
        let qualfied_id = '';

        if (literal.nested == false) {
            qualfied_id = literal.value;
        } else {
            qualfied_id = `${this.alias_table_map[literal.values[0]]}.${literal.values[1]}`;
        }

        return qualfied_id;
    }

    convert() {
        this.source();
        this.joins();
        this.where(this.generator, this.input.where !== null ? this.input.where.conditions : null)
        this.select();
        this.orderBy();
        this.groupBy();

        this.generator.addFunction('get');

        return this.generator.generate();
    }
}


