/**
 * Which browser origins may call the PhenomeBeauty Edge Functions.
 *
 * Production (www and apex) and this project's Vercel preview deployments.
 * Preview URLs look like lifestyle-website-<id>-phenomebeautys-codes-projects.vercel.app,
 * so they are matched by pattern. Any other origin gets the production origin back,
 * which the browser then rejects.
 *
 * Plain JavaScript on purpose: the handler tests load this file as source text.
 */

export const PRODUCTION = ['https://www.phenomebeauty.co.za', 'https://phenomebeauty.co.za'];
const PREVIEW = /^https:\/\/[a-z0-9-]+-phenomebeautys-codes-projects\.vercel\.app$/;

export function isSiteOrigin(origin) {
  return PRODUCTION.includes(origin) || PREVIEW.test(origin);
}

export function corsOrigin(origin) {
  return isSiteOrigin(origin) ? origin : PRODUCTION[0];
}
