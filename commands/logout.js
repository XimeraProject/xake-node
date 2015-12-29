var Command = require('ronin').Command;
var winston = require('winston');
var path = require('path');
var fs = require('fs');
var credentials = require('../lib/credentials');

var LogoutCommand = module.exports = Command.extend({
    use: ['winston'],
    
    desc: 'Logout from Ximera',

    help: function () {
	return "Remove stored credentials."
    },
    
    run: function (key, secret) {
	var global = this.global;
	winston = global.winston;

	credentials.remove( function(err) {
	    if (err)
		throw new Error("Could not log out.  " + err );
	    else
		winston.info("Logged out.");
	});
    }
});
