var Command = require('ronin').Command;
var winston = require('winston');
var prompt = require('prompt');
var path = require('path');
var os = require('os');
var mkdirp = require('mkdirp');
var fs = require('fs');

function credentialFilename() {
    return path.join( os.homedir(), ".cache", "xake", "session.json" );
}

function login(credentials, callback) {
    var filename = credentialFilename();
    
    winston.info( "Storing credentials in " + filename );
    
    mkdirp( path.dirname(filename), function(err) {
	if (err)
	    callback(err);
	else
	    fs.writeFile( filename, JSON.stringify(credentials), callback );	    
    });
}

var LoginCommand = module.exports = Command.extend({
    use: ['winston'],
    
    desc: 'Login to Ximera',

    options: {
        key: {
            type: 'string',
        },	
	secret: {
            type: 'string',	    
	}
    },

    help: function () {
	return "To log in, run " + "xake login --key ".green + "your-key".blue + " and paste in the " + "secret".blue + " when prompted.  " +
	    "This will store your key and secret in " + "~/.cache/xake/session.json until you log out by running " + "xake logout".green;
    },
    
    run: function (key, secret) {
	var global = this.global;
	winston = global.winston;

	fs.access( credentialFilename(), fs.R_OK, function(err) {
	    if (!err)
		winston.warn( "Already logged in." );
	});
	
	prompt.override = { key: key, secret: secret };
	prompt.message = '';
	prompt.delimiter = '';	
	
	prompt.start();

	var schema = {
	    properties: {
		key: {
		    description: "Key",
		    message: "The API key is a v4 UUID, meaning hexadecimal digits separated by dashes",
		    // This is a regexp for a v4 uuid
		    pattern: /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89AB][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/,
		    required: true
		},
		secret: {
		    description: "Secret",
		    message: "The API secret consists of 64 hexadecimal digits",
		    pattern: /^[0-9A-Fa-f]{64}$/,
		    required: true,
		    hidden: true
		}
	    }
	};
	
	prompt.get(schema, function(err, results) {
	    if (err)
		throw new Error(err);
	    else {
		login( results, function(err) {
		    if (err)
			throw new Error(err);
		    else
			winston.info("Logged in.");
		});
	    }
	});
    }
});
