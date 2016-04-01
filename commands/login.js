var Command = require('ronin').Command;
var winston = require('winston');
var prompt = require('prompt');
var path = require('path');
var fs = require('fs');
var credentials = require('../lib/credentials');
var ximera = require('../lib/ximera-api');

var LoginCommand = module.exports = Command.extend({
    use: ['winston'],
    
    desc: 'Store your key and secret so you can publish content to Ximera',

    options: {
        key: {
            type: 'string',
        },	
	secret: {
            type: 'string',	    
	},
	server: {
            type: 'string',
	},
	port: {
            type: 'integer',
	}
    },

    information: function () {
	return "To log in, run " + "xake login --key ".green + "your-key".blue + " and paste in the " + "secret".blue + " when prompted.  " +
	    "This will store your key and secret in " + "~/.cache/xake/session.json until you log out by running " + "xake logout".green;
    },
    
    run: function (key, secret, server, port) {
	var global = this.global;
	winston = global.winston;

	credentials.exists( function(loggedIn) {
	    if (loggedIn)
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
		if (server)
		    results.server = server;
		if (port)
		    results.port = port;

		credentials.save( results, function(err) {
		    if (err)
			throw new Error(err);
		    else {
			winston.info("Saved credentials.");
			ximera.user( function(err, user) {
			    winston.info( "Logged in as", user.name );
			});
		    }
		});
	    }
	});
    }
});
