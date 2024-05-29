import { Octokit } from '@octokit/rest';
import algoliasearch from 'algoliasearch';
import _ from 'lodash';

const algoliaClient = algoliasearch(
  process.env.ALGOLIA_APP_ID,
  process.env.ALGOLIA_API_KEY,
);
const algoliaIndex = algoliaClient.initIndex(process.env.ALGOLIA_PLUGINS_INDEX);

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const WEBFLOW_BASE_URL = 'https://api.webflow.com/v2';

/**
 * Makes an API request to the Webflow API.
 * @param {string} endpoint - The endpoint for the API request.
 * @param {string} method - The HTTP method (GET, POST, PATCH, DELETE).
 * @param {Object} [body] - The request body.
 * @returns {Promise<Object>} - The response data.
 */
const makeWebflowRequest = async (endpoint, method, body = null) => {
  const url = `${WEBFLOW_BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.WEBFLOW_SYNC_AND_PUBLISH_TOKEN}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    // Read the error response body
    const errorBody = await response.text(); // or response.json() if the error body is JSON
    const error = new Error(
      `Webflow error! status: ${response.status} ${response.statusText}`,
    );
    error.status = response.status;
    error.statusText = response.statusText;
    error.responseBody = errorBody;
    throw error;
  }

  return await response.json();
};

/**
 * Formats a Date object to YYYY-MM-DD string.
 * @param {Date} date - The date to format.
 * @returns {string} The formatted date string.
 */
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
/**
 * Fetches and parses JSON data from a given URL.
 * @param {string} url - The URL to fetch data from.
 * @returns {Promise<Object>} The parsed JSON data.
 */
const fetchJson = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch JSON from ${url}`, error);
    return null;
  }
};
/**
 * Get NPM downloads for a package.
 * @param {Object} params - The parameters.
 * @param {string} params.packageName - The package name.
 * @param {string} params.repoName - The repository name.
 * @returns {Promise<number>} The number of downloads.
 */
export const getNpmDownloads = async ({ packageName, repoName }) => {
  const date = formatDate(new Date());
  const apiPath = `https://api.npmjs.org/downloads/point/2015-01-10:${date}`;

  const fetchDownloads = async (name) => {
    const data = await fetchJson(`${apiPath}/${name}`);
    return data && !isNaN(data.downloads) ? data.downloads : 0;
  };

  let downloadsNum = await fetchDownloads(packageName);

  if (downloadsNum === 0 && packageName !== repoName) {
    downloadsNum = await fetchDownloads(repoName);
  }

  return downloadsNum;
};
/**
 * Get repo info from GitLab.
 * @param {Object} params - The parameters.
 * @param {string} params.owner - The owner of the repository.
 * @param {string} params.repo - The name of the repository.
 * @returns {Promise<Object>} The repository info.
 */
const getGitlabRepoInfo = async ({ owner, repo }) => {
  const apiPath = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}`;
  const res = await fetchJson(apiPath);

  if (!res) {
    return {
      githubStars: 0,
      authorAvatar: '',
      authorLink: '',
      authorName: '',
    };
  }

  return {
    githubStars: res.star_count || 0,
    authorAvatar: res.namespace.avatar_url
      ? `https://gitlab.com${res.namespace.avatar_url}`
      : '',
    authorLink: res.namespace.web_url || '',
    authorName: res.namespace.name || '',
  };
};

/**
 * Get repo info from GitHub.
 * @param {Object} params - The parameters.
 * @param {string} params.owner - The owner of the repository.
 * @param {string} params.repo - The name of the repository.
 * @returns {Promise<Object>} The repository info.
 */
const getGithubRepoInfo = async ({ owner, repo }) => {
  try {
    const res = await octokit.repos.get({ owner, repo });

    return {
      githubStars: res.data.stargazers_count || 0,
      authorAvatar: res.data.owner.avatar_url || '',
      authorLink: res.data.owner.html_url || '',
      authorName: res.data.owner.login || '',
    };
  } catch (err) {
    console.error(`Can't find repo ${repo}`, err);
    return {
      githubStars: 0,
      authorAvatar: '',
      authorLink: '',
      authorName: '',
    };
  }
};

/**
 * Get repo info from GitLab OR GitHub based on host name.
 * @param {Object} params - The parameters.
 * @param {string} params.owner - The owner of the repository.
 * @param {string} params.repo - The name of the repository.
 * @param {string} params.source - The source of the repository (gitlab.com or github.com).
 * @returns {Promise<Object>} The repository info.
 */
export const getRepoInfo = async ({ owner = '', repo = '', source }) => {
  try {
    switch (source) {
      case 'gitlab.com':
        return await getGitlabRepoInfo({ owner, repo });
      case 'github.com':
        return await getGithubRepoInfo({ owner, repo });
      default:
        throw new Error(`Unsupported source: ${source}`);
    }
  } catch (err) {
    console.error(`Error getting repo info for ${repo} from ${source}`, err);
    return {
      githubStars: 0,
      authorAvatar: '',
      authorLink: '',
      authorName: '',
    };
  }
};

/**
 * Get the readme content from GitLab.
 * @param {Object} params - The parameters.
 * @param {string} params.owner - The owner of the repository.
 * @param {string} params.repo - The name of the repository.
 * @returns {Promise<string>} The readme content in base64 format.
 */
const getGitlabReadmeContent = async ({ owner, repo }) => {
  const apiPath = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}/repository/files/README.md/raw?ref=master`;
  const content = await fetchJson(apiPath);
  return content;
};

/**
 * Get the readme content from GitHub.
 * @param {Object} params - The parameters.
 * @param {string} params.owner - The owner of the repository.
 * @param {string} params.repo - The name of the repository.
 * @param {string} [params.dir] - The directory of the readme file.
 * @returns {Promise<Object>} The GitHub readme response.
 */
const getGithubReadmeContent = async ({ owner, repo, dir }) => {
  if (dir) {
    return await octokit.repos.getReadmeInDirectory({ owner, repo, dir });
  }
  return await octokit.repos.getReadme({ owner, repo });
};

/**
 * Decode base64 content.
 * @param {string} content - The content in base64 format.
 * @returns {string} The decoded content.
 */
const decodeBase64 = (content) => {
  const buff = Buffer.from(content, 'base64');
  return buff.toString('utf-8');
};

/**
 * Get the readme file content from GitLab or GitHub based on the host name.
 * @param {Object} params - The parameters.
 * @param {string} params.owner - The owner of the repository.
 * @param {string} params.repo - The name of the repository.
 * @param {string} [params.dir] - The directory of the readme file.
 * @param {string} params.host - The host name ('gitlab.com' or 'github.com').
 * @returns {Promise<Object>} The readme content and related URLs.
 */
export const getReadmeContent = async ({ owner, repo, dir, source }) => {
  try {
    const isGitlab = source === 'gitlab.com';
    let content, readme;

    if (isGitlab) {
      content = await getGitlabReadmeContent({ owner, repo });
    } else {
      readme = await getGithubReadmeContent({ owner, repo, dir });
      content = _.get(readme, 'data.content');
    }

    content = decodeBase64(content);

    const res = { content };

    if (readme) {
      const {
        path,
        html_url: htmlUrl,
        download_url: downloadUrl,
      } = readme.data;
      const baseUrl = htmlUrl.replace(path, '');
      const contentUrl = downloadUrl.replace(path, '');
      res.baseUrl = baseUrl;
      res.contentUrl = contentUrl;
    }

    return res;
  } catch (error) {
    console.error(
      `Error getting readme content for ${repo} from ${source}`,
      error,
    );
    return null;
  }
};
/**
 * Check if the same plugin is different between Webflow and Github
 * @param {Object} webflowPlugin - Webflow plugin object
 * @param {Object} githubPlugin - Github plugin object
 * @returns True if both are equal
 */
export const isPluginEqual = (githubPlugin = {}, webflowPlugin = {}) => {
  const webflowPluginToCompare = {
    name: webflowPlugin.name,
    description: webflowPlugin.description,
    github: webflowPlugin.github,
    active: webflowPlugin.active,
  };
  const githubPluginToCompare = {
    name: githubPlugin.name,
    description: githubPlugin.description,
    github: githubPlugin.githubUrl,
    active:
      githubPlugin.status !== 'none' && githubPlugin.status ? true : false,
  };

  return _.isEqual(webflowPluginToCompare, githubPluginToCompare);
};

// Find a plugin by its Name
export const findPluginByName = (plugins, name) => {
  return plugins.find(
    (plugin) => plugin?.fieldData?.name === name || plugin?.name === name,
  );
};

// A sleep function to wait for a given time
export const sleep = (wait) =>
  new Promise((resolve) => setTimeout(resolve, wait));

/**
 * Creates an item in a Webflow collection.
 * @param {string} collectionId - The ID of the Webflow collection.
 * @param {Object} fieldData - The data for the fields of the new item.
 * @returns {Promise<Object>} - The response from the Webflow API.
 */
export const createWebflowItem = async (collectionId, fieldData = {}) => {
  const endpoint = `/collections/${collectionId}/items/live`;
  const body = {
    isArchived: false,
    isDraft: false,
    fieldData,
  };

  try {
    console.log(`Creating ${fieldData.name} in Webflow...`);
    const res = await makeWebflowRequest(endpoint, 'POST', body);
    console.log(`Created ${fieldData.name} in Webflow successfully`);
    return res;
  } catch (err) {
    console.error(`Error creating item ${fieldData.name}`, err);
    // Implement rate limit handling and retry logic if necessary
    await awaitWebflowRateLimit(err, () =>
      createWebflowItem(collectionId, fieldData),
    );
  }
};
/**
 * Updates an existing item in a Webflow collection.
 * @param {string} collectionId - The ID of the Webflow collection.
 * @param {string} itemId - The ID of the item to update.
 * @param {Object} fieldData - The updated data for the fields of the item.
 * @returns {Promise<Object>} - The response from the Webflow API.
 */
export const updateWebflowItem = async (
  collectionId,
  itemId,
  fieldData = {},
) => {
  const endpoint = `/collections/${collectionId}/items/${itemId}/live`;
  const body = {
    isArchived: false,
    isDraft: false,
    fieldData,
  };

  try {
    console.log(`Updating ${fieldData.name} in Webflow...`);
    const res = await makeWebflowRequest(endpoint, 'PATCH', body);
    console.log(`Updated ${fieldData.name} in Webflow successfully`);
    return res;
  } catch (err) {
    console.error(`Error updating item ${fieldData.name}`, err);
    // Implement rate limit handling and retry logic if necessary
    await awaitWebflowRateLimit(err, () =>
      updateWebflowItem(collectionId, itemId, fieldData),
    );
  }
};
/**
 * Retrieves items from a Webflow collection, handling pagination if necessary.
 * @param {string} collectionId - The ID of the Webflow collection.
 * @param {number} [offset=0] - The offset for pagination.
 * @param {number} [itemsLength=0] - The current total number of items retrieved.
 * @returns {Promise<Array>} - An array of items from the Webflow collection.
 */
export const listWebflowCollectionItems = async (
  collectionId,
  offset = 0,
  itemsLength = 0,
) => {
  const endpoint = `/collections/${collectionId}/items?offset=${offset}`;

  try {
    const {
      items,
      pagination: { total },
    } = await makeWebflowRequest(endpoint, 'GET');
    const totalItemsLength = itemsLength + items.length;

    if (total > totalItemsLength) {
      const moreItems = await listWebflowCollectionItems(
        collectionId,
        offset + 100,
        totalItemsLength,
      );
      return items.concat(moreItems);
    }

    return items;
  } catch (err) {
    console.error('Error getting collection items', err);
    // Implement rate limit handling and retry logic if necessary
    await awaitWebflowRateLimit(err, () =>
      listWebflowCollectionItems(collectionId, offset, itemsLength),
    );
  }
};
/**
 * Deletes an item from a Webflow collection.
 * @param {string} collectionId - The ID of the Webflow collection.
 * @param {string} itemId - The ID of the item to delete.
 * @returns {Promise<Object>} - The response from the Webflow API.
 */
export const deleteWebflowItem = async (collectionId, itemId) => {
  const endpoint = `/collections/${collectionId}/items/${itemId}`;

  try {
    console.log(`Deleting ${itemId} from Webflow...`);
    const res = await makeWebflowRequest(endpoint, 'DELETE');
    console.log(`Deleted item ${itemId} from Webflow successfully`);
    return res;
  } catch (err) {
    console.error(`Error deleting item ${itemId}`, err);
    // Implement rate limit handling and retry logic if necessary
    await awaitWebflowRateLimit(err, () =>
      deleteWebflowItem(collectionId, itemId),
    );
  }
};
// Await WebFlow API limit
const awaitWebflowRateLimit = async (err, callback) => {
  if (
    err.code === 'too_many_requests' ||
    err.status === 429 ||
    err.responseBody.includes('Too Many Requests')
  ) {
    console.log('awaiting webflow limit');
    await sleep(10000);
    await callback();
  }
};

/**
 * Formats the title string by capitalizing certain words and applying special formatting rules.
 * @param {string} str - The string to format.
 * @returns {string} - The formatted title string.
 */
export const formatTitle = (str) => {
  // Capitalize the first letter of each word in the string
  const title = _.startCase(str);
  let formattedTitle = '';

  // List of words to be converted to uppercase
  const uppercaseWords = [
    'Aws',
    'Http',
    'Rest',
    'Api',
    'Iot',
    'Sam',
    'Sns',
    'Ses',
    'Iam',
    'Es',
    'Cf',
    'Waf',
    'Raml',
    'Wsgi',
    'Vpc',
    'Ssm',
    'Kms',
    'Sqs',
    'Ttl',
    'Spa',
    'Sdk',
  ];

  // Object mapping specific words to their branded formatting
  const brandWords = {
    dynamodb: 'DynamoDB',
    faunadb: 'FaunaDB',
    pynamodb: 'PynamoDB',
    mongodb: 'MongoDB',
    oauth: 'OAuth',
    graphql: 'GraphQL',
    iopipe: 'IOpipe',
    graphiql: 'GraphiQL',
  };

  // Split the title into words and apply the formatting rules
  title.split(' ').forEach((word) => {
    const wordInLowercase = word.toLowerCase();

    if (brandWords[wordInLowercase]) {
      // Apply branded formatting
      formattedTitle += ` ${brandWords[wordInLowercase]}`;
    } else if (uppercaseWords.includes(word)) {
      // Convert to uppercase
      formattedTitle += ` ${word.toUpperCase()}`;
    } else {
      // Leave the word as is
      formattedTitle += ` ${word}`;
    }
  });

  // Apply specific replacements for certain words
  formattedTitle = formattedTitle.replace('S 3', 'S3');
  formattedTitle = formattedTitle.replace('Sthree', 'S3');

  // Trim any leading or trailing whitespace
  formattedTitle = formattedTitle.trim();

  return formattedTitle;
};

/**
 * Creates an item in the Algolia index.
 * @param {Object} item - The item to be created in Algolia.
 * @returns {Promise<Object>} - The response from the Algolia API.
 */
export const createAlgoliaItem = async (item) => {
  try {
    // Save the item to the Algolia index
    const response = await algoliaIndex.saveObject(item);
    console.log(`Created Algolia item: ${item.objectID}`);
    return response;
  } catch (err) {
    // Log and rethrow the error if the creation fails
    console.error(`Failed to create Algolia item: ${item.objectID}`, err);
    throw err;
  }
};

/**
 * Updates an item in the Algolia index.
 * @param {Object} item - The item to be updated in Algolia.
 * @returns {Promise<Object>} - The response from the Algolia API.
 */
export const updateAlgoliaItem = async (item) => {
  try {
    // Save the updated item to the Algolia index
    const response = await algoliaIndex.saveObject(item);
    console.log(`Updated Algolia item: ${item.objectID}`);
    return response;
  } catch (err) {
    // Log and rethrow the error if the update fails
    console.error(`Failed to update Algolia item: ${item.objectID}`, err);
    throw err;
  }
};

/**
 * Deletes an item from the Algolia index.
 * @param {string} objectID - The ID of the item to be deleted from Algolia.
 * @returns {Promise<Object>} - The response from the Algolia API.
 */
export const deleteAlgoliaItem = async (objectID) => {
  try {
    // Delete the item from the Algolia index

    const response = await algoliaIndex.deleteObject(objectID);
    console.log(`Deleted Algolia item: ${objectID}`);
    return response;
  } catch (err) {
    // Log and rethrow the error if the deletion fails

    console.error(`Failed to delete Algolia item: ${objectID}`, err);
    throw err;
  }
};
/**
 * Lists all items in the Algolia index.
 * @returns {Promise<Array>} - The list of items from the Algolia index.
 */
export const listAlgoliaItems = async () => {
  try {
    let items = [];
    let page = 0;
    let hits;

    // Loop to paginate through all results
    do {
      const response = await algoliaIndex.search('', {
        page,
        hitsPerPage: 1000,
      });
      hits = response.hits;
      items = items.concat(hits);
      page += 1;
    } while (hits.length > 0);

    return items;
  } catch (err) {
    console.error('Failed to list Algolia items', err);
    throw err;
  }
};

/**
 * Lists all items in the Algolia index and checks for duplicates.
 * @returns {Promise<void>}
 */
export const listAndCheckDuplicates = async () => {
  try {
    // List all items using the predefined function
    const items = await listAlgoliaItems();
    console.log(`Found ${items.length} items in Algolia index.`);

    // Check for duplicates
    const itemMap = new Map();
    const duplicates = [];

    for (const item of items) {
      if (itemMap.has(item.objectID)) {
        duplicates.push(item);
      } else {
        itemMap.set(item.objectID, item);
      }
    }

    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} duplicate items:`);
      duplicates.forEach((duplicate) => {
        console.log(duplicate);
      });
    } else {
      console.log('No duplicate items found.');
    }
  } catch (err) {
    console.error('Failed to list Algolia items and check for duplicates', err);
    throw err;
  }
};

/**
 * Fixes the language identifiers in code blocks within the markdown content.
 * @param {string} markdown - The markdown content.
 * @returns {string} - The fixed markdown content.
 */
// const fixMarkdownCodeBlocks = (markdown) => {
//   const replacements = [
//     [/```node/g, '```javascript'],
//     [/```graphql/g, '```javascript'],
//     [/```env/g, '```bash'],
//     [/```bash=/g, '```bash'],
//     [/```bas/g, '```bash'],
//     [/```shall/g, '```bash'],
//     [/```pseudo/g, '```bash'],
//     [/```bash:development/g, '```bash'],
//     [/```bashh/g, '```bash'],
//     [/```bashe/g, '```bash'],
//     [/```base/g, '```bash'],
//     [/```dotenv/g, '```bash'],
//     [/```bash:production/g, '```bash'],
//     [/```serverless.yml/g, '```yml'],
//     [/```(yaml)/g, '```yml'],
//     [/```fake-test-users.json/g, '```json'],
//     [/```python=/g, '```python'],
//     [/```pyyhon/g, '```python']
//   ];

//   return replacements.reduce((fixed, [pattern, replacement]) => fixed.replace(pattern, replacement), markdown);
// };

/**
 * Gets the content of a file from a repository, processes it, and converts it to HTML.
 * @param {Object} repo - The repository information.
 * @param {string} docsType - The type of documentation.
 * @param {string} filePath - The path to the file.
 * @returns {Promise<Object>} - The processed file content including markdown, frontmatter, and HTML.
 */
// const getFileContent = async (repo, docsType, filePath) => {
//   try {
//     const fileContent = repo.content;
//     const fixedFile = fixFrontmatter(fileContent); // Fix frontmatter in the file content
//     const frontmatter = await getFrontmatter(fixedFile); // Extract frontmatter from the file
//     const fixedCode = fixMarkdownCodeBlocks(fixedFile); // Fix language identifiers in code blocks
//     const markdownContent = await removeFrontmatter(fixedCode); // Remove frontmatter from the file
//     const html = await processMarkdown(markdownContent, repo, docsType, filePath); // Process the markdown content and convert to HTML

//     return {
//       markdownFile: fixedFile,
//       frontmatter,
//       html
//     };
//   } catch (error) {
//     console.error(`Error getting file content: ${error}`);
//     throw error;
//   }
// };
