/** Tailwind CSS v4 uses a dedicated PostCSS plugin. */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // iOS 15.4–16.1 has no color-mix(): precomputed rgba line before each one. See docs/BROWSER-SUPPORT.md
    "../packages/ui/postcss/color-mix-fallback.cjs": {},
  },
};

export default config;
