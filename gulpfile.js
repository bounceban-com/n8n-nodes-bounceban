const path = require('path');
const { task, src, dest } = require('gulp');

task('build:icons', copyIcons);

function copyIcons() {

	return src(path.resolve('nodes', '**', '*.{png,svg}')).pipe(dest(path.resolve('dist', 'nodes')));
}
