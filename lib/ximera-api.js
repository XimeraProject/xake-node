var winston = require('winston');
var credentials = require('./credentials');
var crypto = require('crypto');
var git = require('nodegit');
var path = require('path');
var async = require('async');
var fs = require('fs');
var cheerio = require('cheerio');

HOSTNAME = 'ximera.osu.edu';
PORT = 443

// we may end up using both http and https depending as to what port we actually connect to
var https = require('https');
var http = require('http');

ALGORITHM = 'sha256';

function restful( method, path, content, callback ) {
    credentials.load( function(err, keyAndSecret) {
	if (err)
	    callback(err);
	else {
	    var key = keyAndSecret.key;
	    var secret = keyAndSecret.secret;

	    var hostname = HOSTNAME;
	    if (keyAndSecret.server)
		hostname = keyAndSecret.server;

	    var port = PORT;
	    if (keyAndSecret.port)
		port = keyAndSecret.port;

	    var contentType = 'text/plain';
	    
	    if (path.match(/\.png$/))
		contentType = 'image/png';
	    if (path.match(/\.jpg$/))
		contentType = 'image/jpeg';
	    if (path.match(/\.svg$/))
		contentType = 'image/svg+xml';
	    
	    var sha = crypto.createHash(ALGORITHM);
	    sha.setEncoding('base64');

	    sha.write(content);
	    sha.end(content, function () {
		var sha256 = sha.read();

		var hmac = crypto.createHmac(ALGORITHM, secret);
		hmac.setEncoding('hex');

		hmac.write( method + " " + path + "\n" );
		hmac.end(content, function () {
		    var hash = hmac.read();

		    var options = {
			hostname: hostname,
			port: port,
			path: path,
			method: method,
			"rejectUnauthorized": false, 			
			headers: {
			    // Unfortunately named, since this is actually authentication
			    'Authorization': 'Ximera ' + key + ':' + hash,
			    'Content-SHA256': sha256,
			    'Content-Type': contentType,
			    'Content-Length': content.length
			}
		    };

		    // only use https if we are connecting over the well-known port 443
		    var httpx = http;
		    if (port == 443)
			httpx = https;

		    var req = httpx.request(options, function(res) {
			//res.setEncoding('utf8');

			var contentChunks = [];
			res.on('data', function (chunk) {
			    contentChunks.push( chunk );
			});

			res.on('end', function() {
			    try {
				res.body = JSON.parse(contentChunks.join());
			    } catch (e) {
				res.body = contentChunks.join();
			    }

			    if (res.statusCode != 200) {
				if (res.body.length > 0)
				    callback(res.body, res);
				else
				    callback(res.statusCode, res);
			    } else
				callback(null, res);
			});
		    });
		
		    req.on('error', function(err) {
			callback(err);
		    });

		    req.write(content);

		    req.end();
		});
	    });
	}
    });
}

module.exports.user = function( callback ) {
    restful( 'GET', '/users/me', '',
	     function(err, res) {
		 if (err)
		     callback( err, undefined );
		 else
		     callback( null, res.body );
	     });
};

function headCommitSha( repositoryPath, callback ) {
    git.Repository.open(repositoryPath).then(function(repo) {
	return repo.getHeadCommit();
    }, function(err) { callback(err); })
	.then(function(commit) {
	    callback( null, commit.sha() );
	}, function(err) { callback(err); });	    
}

function gitCommit( repositoryPath, sha, callback ) {
    git.Repository.open(repositoryPath).then(function(repo) {
	git.Commit.lookup(repo, sha).then(function(commit) {
	    callback(null, commit);
	}, function(err) { callback(err); });
    }, function(err) { callback(err); });
}

function githubOwnerAndRepo( repositoryPath, callback ) {
    git.Repository.open(repositoryPath).then(function(repo) {
	git.Remote.list(repo).then(function(array) {
	    async.map( array, function(name, callback) {
		git.Remote.lookup(repo, name).then(function(remote) {
		    var url = remote.url();

		    // The .git is apparently optional
		    var m = url.match( /^git@github.com:([^\/]+)\/(.*)(.git)?$/ );
		    if (!m)
			m = url.match( /:\/\/github.com\/([^\/]+)\/(.*)(.git)?$/ );
		    
		    callback( null, m );
		}, function(err) { callback(err); });
	    }, function(err, results) {

		// Throw away remotes that don't match the regexp above
		results = results.filter( function(x) { return x; } );

		if (results.length == 0)
		    callback("There is no GitHub remote.");
		else
		    callback(null, { owner: results[0][1], repo: results[0][2] } );
	    });
	}, function(err) {callback(err); });
	return;
    }, function(err) { callback(err); });
}

module.exports.publishCommit = function( repositoryPath, callback ) {
    var publicationLocation;
    var ownerName;
    var repoName;
    
    headCommitSha( repositoryPath, function(err, sha) {
	if (err)
	    callback(err);
	else {
	    async.waterfall(
		[
		    function(callback) {
	    		githubOwnerAndRepo( repositoryPath, callback );
		    },
		    function(ownerAndRepo, callback) {
			ownerName = ownerAndRepo.owner;
			repoName = ownerAndRepo.repo;
	  		var url = '/repos/' + ownerAndRepo.owner + '/' + ownerAndRepo.repo + '/git/commits/' + sha;
			restful( 'PUT', url, '', function(err) { callback(err); } );			
		    },
		    function(callback) {
			publicationLocation = '/course/' + ownerName + '/' + repoName;
			callback(null);
		    }
		],
		function(err) {
		    if (err) {
			gitCommit( repositoryPath, sha, function(err, commit) {
			    if (err) {
				callback(err);
			    } else {			    
				var asString = function( signature ) {
				    return signature.name() + " <" + signature.email() + ">";
				};
				
				var payload = { message: commit.message(),
						committer: asString( commit.committer() ),
						author: asString( commit.author() ),
						parents: commit.parents().map( function(s) { return s.toString(); } ) };
				
	  			var url = '/commits/' + sha;
				publicationLocation = '/course/' + sha;
				restful( 'PUT', url, JSON.stringify(payload), function(err) { return callback(err, sha, publicationLocation); } );
			    }
			});
		    } else {
			callback(err, sha, publicationLocation);
		    }
		});
	}
    });
};

var publishFile = function( kind, repositoryPath, filename, callback ) {
    headCommitSha( repositoryPath, function(err, sha) {
	if (err)
	    callback(err);
	else {
	    var url = '/' + kind + '/' + sha + '/' + path.relative( repositoryPath, filename );

	    // HTML files should be are extensionless
	    url = url.replace( /\.html$/, '' );

	    // Unfortunately I assume UTF-8
	    fs.readFile( filename, "utf-8", function(err, data) {
		if (filename.match(/\.html$/)) {

                    // Remove line number comments
                    data = data.replace(/<!--l\. [0-9]+-->/, '');

		    var $ = cheerio.load(data, {xmlMode: true});
		    $('a').each( function() {
			if ($(this).attr('id')) $(this).remove();
		    });
		}
		
		if (err)
		    callback(err);
		else {
		    restful( 'PUT', url, Buffer.from(data, "utf-8"), callback );
		}
	    });
	}
    });
};

module.exports.publishActivity = function( repositoryPath, filename, callback ) {
  return publishFile( 'activity', repositoryPath, filename, callback );
};

module.exports.publishXourse = function( repositoryPath, filename, callback ) {
  return publishFile( 'course', repositoryPath, filename, callback );
};
