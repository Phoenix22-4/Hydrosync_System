const replace = require('replace-in-file');
const options = {
  files: ['src/**/*.tsx'],
  from: /<Droplets\s+className="([^"]+)"\s*\/>/g,
  to: '<img src="/icon.png" alt="HydroSync Icon" className="$1" />',
};
try {
  const results = replace.sync(options);
  console.log('Replacement results:', results.filter(r => r.hasChanged).map(r => r.file));
} catch (error) {
  console.error('Error occurred:', error);
}
