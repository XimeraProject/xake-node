var fs = require('fs');
var http = require('http');
var path = require('path');
var process = require('process');
var finalhandler = require('finalhandler');
var serveStatic = require('serve-static');
var winston = null; // loaded from middleware

var Command = require('ronin').Command;

var ServeCommand = module.exports = Command.extend({
    use: ['winston', 'find-repository-root'],
    
    desc: 'Serve the HTML files in the repository',

    options: {
        port: {
            type: 'integer',
            alias: 'p',
	    default: 8080
        }
    },
    
    run: function (port) {
	var global = this.global;
	winston = global.winston;
	
	var serve = serveStatic(global.repository);

	var server = http.createServer(function(req, res) {
	    winston.info( req.method + " " + req.url );
	    
	    var done = finalhandler(req, res);

	    // Add missing .html extensions
	    if ( ! (req.url.match( /\.html$/ ))) {
		req.url = req.url + '.html'
	    }
	    
	    serve(req, res, done);
	});	
	
	winston.info( "Serving files in " + global.repository + " at http://localhost:" + port + "/" );

	fs.readdir(process.cwd(), function(err, items) {
	    var htmlFilenames = items.filter( function(filename) { return filename.match( /\.html$/ ); } );
	    if (htmlFilenames.length > 0) {
		var example = path.relative( global.repository, path.resolve( process.cwd(), htmlFilenames[0] ) );
		winston.info( "For example, http://localhost:" + port + "/" + example.replace( /\.html$/, '' ) );
	    }
	});
 
	server.listen(port);
    }
});
