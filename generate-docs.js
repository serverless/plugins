/**
 * This example generated adds content to the repos README.md file
 */
const fs = require('fs')
const url = require('url')
const path = require('path')
const markdownMagic = require('markdown-magic')

const commonPartRe = /(?:(?:^|-)serverless-plugin(?:-|$))|(?:(?:^|-)serverless(?:-|$))/;

const config = {
  transforms: {
    /*
    In readme.md the below comment block adds the list to the readme
    <!-- AUTO-GENERATED-CONTENT:START (GENERATE_SERVERLESS_PLUGIN_TABLE)-->
      plugin list will be generated here
    <!-- AUTO-GENERATED-CONTENT:END -->
     */
    GENERATE_SERVERLESS_PLUGIN_TABLE: function(content, options) {
      const commandsFile = path.join(__dirname, 'plugins.json')
      const plugins = JSON.parse(fs.readFileSync(commandsFile, 'utf8'))
      let md =  '| Plugin | Stats |\n'
       md += '|:---------------------------|:-----------:|\n'

      plugins.sort(function (a, b) {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        return aName.replace(commonPartRe, '').localeCompare(bName.replace(commonPartRe, '')) ||
          aName.localeCompare(bName);
      }).forEach(function(data) {
          const userName = username(data.githubUrl)
          const profileURL = `http://github.com/${userName}`
          const repoName = data.githubUrl.split('.com/')[1];
          md += `| **[${formatPluginName(data.name)} - \`${data.name.toLowerCase()}\`](${data.githubUrl})** <br/> by [${userName}](${profileURL}) <br/>`
          md += ` ${data.description} | `
          md += `![Github Stars](https://img.shields.io/github/stars/${repoName}.svg?label=Stars&style=for-the-badge) <br/> ![NPM Downloads](https://img.shields.io/npm/dt/${data.name}.svg?label=Downloads&style=for-the-badge)|\n`
      });
      return md.replace(/^\s+|\s+$/g, '')
    }
  }
}

function username(repo) {
  if (!repo) {
    return null;
  }

  var o = url.parse(repo);
  var path = o.path;

  if (path.length && path.charAt(0) === '/') {
    path = path.slice(1);
  }

  path = path.split('/')[0];
  return path;
}

function formatPluginName (string) {
  return toTitleCase(string.toLowerCase().replace(commonPartRe, '').replace(/-/g, ' '))
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  )
}

const markdownPath = path.join(__dirname, 'README.md')
// const markdownPath = path.join(__dirname, '..', 'test/fixtures/test.md')
markdownMagic(markdownPath, config, function() {
  console.log('Docs updated!')
})