/**
 * Split factor methods a saved project can use. Dawalibi is added here
 * when its engine is ported.
 */
export const SPLIT_METHODS = ['SONI', 'IEEE80', 'RAMEZANI'] as const;

export type SplitMethod = (typeof SPLIT_METHODS)[number];
