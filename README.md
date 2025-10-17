# JS CSV Parser

A JavaScript class that can parse CSV (Comma-Separated Values) strings and stringify JavaScript arrays to CSV. It's an implementation of [RFC-4180](https://www.ietf.org/rfc/rfc4180.txt), the closest thing CSV has to a consistent standard. You can also customise the field delimiter and escape character to parse almost any file that follows the same general format.

## Quick summary of the spec

CSV is a text format for writing tables of data. Each row is separated by a newline and each column/field in a row is separated/delimited by a comma. All rows must have the same number of fields. The first row is optionally a set of headers defining each column. Here's a very simple CSV:

```
a,b,c
1,2,3
```

The first row is `a,b,c`, and the three fields are `a`, `b`, and `c`. After that comes a newline; the second row is `1,2,3`, and the three fields are `1`, `2`, and `3`.

Fields don't have to contain any text:

```
a,b,c
,,
```

In this case, the three fields on the second row are empty. This is why you don't end a row's last field with a comma—doing so adds an empty field to the end of the row.

If you want to use the row delimiter (newline) or field delimiter (by default, comma) inside a field then the entry must be escaped by wrapping it in escape characters (by default, doublequotes):

```
a,b,c
"1,1","2,2","3,3"
```

In this case, the three fields in the second row are `1,1`, `2,2`, and `3,3` (the escape characters themselves don't count as part of the field).

If you want to use the *escape character* in a field, then you need to escape the entire field *and* prefix each escape character with another escape character:

```
a,b,c
"1""1","""",3
```

In this case, the three fields in the second row are `1"1`, `"`, and `3`. That's right—if your field's a single escape character all by its lonesome, you need to write four in a row: one as the actual field entry, one to escape it, and one either side to escape the entire field.

That's about it. It's not an official spec—the "RFC" stands for "Request for Comments", meaning it's still open for debate—but it's the de facto standard because it covers most every way CSV is implemented.

One thing CSV totally lacks is data types. All data is text strings. Any further data processing must be done after converting a CSV string into another format.

### Terminal newlines

In RFC-4180, the entire table can optionally end with a newline. However, in a single-column CSV table it's impossible to tell the difference between the terminal newline and an empty field at the end of the table. Therefore, this parser assumes the CSV does *not* end with an extra newline.

## Instantiation

The module exports one class, `CSVParser`, which can be instantiated with or without an object containing options for customising the parser.

```js
import {
	parser as CSVParser,
} from "csv-parser.js";

const parser = new csvParser();
```

The module also includes a "verbose regex" template tag, which processes template strings for use with the vanilla `RegExp()` class. Tagged templates can include vertical and horizontal whitespace as well as JavaScript-format comments. See the regex patterns in the parser class for examples.

### Options

The constructor takes one argument, an object of options. Any options not included in the constructor argument use their default values.

|Option|Type|Default Value|
|-|-|-|
|`delimiter`|`string`, single-character (exceptions below)|`,`|
|`escaper`|`string`, single-character (exceptions below)|`"`|
|`stringifyNullUndef`|`boolean`|`true`|
|`escapeAllFields`|`boolean`|`false`|

The `delimiter` separates CSV fields in the same row.

The `escaper` escapes CSV fields that contain CSV special characters.

The `delimiter` and `escaper` must be single-character strings, may not both be the same character, and may not be any of the following: newline (`\n`), carriage return (`\r`), backslash (`\`), or right square bracket (`]`). The latter two are invalid because they make building the parser regex a pain in the ass.

`stringifyNullUndef` sets how `null` and `undefined` entries are parsed from JSON to CSV. If true, they'll be converted to string versions (`"null"` and `"undefined"`). If false, they'll be converted to empty strings (`""`).

`escapeAllFields` sets whether all fields in the data will be escaped automatically. If true, all fields will be escaped, even those that don't contain special characters. If false, only fields that contain special characters will be escaped.

Example instantiations:

```js
// instantiating with no custom options
const parser1 = new csvParser();
/*
	implemented options:
	{
		"delimiter": ",",
		"escaper": '"',
		"stringifyNullUndef": true,
	}
*/

// instantiating with some, but not all, custom options
const parser2 = new csvParser({
	"delimiter": "|",
	"stringifyNullUndef": false,
});
/*
	implemented options:
	{
		"delimiter": "|",
		"escaper": '"',
		"stringifyNullUndef": false,
	}
	the escaper wasn't set, so it defaults to a double-quote
*/
```

## Static methods

### `.objectify(headers, data)`

Takes an array of string headers/keys and an array of arrays of any data and returns the data mapped to an array of objects where each key is a header and each value is the data item at the same index.

Put simply, this allows you to convert the output of the public method `.parse()` into an array of objects, which makes for more readable code by allowing you to refer to values by key instead of index.

```js
CSVParser.objectify(
	[ "a", "b", "c" ],
	[
		[ 1, 2, 3 ],
		[ 4, 5, 6 ],
	]
);
/*
	outputs
	[
		{
			"a": 1,
			"b": 2,
			"c": 3,
		},
		{
			"a": 4,
			"b": 5,
			"c": 6,
		},
	]
*/
```

## Public methods

### `.parse(csv)`

Takes a CSV string and outputs an array of arrays of strings. The overall array is the table, each sub-array is a row/record, and each string is a column/field.

```js
parser.parse(`a,b,c
1,2,3`);
/*
	outputs
	[
		[ "a", "b", "c" ],
		[ "1", "2", "3" ],
	]
*/
```

The CSV must be valid: All fields that contain special characters be correctly escaped, and all rows must have the same number of fields. However, fields that don't need to be escaped *may* still be escaped.

### `.parseHeaders(csv)`

Takes a CSV string and outputs an array of strings. The output is the first row of the CSV; you can use this to extract only the headers.

```js
parser.parseHeaders("header 1,header 2
data 1,data 2");
// outputs [ "header 1", "header 2" ]
```

### `.stringify(arrays)`

Takes an array of arrays of items and outputs a CSV string, using the given delimiter and escaper. Each sub-array is converted to one row/record of the CSV, and each item is directly converted to a string and escaped if it contains any special characters (`\n`, `\r`, or the delimiter or escaper).

```js
parser.stringify([
	[ "a", "b" ],
	[ "entry", "entry, with comma" ],
]);
/*
	outputs
	'a,b
	entry,"entry, with comma"'
*/
```

The top-level array must be valid: Each row array must contain the same number of items.

### `.stringifyField(field)`

Takes a variable and outputs a CSV field string, using the given escaper if necessary.

```js
parser.stringifyField(123);
// outputs "123"

parser.stringifyField("comma, separated, text");
// outputs '"comma, separated, text"'
```

## Rejected features

### Why not parse CSV into an array of objects or vice versa?

It might be neater to input or output an array of objects, where the column headers are the keys, instead of an array of arrays, where the column headers are the first sub-array. That way, you could get columns directly by name while iterating over rows, instead of having to iterate over column indices to get the matching field from the headers row.

Unfortunately, converting to or from an array of objects is much more complex than converting to an array of row-arrays due to the differences between hashes and CSV strings and the quirks of the CSV format. For example: CSV headers are optional; a CSV file can contain multiple identical headers, while a hash can't have multiple identical keys; higher-order JS variables like arrays and objects need user-specific processing to be stringified correctly; and so on.

It's far simpler to just parse all rows the same way and leave processing to individual users, who know best how to fulfil their own requirements, which may be significantly more complex .

### Why not implement find/filter in the parser?

There's something neat about the idea of inputting a CSV and a find- or filter-style callback, and getting out just the arrays for the found/filtered row(s).

However, either your CSV's small enough that you get no real performance boost vs parsing *all* the data and using native JS array methods, *or* your CSV's so big it should be a proper database instead. Rather than half-assing everything, it's better if the class does one thing well and leaves other tasks to other classes.