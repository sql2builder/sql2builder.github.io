import * as wasm from "sqlparser-rs-wasm";
import {Converter} from "./converter";
import './style.css';

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
            let ast = wasm.parse_sql("--mysql", input);
            console.log(ast);
            if (ast.startsWith('Error')) {
                output_text_area.value = ast;
                showNotification('Error parsing SQL query', 'error');
            } else {
                output_text_area.value = (new Converter(JSON.parse(ast)[0].Query)).run();
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
}

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

    navigator.clipboard.writeText(output).then(function() {
        copyButton.classList.add('copied');
        copyText.textContent = 'Copied!';
        copyIcon.textContent = '✓';

        setTimeout(() => {
            copyButton.classList.remove('copied');
            copyText.textContent = 'Copy';
            copyIcon.textContent = '📋';
        }, 2000);
    }, function() {
        showNotification('Failed to copy to clipboard', 'error');
    });
}

window.addEventListener('load', (event) => {
    let url_search_params = new URLSearchParams(window.location.search);

    if(url_search_params.has('base64sql')) {
        document.getElementById('input').value = atob(url_search_params.get('base64sql'));
        converter();
    }
});

document.getElementById('convert-button').addEventListener('click', converter);

// Add Enter key support (Ctrl/Cmd + Enter to convert)
document.getElementById('input').addEventListener('keydown', function(e) {
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
    navigator.clipboard.writeText(share_link).then(function() {
        showNotification('Share link copied to clipboard!', 'success');
    }, function() {
        showNotification('Failed to copy share link', 'error');
    });
});

// Add copy button event listener
document.getElementById('copy-button').addEventListener('click', copyToClipboard);
