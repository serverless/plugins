const fs = require('fs');

let plugins = fs.readFileSync('./plugins.json').toString();

// helper function
const countPluginKey = (plugins, key) => plugins
  .reduce((previous, plugin) => !!plugin[key] ? previous += 1 : previous, 0);

describe('plugins', () => {
  it('should be valid JSON', () => {
    expect(() => {JSON.parse(plugins)}).not.toThrow();
  });

  it('should have all required keys', () => {
    plugins = JSON.parse(plugins);
    const pluginsCount = plugins.length;

    const nameCount = countPluginKey(plugins, 'name');
    const descriptionCount = countPluginKey(plugins, 'description');
    const githubUrlCount = countPluginKey(plugins, 'githubUrl');

    expect(nameCount).toBe(pluginsCount);
    expect(descriptionCount).toBe(pluginsCount);
    expect(githubUrlCount).toBe(pluginsCount);
  });
});
