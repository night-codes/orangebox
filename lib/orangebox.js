var async       = require('async');
var cluster     = require('cluster');
var cookieObj   = require('cookies');
var fs          = require('fs');
var http        = require('http');
var mime        = require('mime-types');
var extend      = require('util')._extend;
var pathTest    = require("./pathTest");
var stDesc      = require("./status-desc").codes;
var methods     = require('methods');

/* Reserved "all" and "use" */
methods.push('all', 'use');

function app () {

	// Default arguments
	var count     = 3;
	var callback  = null;
	for (var i=0; i<arguments.length; i++) {
		if (typeof arguments[i] === 'function') callback = arguments[i];
		if (typeof arguments[i] === 'number') count = arguments[i];
	}

	var workers   = [];
	var waiters   = [];
	var routes    = [];
	var listened  = false;
	var engines   = {};
	var params    = {
		'case sensitive routing': false,
		'env'                   : (process.env.NODE_ENV || 'development'),
		'strict routing'        : false,
		'subdomain offset'      : 2,
		'view cache'            : true,
		'view engine'           : '',
		'view timezone'         : 0,
		'view autoescape'       : false,
		'views'                 : process.cwd() + '/views',
		'x-powered-by'          : 'OrangeBox'
	};

	// Default router
	var Router    = { server : Server };

	// Default server
	var Server = function(request, response, next) {
		request.server.workers.forEach (function(el) {
			if (el) {
				waiters.forEach(function(serv) {
					el.send(serv);
				});
			}
		});
		waiters = [];
		_message (request, response, next);
	};
	extend(Server, {
		alias       : _alias,
		set         : _set,
		get         : _get,
		load        : _load,
		engine      : _engine,
		listen      : _listen,
		fileServer  : _fileServer,
		Router      : _Router,
		workers     : workers,
		waiters     : waiters
	});

	// Filling methods to Router
	methods.forEach(function(el) {
		Router[el] = function(){
			var route = typeof arguments[0] === 'function' ?
				'*' : arguments[0];

			for (var i = 0; i < arguments.length; i++) {
				if(typeof arguments[i] === 'function') {
					if (arguments[i].waiters && arguments[i].waiters.length) {
						while (arguments[i].waiters.length) {
							waiters.push(arguments[i].waiters.shift());
						}
					}
					routes.push({
						route: route,
						type: el.toLowerCase(),
						callback: arguments[i],
						name: arguments[i].toString().
							match(/function ([^(]*)\(/)[1]
					});
				}
			}
		};
		if (typeof Server[el] === 'undefined') {
			Server[el] = Router[el];
		}
	});
	Server.use = Router.use;


	/**
	 * Require the directory to Router
	 *
	 * @param  {String} name
	 * @param  {String} path Required directory path
	 */
	function _load (name, path) {
		if (name === 'server' || methods.indexOf(name) !== -1) {
			console.warn('Error: Router.' + name + ' is reserved method');
		} else {
			Router[name] = {};
			fs.readdirSync(path).forEach(function(el) {
				// Require only .js files
				if (/.*\.js$/gi.test(el)) {
					var module = require(path + '/' + el);
					if (typeof module === 'function') {
						module(Router);
					} else {
						var nm = el.replace(/\.js$/gi, '');
						Router[name][nm] = module;
					}
				}
			});
		}
		return this;
	}


	/**
	 * Set server variable
	 *
	 * @param {String} name Server variable name
	 * @param {Mixed} value Server variable  value
	 */
	function _set (name, value) {

		if (!name || !value) {
			return false;
		}
		name = name.toLowerCase();
		if (this.variables) {
			this.variables[name] = value;
		} else {
			params[name] = value;
		}
		if (name.indexOf('multiparty ') === 0) {
			_wput({cmd: 'setVar', name: name, value: value});
		}
		return true;
	}


	/**
	 * Get server variable
	 *
	 * @param  {String} name Server variable name
	 * @return {Mixed}       Server variable  value
	 */
	function _get (name) {
		var toRouter = false;
		for (var i = 0; i < arguments.length; i++) {
			if(typeof arguments[i] === 'function') {
				Router.get.apply(this, arguments);
				toRouter = true;
			}
		}
		if (!toRouter) {
			name = name.toLowerCase();
			return this.variables ? this.variables[name] : params[name] ? params[name] : undefined;
		}
	}


	/**
	 * Router returner
	 *
	 * @return {Object} Router
	 */
	function _Router () {
		return Router;
	}


	/**
	 * Sets the Content-Type to the mime lookup of type, or when "/"
	 * is present the Content-Type is simply set to this literal value.
	 *
	 * @param {String} type
	 */
	function _type (type) {
		var response = this;
		var m = mime.lookup(type);
		response.set('Content-Type', m + (response.encoding &&
			(new RegExp('(xml|html|text|javascript|json)', 'gi')).test(m) ?
			'; charset=' + response.encoding : ''));
		return response;
	}


	/**
	 * Set view engine
	 *
	 * @param  {String}   type View type
	 * @param  {Function} func Handler for this view type
	 * @return {Boolean}
	 */
	function _engine (type, func) {
		if (!type || !func) {
			return false;
		}
		engines[type] = func;
		return true;
	}

	/**
	 * Is header sended?
	 *
	 * @param  {[type]}  description
	 * @return {Boolean}
	 */
	function _isSended (description) {
		var response = this;
		if (!response.headersSent) {
			return false;
		}
		console.error("Can't set headers after they are sent!" +
			(description ? (' ' + description) : ''));
		return true;
	}


	/**
	 * Send message to worker now or put to stack
	 *
	 * @param  {Object} obj
	 */
	function _wput (obj) {
		if (!listened) {
			waiters.push(obj);
		} else {
			workers.forEach (function(el) {
				if (el)	el.send (obj);
			});
		}
	}



	/**
	 * Set router alias for path
	 *
	 * @param  {String} alias
	 * @param  {String} path
	 */
	function _alias (alias, path) {
		_wput({cmd: 'alias', alias: alias, path: path});
	}


	/**
	 * Start file server for specified directory
	 *
	 * @param  {[type]} path
	 */
	function _fileServer (path, routePath) {
		_wput({cmd: 'fileServer', path: path, routePath: routePath || ''});
	}



	/**
	 * Begin accepting connections on the specified port and hostname.
	 * If the hostname is omitted, the server will accept connections
	 * directed to any IPv4 address
	 *
	 * @param  {Number}   port
	 * @param  {String}   host
	 * @param  {Function} callback
	 */
	function _listen (port, host, callback){
		if (typeof host === 'function') {
			callback = host;
			host = false;
		}

		if (!listened) {
			listened = true;
			_cluster();
			workers.forEach (function(el) {
				if (el) {
					waiters.forEach(function(msg) {
						el.send(msg);
					});
				}
			});
			waiters = [];
		}

		var listen = 0;
		workers.forEach(function(el) {
			var ls = {port: port};
			if(host) ls.host = host;
			if (el) {
				el.send({cmd: 'listen', listen: ls});
			}

			if (callback) {
				el.once('listen', function() {
					listen++;
					if (listen === count) {
						callback ();
					}
				});
			}
		});
	}


	/**
	 * Send data to client
	 * This method signals to the server that all of the response headers
	 * and body have been sent; that server should consider this message
	 * complete. The method MUST be called on each response.
	 *
	 * @param  {Mixed} data
	 * @param  {string} encoding
	 */
	function _send (data, encoding){

		var response = this;
		if (!response.isSended('_send')){

			// For res.send(200, '...'); Deprecated! Use
			// res.status(200).send('...');
			if (typeof data === 'number' && encoding) {
				response.status(data); data = encoding;
				if (arguments.length === 3) encoding = arguments[2];
				else encoding = undefined;
			}

			response.write(data, encoding);
			response.headersSent = true;
			workers.forEach(function(el) {
				if(el && el.process.pid === response.pid) {
					el.send({cmd: 'send', response: response});
				}
			});
		}
		return response;
	}


	/**
	 * Transfer the file at the given path. The Content-Type response header
	 * field is automatically set based on the filename's extension.
	 *
	 * @param  {String} filename
	 * @param  {Object} options
	 */
	function _sendFile (filename, options){
		var response = this;
		if (!response.isSended('_sendFile')){
			response.filePath = filename;
			response.type(filename.split('/').pop());
			response.Type = 'sendFile';
			response.headersSent = true;
			workers.forEach(function(el) {
				if(el && el.process.pid === response.pid) {
					el.send({
						cmd      : 'sendFile',
						response : response,
						path     : filename,
						options  : options || null
					});
				}
			});
		}
		return response;
	}



	/**
	 * Sets the Content-Disposition header field to "attachment".
	 * If a filename is given, then the Content-Type will be automatically
	 * set based on the extname via res.type(), and the Content-Disposition's
	 * "filename=" parameter will be set.
	 *
	 * @param  {String} filename
	 * @param  {String} attachName
	 * @param  {Object} options
	 */
	function _attachment (filename, attachName, options){
		if (typeof attachName !== 'string') {
			if (typeof attachName === 'object') {
				options = attachName;
			}
			attachName = filename.split('/').pop();
		}
		var response = this;
		response.setHeader('Content-Disposition', 'attachment');
		if (filename) {
			if (attachName.indexOf('.') > 0) {
				response.setHeader('Content-Disposition', 'attachment; filename="' + attachName + '"');
			}
			response.sendFile(filename, options);
		}
		return response;
	}


	/**
	 * Send data to worker render
	 *
	 * @param  {String} data
	 */
	function _sendRender (data, engine, viewsPath, viewsCache, view){
		var response = this;
		if (!response.isSended('_sendRender')){
			response.data = '';
			response.headersSent = true;
			response.Type = 'sendRender';
			workers.forEach(function(el) {
				if(el && el.process.pid === response.pid) {
					el.send({cmd: 'sendRender', response: response,
						data       : data,
						view       : view,
						engine     : engine,
						viewsPath  : viewsPath,
						viewsCache : viewsCache
					});
				}
			});
		}
		return response;
	}


	/**
	 * This sends a chunk of the response body. This method may be called multiple
	 * times to provide successive parts of the body. Can be a string, object or a buffer
	 *
	 * @param  {Mixed}   data
	 * @param  {String}  encoding
	 */
	function _write (data, encoding){
		var response = this;
		if (!response.isSended('_write')){
			if (Buffer.isBuffer(data)) {
				data = data.toString('base64');
				encoding = 'base64';
				response.Type = 'Buffer';
			}
			if (typeof data === 'object') {
				data = JSON.stringify(data);
				response.type("json");
			}

			if (typeof data === 'string') {
				response.data += data;
				if (encoding) response.encoding = encoding;
			}
		}
		return response;
	}


	/**
	 * Sets a single header value for implicit headers. If this header already exists
	 * in the to-be-sent headers, its value will be replaced. Use an array of strings
	 * here if you need to send multiple headers with the same name.
	 *
	 * @param {String} name
	 * @param {String} value
	 */
	function _setHeader (name, value) {
		var response = this;
		var headers = response._headers;
		if (!response.isSended('_setHeader')){
			if (name.toLowerCase() !== 'set-cookie') {
				headers[name.toLowerCase()] = value;
			} else {
				var c = value.split(';')[0].split('=')[0];
				if (typeof headers['set-cookie'] === 'undefined') {
					headers['set-cookie'] = [value];
				} else {
					headers['set-cookie'].forEach(function(el, i) {
						if (c === el.split(';')[0].split('=')[0]) {
							headers['set-cookie'][i] = value;
						}
					});
				}
			}
		}
		return response;
	}


	/**
	 * Set cookie name to value, which may be a string or object converted to JSON.
	 * The path option defaults to "/".
	 *
	 * @param  {String} name  Cookie name
	 * @param  {String} value
	 * @param  {Object} opts  Options such as: path, maxAge, etc.
	 */
	function _cookie (name, value, opts) {
		var response = this;
		opts = opts || {};
		if (typeof value === 'object') {
			value = JSON.stringify(value);
		}
		response.cook.set(name, encodeURI(value), opts);
		return response;
	}


	/**
	 * Clear cookie name. The path option defaults to "/".
	 *
	 * @param  {String} name  Cookie name
	 * @param  {Object} opts  Options such as: path, etc.
	 */
	function _clearCookie (name, opts) {
		var response = this;
		opts = opts || {};
		response.cookie(name, '', extend(opts, {maxAge: 0}));
		return response;
	}


	/**
	 * Reads out a header that's already been queued but not sent to the client. Note that
	 * the name is case insensitive. This can only be called before headers get implicitly flushed.
	 *
	 * @param  {String} name
	 */
	function _getHeader (name) {
		var response = this;
		if (typeof response._headers[name.toLowerCase()] !== 'undefined') {
			return response._headers[name.toLowerCase()];
		}
		return undefined;
	}

	/**
	 * Set content encoding
	 * @param  {String} encoding
	 */
	function _charset (encoding) {
		var response   = this;
		response.encoding = encoding;
		return response;
	}

	/**
	 * Get request header by name
	 *
	 * @param  {String} name
	 * @return {String}
	 */
	function _header(name) {
		var request = this;
		if (typeof request.headers[name.toLowerCase()] !== 'undefined') {
			return request.headers[name.toLowerCase()];
		}
	}


	/**
	 * Render a view, and send or callback the rendered string.
	 *
	 * @param  {String}   view
	 * @param  {Object}   data
	 * @param  {Function} callback
	 */
	function _render(view, data, callback) {
		var response   = this;
		var engine     = response.getVariable('view engine');
		var viewsPath  = response.getVariable('views');
		var viewsCache = response.getVariable('view cache');

		if (!response.isSended('_render')){
			if (engine === 'swig') {
				response.sendRender(data, engine, viewsPath, viewsCache, view);
			} else if (engines[engine]) {
				engines[engine](viewsPath + '/' + view + '.html' , data || {},
				  function (err, output) {
					if (err) {
						console.error(err);
						response.sendStatus(500);

						if (typeof callback === 'function') {
							callback(err, output);
						}
					} else {
						response.send(output);
						if (typeof callback === 'function') {
							callback(null, output);
						}
					}
					callback = null;
				});
			} else {
				response.send(data);
			}
		}
		if (typeof callback === 'function') {
			callback(null);
		}
		return response;
	}


	/**
	 * Removes a header that's queued for implicit sending
	 *
	 * @param  {String} name
	 */
	function _removeHeader(name) {
		var response = this;
		if (!response.isSended('_removeHeader')){
			if (response._headers[name.toLowerCase()])
				delete response._headers[name.toLowerCase()];
		}
		return response;
	}


	/**
	 * Sends a response header to the request. The status code is a 3-digit HTTP status code,
	 * like 404. The last argument, headers, are the response headers. Optionally one can give
	 * a human-readable reasonPhrase as the second argument.
	 *
	 * This method must only be called once on a message and it must be
	 * called before response.end() is called.
	 *
	 * @param  {Number} statusCode
	 * @param  {[type]} reasonPhrase
	 * @param  {[type]} headers
	 */
	function _writeHead(statusCode, reasonPhrase, headers) {
		var response = this;
		if (!response.isSended('_writeHead')){
			response.statusCode = statusCode;
			if (!headers && reasonPhrase) headers = reasonPhrase;
			if (!headers || !statusCode) return response;
			for (var key in headers) {
				if (headers.hasOwnProperty(key)) {
					response.setHeader(key, headers[key]);
				}
			}
		}
		return response;
	}


	/**
	 * Redirect to the given url with optional status code defaulting to 302 "Found".
	 *
	 * @param  {String} adress
	 * @return {[type]}
	 */
	function _redirect(adress) {
		var code = 302;
		if (arguments[1] && isInteger(arguments[0])) {
			code   = arguments[0];
			adress = arguments[1];
		}
		var response = this;
		response.writeHead(code, {'Location': encodeURI(adress)});
		response.end();
		return response;
	}


	/**
	 * Chainable alias of node's res.statusCode. Use this method to set
	 * the HTTP status for the response.
	 *
	 * @param  {Number} statusCode
	 */
	function _status (statusCode) {
		if (typeof statusCode !== 'number') {
			console.warn('StatusCode must be a Number!');
			return false;
		}
		var response = this;
		if (!response.isSended('_status')){
			response.statusCode = statusCode;
		}
		return response;
	}


	/**
	 * Set the response HTTP status code to statusCode and send its string
	 * representation as the response body.
	 *
	 * @param  {Number} statusCode
	 */
	function _sendStatus (statusCode, description) {
		var response = this;
		if (!response.isSended('_status')){
			response.setHeader('Content-Type', 'text/html');
			response.status(statusCode);
			response.send('<h2>' + statusCode + ' ' + http.STATUS_CODES[statusCode] + '</h2>' +
				(description ? description : (stDesc[statusCode] ? stDesc[statusCode] : '')));
		}
		return response;
	}


	// CLUSTER FORKS
	function _cluster () {
		var old = cluster.settings.exec;
		cluster.setupMaster();
		cluster.settings.exec = __dirname + '/orangebox-worker.js';
		for (var j = 0; j < count; j++) {
			var worker = cluster.fork();
			worker.on('disconnect', function() {
				worker = null;
				workers = workers.filter(function(e){ return e !== null; });
			});
			console.log('OrangeBox: worker started, PID:' + worker.process.pid);
			worker.on('message', _message);
			workers.push(worker);
		}
		cluster.settings.exec = old;
	}

	/**
	 * Received http request...
	 * @param  {[type]} request [description]
	 * @return {[type]}         [description]
	 */
	function _message (request, response, next) {

		var worker = this;
		request.server = Server;

		if (!request.cmd) {

			response = response || {
				attachment   : _attachment,
				charset      : _charset,
				cookie       : _cookie,
				clearCookie  : _clearCookie,
				end          : _send,
				get          : _getHeader,
				getHeader    : _getHeader,
				header       : _setHeader,
				isSended     : _isSended,
				orangebox    : request.orangebox,
				pid          : request.pid,
				redirect     : _redirect,
				removeHeader : _removeHeader,
				render       : _render,
				reqId        : request.reqId,
				send         : _send,
				sendFile     : _sendFile,
				sendRender   : _sendRender,
				sendStatus   : _sendStatus,
				set          : _setHeader,
				setHeader    : _setHeader,
				status       : _status,
				type         : _type,
				write        : _write,
				writeHead    : _writeHead,
				_headers     : {'x-powered-by': params['x-powered-by'], 'Content-Type': 'text/html; charset=utf-8'},
				Type         : 'string',
				getVariable  : _get,
				setVariable  : _set,
				data         : '',
				encoding     : 'utf-8',
				statusCode   : 200,
				_headerNames : {}
			};


			Object.defineProperty(response, 'cook', {
				enumerable: false,
				writable: true
			});
			response.cook = new cookieObj(request, response);
			request.header = _header;


			if (callback) {
				Server.use('*', callback);
			}



			// ROUTING %-)

			var done = false;
			var tmpVar = false;
			var iter = 0;

			if (request.variables) {
				tmpVar = request.variables;
			}

			request.variables = params;
			response.variables = params;



			if (routes && routes.length) {
				async.doUntil(
					function (callback) {     //setImmediate(function (){});
						var item = routes[iter];
						iter++;
						var test = pathTest( request.baseUrl, item.route,
							[], params['case sensitive routing'],
							params['strict routing']);

						if (test && (request.method.toLowerCase() === item.type || item.type === 'use' || item.type === 'all')) {
							request.params = test;
							if (item.callback.length === 3) {
								item.callback(request, response, callback);
							} else {
								item.callback(request, response);
								function rm() {
									if (response.headersSent || done) {
										callback();
									} else {
										setTimeout(rm, 100);
									}
								}
								rm();
							}
						} else {
							callback();
						}
					},
					function () {
						return (done || response.headersSent ||
							iter >= routes.length);
					},
					function (err) {
						if(!response.headersSent) {
							if(err) {
								if (err.status) {
									response.status(err.status);
								} else {
									response.sendStatus(500);
								}
								response.send(err.message);
							} else {
								if (typeof next === 'function') {
									if (tmpVar) {
										request.variables     = tmpVar;
										response.variables    = tmpVar;
									}
									next();
								} else {
									response.sendStatus(404);
								}
							}

						}
					}
				);
			} else {
				if (typeof next === 'function') {
					if (tmpVar) {
						request.variables     = tmpVar;
						response.variables    = tmpVar;
					}
					next();
				} else {
					response.sendStatus(404);
				}
			}

		} else if (request.cmd === 'listen') {
			worker.emit('listen');
		}
	}

	return Server;
}

exports.Server = app;
exports.createServer = app;
exports.app = app;
