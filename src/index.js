import * as wasm from "sqlparser-rs-wasm";
import {Converter} from "./converter";

let converter = function () {
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
        if (ast.startsWith('Error')) {
            output_text_area.value = ast;
        } else {
            output_text_area.value = (new Converter(JSON.parse(ast)[0].Query)).run();
        }
    } catch (e) {
        console.log(input);
        output_text_area.value = e + ', I will fix this issue as soon as possible';

        throw e;
    }
}

window.addEventListener('load', (event) => {
    let url_search_params = new URLSearchParams(window.location.search);

    if(url_search_params.has('base64sql')) {
        document.getElementById('input').value = atob(url_search_params.get('base64sql'));
        converter();
    }
});

document.getElementById('convert-button').addEventListener('click', converter);
document.getElementById('share-button').addEventListener('click', function () {
    let share_link = window.location.origin + '?base64sql=' + btoa(document.getElementById('input').value);
    navigator.clipboard.writeText(share_link).then(function() {
        alert('Share link copied.');
    }, function() {
        alert('Copy failed.');
    });
});
