var fs = require('fs');
var async = require('async');
var git = require('nodegit');
var path = require('path');
var winston = null; // loaded from middleware
var compile = require('../lib/compile');
var files = require('../lib/files');
var meter = require('../lib/meter');


var Command = require('ronin').Command;

var CompileCommand = module.exports = Command.extend({
    use: ['winston', 'ximera-installed', 'find-repository-root'],
    
    desc: 'Convert a single TeX file to an HTML file',

    options: {
    },
    
    run: function (filename) {
	var global = this.global;
	winston = global.winston;
	var directory = path.dirname(filename);
	var basename = path.basename(filename);	

	winston.info( "Compiling " + basename + " in " + directory );
	compile.compile( directory, basename, function(err) {
	    if (err)
		throw new Error(err);
	    else {
		winston.info( "Success." );
	    }
	});	
    }
});
