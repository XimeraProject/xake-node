var Command = require('ronin').Command;
var winston = require('winston');
var async = require('async');
var path = require('path');
var files = require('../lib/files');
var ximera = require('../lib/ximera-api');
var meter = require('../lib/meter');
var credentials = require('../lib/credentials');

function publishFiles( command, directory, filenames, jobLimit, callback ) {
    meter.run( filenames.length, 'Publishing', function( label, tick ) {
	
	async.eachLimit( filenames, jobLimit, function(filename, callback) {
	    label( path.relative( directory, filename ) );
	    
	    command( directory, filename, function(err) {
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

	var allFilenames = [];
	var xourseFilenames = [];
	var activityFilenames = [];

	var commitHash = undefined;
	
	async.series([
	    function(callback) {
		winston.info( "Publishing the commit hash" );
		ximera.publishCommit( global.repository, function(err, sha) {
		    commitHash = sha;
		    
		    if (err)
			callback(err);
		    else
			callback(null);
		});
	    },
	    function(callback) {
		winston.info( "Identifying publishable files" );
		files.publishableFiles( global.repository, function(err, filenames) {
		    if (err)
			throw new Error(err);
		    else {
			allFilenames = filenames;
			callback(null);
		    }
		});
	    },
	    function(callback) {
		winston.info( "Identifying activities" );
		async.filter( allFilenames, files.isActivity, function(results) {
		    activityFilenames = results;
		    callback(null);
		});
	    },
	    function(callback) {
		winston.info( "Publishing activities" );		
		publishFiles( ximera.publishActivity, global.repository, activityFilenames, jobLimit, callback );		
	    },
	    function(callback) {
		winston.info( "Identifying xourse files" );				
		async.filter( allFilenames, files.isXourse, function(results) {
		    xourseFilenames = results;
		    callback(null);
		});
	    },
	    function(callback) {
		winston.info( "Publishing xourses" );	
		// The xourse flies is published after the activities, since links will be made between the xourse and the activities
		publishFiles( ximera.publishXourse, global.repository, xourseFilenames, jobLimit, callback );
	    }
	], function(err) {
	    if (err)
		throw new Error(err);
	    else {
		credentials.load( function(err, keyAndSecret) {
		    var port = ""
		    if ((keyAndSecret.port) && (keyAndSecret.port != 80))
			port = ":" + keyAndSecret.port;

		    var server = keyAndSecret.server;
		    if (!server)
			server = "ximera.osu.edu";
		    
		    winston.info( "Published repository to http://" + server + port + "/course/" + commitHash + "/" );
		});
	    }
	});
    }
});
