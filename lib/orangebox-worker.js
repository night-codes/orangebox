var cluster      = require('cluster');
var http         = require('http');
var forwarded    = require('forwarded-for');
var querystring  = require('querystring');
var microtime    = require('microtime-nodejs');
var cookieParser = require('cookie-parser')();
var fileServer   = require('node-static');
var url          = require('url');
var file         = false;
var aliases      = {};

String.prototype.hCapitalize = function() {
	return this.split("-").map(
		function(el, i) {
			return el.charAt(0).toUpperCase() + el.substring(1);
		}
	).join("-");
};


function processRequest(request) {
	var host = request.headers.host.split(':');
	if (host[0]) request.host = host[0];
	if (host[1]) request.port = host[1];

	var query = request.url.split('?');
	var params = query[0];
	query.splice(0,1);

	request.ip = forwarded(request, request.headers).ip;
	// request.ip = ip.toLong(req.header('x-forwarded-for') || req.headers["X-Forwarded-For"] || req.client.remoteAddress);
	request.query = querystring.parse(query.join('?'));
	request.queryString = query.join('?');
	request.baseUrl = params;

	// aliases
	if (aliases[request.baseUrl])  {
		request.originalUrl = request.url;
		request.url = aliases[request.baseUrl] + (request.queryString.length ? '?' + request.queryString : '');
	}
}

function processPost(request, response, callback) {
	var queryData = "";
	if(typeof callback !== 'function') return;

	if(request.method == 'POST') {
		request.on('data', function(data) {
			queryData += data;
			if(queryData.length > 1e6) {
				queryData = "";
				response.writeHead(413, {'Content-Type': 'text/plain'}).end();
				request.connection.destroy();
			}
		});

		request.on('end', function() {
			request.body = querystring.parse(queryData);
			callback();
		});

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

		function noFile(){
			processPost(request, response, function() {

				var reqId = Math.random().toString(36).substring(2,16);

				process.once('ok_' + reqId, function(ret) {
					ret._headers["x-time"] = (microtime.nowDouble() - saveStart).toFixed(6);
					if (204 == ret.statusCode || 304 == ret.statusCode) {
						if (ret._headers['content-type']) delete ret._headers['content-type'];
						if (ret._headers['content-length']) delete ret._headers['content-length'];
						if (ret._headers['transfer-encoding']) delete ret._headers['transfer-encoding'];
						ret.data = '';
					}

					var headers = {};
					Object.keys(ret._headers).forEach(function(el) {
						headers[el.hCapitalize()] = ret._headers[el];
					});


					if (ret.sendFile && ret.filePath) {
						ret.data = '';
						if (file) {
							file.serveFile(ret.filePath, ret.statusCode, headers, request, response);
						} else {
							response.writeHead(405);
							response.end("File server is not running!");
						}
					} else {
						response.writeHead(ret.statusCode, headers);
						if (ret.type == 'Buffer') {
							ret.data = new Buffer(ret.data, 'base64');
						}
						response.end(ret.data);
					}

				});

				cookieParser(request, response, function() {
					process.send({
						headers          : request.headers,
						url              : request.url,
						originalUrl      : request.url + "?" + request.queryString,
						host             : request.host,
						port             : request.port,
						path             : request.baseUrl,
						baseUrl          : request.baseUrl,
						originalUrl      : request.originalUrl,
						httpVersionMajor : request.httpVersionMajor,
						httpVersionMinor : request.httpVersionMinor,
						trailers         : request.trailers,
						httpVersion      : request.httpVersion,
						method           : request.method,
						body             : request.body,
						protocol         : request.protocol,
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
		if (file) {
			file.serve(request, response, function (e, res) {
				if (e && (e.status === 404)) noFile();
	        });
		} else {
			noFile();
		}
	});

	process.on('message', function(ret) {
		if (ret.cmd) {

			switch (ret.cmd) {

				case 'send':
					process.emit('ok_' + ret.response.reqId, ret.response);
					break;

				case 'sendFile':
					ret.response.sendFile = true;
					process.emit('ok_' + ret.response.reqId, ret.response);
					break;

				case 'listen':
					var _listen = function() { process.send({"cmd": "listen"}); };
					if (ret.listen.host) {
						server.listen(ret.listen.port, ret.listen.host, _listen);
					} else {
						server.listen(ret.listen.port, _listen);
					}
					break;

				case 'fileServer':
					file = new fileServer.Server(ret.path, { cache: 7800, serverInfo: "OrangeBox"});
					break;


				case 'alias':
					aliases[ret.alias] = ret.path;
					break;

				default:
					console.warn("Undefined message" + ret);
					break;

			}
		}
	});

	function gracefulExit() {
		server.removeAllListeners();
	}
	process.once('SIGINT', gracefulExit).once('SIGTERM', gracefulExit);
}


