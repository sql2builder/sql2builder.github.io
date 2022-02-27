import * as wasm from "sqlparser-rs-wasm";
import {Converter} from "./converter";

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

        if (ast.startsWith('Error')) {
            output_text_area.value = ast;
        } else {
            console.log(ast);
            output_text_area.value = (new Converter(JSON.parse(ast)[0].Query)).run();
        }
    } catch (e) {
        output_text_area.value = e;
        throw e;
    }
});
