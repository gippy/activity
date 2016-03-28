/**
 * Controllers
 */

var	env = process.env.NODE_ENV || 'development',
	config = require('./config')[env],
	index = require('../controllers/index'),
	multer = require('multer'),
	upload = multer({ dest: config.root + '/uploads/'});

/**
 * Expose routes
 */

module.exports = function ( app ) {

	app.route('/access-denied').get(index.accessDenied);

	app.route('/*').get(index.checkIP);

	app.route('/*').get(index.setLocals);

	app.route('/login').get( index.login ).post( index.performLogin );

	app.all( '/*', index.authenticate );

	app.get('/logout', index.logout );

	app.get( '/', index.dashboard );
	app.get( '/dashboard', index.dashboard );
	app.get( '/report', index.report );
	app.get( '/report-data', index.getData );
	app.post( '/upload', upload.array('files'), index.upload);
	app.get( '/download', index.download);
	app.get( '/hash', index.hash);

};