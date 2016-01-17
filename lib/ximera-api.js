var winston = require('winston');
var credentials = require('./credentials');
var http = require('https');
var crypto = require('crypto');
var git = require('nodegit');
var path = require('path');
var async = require('async');
var fs = require('fs');
var cheerio = require('cheerio');

HOSTNAME = '5304979f.ngrok.com';
ALGORITHM = 'sha256';

function restful( method, path, content, callback ) {
    credentials.load( function(err, keyAndSecret) {
	if (err)
	    callback(err);
	else {
	    var key = keyAndSecret.key;
	    var secret = keyAndSecret.secret;
	    var contentType = 'text/plain';
	    
	    if (path.match(/\.png$/))
		contentType = 'image/png';
	    if (path.match(/\.jpg$/))
		contentType = 'image/jpeg';
	    if (path.match(/\.svg$/))
		contentType = 'image/svg+xml';
	    
	    var sha = crypto.createHash(ALGORITHM);
	    sha.setEncoding('base64');

	    console.log( "content.length = ", content.length );
	    sha.write( content );
	    sha.end(content, function () {
		var sha256 = sha.read();
	    
		var hmac = crypto.createHmac(ALGORITHM, secret);
		hmac.setEncoding('hex');

		hmac.write( method + " " + path + "\n" );
		hmac.end(content, function () {
		    var hash = hmac.read();

		    var options = {
			hostname: HOSTNAME,
			port: 443,
			path: path,
			method: method,
			headers: {
			    // Unfortunately named, since this is actually authentication
			    'Authorization': 'Ximera ' + key + ':' + hash,
			    'Content-SHA256': sha256,
			    'Content-Type': contentType,
			    'Content-Length': content.length
			}
		    };

		    var req = http.request(options, function(res) {
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
				callback(res.body,res);
			    } else
				callback(null, res);
			})
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
    restful( 'GET', '/users/', '',
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

function githubOwnerAndRepo( repositoryPath, callback ) {
    git.Repository.open(repositoryPath).then(function(repo) {
	git.Remote.list(repo).then(function(array) {
	    async.map( array, function(name, callback) {
		git.Remote.lookup(repo, name).then(function(remote) {
		    var url = remote.url();
		    callback( null, url.match( /^git@github.com:([^\/]+)\/(.*).git$/ ) );
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
    headCommitSha( repositoryPath, function(err, sha) {
	if (err)
	    callback(err);
	else {
	    githubOwnerAndRepo( repositoryPath, function(err, ownerAndRepo) {
		var url = '/repos/' + ownerAndRepo.owner + '/' + ownerAndRepo.repo + '/git/commits/' + sha;
		restful( 'PUT', url, '', callback );
	    });
	}
    });
};

module.exports.publishFile = function( repositoryPath, filename, callback ) {
    headCommitSha( repositoryPath, function(err, sha) {
	if (err)
	    callback(err);
	else {
	    var url = '/activity/' + sha + '/' + path.relative( repositoryPath, filename );

	    // HTML files should be are extensionless
	    url = url.replace( /\.html$/, '' );
	    
	    fs.readFile( filename, function(err, data) {
		if (filename.match(/\.html$/)) {
		    var $ = cheerio.load(data, {xmlMode: true});
		    $('a').each( function() {
			if ($(this).attr('id')) $(this).remove();
		    });
		    console.log($.html());
		}
		
		if (err)
		    callback(err);
		else {
		    restful( 'PUT', url, data, callback );
		}
	    });
	}
    });
};
