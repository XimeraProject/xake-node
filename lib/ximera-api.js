var winston = require('winston');
var credentials = require('./credentials');
var http = require('https');
var crypto = require('crypto');

HOSTNAME = '5304979f.ngrok.com';
ALGORITHM = 'sha256';

function restful( method, path, content, callback ) {
    credentials.load( function(err, keyAndSecret) {
	if (err)
	    callback(err);
	else {
	    var key = keyAndSecret.key;
	    var secret = keyAndSecret.secret;

	    hmac = crypto.createHmac(ALGORITHM, secret);
	    hmac.setEncoding('hex');

	    hmac.write( method + " " + path + "\n" );
	    //console.log( method + " " + path + "\n" + content );
	    hmac.end(content, function () {
		var hash = hmac.read();
		
		var options = {
		    hostname: HOSTNAME,
		    port: 443,
		    path: path,
		    method: method,
		    headers: {
			// Unfortunate, since this is actually authentication
			'Authorization': 'Ximera ' + key + ':' + hash,
			'Content-Type': 'text/plain',
			'Content-Length': content.length
		    }
		};
		
		var req = http.request(options, function(res) {
		    //console.log('STATUS: ' + res.statusCode);
		    //console.log('HEADERS: ' + JSON.stringify(res.headers));
		    res.setEncoding('utf8');
		    
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
			callback(null, res);
		    })
		});

		//console.log( req );
		
		req.on('error', function(e) {
		    //console.log('problem with request: ' + e.message);
		    callback(e);		    
		});
		
		req.write(content);
		req.end();
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


