import fs from 'fs';
import gitUrlParse from 'git-url-parse';
import path from 'path';
import {
  createAlgoliaItem,
  createWebflowItem,
  deleteAlgoliaItem,
  deleteWebflowItem,
  findPluginByName,
  formatTitle,
  getNpmDownloads,
  getReadmeContent,
  getRepoInfo,
  listAlgoliaItems,
  listWebflowCollectionItems,
  sleep,
  updateAlgoliaItem,
  updateWebflowItem,
} from './utils.js';

// Function to read file
function getGithubPluginsList() {
  const filePath = path.resolve('plugins.json');
  const pluginsData = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(pluginsData);
}

const createdPlugins = [];
const updatedPlugins = [];
const deletedPlugins = [];
const failedPlugins = [];

const BATCH_SIZE = 10; // Adjust the batch size as needed
const DELAY_MS = 1000; // Delay between batches to avoid rate limits

/**
 * Processes a single GitHub plugin, syncing it with Webflow and Algolia.
 * @param {Object} githubPlugin - The plugin data from GitHub.
 * @param {Array} webflowPlugins - The list of plugins from Webflow.
 * @param {Set} webflowPluginIds - The set of Webflow plugin IDs for quick lookup.
 */
const processPlugin = async (
  githubPlugin,
  webflowPlugins,
  webflowPluginIds,
) => {
  try {
    // Find the corresponding plugin in Webflow by name
    const webflowPlugin = findPluginByName(webflowPlugins, githubPlugin.name);

    // Destructure necessary fields from the GitHub plugin
    const { name, description, githubUrl, status } = githubPlugin;

    // Parse GitHub URL to get source, owner, and repository name
    const { source, owner, name: repo } = gitUrlParse(githubUrl) || {};

    // Generate a slug from the GitHub URL
    const slug = path.basename(githubPlugin.githubUrl);

    // Fetch repository info, npm downloads, and README content concurrently
    const [repoInfo, npmDownloads, readmeContent] = await Promise.all([
      getRepoInfo({ owner, repo, source }),
      getNpmDownloads({ packageName: name, repoName: repo }),
      getReadmeContent({ owner, repo, source }),
    ]);

    // Destructure repository info
    const { githubStars, authorAvatar, authorLink, authorName } =
      repoInfo || {};

    // Get README content
    const { content } = readmeContent || {};

    // If no README content is found, log the failure and skip processing
    if (!content) {
      console.log(`No README content found for ${name}`);
      failedPlugins.push({
        name: githubPlugin.name,
        reason: 'No README content found',
      });
      return;
    }

    // Prepare field data for Webflow
    const fieldData = {
      name,
      title: formatTitle(name),
      slug,
      description,
      github: githubUrl,
      content,
      'npm-downloads': npmDownloads || 0,
      'github-stars': githubStars || 0,
      'author-link': authorLink,
      'author-name': authorName,
      'author-avatar': authorAvatar,
      active: status && status === 'active',
    };

    // Prepare item data for Algolia
    const algoliaItem = {
      objectID: slug,
      name,
      description,
      githubUrl,
      npmDownloads: npmDownloads || 0,
      githubStars: githubStars || 0,
      authorLink,
      authorName,
      authorAvatar,
    };

    if (webflowPlugin) {
      // Update the existing item in Webflow and Algolia
      console.log('UPDATING WEBFLOW ITEM');
      await updateWebflowItem(
        process.env.WEBFLOW_PLUGINS_COLLECTION_ID,
        webflowPlugin.id,
        fieldData,
      );
      await updateAlgoliaItem(algoliaItem);
      updatedPlugins.push(githubPlugin.name);
    } else {
      // Create a new item in Webflow and Algolia
      console.log('CREATING WEBFLOW ITEM');
      await createWebflowItem(
        process.env.WEBFLOW_PLUGINS_COLLECTION_ID,
        fieldData,
      );
      await createAlgoliaItem(algoliaItem);
      createdPlugins.push(githubPlugin.name);
    }

    // Remove the processed plugin ID from the set
    webflowPluginIds.delete(githubPlugin.id);
  } catch (err) {
    // Log the error and add the plugin to the failed plugins list
    console.error(`Failed to process ${githubPlugin.name}`, err);
    failedPlugins.push({
      name: githubPlugin.name,
      reason: `Webflow or Algolia error: ${err.message}`,
    });
  }
};
(async () => {
  try {
    const githubPlugins = getGithubPluginsList();

    console.log(`Found ${githubPlugins.length} Github Plugins`);

    const algoliaPlugins = await listAlgoliaItems();

    console.log(`Found ${algoliaPlugins.length} Algolia Plugins`);

    const webflowPlugins = await listWebflowCollectionItems(
      process.env.WEBFLOW_PLUGINS_COLLECTION_ID,
    );

    console.log(`Found ${webflowPlugins.length} Webflow Plugins`);

    const webflowPluginIds = new Set(
      webflowPlugins.map((plugin) => plugin.name),
    );

    for (let i = 0; i < githubPlugins.length; i += BATCH_SIZE) {
      const batch = githubPlugins.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((githubPlugin) =>
          processPlugin(githubPlugin, webflowPlugins, webflowPluginIds),
        ),
      );
      // Delay between batches to avoid rate limits
      if (i + BATCH_SIZE < githubPlugins.length) {
        await sleep(DELAY_MS);
      }
    }

    for (const webflowPlugin of webflowPlugins) {
      if (!findPluginByName(githubPlugins, webflowPlugin.name)) {
        console.log('DELETING WEBFLOW ITEM');
        await deleteWebflowItem(
          process.env.WEBFLOW_PLUGINS_COLLECTION_ID,
          webflowPlugin._id,
        );
        await deleteAlgoliaItem(webflowPlugin.name);
        deletedPlugins.push(webflowPlugin.name);
      }
    }
    // for (const aloglia of webflowPlugins) {
    //   if (!findPluginByName(githubPlugins, webflowPlugin.name)) {
    //     console.log('DELETING WEBFLOW ITEM');
    //     await deleteWebflowItem(
    //       process.env.WEBFLOW_PLUGINS_COLLECTION_ID,
    //       webflowPlugin._id,
    //     );
    //     await deleteAlgoliaItem(webflowPlugin.name);
    //     deletedPlugins.push(webflowPlugin.name);
    //   }
    // }

    console.log('Sync process completed.');
    console.log(`Created plugins: ${createdPlugins.length}`);
    console.log(`Updated plugins: ${updatedPlugins.length}`);
    console.log(`Deleted plugins: ${deletedPlugins.length}`);
    console.log(`Failed plugins: ${failedPlugins.length}`);
    if (createdPlugins.length) {
      console.log('Created plugins:', createdPlugins.join(', '));
    }
    if (updatedPlugins.length) {
      console.log('Updated plugins:', updatedPlugins.join(', '));
    }
    if (deletedPlugins.length) {
      console.log('Deleted plugins:', deletedPlugins.join(', '));
    }
    if (failedPlugins.length) {
      console.log('Failed plugins:');
      failedPlugins.forEach((plugin) => {
        console.log(`${plugin.name}: ${plugin.reason}`);
      });
    }
  } catch (error) {
    console.error('An error occurred during the sync process:', error);
    process.exit(1);
  }
})();
