// Ensure middleware loads in NODE mode (avoids `module.exports` branch under ESM Jest).
process.env.PLATFORM = process.env.PLATFORM || 'NODE';
