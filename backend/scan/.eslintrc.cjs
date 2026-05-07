module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  extends: ["eslint:recommended"],
  rules: {
    // P1-4 follow-up: structured logging via `_common/logger.js` is now
    // wired through every module, the registry, and the WHOIS retry path.
    // Tech-stack-worker.js intentionally uses process.send() instead of
    // logger because it is a child process without stdout pipe ownership.
    "no-console": "error",
    // P1-4: re-enable the recommended unused-vars & undef checks; allow
    // intentionally-ignored args/catches via the leading-underscore
    // convention so `(_req, _res)` express signatures stay readable.
    "no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "no-undef": "error",
    "no-prototype-builtins": "off",
  },
  ignorePatterns: ["coverage/", "node_modules/"],
};
