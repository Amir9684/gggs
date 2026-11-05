/**
 * Split factor methods a saved project can use. Ramezani and Dawalibi
 * are added here when their engines are ported.
 */
export const SPLIT_METHODS = ['SONI', 'IEEE80'] as const;

export type SplitMethod = (typeof SPLIT_METHODS)[number];
