var Command = require('ronin').Command;
var winston = require('winston');
var path = require('path');
var os = require('os');
var fs = require('fs');

function credentialFilename() {
    return path.join( os.homedir(), ".cache", "xake", "session.json" );
}

var LogoutCommand = module.exports = Command.extend({
    use: ['winston'],
    
    desc: 'Logout from Ximera',

    help: function () {
	return "Remove stored credentials."
    },
    
    run: function (key, secret) {
	var global = this.global;
	winston = global.winston;

	var filename = credentialFilename();	

	fs.unlink( filename, function(err) {
	    if (err)
		throw new Error("Could not log out.  " + err );
	    else
		winston.info("Logged out.");
	});
    }
});
