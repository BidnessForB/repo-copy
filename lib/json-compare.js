/*jslint esversion: 6 */
const diff = require('deep-diff');
const HashMap = require('hashmap');

const JSONCompare = function () {};
const kindMap = new HashMap();
kindMap.set('N','New element');
kindMap.set('D','Missing element');
kindMap.set('E','Different values');
kindMap.set('A','Array change');


JSONCompare.prototype.compareJSON = function (lhs, rhs) {
	const diffs = diff(lhs, rhs);
	if(diffs && diffs.length == 0)
	{
		return null;
	}

	let difference;
	const output = {};
	output.diffs = [];
	let path = '';

	for (let i = 0; i < diffs.length; i++) {
		difference = diffs[i];
			if (difference.path) {
				path = '';
				for (let y = 0; y < difference.path.length; y++) {
					path = path + difference.path[y] + '/';
				}
			}
			output.diffs.push({
				type: kindMap.get(difference.kind),
				path
			});
	}
	return output.diffs.length > 0 ? output : null;
};

module.exports = new JSONCompare();
