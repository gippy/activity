var express = require('express'),
	favicon = require('serve-favicon'),
	logger = require('morgan'),
	cookieParser = require('cookie-parser'),
	bodyParser = require('body-parser'),
	methodOverride = require('method-override'),
	session = require('express-session'),
	compress = require('compression'),
	flash = require('express-flash'),
	MongoStore = require('connect-mongo')({session: session});

module.exports = function (app, config, env) {

	app.set('showStackError', true);

	// should be placed before express.static
	app.use(compress({
		filter: function (req, res) {
			return /json|text|javascript|css/.test(res.getHeader('Content-Type'))
		},
		level: 9
	}));

	app.use(favicon(__dirname + '/../public/favicon.ico'));
	app.use(express.static(config.root + '/public'));

	// view engine setup
	app.set('views', config.root + '/views');
	app.set('view engine', 'jade');
	app.use(require('less-middleware')( config.root + '/public'));

	app.use(cookieParser());

	app.use(logger('dev'));

	var mongoStore = new MongoStore({
		url: config.db
	});
	app.use(session( {
		store: mongoStore,
		secret: config.session.secret,
		resave: false,
		saveUninitialized: false
	} ));

	app.use(flash());

	app.use(bodyParser.urlencoded({
		extended: true
	}));
	app.use(bodyParser.json());

	app.use(methodOverride());

	require('./routes')(app);

	app.getUrl = function(path){
		return ( config.secure ? 'https://' : 'http://' ) + config.domain + path;
	};

	if (app.get('env') === 'development') {

		app.use(function(err, req, res, next) {
			res.status(err.status || 500);
			console.log(err);
			res.render('error', {
				message: err.message,
				error: err
			});
		});
		app.locals.javascript = '/javascripts/scripts.js';
		app.locals.stylesheet = '/stylesheets/style.css';
	} else {

		app.use(function (err, req, res, next) {
			res.status(err.status || 500);
			console.log(err);
			res.render('error', {
				message: err.message,
				error: err
			});
		});

		app.locals.javascript = '/javascripts/scripts.js';
		app.locals.stylesheet = '/stylesheets/style.min.css';
	}
};