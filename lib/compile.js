var winston = require('winston');
var async = require('async');
var path = require('path');
var spawn = require('child_process').spawn;

function safeSpawn( command, args, options, callback ) {
    winston.debug( "Spawning: " + command + " " + args.join(' ') );
    var child  = spawn(command, args, options);
    
    var output = [];

    child.stdout.setEncoding('utf8');
    
    child.stdout.on('data', function (data) {
	output.push( data );
    });

    child.on('close', function (code) {
	if (code != 0) {
	    console.log( output.join() );	
	    
	    // BADBAD: Need to wait for i/o to finish...?
	    setInterval( function() {
		callback( command + " " + args.join(' ') + " failed (exit code " + code + ")" );
	    }, 100);
	} else {
	    callback( null );
	}
    });    
}

/* filename should be absolute */
function pdflatex( filename, callback )
{
    var tikzexport = '"\\PassOptionsToClass{tikzexport}{ximera}\\nonstopmode\\input{' + path.basename(filename) + '}"';
    
    safeSpawn('pdflatex', ['-file-line-error', '-shell-escape', tikzexport],
	       { cwd: path.dirname(filename) },
	       callback );
}

function htlatex( filename, callback ) {
    var htlatex  = safeSpawn('htlatex',
			     [path.basename(filename), "ximera,charset=utf-8,-css", "", "", "--interaction=nonstopmode -shell-escape -file-line-error"],
			     { cwd: path.dirname(filename) },
			     callback);	    
}

////////////////////////////////////////////////////////////////
module.exports.compile = function( directory, filename, callback ) {
    async.series([
	function(callback) {
	    pdflatex( filename, callback );
	},
	function(callback) {
	    htlatex( filename, callback );
	},	
    ], function(err) {
	callback(err);
    });
}
