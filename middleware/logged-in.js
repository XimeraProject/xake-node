var winston = require('winston');
var credentials = require('../lib/credentials');
var ximera = require('../lib/ximera-api');

module.exports = function( next ) {
    credentials.exists( function(loggedIn) {
	if (loggedIn) {
	    ximera.user( function(err, user) {
		if (err) {
		    winston.error( "Unable to connect to Ximera." );
		    throw new Error(err);
		} else {
		    winston.info( "Logged in as " + user.name );
		    next();
		}
	    });
	} else {
	    winston.error("You are not logged in.");
	    throw new Error("You must be logged in.");
	}
    });    
};
