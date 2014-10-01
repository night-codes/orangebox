var cluster     = require('cluster');
var async       = require('async');
var pathTest    = require("./pathTest");
var cookieObj   = require( "cookies" );
var fs          = require('fs');
var httpMethods = require('methods');

/* Reserved "all" and "use" */
httpMethods.push('all', 'use');


function app() {

	// Default arguments
	var count     = 4;
	var callback  = null;

	var workers   = [];
	var routes    = [];
	var listen    = 0;
	var engines   = {};
	var paramsDis = {};
	var params    = {
		'env'                   : (process.env.NODE_ENV || 'development'),
		'subdomain offset'      : 2,
		'case sensitive routing': false,
		'strict routing'        : false,
		'view engine'           : '',
		'views'                 : process.cwd() + '/views',
		'view cache'            : true,
		'x-powered-by'          : 'OrangeBox'
	};

	// Default router
	var Router    = { server : Server };

	// Default server
	var Server    = {
		alias      : _alias,
		set        : _set,
		get        : _get,
		load       : _load,
		enable     : _enable,
		engine     : _engine,
		disable    : _disable,
		enabled    : _enabled,
		disabled   : _disabled,
		listen     : _listen,
		fileServer : _fileServer,
		Router     : _Router
	};

	// Filling methods to Router
	httpMethods.forEach(function(el) {
		Router[el] = function(){
			var route = typeof arguments[0] == 'function' ?
				'*' : arguments[0];

			for (var i = 0; i < arguments.length; i++) {
				if(typeof arguments[i] == 'function') {
					routes.push({
						route: route,
						type: el,
						callback: arguments[i]
					});
				}
			}
		};
	});
	Server.use = Router.use;


	/**
	 * Require the directory to Router
	 *
	 * @param  {String} name
	 * @param  {String} path Required directory path
	 */
	function _load(name, path) {
		if (name == 'server' || httpMethods.indexOf(name) != -1) {
			console.warn("Error: Router." + name + " is reserved method");
		} else {
			Router[name] = {};
			fs.readdirSync(path).forEach(function(el, i) {
				// Require only .js files
				if (/.*\.js$/gi.test(el)) {
					var module = require(path + "/" + el);
					if (typeof module == 'function') {
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
	function _set(name, value) {

		if (!name || !value) {
			return false;
		}
		name = name.toLowerCase();
		if (paramsDis[name]) {
			delete paramsDis[name];
		}
		params[name] = value;
		return true;
	}


	/**
	 * Get server variable
	 *
	 * @param  {String} name Server variable name
	 * @return {Mixed}       Server variable  value
	 */
	function _get(name) {
		if(typeof name == 'function' || arguments.length > 1) {
			Router.get.apply(this, arguments);
		}
		name = name.toLowerCase();
		return params[name];
	}


	/**
	 * Enable server variable
	 *
	 * @param  {String} name Server variable name
	 */
	function _enable(name) {
		if (paramsDis[name]) {
			params[name] = paramsDis[name];
			delete paramsDis[name];
		}
	}


	/**
	 * Disable server variable
	 *
	 * @param  {String} name Server variable name
	 */
	function _disable(name) {
		if (params[name]) {
			paramsDis[name] = params[name];
			delete params[name];
		}
	}


	/**
	 * Enabled test for server variable
	 *
	 * @param  {String} name Server variable name
	 * @return {Boolean}
	 */
	function _enabled(name) {
		return typeof params[name] != 'undefined';
	}


	/**
	 * Disabled test for server variable
	 *
	 * @param  {String} name Server variable name
	 * @return {Boolean}
	 */
	function _disabled(name) {
		return typeof paramsDis[name] != 'undefined';
	}


	/**
	 * Router returner
	 *
	 * @return {Object} Router
	 */
	function _Router() {
		return Router;
	}


	/**
	 * Set view engine
	 *
	 * @param  {String}   type View type
	 * @param  {Function} func Handler for this view type
	 * @return {Boolean}
	 */
	function _engine(type, func) {
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
	function _isSended(description) {
		var response = this;
		if (!response._headersSent){
			return false;
		}
		console.error("Can't set headers after they are sent!" +
			(description ? (' ' + description) : ''));
		return true;
	}


	/**
	 * Set router alias for path
	 *
	 * @param  {String} alias
	 * @param  {String} path
	 */
	function _alias(alias, path) {
		workers.forEach(function(el) {
			el.send({cmd: "alias", alias: alias, path: path});
		});
	}


	/**
	 * Start file server for specified directory
	 *
	 * @param  {[type]} path
	 */
	function _fileServer(path) {
		workers.forEach(function(el) {
			el.send({cmd: "fileServer", path: path});
		});
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
	function _listen(port, host, callback){
		if (typeof host == 'function') {
			callback = host;
			host = false;
		}
		var listen = 0;
		workers.forEach(function(el) {
			var ls = {port: port};
			if(host) ls.host = host;
			el.send({cmd: "listen", listen: ls});

			if (callback) {
				el.once('listen', function() {
					listen++;
					if (listen == count) {
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
	function _send(data, encoding){
		var response = this;
		if (!response.isSended("_send")){
			response.write(data, encoding);
			response._headersSent = true;
			workers.forEach(function(el) {
				if(el.process.pid == response.pid) {
					el.send({cmd: "send", response: response});
				}
			});
		}
		return response;
	}


	/**
	 * Send file to client
	 *
	 * @param  {String} path  File path in fileServer directory
	 */
	function _sendFile(path){
		path = encodeURI(path);
		var response = this;
		if (!response.isSended("_sendFile")){
			response.filePath = path;
			response._headersSent = true;
			workers.forEach(function(el) {
				if(el.process.pid == response.pid) {
					el.send({cmd: "sendFile", response: response,
						path: path});
				}
			});
		}
		return response;
	}


	/**
	 * This sends a chunk of the response body. This method may be called
	 * multiple times to provide successive parts of the body.
	 * Can be a string, object or a buffer
	 *
	 * @param  {Mixed}   data
	 * @param  {String}  encoding
	 */
	function _write(data, encoding){
		var response = this;
		if (!response.isSended("_write")){
			if (Buffer.isBuffer(data)) {
				data = data.toString('base64');
				encoding = 'base64';
				response.type = 'Buffer';
			}
			if (typeof data == "object") {
				data = JSON.stringify(data);
			}

			if (typeof data == 'string') {
				response.data += data;
				if (encoding) response.encoding = encoding;
			}
		}
		return response;
	}


	/**
	 * Sets a single header value for implicit headers. If this header
	 * already exists in the to-be-sent headers, its value will be
	 * replaced. Use an array of strings here if you need to send multiple
	 * headers with the same name.
	 *
	 * @param {String} name
	 * @param {String} value
	 */
	function _setHeader(name, value) {
		var response = this;
		var headers = response._headers;
		if (!response.isSended("_setHeader")){
			if (name.toLowerCase() != 'set-cookie') {
				value = encodeURI(value);
				headers[name.toLowerCase()] = value;
			} else {
				var c = value.split(";")[0].split("=")[0];
				value = encodeURI(value);
				if (typeof headers['set-cookie'] == 'undefined') {
					headers['set-cookie'] = [value];
				} else {
					headers['set-cookie'].forEach(function(el, i) {
						if (c == el.split(";")[0].split("=")[0]) {
							headers['set-cookie'][i] = value;
						}
					});
				}
			}
		}
		return response;
	}


	function _cookie(name, value, opts) {
		var response = this;
		if (typeof value == 'object') {
			value = JSON.stringify(value);
		}
		response.cook.set(name, encodeURI(value), opts);
		return response;
	}


	/**
	 * Reads out a header that's already been queued but not sent to the
	 * client. Note that the name is case insensitive. This can only be
	 * called before headers get implicitly flushed.
	 *
	 * @param  {String} name
	 */
	function _getHeader(name) {
		var response = this;
		if (response._headers[name.toLowerCase()] != undefined) {
			return response._headers[name.toLowerCase()];
		}
		return undefined;
	}


	/**
	 * Get request header by name
	 *
	 * @param  {String} name
	 * @return {String}
	 */
	function _header(name) {
		var request = this;
		if (request.headers[name.toLowerCase()] != undefined) {
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
		var response = this;
		var engine = response.getVariable('view engine');
		if (engines[engine]) {
			var viewsPath = response.getVariable('views');
			var viewsCache = response.getVariable('view cache');
			engines[engine](viewsPath + "/" + view + ".html" , data || {},
			  function (err, output) {
				if (err) {
					console.error(err);
					response.setHeader('Content-Type', 'text/html');
					response.status(500);
					response.send("<h2>500 Internal Server Error</h2>We're " +
					  "sorry, but an unhandled error occurred on the server");

					if (typeof callback == 'function') {
						callback(err, output);
					}
				} else {
					response.send(output);
					if (typeof callback == 'function') {
						callback(null, output);
					}
				}
			});
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
		if (!response.isSended("_removeHeader")){
			if (response._headers[name.toLowerCase()])
				delete response._headers[name.toLowerCase()];
		}
		return response;
	}


	/**
	 * Sends a response header to the request. The status code is a
	 * 3-digit HTTP status code, like 404. The last argument, headers, are
	 * the response headers. Optionally one can give a human-readable
	 * reasonPhrase as the second argument.
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
		if (!response.isSended("_writeHead")){
			response.statusCode = statusCode;
			if (!headers && reasonPhrase) headers = reasonPhrase;
			if (!headers || !statusCode) return response;
			for (key in headers) {
				response.setHeader(key, headers[key]);
			}
		}
		return response;
	}


	/**
	 * Send the specified URL string as-is to the browser in the Location
	 * header, without any validation or manipulation, except in case of
	 * back. Browsers take the responsibility of deriving the intended URL
	 * from the current URL or the referring URL, and the URL specified in
	 * the Location header; and redirect the user accordingly.
	 *
	 * @param  {String} adress
	 * @return {[type]}
	 */
	function _redirect(adress) {
		var response = this;
		response.writeHead(302, {'Location': adress});
		response.end();
		return response;
	}


	/**
	 * Chainable alias of node's res.statusCode. Use this method to set
	 * the HTTP status for the response.
	 *
	 * @param  {Number} statusCode
	 */
	function _status(statusCode) {
		if (typeof statusCode != 'number') {
			console.warn("StatusCode must be a Number!");
			return false;
		}
		var response = this;
		if (!response.isSended("_status")){
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
	function _sendStatus(statusCode) {
		var response = this;
		if (!response.isSended("_status")){
			response.status(statusCode).send("" + statusCode);
		}
		return response;
	}


	/**
	 * Received http request...
	 * @param  {[type]} request [description]
	 * @return {[type]}         [description]
	 */
	function _message(request) {

		var worker = this;
		request.server = Server;

		if (!request.cmd) {

			var response = {
				getVariable  : _get,
				setVariable  : _set,
				send         : _send,
				sendFile     : _sendFile,
				end          : _send,
				redirect     : _redirect,
				write        : _write,
				writeHead    : _writeHead,
				isSended     : _isSended,
				set          : _setHeader,
				setHeader    : _setHeader,
				get          : _getHeader,
				getHeader    : _getHeader,
				render       : _render,
				header       : _setHeader,
				cookie       : _cookie,
				removeHeader : _removeHeader,
				status       : _status,
				pid          : request.pid,
				reqId        : request.reqId,
				statusCode   : 200,
				_headers     : {"x-powered-by": params["x-powered-by"]},
				headersSent  : false,
				data         : '',
				encoding     : 'utf-8',
				type         : 'string',
				server       : Server
			};
			Object.defineProperty(response, "cook", {
				enumerable: false,
				writable: true
			});
			response.cook = new cookieObj(request, response);
			request.header = _header;


			if (callback) {
				Server.use('*', callback);
			}

			var _pregs = [], _uses = [];
			request.variables = params;
			routes.forEach(function(item, i){
				var t = pathTest( request.baseUrl, item.route, [],
					params['case sensitive routing'],
					params['strict routing']);

				if (t && (item.type == "all" || item.type == "use" ||
				  item.type == request.method.toLowerCase() )) {
					_uses.push(function(request, response, callback) {
						if (!response._headersSent) {
							if(Array.isArray(t)) {
								request.params = {length: t.length};
								t.forEach(function(item, i) {
									request.params[i] = item;
								});
							} else {
								request.params = t;
							}
							item.callback(request, response, callback);
						} else {
							callback(null);
						}
					});
					_pregs.push(t);
				}
			});

			// вызываем юзы
			var done = false;

			setTimeout(function remover(err, d) {
				if (response._headersSent && _uses) {
					_pregs = null;
					_uses  = null;
				}
				if (_uses) setTimeout(remover, 1000);
			}, 1000);
			async.applyEachSeries( _uses, request, response, function(){
				if(!response._headersSent && !done) {
					response.setHeader('Content-Type', 'text/html');
					response.status(404).send("<h2>404 Page not found</h2>" +
						"The URL you requested was not found");
				}
				if (_uses) {
					_pregs = null;
					_uses  = null;
				}
			});

		} else if (request.cmd == 'listen') {
			worker.emit('listen');
		}
	}


	// *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *  *
	// CLUSTER FORKS

	var old = cluster.settings.exec;
	cluster.setupMaster();
	cluster.settings.exec = __dirname + "/orangebox-worker.js";
	for (var i=0; i<arguments.length; i++) {
		if (typeof arguments[i] == 'function') callback = arguments[i];
		if (typeof arguments[i] == 'number') count = arguments[i];
	}

	for (var j = 0; j < count; j++) {
		var worker = cluster.fork();
		worker.on('message', _message);
		workers.push(worker);
	}

	cluster.settings.exec = old;
	return Server;
}

exports.Server = app;
exports.createServer = app;
exports.app = app;

