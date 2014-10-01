var pathToRegexp = require('path-to-regexp');
var util         = require('util');

/**
 * Comparison of the path with a mask.
 *
 * @param  {String} path Inspected path, for example: "j:test-test:test:m:1:"
 * @param  {String} rule Rule-mask to check, for example: "j:*:m:*:"
 * @param  {Object} keys
 * @param  {Boolean} sensitive
 * @param  {Boolean} strict
 */
function pathTest(path, rule, keys, sensitive, strict){
	keys = keys || [];

	if (util.isRegExp(rule)) {
		if(!rule.test(path)) return false;
		var match = rule.exec(path);
		if (!match) match = [path];
		if (match.length > 1) {
			match.splice(0,1);
		}
		if (Array.isArray(keys)) {
			var m = match;
			match = {length: 0};
			keys.forEach(function(el, i) {
				if (m[i]) {
					match[el] = m[i];
					match.length++;
				}
			});
		}
		return match;
	} else if (typeof rule === "string"){

		if (! (/[\*\?\+\:]/gi).test(rule)) {
			if (path === rule) {
				return [path];
			} else {
				return false;
			}
		}
		if (rule === '' || rule === '*') return [path];

		keys = [];
		var i = 0;
		return pathTest(path, pathToRegexp(rule.replace(/(\*|\?|\:[a-zA-Z0-9_]*)/gi, function(str) {
			if (str.indexOf(':') != -1) {
				keys.push(str.substring(1));
				return str;
			} else {
				i++;
				keys.push(i - 1);
				return ':' + (i - 1);
			}
		}), [], {
			sensitive: (typeof sensitive != 'undefined') ? sensitive : false,
			strict: (typeof strict != 'undefined') ? strict : true,
			end: false
		}), keys);


	}
	return false;
}

module.exports = pathTest;
