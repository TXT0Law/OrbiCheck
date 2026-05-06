// The scan service runs as a Node.js Express service; this fixture exists to
// preserve test environment defaults that may be needed by future modules.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
