/**
 * Extension constants.
 */

/** Extension identifier. */
export const EXTENSION_ID = 'weaveContext';

/** Package name. */
export const EXTENSION_NAME = 'vscode-weave-context';

/** Display name. */
export const EXTENSION_DISPLAY_NAME = 'Weave Context';

/** Marketplace publisher. */
export const USER_PUBLISHER = 'imgildev';

/** GitHub user. */
export const USER_NAME = 'ManuelGil';

/** Repository URL. */
export const EXTENSION_REPOSITORY_URL: string = `https://github.com/${USER_NAME}/${EXTENSION_NAME}`;

/** Marketplace URL. */
export const EXTENSION_MARKETPLACE_URL: string = `https://marketplace.visualstudio.com/items?itemName=${USER_PUBLISHER}.${EXTENSION_NAME}`;

/** Sponsor URL. */
export const EXTENSION_SPONSOR_URL: string =
  'https://github.com/sponsors/ManuelGil';

/** Buy Me A Coffee URL. */
export const EXTENSION_BUY_ME_A_COFFEE_URL: string =
  'https://www.buymeacoffee.com/ManuelGil';

/** Default enable state. */
export const DEFAULT_ENABLE_SETTING = true;

/** Default Knowledge Repository Root relative to the selected workspace folder. */
export const DEFAULT_NOTES_ROOT_SETTING = '.context';

/** Default Knowledge Repository explorer projection mode. */
export const DEFAULT_TREE_PROJECTION_SETTING = 'filesystem' as const;
