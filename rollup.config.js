// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import yaml from '@rollup/plugin-yaml';

export default {
	input: 'index.mjs',
	treeshake: true,
	output: {
		dir: 'dist',
		format: 'es',
		banner: "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);",
	},
	plugins: [
		resolve({ preferBuiltins: true, exportConditions: ['node'] }),
		commonjs(),
		json(),
		yaml(),
	],
	onwarn(warning, warn) {
		if (warning.code === 'CIRCULAR_DEPENDENCY') return;
		warn(warning);
	},
};