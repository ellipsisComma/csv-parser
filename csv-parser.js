// verbose regex template literal tag
// remove newlines, all whitespace at the start and end of lines, and JS-format code comments
// to include any of those things (e.g. "//" as plain text in the pattern, not the start of a comment)
// wrap each character in square brackets. for example: // -> [/][/]
function verbose(strings, ...subs) {
	return [strings.raw[0], subs.map((sub, i) => sub + strings.raw[i + 1]).join(``)].join(``)
		.replaceAll(/(?:^|\s)(?:\/\/.*|\/\*[\s\S]*?\*\/)/gm, ``)
		.replaceAll(/^\s+|\s+$|\n|\r/gm, ``);
}

/*
CSV/DSV parser

static methods:
	objectify

public methods:
	parse
	parseHeaders
	stringify
	stringifyField
*/
class CSVParser {
	// map outputs of parser.parse() to an array of objects
	static objectify(headers, data) {
		// guards
		if (!Array.isArray(headers) || !headers.every(header => typeof header === `string`)) {
			console.error(`headers submitted to CSVParser.objectify() must be an array of strings`);
			return;
		}
		if (!Array.isArray(data) || !data.every(Array.isArray)) {
			console.error(`data submitted to CSVParser.objectify() must be an array of arrays`);
			return;
		}
		if (data.some(item => item.length !== headers.length)) {
			console.error(`All data submitted to CSVParser.objectify() must have an equal number of fields to the headers array`);
			return;
		}

		return data.map(item => {
			const obj = {};
			for (let i = 0; i < headers.length; i++) obj[headers[i]] = item[i];
			return obj;
		});
	}

	#delimiter;
	#escaper;
	#unescapedField;
	#escapedField;
	#rowRegex;
	#fieldRegex;
	#escapeRegex;
	#stringifyNullUndef;

	constructor ({delimiter = `,`, escaper = `"`, stringifyNullUndef = true} = {}) {
		// validate special characters
		for (const [name, ch] of Object.entries({
			"delimiter": delimiter,
			"escaper": escaper,
		})) {
			if (typeof ch !== `string` || ch.length !== 1) {
				throw `${name} must be a length-1 string.`;
			}
			if (ch === `\n` || ch === `\r`) {
				throw `${name} must not be newline ("\\n") or carriage return ("\r").
Newline characters are reserved for delimiting CSV rows.`;
			}
			if (ch === `\\` || ch === `]`) {
				throw `${name} must not be backslash ("\\") or right square bracket ("]").
These make safely escaping the parser regex a pain in the ass.`;
			}
		}
		if (delimiter === escaper) {
			throw `delimiter and escaper must not be identical.`;
		}
		this.#delimiter = delimiter;
		this.#escaper = escaper;

		// prepare various regex patterns
		this.#unescapedField = String.raw`[^${this.#escaper}${this.#delimiter}\r\n]*`;
		this.#escapedField = String.raw`(?:[^${this.#escaper}]|${`[${this.#escaper}]`.repeat(2)})*`;
		this.#rowRegex = new RegExp(verbose`
			^(?:
				${this.#unescapedField}
				|
				[${this.#escaper}]${this.#escapedField}[${this.#escaper}]
				|
				[${this.#delimiter}]
			)*$
			`, `gm`);
		this.#fieldRegex = new RegExp(verbose`
			(?<=
				^|[${this.#delimiter}]
			)
			(?:
				(?<unescaped>${this.#unescapedField})
				|
				[${this.#escaper}](?<escaped>${this.#escapedField})[${this.#escaper}]
			)
			(?=
				$|[${this.#delimiter}]
			)
			`, `gm`);
		this.#escapeRegex = new RegExp(String.raw`[\r\n${this.#delimiter}${this.#escaper}]`);

		// process extra
		this.#stringifyNullUndef = !!stringifyNullUndef;
	}

	/* ------------
	PARSING INTO JS
	------------ */

	// get fields from a given row
	// String -> Array of Strings
	#fieldsFromRow(row) {
		return [...row.matchAll(this.#fieldRegex)]
			.map(field =>
				field.groups.unescaped
				??
				field.groups.escaped.replaceAll(this.#escaper.repeat(2), this.#escaper)
			);
	}

	// get field data for first row (header row, if CSV has headers)
	// String -> Array of Strings
	parseHeaders(csv) {
		return this.#fieldsFromRow(csv.match(this.#rowRegex)[0]);
	}

	// get an array of row arrays of field strings
	// String -> Array of Arrays of Strings
	parse(csv) {
		try {
			const rows = csv.match(this.#rowRegex);

			if (rows === null) throw `CSV contains no valid rows.`;

			const arrays = rows.map(row => this.#fieldsFromRow(row));

			// validate CSV
			// check that the entire consists of properly-delimited unescaped and/or escaped fields
			const validRowLength = csv.match(this.#rowRegex)
				.map(row => row.length)
				.reduce((total, row) => total + row, 0);
			if (csv.length !== validRowLength + rows.length - 1) { // + arrays.length - 1 means add a newline for each record
				throw `All records must be valid and the CSV string must not end with a newline.`;
			}
			// check that all records/rows have the same number of fields
			const fieldCount = arrays[0].length;
			for (const array of arrays) if (array.length !== fieldCount) {
				throw `All records must have the same number of fields.`;
			}

			return arrays;
		} catch (error) {
			console.error(error);
		}
	}

	/* -------------
	PARSING INTO CSV
	------------- */

	// escape a field string that contains any special characters
	// String -> String
	#escapeField(field) {
		try {
			return `${this.#escaper}${field.replaceAll(this.#escaper, this.#escaper.repeat(2))}${this.#escaper}`;
		} catch (error) {
			console.error(error);
		}
	}

	// stringify any data and escape that string using the escape character if need be
	// * -> String
	stringifyField(field) {
		if (
			!this.#stringifyNullUndef
			&&
			(field === null || field === undefined)
		) return ``;

		const stringifiedField = String(field);

		return this.#escapeRegex.test(stringifiedField)
			? this.#escapeField(stringifiedField)
			: stringifiedField;
	}

	// parse an array of row arrays into a CSV string (all entries will be coerced to string)
	// Array of Arrays of * -> String
	// [any falsy value] -> String
	stringify(arrays) {
		try {
			// if input is falsy, return empty string
			if (!arrays) return ``;

			// validate the data types
			if (!Array.isArray(arrays) || arrays.length === 0) {
				throw `Data must be an array with at least one item.`;
			}
			const fieldCount = arrays[0].length;
			for (const array of arrays) if (!(Array.isArray(array) && array.length === fieldCount)) {
				throw `All records must be arrays with the same number of items.`;
			}

			return arrays.map(array =>
				array.map(field => this.stringifyField(field)).join(this.#delimiter)
			).join(`\n`);
		} catch (error) {
			console.error(error);
		}
	}
}

export {
	CSVParser,
};
