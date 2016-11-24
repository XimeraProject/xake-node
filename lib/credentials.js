var winston = require('winston');
var async = require('async');
var path = require('path');
var spawn = require('child_process').spawn;
var cheerio = require('cheerio');
var os = require('os');
var mkdirp = require('mkdirp');
var fs = require('fs');

function credentialFilename() {
    return path.join( os.homedir(), ".cache", "xake", "session.json" );
}

module.exports.exists = function( callback ) {
    fs.access( credentialFilename(), fs.R_OK, function(err) {
	if (!err)
	    callback(true);
	else
	    callback(false);
    });
}

module.exports.save = function(credentials, callback) {
    var filename = credentialFilename();
    
    winston.info( "Storing credentials in " + filename );
    
    mkdirp( path.dirname(filename), function(err) {
	if (err)
	    callback(err);
	else
	    fs.writeFile( filename, JSON.stringify(credentials), callback );	    
    });
}

module.exports.load = function(callback) {
    var filename = credentialFilename();

    fs.readFile( filename, function(err, data) {
	if (err)
	    callback(err, {});
	else
	    callback(null, JSON.parse(data));
    });
};

module.exports.remove = function( callback ) {
    var filename = credentialFilename();	
    fs.unlink( filename, callback );
}

