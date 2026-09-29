// EMStudio app version, inlined by Vite from package.json (see vite.config.ts
// `define`). Distinct from EM_VERSION (the EM *language* version, data-driven
// from the datamodel).
declare const __EMSTUDIO_VERSION__: string;

// RIFINITURE · true in the WEB build (`npm run build:web`, the Docker image):
// the 3D engine is not inlined in the editor but fetched as `engine3d.js` the
// first time a model is opened. False everywhere else (desktop, file://, dev).
declare const __EM_LAZY_3D__: boolean;
