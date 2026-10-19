import fs from 'node:fs';
const page = { goto: async () => {}, evaluate: async () => true, waitForTimeout: async () => {}, screenshot: async (o) => { fs.writeFileSync(o.path, 'png'); } };
export const chromium = { launch: async () => ({ newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} }) };
export default { chromium };
