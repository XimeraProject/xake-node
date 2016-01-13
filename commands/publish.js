var Command = require('ronin').Command;
var winston = require('winston');
var async = require('async');
var path = require('path');
var files = require('../lib/files');
var ximera = require('../lib/ximera-api');
var meter = require('../lib/meter');

function publishFiles( directory, filenames, jobLimit, callback ) {
    meter.run( filenames.length, 'Publishing', function( label, tick ) {
	
	async.eachLimit( filenames, jobLimit, function(filename, callback) {
	    label( path.relative( directory, filename ) );
	    
	    ximera.publishFile( directory, filename, function(err) {
		if (err) {
		    throw new Error(err + "  Failed to publish " + filename);
		} else {
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


var PublishCommand = module.exports = Command.extend({
    use: ['winston', 'logged-in', 'find-repository-root'],
    
    desc: 'Publish the compiled content to Ximera',

    options: {
    },

    run: function (key, secret) {
	var global = this.global;
	winston = global.winston;

	var jobLimit = 1;

	async.series([
	    function(callback) {
		ximera.publishCommit( global.repository, function(err) {
		    if (err)
			callback(err);
		    else
			callback(null);
		});
	    },
	    function(callback) {
		files.publishableFiles( global.repository, function(err, filenames) {
		    if (err)
			throw new Error(err);
		    else {
			publishFiles( global.repository, filenames, jobLimit, callback );
		    }
		});
	    }
	], function(err) {
	    if (err)
		throw new Error(err);
	    else
		winston.info( "Published repository." );
	});
    }
});
