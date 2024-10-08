import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default [
	// browser-friendly UMD build
	{
		input: 'src/main.js',
		output: {
			name: 'ReceiptPrinterStatus',
			file: 'dist/receipt-printer-status.umd.js',
			sourcemap: true,
			format: 'umd'
		},
		plugins: [
			resolve(), 
			commonjs(),
            terser({ 
				keep_classnames: true
			}) 
		]
	},

	{
		input: 'src/main.js',
		output: { 
			file: 'dist/receipt-printer-status.esm.js', 
			sourcemap: true,
			format: 'es' 
		},
		plugins: [
			resolve(),
			commonjs(),
            terser({ 
				keep_classnames: true
			}) 
		]
	}
];