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
    "no-console": "off",
    "no-unused-vars": "off",
    "no-undef": "off",
    "no-prototype-builtins": "off",
  },
  ignorePatterns: ["coverage/", "node_modules/"],
};
