/**
 * This example generated adds content to the repos README.md file
 */
const fs = require('fs')
const path = require('path')
const markdownSteriods = require('markdown-steroids')

const config = {
  commands: {
    /*
    In readme.md the below comment block adds the list to the readme
    <!-- AUTO-GENERATED-CONTENT:START (GENERATE_PLUGIN_LIST)-->
      plugin list will be generated here
    <!-- AUTO-GENERATED-CONTENT:END -->
     */
    GENERATE_PLUGIN_LIST: function(content, options) {
      const commandsFile = path.join(__dirname, 'plugins.json')
      const plugins = JSON.parse(fs.readFileSync(commandsFile, 'utf8'))
      let md =  '| Plugin name and description | link  |\n'
          md += '|:--------------------------- |:-----:|\n'
      plugins.plugins.sort(function (a, b) {
          return a.name < b.name ? -1 : 1;
      }).forEach(function(data) {
          md += `| \`${formatPluginName(data.name)}\` - ${data.description} | [link](${data.githubUrl}) |\n`
      });
      return md.replace(/^\s+|\s+$/g, '')
    }
  }
}

function formatPluginName (string) {
  return toTitleCase(string.replace(/-/g, ' '))
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  )
}

const markdownPath = path.join(__dirname, 'README.md')
// const markdownPath = path.join(__dirname, '..', 'test/fixtures/test.md')
markdownSteriods(markdownPath, config)