var fs = require('fs');
var async = require('async');
var git = require('nodegit');
var path = require('path');
var winston = null; // loaded from middleware
var lint = require('../lib/lint');
var files = require('../lib/files');
var meter = require('../lib/meter');
var ximeraLatex = require('../lib/ximera-latex');

var Command = require('ronin').Command;

function lintFiles( directory, filenames, callback ) {
    async.each( filenames, function(filename, callback) {
	var niceName = path.relative( directory, filename ).replace( /\.html/, '.tex' );
	
	lint.lint( filename, niceName, function(err) {
	    if (err)
		throw new Error(err);
	    else {
		callback(null);
	    }
	});
    }, function(err) {
	if (err)
	    throw new Error(err);
	else
	    callback(null);
    });
}

var LintCommand = module.exports = Command.extend({
    use: ['winston', 'ximera-installed', 'find-repository-root'],
    
    desc: 'Verify that the TeX input files are in good shape',

    options: {
    },
    
    run: function () {
	var global = this.global;
	winston = global.winston;

	files.texFilesInRepository( global.repository, function(err, filenames) {
	    if (err)
		throw new Error(err);
	    else {
		filenames = filenames.map( function(tex) {
		    return tex.replace( /\.tex$/, '.html' ); } );

		// BADBAD: this needs to be updated for the new version of async
		async.filter(filenames, fs.exists, function(results) {
		    lintFiles( global.repository, results, function() {
			winston.info( "The xake is linted." );
		    });		    
		});
	    }
	});

    }
});
