/**
 * KaTeX-compatible HTML sanitization schema for rehype-sanitize.
 * Allows class attributes used by KaTeX while stripping XSS vectors.
 */
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

export const katexSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow class on all elements (katex uses class="katex-*", "math-inline", etc.)
    '*': [...(defaultSchema.attributes?.['*'] || []), 'class'],
  },
};

export const rehypeSanitizeKatex = rehypeSanitize(katexSchema);
