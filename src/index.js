import * as wasm from "sqlparser-rs-wasm";
import {Converter} from "./converter";
import * as Sentry from "@sentry/browser";
import { BrowserTracing } from "@sentry/tracing";

Sentry.init({
    dsn: "https://1130fb45d5b944bc83e0bf90a7d46182@o1161856.ingest.sentry.io/6248410",
    integrations: [new BrowserTracing()],

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
    allowUrls: ['https://sql2builder.github.io/']
});

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
            output_text_area.value = (new Converter(JSON.parse(ast)[0].Query)).run();
        }
    } catch (e) {
        console.log(input);
        output_text_area.value = e + ', I will fix this issue as soon as possible';
        
        throw e;
    }
});
