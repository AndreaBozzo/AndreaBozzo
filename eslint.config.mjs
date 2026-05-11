import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: [
            'assets/**/*.min.js',
            'assets/wasm/**',
            'blog/themes/**',
            'blog/public/**',
            '_site/**'
        ]
    },
    js.configs.recommended,
    {
        files: ['assets/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: globals.browser
        }
    },
    {
        files: ['sw.js'],
        languageOptions: {
            ecmaVersion: 2024,
            globals: globals.serviceworker
        }
    }
];
