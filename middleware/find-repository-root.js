var git = require('nodegit');
var path = require('path');
var async = require('async');
var winston = null;

/** @function isGitRepository calls callback with true or false, as to whether or not we can open the given directory as a git repository */
function isGitRepository( directory, callback ) {
    git.Repository.open(directory)
	.then(function(repo) {
	    callback( true );
	}, function(err) {
	    callback( false );
	});
}

/* Replace this.global.repository with a fully resolved (parent?) directory which actually is a git repository */
module.exports = function( next ) {
    var global = this.global;
    winston = global.winston;
    var p = path.resolve( global.repository );
    
    async.during(
	/* Stop as soon as we find a git repository */
	function (callback) {
	    winston.debug( 'Checking if ' + p + ' is a git repository.' );
	    isGitRepository( p, function(isRepository) {
		if (isRepository)
		    callback( null, false );
		else {
		    winston.debug( 'The directory ' + p + ' is NOT a git repository.' );
		    callback( null, true );
		}
	    });
	},

	/* Walk up the directory tree unless we hit the root directory */
	function (callback) {
	    if (path.join(p, '..') == p) {
		callback( "Could not find git repository in any parent directory." );
	    } else {
		winston.debug( 'Searching for a git repository in the parent directory.' );
		p = path.join(p, '..');
		callback( null );
	    }
	},
	
	function(err, repository) {
	    if (err) {
		winston.error(err);
		throw new Error(err);
	    } else {
		winston.debug( 'I will be using ' + p + ' as the git repository.' );
		global.repository = p;
		next();
	    }
	}
    );
};
