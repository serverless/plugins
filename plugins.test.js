const fs = require('fs');

const plugins = fs.readFileSync('./plugins.json').toString();

// helper function
const countPluginKey = (plugins, key) => plugins
  .reduce((previous, plugin) => !!plugin[key] ? previous += 1 : previous, 0);

describe('plugins', () => {
  it('should be valid JSON', () => {
    expect(() => {JSON.parse(plugins)}).not.toThrow();
  });

  it('should have all required keys', () => {
    const parsed = JSON.parse(plugins);
    const pluginsCount = parsed.length;

    const nameCount = countPluginKey(parsed, 'name');
    const descriptionCount = countPluginKey(parsed, 'description');
    const githubUrlCount = countPluginKey(parsed, 'githubUrl');

    expect(nameCount).toBe(pluginsCount);
    expect(descriptionCount).toBe(pluginsCount);
    expect(githubUrlCount).toBe(pluginsCount);
  });

  it('should be unique', () => {
    const parsed = JSON.parse(plugins);
    const pluginsCount = parsed.length;

    // create an array only containing the plugin names
    const pluginNames = parsed.map((plugin) => plugin.name);

    const uniquePlugins = [];
    pluginNames.forEach((plugin) => {
      if (uniquePlugins.indexOf(plugin) === -1) uniquePlugins.push(plugin)
    });

    const uniquePluginsCount = uniquePlugins.length;

    expect(pluginsCount).toBe(uniquePluginsCount);
  });
});
