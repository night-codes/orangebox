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

		var match = rule.exec(path);
		if (!match) return false;

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
		} else {
			var ret = {length: match.length};
			match.forEach(function(item, i) { ret[i] = item; });
			return ret;
		}
		return match;
	} else if (typeof rule === "string"){

		if (! (/[\*\?\+\:]/gi).test(rule)) {
			if (!sensitive) {
				path = path.toLowerCase();
				rule = rule.toLowerCase();
			}
			if (path === rule || (strict ? false : (path === rule + "/")) ) {
				return {"0": path, length: 1};
			} else {
				return false;
			}
		}
		if (rule === '' || rule === '*') {
			return  {"0": path, length: 1};
		}

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
			sensitive: sensitive ? sensitive : false,
			strict: strict ? strict : false,
			end: false
		}), keys);


	}
	return false;
}

module.exports = pathTest;
