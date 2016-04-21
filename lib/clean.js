var recursive = require('recursive-readdir');
var winston = require('winston');
var Command = require('ronin').Command;
var async = require('async');
var path = require('path');

var EXTENSIONS = exports.EXTENSIONS = [
    'aux',
    '4ct',
    '4tc',
    'oc',
    'md5',
    'dpth',                    
    'out',
    'jax',
    'idv',
    'lg',
    'tmp',
    'xref',
    'log',
    'auxlock',
    'dvi',
    'pdf'
];

var ALL_EXTENSIONS = exports.ALL_EXTENSIONS = [
    'html',
    'png',
    'svg'
];

function isCleanableFile( filename, callback ) {
    callback (EXTENSIONS.indexOf(path.extname( filename ).replace(/^\./,'')) >= 0);
}

/** @function determineFilesToClean examines all the files in the given directory (and its subdirectories) and calls callback with a list of files that can be "safely" deleted */
exports.determineFilesToClean = function( directory, callback ) {
    async.waterfall([
	// Fetch all the possible filenames
	function(callback) {
	    winston.debug( "Recursively list all files in " + directory );
	    recursive(directory, callback);
	},

	// Identify the output files
	function(filenames, callback) {
	    winston.debug( "Do not delete files in the .git repo itself" );

	    var isGitFile = function(filename, callback) {
		callback( path.resolve(filename).split( path.sep ).indexOf('.git') >= 0 );
	    };
	    
	    async.reject( filenames, isGitFile, function(filenames) {
		callback( null, filenames );
	    });
	},
	
	// Identify the output files
	function(filenames, callback) {
	    winston.debug( "Only delete files with certain extensions" );
	    
	    async.filter( filenames, isCleanableFile, function(filenames) {
		callback( null, filenames );
	    });
	},

	// BADBAD: do not delete files if they are committed to the repository
	
    ], function(err, results) {
	callback(err, results);
    });
};
