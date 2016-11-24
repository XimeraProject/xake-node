var fs = require('fs');
var async = require('async');
var git = require('nodegit');
var path = require('path');
var winston = null; // loaded from middleware
var compile = require('../lib/compile');
var files = require('../lib/files');
var meter = require('../lib/meter');
var ximeraLatex = require('../lib/ximera-latex');

var Command = require('ronin').Command;

function compileFiles( directory, filenames, jobLimit, callback ) {
    meter.run( filenames.length, 'Compiling', function( label, tick ) {

	async.eachLimit( filenames, jobLimit, function(filename, callback) {
	    label( path.relative( directory, filename ) );
	    
	    compile.compile( directory, filename, function(err) {
		if (err)
		    throw new Error(err);
		else {
		    tick();
		    callback(null);
		}
	    });
	}, function(err) {
	    if (err)
		throw new Error(err);
	    else
		callback(null);
	});
    });
}

var BakeCommand = module.exports = Command.extend({
    use: ['winston', 'ximera-installed', 'find-repository-root'],
    
    desc: 'Convert the TeX input files to HTML suitable for Ximera',

    options: {
        jobs: {
            type: 'integer',
            alias: 'j',
	    default: 2
        }
    },
    
    run: function (jobs) {
	var global = this.global;
	winston = global.winston;

	if (jobs === true)
	    jobs = 1;

	ximeraLatex.isInstalled( function(isInstalled) {
	    if (isInstalled)
		winston.debug( "Using the most recent version of ximeraLatex" );
	    else
		winston.debug( "Not using the same version of ximeraLatex as on GitHub" );
	});	
	
	files.needingCompilation( global.repository, function(err, filenames) {
	    if (err)
		throw new Error(err);
	    else {
		compileFiles( global.repository, filenames, jobs, function() {
		    winston.info( "The xake is made." );
		});
	    }
	});

    }
});
