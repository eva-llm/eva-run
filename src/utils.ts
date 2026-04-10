export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const xnor = (a: boolean, b: boolean): boolean => a === b;
