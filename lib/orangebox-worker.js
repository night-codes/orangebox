var async         = require('async');
var cluster       = require('cluster');
var cookieParser  = require('cookie-parser')();
var fileServer    = require('node-static');
var forwarded     = require('forwarded-for');
var http          = require('http');
var microtime     = require('microtime-nodejs');
var multiparty    = require('multiparty');
var querystring   = require('querystring');
var url           = require('url');
var fServer       = new fileServer.Server('/', { cache: 7800, serverInfo: 'OrangeBox'});

var statics       = [];
var staticPath    = [];
var aliases       = {};
var vars          = {};
var engines       = {swig: require('swig')};

String.prototype.hCapitalize = function () {
	return this.split('-').map(
		function (el) {
			return el.charAt(0).toUpperCase() + el.substring(1);
		}
	).join('-');
};


function processRequest (request) {
	if (request.headers && typeof request.headers.host === 'string') {
		var host = request.headers.host.split(':');
		if (host[0]) request.host = host[0];
		if (host[1]) request.port = Number(host[1]) || 8080;
	} else {
		request.host = 'localhost';
		request.port = 8080;
	}

	var query = request.url.split('?');
	var path = query[0];
	query.splice(0,1);

	// request.ip = req.header('x-forwarded-for') || req.headers['X-Forwarded-For'] || req.client.remoteAddress;
	request.ip = forwarded(request, request.headers).ip;

	request.query = querystring.parse(query.join('?'));
	request.queryString = query.join('?');
	request.path = path;

	// aliases
	for (var a in aliases) {
		if (request.path.indexOf(a) === 0)  {
			request.originalUrl = request.url;
			request.url = request.path.replace(a, aliases[a]) + (request.queryString.length ? '?' + request.queryString : '');
		}
	}
}

function processPost (request, response, callback) {
	var queryData = '';
	if (typeof callback !== 'function') return;

	if (request.method === 'POST') {
		if (typeof request.headers["content-type"] === 'string' &&
		 request.headers["content-type"].indexOf('multipart/form-data') !== -1) {
		 	var options = {};
		 	var alss = {
				'multiparty maxfilessize' : 'maxFilesSize',
				'multiparty autofiles'    : 'autoFiles',
				'multiparty uploaddir'    : 'uploadDir'
		 	};
		 	for (var it in vars) {
		 		if (it in alss) options[alss[it]] = vars[it];
		 	}
			var form = new multiparty.Form(options);
			var _err = false, _cerr = false;

			form.on('error', function(err) {
				if (!vars['multiparty catcherror']) {
					_err = true;
					response.writeHead(err.statusCode || 500, {'Content-Type': 'text/plain'});
					response.end(err.message);
				} else {
					_cerr = err;
					_cerr.msg = err.message;
				}
			});

			form.parse(request, function(err, body, files) {
				for (var el in body) {
					if (Array.isArray(body[el]) && body[el].length === 1) {
						body[el] = body[el][0];
					}
				}
				if (!_err) {
					if (_cerr) {
						request.body = {
							'multiparty_error' : _cerr
						};
					} else {
						request.body = body;
						request.files = files;
					}
					callback();
				}
			});
		} else {
			request.on('data', function(data) {
				queryData += data;
				if(queryData.length > 1e6) {
					queryData = '';
					response.writeHead(413, {'Content-Type': 'text/plain'});
					response.end();
					request.connection.destroy();
				}
			});

			request.on('end', function() {
				request.body = querystring.parse(queryData);
				callback();
			});
		}
	} else {
		request.body = {};
		callback();
	}
}




if (!cluster.isMaster) {


	// Worker processes have a http server.
	var server = http.Server(function(request, response) {
		var saveStart = microtime.nowDouble();
		processRequest(request);

		function notFile(){
			processPost(request, response, function() {

				var reqId = Math.random().toString(36).substring(2,16);

				process.once('ok_' + reqId, function(ret) {
					ret._headers['x-time'] = (microtime.nowDouble() - saveStart).toFixed(6);
					if (204 === ret.statusCode || 304 === ret.statusCode) {
						if (ret._headers['content-type']) delete ret._headers['content-type'];
						if (ret._headers['content-length']) delete ret._headers['content-length'];
						if (ret._headers['transfer-encoding']) delete ret._headers['transfer-encoding'];
						ret.data = '';
					}

					var headers = ret.subHeaders || {};
					Object.keys(ret._headers).forEach(function(el) {
						headers[el.hCapitalize()] = ret._headers[el];
					});

					if (ret.sendFile && ret.filePath) {
						ret.data = '';
						var r = fServer.serveFile(ret.filePath, ret.statusCode, headers, request, response);
						fServer.root='/';
						r.on("error", function() {
							response.writeHead(404, {'Content-Type': 'text/html'});
							response.end('<h2>404 Not Found</h2>Requested resource could not be found.');
							r.removeAllListeners();
						}).on("success", function() {
							r.removeAllListeners();
						});
					} else {
						response.writeHead(ret.statusCode, headers);
						if (ret.Type === 'Buffer') {
							ret.data = new Buffer(ret.data, 'base64');
						}
						response.end(ret.data);
					}

				});

				cookieParser(request, response, function() {
					process.send({
						files            : request.files,
						headers          : request.headers,
						orangebox        : '0.3.2',
						url              : request.url,
						host             : request.host,
						hostname         : request.host,
						port             : request.port,
						path             : request.path,
						baseUrl          : request.path,
						httpVersionMajor : request.httpVersionMajor,
						httpVersionMinor : request.httpVersionMinor,
						trailers         : request.trailers,
						httpVersion      : request.httpVersion,
						method           : request.method,
						body             : request.body,
						protocol         : request.protocol,
						secure           : 'https' === request.protocol,
						post             : request.post,
						query            : request.query,
						queryString      : request.queryString,
						ip               : request.ip,
						cookies          : request.cookies,
						signedCookies    : request.signedCookies,
						reqId            : reqId,
						pid              : process.pid,
						connection       : {
							encrypted     : request.connection.encrypted,
							readable      : request.connection.readable,
							writable      : request.connection.writable,
							destroyed     : request.connection.destroyed,
							allowHalfOpen : request.connection.allowHalfOpen,
							bytesRead     : request.connection.bytesRead
						}
					});
				});

			});
		}
		if (statics.length) {
			var pathname = url.parse(request.url).pathname;
			var aFlr = statics.filter(function(el,i){
				return pathname !== '' && pathname.indexOf(staticPath[i]) === 0;
			});
			if (!aFlr.length) {
				aFlr = statics.filter(function(){
					return pathname === '';
				});
			}
			async.eachSeries(aFlr, function(el, callback) {
				el.serve(request, response, function (e) {
					if (!e || e.status !== 404)
						callback(true);
					else
						callback(null);
				});
			}, function(err){
				if (!err) notFile();
			});
		} else {
			notFile();
		}
	});

	process.on('message', function(ret) {
		if (ret.cmd) {

			switch (ret.cmd) {

				case 'send':
					process.emit('ok_' + ret.response.reqId, ret.response);
					break;

				case 'sendFile':
					if (ret.options) {
						if (ret.options.root) {
							fServer.root = ret.options.root;
						}
						if (ret.options.headers) {
							ret.response.subHeaders = ret.options.headers;
						}
					}
					ret.response.sendFile = true;
					process.emit('ok_' + ret.response.reqId, ret.response);
					break;

				case 'sendRender':

					if (ret.engine === 'swig') {
						engines.swig.setDefaults({ autoescape: ret.response.variables['view autoescape'] });
						engines.swig.setDefaultTZOffset(ret.response.variables['view timezone']);
					}

					engines[ret.engine].renderFile(ret.viewsPath + '/' + ret.view + '.html' , ret.data || {}, function (err, output) {
						if (err) {
							console.error(err);
							ret.response.statusCode = 500;
						} else {
							ret.response.data = output;
						}
						process.emit('ok_' + ret.response.reqId, ret.response);
					});
					break;

				case 'setVar':
					vars[ret.name] = ret.value;
					break;

				case 'listen':
					var _listen = function() { process.send({'cmd': 'listen'}); };
					if (ret.listen.host) {
						server.listen(ret.listen.port, ret.listen.host, _listen);
					} else {
						server.listen(ret.listen.port, _listen);
					}
					break;

				case 'fileServer':
					statics.push(new fileServer.Server(ret.path, { cache: 7800, serverInfo: 'OrangeBox'}));
					staticPath.push(ret.routePath);
					break;

				case 'alias':
					aliases[ret.alias] = ret.path;
					break;

				default:
					console.warn('Undefined message' + ret);
					break;

			}
		}
	});

	var gracefulExit = function () {
		server.removeAllListeners();
	};
	process.once('SIGINT', gracefulExit).once('SIGTERM', gracefulExit);
}


