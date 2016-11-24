var winston = require('winston');
var async = require('async'); // I wish I were actually using async here
var path = require('path');
var spawn = require('child_process').spawn;
var git = require('nodegit');
var https = require('https');

/** @function ximeraStylePath calls callback with the output of kpsewhich ximera.cls */
function ximeraStylePath( callback ) {
    var child  = spawn("kpsewhich", ["ximera.cls"], {});
    var output = [];
    
    child.stdout.on('data', function (data) {
	output.push( data );
    });

    child.on('close', function (code, signal) {
	if ((code != 0) || (signal)) {
	    if (code != 0)
		callback( code, "" );
	    else
		callback( signal, "" );		
	} else {
	    callback( null, output.toString().split("\n")[0] );
	}
    });
}

/** @function githubHeadSha calls callback with the commit sha for ximeraLatex's HEAD on GitHub */
function githubHeadSha( callback ) {
    var options = {
	host: 'api.github.com',
	headers: {'user-agent': 'node/' + process.version},
	path: '/repos/XimeraProject/ximeraLatex/commits/master'
    };    
    
    https.get(options, function(res){
	var body = '';
	
	res.on('data', function(chunk){
            body += chunk;
	});
	
	res.on('end', function(){
	    var sha = JSON.parse(body).sha;

	    if (sha)
		callback(null, sha);
	    else
		callback("No SHA found for ximeraLatex on GitHub");
	});
    }).on('error', function(e){
	callback(e);
    });
}

/** @function isInstalled uses kpsewhich to locate ximera.cls and
 * verify that it is in a git repo which is up-to-date with the
 * version on GitHub; a winston warning is emitted if this is not the
 * case */
var isInstalled = module.exports.isInstalled = function( callback ) {
    ximeraStylePath( function(err, ximeraPath) {
	if (err) {
	    winston.warn( "Could not locate ximera.cls -- have you installed ximeraLatex?" );
	    callback( false );
	} else {
	    var ximeraDirectory = path.dirname( ximeraPath );
	    winston.debug( "Checking that " + ximeraDirectory + " is up to date with GitHub" );

	    git.Repository.open(ximeraDirectory)
		.then(
		    function(repo) {
			return repo.getHeadCommit() },
		    function(err) {
			winston.warn( "Could not open git repository at " + ximeraDirectory );
			callback( false );
		    } )
		.then(
		    function(commit) {
			var headSha = commit.sha();

			githubHeadSha( function(err, githubSha) {
			    if (err) {
				winston.warn( "Could not access GitHub's ximeraLatex: " + err );
				callback( false );
			    } else {
				if (githubSha == headSha) {
				    callback( true );
				} else {
				    winston.warn( "The version of ximeraLatex on GitHub differs from the version you have installed." );
				    callback( false );
				}
			    }
			});
		    }, 
		    function(err) { winston.warn( err ); } );
	}
    });
};

